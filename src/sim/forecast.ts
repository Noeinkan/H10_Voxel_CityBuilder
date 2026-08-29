import type { SimState } from './SimState';

/**
 * Quanti tick mancano.
 *
 * **E' la domanda che i referti non sapevano ancora rispondere.** `flows`,
 * `harvest` e `materialFlows` dicono da dove viene un numero e perche' si
 * muove; nessuno dice *quando* arriva dove sta andando. In un gioco che si
 * guarda mentre avanza da solo e' la meta' che manca: una riserva di materiali
 * ferma non si distingue da una che sta per servire, e l'unica cosa che le
 * separa e' il tempo.
 *
 * **Legge i referti, non rifa il bilancio.** Il ritmo di ogni previsione esce
 * dal delta che il tick ha gia' misurato, mai da una seconda copia della
 * formula: un `growthRate * fed * satisfaction * land` riscritto qui
 * divergerebbe dal primo alla prossima ritaratura di `balance.ts`. E' la stessa
 * ragione per cui `state.harvest` si legge invece di ricalcolarlo.
 *
 * **`null` e' una risposta, non un caso limite.** Vuol dire «al ritmo di adesso
 * non ci arriva», ed e' proprio cio' che il giocatore deve sapere quando la
 * scorta non cresce: tacere lo farebbe leggere come «presto».
 *
 * Qui stanno i numeri; a dargli un nome e' `src/ui/GameHudEconomyModel.ts`,
 * come gia' fanno il dominio e `src/ui/prospects.ts` sulle soglie mancanti.
 */

/**
 * Tick perche' uno stock in crescita raggiunga la soglia.
 *
 * Zero quando ci e' gia', `null` quando non cresce.
 */
export function ticksToReach(stock: number, target: number, perTick: number): number | null {
  if (!Number.isFinite(stock) || !Number.isFinite(target) || !Number.isFinite(perTick)) return null;
  if (stock >= target) return 0;
  if (perTick <= 0) return null;
  return Math.ceil((target - stock) / perTick);
}

/**
 * Tick perche' uno stock in calo arrivi a zero.
 *
 * `null` quando non sta calando, che qui e' la buona notizia: chi legge non ha
 * una scadenza da mostrare.
 */
export function ticksToEmpty(stock: number, perTick: number): number | null {
  if (!Number.isFinite(stock) || !Number.isFinite(perTick)) return null;
  if (perTick >= 0) return null;
  if (stock <= 0) return 0;
  return Math.ceil(stock / -perTick);
}

/**
 * Quanto cresce davvero la scorta di materiali in un tick.
 *
 * `materials.delta` misura il solo giro di bilancio: i cantieri spendono
 * **dopo**, in `Builder.onTick`, e la loro spesa finisce in
 * `materialFlows.construction` senza passare per il delta. Sottrarla e' cio' che
 * rende la stima quella del magazzino vero invece che di uno che nessuno tocca.
 */
export function materialRate(state: SimState): number {
  return state.materials.delta - state.materialFlows.construction;
}

/**
 * Tick prima che il cantiere in attesa piu' economico diventi pagabile.
 *
 * `null` quando non c'e' niente in attesa — non c'e' niente da prevedere — e
 * quando la scorta non cresce, che e' il caso in cui l'attesa non finisce da
 * sola e il giocatore deve muovere qualcosa.
 */
export function ticksToAffordConstruction(state: SimState): number | null {
  const cost = state.materialFlows.waitingCost;
  if (!(cost > 0)) return null;
  return ticksToReach(state.materials.stock, cost, materialRate(state));
}

/**
 * Tick perche' le case libere si riempiano.
 *
 * **Non e' una divisione.** La citta' riempie una *frazione* dello spazio
 * libero per tick, non un numero fisso di posti (`nextPopulation` in
 * `tick.ts`): lo spazio residuo decade in geometrica, e una stima lineare su
 * `delta` promette il pieno in un terzo del tempo vero — che e' il modo piu'
 * sicuro di far sembrare rotta una previsione giusta.
 *
 * La frazione non si riscrive qui: si **misura** da quanti residenti arrivano e
 * da quanto spazio c'era. Cosi' fame, soddisfazione, terra residua e policy
 * entrano nel conto senza che questo file sappia che esistono.
 *
 * **`perTick` va mediato su piu' tick, e `delta` non lo e'.** Il rumore della
 * migrazione entra tutto nell'ultimo passo, e su questa curva vale un terzo di
 * stima: la stessa citta' diceva 72, poi 81, poi 61. Chi chiama prende il ritmo
 * da `ResourceTrend.rate`, che quella media la tiene gia' per la freccia.
 */
export function ticksToFillHousing(
  population: number,
  capacity: number,
  perTick: number,
): number | null {
  const free = capacity - population;
  if (!Number.isFinite(free) || !Number.isFinite(perTick)) return null;
  // Meno di una casa libera e' gia' pieno: sotto l'unita' la geometrica non ha
  // piu' niente da dire, e il logaritmo cambierebbe segno.
  if (free <= 1) return 0;
  if (perTick <= 0) return null;

  // La quota resta sotto 1 per costruzione — lo spazio di prima contiene sia
  // quello di adesso sia cio' che e' stato riempito — quindi il logaritmo esiste
  // sempre e non serve un ramo per il pieno in un tick solo.
  const filled = perTick / (free + perTick);
  return Math.ceil(Math.log(free) / -Math.log(1 - filled));
}
