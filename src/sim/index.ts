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
  CLASS_NAMES,
  CLASS_COUNT,
  isBuildingClass,
  type BuildingClass,
} from './classes';
export {
  DesirabilityField,
  rectAround,
  rectArea,
  CELLS_PER_CHUNK,
  type Building,
  type Catalyst,
  type CellRect,
} from './DesirabilityField';
export { nextBuildSites, type BuildSite } from './nextBuildSites';
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
export { nextState, unitOf } from './rng';
export {
  addBuilding,
  addCatalyst,
  clearPolicies,
  createSimState,
  rebuildField,
  removeCatalyst,
  reviveSimState,
  setCatalystStrength,
  setPolicyActive,
  setSelectedClass,
  toSimStateData,
  type Resource,
  type SimState,
  type SimStateData,
  type SimStateOptions,
} from './SimState';
export { tick, tickMany, weightsOf } from './tick';
export { createScenarioState, scenarioCatalysts, type ScenarioRegion } from './scenario';
export { writeDesirabilityData } from './debugData';
