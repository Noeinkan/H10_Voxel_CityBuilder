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

/** Un ritaglio in pianta di uno stamp, con l'offset da cui parte. */
export interface StampSlice {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly stamp: VoxelStamp;
}

/**
 * Spezza uno stamp in ritagli larghi al massimo `maxSide` in pianta.
 *
 * **Serve al tetto di chunk sporchi, non alla memoria.** Un volume lungo
 * ventisei colonne attraversa piu' piani di chunk di una torre alta, e scriverlo
 * in un colpo solo li marca tutti nello stesso frame: e' il caso che il commento
 * di `maxDirtyChunksPerBuilding` racconta essere gia' andato storto una volta,
 * facendo sparire in silenzio proprio le strutture grandi. Spezzare in ritagli e
 * farli comparire uno per volta riporta il picco a quello di una struttura sola.
 *
 * Uno stamp che ci sta gia' **non viene copiato**: torna lui stesso, e il caso
 * comune — ogni edificio della citta' — non paga niente.
 *
 * Si taglia solo in pianta e mai in quota: una colonna spezzata a meta' altezza
 * comparirebbe in due tempi con una cucitura orizzontale in mezzo, che a schermo
 * si vede. In pianta la cucitura cade fra due colonne, dove non c'e' niente da
 * vedere.
 */
export function sliceStamps(stamp: VoxelStamp, maxSide: number): readonly StampSlice[] {
  if (stamp.sizeX <= maxSide && stamp.sizeY <= maxSide) {
    return [{ offsetX: 0, offsetY: 0, stamp }];
  }

  const out: StampSlice[] = [];
  for (let y0 = 0; y0 < stamp.sizeY; y0 += maxSide) {
    for (let x0 = 0; x0 < stamp.sizeX; x0 += maxSide) {
      const sizeX = Math.min(maxSide, stamp.sizeX - x0);
      const sizeY = Math.min(maxSide, stamp.sizeY - y0);
      out.push({ offsetX: x0, offsetY: y0, stamp: cutout(stamp, x0, y0, sizeX, sizeY) });
    }
  }
  return out;
}

/** Copia un riquadro dello stamp, su tutte le quote. */
function cutout(
  stamp: VoxelStamp,
  x0: number,
  y0: number,
  sizeX: number,
  sizeY: number,
): VoxelStamp {
  const voxels = new Uint8Array(sizeX * sizeY * stamp.sizeZ);
  const surfaces = new Uint8Array(voxels.length);

  for (let sz = 0; sz < stamp.sizeZ; sz++) {
    for (let sy = 0; sy < sizeY; sy++) {
      for (let sx = 0; sx < sizeX; sx++) {
        const from = (x0 + sx) + stamp.sizeX * ((y0 + sy) + stamp.sizeY * sz);
        const to = sx + sizeX * (sy + sizeY * sz);
        voxels[to] = stamp.voxels[from];
        surfaces[to] = stamp.surfaces[from];
      }
    }
  }

  return {
    sizeX,
    sizeY,
    sizeZ: stamp.sizeZ,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    // Le fasce del ritaglio sono quelle dell'intero: si taglia in pianta, e le
    // quote di inizio non si spostano.
    bandStarts: stamp.bandStarts,
  };
}

/** Voxel pieni dello stamp. Serve alle misure e ai test, non al percorso caldo. */
export function solidCount(stamp: VoxelStamp): number {
  let count = 0;
  for (let i = 0; i < stamp.voxels.length; i++) {
    if (stamp.voxels[i] !== STAMP_EMPTY) count++;
  }
  return count;
}
