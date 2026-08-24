import { CHUNK } from '../chunkCoords';
import { classifyBiome } from './biomes';
import { TERRAIN } from './config';
import type { HeightField } from './heightField';
import { cellFloor, isCliff, terraceAt } from './terrace';

/**
 * Il reticolo di celle di un blocco: quota, bioma, pendenza e ciglio.
 *
 * E' il passaggio che stava dentro `IslandGenerator` finche' una cella sapeva
 * solo di se stessa. Da quando il terreno si terrazza non basta piu': per dire
 * se una cella e' un ciglio — e quanto scende, e da che parte — servono le
 * **quattro celle intorno**, e quelle di bordo stanno fuori dal blocco. Il
 * reticolo le porta tutte, e le porta calcolate esattamente come le calcolerebbe
 * il blocco che le possiede: e' la stessa funzione del campo, quindi due blocchi
 * confinanti non possono leggere lo stesso ciglio in due modi.
 *
 * **Margine di due celle**, non una: una serve al ciglio, la seconda alle
 * sporgenze, che si aggrappano a un ciglio appena fuori dal blocco e ricadono
 * dentro. Sono anche le celle da cui puo' arrivare un albero — `TREE_DECOR.ring`
 * vale quattro colonne, cioe' due celle — quindi il reticolo copre da solo tutto
 * quello che il generatore deve poter guardare.
 */

/** Celle di margine attorno al blocco, su ogni lato. */
export const CELL_MARGIN = 2;

/** Celle per lato di un blocco. */
export const CELLS_PER_BLOCK = CHUNK / TERRAIN.cellSize;

/** Lato del reticolo, margine compreso. */
export const GRID_SIDE = CELLS_PER_BLOCK + CELL_MARGIN * 2;

/**
 * Colonne di margine del reticolo di quote continue.
 *
 * Le celle di margine, piu' una colonna: la pendenza di una cella guarda i
 * vicini immediati di ogni sua colonna, anche quelli della cella piu' esterna.
 */
export const HEIGHT_BORDER = CELL_MARGIN * TERRAIN.cellSize + 1;

/** Lato del reticolo di quote continue. */
const PADDED = CHUNK + HEIGHT_BORDER * 2;

/** Colonna paddata da cui parte la cella `0` del reticolo. */
const FIRST_COLUMN = HEIGHT_BORDER - CELL_MARGIN * TERRAIN.cellSize;

/** I quattro vicini ortogonali, nell'ordine in cui `dropDir` li indicizza. */
export const CELL_STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Reticolo di un blocco. Gli array sono di lavoro e vengono riusati dal blocco
 * successivo: chi ne ha bisogno oltre la chiamata se li copia.
 */
export interface CellGrid {
  /** Indice globale di cella della colonna `0` del reticolo. */
  readonly originCellX: number;
  readonly originCellY: number;
  /** Quota su cui la cella si posa, gia' terrazzata. */
  readonly heights: Int16Array;
  readonly slopes: Float32Array;
  /**
   * Bioma **prima** del ciglio.
   *
   * Il ciglio cambia la tinta della cella, non la sua vocazione: la flora si
   * decide su questo, cioe' sul terreno che c'e' sotto la roccia che affiora, e
   * non sulla roccia. E' anche cio' che tiene gli alberi indipendenti dal
   * blocco che li valuta — il ciglio esiste solo dove il margine basta a
   * calcolarlo, la classificazione ovunque.
   */
  readonly biomes: Uint8Array;
  readonly waterTop: Int16Array;
  /** Dislivello verso il vicino piu' basso; 0 sull'anello piu' esterno. */
  readonly drops: Int16Array;
  /** Indice in `CELL_STEPS` del vicino piu' basso, -1 se non c'e' salto. */
  readonly dropDirs: Int8Array;
}

const paddedHeights = new Float32Array(PADDED * PADDED);

/** La stessa struttura, scrivibile: e' il buffer di lavoro dietro `CellGrid`. */
interface MutableCellGrid {
  originCellX: number;
  originCellY: number;
  readonly heights: Int16Array;
  readonly slopes: Float32Array;
  readonly biomes: Uint8Array;
  readonly waterTop: Int16Array;
  readonly drops: Int16Array;
  readonly dropDirs: Int8Array;
}

const grid: MutableCellGrid = {
  originCellX: 0,
  originCellY: 0,
  heights: new Int16Array(GRID_SIDE * GRID_SIDE),
  slopes: new Float32Array(GRID_SIDE * GRID_SIDE),
  biomes: new Uint8Array(GRID_SIDE * GRID_SIDE),
  waterTop: new Int16Array(GRID_SIDE * GRID_SIDE),
  drops: new Int16Array(GRID_SIDE * GRID_SIDE),
  dropDirs: new Int8Array(GRID_SIDE * GRID_SIDE),
};

/** Indice nel reticolo di una cella locale, con l'origine del blocco a `(0, 0)`. */
export function gridIndex(cellX: number, cellY: number): number {
  return (cellX + CELL_MARGIN) + GRID_SIDE * (cellY + CELL_MARGIN);
}

/** true se la cella locale cade dentro il reticolo, margine compreso. */
export function inGrid(cellX: number, cellY: number): boolean {
  return cellX >= -CELL_MARGIN && cellX < CELLS_PER_BLOCK + CELL_MARGIN
    && cellY >= -CELL_MARGIN && cellY < CELLS_PER_BLOCK + CELL_MARGIN;
}

