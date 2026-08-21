import {
  BALANCE,
  CATALYSTS,
  CATALYST_GROUPS,
  CLASS_LABELS,
  POLICIES,
  TRADE_MODES,
  catalystById,
  charterById,
  policyConflict,
  tradeLinksOf,
  type BuildingClass,
  type CatalystGroup,
  type CatalystId,
  type CatalystSite,
  type CityDecision,
  type DecisionOption,
  type PolicyId,
  type TradeMode,
} from '../sim';
import { typologiesForUses } from '../world/buildings/typology';
import { SITE } from '../world/sites/config';
import type { GrowthStats } from '../game/growthScene';
import type { CityCondition } from '../game/cityCondition';

/**
 * Il vincolo di sito detto al giocatore, non al codice.
 *
 * `undefined` per `'any'` e non una frase: "nessun vincolo" e' rumore in un
 * tooltip: le righe che compaiono devono essere tutte informative, o si smette
 * di leggerle.
 */
const SITE_LABEL: Readonly<Record<CatalystSite, string | undefined>> = {
  any: undefined,
  coastal: 'Waterfront only',
  open: `Needs a ${SITE.openSpan}×${SITE.openSpan} clearing`,
};

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
  /**
   * Vincolo di sito del ruolo, gia' in un'etichetta leggibile.
   *
   * Sta nel tooltip e non solo sul cursore perche' e' l'unica informazione che
   * cambia *dove* si clicca: scoprire che il porto vuole la costa dopo aver
   * scelto il punto significa scoprirlo dal rifiuto.
   */
  readonly site?: string;
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

export type EscapeTarget = 'views' | 'themes' | 'policies' | 'help' | 'tool' | 'view' | 'none';

/** Mantiene stabili i bottoni durante il gesto pointerdown/click. */
export function decisionNeedsRepaint(
  paintedDecisionId: string | null,
  decision: CityDecision | null,
): boolean {
  return paintedDecisionId !== (decision?.id ?? null);
}

/**
 * Il segno che un'alternativa lascia sulla citta', in una riga.
 *
 * Null quando l'alternativa non ne lascia nessuno: e' un caso vero — non ogni
 * scelta deve cambiare la forma di un quartiere — e va distinto da una riga
 * vuota, che sembrerebbe un difetto di disegno.
 */
export function decisionMark(option: DecisionOption): string | null {
  const parts: string[] = [];
  if (option.grant !== undefined) parts.push(`Builds a ${catalystById(option.grant.kind).label}.`);
  if (option.charter === null) parts.push('Lifts the standing mandate for this decision.');
  else if (option.charter !== undefined) parts.push(charterById(option.charter).spatialEffect);
  return parts.length === 0 ? null : parts.join(' ');
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
      site: SITE_LABEL[catalyst.site],
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

  // Stessa funzione che usa il tick, e non piu' un `.some` scritto qui: quello
  // cercava `kind === 'port'` e ignorava i catalizzatori senza `kind`, cioe' i
  // salvataggi dell'MVP e le fixture di scena, che per il tick sono collegamenti
  // validi. L'HUD diceva "nessun porto" mentre il commercio girava.
  const tradeConnected = tradeLinksOf(stats?.state.catalysts ?? []).length > 0;
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

/**
 * Cosa chiude Escape, in ordine di priorita'.
 *
 * I parametri sono nello stesso ordine in cui vengono provati: la firma si legge
 * come la regola. Si sfoglia dall'alto: prima i pannelli aperti sopra il gioco,
 * poi lo strumento in mano, e per **ultima** la vista.
 *
 * Che la vista fosse esclusa era una decisione, ed era sbagliata. Il
 * ragionamento — non e' un pannello, e' il modo in cui si guarda la citta' —
 * regge finche' esiste un altro modo ovvio di tornare indietro, e non esisteva:
 * restavano `V` premuto fino a completare il giro delle cinque viste, oppure
 * riaprire il picker e scegliere Normal. Chi si trovava la citta' retinata non
 * aveva una via d'uscita ma un labirinto, e un tasto di annullamento che si
 * rifiuta di annullare l'unica cosa evidentemente in corso non protegge niente.
 *
 * Ultima e non prima: con uno strumento in mano il toast promette gia' "Esc to
 * cancel", e mangiare quel colpo per spegnere una vista tradirebbe la promessa
 * scritta a schermo. Prima si posa lo strumento, poi si esce.
 */
export function resolveEscapeTarget(
  viewsOpen: boolean,
  themesOpen: boolean,
  policiesOpen: boolean,
  helpOpen: boolean,
  tool: GameTool,
  viewActive: boolean,
): EscapeTarget {
  if (viewsOpen) return 'views';
  if (themesOpen) return 'themes';
  if (policiesOpen) return 'policies';
  if (helpOpen) return 'help';
  if (tool.kind !== 'none') return 'tool';
  return viewActive ? 'view' : 'none';
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
