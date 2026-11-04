import { TERRAIN } from '../world/terrain/config';
import { HeightField } from '../world/terrain/heightField';
import { shapeFromRegion, type LandscapeOptions } from '../world/terrain/region';

const SIDE = 128;
const REGION = { minX: 0, minY: 0, sizeX: 512, sizeY: 512 };

/** Carta dall'alto campionata dal medesimo campo di quota usato dal worker. */
export class IslandPreview {
  readonly root: HTMLElement;

  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private timer: number | null = null;

  constructor() {
    this.root = document.createElement('figure');
    this.root.className = 'title-island-preview';

    this.canvas = document.createElement('canvas');
    this.canvas.width = SIDE;
    this.canvas.height = SIDE;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Island preview');

    this.status = document.createElement('figcaption');
    this.status.className = 'title-note';
    this.status.textContent = 'Island preview';
    this.root.append(this.canvas, this.status);
  }

  update(seed: number | null, landscape: LandscapeOptions): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (seed === null) {
      this.status.textContent = 'Enter a valid seed to preview the island.';
      return;
    }
    this.status.textContent = 'Updating island preview…';
    // Il seed cambia a ogni tasto: il ritardo evita di pianificare laghi e
    // campionare l'isola per numeri intermedi che il giocatore non usera'.
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.draw(seed, landscape);
    }, 160);
  }

  stop(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private draw(seed: number, landscape: LandscapeOptions): void {
    const context = this.canvas.getContext('2d');
    if (context === null) return;

    const field = new HeightField(seed, {
      ...shapeFromRegion(REGION), landscape,
    });
    const side = SIDE + 2;
    const heights = new Float32Array(side * side);
    const water = new Uint8Array(SIDE * SIDE);
    for (let py = -1; py <= SIDE; py++) {
      const y = (SIDE - py - 0.5) * REGION.sizeY / SIDE;
      for (let px = -1; px <= SIDE; px++) {
        const x = (px + 0.5) * REGION.sizeX / SIDE;
        heights[(py + 1) * side + px + 1] = field.heightAt(x, y);
        if (px >= 0 && px < SIDE && py >= 0 && py < SIDE) {
          water[py * SIDE + px] = heights[(py + 1) * side + px + 1]
            < field.waterLevelAt(x, y) ? 1 : 0;
        }
      }
    }

    const pixels = context.createImageData(SIDE, SIDE);
    for (let py = 0; py < SIDE; py++) {
      for (let px = 0; px < SIDE; px++) {
        const i = (py + 1) * side + px + 1;
        const h = heights[i];
        const wet = water[py * SIDE + px] === 1;
        const depth = Math.max(0, TERRAIN.seaLevel - h);
        let color: readonly [number, number, number];
        if (wet) color = depth > TERRAIN.canalMaxDepth ? [56, 116, 160] : [78, 155, 188];
        else if (h < TERRAIN.beachMaxHeight) color = [222, 203, 151];
        else if (h < TERRAIN.forestMinHeight) color = [151, 186, 112];
        else if (h < TERRAIN.hillMinHeight) color = [91, 147, 107];
        else if (h < TERRAIN.rockMinHeight) color = [161, 168, 117];
        else color = [138, 145, 149];

        const coast = !wet && (
          (px > 0 && water[py * SIDE + px - 1] === 1)
          || (px + 1 < SIDE && water[py * SIDE + px + 1] === 1)
          || (py > 0 && water[(py - 1) * SIDE + px] === 1)
          || (py + 1 < SIDE && water[(py + 1) * SIDE + px] === 1)
        );
        const slopeLight = (heights[i - 1] - heights[i + 1]
          + heights[i - side] - heights[i + side]) * 0.018;
        const light = coast ? 1.12 : Math.max(0.72, Math.min(1.18, 0.96 + slopeLight));
        const pixel = (py * SIDE + px) * 4;
        pixels.data[pixel] = Math.min(255, color[0] * light);
        pixels.data[pixel + 1] = Math.min(255, color[1] * light);
        pixels.data[pixel + 2] = Math.min(255, color[2] * light);
        pixels.data[pixel + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    this.canvas.setAttribute('aria-label', `Island preview for seed ${seed}`);
    this.status.textContent = 'Island preview · sea, lowlands, hills and rock';
  }
}
