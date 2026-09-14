export interface SampleSummary {
  readonly lastMs: number;
  readonly maxMs: number;
  readonly avgMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly count: number;
}

export const EMPTY_SUMMARY: SampleSummary = {
  lastMs: 0,
  maxMs: 0,
  avgMs: 0,
  p95Ms: 0,
  p99Ms: 0,
  count: 0,
};

/**
 * Gli ultimi N campioni di una durata, con i loro percentili.
 *
 * **Il massimo e i percentili rispondono a due domande diverse**, e servono
 * entrambi. Il massimo e' dall'ultimo azzeramento: e' lo spike che si vuole
 * vedere anche se e' caduto dieci secondi fa. I percentili sono sulla finestra:
 * dicono se il budget regge *di solito*, e un solo frame da 200 ms non li sposta.
 * Il p99 a 60 fps e' un frame ogni meno di due secondi — cioe' il frame saltato
 * che si vede.
 */
export class SampleWindow {
  private readonly samples: Float64Array;
  private cursor = 0;
  private filled = 0;
  private last = 0;
  private max = 0;

  constructor(capacity = 600) {
    this.samples = new Float64Array(Math.max(1, Math.floor(capacity)));
  }

  add(ms: number): void {
    this.last = ms;
    if (ms > this.max) this.max = ms;
    this.samples[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % this.samples.length;
    if (this.filled < this.samples.length) this.filled++;
  }

  /** Ordina la finestra: va chiesto alla cadenza dell'overlay, non a ogni frame. */
  summary(): SampleSummary {
    if (this.filled === 0) return EMPTY_SUMMARY;
    const sorted = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    let sum = 0;
    for (const value of sorted) sum += value;
    return {
      lastMs: this.last,
      maxMs: this.max,
      avgMs: sum / sorted.length,
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
      count: sorted.length,
    };
  }

  reset(): void {
    this.cursor = 0;
    this.filled = 0;
    this.last = 0;
    this.max = 0;
  }
}

export function percentile(sorted: ArrayLike<number>, fraction: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}
