import { BALANCE } from './balance';

/**
 * Da dove vengono i fondi e dove vanno, in un tick.
 *
 * Esiste per una domanda che l'HUD non sapeva rispondere: **perche' sto
 * perdendo denaro**. `funds.delta` dice di quanto, e non dice di chi e' la
 * colpa; con otto voci in gioco — tasse, incasso dei negozi, servizi urbani,
 * servizi civici, policy, fattorie, catalizzatori, commercio esterno — un saldo
 * netto negativo non indica nessuna azione da fare.
 *
 * **E' un referto, non uno stato.** Come `CommerceReport`, esce dal tick e non
 * si accumula: ricalcolarlo non dipende da com'e' stato prodotto, e il tick
 * resta puro e deterministico. I numeri qui dentro erano gia' tutti calcolati in
 * `tick.ts` — venivano solo buttati via una riga dopo essere serviti.
 *
 * Le voci sono **positive quando entrano** e positive quando escono: il segno
 * sta nel campo, non nel numero, cosi' chi disegna non deve indovinare quale
 * colonna e' un costo.
 */
export interface FundsReport {
  /** Gettito dei residenti. */
  readonly tax: number;
  /** Incasso dei negozi, gia' al netto della merce venduta. */
  readonly retail: number;
  /** Saldo del commercio esterno: positivo se le esportazioni superano gli acquisti. */
  readonly trade: number;
  /**
   * Servizi urbani: quello che costa tenere in piedi la citta' costruita.
   *
   * **Era la voce che mancava, ed e' il motivo per cui i fondi divergevano.**
   * Le entrate crescono con gli abitanti — tasse e incasso dei negozi — mentre
   * le tre uscite storiche guardano gli edifici civici, le policy attive e le
   * torri: tre sottoinsiemi, nessuno dei quali cresce con la citta'. Su una
   * partita misurata di venti minuti le uscite valevano il 32% delle entrate e
   * la cassa arrivava a diciassette milioni.
   *
   * Si paga sulla **capacita'**, non sul numero di edifici: e' la stessa base su
   * cui si guadagna — la capacita' fa gli abitanti, gli abitanti fanno il
   * gettito — quindi il rapporto fra entrate e uscite non dipende da quanto e'
   * alta la citta'. Un grattacielo che vale quattro palazzine costa come quattro
   * palazzine.
   */
  readonly services: number;
  /** Manutenzione dei servizi civici. */
  readonly civic: number;
  /** Costo delle policy attive. */
  readonly policies: number;
  /** Costo per tick delle torri idroponiche. */
  readonly farms: number;
  /**
   * Manutenzione dei catalizzatori piazzati.
   *
   * **Un catalizzatore era l'unica cosa che si pagava una volta e rendeva per
   * sempre.** Finche' e' cosi' il piazzamento non e' un compromesso ma solo un
   * acquisto, e non c'e' ragione di non averne uno di ogni tipo appena la cassa
   * lo permette.
   */
  readonly catalysts: number;
  /**
   * Quanto degli oneri e' stato davvero pagato.
   *
   * Puo' essere meno della somma degli oneri: a cassa vuota si paga il
   * possibile, e i servizi restano scoperti — che e' esattamente cio' che fa
   * scendere la soddisfazione. Senza questa voce la scomposizione non tornerebbe
   * con il saldo, e chi legge penserebbe a un errore.
   */
  readonly paid: number;
}

/** Un referto a zero: la citta' che non e' ancora partita non ha flussi. */
export const NO_FUNDS_FLOW: FundsReport = {
  tax: 0,
  retail: 0,
  trade: 0,
  services: 0,
  civic: 0,
  policies: 0,
  farms: 0,
  catalysts: 0,
  paid: 0,
};

/**
 * Servizi urbani dovuti da una citta' di questa capacita'.
 *
 * La capacita' e' quella efficace, quote di uso misto e livelli compresi: la
 * stessa che `tick` usa per calcolare quanti abitanti la citta' ospita e quanto
 * incassa. Sotto `servicesFree` non si paga niente — un borgo non ha una
 * macchina amministrativa — e sopra si paga lineare.
 */
export function servicesUpkeepOf(capacity: number): number {
  const billable = Math.max(0, capacity - BALANCE.funds.servicesFree);
  return billable * BALANCE.funds.servicesPerCapacity;
}

/**
 * Tutto cio' che la citta' deve, prima di sapere se puo' pagarlo.
 *
 * Sta qui e non in `tick.ts` perche' e' la stessa somma che serve all'HUD per
 * dire «hai pagato il 60% delle bollette»: due addizioni separate divergono
 * appena si aggiunge una voce, ed e' successo con `services`.
 */
export function fundsOwed(report: FundsReport): number {
  return report.services + report.civic + report.policies + report.farms + report.catalysts;
}

/** Quanto entra in totale. */
export function fundsIn(report: FundsReport): number {
  return report.tax + report.retail + Math.max(0, report.trade);
}

/** Quanto esce in totale, contando solo cio' che si e' potuto pagare. */
export function fundsOut(report: FundsReport): number {
  return report.paid + Math.max(0, -report.trade);
}

/**
 * La voce che pesa di piu', per nome.
 *
 * E' la risposta corta alla domanda: non «ecco sei numeri», ma «sono i servizi
 * civici». `null` quando non si muove niente, che e' un caso vero all'avvio.
 */
export function dominantOutflow(
  report: FundsReport,
): 'services' | 'civic' | 'policies' | 'farms' | 'catalysts' | null {
  const entries = [
    ['services', report.services],
    ['civic', report.civic],
    ['policies', report.policies],
    ['farms', report.farms],
    ['catalysts', report.catalysts],
  ] as const;
  let worst: (typeof entries)[number] | null = null;
  for (const entry of entries) {
    if (entry[1] > 0 && (worst === null || entry[1] > worst[1])) worst = entry;
  }
  return worst === null ? null : worst[0];
}
