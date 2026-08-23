import { describe, expect, it } from 'vitest';
import { AERIAL, AERIAL_PART } from './config';
import type { DeckRect } from './deckPlan';
import { planRoute, type RouteEnd } from './routePlan';
import { TestGround } from './testProbe';

/**
 * La rete, verificata sul fatto della fase: **arriva a una mensola lontana**.
 *
 * Le campate della 4.5 si fermano a dodici voxel di vuoto e pretendono due
 * fronti che si guardano; qui il vuoto e' lungo quanto un isolato e i capi
 * possono essere sfalsati e a quote diverse. I test guardano proprio quella
 * differenza, piu' le due cose che il percorso deve garantire: che ogni pezzo
 * poggi su qualcosa, e che il dislivello si risolva su un pianerottolo invece
 * che con una rampa inventata.
 */

/**
 * Due mensole, distanti `gap` colonne di vuoto sull'asse x.
 *
 * Ciascuna e' un impalcato vero nel mondo di prova — travatura piu' piano — cosi'
 * il volume che il percorso attraversa e' quello che ci sarebbe davvero.
 */
function pair(
  gap: number,
  options: { crossOffset?: number; riseB?: number; sideA?: number; sideB?: number } = {},
): { ground: TestGround; a: RouteEnd; b: RouteEnd } {
  const cross = options.crossOffset ?? 0;
  const rise = options.riseB ?? 0;
  const sideA = options.sideA ?? 6;
  const sideB = options.sideB ?? 6;
  const zA = 30;
  const zB = zA + rise;

  const rectA: DeckRect = { x: 20, y: 20, sizeX: sideA, sizeY: sideA };
  const rectB: DeckRect = {
    x: 20 + sideA + gap,
    y: 20 + cross,
    sizeX: sideB,
    sizeY: sideB,
  };

  const ground = new TestGround(4)
    .box(rectA.x, rectA.y, rectA.sizeX, rectA.sizeY, zA - AERIAL.girderDepth, zA + 1, 11)
    .box(rectB.x, rectB.y, rectB.sizeX, rectB.sizeY, zB - AERIAL.girderDepth, zB + 1, 12);

  return {
    ground,
    a: { id: 11, rect: rectA, deckZ: zA },
    b: { id: 12, rect: rectB, deckZ: zB },
  };
}

