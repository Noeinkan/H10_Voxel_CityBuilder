import { diorama } from './diorama';
import { enchanted } from './enchanted';
import { industrial } from './industrial';
import { natural } from './natural';
import { neon } from './neon';
import { pastel } from './pastel';
import { scifi } from './scifi';
import type { Theme } from './theme';

/**
 * Tabella dei temi grafici.
 *
 * L'ordine e' quello dei tasti `1`..`9` dell'harness di debug, quindi
 * aggiungere un tema in mezzo sposta le scorciatoie: si accodano in fondo.
 */
export const THEMES: readonly Theme[] = [natural, pastel, neon, industrial, scifi, enchanted, diorama];

export const DEFAULT_THEME_ID = natural.id;

export function themeById(id: string): Theme | undefined {
  return THEMES.find((theme) => theme.id === id);
}

/** Il tema richiesto, oppure quello di default se l'id non esiste. */
export function resolveTheme(id: string | null): Theme {
  if (id !== null) {
    const found = themeById(id);
    if (found !== undefined) return found;
  }
  return natural;
}

export type { Atmosphere, Theme } from './theme';
