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
import type { ArcologyStanding } from '../world/arcology/prospect';
import { arcologyLines, arcologyReward } from './prospects';
import { meter, toneForFill, toneForLoad, type Meter } from './meters';
import type { HudIcon } from './hudIcons';

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

/**
 * La megastruttura come una scala, invece che come un contatore.
 *
 * **Prima era una riga sola, `Arcologies: 0`**, e zero e' il valore normale per
 * quasi tutta la partita: da solo non distingue «la citta' ci sta arrivando» da
 * «non ci arrivera' mai», che e' l'unica cosa che il giocatore volesse sapere.
 * La quota e' un traguardo con una barra come gli altri; le lacune sono cosa
 * manca; la ricompensa e' cosa si guadagna, che finora non era scritto da
 * nessuna parte.
 */
export interface OverviewArcology {
  readonly goal: OverviewGoal;
  readonly gaps: readonly OverviewFact[];
  readonly reward: string;
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
  /**
   * Di cosa la citta' ha bisogno adesso, come barre invece che come schede.
   *
   * Ha preso il posto di `capacity` ed `economy`, che erano otto riquadri di
   * testo con la stessa aria: fondamentali e dettagli si leggevano uguale, e
   * «73% fed» accanto a «4 hosted uses» chiedeva di sapere in anticipo quale
   * delle due fosse un'emergenza. Le stesse barre della scheda di selezione, per
   * la ragione per cui `meterBits.ts` esiste: due vocabolari grafici divergono.
   */
  readonly needs: readonly Meter[];
  readonly shape: readonly OverviewFact[];
  readonly infrastructure: readonly OverviewFact[];
  readonly arcology: OverviewArcology;
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
      overviewGoal('population', 'Residents', state.population.stock, target.population),
      ...ALL_CLASSES.map((cls) => overviewGoal(
        `use-${cls}`,
        CLASS_LABELS[cls],
        state.buildingCounts[cls] + state.mixedCounts[cls],
        target.buildingsPerClass,
      )),
    ],
    // L'ordine e' quello in cui una citta' muore: prima si smette di mangiare,
    // poi mancano le braccia, poi le case, poi l'umore, e solo alla fine i due
    // saldi. Un elenco ordinato per tema — capacita' da una parte, economia
    // dall'altra — chiedeva di sapere in anticipo quale meta' guardare.
    needs: [
      meter({
        id: 'food',
        icon: 'food',
        label: 'Food',
        value: `${Math.round(foodCoverage * 100)}% fed`,
        ratio: foodCoverage,
        tone: toneForFill(foodCoverage, 0.999),
        hint: foodCoverage >= 1
          ? 'Current demand is fully covered.'
          : 'Some residents went unfed this tick, and unfed residents leave.',
      }),
      meter({
        id: 'workforce',
        icon: 'population',
        label: 'Workforce',
        value: `${Math.round(state.staffing * 100)}% staffed`,
        ratio: state.staffing,
        tone: toneForFill(state.staffing, 0.995),
        hint: state.staffing < 0.995
          ? 'Industry, shops and farms are sharing too few workers.'
          : 'Productive buildings have the workers they need.',
      }),
      meter({
        id: 'homes',
        icon: 'residential',
        label: 'Homes',
        value: housingCapacity === 0
          ? 'none yet'
          : `${Math.round(occupancy * 100)}% of ${format(housingCapacity)}`,
        ratio: housingCapacity === 0 ? 0 : occupancy,
        tone: housingCapacity === 0 ? 'bad' : toneForLoad(occupancy),
        hint: housingCapacity === 0
          ? 'No residential capacity yet.'
          : `Room for ${format(housingCapacity)} residents citywide.`,
      }),
      meter({
        id: 'happiness',
        icon: 'satisfaction',
        label: 'Happiness',
        value: `${Math.round(state.satisfaction * 100)}% / ${Math.round(target.satisfaction * 100)}%`,
        ratio: target.satisfaction <= 0 ? 1 : state.satisfaction / target.satisfaction,
        tone: state.satisfaction >= target.satisfaction ? 'good' : 'watch',
        hint: 'Civic services, shops within reach, ferries and bridges lift it; crowding lowers it.',
      }),
      balanceMeter('funds', 'funds', 'Funds', state.funds.delta),
      balanceMeter('materials', 'materials', 'Materials', state.materials.delta),
      meter({
        id: 'mixed',
        icon: 'city',
        label: 'Mixed use',
        value: `${mixed} hosted use${mixed === 1 ? '' : 's'}`,
        tone: 'plain',
        hint: 'Secondary uses inside mixed blocks; they count toward the city goal.',
      }),
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
    ],
    arcology: arcologySection(stats.builder.arcology),
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

/**
 * Un traguardo numerico, come lo mostra il cassetto Citta'.
 *
 * Esportato perche' il blocco City needs della barra risorse cita gli stessi
 * numeri: condividerli e' cio' che tiene uguali i due posti dove si legge
 * «quanto manca», invece di due conti che divergono alla prima ritaratura.
 */
export function overviewGoal(id: string, label: string, current: number, target: number): OverviewGoal {
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

/**
 * La sezione della megastruttura: quota, cosa manca, cosa si guadagna.
 *
 * **Le parole non stanno qui.** `arcologyLines` e `arcologyReward` vivono in
 * `prospects.ts` insieme al resto della lingua di «cosa manca», perche' le
 * stesse righe servono anche alla scheda dell'isolato: scritte due volte
 * divergerebbero alla prima ritaratura, ed e' la ragione per cui quel file
 * esiste. Qui si sceglie soltanto quale forma dare a ciascuna.
 */
function arcologySection(standing: ArcologyStanding): OverviewArcology {
  return {
    goal: overviewGoal('arcologies', 'Arcologies', standing.existing, standing.allowed),
    gaps: arcologyLines(standing).map((line) => ({
      label: line.label,
      value: line.value,
      tone: 'neutral' as const,
    })),
    reward: arcologyReward(standing),
  };
}

/**
 * Un saldo per tick, senza barra.
 *
 * Un delta non ha un tetto contro cui misurarsi: la barra direbbe una lunghezza
 * che non si confronta con niente, ed e' esattamente il caso per cui `ratio`
 * ammette `null`. Resta il tono, che e' l'unica cosa che serve sapere a colpo
 * d'occhio — se sta entrando o uscendo.
 */
function balanceMeter(id: string, icon: HudIcon, label: string, delta: number): Meter {
  return meter({
    id: `${id}-balance`,
    icon,
    label,
    value: `${delta > 0 ? '+' : ''}${delta.toFixed(1)} / tick`,
    tone: delta >= 0 ? 'good' : 'bad',
    hint: delta >= 0 ? 'Meets the self-sufficiency goal.' : 'Must return to zero or better.',
  });
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
