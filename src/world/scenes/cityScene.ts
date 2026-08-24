import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { BUILDING_CLASS } from '../../sim';
import { hashCoords, mulberry32 } from '../rng';
import type { VoxelWorld } from '../VoxelWorld';
import {
  createDioramaScene,
  DIORAMA_DEFAULT_LEVEL,
  type DioramaSubjectOptions,
} from './dioramaScene';
import { createSwatchScene } from './swatchScene';

/**
 * Scene di test deterministiche per l'harness di performance.
 *
 * La scena di accettazione ('city') e' fatta di edifici solidi: e' il caso che
 * il greedy meshing sa fondere, quindi 512x512x64 al 20 percento di riempimento
 * resta nei limiti di draw call e triangoli. 'noise' e' il caso peggiore
 * dichiarato (riempimento uniforme casuale: ogni voxel espone quasi tutte le
 * facce) e serve solo a misurare il tetto di throughput di mesher e upload.
 *
 * La generazione e' esposta a passi con budget in millisecondi, cosi' anche il
 * popolamento iniziale non blocca il main thread oltre la soglia.
 *
 * Le altre due non misurano niente e sono **strumenti di giudizio**: 'diorama'
 * guarda un edificio da vicino, 'swatch' guarda il vocabolario — ogni slot di
 * palette per ogni linguaggio di superficie, la stratigrafia di ogni bioma, il
 * rapporto di scala fra cella, albero ed edificio. Entrambe dichiarano da se' il
 * proprio ingombro e ignorano la region richiesta.
 */

export type SceneKind = 'city' | 'noise' | 'slab' | 'diorama' | 'swatch';

export interface SceneRegion {
  readonly originX: number;
  readonly originY: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

export interface SceneOptions extends SceneRegion {
  readonly kind: SceneKind;
  readonly seed: number;
  /** Frazione di riempimento usata solo da 'noise'. */
  readonly noiseFill?: number;
  /** Soggetto della scena 'diorama'; senza, vale il default del suo modulo. */
  readonly subject?: DioramaSubjectOptions;
}

export interface SceneGenerator {
  /** Esegue lavoro per al massimo `budgetMs`. Restituisce true quando ha finito. */
  step(budgetMs: number): boolean;
  readonly done: boolean;
  /** 0..1, per la barra di avanzamento dell'overlay. */
  readonly progress: number;
  readonly voxelsWritten: number;
}

/** Passo della griglia urbana: 6 celle di strada + 18 di lotto. */
export const TILE = 24;
export const STREET = 6;
export const LOT = TILE - STREET;

/**
 * Altezza media di riferimento degli edifici. Calibrata perche' la scena 'city'
 * su 512x512x64 cada nell'intorno del 20 percento di riempimento; il test
 * cityScene.test.ts verifica il valore effettivo.
 */
const HEIGHT_MEAN = 39;
const HEIGHT_MIN = 6;

/** Ogni quanti livelli il corpo dell'edificio cambia banda di palette. */
const BAND_STEP = 6;

export function createScene(world: VoxelWorld, options: SceneOptions): SceneGenerator {
  switch (options.kind) {
    case 'city':
      return new CityGenerator(world, options);
    case 'noise':
      return new NoiseGenerator(world, options);
    case 'slab':
      return new SlabGenerator(world, options);
    case 'diorama':
      // Il soggetto si compone al centro della region richiesta: chi inquadra
      // legge poi l'ingombro vero da `subject`, che solo il generatore conosce.
      return createDioramaScene(world, {
        seed: options.seed,
        originX: options.originX + Math.floor(options.sizeX / 2),
        originY: options.originY + Math.floor(options.sizeY / 2),
        use: options.subject?.use ?? BUILDING_CLASS.commercial,
        level: options.subject?.level ?? DIORAMA_DEFAULT_LEVEL,
        typologyId: options.subject?.typologyId,
        mixed: options.subject?.mixed,
      });
    case 'swatch':
      // Il campionario dichiara da se' il proprio ingombro: la region richiesta
      // non lo riguarda, come non riguarda il diorama.
      return createSwatchScene(world);
  }
}

/** Numero di voxel pieni che la scena produrrebbe, misurato dopo la generazione. */
abstract class BaseGenerator implements SceneGenerator {
  protected written = 0;
  protected finished = false;

  get done(): boolean {
    return this.finished;
  }

  get voxelsWritten(): number {
    return this.written;
  }

