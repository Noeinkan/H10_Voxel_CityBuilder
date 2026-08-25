import {
  ALL_CLASSES,
  BALANCE,
  BUILDING_CLASS,
  CLASS_COUNT,
  FARM_KIND,
  effectiveCount,
  foodYieldOf,
  catalystRoleOf,
  urbanProfileAt,
  weightsOf,
  type BuildingClass,
  type Catalyst,
  type LocalUrbanProfile,
  type SimState,
} from '../sim';
import type { VoxelWorld } from '../world/VoxelWorld';
import { keyOf, toChunk } from '../world/chunkCoords';
import type { SurfaceKind } from '../world/visualBlock';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { WATER_IDS } from '../world/terrain/config';
import type { StreetNetwork } from '../world/streets/StreetNetwork';
import type { BlockRect, StreetRole } from '../world/streets/streetGrid';
import { waterDistance } from '../world/sites/siteRules';
import { SKYLINE } from '../world/skyline/config';
import { allowedLevelAt, tierAt, type SkylineQuery, type SkylineTier } from '../world/skyline/tiers';
import { buildWeightOf, type GroundKind } from '../world/grading/grade';
import { groundKindAt, isCoastal } from '../world/buildings/siteWorks';
import { BUILDER } from '../world/buildings/config';
import {
  footprintDepth,
  type BuildingRecord,
  type ReadonlyBuildingRegistry,
} from '../world/buildings/BuildingRegistry';
import type { SurfaceCell } from './surfacePick';

/**
 * Cosa c'e' sotto un punto della citta', in quattro strati.
 *
 * **Non e' una modalita' di selezione ma una pila.** Un click produce sempre
 * tutti e quattro gli strati che esistono in quel punto — struttura, isolato,
 * colonna, voxel — perche' sono la stessa domanda a quattro ingrandimenti, e
 * farli scegliere prima al giocatore vorrebbe dire chiedergli di sapere gia' la
 * risposta. Quale dei quattro guardare lo decide dopo, leggendoli.
 *
 * Puro come `surfacePick`, e per la stessa ragione: qui non entra ne' Three.js
 * ne' il DOM, cosi' la regola di *cosa c'e'* si prova in `node` separatamente da
 * come la si disegna. `src/game/` non conosce l'engine, quindi gli indici
 * restano numeri: a dargli un nome e' il modello del pannello.
 */

/** Il voxel davvero colpito dal raggio. */
export interface VoxelInfo {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Slot di palette 0..31; `0` e' vuoto. */
  readonly palette: number;
  /**
   * Linguaggio di superficie, oppure la classe dello specchio su un voxel
   * d'acqua — i tre bit sono gli stessi e il sovraccarico e' dichiarato.
   */
  readonly surface: SurfaceKind;
  readonly water: boolean;
  /** Chunk che lo contiene, nella chiave `"cx,cy,cz"` del resto del progetto. */
  readonly chunkKey: string;
}

/** La colonna: cosa regge, quanto vale e cosa ci si sente attorno. */
export interface ColumnInfo {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly biome: number;
  readonly slope: number;
  readonly buildable: boolean;
  /** Quota dello specchio d'acqua, `0` dove non ce n'e'. */
  readonly waterTop: number;
  readonly ground: GroundKind;
  /** Moltiplicatore di costo dell'opera di terra; `Infinity` se rifiutata. */
  readonly buildWeight: number;
  readonly tier: SkylineTier;
  /** Livelli ammessi qui, gia' clampati come li clampa il Builder. */
  readonly allowedLevel: number;
  /** Desiderabilita' 0..255 per uso urbano, nell'ordine di contratto. */
  readonly desirability: readonly number[];
  readonly crowd: number;
  readonly stack: number;
  /** Il quartiere di **adesso**, che non e' quello congelato in un record. */
  readonly profile: LocalUrbanProfile;
  /**
   * true se la colonna vede il mare entro `BUILDER.coastalRadius`.
   *
   * Non e' `waterTop`, che parla di **questa** colonna: qui la domanda e' se
   * l'affaccio ci sia, ed e' una delle condizioni che una tipologia pone. Si
   * legge da `isCoastal`, cioe' dalla stessa funzione con lo stesso raggio che
   * il Builder passa a `selectTypology` — con due misure diverse la scheda
   * prometterebbe una forma che il Builder poi rifiuta, che e' esattamente il
   * difetto che dire «cosa potrebbe crescere qui» esiste per chiudere.
   */
  readonly coastal: boolean;
}

