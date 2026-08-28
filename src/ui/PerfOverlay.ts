/**
 * Overlay di prestazioni, attivo con ?perf=1.
 *
 * DOM puro e aggiornamento a bassa frequenza, come gli altri overlay di
 * misura: non deve entrare nel costo del frame che sta misurando. Mostra i
 * cinque numeri della conversazione sulle prestazioni — fps, durata del frame,
 * fetta di remesh, chunk rimeshati, livello di qualita' — e legge la stessa
 * fonte del riepilogo in console.
 */

export interface PerfFrame {
  readonly fps: number;
  /** Costo dell'intera callback di frame, render compreso. */
  readonly frameMs: number;
  /** Fetta di main thread spesa nell'ultima `ChunkRenderer.update`. */
  readonly remeshMs: number;
  /** Geometrie caricate nell'ultima `update`. */
  readonly remeshedChunks: number;
  readonly qualityMode: string;
  readonly pixelRatio: number;
  /** Profilo di effetti in vigore, per esteso. */
  readonly effects: string;
}

/** Ogni quanti millisecondi si riscrive il DOM. */
const REFRESH_MS = 250;

export class PerfOverlay {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLPreElement;
  private lastPaint = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'debug-panel debug-panel--perf';

    this.body = document.createElement('pre');
    this.body.className = 'debug-body';
    this.root.appendChild(this.body);
    parent.appendChild(this.root);
  }

  /**
   * true quando e' ora di riscrivere il DOM. Va chiamata prima di raccogliere
   * le statistiche: leggerle a ogni frame costerebbe piu' dell'overlay stesso.
   */
  needsPaint(now: number): boolean {
    return now - this.lastPaint >= REFRESH_MS;
  }

  update(frame: PerfFrame, now: number): void {
    this.lastPaint = now;

    this.body.textContent = [
      `fps      ${frame.fps.toFixed(1).padStart(6)}`,
      `frame    ${frame.frameMs.toFixed(2).padStart(6)} ms`,
      `remesh   ${frame.remeshMs.toFixed(2).padStart(6)} ms/frame`,
      `chunks   ${frame.remeshedChunks.toString().padStart(6)} this frame`,
      `quality  ${frame.qualityMode} · DPR ${frame.pixelRatio.toFixed(2)}`,
      `effects  ${frame.effects}`,
    ].join('\n');
  }

  dispose(): void {
    this.root.remove();
  }
}
