/**
 * Overlay di misura, attivo solo con ?debug=1.
 *
 * DOM puro e aggiornamento a bassa frequenza: l'overlay non deve entrare nel
 * costo del frame che sta misurando.
 */

export interface OverlayFrame {
  readonly fps: number;
  readonly fpsLow: number;
  /** Percentili degli intervalli reali fra callback rAF. */
  readonly frameP95Ms: number;
  readonly frameP99Ms: number;
  readonly jankRatio: number;
  readonly frameMs: number;
  /** Lavoro sul main thread escluso il render: e' il numero da tenere sotto 4 ms. */
  readonly mainMs: number;
  readonly mainMsMax: number;
  /** Costo della sola chiamata di render, sempre sul main thread. */
  readonly renderMs: number;
  /** Millisecondi della sola pass d'ombra, gia' compresi in renderMs. */
  readonly shadowMs: number;
  /** Lato della shadow map; 0 quando la pass e' spenta. */
  readonly shadowSize: number;
  /** Profilo di effetti in vigore, per esteso. */
  readonly effects: string;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometryBytes: number;
  readonly chunksAllocated: number;
  readonly chunksNonEmpty: number;
  readonly chunksWithMesh: number;
  readonly chunksVisible: number;
  readonly queued: number;
  readonly inFlight: number;
  readonly quads: number;
  readonly detailQuads: number;
  readonly solidVoxels: number;
  readonly mesherLastMs: number;
  readonly mesherAvgMs: number;
  readonly mesherMaxMs: number;
  readonly mesherPoolSize: number;
  readonly generationProgress: number;
  readonly scene: string;
  readonly seed: number;
  readonly theme: string;
  readonly quality: string;
  readonly pixelRatio: number;
  readonly zoom: number;
  readonly yawDegrees: number;
}

/** Ogni quanti millisecondi si riscrive il DOM. */
const REFRESH_MS = 200;

export class DebugOverlay {
  private readonly root: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLPreElement;
  private lastPaint = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('details');
    this.root.className = 'debug-panel debug-panel--left';

    this.summary = document.createElement('summary');
    this.summary.className = 'debug-summary';
    this.summary.textContent = '▸ RENDER · preparing…';
    this.root.appendChild(this.summary);

    this.body = document.createElement('pre');
    this.body.className = 'debug-body';
    this.root.appendChild(this.body);
    parent.appendChild(this.root);
  }

  /**
   * true quando e' ora di riscrivere il DOM. Va chiamata prima di raccogliere le
   * statistiche: leggerle a ogni frame costerebbe piu' dell'overlay stesso.
   */
  needsPaint(now: number): boolean {
    return !this.root.hidden && now - this.lastPaint >= REFRESH_MS;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  toggle(): boolean {
    this.setVisible(this.root.hidden);
    return !this.root.hidden;
  }

  update(frame: OverlayFrame, now: number): void {
    this.lastPaint = now;

    const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(2);
    const generating = frame.generationProgress < 1;

    this.summary.textContent = [
      `${this.root.open ? '▾' : '▸'} RENDER`,
      `${frame.fps.toFixed(0)} fps`,
      `${frame.drawCalls} draw`,
      `main ${frame.mainMs.toFixed(1)} ms`,
    ].join('  ·  ');

    this.body.textContent = [
      `fps rAF    ${frame.fps.toFixed(1).padStart(6)}   1% low ${frame.fpsLow.toFixed(1)}`,
      `interval p95 ${frame.frameP95Ms.toFixed(2).padStart(6)} ms   p99 ${frame.frameP99Ms.toFixed(2)}`,
      `jank >20ms ${(frame.jankRatio * 100).toFixed(1).padStart(6)} %`,
      `callback   ${frame.frameMs.toFixed(2).padStart(6)} ms`,
      `main       ${frame.mainMs.toFixed(2).padStart(6)} ms   max ${frame.mainMsMax.toFixed(2)} ms`,
      `render     ${frame.renderMs.toFixed(2).padStart(6)} ms`,
      `shadow     ${frame.shadowMs.toFixed(2).padStart(6)} ms   ${frame.shadowSize === 0 ? 'off' : frame.shadowSize + 'px'}`,
      `effects    ${frame.effects}`,
      '',
      `draw call  ${frame.drawCalls.toString().padStart(6)}`,
      `triangles  ${format(frame.triangles).padStart(6)}`,
      `quad       ${format(frame.quads).padStart(6)}`,
      `detail     ${format(frame.detailQuads).padStart(6)}`,
      `geometry   ${mb(frame.geometryBytes).padStart(6)} MB`,
      '',
      `chunk      ${frame.chunksAllocated.toString().padStart(6)} allocated`,
      `           ${frame.chunksNonEmpty.toString().padStart(6)} non-empty`,
      `           ${frame.chunksWithMesh.toString().padStart(6)} with mesh`,
      `           ${frame.chunksVisible.toString().padStart(6)} visible`,
      `queue      ${frame.queued.toString().padStart(6)} + ${frame.inFlight} in flight`,
      '',
      `mesher     ${frame.mesherLastMs.toFixed(2).padStart(6)} ms   avg ${frame.mesherAvgMs.toFixed(2)}  max ${frame.mesherMaxMs.toFixed(2)}`,
      `worker     ${frame.mesherPoolSize.toString().padStart(6)}`,
      `voxel      ${format(frame.solidVoxels).padStart(6)}`,
      '',
      `scene      ${frame.scene}  seed ${frame.seed}`,
      `theme      ${frame.theme}`,
      `quality    ${frame.quality}  DPR ${frame.pixelRatio.toFixed(2)}`,
      `camera     zoom ${frame.zoom.toFixed(2)}  yaw ${Math.round(frame.yawDegrees)}°`,
      generating ? `generate   ${(frame.generationProgress * 100).toFixed(0)} %` : '',
      '',
      'G +64 chunks   R rebuild   C reset peaks',
      '1..9 theme',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  dispose(): void {
    this.root.remove();
  }
}

function format(value: number): string {
  if (value < 1000) return value.toString();
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}
