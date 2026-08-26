import { ALL_CLASSES, BALANCE, fedShareOf, type SimState } from '../sim';
import { onboardingOf } from './onboarding';
import { urgentTip } from './tips';
import type { CoachSuggestion } from './coach';

export type CityConditionTone = 'objective' | 'warning' | 'success';

export interface CityCondition {
  readonly kind: 'onboarding' | 'development' | 'crisis' | 'coach' | 'success';
  readonly tone: CityConditionTone;
  readonly title: string;
  readonly message: string;
}

/**
 * **Il cibo si chiede a `fedShareOf` e non al segno del delta.** Uno stock
 * esaurito si ferma a zero e il delta vale esattamente zero, quindi una citta'
 * che mangiava un terzo di cio' che le serviva superava questo controllo come
 * una in equilibrio — l'obiettivo scorreva mentre la citta' moriva di fame.
 * Sfamata vuol dire che la domanda del tick e' stata servita tutta, non che il
 * magazzino non e' sceso.
 *
 * Materiali e fondi hanno lo stesso punto cieco e restano sul delta: chiuderlo
 * chiede il loro equivalente di `fed`, che oggi il referto non porta.
 */
export function isSelfSufficient(state: SimState): boolean {
  const target = BALANCE.gameplay.success;
  return state.population.stock >= target.population &&
    ALL_CLASSES.every(
      (cls) => state.buildingCounts[cls] + state.mixedCounts[cls] >= target.buildingsPerClass,
    ) &&
    fedShareOf(state.harvest, state.population.stock) >= 1 &&
    state.materials.delta >= 0 && state.funds.delta >= 0 &&
    state.satisfaction >= target.satisfaction;
}

/**
 * Condizione direzionale, ordinata dalla crisi piu' recuperabile al successo.
 *
 * **La scala della voce.** Il tutorial per primo, poi la salute — crisi e colli
 * di bottiglia, che sono l'unica cosa rimasta in `tips.ts` — poi il **coach**, la
 * rotta di sviluppo che e' sempre presente finche' la citta' ha qualcosa da
 * diventare, e solo quando il coach tace il traguardo. Un traguardo e' sempre lo
 * stesso e si puo' rileggere quando si vuole; una direzione e' vera adesso e
 * smettera' di esserlo appena il giocatore la segue.
 *
 * Il coach arriva gia' calcolato: `cityCondition` resta pura e decide solo
 * l'ordine, mentre a valutare la rotta e' `growthScene` una volta per tick.
 */
export function cityCondition(
  state: SimState,
  stableTicks: number,
  coach: CoachSuggestion | null = null,
): CityCondition {
  const onboarding = onboardingOf(state);
  if (onboarding.step !== 'complete') {
    return {
      kind: 'onboarding',
      tone: 'objective',
      title: onboarding.title,
      message: onboarding.message,
    };
  }

  // La crisi passa davanti a tutto, traguardo compreso: una citta' che non mangia
  // non ha bisogno di sapere quanti secondi le mancano.
  const urgent = urgentTip(state);
  if (urgent !== null && urgent.kind === 'crisis') {
    return { kind: 'crisis', tone: 'warning', title: urgent.title, message: urgent.message };
  }

  // I colli di bottiglia passano davanti al coach e al traguardo: «l'organico e'
  // al 42%» e' vero adesso e smettera' di esserlo, mentre la rotta puo' aspettare.
  if (urgent !== null) {
    return { kind: 'development', tone: 'warning', title: urgent.title, message: urgent.message };
  }

  // Il coach e' la direzione: sempre presente, finche' la citta' ha un prossimo
  // passo da fare.
  if (coach !== null) {
    return { kind: 'coach', tone: 'objective', title: coach.title, message: coach.message };
  }

  // Il traguardo compare solo quando il coach non ha piu' niente da dire.
  if (stableTicks >= BALANCE.gameplay.success.stableTicks) {
    return {
      kind: 'success',
      tone: 'success',
      title: 'Self-sufficient city',
      message: 'Population, resources, and services are stable. Expand or aim for a more ambitious skyline.',
    };
  }

  // Un edificio misto conta anche per il suo secondo uso: chiedere quattro
  // quartieri separati quando la citta' ne ha tre e un isolato che ne fa due
  // sarebbe chiedere di disfare proprio cio' che la fase premia.
  const missing = ALL_CLASSES
    .map((cls) => state.buildingCounts[cls] + state.mixedCounts[cls])
    .filter((count) => count < BALANCE.gameplay.success.buildingsPerClass).length;
  if (missing > 0) {
    return {
      kind: 'development',
      tone: 'objective',
      title: 'Goal · self-sufficient city',
      message: `Build at least ${BALANCE.gameplay.success.buildingsPerClass} buildings of each class and reach ${BALANCE.gameplay.success.population} residents.`,
    };
  }

  const seconds = Math.ceil((BALANCE.gameplay.success.stableTicks - stableTicks) / 10);
  return {
    kind: 'development',
    tone: 'objective',
    title: 'Goal · self-sufficient city',
    message: `Keep food, materials, and funds balanced for ${seconds} seconds.`,
  };
}
