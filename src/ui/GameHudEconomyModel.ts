import {
  BALANCE,
  BUILDING_CLASS,
  FARM_KIND,
  FARM_LABELS,
  dominantOutflow,
  effectiveCount,
  fedShareOf,
  missingPlotsOf,
  weightsOf,
  type FoodReport,
  type FundsReport,
  type MaterialsReport,
  type SatisfactionReport,
} from '../sim';
import type { GrowthStats } from '../game/growthScene';
import type { ResourceTrend, TrendDirection } from './ResourceTrend';

export interface HudResource {
  readonly id: 'funds' | 'population' | 'food' | 'materials' | 'satisfaction';
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly tone: 'positive' | 'negative' | 'neutral';
  readonly trend: TrendDirection;
  readonly magnitude: number;
  readonly series: readonly number[];
  readonly fill?: HudFill;
  readonly breakdown?: readonly HudFlow[];
  readonly status?: string;
  /**
   * Il «perche'» in una riga, sempre visibile sotto il valore.
   *
   * Diverso da `status`, che resta nel popover: questa e' la risposta corta da
   * leggere al volo, letta dai referti del tick e mai ricalcolata qui.
   */
  readonly hint?: string;
}

export interface HudFill {
  readonly value: number;
  readonly label: string;
}

export interface HudFlow {
  readonly label: string;
  readonly amount: number;
  readonly direction: 'in' | 'out';
}

/** Riepilogo del ciclo commerciale, la seconda catena economica della citta'. */
export interface HudCommerce {
  readonly demand: number;
  readonly served: number;
  readonly service: number;
  readonly occupancy: number;
  readonly revenue: number;
  readonly goods: number;
  readonly mixedBuildings: number;
  readonly message: string;
}

/**
 * Le soglie di voce delle righe «perche'».
 *
 * Calibrano l'HUD, non il bilancio: sono le quote sotto cui un fatto smette di
 * essere rumore e merita la riga, e vivono qui come le soglie del coach in
 * `coach.ts` e le voci di `tips.ts`.
 */
const HINT = {
  /** Sotto, la terra che resta frena davvero la crescita. */
  landLeft: 0.3,
  /** Sotto, la fame frena la crescita piu' del resto. */
  starveShare: 0.85,
  /** Sotto, i negozi servono cosi' poco da pesare sulla felicita'. */
  shopShare: 0.6,
} as const;

/**
 * Le righe «perche'» delle cinque risorse.
 *
 * Tutte pure e con parametri stretti, come `missingPlotsOf` accanto al suo
 * gemello sullo stato: il cablaggio vive in `buildHudResources`, qui sta solo
 * la voce. Ognuna legge un referto del tick — `flows`, `harvest`,
 * `materialFlows`, `satisfactionReport` — e non rifa mai il conto.
 */

/** La voce di spesa che pesa di piu' sui fondi, quando copre le entrate. */
export function fundsHint(flows: FundsReport): string {
  const owed = flows.civic + flows.policies + flows.farms;
  if (owed > 0 && flows.paid < owed) {
    return `Upkeep short: ${Math.floor((flows.paid / owed) * 100)}% of bills paid`;
  }
  const dominant = dominantOutflow(flows);
  if (dominant === 'civic' && flows.civic > flows.tax) return 'Civic costs > taxes';
  if (dominant === 'policies' && flows.policies > flows.tax) return 'Policy costs > taxes';
  if (dominant === 'farms' && flows.farms > flows.tax) return 'Farm upkeep > taxes';
  return 'Taxes cover the bills';
}

/** Razioni in corso, o la distanza dal piano di copertura che il driver insegue. */
export function foodHint(
  population: number,
  harvest: FoodReport,
  farmCounts: readonly number[],
  staffing: number,
): string {
  const fed = fedShareOf(harvest, population);
  if (fed < 1) return `Rationing: ${Math.round(fed * 100)}% of demand`;
  const missing = missingPlotsOf(population, farmCounts, staffing);
  if (missing > 0) return `${missing} ${missing === 1 ? 'field' : 'fields'} under target`;
  return 'Covered: fields match the city';
}

