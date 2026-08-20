import {
  BALANCE,
  CATALYSTS,
  CATALYST_GROUPS,
  CLASS_LABELS,
  POLICIES,
  TRADE_MODES,
  policyConflict,
  type BuildingClass,
  type CatalystGroup,
  type CatalystId,
  type CityDecision,
  type PolicyId,
  type TradeMode,
} from '../sim';
import { typologiesForUses } from '../world/buildings/typology';
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
  readonly group?: CatalystGroup;
  /** Usi favoriti e penalizzati, gia' in etichette leggibili. */
  readonly favours?: readonly string[];
  readonly penalises?: readonly string[];
  /** Tipologie che quel ruolo puo' far comparire, per nome di catalogo. */
  readonly typologies?: readonly string[];
  /**
   * true se l'azione e' bloccata ma resta visibile.
   *
   * Un catalizzatore che non si puo' ancora permettere non sparisce dalla
   * toolbar: sapere che il porto esiste e costa 320 e' l'informazione che fa
   * pianificare, e nasconderlo trasformerebbe la progressione in una sorpresa.
   */
  readonly locked?: boolean;
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

/** Una sezione della toolbar: crescita, connessioni o identita'. */
export interface HudCatalystGroup {
  readonly id: CatalystGroup;
  readonly label: string;
  readonly actions: readonly HudAction[];
}

export interface GameHudModel {
  readonly ready: boolean;
  readonly resources: readonly HudResource[];
  readonly catalysts: readonly HudAction[];
  /** Gli stessi catalizzatori, raggruppati per funzione e in ordine di toolbar. */
  readonly catalystGroups: readonly HudCatalystGroup[];
  readonly commerce: HudCommerce | null;
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

/** Riepilogo del ciclo commerciale, la seconda catena economica della citta'. */
export interface HudCommerce {
  readonly demand: number;
  readonly served: number;
  /** Quota di domanda servita, 0..100. */
  readonly service: number;
  /** Quota di banchi occupati, 0..100. */
  readonly occupancy: number;
  readonly revenue: number;
  readonly goods: number;
  readonly mixedBuildings: number;
  readonly message: string;
}

const POLICY_DESCRIPTION: Readonly<Record<PolicyId, string>> = {
  denseHousing: 'Increases residential building capacity.',
  industrialSubsidy: 'Increases material production.',
  austerity: 'Reduces the cost of civic services.',
  greenBelt: 'Makes residential areas more desirable.',
  zoningRelief: 'Encourages growth in industrial areas.',
  civicPride: 'Encourages civic building growth.',
  marketCharter: 'Increases retail reach and revenue.',
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

  const catalysts: readonly HudAction[] = CATALYSTS.map((catalyst) => {
    const cost = catalyst.cost;
    const orderOk = expectedCatalyst === null || expectedCatalyst === catalyst.id;
    const fundsOk = funds >= cost;
    const available = ready && orderOk && fundsOk;
    const favours = catalyst.favours.map((cls) => CLASS_LABELS[cls]);
    const penalises = catalyst.penalises.map((cls) => CLASS_LABELS[cls]);
    return {
      id: `catalyst-${catalyst.id}`,
      label: catalyst.label,
      cost,
      radius: catalyst.radius,
      class: catalyst.class,
      catalystId: catalyst.id,
      group: catalyst.group,
      description: catalyst.description,
      favours,
      penalises,
      typologies: typologiesForUses(catalyst.favours),
      available,
      // Bloccato non vuol dire nascosto: il bottone resta nella toolbar e dice
      // perche' non si puo' ancora usare.
      locked: ready && !available,
      reason: !ready
        ? 'The city is getting ready.'
        : !orderOk
          ? `Complete this first: ${stats?.onboarding.title ?? 'the initial tutorial'}.`
          : fundsOk
            ? `${catalyst.description} Select and place it on the island.`
            : 'Not enough funds.',
    };
  });

  const catalystGroups: readonly HudCatalystGroup[] = CATALYST_GROUPS.map((group) => ({
    ...group,
    actions: catalysts.filter((action) => action.group === group.id),
  }));

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
    catalystGroups,
    commerce: commerceOf(stats),
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
      const legacyLabel = CLASS_LABELS[tool.class] ?? 'Catalyst';
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

/**
 * Riassunto del ciclo commerciale.
 *
 * Il messaggio nomina la strozzatura, non lo stato: "manca personale" e "manca
 * merce" chiedono due azioni diverse, e senza dirlo il giocatore vede solo dei
 * negozi vuoti.
 */
function commerceOf(stats: GrowthStats | null): HudCommerce | null {
  if (stats === null) return null;
  const report = stats.state.commerce;
  const mixedBuildings = stats.state.mixedCounts.reduce((sum, value) => sum + value, 0);

  const message = report.capacity === 0
    ? 'No shops yet: place a Market to let commerce grow.'
    : report.demand === 0
      ? 'No residents to serve yet.'
      : report.served < report.capacity * 0.95 && report.goods === 0
        ? 'Shops have no goods to sell: industry is not producing enough materials.'
        : report.service < 0.7
          ? 'Demand outruns the shops: more commercial ground would raise happiness.'
          : report.occupancy < 0.5
            ? 'Shops are half empty: there are more of them than the city needs.'
            : 'Commerce is balanced with demand.';

  return {
    demand: report.demand,
    served: report.served,
    service: Math.round(report.service * 100),
    occupancy: Math.round(report.occupancy * 100),
    revenue: report.revenue,
    goods: report.goods,
    mixedBuildings,
    message,
  };
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
