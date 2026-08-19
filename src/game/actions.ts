import {
  addCatalyst,
  BALANCE,
  catalystById,
  defaultCatalystOfClass,
  policyConflict,
  policyById,
  resolveDecision,
  setPolicyActive,
  setTradeMode,
  type BuildingClass,
  type CatalystId,
  type PolicyId,
  type SimState,
  type TradeMode,
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
  | 'onboarding-order'
  | 'policy-incompatible'
  | 'decision-option-invalid';

export type ActionResult =
  | { readonly success: true; readonly state: SimState }
  | { readonly success: false; readonly reason: ActionFailure };

export function placeCatalyst(
  state: SimState,
  map: TerrainMap,
  x: number,
  y: number,
  target: BuildingClass | CatalystId,
): ActionResult {
  const definition = catalystDefinition(target);
  const failure = catalystFailure(state, map, x, y, target);
  if (failure !== null) return { success: false, reason: failure };

  const paid = spendFunds(state, definition.cost);
  return {
    success: true,
    state: addCatalyst(paid, {
      x,
      y,
      class: definition.class,
      kind: definition.id,
      strength: definition.strength,
      radius: definition.radius,
    }),
  };
}

/** Stessa convalida usata dal click, esposta per il feedback sul cursore. */
export function catalystFailure(
  state: SimState,
  map: TerrainMap,
  x: number,
  y: number,
  target: BuildingClass | CatalystId,
): ActionFailure | null {
  const definition = catalystDefinition(target);
  const column = map.columnAt(x, y);
  if (column === null) return 'terrain-loading';
  if (!column.buildable) return 'not-buildable';

  const minDistance = BALANCE.gameplay.catalyst.minDistance;
  for (const catalyst of state.catalysts) {
    const kind = catalyst.kind ?? defaultCatalystOfClass(catalyst.class);
    if (kind !== definition.id) continue;
    if (Math.max(Math.abs(catalyst.x - x), Math.abs(catalyst.y - y)) < minDistance) {
      return 'too-close';
    }
  }

  if (state.funds.stock < definition.cost) return 'insufficient-funds';
  return null;
}

export function togglePolicy(state: SimState, id: PolicyId): ActionResult {
  if (state.policies.includes(id)) {
    return { success: true, state: setPolicyActive(state, id, false) };
  }

  const requirement = BALANCE.gameplay.policy[id];
  if (policyConflict(state.policies, id) !== null) {
    return { success: false, reason: 'policy-incompatible' };
  }
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

export function chooseDecision(state: SimState, optionId: string): ActionResult {
  const next = resolveDecision(state, optionId);
  return next === null
    ? { success: false, reason: 'decision-option-invalid' }
    : { success: true, state: next };
}

export function changeTradeMode(state: SimState, mode: TradeMode): ActionResult {
  return { success: true, state: setTradeMode(state, mode) };
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

function catalystDefinition(target: BuildingClass | CatalystId) {
  return catalystById(typeof target === 'number' ? defaultCatalystOfClass(target) : target);
}
