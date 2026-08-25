import type { FrameTimingSnapshot } from './FrameTiming';

export type QualityMode = 'auto' | 'high' | 'balanced' | 'performance';
export type QualityReason = 'initial' | 'fixed' | 'stable-up' | 'slow-down' | 'unchanged';

/**
 * Cosa puo' permettersi il frame, oltre al numero di pixel.
 *
 * Non e' uno stato in piu' da far evolvere: si deriva da quanto il controller ha
 * gia' dovuto abbassare il pixel ratio. Una sola macchina a stati, una sola
 * isteresi, e gli effetti seguono la stessa decisione invece di litigarci.
 */
export interface QualityProfile {
  /** Lato della shadow map; 0 spegne la pass del tutto. */
  readonly shadowSize: number;
  /** Moltiplicatore del raggio PCF; 0 degrada a un solo tap. */
  readonly shadowSoftness: number;
  readonly bloom: boolean;
  readonly tilt: boolean;
  /** Frazione di risoluzione a cui gira il bloom. */
  readonly bloomScale: number;
  /** Ritocco di colore e vignettatura: una pass a schermo pieno, quasi gratis. */
  readonly grade: boolean;
  /** Raggi del sole in spazio schermo. */
  readonly godRays: boolean;
  /** Contorno scuro delle sagome dalla profondita'. */
  readonly outline: boolean;
}

/**
 * Il gradino di mezzo dimezza la shadow map ma tiene i nove tap.
 *
 * Il raggio PCF e' espresso in texel, quindi a 1024 sfuoca la stessa frazione
 * di mondo: si perde risoluzione, non morbidezza. Degradare a un tap solo era
 * il salto piu' visibile dell'intera scala — il bordo dell'ombra torna a essere
 * la scaletta della mappa — a fronte del risparmio minore, perche' meta' lato
 * ha gia' diviso per quattro il costo della pass, e il gradino dopo le ombre le
 * spegne comunque del tutto.
 */
const PROFILES: readonly QualityProfile[] = [
  { shadowSize: 2048, shadowSoftness: 1, bloom: true, tilt: true, bloomScale: 1, grade: true, godRays: true, outline: true },
  { shadowSize: 1024, shadowSoftness: 1, bloom: true, tilt: true, bloomScale: 0.5, grade: true, godRays: true, outline: true },
  { shadowSize: 0, shadowSoftness: 0, bloom: false, tilt: false, bloomScale: 0.5, grade: false, godRays: false, outline: false },
];

export interface QualityDecision {
  readonly mode: QualityMode;
  readonly pixelRatio: number;
  readonly changed: boolean;
  readonly reason: QualityReason;
  readonly profile: QualityProfile;
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

  /** Pixel ratio con cui il modo e' partito: il livello 0 degli effetti. */
  private readonly baseline: number;

  constructor(readonly mode: QualityMode, devicePixelRatio: number) {
    this.maximum = clamp(Math.floor(devicePixelRatio / STEP) * STEP, 1, 2);
    this.current = ratioForMode(mode, this.maximum);
    this.baseline = this.current;
  }

  get pixelRatio(): number {
    return this.current;
  }

  initial(): QualityDecision {
    return this.decide(true, 'initial');
  }

  observe(stats: FrameTimingSnapshot, now: number): QualityDecision {
    if (this.mode !== 'auto') {
      return this.decide(false, 'fixed');
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
        return this.decide(true, 'slow-down');
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
      return this.decide(true, 'stable-up');
    }
    return this.unchanged();
  }

  /** Profilo di effetti che corrisponde allo stato attuale. */
  get profile(): QualityProfile {
    return PROFILES[this.level];
  }

  /**
   * Quanti gradini siamo scesi rispetto al punto di partenza del modo.
   *
   * I modi fissi hanno un livello fisso; in 'auto' il livello segue le stesse
   * discese che il controller decide per la risoluzione, senza una seconda
   * isteresi che potrebbe sfasarsi rispetto alla prima.
   *
   * Il confronto e' con `baseline` e non con `maximum`: 'auto' parte di proposito
   * a 1.5 anche dove il massimo e' 2, e misurando dal massimo uno schermo ad alta
   * densita' sarebbe nato gia' due gradini sotto, cioe' senza ombre ne' bloom
   * proprio sulle macchine che possono permetterseli.
   */
  private get level(): number {
    if (this.mode === 'high') return 0;
    if (this.mode === 'balanced') return 1;
    if (this.mode === 'performance') return 2;
    const steps = Math.round((this.baseline - this.current) / STEP);
    return Math.min(PROFILES.length - 1, Math.max(0, steps));
  }

  private decide(changed: boolean, reason: QualityReason): QualityDecision {
    return {
      mode: this.mode,
      pixelRatio: this.current,
      changed,
      reason,
      profile: this.profile,
    };
  }

  private unchanged(): QualityDecision {
    return this.decide(false, 'unchanged');
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
