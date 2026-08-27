import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import type { InfoSampler, InfoViewKind } from '../sim';
import { TERRAIN } from '../world/terrain/config';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';

/**
 * La heatmap in-world delle viste informative, a la Cities Skylines.
 *
 * Generalizza la velatura di `InfluenceOverlay` — li' c'e' un solo campo di
 * portata sotto il cursore, qui un'intera regione campionata per cella. Stesse
 * regole di sempre: mesh separate sopra la scena, mai un voxel riscritto,
 * fuori dalla profondita' come il segnaposto, e geometria ricostruita solo
 * quando la vista o il campo cambiano.
 *
 * **La generazione si spezza fra i frame.** Una regione 512x512 decimata fa
 * qualche decina di migliaia di quad: costruirli in un frame farebbe cadere
 * proprio il momento in cui si apre la vista. Il campionamento (economico) e la
 * geometria (cara) girano a passi, ognuno dentro il budget passato da
 * `update`.
 */

/** Quad massimi per heatmap: oltre, si allarga il passo di decimazione. */
const MAX_CELLS = 30000;

/** Quanto la velatura continua sposta il suolo, dal minimo al picco. */
const FILL_ALPHA_MIN = 0.15;
const FILL_ALPHA_PEAK = 0.8;

/** Opacita' della tinta categorica, piatta: e' una mappa, non un gradiente. */
const CATEGORY_ALPHA = 0.6;

/** Il colore dei bordi fra categorie: bianco caldo, leggero. */
const EDGE_COLOR = 0xf4f4ee;
const EDGE_OPACITY = 0.55;

/**
 * Rampa continua scura -> teal -> giallo. Zero resta un blu quasi nero, non il
 * primo caldo: il vuoto non e' un valore alto, come in `SimOverlay.heat`.
 */
function ramp(t: number): readonly [number, number, number] {
  const v = t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (v < 0.5) {
    const k = v / 0.5;
    return [0.06 + 0.05 * k, 0.1 + 0.48 * k, 0.23 + 0.33 * k];
  }
  const k = (v - 0.5) / 0.5;
  return [0.11 + 0.87 * k, 0.58 + 0.32 * k, 0.56 - 0.09 * k];
}

type Rgb = readonly [number, number, number];

/** Cibo: campo, frutteto, torre. */
const FOOD_COLORS: readonly Rgb[] = [
  [0.55, 0.75, 0.3],
  [0.28, 0.52, 0.24],
  [0.18, 0.7, 0.74],
];

/** Distretti, in ordine di `DISTRICT_ORDER`. */
const DISTRICT_COLORS: readonly Rgb[] = [
  [0.4, 0.4, 0.44],
  [0.27, 0.6, 0.85],
  [0.95, 0.55, 0.3],
  [0.82, 0.74, 0.35],
  [0.55, 0.74, 0.85],
  [0.45, 0.7, 0.45],
  [0.6, 0.45, 0.85],
  [0.9, 0.4, 0.45],
  [0.72, 0.6, 0.8],
];

function paletteOf(kind: InfoViewKind): readonly Rgb[] {
  return kind === 'food' ? FOOD_COLORS : DISTRICT_COLORS;
}

/** Passo di decimazione che tiene i quad sotto `MAX_CELLS`. */
function decimationStep(region: Region): number {
  const cells = region.sizeX * region.sizeY;
  return Math.max(1, Math.ceil(Math.sqrt(cells / MAX_CELLS)));
}

function surfaceZ(map: TerrainMap, x: number, y: number): number {
  return Math.max(TERRAIN.seaLevel, map.heightAt(Math.floor(x), Math.floor(y))) + 0.35;
}

type Phase = 'sampling' | 'building' | 'done';

export class InfoViewOverlay {
  readonly group = new Group();

