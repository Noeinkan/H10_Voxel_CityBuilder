/**
 * Aggregatore dei numeri di frame per il riepilogo periodico da console.
 *
 * Puro e senza DOM, come `FrameTiming`: si testa in node. Ogni frame `add` un
 * campione, e quando la finestra si chiude restituisce un riepilogo in testo
 * copiabile — pensato per essere incollato in una conversazione di misura,
 * non per essere letto a schermo.
 */

export interface PerfSample {
  readonly fps: number;
  /** Costo dell'intera callback di frame, render compreso. */
  readonly frameMs: number;
  /** Fetta di main thread spesa nell'ultima `ChunkRenderer.update`. */
  readonly remeshMs: number;
  /** Geometrie caricate nell'ultima `update`. */
  readonly remeshedChunks: number;
  /** Modo del gating di qualita', come `RenderQuality.mode`. */
  readonly qualityMode: string;
  readonly pixelRatio: number;
  /** Profilo di effetti in vigore, per esteso. */
  readonly effects: string;
}

export interface PerfSummary {
  /** Secondi effettivi coperti dalla finestra. */
  readonly seconds: number;
  readonly frames: number;
  readonly fpsAvg: number;
  readonly fpsMin: number;
  readonly frameMsAvg: number;
  readonly frameMsMax: number;
  readonly remeshMsAvg: number;
  readonly remeshMsMax: number;
  readonly remeshedChunks: number;
  /** Qualita' in vigore alla chiusura della finestra. */
  readonly qualityMode: string;
  readonly pixelRatio: number;
  readonly effects: string;
}

/** Durata della finestra di riepilogo. */
export const PERF_REPORT_MS = 5000;

export class PerfReport {
  private startedAt: number | null = null;
  private frames = 0;
  private fpsSum = 0;
  private fpsMin = Infinity;
  private frameMsSum = 0;
  private frameMsMax = 0;
  private remeshMsSum = 0;
  private remeshMsMax = 0;
  private remeshed = 0;
  private last: PerfSample | null = null;

  /**
   * Accumula un frame e restituisce il riepilogo quando la finestra si chiude,
   * altrimenti `null`. La finestra successiva riparte dal frame corrente: nessun
   * campione va perso fra un riepilogo e l'altro.
   */
  add(sample: PerfSample, now: number): PerfSummary | null {
    this.startedAt ??= now;
    this.frames++;
    this.fpsSum += sample.fps;
    if (sample.fps < this.fpsMin) this.fpsMin = sample.fps;
    this.frameMsSum += sample.frameMs;
    if (sample.frameMs > this.frameMsMax) this.frameMsMax = sample.frameMs;
    this.remeshMsSum += sample.remeshMs;
    if (sample.remeshMs > this.remeshMsMax) this.remeshMsMax = sample.remeshMs;
    this.remeshed += sample.remeshedChunks;
    this.last = sample;

    if (now - this.startedAt < PERF_REPORT_MS) return null;
    const summary = this.summarize(now);
    this.reset(now);
    return summary;
  }

  private summarize(now: number): PerfSummary {
    const frames = this.frames;
    return {
      seconds: (now - (this.startedAt ?? now)) / 1000,
      frames,
      fpsAvg: this.fpsSum / frames,
      fpsMin: this.fpsMin,
      frameMsAvg: this.frameMsSum / frames,
      frameMsMax: this.frameMsMax,
      remeshMsAvg: this.remeshMsSum / frames,
      remeshMsMax: this.remeshMsMax,
      remeshedChunks: this.remeshed,
      qualityMode: this.last?.qualityMode ?? '?',
      pixelRatio: this.last?.pixelRatio ?? 0,
      effects: this.last?.effects ?? '?',
    };
  }

  private reset(now: number): void {
    this.startedAt = now;
    this.frames = 0;
    this.fpsSum = 0;
    this.fpsMin = Infinity;
    this.frameMsSum = 0;
    this.frameMsMax = 0;
    this.remeshMsSum = 0;
    this.remeshMsMax = 0;
    this.remeshed = 0;
  }
}

/**
 * Il riepilogo come testo da incollare: una riga sola, con le etichette.
 *
 * `avg (max)` per i tempi, `avg (min)` per gli fps: sono le due direzioni in
 * cui un valore fuori scala e' interessante.
 */
export function formatPerfSummary(s: PerfSummary): string {
  return [
    `[perf] ${s.seconds.toFixed(1)}s`,
    `${s.frames} frames`,
    `fps ${s.fpsAvg.toFixed(1)} (min ${s.fpsMin.toFixed(1)})`,
    `frame ${s.frameMsAvg.toFixed(2)} ms (max ${s.frameMsMax.toFixed(2)})`,
    `remesh ${s.remeshMsAvg.toFixed(2)} ms/f (max ${s.remeshMsMax.toFixed(2)})`,
    `${s.remeshedChunks} chunks`,
    `quality ${s.qualityMode}`,
    `dpr ${s.pixelRatio.toFixed(2)}`,
    `effects ${s.effects}`,
  ].join(' · ');
}
