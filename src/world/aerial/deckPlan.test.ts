import { describe, expect, it } from 'vitest';
import { AERIAL, DECK_HEIGHT } from './config';
import { planDeck, type DeckRect } from './deckPlan';
import { TestGround } from './testProbe';

/**
 * Il primitivo, verificato sul solo fatto che deve garantire: **niente sta in
 * aria senza un appoggio**.
 *
 * Il resto — quanto sporge una mensola, dove piega un percorso — sono decisioni
 * di chi lo chiama. Qui si controlla che lo sbalzo abbia un limite, che il limite
 * produca gambe, e che le gambe non finiscano dove non possono stare.
 */

/** Una parete alta, e il riquadro che le si appende accanto a quota `deckZ`. */
function wall(depth: number, deckZ = 30): {
  ground: TestGround;
  rect: DeckRect;
  anchor: DeckRect;
} {
  const ground = new TestGround(4).box(10, 20, 1, 6, 4, deckZ + 1, 7);
  return {
    ground,
    rect: { x: 11, y: 20, sizeX: depth, sizeY: 6 },
    anchor: { x: 10, y: 20, sizeX: 1, sizeY: 6 },
  };
}

describe('planDeck — lo sbalzo e le gambe', () => {
  it('una mensola corta non ha gambe: la parete basta', () => {
    const { ground, rect, anchor } = wall(AERIAL.reach);
    const result = planDeck({ rect, deckZ: 30, anchors: [anchor], ...ground });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.piers).toHaveLength(0);
    expect(result.plan.height).toBe(DECK_HEIGHT);
    expect(result.plan.baseZ).toBe(30 - AERIAL.girderDepth);
  });

  it('una mensola profonda se le pianta da sola, e scendono fino al terreno', () => {
    const { ground, rect, anchor } = wall(AERIAL.reach + 4);
    const result = planDeck({ rect, deckZ: 30, anchors: [anchor], ...ground });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.piers.length).toBeGreaterThan(0);

    for (const pier of result.plan.piers) {
      // La gamba sta **sotto l'impalcato**, non accanto: e' l'unico modo in cui
      // regge qualcosa.
      expect(pier.x).toBeGreaterThanOrEqual(rect.x);
      expect(pier.x + AERIAL.pierSide).toBeLessThanOrEqual(rect.x + rect.sizeX);
      expect(pier.baseZ).toBe(4);
      expect(pier.baseZ + pier.height).toBe(result.plan.baseZ);
      expect(pier.height).toBeGreaterThanOrEqual(AERIAL.clearance);
      expect(pier.massive).toBe(false);
    }
  });

  it('conserva pieni soltanto gli appoggi di un piano davvero massivo', () => {
    const { ground, rect, anchor } = wall(Math.ceil(AERIAL.heavySupportMinArea / 6));
    const result = planDeck({ rect, deckZ: 30, anchors: [anchor], ...ground });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(rect.sizeX * rect.sizeY).toBeGreaterThanOrEqual(AERIAL.heavySupportMinArea);
    expect(result.plan.piers.length).toBeGreaterThan(0);
    expect(result.plan.piers.every((pier) => pier.massive)).toBe(true);
  });

  it('nessuna colonna resta oltre lo sbalzo ammesso da un appoggio', () => {
    // E' il vincolo della fase scritto come test: si guarda **ogni** colonna, non
    // il fatto che una gamba esista.
    const { ground, rect, anchor } = wall(AERIAL.terrace.maxOverhang);
    const result = planDeck({ rect, deckZ: 30, anchors: [anchor], ...ground });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const supports: DeckRect[] = [anchor];
    for (const pier of result.plan.piers) {
      supports.push({ x: pier.x, y: pier.y, sizeX: AERIAL.pierSide, sizeY: AERIAL.pierSide });
    }

    for (let dy = 0; dy < rect.sizeY; dy++) {
      for (let dx = 0; dx < rect.sizeX; dx++) {
        const near = Math.min(...supports.map((s) => chebyshev(s, rect.x + dx, rect.y + dy)));
        expect(near).toBeLessThanOrEqual(AERIAL.reach);
      }
    }
  });

  it('una gamba si sposta per trovare un tetto invece di piantarsi nel prato', () => {
    const { ground, rect, anchor } = wall(AERIAL.terrace.maxOverhang);
    // Un edificio basso sotto la parte esterna della mensola: la gamba deve
    // preferirlo al terreno, ed e' cosi' che il suolo resta libero.
    ground.box(15, 20, 4, 6, 4, 12, 42);

    const result = planDeck({ rect, deckZ: 30, anchors: [anchor], ...ground });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.piers.some((pier) => pier.carrier === 42)).toBe(true);
    expect(result.plan.carriers).toContain(42);
  });

  it('mai in mezzo alla carreggiata, e mai su un suolo che nessuna opera regge', () => {
    const street = wall(AERIAL.terrace.maxOverhang);
    street.ground.pavement(street.rect.x, street.rect.y, street.rect.sizeX, street.rect.sizeY);
    const onStreet = planDeck({
      rect: street.rect,
      deckZ: 30,
      anchors: [street.anchor],
      ...street.ground,
    });
    expect(onStreet).toEqual({ ok: false, refusal: 'onStreet' });

    const soft = wall(AERIAL.terrace.maxOverhang);
    for (let dy = 0; dy < soft.rect.sizeY; dy++) {
      for (let dx = 0; dx < soft.rect.sizeX; dx++) {
        soft.ground.refuse(soft.rect.x + dx, soft.rect.y + dy);
      }
    }
    const onMush = planDeck({
      rect: soft.rect,
      deckZ: 30,
      anchors: [soft.anchor],
      ...soft.ground,
    });
    expect(onMush).toEqual({ ok: false, refusal: 'noFooting' });
  });
});

