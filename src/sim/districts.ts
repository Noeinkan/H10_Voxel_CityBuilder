import { BALANCE } from './balance';
import { catalystById, catalystRoleOf, type CatalystId } from './catalysts';
import { ALL_CLASSES, BUILDING_CLASS, CLASS_COUNT, type BuildingClass } from './classes';
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

/**
 * Le cinque **specializzazioni**.
 *
 * Non sono usi urbani e non entrano nel campo: sono aggettivi che si posano su
 * un uso gia' deciso, e servono a scegliere la tipologia edilizia. Un edificio
 * commerciale in un distretto ricco e accessibile diventa un ufficio; lo stesso
 * uso commerciale accanto a un monumento diventa un hotel. L'uso non e'
 * cambiato: e' cambiato cosa ci si fa dentro.
 */
export type Specialization = 'office' | 'tourism' | 'research' | 'logistics' | 'entertainment';

export interface LocalUrbanProfile {
  readonly district: DistrictId;
  readonly density: number;
  readonly wealth: number;
  readonly accessibility: number;
  readonly satisfaction: number;
  readonly industry: number;
  /** Ruoli sovrapposti sopra soglia, dal contributo maggiore al minore. */
  readonly roles: readonly CatalystId[];
  /** Quanto ciascun uso urbano e' favorito qui, in 0..1 e per indice di uso. */
  readonly uses: readonly number[];
  /** Specializzazione emergente, o null se il luogo non ne esprime nessuna. */
  readonly specialization: Specialization | null;
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
  const uses = new Array<number>(CLASS_COUNT).fill(0);
  let density = 0;
  let wealth = 0;
  let accessibility = 0;
  let satisfaction = 0;
  let industry = 0;

  for (const source of catalysts) {
    if (source.radius <= 0) continue;
    const distance = Math.max(Math.abs(source.x - x), Math.abs(source.y - y));
    if (distance >= source.radius) continue;
    const influence = 1 - distance / source.radius;
    const id = catalystRoleOf(source);
    const definition = catalystById(id);
    byRole.set(id, (byRole.get(id) ?? 0) + influence);
    density += definition.effects.density * influence;
    wealth += definition.effects.wealth * influence;
    accessibility += definition.effects.accessibility * influence;
    satisfaction += definition.effects.satisfaction * influence;
    industry += definition.effects.industry * influence;
    // Lo stesso vettore che alimenta il campo di desiderabilita': il profilo
    // locale e la heatmap non possono raccontare due storie diverse su chi
    // favorisce cosa.
    for (const cls of ALL_CLASSES) uses[cls] += definition.influence[cls] * influence;
  }

  for (const id of policies) {
    const effect = BALANCE.districts.spatialPolicy[id];
    const carrier = policyCarrier(id, uses, byRole);
    density += ('density' in effect ? effect.density : 0) * carrier;
    wealth += ('wealth' in effect ? effect.wealth : 0) * carrier;
    accessibility += ('accessibility' in effect ? effect.accessibility : 0) * carrier;
    satisfaction += ('satisfaction' in effect ? effect.satisfaction : 0) * carrier;
    industry += ('industry' in effect ? effect.industry : 0) * carrier;
  }

  const roles = [...byRole.entries()]
    .filter(([, influence]) => influence >= BALANCE.districts.overlapThreshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
  const scale = BALANCE.districts.metricScale;
  const profile = {
    district: districtOf(roles),
    density: clamp01(density / scale),
    wealth: clamp01(wealth / scale),
    accessibility: clamp01(accessibility / scale),
    satisfaction: clamp01(0.5 + satisfaction / scale),
    industry: clamp01(industry / scale),
    roles,
    uses: uses.map((value) => clamp01(value)),
  };
  return { ...profile, specialization: specializationOf(profile) };
}

/**
 * Ruoli che devono essere presenti perche' una specializzazione abbia senso.
 *
 * Il catalogo sta qui e le soglie stanno in `balance.ts`, come per le policy:
 * *quali* ruoli e' una regola di gioco, *quanto in alto* e' calibrazione. Basta
 * un ruolo della lista, non tutti: un hotel nasce accanto a un monumento tanto
 * quanto accanto a un parco.
 */
const SPECIALIZATION_ROLES: Readonly<Record<Specialization, readonly CatalystId[]>> = {
  office: ['market', 'transport'],
  tourism: ['monument', 'park', 'port'],
  research: ['university'],
  logistics: ['port', 'transport'],
  entertainment: ['monument', 'market', 'park'],
};

/**
 * Specializzazione espressa da un luogo, o null.
 *
 * Si valutano in ordine fisso e vince la prima che passa: e' un ordine di
 * specificita', dalla piu' rara alla piu' comune, non una priorita' arbitraria.
 * Senza ordine fisso lo stesso profilo darebbe tipologie diverse a seconda di
 * come e' stato iterato l'oggetto, e il determinismo cadrebbe.
 */
export function specializationOf(profile: {
  readonly wealth: number;
  readonly accessibility: number;
  readonly density: number;
  readonly satisfaction: number;
  readonly industry: number;
  readonly roles: readonly CatalystId[];
}): Specialization | null {
  const limits = BALANCE.districts.specialization;
  const near = (id: Specialization): boolean =>
    SPECIALIZATION_ROLES[id].some((role) => profile.roles.includes(role));

  if (near('research') &&
    profile.wealth >= limits.research.wealth &&
    profile.satisfaction >= limits.research.satisfaction) return 'research';

  if (near('logistics') &&
    profile.accessibility >= limits.logistics.accessibility &&
    profile.industry >= limits.logistics.industry) return 'logistics';

  if (near('tourism') &&
    profile.wealth >= limits.tourism.wealth &&
    profile.satisfaction >= limits.tourism.satisfaction) return 'tourism';

  if (near('entertainment') &&
    profile.density >= limits.entertainment.density &&
    profile.satisfaction >= limits.entertainment.satisfaction) return 'entertainment';

  if (near('office') &&
    profile.wealth >= limits.office.wealth &&
    profile.accessibility >= limits.office.accessibility &&
    profile.density >= limits.office.density) return 'office';

  return null;
}

/**
 * Quanto una policy si fa sentire qui.
 *
 * Ogni policy viaggia sul campo che la riguarda: la densita' abitativa si sente
 * dove ci sono case, il sussidio industriale dove ci sono fabbriche e porti. E'
 * cio' che rende una policy un fatto spaziale e non un moltiplicatore globale.
 */
function policyCarrier(
  id: PolicyId,
  uses: readonly number[],
  roles: ReadonlyMap<CatalystId, number>,
): number {
  if (id === 'denseHousing') return uses[BUILDING_CLASS.residential];
  if (id === 'industrialSubsidy') return (roles.get('factory') ?? 0) + (roles.get('port') ?? 0);
  if (id === 'austerity' || id === 'civicPride') return uses[BUILDING_CLASS.civic];
  if (id === 'greenBelt') return (roles.get('park') ?? 0) + uses[BUILDING_CLASS.residential];
  if (id === 'marketCharter') return uses[BUILDING_CLASS.commercial];
  return uses[BUILDING_CLASS.industrial];
}

/** Uso urbano piu' favorito dal profilo, con l'indice minore a rompere la parita'. */
export function dominantUse(profile: LocalUrbanProfile): BuildingClass {
  let best: BuildingClass = BUILDING_CLASS.residential;
  for (const cls of ALL_CLASSES) {
    if (profile.uses[cls] > profile.uses[best]) best = cls;
  }
  return best;
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
