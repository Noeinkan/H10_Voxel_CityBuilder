import { CLASS_NAMES, type BuildingClass } from '../sim/classes';
import type { BuildSite } from '../sim/nextBuildSites';
import { POLICIES, type PolicyId } from '../sim/policies';
import type { SimState } from '../sim/SimState';
import { REJECT_REASONS, type BuilderStats } from '../world/buildings/Builder';

/**
 * Pannello della scena di simulazione, attivo con `?debug=1&sim=1`.
 *
 * Mostra tre cose: gli stock delle risorse con il loro delta per tick, la
 * heatmap del campo di desiderabilita' per la classe selezionata, e i prossimi
 * dieci siti candidati.
 *
 * **La heatmap sta qui e non nel mondo voxel.** Il renderer legge solo `blocks`,
 * e la simulazione non ha il permesso di scriverci: colorare le colonne per
 * desiderabilita' significherebbe rimeshare mezza isola a ogni ricalcolo. Il
 * campo finisce quindi in `VoxelWorld.data` — dove e' interrogabile da console e
 * da uno strumento headless — e si guarda su questa canvas 2D, che costa una
 * `putImageData` e non tocca una sola geometria.
 *
 * La canvas si ridisegna solo quando il campo puo' essere cambiato, non a ogni
 * refresh: senza il controllo, guardare la heatmap costerebbe una scansione
 * dell'intera region cinque volte al secondo per niente.
 */

export interface SimOverlayRegion {
  readonly minX: number;
  readonly minY: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

export interface SimOverlayFrame {
  readonly state: SimState;
  readonly sites: readonly BuildSite[];
  readonly region: SimOverlayRegion;
  /** true se il tick automatico e' attivo. */
  readonly auto: boolean;
  /** Tick al secondo del passo automatico. */
  readonly tickRate: number;
  /** Millisecondi dell'ultimo tick eseguito. */
  readonly tickMs: number;
  /** Celle scritte dall'ultima passata su `VoxelWorld.data`. */
  readonly dataCells: number;
  /** Stato della costruzione voxel, nullo mentre lo scenario si sta preparando. */
  readonly builder: BuilderStats | null;
}

export interface SimOverlayHandlers {
  readonly onTick: () => void;
  readonly onToggleAuto: () => void;
  readonly onSelectClass: (cls: BuildingClass) => void;
  readonly onTogglePolicy: (id: PolicyId) => void;
}

const REFRESH_MS = 200;

/** Lato della canvas visibile, in pixel CSS. */
const HEATMAP_PX = 224;

export class SimOverlay {
  private readonly root: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLPreElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly classButtons: HTMLButtonElement[] = [];
  private readonly policyButtons = new Map<PolicyId, HTMLButtonElement>();
  private readonly autoButton: HTMLButtonElement;
  private readonly sitesBody: HTMLPreElement;

  /** Canvas fuori schermo a un pixel per cella, poi scalata senza interpolazione. */
  private readonly cells: HTMLCanvasElement;
  private readonly cellsContext: CanvasRenderingContext2D | null;
  private image: ImageData | null = null;

  private lastPaint = 0;
  private lastFieldKey = '';