  abstract step(budgetMs: number): boolean;
  abstract get progress(): number;
}

class CityGenerator extends BaseGenerator {
  private readonly world: VoxelWorld;
  private readonly options: SceneOptions;
  private readonly tilesX: number;
  private readonly tilesY: number;
  private tile = 0;

  constructor(world: VoxelWorld, options: SceneOptions) {
    super();
    this.world = world;
    this.options = options;
    this.tilesX = Math.max(1, Math.floor(options.sizeX / TILE));
    this.tilesY = Math.max(1, Math.floor(options.sizeY / TILE));
  }

  get progress(): number {
    return this.tile / (this.tilesX * this.tilesY);
  }

  step(budgetMs: number): boolean {
    if (this.finished) return true;
    const start = performance.now();
    const total = this.tilesX * this.tilesY;

    while (this.tile < total) {
      this.buildTile(this.tile % this.tilesX, Math.floor(this.tile / this.tilesX));
      this.tile++;
      // Il controllo sta dopo un intero lotto: e' l'unita' minima di lavoro.
      if (performance.now() - start >= budgetMs) break;
    }

    this.finished = this.tile >= total;
    return this.finished;
  }

  private buildTile(tx: number, ty: number): void {
    const { originX, originY, sizeZ, seed } = this.options;
    const tileX = originX + tx * TILE;
    const tileY = originY + ty * TILE;
    const rand = mulberry32(hashCoords(seed, tx, ty));

    // Strade: il bordo del tile, un solo livello a z = 0.
    const asphalt = rand() < 0.15 ? PALETTE_SLOTS.asphaltDark : PALETTE_SLOTS.asphalt;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (x >= STREET && y >= STREET) continue;
        this.set(tileX + x, tileY + y, 0, asphalt);
      }
    }

    const lotX = tileX + STREET;
    const lotY = tileY + STREET;

    // Un lotto su otto resta verde: rompe la regolarita' della griglia.
    if (rand() < 0.12) {
      const grass = rand() < 0.5 ? PALETTE_SLOTS.grass : PALETTE_SLOTS.grassDark;
      for (let y = 0; y < LOT; y++) {
        for (let x = 0; x < LOT; x++) this.set(lotX + x, lotY + y, 0, grass);
      }
      return;
    }

    const district = districtFactor(tileX, tileY, seed);
    const height = Math.max(
      HEIGHT_MIN,
      Math.min(sizeZ - 2, Math.round(HEIGHT_MEAN * (0.45 + 1.1 * district) * (0.65 + 0.7 * rand()))),
    );

    const margin = Math.floor(rand() * 3);
    let x0 = lotX + margin;
    let y0 = lotY + margin;
    let x1 = lotX + LOT - margin;
    let y1 = lotY + LOT - margin;

    const body = BODY_IDS[Math.floor(rand() * BODY_IDS.length)];
    const band = BAND_IDS[Math.floor(rand() * BAND_IDS.length)];
    const boxes = rand() < 0.4 ? 3 : 2;

    let z = 0;
    for (let box = 0; box < boxes && z < height; box++) {
      const isLast = box === boxes - 1;
      const share = 0.4 + rand() * 0.35;
      const top = isLast ? height : Math.min(height, z + Math.max(4, Math.round(height * share)));

      this.fillBox(x0, y0, z, x1, y1, top, body, band);
      // Parapetto: anello di un voxel sopra il tetto, dettaglio che non fonde.
      this.ring(x0, y0, top, x1, y1, PALETTE_SLOTS.concretePale);

      z = top + 1;
      const setback = 1 + Math.floor(rand() * 2);
      x0 += setback;
      y0 += setback;
      x1 -= setback;
      y1 -= setback;
      if (x1 - x0 < 5 || y1 - y0 < 5) break;
    }
  }

  /** Riempie un box solido con bande orizzontali di palette e un cappello di tetto. */
  private fillBox(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    body: number,
    band: number,
  ): void {
    for (let z = z0; z < z1; z++) {
      let id = body;
      if (z < 2) id = PALETTE_SLOTS.stoneDark; // zoccolo
      else if (z === z1 - 1) id = PALETTE_SLOTS.roofPale; // cappello
      else if ((z - z0) % BAND_STEP === 0) id = band; // marcapiano
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) this.set(x, y, z, id);
      }
    }
  }

  private ring(x0: number, y0: number, z: number, x1: number, y1: number, id: number): void {
    for (let x = x0; x < x1; x++) {
      this.set(x, y0, z, id);
      this.set(x, y1 - 1, z, id);
    }
    for (let y = y0 + 1; y < y1 - 1; y++) {
      this.set(x0, y, z, id);
      this.set(x1 - 1, y, z, id);
    }
  }

  private set(x: number, y: number, z: number, id: number): void {
    this.world.setBlock(x, y, z, id);
    this.written++;
  }
}

