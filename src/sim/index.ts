/**
 * Superficie pubblica della simulazione.
 *
 * Chi sta fuori da `src/sim/` importa da qui. Dentro, i moduli si importano fra
 * loro per percorso: un barrel che si auto-importa creerebbe cicli senza dare
 * niente in cambio.
 */

export { BALANCE } from './balance';
export {
  ALL_CLASSES,
  BUILDING_CLASS,
  CLASS_LABELS,
  CLASS_NAMES,
  CLASS_COUNT,
  isBuildingClass,
  type BuildingClass,
} from './classes';
export {
  CATALYSTS,
  CATALYST_GROUPS,
  catalystById,
  catalystInfluence,
  catalystRoleOf,
  defaultCatalystOfClass,
  isCatalystId,
  type CatalystDefinition,
  type CatalystEffects,
  type CatalystGroup,
  type CatalystId,
  type CatalystSite,
} from './catalysts';
export {
  CHARTERS,
  canonicalCharters,
  charterById,
  charterOfFamily,
  isCharterId,
  withCharter,
  withoutFamily,
  type Charter,
  type CharterFamily,
  type CharterId,
} from './charters';
export {
  EMPTY_COMMERCE,
  resolveCommerce,
  type CommerceInputs,
  type CommerceReport,
} from './commerce';
export {
  DesirabilityField,
  rectAround,
  rectArea,
  CELLS_PER_CHUNK,
  type Building,
  type Catalyst,
  type CellRect,
} from './DesirabilityField';
export { nextBuildSites, type BuildSite, type BuildSiteQuery } from './nextBuildSites';
export {
  POLICIES,
  policyById,
  isPolicyId,
  resolveWeights,
  withPolicy,
  classOfWeight,
  DESIRABILITY_WEIGHT_OF_CLASS,
  type Policy,
  type PolicyId,
  type WeightId,
  type Weights,
} from './policies';
export { policyConflict } from './policies';
export {
  dominantUse,
  specializationOf,
  urbanProfileAt,
  type DistrictId,
  type LocalUrbanProfile,
  type Specialization,
  type UrbanSources,
} from './districts';
export {
  decisionAt,
  decisionOption,
  type CityDecision,
  type DecisionEffect,
  type DecisionGrant,
  type DecisionOption,
  type DecisionOutcome,
} from './decisions';
export {
  EMPTY_TRADE,
  TRADE_MODES,
  isTradeLink,
  isTradeMode,
  resolveExternalTrade,
  tradeLinksOf,
  type TradeLink,
  type TradeMode,
  type TradeReport,
} from './trade';
export { nextState, unitOf } from './rng';
export {
  addBuilding,
  addCatalyst,
  clearPolicies,
  createSimState,
  rebuildField,
  resolveDecision,
  removeBuildings,
  removeCatalyst,
  reviveSimState,
  setCatalystStrength,
  setPolicyActive,
  setSelectedClass,
  setTradeMode,
  toSimStateData,
  type Resource,
  type SimState,
  type SimStateData,
  type SimStateOptions,
} from './SimState';
export { effectiveCount, tick, tickMany, weightsOf } from './tick';
export { cityVitality, DEFAULT_VITALITY, type CityVitality } from './vitality';
export { createScenarioState, scenarioCatalysts, type ScenarioRegion } from './scenario';
export { writeDesirabilityData } from './debugData';
