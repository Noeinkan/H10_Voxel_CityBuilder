import { describe, expect, it } from 'vitest';
import { STREETS } from './config';
import {
  blockNeighbours,
  nearestBlock,
  planCorridor,
  type CorridorLeg,
} from './corridor';
import type { BlockId } from './streetGrid';

/**
 * Il raccordo e' puro come la maglia su cui cammina: il terreno entra come costo
 * di un tratto, quindi qui il "terreno" sono tre righe scritte a mano e non
 * un'isola generata. Sono proprieta' del percorso — che colleghi davvero, che non
 * attraversi cio' che e' dichiarato impraticabile, che non dipenda dall'ordine —
 * e non asserzioni su una sequenza di indici scelta a mano: quale delle due
 * linee equivalenti vinca un pareggio e' un dettaglio dell'implementazione, e un
 * test che lo fissasse si romperebbe al primo ritocco senza segnalare niente.
 */

/** Terreno libero: ogni passo costa uno, nessuno e' precluso. */
const OPEN = (): number => 1;

/** I due incroci agli estremi di un tratto. */
function endsOf(leg: CorridorLeg): readonly (readonly [number, number])[] {
  return leg.along === 0
    ? [[leg.from, leg.line], [leg.to, leg.line]]
    : [[leg.line, leg.from], [leg.line, leg.to]];
}

/** I quattro incroci che delimitano un isolato. */
function cornersOf(block: BlockId): readonly string[] {
  return [[0, 0], [1, 0], [0, 1], [1, 1]]
    .map(([dx, dy]) => `${block.kx + dx},${block.ky + dy}`);
}

/** true se i due tratti condividono un incrocio, cioe' se il percorso non si spezza. */
function joins(a: CorridorLeg, b: CorridorLeg): boolean {
  const first = endsOf(a).map(([kx, ky]) => `${kx},${ky}`);
  return endsOf(b).some(([kx, ky]) => first.includes(`${kx},${ky}`));
}

describe('corridor — il percorso collega davvero', () => {
  it('parte da un capo, arriva all altro e non si spezza in mezzo', () => {
    const from: BlockId = { kx: 0, ky: 0 };
    const to: BlockId = { kx: 4, ky: 3 };
    const route = planCorridor({ from, to, costOf: OPEN });

    expect(route).not.toBeNull();
    const legs = route as readonly CorridorLeg[];
    expect(legs.length).toBeGreaterThan(0);

    // Il primo tratto tocca un incrocio dell'isolato di partenza, l'ultimo uno
    // dell'altro: senza, il raccordo sarebbe una strada che comincia nel prato.
    const start = cornersOf(from);
    const end = cornersOf(to);
    expect(endsOf(legs[0]).some(([kx, ky]) => start.includes(`${kx},${ky}`))).toBe(true);
    expect(endsOf(legs[legs.length - 1]).some(([kx, ky]) => end.includes(`${kx},${ky}`)))
      .toBe(true);

    for (let i = 1; i < legs.length; i++) {
      expect(joins(legs[i - 1], legs[i]),
        `il tratto ${i} non si salda al precedente`).toBe(true);
    }
  });

  it('gli estremi di un tratto sono sempre ordinati', () => {
    // Chi dipinge scorre `from..to` con un ciclo crescente: un tratto al
    // contrario non disegnerebbe niente, e in silenzio.
    const route = planCorridor({
      from: { kx: 6, ky: 5 },
      to: { kx: 0, ky: 0 },
      costOf: OPEN,
    });
    expect(route).not.toBeNull();
    for (const leg of route as readonly CorridorLeg[]) {
      expect(leg.from).toBeLessThanOrEqual(leg.to);
    }
  });

  it('su terreno libero non fa deviazioni e non spezza il rettilineo', () => {
    const route = planCorridor({
      from: { kx: 0, ky: 0 },
      to: { kx: 5, ky: 0 },
      costOf: OPEN,
    });

    // Un tratto solo: i sei passi in fila sono la stessa strada, e tenerli
    // spezzati farebbe ricalcolare la rampa a ogni giunzione.
    expect(route).toHaveLength(1);
    const leg = (route as readonly CorridorLeg[])[0];
    expect(leg.along).toBe(0);
    expect(leg.to - leg.from).toBe(4);
  });
});

