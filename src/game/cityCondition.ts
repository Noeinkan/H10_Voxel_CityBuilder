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
      title: 'Crisi alimentare',
      message: 'Il cibo sta finendo: aggiungi produzione vicino a un’area abitata. La popolazione cala lentamente e può riprendersi.',
    };
  }
  if (state.funds.stock <= BALANCE.gameplay.crisis.fundsReserve && state.funds.delta < 0) {
    return {
      kind: 'crisis',
      tone: 'warning',
      title: 'Bilancio in rosso',
      message: 'I servizi costano più delle entrate: lascia crescere le case o usa Austerità. Nessun edificio viene perso.',
    };
  }
  if (state.satisfaction <= BALANCE.gameplay.crisis.satisfaction) {
    return {
      kind: 'crisis',
      tone: 'warning',
      title: 'Felicità critica',
      message: 'La città è affollata: rinforza i servizi civici o aumenta la capacità residenziale.',
    };
  }

  if (stableTicks >= BALANCE.gameplay.success.stableTicks) {
    return {
      kind: 'success',
      tone: 'success',
      title: 'Città autosufficiente',
      message: 'Popolazione, risorse e servizi sono stabili. Puoi espanderti o cercare uno skyline più ambizioso.',
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
    title: 'Obiettivo · città autosufficiente',
    message: missing > 0
      ? `Porta ogni classe ad almeno ${BALANCE.gameplay.success.buildingsPerClass} edifici e la popolazione a ${BALANCE.gameplay.success.population}.`
      : `Mantieni per ${Math.ceil((BALANCE.gameplay.success.stableTicks - stableTicks) / 10)} secondi cibo, materiali e fondi in pareggio.`,
  };
}
