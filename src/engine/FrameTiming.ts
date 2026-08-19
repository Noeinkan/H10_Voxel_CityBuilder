export interface FrameTimingSnapshot {
  readonly fps: number;
  readonly fpsLow: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly jankRatio: number;
  readonly sampleCount: number;
}

const EMPTY: FrameTimingSnapshot = {
  fps: 0,
  fpsLow: 0,
  p95Ms: 0,
  p99Ms: 0,
  jankRatio: 0,
  sampleCount: 0,
};

/** Misura la cadenza reale di rAF, non il solo lavoro svolto nella callback. */
export class FrameTiming {
  private readonly samples: Float64Array;
  private cursor = 0;
  private count = 0;
  private previous: number | null = null;

  constructor(capacity = 600) {
    this.samples = new Float64Array(Math.max(2, Math.floor(capacity)));
  }

  sample(timestamp: number, visible = true): void {
    if (!visible) {
      this.previous = null;
      return;
    }
    if (this.previous === null) {
      this.previous = timestamp;
      return;
    }

    const interval = timestamp - this.previous;
    this.previous = timestamp;
    // Un resume o un breakpoint non descrive il rendering in foreground.
    if (!Number.isFinite(interval) || interval <= 0 || interval > 250) return;

    this.samples[this.cursor] = interval;
    this.cursor = (this.cursor + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
  }

  snapshot(): FrameTimingSnapshot {
    if (this.count === 0) return EMPTY;
    const sorted = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b);
    let sum = 0;
    let jank = 0;
    for (const value of sorted) {
      sum += value;
      if (value > 20) jank++;
    }
    const worstCount = Math.max(1, Math.ceil(sorted.length * 0.01));
    let worstSum = 0;
    for (let i = sorted.length - worstCount; i < sorted.length; i++) worstSum += sorted[i];

    return {
      fps: 1000 / (sum / sorted.length),
      fpsLow: 1000 / (worstSum / worstCount),
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
      jankRatio: jank / sorted.length,
      sampleCount: sorted.length,
    };
  }

  reset(): void {
    this.cursor = 0;
    this.count = 0;
    this.previous = null;
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}
