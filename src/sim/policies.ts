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

/**
 * Il prezzo di una policy, pagato in un secondo peso.
 *
 * Il verso lo detta il peso: su `civicUpkeep` — dove alto vuol dire costoso —
 * uno scambio e' un moltiplicatore maggiore di uno.
 */
export interface PolicyTradeoff {
  readonly weight: WeightId;
  readonly multiplier: number;
}

export interface Policy {
  readonly id: PolicyId;
  /** Etichetta per l'overlay di debug. */
  readonly label: string;
  readonly weight: WeightId;
  readonly multiplier: number;
  /**
   * Il peso che la policy peggiora.
   *
   * Nessuna policy ne e' priva, ed e' deliberato: una voce di catalogo senza
   * contropartita e' un bottone che si preme una volta sola, e sette bottoni
   * cosi' erano il motivo per cui il pannello non si riapriva.
   */
  readonly tradeoff: PolicyTradeoff;
  readonly upkeep: number;
  readonly incompatibleWith: readonly PolicyId[];
  readonly spatialEffect: string;
  /** La contropartita in una frase, per la scheda. */
  readonly tradeoffEffect: string;
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
    tradeoff: BALANCE.policyTradeoffs.denseHousing,
    upkeep: BALANCE.gameplay.policy.denseHousing.upkeep,
    incompatibleWith: ['greenBelt', 'heritageCode'],
    spatialEffect: 'Increases density and height within residential influence fields.',
    tradeoffEffect: 'Crowded blocks are less desirable to live in.',
  },
  {
    id: 'industrialSubsidy',
    label: 'industrial subsidy',
    weight: 'productionYield',
    multiplier: BALANCE.policyMultipliers.industrialSubsidy,
    tradeoff: BALANCE.policyTradeoffs.industrialSubsidy,
    upkeep: BALANCE.gameplay.policy.industrialSubsidy.upkeep,
    incompatibleWith: ['greenBelt'],
    spatialEffect: 'Strengthens districts around factories and the port.',
    tradeoffEffect: 'Smoke and traffic push housing away.',
  },
  {
    id: 'austerity',
    label: 'austerity',
    weight: 'civicUpkeep',
    multiplier: BALANCE.policyMultipliers.austerity,
    tradeoff: BALANCE.policyTradeoffs.austerity,
    upkeep: BALANCE.gameplay.policy.austerity.upkeep,
    incompatibleWith: ['civicPride', 'transitPass'],
    spatialEffect: 'Reduces local quality around civic services.',
    tradeoffEffect: 'Civic districts lose their pull.',
  },
  {
    id: 'greenBelt',
    label: 'green belt',
    weight: 'desirabilityResidential',
    multiplier: BALANCE.policyMultipliers.greenBelt,
    tradeoff: BALANCE.policyTradeoffs.greenBelt,
    upkeep: BALANCE.gameplay.policy.greenBelt.upkeep,
    incompatibleWith: ['denseHousing', 'industrialSubsidy'],
    spatialEffect: 'Improves livability and limits density near parks.',
    tradeoffEffect: 'Each house holds fewer residents.',
  },
  {
    id: 'zoningRelief',
    label: 'zoning relief',
    weight: 'desirabilityIndustrial',
    multiplier: BALANCE.policyMultipliers.zoningRelief,
    tradeoff: BALANCE.policyTradeoffs.zoningRelief,
    upkeep: BALANCE.gameplay.policy.zoningRelief.upkeep,
    incompatibleWith: [],
    spatialEffect: 'Increases industrial density at a cost to livability.',
    tradeoffEffect: 'Shopfronts lose ground to workshops.',
  },
  {
    id: 'civicPride',
    label: 'civic pride',
    weight: 'desirabilityCivic',
    multiplier: BALANCE.policyMultipliers.civicPride,
    tradeoff: BALANCE.policyTradeoffs.civicPride,
    upkeep: BALANCE.gameplay.policy.civicPride.upkeep,
    incompatibleWith: ['austerity'],
    spatialEffect: 'Makes civic centers wealthier and happier.',
    tradeoffEffect: 'Every civic building costs more to run.',
  },
  {
    id: 'marketCharter',
    label: 'market charter',
    weight: 'desirabilityCommercial',
    multiplier: BALANCE.policyMultipliers.marketCharter,
    tradeoff: BALANCE.policyTradeoffs.marketCharter,
    upkeep: BALANCE.gameplay.policy.marketCharter.upkeep,
    incompatibleWith: ['austerity', 'tariffShield'],
    spatialEffect: 'Widens the commercial fields and makes mixed-use blocks more likely.',
    tradeoffEffect: 'Market noise makes nearby housing less desirable.',
  },
  {
    id: 'nightEconomy',
    label: 'night economy',
    weight: 'commercialCapacity',
    multiplier: BALANCE.policyMultipliers.nightEconomy,
    tradeoff: BALANCE.policyTradeoffs.nightEconomy,
    upkeep: BALANCE.gameplay.policy.nightEconomy.upkeep,
    incompatibleWith: ['heritageCode'],
    spatialEffect: 'Shops stay open late: busier, wealthier, louder blocks.',
    tradeoffEffect: 'Residents sleep badly and housing thins out.',
  },
  {
    id: 'tariffShield',
    label: 'tariff shield',
    weight: 'productionYield',
    multiplier: BALANCE.policyMultipliers.tariffShield,
    tradeoff: BALANCE.policyTradeoffs.tariffShield,
    upkeep: BALANCE.gameplay.policy.tariffShield.upkeep,
    incompatibleWith: ['marketCharter'],
    spatialEffect: 'Protected workshops spread across the industrial fronts.',
    tradeoffEffect: 'Shops serve fewer customers with imports taxed.',
  },
  {
    id: 'heritageCode',
    label: 'heritage code',
    weight: 'desirabilityCivic',
    multiplier: BALANCE.policyMultipliers.heritageCode,
    tradeoff: BALANCE.policyTradeoffs.heritageCode,
    upkeep: BALANCE.gameplay.policy.heritageCode.upkeep,
    incompatibleWith: ['denseHousing', 'nightEconomy'],
    spatialEffect: 'Low, ornate blocks around the civic core.',
    tradeoffEffect: 'Height limits cut how many a house can hold.',
  },
  {
    id: 'transitPass',
    label: 'transit pass',
    weight: 'desirabilityResidential',
    multiplier: BALANCE.policyMultipliers.transitPass,
    tradeoff: BALANCE.policyTradeoffs.transitPass,
    upkeep: BALANCE.gameplay.policy.transitPass.upkeep,
    incompatibleWith: ['austerity'],
    spatialEffect: 'Well-connected housing spreads further from the center.',
    tradeoffEffect: 'The subsidy lands on every civic budget.',
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
  // Prima tutti i guadagni, poi tutti i prezzi. L'ordine fra le due passate e'
  // parte del contratto quanto l'ordine del catalogo: una policy che guadagna
  // sul peso su cui un'altra sconta darebbe due prodotti diversi a seconda di
  // come si intreccino le due liste, e il criterio «spegnere tutto e riaccendere
  // tutto torna ai pesi esatti» cadrebbe.
  for (const policy of POLICIES) {
    if (!active.includes(policy.id)) continue;
    out[policy.weight] *= policy.multiplier;
  }
  for (const policy of POLICIES) {
    if (!active.includes(policy.id)) continue;
    out[policy.tradeoff.weight] *= policy.tradeoff.multiplier;
  }
  return out;
}

