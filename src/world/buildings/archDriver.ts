import type { BuildingRecord } from './BuildingRegistry';
import { archArm } from './archStamp';
import { planArch, type ArchSide, type BuildingArch } from './archPlan';
import type { BuildContext } from './buildContext';
import { dirtyChunkCount } from './chunkBudget';
import { ARCH, BUILDER } from './config';
import { anchorOf } from './growthQueue';
import { recordStamp } from './recordStamp';
import { stampSolidAt, type VoxelStamp } from './stamp';
import { STRUCTURE_KIND, structureKindOf } from './structureKind';
import { worldProbe, type WorldProbe } from './worldProbe';

/**
 * La passata delle campate: due edifici che si allungano finche' si toccano.
 *
 * **E' la sola passata che scrive su due record insieme.** Un arco non e' un
 * gesto di un edificio verso il vuoto ma un patto fra due: se ne getta solo
 * meta' per uno, e o entrano tutti e due o non entra nessuno. Da qui segue tutto
 * il resto della forma di questo file — la coppia si valuta intera, si rifiuta
 * intera e si scrive intera.
 *
 * **Nessun record nuovo.** E' la differenza che questa passata esiste per
 * mostrare: `spanDriver` aggiunge una campata al registry e la lega ai suoi
 * appoggi, qui i due record che c'erano restano quelli e crescono di un braccio.
 * A schermo la differenza si legge senza spiegazioni: un ponte attraversa, un
 * arco continua.
 *
 * **La quota e' della coppia, non dei due.** `planArch` la sceglie una volta
 * sola e la scrive identica sui due record, cosi' una promozione di uno dei due
 * non puo' far scivolare mezza campata: le fasce basse sono stabili per
 * costruzione, ma la quota concordata e' registrata e non si ricalcola mai.
 */
export class ArchDriver {
  private cursor = 0;
  private built = 0;
  private readonly probe: WorldProbe;

  constructor(private readonly ctx: BuildContext) {
    this.probe = worldProbe(ctx);
  }

  /** Campate costruite, per le statistiche e per l'overlay. */
  get count(): number {
    return this.built;
  }

  /**
   * Propone le campate che due fronti maturi si sono guadagnati.
   *
   * Ha un cursore come `upgradePass` e per la stessa ragione: il costo non deve
   * crescere con la citta'. La cadenza e' la piu' lenta del ciclo perche' la
   * coincidenza che serve — due maturi, affacciati, con una fascia in comune —
   * e' rara per costruzione, e riproporla piu' spesso vorrebbe dire ripassare
   * gli stessi record per sentirsi dire di no.
   */
  pass(): void {
    const records = [...this.ctx.registry.all];
    if (records.length === 0) return;

    let made = 0;
    const budget = Math.min(ARCH.perPassRecords, records.length);
    for (let i = 0; i < budget && made < ARCH.perPass; i++) {
      if (this.ctx.growth.queued >= BUILDER.maxGrowing) break;
      const record = records[this.cursor % records.length];
      this.cursor++;
      if (!this.ready(record)) continue;
      if (this.pair(record)) made++;
    }
  }

  /**
   * true se questo record potrebbe gettare un braccio.
   *
   * Sono le domande che rispondono di no senza leggere niente, e stanno qui in
   * alto per la stessa ragione della passata di upgrade: la stragrande
   * maggioranza della citta' esce di qui, e non deve costare un `buildStamp`.
   */
  private ready(record: BuildingRecord): boolean {
    if (structureKindOf(record) !== STRUCTURE_KIND.plain) return false;
    if (record.arch !== undefined) return false;
    if (record.facing === undefined) return false;
    if (record.level < ARCH.minLevel) return false;
    return !this.ctx.growth.isGrowing(record.id);
  }

  /**
   * Il dirimpettaio: il primo edificio che il fronte incontra guardando avanti.
   *
   * Si sonda dalla mezzeria della faccia, che e' l'unica colonna che un fronte
   * ha di sicuro. Se li' non c'e' nessuno la coppia non esiste: cercare su tutta
   * la larghezza troverebbe anche il vicino di sbieco, e un arco storto rispetto
   * al vuoto che scavalca e' precisamente la cosa che non si vuole.
   */
  private opposite(record: BuildingRecord): BuildingRecord | null {
    const face = record.facing ?? 0;
    const axisX = face <= 1;
    const step = face === 0 || face === 2 ? 1 : -1;
    const depth = record.footprintY ?? record.footprint;
    const edge = face === 0 ? record.x + record.footprint - 1
      : face === 1 ? record.x
      : face === 2 ? record.y + depth - 1
      : record.y;
    const middle = axisX
      ? record.y + (depth >> 1)
      : record.x + (record.footprint >> 1);

    for (let d = 1; d <= ARCH.maxGap + 1; d++) {
      const at = edge + step * d;
      const x = axisX ? at : middle;
      const y = axisX ? middle : at;
      for (const other of this.ctx.registry.at(x, y)) {
        if (other.id === record.id) continue;
        if (structureKindOf(other) !== STRUCTURE_KIND.plain) continue;
        return other;
      }
    }
    return null;
  }

