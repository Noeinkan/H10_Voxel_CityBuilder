import { unitAt } from '../rng';
import { GROUND_COVER } from './config';

/**
 * Erbette, fiori e sassi: **un** voxel appoggiato sopra la superficie.
 *
 * E' la scala che mancava al terreno. Un cubo di prato e' due voxel per lato e
 * si legge come una campitura piatta; l'albero piu' piccolo del catalogo ne e'
 * cinque volte piu' alto. In mezzo non c'era niente, e una superficie senza
 * niente in mezzo si legge come una carta da parati — la stessa ragione per cui
 * le facciate hanno le campate.
 *
 * **Non e' un oggetto e non ha una cella sua.** Un albero ha un'origine, un
 * ingombro e dei vicini da non toccare, quindi ha bisogno di un PRNG e di un
 * record; qui la decisione e' per colonna, e una colonna non puo' collidere con
 * nessuno. Ne segue tutto il resto: un hash invece di un PRNG (niente chiusure
 * per duecentosessantamila colonne), un byte per colonna invece di un record, e
 * la scrittura dentro lo stesso ciclo che riempie la colonna invece di una fase
 * a se'.
 */

/** Cosa c'e' sopra una colonna. Sono i valori che viaggiano in `ColumnBlock.cover`. */
export const COVER = {
  none: 0,
  /** Ciuffo d'erba: un tono piu' chiaro della superficie. */
  grass: 1,
  /** L'eccezione del bioma: fiore in basso, sasso in quota, conchiglia sulla riva. */
  accent: 2,
} as const;

export type CoverKind = (typeof COVER)[keyof typeof COVER];

/**
 * Cosa spunta sulla colonna, dal solo hash della sua posizione.
 *
 * **Una frazione sola per due decisioni.** La stessa estrazione dice se c'e'
 * qualcosa e, riscalata sulla densita', cosa: due hash indipendenti darebbero la
 * stessa distribuzione al doppio del prezzo, su un percorso che gira una volta
 * per colonna.
 */
export function coverAt(seed: number, x: number, y: number, biome: number): CoverKind {
  const density = GROUND_COVER.density[biome];
  if (density === undefined || density <= 0) return COVER.none;

  const unit = unitAt(seed ^ GROUND_COVER.salt, x, y);
  if (unit >= density) return COVER.none;

  const share = GROUND_COVER.accentShare[biome] ?? 0;
  return unit / density < share ? COVER.accent : COVER.grass;
}

/**
 * Indice di palette della copertura, o 0 se su questa colonna non c'e' niente.
 *
 * Prende un `number` e non un `CoverKind` perche' il valore arriva da un
 * `Uint8Array`: farlo passare per un cast a ogni colonna sarebbe una finzione di
 * tipo, e lo zero — la stragrande maggioranza delle colonne — cade comunque nel
 * ripiego.
 */
export function coverTone(kind: number, biome: number): number {
  if (kind === COVER.grass) return GROUND_COVER.grassTone[biome] ?? 0;
  if (kind === COVER.accent) return GROUND_COVER.accentTone[biome] ?? 0;
  return 0;
}
