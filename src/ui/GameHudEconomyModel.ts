import {
  BALANCE,
  FARM_KIND,
  FARM_LABELS,
  type FoodReport,
  type MaterialsReport,
} from '../sim';
import type { GrowthStats } from '../game/growthScene';
import type { FundsReport } from '../sim/flows';
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

export function buildHudResources(
  stats: GrowthStats | null,
  trend?: ResourceTrend,
): readonly HudResource[] {
  if (stats === null) return emptyResources();
  const population = stats.state.population.stock;
  return [
    resource(
      'funds',
      'Funds',
      stats.state.funds.stock,
      stats.state.funds.delta,
      trend,
      undefined,
      fundsBreakdown(stats.state.flows),
    ),
    resource('population', 'Residents', population, stats.state.population.delta, trend),
    resource(
      'food',
      'Food',
      stats.state.food.stock,
      stats.state.food.delta,
      trend,
      foodReserve(stats.state.food.stock, population),
      foodBreakdown(stats.state.harvest),
    ),
    resource(
      'materials',
      'Materials',
      stats.state.materials.stock,
      stats.state.materials.delta,
      trend,
      undefined,
      materialsBreakdown(stats.state.materialFlows),
      materialsStatus(stats.state.materials.stock, stats.state.materialFlows),
    ),
    {
      id: 'satisfaction',
      label: 'Happiness',
      value: `${Math.round(stats.state.satisfaction * 100)}%`,
      delta: '',
      tone: 'neutral',
      trend: trend?.direction('satisfaction') ?? 'flat',
      magnitude: trend?.magnitude('satisfaction') ?? 0,
      series: trend?.window('satisfaction') ?? [],
      fill: {
        value: stats.state.satisfaction,
        label: `${Math.round(stats.state.satisfaction * 100)}% of the city is content`,
      },
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
