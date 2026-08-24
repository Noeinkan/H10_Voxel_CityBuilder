/**
 * Generatori pseudocasuali deterministici, scritti a mano: in questo prompt non
 * entrano librerie di noise.
 */

/** PRNG mulberry32: 32 bit di stato, uniforme in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash intero di una coppia di coordinate piu' un seed. Serve a dare a ogni
 * lotto il proprio PRNG, cosi' il risultato non dipende dall'ordine in cui il
 * generatore visita le celle (e quindi nemmeno dai budget per frame).
 */
export function hashCoords(seed: number, x: number, y: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x >>> 0), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h ^ (y >>> 0), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}

/**
 * Frazione uniforme in [0, 1) da una coppia di coordinate: l'hash, e basta.
 *
 * Esiste perche' `mulberry32` alloca una chiusura, e c'e' chi deve decidere
 * qualcosa **per colonna**: su un'isola di lato 512 sono duecentosessantamila
 * chiusure per una sola estrazione a testa. Quando le estrazioni sono piu' di
 * una serve il PRNG vero — questa non ha stato e ridarebbe sempre lo stesso
 * numero.
 */
export function unitAt(seed: number, x: number, y: number): number {
  return hashCoords(seed, x, y) / 4294967296;
}