  constructor(parent: HTMLElement, handlers: SimOverlayHandlers) {
    this.root = document.createElement('details');
    this.root.className = 'debug-panel debug-panel--right';

    this.summary = document.createElement('summary');
    this.summary.className = 'debug-summary';
    this.summary.textContent = '▸ SIMULATION · preparing…';
    this.root.appendChild(this.summary);

    this.body = document.createElement('pre');
    this.body.className = 'debug-body';
    this.root.appendChild(this.body);

    this.canvas = document.createElement('canvas');
    this.canvas.width = HEATMAP_PX;
    this.canvas.height = HEATMAP_PX;
    this.canvas.className = 'debug-canvas';
    this.sitesBody = document.createElement('pre');
    this.sitesBody.className = 'debug-sites';

    this.context = this.canvas.getContext('2d');
    if (this.context !== null) this.context.imageSmoothingEnabled = false;
    this.root.appendChild(this.canvas);
    this.root.appendChild(this.sitesBody);

    this.cells = document.createElement('canvas');
    this.cellsContext = this.cells.getContext('2d', { willReadFrequently: true });

    this.root.appendChild(row(CLASS_NAMES.map((name, i) => {
      const button = actionButton(name, () => handlers.onSelectClass(i as BuildingClass));
      this.classButtons.push(button);
      return button;
    })));

    this.autoButton = actionButton('auto (P)', handlers.onToggleAuto);
    this.root.appendChild(row([actionButton('tick (T)', handlers.onTick), this.autoButton]));

    const policyRows: HTMLButtonElement[] = [];
    for (const policy of POLICIES) {
      const button = actionButton(policy.label, () => handlers.onTogglePolicy(policy.id));
      this.policyButtons.set(policy.id, button);
      policyRows.push(button);
    }
    for (let i = 0; i < policyRows.length; i += 2) {
      this.root.appendChild(row(policyRows.slice(i, i + 2)));
    }

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

  update(frame: SimOverlayFrame, now: number): void {
    this.lastPaint = now;
    const { state } = frame;
    this.summary.textContent = [
      `${this.root.open ? '▾' : '▸'} SIMULATION`,
      `tick ${state.tickCount}`,
      frame.auto ? `${frame.tickRate}/s` : 'paused',
    ].join('  ·  ');

    this.body.textContent = [
      `simulation   tick ${state.tickCount}${frame.auto ? `  auto ${frame.tickRate}/s` : '  paused'}`,
      `cost         ${frame.tickMs.toFixed(4).padStart(8)} ms per tick`,
      '',
      'resources              stock       delta',
      stockLine('residents', state.population.stock, state.population.delta),
      stockLine('food', state.food.stock, state.food.delta),
      stockLine('materials', state.materials.stock, state.materials.delta),
      stockLine('funds', state.funds.stock, state.funds.delta),
      `  happiness    ${(state.satisfaction * 100).toFixed(1).padStart(10)} %`,
      '',
      `buildings    ${state.buildingCounts.map((count, i) => `${CLASS_NAMES[i].slice(0, 4)} ${count}`).join('  ')}`,
      ...builderLines(frame.builder),
      `catalysts    ${state.catalysts.length.toString().padStart(6)}`,
      `field        ${state.field.chunkCount.toString().padStart(6)} chunks  ${format(state.field.totalRecomputedCells)} cells recomputed`,
      `data         ${format(frame.dataCells).padStart(6)} cells written  (class ${CLASS_NAMES[state.selectedClass]})`,
      '',
      `desirability — ${CLASS_NAMES[state.selectedClass]}`,
    ].join('\n');

    this.paintHeatmap(frame);

    const sites = frame.sites.length === 0
      ? ['  no sites above threshold']
      : frame.sites.map(
          (site, i) =>
            `  ${(i + 1).toString().padStart(2)}. ${`${site.x},${site.y}`.padEnd(9)} ${CLASS_NAMES[site.class].padEnd(12)}${site.score.toString().padStart(4)}`,
        );

    this.sitesBody.textContent = [`next ${frame.sites.length} sites`, ...sites].join('\n');

    for (let i = 0; i < this.classButtons.length; i++) {
      setActive(this.classButtons[i], i === state.selectedClass);
    }
    setActive(this.autoButton, frame.auto);
    for (const [id, button] of this.policyButtons) {
      setActive(button, state.policies.includes(id));
    }
  }

  dispose(): void {
    this.root.remove();
  }

  /**
   * Ridisegna la heatmap solo se qualcosa che la determina e' cambiato.
   *
   * La chiave e' l'insieme degli ingressi del campo: classe mostrata,
   * catalizzatori, edifici, policy. Il tick non ne fa parte, ed e' corretto che
   * non ne faccia parte — il tick non tocca il campo.
   */
  private paintHeatmap(frame: SimOverlayFrame): void {
    const { state, region } = frame;
    const key = [
      state.selectedClass,
      state.catalysts.length,
      state.buildings.length,
      state.field.totalRecomputedCells,
      state.policies.join('+'),
    ].join('|');
    if (key === this.lastFieldKey) return;
    this.lastFieldKey = key;

    const context = this.context;
    const cellsContext = this.cellsContext;
    if (context === null || cellsContext === null) return;

    if (this.cells.width !== region.sizeX || this.cells.height !== region.sizeY) {
      this.cells.width = region.sizeX;
      this.cells.height = region.sizeY;
      this.image = null;
    }
    if (this.image === null) this.image = cellsContext.createImageData(region.sizeX, region.sizeY);

    const pixels = this.image.data;
    const cls = state.selectedClass;

    for (let cy = 0; cy < region.sizeY; cy++) {
      const worldY = region.minY + cy;
      for (let cx = 0; cx < region.sizeX; cx++) {
        const value = state.field.valueAt(region.minX + cx, worldY, cls);
        // La riga 0 dell'immagine e' il nord: il mondo e' y crescente verso
        // nord, la canvas y crescente verso il basso.
        const p = ((region.sizeY - 1 - cy) * region.sizeX + cx) * 4;
        const [r, g, b] = heat(value);
        pixels[p] = r;
        pixels[p + 1] = g;
        pixels[p + 2] = b;
        pixels[p + 3] = 255;
      }
    }

    cellsContext.putImageData(this.image, 0, 0);

    context.clearRect(0, 0, HEATMAP_PX, HEATMAP_PX);
    context.imageSmoothingEnabled = false;
    context.drawImage(this.cells, 0, 0, HEATMAP_PX, HEATMAP_PX);

    // I candidati si segnano dopo la scalatura, altrimenti a un pixel per cella
    // sarebbero invisibili.
    const scale = HEATMAP_PX / region.sizeX;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1;
    for (const site of frame.sites) {
      const px = (site.x - region.minX) * scale;
      const py = (region.sizeY - 1 - (site.y - region.minY)) * scale;
      context.strokeRect(Math.round(px) - 2.5, Math.round(py) - 2.5, 5, 5);
    }
  }
}

/** Rampa scura -> teal -> giallo. Zero resta il fondo, non il primo colore caldo. */
function heat(value: number): [number, number, number] {
  if (value === 0) return [10, 14, 20];
  const t = value / 255;
  if (t < 0.5) {
    const k = t / 0.5;
    return [Math.round(16 + 12 * k), Math.round(26 + 122 * k), Math.round(58 + 84 * k)];
  }
  const k = (t - 0.5) / 0.5;
  return [Math.round(28 + 222 * k), Math.round(148 + 82 * k), Math.round(142 - 22 * k)];
}

function stockLine(label: string, stock: number, delta: number): string {
  const sign = delta > 0 ? '+' : '';
  return `  ${label.padEnd(13)}${format(stock).padStart(9)}  ${(sign + delta.toFixed(2)).padStart(9)}`;
}

function builderLines(stats: BuilderStats | null): readonly string[] {
  if (stats === null) return [];
  const rejected = stats.rejected
    .map((count, index) => (count === 0 ? '' : `${REJECT_REASONS[index]} ${count}`))
    .filter((line) => line !== '');
  return [
    `builder      ${stats.placed.toString().padStart(6)} placed  ${stats.growing.toString().padStart(3)} growing  ${stats.upgraded.toString().padStart(3)} upgraded`,
    `rejected     ${stats.blacklisted.toString().padStart(6)} blocked${rejected.length === 0 ? '' : `  ${rejected.join('  ')}`}`,
  ];
}

function row(children: readonly HTMLElement[]): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'debug-actions';
  for (const child of children) div.appendChild(child);
  return div;
}

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.className = 'debug-button';
  button.addEventListener('click', onClick);
  return button;
}

function setActive(button: HTMLButtonElement, active: boolean): void {
  button.style.background = active ? 'rgba(120,200,180,0.22)' : 'rgba(216,220,224,0.08)';
  button.style.borderColor = active ? 'rgba(120,200,180,0.6)' : 'rgba(216,220,224,0.28)';
}

function format(value: number): string {
  if (value < 1000) return value.toFixed(value === Math.round(value) ? 0 : 1);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}
