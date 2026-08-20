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
    return step('market', '1 · Give your city a home',
      'Place the Market: it draws in homes and shops together, and with them your first residents.',
      0);
  }
  if (!hasRole(state, 'factory')) {
    return step('factory', '2 · Make growth sustainable',
      'Now place the Factory. Homes need jobs, food, and goods for the shops to sell.',
      1);
  }
  if (!hasRole(state, 'park')) {
    return step('park', '3 · Complete the neighborhood',
      'Add the Park. Public services support happiness as the population grows.',
      2);
  }
  return {
    step: 'complete',
    expectedClass: null,
    expectedCatalyst: null,
    title: 'Foundation complete',
    message: 'Housing, commerce, industry and civic uses are all in play. Overlap influence fields to shape districts — and mixed-use blocks.',
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