/**
 * Cosa la simulazione sa dire di un edificio **come questo**.
 *
 * Il confine e' tutto in quel «come». Di *questo* edificio la simulazione non sa
 * niente: il campo e' per colonna, `state.buildings` porta posizione e uso senza
 * un id che risalga a un `BuildingRecord`, e il tick conta per classe — la
 * capacita' e' `effectiveCount(residenziale) * residentialCapacity`, le entrate
 * sono `popolazione * tassa + ricavo`. Non c'e' nessun posto in cui siano scritti
 * i residenti o l'incasso di un singolo palazzo.
 *
 * Quello che invece si puo' dire, e senza inventare niente, sono due fatti veri
 * per costruzione:
 *
 * 1. **Il rendimento del tipo.** `residentialCapacity` e' letteralmente
 *    «abitanti ospitati da un edificio residenziale», gia' passato per le policy
 *    attive. E' una proprieta' dell'uso, non una misura di questo esemplare —
 *    tanto che **non scala col livello**: il tick conta edifici, non piani, e una
 *    torre di livello 6 vale quanto la casa accanto. Chi legge la scheda vede
 *    «Level 6 of 6» due righe sopra, quindi va detto li' e non taciuto.
 * 2. **Quanto la citta' usa cio' che ha.** L'occupazione delle case e quella dei
 *    negozi sono numeri **di citta'**, e vanno etichettati come tali:
 *    attribuirli a questo edificio sarebbe di nuovo il bilancio inventato.
 *
 * Dove un numero del genere non esiste — l'industria e il civico non hanno una
 * quota d'uso che il tick conservi — resta `null`. Il vuoto e' un fatto.
 */
export interface UseInfo {
  readonly cls: BuildingClass;
  /** true dove l'uso e' quello ospitato di un edificio misto. */
  readonly secondary: boolean;
  /**
   * Il rendimento di un edificio di questo uso, con le policy di adesso: residenti
   * ospitati, clienti serviti per tick, materiali resi, fondi consumati. L'unita'
   * cambia con l'uso, e a dirla e' il modello del pannello.
   */
  readonly perBuilding: number;
  /** Quanti edifici della citta' portano questo uso, misti compresi. */
  readonly count: number;
  /** Quanto la citta' usa cio' che ha di questo uso, in [0, 1], o `null`. */
  readonly cityUse: number | null;
}

/**
 * La struttura puntata, con il suo posto nella rete.
 *
 * Luogo, struttura, e — solo in `uses` — cio' che la simulazione sa dire di un
 * edificio *come* questo. Nient'altro: qui dentro non entrano ne' i residenti ne'
 * le entrate di questo palazzo, perche' non esistono da nessuna parte. Il perche'
 * per esteso sta su `UseInfo`.
 */
export interface StructureInfo {
  readonly record: BuildingRecord;
  /** Catalizzatore rappresentato dal landmark, se questa struttura ne ha uno. */
  readonly catalyst: Catalyst | null;
  /** true se qualcosa le e' appeso: chi regge non promuove piu'. */
  readonly carries: boolean;
  readonly spans: readonly BuildingRecord[];
  readonly decks: readonly BuildingRecord[];
  /** Appoggi risolti in record, non solo id. */
  readonly supports: readonly BuildingRecord[];
  /**
   * Gli usi che questo edificio porta: uno, o due se e' misto.
   *
   * Vuoto su landmark, campate e parti in quota. Non e' una mancanza da riempire
   * piu' avanti: la simulazione non li ha **mai** contati fra gli edifici, quindi
   * un rendimento accanto a un viadotto direbbe un numero che nessun tick somma.
   */
  readonly uses: readonly UseInfo[];
}

