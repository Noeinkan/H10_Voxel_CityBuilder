/**
 * Overlay di misura, attivo solo con ?debug=1.
 *
 * DOM puro e aggiornamento a bassa frequenza: l'overlay non deve entrare nel
 * costo del frame che sta misurando.
 */

import { RENDER_PHASE, type PhaseReading } from '../engine/FrameBreakdown';

export interface OverlayFrame {
  readonly fps: number;
  readonly fpsLow: number;
  /** Percentili degli intervalli reali fra callback rAF. */
  readonly frameP95Ms: number;
  readonly frameP99Ms: number;
  readonly jankRatio: number;
  /** L'ultimo frame intero: main piu' render. */
  readonly frameMs: number;
  /**
   * Lavoro sul main thread escluso il render: e' il numero da tenere sotto 4 ms.
   * Comprende anche cio' che viene dopo il disegno — HUD, traffico, autosave —
   * che prima usciva dal conto.
   */
  readonly mainMs: number;
  readonly mainMsMax: number;
  /** Percentili del main sulla finestra: il budget si giudica sul p99, non sull'ultimo frame. */
  readonly mainP95Ms: number;
  readonly mainP99Ms: number;
  /** Costo della sola chiamata di render, sempre sul main thread. */
  readonly renderMs: number;
  /** Dove va il frame, fase per fase, nell'ordine in cui il frame le attraversa. */
  readonly phases: readonly PhaseReading[];
  /**
   * p95 del render nei frame che portano geometria nuova alla GPU, e negli altri.
   * La differenza e' il costo dell'upload, che da JavaScript non ha un orologio suo.
   */
  readonly renderUploadP95Ms: number;
  readonly renderIdleP95Ms: number;
  /** Frame con upload nella finestra, e il picco di byte caricati in un frame. */
  readonly uploadFrames: number;
  readonly uploadBytesMax: number;
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
  readonly chunksFalling: number;
  readonly queued: number;
  readonly inFlight: number;
  readonly quads: number;
  readonly detailQuads: number;
  readonly solidVoxels: number;
  readonly mesherLastMs: number;
  readonly mesherAvgMs: number;
  readonly mesherMaxMs: number;
  readonly mesherPoolSize: number;
  /** Fasi del remesh sul main thread: upload e spedizione, ultimo frame e picchi. */
  readonly remeshApplyMs: number;
  readonly remeshDispatchMs: number;
  readonly remeshApplyMaxMs: number;
  readonly remeshDispatchMaxMs: number;
  readonly generationProgress: number;
  readonly scene: string;
  readonly seed: number;
  readonly theme: string;
  /** Ora di gioco, 0..24. Stessa fonte di `__voxelHour`. */
  readonly hour: number;
  /** `cycle`, `day` o `night`: cosa fa l'orologio, non che ora segna. */
  readonly hourMode: string;
  /** true quando l'orologio e' fermo, per `?hour=` o per il modo scelto. */
  readonly hourPinned: boolean;
  readonly quality: string;
  readonly pixelRatio: number;
  readonly zoom: number;
  readonly yawDegrees: number;
  /** Da quando l'orbita vale anche sulla citta', non e' piu' una costante. */
  readonly pitchDegrees: number;
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
      `main       ${frame.mainMs.toFixed(2).padStart(6)} ms   p99 ${frame.mainP99Ms.toFixed(2)}  max ${frame.mainMsMax.toFixed(2)} ms`,
      ...phaseLines(frame.phases),
      `render     ${frame.renderMs.toFixed(2).padStart(6)} ms`,
      `  upload   p95 ${frame.renderUploadP95Ms.toFixed(2)} vs ${frame.renderIdleP95Ms.toFixed(2)} ms  ` +
        `${frame.uploadFrames} frames  max ${mb(frame.uploadBytesMax)} MB`,
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
      `           ${frame.chunksFalling.toString().padStart(6)} falling`,
      `queue      ${frame.queued.toString().padStart(6)} + ${frame.inFlight} in flight`,
      '',
      `mesher     ${frame.mesherLastMs.toFixed(2).padStart(6)} ms   avg ${frame.mesherAvgMs.toFixed(2)}  max ${frame.mesherMaxMs.toFixed(2)}`,
      `remesh cpu apply ${frame.remeshApplyMs.toFixed(2)}  dispatch ${frame.remeshDispatchMs.toFixed(2)}  max ${frame.remeshApplyMaxMs.toFixed(2)}/${frame.remeshDispatchMaxMs.toFixed(2)}`,
      `worker     ${frame.mesherPoolSize.toString().padStart(6)}`,
      `voxel      ${format(frame.solidVoxels).padStart(6)}`,
      '',
      `scene      ${frame.scene}  seed ${frame.seed}`,
      `theme      ${frame.theme}`,
      `hour       ${formatHour(frame.hour)}  ${frame.hourMode}${frame.hourPinned ? '  pinned' : ''}   H ±1h  L mode`,
      `quality    ${frame.quality}  DPR ${frame.pixelRatio.toFixed(2)}`,
      `camera     zoom ${frame.zoom.toFixed(2)}  yaw ${Math.round(frame.yawDegrees)}°  pitch ${Math.round(frame.pitchDegrees)}°`,
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

/**
 * Una riga per fase di main thread, con p99 e picco.
 *
 * Il render resta fuori perche' ha la sua riga subito sotto, e non e' lavoro da
 * mettere nei 4 ms: sommarlo qui farebbe sembrare sforato un budget che regge.
 */
function phaseLines(phases: readonly PhaseReading[]): string[] {
  return phases
    .filter((phase) => phase.name !== RENDER_PHASE)
    .map((phase) =>
      `  ${phase.name.padEnd(10)} ${phase.p99Ms.toFixed(2).padStart(6)} p99  max ${phase.maxMs.toFixed(2)}`);
}

/** Ora di gioco come orologio: e' cosi' che si legge, non come 13,74. */
function formatHour(hour: number): string {
  const whole = Math.floor(hour);
  const minutes = Math.floor((hour - whole) * 60);
  return `${whole.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function format(value: number): string {
  if (value < 1000) return value.toString();
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}
