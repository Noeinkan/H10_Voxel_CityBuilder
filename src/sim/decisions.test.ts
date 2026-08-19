import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { createSimState, resolveDecision } from './SimState';
import { testTerrain } from './testTerrain';
import { tickMany } from './tick';

describe('decisioni periodiche', () => {
  it('non interrompe una citta ancora priva di un contesto significativo', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const state = tickMany(createSimState(), map, BALANCE.decisions.firstTick);

    expect(state.pendingDecision).toBeNull();
  });

  it('apre una scelta deterministica alla scadenza e la mantiene sospesa', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const city = establishedCity();
    const first = tickMany(city, map, BALANCE.decisions.firstTick);
    const second = tickMany(establishedCity(), map, BALANCE.decisions.firstTick);
    expect(first.pendingDecision).toEqual(second.pendingDecision);
    expect(first.pendingDecision?.id).toMatch(/^public-space-/);
    expect(first.pendingDecision?.options).toHaveLength(3);
    expect(tickMany(first, map, 20).pendingDecision).toEqual(first.pendingDecision);
  });

  it('applica l alternativa e pianifica la prossima decisione', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const waiting = tickMany(establishedCity(), map, BALANCE.decisions.firstTick);
    const option = waiting.pendingDecision?.options[0];
    if (option === undefined) throw new Error('decisione attesa');
    const resolved = resolveDecision(waiting, option.id);
    expect(resolved?.pendingDecision).toBeNull();
    expect(resolved?.decisionHistory.at(-1)?.optionId).toBe(option.id);
    expect(resolved?.nextDecisionTick).toBe(waiting.tickCount + BALANCE.decisions.intervalTicks);
    expect(resolveDecision(waiting, 'inesistente')).toBeNull();
  });

  it('alterna le scelte contestuali invece di usare la parita del tick', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const first = tickMany(establishedCity(), map, BALANCE.decisions.firstTick);
    const resolved = resolveDecision(first, 'leave-open');
    if (resolved === null) throw new Error('decisione attesa');

    const second = tickMany(resolved, map, BALANCE.decisions.intervalTicks);
    expect(second.pendingDecision?.id).toMatch(/^investment-/);
  });
});

function establishedCity() {
  const state = createSimState();
  return {
    ...state,
    population: { stock: 48, delta: 0 },
    food: { stock: 1_000_000, delta: 0 },
    buildingCounts: [4, 2, 1],
  };
}
