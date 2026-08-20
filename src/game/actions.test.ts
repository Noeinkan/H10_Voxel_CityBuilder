import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, catalystById, createSimState, defaultCatalystOfClass } from '../sim';
import { testTerrain } from '../sim/testTerrain';
import { BUILD_WEIGHT, GRADING } from '../world/grading/config';
import { TERRAIN } from '../world/terrain/config';
import {
  buyExpansion,
  catalystFailure,
  catalystSiteCost,
  placeCatalyst,
  togglePolicy,
} from './actions';

describe('azioni di gioco', () => {
  it('piazza un catalizzatore pagando una sola volta', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const state = createSimState();
    const result = placeCatalyst(state, map, 8, 8, BUILDING_CLASS.residential);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.catalysts).toHaveLength(1);
    expect(result.state.funds.stock).toBeLessThan(state.funds.stock);
  });

  it('rifiuta atomicamente terreno assente e catalizzatori troppo vicini', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const state = createSimState();
    const missing = placeCatalyst(state, map, 99, 99, BUILDING_CLASS.residential);
    expect(missing).toEqual({ success: false, reason: 'terrain-loading' });

    const first = placeCatalyst(state, map, 8, 8, BUILDING_CLASS.residential);
    if (!first.success) throw new Error('fixture non valida');
    const close = placeCatalyst(first.state, map, 10, 10, BUILDING_CLASS.residential);
    expect(close).toEqual({ success: false, reason: 'too-close' });
    expect(first.state.catalysts).toHaveLength(1);
    expect(catalystFailure(first.state, map, 10, 10, BUILDING_CLASS.residential)).toBe('too-close');
  });

  it('applica costi e prerequisiti delle policy senza mutare un rifiuto', () => {
    const state = createSimState();
    expect(togglePolicy(state, 'denseHousing')).toEqual({
      success: false,
      reason: 'population-required',
    });
    expect(state.policies).toEqual([]);
    expect(togglePolicy(state, 'austerity').success).toBe(true);
  });

  it('permette ruoli diversi della stessa classe e blocca policy incompatibili', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const port = placeCatalyst(createSimState(), map, 8, 8, 'port');
    if (!port.success) throw new Error('porto fixture non valido');
    expect(placeCatalyst(port.state, map, 10, 10, 'factory').success).toBe(true);

    const base = createSimState();
    const funded = {
      ...base,
      population: { stock: 100, delta: 0 },
      funds: { stock: 2_000, delta: 0 },
    };
    const dense = togglePolicy(funded, 'denseHousing');
    if (!dense.success) throw new Error('policy fixture non valida');
    expect(togglePolicy(dense.state, 'greenBelt')).toEqual({
      success: false,
      reason: 'policy-incompatible',
    });
  });

  it('blocca l’espansione prima della soglia di popolazione', () => {
    expect(buyExpansion(createSimState())).toEqual({
      success: false,
      reason: 'population-required',
    });
  });

  it('impedisce di pagare due volte lo stesso settore', () => {
    const base = createSimState();
    const state = {
      ...base,
      population: { stock: 100, delta: 0 },
      funds: { stock: 2_000, delta: 0 },
    };
    expect(buyExpansion(state, true)).toEqual({ success: false, reason: 'already-unlocked' });
    expect(state.funds.stock).toBe(2_000);
  });
});

/**
 * Il terreno non risponde piu' si'/no: risponde con un prezzo. Questi test
 * scrivono quota e pendenza a mano e leggono il conto, perche' e' li' che la
 * regola si vede — una mesa piana che prima veniva rifiutata senza spiegazione.
 */
describe('prezzo del terreno', () => {
  const listino = catalystById(defaultCatalystOfClass(BUILDING_CLASS.residential)).cost;

  /** Mesa: sopra `rockMinHeight`, quindi roccia, ma piatta come un tavolo. */
  function mesa(slope = 0) {
    return testTerrain({
      chunksX: 1,
      chunksY: 1,
      heightAt: () => TERRAIN.rockMinHeight + 5,
      slopeAt: () => slope,
    });
  }

  it('una mesa piana si costruisce, e si paga il sovrapprezzo della roccia', () => {
    const map = mesa();
    // Il bit del generatore la dichiara ancora non edificabile: e' esattamente
    // il giudizio che questa azione ha smesso di consultare.
    expect(map.isBuildable(8, 8)).toBe(false);

    const state = createSimState();
    const placed = placeCatalyst(state, map, 8, 8, BUILDING_CLASS.residential);
    expect(placed.success).toBe(true);
    if (!placed.success) return;

    const atteso = Math.round(listino * BUILD_WEIGHT.rock);
    expect(state.funds.stock - placed.state.funds.stock).toBe(atteso);
    expect(catalystSiteCost(map, 8, 8, BUILDING_CLASS.residential)?.cost).toBe(atteso);
  });

  it('la parete resta un rifiuto: e la pendenza a dirlo, non il bioma', () => {
    const wall = mesa(GRADING.maxTerraceSlope);
    expect(catalystFailure(createSimState(), wall, 8, 8, BUILDING_CLASS.residential))
      .toBe('not-buildable');
  });

  it('il prato paga il listino, senza arrotondamenti nascosti', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    expect(catalystSiteCost(map, 8, 8, BUILDING_CLASS.residential)?.cost).toBe(listino);
  });

  it('il sovrapprezzo entra anche nel controllo dei fondi', () => {
    const map = mesa();
    const povero = {
      ...createSimState(),
      funds: { stock: listino, delta: 0 },
    };
    expect(catalystFailure(povero, map, 8, 8, BUILDING_CLASS.residential))
      .toBe('insufficient-funds');
  });
});