/**
 * Gli usi il cui campo cambia accendendo o spegnendo `id`.
 *
 * Sono due pesi, non piu' uno: il guadagno e il prezzo. Ricostruire solo il
 * primo lascerebbe il campo dell'altro uso fermo su un moltiplicatore che non
 * e' piu' quello attivo — un errore invisibile finche' non si guarda la heatmap.
 */
export function policyClasses(id: PolicyId): readonly BuildingClass[] {
  const policy = policyById(id);
  const out: BuildingClass[] = [];
  for (const weight of [policy.weight, policy.tradeoff.weight]) {
    const cls = classOfWeight(weight);
    if (cls !== -1 && !out.includes(cls)) out.push(cls);
  }
  return out;
}

/**
 * Quante policy la citta' sa tenere accese insieme.
 *
 * Cresce sui civici perche' governare e' una cosa che si **costruisce**: il
 * municipio, l'ufficio, la scuola sono cio' che rende un regolamento
 * applicabile. Il bonus arriva dai mandati di governo — un consiglio
 * d'emergenza ne concede uno in piu' — ed e' li' che eventi e policy si toccano
 * senza passare per le risorse.
 */
export function policySlots(civicBuildings: number, bonus = 0): number {
  const governance = BALANCE.gameplay.governance;
  const earned = governance.baseSlots
    + Math.floor(Math.max(0, civicBuildings) / governance.buildingsPerSlot)
    + Math.max(0, bonus);
  return Math.min(governance.maxSlots, earned);
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
