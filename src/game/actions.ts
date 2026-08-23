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
import { buildWeightOf, GROUND, groundKindOf, type GroundKind } from '../world/grading/grade';
import { siteRefusal } from '../world/sites/siteRules';
import type { TerrainMap } from '../world/terrain/TerrainMap';

/**
 * I due rifiuti dello sventramento non li produce questo file, e non e' una
 * dimenticanza: parlano di livelli e di strutture, cioe' di cose che stanno nel
 * registry, e `src/game/actions.ts` un registry non ce l'ha. Li produce il
 * Builder e li compone `GrowthScene`, come gia' compone l'ordine del tutorial.
 * Il vocabolario pero' e' uno solo, e sta qui: e' cio' che l'HUD traduce.
 */
export type ActionFailure =
  | 'terrain-loading'
  | 'not-buildable'
  | 'needs-coast'
  | 'needs-open-ground'
  | 'too-close'
  | 'block-too-tall'
  | 'structure-in-the-way'
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

  // Il prezzo e' quello che il cursore mostrava: si ricalcola dalla stessa
  // colonna invece di fidarsi del listino, altrimenti la mesa si pagherebbe
  // come il prato appena il click arriva.
  const site = catalystSiteCost(map, x, y, target);
  const paid = spendFunds(state, site === null ? definition.cost : site.cost);
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

/** Cosa chiede il terreno sotto una colonna, e quanto costa costruirci. */
export interface SiteCost {
  readonly ground: GroundKind;
  /** Moltiplicatore applicato al listino. `Infinity` dove non si costruisce. */
  readonly weight: number;
  /** Prezzo effettivo, gia' pesato e arrotondato. */
  readonly cost: number;
}

/**
 * Prezzo di un catalizzatore su una colonna, o null se non e' ancora generata.
 *
 * Su terreno rifiutato il prezzo torna al listino: e' un numero che nessuno
 * paghera' mai — `catalystFailure` blocca prima — e serve solo perche' il
 * cursore mostri un cartellino invece di `Infinity` mentre spiega il rifiuto.
 */
export function catalystSiteCost(
  map: TerrainMap,
  x: number,
  y: number,
  target: BuildingClass | CatalystId,
): SiteCost | null {
  const definition = catalystDefinition(target);
  const column = map.columnAt(x, y);
  if (column === null) return null;

  const ground = groundKindOf(column.biome, column.slope, column.height);
  const weight = buildWeightOf(ground);
  const cost = Number.isFinite(weight) ? Math.round(definition.cost * weight) : definition.cost;
  return { ground, weight, cost };
}

/**
 * Stessa convalida usata dal click, esposta per il feedback sul cursore.
 *
 * Il bit `buildable` della `TerrainMap` non decide piu' niente qui: diceva
 * "piano e asciutto per costruzione", e su una mesa piana rispondeva no per
 * via della sola quota. Adesso decide `groundKindOf`, la stessa funzione con
 * cui il Builder sceglie i lotti, cosi' il giocatore e la citta' automatica
 * rifiutano le stesse colonne invece di due insiemi diversi.
 *
 * Sopra quel giudizio, uguale per tutti, sta il vincolo del **ruolo**: da quando
 * il terreno si paga invece di essere vietato, "ci si puo' costruire" ha smesso
 * di implicare "ha senso costruirci questo". I due controlli restano distinti
 * anche nell'ordine — prima cosa regge il terreno, poi cosa ci sta — perche'
 * sono due rifiuti diversi e il giocatore deve leggere quello giusto.
 */
export function catalystFailure(
  state: SimState,
  map: TerrainMap,
  x: number,
  y: number,
  target: BuildingClass | CatalystId,
): ActionFailure | null {
  const definition = catalystDefinition(target);
  const site = catalystSiteCost(map, x, y, target);
  if (site === null) return 'terrain-loading';
  if (site.ground === GROUND.refused) return 'not-buildable';

  // Il vincolo di sito precede quello di distanza: e' una proprieta' del luogo,
  // mentre la distanza e' una proprieta' della citta' gia' costruita, e sentirsi
  // dire "troppo vicino a un altro porto" dove un porto non starebbe comunque
  // manderebbe a cercare spazio invece che acqua.
  const refusal = siteRefusal(map, x, y, definition.site);
  if (refusal !== null) return refusal;

  const minDistance = BALANCE.gameplay.catalyst.minDistance;
  for (const catalyst of state.catalysts) {
    const kind = catalyst.kind ?? defaultCatalystOfClass(catalyst.class);
    if (kind !== definition.id) continue;
    if (Math.max(Math.abs(catalyst.x - x), Math.abs(catalyst.y - y)) < minDistance) {
      return 'too-close';
    }
  }

  if (state.funds.stock < site.cost) return 'insufficient-funds';
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

/**
 * Primo sito accettabile per l'opera concessa da una decisione, o null.
 *
 * L'opera non si paga — il prezzo l'ha gia' pagato l'alternativa scelta — ma
 * tutto il resto della convalida resta: il terreno deve reggere e la distanza
 * minima dal proprio ruolo va rispettata, altrimenti una decisione poserebbe un
 * mercato dentro un mercato. E' per questo che l'unico rifiuto ammesso e'
 * quello sui fondi.
 */
export function grantSite(
  state: SimState,
  map: TerrainMap,
  kind: CatalystId,
  sites: readonly { readonly x: number; readonly y: number }[],
): { readonly x: number; readonly y: number } | null {
  for (const site of sites) {
    const failure = catalystFailure(state, map, site.x, site.y, kind);
    if (failure === null || failure === 'insufficient-funds') return site;
  }
  return null;
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
