import { BUILDING_CLASS } from './classes';
import { coverageAt } from './coverage';
import { urbanFieldAt, type DistrictId } from './districts';
import { capacityAtLevel } from './materials';
import type { SimState } from './SimState';

/**
 * Le viste informative in stile Cities Skylines: per cella, un valore continuo
 * o una categoria.
 *
 * **La fonte e' sempre la simulazione.** Densita' e materiali escono dai conteggi
 * di capacita' derivati da `state.buildings`; felicita' e distretti da
 * `urbanFieldAt`, che condivide l'aritmetica di `urbanProfileAt`. Il cibo non
 * sta qui: i lotti agricoli vivono nel mondo (`src/world/farms/`), e a comporre
 * quella vista e' `src/game/infoViews.ts`.
 *
 * **Nessun colore qui dentro.** Le etichette sono parole (in inglese, come ogni
 * stringa visibile); la rampa e le palette stanno nel renderer
 * (`src/engine/InfoViewOverlay.ts`), come `CLASS_COLORS` vive in
 * `InfluenceOverlay`. La simulazione resta pura e senza opinioni sul look.
 */

/** Il modo di una vista: una scala continua o un insieme di categorie. */
export type InfoViewMode = 'continuous' | 'categorical';

/** Le sette viste, nell'ordine in cui si ciclano con il tasto `I`. */
export type InfoViewKind =
  | 'off'
  | 'food'
  | 'materials'
  | 'density'
  | 'coverage'
  | 'happiness'
  | 'districts';

export interface InfoViewSpec {
  readonly kind: InfoViewKind;
  readonly label: string;
  readonly description: string;
  readonly mode: InfoViewMode;
  /** Le categorie di una vista categorica, in ordine di indice. Vuote per la continua. */
  readonly categories: readonly string[];
  /**
   * true se i campioni sono gia' in 0..1 e non vanno rinormalizzati sul massimo.
   *
   * La felicita' e' gia' un rapporto; densita' e materiali sono capacita' brute
   * di cui il massimo della regione non si conosce a priori.
   */
  readonly normalized: boolean;
}

/** L'ordine canonico dei distretti: e' anche l'indice di categoria. */
export const DISTRICT_ORDER: readonly DistrictId[] = [
  'outskirts',
  'harbor',
  'market',
  'industrial',
  'transit',
  'garden',
  'campus',
  'monumental',
  'mixed',
];

/** Etichette leggibili dei distretti, allineate a `DISTRICT_ORDER`. */
export const DISTRICT_CATEGORIES: readonly string[] = [
  'Outskirts',
  'Harbor',
  'Market',
  'Industrial',
  'Transit',
  'Garden',
  'Campus',
  'Monumental',
  'Mixed',
];

/** Le tre categorie del cibo, allineate a `FARM_KIND` (field, orchard, tower). */
export const FOOD_CATEGORIES: readonly string[] = ['Fields', 'Orchards', 'Towers'];

export const INFO_VIEWS: readonly InfoViewSpec[] = [
  {
    kind: 'off',
    label: 'City',
    description: 'The city as it stands, with no data overlay.',
    mode: 'continuous',
    categories: [],
    normalized: true,
  },
  {
    kind: 'food',
    label: 'Food',
    description: 'Where the city grows its food: fields, orchards and hydroponic towers.',
    mode: 'categorical',
    categories: FOOD_CATEGORIES,
    normalized: true,
  },
  {
    kind: 'materials',
    label: 'Materials',
    description: 'Where materials are produced: industrial capacity, column by column.',
    mode: 'continuous',
    categories: [],
    normalized: false,
  },
  {
    kind: 'density',
    label: 'Population',
    description: 'Where people can live: residential capacity, column by column.',
    mode: 'continuous',
    categories: [],
    normalized: false,
  },
  {
    kind: 'coverage',
    label: 'Services',
    description: 'How well each block is served, between the city-wide baseline and the landmarks nearby.',
    mode: 'continuous',
    categories: [],
    normalized: true,
  },
  {
    kind: 'happiness',
    label: 'Happiness',
    description: 'How satisfied each block is, from the landmarks, policies and charters around it.',
    mode: 'continuous',
    categories: [],
    normalized: true,
  },
  {
    kind: 'districts',
    label: 'Districts',
    description: 'The quarters that emerge where landmark influences overlap.',
    mode: 'categorical',
    categories: DISTRICT_CATEGORIES,
    normalized: true,
  },
];

const BY_KIND = new Map<InfoViewKind, InfoViewSpec>(INFO_VIEWS.map((spec) => [spec.kind, spec]));

export function infoViewSpecOf(kind: InfoViewKind): InfoViewSpec {
  const found = BY_KIND.get(kind);
  if (found === undefined) throw new Error(`unknown info view: ${kind}`);
  return found;
}

