import { describe, expect, it } from 'vitest';
import { CATALYSTS } from '../sim';
import { buildActionTip, nameList, reachLabel, tipText } from './hudTip';
import type { HudAction } from './GameHudModel';

/**
 * Il modello della scheda, senza DOM.
 *
 * E' la meta' che nessun tipo controlla: il **testo**. Un elenco che si accorcia
 * male, una descrizione che sparisce quando il bottone si blocca o un numero
 * senza scala non fanno fallire niente — si vedono solo passando sopra a una
 * tessera, cioe' mai.
 */

function action(extra: Partial<HudAction> = {}): HudAction {
  return {
    id: 'monument',
    label: 'Monument',
    cost: 440,
    available: true,
    reason: 'Click a spot on the island to place it.',
    description: 'A landmark that attracts visitors, shops and civic pride.',
    ...extra,
  };
}

function valueOf(tip: ReturnType<typeof buildActionTip>, label: string): string | undefined {
  return tip.rows.find((row) => row.label === label)?.value;
}

describe('nameList', () => {
  it('lascia intatto un elenco che ci sta', () => {
    expect(nameList(['Civic', 'Commerce'])).toBe('Civic, Commerce');
    expect(nameList(['a', 'b', 'c'])).toBe('a, b, c');
  });

  it('chiude a parole, perche la riga e una frase', () => {
    // «+14 more» in mezzo a dei nomi si legge come un errore di stampa: il segno
    // piu' e' notazione, e questa riga non e' una formula.
    expect(nameList(['a', 'b', 'c', 'd'])).toBe('a, b, c and 1 more');
    expect(nameList(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c and 2 more');
  });
});

describe('reachLabel', () => {
  it('dice la portata in parole prima che in cifre', () => {
    // Il numero da solo non ha scala: per sapere se 52 sia tanto bisognerebbe
    // aver gia' comprato tutti e nove i ruoli.
    const radii = CATALYSTS.map((entry) => entry.radius);
    expect(reachLabel(Math.min(...radii))).toMatch(/^Short · \d+ tiles$/);
    expect(reachLabel(Math.max(...radii))).toMatch(/^Long · \d+ tiles$/);
  });

  it('resta dentro le tre bande agli estremi', () => {
    // Il raggio massimo cade esattamente sul confine superiore: senza il clamp
    // l'indice uscirebbe dall'array e la banda diventerebbe `undefined`.
    for (const entry of CATALYSTS) {
      expect(reachLabel(entry.radius)).toMatch(/^(Short|Medium|Long) · \d+ tiles$/);
    }
  });
});

describe('buildActionTip', () => {
  it('tiene la descrizione anche quando l azione e bloccata', () => {
    // E' il difetto da cui questa scheda nasce: con `reason` unico, chi non
    // poteva permettersi il porto leggeva «Not enough funds.» e nient'altro —
    // proprio mentre stava decidendo se valesse la pena risparmiare.
    const tip = buildActionTip(action({
      available: false,
      reason: 'Not enough funds.',
      requirement: '240 / 440 funds',
    }));

    expect(tip.lead).toBe('A landmark that attracts visitors, shops and civic pride.');
    expect(tip.status).toBe('Not enough funds.');
    expect(tip.detail).toBe('240 / 440 funds');
    expect(tip.blocked).toBe(true);
  });

  it('nomina tutti gli usi favoriti, che sono quattro in tutto', () => {
    // Accorciando a tre, il quarto uso diventava «+1 more»: un'ellissi piu'
    // lunga del nome che nascondeva.
    const tip = buildActionTip(action({
      favours: ['Housing', 'Commerce', 'Industry', 'Civic'],
      penalises: ['Industry'],
    }));

    expect(valueOf(tip, 'Attracts')).toBe('Housing, Commerce, Industry, Civic');
    expect(valueOf(tip, 'Pushes out')).toBe('Industry');
  });

  it('apre con il vincolo di sito, che e l unica riga che cambia dove si clicca', () => {
    const tip = buildActionTip(action({ site: 'Waterfront only', radius: 40 }));

    expect(tip.rows[0]).toEqual({ label: 'Where', value: 'Waterfront only' });
    expect(tip.rows[1]?.label).toBe('Reach');
  });

  it('accorcia le tipologie invece di srotolarle', () => {
    const typologies = Array.from({ length: 17 }, (_, index) => `Form ${index + 1}`);
    const tip = buildActionTip(action({ typologies }));

    expect(valueOf(tip, 'Grows')).toBe('Form 1, Form 2, Form 3 and 14 more');
  });

  it('non stampa una riga per un elenco vuoto', () => {
    const tip = buildActionTip(action({ favours: [], typologies: [], unlocks: [] }));

    expect(tip.rows).toEqual([]);
    expect(tip.note).toBeNull();
  });

  it('tiene gli sblocchi fuori dalle righe, perche sono condizionati', () => {
    // Le tipologie arrivano piazzando, gli sblocchi solo se il quartiere matura:
    // nella stessa tabella si leggerebbero come promesse dello stesso peso.
    const tip = buildActionTip(action({
      typologies: ['Market hall'],
      unlocks: ['Hotel in tourism districts'],
    }));

    expect(tip.note).toBe('Only here: Hotel in tourism districts');
    expect(valueOf(tip, 'Grows')).toBe('Market hall');
  });

  it('mette nome e prezzo in cima al testo letto', () => {
    // La scheda si apre da una tessera che a schermo puo' non avere ne' l'uno ne'
    // l'altro: sotto una certa altezza il prezzo lascia la tessera, e chi legge
    // con lo schermo non vede nemmeno l'etichetta.
    expect(tipText(buildActionTip(action())).split('\n')[0]).toBe('Monument · 440 funds');
  });
});
