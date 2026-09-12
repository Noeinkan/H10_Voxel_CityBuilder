import { BALANCE } from './balance';

/**
 * L'anno: la sola lancetta della simulazione che non conta risorse.
 *
 * **Serve a dare un senso a una scorta.** Dalla 3.1 il cibo ha un posto sulla
 * mappa e un listino in case sfamate, ma non c'era motivo di averne piu' del
 * necessario: `food.targetCoverage` punta a un margine fisso, e una citta' in
 * pareggio resta in pareggio per sempre. Con una resa che sale e scende,
 * accumulare d'estate e' cio' che fa attraversare l'inverno, e la dispensa
 * smette di essere un numero che non si guarda mai.
 *
 * **E' una funzione pura di `tickCount`, e non uno stato.** Non c'e' niente da
 * salvare — il tick e' gia' nello stato — e niente che possa divergere dalla
 * realta': la stessa partita riaperta allo stesso tick sta nella stessa
 * stagione. E' la stessa scelta di `urbanProfileAt`, nel verso opposto: quella
 * e' spaziale e non deve leggere il tempo, questa e' temporale e non deve
 * leggere il luogo.
 *
 * **La resa e' una curva, non quattro gradini.** Un moltiplicatore a scalini
 * farebbe saltare il raccolto del cinquanta per cento da un tick al successivo,
 * e a schermo sarebbe un guasto, non una stagione. Un seno ha in piu' due
 * proprieta' che servono: la media sull'anno vale **esattamente** uno — quindi
 * chi dimensiona la campagna (`missingPlotsOf`) continua a farlo su un numero
 * onesto — e non ha un istante in cui il bilancio cambia di scatto.
 */

/** Le quattro stagioni, come indici densi. Zero e' la primavera, l'inizio del calendario. */
export const SEASON = {
  spring: 0,
  summer: 1,
  autumn: 2,
  winter: 3,
} as const;

export type Season = (typeof SEASON)[keyof typeof SEASON];

