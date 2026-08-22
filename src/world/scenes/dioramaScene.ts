import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { CLASS_NAMES, type BuildingClass } from '../../sim';
import { generateBuilding } from '../buildings/generate';
import { anchoredVoxel, stampSurface, STAMP_EMPTY, type VoxelStamp } from '../buildings/stamp';
import { typologyById, type TypologyDefinition } from '../buildings/config';
import { selectTypology, typologyProfile } from '../buildings/typology';
import { hashCoords } from '../rng';
import { FACING } from '../streets/streetGrid';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';
import type { VoxelWorld } from '../VoxelWorld';
import type { SceneGenerator } from './cityScene';

/**
 * Un edificio solo, su un basamento minimo, inquadrato da vicino.
 *
 * **E' uno strumento di giudizio, non una scena di misura.** Le altre tre scene
 * di questa cartella esistono per misurare un throughput; questa esiste perche'
 * il dettaglio di un edificio si valuta guardandolo da vicino, e aspettare che
 * la citta' cresca fino a produrne uno del livello giusto costa minuti a ogni
 * iterazione. La stessa ossatura — una scena a budget che compone soggetti
 * scelti — serve al campionario della 4.10.
 *
 * **Non ridisegna niente.** Sceglie una tipologia con la stessa
 * `selectTypology` del Builder e stampa il risultato di `generateBuilding`: se
 * il diorama e la citta' mostrassero due edifici diversi, il diorama non
 * servirebbe a giudicare la citta'. Quello che non c'e' e' il contorno — lotto,
 * opere di terra, aggregazione: qui non c'e' terreno, e infatti il profilo
 * locale e' `null`, cioe' restano ammesse le sole tipologie che al luogo non
 * chiedono niente.
 *
 * **Il fronte strada e' parte del soggetto.** Un edificio in mezzo al prato non
 * mostra le tende, le insegne e i portali, che sono agganciati al lato che
 * guarda la carreggiata: il basamento porta quindi una strada vera sul lato
 * `FACING.east`, che e' il verso con cui lo stamp viene generato.
 */

/** Lato in voxel del prato attorno all'impronta, prima della carreggiata. */
const APRON = 5;

/** Larghezza della carreggiata del basamento, come una minore di `STREETS`. */
const ROAD_WIDTH = 5;

/** Quota del piano di campagna: sotto c'e' il basamento, sopra l'edificio. */
const GROUND_Z = 1;

/** Cosa mostrare. Sono i parametri che l'harness espone da URL. */
export interface DioramaSubjectOptions {
  readonly use: BuildingClass;
  readonly level: number;
  /** Tipologia forzata per id. Senza, la sceglie `selectTypology` come in citta'. */
  readonly typologyId?: string;
  /** Secondo uso ospitato, per giudicare il podio di un edificio misto. */
  readonly mixed?: BuildingClass;
}

export interface DioramaOptions extends DioramaSubjectOptions {
  readonly seed: number;
  /** Angolo minimo del basamento; il soggetto si centra dentro di esso. */
  readonly originX: number;
  readonly originY: number;
}

/** Ingombro del soggetto nel mondo, per inquadrarlo senza indovinarlo. */
export interface DioramaSubject {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly typology: string;
  readonly use: string;
  readonly level: number;
}

/**
 * Livello di default: alto abbastanza da accendere la faccia d'accento per
 * intero (`GRAMMAR.luminousFullLevel`) e da meritare un coronamento, basso
 * abbastanza da restare un edificio e non una guglia.
 */
export const DIORAMA_DEFAULT_LEVEL = 6;

/** Un `SceneGenerator` che sa anche dire cosa ha composto e dove. */
export interface DioramaScene extends SceneGenerator {
  readonly subject: DioramaSubject;
}

export function createDioramaScene(world: VoxelWorld, options: DioramaOptions): DioramaScene {
  return new DioramaGenerator(world, options);
}

/** Uso urbano da nome, per il parametro URL. Senza corrispondenza vale null. */
export function parseBuildingUse(value: string | null): BuildingClass | null {
  if (value === null) return null;
  const index = CLASS_NAMES.indexOf(value);
  return index < 0 ? null : (index as BuildingClass);
}

class DioramaGenerator implements DioramaScene {
  private readonly world: VoxelWorld;
  private readonly options: DioramaOptions;
  private readonly stamp: VoxelStamp;
  private readonly typology: TypologyDefinition;
  private readonly level: number;
  private readonly anchorX: number;
  private readonly anchorY: number;
  private readonly padSide: number;

