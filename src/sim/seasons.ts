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

/** Le quattro stagioni, come indici densi. Zero e' l'inizio della partita. */
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

/**
 * Dove sta l'anno, in [0, 1). Zero e' il primo giorno di primavera.
 *
 * E' l'unica lettura del tempo che l'anno fa: stagione e resa discendono
 * entrambe da qui, quindi non possono raccontare due momenti diversi.
 */
export function yearPhaseAt(tickCount: number): number {
  const year = BALANCE.seasons.yearTicks;
  if (!(year > 0) || !Number.isFinite(tickCount)) return 0;
  const phase = (tickCount % year) / year;
  return phase < 0 ? phase + 1 : phase;
}

/** In che stagione sta la citta'. E' `yearPhaseAt` diviso in quattro, e nient'altro. */
export function seasonAt(tickCount: number): Season {
  const index = Math.floor(yearPhaseAt(tickCount) * SEASON_COUNT);
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
  const phase = yearPhaseAt(tickCount) - 1 / (SEASON_COUNT * 2);
  return 1 + BALANCE.seasons.yieldAmplitude * Math.sin(2 * Math.PI * phase);
}