/** Nomi in ordine di indice, per HUD e overlay. */
export const SEASON_NAMES: readonly string[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

export const SEASON_COUNT = SEASON_NAMES.length;

/** Le quattro in ordine, per chi deve disegnarle o percorrerle tutte. */
export const SEASONS: readonly Season[] = [SEASON.spring, SEASON.summer, SEASON.autumn, SEASON.winter];

/**
 * Gli id con cui una stagione si scrive in un indirizzo.
 *
 * Minuscoli e separati da `SEASON_NAMES` perche' sono chiavi e non etichette:
 * `?calendar=winter` deve continuare a valere anche il giorno in cui l'HUD
 * scrivesse «Deep winter» sul bottone.
 */
export const SEASON_IDS: readonly string[] = ['spring', 'summer', 'autumn', 'winter'];

/** Legge una stagione da un parametro URL. Qualunque altra cosa e' `null`. */
export function resolveSeason(raw: string | null): Season | null {
  if (raw === null) return null;
  const index = SEASON_IDS.indexOf(raw.trim().toLowerCase());
  return index < 0 ? null : (index as Season);
}

/** La stagione dopo questa, in cerchio: e' il giro del tasto, non un quinto bottone. */
export function nextSeason(season: Season): Season {
  return ((season + 1) % SEASON_COUNT) as Season;
}

/** Dove comincia una stagione, in fase d'anno: il suo primo giorno. */
export function seasonStartPhase(season: Season): number {
  return season / SEASON_COUNT;
}

/**
 * Il cuore di una stagione: mezza stagione dopo il suo inizio.
 *
 * Sono i quattro istanti che contano davvero — meta' estate e' il picco della
 * resa, meta' inverno il minimo, e le altre due valgono uno — perche' le curve
 * si spengono al **centro** delle stagioni e non ai loro confini. E' anche la
 * lettura giusta di `YEAR_START_PHASE`, che non e' un numero scelto a mano ma
 * esattamente `seasonHeartPhase(SEASON.summer)`: la citta' nasce nel cuore
 * dell'estate.
 */
export function seasonHeartPhase(season: Season): number {
  return (season + 0.5) / SEASON_COUNT;
}

/**
 * Dove sta l'anno quando la citta' nasce, in [0, 1).
 *
 * **A meta' estate, e non il primo giorno di primavera.** Le tre curve del
 * colore — rigoglio, oro e brina, in `src/engine/season.ts` — si spengono al
 * *centro* delle stagioni e non ai loro confini: e' cio' che fa sfumare ottobre
 * in novembre invece di farlo scattare, ma vuol dire anche che il primo giorno
 * di primavera porta ancora il settanta per cento della brina dell'inverno
 * appena chiuso. La citta' nasceva sotto un prato slavato di grigio, che non e'
 * il verde dichiarato dal tema. Meta' estate e' l'unico istante dell'anno in
 * cui ne' l'oro ne' la brina toccano il prato.
 *
 * **Sposta il calendario, non l'orologio.** `tickCount` resta l'eta' vera della
 * citta': un salvataggio non ha niente in piu' da scrivere, e nessun altro
 * sistema si accorge che l'anno e' girato sotto di lui.
 */
export const YEAR_START_PHASE = 0.375;

/**
 * Dove sta l'anno, in [0, 1). Zero e' il primo giorno di primavera, e il tick
 * zero della partita cade a `YEAR_START_PHASE`.
 *
 * E' l'unica lettura del tempo che l'anno fa: stagione e resa discendono
 * entrambe da qui, quindi non possono raccontare due momenti diversi.
 */
export function yearPhaseAt(tickCount: number): number {
  const year = BALANCE.seasons.yearTicks;
  if (!(year > 0) || !Number.isFinite(tickCount)) return YEAR_START_PHASE;
  const phase = ((tickCount % year) / year + YEAR_START_PHASE) % 1;
  return phase < 0 ? phase + 1 : phase;
}

/**
 * Il tick in cui l'anno sta a questa fase: l'inverso di `yearPhaseAt`.
 *
 * Serve a chi deve **nominare** un istante dell'anno invece di leggerlo — meta'
 * estate, il primo giorno d'inverno. Senza, ogni chiamante rifarebbe a mano
 * l'aritmetica attorno a `YEAR_START_PHASE`, e allo spostamento successivo del
 * calendario sbaglierebbero tutti insieme: e' esattamente cio' che la costante
 * esiste per impedire.
 */
export function tickAtPhase(phase: number): number {
  const year = BALANCE.seasons.yearTicks;
  if (!(year > 0) || !Number.isFinite(phase)) return 0;
  return year * ((((phase - YEAR_START_PHASE) % 1) + 1) % 1);
}

/** In che stagione sta la citta'. E' `yearPhaseAt` diviso in quattro, e nient'altro. */
export function seasonAt(tickCount: number): Season {
  return seasonOfPhase(yearPhaseAt(tickCount));
}

/**
 * La stessa divisione in quarti, ma partendo da una fase gia' in mano.
 *
 * Serve a chi ha la fase e non il tick — l'harness la puo' inchiodare a un
 * valore che nessun tick produce. Ricavare il tick all'indietro, moltiplicando
 * la fase per la lunghezza dell'anno, sembrava equivalente e non lo e' piu':
 * calendario e orologio non partono piu' insieme.
 */
export function seasonOfPhase(phase: number): Season {
  const index = Math.floor(phase * SEASON_COUNT);
  return Math.min(SEASON_COUNT - 1, Math.max(0, index)) as Season;
}

/**
 * Quanto rende un produttore di cibo adesso, come moltiplicatore attorno a uno.
 *
 * **Il picco sta a meta' estate e il minimo a meta' inverno**, non ai confini
 * fra le stagioni: e' per questo che la fase entra spostata di un ottavo d'anno
 * — un ottavo e' mezza stagione, cioe' la distanza fra l'inizio di una stagione
 * e il suo centro. Primavera e autunno valgono uno al loro centro, e sono le due
 * meta' in cui la citta' cambia verso.
 *
 * **Moltiplica il raccolto, non le braccia.** `harvestOf` prende i due fattori
 * separati apposta: `staffing` e' quanta gente c'e' andata, questo e' quanto
 * c'era da raccogliere, e sommarli in un numero solo renderebbe illeggibile il
 * referto della HUD — che deve poter dire quale dei due manca.
 */
export function harvestFactorAt(tickCount: number): number {
  return harvestFactorOfPhase(yearPhaseAt(tickCount));
}

/** La stessa resa da una fase gia' in mano, per la ragione di `seasonOfPhase`. */
export function harvestFactorOfPhase(phase: number): number {
  const shifted = phase - 1 / (SEASON_COUNT * 2);
  return 1 + BALANCE.seasons.yieldAmplitude * Math.sin(2 * Math.PI * shifted);
}