/** L'isolato e cosa ci e' cresciuto dentro. */
export interface BlockInfo {
  readonly key: string;
  readonly rect: BlockRect;
  readonly role: StreetRole;
  /** Edifici veri: landmark, campate e parti in quota sono contati a parte. */
  readonly buildings: number;
  readonly byClass: readonly number[];
  readonly landmarks: number;
  readonly structures: number;
  readonly maxLevel: number;
  /** Capacita' e flussi attribuibili agli edifici dentro questo isolato. */
  readonly productivity: BlockProductivity;
}

/**
 * Cosa l'isolato mette a disposizione o produce con le policy e l'organico di
 * adesso. Le capacita' non dipendono dall'organico; i due flussi produttivi si'.
 */
export interface BlockProductivity {
  readonly housingCapacity: number;
  readonly commerceCapacity: number;
  readonly materialsCapacityPerTick: number;
  readonly materialsPerTick: number;
  readonly foodCapacityPerTick: number;
  readonly foodPerTick: number;
  readonly civicUpkeepPerTick: number;
  /** Quota di organico cittadina applicata a materiali e cibo. */
  readonly staffing: number;
}

export interface Selection {
  readonly voxel: VoxelInfo;
  readonly column: ColumnInfo;
  readonly structure: StructureInfo | null;
  readonly block: BlockInfo;
}

export interface SelectionQuery {
  readonly cell: SurfaceCell;
  readonly world: VoxelWorld;
  readonly map: TerrainMap;
  readonly registry: ReadonlyBuildingRegistry;
  readonly streets: StreetNetwork;
  readonly state: SimState;
  readonly seed: number;
}

/**
 * Risolve la pila sotto una cella puntata.
 *
 * `null` solo dove non c'e' terreno: fuori dalla mappa non c'e' niente da dire,
 * e una scheda vuota sarebbe peggio di nessuna scheda.
 */
export function resolveSelection(query: SelectionQuery): Selection | null {
  const { cell, map, registry, streets, state } = query;
  const column = map.columnAt(cell.x, cell.y);
  if (column === null) return null;

  // La cima della colonna: il terreno oppure cio' che ci hanno costruito sopra.
  // E' la stessa somma che `pickSolidCell` ha gia' fatto per fermare il raggio,
  // e serve di nuovo qui perche' quella non la restituisce.
  const surface = Math.max(column.height, registry.topOf(cell.x, cell.y));
  const voxelZ = voxelUnder(cell, surface);

  const skyline = skylineQuery(query, cell.x, cell.y);
  const block = streets.blockAt(cell.x, cell.y);
  const ground = groundKindAt(map, cell.x, cell.y);

  return {
    voxel: voxelAt(query, cell.x, cell.y, voxelZ),
    column: {
      x: cell.x,
      y: cell.y,
      height: column.height,
      biome: column.biome,
      slope: column.slope,
      buildable: column.buildable,
      waterTop: map.waterTopAt(cell.x, cell.y),
      ground,
      buildWeight: buildWeightOf(ground),
      tier: tierAt(skyline),
      // Lo stesso clamp del Builder: dire al giocatore un tetto che nessun
      // edificio raggiungera' mai sarebbe un numero inventato.
      allowedLevel: Math.min(BUILDER.maxLevel, allowedLevelAt(skyline)),
      desirability: ALL_CLASSES.map((cls) => state.field.valueAt(cell.x, cell.y, cls)),
      crowd: state.field.crowdAt(cell.x, cell.y),
      stack: state.field.stackAt(cell.x, cell.y),
      profile: urbanProfileAt(state, cell.x, cell.y),
      coastal: isCoastal(map, cell.x, cell.y),
    },
    structure: structureAt(registry, state, cell.x, cell.y, voxelZ),
    block: blockAt(query, streets.keyOf(block), streets.blockRect(block)),
  };
}

