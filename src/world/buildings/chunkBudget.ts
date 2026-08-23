import { CHUNK, keyOf, toChunk, toLocal } from '../chunkCoords';
import { BUILDER } from './config';
import { sliceStamps, type VoxelStamp } from './stamp';
import type { GradePlan } from '../grading/grade';

/**
 * Quanto costa in rimeshing un volume che sta per essere scritto.
 *
 * **E' aritmetica di chunk e nient'altro**: non guarda il mondo, non guarda il
 * registry e non sa cosa sia un edificio. Viveva come metodo privato del
 * `Builder` senza usare `this` in una sola riga, e da li' nessuno poteva
 * verificarla se non facendo crescere una citta' intera.
 */

/**
 * Chunk che l'edificio marcherebbe sporchi, fondazione inclusa.
 *
 * Conta anche i vicini che una scrittura su cella di bordo costringe a
 * rimeshare, e li conta **senza chiedersi se esistono gia'**: un tetto che
 * vale solo finche' il chunk accanto non e' stato allocato non e' un tetto. La
 * stima e' quindi per eccesso, e qualche sito perfettamente buono viene
 * scartato come `chunkBudget` — sono le posizioni a cavallo di due cuciture,
 * meno dell'uno per cento della mappa.
 */
export function dirtyChunkCount(
  x: number,
  y: number,
  footprint: number,
  minZ: number,
  maxZ: number,
  footprintY: number = footprint,
): number {
  const keys = new Set<string>();

  const cx0 = toChunk(x);
  const cx1 = toChunk(x + footprint - 1);
  const cy0 = toChunk(y);
  const cy1 = toChunk(y + footprintY - 1);
  const cz0 = toChunk(minZ);
  const cz1 = toChunk(maxZ - 1);

  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) keys.add(keyOf(cx, cy, cz));
    }
  }

  // Un vicino si aggiunge una volta per ogni combinazione delle altre due
  // coordinate di chunk: la faccia intera va rimeshata, non una cella.
  for (const cx of edgeChunks(x, x + footprint - 1)) {
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cy = cy0; cy <= cy1; cy++) keys.add(keyOf(cx, cy, cz));
    }
  }
  for (const cy of edgeChunks(y, y + footprintY - 1)) {
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) keys.add(keyOf(cx, cy, cz));
    }
  }
  for (const cz of edgeChunks(minZ, maxZ - 1)) {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) keys.add(keyOf(cx, cy, cz));
    }
  }

  return keys.size;
}

/**
 * true se una struttura sta nel tetto di chunk sporchi, fondazione compresa.
 *
 * **Si misura il singolo colpo di scrittura, non il volume totale.** Da quando
 * i ritagli esistono, una struttura lunga non compare piu' tutta insieme: il
 * tetto vale per la fondazione, che si getta in un colpo, e per ogni ritaglio,
 * che compare per conto suo. Misurare l'ingombro intero direbbe di no proprio
 * alle strutture per cui i ritagli sono stati fatti — ed e' il motivo per cui
 * la 4.12 aveva dovuto alzare il tetto invece di rispettarlo.
 */
export function fitsChunkBudget(
  x: number,
  y: number,
  sizeX: number,
  sizeY: number,
  plan: GradePlan,
  stamp: VoxelStamp,
): boolean {
  const cap = BUILDER.maxDirtyChunksPerBuilding;
  if (dirtyChunkCount(x, y, sizeX, plan.footZ, plan.padZ, sizeY) > cap) return false;

  for (const slice of sliceStamps(stamp, BUILDER.segmentSide)) {
    const count = dirtyChunkCount(
      x + slice.offsetX,
      y + slice.offsetY,
      slice.stamp.sizeX,
      plan.padZ,
      plan.padZ + slice.stamp.sizeZ,
      slice.stamp.sizeY,
    );
    if (count > cap) return false;
  }
  return true;
}

/**
 * Coordinate di chunk dei vicini che una scrittura su `[min, max]` marcherebbe.
 *
 * Sono al massimo due — uno sotto e uno sopra — perche' l'intervallo e' corto e
 * le celle di bordo di un chunk distano 32.
 */
function edgeChunks(min: number, max: number): readonly number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v++) {
    if (toLocal(v) === 0) out.push(toChunk(v) - 1);
    else if (toLocal(v) === CHUNK - 1) out.push(toChunk(v) + 1);
  }
  return out;
}
