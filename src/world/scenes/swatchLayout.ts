import { PALETTE_SIZE, PALETTE_SLOT_NAMES } from '../../engine/paletteSlots';
import { BIOME_NAMES, TERRAIN } from '../terrain/config';
import { TREE_SHAPES } from '../terrain/flora';
import { SURFACE_KIND_NAMES, WATER_CLASS } from '../visualBlock';

/**
 * Dove sta ogni cosa nel campionario dei voxel, e con quali numeri.
 *
 * **Puro e senza mondo**, come `inspect.ts` lo e' rispetto a `InspectView.ts`:
 * qui c'e' la geometria, in `swatchScene.ts` c'e' chi la scrive. Sono separati
 * perche' questa meta' ha tre consumatori diversi — il generatore, l'inquadratura
 * di `main.ts` e il referto sotto il cursore — e due letture della stessa griglia
 * divergerebbero al primo ritocco.
 *
 * **Le dimensioni si ricavano dalle tabelle, mai da un letterale.** Le colonne
 * sono `PALETTE_SIZE` e le righe sono quante ne ha `SURFACE_KIND`: uno slot o un
 * linguaggio nuovo allarga la griglia da se' invece di restare fuori dal
 * campionario, che e' esattamente il difetto che questa scena esiste per
 * rendere impossibile.
 */

/** Rettangolo in pianta, estremo massimo escluso. */
export interface SwatchRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const SWATCH_BAND = {
  matrix: 'matrix',
  strata: 'strata',
  scale: 'scale',
} as const;

export type SwatchBand = (typeof SWATCH_BAND)[keyof typeof SWATCH_BAND];

export const SWATCH = {
  /** Prima quota scritta dai soggetti; sotto c'e' il basamento. */
  groundZ: 2,

  /** Slot del basamento: neutro, e `plain` perche' non deve emettere dettaglio. */
  plinthSlot: 4,

  // --- Matrice palette x superficie -----------------------------------------

  /**
   * Lato e altezza di una cella della matrice.
   *
   * Non sono un cubo per estetica: la microgeometria emette solo dove il volume
   * glielo racconta, e ogni emettitore di `microGeometry.ts` chiede una cosa
   * diversa. `emitHabitat` vuole la sommita' di una corsa di facciata,
   * `emitLuminous` i montanti **e** i traversi sopra e sotto, `emitPortals` un
   * architrave con aria davanti un piano piu' in su, `emitRoofTech` un tetto
   * esposto che confina con l'aria di fianco, `emitFacadeClass` i due bordi
   * verticali della corsa. Un prisma isolato di lato quattro e alto sei, con
   * aria attorno, li soddisfa tutti insieme — e sotto quei numeri qualche riga
   * smetterebbe di mostrare qualcosa senza che niente segnali il perche'.
   */
  cellSide: 4,
  cellHeight: 6,

  /** Interasse fra due celle: il vuoto che resta e' l'aria che serve ai prismi. */
  cellPitch: 6,

  /** Distacco fra una fascia e la successiva, lungo +y. */
  bandGap: 10,

  // --- Stratigrafia ---------------------------------------------------------

  pillarSide: 4,
  pillarPitch: 6,

  /**
   * Altezza di un pilastro di stratigrafia, multipla di `TERRAIN.cellSize`.
   *
   * Deve superare `STRATA_DEPTH.subsoil` — superficie piu' sottosuolo — o il
   * fondo non comparirebbe e il taglio mostrerebbe due strati invece di tre.
   */
  pillarHeight: 16,

  /** Quota del fondale nei pilastri d'acqua: sopra c'e' solo acqua. */
  waterFloor: 6,

  /** Distacco fra i sei biomi e i tre specchi d'acqua. */
  waterGap: 6,

  // --- Fascia di scala ------------------------------------------------------

  /** Distacco fra i tre soggetti della fascia di scala. */
  scaleGap: 8,

  /** Interasse fra due alberi: `TREE_DECOR.cellSize`, cioe' il loro passo vero. */
  treePitch: 12,

  /** Gradini di cella di terreno accanto al cubo singolo. */
  stairSteps: 3,

  /**
   * L'edificio di riferimento.
   *
   * Livello quattro e tipologia forzata per id, perche' senza citta' intorno
   * `selectTypology` puo' solo ripiegare e il ripiego cambierebbe insieme al
   * catalogo. Misurato, lo stamp e' 8 x 8 x 30: sta dentro la riserva qui sotto,
   * e il test lo verifica invece di fidarsi.
   */
  referenceTypology: 'terracedHousing',
  referenceLevel: 4,
  referenceSpan: 12,
  referenceHeight: 36,
} as const;

/** Colonne della matrice: uno slot di palette ciascuna, `empty` compreso. */
export const SWATCH_COLUMNS = PALETTE_SIZE;

/** Righe della matrice: un linguaggio di superficie ciascuna. */
export const SWATCH_ROWS = SURFACE_KIND_NAMES.length;

/** Gli slot che il fragment riconosce come acqua **prima** di leggere i tre bit. */
const WATER_SLOTS: readonly number[] = [24, 25];

