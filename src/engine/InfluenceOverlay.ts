import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import type { Catalyst } from '../sim';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { TERRAIN } from '../world/terrain/config';

const SEGMENTS = 96;
/** Larghezza in voxel della fascia sotto il cerchio del cursore. */
const CURSOR_BAND = 1.6;

/** Un colore per uso urbano, in ordine di `BUILDING_CLASS`. */
const CLASS_COLORS: readonly number[] = [0x5f8f7f, 0xd8886a, 0xd9b45f, 0xe99a72];

/** Gli stessi due stati del segnaposto: verde valido, rosso rifiutato. */
const CURSOR_VALID = 0x2ff08d;
const CURSOR_INVALID = 0xff5a4a;

/** Cerchi di influenza e perimetri dei settori, separati dalle mesh voxel. */
export class InfluenceOverlay {
  readonly group = new Group();
  private readonly existing = new Group();
  private readonly sectors = new Group();
  // Il raggio del cursore e' una fascia piena piu' il suo bordo: una linea da
  // un pixel si perde sul terreno chiaro, e la larghezza non e' regolabile.
  private readonly cursorMaterial = lineMaterial(CURSOR_VALID, 1);
  private readonly bandMaterial = new MeshBasicMaterial({
    color: CURSOR_VALID,
    transparent: true,
    opacity: 0.3,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly cursor = new LineLoop(new BufferGeometry(), this.cursorMaterial);
  private readonly band = new Mesh(new BufferGeometry(), this.bandMaterial);

  constructor(private readonly map: TerrainMap) {
    this.group.add(this.existing, this.sectors, this.band, this.cursor);
    this.cursor.visible = false;
    this.band.visible = false;
    this.band.renderOrder = 20;
    this.cursor.renderOrder = 21;
    // Fuori dalla profondita' come il segnaposto: il raggio resta leggibile
    // anche quando passa dietro a una collina.
    this.cursorMaterial.depthTest = false;
  }

  refreshCatalysts(catalysts: readonly Catalyst[]): void {
    clearLines(this.existing);
    for (const catalyst of catalysts) {
      const line = new LineLoop(
        circleGeometry(this.map, catalyst.x, catalyst.y, catalyst.radius),
        lineMaterial(CLASS_COLORS[catalyst.class], 0.42),
      );
      line.renderOrder = 18;
      this.existing.add(line);
    }
  }

  showCursor(x: number, y: number, radius: number, valid: boolean): void {
    this.cursor.geometry.dispose();
    this.cursor.geometry = circleGeometry(this.map, x, y, radius);
    this.band.geometry.dispose();
    this.band.geometry = bandGeometry(this.map, x, y, radius, CURSOR_BAND);
    const color = valid ? CURSOR_VALID : CURSOR_INVALID;
    this.cursorMaterial.color.setHex(color);
    this.bandMaterial.color.setHex(color);
    this.cursor.visible = true;
    this.band.visible = true;
  }

  hideCursor(): void {
    this.cursor.visible = false;
    this.band.visible = false;
  }

  addSector(region: Region): void {
    const line = new LineLoop(rectGeometry(this.map, region), lineMaterial(0x70b7d0, 0.9));
    line.renderOrder = 19;
    this.sectors.add(line);
  }
}

function circleGeometry(map: TerrainMap, cx: number, cy: number, radius: number): BufferGeometry {
  const positions = new Float32Array(SEGMENTS * 3);
  for (let i = 0; i < SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    writePoint(positions, i, x, y, surfaceZ(map, x, y));
  }
  return geometry(positions);
}

/** La fascia segue la heightmap come il cerchio: due anelli e una striscia. */
function bandGeometry(
  map: TerrainMap,
  cx: number,
  cy: number,
  radius: number,
  width: number,
): BufferGeometry {
  const inner = Math.max(0, radius - width / 2);
  const outer = radius + width / 2;
  const positions = new Float32Array(SEGMENTS * 6);
  const indices: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const z = surfaceZ(map, cx + cos * radius, cy + sin * radius);
    writePoint(positions, i * 2, cx + cos * inner, cy + sin * inner, z);
    writePoint(positions, i * 2 + 1, cx + cos * outer, cy + sin * outer, z);
    const next = ((i + 1) % SEGMENTS) * 2;
    indices.push(i * 2, i * 2 + 1, next + 1, i * 2, next + 1, next);
  }
  const result = geometry(positions);
  result.setIndex(indices);
  return result;
}

function rectGeometry(map: TerrainMap, region: Region): BufferGeometry {
  const corners = [
    [region.minX, region.minY],
    [region.minX + region.sizeX, region.minY],
    [region.minX + region.sizeX, region.minY + region.sizeY],
    [region.minX, region.minY + region.sizeY],
  ] as const;
  const positions = new Float32Array(corners.length * 3);
  corners.forEach(([x, y], index) => writePoint(positions, index, x, y, surfaceZ(map, x, y)));
  return geometry(positions);
}

function surfaceZ(map: TerrainMap, x: number, y: number): number {
  return Math.max(TERRAIN.seaLevel, map.heightAt(Math.floor(x), Math.floor(y))) + 0.35;
}

function writePoint(out: Float32Array, index: number, x: number, y: number, z: number): void {
  out[index * 3] = x;
  out[index * 3 + 1] = y;
  out[index * 3 + 2] = z;
}

function geometry(positions: Float32Array): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return result;
}

function lineMaterial(color: number, opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

function clearLines(group: Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof LineLoop) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
  }
}
