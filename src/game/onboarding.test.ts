import { describe, expect, it } from 'vitest';
import { addCatalyst, catalystById, createSimState, type CatalystId, type SimState } from '../sim';
import { onboardingAllows, onboardingOf } from './onboarding';

describe('onboarding', () => {
  it('deriva i tre passi dai ruoli piazzati e impone l’ordine', () => {
    let state = createSimState();
    expect(onboardingOf(state).step).toBe('market');
    expect(onboardingAllows(state, 'factory')).toBe(false);

    state = withCatalyst(state, 'market', 0);
    expect(onboardingOf(state).step).toBe('factory');
    state = withCatalyst(state, 'factory', 16);
    expect(onboardingOf(state).step).toBe('park');
    state = withCatalyst(state, 'park', 32);

    expect(onboardingOf(state).step).toBe('complete');
    expect(onboardingAllows(state, 'monument')).toBe(true);
  });

  it('non confonde due ruoli che portano lo stesso uso primario', () => {
    // Trasporto e mercato hanno entrambi il residenziale come uso primario: se
    // il tutorial guardasse l'uso invece del ruolo, un trasporto chiuderebbe il
    // primo passo senza che il giocatore abbia mai visto un mercato.
    expect(catalystById('transport').class).toBe(catalystById('market').class);

    const state = withCatalyst(createSimState(), 'transport', 0);
    expect(onboardingOf(state).step).toBe('market');
  });
});

function withCatalyst(state: SimState, kind: CatalystId, x: number): SimState {
  const definition = catalystById(kind);
  return addCatalyst(state, {
    x,
    y: 0,
    class: definition.class,
    kind,
    strength: definition.strength,
    radius: definition.radius,
  });
}