/** I tre specchi, in ordine di pilastro. Sono `WATER_CLASS`, non un ottavo tipo. */
export const SWATCH_WATERS: readonly { readonly name: string; readonly kind: number }[] = [
  { name: 'open', kind: WATER_CLASS.open },
  { name: 'shallow', kind: WATER_CLASS.shallow },
  { name: 'canal', kind: WATER_CLASS.canal },
];

/** Lato coperto dalla matrice in pianta: l'ultima cella non porta l'interasse. */
function bandSpan(count: number, side: number, pitch: number): number {
  return count <= 0 ? 0 : (count - 1) * pitch + side;
}

const MATRIX_WIDTH = bandSpan(SWATCH_COLUMNS, SWATCH.cellSide, SWATCH.cellPitch);
const MATRIX_DEPTH = bandSpan(SWATCH_ROWS, SWATCH.cellSide, SWATCH.cellPitch);

const BIOME_WIDTH = bandSpan(BIOME_NAMES.length, SWATCH.pillarSide, SWATCH.pillarPitch);
const WATER_WIDTH = bandSpan(SWATCH_WATERS.length, SWATCH.pillarSide, SWATCH.pillarPitch);
const STRATA_WIDTH = BIOME_WIDTH + SWATCH.waterGap + WATER_WIDTH;

/** Origine in y di ogni fascia. Si susseguono lungo +y a partire da zero. */
const MATRIX_Y = 0;
const STRATA_Y = MATRIX_Y + MATRIX_DEPTH + SWATCH.bandGap;
const SCALE_Y = STRATA_Y + SWATCH.pillarSide + SWATCH.bandGap;

/** Un soggetto della fascia di scala, con il posto che si prende. */
export interface ScaleItem {
  readonly kind: 'cells' | 'tree' | 'building';
  readonly label: string;
  /** Indice in `TREE_SHAPES`, solo per gli alberi. */
  readonly species: number;
  readonly x0: number;
  readonly width: number;
  readonly depth: number;
}

/**
 * I soggetti della fascia di scala, da sinistra a destra.
 *
 * Il catalogo degli alberi si percorre per intero: una specie aggiunta a
 * `TREE_SHAPES` compare qui senza che nessuno se ne ricordi.
 */
function planScaleItems(): readonly ScaleItem[] {
  const items: ScaleItem[] = [];
  const cell = TERRAIN.cellSize;
  let x = 0;

  // La cella di terreno e la sua scaletta: e' il metro con cui si misura tutto
  // il resto, e la scaletta e' quel che rende visibile la quantizzazione.
  const cellsWidth = cell + SWATCH.scaleGap + SWATCH.stairSteps * cell;
  items.push({ kind: 'cells', label: 'terrain cell', species: -1, x0: x, width: cellsWidth, depth: cell });
  x += cellsWidth + SWATCH.scaleGap;

  for (let species = 0; species < TREE_SHAPES.length; species++) {
    items.push({
      kind: 'tree',
      label: `tree ${species}`,
      species,
      x0: x,
      width: SWATCH.treePitch,
      depth: SWATCH.treePitch,
    });
    x += SWATCH.treePitch;
  }

  x += SWATCH.scaleGap;
  items.push({
    kind: 'building',
    label: SWATCH.referenceTypology,
    species: -1,
    x0: x,
    width: SWATCH.referenceSpan,
    depth: SWATCH.referenceSpan,
  });

  return items;
}

export const SCALE_ITEMS: readonly ScaleItem[] = planScaleItems();

const SCALE_WIDTH = SCALE_ITEMS.reduce((widest, item) => Math.max(widest, item.x0 + item.width), 0);
const SCALE_DEPTH = SCALE_ITEMS.reduce((deepest, item) => Math.max(deepest, item.depth), 0);

