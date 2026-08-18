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
  private readonly root: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLPreElement;
  private lastPaint = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('details');
    this.root.style.cssText = [
      'position:fixed',
      'left:12px',
      'bottom:var(--game-hud-bottom, 12px)',
      'z-index:16',
      'max-width:calc(100vw - 24px)',
      'max-height:min(62vh,540px)',
      'box-sizing:border-box',
      'overflow:auto',
      'background:rgba(10,18,24,.88)',
      'color:#dbe8e5',
      'font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'border:1px solid rgba(185,217,210,.22)',
      'border-radius:8px',
      'box-shadow:0 8px 28px rgba(0,0,0,.24)',
      'backdrop-filter:blur(8px)',
    ].join(';');

    this.summary = document.createElement('summary');
    this.summary.textContent = '▸ RENDER · preparazione…';
    this.summary.style.cssText = [
      'padding:6px 9px', 'cursor:pointer', 'user-select:none', 'list-style:none',
      'font:700 10px/1.4 system-ui,sans-serif', 'letter-spacing:.04em',
      'color:#b9d9d2', 'white-space:nowrap',
    ].join(';');
    this.root.appendChild(this.summary);

    this.body = document.createElement('pre');
    this.body.style.cssText = [
      'margin:0', 'padding:8px 10px 10px', 'border-top:1px solid rgba(185,217,210,.14)',
      'font:inherit', 'color:inherit', 'white-space:pre', 'min-width:280px',
    ].join(';');
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

    this.summary.textContent = [
      `${this.root.open ? '▾' : '▸'} RENDER`,
      `${frame.fps.toFixed(0)} fps`,
      `${frame.drawCalls} draw`,
      `main ${frame.mainMs.toFixed(1)} ms`,
    ].join('  ·  ');

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
      'G +64 chunk   R rebuild   C azzera picchi',
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
