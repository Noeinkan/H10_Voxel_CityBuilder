/**
 * Convenzioni di coordinate usate in tutto il progetto.
 *
 * Mondo Z-up: x = est, y = nord, z = altezza. Il piano di terra e' (x, y).
 * Un voxel = una cella edificabile.
 */

/** Lato del chunk in voxel. */
export const CHUNK = 32;

/** Shift equivalente a `/ CHUNK` per interi (CHUNK === 1 << CHUNK_SHIFT). */
export const CHUNK_SHIFT = 5;

/** Maschera equivalente a `% CHUNK` per interi. */
export const CHUNK_MASK = CHUNK - 1;

/** Celle di un piano orizzontale del chunk, cioe' il passo fra due `lz` in `idx`. */
export const CHUNK_AREA = CHUNK * CHUNK;

/** Numero di celle in un chunk: 32^3. */
export const CHUNK_VOL = CHUNK * CHUNK * CHUNK;

/** Lato del volume paddato passato al mesher (chunk + 1 cella di bordo per lato). */
export const PADDED = CHUNK + 2;

/** Numero di celle nel volume paddato: 34^3. */
export const PADDED_VOL = PADDED * PADDED * PADDED;

/**
 * Quanti voxel sopra il proprio tetto guarda un chunk per sapere cosa lo copre.
 *
 * La visibilita' del cielo non si ferma alla cella adiacente come l'AO: un
 * impalcato passa quattro o sei cubi sopra la carreggiata (`SPANS.clearance`,
 * `minRise`), e senza arrivare fin la' il suolo coperto resterebbe illuminato
 * come suolo aperto. Sedici copre con margine tutti i franchi che le campate
 * producono oggi.
 *
 * Sta qui e non nel mesher perche' e' un fatto di **dipendenza fra chunk**, e
 * come tale riguarda anche chi marca sporco: una scrittura nei primi sedici
 * piani di un chunk cambia la mesh di quello sotto. Deve restare sotto `CHUNK`.
 */
export const SKY_PROBE = 16;

/** Celle della fetta di soffitto: la stessa impronta del volume paddato. */
export const CEILING_VOL = PADDED * PADDED * SKY_PROBE;

/** Indice lineare dentro la fetta di soffitto, con `k` fra 0 e `SKY_PROBE - 1`. */
export function ceilingIdx(px: number, py: number, k: number): number {
  return px + PADDED * (py + PADDED * k);
}

/** Indice lineare dentro un chunk. `lx` e' la componente che varia piu' rapidamente. */
export function idx(lx: number, ly: number, lz: number): number {
  return lx + CHUNK * (ly + CHUNK * lz);
}

/** Indice lineare dentro il volume paddato 34^3, con coordinate 0..33. */
export function paddedIdx(px: number, py: number, pz: number): number {
  return px + PADDED * (py + PADDED * pz);
}

/**
 * Coordinata di chunk da coordinata di mondo. Lo shift aritmetico si comporta
 * come un floor anche sui negativi: -1 >> 5 === -1.
 */
export function toChunk(v: number): number {
  return v >> CHUNK_SHIFT;
}

/** Coordinata locale 0..31 da coordinata di mondo, corretta anche sui negativi. */
export function toLocal(v: number): number {
  return v & CHUNK_MASK;
}

/** Chiave della mappa sparsa dei chunk. */
export function keyOf(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

/** Le sei direzioni di faccia, nell'ordine usato dagli attributi di vertice. */
export const FACE_PX = 0;
export const FACE_NX = 1;
export const FACE_PY = 2;
export const FACE_NY = 3;
export const FACE_PZ = 4;
export const FACE_NZ = 5;

/** Offset di chunk per ciascuna direzione di faccia, indicizzati da FACE_*. */
export const FACE_NEIGHBOUR_OFFSETS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
