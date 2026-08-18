/**
 * Protocollo tra main thread e worker di meshing.
 *
 * Questo modulo, come tutto src/engine/mesher, non importa nulla da Three.js:
 * il mesher produce array grezzi e non sa che esiste una scena.
 */

/** Richiesta di rebuild di un singolo chunk. */
export interface MeshJob {
  readonly jobId: number;
  readonly key: string;
  /** Volume paddato 34^3: chunk piu' tutti i 26 vicini immediati. Trasferito. */
  readonly padded: Uint8Array;
}

/** Geometria grezza prodotta dal mesher, in coordinate locali di chunk (0..32). */
export interface MeshArrays {
  /** 3 componenti per vertice, valori 0..32. */
  readonly positions: Uint16Array;
  /** 1 componente per vertice: direzione di faccia 0..5 (FACE_* di chunkCoords). */
  readonly faces: Uint8Array;
  /** 1 componente per vertice: indice di palette 1..31. */
  readonly palettes: Uint8Array;
  /** 1 componente per vertice: occlusione ambientale 0..3 (3 = libero). */
  readonly ao: Uint8Array;
  /** 6 indici per quad. */
  readonly indices: Uint32Array;
  readonly quadCount: number;
  /** AABB effettiva della geometria in coordinate locali, per il culling. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Risposta del worker: geometria piu' misure e buffer da riciclare. */
export interface MeshResult extends MeshArrays {
  readonly jobId: number;
  readonly key: string;
  /** Tempo speso dal solo greedy meshing, in millisecondi. */
  readonly meshMs: number;
  /** Il buffer di input, restituito al chiamante per essere riusato. */
  readonly padded: Uint8Array;
}
