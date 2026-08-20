import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
} from 'three';
import type { Catalyst } from '../sim';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { TERRAIN } from '../world/terrain/config';

const SEGMENTS = 64;

/** Un colore per uso urbano, in ordine di `BUILDING_CLASS`. */
const CLASS_COLORS: readonly number[] = [0x5f8f7f, 0xd8886a, 0xd9b45f, 0xe99a72];

/** Cerchi di influenza e perimetri dei settori, separati dalle mesh voxel. */
export class InfluenceOverlay {
  readonly group = new Group();
  private readonly existing = new Group();
  private readonly sectors = new Group();
  private readonly cursorMaterial = lineMaterial(0x65e08a, 0.95);
  private readonly cursor = new LineLoop(new BufferGeometry(), this.cursorMaterial);

  constructor(private readonly map: TerrainMap) {
    this.group.add(this.existing, this.sectors, this.cursor);
    this.cursor.visible = false;
    this.cursor.renderOrder = 20;
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
    this.cursorMaterial.color.setHex(valid ? 0x65e08a : 0xef6b65);
    this.cursor.visible = true;
  }

  hideCursor(): void {
    this.cursor.visible = false;
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
