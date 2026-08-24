/**
 * La finestra dei tick recenti, per risorsa.
 *
 * Serve alla 7.3: una freccia, una magnitudine e una sparkline hanno bisogno di
 * **dove eravamo**, e la simulazione non lo tiene — `Resource` e' `{ stock,
 * delta }`, cioe' adesso e l'ultimo passo. Tenere uno storico in `SimState`
 * vorrebbe dire serializzarlo e versionarlo (fase 5) per un dato che serve solo
 * a disegnare: vive quindi qui, dal lato di chi guarda.
 *
 * Puro e senza DOM: niente `Date.now()`, niente `performance.now()`. Il tempo
 * entra come numero di tick, che e' l'unico orologio deterministico del gioco —
 * ed e' anche cio' che rende il campionamento idempotente, perche' l'HUD
 * ridipinge ogni 150 ms mentre la simulazione avanza di dieci tick al secondo, e
 * senza un'ancora la stessa lettura finirebbe due volte nella finestra.
 */

/** Quanti campioni tiene la finestra: ~5 s di gioco a velocita' 1. */
export const TREND_WINDOW = 48;

/**
 * Sotto questa variazione relativa la risorsa e' **ferma**.
 *
 * Senza una zona morta la freccia sfarfalla su ogni arrotondamento, ed e' il
 * difetto che rende un indicatore di tendenza peggio di nessun indicatore: si
 * impara a non guardarlo.
 */
const FLAT = 0.002;

export type TrendDirection = 'up' | 'down' | 'flat';

export class ResourceTrend {
  private readonly capacity: number;
  private readonly series = new Map<string, number[]>();
  /** L'ultimo tick campionato: il secondo passaggio sullo stesso non conta. */
  private lastTick = -1;

  constructor(capacity: number = TREND_WINDOW) {
    this.capacity = Math.max(2, capacity);
  }

  /**
   * Registra un giro, se e' un giro nuovo.
   *
   * Torna `false` quando il tick era gia' stato visto: chi chiama puo' saltare
   * il resto del lavoro invece di ricalcolare una serie che non e' cambiata.
   */
  sample(tick: number, entries: readonly (readonly [string, number])[]): boolean {
    if (tick === this.lastTick) return false;
    // Un tick che torna indietro e' una partita nuova, non un passo: la finestra
    // di quella vecchia non descrive piu' niente.
    if (tick < this.lastTick) this.series.clear();
    this.lastTick = tick;
    for (const [id, value] of entries) {
      const window = this.series.get(id) ?? [];
      window.push(value);
      if (window.length > this.capacity) window.shift();
      this.series.set(id, window);
    }
    return true;
  }

  /** La finestra di una risorsa, dal piu' vecchio al piu' recente. */
  window(id: string): readonly number[] {
    return this.series.get(id) ?? [];
  }

  /**
   * Dove sta andando, sull'intera finestra e non sull'ultimo passo.
   *
   * L'ultimo passo e' `delta`, che l'HUD ha gia': una freccia che ripete il
   * delta non aggiunge niente e cambia direzione a ogni tick storto. Questa
   * risponde alla domanda diversa — «la citta' sta salendo o scendendo» — ed e'
   * la sola per cui valga la pena tenere una finestra.
   */
  direction(id: string): TrendDirection {
    const change = this.change(id);
    if (change > FLAT) return 'up';
    if (change < -FLAT) return 'down';
    return 'flat';
  }

  /** Quanto forte, 0..1: satura al 25% di variazione sulla finestra. */
  magnitude(id: string): number {
    return Math.min(1, Math.abs(this.change(id)) * 4);
  }

  /**
   * Variazione relativa sulla finestra, con segno.
   *
   * Relativa e non assoluta perche' le cinque risorse non hanno la stessa
   * scala: +30 di denaro e +30 di abitanti sono due notizie molto diverse, e una
   * soglia in unita' assolute direbbe il falso su almeno una delle due.
   */
  private change(id: string): number {
    const window = this.series.get(id);
    if (window === undefined || window.length < 2) return 0;
    const first = window[0] ?? 0;
    const last = window[window.length - 1] ?? 0;
    const scale = Math.max(Math.abs(first), Math.abs(last), 1);
    return (last - first) / scale;
  }
}
