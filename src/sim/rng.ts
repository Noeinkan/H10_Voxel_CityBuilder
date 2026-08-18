/**
 * PRNG deterministico in forma pura.
 *
 * E' la stessa aritmetica di `mulberry32` in `src/world/rng.ts`, ma quella
 * versione restituisce una closure con stato mutabile: `tick` deve essere una
 * funzione pura, quindi lo stato viaggia dentro `SimState` e ogni passo lo
 * restituisce invece di aggiornarlo di nascosto.
 *
 * Lo stato e' un intero a 32 bit senza segno, quindi sopravvive a un giro in
 * JSON senza perdita di precisione.
 */

/** Avanza lo stato di un passo. Restituisce il nuovo stato, non il numero. */
export function nextState(state: number): number {
  return (state + 0x6d2b79f5) >>> 0;
}

/** Estrae il valore uniforme in [0, 1) associato a uno stato, senza avanzarlo. */
export function unitOf(state: number): number {
  let t = state >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
