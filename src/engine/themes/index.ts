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

/**
 * Le tre pastiglie che raccontano un tema in un bottone.
 *
 * Cielo, un colore di mezzo e uno caldo: bastano a distinguere sette temi in un
 * colpo d'occhio, e la derivazione sta **qui** perche' la leggono in due — il
 * menu di pausa attraverso `main.ts` e la schermata del titolo, che l'engine non
 * lo carica affatto. Due copie divergerebbero al primo tema nuovo.
 */
export function themeSwatches(theme: Theme): readonly string[] {
  return [
    theme.atmosphere.background,
    theme.colors[5] ?? theme.atmosphere.fog.color,
    theme.colors[12] ?? theme.atmosphere.fog.color,
  ];
}

export type { Atmosphere, Theme } from './theme';
