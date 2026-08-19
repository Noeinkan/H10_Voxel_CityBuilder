import type { SurfaceKind } from '../visualBlock';

/**
 * Impronta voxel di un edificio: un array 3D compatto di indici di palette con
 * dimensioni proprie.
 *
 * E' il solo linguaggio in cui il generatore parla. Non conosce il `VoxelWorld`,
 * non conosce le coordinate di mondo e non sa a che quota finira': chi lo piazza
 * decide dove, e questo file non ha modo di scoprirlo. E' cio' che permette al
 * generatore di girare in un test senza mondo e senza terreno.
 *
 * **L'ancora e' un voxel 3D, non una cella.** `anchorX/Y/Z` identificano il
 * cubo dello stamp che coincide con l'ancora nel mondo. Non esiste quindi un
 * piano privilegiato nel formato: uno stamp puo' partire dal terreno, da un
 * tetto o da una faccia laterale senza cambiare rappresentazione.
 */

/** Indice di palette che significa "qui non c'e' niente". Coincide con `PALETTE_SLOTS.empty`. */
export const STAMP_EMPTY = 0;

/** Un cubo del mondo usato come origine di un volume, a qualunque quota. */
export interface VoxelAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VoxelStamp {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;

  /** Offset dell'ancora voxel dentro lo stamp. */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly anchorZ: number;

  /** Indici di palette, `sizeX * sizeY * sizeZ` valori. 0 = vuoto. */
  readonly voxels: Uint8Array;

  /** Grammatica visuale parallela a `voxels`; non cambia occupazione o collisioni. */
  readonly surfaces: Uint8Array;

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

/** Converte un voxel locale dello stamp nella posizione ancorata nel mondo. */
export function anchoredVoxel(
  anchor: VoxelAnchor,
  stamp: VoxelStamp,
  sx: number,
  sy: number,
  sz: number,
): VoxelAnchor {
  return {
    x: anchor.x + sx - stamp.anchorX,
    y: anchor.y + sy - stamp.anchorY,
    z: anchor.z + sz - stamp.anchorZ,
  };
}

/** Numero di fasce dello stamp. */
export function bandCount(stamp: VoxelStamp): number {
  return stamp.bandStarts.length - 1;
}

/** Tipo visuale tipizzato di una cella dello stamp. */
export function stampSurface(stamp: VoxelStamp, index: number): SurfaceKind {
  return stamp.surfaces[index] as SurfaceKind;
}

/** Voxel pieni dello stamp. Serve alle misure e ai test, non al percorso caldo. */
export function solidCount(stamp: VoxelStamp): number {
  let count = 0;
  for (let i = 0; i < stamp.voxels.length; i++) {
    if (stamp.voxels[i] !== STAMP_EMPTY) count++;
  }
  return count;
}