describe('corridor — il terreno fa curvare la strada', () => {
  /**
   * Un muro fra gli incroci `kx` 2 e 3, aperto solo sulla linea `ky` 3.
   *
   * E' la darsena del caso vero ridotta all'osso: andare dritti non si puo', e
   * l'unico passaggio costringe a salire, attraversare e riscendere.
   */
  const wall = (leg: CorridorLeg): number =>
    leg.along === 0 && leg.from === 2 && leg.line !== 3 ? Number.POSITIVE_INFINITY : 1;

  it('gira attorno all ostacolo invece di attraversarlo', () => {
    const route = planCorridor({
      from: { kx: 0, ky: 0 },
      to: { kx: 5, ky: 0 },
      costOf: wall,
    });

    expect(route).not.toBeNull();
    const legs = route as readonly CorridorLeg[];
    // Con l'ostacolo il percorso non puo' piu' essere il rettilineo di prima.
    expect(legs.length).toBeGreaterThan(1);

    for (const leg of legs) {
      const crosses = leg.along === 0 && leg.from <= 2 && leg.to >= 3;
      if (crosses) expect(leg.line).toBe(3);
    }
  });

  it('rinuncia quando non esiste nessun passaggio', () => {
    // Il caso del lembo di terra oltre il braccio di mare: non c'e' una strada
    // che ci arrivi, e inventarne mezza sarebbe peggio che non farne nessuna.
    const route = planCorridor({
      from: { kx: 0, ky: 0 },
      to: { kx: 5, ky: 0 },
      costOf: () => Number.POSITIVE_INFINITY,
    });
    expect(route).toBeNull();
  });

  it('due isolati che si toccano non hanno niente da collegare', () => {
    // Condividono la carreggiata che li separa: il raccordo ridipingerebbe una
    // strada che c'e' gia'.
    for (const to of [{ kx: 1, ky: 0 }, { kx: 1, ky: 1 }, { kx: 0, ky: 1 }]) {
      expect(planCorridor({ from: { kx: 0, ky: 0 }, to, costOf: OPEN })).toBeNull();
    }
  });
});

describe('corridor — determinismo', () => {
  it('la stessa domanda da lo stesso percorso', () => {
    const request = {
      from: { kx: -3, ky: 2 },
      to: { kx: 4, ky: -1 },
      costOf: OPEN,
    };
    expect(planCorridor(request)).toEqual(planCorridor(request));
  });
});

describe('corridor — a chi ci si attacca', () => {
  it('vince il piu vicino contando lungo gli assi', () => {
    const from: BlockId = { kx: 0, ky: 0 };
    const nearest = nearestBlock(from, [
      { kx: 6, ky: 0 },
      { kx: 1, ky: 2 },
      { kx: 0, ky: 5 },
    ]);
    expect(nearest).toEqual({ kx: 1, ky: 2 });
  });

  it('a parita di distanza la scelta non dipende dall ordine', () => {
    // Senza un ordine totale il raccordo dipenderebbe da quale isolato e' stato
    // dipinto per primo, che e' proprio la dipendenza nascosta da evitare.
    const from: BlockId = { kx: 0, ky: 0 };
    const a: BlockId = { kx: 2, ky: 0 };
    const b: BlockId = { kx: 0, ky: 2 };
    expect(nearestBlock(from, [a, b])).toEqual(nearestBlock(from, [b, a]));
  });

  it('non si attacca a se stesso', () => {
    expect(nearestBlock({ kx: 3, ky: 3 }, [{ kx: 3, ky: 3 }])).toBeNull();
  });

  it('oltre la portata non si tira nessun raccordo', () => {
    const far = STREETS.linkReach + 1;
    expect(nearestBlock({ kx: 0, ky: 0 }, [{ kx: far, ky: 0 }])).toBeNull();
    expect(nearestBlock({ kx: 0, ky: 0 }, [{ kx: STREETS.linkReach, ky: 0 }]))
      .toEqual({ kx: STREETS.linkReach, ky: 0 });
  });
});

describe('corridor — chi confina', () => {
  it('sono otto e comprendono gli angoli', () => {
    // L'angolo conta: due isolati in diagonale condividono l'incrocio, quindi
    // sono collegati esattamente come due affiancati.
    const neighbours = blockNeighbours({ kx: 0, ky: 0 });
    expect(neighbours).toHaveLength(8);
    expect(neighbours).toContainEqual({ kx: 1, ky: 1 });
    expect(neighbours).toContainEqual({ kx: -1, ky: -1 });
    expect(neighbours).not.toContainEqual({ kx: 0, ky: 0 });
  });
});
