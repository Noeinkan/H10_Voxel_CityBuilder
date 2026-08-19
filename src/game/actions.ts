import {
  addCatalyst,
  BALANCE,
  policyById,
  setPolicyActive,
  type BuildingClass,
  type PolicyId,
  type SimState,
} from '../sim';
import type { TerrainMap } from '../world/terrain/TerrainMap';

export type ActionFailure =
  | 'terrain-loading'
  | 'not-buildable'
  | 'too-close'
  | 'insufficient-funds'
  | 'population-required'
  | 'already-active'
  | 'already-unlocked'
  | 'onboarding-order';

export type ActionResult =
  | { readonly success: true; readonly state: SimState }
  | { readonly success: false; readonly reason: ActionFailure };

export function placeCatalyst(
  state: SimState,
  map: TerrainMap,
  x: number,
  y: number,
  cls: BuildingClass,
): ActionResult {
  const failure = catalystFailure(state, map, x, y, cls);
  if (failure !== null) return { success: false, reason: failure };

  const cost = BALANCE.gameplay.catalyst.cost[cls];
  const paid = spendFunds(state, cost);
  return {
    success: true,
    state: addCatalyst(paid, {
      x,
      y,
      class: cls,
      strength: BALANCE.gameplay.catalyst.strength[cls],
      radius: BALANCE.gameplay.catalyst.radius[cls],
    }),
  };
}

/** Stessa convalida usata dal click, esposta per il feedback sul cursore. */
export function catalystFailure(
  state: SimState,
  map: TerrainMap,
  x: number,
  y: number,
  cls: BuildingClass,
): ActionFailure | null {
  const column = map.columnAt(x, y);
  if (column === null) return 'terrain-loading';
  if (!column.buildable) return 'not-buildable';

  const minDistance = BALANCE.gameplay.catalyst.minDistance;
  for (const catalyst of state.catalysts) {
    if (catalyst.class !== cls) continue;
    if (Math.max(Math.abs(catalyst.x - x), Math.abs(catalyst.y - y)) < minDistance) {
      return 'too-close';
    }
  }

  const cost = BALANCE.gameplay.catalyst.cost[cls];
  if (state.funds.stock < cost) return 'insufficient-funds';
  return null;
}

export function togglePolicy(state: SimState, id: PolicyId): ActionResult {
  if (state.policies.includes(id)) {
    return { success: true, state: setPolicyActive(state, id, false) };
  }

  const requirement = BALANCE.gameplay.policy[id];
  if (state.population.stock < requirement.population) {
    return { success: false, reason: 'population-required' };
  }
  if (state.funds.stock < requirement.cost) {
    return { success: false, reason: 'insufficient-funds' };
  }

  // Convalida anche il catalogo prima di trasferire la proprieta' del campo.
  policyById(id);
  return { success: true, state: setPolicyActive(spendFunds(state, requirement.cost), id, true) };
}

export function buyExpansion(state: SimState, alreadyUnlocked = false): ActionResult {
  const failure = expansionFailure(state, alreadyUnlocked);
  if (failure !== null) return { success: false, reason: failure };
  return { success: true, state: spendFunds(state, BALANCE.gameplay.expansion.cost) };
}

export function expansionFailure(state: SimState, alreadyUnlocked = false): ActionFailure | null {
  if (alreadyUnlocked) return 'already-unlocked';
  const requirement = BALANCE.gameplay.expansion;
  if (state.population.stock < requirement.population) {
    return 'population-required';
  }
  if (state.funds.stock < requirement.cost) {
    return 'insufficient-funds';
  }
  return null;
}

function spendFunds(state: SimState, cost: number): SimState {
  return { ...state, funds: { stock: state.funds.stock - cost, delta: state.funds.delta } };
}
