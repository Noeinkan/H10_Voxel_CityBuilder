import type { IslandShape, Region } from '../world/terrain/region';
import { withCoastalExtension } from '../world/terrain/region';

export type SectorSide = 'north' | 'east' | 'south' | 'west';

export interface CoastalSector {
  readonly id: string;
  readonly side: SectorSide;
  readonly index: number;
  /** Territorio acquistato, esterno all'isola iniziale. */
  readonly region: Region;
  /** Include un chunk interno per raccordare la penisola senza una cucitura. */
  readonly generationRegion: Region;
}

export interface BaseRegion extends Region {}

/** Risolve sempre uno dei settori del bordo piu' vicino alla cella indicata. */
export function coastalSectorAt(x: number, y: number, base: BaseRegion, size: number): CoastalSector {
  const left = Math.abs(x - base.minX);
  const right = Math.abs(x - (base.minX + base.sizeX - 1));
  const south = Math.abs(y - base.minY);
  const north = Math.abs(y - (base.minY + base.sizeY - 1));
  const nearest = Math.min(left, right, south, north);

  if (nearest === left) return sector('west', y, base, size);
  if (nearest === right) return sector('east', y, base, size);
  if (nearest === south) return sector('south', x, base, size);
  return sector('north', x, base, size);
}

export function shapeWithSector(shape: IslandShape, sector: CoastalSector): IslandShape {
  return withCoastalExtension(shape, sector.generationRegion, sector.id);
}

function sector(side: SectorSide, coordinate: number, base: BaseRegion, size: number): CoastalSector {
  const span = side === 'north' || side === 'south' ? base.sizeX : base.sizeY;
  const origin = side === 'north' || side === 'south' ? base.minX : base.minY;
  const index = Math.max(0, Math.min(Math.ceil(span / size) - 1, Math.floor((coordinate - origin) / size)));
  const along = origin + index * size;
  const overlap = size / 2;

  const region: Region = side === 'north'
    ? { minX: along, minY: base.minY + base.sizeY, sizeX: size, sizeY: size }
    : side === 'south'
      ? { minX: along, minY: base.minY - size, sizeX: size, sizeY: size }
      : side === 'east'
        ? { minX: base.minX + base.sizeX, minY: along, sizeX: size, sizeY: size }
        : { minX: base.minX - size, minY: along, sizeX: size, sizeY: size };

  const generationRegion: Region = side === 'north'
    ? { ...region, minY: region.minY - overlap, sizeY: size + overlap }
    : side === 'south'
      ? { ...region, sizeY: size + overlap }
      : side === 'east'
        ? { ...region, minX: region.minX - overlap, sizeX: size + overlap }
        : { ...region, sizeX: size + overlap };

  return { id: `${side}-${index}`, side, index, region, generationRegion };
}