/** Costruisce il reticolo del blocco che parte da `(baseX, baseY)`. */
export function buildCellGrid(field: HeightField, baseX: number, baseY: number): CellGrid {
  for (let py = 0; py < PADDED; py++) {
    const worldY = baseY + py - HEIGHT_BORDER;
    const row = py * PADDED;
    for (let px = 0; px < PADDED; px++) {
      paddedHeights[row + px] = field.heightAt(baseX + px - HEIGHT_BORDER, worldY);
    }
  }

  for (let gy = 0; gy < GRID_SIDE; gy++) {
    for (let gx = 0; gx < GRID_SIDE; gx++) {
      const worldX = baseX + (gx - CELL_MARGIN) * TERRAIN.cellSize;
      const worldY = baseY + (gy - CELL_MARGIN) * TERRAIN.cellSize;
      // La quota d'acqua arriva prima del bioma: dentro una conca e' quella del
      // lago, e "sommerso" si decide rispetto a quella, non al livello del mare.
      const level = field.waterLevelAt(worldX, worldY);
      const raw = sampleCell(
        gx * TERRAIN.cellSize + FIRST_COLUMN,
        gy * TERRAIN.cellSize + FIRST_COLUMN,
      );
      // Dentro la conca di un lago la scala fine: il fondo, la sponda e il pelo
      // stanno dentro sei voxel, e un'alzata da otto se li porterebbe via. Li'
      // non si scuote nemmeno la quota — una vasca ha il bordo che ha.
      const height = clampHeight(
        field.inBasinAt(worldX, worldY)
          ? cellFloor(raw.height)
          : terraceAt(
              field.seed,
              baseX / TERRAIN.cellSize + gx - CELL_MARGIN,
              baseY / TERRAIN.cellSize + gy - CELL_MARGIN,
              raw.height,
            ),
      );

      const i = gy * GRID_SIDE + gx;
      grid.heights[i] = height;
      grid.slopes[i] = raw.slope;
      grid.waterTop[i] = level;
      grid.biomes[i] = classifyBiome(height, raw.slope, level);
    }
  }

  // Il salto ha bisogno dei quattro vicini, quindi l'anello piu' esterno resta a
  // zero: nessuno lo interroga, perche' e' li' solo per farsi guardare.
  for (let gy = 1; gy < GRID_SIDE - 1; gy++) {
    for (let gx = 1; gx < GRID_SIDE - 1; gx++) {
      const i = gy * GRID_SIDE + gx;
      const here = grid.heights[i];
      let drop = 0;
      let dir = -1;
      for (let step = 0; step < CELL_STEPS.length; step++) {
        const [dx, dy] = CELL_STEPS[step];
        const fall = here - grid.heights[i + dy * GRID_SIDE + dx];
        if (fall > drop) {
          drop = fall;
          dir = step;
        }
      }
      grid.drops[i] = drop;
      grid.dropDirs[i] = dir;
    }
  }

  grid.originCellX = baseX / TERRAIN.cellSize - CELL_MARGIN;
  grid.originCellY = baseY / TERRAIN.cellSize - CELL_MARGIN;
  return grid;
}

/** true se la cella locale e' il ciglio di un gradone. */
export function cellIsCliff(cells: CellGrid, cellX: number, cellY: number): boolean {
  return isCliff(cells.drops[gridIndex(cellX, cellY)]);
}

/** Quota, bioma e pendenza di una cella di terreno. */
interface CellSample {
  readonly height: number;
  readonly slope: number;
}

/**
 * Riassume una cella di terreno a partire dal suo angolo nel reticolo paddato.
 *
 * **Media e non campione d'angolo.** Prendere il valore di una sola colonna
 * ancorerebbe la cella a uno spigolo, e la quantizzazione trasformerebbe quel
 * mezzo voxel di scarto in un gradino intero: la media dei campioni della cella
 * centra il valore e toglie l'aliasing dal profilo della costa.
 *
 * **Pendenza media e non massima.** E' la stessa grandezza di prima — voxel di
 * dislivello per voxel — quindi tutte le soglie di `TERRAIN` valgono immutate.
 * Il massimo sui quattro angoli sarebbe stato un'altra grandezza: avrebbe
 * dichiarato ripida ogni cella che ne sfiora una, e mangiato l'edificabile.
 *
 * La pendenza resta quella del **campo continuo** anche adesso che le quote
 * saltano: e' la ripidita' del versante, non l'altezza dell'alzata, e sono due
 * grandezze diverse. Chi vuole la seconda chiede il ciglio.
 */
function sampleCell(px: number, py: number): CellSample {
  let heightSum = 0;
  let slopeSum = 0;

  for (let dy = 0; dy < TERRAIN.cellSize; dy++) {
    for (let dx = 0; dx < TERRAIN.cellSize; dx++) {
      const p = (py + dy) * PADDED + (px + dx);
      const continuous = paddedHeights[p];
      heightSum += continuous;

      // Pendenza sul campo continuo, non sulle altezze quantizzate: quantizzare
      // prima schiaccerebbe tutto su pochi valori e i biomi non avrebbero piu'
      // nulla da cui distinguersi. L'anello paddato ricampiona le stesse
      // coordinate mondo dei blocchi vicini, quindi il valore non dipende da
      // quale blocco lo calcola.
      slopeSum += Math.max(
        Math.abs(paddedHeights[p + 1] - continuous),
        Math.abs(paddedHeights[p - 1] - continuous),
        Math.abs(paddedHeights[p + PADDED] - continuous),
        Math.abs(paddedHeights[p - PADDED] - continuous),
      );
    }
  }

  const columns = TERRAIN.cellSize * TERRAIN.cellSize;
  return { height: heightSum / columns, slope: slopeSum / columns };
}

function clampHeight(value: number): number {
  if (value < 0) return 0;
  if (value > TERRAIN.maxHeight) return TERRAIN.maxHeight;
  return value;
}