/**
 * Il voxel che il raggio ha davvero incontrato.
 *
 * `hitZ` e' la quota frazionaria del passo che ha fermato la marcia, quindi il
 * voxel e' la sua parte intera. Il clamp serve al caso in cui il raggio si fermi
 * esattamente sul piano della cima: li' la parte intera sarebbe la prima cella
 * **libera**, cioe' l'aria sopra il tetto invece del tetto.
 */
function voxelUnder(cell: SurfaceCell, surface: number): number {
  return Math.min(Math.floor(cell.hitZ), surface - 1);
}

function voxelAt(query: SelectionQuery, x: number, y: number, z: number): VoxelInfo {
  const palette = query.world.getBlock(x, y, z);
  return {
    x,
    y,
    z,
    palette,
    surface: query.world.getSurfaceKind(x, y, z),
    water: palette === WATER_IDS.surface || palette === WATER_IDS.deep,
    chunkKey: keyOf(toChunk(x), toChunk(y), toChunk(z)),
  };
}

/**
 * Fra i record che coprono la colonna, quello a cui appartiene il voxel.
 *
 * L'occupazione e' tridimensionale — un edificio a terra, una mensola in quota e
 * un ponte sopra entrambi sono legali sulla stessa colonna — quindi `at` ne
 * restituisce piu' d'uno e senza la quota non ci sarebbe modo di dire quale sia
 * stato puntato. Cliccare un ponte deve dare il ponte, non la casa sotto.
 */
function structureAt(
  registry: ReadonlyBuildingRegistry,
  state: SimState,
  x: number,
  y: number,
  z: number,
): StructureInfo | null {
  const record = registry.at(x, y)
    .find((candidate) => candidate.baseZ <= z && z < candidate.baseZ + candidate.height);
  if (record === undefined) return null;

  return {
    record,
    catalyst: catalystOf(state, record),
    carries: registry.carries(record.id),
    spans: registry.spansOf(record.id),
    decks: registry.decksOf(record.id),
    supports: (record.supports ?? [])
      .map((id) => registry.get(id))
      .filter((support): support is BuildingRecord => support !== null),
    uses: usesOf(state, record),
  };
}

/**
 * Gli usi che un record porta, con cio' che la simulazione dice di ciascuno.
 *
 * Il ramo d'uscita e' lo stesso di `blockAt`, e non e' una coincidenza: landmark,
 * campate e parti in quota non sono edifici e il tick non li ha mai contati. Il
 * campo `class` c'e' anche su di loro, e leggerlo qui produrrebbe un rendimento
 * per un viadotto.
 */
function usesOf(state: SimState, record: BuildingRecord): readonly UseInfo[] {
  if (record.landmark !== undefined || record.span !== undefined || record.aerial !== undefined) {
    return [];
  }

  const weights = weightsOf(state);
  // Indicizzato per costante e non per posizione: l'ordine di `BUILDING_CLASS` e'
  // un contratto, ma quattro assegnazioni esplicite non possono scivolare.
  const perClass: number[] = [];
  perClass[BUILDING_CLASS.residential] = weights.residentialCapacity;
  perClass[BUILDING_CLASS.commercial] = weights.commercialCapacity;
  perClass[BUILDING_CLASS.industrial] = weights.productionYield;
  perClass[BUILDING_CLASS.civic] = weights.civicUpkeep;

  const uses = [useInfo(state, perClass, record.class, false)];
  // Lo stesso scarto di `addBuilding`: un uso secondario uguale al primario non
  // e' un edificio misto, e ripeterlo darebbe due righe identiche.
  if (record.mixed !== undefined && record.mixed !== record.class) {
    uses.push(useInfo(state, perClass, record.mixed, true));
  }
  return uses;
}

