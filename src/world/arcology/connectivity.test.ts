import { describe, expect, it } from 'vitest';
import { ARCOLOGY, ARCOLOGY_RECIPES } from './config';
import { floatingBoxes, maxSlendernessOf } from './structure';

describe('la struttura delle arcologie', () => {
  it('nessun box e sospeso, a nessuno stadio', () => {
    // Un box sospeso e' il difetto che e' gia' uscito due volte: la trave di
    // corona a quota sbagliata, o una guglia che riparte lontana dallo stelo.
    // Si controlla a ogni stadio perche' uno stadio puo' restare l'ultimo per
    // sempre, e la struttura va letta com'era in quel momento.
    for (const recipe of ARCOLOGY_RECIPES) {
      const floating = floatingBoxes(recipe);
      expect(
        floating.map((box) => `${box.stage}:${box.index}`).join(', '),
        `${recipe.kind} ha box sospesi`,
      ).toBe('');
    }
  });

  it('nessuna colonna verticale supera la snellezza ammessa', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      expect(maxSlendernessOf(recipe), recipe.kind).toBeLessThanOrEqual(ARCOLOGY.maxSlenderness);
    }
  });
});
