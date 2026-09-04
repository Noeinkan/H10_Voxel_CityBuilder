import { describe, expect, it } from 'vitest';
import { BALANCE, computeReach, UNIFORM_COST } from '../sim';
import type { CongestionLookup } from './congestion';
import { createReachCost, type RoadLookup } from './reachCost';
import { BIOME } from './terrain/config';
import type { TerrainMap } from './terrain/TerrainMap';

const REACH = BALANCE.reach;

/** Un piano edificabile senza mare: qui si misura il costo, non il terreno. */
const FLAT = {
  biomeAt: () => BIOME.plain,
  isBuildable: () => true,
} as unknown as TerrainMap;

const NO_ROADS: RoadLookup = { hasRoad: () => false };
const ALL_ROADS: RoadLookup = { hasRoad: () => true };

/** Un ingorgo di intensita' fissa ovunque. */
function everywhere(load: number): CongestionLookup {
  return { at: () => load };
}

describe('createReachCost', () => {
  it('senza ingorgo da il costo di prima della 8.3', () => {
    const cost = createReachCost(FLAT, () => NO_ROADS);
    expect(cost(4, 4)).toBe(REACH.land);
    expect(createReachCost(FLAT, () => ALL_ROADS)(4, 4)).toBe(REACH.pavement);
  });

  it('il costruito alza il costo di suolo e carreggiata insieme', () => {
    const jam = REACH.congestion.jam;
    const road = createReachCost(FLAT, () => ALL_ROADS, () => everywhere(1));
    const tissue = createReachCost(FLAT, () => NO_ROADS, () => everywhere(1));
    expect(road(4, 4)).toBeCloseTo(REACH.pavement + jam, 6);
    expect(tissue(4, 4)).toBeCloseTo(REACH.land + jam, 6);
  });

  it('la carreggiata resta la via piu corta anche dentro l ingorgo', () => {
    // E' l'invariante che regge il modello: se il tessuto costasse meno di una
    // strada ingorgata, l'influenza aggirerebbe l'isolato e l'ingorgo non
    // esisterebbe. Vale a qualunque carico perche' il supplemento e' lo stesso.
    for (const load of [0, 0.25, 0.5, 0.75, 1]) {
      const road = createReachCost(FLAT, () => ALL_ROADS, () => everywhere(load));
      const tissue = createReachCost(FLAT, () => NO_ROADS, () => everywhere(load));
      expect(road(4, 4)).toBeLessThan(tissue(4, 4));
    }
  });

  it('nessun passo scende sotto 1, per quanto sia scorrevole', () => {
    // Il vincolo del modulo `reach.ts`: sotto 1, la portata uscirebbe dal
    // quadrato che il campo ricalcola e cadrebbe l'equivalenza fra percorso
    // incrementale e ricostruzione totale. Il termine di densita' si somma e non
    // sostituisce, quindi non puo' farlo cadere — e questa e' la prova.
    for (const load of [0, 0.5, 1]) {
      const cost = createReachCost(FLAT, () => ALL_ROADS, () => everywhere(load));
      for (let x = 0; x < 8; x++) expect(cost(x, x)).toBeGreaterThanOrEqual(1);
    }
  });

  it('l acqua resta invalicabile: un ingorgo non ci si somma sopra', () => {
    const ocean = { biomeAt: () => BIOME.ocean, isBuildable: () => false } as unknown as TerrainMap;
    const cost = createReachCost(ocean, () => ALL_ROADS, () => everywhere(1));
    expect(cost(4, 4)).toBe(Infinity);
  });

  it('un quartiere ingorgato e piu lontano di uno libero, e resta dentro il quadrato', () => {
    const free = createReachCost(FLAT, () => ALL_ROADS);
    const jammed = createReachCost(FLAT, () => ALL_ROADS, () => everywhere(1));
    const radius = 12;

    const open = computeReach(20, 20, radius, free);
    const dense = computeReach(20, 20, radius, jammed);

    // Piu' lontano: la stessa colonna riceve meno influenza.
    const reachedOpen = open.dist.reduce((count, d) => count + (d < radius ? 1 : 0), 0);
    const reachedDense = dense.dist.reduce((count, d) => count + (d < radius ? 1 : 0), 0);
    expect(reachedDense).toBeLessThan(reachedOpen);

    // E il supporto non esce dal quadrato, che e' l'unica cosa che il campo
    // pretende: con costo uniforme la geodetica coincide con la Chebyshev, e
    // l'ingorgo puo' solo allungarla.
    const chebyshev = computeReach(20, 20, radius, UNIFORM_COST);
    for (let i = 0; i < dense.dist.length; i++) {
      expect(dense.dist[i]).toBeGreaterThanOrEqual(chebyshev.dist[i]);
    }
  });
});
