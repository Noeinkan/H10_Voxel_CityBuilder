import { SURFACE_KIND } from '../visualBlock';
import type { TerrainMap } from '../terrain/TerrainMap';
import type { VoxelWorld } from '../VoxelWorld';
import { GRADING } from '../grading/config';
import { GROUND, rampField } from '../grading/grade';
import { StreetNetwork, type PavementCell } from '../streets/StreetNetwork';
import { STREET_ROLE, type BlockId } from '../streets/streetGrid';
import { STREETS } from '../streets/config';
import type { ReadonlyBuildingRegistry, BuildingRecord } from './BuildingRegistry';
import { BUILDER } from './config';
import { STAMP_EMPTY } from './stamp';
import { groundKindAt, nearLand } from './siteWorks';

/**
 * Il suolo pubblico: carreggiata, grembiuli, piazze, e il salto che li regge.
 *
 * **Una coda e non una scrittura diretta**, per la stessa ragione della coda dei
 * volumi: l'anello di un isolato sono centinaia di colonne e ognuna puo' costare
 * sei voxel di muro, quindi applicarlo tutto nel frame in cui il primo edificio
 * lo giustifica farebbe cadere proprio il frame in cui la citta' si allarga.
 *
 * La priorita' serve a un caso solo ma ricorrente: due sorgenti che rivendicano
 * la stessa colonna — l'asse principale contro quello secondario, il grembiule
 * di un landmark contro la carreggiata. Vince la piu' alta, e vince anche a
 * posteriori, perche' `surfacePriority` ricorda cosa e' gia' stato dipinto.
 */

/**
 * Una colonna di superficie urbana da applicare.
 *
 * Dalla 4.2 porta anche una **quota di progetto**. Finche' la superficie era
 * solo colore, il piano era per forza quello del terreno e il salto restava
 * terreno nudo; con `deck` la stessa coda costruisce il salto, e le tre cose
 * che nella 4.2 devono salire — la rampa che porta alla banchina, il molo, la
 * piazza sopraelevata — sono la stessa operazione con tre quote diverse invece
 * di tre sottosistemi.
 */
export interface SurfacePaint {
  readonly x: number;
  readonly y: number;
  readonly palette: number;
  readonly priority: number;
  /** Quota del piano finito. Se manca, si dipinge il terreno dov'e'. */
  readonly deck?: number;
  /** Palette del muro che regge il piano, quando `deck` supera il terreno. */
  readonly wall?: number;
  /** Coronamento del muro: l'ultimo voxel sotto il piano calpestabile. */
  readonly coping?: number;
}

export class SurfaceQueue {
  private readonly queue: string[] = [];
  private readonly pending = new Map<string, SurfacePaint>();
  private readonly priority = new Map<string, number>();
  private head = 0;

  /** Isolati la cui carreggiata e' gia' stata accodata: si dipinge una volta sola. */
  private readonly paintedBlocks = new Set<string>();

  constructor(
    private readonly world: VoxelWorld,
    private readonly terrain: TerrainMap,
    private readonly streets: StreetNetwork,
    private readonly registry: ReadonlyBuildingRegistry,
  ) {}

  /** Celle di piazzole e sentieri ancora da applicare. */
  get queued(): number {
    return this.pending.size;
  }

  enqueue(paint: SurfacePaint): void {
    if (!this.canPaint(paint.x, paint.y)) return;
    const key = `${paint.x},${paint.y}`;
    if (paint.priority < (this.priority.get(key) ?? 0)) return;
    const current = this.pending.get(key);
    if (current !== undefined) {
      if (paint.priority > current.priority) this.pending.set(key, paint);
      return;
    }
    this.pending.set(key, paint);
    this.queue.push(key);
  }

  /**
   * Accoda la carreggiata che circonda un isolato, una volta sola.
   *
   * La strada compare **per isolato** e non per edificio: appena il primo
   * edificio lo giustifica, l'anello di carreggiata entra in coda tutto
   * insieme, e la citta' mostra una strada chiusa invece dei monconi che il
   * vecchio collegamento fra ancore allungava di due celle per infornata. Le
   * colonne non edificabili — mare, roccia, pendenza — le scarta
   * `canPaint`, ed e' cosi' che la maglia si ritaglia da sola sulla
   * forma dell'isola senza che la rete sappia dove finisce la terra.
   */
  enqueueBlockStreets(block: BlockId): void {
    const key = this.streets.keyOf(block);
    if (this.paintedBlocks.has(key)) return;
    this.paintedBlocks.add(key);

    const ring = this.streets.pavementRing(block);
    const grade = this.rampAround(ring);

    for (const cell of ring) {
      // Una banchina e' il bordo costruito della terra: oltre `quayReach` la
      // carreggiata smette invece di proseguire sul fondale.
      if (!nearLand(this.terrain, cell.x, cell.y)) continue;

      const arterial = cell.role === STREET_ROLE.arterial;
      const shore = groundKindAt(this.terrain, cell.x, cell.y) === GROUND.shore;
      const deck = grade.levelAt(cell.x, cell.y);
      const raised = deck > this.terrain.heightAt(cell.x, cell.y);
      this.enqueue({
        x: cell.x,
        y: cell.y,
        // Sulla banchina la carreggiata smette di essere asfalto: un molo
        // asfaltato leggerebbe come una strada finita nell'acqua, che e'
        // esattamente l'impressione che questa fase deve togliere.
        palette: shore
          ? GRADING.quayDeck
          : arterial ? STREETS.arterialPalette : STREETS.minorPalette,
        // L'asse principale vince l'incrocio: e' la sua continuita' a rendere
        // leggibile la gerarchia, e una corsia di svolta dipinta col colore
        // secondario la spezzerebbe proprio dove si vede di piu'.
        priority: arterial ? 2 : 1,
        deck,
        wall: raised ? (shore ? GRADING.quayWall : GRADING.terraceWall) : undefined,
        coping: shore ? GRADING.quayCoping : GRADING.terraceCoping,
      });
    }
  }