  /** Fase corrente: prima il basamento, poi una fascia di quota per volta. */
  private groundDone = false;
  private z = 0;
  private written = 0;
  private finished = false;

  constructor(world: VoxelWorld, options: DioramaOptions) {
    this.world = world;
    this.options = options;

    const level = Math.max(0, Math.floor(options.level));
    this.level = level;
    const forced = options.typologyId === undefined ? undefined : typologyById(options.typologyId);
    this.typology = forced ?? selectTypology({
      use: options.use,
      mixed: options.mixed,
      level,
      // Senza citta' intorno non c'e' profilo locale da inventare: passa `null`,
      // ed e' la stessa strada del piazzamento fuori simulazione.
      profile: null,
      coastal: false,
    });

    this.stamp = generateBuilding({
      class: options.use,
      level,
      seed: hashCoords(options.seed, options.originX, options.originY),
      profile: typologyProfile(this.typology),
      shape: this.typology.shape,
      mixed: options.mixed,
      // Il verso e' fisso e non un tiro: il basamento mette la carreggiata da
      // questa parte, e il fronte deve guardarla.
      facing: FACING.east,
    });

    this.padSide = this.stamp.sizeX + 2 * APRON + ROAD_WIDTH;
    this.anchorX = options.originX + APRON;
    this.anchorY = options.originY + APRON;
  }

  get done(): boolean {
    return this.finished;
  }

  get voxelsWritten(): number {
    return this.written;
  }

  get progress(): number {
    if (this.finished) return 1;
    if (!this.groundDone) return 0;
    return this.z / Math.max(1, this.stamp.sizeZ);
  }

  /** Dove sta il soggetto: lo consuma l'inquadratura, non la generazione. */
  get subject(): DioramaSubject {
    return {
      x: this.anchorX,
      y: this.anchorY,
      z: GROUND_Z,
      sizeX: this.stamp.sizeX,
      sizeY: this.stamp.sizeY,
      sizeZ: this.stamp.sizeZ,
      typology: this.typology.id,
      use: CLASS_NAMES[this.options.use],
      level: this.level,
    };
  }

  step(budgetMs: number): boolean {
    if (this.finished) return true;
    const start = performance.now();

    if (!this.groundDone) {
      this.writeGround();
      this.groundDone = true;
      if (performance.now() - start >= budgetMs) return false;
    }

    // L'unita' di lavoro e' la quota: un'impronta sta in poche centinaia di
    // celle, e spezzare piu' fine costerebbe piu' del lavoro che rimanda.
    while (this.z < this.stamp.sizeZ) {
      this.writeLayer(this.z);
      this.z++;
      if (performance.now() - start >= budgetMs) break;
    }

    this.finished = this.z >= this.stamp.sizeZ;
    return this.finished;
  }

  /** Prato, marciapiede e carreggiata: il contorno che rende leggibile il fronte. */
  private writeGround(): void {
    const { originX, originY } = this.options;
    const roadStart = this.stamp.sizeX + 2 * APRON;

    for (let dy = 0; dy < this.padSide; dy++) {
      for (let dx = 0; dx < this.padSide; dx++) {
        const onRoad = dx >= roadStart;
        const onKerb = dx === roadStart - 1;
        const surfaceId = onRoad
          ? PALETTE_SLOTS.asphalt
          : onKerb
            ? PALETTE_SLOTS.concreteLight
            : PALETTE_SLOTS.grass;

        this.set(originX + dx, originY + dy, GROUND_Z - 1, PALETTE_SLOTS.stoneDark);
        this.set(originX + dx, originY + dy, GROUND_Z, surfaceId);
      }
    }
  }

  private writeLayer(sz: number): void {
    const stamp = this.stamp;
    const anchor = { x: this.anchorX, y: this.anchorY, z: GROUND_Z + 1 };

    for (let sy = 0; sy < stamp.sizeY; sy++) {
      for (let sx = 0; sx < stamp.sizeX; sx++) {
        const index = sx + stamp.sizeX * (sy + stamp.sizeY * sz);
        const id = stamp.voxels[index];
        if (id === STAMP_EMPTY) continue;
        const voxel = anchoredVoxel(anchor, stamp, sx, sy, sz);
        this.set(voxel.x, voxel.y, voxel.z, id, stampSurface(stamp, index));
      }
    }
  }

  private set(
    x: number,
    y: number,
    z: number,
    id: number,
    surface: SurfaceKind = SURFACE_KIND.plain,
  ): void {
    this.world.setBlock(x, y, z, id, surface);
    this.written++;
  }
}
