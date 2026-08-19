import { BALANCE } from './balance';
import { catalystById, defaultCatalystOfClass, type CatalystId } from './catalysts';
import { BUILDING_CLASS } from './classes';
import type { Catalyst } from './DesirabilityField';
import type { PolicyId } from './policies';

export type DistrictId =
  | 'outskirts'
  | 'harbor'
  | 'market'
  | 'industrial'
  | 'transit'
  | 'garden'
  | 'campus'
  | 'monumental'
  | 'mixed';

export interface LocalUrbanProfile {
  readonly district: DistrictId;
  readonly density: number;
  readonly wealth: number;
  readonly accessibility: number;
  readonly satisfaction: number;
  readonly industry: number;
  /** Ruoli sovrapposti sopra soglia, dal contributo maggiore al minore. */
  readonly roles: readonly CatalystId[];
}

/**
 * Profilo locale derivato, mai serializzato. I distretti emergono quando due o
 * piu' campi di ruolo si sovrappongono; nessuna cella riceve zoning manuale.
 */
export function urbanProfileAt(
  catalysts: readonly Catalyst[],
  policies: readonly PolicyId[],
  x: number,
  y: number,
): LocalUrbanProfile {
  const byRole = new Map<CatalystId, number>();
  let density = 0;
  let wealth = 0;
  let accessibility = 0;
  let satisfaction = 0;
  let industry = 0;
  let residentialInfluence = 0;
  let productionInfluence = 0;
  let civicInfluence = 0;

  for (const source of catalysts) {
    if (source.radius <= 0) continue;
    const distance = Math.max(Math.abs(source.x - x), Math.abs(source.y - y));
    if (distance >= source.radius) continue;
    const influence = 1 - distance / source.radius;
    const id = source.kind ?? defaultCatalystOfClass(source.class);
    const definition = catalystById(id);
    byRole.set(id, (byRole.get(id) ?? 0) + influence);
    density += definition.effects.density * influence;
    wealth += definition.effects.wealth * influence;
    accessibility += definition.effects.accessibility * influence;
    satisfaction += definition.effects.satisfaction * influence;
    industry += definition.effects.industry * influence;
    if (source.class === BUILDING_CLASS.residential) residentialInfluence += influence;
    else if (source.class === BUILDING_CLASS.production) productionInfluence += influence;
    else civicInfluence += influence;
  }

  for (const id of policies) {
    const effect = BALANCE.districts.spatialPolicy[id];
    const carrier = policyCarrier(id, residentialInfluence, productionInfluence, civicInfluence, byRole);
    density += ('density' in effect ? effect.density : 0) * carrier;
    wealth += ('wealth' in effect ? effect.wealth : 0) * carrier;
    satisfaction += ('satisfaction' in effect ? effect.satisfaction : 0) * carrier;
    industry += ('industry' in effect ? effect.industry : 0) * carrier;
  }

  const roles = [...byRole.entries()]
    .filter(([, influence]) => influence >= BALANCE.districts.overlapThreshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
  const scale = BALANCE.districts.metricScale;
  return {
    district: districtOf(roles),
    density: clamp01(density / scale),
    wealth: clamp01(wealth / scale),
    accessibility: clamp01(accessibility / scale),
    satisfaction: clamp01(0.5 + satisfaction / scale),
    industry: clamp01(industry / scale),
    roles,
  };
}

function policyCarrier(
  id: PolicyId,
  residential: number,
  production: number,
  civic: number,
  roles: ReadonlyMap<CatalystId, number>,
): number {
  if (id === 'denseHousing') return residential;
  if (id === 'industrialSubsidy') return (roles.get('factory') ?? 0) + (roles.get('port') ?? 0);
  if (id === 'austerity' || id === 'civicPride') return civic;
  if (id === 'greenBelt') return (roles.get('park') ?? 0) + residential;
  return production;
}

function districtOf(roles: readonly CatalystId[]): DistrictId {
  if (roles.length < 2) return 'outskirts';
  if (has(roles, 'port') && (has(roles, 'market') || has(roles, 'factory'))) return 'harbor';
  if (has(roles, 'university') && (has(roles, 'transport') || has(roles, 'park'))) return 'campus';
  if (has(roles, 'park') && (has(roles, 'market') || has(roles, 'monument'))) return 'garden';
  if (has(roles, 'monument') && (has(roles, 'market') || has(roles, 'transport'))) return 'monumental';
  if (has(roles, 'factory')) return 'industrial';
  if (has(roles, 'transport')) return 'transit';
  if (has(roles, 'market')) return 'market';
  return 'mixed';
}

function has(roles: readonly CatalystId[], id: CatalystId): boolean {
  return roles.includes(id);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
