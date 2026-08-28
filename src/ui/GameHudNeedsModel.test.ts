import { describe, expect, it } from 'vitest';
import { catalystById, createSimState, type SimState } from '../sim';
import type { CityCondition } from '../game/cityCondition';
import { cityCondition } from '../game/cityCondition';
import type { CoachSuggestion } from '../game/coach';
import type { GrowthStats } from '../game/growthScene';
import { buildHudNeeds } from './GameHudNeedsModel';

/**
 * La fixture porta solo cio' che `buildHudNeeds` legge: stato, condizione e
 * coach. Il resto di `GrowthStats` non lo tocca.
 */
function needsStats(
  state: SimState,
  condition: CityCondition,
  coach: CoachSuggestion | null = null,
): GrowthStats {
  return { state, condition, coach } as GrowthStats;
}

/** Una citta' gia' oltre il tutorial, con un coach che indica la prossima mossa. */
function developed(partial: Partial<SimState> = {}): SimState {
  return {
    ...createSimState({
      // I tre ruoli del tutorial: e' il ruolo, non l'uso, a chiudere i passi.
      catalysts: (['market', 'factory', 'park'] as const).map((kind, index) => ({
        x: index * 16,
        y: 0,
        kind,
        class: catalystById(kind).class,
        strength: 1,
        radius: 1,
      })),
    }),
    ...partial,
  };
}

const COACH: CoachSuggestion = {
  id: 'coach-development-1',
  tier: 'development',
  title: 'Add shops · 1/3',
  message: 'Place a Monument so its ring overlaps your Market.',
  highlight: null,
  grow: null,
};

describe('buildHudNeeds', () => {
  it('tace quando lo stato non e pronto', () => {
    expect(buildHudNeeds(null)).toBeNull();
  });

  it('tace durante il tutorial: il traguardo non esiste ancora', () => {
    // Senza catalizzatori l'onboarding non e' completo, e mostrare «0/120»
    // insegnerebbe a guardare il numero invece della citta'.
    const state = createSimState();
    expect(buildHudNeeds(needsStats(state, cityCondition(state, 0)))).toBeNull();
  });

  it('cita residenti e classi con gli stessi conti del cassetto Citta', () => {
    const state = developed({ population: { stock: 45, delta: 0 } });
    const needs = buildHudNeeds(needsStats(state, cityCondition(state, 0), COACH));

    expect(needs?.residents.value).toBe('45 / 120');
    expect(needs?.classes.map((entry) => entry.value)).toEqual(['0 / 3', '0 / 3', '0 / 3', '0 / 3']);
    expect(needs?.next).toBe('Add shops · 1/3');
  });

  it('un edificio misto conta anche per il suo secondo uso', () => {
    // Lo stesso invariante del coach e di `isSelfSufficient`: l'uso secondario
    // e' una quota in piu' nella colonna, non un edificio da ignorare.
    const state = developed({
      buildingCounts: [3, 0, 0, 0],
      mixedCounts: [0, 0, 2, 0],
    });
    const needs = buildHudNeeds(needsStats(state, cityCondition(state, 0)));

    expect(needs?.classes.find((entry) => entry.id === 'use-2')?.value).toBe('2 / 3');
  });

  it('il blocco e soddisfatto solo con residenti e classi al traguardo', () => {
    const almost = developed({
      population: { stock: 120, delta: 0 },
      buildingCounts: [3, 3, 3, 2],
    });
    expect(buildHudNeeds(needsStats(almost, cityCondition(almost, 0)))?.met).toBe(false);

    const done = developed({
      population: { stock: 120, delta: 0 },
      buildingCounts: [3, 3, 3, 3],
    });
    expect(buildHudNeeds(needsStats(done, cityCondition(done, 0)))?.met).toBe(true);
  });

  it('la riga del coach tace quando il coach non ha niente da dire', () => {
    const state = developed({ population: { stock: 45, delta: 0 } });
    const needs = buildHudNeeds(needsStats(state, cityCondition(state, 0)));

    expect(needs?.next).toBeNull();
  });
});