  /**
   * Applica la superficie a budget.
   *
   * Il budget conta **voxel scritti, non celle**: una cella su un molo puo'
   * costarne sei, e contarla come una lascerebbe passare nello stesso frame sei
   * volte il lavoro previsto proprio dove il terreno e' piu' mosso — cioe' dove
   * il frame e' gia' piu' caro. Una cella iniziata si finisce comunque, per non
   * lasciare mezzo muro in piedi fra un frame e l'altro.
   */
  step(): void {
    let written = 0;
    while (this.head < this.queue.length && written < BUILDER.surfaceVoxelsPerFrame) {
      const key = this.queue[this.head++];
      const paint = this.pending.get(key);
      if (paint === undefined) continue;
      this.pending.delete(key);
      if (!this.canPaint(paint.x, paint.y)) continue;

      const ground = this.terrain.heightAt(paint.x, paint.y);
      const deck = Math.max(paint.deck ?? ground, ground);
      this.clearDecorColumn(paint.x, paint.y);

      if (paint.wall !== undefined) {
        for (let z = ground; z < deck - 1; z++) {
          this.world.setBlock(paint.x, paint.y, z, z === deck - 2 && paint.coping !== undefined
            ? paint.coping
            : paint.wall, SURFACE_KIND.utility);
          written++;
        }
      }

      this.world.setBlock(paint.x, paint.y, deck - 1, paint.palette);
      this.priority.set(key, paint.priority);
      written++;
    }

    if (this.head >= this.queue.length) {
      this.queue.length = 0;
      this.head = 0;
    }
  }

  /** Bonifica tronchi e chiome nel lotto e nel suo bordo, senza toccare il suolo. */
  clearSiteDecor(x: number, y: number, w: number, h: number = w): void {
    for (let py = y - 1; py <= y + h; py++) {
      for (let px = x - 1; px <= x + w; px++) {
        if (this.registry.at(px, py).length > 0) continue;
        this.clearDecorColumn(px, py);
      }
    }
  }

  /** Bonifica soltanto l'anello aggiunto da un upgrade, preservando il volume vecchio. */
  clearExpandedSiteDecor(record: BuildingRecord, footprint: number): void {
    for (let py = record.y - 1; py <= record.y + footprint; py++) {
      for (let px = record.x - 1; px <= record.x + footprint; px++) {
        const insideOld = px >= record.x && px < record.x + record.footprint &&
          py >= record.y && py < record.y + record.footprint;
        if (insideOld) continue;
        const occupied = this.registry.at(px, py).some((other) => other.id !== record.id);
        if (occupied) continue;
        this.clearDecorColumn(px, py);
      }
    }
  }

  clearDecorColumn(x: number, y: number): void {
    const column = this.terrain.columnAt(x, y);
    if (column === null) return;
    const top = column.height + BUILDER.decorClearanceHeight;
    for (let z = column.height; z < top; z++) {
      if (this.world.getBlock(x, y, z) !== STAMP_EMPTY) {
        this.world.setBlock(x, y, z, STAMP_EMPTY);
      }
    }
  }

  private canPaint(x: number, y: number): boolean {
    return groundKindAt(this.terrain, x, y) !== GROUND.refused &&
      !this.registry.isOccupied(x, y);
  }

  /**
   * Quota di progetto della carreggiata attorno a un isolato.
   *
   * La battigia ancora la strada alla quota della banchina; tutto il resto
   * parte dal terreno. `rampField` alza poi il campo alla pendenza uno, ed e'
   * quella relazione a produrre la rampa: la carreggiata che scende al molo ci
   * arriva con un voxel per colonna invece di finirci sopra a picco.
   *
   * Il rettangolo e' quello dell'anello, interno dell'isolato compreso: le
   * colonne interne non si dipingono ma servono a propagare la distanza, e
   * lasciarle fuori spezzerebbe la rampa proprio negli angoli.
   */
  private rampAround(ring: readonly PavementCell[]): {
    levelAt: (x: number, y: number) => number;
  } {
    let x0 = Number.MAX_SAFE_INTEGER;
    let y0 = Number.MAX_SAFE_INTEGER;
    let x1 = Number.MIN_SAFE_INTEGER;
    let y1 = Number.MIN_SAFE_INTEGER;
    for (const cell of ring) {
      if (cell.x < x0) x0 = cell.x;
      if (cell.y < y0) y0 = cell.y;
      if (cell.x > x1) x1 = cell.x;
      if (cell.y > y1) y1 = cell.y;
    }

    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    const level = new Int32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const wx = x0 + x;
        const wy = y0 + y;
        const ground = this.terrain.heightAt(wx, wy);
        level[y * width + x] = groundKindAt(this.terrain, wx, wy) === GROUND.shore
          ? Math.max(ground, GRADING.quayLevel)
          : ground;
      }
    }
    rampField(level, width, height);

    return {
      levelAt: (x: number, y: number): number => level[(y - y0) * width + (x - x0)],
    };
  }
}
