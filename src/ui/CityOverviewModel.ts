import {
  ALL_CLASSES,
  BALANCE,
  BUILDING_CLASS,
  CLASS_LABELS,
  catalystById,
  charterById,
  effectiveCount,
  fedShareOf,
  weightsOf,
} from '../sim';
import type { GrowthStats } from '../game/growthScene';
import type { CityConditionTone } from '../game/cityCondition';

export interface OverviewGoal {
  readonly id: string;
  readonly label: string;
  readonly current: number;
  readonly target: number;
  readonly value: string;
  readonly progress: number;
  readonly met: boolean;
}

export interface OverviewFact {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly tone?: 'positive' | 'warning' | 'neutral';
}

export interface OverviewMandate {
  readonly label: string;
  readonly family: string;
  readonly effect: string;
}

export interface OverviewDecision {
  readonly tick: number;
  readonly summary: string;
}

export interface OverviewTrade {
  readonly connected: boolean;
  readonly links: readonly string[];
  readonly food: number;
  readonly materials: number;
  readonly funds: number;
}

export interface CityOverviewModel {
  readonly condition: {
    readonly title: string;
    readonly message: string;
    readonly tone: CityConditionTone;
  };
  readonly goals: readonly OverviewGoal[];
  readonly capacity: readonly OverviewFact[];
  readonly economy: readonly OverviewFact[];
  readonly shape: readonly OverviewFact[];
  readonly infrastructure: readonly OverviewFact[];
  readonly mandates: readonly OverviewMandate[];
  readonly history: readonly OverviewDecision[];
  readonly trade: OverviewTrade;
}

export function buildCityOverviewModel(stats: GrowthStats | null): CityOverviewModel | null {
  if (stats === null) return null;
  const { state } = stats;
  const target = BALANCE.gameplay.success;
  const weights = weightsOf(state);
  const housingCapacity = Math.floor(
    effectiveCount(state, BUILDING_CLASS.residential) * weights.residentialCapacity,
  );
  const occupancy = housingCapacity <= 0 ? 0 : state.population.stock / housingCapacity;
  const foodCoverage = fedShareOf(state.harvest, state.population.stock);
  const mixed = state.mixedCounts.reduce((sum, value) => sum + value, 0);
  const levels = stats.levels
    .map((count, level) => ({ count, level }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `L${entry.level} ${entry.count}`)
    .join(' · ');
  const typologies = stats.typologies
    .slice(0, 4)
    .map(([label, count]) => `${label} ${count}`)
    .join(' · ');

  return {
    condition: {
      title: stats.condition.title,
      message: stats.condition.message,
      tone: stats.condition.tone,
    },
    goals: [
      goal('population', 'Residents', state.population.stock, target.population),
      ...ALL_CLASSES.map((cls) => goal(
        `use-${cls}`,
        CLASS_LABELS[cls],
        state.buildingCounts[cls] + state.mixedCounts[cls],
        target.buildingsPerClass,
      )),
    ],
    capacity: [
      {
        label: 'Housing capacity',
        value: `${format(housingCapacity)} residents`,
        note: housingCapacity === 0
          ? 'No residential capacity yet.'
          : `${Math.round(occupancy * 100)}% occupied`,
        tone: occupancy > 1 ? 'warning' : 'neutral',
      },
      {
        label: 'Workforce',
        value: `${Math.round(state.staffing * 100)}% staffed`,
        note: state.staffing < 0.995
          ? 'Industry, shops and farms are sharing too few workers.'
          : 'Productive buildings have the workers they need.',
        tone: state.staffing < 0.995 ? 'warning' : 'positive',
      },
      {
        label: 'Mixed use',
        value: `${mixed} hosted use${mixed === 1 ? '' : 's'}`,
        note: 'Secondary uses count toward the city goal.',
        tone: 'neutral',
      },
    ],
    economy: [
      {
        label: 'Food coverage',
        value: `${Math.round(foodCoverage * 100)}% fed`,
        note: foodCoverage >= 1 ? 'Current demand is fully covered.' : 'Some residents went unfed this tick.',
        tone: foodCoverage >= 1 ? 'positive' : 'warning',
      },
      balanceFact('Funds balance', state.funds.delta),
      balanceFact('Materials balance', state.materials.delta),
      {
        label: 'Happiness',
        value: `${Math.round(state.satisfaction * 100)}% / ${Math.round(target.satisfaction * 100)}% goal`,
        tone: state.satisfaction >= target.satisfaction ? 'positive' : 'warning',
      },
    ],
    shape: [
      { label: 'Buildings', value: format(stats.buildings) },
      { label: 'Height bands', value: levels === '' ? 'None yet' : levels },
      { label: 'Main typologies', value: typologies === '' ? 'None yet' : typologies },
      { label: 'Farm plots', value: format(stats.builder.farmPlots) },
    ],
    infrastructure: [
      { label: 'Coastal sectors', value: format(stats.unlockedSectors.length) },
      {
        label: 'Elevated links',
        value: `${stats.builder.spans} spans · ${stats.builder.spanReach} blocks reached`,
      },
      {
        label: 'Aerial city',
        value: `${stats.builder.terraces} terraces · ${stats.builder.routes} routes · ` +
          `${stats.builder.stacked} stacked · ${stats.builder.lifts} lifts`,
      },
      { label: 'Ropeways', value: format(stats.builder.ropeways) },
      { label: 'Arcologies', value: format(stats.builder.arcologies) },
    ],
    mandates: state.charters.map((id) => {
      const charter = charterById(id);
      return {
        label: capitalise(charter.label),
        family: familyLabel(charter.family),
        effect: charter.spatialEffect,
      };
    }),
    history: state.decisionHistory.slice(-5).reverse().map((entry) => ({
      tick: entry.tick,
      summary: entry.summary,
    })),
    trade: {
      connected: state.trade.connected,
      links: state.trade.links.map((id) => catalystById(id).label),
      food: state.trade.food,
      materials: state.trade.materials,
      funds: state.trade.funds,
    },
  };
}

function goal(id: string, label: string, current: number, target: number): OverviewGoal {
  return {
    id,
    label,
    current,
    target,
    value: `${format(current)} / ${format(target)}`,
    progress: target <= 0 ? 1 : Math.min(1, Math.max(0, current / target)),
    met: current >= target,
  };
}

function balanceFact(label: string, delta: number): OverviewFact {
  return {
    label,
    value: `${delta > 0 ? '+' : ''}${delta.toFixed(1)} / tick`,
    note: delta >= 0 ? 'Meets the self-sufficiency goal.' : 'Must return to zero or better.',
    tone: delta >= 0 ? 'positive' : 'warning',
  };
}

function familyLabel(family: string): string {
  if (family === 'publicSpace') return 'Public space';
  return capitalise(family);
}

function capitalise(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function format(value: number): string {
  return Math.floor(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
