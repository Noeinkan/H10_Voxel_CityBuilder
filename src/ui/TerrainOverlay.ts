import { paletteHex } from '../engine/palette';
import { BIOME_DEBUG_IDS, BIOME_NAMES } from '../world/terrain/config';

/**
 * Pannello della scena di terreno, attivo con `?debug=1&terrain=<seed>`.
 *
 * Sta a parte dal `DebugOverlay` del motore: quello misura il rendering, questo
 * misura la generazione. Il riepilogo richiudibile lascia la scena libera; una
 * volta aperto espone anche il pulsante che alterna la vista per bioma.
 */

export interface TerrainOverlayFrame {
  readonly fps: number;
  /** Millisecondi spesi dal worker sull'intera isola. 0 finche' non ha finito. */
  readonly generationMs: number;
  /** Millisecondi cumulati di scrittura voxel sul main thread. */
  readonly applyMs: number;
  readonly blocksApplied: number;
  readonly blocksTotal: number;
  readonly columns: number;
  readonly buildableColumns: number;
  readonly histogram: readonly number[];
  readonly biomeView: boolean;
  readonly seed: number;
  readonly regionSize: number;
}

const REFRESH_MS = 200;

export class TerrainOverlay {
  private readonly root: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLPreElement;
  private readonly button: HTMLButtonElement;
  private lastPaint = 0;

  constructor(parent: HTMLElement, onToggleBiomes: () => void) {
    this.root = document.createElement('details');
    this.root.className = 'debug-panel debug-panel--right';

    this.summary = document.createElement('summary');
    this.summary.className = 'debug-summary';
    this.summary.textContent = '▸ TERRENO · preparazione…';
    this.root.appendChild(this.summary);

    this.body = document.createElement('pre');
    this.body.className = 'debug-body';
    this.root.appendChild(this.body);

    this.button = document.createElement('button');
    this.button.className = 'debug-button';
    this.button.textContent = 'colora per bioma (B)';
    this.button.addEventListener('click', onToggleBiomes);
    this.root.appendChild(this.button);

    parent.appendChild(this.root);
  }

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

  update(frame: TerrainOverlayFrame, now: number): void {
    this.lastPaint = now;

    const total = frame.columns === 0 ? 1 : frame.columns;
    const bands = BIOME_NAMES.map((name, i) => {
      const count = frame.histogram[i] ?? 0;
      const swatch = paletteHex[BIOME_DEBUG_IDS[i]] ?? '#000000';
      const share = ((count / total) * 100).toFixed(1);
      return `  ${square(swatch)} ${name.padEnd(7)}${format(count).padStart(7)}  ${share.padStart(5)} %`;
    });

    const streaming = frame.blocksApplied < frame.blocksTotal;
    const progress = frame.blocksTotal === 0 ? 0 : (frame.blocksApplied / frame.blocksTotal) * 100;
    this.summary.textContent = [
      `${this.root.open ? '▾' : '▸'} TERRENO`,
      `${progress.toFixed(0)}%`,
      `${format(frame.buildableColumns)} edificabili`,
    ].join('  ·  ');

    this.body.innerHTML = [
      `terreno    seed ${frame.seed}  ${frame.regionSize}x${frame.regionSize}`,
      `fps        ${frame.fps.toFixed(1).padStart(6)}`,
      '',
      `worker     ${frame.generationMs.toFixed(1).padStart(6)} ms${frame.generationMs === 0 ? '  (in corso)' : ''}`,
      `scrittura  ${frame.applyMs.toFixed(1).padStart(6)} ms  su main`,
      `blocchi    ${frame.blocksApplied.toString().padStart(6)} / ${frame.blocksTotal}`,
      '',
      `colonne    ${format(frame.columns).padStart(6)}`,
      `edificabili${format(frame.buildableColumns).padStart(6)}  ${((frame.buildableColumns / total) * 100).toFixed(1)} %`,
      '',
      'biomi',
      ...bands,
      '',
      `vista      ${frame.biomeView ? 'per bioma' : 'naturale'}`,
      streaming ? 'streaming in corso…' : '',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Quadratino colorato inline: l'unico HTML del pannello. */
function square(hex: string): string {
  return `<span style="display:inline-block;width:8px;height:8px;background:${hex};border:1px solid rgba(0,0,0,0.5)"></span>`;
}

function format(value: number): string {
  if (value < 1000) return value.toString();
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}
