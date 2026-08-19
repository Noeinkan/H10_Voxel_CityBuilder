import {
  BALANCE,
  CATALYSTS,
  POLICIES,
  TRADE_MODES,
  policyConflict,
  type BuildingClass,
  type CatalystId,
  type CityDecision,
  type PolicyId,
  type TradeMode,
} from '../sim';
import type { GrowthStats } from '../game/growthScene';
import type { CityCondition } from '../game/cityCondition';

export type GameTool =
  | { readonly kind: 'catalyst'; readonly class: BuildingClass; readonly id?: CatalystId }
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
  readonly class?: BuildingClass;
  readonly catalystId?: CatalystId;
  readonly description?: string;
}

export interface HudPolicy extends HudAction {
  readonly id: PolicyId;
  readonly population: number;
  readonly active: boolean;
  readonly description: string;
  readonly upkeep: number;
}

export interface HudTradeMode {
  readonly id: TradeMode;
  readonly label: string;
  readonly description: string;
  readonly active: boolean;
  readonly available: boolean;
}

export interface GameHudModel {
  readonly ready: boolean;
  readonly resources: readonly HudResource[];
  readonly catalysts: readonly HudAction[];
  readonly expansion: HudAction;
  readonly policies: readonly HudPolicy[];
  readonly tradeModes: readonly HudTradeMode[];
  readonly tradeConnected: boolean;
  readonly decision: CityDecision | null;
  readonly paused: boolean;
  readonly speed: number;
  readonly message: string;
  readonly condition: CityCondition | null;
  readonly unlockedSectors: number;
}

export type EscapeTarget = 'themes' | 'policies' | 'help' | 'tool' | 'none';

/** Mantiene stabili i bottoni durante il gesto pointerdown/click. */
export function decisionNeedsRepaint(
  paintedDecisionId: string | null,
  decision: CityDecision | null,
): boolean {
  return paintedDecisionId !== (decision?.id ?? null);
}

const POLICY_DESCRIPTION: Readonly<Record<PolicyId, string>> = {
  denseHousing: 'Increases residential building capacity.',
  industrialSubsidy: 'Increases material production.',
  austerity: 'Reduces the cost of civic services.',
  greenBelt: 'Makes residential areas more desirable.',
  zoningRelief: 'Encourages growth in production areas.',
  civicPride: 'Encourages civic building growth.',
};