/** Caso peggiore: riempimento uniforme casuale, nessuna faccia da fondere. */
class NoiseGenerator extends BaseGenerator {
  private readonly world: VoxelWorld;
  private readonly options: SceneOptions;
  private readonly fill: number;
  private z = 0;
  private y = 0;

  constructor(world: VoxelWorld, options: SceneOptions) {
    super();
    this.world = world;
    this.options = options;
    this.fill = options.noiseFill ?? 0.2;
  }

  get progress(): number {
    const rows = this.options.sizeZ * this.options.sizeY;
    return (this.z * this.options.sizeY + this.y) / rows;
  }

  step(budgetMs: number): boolean {
    if (this.finished) return true;
    const start = performance.now();
    const { originX, originY, sizeX, sizeY, sizeZ, seed } = this.options;

    // L'unita' di lavoro e' la riga: una slice intera sforerebbe il budget.
    while (this.z < sizeZ) {
      const rand = mulberry32(hashCoords(seed, this.z * 4096 + this.y, 0x9e37));
      for (let x = 0; x < sizeX; x++) {
        if (rand() >= this.fill) continue;
        const id = 1 + Math.floor(rand() * 31);
        this.world.setBlock(originX + x, originY + this.y, this.z, id);
        this.written++;
      }

      this.y++;
      if (this.y >= sizeY) {
        this.y = 0;
        this.z++;
      }
      if (performance.now() - start >= budgetMs) break;
    }

    this.finished = this.z >= sizeZ;
    return this.finished;
  }
}

/** Scena minima di controllo: un lastrone di due livelli. */
class SlabGenerator extends BaseGenerator {
  private readonly world: VoxelWorld;
  private readonly options: SceneOptions;
  private y = 0;

  constructor(world: VoxelWorld, options: SceneOptions) {
    super();
    this.world = world;
    this.options = options;
  }

  get progress(): number {
    return this.y / this.options.sizeY;
  }

  step(budgetMs: number): boolean {
    if (this.finished) return true;
    const start = performance.now();
    const { originX, originY, sizeX, sizeY } = this.options;

    while (this.y < sizeY) {
      for (let x = 0; x < sizeX; x++) {
        this.world.setBlock(originX + x, originY + this.y, 0, PALETTE_SLOTS.concrete);
        this.world.setBlock(originX + x, originY + this.y, 1, PALETTE_SLOTS.grass);
        this.written += 2;
      }
      this.y++;
      if (performance.now() - start >= budgetMs) break;
    }

    this.finished = this.y >= sizeY;
    return this.finished;
  }
}

const BODY_IDS: readonly number[] = [
  PALETTE_SLOTS.concrete,
  PALETTE_SLOTS.concreteLight,
  PALETTE_SLOTS.stone,
  PALETTE_SLOTS.stoneWarm,
  PALETTE_SLOTS.glass,
  PALETTE_SLOTS.glassDeep,
  PALETTE_SLOTS.brick,
  PALETTE_SLOTS.brickDark,
];

const BAND_IDS: readonly number[] = [
  PALETTE_SLOTS.concreteWhite,
  PALETTE_SLOTS.glassPale,
  PALETTE_SLOTS.metalBrass,
  PALETTE_SLOTS.brickLight,
];

/**
 * Campo 0..1 che decide quanto e' alto un distretto. La somma di poche
 * sinusoidi con periodi diversi da' fasce alte e fasce basse senza usare una
 * libreria di noise, e non dipende dall'estensione del mondo: una striscia
 * aggiunta a runtime continua il profilo di quella accanto.
 */
function districtFactor(x: number, y: number, seed: number): number {
  const phase = (seed % 1000) * 0.001;
  const ripple =
    0.5 +
    0.25 * Math.sin(x * 0.017 + phase * 6.3) +
    0.25 * Math.cos(y * 0.013 - phase * 4.1) +
    0.12 * Math.sin((x + y) * 0.0071 + phase);
  return Math.min(1, Math.max(0, ripple));
}
