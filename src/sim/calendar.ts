import { BALANCE } from './balance';
import type { SimState } from './SimState';
import {
  seasonOfPhase,
  seasonHeartPhase,
  seasonStartPhase,
  tickAtPhase,
  yearPhaseAt,
  type Season,
} from './seasons';

/**
 * Il calendario, che non e' l'orologio.
 *
 * **`tickCount` e' l'eta' della citta' e non si tocca.** Ci poggiano sopra tutte
 * le scadenze della simulazione — la prossima decisione, i raffreddamenti degli
 * eventi, i lucchetti delle policy, la storia delle scelte — e spostarlo per
 * cambiare stagione vorrebbe dire far scattare o annullare cose che non
 * c'entrano niente con il mese. Qui si sposta un secondo numero, `calendarShift`,
 * che si somma al tick **solo** quando si legge l'anno: la data si muove, l'eta'
 * no.
 *
 * **E' la stessa idea di `YEAR_START_PHASE`, resa scegliibile.** La citta'
 * nasceva gia' a meta' estate invece che al primo giorno di primavera, cioe' con
 * un calendario sfasato rispetto ai tick: quella costante e' lo scorrimento
 * scritto una volta per tutte, questo e' lo stesso scorrimento in mano al
 * giocatore.
 *
 * **Scorre solo in avanti.** Ogni salto aggiunge la distanza che manca alla
 * stagione chiesta, mai quella che si e' appena passata: cosi' l'anno mostrato
 * dall'orologio non torna mai indietro, che sarebbe l'unica cosa che a schermo
 * si leggerebbe come un guasto invece che come un calendario.
 */

/** Quanto basta per leggere il calendario: l'eta' della citta' e il suo scorrimento. */
export interface CalendarState {
  readonly tickCount: number;
  readonly calendarShift: number;
}

/** Il tick con cui si legge l'anno: l'eta' piu' lo scorrimento scelto. */
export function calendarTickOf(state: CalendarState): number {
  const shift = Number.isFinite(state.calendarShift) ? state.calendarShift : 0;
  return state.tickCount + shift;
}

/** Dove sta l'anno adesso, in [0, 1). */
export function calendarPhaseOf(state: CalendarState): number {
  return yearPhaseAt(calendarTickOf(state));
}

/** In che stagione sta la citta' adesso. */
export function calendarSeasonOf(state: CalendarState): Season {
  return seasonOfPhase(calendarPhaseOf(state));
}

/**
 * Lo scorrimento con cui una citta' **nasce** in una stagione.
 *
 * Nel **cuore** della stagione e non al suo primo giorno, e non e' un dettaglio:
 * l'estate al centro vale `YEAR_START_PHASE`, quindi una partita che non chiede
 * niente nasce esattamente dov'e' sempre nata — stesso raccolto di partenza,
 * stesso prato del tema — e le altre tre stagioni entrano dalla stessa porta.
 * Al confine fra due stagioni invece il colore e la resa sono a meta' strada fra
 * l'una e l'altra, che e' un posto strano in cui far cominciare una partita.
 */
export function birthShift(season: Season): number {
  return Math.ceil(tickAtPhase(seasonHeartPhase(season)));
}

/**
 * Lo scorrimento che porta il calendario al **primo giorno** della stagione
 * chiesta, andando avanti.
 *
 * Torna quello corrente se la citta' e' gia' in quella stagione: il bottone
 * acceso e' quello in cui si sta, e premerlo non deve buttare via l'anno intero
 * che manca al prossimo giro.
 */
export function shiftToSeason(state: CalendarState, season: Season): number {
  const year = BALANCE.seasons.yearTicks;
  const shift = Number.isFinite(state.calendarShift) ? state.calendarShift : 0;
  if (!(year > 0)) return shift;
  if (calendarSeasonOf(state) === season) return shift;

  // In tick e non in fase: `ceil` garantisce di non fermarsi un capello **prima**
  // del confine, dove la stagione letta sarebbe ancora quella di partenza e il
  // bottone premuto resterebbe spento.
  const target = Math.ceil(tickAtPhase(seasonStartPhase(season)));
  const now = ((calendarTickOf(state) % year) + year) % year;
  const forward = ((target - now) % year + year) % year;
  return shift + forward;
}

/**
 * Porta il calendario al primo giorno della stagione chiesta.
 *
 * Torna lo **stesso** stato quando non c'e' niente da spostare, cosi' chi chiama
 * sa dire in una riga se la citta' si e' mossa senza confrontare due numeri.
 */
export function jumpToSeason(state: SimState, season: Season): SimState {
  const shift = shiftToSeason(state, season);
  return shift === state.calendarShift ? state : { ...state, calendarShift: shift };
}
