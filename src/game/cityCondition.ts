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
 * rotta di sviluppo che compare quando esiste un gesto misurabile, e solo quando
 * il coach tace il traguardo. Un traguardo e' sempre lo
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

  // Il coach e' la direzione quando sa nominare gesto e verifica.
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
  const target = BALANCE.gameplay.success;
  const ready = ALL_CLASSES
    .map((cls) => state.buildingCounts[cls] + state.mixedCounts[cls])
    .filter((count) => count >= target.buildingsPerClass).length;
  /*
   * **Il traguardo porta il punteggio, non il proprio nome.**
   *
   * «Goal · self-sufficient city» resta a schermo per l'intera partita e non
   * cambia mai: e' una scritta, non una misura, e la distanza da coprire —
   * quante classi sono a posto, quanti abitanti mancano — stava tutta nel
   * messaggio, cioe' nel cassetto che si apre solo se lo si apre. Sono gli
   * unici due numeri che dicono se l'ultima mossa ha avvicinato o allontanato il
   * traguardo, e vanno dove si guarda.
   */
  if (ready < ALL_CLASSES.length) {
    const residents = Math.round(state.population.stock);
    return {
      kind: 'development',
      tone: 'objective',
      title: `Goal · ${ready}/${ALL_CLASSES.length} classes at ${target.buildingsPerClass} buildings, ${residents}/${target.population} residents`,
      message: `Build at least ${target.buildingsPerClass} buildings of each class and reach ${target.population} residents.`,
    };
  }

  const seconds = Math.ceil((target.stableTicks - stableTicks) / 10);
  return {
    kind: 'development',
    tone: 'objective',
    title: `Goal · keep food, materials and funds balanced for ${seconds}s`,
    message: `Keep food, materials, and funds balanced for ${seconds} seconds.`,
  };
}
