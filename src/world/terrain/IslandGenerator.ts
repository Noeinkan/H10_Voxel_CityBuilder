import { CHUNK, CHUNK_SHIFT } from '../chunkCoords';
import type { VoxelWorld } from '../VoxelWorld';
import { classifyBiome, isBuildable, paletteForDepth } from './biomes';
import {
  columnIndex,
  columnLocalX,
  columnLocalY,
  COLUMNS_PER_CHUNK,
  type ColumnBlock,
} from './columnBlock';
import { TERRAIN, WATER_IDS } from './config';
import { HeightField } from './heightField';
import { chunkSpanOf, shapeFromRegion, type IslandShape, type Region } from './region';
import { TerrainMap } from './TerrainMap';

/**
 * Generatore di isole procedurali.
 *
 * Non importa Three.js e non sa nulla di mesh, camere o materiali: scrive voxel
 * attraverso `world.setBlock` / `world.ensureChunk` e riempie una `TerrainMap`
 * parallela. Il layer `data` del mondo non viene mai toccato.
 *
 * **Determinismo.** Il contenuto di una colonna di chunk e' funzione di
 * `(seed, shape, ccx, ccy)` e di nient'altro: niente stato accumulato, nessuna
 * lettura di cio' che e' gia' stato generato. Da qui seguono le due proprieta'
 * che servono: la stessa coppia seed + region da' sempre lo stesso risultato, e
 * generare A poi B equivale a generare B poi A.
 */

export type { IslandShape, Region } from './region';
export { alignRegion, chunkSpanOf, shapeFromRegion } from './region';

export interface IslandOptions {
  /** Mappa da riempire. Se manca ne viene creata una nuova. */
  readonly map?: TerrainMap;

  /**
   * Maschera di caduta da usare al posto di quella implicita nella region.
   *
   * E' la leva dell'espansione: passando la maschera dell'isola di partenza, il
   * rettangolo nuovo continua la stessa costa invece di aprirne una propria.
   */
  readonly shape?: IslandShape;

  /** Se true, le colonne di chunk gia' presenti nella mappa non si rigenerano. */
  readonly skipExisting?: boolean;
}

export interface IslandResult {
  readonly map: TerrainMap;
  readonly shape: IslandShape;
  /** Region effettiva, allargata ai bordi di chunk. */
  readonly region: Region;
  /** Colonne di chunk effettivamente generate in questa chiamata. */
  readonly blocks: number;
  readonly columns: number;
  /** Colonne edificabili nell'intera mappa, non solo in questa chiamata. */
  readonly buildableColumns: number;
  readonly voxelsWritten: number;
  readonly generationMs: number;
}

/** Lato del reticolo paddato: le colonne del blocco piu' un anello per la pendenza. */
const PADDED = CHUNK + 2;

/**
 * Reticolo di altezze continue riusato fra un blocco e l'altro.
 *
 * L'anello di bordo evita di ricampionare il campo cinque volte per colonna: si
 * passa da 5120 valutazioni per blocco a 1156. Vive a livello di modulo perche'
 * ogni realm (main thread o worker) ha il suo ed e' a thread singolo.
 */
const paddedHeights = new Float32Array(PADDED * PADDED);

/**
 * Genera un'isola nella region indicata: scrive i voxel nel mondo e restituisce
 * la mappa per colonna.
 *
 * La region viene allargata ai bordi di chunk. Region distinte devono quindi
 * cadere su colonne di chunk distinte, altrimenti si sovrappongono e l'ordine
 * torna a contare.
 */
export function generateIsland(
  world: VoxelWorld,
  seed: number,
  region: Region,
  options: IslandOptions = {},
): IslandResult {
  const map = options.map ?? new TerrainMap();
  const shape = options.shape ?? map.shape ?? shapeFromRegion(region);
  const skipExisting = options.skipExisting ?? false;

  map.rememberShape(shape);

  const field = new HeightField(seed, shape);
  const span = chunkSpanOf(region);
  const started = performance.now();

  let blocks = 0;
  let voxels = 0;

  for (let ccy = span.minCcy; ccy <= span.maxCcy; ccy++) {
    for (let ccx = span.minCcx; ccx <= span.maxCcx; ccx++) {
      if (skipExisting && map.hasChunk(ccx, ccy)) continue;

      const block = generateColumnBlock(field, ccx, ccy);
      map.adopt(block);
      ensureBlockChunks(world, block);
      voxels += writeBlockColumns(world, block, 0, COLUMNS_PER_CHUNK);
      blocks++;
    }
  }

  return {
    map,
    shape,
    region: {
      minX: span.minCcx * CHUNK,
      minY: span.minCcy * CHUNK,
      sizeX: (span.maxCcx - span.minCcx + 1) * CHUNK,
      sizeY: (span.maxCcy - span.minCcy + 1) * CHUNK,
    },
    blocks,
    columns: blocks * COLUMNS_PER_CHUNK,
    buildableColumns: map.buildableCount,
    voxelsWritten: voxels,
    generationMs: performance.now() - started,
  };
}

