import { Chunk } from './Chunk';
import { CHUNK, idx, keyOf, toChunk, toLocal } from './chunkCoords';
import {
  blockPalette,
  blockSurface,
  packVisualBlock,
  SURFACE_KIND,
  type SurfaceKind,
} from './visualBlock';

/** AABB del mondo in coordinate di chunk, con i corrispettivi limiti in voxel. */
export interface WorldBounds {
  readonly empty: boolean;
  readonly minCx: number;
  readonly minCy: number;
  readonly minCz: number;
  readonly maxCx: number;
  readonly maxCy: number;
  readonly maxCz: number;
  /** Limite inferiore incluso, in voxel. */
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  /** Limite superiore escluso, in voxel. */
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

interface MutableBounds {
  empty: boolean;
  minCx: number;
  minCy: number;
  minCz: number;
  maxCx: number;
  maxCy: number;
  maxCz: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Storage voxel sparso a chunk, espandibile a runtime.
 *
 * I chunk vuoti non esistono: la mappa alloca solo cio' che viene toccato e non
 * c'e' alcun limite di mondo prefissato (le coordinate negative sono valide).
 * Il renderer legge esclusivamente `Chunk.blocks`; `Chunk.data` e' riservato
 * alla simulazione e non partecipa mai al percorso di rendering.
 */
export class VoxelWorld {
  private readonly map = new Map<string, Chunk>();
  private readonly dirtyKeys = new Set<string>();

  /**
   * Cache dell'ultimo chunk raggiunto. La generazione di scena fa milioni di
   * accessi spazialmente coerenti: senza cache si pagherebbe una concatenazione
   * di stringa e un lookup nella Map per ogni singolo voxel.
   */
  private cacheChunk: Chunk | null = null;
  private cacheCx = 0;
  private cacheCy = 0;
  private cacheCz = 0;

  private readonly boundsState: MutableBounds = {
    empty: true,
    minCx: 0,
    minCy: 0,
    minCz: 0,
    maxCx: 0,
    maxCy: 0,
    maxCz: 0,
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
  };

  /** Incrementato ogni volta che l'AABB cambia, per invalidare i limiti di pan. */
  private boundsVersion = 0;

  /** Totale delle celle piene su tutti i chunk allocati. */
  private solidTotal = 0;

  /** Mappa sparsa dei chunk allocati, in sola lettura. */
  get chunks(): ReadonlyMap<string, Chunk> {
    return this.map;
  }

  get chunkCount(): number {
    return this.map.size;
  }

  get solidVoxelCount(): number {
    return this.solidTotal;
  }

  get bounds(): WorldBounds {
    return this.boundsState;
  }

  /** Cambia solo quando l'AABB si estende. */
  get version(): number {
    return this.boundsVersion;
  }

  /** Restituisce il chunk se allocato, altrimenti null. Non alloca nulla. */
  getChunk(cx: number, cy: number, cz: number): Chunk | null {
    if (this.cacheChunk !== null && cx === this.cacheCx && cy === this.cacheCy && cz === this.cacheCz) {
      return this.cacheChunk;
    }
    const found = this.map.get(keyOf(cx, cy, cz));
    if (found === undefined) return null;
    this.cacheChunk = found;
    this.cacheCx = cx;
    this.cacheCy = cy;
    this.cacheCz = cz;
    return found;
  }

  /** Restituisce il chunk, allocandolo azzerato se non esiste. */
  ensureChunk(cx: number, cy: number, cz: number): Chunk {
    const existing = this.getChunk(cx, cy, cz);
    if (existing !== null) return existing;

    const chunk = new Chunk(cx, cy, cz);
    this.map.set(chunk.key, chunk);
    this.cacheChunk = chunk;
    this.cacheCx = cx;
    this.cacheCy = cy;
    this.cacheCz = cz;
    this.growBounds(cx, cy, cz);
    return chunk;
  }

  /**
   * Scrive il layer di rendering. Marca sporco il chunk e, se la cella e' su un
   * bordo, i vicini gia' esistenti sul lato corrispondente. Scrivere lo stesso
   * valore non marca nulla.
   */
  setBlock(x: number, y: number, z: number, id: number, surface: SurfaceKind = SURFACE_KIND.plain): void {
    const cx = toChunk(x);
    const cy = toChunk(y);
    const cz = toChunk(z);

    let chunk = this.getChunk(cx, cy, cz);
    if (chunk === null) {
      // Svuotare una cella di un chunk inesistente non deve allocarlo.
      if (id === 0) return;
      chunk = this.ensureChunk(cx, cy, cz);
    }

    const lx = toLocal(x);
    const ly = toLocal(y);
    const lz = toLocal(z);
    const i = idx(lx, ly, lz);
    const next = packVisualBlock(id, surface);
    const prev = chunk.blocks[i];
    if (prev === next) return;

    chunk.blocks[i] = next;
    if (prev === 0) {
      chunk.solidCount++;
      this.solidTotal++;
    } else if (next === 0) {
      chunk.solidCount--;
      this.solidTotal--;
    }

    this.markDirty(chunk);

    // Una cella di bordo cambia le facce visibili anche del chunk adiacente.
    if (lx === 0) this.markNeighbourDirty(cx - 1, cy, cz);
    else if (lx === CHUNK - 1) this.markNeighbourDirty(cx + 1, cy, cz);
    if (ly === 0) this.markNeighbourDirty(cx, cy - 1, cz);
    else if (ly === CHUNK - 1) this.markNeighbourDirty(cx, cy + 1, cz);
    if (lz === 0) this.markNeighbourDirty(cx, cy, cz - 1);
    else if (lz === CHUNK - 1) this.markNeighbourDirty(cx, cy, cz + 1);
  }

