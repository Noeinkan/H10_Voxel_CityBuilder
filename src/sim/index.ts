/**
 * Superficie pubblica della simulazione.
 *
 * Chi sta fuori da `src/sim/` importa da qui. Dentro, i moduli si importano fra
 * loro per percorso: un barrel che si auto-importa creerebbe cicli senza dare
 * niente in cambio.
 */

export { BALANCE } from './balance';
export {
  EMPTY_MATERIALS,
  capacityAtLevel,
  deferConstruction,
  spendConstructionMaterials,
  upgradeBuilding,
  upgradeMaterialCost,
  type MaterialsReport,
} from './materials';
export {
  materialRate,
  ticksToAffordConstruction,
  ticksToEmpty,
  ticksToFillHousing,
  ticksToReach,
} from './forecast';
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
export {
  ALL_FARM_KINDS,
  EMPTY_HARVEST,
  FARM_COUNT,
  FARM_KIND,
  FARM_LABELS,
  FARM_NAMES,
  farmUpkeepOf,
  farmWorkersOf,
  fedShareOf,
  foodDeficitOf,
  foodYieldOf,
  harvestOf,
  isFarmKind,
  missingPlotsFor,
  missingPlotsOf,
  type FarmKind,
  type FoodReport,
} from './farms';
export { nextBuildSites, type BuildSite, type BuildSiteQuery } from './nextBuildSites';
export {
  computeReach,
  distAt,
  falloff,
  reachAt,
  ReachCache,
  UNIFORM_COST,
  type ReachField,
  type ReachPole,
  type ReachSource,
  type StepCost,
} from './reach';
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
  ALL_SPECIALIZATIONS,
  districtPairingsOf,
  dominantUse,
  rolesForSpecialization,
  specializationGapsOf,
  specializationOf,
  urbanFieldAt,
  urbanProfileAt,
  type DistrictId,
  type DistrictPairing,
  type LocalUrbanProfile,
  type Specialization,
  type SpecializationGap,
  type UrbanField,
  type UrbanMetric,
  type UrbanSources,
} from './districts';
export {
  decisionAt,
  decisionFingerprint,
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
export {
  ferryLinesOf,
  servedFerryLines,
  type FerryLine,
  type FerryTerminal,
} from './ferry';
export {
  dominantOutflow,
  fundsIn,
  fundsOut,
  NO_FUNDS_FLOW,
  type FundsReport,
} from './flows';
export {
  EMPTY_SATISFACTION,
  satisfactionReportOf,
  type SatisfactionInputs,
  type SatisfactionReport,
} from './satisfaction';
export { nextState, unitOf } from './rng';
export {
  addBuilding,
  addCatalyst,
  addFarm,
  clearPolicies,
  createSimState,
  rebuildField,
  resolveDecision,
  removeBuildings,
  removeCatalyst,
  removeFarm,
  reviveSimState,
  setCatalystStrength,
  setIslandConnections,
  setPolicyActive,
  setSelectedClass,
  setTradeMode,
  snoozeDecision,
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
export {
  DISTRICT_CATEGORIES,
  DISTRICT_ORDER,
  FOOD_CATEGORIES,
  INFO_VIEWS,
  capacityIndex,
  createSimInfoSampler,
  infoViewSpecOf,
  infoViewVersion,
  isInfoViewKind,
  nextInfoView,
  type InfoSampler,
  type InfoViewKind,
  type InfoViewMode,
  type InfoViewSpec,
} from './infoViews';
