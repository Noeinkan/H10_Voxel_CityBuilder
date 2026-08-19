import { describe, expect, it } from 'vitest';
import type { GrowthStats } from '../game/growthScene';
import { cityCondition } from '../game/cityCondition';
import { onboardingOf } from '../game/onboarding';
import { BUILDING_CLASS } from '../sim/classes';
import { createSimState } from '../sim/SimState';
import type { PolicyId } from '../sim/policies';
import { buildGameHudModel, resolveEscapeTarget, selectionMessage } from './GameHudModel';

describe('buildGameHudModel', () => {
  it('blocca le azioni finche la città non è pronta', () => {
    const model = buildGameHudModel(null);

    expect(model.ready).toBe(false);
    expect(model.resources.every((resource) => resource.value === '—')).toBe(true);
    expect(model.catalysts.every((action) => !action.available)).toBe(true);
    expect(model.expansion.available).toBe(false);
    expect(model.policies.every((policy) => !policy.available)).toBe(true);
  });

  it('spiega separatamente blocchi per fondi e popolazione', () => {
    const model = buildGameHudModel(stats(100, 0));

    expect(model.catalysts[0]).toMatchObject({ available: false, reason: 'Fondi insufficienti.' });
    expect(model.expansion).toMatchObject({ available: false, reason: 'Richiede 48 abitanti.' });
    expect(model.policies.find((policy) => policy.id === 'denseHousing')).toMatchObject({
      available: false,
      reason: 'Richiede 24 abitanti.',
    });
    expect(model.policies.find((policy) => policy.id === 'austerity')?.available).toBe(true);
  });

  it('abilita tutte le azioni quando i requisiti sono soddisfatti', () => {
    const model = buildGameHudModel(stats(2_000, 100));

    expect(model.catalysts.every((action) => action.available)).toBe(true);
    expect(model.expansion.available).toBe(true);
    expect(model.policies.every((policy) => policy.available)).toBe(true);
  });

  it('durante il tutorial abilita solo il catalizzatore richiesto', () => {
    const model = buildGameHudModel(stats(2_000, 100, [], false));

    expect(model.catalysts[0]?.available).toBe(true);
    expect(model.catalysts[1]).toMatchObject({ available: false });
    expect(model.catalysts[1]?.reason).toContain('Dai una casa alla città');
  });

  it('permette sempre di disattivare una policy già attiva', () => {
    const model = buildGameHudModel(stats(0, 0, ['civicPride']));
    const policy = model.policies.find((candidate) => candidate.id === 'civicPride');

    expect(policy).toMatchObject({ active: true, available: true });
  });

  it('espone valore, delta e tono delle risorse', () => {
    const model = buildGameHudModel(stats(1_250, 12));
    const funds = model.resources.find((resource) => resource.id === 'funds');

    expect(funds).toMatchObject({ value: '1.250', delta: '±0', tone: 'neutral' });
  });

  it('assegna a Escape la superficie aperta con priorità corretta', () => {
    expect(resolveEscapeTarget(true, true, { kind: 'expansion' })).toBe('policies');
    expect(resolveEscapeTarget(false, true, { kind: 'expansion' })).toBe('help');
    expect(resolveEscapeTarget(false, false, { kind: 'expansion' })).toBe('tool');
    expect(resolveEscapeTarget(false, false, { kind: 'none' })).toBe('none');
  });

  it('produce un’istruzione contestuale solo per uno strumento selezionato', () => {
    const model = buildGameHudModel(stats(2_000, 100));
    expect(selectionMessage({ kind: 'catalyst', class: 0 }, model.catalysts)).toContain('Residenziale selezionato');
    expect(selectionMessage({ kind: 'expansion' }, model.catalysts)).toContain('scegli un lato della costa');
    expect(selectionMessage({ kind: 'none' }, model.catalysts)).toBeNull();
  });
});

function stats(
  funds: number,
  population: number,
  policies: readonly PolicyId[] = [],
  onboardingComplete = true,
): GrowthStats {
  const catalysts = onboardingComplete
    ? [BUILDING_CLASS.residential, BUILDING_CLASS.production, BUILDING_CLASS.civic].map((cls, index) => ({
        x: index * 16,
        y: 0,
        class: cls,
        strength: 1,
        radius: 1,
      }))
    : [];
  const base = createSimState({ policies, catalysts });
  const state = {
    ...base,
    funds: { stock: funds, delta: 0 },
    population: { stock: population, delta: 0 },
  };
  return {
    ready: true,
    tick: 0,
    tickMs: 0,
    buildings: 0,
    countsByClass: [0, 0, 0],
    levels: [],
    builder: {
      placed: 0,
      upgraded: 0,
      growing: 0,
      rejected: [0, 0, 0, 0, 0],
      blacklisted: 0,
      surfaceQueued: 0,
    },
    state,
    paused: false,
    speed: 1,
    message: 'Pronta.',
    onboarding: onboardingOf(state),
    condition: cityCondition(state, 0),
    unlockedSectors: [],
  };
}
