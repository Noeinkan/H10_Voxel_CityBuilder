import { BALANCE } from './balance';
import type { BuildingClass } from './classes';

/**
 * Policy: moltiplicatori nominati sui pesi della simulazione.
 *
 * Il catalogo e' fisso e vive qui; i valori dei moltiplicatori vivono in
 * `BALANCE.policyMultipliers`, perche' `balance.ts` resta l'unico posto con dei
 * numeri. Lo stato tiene solo la lista degli `id` attivi.
 *
 * **Perche' i pesi si ricalcolano da zero.** Disattivare una policy non divide
 * il peso corrente per il suo moltiplicatore: `resolveWeights` riparte sempre
 * dal valore base e rimoltiplica le policy attive nell'ordine del catalogo.
 * Dividere accumulerebbe errore di virgola mobile a ogni giro, e il criterio
 * "spegnere tutto e riaccendere tutto riporta ai pesi esatti di partenza"
 * cadrebbe dopo poche oscillazioni. Cosi' invece vale bit a bit, e l'ordine in
 * cui il giocatore attiva le policy non cambia il risultato.
 */

/** Identificatori dei pesi su cui una policy puo' agire. */
export type WeightId = keyof typeof BALANCE.weights;

/** I pesi risolti di un tick: stessa forma di `BALANCE.weights`, valori effettivi. */
export type Weights = Readonly<Record<WeightId, number>>;

export type PolicyId = keyof typeof BALANCE.policyMultipliers;

export interface Policy {
  readonly id: PolicyId;
  /** Etichetta per l'overlay di debug. */
  readonly label: string;
  readonly weight: WeightId;
  readonly multiplier: number;
  readonly upkeep: number;
  readonly incompatibleWith: readonly PolicyId[];
  readonly spatialEffect: string;
}

/**
 * Catalogo delle policy, in ordine fisso.
 *
 * L'ordine e' parte del contratto: `resolveWeights` moltiplica sempre in questa
 * sequenza, ed e' quello che rende il prodotto indipendente dall'ordine di
 * attivazione.
 */
export const POLICIES: readonly Policy[] = [
  {
    id: 'denseHousing',
    label: 'dense housing',
    weight: 'residentialCapacity',
    multiplier: BALANCE.policyMultipliers.denseHousing,
    upkeep: BALANCE.gameplay.policy.denseHousing.upkeep,
    incompatibleWith: ['greenBelt'],
    spatialEffect: 'Increases density and height within residential influence fields.',
  },
  {
    id: 'industrialSubsidy',
    label: 'industrial subsidy',
    weight: 'productionYield',
    multiplier: BALANCE.policyMultipliers.industrialSubsidy,
    upkeep: BALANCE.gameplay.policy.industrialSubsidy.upkeep,
    incompatibleWith: ['greenBelt'],
    spatialEffect: 'Strengthens districts around factories and the port.',
  },
  {
    id: 'austerity',
    label: 'austerity',
    weight: 'civicUpkeep',
    multiplier: BALANCE.policyMultipliers.austerity,
    upkeep: BALANCE.gameplay.policy.austerity.upkeep,
    incompatibleWith: ['civicPride'],
    spatialEffect: 'Reduces local quality around civic services.',
  },
  {
    id: 'greenBelt',
    label: 'green belt',
    weight: 'desirabilityResidential',
    multiplier: BALANCE.policyMultipliers.greenBelt,
    upkeep: BALANCE.gameplay.policy.greenBelt.upkeep,
    incompatibleWith: ['denseHousing', 'industrialSubsidy'],
    spatialEffect: 'Improves livability and limits density near parks.',
  },
  {
    id: 'zoningRelief',
    label: 'zoning relief',
    weight: 'desirabilityIndustrial',
    multiplier: BALANCE.policyMultipliers.zoningRelief,
    upkeep: BALANCE.gameplay.policy.zoningRelief.upkeep,
    incompatibleWith: [],
    spatialEffect: 'Increases industrial density at a cost to livability.',
  },
  {
    id: 'civicPride',
    label: 'civic pride',
    weight: 'desirabilityCivic',
    multiplier: BALANCE.policyMultipliers.civicPride,
    upkeep: BALANCE.gameplay.policy.civicPride.upkeep,
    incompatibleWith: ['austerity'],
    spatialEffect: 'Makes civic centers wealthier and happier.',
  },
  {
    id: 'marketCharter',
    label: 'market charter',
    weight: 'desirabilityCommercial',
    multiplier: BALANCE.policyMultipliers.marketCharter,
    upkeep: BALANCE.gameplay.policy.marketCharter.upkeep,
    incompatibleWith: ['austerity'],
    spatialEffect: 'Widens the commercial fields and makes mixed-use blocks more likely.',
  },
];

/** Peso di desiderabilita' corrispondente a ciascun uso urbano, per indice. */
export const DESIRABILITY_WEIGHT_OF_CLASS: readonly WeightId[] = [
  'desirabilityResidential',
  'desirabilityCommercial',
  'desirabilityIndustrial',
  'desirabilityCivic',
];

/** Uso toccato da un peso, o -1 se il peso non riguarda il campo. */
export function classOfWeight(weight: WeightId): BuildingClass | -1 {
  const found = DESIRABILITY_WEIGHT_OF_CLASS.indexOf(weight);
  return found === -1 ? -1 : (found as BuildingClass);
}

export function isPolicyId(value: string): value is PolicyId {
  return POLICIES.some((policy) => policy.id === value);
}

export function policyById(id: PolicyId): Policy {
  const found = POLICIES.find((policy) => policy.id === id);
  // Il tipo lo garantisce; il throw copre solo un catalogo modificato a meta'.
  if (found === undefined) throw new Error(`unknown policy: ${id}`);
  return found;
}

/** Prima policy attiva incompatibile con `id`, o null. */
export function policyConflict(active: readonly PolicyId[], id: PolicyId): PolicyId | null {
  const policy = policyById(id);
  for (const candidate of active) {
    if (policy.incompatibleWith.includes(candidate) || policyById(candidate).incompatibleWith.includes(id)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Pesi effettivi date le policy attive.
 *
 * Parte dai valori base e applica i moltiplicatori delle policy attive
 * nell'ordine del catalogo. Non guarda l'ordine della lista in ingresso.
 */
export function resolveWeights(active: readonly PolicyId[]): Weights {
  const out: Record<WeightId, number> = { ...BALANCE.weights };
  for (const policy of POLICIES) {
    if (!active.includes(policy.id)) continue;
    out[policy.weight] *= policy.multiplier;
  }
  return out;
}

/**
 * Lista di policy attive con `id` acceso o spento, sempre in ordine di catalogo.
 *
 * L'ordine canonico serve al confronto per uguaglianza profonda: due stati con
 * le stesse policy attive devono avere la stessa lista, non due permutazioni.
 */
export function withPolicy(
  active: readonly PolicyId[],
  id: PolicyId,
  enabled: boolean,
): readonly PolicyId[] {
  const wanted = new Set(active);
  if (enabled) wanted.add(id);
  else wanted.delete(id);

  const out: PolicyId[] = [];
  for (const policy of POLICIES) {
    if (wanted.has(policy.id)) out.push(policy.id);
  }
  return out;
}
