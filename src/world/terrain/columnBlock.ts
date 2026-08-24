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

  /**
   * Quota della superficie d'acqua per colonna: `TERRAIN.seaLevel` quasi
   * ovunque, quella del lago dentro una conca.
   *
   * E' un array e non una costante perche' l'acqua ha smesso di essere un piano
   * solo. Chi scrive la colonna non sa cosa sia un lago: legge questa quota e ci
   * riempie fino, esattamente come faceva con il livello del mare.
   */
  readonly waterTop: Int16Array;

  /**
   * Cosa spunta sopra la superficie della colonna: un valore di `COVER`.
   *
   * E' un array per colonna e non un elenco di record perche' una erbetta non e'
   * un oggetto — non ha un ingombro da tenere separato dai vicini e non puo'
   * collidere con niente. Un byte per colonna costa 1 kB per blocco e si scrive
   * dentro lo stesso ciclo che riempie la colonna.
   */
  readonly cover: Uint8Array;

  /** Alberi che possono intersecare il blocco, anche con origine appena fuori. */
  readonly decor: Int16Array;

  /**
   * Sporgenze che cadono nel blocco, anche se ancorate a un ciglio appena fuori.
   *
   * Stessa forma del decoro e per la stessa ragione: sono cose che stanno
   * **sopra** il terreno e non dentro la griglia delle colonne, quindi non
   * possono viaggiare come un valore per colonna.
   */
  readonly ledges: Int16Array;

  /**
   * Quota piu' alta che il blocco arriva a occupare: dice quanti chunk in z
   * servono davvero. Non e' solo il massimo di `heights` — ci entrano anche la
   * cima degli alberi e la superficie di un lago, che stanno sopra il terreno.
   */
  readonly maxHeight: number;

  /** Somma di `buildable`, gia' calcolata dove i dati sono ancora caldi. */
  readonly buildableCount: number;
}

/** I buffer del blocco, da passare come lista di transfer a `postMessage`. */
export function blockTransferables(block: ColumnBlock): Transferable[] {
  return [
    block.heights.buffer,
    block.biomes.buffer,
    block.slopes.buffer,
    block.buildable.buffer,
    block.water.buffer,
    block.waterTop.buffer,
    block.cover.buffer,
    block.decor.buffer,
    block.ledges.buffer,
  ];
}
