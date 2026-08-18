/**
 * Overlay di misura, attivo solo con ?debug=1.
 *
 * DOM puro e aggiornamento a bassa frequenza: l'overlay non deve entrare nel
 * costo del frame che sta misurando.
 */

export interface OverlayFrame {
  readonly fps: number;
  readonly fpsLow: number;
  readonly frameMs: number;
  /** Lavoro sul main thread escluso il render: e' il numero da tenere sotto 4 ms. */
  readonly mainMs: number;
  readonly mainMsMax: number;
  /** Costo della sola chiamata di render, sempre sul main thread. */
  readonly renderMs: number;
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
  readonly solidVoxels: number;
  readonly mesherLastMs: number;
  readonly mesherAvgMs: number;
  readonly mesherMaxMs: number;
  readonly mesherPoolSize: number;
  readonly generationProgress: number;
  readonly scene: string;
  readonly seed: number;
  readonly theme: string;
  readonly zoom: number;
  readonly yawDegrees: number;
}

/** Ogni quanti millisecondi si riscrive il DOM. */
const REFRESH_MS = 200;

export class DebugOverlay {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLPreElement;
  private lastPaint = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:8px',
      'z-index:10',
      'padding:8px 10px',
      'background:rgba(8,11,14,0.82)',
      'color:#d8dce0',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'border:1px solid rgba(216,220,224,0.16)',
      'border-radius:4px',
      'pointer-events:none',
      'white-space:pre',
      'min-width:280px',
    ].join(';');

    this.body = document.createElement('pre');
    this.body.style.cssText = 'margin:0;font:inherit;color:inherit';
    this.root.appendChild(this.body);
    parent.appendChild(this.root);
  }

  /**
   * true quando e' ora di riscrivere il DOM. Va chiamata prima di raccogliere le
   * statistiche: leggerle a ogni frame costerebbe piu' dell'overlay stesso.
   */
  needsPaint(now: number): boolean {
    return now - this.lastPaint >= REFRESH_MS;
  }

  update(frame: OverlayFrame, now: number): void {
    this.lastPaint = now;

    const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(2);
    const generating = frame.generationProgress < 1;

    this.body.textContent = [
      `fps        ${frame.fps.toFixed(1).padStart(6)}   low ${frame.fpsLow.toFixed(1)}`,
      `frame      ${frame.frameMs.toFixed(2).padStart(6)} ms`,
      `main       ${frame.mainMs.toFixed(2).padStart(6)} ms   max ${frame.mainMsMax.toFixed(2)} ms`,
      `render     ${frame.renderMs.toFixed(2).padStart(6)} ms`,
      '',
      `draw call  ${frame.drawCalls.toString().padStart(6)}`,
      `triangoli  ${format(frame.triangles).padStart(6)}`,
      `quad       ${format(frame.quads).padStart(6)}`,
      `geometrie  ${mb(frame.geometryBytes).padStart(6)} MB`,
      '',
      `chunk      ${frame.chunksAllocated.toString().padStart(6)} allocati`,
      `           ${frame.chunksNonEmpty.toString().padStart(6)} non vuoti`,
      `           ${frame.chunksWithMesh.toString().padStart(6)} con mesh`,
      `           ${frame.chunksVisible.toString().padStart(6)} visibili`,
      `coda       ${frame.queued.toString().padStart(6)} + ${frame.inFlight} in volo`,
      '',
      `mesher     ${frame.mesherLastMs.toFixed(2).padStart(6)} ms   avg ${frame.mesherAvgMs.toFixed(2)}  max ${frame.mesherMaxMs.toFixed(2)}`,
      `worker     ${frame.mesherPoolSize.toString().padStart(6)}`,
      `voxel      ${format(frame.solidVoxels).padStart(6)}`,
      '',
      `scena      ${frame.scene}  seed ${frame.seed}`,
      `tema       ${frame.theme}`,
      `camera     zoom ${frame.zoom.toFixed(2)}  yaw ${Math.round(frame.yawDegrees)}°`,
      generating ? `genera     ${(frame.generationProgress * 100).toFixed(0)} %` : '',
      '',
      'Q/E ruota  rotella zoom  drag pan',
      'WASD pan   F inquadra    G +64 chunk',
      'R rebuild  C azzera i picchi',
      '1..9 tema',
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
