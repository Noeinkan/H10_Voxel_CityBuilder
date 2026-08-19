import { describe, expect, it } from 'vitest';
import { addCatalyst, BUILDING_CLASS, createSimState, type SimState } from '../sim';
import { onboardingAllows, onboardingOf } from './onboarding';

describe('onboarding', () => {
  it('deriva i tre passi dai catalizzatori e impone l’ordine', () => {
    let state = createSimState();
    expect(onboardingOf(state).step).toBe('residential');
    expect(onboardingAllows(state, BUILDING_CLASS.production)).toBe(false);

    state = withCatalyst(state, BUILDING_CLASS.residential, 0);
    expect(onboardingOf(state).step).toBe('production');
    state = withCatalyst(state, BUILDING_CLASS.production, 16);
    expect(onboardingOf(state).step).toBe('civic');
    state = withCatalyst(state, BUILDING_CLASS.civic, 32);

    expect(onboardingOf(state).step).toBe('complete');
    expect(onboardingAllows(state, BUILDING_CLASS.residential)).toBe(true);
  });
});

function withCatalyst(state: SimState, cls: 0 | 1 | 2, x: number): SimState {
  return addCatalyst(state, { x, y: 0, class: cls, strength: 200, radius: 12 });
}
