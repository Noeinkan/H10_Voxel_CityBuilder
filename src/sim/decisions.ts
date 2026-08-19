import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';

export interface DecisionEffect {
  readonly food?: number;
  readonly materials?: number;
  readonly funds?: number;
  readonly satisfaction?: number;
}

export interface DecisionOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly effect: DecisionEffect;
}

export interface CityDecision {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly options: readonly DecisionOption[];
}

export interface DecisionOutcome {
  readonly tick: number;
  readonly decisionId: string;
  readonly optionId: string;
  readonly summary: string;
}

export interface DecisionStateView {
  readonly tickCount: number;
  readonly population: { readonly stock: number };
  readonly food: { readonly stock: number };
  readonly materials: { readonly stock: number };
  readonly funds: { readonly stock: number };
  readonly buildingCounts: readonly number[];
  readonly decisionHistory: readonly DecisionOutcome[];
}

/** Apre una scelta soltanto alla scadenza; la scelta resta ferma finche' il giocatore risponde. */
export function decisionAt(state: DecisionStateView, nextDecisionTick: number): CityDecision | null {
  if (state.tickCount < nextDecisionTick) return null;
  const population = state.population.stock;
  const buildings = state.buildingCounts.reduce((sum, value) => sum + value, 0);
  const scale = Math.max(1, Math.floor(state.population.stock / BALANCE.decisions.populationScale));
  if (population > 0 && state.food.stock < population * BALANCE.trade.foodReservePerResident) {
    return {
      id: `food-${state.tickCount}`,
      title: 'Supplies under pressure',
      message: 'The city food reserve no longer covers its residents. Choose an emergency response.',
      options: [
        option('buy-food', 'Buy food supplies', 'Spend funds to restock the warehouses immediately.', {
          funds: -BALANCE.decisions.decisionCost * scale,
          food: BALANCE.decisions.foodGrant * scale,
        }),
        option('ration', 'Ration supplies', 'Preserve resources at the cost of happiness.', {
          satisfaction: -BALANCE.decisions.satisfactionStep,
          food: BALANCE.decisions.foodGrant,
        }),
        option('community-gardens', 'Community gardens', 'Convert materials into food and public support.', {
          materials: -BALANCE.decisions.materialGrant,
          food: BALANCE.decisions.foodGrant,
          satisfaction: BALANCE.decisions.satisfactionStep,
        }),
      ],
    };
  }

  const publicSpaceAvailable = population >= BALANCE.decisions.populationScale
    && (state.buildingCounts[BUILDING_CLASS.civic] ?? 0) > 0;
  const investmentAvailable = buildings >= BALANCE.decisions.minimumBuildings
    && (state.buildingCounts[BUILDING_CLASS.production] ?? 0) > 0;
  if (!publicSpaceAvailable && !investmentAvailable) return null;

  const lastDecisionId = state.decisionHistory.at(-1)?.decisionId ?? '';
  const publicSpaceWasLast = lastDecisionId.startsWith('public-space-');
  if (publicSpaceAvailable && (!publicSpaceWasLast || !investmentAvailable)) {
    return {
      id: `public-space-${state.tickCount}`,
      title: 'A contested square',
      message: 'A growing civic district needs a use for its new public square.',
      options: [
        option('festival', 'Fund a festival', 'Spend funds to increase happiness.', {
          funds: -BALANCE.decisions.decisionCost,
          satisfaction: BALANCE.decisions.satisfactionStep,
        }),
        option('materials-market', 'Lease it to the market', 'Gain funds by trading away materials.', {
          materials: -BALANCE.decisions.materialGrant,
          funds: BALANCE.decisions.fundsGrant,
        }),
        option('leave-open', 'Keep the space open', 'No cost: the city retains flexibility.', {}),
      ],
    };
  }

  if (!investmentAvailable) return null;
  return {
    id: `investment-${state.tickCount}`,
    title: 'Neighborhood investment',
    message: `The city now has ${buildings} buildings. Choose where to direct its next investment.`,
    options: [
      option('local-grant', 'Support local shops', 'Convert funds into materials and public trust.', {
        funds: -BALANCE.decisions.decisionCost,
        materials: BALANCE.decisions.materialGrant,
        satisfaction: BALANCE.decisions.satisfactionStep,
      }),
      option('sell-reserve', 'Sell the reserves', 'Gain immediate funds by consuming materials.', {
        materials: -BALANCE.decisions.materialGrant,
        funds: BALANCE.decisions.fundsGrant,
      }),
      option('food-fair', 'Food fair', 'Use food supplies to strengthen morale.', {
        food: -BALANCE.decisions.foodGrant,
        satisfaction: BALANCE.decisions.satisfactionStep,
      }),
    ],
  };
}

export function decisionOption(decision: CityDecision, id: string): DecisionOption | null {
  return decision.options.find((option) => option.id === id) ?? null;
}

function option(
  id: string,
  label: string,
  description: string,
  effect: DecisionEffect,
): DecisionOption {
  return { id, label, description, effect };
}
