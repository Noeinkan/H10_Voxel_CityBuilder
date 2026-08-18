import type { TerrainMap } from '../world/terrain/TerrainMap';
import { TERRAIN } from '../world/terrain/config';

export interface Ray3 {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

export interface SurfaceCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly buildable: boolean;
}

/** Interseca un raggio con la heightmap, senza dipendere da Three.js o dal DOM. */
export function pickSurfaceCell(ray: Ray3, map: TerrainMap): SurfaceCell | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  if (dz >= -1e-8) return null;

  // Si entra nella heightmap dall'alto. Proiettare prima su z=0 e correggere
  // dopo fallisce vicino ai bordi: quel punto puo' essere fuori dalla mappa
  // anche quando il raggio attraversa chiaramente una collina piu' in alto.
  const top = Math.min(oz, TERRAIN.maxHeight + 1);
  for (let z = top; z >= TERRAIN.oceanFloor; z -= 0.25) {
    const t = (z - oz) / dz;
    if (t < 0) continue;
    const x = Math.floor(ox + dx * t);
    const y = Math.floor(oy + dy * t);
    const column = map.columnAt(x, y);
    if (column !== null && z <= column.height) {
      return { x, y, z: column.height, buildable: column.buildable };
    }
  }
  return null;
}