/** Estensione dell'intero campionario, basamento compreso. */
export interface SwatchExtent {
  readonly minX: number;
  readonly minY: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

/**
 * Quanto spazio prende il campionario.
 *
 * La consuma `main.ts` per inquadrarlo **senza istanziare il generatore**: qui
 * ogni ingombro e' dichiarato, mentre il diorama deve comporre lo stamp per
 * sapere quanto e' alto il proprio soggetto.
 */
export function swatchExtent(): SwatchExtent {
  return {
    minX: 0,
    minY: 0,
    sizeX: Math.max(MATRIX_WIDTH, STRATA_WIDTH, SCALE_WIDTH),
    sizeY: SCALE_Y + SCALE_DEPTH,
    sizeZ: SWATCH.groundZ + Math.max(
      SWATCH.cellHeight,
      SWATCH.pillarHeight,
      SWATCH.referenceHeight,
    ),
  };
}

/** Riquadro della cella `(row, col)` della matrice. */
export function matrixCellRect(row: number, col: number): SwatchRect {
  const x0 = col * SWATCH.cellPitch;
  const y0 = MATRIX_Y + row * SWATCH.cellPitch;
  return { x0, y0, x1: x0 + SWATCH.cellSide, y1: y0 + SWATCH.cellSide };
}

/**
 * Riquadro del pilastro `index`: prima i sei biomi, poi i tre specchi d'acqua.
 */
export function strataPillarRect(index: number): SwatchRect {
  const biomes = BIOME_NAMES.length;
  const slot = index < biomes ? index : index - biomes;
  const offset = index < biomes ? 0 : BIOME_WIDTH + SWATCH.waterGap;
  const x0 = offset + slot * SWATCH.pillarPitch;
  return { x0, y0: STRATA_Y, x1: x0 + SWATCH.pillarSide, y1: STRATA_Y + SWATCH.pillarSide };
}

/** Quanti pilastri ha la fascia della stratigrafia: biomi piu' specchi d'acqua. */
export const SWATCH_PILLARS = BIOME_NAMES.length + SWATCH_WATERS.length;

/** Origine in y della fascia di scala; i soggetti ci si appoggiano sopra. */
export const SCALE_ORIGIN_Y = SCALE_Y;

/** Cosa si sta guardando: e' il referto che l'overlay scrive sotto il cursore. */
export interface SwatchCell {
  readonly band: SwatchBand;
  /** Riga della matrice, o `-1` fuori da lei. */
  readonly row: number;
  /** Colonna della matrice, o `-1` fuori da lei. */
  readonly col: number;
  readonly label: string;
  /** Seconda riga del referto: dice quando la cella non significa quel che sembra. */
  readonly note: string | null;
}

/**
 * Cosa c'e' alla colonna `(x, y)` del campionario.
 *
 * **In-world non ci sono etichette**, e la sola convenzione d'ordine si
 * dimentica: e' la stessa richiesta a cui risponde `InspectOverlay`. Il vuoto
 * fra due celle appartiene alla cella che lo precede, cosi' il referto non
 * sfarfalla mentre il cursore attraversa la griglia.
 */
export function swatchCellAt(x: number, y: number): SwatchCell | null {
  const extent = swatchExtent();
  if (x < extent.minX || y < extent.minY) return null;
  if (x >= extent.minX + extent.sizeX || y >= extent.minY + extent.sizeY) return null;

  if (y < MATRIX_Y + MATRIX_DEPTH) return matrixCellAt(x, y);
  if (y < STRATA_Y) return null;
  if (y < STRATA_Y + SWATCH.pillarSide) return pillarAt(x);
  if (y < SCALE_Y) return null;
  return scaleItemAt(x);
}

function matrixCellAt(x: number, y: number): SwatchCell | null {
  const col = Math.floor(x / SWATCH.cellPitch);
  const row = Math.floor((y - MATRIX_Y) / SWATCH.cellPitch);
  if (col < 0 || col >= SWATCH_COLUMNS || row < 0 || row >= SWATCH_ROWS) return null;

  const slot = PALETTE_SLOT_NAMES[col];
  const surface = SURFACE_KIND_NAMES[row];
  return {
    band: SWATCH_BAND.matrix,
    row,
    col,
    label: `${slot} ${col} · ${surface} ${row}`,
    note: matrixNote(col, row),
  };
}

/**
 * L'unico posto in cui la matrice non dice quel che sembra.
 *
 * Sugli slot d'acqua i tre bit alti portano `WATER_CLASS` e non un linguaggio di
 * facciata — il fragment riconosce l'acqua dalla palette **prima** di leggerli
 * (contratto 5). Senza questa riga si finirebbe per attribuire alla superficie
 * quello che sta facendo lo specchio.
 */
function matrixNote(col: number, row: number): string | null {
  if (col === 0) return 'slot 0 e\' il vuoto: nessun voxel da scrivere';
  if (!WATER_SLOTS.includes(col)) return null;
  const water = SWATCH_WATERS.find((candidate) => candidate.kind === row);
  return water === undefined
    ? 'acqua: i tre bit portano WATER_CLASS, non la facciata'
    : `acqua: qui i tre bit dicono «${water.name}», non la facciata`;
}

function pillarAt(x: number): SwatchCell | null {
  for (let index = 0; index < SWATCH_PILLARS; index++) {
    const rect = strataPillarRect(index);
    if (x < rect.x0 || x >= rect.x0 + SWATCH.pillarPitch) continue;
    const biomes = BIOME_NAMES.length;
    const label = index < biomes
      ? `${BIOME_NAMES[index]} · superficie / sottosuolo / fondo`
      : `water ${SWATCH_WATERS[index - biomes].name}`;
    return {
      band: SWATCH_BAND.strata,
      row: -1,
      col: -1,
      label,
      note: index < biomes
        ? `ogni strato e\' alto un multiplo di ${TERRAIN.cellSize} voxel`
        : 'la classe viaggia nei tre bit del voxel d\'acqua',
    };
  }
  return null;
}

function scaleItemAt(x: number): SwatchCell | null {
  for (const item of SCALE_ITEMS) {
    if (x < item.x0 || x >= item.x0 + item.width) continue;
    return {
      band: SWATCH_BAND.scale,
      row: -1,
      col: -1,
      label: item.label,
      note: item.kind === 'cells'
        ? `il cubo di terreno e\' ${TERRAIN.cellSize} voxel: il contenuto no`
        : null,
    };
  }
  return null;
}
