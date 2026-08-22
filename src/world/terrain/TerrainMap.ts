import { CHUNK_SHIFT, toChunk, toLocal } from '../chunkCoords';
import { BIOME, BIOME_COUNT } from './config';
import { columnIndex, COLUMNS_PER_CHUNK, type ColumnBlock } from './columnBlock';
import { columnChunkKey, type IslandShape } from './region';

/**
 * Mappa 2D sparsa per colonna, chunkata 32x32 come il mondo.
 *
 * E' un contenitore, non un generatore: non conosce ne' il rumore ne' il
 * `VoxelWorld`. In particolare **non usa e non tocca il layer `data`**, che
 * resta riservato alla simulazione; questa struttura vive interamente a parte e
 * puo' essere buttata via e rigenerata senza toccare un solo voxel.
 */

/** Vista di comodo su una singola colonna. */
export interface TerrainColumn {
  readonly height: number;
  readonly biome: number;
  readonly slope: number;
  readonly buildable: boolean;
}

/** Una colonna di chunk: cinque array paralleli lunghi 1024. */
export class TerrainColumnChunk {
  readonly ccx: number;
  readonly ccy: number;
  readonly key: string;

  readonly heights: Int16Array;
  readonly biomes: Uint8Array;
  readonly slopes: Float32Array;
  readonly buildable: Uint8Array;
  /** Classe d'acqua (`WATER_CLASS`), significativa solo dove si e' sommersi. */
  readonly water: Uint8Array;

  readonly maxHeight: number;
  readonly buildableCount: number;

  constructor(block: ColumnBlock) {
    this.ccx = block.ccx;
    this.ccy = block.ccy;
    this.key = columnChunkKey(block.ccx, block.ccy);
    this.heights = block.heights;
    this.biomes = block.biomes;
    this.slopes = block.slopes;
    this.buildable = block.buildable;
    this.water = block.water;
    this.maxHeight = block.maxHeight;
    this.buildableCount = block.buildableCount;
  }
}

export class TerrainMap {
  private readonly map = new Map<string, TerrainColumnChunk>();

  /** Stessa cache a un elemento del `VoxelWorld`: gli accessi sono coerenti. */
  private cache: TerrainColumnChunk | null = null;
  private cacheCcx = 0;
  private cacheCcy = 0;

  private buildableTotal = 0;

  /**
   * Maschera con cui questa mappa e' stata generata la prima volta.
   *
   * Non e' un dato di colonna: e' cio' che permette a `expandIsland` di
   * continuare la stessa isola invece di iniziarne una nuova sul rettangolo
   * nuovo. La base non cambia; le espansioni possono aggiungere lobi costieri.
   */
  private islandShape: IslandShape | null = null;

  get shape(): IslandShape | null {
    return this.islandShape;
  }

  /** Ricorda la maschera piu' recente, comprese eventuali espansioni. */
  rememberShape(shape: IslandShape): void {
    this.islandShape = shape;
  }

  get chunks(): ReadonlyMap<string, TerrainColumnChunk> {
    return this.map;
  }

  get chunkCount(): number {
    return this.map.size;
  }

  get columnCount(): number {
    return this.map.size * COLUMNS_PER_CHUNK;
  }

  get buildableCount(): number {
    return this.buildableTotal;
  }

  /** true se la colonna di chunk e' gia' stata generata. */
  hasChunk(ccx: number, ccy: number): boolean {
    return this.getChunk(ccx, ccy) !== null;
  }

  getChunk(ccx: number, ccy: number): TerrainColumnChunk | null {
    if (this.cache !== null && ccx === this.cacheCcx && ccy === this.cacheCcy) return this.cache;
    const found = this.map.get(columnChunkKey(ccx, ccy));
    if (found === undefined) return null;
    this.cache = found;
    this.cacheCcx = ccx;
    this.cacheCcy = ccy;
    return found;
  }

  /**
   * Prende possesso dei buffer del blocco senza copiarli: e' il punto in cui i
   * dati arrivati dal worker via `Transferable` entrano nella mappa a costo zero.
   * Un blocco gia' presente viene sostituito.
   */
  adopt(block: ColumnBlock): TerrainColumnChunk {
    const previous = this.map.get(columnChunkKey(block.ccx, block.ccy));
    if (previous !== undefined) this.buildableTotal -= previous.buildableCount;

    const chunk = new TerrainColumnChunk(block);
    this.map.set(chunk.key, chunk);
    this.buildableTotal += chunk.buildableCount;
    this.cache = chunk;
    this.cacheCcx = chunk.ccx;
    this.cacheCcy = chunk.ccy;
    return chunk;
  }

  /** true se la colonna di mondo e' coperta dalla mappa. */
  has(x: number, y: number): boolean {
    return this.getChunk(toChunk(x), toChunk(y)) !== null;
  }

  /** Altezza della colonna, 0 se non generata. */
  heightAt(x: number, y: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return 0;
    return chunk.heights[columnIndex(toLocal(x), toLocal(y))];
  }

  /** Bioma della colonna, `ocean` se non generata. */
  biomeAt(x: number, y: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return BIOME.ocean;
    return chunk.biomes[columnIndex(toLocal(x), toLocal(y))];
  }

  /** Pendenza della colonna, 0 se non generata. */
  slopeAt(x: number, y: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return 0;
    return chunk.slopes[columnIndex(toLocal(x), toLocal(y))];
  }

  /** true se sulla colonna si puo' costruire. false se non generata. */
  isBuildable(x: number, y: number): boolean {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return false;
    return chunk.buildable[columnIndex(toLocal(x), toLocal(y))] === 1;
  }

  /** I quattro campi in un colpo solo, o null se la colonna non e' generata. */
  columnAt(x: number, y: number): TerrainColumn | null {
    const chunk = this.getChunk(toChunk(x), toChunk(y));
    if (chunk === null) return null;
    const i = columnIndex(toLocal(x), toLocal(y));
    return {
      height: chunk.heights[i],
      biome: chunk.biomes[i],
      slope: chunk.slopes[i],
      buildable: chunk.buildable[i] === 1,
    };
  }

  /** Conteggio di colonne per bioma, indicizzato come `BIOME`. */
  biomeHistogram(): Uint32Array {
    const out = new Uint32Array(BIOME_COUNT);
    for (const chunk of this.map.values()) {
      for (let i = 0; i < COLUMNS_PER_CHUNK; i++) out[chunk.biomes[i]]++;
    }
    return out;
  }

  /** Coordinata mondo x del primo voxel di una colonna di chunk. */
  static originOf(cc: number): number {
    return cc << CHUNK_SHIFT;
  }
}
