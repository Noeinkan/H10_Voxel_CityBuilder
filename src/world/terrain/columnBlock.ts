import { CHUNK, CHUNK_MASK, CHUNK_SHIFT } from '../chunkCoords';

/**
 * Unita' di trasporto della generazione: una colonna di chunk 32x32 di dati per
 * colonna, in array tipizzati trasferibili.
 *
 * E' la stessa granularita' della mappa sparsa del mondo, cosi' il worker puo'
 * consegnare un blocco alla volta e il main thread puo' cominciare a scrivere
 * voxel — e quindi a meshare — molto prima che l'isola sia completa.
 */

/** Colonne in un blocco: 32 x 32. */
export const COLUMNS_PER_CHUNK = CHUNK * CHUNK;

/** Campi per record decor: lx, ly, specie, altezza tronco, quota suolo. */
export const DECOR_RECORD_SIZE = 5;

/** Indice lineare di una colonna nel blocco. `lx` varia piu' rapidamente. */
export function columnIndex(lx: number, ly: number): number {
  return lx + CHUNK * ly;
}

/** Coordinata locale x da indice di colonna. */
export function columnLocalX(index: number): number {
  return index & CHUNK_MASK;
}

/** Coordinata locale y da indice di colonna. */
export function columnLocalY(index: number): number {
  return index >> CHUNK_SHIFT;
}

export interface ColumnBlock {
  /** Colonna di chunk: `ccx * 32` e' la x mondo del primo voxel. */
  readonly ccx: number;
  readonly ccy: number;

  /** Altezza intera per colonna: numero di voxel pieni, da `z = 0`. */
  readonly heights: Int16Array;

  /** Indice di bioma per colonna. */
  readonly biomes: Uint8Array;

  /** Pendenza per colonna, in voxel per voxel. */
  readonly slopes: Float32Array;

  /** 1 se edificabile, 0 altrimenti. */
  readonly buildable: Uint8Array;

  /**
   * Classe d'acqua per colonna (`WATER_CLASS`), significativa solo dove la
   * colonna e' sommersa. Si decide qui perche' e' qui che la profondita' e le
   * sponde sono ancora note: al frammento arriverebbe solo una lastra piatta.
   */
  readonly water: Uint8Array;

  /** Alberi che possono intersecare il blocco, anche con origine appena fuori. */
  readonly decor: Int16Array;

  /** Massimo di `heights` nel blocco: dice quanti chunk in z servono davvero. */
  readonly maxHeight: number;

  /** Somma di `buildable`, gia' calcolata dove i dati sono ancora caldi. */
  readonly buildableCount: number;
}

/** I sei buffer del blocco, da passare come lista di transfer a `postMessage`. */
export function blockTransferables(block: ColumnBlock): Transferable[] {
  return [
    block.heights.buffer,
    block.biomes.buffer,
    block.slopes.buffer,
    block.buildable.buffer,
    block.water.buffer,
    block.decor.buffer,
  ];
}
