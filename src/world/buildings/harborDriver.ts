import { HARBOR, HARBOR_ROLES } from '../harbor/config';
import {
  planHarborDistrict,
  type HarborCrane,
  type HarborDig,
  type HarborFill,
  type HarborPlan,
  type HarborWall,
  type SectorSite,
} from '../harbor/plan';
import { WORKS } from '../grading/grade';
import { GRADING } from '../grading/config';
import { classifyWater } from '../terrain/waterClass';
import { WATER_IDS } from '../terrain/config';
import { SURFACE_KIND } from '../visualBlock';
import { FACING, type Facing } from '../streets/streetGrid';
import type { BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { fitsChunkBudget } from './chunkBudget';
import type { VoxelStamp } from './stamp';

/**
 * La passata del distretto costiero: l'impronta che marina, porto e traghetto
 * lasciano sul proprio circondario.
 *
 * **Il piano e' del dominio, l'applicazione e' di qui.** `harbor/plan.ts`
 * decide *dove* si scava, si riempie e si costruisce; questo driver porta le
 * sue risposte nel mondo con le stesse code di chiunque altro — gli scavi e
 * le colmate viaggiano sulla coda di comparsa a budget, la passeggiata su
 * quella di superficie, e gli edifici di settore nascono dalla macchina
 * ordinaria del Builder con una tipologia che il ruolo del catalizzatore
 * sblocca. Nessuna passata propria, nessun secondo indice: la regola dei
 * landmark vale identica per il loro quartiere.
 *
 * **Lo stadio del distretto e' lo stadio del landmark.** Il record cresce
 * quando il quartiere lo merita — contando gli edifici intorno, non la
 * desiderabilita' — e il distretto lo segue anello per anello: e' la stessa
 * misura, letta dallo stesso numero (`record.level`), e non c'e' un secondo
 * cursore da far avanzare.
 *
 * **Gli scavi sono quelli del dominio, non una terza eccezione.** Il bacino
 * della marina ha gia' stabilito il contratto: si scava solo dove una ricetta
 * lo dichiara, si allaga al pelo conservato nel record, e il muro scende a
 * incontrare il fondo. I canali e le insenature del distretto non fanno che
 * estendere la stessa pratica alle colonne oltre l'impronta della struttura,
 * con lo stesso confine — mai oltre l'anello dello stadio — e la stessa coda.
 */

interface DistrictState {
  /** Ultimo stadio del landmark gia' applicato al distretto. */
  stage: number;
  /** Colonne gia' scavate: la passeggiata non ci dipinge sopra. */
  dug: Set<string>;
}

interface PendingSite {
  readonly recordId: number;
  readonly site: SectorSite;
}

const keyOf = (x: number, y: number): string => `${x},${y}`;

export class HarborDriver {
  private readonly districts = new Map<number, DistrictState>();

  /**
   * Quante volte questo distretto ha rimesso mano alla forma dell'acqua.
   *
   * Sale a ogni piano applicato e non scende mai. Lo legge chi ricostruisce le
   * rotte del traffico: uno scavo e una colmata non aggiungono record, quindi
   * senza questo contatore le barche resterebbero sulla mappa d'acqua di prima.
   */
  private worksCount = 0;

  private readonly pendingSites: PendingSite[] = [];

  constructor(private readonly ctx: BuildContext) {}

  get works(): number {
    return this.worksCount;
  }

  /** Quanti edifici di settore aspettano ancora un'infornata. */
  get pending(): number {
    return this.pendingSites.length;
  }

  /**
   * Applica il piano dello stadio raggiunto, un landmark per passata.
   *
   * Come le altre passate, il costo non cresce con la citta': i record
   * costieri sono unita', e una passata muove al massimo un distretto.
   */
  pass(): void {
    let applied = false;

    for (const record of this.ctx.registry.all) {
      if (applied) break;

      const kind = record.landmark;
      if (kind === undefined || HARBOR_ROLES[kind] === undefined) continue;
      if (record.aloft === true) continue;
      const waterZ = record.waterZ;
      if (waterZ === undefined) continue;

      let district = this.districts.get(record.id);
      if (district === undefined) {
        district = { stage: 0, dug: new Set() };
        this.districts.set(record.id, district);
        // Il distretto prenota il proprio suolo appena nasce, a stadio zero:
        // le opere arriveranno stadio per stadio, ma la crescita ordinaria non
        // deve occuparne le colonne nel frattempo — un edificio posato sul
        // futuro canale galleggerebbe sull'acqua per sempre.
        this.reserveWorks(record, waterZ);
      }
      if (record.level <= district.stage) continue;

      for (let s = district.stage + 1; s <= record.level; s++) {
        this.applyPlan(record, district, this.planFor(record, waterZ, s));
        district.stage = s;
      }
      applied = true;
    }

    this.sweep();
  }

  /**
   * Gli edifici di settore da costruire, al massimo `limit`.
   *
   * Li consuma `buildPass`, che li fa nascere dalla macchina ordinaria:
   * collisioni, budget di chunk, comparsa a budget e resa del conto alla
   * simulazione sono quelli di ogni edificio, e con loro arrivano i bonus e
   * i malus di ogni edificio — la congestione che paga, la capacita' che
   * porta. La forma la sceglie il catalogo: le tipologie di settore sono
   * righe con il ruolo e la costa come condizioni, e il catalizzatore le
   * copre perche' il distretto nasce dentro la sua influenza.
   */
  drainSites(limit: number): readonly SectorSite[] {
    const drained: SectorSite[] = [];
    while (drained.length < limit && this.pendingSites.length > 0) {
      drained.push(this.pendingSites.shift()!.site);
    }
    return drained;
  }

  /** Porta nel mondo un piano di stadio: scavi, sponde, colmate, passeggiata. */
  private applyPlan(record: BuildingRecord, district: DistrictState, plan: HarborPlan): void {
    const waterZ = record.waterZ;
    if (waterZ === undefined) return;
    const owner = record.id;

    // Da qui in avanti la forma dell'acqua non e' piu' quella di prima, e chi
    // traccia le rotte deve rifarle: nessuna di queste opere aggiunge un
    // record, quindi e' questo contatore la sola cosa che glielo dica.
    if (plan.digs.length > 0 || plan.fills.length > 0) this.worksCount++;

    for (const dig of plan.digs) {
      this.enqueueDig(owner, dig, waterZ);
      for (let dy = 0; dy < dig.h; dy++) {
        for (let dx = 0; dx < dig.w; dx++) district.dug.add(keyOf(dig.x + dx, dig.y + dy));
      }
    }
    for (const wall of plan.walls) {
      this.enqueueWall(owner, wall, waterZ);
    }
    for (const fill of plan.fills) {
      this.enqueueFill(owner, fill, waterZ);
    }
    for (const column of plan.promenade) {
      if (district.dug.has(keyOf(column.x, column.y))) continue;
      this.ctx.surface.enqueue({
        x: column.x,
        y: column.y,
        palette: HARBOR.promenadePalette,
        priority: 1,
      });
      // L'anello si attacca alla maglia come il grembiule al suo isolato: un
      // distretto senza carreggiata e' una macchia in mezzo al verde.
      this.ctx.surface.enqueueBlockStreets(this.ctx.streets.blockAt(column.x, column.y));
    }
    for (const crane of plan.cranes) {
      this.enqueueCrane(owner, crane);
    }
    for (const site of plan.sites) {
      this.pendingSites.push({ recordId: record.id, site });
    }
  }

  /**
   * Una gru di banchina: il montante e il braccio a sbalzo sopra l'acqua.
   *
   * **E' la firma verticale di una darsena.** A distanza isometrica un bacino
   * rettangolare senza niente sopra e' una vasca: e' lo sbraccio a dire che di
   * li' si scarica qualcosa. Il braccio passa alto e non tocca l'acqua, quindi
   * non chiude la darsena a chi ci naviga sotto — la stessa economia con cui il
   * nastro del granaio scavalca il bacino nella ricetta del porto.
   *
   * I due riquadri arrivano gia' ruotati sul verso vero: qui si mette solo la
   * quota, che e' la sola cosa che il piano non poteva sapere.
   */
  private enqueueCrane(owner: number, crane: HarborCrane): void {
    const boom = crane.boom;
    const mast = crane.mast;
    // Un riquadro solo che contiene montante e braccio: la coda vuole un pezzo
    // rettangolare, e i due si toccano per costruzione.
    const x = Math.min(mast.x, boom.x);
    const y = Math.min(mast.y, boom.y);
    const w = Math.max(mast.x + mast.w, boom.x + boom.w) - x;
    const h = Math.max(mast.y + mast.h, boom.y + boom.h) - y;
    const sizeZ = HARBOR.craneHeight + 2;
    const voxels = new Uint8Array(w * h * sizeZ);
    const surfaces = new Uint8Array(w * h * sizeZ);
    const at = (dx: number, dy: number, dz: number): number => dx + w * (dy + h * dz);
    const inside = (
      rect: { x: number; y: number; w: number; h: number },
      dx: number,
      dy: number,
    ): boolean =>
      x + dx >= rect.x && x + dx < rect.x + rect.w && y + dy >= rect.y && y + dy < rect.y + rect.h;

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (inside(mast, dx, dy)) {
          for (let dz = 0; dz < HARBOR.craneHeight; dz++) {
            voxels[at(dx, dy, dz)] = HARBOR.cranePalette;
            surfaces[at(dx, dy, dz)] = SURFACE_KIND.industrial;
          }
        }
        if (!inside(boom, dx, dy)) continue;
        for (let dz = HARBOR.craneHeight; dz < sizeZ; dz++) {
          voxels[at(dx, dy, dz)] = dz === sizeZ - 1 ? HARBOR.craneCap : HARBOR.cranePalette;
          surfaces[at(dx, dy, dz)] = SURFACE_KIND.industrial;
        }
      }
    }

    this.enqueuePiece(owner, x, y, crane.padZ, sizeZ, w, h, voxels, surfaces, null);
  }

  /** Il piano di un singolo stadio, con il terreno e i numeri del record. */
  private planFor(record: BuildingRecord, waterZ: number, stage: number): HarborPlan {
    const { terrain, registry } = this.ctx;
    return planHarborDistrict({
      kind: record.landmark!,
      form: record.landmarkForm,
      facing: (record.facing ?? FACING.east) as Facing,
      x: record.x,
      y: record.y,
      stage,
      waterZ,
      seed: record.seed,
    }, {
      has: (x, y) => terrain.has(x, y),
      heightAt: (x, y) => terrain.heightAt(x, y),
      biomeAt: (x, y) => terrain.biomeAt(x, y),
      // **La colonna e' libera?** Finche' il distretto scavava dodici colonne la
      // domanda non si poneva: quel terreno era ancora il grembiule del
      // landmark. Una darsena da quaranta arriva in mezzo al quartiere, e senza
      // questa risposta il pettine si scaverebbe dentro le case — cancellando
      // dal terreno cio' che il registry continua a dichiarare in piedi.
      //
      // **La domanda e' «c'e' un edificio di qualcun altro», non «e' occupata».**
      // Le prenotazioni non sono record — il distretto si prenota da se' il
      // suolo delle opere future, e un cantiere aperto prenota cio' che sta
      // abbattendo — quindi `isOccupied` risponde di si' anche sul terreno che
      // la figura ha tutto il diritto di prendere. Chiederle quello faceva
      // rinunciare il distretto sulla propria riva. `isOccupied` resta davanti
      // perche' e' la risposta a buon mercato: `at` materializza un array, e qui
      // si interrogano migliaia di colonne per avanzamento.
      free: (x, y) => !registry.isOccupied(x, y)
        || registry.at(x, y).every((found) => found.id === record.id),
    });
  }

  /**
   * Prenota il suolo delle opere future, per tutti gli stadi a venire.
   *
   * **L'acqua non e' suolo, e la simulazione non lo sa.** I voxel dello scavo
   * non toccano la mappa del terreno, che continua a dichiarare riva
   * asciutta: senza prenotazione un lotto ordinario nascerebbe dentro il
   * canale — prima che lo stadio lo scavi, o dopo — e l'edificio resterebbe
   * sospeso sull'acqua. La prenotazione e' quella dei cantieri: vale per
   * l'intera colonna e resta, perche' il canale resta. Le sponde invece
   * restano libere: la casa sul canale e' il punto del distretto.
   */
  private reserveWorks(record: BuildingRecord, waterZ: number): void {
    const role = record.landmark === undefined ? undefined : HARBOR_ROLES[record.landmark];
    if (role === undefined) return;
    for (let s = 1; s < role.ringByStage.length; s++) {
      const plan = this.planFor(record, waterZ, s);
      for (const dig of plan.digs) {
        this.ctx.registry.reserveRect({ x: dig.x, y: dig.y, sizeX: dig.w, sizeY: dig.h });
      }
      for (const fill of plan.fills) {
        // **La banchina non si prenota.** Molo e frangiflutti sono opere, e il
        // suolo che occupano e' loro; una banchina e' suolo che il distretto
        // livella *per* costruirci sopra — prenotarla vieterebbe l'edificio che
        // e' la ragione per cui la si e' fatta, e la darsena resterebbe
        // un'opera idraulica invece di diventare un pezzo di citta'.
        if (fill.kind === 'quay') continue;
        this.ctx.registry.reserveRect({ x: fill.x, y: fill.y, sizeX: fill.w, sizeY: fill.h });
      }
    }
  }

  /**
   * Scava un pezzo di bacino o di canale e lo allaga al pelo.
   *
   * **La stessa pratica del bacino della marina**, chiesta su un riquadro
   * qualunque: il terreno sopra il fondo va via con la cancellazione a
   * budget, l'acqua compare con la scrittura a budget, e le colonne gia'
   * profonde restano intatte con la loro acqua.
   */
  private enqueueDig(owner: number, dig: HarborDig, waterZ: number): void {
    const terrain = this.ctx.terrain;
    let top = dig.floor + 1;
    for (let dy = 0; dy < dig.h; dy++) {
      for (let dx = 0; dx < dig.w; dx++) {
        const height = terrain.heightAt(dig.x + dx, dig.y + dy);
        if (height > top) top = height;
      }
    }
    if (top <= dig.floor) return;

    const sizeZ = top - dig.floor;
    const voxels = new Uint8Array(dig.w * dig.h * sizeZ);
    const surfaces = new Uint8Array(dig.w * dig.h * sizeZ);
    const erased = new Uint8Array(dig.w * dig.h * sizeZ);
    const at = (dx: number, dy: number, z: number): number =>
      dx + dig.w * (dy + dig.h * (z - dig.floor));

    for (let dy = 0; dy < dig.h; dy++) {
      for (let dx = 0; dx < dig.w; dx++) {
        const cx = dig.x + dx;
        const cy = dig.y + dy;
        const height = terrain.heightAt(cx, cy);
        if (height <= dig.floor) continue;
        for (let z = dig.floor; z < height; z++) erased[at(dx, dy, z)] = 1;
        for (let z = dig.floor; z < waterZ; z++) {
          voxels[at(dx, dy, z)] = WATER_IDS.surface;
          surfaces[at(dx, dy, z)] = classifyWater(
            cx, cy, waterZ - dig.floor,
            (wx, wy) => terrain.heightAt(wx, wy),
            waterZ,
          );
        }
      }
    }

    this.enqueuePiece(owner, dig.x, dig.y, dig.floor, sizeZ, dig.w, dig.h, voxels, surfaces, erased);
  }

  /**
   * La sponda in muratura di un canale: dal fondo scavato a un voxel sopra il
   * pelo, dove la riva naturale riprende. E' il segno che il canale e'
   * costruito e non capitato.
   */
  private enqueueWall(owner: number, wall: HarborWall, waterZ: number): void {
    const terrain = this.ctx.terrain;
    let top = wall.floor + 1;
    for (let dy = 0; dy < wall.h; dy++) {
      for (let dx = 0; dx < wall.w; dx++) {
        const height = terrain.heightAt(wall.x + dx, wall.y + dy);
        if (height > top) top = height;
      }
    }
    if (top <= wall.floor) return;
    top = Math.min(top, waterZ + 1);

    const sizeZ = top - wall.floor;
    const voxels = new Uint8Array(wall.w * wall.h * sizeZ);
    const surfaces = new Uint8Array(wall.w * wall.h * sizeZ);
    const at = (dx: number, dy: number, z: number): number =>
      dx + wall.w * (dy + wall.h * (z - wall.floor));

    for (let dy = 0; dy < wall.h; dy++) {
      for (let dx = 0; dx < wall.w; dx++) {
        const height = terrain.heightAt(wall.x + dx, wall.y + dy);
        if (height <= wall.floor) continue;
        for (let z = wall.floor; z < Math.min(height, waterZ + 1); z++) {
          voxels[at(dx, dy, z)] = GRADING.quayWall;
          surfaces[at(dx, dy, z)] = SURFACE_KIND.utility;
        }
      }
    }

    this.enqueuePiece(owner, wall.x, wall.y, wall.floor, sizeZ, wall.w, wall.h, voxels, surfaces, null);
  }

  /**
   * Una colmata: molo, banchina, frangiflutti o pontile.
   *
   * **Quattro grammatiche, e la differenza si vede tutta di taglio.**
   *
   * - **Molo e banchina** sono la banchina portata al largo: perimetro in
   *   muratura con il suo coronamento, corpo pieno fino al piano, calpestio
   *   sull'ultimo voxel — la stessa grammatica di `buildWorks`, su colonne che
   *   non appartengono a nessuna impronta. Il bordo che guarda l'acqua scende
   *   pero' di un cubo, e ogni tanto di due: e' la **calata**, ed e' l'unica
   *   cosa che dica come si passa dalla citta' al mare. Senza, una banchina
   *   alta sei voxel e' un muro.
   * - **Il frangiflutti** non ha piano: sale a quota dichiarata sopra il pelo e
   *   porta il cappello che si legge dal mare.
   * - **Il pontile** e' un tavolato: due voxel sopra il pelo invece di sei, di
   *   legno invece che di pietra, e **vuoto sotto** — la materia scende solo
   *   sui pali. Era il difetto piu' visibile del distretto: i pontili si
   *   colmavano al piano della citta' e uscivano dall'acqua come blocchi alti
   *   dodici voxel, dal fondale a sei sopra il pelo.
   */
  private enqueueFill(owner: number, fill: HarborFill, waterZ: number): void {
    const terrain = this.ctx.terrain;
    const ground = fill.kind === 'mole' || fill.kind === 'quay';
    const pier = fill.kind === 'pier';
    const deepFloor = waterZ - GRADING.maxQuayDepth;

    let floor = fill.padZ;
    let raised = false;
    for (let dy = 0; dy < fill.h; dy++) {
      for (let dx = 0; dx < fill.w; dx++) {
        const height = terrain.heightAt(fill.x + dx, fill.y + dy);
        if (height < fill.padZ) raised = true;
        if (height < floor) floor = height;
      }
    }
    if (!raised || floor >= fill.padZ) return;

    const sizeZ = fill.padZ - floor;
    const voxels = new Uint8Array(fill.w * fill.h * sizeZ);
    const surfaces = new Uint8Array(fill.w * fill.h * sizeZ);
    const at = (dx: number, dy: number, z: number): number =>
      dx + fill.w * (dy + fill.h * (z - floor));
    const edge = (dx: number, dy: number): boolean =>
      dx === 0 || dy === 0 || dx === fill.w - 1 || dy === fill.h - 1;
    /**
     * Il bordo che guarda l'acqua: una colonna di perimetro con almeno un
     * vicino **fuori dal ritaglio** che sta sotto il pelo.
     *
     * Si chiede al terreno e non alla forma perche' la forma non lo sa: un
     * rettangolo ruotato non porta con se' da che parte fosse il mare, e
     * dedurlo dal verso della struttura sarebbe un secondo segno da tenere
     * allineato con `orientPart`.
     */
    const facesWater = (dx: number, dy: number): boolean => {
      if (!edge(dx, dy)) return false;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = dx + ox;
        const ny = dy + oy;
        if (nx >= 0 && ny >= 0 && nx < fill.w && ny < fill.h) continue;
        if (terrain.heightAt(fill.x + nx, fill.y + ny) <= waterZ) return true;
      }
      return false;
    };

    for (let dy = 0; dy < fill.h; dy++) {
      for (let dx = 0; dx < fill.w; dx++) {
        const wx = fill.x + dx;
        const wy = fill.y + dy;
        const height = terrain.heightAt(wx, wy);
        if (height >= fill.padZ) continue;
        // Un braccio non scende nel vuoto: oltre il muro di banchina la
        // colonna resta acqua, e la colmata la salta.
        if (!ground && height < deepFloor) continue;

        if (pier) {
          // Il tavolato, e i pali che lo reggono: sotto resta acqua, ed e'
          // meta' di cio' che distingue un pontile da una colmata.
          if (wx % HARBOR.pierPile === 0 && wy % HARBOR.pierPile === 0) {
            for (let z = height; z < fill.padZ - 1; z++) {
              voxels[at(dx, dy, z)] = HARBOR.pierPilePalette;
              surfaces[at(dx, dy, z)] = SURFACE_KIND.utility;
            }
          }
          voxels[at(dx, dy, fill.padZ - 1)] = HARBOR.pierDeckPalette;
          surfaces[at(dx, dy, fill.padZ - 1)] = SURFACE_KIND.utility;
          continue;
        }

        // La calata: sul filo dell'acqua il piano scende di un cubo, e ogni
        // `stairPitch` colonne di due — la scaletta che porta al pelo.
        const shore = ground && facesWater(dx, dy);
        const stair = shore && (wx + wy) % HARBOR.stairPitch === 0;
        const top = fill.padZ - (stair ? 2 : shore ? 1 : 0);
        if (top <= height) continue;

        for (let z = height; z < top; z++) {
          if (ground) {
            const rim = edge(dx, dy);
            voxels[at(dx, dy, z)] = z === top - 1
              ? shore ? HARBOR.quayLanding : rim ? GRADING.quayCoping : GRADING.quayDeck
              : rim ? GRADING.quayWall : HARBOR.fillBody;
            surfaces[at(dx, dy, z)] = SURFACE_KIND.utility;
          } else {
            voxels[at(dx, dy, z)] = z === top - 1 ? HARBOR.fillCap : HARBOR.fillBody;
            surfaces[at(dx, dy, z)] = SURFACE_KIND.utility;
          }
        }
      }
    }

    this.enqueuePiece(owner, fill.x, fill.y, floor, sizeZ, fill.w, fill.h, voxels, surfaces, null);
  }

  /** Accoda un pezzo, misurato contro il tetto di chunk come ogni volume. */
  private enqueuePiece(
    owner: number,
    x: number,
    y: number,
    z: number,
    sizeZ: number,
    w: number,
    h: number,
    voxels: Uint8Array,
    surfaces: Uint8Array,
    erased: Uint8Array | null,
  ): void {
    const stamp: VoxelStamp = {
      sizeX: w,
      sizeY: h,
      sizeZ,
      anchorX: 0,
      anchorY: 0,
      anchorZ: 0,
      voxels,
      surfaces,
      bandStarts: [0, sizeZ],
    };
    // Un piano senza opera: il costo del pezzo e' il solo volume scritto.
    const plan = { works: WORKS.none, padZ: z + sizeZ, footZ: z, fill: 0 };
    if (!fitsChunkBudget(x, y, w, h, plan, stamp)) return;

    const erase: VoxelStamp | null = erased === null
      ? null
      : {
        sizeX: w,
        sizeY: h,
        sizeZ,
        anchorX: 0,
        anchorY: 0,
        anchorZ: 0,
        voxels: erased,
        surfaces: new Uint8Array(erased.length),
        bandStarts: [0, sizeZ],
      };
    this.ctx.growth.enqueue(owner, { x, y, z }, stamp, erase);
  }

  /** Toglie i distretti dei record spariti, e i loro siti in attesa. */
  private sweep(): void {
    for (const id of [...this.districts.keys()]) {
      if (this.ctx.registry.get(id) === undefined) this.districts.delete(id);
    }
    for (let i = this.pendingSites.length - 1; i >= 0; i--) {
      if (this.ctx.registry.get(this.pendingSites[i].recordId) === undefined) {
        this.pendingSites.splice(i, 1);
      }
    }
  }
}