export function buildGameHudModel(stats: GrowthStats | null): GameHudModel {
  const funds = stats?.state.funds.stock ?? 0;
  const population = stats?.state.population.stock ?? 0;
  const ready = stats !== null;
  const expectedCatalyst = stats?.onboarding.expectedCatalyst ?? null;
  const resources: readonly HudResource[] = stats === null
    ? emptyResources()
    : [
        resource('funds', 'Funds', stats.state.funds.stock, stats.state.funds.delta),
        resource('population', 'Residents', stats.state.population.stock, stats.state.population.delta),
        resource('food', 'Food', stats.state.food.stock, stats.state.food.delta),
        resource('materials', 'Materials', stats.state.materials.stock, stats.state.materials.delta),
        {
          id: 'satisfaction',
          label: 'Happiness',
          value: `${Math.round(stats.state.satisfaction * 100)}%`,
          delta: '',
          tone: 'neutral',
        },
      ];

  const catalysts = CATALYSTS.map((catalyst) => {
    const cost = catalyst.cost;
    const orderOk = expectedCatalyst === null || expectedCatalyst === catalyst.id;
    const fundsOk = funds >= cost;
    return {
      id: `catalyst-${catalyst.id}`,
      label: catalyst.label,
      cost,
      radius: catalyst.radius,
      class: catalyst.class,
      catalystId: catalyst.id,
      description: catalyst.description,
      available: ready && orderOk && fundsOk,
      reason: !ready
        ? 'The city is getting ready.'
        : !orderOk
          ? `Complete this first: ${stats?.onboarding.title ?? 'the initial tutorial'}.`
          : fundsOk
            ? `${catalyst.description} Select and place it on the island.`
            : 'Not enough funds.',
    };
  });

  const expansionRequirement = BALANCE.gameplay.expansion;
  const expansionPopulationOk = population >= expansionRequirement.population;
  const expansionFundsOk = funds >= expansionRequirement.cost;
  const expansion: HudAction = {
    id: 'expansion',
    label: 'Expand',
    cost: expansionRequirement.cost,
    available: ready && expansionPopulationOk && expansionFundsOk,
    reason: !ready
      ? 'The city is getting ready.'
      : !expansionPopulationOk
        ? `Requires ${expansionRequirement.population} residents.`
        : !expansionFundsOk
          ? 'Not enough funds.'
          : `Purchase a coastal sector (${stats?.unlockedSectors.length ?? 0} already unlocked).`,
  };

  const activePolicies = stats?.state.policies ?? [];
  const policies = POLICIES.map((policy): HudPolicy => {
    const requirement = BALANCE.gameplay.policy[policy.id];
    const active = activePolicies.includes(policy.id);
    const populationOk = population >= requirement.population;
    const fundsOk = funds >= requirement.cost;
    const conflict = policyConflict(activePolicies, policy.id);
    return {
      id: policy.id,
      label: capitalize(policy.label),
      cost: requirement.cost,
      population: requirement.population,
      active,
      upkeep: requirement.upkeep,
      available: ready && (active || (populationOk && fundsOk && conflict === null)),
      reason: active
        ? 'Active: select to deactivate it.'
        : !ready
          ? 'The city is getting ready.'
          : conflict !== null
            ? `Incompatible with ${POLICIES.find((entry) => entry.id === conflict)?.label ?? conflict}.`
          : !populationOk
            ? `Requires ${requirement.population} residents.`
            : !fundsOk
              ? 'Not enough funds.'
              : `${POLICY_DESCRIPTION[policy.id]} ${policy.spatialEffect}`,
      description: `${POLICY_DESCRIPTION[policy.id]} ${policy.spatialEffect}`,
    };
  });

  const tradeConnected = stats?.state.catalysts.some((catalyst) => catalyst.kind === 'port') ?? false;
  const tradeModes: readonly HudTradeMode[] = TRADE_MODES.map((mode) => ({
    ...mode,
    active: stats?.state.tradeMode === mode.id,
    available: ready && tradeConnected,
  }));

  return {
    ready,
    resources,
    catalysts,
    expansion,
    policies,
    tradeModes,
    tradeConnected,
    decision: stats?.state.pendingDecision ?? null,
    paused: stats?.paused ?? false,
    speed: stats?.speed ?? 1,
    message: stats === null
      ? 'Preparing the city…'
      : `${stats.condition.title} · ${stats.condition.message}`,
    condition: stats?.condition ?? null,
    unlockedSectors: stats?.unlockedSectors.length ?? 0,
  };
}

export function resolveEscapeTarget(
  themesOpen: boolean,
  policiesOpen: boolean,
  helpOpen: boolean,
  tool: GameTool,
): EscapeTarget {
  if (themesOpen) return 'themes';
  if (policiesOpen) return 'policies';
  if (helpOpen) return 'help';
  return tool.kind === 'none' ? 'none' : 'tool';
}

export function selectionMessage(tool: GameTool, catalysts: readonly HudAction[]): string | null {
  if (tool.kind === 'catalyst') {
    if (tool.id === undefined) {
      const legacyLabel = ['Residential', 'Production', 'Civic'][tool.class] ?? 'Catalyst';
      return `${legacyLabel} selected · click the island to place it · Esc to cancel`;
    }
    const action = catalysts.find((candidate) => candidate.catalystId === tool.id);
    return `${action?.label ?? 'Catalyst'} selected · click the island to place it · Esc to cancel`;
  }
  if (tool.kind === 'expansion') {
    return 'Expansion selected · choose a coastline edge · Esc to cancel';
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
    { id: 'funds', label: 'Funds', value: '—', delta: '', tone: 'neutral' },
    { id: 'population', label: 'Residents', value: '—', delta: '', tone: 'neutral' },
    { id: 'food', label: 'Food', value: '—', delta: '', tone: 'neutral' },
    { id: 'materials', label: 'Materials', value: '—', delta: '', tone: 'neutral' },
    { id: 'satisfaction', label: 'Happiness', value: '—', delta: '', tone: 'neutral' },
  ];
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function formatInteger(value: number): string {
  return Math.floor(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
