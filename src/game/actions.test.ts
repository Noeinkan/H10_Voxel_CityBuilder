import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, createSimState } from '../sim';
import { testTerrain } from '../sim/testTerrain';
import { buyExpansion, placeCatalyst, togglePolicy } from './actions';

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

  it('blocca l’espansione prima della soglia di popolazione', () => {
    expect(buyExpansion(createSimState())).toEqual({
      success: false,
      reason: 'population-required',
    });
  });
});
