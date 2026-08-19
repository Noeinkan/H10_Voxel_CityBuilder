import { CHUNK, CHUNK_SHIFT } from '../chunkCoords';

/**
 * Rettangolo di mondo sul piano delle colonne `(x, y)` e maschera radiale
 * associata.
 *
 * La generazione lavora per colonne di chunk 32x32, quindi una region viene
 * sempre allargata verso l'esterno fino ai bordi di chunk: e' cio' che rende il
 * contenuto di un blocco funzione di `(seed, shape, ccx, ccy)` e nient'altro, e
 * quindi indipendente dall'ordine delle chiamate.
 */

/** Rettangolo in coordinate mondo. `size` e' in voxel, `min` incluso. */
export interface Region {
  readonly minX: number;
  readonly minY: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

/**
 * Ellisse della maschera di caduta. Separata dalla region perche' l'espansione
 * deve poter riusare la maschera dell'isola di partenza: e' quello che tiene
 * unita la costa fra due region generate in momenti diversi.
 */
export interface IslandShape {
  readonly centreX: number;
  readonly centreY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  /** Lobi costieri aggiunti dal giocatore; non alterano mai la maschera base. */
  readonly extensions?: readonly CoastalExtension[];
}

export interface CoastalExtension extends Region {
  readonly id: string;
}

/** La maschera implicita in una region: ellisse inscritta nel rettangolo. */
export function shapeFromRegion(region: Region): IslandShape {
  return {
    centreX: region.minX + region.sizeX / 2,
    centreY: region.minY + region.sizeY / 2,
    radiusX: region.sizeX / 2,
    radiusY: region.sizeY / 2,
  };
}

/** Aggiunge alla maschera un lobo ellittico deterministico e identificato. */
export function withCoastalExtension(
  shape: IslandShape,
  region: Region,
  id: string,
): IslandShape {
  if (shape.extensions?.some((extension) => extension.id === id) === true) return shape;
  return {
    ...shape,
    extensions: [...(shape.extensions ?? []), { ...region, id }],
  };
}

/** Intervallo di colonne di chunk coperto da una region, estremi inclusi. */
export interface ChunkSpan {
  readonly minCcx: number;
  readonly minCcy: number;
  readonly maxCcx: number;
  readonly maxCcy: number;
  readonly count: number;
}

/** Colonne di chunk toccate dalla region, arrotondate verso l'esterno. */
export function chunkSpanOf(region: Region): ChunkSpan {
  const minCcx = region.minX >> CHUNK_SHIFT;
  const minCcy = region.minY >> CHUNK_SHIFT;
  const maxCcx = (region.minX + Math.max(1, region.sizeX) - 1) >> CHUNK_SHIFT;
  const maxCcy = (region.minY + Math.max(1, region.sizeY) - 1) >> CHUNK_SHIFT;
  return {
    minCcx,
    minCcy,
    maxCcx,
    maxCcy,
    count: (maxCcx - minCcx + 1) * (maxCcy - minCcy + 1),
  };
}

/** Region allineata ai chunk che contiene quella data. */
export function alignRegion(region: Region): Region {
  const span = chunkSpanOf(region);
  return {
    minX: span.minCcx * CHUNK,
    minY: span.minCcy * CHUNK,
    sizeX: (span.maxCcx - span.minCcx + 1) * CHUNK,
    sizeY: (span.maxCcy - span.minCcy + 1) * CHUNK,
  };
}

/** Chiave della mappa sparsa per colonna di chunk. */
export function columnChunkKey(ccx: number, ccy: number): string {
  return `${ccx},${ccy}`;
}
