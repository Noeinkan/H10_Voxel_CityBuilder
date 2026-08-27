import {
  catalystById,
  catalystRoleOf,
  type BuildingClass,
  type CatalystId,
  type SimState,
} from '../sim';

export type OnboardingStep = 'market' | 'factory' | 'park' | 'complete';

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
 *
 * I passi guardano il **ruolo** piazzato, non l'uso urbano che ne nasce. Da
 * quando un catalizzatore influenza piu' usi, "ha gia' un catalizzatore
 * residenziale" non e' piu' una domanda con una risposta sola: mercato,
 * trasporto e parco alimentano tutti il residenziale in misura diversa. Il
 * ruolo invece e' esattamente cio' che il giocatore ha cliccato.
 */
export function onboardingOf(state: SimState): OnboardingState {
  if (!hasRole(state, 'market')) {
    return step('market', '1 · Place the Market',
      'Choose Growth → Market, then click open ground. Its ring is the area where homes and shops can appear; leave room inside it for the first blocks.',
      0);
  }
  if (!hasRole(state, 'factory')) {
    return step('factory', '2 · Overlap the Factory',
      'Choose Growth → Factory and place it so its ring crosses the Market ring. Workshops will grow in the shared area and start adding Materials.',
      1);
  }
  if (!hasRole(state, 'park')) {
    return step('park', '3 · Complete the overlap',
      'Choose Growth → Park and cover part of the Market–Factory overlap. Civic buildings should appear there, while Satisfaction and mixed-use blocks rise.',
      2);
  }
  return {
    step: 'complete',
    expectedClass: null,
    expectedCatalyst: null,
    title: 'Foundation complete',
    message: 'Let the first blocks grow before spending again. Use 4× speed and watch Population, Materials and Funds: the coach will point to the first number that falls behind.',
    progress: 3,
  };
}

export function onboardingAllows(state: SimState, target: BuildingClass | CatalystId): boolean {
  const onboarding = onboardingOf(state);
  if (onboarding.expectedCatalyst === null) return true;
  const id = typeof target === 'number' ? defaultRoleOf(target) : target;
  return id === onboarding.expectedCatalyst;
}

function step(
  id: Exclude<OnboardingStep, 'complete'>,
  title: string,
  message: string,
  progress: number,
): OnboardingState {
  return {
    step: id,
    expectedClass: catalystById(id).class,
    expectedCatalyst: id,
    title,
    message,
    progress,
  };
}

function hasRole(state: SimState, id: CatalystId): boolean {
  return state.catalysts.some((catalyst) => catalystRoleOf(catalyst) === id);
}

/** Compatibilita' con chi seleziona ancora un uso invece di un ruolo. */
function defaultRoleOf(cls: BuildingClass): CatalystId {
  // Non passa da `defaultCatalystOfClass`: qui serve il ruolo che il tutorial
  // riconosce, e i tre passi sono esattamente mercato, fabbrica e parco.
  const found = (['market', 'factory', 'park'] as const).find(
    (id) => catalystById(id).class === cls,
  );
  return found ?? 'market';
}
