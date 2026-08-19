import { BALANCE, BUILDING_CLASS, type SimState } from '../sim';
import { onboardingOf } from './onboarding';

export type CityConditionTone = 'objective' | 'warning' | 'success';

export interface CityCondition {
  readonly kind: 'onboarding' | 'development' | 'crisis' | 'success';
  readonly tone: CityConditionTone;
  readonly title: string;
  readonly message: string;
}

export function isSelfSufficient(state: SimState): boolean {
  const target = BALANCE.gameplay.success;
  return state.population.stock >= target.population &&
    state.buildingCounts.every((count) => count >= target.buildingsPerClass) &&
    state.food.delta >= 0 && state.materials.delta >= 0 && state.funds.delta >= 0 &&
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

  if (state.population.stock > 0 && state.food.stock <= BALANCE.gameplay.crisis.foodReserve && state.food.delta < 0) {
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
      message: 'Services cost more than your income. Let housing grow or use Austerity. No buildings will be lost.',
    };
  }
  if (state.satisfaction <= BALANCE.gameplay.crisis.satisfaction) {
    return {
      kind: 'crisis',
      tone: 'warning',
      title: 'Critical happiness',
      message: 'The city is overcrowded. Strengthen civic services or increase residential capacity.',
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

  const missing = [
    state.buildingCounts[BUILDING_CLASS.residential],
    state.buildingCounts[BUILDING_CLASS.production],
    state.buildingCounts[BUILDING_CLASS.civic],
  ].filter((count) => count < BALANCE.gameplay.success.buildingsPerClass).length;
  return {
    kind: 'development',
    tone: 'objective',
    title: 'Goal · self-sufficient city',
    message: missing > 0
      ? `Build at least ${BALANCE.gameplay.success.buildingsPerClass} buildings of each class and reach ${BALANCE.gameplay.success.population} residents.`
      : `Keep food, materials, and funds balanced for ${Math.ceil((BALANCE.gameplay.success.stableTicks - stableTicks) / 10)} seconds.`,
  };
}
