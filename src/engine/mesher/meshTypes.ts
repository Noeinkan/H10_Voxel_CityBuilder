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
  /** Fetta 34x34x`SKY_PROBE` sopra il volume paddato, per il cielo. Trasferita. */
  readonly ceiling: Uint8Array;
}

/** Unita' intere usate dalla mesh per rappresentare un voxel senza float. */
export const MESH_UNITS_PER_VOXEL = 16;

/** Geometria grezza prodotta dal mesher, in coordinate locali di chunk. */
export interface MeshArrays {
  /** 3 componenti per vertice, in unita' di 1/16 di voxel; ammette sporgenze dal chunk. */
  readonly positions: Int16Array;
  /** 1 componente per vertice: direzione di faccia 0..5 (FACE_* di chunkCoords). */
  readonly faces: Uint8Array;
  /** 1 componente per vertice: indice di palette 1..31. */
  readonly palettes: Uint8Array;
  /** 1 componente per vertice: grammatica visuale 0..7. */
  readonly surfaces: Uint8Array;
  /**
   * 1 componente per vertice, due campi geometrici impacchettati in un byte:
   * bit 0-1 occlusione ambientale 0..3 (3 = libero), bit 2-3 visibilita' del
   * cielo 0..3 (3 = scoperto). Vedi `SHADE_*` in `greedyMesher`.
   *
   * Stanno insieme perche' sono la stessa cosa a due raggi — quanto e' chiuso
   * l'angolo qui, quanto e' chiuso il cielo la' sopra — e perche' un secondo
   * attributo sarebbe un secondo buffer per vertice, cioe' geometria piu'
   * grossa a parita' di informazione.
   */
  readonly shade: Uint8Array;
  /** 6 indici per quad. */
  readonly indices: Uint32Array;
  /** Quad aggiunti dopo il greedy pass; `quadCount` resta il totale renderizzato. */
  readonly detailQuadCount: number;
  readonly quadCount: number;
  /** AABB effettiva della geometria in coordinate locali, per il culling. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Risposta del worker: geometria piu' misure e buffer da riciclare. */
export interface MeshResult extends MeshArrays {
  readonly jobId: number;
  readonly key: string;
  /** Tempo speso dal meshing completo, microgeometria inclusa, in millisecondi. */
  readonly meshMs: number;
  /** I buffer di input, restituiti al chiamante per essere riusati. */
  readonly padded: Uint8Array;
  readonly ceiling: Uint8Array;
}
