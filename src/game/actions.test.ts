import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, createSimState } from '../sim';
import { testTerrain } from '../sim/testTerrain';
import { buyExpansion, catalystFailure, placeCatalyst, togglePolicy } from './actions';

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
