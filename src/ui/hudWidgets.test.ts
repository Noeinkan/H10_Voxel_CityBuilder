import { describe, expect, it } from 'vitest';
import { actionTooltip, shortList } from './hudWidgets';
import type { HudAction } from './GameHudModel';

/**
 * Solo le due funzioni pure dei widget.
 *
 * Il resto di `hudWidgets` e' DOM e i test girano in `node`: quello che qui puo'
 * sbagliare in silenzio e' il **testo**, che nessun tipo controlla e che si vede
 * solo passando sopra a un bottone.
 */

function action(extra: Partial<HudAction> = {}): HudAction {
  return {
    id: 'monument',
    label: 'Monument',
    cost: 440,
    available: true,
    reason: 'A landmark that attracts visitors.',
    ...extra,
  };
}

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
    // Le righe di `unlocks` contengono gia' delle virgole: separarle con un'altra
    // virgola le fonderebbe in un elenco solo.
    expect(shortList(['x → y', 'w → z'], '; ')).toBe('x → y; w → z');
  });
});

describe('actionTooltip', () => {
  it('mette ogni voce su una riga sua', () => {
    const tip = actionTooltip(action({ requirement: '240 / 440 funds', site: 'Needs a waterfront' }));

    expect(tip.split('\n')).toEqual([
      'A landmark that attracts visitors.',
      '240 / 440 funds',
      'Needs a waterfront',
    ]);
  });

  it('tiene portata, favoriti e penalizzati sulla stessa riga', () => {
    // Sono i tre numeri della stessa domanda — dove arriva e su cosa spinge —
    // e su tre righe separate sembravano tre argomenti.
    const tip = actionTooltip(action({
      radius: 40,
      favours: ['Civic', 'Commerce'],
      penalises: ['Industry'],
    }));

    expect(tip.split('\n')[1]).toBe('Radius 40 · favours Civic, Commerce · penalises Industry');
  });

  it('accorcia gli elenchi lunghi invece di srotolarli', () => {
    // E' il caso del monumento: diciassette tipologie erano una riga che a quel
    // punto si saltava intera, portandosi via le due utili sotto.
    const typologies = Array.from({ length: 17 }, (_, index) => `Form ${index + 1}`);
    const tip = actionTooltip(action({ typologies }));

    expect(tip).toContain('May build: Form 1, Form 2, Form 3, +14 more');
    expect(tip).not.toContain('Form 4');
  });

  it('non stampa una riga per un elenco vuoto', () => {
    const tip = actionTooltip(action({ favours: [], typologies: [], unlocks: [] }));

    expect(tip).toBe('A landmark that attracts visitors.');
  });

  it('mette cio che si sblocca dopo cio che si costruisce', () => {
    // Le tipologie arrivano piazzando, gli sblocchi solo se il quartiere matura:
    // in ordine inverso si leggerebbero come promesse dello stesso peso.
    const tip = actionTooltip(action({
      typologies: ['Market hall'],
      unlocks: ['tourism districts → Hotel'],
    }));
    const lines = tip.split('\n');

    expect(lines.indexOf('May build: Market hall')).toBeLessThan(
      lines.indexOf('Unlocks: tourism districts → Hotel'),
    );
  });
});
