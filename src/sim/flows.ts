/**
 * Da dove vengono i fondi e dove vanno, in un tick.
 *
 * Esiste per una domanda che l'HUD non sapeva rispondere: **perche' sto
 * perdendo denaro**. `funds.delta` dice di quanto, e non dice di chi e' la
 * colpa; con sei voci in gioco — tasse, incasso dei negozi, servizi civici,
 * policy, fattorie, commercio esterno — un saldo netto negativo non indica
 * nessuna azione da fare.
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
  /** Manutenzione dei servizi civici. */
  readonly civic: number;
  /** Costo delle policy attive. */
  readonly policies: number;
  /** Costo per tick delle torri idroponiche. */
  readonly farms: number;
  /**
   * Quanto degli oneri e' stato davvero pagato.
   *
   * Puo' essere meno della somma di `civic`, `policies` e `farms`: a cassa vuota
   * si paga il possibile, e i servizi restano scoperti — che e' esattamente
   * cio' che fa scendere la soddisfazione. Senza questa voce la scomposizione
   * non tornerebbe con il saldo, e chi legge penserebbe a un errore.
   */
  readonly paid: number;
}

/** Un referto a zero: la citta' che non e' ancora partita non ha flussi. */
export const NO_FUNDS_FLOW: FundsReport = {
  tax: 0,
  retail: 0,
  trade: 0,
  civic: 0,
  policies: 0,
  farms: 0,
  paid: 0,
};

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
export function dominantOutflow(report: FundsReport): 'civic' | 'policies' | 'farms' | null {
  const entries = [
    ['civic', report.civic],
    ['policies', report.policies],
    ['farms', report.farms],
  ] as const;
  let worst: (typeof entries)[number] | null = null;
  for (const entry of entries) {
    if (entry[1] > 0 && (worst === null || entry[1] > worst[1])) worst = entry;
  }
  return worst === null ? null : worst[0];
}
