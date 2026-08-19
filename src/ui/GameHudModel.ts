import { BALANCE, POLICIES, type BuildingClass, type PolicyId } from '../sim';
import type { GrowthStats } from '../game/growthScene';
import type { CityCondition } from '../game/cityCondition';

export type GameTool =
  | { readonly kind: 'catalyst'; readonly class: BuildingClass }
  | { readonly kind: 'expansion' }
  | { readonly kind: 'none' };

export interface HudResource {
  readonly id: 'funds' | 'population' | 'food' | 'materials' | 'satisfaction';
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly tone: 'positive' | 'negative' | 'neutral';
}

export interface HudAction {
  readonly id: string;
  readonly label: string;
  readonly cost: number;
  readonly available: boolean;
  readonly reason: string;
  readonly radius?: number;
}

export interface HudPolicy extends HudAction {
  readonly id: PolicyId;
  readonly population: number;
  readonly active: boolean;
  readonly description: string;
}

export interface GameHudModel {
  readonly ready: boolean;
  readonly resources: readonly HudResource[];
  readonly catalysts: readonly HudAction[];
  readonly expansion: HudAction;
  readonly policies: readonly HudPolicy[];
  readonly paused: boolean;
  readonly speed: number;
  readonly message: string;
  readonly condition: CityCondition | null;
  readonly unlockedSectors: number;
}

export type EscapeTarget = 'policies' | 'help' | 'tool' | 'none';

const POLICY_DESCRIPTION: Readonly<Record<PolicyId, string>> = {
  denseHousing: 'Aumenta la capacità degli edifici residenziali.',
  industrialSubsidy: 'Aumenta la produzione di materiali.',
  austerity: 'Riduce i costi dei servizi civici.',
  greenBelt: 'Rende più desiderabili le aree residenziali.',
  zoningRelief: 'Favorisce la crescita delle aree produttive.',
  civicPride: 'Favorisce la crescita degli edifici civici.',
};

const CATALYST_LABEL = ['Residenziale', 'Produttivo', 'Civico'] as const;

export function buildGameHudModel(stats: GrowthStats | null): GameHudModel {
  const funds = stats?.state.funds.stock ?? 0;
  const population = stats?.state.population.stock ?? 0;
  const ready = stats !== null;
  const expectedClass = stats?.onboarding.expectedClass ?? null;
  const resources: readonly HudResource[] = stats === null
    ? emptyResources()
    : [
        resource('funds', 'Fondi', stats.state.funds.stock, stats.state.funds.delta),
        resource('population', 'Abitanti', stats.state.population.stock, stats.state.population.delta),
        resource('food', 'Cibo', stats.state.food.stock, stats.state.food.delta),
        resource('materials', 'Materiali', stats.state.materials.stock, stats.state.materials.delta),
        {
          id: 'satisfaction',
          label: 'Felicità',
          value: `${Math.round(stats.state.satisfaction * 100)}%`,
          delta: '',
          tone: 'neutral',
        },
      ];

  const catalysts = CATALYST_LABEL.map((label, cls) => {
    const cost = BALANCE.gameplay.catalyst.cost[cls];
    const orderOk = expectedClass === null || expectedClass === cls;
    const fundsOk = funds >= cost;
    return {
      id: `catalyst-${cls}`,
      label,
      cost,
      radius: BALANCE.gameplay.catalyst.radius[cls],
      available: ready && orderOk && fundsOk,
      reason: !ready
        ? 'La città si sta preparando.'
        : !orderOk
          ? `Completa prima: ${stats?.onboarding.title ?? 'il tutorial iniziale'}.`
          : availabilityReason(true, fundsOk, 'Fondi insufficienti.'),
    };
  });

  const expansionRequirement = BALANCE.gameplay.expansion;
  const expansionPopulationOk = population >= expansionRequirement.population;
  const expansionFundsOk = funds >= expansionRequirement.cost;
  const expansion: HudAction = {
    id: 'expansion',
    label: 'Espandi',
    cost: expansionRequirement.cost,
    available: ready && expansionPopulationOk && expansionFundsOk,
    reason: !ready
      ? 'La città si sta preparando.'
      : !expansionPopulationOk
        ? `Richiede ${expansionRequirement.population} abitanti.`
        : !expansionFundsOk
          ? 'Fondi insufficienti.'
          : `Acquista un nuovo settore costiero (${stats?.unlockedSectors.length ?? 0} già sbloccati).`,
  };

  const activePolicies = stats?.state.policies ?? [];
  const policies = POLICIES.map((policy): HudPolicy => {
    const requirement = BALANCE.gameplay.policy[policy.id];
    const active = activePolicies.includes(policy.id);
    const populationOk = population >= requirement.population;
    const fundsOk = funds >= requirement.cost;
    return {
      id: policy.id,
      label: capitalize(policy.label),
      cost: requirement.cost,
      population: requirement.population,
      active,
      available: ready && (active || (populationOk && fundsOk)),
      reason: active
        ? 'Attiva: seleziona per disattivarla.'
        : !ready
          ? 'La città si sta preparando.'
          : !populationOk
            ? `Richiede ${requirement.population} abitanti.`
            : !fundsOk
              ? 'Fondi insufficienti.'
              : POLICY_DESCRIPTION[policy.id],
      description: POLICY_DESCRIPTION[policy.id],
    };
  });

  return {
    ready,
    resources,
    catalysts,
    expansion,
    policies,
    paused: stats?.paused ?? false,
    speed: stats?.speed ?? 1,
    message: stats === null
      ? 'Preparazione della città…'
      : `${stats.condition.title} · ${stats.condition.message}`,
    condition: stats?.condition ?? null,
    unlockedSectors: stats?.unlockedSectors.length ?? 0,
  };
}

export function resolveEscapeTarget(
  policiesOpen: boolean,
  helpOpen: boolean,
  tool: GameTool,
): EscapeTarget {
  if (policiesOpen) return 'policies';
  if (helpOpen) return 'help';
  return tool.kind === 'none' ? 'none' : 'tool';
}

export function selectionMessage(tool: GameTool, catalysts: readonly HudAction[]): string | null {
  if (tool.kind === 'catalyst') {
    const action = catalysts[tool.class];
    return `${action?.label ?? 'Catalizzatore'} selezionato · clicca sull’isola · Esc per annullare`;
  }
  if (tool.kind === 'expansion') {
    return 'Espansione selezionata · scegli un lato della costa · Esc per annullare';
  }
  return null;
}

function resource(
  id: HudResource['id'],
  label: string,
  stock: number,
  delta: number,
): HudResource {
  const roundedDelta = delta.toFixed(1);
  return {
    id,
    label,
    value: formatInteger(stock),
    delta: delta === 0 ? '±0' : `${delta > 0 ? '+' : ''}${roundedDelta}`,
    tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
  };
}

function emptyResources(): readonly HudResource[] {
  return [
    { id: 'funds', label: 'Fondi', value: '—', delta: '', tone: 'neutral' },
    { id: 'population', label: 'Abitanti', value: '—', delta: '', tone: 'neutral' },
    { id: 'food', label: 'Cibo', value: '—', delta: '', tone: 'neutral' },
    { id: 'materials', label: 'Materiali', value: '—', delta: '', tone: 'neutral' },
    { id: 'satisfaction', label: 'Felicità', value: '—', delta: '', tone: 'neutral' },
  ];
}

function availabilityReason(ready: boolean, available: boolean, blocked: string): string {
  if (!ready) return 'La città si sta preparando.';
  return available ? 'Seleziona e piazza sull’isola.' : blocked;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function formatInteger(value: number): string {
  return Math.floor(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