describe('planDeck — il vuoto', () => {
  it('rifiuta un volume che non e’ aria', () => {
    const { ground, rect, anchor } = wall(4);
    ground.box(rect.x + 1, rect.y + 1, 1, 1, 28, 32);

    expect(planDeck({ rect, deckZ: 30, anchors: [anchor], ...ground }))
      .toEqual({ ok: false, refusal: 'blocked' });
  });

  it('rifiuta un impalcato che sfiora un tetto sotto di se', () => {
    const { ground, rect, anchor } = wall(4);
    // Il tetto arriva a due voxel sotto la travatura: ci si passa sotto solo
    // strisciando, e un percorso cosi' e' un ostacolo, non un piano di citta'.
    ground.box(rect.x, rect.y, rect.sizeX, rect.sizeY, 4, 30 - AERIAL.girderDepth - 2);

    expect(planDeck({ rect, deckZ: 30, anchors: [anchor], ...ground }))
      .toEqual({ ok: false, refusal: 'tooLow' });
  });

  it('rifiuta un impalcato troppo vicino al terreno', () => {
    const { ground, rect, anchor } = wall(4, 8);
    expect(planDeck({ rect, deckZ: 4 + AERIAL.minRise - 1, anchors: [anchor], ...ground }))
      .toEqual({ ok: false, refusal: 'tooLow' });
  });

  it('il nodo che tiene due quote e piu spesso, e il salto si vede', () => {
    const ground = new TestGround(4);
    const rect: DeckRect = { x: 40, y: 40, sizeX: 6, sizeY: 6 };
    const result = planDeck({ rect, deckZ: 30, drop: 4, anchors: [], ...ground });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.height).toBe(DECK_HEIGHT + 4);
    expect(result.plan.baseZ).toBe(30 - AERIAL.girderDepth - 4);
    // Senza ancoraggi il nodo sta sulle proprie gambe: e' cio' che lo rende un
    // pianerottolo vero e non un gomito appeso ai tratti che ci arrivano.
    expect(result.plan.piers.length).toBeGreaterThan(0);
    expect(result.plan.piers.every((pier) => !pier.massive)).toBe(true);
  });
});

describe('planDeck — determinismo', () => {
  it('lo stesso luogo da lo stesso piano, gambe comprese', () => {
    const first = wall(AERIAL.terrace.maxOverhang);
    const second = wall(AERIAL.terrace.maxOverhang);

    expect(planDeck({ rect: first.rect, deckZ: 30, anchors: [first.anchor], ...first.ground }))
      .toEqual(planDeck({
        rect: second.rect,
        deckZ: 30,
        anchors: [second.anchor],
        ...second.ground,
      }));
  });
});

function chebyshev(rect: DeckRect, x: number, y: number): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.sizeX - 1));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.sizeY - 1));
  return Math.max(dx, dy);
}