  private readonly fillMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly fill = new Mesh(new BufferGeometry(), this.fillMaterial);
  private readonly edgeMaterial = new LineBasicMaterial({
    color: EDGE_COLOR,
    transparent: true,
    opacity: EDGE_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  private readonly edges = new LineSegments(new BufferGeometry(), this.edgeMaterial);

  private sampler: InfoSampler | null = null;
  private key = '';
  private visible = false;

  private readonly step: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly total: number;
  /** Angolo minimo della regione: il campionamento si ancora li', non all'origine. */
  private readonly originX: number;
  private readonly originY: number;

  private phase: Phase = 'done';
  private cursor = 0;
  private samples = new Float32Array(0);
  private maxValue = 1;
  /** Vertici accumulati fra i frame della fase di costruzione. */
  private positions: number[] = [];
  private colors: number[] = [];
  private boundaries: number[] = [];

  constructor(
    private readonly map: TerrainMap,
    region: Region,
  ) {
    this.fill.renderOrder = 18;
    this.edges.renderOrder = 19;
    this.group.add(this.fill, this.edges);
    this.group.visible = false;

    this.step = decimationStep(region);
    this.cols = Math.ceil(region.sizeX / this.step);
    this.rows = Math.ceil(region.sizeY / this.step);
    this.total = this.cols * this.rows;
    this.originX = region.minX;
    this.originY = region.minY;
  }

  /** Mostra o nasconde l'overlay; nascosto non consuma budget di costruzione. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.group.visible = visible && this.sampler !== null;
  }

  /**
   * Cambia vista o campo, ricostruendo solo se la chiave e' diversa.
   *
   * La chiave arriva da `infoViewVersion`: cambiare catalizzatore, edificio,
   * policy o lotto la sposta, e allora la heatmap riparte; pan e zoom no.
   */
  setView(sampler: InfoSampler, key: string): void {
    if (this.sampler !== null && this.key === key) return;
    this.sampler = sampler;
    this.key = key;
    this.samples = new Float32Array(this.total);
    this.maxValue = sampler.normalized ? 1 : 0;
    this.cursor = 0;
    this.phase = 'sampling';
    this.positions = [];
    this.colors = [];
    this.boundaries = [];
    // La geometria della vista precedente non deve restare a schermo sotto il
    // nome nuovo: si svuota subito, e la costruzione a passi la riempie.
    this.fill.geometry.dispose();
    this.fill.geometry = new BufferGeometry();
    this.edges.geometry.dispose();
    this.edges.geometry = new BufferGeometry();
    this.group.visible = this.visible;
  }

  /** Spegne l'overlay e libera la geometria disegnata. */
  clear(): void {
    this.sampler = null;
    this.key = '';
    this.phase = 'done';
    this.positions = [];
    this.colors = [];
    this.boundaries = [];
    this.group.visible = false;
    this.fill.geometry.dispose();
    this.fill.geometry = new BufferGeometry();
    this.edges.geometry.dispose();
    this.edges.geometry = new BufferGeometry();
  }

  get activeKind(): InfoViewKind | null {
    return this.sampler?.kind ?? null;
  }

  /** Avanza il campionamento e la geometria, al massimo `budgetMs`. */
  update(budgetMs: number): void {
    if (this.sampler === null || !this.visible) return;
    if (this.phase === 'done') return;

    const start = performance.now();
    if (this.phase === 'sampling') {
      this.sampleStep(start, budgetMs);
      if (this.phase !== 'sampling') this.buildStep(start, budgetMs);
      return;
    }
    this.buildStep(start, budgetMs);
  }

  private cellWorldX(i: number): number {
    return this.originX + (i % this.cols) * this.step;
  }

  private cellWorldY(i: number): number {
    return this.originY + Math.floor(i / this.cols) * this.step;
  }

  /** Passa le celle in rassegna raccogliendo i campioni, a budget. */
  private sampleStep(start: number, budgetMs: number): void {
    const sampler = this.sampler;
    if (sampler === null) return;
    let max = this.maxValue;

    while (this.cursor < this.total) {
      const x = this.cellWorldX(this.cursor);
      const y = this.cellWorldY(this.cursor);
      const value = sampler.sample(x, y);
      this.samples[this.cursor] = value;
      if (sampler.mode === 'continuous' && !sampler.normalized && value > max) max = value;
      this.cursor++;
      if (performance.now() - start > budgetMs) return;
    }

    this.maxValue = max;
    this.cursor = 0;
    this.phase = 'building';
  }

  /** Passa i campioni in geometria — quad e bordi — a budget. */
  private buildStep(start: number, budgetMs: number): void {
    const sampler = this.sampler;
    if (sampler === null) return;

    const positions = this.positions;
    const colors = this.colors;
    const edges = this.boundaries;
    const step = this.step;

    while (this.cursor < this.total) {
      const i = this.cursor;
      const value = this.samples[i];
      const x = this.cellWorldX(i);
      const y = this.cellWorldY(i);

      if (sampler.mode === 'continuous') {
        if (value !== 0) {
          const t = sampler.normalized ? value : value / this.maxValue;
          this.pushQuad(positions, colors, x, y, step, ramp(t), FILL_ALPHA_MIN + (FILL_ALPHA_PEAK - FILL_ALPHA_MIN) * t);
        }
      } else if (value >= 0) {
        const palette = paletteOf(sampler.kind);
        this.pushQuad(positions, colors, x, y, step, palette[Math.min(palette.length - 1, value)] ?? [1, 1, 1], CATEGORY_ALPHA);
        this.pushEdges(edges, i, value);
      }

      this.cursor++;
      if (performance.now() - start > budgetMs) return;
    }

    this.commitBuild();
    this.phase = 'done';
  }

  private pushQuad(
    positions: number[],
    colors: number[],
    x: number,
    y: number,
    step: number,
    rgb: Rgb,
    alpha: number,
  ): void {
    const z = surfaceZ(this.map, x + step * 0.5, y + step * 0.5);
    const x0 = x;
    const x1 = x + step;
    const y0 = y;
    const y1 = y + step;
    positions.push(x0, y0, z, x1, y0, z, x1, y1, z);
    positions.push(x0, y0, z, x1, y1, z, x0, y1, z);
    for (let vertex = 0; vertex < 6; vertex++) {
      colors.push(rgb[0], rgb[1], rgb[2], alpha);
    }
  }

  /**
   * I bordi di una cella categorica: un segmento dove la categoria del vicino
   * a destra o sotto differisce, e almeno una delle due e' reale. Cosi' i
   * distretti si separano fra loro e i campi si staccano dal prato vuoto.
   */
  private pushEdges(edges: number[], i: number, category: number): void {
    const col = i % this.cols;
    const row = Math.floor(i / this.cols);
    const x = this.cellWorldX(i);
    const y = this.cellWorldY(i);
    const step = this.step;

    if (col + 1 < this.cols) {
      const right = this.samples[i + 1];
      if (right !== category && (right >= 0 || category >= 0)) {
        const z = surfaceZ(this.map, x + step, y + step * 0.5);
        edges.push(x + step, y, z, x + step, y + step, z);
      }
    }
    if (row + 1 < this.rows) {
      const below = this.samples[i + this.cols];
      if (below !== category && (below >= 0 || category >= 0)) {
        const z = surfaceZ(this.map, x + step * 0.5, y + step);
        edges.push(x, y + step, z, x + step, y + step, z);
      }
    }
  }

  /** Accumula i vertici raccolti in geometrie nuove, una volta a costruzione finita. */
  private commitBuild(): void {
    if (this.positions.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
      geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 4));
      this.fill.geometry.dispose();
      this.fill.geometry = geometry;
    }
    if (this.boundaries.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(this.boundaries, 3));
      this.edges.geometry.dispose();
      this.edges.geometry = geometry;
    }
  }
}
