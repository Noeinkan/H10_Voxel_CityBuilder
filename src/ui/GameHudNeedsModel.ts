import { ALL_CLASSES, BALANCE, CLASS_LABELS } from '../sim';
import type { GrowthStats } from '../game/growthScene';
import { overviewGoal, type OverviewGoal } from './CityOverviewModel';

/**
 * Il traguardo di autosufficienza come blocco compatto della barra.
 *
 * Puro e senza DOM, come il resto del modello dell'HUD. Riusa `overviewGoal` dal
 * modello del cassetto Citta': il numero citato qui e' lo stesso del cassetto e
 * del coach, e include gli usi secondari dei blocchi misti. Il blocco non
 * duplica il toast: il toast dice la condizione e il gesto, questo dice quanto
 * manca al traguardo e qual e' il prossimo passo del coach, in modo persistente.
 */
export interface HudNeeds {
  /** Residenti attuali contro `BALANCE.gameplay.success.population`. */
  readonly residents: OverviewGoal;
  /** Edifici per uso — primari piu' secondari — contro `buildingsPerClass`. */
  readonly classes: readonly OverviewGoal[];
  /** Tutte le soglie al traguardo: residenti e ogni uso. */
  readonly met: boolean;
  /** Prossimo passo del coach, o null quando il coach tace. */
  readonly next: string | null;
}

/**
 * `null` quando il traguardo non esiste ancora: stato non pronto o tutorial.
 *
 * Durante l'onboarding mostrare «0/120 residents» insegnerebbe il passo
 * sbagliato — la prima lezione e' guardare la citta' crescere, non il numero.
 * In crisi il blocco resta: il progresso e' ancora vero, ed e' compatto.
 */
export function buildHudNeeds(stats: GrowthStats | null): HudNeeds | null {
  if (stats === null) return null;
  if (stats.condition.kind === 'onboarding') return null;
  const target = BALANCE.gameplay.success;
  const { state } = stats;
  const residents = overviewGoal(
    'population',
    'Residents',
    state.population.stock,
    target.population,
  );
  const classes = ALL_CLASSES.map((cls) => overviewGoal(
    `use-${cls}`,
    CLASS_LABELS[cls],
    state.buildingCounts[cls] + state.mixedCounts[cls],
    target.buildingsPerClass,
  ));
  return {
    residents,
    classes,
    met: residents.met && classes.every((entry) => entry.met),
    next: stats.coach?.title ?? null,
  };
}