  /** Prova la coppia e, se regge, scrive i due bracci. Torna true se ne ha fatta una. */
  private pair(a: BuildingRecord): boolean {
    const b = this.opposite(a);
    if (b === null || !this.ready(b)) return false;

    const bodyA = recordStamp(a);
    const bodyB = recordStamp(b);
    const plan = planArch({
      a: sideOf(a, bodyA),
      b: sideOf(b, bodyB),
      groundZ: this.groundBetween(a, b),
    });
    if (!plan.ok) return false;

    const armA = archArm(bodyA, a, plan.pair.a);
    const armB = archArm(bodyB, b, plan.pair.b);
    if (armA === null || armB === null) return false;
    if (!this.roomFor(a, plan.pair.a, b.id)) return false;
    if (!this.roomFor(b, plan.pair.b, a.id)) return false;

    const grownA = this.ctx.registry.replace(a.id, { ...a, arch: plan.pair.a });
    if (grownA === null) return false;
    const grownB = this.ctx.registry.replace(b.id, { ...b, arch: plan.pair.b });
    if (grownB === null) {
      // Il primo e' gia' passato: senza il secondo resterebbe una mensola che
      // punta al vuoto, quindi si torna indietro invece di lasciarne mezza.
      this.ctx.registry.replace(a.id, { ...a });
      return false;
    }

    this.ctx.growth.enqueue(grownA.id, armA.anchor, armA.stamp);
    this.ctx.growth.enqueue(grownB.id, armB.anchor, armB.stamp);
    this.built++;
    return true;
  }

  /**
   * Il terreno piu' alto sotto i due bracci.
   *
   * **Il massimo e non la mezzeria**, e per la stessa ragione per cui l'opera di
   * terra livella verso l'alto: un franco misurato su una colonna sola direbbe
   * di si' a un arco che a dieci voxel di distanza esce da una scarpata.
   */
  private groundBetween(a: BuildingRecord, b: BuildingRecord): number {
    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x + a.footprint, b.x + b.footprint);
    const y1 = Math.max(a.y + (a.footprintY ?? a.footprint), b.y + (b.footprintY ?? b.footprint));
    let top = this.probe.heightAt(x0, y0);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const height = this.probe.heightAt(x, y);
        if (height > top) top = height;
      }
    }
    return top;
  }

  /**
   * true se il volume che il braccio si prende e' aria, e sta nel budget.
   *
   * Si guarda **solo cio' che esce dall'impronta**: dentro, quelle colonne il
   * record le ha gia' e il braccio ci scrive sopra la propria materia. Fuori
   * vale la regola di sempre — niente si costruisce attraverso qualcos'altro —
   * e il rifiuto e' quello giusto anche quando a occupare e' una campata di
   * `spans/`: un arco e un ponte nello stesso vuoto sono due volte la stessa
   * frase.
   */
  private roomFor(host: BuildingRecord, arch: BuildingArch, mate: number): boolean {
    const box = outerBox(host, arch);
    if (this.ctx.registry.overlaps(
      box.x, box.y, box.sizeX, box.z0, box.z1 - box.z0, box.sizeY, [host.id, mate],
    )) {
      return false;
    }
    return dirtyChunkCount(box.x, box.y, box.sizeX, box.z0, box.z1, box.sizeY) <=
      BUILDER.maxDirtyChunksPerBuilding;
  }
}

/** Il riquadro di un braccio **fuori** dall'impronta, con il suo tratto di quote. */
function outerBox(host: BuildingRecord, arch: BuildingArch): {
  x: number; y: number; sizeX: number; sizeY: number; z0: number; z1: number;
} {
  const depth = host.footprintY ?? host.footprint;
  const z0 = arch.z - ARCH.haunch;
  const z1 = arch.z + arch.rise;
  switch (arch.face) {
    case 0:
      return {
        x: host.x + host.footprint, y: arch.across,
        sizeX: arch.reach, sizeY: arch.width, z0, z1,
      };
    case 1:
      return {
        x: host.x - arch.reach, y: arch.across,
        sizeX: arch.reach, sizeY: arch.width, z0, z1,
      };
    case 2:
      return {
        x: arch.across, y: host.y + depth,
        sizeX: arch.width, sizeY: arch.reach, z0, z1,
      };
    default:
      return {
        x: arch.across, y: host.y - arch.reach,
        sizeX: arch.width, sizeY: arch.reach, z0, z1,
      };
  }
}

/** Il record letto come lato di una coppia: quote di fascia e sonda sul pieno. */
function sideOf(record: BuildingRecord, body: VoxelStamp): ArchSide {
  const anchor = anchorOf(record);
  return {
    id: record.id,
    x: record.x,
    y: record.y,
    baseZ: record.baseZ,
    footprint: record.footprint,
    footprintY: record.footprintY,
    height: record.height,
    level: record.level,
    facing: record.facing,
    arch: record.arch,
    bands: body.bandStarts,
    solid: (x, y, z) => stampSolidAt(body, anchor, x, y, z),
  };
}
