import { ALL_CLASSES, BALANCE, fedShareOf, type SimState } from '../sim';
import { onboardingOf } from './onboarding';
import { evergreenTip, urgentTip, TIP_TURN_TICKS } from './tips';

export type CityConditionTone = 'objective' | 'warning' | 'success';

export interface CityCondition {
  readonly kind: 'onboarding' | 'development' | 'crisis' | 'success';
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
 * **Le crisi e i consigli sono lo stesso elenco.** Le tre condizioni che stavano
 * scritte qui — cibo, fondi, soddisfazione — vivono adesso in `tips.ts` insieme
 * ai colli di bottiglia, alle opportunita' e alle meccaniche, perche' erano gia'
 * dei consigli: la differenza fra «la citta' non mangia» e «la citta' e' a corto
 * di braccia» e' l'urgenza, non la natura. Tenerne tre qui e il resto altrove
 * avrebbe voluto dire due voci che si contendono la stessa riga di schermo.
 *
 * Qui resta cio' che questa funzione ha sempre fatto: **decidere di cosa si
 * parla**, cioe' l'ordine fra il tutorial, l'urgenza, il traguardo e la regola
 * da raccontare quando non succede niente.
 */
export function cityCondition(state: SimState, stableTicks: number): CityCondition {
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

  if (stableTicks >= BALANCE.gameplay.success.stableTicks) {
    return {
      kind: 'success',
      tone: 'success',
      title: 'Self-sufficient city',
      message: 'Population, resources, and services are stable. Expand or aim for a more ambitious skyline.',
    };
  }

  // Colli di bottiglia e opportunita' passano davanti al traguardo, e non e' una
  // svista: il traguardo e' sempre lo stesso e si puo' rileggere quando si vuole,
  // mentre «l'organico e' al 42%» e' vero adesso e smettera' di esserlo. La riga
  // di schermo e' una sola, e va a cio' che cambia.
  if (urgent !== null) {
    return {
      kind: 'development',
      tone: urgent.kind === 'bottleneck' ? 'warning' : 'objective',
      title: urgent.title,
      message: urgent.message,
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

  // **La citta' che va bene e' quella a cui si puo' insegnare qualcosa.** Qui non
  // c'e' niente da riparare e il traguardo e' un'attesa a orologio: e' l'unico
  // momento in cui una regola che il gioco non dice da nessuna parte ha spazio
  // per essere letta. Si alterna al conto alla rovescia invece di sostituirlo,
  // perche' quanto manca resta la domanda che il giocatore si fa.
  const seconds = Math.ceil((BALANCE.gameplay.success.stableTicks - stableTicks) / 10);
  const goal = {
    kind: 'development' as const,
    tone: 'objective' as const,
    title: 'Goal · self-sufficient city',
    message: `Keep food, materials, and funds balanced for ${seconds} seconds.`,
  };

  // I turni pari sono del traguardo, i dispari della regola — e l'indice della
  // regola conta i **soli** turni dispari, o meta' dell'elenco non uscirebbe mai.
  // Il conto passa dal `tickCount` e non da un timer, quindi la riga non cambia
  // mentre il gioco e' in pausa: che e' proprio quando la si sta leggendo.
  const turn = Math.floor(state.tickCount / TIP_TURN_TICKS);
  if (turn % 2 === 0) return goal;

  const evergreen = evergreenTip(state, Math.floor(turn / 2));
  if (evergreen === null) return goal;
  return {
    kind: 'development',
    tone: 'objective',
    title: evergreen.title,
    message: evergreen.message,
  };
}