/** Il cantiere in attesa prima di tutto: e' il fatto che il giocatore puo' muovere. */
export function materialsHint(report: MaterialsReport): string {
  if (report.waitingCost > 0) return `Construction waiting: ${Math.ceil(report.waitingCost)} materials`;
  if (report.reserve > 0) return `${Math.ceil(report.reserve)} reserved for construction`;
  return 'Industry covers the city';
}

/** Il freno piu' forte sulla crescita dei residenti, in ordine di urgenza. */
export function populationHint(
  population: number,
  capacity: number,
  landFactor: number,
  fed: number,
): string {
  if (capacity <= 0) return 'No homes yet: let buildings grow';
  if (population >= capacity) return 'Housing full: build homes';
  if (landFactor < HINT.landLeft) return 'City is running out of land';
  if (fed < HINT.starveShare) return 'Growth held back: not enough food';
  return `${Math.ceil(capacity - population)} homes free`;
}

/** Il peso piu' grande sul bersaglio della felicita', letto dal suo referto. */
export function satisfactionHint(report: SatisfactionReport, flows: FundsReport): string {
  if (report.crowding > 0.01) return `Crowding: homes ${Math.round(report.occupancy * 100)}% full`;
  // `funded` non sta nel referto: e' lo stesso min(civic, paid)/civic del tick,
  // e `flows` lo porta gia'.
  const funded = flows.civic > 0 ? Math.min(flows.civic, flows.paid) / flows.civic : 1;
  if (funded < 1) return 'Civic services underfunded';
  const service = BALANCE.commerce.satisfactionPerService > 0
    ? report.retail / BALANCE.commerce.satisfactionPerService
    : 1;
  if (service < HINT.shopShare) return `Shops falling behind: service at ${Math.round(service * 100)}%`;
  return 'City is content';
}

export function buildHudResources(
  stats: GrowthStats | null,
  trend?: ResourceTrend,
): readonly HudResource[] {
  if (stats === null) return emptyResources();
  const { state } = stats;
  const population = state.population.stock;
  return [
    resource(
      'funds',
      'Funds',
      state.funds.stock,
      state.funds.delta,
      trend,
      undefined,
      fundsBreakdown(state.flows),
      undefined,
      fundsHint(state.flows),
    ),
    resource(
      'population',
      'Residents',
      population,
      state.population.delta,
      trend,
      undefined,
      undefined,
      undefined,
      populationHint(
        population,
        // La stessa capacita' che il tick usa per il bilancio: non un secondo
        // conto, o la riga prometterebbe case che il tick non vede.
        effectiveCount(state, BUILDING_CLASS.residential) * weightsOf(state).residentialCapacity,
        state.landFactor,
        fedShareOf(state.harvest, population),
      ),
    ),
    resource(
      'food',
      'Food',
      state.food.stock,
      state.food.delta,
      trend,
      foodReserve(state.food.stock, population),
      foodBreakdown(state.harvest),
      undefined,
      foodHint(population, state.harvest, state.farmCounts, state.staffing),
    ),
    resource(
      'materials',
      'Materials',
      state.materials.stock,
      state.materials.delta,
      trend,
      undefined,
      materialsBreakdown(state.materialFlows),
      materialsStatus(state.materials.stock, state.materialFlows),
      materialsHint(state.materialFlows),
    ),
    {
      id: 'satisfaction',
      label: 'Happiness',
      value: `${Math.round(state.satisfaction * 100)}%`,
      delta: '',
      tone: 'neutral',
      trend: trend?.direction('satisfaction') ?? 'flat',
      magnitude: trend?.magnitude('satisfaction') ?? 0,
      series: trend?.window('satisfaction') ?? [],
      fill: {
        value: state.satisfaction,
        label: `${Math.round(state.satisfaction * 100)}% of the city is content`,
      },
      hint: satisfactionHint(state.satisfactionReport, state.flows),
    },
  ];
}