describe('planRoute — il percorso lungo', () => {
  it('collega due mensole distanti piu di quanto una campata arrivi', () => {
    const { ground, a, b } = pair(20);
    expect(20).toBeGreaterThan(12); // il tetto di `SPANS.maxGap`

    const result = planRoute({ a, b, ...ground });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.fromId).toBe(a.id);
    expect(result.plan.toId).toBe(b.id);
    // Due capi affacciati alla stessa quota: nessuna ragione di piegare.
    expect(result.plan.pieces).toHaveLength(1);
    expect(result.plan.pieces[0].part).toBe(AERIAL_PART.walk);
    // Venti voxel di corsa non stanno in piedi da soli: `reach` e' sei.
    expect(result.plan.pieces[0].deck.piers.length).toBeGreaterThan(0);
  });

  it('ogni pezzo del percorso poggia su qualcosa', () => {
    // Con un dislivello il percorso guadagna dei pianerottoli, ed e' il caso in
    // cui la domanda «e questo cosa lo regge?» ha piu' modi di andare storta.
    const { ground, a, b } = pair(30, { riseB: 6 });
    const result = planRoute({ a, b, ...ground });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const piece of result.plan.pieces) {
      const { deck } = piece;
      // Un nodo non e' appeso a niente: se ne sta su gambe proprie. Un tratto
      // puo' non averne, ma solo perche' e' corto abbastanza per lo sbalzo.
      if (piece.part === AERIAL_PART.node) expect(deck.piers.length).toBeGreaterThan(0);
      for (const pier of deck.piers) {
        expect(pier.height).toBeGreaterThanOrEqual(AERIAL.clearance);
        expect(pier.baseZ + pier.height).toBe(deck.baseZ);
      }
    }
  });

  it('due capi sfalsati di molto non si collegano: la piega e un debito dichiarato', () => {
    // **Il limite della fase, scritto come test invece che come intenzione.** Un
    // percorso a zeta esisteva, e i suoi pianerottoli cadevano in punti che il
    // corridoio dritto non misura: su settecentocinquanta coppie di una citta'
    // cresciuta non ne reggeva nessuno. Meglio non averlo che averlo rotto.
    const { ground, a, b } = pair(30, { crossOffset: 16 });
    expect(planRoute({ a, b, ...ground })).toEqual({ ok: false, refusal: 'tooTight' });
  });

  it('i pianerottoli di un percorso non si sovrappongono fra loro', () => {
    const { ground, a, b } = pair(40, { riseB: 12 });
    const result = planRoute({ a, b, ...ground });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nodes = result.plan.pieces.filter((p) => p.part === AERIAL_PART.node);
    expect(nodes.length).toBeGreaterThan(1);
    // Due nodi sovrapposti sarebbero due record sulla stessa colonna alla stessa
    // quota, che il registry rifiuterebbe dopo averli gia' scritti a meta'.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(overlap(nodes[i].deck.rect, nodes[j].deck.rect)).toBe(false);
      }
    }
  });

  it('due capi che ancora si affacciano non piegano affatto', () => {
    const { ground, a, b } = pair(20, { crossOffset: 2 });
    const result = planRoute({ a, b, ...ground });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.pieces).toHaveLength(1);
    expect(result.plan.pieces[0].deck.rect.sizeY).toBe(AERIAL.route.walkWidth);
  });

  it('due capi stretti e sfalsati allargano il tratto invece di piegare', () => {
    // Riquadri da quattro sfalsati di tre: non si affacciano per la larghezza di
    // una passerella, ma stanno tutti e due dentro un tratto largo sette.
    const { ground, a, b } = pair(20, { crossOffset: 3, sideA: 4, sideB: 4 });
    const result = planRoute({ a, b, ...ground });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.pieces).toHaveLength(1);
    const { rect } = result.plan.pieces[0].deck;
    expect(rect.sizeY).toBeGreaterThan(AERIAL.route.walkWidth);
    expect(rect.sizeY).toBeLessThanOrEqual(AERIAL.route.maxWidth);
  });

  it('un dislivello si risolve su un pianerottolo, e il salto ha un tetto', () => {
    const { ground, a, b } = pair(24, { riseB: 4 });
    const result = planRoute({ a, b, ...ground });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.fromZ).not.toBe(result.plan.toZ);
    const nodes = result.plan.pieces.filter((p) => p.part === AERIAL_PART.node);
    expect(nodes.length).toBeGreaterThan(0);
    // Il pianerottolo e' piu' spesso di un impalcato piano: il fianco scende
    // fino alla quota bassa, ed e' cosi' che il salto si vede.
    for (const node of nodes) {
      expect(node.deck.height).toBeGreaterThan(AERIAL.girderDepth + 1);
    }
  });

  it('rifiuta chi e troppo vicino — ci pensa una campata — e chi e troppo lontano', () => {
    const near = pair(6);
    expect(planRoute({ a: near.a, b: near.b, ...near.ground }))
      .toEqual({ ok: false, refusal: 'badSeparation' });

    const far = pair(AERIAL.route.maxSeparation + 10);
    expect(planRoute({ a: far.a, b: far.b, ...far.ground }))
      .toEqual({ ok: false, refusal: 'badSeparation' });
  });

  it('rifiuta un dislivello che nessun pianerottolo assorbe', () => {
    const { ground, a, b } = pair(24, {
      riseB: (AERIAL.route.maxNodes + 1) * AERIAL.route.stepPerNode,
    });
    const result = planRoute({ a, b, ...ground });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('tooSteep');
  });

  it('e deterministico: la stessa coppia da lo stesso percorso', () => {
    const first = pair(30, { crossOffset: 16 });
    const second = pair(30, { crossOffset: 16 });
    expect(planRoute({ a: first.a, b: first.b, ...first.ground }))
      .toEqual(planRoute({ a: second.a, b: second.b, ...second.ground }));
  });
});

function overlap(a: DeckRect, b: DeckRect): boolean {
  return a.x < b.x + b.sizeX && b.x < a.x + a.sizeX &&
    a.y < b.y + b.sizeY && b.y < a.y + a.sizeY;
}
