import { ALL_CLASSES, BALANCE, fedShareOf, type SimState } from '../sim';
import { onboardingOf } from './onboarding';

export type CityConditionTone = 'objective' | 'warning' | 'success';

export interface CityCondition {
  readonly kind: 'onboarding' | 'development' | 'crisis' | 'success';
  readonly tone: CityConditionTone;
  readonly title: string;
  readonly message: string;
}

/**
 * **Il cibo si chiede a `fedShareOf` e non al segno del delta.** Uno stock
 * esaurito si ferma a zero e il delta vale esattamente zero, quindi una citta'
 * che mangiava un terzo di cio' che le serviva superava questo controllo come
 * una in equilibrio — l'obiettivo scorreva mentre la citta' moriva di fame.
 * Sfamata vuol dire che la domanda del tick e' stata servita tutta, non che il
 * magazzino non e' sceso.
 *
 * Materiali e fondi hanno lo stesso punto cieco e restano sul delta: chiuderlo
 * chiede il loro equivalente di `fed`, che oggi il referto non porta.
 */
export function isSelfSufficient(state: SimState): boolean {
  const target = BALANCE.gameplay.success;
  return state.population.stock >= target.population &&
    ALL_CLASSES.every(
      (cls) => state.buildingCounts[cls] + state.mixedCounts[cls] >= target.buildingsPerClass,
    ) &&
    fedShareOf(state.harvest, state.population.stock) >= 1 &&
    state.materials.delta >= 0 && state.funds.delta >= 0 &&
    state.satisfaction >= target.satisfaction;
}

/** Condizione direzionale, ordinata dalla crisi piu' recuperabile al successo. */
export function cityCondition(state: SimState, stableTicks: number): CityCondition {
  const onboarding = onboardingOf(state);
  if (onboarding.step !== 'complete') {
    return {
      kind: 'onboarding',
      tone: 'objective',
      title: onboarding.title,
      message: onboarding.message,
    };
  }

  // Riserva quasi finita **e** raccolto che non copre la domanda. La seconda
  // meta' era `food.delta < 0`, e a scorte esaurite quel delta e' esattamente
  // zero: l'allarme non compariva proprio nel caso che deve segnalare — la
  // carestia stabile, dove la citta' mangia solo cio' che raccoglie e non basta.
  if (state.population.stock > 0 &&
    state.food.stock <= BALANCE.gameplay.crisis.foodReserve &&
    fedShareOf(state.harvest, state.population.stock) < 1) {
    return {
      kind: 'crisis',
      tone: 'warning',
      title: 'Food shortage',
      message: 'Food is running low. Add production near a residential area. Population declines slowly and can recover.',
    };
  }
  if (state.funds.stock <= BALANCE.gameplay.crisis.fundsReserve && state.funds.delta < 0) {
    return {
      kind: 'crisis',
      tone: 'warning',
      title: 'Budget deficit',
      message: 'Services cost more than your income. Let housing and shops grow, or use Austerity. No buildings will be lost.',
    };
  }
  if (state.satisfaction <= BALANCE.gameplay.crisis.satisfaction) {
    return {
      kind: 'crisis',
      tone: 'warning',
      title: 'Critical happiness',
      message: 'The city is overcrowded or underserved. Add civic services, open shops, or increase residential capacity.',
    };
  }

  if (stableTicks >= BALANCE.gameplay.success.stableTicks) {
    return {
      kind: 'success',
      tone: 'success',
      title: 'Self-sufficient city',
      message: 'Population, resources, and services are stable. Expand or aim for a more ambitious skyline.',
    };
  }

  // Un edificio misto conta anche per il suo secondo uso: chiedere quattro
  // quartieri separati quando la citta' ne ha tre e un isolato che ne fa due
  // sarebbe chiedere di disfare proprio cio' che la fase premia.
  const missing = ALL_CLASSES
    .map((cls) => state.buildingCounts[cls] + state.mixedCounts[cls])
    .filter((count) => count < BALANCE.gameplay.success.buildingsPerClass).length;
  return {
    kind: 'development',
    tone: 'objective',
    title: 'Goal · self-sufficient city',
    message: missing > 0
      ? `Build at least ${BALANCE.gameplay.success.buildingsPerClass} buildings of each class and reach ${BALANCE.gameplay.success.population} residents.`
      : `Keep food, materials, and funds balanced for ${Math.ceil((BALANCE.gameplay.success.stableTicks - stableTicks) / 10)} seconds.`,
  };
}
