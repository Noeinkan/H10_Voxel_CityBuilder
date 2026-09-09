import { BALANCE } from '../sim/balance';
import { SEASON_NAMES, seasonAt } from '../sim/seasons';

/**
 * L'ora della citta', in una riga sola.
 *
 * **Nasce da un difetto di leggibilita', non da un vezzo.** I bottoni 1×, 2× e
 * 4× funzionavano — il passo della simulazione e' moltiplicato per la velocita'
 * scelta, e un test lo prova — ma niente a schermo lo dimostrava: l'HUD non
 * aveva ne' un orologio ne' un contatore, e su una citta' appena fondata, dove
 * ancora non cresce niente, le tre velocita' producono la stessa immagine ferma.
 * Un comando di cui non si vede l'effetto e' indistinguibile da un comando rotto.
 *
 * **Dice l'anno e la stagione, non il giorno**, e non e' un'approssimazione: in
 * questa citta' e' la **stagione** a durare quanto un giro del sole — un anno ne
 * conta quattro, la scelta e' documentata in `src/sim/balance.ts` e serve a
 * impedire un inverno che comincia e finisce dentro lo stesso pomeriggio. Un
 * «Day 3» racconterebbe un calendario che qui non esiste.
 *
 * **La stagione sta nella riga perche' senza si perderebbe la data.** Con quattro
 * giri di sole per anno, «Year 1 · 14:20» tornerebbe identico quattro volte, e
 * l'unico numero che si muove — l'ora — direbbe soltanto a che punto del giorno
 * si e'. Le tre parti scorrono a tre ritmi diversi, ed e' cio' che rende la riga
 * un orologio invece che un contatore.
 *
 * **Le due lancette vengono da due posti diversi, ed e' voluto.** L'anno conta
 * tick e vive nella simulazione; l'ora e' la posizione del sole e vive nel
 * renderer. Farle discendere entrambe dal tick renderebbe il titolo — che ha un
 * cielo e non ha una simulazione — un caso speciale da inventare. Restano
 * allineate perche' scorrono con lo stesso fattore: da quando `daylight.advance`
 * riceve il tempo gia' scalato, la pausa e la velocita' le fermano e le
 * accelerano insieme.
 */

/** Da che numero parte il conteggio: la citta' nasce nel suo primo anno, non nello zero. */
const FIRST_YEAR = 1;

/** In che anno sta la citta'. Conta i giri interi, non la fase dentro il giro. */
export function cityYear(tickCount: number): number {
  const year = BALANCE.seasons.yearTicks;
  if (!(year > 0) || !Number.isFinite(tickCount)) return FIRST_YEAR;
  return FIRST_YEAR + Math.floor(Math.max(0, tickCount) / year);
}

/**
 * L'ora del sole come la legge un orologio, `HH:MM`.
 *
 * I minuti sono arrotondati per difetto e non al piu' vicino: arrotondando,
 * `23:59.7` diventerebbe `24:00`, che e' un'ora che non esiste.
 */
export function clockTime(hour: number): string {
  if (!Number.isFinite(hour)) return '--:--';
  const wrapped = ((hour % 24) + 24) % 24;
  const hours = Math.floor(wrapped);
  const minutes = Math.floor((wrapped - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Il passo dell'orologio, in minuti di citta'.
 *
 * **Un giorno dura sei minuti veri**, quindi un minuto di citta' ne dura un
 * quarto di secondo: mostrandoli tutti, la cifra cambierebbe quattro volte al
 * secondo a velocita' uno e sedici a 4×, che non e' un orologio ma uno
 * sfarfallio — e un numero illeggibile non dimostra niente, che era il punto di
 * partenza. Un quarto d'ora si muove ogni ~3,7 secondi a velocita' uno e ogni
 * ~0,9 a 4×: si legge, e si vede che accelera.
 */
const CLOCK_STEP_MINUTES = 15;

/** La riga intera, come compare sotto i bottoni del tempo. */
export function cityClock(tickCount: number, hour: number): string {
  const step = CLOCK_STEP_MINUTES / 60;
  const stepped = Number.isFinite(hour) ? Math.floor(hour / step) * step : hour;
  const season = SEASON_NAMES[seasonAt(tickCount)] ?? '';
  return `Year ${cityYear(tickCount)} · ${season} · ${clockTime(stepped)}`;
}