export function isInfoViewKind(value: string): value is InfoViewKind {
  return BY_KIND.has(value as InfoViewKind);
}

/** La vista successiva nel giro `I`: dopo l'ultima si torna alla citta' nuda. */
export function nextInfoView(kind: InfoViewKind): InfoViewKind {
  const index = INFO_VIEWS.findIndex((spec) => spec.kind === kind);
  return INFO_VIEWS[(index + 1) % INFO_VIEWS.length].kind;
}

/**
 * Un campionatore di vista: per cella restituisce un valore continuo grezzo, un
 * indice di categoria, o -1 dove la categoria non esiste (un prato senza cibo).
 */
export interface InfoSampler {
  readonly kind: InfoViewKind;
  readonly mode: InfoViewMode;
  readonly normalized: boolean;
  readonly categories: readonly string[];
  sample(x: number, y: number): number;
}

/**
 * Versione strutturale dello stato, per capire quando ricostruire la heatmap.
 *
 * Non entra il tick perche' il campo non cambia con il tick: entrano i fatti che
 * lo fanno cambiare — catalizzatori, edifici, policy e lotti agricoli — e il
 * contatore di celle ricalcolate, che avanza a ogni piazzamento.
 */
export function infoViewVersion(state: SimState): string {
  return [
    state.catalysts.length,
    state.buildings.length,
    state.policies.join('+'),
    state.farmCounts.join(','),
    state.field.totalRecomputedCells,
    // La copertura ha una meta' che il campo non vede: la quota cittadina, che
    // si muove con la popolazione a ogni tick. Entra **arrotondata al
    // centesimo**, o la heatmap si rifarebbe sessanta volte al secondo per uno
    // spostamento che nessuno distingue a schermo.
    state.coverageReport.base.toFixed(2),
  ].join('|');
}

/** Capacita' residenziale e industriale per colonna, derivata dagli edifici. */
interface CapacityIndex {
  readonly map: ReadonlyMap<string, { readonly residential: number; readonly industrial: number }>;
}

/**
 * Costruisce l'indice di capacita' per colonna da `state.buildings`.
 *
 * Una colonna puo' portare piu' edifici impilati, quindi le capacita' si
 * **sommano** per cella. La torre idroponica e' industria convertita: produce
 * cibo, non materiali, e percio' non conta nella capacita' industriale.
 */
export function capacityIndex(state: SimState): CapacityIndex {
  const map = new Map<string, { residential: number; industrial: number }>();
  for (const building of state.buildings) {
    const key = `${building.x},${building.y}`;
    let entry = map.get(key);
    if (entry === undefined) {
      entry = { residential: 0, industrial: 0 };
      map.set(key, entry);
    }
    const capacity = capacityAtLevel(building.level ?? 0);
    if (building.class === BUILDING_CLASS.residential) entry.residential += capacity;
    else if (building.class === BUILDING_CLASS.industrial && building.specialization !== 'farming') {
      entry.industrial += capacity;
    }
  }
  return { map };
}

/**
 * Il campionatore per le quattro viste che vivono dentro la simulazione.
 *
 * Il cibo passa da `src/game/infoViews.ts`, che ha i lotti del mondo; `'off'`
 * non e' una vista ma lo stato di nessuna vista, e qui non ha campionatore.
 */
export function createSimInfoSampler(kind: InfoViewKind, state: SimState): InfoSampler {
  const spec = infoViewSpecOf(kind);

  if (kind === 'density' || kind === 'materials') {
    const index = capacityIndex(state);
    const pick = kind === 'density' ? 'residential' : 'industrial';
    return {
      kind,
      mode: spec.mode,
      normalized: spec.normalized,
      categories: spec.categories,
      sample(x: number, y: number): number {
        return index.map.get(`${x},${y}`)?.[pick] ?? 0;
      },
    };
  }

  if (kind === 'coverage') {
    // Il referto si legge **una volta**: la quota cittadina e' la stessa per
    // ogni colonna della mappa, e questa vista ne campiona migliaia.
    const report = state.coverageReport;
    const field = state.field;
    return {
      kind,
      mode: spec.mode,
      normalized: spec.normalized,
      categories: spec.categories,
      sample(x: number, y: number): number {
        return coverageAt(field, report, x, y);
      },
    };
  }

  if (kind === 'happiness') {
    return {
      kind,
      mode: spec.mode,
      normalized: spec.normalized,
      categories: spec.categories,
      sample(x: number, y: number): number {
        return urbanFieldAt(state, x, y).satisfaction;
      },
    };
  }

  if (kind === 'districts') {
    return {
      kind,
      mode: spec.mode,
      normalized: spec.normalized,
      categories: spec.categories,
      sample(x: number, y: number): number {
        return DISTRICT_ORDER.indexOf(urbanFieldAt(state, x, y).district);
      },
    };
  }

  throw new Error(`no simulator sampler for info view: ${kind}`);
}
