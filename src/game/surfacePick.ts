import type { TerrainMap } from '../world/terrain/TerrainMap';

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
  if (Math.abs(dz) < 1e-8) return null;

  let z = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const t = (z - oz) / dz;
    if (t < 0) return null;
    x = Math.floor(ox + dx * t);
    y = Math.floor(oy + dy * t);
    const column = map.columnAt(x, y);
    if (column === null) return null;
    if (column.height === z) return { x, y, z, buildable: column.buildable };
    z = column.height;
  }

  const column = map.columnAt(x, y);
  return column === null ? null : { x, y, z: column.height, buildable: column.buildable };
}
