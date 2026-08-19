import type { FrameTimingSnapshot } from './FrameTiming';

export type QualityMode = 'auto' | 'high' | 'balanced' | 'performance';
export type QualityReason = 'initial' | 'fixed' | 'stable-up' | 'slow-down' | 'unchanged';

export interface QualityDecision {
  readonly mode: QualityMode;
  readonly pixelRatio: number;
  readonly changed: boolean;
  readonly reason: QualityReason;
}

const EVALUATION_MS = 2_000;
const DOWN_COOLDOWN_MS = 5_000;
const UP_STABLE_MS = 10_000;
const MIN_SAMPLES = 120;
const STEP = 0.25;

export function parseQualityMode(value: string | null): QualityMode {
  return value === 'high' || value === 'balanced' || value === 'performance' ? value : 'auto';
}

export class RenderQualityController {
  private readonly maximum: number;
  private current: number;
  private lastEvaluation = Number.NEGATIVE_INFINITY;
  private cooldownUntil = 0;
  private stableSince: number | null = null;
  private slowWindows = 0;

  constructor(readonly mode: QualityMode, devicePixelRatio: number) {
    this.maximum = clamp(Math.floor(devicePixelRatio / STEP) * STEP, 1, 2);
    this.current = ratioForMode(mode, this.maximum);
  }

  get pixelRatio(): number {
    return this.current;
  }

  initial(): QualityDecision {
    return { mode: this.mode, pixelRatio: this.current, changed: true, reason: 'initial' };
  }

  observe(stats: FrameTimingSnapshot, now: number): QualityDecision {
    if (this.mode !== 'auto') {
      return { mode: this.mode, pixelRatio: this.current, changed: false, reason: 'fixed' };
    }
    if (stats.sampleCount < MIN_SAMPLES || now - this.lastEvaluation < EVALUATION_MS) {
      return this.unchanged();
    }
    this.lastEvaluation = now;

    const slow = stats.fpsLow < 55 || stats.jankRatio > 0.05;
    const stable = stats.fpsLow >= 59 && stats.jankRatio < 0.01;
    if (slow) {
      this.slowWindows++;
      this.stableSince = null;
      if (this.slowWindows >= 2 && now >= this.cooldownUntil && this.current > 1) {
        this.current = Math.max(1, step(this.current - STEP));
        this.slowWindows = 0;
        this.cooldownUntil = now + DOWN_COOLDOWN_MS;
        return { mode: this.mode, pixelRatio: this.current, changed: true, reason: 'slow-down' };
      }
      return this.unchanged();
    }

    this.slowWindows = 0;
    if (!stable) {
      this.stableSince = null;
      return this.unchanged();
    }
    this.stableSince ??= now;
    if (now >= this.cooldownUntil && now - this.stableSince >= UP_STABLE_MS && this.current < this.maximum) {
      this.current = Math.min(this.maximum, step(this.current + STEP));
      this.stableSince = now;
      this.cooldownUntil = now + DOWN_COOLDOWN_MS;
      return { mode: this.mode, pixelRatio: this.current, changed: true, reason: 'stable-up' };
    }
    return this.unchanged();
  }

  private unchanged(): QualityDecision {
    return { mode: this.mode, pixelRatio: this.current, changed: false, reason: 'unchanged' };
  }
}

function ratioForMode(mode: QualityMode, maximum: number): number {
  if (mode === 'performance') return 1;
  if (mode === 'balanced' || mode === 'auto') return Math.min(maximum, 1.5);
  return maximum;
}

function step(value: number): number {
  return Math.round(value / STEP) * STEP;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