  /** Legge il layer di rendering. Restituisce 0 fuori dai chunk allocati, senza allocare. */
  getBlock(x: number, y: number, z: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y), toChunk(z));
    if (chunk === null) return 0;
    return blockPalette(chunk.blocks[idx(toLocal(x), toLocal(y), toLocal(z))]);
  }

  /** Legge la grammatica visuale senza esporre il byte compattato del chunk. */
  getSurfaceKind(x: number, y: number, z: number): SurfaceKind {
    const chunk = this.getChunk(toChunk(x), toChunk(y), toChunk(z));
    if (chunk === null) return SURFACE_KIND.plain;
    return blockSurface(chunk.blocks[idx(toLocal(x), toLocal(y), toLocal(z))]);
  }

  /**
   * Scrive il layer di simulazione. Non tocca `blocks` e non marca sporco il
   * chunk: nessuna scrittura su `data` puo' invalidare una mesh.
   */
  setData(x: number, y: number, z: number, value: number): void {
    const cx = toChunk(x);
    const cy = toChunk(y);
    const cz = toChunk(z);

    let chunk = this.getChunk(cx, cy, cz);
    if (chunk === null) {
      if (value === 0) return;
      chunk = this.ensureChunk(cx, cy, cz);
    }
    chunk.data[idx(toLocal(x), toLocal(y), toLocal(z))] = value;
  }

  /** Legge il layer di simulazione. Restituisce 0 fuori dai chunk allocati, senza allocare. */
  getData(x: number, y: number, z: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y), toChunk(z));
    if (chunk === null) return 0;
    return chunk.data[idx(toLocal(x), toLocal(y), toLocal(z))];
  }

  /**
   * Svuota il set dei chunk sporchi e ne restituisce le chiavi: e' il punto in
   * cui il renderer raccoglie il lavoro di rebuild da accodare.
   */
  flush(): readonly string[] {
    if (this.dirtyKeys.size === 0) return EMPTY_KEYS;

    const keys: string[] = [];
    for (const key of this.dirtyKeys) {
      const chunk = this.map.get(key);
      if (chunk === undefined) continue;
      chunk.dirty = false;
      keys.push(key);
    }
    this.dirtyKeys.clear();
    return keys;
  }

  /** Numero di chunk in attesa di essere raccolti da `flush()`. */
  get dirtyCount(): number {
    return this.dirtyKeys.size;
  }

  /** Marca sporchi tutti i chunk allocati. Usato dallo stress test di rebuild. */
  markAllDirty(): void {
    for (const chunk of this.map.values()) this.markDirty(chunk);
  }

  private markDirty(chunk: Chunk): void {
    if (chunk.dirty) return;
    chunk.dirty = true;
    this.dirtyKeys.add(chunk.key);
  }

  private markNeighbourDirty(cx: number, cy: number, cz: number): void {
    const neighbour = this.map.get(keyOf(cx, cy, cz));
    if (neighbour !== undefined) this.markDirty(neighbour);
  }

  private growBounds(cx: number, cy: number, cz: number): void {
    const b = this.boundsState;
    let changed = false;

    if (b.empty) {
      b.empty = false;
      b.minCx = cx;
      b.maxCx = cx;
      b.minCy = cy;
      b.maxCy = cy;
      b.minCz = cz;
      b.maxCz = cz;
      changed = true;
    } else {
      if (cx < b.minCx) {
        b.minCx = cx;
        changed = true;
      } else if (cx > b.maxCx) {
        b.maxCx = cx;
        changed = true;
      }
      if (cy < b.minCy) {
        b.minCy = cy;
        changed = true;
      } else if (cy > b.maxCy) {
        b.maxCy = cy;
        changed = true;
      }
      if (cz < b.minCz) {
        b.minCz = cz;
        changed = true;
      } else if (cz > b.maxCz) {
        b.maxCz = cz;
        changed = true;
      }
    }

    if (!changed) return;

    b.minX = b.minCx * CHUNK;
    b.minY = b.minCy * CHUNK;
    b.minZ = b.minCz * CHUNK;
    b.maxX = (b.maxCx + 1) * CHUNK;
    b.maxY = (b.maxCy + 1) * CHUNK;
    b.maxZ = (b.maxCz + 1) * CHUNK;
    this.boundsVersion++;
  }
}

const EMPTY_KEYS: readonly string[] = [];
