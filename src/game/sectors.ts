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

/**
 * Il settore dietro un identificatore, per chi ha solo quello.
 *
 * E' la lettura al contrario di `coastalSectorAt`: quella parte da una cella
 * che il giocatore ha cliccato, questa da un `<lato>-<indice>` che un
 * salvataggio si e' portato dietro. La geometria e' la stessa funzione — un
 * settore resta funzione pura di lato, indice e isola di partenza, quindi non
 * c'e' niente da salvare oltre al nome.
 *
 * Torna `null` su un identificatore che non nomina un settore di questa isola:
 * un file scritto per un mondo piu' grande, o modificato a mano.
 */
export function coastalSectorById(id: string, base: BaseRegion, size: number): CoastalSector | null {
  const split = id.lastIndexOf('-');
  if (split <= 0) return null;

  const side = id.slice(0, split);
  if (side !== 'north' && side !== 'east' && side !== 'south' && side !== 'west') return null;

  const index = Number(id.slice(split + 1));
  if (!Number.isInteger(index) || index < 0) return null;

  const span = side === 'north' || side === 'south' ? base.sizeX : base.sizeY;
  if (index > Math.ceil(span / size) - 1) return null;

  const origin = side === 'north' || side === 'south' ? base.minX : base.minY;
  // Si ricostruisce passando dalla stessa `sector()` invece di ripeterne la
  // geometria: una coordinata dentro la fascia dell'indice ci ricade sopra, e
  // due tabelle di rettangoli divergerebbero al primo che qualcuno tocca.
  return sector(side, origin + index * size, base, size);
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