export function commerceOf(stats: GrowthStats | null): HudCommerce | null {
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

function fundsBreakdown(flows: FundsReport): readonly HudFlow[] {
  const owed = flows.civic + flows.policies + flows.farms;
  const share = owed > 0 ? flows.paid / owed : 0;
  const rows: readonly HudFlow[] = [
    { label: 'Taxes', amount: flows.tax, direction: 'in' },
    { label: 'Shops', amount: flows.retail, direction: 'in' },
    { label: 'Trade', amount: Math.max(0, flows.trade), direction: 'in' },
    { label: 'Imports', amount: Math.max(0, -flows.trade), direction: 'out' },
    { label: 'Civic services', amount: flows.civic * share, direction: 'out' },
    { label: 'Policies', amount: flows.policies * share, direction: 'out' },
    { label: 'Farms', amount: flows.farms * share, direction: 'out' },
  ];
  return rows.filter((row) => row.amount >= 0.005);
}

function foodBreakdown(harvest: FoodReport): readonly HudFlow[] {
  const rows: readonly HudFlow[] = [
    { label: FARM_LABELS[FARM_KIND.field], amount: harvest.grown[FARM_KIND.field] ?? 0, direction: 'in' },
    { label: FARM_LABELS[FARM_KIND.orchard], amount: harvest.grown[FARM_KIND.orchard] ?? 0, direction: 'in' },
    { label: FARM_LABELS[FARM_KIND.tower], amount: harvest.grown[FARM_KIND.tower] ?? 0, direction: 'in' },
    { label: 'Imports', amount: harvest.imported, direction: 'in' },
    { label: 'Residents', amount: harvest.eaten, direction: 'out' },
  ];
  return rows.filter((row) => row.amount >= 0.005);
}

function materialsBreakdown(report: MaterialsReport): readonly HudFlow[] {
  const rows: readonly HudFlow[] = [
    { label: 'Industry', amount: report.produced, direction: 'in' },
    { label: 'Building upkeep', amount: report.upkeep, direction: 'out' },
    { label: 'Shops', amount: report.retail, direction: 'out' },
    { label: 'Exports', amount: report.exported, direction: 'out' },
    { label: 'Construction', amount: report.construction, direction: 'out' },
  ];
  return rows.filter((row) => row.amount >= 0.005);
}

function materialsStatus(stock: number, report: MaterialsReport): string {
  if (report.waitingCost > stock) {
    return `Construction waiting: ${report.waitingCost.toFixed(0)} materials required; ` +
      `${Math.max(0, report.waitingCost - stock).toFixed(0)} still missing.`;
  }
  return `${report.reserve.toFixed(0)} materials reserved for construction; ` +
    'shops and exports use only the surplus.';
}

function resource(
  id: HudResource['id'],
  label: string,
  stock: number,
  delta: number,
  trend?: ResourceTrend,
  fill?: HudFill,
  breakdown?: readonly HudFlow[],
  status?: string,
  hint?: string,
): HudResource {
  return {
    id,
    label,
    value: formatInteger(stock),
    delta: delta === 0 ? '' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`,
    tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
    trend: trend?.direction(id) ?? 'flat',
    magnitude: trend?.magnitude(id) ?? 0,
    series: trend?.window(id) ?? [],
    ...(fill === undefined ? {} : { fill }),
    ...(breakdown === undefined || breakdown.length === 0 ? {} : { breakdown }),
    ...(status === undefined ? {} : { status }),
    ...(hint === undefined ? {} : { hint }),
  };
}

function foodReserve(stock: number, population: number): HudFill {
  const floor = BALANCE.gameplay.crisis.foodReserve;
  const perTick = population * BALANCE.food.perResident;
  const autonomy = perTick <= 0
    ? 'no one to feed yet'
    : `about ${Math.floor(stock / perTick)} ticks of eating`;
  return {
    value: floor <= 0 ? 1 : Math.min(1, stock / floor),
    label: `${Math.floor(stock)} food — ${autonomy}; shortage below ${floor}`,
  };
}

function emptyResource(id: HudResource['id'], label: string): HudResource {
  return { id, label, value: '—', delta: '', tone: 'neutral', trend: 'flat', magnitude: 0, series: [] };
}

function emptyResources(): readonly HudResource[] {
  return [
    emptyResource('funds', 'Funds'),
    emptyResource('population', 'Residents'),
    emptyResource('food', 'Food'),
    emptyResource('materials', 'Materials'),
    emptyResource('satisfaction', 'Happiness'),
  ];
}

function formatInteger(value: number): string {
  return Math.floor(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
