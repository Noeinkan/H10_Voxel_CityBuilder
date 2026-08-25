import { describe, expect, it } from 'vitest';
import { shortList } from './hudWidgets';

/**
 * Solo la funzione pura dei widget.
 *
 * Il resto di `hudWidgets` e' DOM e i test girano in `node`. Il testo della
 * scheda del dock si prova in `hudTip.test.ts`, dov'e' finito il modello: qui
 * resta l'elenco che si accorcia per la pastiglia al cursore.
 */

describe('shortList', () => {
  it('lascia intatto un elenco che ci sta', () => {
    expect(shortList(['Civic', 'Commerce'])).toBe('Civic, Commerce');
    expect(shortList(['a', 'b', 'c'])).toBe('a, b, c');
  });

  it('conta quelli che non entrano invece di nominarli', () => {
    expect(shortList(['a', 'b', 'c', 'd'])).toBe('a, b, c, +1 more');
    expect(shortList(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c, +2 more');
  });

  it('rispetta il separatore di chi chiama', () => {
    // Le righe che contengono gia' delle virgole, separate da un'altra virgola,
    // si fonderebbero in un elenco solo.
    expect(shortList(['x, y', 'w, z'], '; ')).toBe('x, y; w, z');
  });
});
