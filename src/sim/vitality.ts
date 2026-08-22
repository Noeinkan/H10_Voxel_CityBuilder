import { BUILDING_CLASS } from './classes';
import { resolveWeights } from './policies';
import type { SimState } from './SimState';
import { effectiveCount } from './tick';

/**
 * Quanto la citta' e' **viva**, in due numeri fra zero e uno.
 *
 * Serve a una cosa sola: far accendere le luci in proporzione a quello che la
 * simulazione sta davvero facendo, invece che a un'ora dell'orologio. Una citta'
 * mezza vuota deve leggersi mezza vuota anche di notte, e finora la notte
 * mostrava le stesse finestre accese di una citta' piena.
 *
 * **Non e' un tick e non e' uno stato**: e' una lettura pura di quello che c'e'
 * gia', ricavata dagli stessi conteggi e dagli stessi pesi con cui il bilancio
 * lavora. Chiamarla non cambia niente e costa quattro moltiplicazioni.
 *
 * **Resta in `src/sim/` e non sa che esiste un renderer** (contratto 7): da qui
 * escono due frazioni, e cosa farne — una soglia di finestre accese, la scala di
 * un'insegna — lo decide chi sta fuori.
 */
export interface CityVitality {
  /**
   * Case occupate: popolazione sulla capacita' residenziale.
   *
   * E' anche il complemento dello sfitto, e per questo non c'e' un terzo numero
   * a dirlo: «quanto e' vuota» e' `1 - homes`, e due campi che si ricavano l'uno
   * dall'altro divergono al primo refactor.
   */
  readonly homes: number;
  /** Negozi pieni: l'occupazione dell'ultimo giro del commercio interno. */
  readonly commerce: number;
}

/** La lettura di riferimento quando non c'e' una simulazione dietro. */
export const DEFAULT_VITALITY: CityVitality = { homes: 0.28, commerce: 1 };

export function cityVitality(state: SimState): CityVitality {
  const weights = resolveWeights(state.policies);
  const residential = effectiveCount(state, BUILDING_CLASS.residential);
  const capacity = residential * weights.residentialCapacity;

  return {
    // Senza case non c'e' occupazione da leggere, e la citta' resta al buio:
    // e' la lettura giusta, non un caso limite da tappare con un default.
    homes: capacity > 0 ? clamp01(state.population.stock / capacity) : 0,
    commerce: clamp01(state.commerce.occupancy),
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
