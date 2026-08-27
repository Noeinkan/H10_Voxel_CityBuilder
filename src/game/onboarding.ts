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
      'The island is empty and people have no home yet. To fix that, place the Market on open ground: it draws homes and shops together, and with them your first residents.',
      0);
  }
  if (!hasRole(state, 'factory')) {
    return step('factory', '2 · Place the Factory',
      'Homes need jobs and shops need goods, but nothing produces either. To fix that, place the Factory close to the Market: it supplies both.',
      1);
  }
  if (!hasRole(state, 'park')) {
    return step('park', '3 · Place the Park',
      'The city works, but nothing lifts its spirits. To fix that, place the Park so its field overlaps the Market and the Factory: the overlap opens mixed-use blocks and keeps happiness up as the city grows.',
      2);
  }
  return {
    step: 'complete',
    expectedClass: null,
    expectedCatalyst: null,
    title: 'Foundation complete',
    message: 'The foundation is set. To grow into districts, place your next catalyst so its field touches the Market or Factory: overlapping fields open mixed-use blocks and whole quarters.',
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
