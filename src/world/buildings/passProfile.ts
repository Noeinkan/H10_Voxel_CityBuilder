/**
 * Quanto lavora e quanto costa ogni passata della crescita.
 *
 * **Due misure, e non valgono lo stesso.** I millisecondi dicono quanto una
 * passata pesa sul frame, ma su questa macchina oscillano di due volte e mezza
 * fra una run e l'altra quando altri processi girano insieme: sono
 * un'indicazione. Il lavoro contato — colonne lette, record scorsi, celle di
 * campo rifatte — a parita' di seme e' identico a ogni run, ed e' l'unica misura
 * su cui un test puo' dire di no senza mentire. Per questo il profilo non misura
 * il lavoro da se': legge contatori che stanno accanto al lavoro vero, e ne
 * attribuisce la differenza alla passata che l'ha prodotta.
 *
 * **Il contatore resta di chi lavora.** `LotSearch` sa quante colonne ha letto e
 * il registry quante volte si e' fatto scorrere per intero; questo modulo non
 * conosce nessuno dei due e non deve. Un contatore nuovo si aggiunge con
 * `addCounter`, non con un gancio qui dentro.
 *
 * Non tocca la partita: nessuna decisione legge un tempo o un contatore, quindi
 * la citta' che cresce con il profilo acceso e' quella che cresce senza.
 */

/** Il lavoro di una passata, contatore per contatore. */
export type WorkTally = Readonly<Record<string, number>>;

export interface PassReading {
  readonly name: string;
  readonly calls: number;
  readonly totalMs: number;
  readonly maxMs: number;
  readonly lastMs: number;
  /** Lavoro contato dentro la passata, sommato su tutte le chiamate. */
  readonly work: WorkTally;
  /**
   * Il lavoro della chiamata piu' pesante, contatore per contatore.
   *
   * E' il numero che la regola «il costo di una passata non cresce con la citta'»
   * guarda: una media si abbassa con le passate vuote, il massimo no.
   */
  readonly maxWork: WorkTally;
}

interface PassSlot {
  readonly name: string;
  calls: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  work: number[];
  maxWork: number[];
}

export class PassProfile {
  private readonly counterNames: string[] = [];
  private readonly counterReads: (() => number)[] = [];
  private readonly slots = new Map<string, PassSlot>();

  constructor(private readonly now: () => number = () => performance.now()) {}

  /**
   * Un contatore monotono da attribuire alle passate.
   *
   * Se durante una passata il contatore riparte da capo — la sua fonte e' stata
   * sostituita, come il campo che un caricamento rifa' nuovo — la differenza
   * negativa non ha senso: vale allora quanto il contatore nuovo ha gia' contato.
   */
  addCounter(name: string, read: () => number): void {
    const existing = this.counterNames.indexOf(name);
    if (existing !== -1) {
      this.counterReads[existing] = read;
      return;
    }
    this.counterNames.push(name);
    this.counterReads.push(read);
    for (const slot of this.slots.values()) {
      slot.work.push(0);
      slot.maxWork.push(0);
    }
  }

  get counters(): readonly string[] {
    return this.counterNames;
  }

  /**
   * Esegue la passata e ne annota tempo e lavoro.
   *
   * **Inclusivo**: una passata misurata dentro un'altra conta in entrambe. Il
   * ciclo di crescita non ne annida, e chi lo facesse deve saperlo prima di
   * sommare le righe.
   */
  measure<T>(name: string, run: () => T): T {
    const before = this.sample();
    const start = this.now();
    try {
      return run();
    } finally {
      const elapsed = this.now() - start;
      const slot = this.slotOf(name);
      slot.calls++;
      slot.totalMs += elapsed;
      slot.lastMs = elapsed;
      if (elapsed > slot.maxMs) slot.maxMs = elapsed;
      for (let i = 0; i < before.length; i++) {
        const after = this.counterReads[i]();
        const done = after >= before[i] ? after - before[i] : after;
        slot.work[i] += done;
        if (done > slot.maxWork[i]) slot.maxWork[i] = done;
      }
    }
  }

  /** Le passate nell'ordine in cui sono state viste la prima volta. */
  readings(): readonly PassReading[] {
    const out: PassReading[] = [];
    for (const slot of this.slots.values()) {
      out.push({
        name: slot.name,
        calls: slot.calls,
        totalMs: slot.totalMs,
        maxMs: slot.maxMs,
        lastMs: slot.lastMs,
        work: this.tally(slot.work),
        maxWork: this.tally(slot.maxWork),
      });
    }
    return out;
  }

  /** Azzera letture e massimi; i contatori restano registrati. */
  reset(): void {
    this.slots.clear();
  }

  private sample(): number[] {
    const values = new Array<number>(this.counterReads.length);
    for (let i = 0; i < values.length; i++) values[i] = this.counterReads[i]();
    return values;
  }

  private slotOf(name: string): PassSlot {
    let slot = this.slots.get(name);
    if (slot === undefined) {
      slot = {
        name,
        calls: 0,
        totalMs: 0,
        maxMs: 0,
        lastMs: 0,
        work: new Array<number>(this.counterNames.length).fill(0),
        maxWork: new Array<number>(this.counterNames.length).fill(0),
      };
      this.slots.set(name, slot);
    }
    return slot;
  }

  private tally(values: readonly number[]): WorkTally {
    const out: Record<string, number> = {};
    for (let i = 0; i < this.counterNames.length; i++) out[this.counterNames[i]] = values[i];
    return out;
  }
}

/**
 * La tabella in testo, una riga per passata, dalla piu' cara in tempo totale.
 *
 * Per ogni contatore scrive `max per chiamata / totale`: il primo e' quello che
 * la regola del cursore guarda, il secondo dice quanto quella passata pesa sulla
 * partita. I contatori che nessuna passata ha mosso non entrano: sono colonne di
 * zeri.
 */
export function formatPassTable(readings: readonly PassReading[], counters: readonly string[]): string {
  const moved = counters.filter((name) => readings.some((reading) => reading.work[name] > 0));
  const sorted = [...readings].sort((a, b) => b.totalMs - a.totalMs);
  const header = ['pass', 'calls', 'avg ms', 'max ms', 'total s', ...moved];
  const rows = sorted.map((reading) => [
    reading.name,
    String(reading.calls),
    (reading.totalMs / Math.max(1, reading.calls)).toFixed(2),
    reading.maxMs.toFixed(1),
    (reading.totalMs / 1000).toFixed(2),
    ...moved.map((name) => reading.work[name] === 0 ? '-' : `${reading.maxWork[name]} / ${reading.work[name]}`),
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column].length)));
  const line = (cells: readonly string[]): string => cells
    .map((cell, column) => column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))
    .join('  ');
  return [line(header), ...rows.map(line)].join('\n');
}
