import { BALANCE } from './balance';
import type { CatalystId } from './catalysts';
import { type CharterFamily, type CharterId } from './charters';
import { BUILDING_CLASS } from './classes';

export interface DecisionEffect {
  readonly food?: number;
  readonly materials?: number;
  readonly funds?: number;
  readonly satisfaction?: number;
}

/**
 * L'opera che un'alternativa fa costruire davvero sul terreno.
 *
 * Solo il ruolo: forza e raggio vengono da `BALANCE.decisions.grant` e la
 * classe da `catalystById`, cosi' un'opera non puo' raccontare di un mercato
 * diverso da quello della toolbar.
 */
export interface DecisionGrant {
  readonly kind: CatalystId;
}

export interface DecisionOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly effect: DecisionEffect;
  /**
   * Mandato concesso, o `null` per revocare quello della famiglia.
   *
   * Assente significa «non tocca lo slot»; `null` significa «lo svuota», ed e'
   * cio' che rende l'alternativa «non fare niente» una scelta con un effetto
   * invece di un ramo morto.
   */
  readonly charter?: CharterId | null;
  readonly grant?: DecisionGrant;
}

export interface CityDecision {
  readonly id: string;
  /** Slot che la scelta occupa. Una famiglia tiene un solo mandato per volta. */
  readonly family: CharterFamily;
  readonly title: string;
  readonly message: string;
  readonly options: readonly DecisionOption[];
}

export interface DecisionOutcome {
  readonly tick: number;
  readonly decisionId: string;
  /** Famiglia della decisione risolta: e' lo slot che quella scelta ha occupato. */
  readonly family: CharterFamily;
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
      family: 'supply',
      title: 'Supplies under pressure',
      message: 'The city food reserve no longer covers its residents. Choose an emergency response.',
      options: [
        option('buy-food', 'Buy food supplies', 'Spend funds to restock the warehouses immediately.', {
          funds: -BALANCE.decisions.decisionCost * scale,
          food: BALANCE.decisions.foodGrant * scale,
        }, { charter: 'importedSupply' }),
        option('ration', 'Ration supplies', 'Preserve resources at the cost of happiness.', {
          satisfaction: -BALANCE.decisions.satisfactionStep,
          food: BALANCE.decisions.foodGrant,
        }, { charter: 'rationing' }),
        option('community-gardens', 'Community gardens', 'Convert materials into food and public support.', {
          materials: -BALANCE.decisions.materialGrant,
          food: BALANCE.decisions.foodGrant,
          satisfaction: BALANCE.decisions.satisfactionStep,
        }, { charter: 'communityGardens', grant: { kind: 'park' } }),
      ],
    };
  }

  const publicSpaceAvailable = population >= BALANCE.decisions.populationScale
    && (state.buildingCounts[BUILDING_CLASS.civic] ?? 0) > 0;
  const investmentAvailable = buildings >= BALANCE.decisions.minimumBuildings
    && (state.buildingCounts[BUILDING_CLASS.industrial] ?? 0) > 0;
  if (!publicSpaceAvailable && !investmentAvailable) return null;

  // La famiglia dell'ultima decisione risolta, non il prefisso del suo id: da
  // quando ogni decisione dichiara il proprio slot, la rotazione fra le due
  // scelte contestuali si legge dal campo invece che da una stringa.
  const lastFamily = state.decisionHistory.at(-1)?.family;
  if (publicSpaceAvailable && (lastFamily !== 'publicSpace' || !investmentAvailable)) {
    return {
      id: `public-space-${state.tickCount}`,
      family: 'publicSpace',
      title: 'A contested square',
      message: 'A growing civic district needs a use for its new public square.',
      options: [
        option('festival', 'Fund a festival', 'Spend funds to increase happiness.', {
          funds: -BALANCE.decisions.decisionCost,
          satisfaction: BALANCE.decisions.satisfactionStep,
        }, { charter: 'festivalGrounds' }),
        option('materials-market', 'Lease it to the market', 'Gain funds by trading away materials.', {
          materials: -BALANCE.decisions.materialGrant,
          funds: BALANCE.decisions.fundsGrant,
        }, { charter: 'leasedSquare', grant: { kind: 'market' } }),
        // L'unica alternativa che *toglie*: tenere la piazza libera revoca il
        // mandato della famiglia invece di non fare niente.
        option('leave-open', 'Keep the space open', 'No cost: the city retains flexibility.', {},
          { charter: null }),
      ],
    };
  }

  if (!investmentAvailable) return null;
  return {
    id: `investment-${state.tickCount}`,
    family: 'investment',
    title: 'Neighborhood investment',
    message: `The city now has ${buildings} buildings. Choose where to direct its next investment.`,
    options: [
      option('local-grant', 'Support local shops', 'Convert funds into materials and public trust.', {
        funds: -BALANCE.decisions.decisionCost,
        materials: BALANCE.decisions.materialGrant,
        satisfaction: BALANCE.decisions.satisfactionStep,
      }, { charter: 'localShops', grant: { kind: 'market' } }),
      option('sell-reserve', 'Sell the reserves', 'Gain immediate funds by consuming materials.', {
        materials: -BALANCE.decisions.materialGrant,
        funds: BALANCE.decisions.fundsGrant,
      }, { charter: 'soldReserves' }),
      option('food-fair', 'Food fair', 'Use food supplies to strengthen morale.', {
        food: -BALANCE.decisions.foodGrant,
        satisfaction: BALANCE.decisions.satisfactionStep,
      }, { charter: 'foodFair' }),
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
  mark: { readonly charter?: CharterId | null; readonly grant?: DecisionGrant } = {},
): DecisionOption {
  return { id, label, description, effect, ...mark };
}
