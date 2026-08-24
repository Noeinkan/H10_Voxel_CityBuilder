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

  it('due capi sfalsati di molto si collegano piegando a zeta', () => {
    // **La piega era un debito dichiarato, ed e' questo il test che lo chiude.**
    // Esisteva e non reggeva su nessuna coppia di una citta' vera, perche' il
    // colmo si misurava sul corridoio della corsa: il tratto di traverso e i due
    // angoli stanno **fuori** da quel corridoio, quindi il franco promesso non
    // era quello che avevano davvero. Ora `crestOf` prende i riquadri veri dei
    // pezzi, e la zeta e' una forma come le altre.
    const { ground, a, b } = pair(30, { crossOffset: 16 });
    const result = planRoute({ a, b, ...ground });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Due angoli, non uno: e' cio' che distingue la zeta dalla corsa dritta.
    const nodes = result.plan.pieces.filter((p) => p.part === AERIAL_PART.node);
    expect(nodes.length).toBe(AERIAL.route.maxTurns);

    // E il tratto di traverso c'e' davvero: un pezzo il cui lato lungo corre
    // sull'asse **perpendicolare** a quello degli altri.
    const walks = result.plan.pieces.filter((p) => p.part === AERIAL_PART.walk);
    const across = walks.filter((p) => p.deck.rect.sizeY > p.deck.rect.sizeX);
    expect(across.length).toBe(1);

    // Ogni pezzo tocca il precedente: una zeta con un buco in mezzo sarebbe due
    // mozziconi, non un collegamento.
    for (let i = 1; i < result.plan.pieces.length; i++) {
      expect(touching(result.plan.pieces[i - 1].deck.rect, result.plan.pieces[i].deck.rect))
        .toBe(true);
    }
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

  it('rifiuta chi si tocca quasi e chi e troppo lontano', () => {
    // **Il minimo non e' piu' il tetto delle campate, ed e' una correzione
    // misurata.** Diceva: sotto quella distanza il collegamento lo fa gia' la
    // 4.5. Su una citta' cresciuta nessuna delle venti campate tocca una
    // mensola — `planSpan` cerca due corpi affacciati, e un impalcato non e' un
    // corpo — quindi il vuoto corto non lo colmava nessuno. Resta solo il vero
    // minimo: due impalcati che si toccano quasi non hanno niente in mezzo da
    // attraversare.
    const near = pair(AERIAL.route.minSeparation - 2);
    expect(planRoute({ a: near.a, b: near.b, ...near.ground }))
      .toEqual({ ok: false, refusal: 'badSeparation' });

    const far = pair(AERIAL.route.maxSeparation + 10);
    expect(planRoute({ a: far.a, b: far.b, ...far.ground }))
      .toEqual({ ok: false, refusal: 'badSeparation' });
  });

  it('collega due impalcati vicini, che nessuna campata avrebbe collegato', () => {
    // Il caso che la soglia vecchia escludeva: due mensole sullo stesso fronte,
    // con in mezzo la carreggiata. E' il corridoio piu' sgombro che un quartiere
    // fitto abbia, ed era l'unico che non veniva mai provato.
    const { ground, a, b } = pair(AERIAL.route.minSeparation + 2);
    const result = planRoute({ a, b, ...ground });
    expect(result.ok).toBe(true);
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

/** true se i due riquadri si toccano o si sovrappongono, in pianta. */
function touching(a: DeckRect, b: DeckRect): boolean {
  return a.x <= b.x + b.sizeX && b.x <= a.x + a.sizeX &&
    a.y <= b.y + b.sizeY && b.y <= a.y + a.sizeY;
}
