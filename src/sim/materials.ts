import { BALANCE } from './balance';
import { FARM_KIND } from './farms';
import type { Building, SimState } from './SimState';

/** Da dove vengono i materiali e dove vanno nell'ultimo tick di gioco. */
export interface MaterialsReport {
  readonly produced: number;
  readonly upkeep: number;
  readonly retail: number;
  readonly exported: number;
  /** Materiali spesi dai cantieri fra questo tick e il successivo. */
  readonly construction: number;
  /** Scorta che negozi ed export lasciano ai cantieri. */
  readonly reserve: number;
  /** Prezzo piu' basso di un cantiere rimasto in attesa, o zero. */
  readonly waitingCost: number;
}

export const EMPTY_MATERIALS: MaterialsReport = {
  produced: 0,
  upkeep: 0,
  retail: 0,
  exported: 0,
  construction: 0,
  reserve: 0,
  waitingCost: 0,
};

/** Capacita' economica di un edificio al livello indicato. */
export function capacityAtLevel(level: number): number {
  const raised = Math.max(0, Math.floor(Number.isFinite(level) ? level : 0));
  return 1 + Math.min(
    BALANCE.materials.maxCapacityBonus,
    raised * BALANCE.materials.capacityPerLevel,
  );
}

/** Materiali necessari per promuovere un edificio al livello indicato. */
export function upgradeMaterialCost(level: number): number {
  const paidLevel = Math.max(0, Math.floor(level) - BALANCE.materials.freeThroughLevel);
  return paidLevel === 0
    ? 0
    : BALANCE.materials.upgradeBaseCost * paidLevel * paidLevel;
}

/** Registra il cantiere meno caro che non ha trovato materiali. */
export function waitingForMaterials(report: MaterialsReport, cost: number): MaterialsReport {
  if (!(cost > 0)) return report;
  const waitingCost = report.waitingCost === 0 ? cost : Math.min(report.waitingCost, cost);
  return waitingCost === report.waitingCost ? report : { ...report, waitingCost };
}

/** Allinea alla promozione riuscita nel mondo il record economico. */
export function upgradeBuilding(
  state: SimState,
  building: Building,
  materialCost: number,
): SimState {
  const index = state.buildings.findIndex((candidate) =>
    candidate.x === building.x && candidate.y === building.y && candidate.class === building.class);
  if (index < 0) return state;

  const cost = Math.max(0, Number.isFinite(materialCost) ? materialCost : 0);
  if (state.materials.stock < cost) return state;

  const previous = state.buildings[index];
  const level = normaliseLevel(building.level);
  if (level <= normaliseLevel(previous.level)) return state;

  const before = capacityAtLevel(previous.level ?? 0);
  const after = capacityAtLevel(level);
  const delta = after - before;
  const capacityCounts = state.capacityCounts.slice();
  capacityCounts[building.class] += delta;

  const mixedCapacityCounts = state.mixedCapacityCounts.slice();
  if (previous.mixed !== undefined) mixedCapacityCounts[previous.mixed] += delta;

  const farmCounts = state.farmCounts.slice();
  if (previous.specialization === 'farming') farmCounts[FARM_KIND.tower] -= before;
  if (building.specialization === 'farming') farmCounts[FARM_KIND.tower] += after;

  const record: Building = {
    ...previous,
    level,
    ...(building.specialization === undefined
      ? { specialization: undefined }
      : { specialization: building.specialization }),
  };
  const buildings = state.buildings.slice();
  buildings[index] = record;

  return {
    ...state,
    buildings,
    capacityCounts,
    mixedCapacityCounts,
    farmCounts,
    materials: { ...state.materials, stock: state.materials.stock - cost },
    materialFlows: {
      ...state.materialFlows,
      construction: state.materialFlows.construction + cost,
    },
  };
}

/** Consuma materiali per un'opera che non corrisponde a un edificio ordinario. */
export function spendConstructionMaterials(state: SimState, cost: number): SimState | null {
  const paid = Math.max(0, Number.isFinite(cost) ? cost : 0);
  if (state.materials.stock < paid) return null;
  return {
    ...state,
    materials: { ...state.materials, stock: state.materials.stock - paid },
    materialFlows: {
      ...state.materialFlows,
      construction: state.materialFlows.construction + paid,
    },
  };
}

/** Fa comparire nell'HUD il prezzo del cantiere piu' vicino rimasto in attesa. */
export function deferConstruction(state: SimState, cost: number): SimState {
  const materialFlows = waitingForMaterials(state.materialFlows, cost);
  return materialFlows === state.materialFlows ? state : { ...state, materialFlows };
}

function normaliseLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level)) return 0;
  return Math.max(0, Math.floor(level));
}