/**
 * Estende l'isola su una region adiacente, con lo stesso seed.
 *
 * Due differenze rispetto a `generateIsland`: le colonne gia' presenti nella
 * mappa non vengono rigenerate, e la maschera di caduta e' quella con cui la
 * mappa e' nata. La seconda e' cio' che rende il confine continuo: il campo di
 * altezza resta la stessa funzione di prima, quindi le colonne appena oltre la
 * cucitura valgono esattamente quello che valevano guardandole dall'altro lato.
 *
 * Senza una mappa da cui ereditare la maschera (o senza `options.shape`) il
 * rettangolo nuovo si comporta come un'isola a se'.
 */
export function expandIsland(
  world: VoxelWorld,
  seed: number,
  newRegion: Region,
  options: IslandOptions = {},
): IslandResult {
  return generateIsland(world, seed, newRegion, {
    ...options,
    skipExisting: options.skipExisting ?? true,
  });
}

/**
 * Dati per colonna di una colonna di chunk. Funzione pura del campo: e' questa
 * che gira nel worker.
 */
export function generateColumnBlock(field: HeightField, ccx: number, ccy: number): ColumnBlock {
  const baseX = ccx * CHUNK;
  const baseY = ccy * CHUNK;

  for (let py = 0; py < PADDED; py++) {
    const worldY = baseY + py - 1;
    const row = py * PADDED;
    for (let px = 0; px < PADDED; px++) {
      paddedHeights[row + px] = field.heightAt(baseX + px - 1, worldY);
    }
  }

  const heights = new Int16Array(COLUMNS_PER_CHUNK);
  const biomes = new Uint8Array(COLUMNS_PER_CHUNK);
  const slopes = new Float32Array(COLUMNS_PER_CHUNK);
  const buildable = new Uint8Array(COLUMNS_PER_CHUNK);

  let maxHeight = 0;
  let buildableCount = 0;

  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const p = (ly + 1) * PADDED + (lx + 1);
      const continuous = paddedHeights[p];

      // Pendenza sul campo continuo, non sulle altezze intere: quantizzare prima
      // schiaccerebbe tutto su 0 e 1 e i biomi non avrebbero piu' nulla da cui
      // distinguersi. L'anello paddato ricampiona le stesse coordinate mondo dei
      // blocchi vicini, quindi il valore non dipende da quale blocco lo calcola.
      const slope = Math.max(
        Math.abs(paddedHeights[p + 1] - continuous),
        Math.abs(paddedHeights[p - 1] - continuous),
        Math.abs(paddedHeights[p + PADDED] - continuous),
        Math.abs(paddedHeights[p - PADDED] - continuous),
      );

      const height = clampHeight(Math.floor(continuous));
      const biome = classifyBiome(height, slope);

      const i = columnIndex(lx, ly);
      heights[i] = height;
      biomes[i] = biome;
      slopes[i] = slope;
      if (isBuildable(biome, slope)) {
        buildable[i] = 1;
        buildableCount++;
      }
      if (height > maxHeight) maxHeight = height;
    }
  }

  return { ccx, ccy, heights, biomes, slopes, buildable, maxHeight, buildableCount };
}

/**
 * Alloca i chunk che il blocco riempira' davvero.
 *
 * Solo fino alla quota utile: allocare l'intera colonna verticale creerebbe
 * chunk vuoti che il renderer poi si porta dietro per niente.
 */
export function ensureBlockChunks(world: VoxelWorld, block: ColumnBlock): void {
  const topZ = Math.max(block.maxHeight, TERRAIN.seaLevel) - 1;
  const maxCz = topZ >> CHUNK_SHIFT;
  for (let cz = 0; cz <= maxCz; cz++) world.ensureChunk(block.ccx, block.ccy, cz);
}

/**
 * Scrive nel mondo le colonne `[from, from + count)` del blocco e restituisce
 * quanti voxel ha scritto.
 *
 * La scrittura e' divisa per colonna proprio perche' il chiamante possa fermarsi
 * a meta' blocco quando esaurisce il budget del frame.
 */
export function writeBlockColumns(
  world: VoxelWorld,
  block: ColumnBlock,
  from: number,
  count: number,
): number {
  const end = Math.min(COLUMNS_PER_CHUNK, from + count);
  const baseX = block.ccx * CHUNK;
  const baseY = block.ccy * CHUNK;
  const deepWater = TERRAIN.seaLevel - TERRAIN.waterSurfaceDepth;
  let written = 0;

  for (let i = from; i < end; i++) {
    const x = baseX + columnLocalX(i);
    const y = baseY + columnLocalY(i);
    const top = block.heights[i];
    const biome = block.biomes[i];

    for (let z = 0; z < top; z++) {
      world.setBlock(x, y, z, paletteForDepth(biome, top - 1 - z));
      written++;
    }

    // L'acqua chiude ogni colonna che finisce sotto il livello del mare: e' cio'
    // che circonda l'isola invece di lasciare una fossa vuota.
    for (let z = top; z < TERRAIN.seaLevel; z++) {
      world.setBlock(x, y, z, z >= deepWater ? WATER_IDS.surface : WATER_IDS.deep);
      written++;
    }
  }

  return written;
}

function clampHeight(value: number): number {
  if (value < 0) return 0;
  if (value > TERRAIN.maxHeight) return TERRAIN.maxHeight;
  return value;
}