function useInfo(
  state: SimState,
  perClass: readonly number[],
  cls: BuildingClass,
  secondary: boolean,
): UseInfo {
  const full = perClass[cls] ?? 0;
  return {
    cls,
    secondary,
    // L'ospite porta una quota della capacita', ed e' la stessa che `effectiveCount`
    // somma: se qui comparisse il rendimento pieno, la scheda direbbe che un uso
    // misto vale due edifici mentre il tick ne conta uno e mezzo.
    perBuilding: secondary ? full * BALANCE.mixedUse.secondaryShare : full,
    count: (state.buildingCounts[cls] ?? 0) + (state.mixedCounts[cls] ?? 0),
    // Sul rendimento **pieno**: la quota d'uso e' della citta', e la citta' non ha
    // una capacita' diversa a seconda di quale dei suoi edifici si sta guardando.
    cityUse: cityUseOf(state, cls, full),
  };
}

/**
 * Quanto la citta' usa cio' che ha costruito di un uso, dove la domanda ha una
 * risposta che il tick conserva.
 *
 * Due su quattro, e le altre due restano `null` invece di ricevere un numero
 * plausibile. L'industria e il civico hanno una quota di organico e una di
 * copertura, ma il tick le consuma e non le scrive da nessuna parte: ricalcolarle
 * qui vorrebbe dire una seconda simulazione accanto alla prima, che diverge al
 * primo cambio di bilancio.
 */
function cityUseOf(state: SimState, cls: BuildingClass, perBuilding: number): number | null {
  if (cls === BUILDING_CLASS.residential) {
    const capacity = effectiveCount(state, cls) * perBuilding;
    return capacity > 0 ? state.population.stock / capacity : null;
  }
  if (cls === BUILDING_CLASS.commercial) {
    return state.commerce.capacity > 0 ? state.commerce.occupancy : null;
  }
  return null;
}

/**
 * L'aggregato dell'isolato.
 *
 * Passa da `withinRadius` e non da `at` colonna per colonna: un isolato e'
 * qualche centinaio di colonne, e interrogarle tutte costerebbe quanto il
 * riquadro invece che quanto i record che ci sono davvero. Il filtro sul
 * rettangolo resta necessario perche' `withinRadius` misura in distanza di
 * Chebyshev sull'angolo minimo, che e' un quadrato piu' largo dell'isolato.
 */
