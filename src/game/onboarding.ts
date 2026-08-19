import { BUILDING_CLASS, type BuildingClass, type SimState } from '../sim';

export type OnboardingStep = 'residential' | 'production' | 'civic' | 'complete';

export interface OnboardingState {
  readonly step: OnboardingStep;
  readonly expectedClass: BuildingClass | null;
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
      title: '1 · Dai una casa alla città',
      message: 'Piazza un catalizzatore residenziale: crea alloggi e permette ai primi abitanti di arrivare.',
      progress: 0,
    };
  }
  if (!hasCatalyst(state, BUILDING_CLASS.production)) {
    return {
      step: 'production',
      expectedClass: BUILDING_CLASS.production,
      title: '2 · Rendi sostenibile la crescita',
      message: 'Ora piazza un catalizzatore produttivo: senza lavoro e cibo le nuove case restano fragili.',
      progress: 1,
    };
  }
  if (!hasCatalyst(state, BUILDING_CLASS.civic)) {
    return {
      step: 'civic',
      expectedClass: BUILDING_CLASS.civic,
      title: '3 · Completa il quartiere',
      message: 'Aggiungi un catalizzatore civico: i servizi sostengono la felicità quando la popolazione sale.',
      progress: 2,
    };
  }
  return {
    step: 'complete',
    expectedClass: null,
    title: 'Fondazione completata',
    message: 'Le tre funzioni urbane sono attive. Osserva i bilanci e scegli dove rinforzare la città.',
    progress: 3,
  };
}

export function onboardingAllows(state: SimState, cls: BuildingClass): boolean {
  const expected = onboardingOf(state).expectedClass;
  return expected === null || expected === cls;
}

function hasCatalyst(state: SimState, cls: BuildingClass): boolean {
  return state.catalysts.some((catalyst) => catalyst.class === cls);
}
