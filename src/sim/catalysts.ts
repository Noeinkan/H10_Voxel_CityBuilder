import { BALANCE } from './balance';
import { BUILDING_CLASS, type BuildingClass } from './classes';

/** I sette modi in cui il giocatore puo' orientare la crescita. */
export type CatalystId = keyof typeof BALANCE.gameplay.catalyst.roles;

export interface CatalystEffects {
  readonly density: number;
  readonly wealth: number;
  readonly accessibility: number;
  readonly satisfaction: number;
  readonly industry: number;
}

export interface CatalystDefinition {
  readonly id: CatalystId;
  readonly label: string;
  readonly class: BuildingClass;
  readonly cost: number;
  readonly strength: number;
  readonly radius: number;
  readonly effects: CatalystEffects;
  readonly description: string;
}

/**
 * Catalogo in ordine UI. Mercato, fabbrica e parco restano i tre passi
 * iniziali; gli altri ruoli si aprono quando il tutorial e' concluso.
 */
export const CATALYSTS: readonly CatalystDefinition[] = [
  catalyst('market', 'Market', BUILDING_CLASS.residential, 'Attracts homes and commerce, increasing local wealth.'),
  catalyst('factory', 'Factory', BUILDING_CLASS.production, 'Boosts production and employment, but reduces nearby livability.'),
  catalyst('park', 'Park', BUILDING_CLASS.civic, 'Creates greener, happier, and less dense neighborhoods.'),
  catalyst('port', 'Port', BUILDING_CLASS.production, 'Unlocks external trade and concentrates activity along the coast.'),
  catalyst('transport', 'Transit', BUILDING_CLASS.residential, 'Connects urban hubs and supports higher density.'),
  catalyst('university', 'University', BUILDING_CLASS.civic, 'Creates a prosperous civic district centered on knowledge.'),
  catalyst('monument', 'Monument', BUILDING_CLASS.civic, 'Creates a recognizable landmark and strengthens local pride.'),
];

const BY_ID = new Map<CatalystId, CatalystDefinition>(CATALYSTS.map((entry) => [entry.id, entry]));

export function catalystById(id: CatalystId): CatalystDefinition {
  const found = BY_ID.get(id);
  if (found === undefined) throw new Error(`unknown catalyst: ${id}`);
  return found;
}

export function isCatalystId(value: string): value is CatalystId {
  return BY_ID.has(value as CatalystId);
}

/** Compatibilita' con gli ingressi MVP, che indicavano soltanto la classe. */
export function defaultCatalystOfClass(cls: BuildingClass): CatalystId {
  if (cls === BUILDING_CLASS.production) return 'factory';
  if (cls === BUILDING_CLASS.civic) return 'park';
  return 'market';
}

function catalyst(
  id: CatalystId,
  label: string,
  cls: BuildingClass,
  description: string,
): CatalystDefinition {
  const values = BALANCE.gameplay.catalyst.roles[id];
  const effects = BALANCE.districts.catalystEffects[id];
  return { id, label, class: cls, ...values, effects, description };
}