function blockAt(query: SelectionQuery, key: string, rect: BlockRect): BlockInfo {
  const centreX = Math.floor((rect.x0 + rect.x1) / 2);
  const centreY = Math.floor((rect.y0 + rect.y1) / 2);
  const reach = Math.max(rect.x1 - centreX, centreX - rect.x0, rect.y1 - centreY, centreY - rect.y0);

  const byClass = new Array<number>(CLASS_COUNT).fill(0);
  const effectiveByClass = new Array<number>(CLASS_COUNT).fill(0);
  let buildings = 0;
  let landmarks = 0;
  let structures = 0;
  let maxLevel = 0;
  let farmTowers = 0;

  for (const record of query.registry.withinRadius(centreX, centreY, reach)) {
    if (record.x + record.footprint - 1 < rect.x0 || record.x > rect.x1) continue;
    if (record.y + footprintDepth(record) - 1 < rect.y0 || record.y > rect.y1) continue;

    if (record.landmark !== undefined) {
      landmarks++;
      continue;
    }
    // Campate e parti in quota non sono edifici e la simulazione non le ha mai
    // contate: sommarle qui farebbe divergere questa scheda dall'HUD.
    if (record.span !== undefined || record.aerial !== undefined) {
      structures++;
      continue;
    }
    buildings++;
    byClass[record.class]++;
    if (record.arcology !== undefined) {
      // Un'arcologia e' un record ma la simulazione la conta una volta per
      // fascia abitata: `uses` e' la stessa fonte che usa il driver.
      for (const use of record.uses ?? []) effectiveByClass[use]++;
    } else {
      effectiveByClass[record.class]++;
      if (record.mixed !== undefined && record.mixed !== record.class) {
        effectiveByClass[record.mixed] += BALANCE.mixedUse.secondaryShare;
      }
      if (record.specialization === 'farming') farmTowers++;
    }
    if (record.level > maxLevel) maxLevel = record.level;
  }

  const weights = weightsOf(query.state);
  const materialIndustry = Math.max(
    0,
    (effectiveByClass[BUILDING_CLASS.industrial] ?? 0) - farmTowers,
  );
  const localFarms: number[] = [];
  localFarms[FARM_KIND.tower] = farmTowers;
  const materialsCapacityPerTick = materialIndustry * weights.productionYield;
  const foodCapacityPerTick = foodYieldOf(localFarms, 1);

  return {
    key,
    rect,
    role: query.streets.roleAt(query.cell.x, query.cell.y),
    buildings,
    byClass,
    landmarks,
    structures,
    maxLevel,
    productivity: {
      housingCapacity: (effectiveByClass[BUILDING_CLASS.residential] ?? 0) * weights.residentialCapacity,
      commerceCapacity: (effectiveByClass[BUILDING_CLASS.commercial] ?? 0) * weights.commercialCapacity,
      materialsCapacityPerTick,
      materialsPerTick: materialsCapacityPerTick * query.state.staffing,
      foodCapacityPerTick,
      foodPerTick: foodYieldOf(localFarms, query.state.staffing),
      civicUpkeepPerTick: (effectiveByClass[BUILDING_CLASS.civic] ?? 0) * weights.civicUpkeep,
      staffing: query.state.staffing,
    },
  };
}

/**
 * Il catalizzatore a cui appartiene un landmark.
 *
 * L'ancora cliccata non coincide quasi mai con `record.x, record.y`: il record
 * conserva l'angolo minimo della ricetta, mentre il catalizzatore resta nella
 * colonna scelta dal giocatore. Ruolo e riquadro servono entrambi, perche' un
 * ingombro largo puo' contenere piu' catalizzatori di natura diversa.
 */
function catalystOf(state: SimState, record: BuildingRecord): Catalyst | null {
  const kind = record.landmark;
  if (kind === undefined) return null;
  const depth = footprintDepth(record);
  return state.catalysts.find((catalyst) =>
    catalystRoleOf(catalyst) === kind &&
    catalyst.x >= record.x && catalyst.x < record.x + record.footprint &&
    catalyst.y >= record.y && catalyst.y < record.y + depth) ?? null;
}

/**
 * Cio' che `skyline/` non puo' misurarsi da solo, raccolto qui.
 *
 * E' la stessa raccolta di `allowedLevel` in `buildings/hierarchy.ts`, e non la
 * si riusa perche' quella pretende un `BuildContext` che esiste solo dentro il
 * Builder e risponde un livello solo. Qui servono **due** risposte dalla stessa
 * query — la fascia e il tetto — e comporre la query una volta e' l'unico modo
 * perche' non possano riferirsi a due luoghi diversi.
 */
function skylineQuery(query: SelectionQuery, x: number, y: number): SkylineQuery {
  const block = query.streets.blockAt(x, y);
  return {
    x,
    y,
    // Come in `hierarchy.ts`: la portata geodetica, non i catalizzatori nudi.
    poles: query.state.reach.polesOf(query.state.catalysts),
    waterDistance: waterDistance(query.map, x, y, SKYLINE.coastNear),
    builtNeighbours: query.registry.countWithinRadius(x, y, SKYLINE.edgeRadius),
    seed: query.seed,
    blockKx: block.kx,
    blockKy: block.ky,
  };
}
