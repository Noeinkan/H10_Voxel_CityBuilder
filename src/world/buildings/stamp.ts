/**
 * Impronta voxel di un edificio: un array 3D compatto di indici di palette con
 * dimensioni proprie.
 *
 * E' il solo linguaggio in cui il generatore parla. Non conosce il `VoxelWorld`,
 * non conosce le coordinate di mondo e non sa a che quota finira': chi lo piazza
 * decide dove, e questo file non ha modo di scoprirlo. E' cio' che permette al
 * generatore di girare in un test senza mondo e senza terreno.
 *
 * **L'ancora e' un voxel, non una cella.** `anchorX` e `anchorY` dicono quale
 * voxel dello stamp si appoggia sulla coordinata d'ancoraggio; `z = 0` e' la
 * base. Un edificio che cresce sopra un altro riceve la stessa impronta con una
 * base diversa, senza che il generatore ne sappia nulla.
 */

/** Indice di palette che significa "qui non c'e' niente". Coincide con `PALETTE_SLOTS.empty`. */
export const STAMP_EMPTY = 0;

export interface VoxelStamp {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;

  /** Offset dell'ancora dentro lo stamp, sul piano di terra. */
  readonly anchorX: number;
  readonly anchorY: number;

  /** Indici di palette, `sizeX * sizeY * sizeZ` valori. 0 = vuoto. */
  readonly voxels: Uint8Array;

  /**
   * Quota di inizio di ogni fascia, piu' un ultimo elemento pari a `sizeZ`.
   *
   * La comparsa animata scrive una fascia per frame, e senza questo indice
   * dovrebbe ricostruirlo scandendo i voxel a ogni passo. Lo tiene il
   * generatore, che le fasce le ha appena disegnate e sa dove finiscono.
   */
  readonly bandStarts: readonly number[];
}

/**
 * Indice lineare dentro lo stamp. `sx` varia piu' rapidamente.
 *
 * E' deliberatamente la stessa disposizione di `idx()` in `chunkCoords.ts`: chi
 * legge un ciclo di scrittura riconosce la forma senza doverla ricontrollare.
 */
export function stampIndex(stamp: VoxelStamp, sx: number, sy: number, sz: number): number {
  return sx + stamp.sizeX * (sy + stamp.sizeY * sz);
}

/** Numero di fasce dello stamp. */
export function bandCount(stamp: VoxelStamp): number {
  return stamp.bandStarts.length - 1;
}

/** Voxel pieni dello stamp. Serve alle misure e ai test, non al percorso caldo. */
export function solidCount(stamp: VoxelStamp): number {
  let count = 0;
  for (let i = 0; i < stamp.voxels.length; i++) {
    if (stamp.voxels[i] !== STAMP_EMPTY) count++;
  }
  return count;
}
