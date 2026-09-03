import { describe, expect, it } from 'vitest';
import { ROADS, ROAD_RANK } from './config';
import { normalisePoles, planRoads, rankOf, type RoadPole } from './network';
import type { RoadProbe, TraceBounds } from './trace';

/**
 * La rete e' pura: entrano poli, sonda e riquadro. Le fixture qui sotto sono
 * pianure — il rilievo lo verifica `trace.test.ts` — perche' cio' che va provato
 * qui e' la **forma dell'albero**: chi e' la radice, chi confluisce in chi, e
 * come il carico diventa larghezza.
 */

const FLAT: RoadProbe = {
  levelAt: () => 0,
  costAt: () => ROADS.landCost,
};

const BOUNDS: TraceBounds = { x0: -40, y0: -40, x1: 400, y1: 400 };

function pole(x: number, y: number, strength: number): RoadPole {
  return { x, y, strength };
}

describe('normalisePoles — chi merita un nodo', () => {
  it('tiene il piu forte quando due poli sono lo stesso posto', () => {
    const kept = normalisePoles([
      pole(100, 100, 180),
      pole(100 + ROADS.mergeDistance - 1, 100, 210),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].strength).toBe(210);
  });

  it('due poli oltre la distanza di fusione restano due', () => {
    const kept = normalisePoles([
      pole(100, 100, 180),
      pole(100 + ROADS.mergeDistance, 100, 210),
    ]);

    expect(kept).toHaveLength(2);
  });

  it('ordina per intensita e poi per coordinate: nessun pareggio ambiguo', () => {
    const kept = normalisePoles([
      pole(300, 0, 200),
      pole(0, 0, 200),
      pole(150, 0, 240),
    ]);

    expect(kept.map((entry) => entry.x)).toEqual([150, 0, 300]);
  });
});

describe('planRoads — l albero cresciuto dal centro', () => {
  it('senza poli non c e rete', () => {
    expect(planRoads([], FLAT, BOUNDS).nodes).toHaveLength(0);
  });

  it('un polo solo e la radice, e non tira nessuna strada', () => {
    const plan = planRoads([pole(100, 100, 210)], FLAT, BOUNDS);

    expect(plan.connected).toHaveLength(1);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.paths).toHaveLength(0);
  });

  it('collega ogni polo, e la spezzata arriva davvero al polo', () => {
    const poles = [pole(100, 100, 210), pole(200, 100, 200), pole(100, 200, 195)];
    const plan = planRoads(poles, FLAT, BOUNDS);

    expect(plan.connected).toHaveLength(3);
    expect(plan.orphans).toHaveLength(0);
    for (const entry of poles) {
      expect(plan.nodes.some((node) => node.x === entry.x && node.y === entry.y)).toBe(true);
    }
  });

  it('il ramo lontano confluisce nella rete invece di correrle accanto', () => {
    // Tre poli in fila: il terzo deve attaccarsi al tratto fra i primi due, non
    // tirarsi una strada propria parallela fino alla radice.
    const plan = planRoads(
      [pole(0, 0, 240), pole(120, 0, 200), pole(240, 0, 190)],
      FLAT,
      BOUNDS,
    );

    const last = plan.paths[plan.paths.length - 1];
    const attachment = last[last.length - 1];
    // Il capo d'arrivo del terzo ramo sta sul tratto gia' esistente, cioe' fra
    // la radice e il secondo polo, non alla radice.
    expect(attachment.x).toBeGreaterThan(0);
    expect(attachment.x).toBeLessThanOrEqual(120);
  });

  it('il carico e massimo alla radice: e li che nasce il tronco', () => {
    const plan = planRoads(
      [
        pole(0, 0, 250),
        pole(90, 0, 200), pole(-90, 0, 199),
        pole(0, 90, 198), pole(0, -90, 197),
      ],
      FLAT,
      BOUNDS,
    );

    const root = plan.nodes.find((node) => node.x === 0 && node.y === 0);
    const leaf = plan.nodes.find((node) => node.x === 90 && node.y === 0);

    expect(root).toBeDefined();
    expect(leaf).toBeDefined();
    expect(root!.load).toBeGreaterThan(leaf!.load);
    expect(root!.rank).toBe(ROAD_RANK.trunk);
    expect(leaf!.rank).toBeLessThan(ROAD_RANK.trunk);
  });

  it('un polo dietro un muro invalicabile resta orfano invece di far fallire tutto', () => {
    const walled: RoadProbe = {
      levelAt: (x) => (x === 50 ? ROADS.maxRise * 4 : 0),
      costAt: () => ROADS.landCost,
    };

    const plan = planRoads(
      [pole(0, 0, 210), pole(100, 0, 200)],
      walled,
      { x0: -10, y0: -10, x1: 110, y1: 10 },
    );

    expect(plan.connected).toHaveLength(1);
    expect(plan.orphans).toHaveLength(1);
    expect(plan.orphans[0].x).toBe(100);
  });

  it('e deterministico: lo stesso insieme di poli in ordine diverso da la stessa rete', () => {
    const poles = [pole(0, 0, 240), pole(120, 40, 200), pole(60, 150, 190)];
    const forward = planRoads(poles, FLAT, BOUNDS);
    const backward = planRoads([...poles].reverse(), FLAT, BOUNDS);

    expect(forward.nodes).toEqual(backward.nodes);
  });
});

describe('rankOf — il carico diventa larghezza', () => {
  it('il massimo della rete e sempre tronco', () => {
    expect(rankOf(1)).toBe(ROAD_RANK.trunk);
  });

  it('una foglia isolata resta un vicolo', () => {
    expect(rankOf(ROADS.streetShare / 2)).toBe(ROAD_RANK.lane);
  });

  it('le soglie sono ordinate: nessun rango salta', () => {
    expect(rankOf(ROADS.streetShare)).toBe(ROAD_RANK.street);
    expect(rankOf(ROADS.avenueShare)).toBe(ROAD_RANK.avenue);
    expect(rankOf(ROADS.trunkShare)).toBe(ROAD_RANK.trunk);
  });
});
