import { describe, expect, it } from 'vitest';
import type { GrowthStats } from '../game/growthScene';
import { cityCondition } from '../game/cityCondition';
import { onboardingOf } from '../game/onboarding';
import { catalystById } from '../sim/catalysts';
import { createSimState } from '../sim/SimState';
import type { PolicyId } from '../sim/policies';
import {
  buildGameHudModel,
  decisionNeedsRepaint,
  resolveEscapeTarget,
  selectionMessage,
} from './GameHudModel';

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

    expect(model.catalysts[0]).toMatchObject({ available: false, reason: 'Not enough funds.' });
    expect(model.expansion).toMatchObject({ available: false, reason: 'Requires 48 residents.' });
    expect(model.policies.find((policy) => policy.id === 'denseHousing')).toMatchObject({
      available: false,
      reason: 'Requires 24 residents.',
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
    expect(model.catalysts[1]?.reason).toContain('Give your city a home');
  });

  it('permette sempre di disattivare una policy già attiva', () => {
    const model = buildGameHudModel(stats(0, 0, ['civicPride']));
    const policy = model.policies.find((candidate) => candidate.id === 'civicPride');

    expect(policy).toMatchObject({ active: true, available: true });
  });

  it('espone valore, delta e tono delle risorse', () => {
    const model = buildGameHudModel(stats(1_250, 12));
    const funds = model.resources.find((resource) => resource.id === 'funds');

    expect(funds).toMatchObject({ value: '1,250', delta: '±0', tone: 'neutral' });
  });

  it('assegna a Escape la superficie aperta con priorità corretta', () => {
    expect(resolveEscapeTarget(true, true, true, true, { kind: 'expansion' })).toBe('views');
    expect(resolveEscapeTarget(false, true, true, true, { kind: 'expansion' })).toBe('themes');
    expect(resolveEscapeTarget(false, false, true, true, { kind: 'expansion' })).toBe('policies');
    expect(resolveEscapeTarget(false, false, false, true, { kind: 'expansion' })).toBe('help');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'expansion' })).toBe('tool');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'none' })).toBe('none');
  });

  it('produce un’istruzione contestuale solo per uno strumento selezionato', () => {
    const model = buildGameHudModel(stats(2_000, 100));
    expect(selectionMessage({ kind: 'catalyst', class: 0 }, model.catalysts)).toContain('Housing selected');
    expect(selectionMessage({ kind: 'expansion' }, model.catalysts)).toContain('choose a coastline edge');
    expect(selectionMessage({ kind: 'none' }, model.catalysts)).toBeNull();
  });

  it('espone la decisione sospesa finche non viene risolta', () => {
    const pendingDecision = {
      id: 'public-space-80',
      family: 'publicSpace',
      title: 'A contested square',
      message: 'Residents and businesses propose different uses.',
      options: [{ id: 'leave-open', label: 'Keep it open', description: 'No cost.', effect: {} }],
    } as const;
    const waiting = stats(1_200, 0, [], true, pendingDecision);
    const resolved = stats(1_200, 0);

    expect(buildGameHudModel(waiting).decision).toBe(pendingDecision);
    expect(buildGameHudModel(resolved).decision).toBeNull();
  });

  it('non ricrea i bottoni della stessa decisione durante i repaint periodici', () => {
    const decision = {
      id: 'public-space-80',
      family: 'publicSpace',
      title: 'A contested square',
      message: 'Residents and businesses propose different uses.',
      options: [],
    } as const;

    expect(decisionNeedsRepaint(null, decision)).toBe(true);
    expect(decisionNeedsRepaint(decision.id, decision)).toBe(false);
    expect(decisionNeedsRepaint(decision.id, null)).toBe(true);
    expect(decisionNeedsRepaint(decision.id, { ...decision, id: 'investment-160' })).toBe(true);
  });
});

function stats(
  funds: number,
  population: number,
  policies: readonly PolicyId[] = [],
  onboardingComplete = true,
  pendingDecision: GrowthStats['state']['pendingDecision'] = null,
): GrowthStats {
  const catalysts = onboardingComplete
    // I tre ruoli del tutorial: e' il ruolo, non l'uso, a chiudere i passi.
    ? (['market', 'factory', 'park'] as const).map((kind, index) => ({
        x: index * 16,
        y: 0,
        kind,
        class: catalystById(kind).class,
        strength: 1,
        radius: 1,
      }))
    : [];
  const base = createSimState({ policies, catalysts });
  const state = {
    ...base,
    funds: { stock: funds, delta: 0 },
    population: { stock: population, delta: 0 },
    pendingDecision,
  };
  return {
    ready: true,
    tick: 0,
    tickMs: 0,
    buildings: 0,
    countsByClass: [0, 0, 0, 0],
    mixedByClass: [0, 0, 0, 0],
    typologies: [],
    levels: [],
    builder: {
      placed: 0,
      upgraded: 0,
      growing: 0,
      rejected: [0, 0, 0, 0],
      blacklisted: 0,
      surfaceQueued: 0,
      clustered: 0,
    },
    state,
    paused: false,
    speed: 1,
    message: 'Ready.',
    onboarding: onboardingOf(state),
    condition: cityCondition(state, 0),
    unlockedSectors: [],
  };
}
