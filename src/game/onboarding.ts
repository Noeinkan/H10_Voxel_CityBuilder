import {
  BUILDING_CLASS,
  defaultCatalystOfClass,
  type BuildingClass,
  type CatalystId,
  type SimState,
} from '../sim';

export type OnboardingStep = 'residential' | 'production' | 'civic' | 'complete';

export interface OnboardingState {
  readonly step: OnboardingStep;
  readonly expectedClass: BuildingClass | null;
  readonly expectedCatalyst: CatalystId | null;
  readonly title: string;
  readonly message: string;
  readonly progress: number;
}

/**
 * Tutorial derivato dallo stato: non ha flag nascosti e sopravvivera' quindi a
 * un futuro salvataggio senza dati aggiuntivi.
 */
export function onboardingOf(state: SimState): OnboardingState {
  if (!hasCatalyst(state, BUILDING_CLASS.residential)) {
    return {
      step: 'residential',
      expectedClass: BUILDING_CLASS.residential,
      expectedCatalyst: 'market',
      title: '1 · Give your city a home',
      message: 'Place the Market to attract homes, businesses, and your first residents.',
      progress: 0,
    };
  }
  if (!hasCatalyst(state, BUILDING_CLASS.production)) {
    return {
      step: 'production',
      expectedClass: BUILDING_CLASS.production,
      expectedCatalyst: 'factory',
      title: '2 · Make growth sustainable',
      message: 'Now place the Factory. New homes need jobs and food to thrive.',
      progress: 1,
    };
  }
  if (!hasCatalyst(state, BUILDING_CLASS.civic)) {
    return {
      step: 'civic',
      expectedClass: BUILDING_CLASS.civic,
      expectedCatalyst: 'park',
      title: '3 · Complete the neighborhood',
      message: 'Add the Park. Public services support happiness as the population grows.',
      progress: 2,
    };
  }
  return {
    step: 'complete',
    expectedClass: null,
    expectedCatalyst: null,
    title: 'Foundation complete',
    message: 'All three city functions are active. Overlap influence fields to shape distinct districts.',
    progress: 3,
  };
}

export function onboardingAllows(state: SimState, target: BuildingClass | CatalystId): boolean {
  const onboarding = onboardingOf(state);
  if (onboarding.expectedCatalyst === null) return true;
  const id = typeof target === 'number' ? defaultCatalystOfClass(target) : target;
  return id === onboarding.expectedCatalyst;
}

function hasCatalyst(state: SimState, cls: BuildingClass): boolean {
  return state.catalysts.some((catalyst) => catalyst.class === cls);
}
