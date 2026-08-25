import { describe, expect, it } from 'vitest';
import { cityCondition } from '../game/cityCondition';
import type { GrowthStats } from '../game/growthScene';
import { onboardingOf } from '../game/onboarding';
import { createSimState } from '../sim';
import { buildCityOverviewModel } from './CityOverviewModel';

describe('buildCityOverviewModel', () => {
  it('resta vuoto finche la scena non ha uno stato leggibile', () => {
    expect(buildCityOverviewModel(null)).toBeNull();
  });

  it('porta nel drawer obiettivi, capacita e forma della citta', () => {
    const model = buildCityOverviewModel(stats());

    expect(model?.goals.find((goal) => goal.label === 'Housing')).toMatchObject({
      current: 2,
      met: false,
    });
    // Un uso secondario conta davvero verso l'obiettivo: e' lo stesso conteggio
    // con cui la simulazione decide se la citta' e' autosufficiente.
    expect(model?.goals.find((goal) => goal.label === 'Commerce')?.current).toBe(2);
    expect(model?.capacity).toContainEqual(expect.objectContaining({
      label: 'Workforce',
      value: '75% staffed',
      tone: 'warning',
    }));
    expect(model?.shape).toContainEqual({ label: 'Height bands', value: 'L0 2 · L3 1' });
    expect(model?.infrastructure).toContainEqual({
      label: 'Elevated links',
      value: '2 spans · 17 blocks reached',
    });
  });

  it('mostra il referto reale degli scambi e la memoria delle decisioni', () => {
    const model = buildCityOverviewModel(stats());

    expect(model?.trade).toEqual({
      connected: true,
      links: ['Port'],
      food: 3.5,
      materials: 2,
      funds: -1.25,
    });
    expect(model?.mandates[0]).toMatchObject({ label: 'Local shops', family: 'Investment' });
    expect(model?.history).toEqual([{ tick: 42, summary: 'Kept the square open.' }]);
  });
});

function stats(): GrowthStats {
  const base = createSimState();
  const state = {
    ...base,
    population: { stock: 48, delta: 2 },
    funds: { stock: 900, delta: -1.25 },
    materials: { stock: 80, delta: 2 },
    satisfaction: 0.7,
    buildingCounts: [2, 1, 1, 1],
    capacityCounts: [2, 1, 1, 1],
    mixedCounts: [0, 1, 0, 0],
    mixedCapacityCounts: [0, 1, 0, 0],
    staffing: 0.75,
    trade: {
      connected: true,
      links: ['port'] as const,
      food: 3.5,
      materials: 2,
      funds: -1.25,
    },
    charters: ['localShops'] as const,
    decisionHistory: [{
      tick: 42,
      decisionId: 'public-space-80',
      family: 'publicSpace' as const,
      optionId: 'leave-open',
      summary: 'Kept the square open.',
    }],
  };
  return {
    ready: true,
    tick: 42,
    tickMs: 0,
    buildings: 5,
    countsByClass: [2, 1, 1, 1],
    mixedByClass: [0, 1, 0, 0],
    typologies: [['Courtyard block', 2], ['Market hall', 1]],
    levels: [2, 0, 0, 1],
    builder: {
      placed: 5,
      upgraded: 1,
      growing: 0,
      rejected: [0, 0, 0, 0],
      blacklisted: 0,
      surfaceQueued: 0,
      clustered: 0,
      spans: 2,
      spanReach: 17,
      terraces: 1,
      routes: 2,
      piers: 1,
      stacked: 3,
      lifts: 1,
      ropeways: 1,
      clearing: 0,
      cleared: 0,
      farmPlots: 4,
      arcologies: 1,
      arcologyRefusal: null,
    },
    state,
    paused: false,
    speed: 1,
    message: 'Ready.',
    onboarding: onboardingOf(state),
    condition: cityCondition(state, 5),
    unlockedSectors: ['north', 'south'],
  };
}
