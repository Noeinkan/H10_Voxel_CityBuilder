import { BALANCE } from './balance';
import { BUILDING_CLASS, type BuildingClass } from './classes';
import type { DecisionStateView } from './decisions';
import { fedShareOf, foodDeficitOf } from './farms';
import { resolveWeights, type PolicyId } from './policies';

/**
 * Le domande che un evento fa alla citta'.
 *
 * Il bacino di eventi si qualifica su condizioni, e una condizione scritta
 * dentro la voce di catalogo — `state.funds.stock < 0 && state.flows.paid > ...`
 * — sarebbe una riga illeggibile ripetuta con piccole varianti in dieci punti.
 * Qui ogni affanno della citta' ha un nome e una definizione sola: le voci del
 * catalogo dicono *quale* affanno le riguarda, non come si misura.
 *
 * **Nessuna di queste funzioni e' uno stato.** Sono letture della fotografia che
 * `tick` ha appena scritto: non si salvano, non si invalidano, e chiederle due
 * volte nello stesso tick da' due volte lo stesso numero. I fronti veri — quello
 * alimentare e quello del declino — restano dove sono, in `supplyArmed` e
 * `decayPressure`, perche' quelli hanno bisogno di memoria.
 */

/** Capacita' efficace di un uso, quota per uso misto compresa. */
export function effectiveCapacity(state: DecisionStateView, cls: BuildingClass): number {
  const mixed = state.mixedCapacityCounts[cls] ?? 0;
  return (state.capacityCounts[cls] ?? 0) + mixed * BALANCE.mixedUse.secondaryShare;
}

/**
 * Quanto sono piene le case, in quota di capacita'.
 *
 * Sopra `triggers.crowdingRatio` la citta' e' satura: e' la condizione in cui
 * `denseHousing` smette di essere una comodita' e diventa l'unica cosa che tiene
 * su la crescita — e anche il momento in cui il suo prezzo si sente.
 */
export function housingPressure(state: DecisionStateView): number {
  const weights = resolveWeights(state.policies);
  const capacity = effectiveCapacity(state, BUILDING_CLASS.residential)
    * weights.residentialCapacity;
  if (capacity <= 0) return state.population.stock > 0 ? 1 : 0;
  return state.population.stock / capacity;
}

/**
 * Per quanti tick la cassa regge il ritmo di adesso, o `Infinity` se cresce.
 *
 * **Il saldo da solo non e' una crisi.** Una citta' che investe lo ha negativo
 * per costruzione, e un evento che scattasse li' suonerebbe a ogni cantiere. La
 * crisi e' l'autonomia: quanto manca alla cassa vuota se niente cambia.
 */
export function fundsRunway(state: DecisionStateView): number {
  const net = state.funds.delta;
  if (net >= 0) return Number.POSITIVE_INFINITY;
  return state.funds.stock / -net;
}

/** Vero quando la cassa non regge oltre la soglia d'allarme. */
export function budgetAlarm(state: DecisionStateView): boolean {
  return fundsRunway(state) < BALANCE.decisions.triggers.fundsRunwayTicks;
}

/** Vero quando la citta' e' scontenta abbastanza da farne un evento. */
export function unrest(state: DecisionStateView): boolean {
  return state.satisfaction < BALANCE.decisions.triggers.unrestSatisfaction;
}

/** Vero quando i civici non coprono piu' la citta' che hanno intorno. */
export function civicStrain(state: DecisionStateView): boolean {
  return state.coverageReport.ratio < BALANCE.decisions.triggers.coverageStrain
    && (state.buildingCounts[BUILDING_CLASS.civic] ?? 0) > 0;
}

/**
 * Vero quando la campagna non basta all'anno medio.
 *
 * E' la meta' **strutturale** della condizione di carestia: senza, la resa
 * stagionale farebbe dell'emergenza un appuntamento invernale che la primavera
 * risolve da sola. `foodDeficitOf` non passa il fattore di stagione apposta.
 */
export function shortCountryside(state: DecisionStateView): boolean {
  return foodDeficitOf(state.population.stock, state.farmCounts, state.staffing) > 0;
}

/** Quanta della domanda alimentare l'ultimo raccolto ha davvero servito. */
export function fedShare(state: DecisionStateView): number {
  return fedShareOf(state.harvest, state.population.stock);
}

/** Vero quando la citta' raccoglie molto piu' di quanto mangia. */
export function harvestSurplus(state: DecisionStateView): boolean {
  const demand = state.population.stock * BALANCE.food.perResident;
  if (demand <= 0) return false;
  const grown = state.harvest.grown.reduce((sum, value) => sum + value, 0);
  return grown / demand >= BALANCE.decisions.triggers.surplusCoverage;
}

/**
 * Vero quando i cantieri restano senza materiali.
 *
 * Si guarda la **riserva** e non lo stock: la riserva e' cio' che gli edifici in
 * piedi pretendono per non degradare, e finirci sotto e' esattamente il momento
 * in cui costruire ancora smette di essere possibile.
 */
export function materialsStalled(state: DecisionStateView): boolean {
  return state.materials.stock < BALANCE.decisions.triggers.materialReserveFloor
    && state.materialFlows.produced < state.materialFlows.upkeep;
}

/** Vero quando la policy e' in piedi e non e' bloccata da un evento. */
export function policyActive(state: DecisionStateView, id: PolicyId): boolean {
  return state.policies.includes(id);
}

/** Tick fino a cui la policy resta bloccata, o zero. */
export function policyLockedUntil(state: DecisionStateView, id: PolicyId): number {
  return state.policyLocks.find((lock) => lock.id === id)?.until ?? 0;
}

/** Vero quando un evento ha bloccato la policy e il blocco non e' ancora scaduto. */
export function policyLocked(state: DecisionStateView, id: PolicyId): boolean {
  return policyLockedUntil(state, id) > state.tickCount;
}

/**
 * Vero quando la citta' e' abbastanza grande da riformare il proprio consiglio.
 *
 * E' l'unica condizione del catalogo che guarda solo una taglia: le occasioni
 * non descrivono un guasto, e pretendere anche un affanno le renderebbe
 * irraggiungibili proprio nelle partite che vanno bene.
 */
export function councilReady(state: DecisionStateView): boolean {
  return state.population.stock >= BALANCE.decisions.triggers.councilPopulation
    && (state.buildingCounts[BUILDING_CLASS.civic] ?? 0) > 0;
}
