import { CHUNK, CHUNK_SHIFT } from '../chunkCoords';
import type { VoxelWorld } from '../VoxelWorld';
import { classifyBiome, isBuildable, STRATA_DEPTH, WATER_SURFACE_Z } from './biomes';
import {
  columnIndex,
  columnLocalX,
  columnLocalY,
  COLUMNS_PER_CHUNK,
  DECOR_RECORD_SIZE,
  type ColumnBlock,
} from './columnBlock';
import { treeAt, treeOrigin, treeSpec, treeTop, writeTree } from './decor';
import { BIOME_STRATA, TERRAIN, TREE_DECOR, WATER_IDS } from './config';
import { HeightField } from './heightField';
import { chunkSpanOf, shapeFromRegion, type IslandShape, type Region } from './region';
import { TerrainMap } from './TerrainMap';
import { classifyWater } from './waterClass';
import type { SurfaceKind } from '../visualBlock';

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

/** L'anello decor richiede una colonna in piu' per calcolare la sua pendenza. */
const HEIGHT_BORDER = TREE_DECOR.ring + 1;

/**
 * Estremi dello scostamento di un'origine d'albero dentro la sua cella decor.
 *
 * Servono a invertire il calcolo: da quali celle puo' arrivare un albero che
 * cade nel rettangolo di questo blocco. Devono seguire `treeJitter` in
 * `decor.ts` — sono lo stesso intervallo letto dal lato opposto.
 */
const JITTER_MIN = TREE_DECOR.ring;
const JITTER_MAX = TREE_DECOR.ring + TREE_DECOR.jitterSize - 1;
/** Lato del reticolo: blocco piu' anello decorativo e anello per la pendenza. */
const PADDED = CHUNK + HEIGHT_BORDER * 2;

/**
 * Reticolo di altezze continue riusato fra un blocco e l'altro.
 *
 * L'anello di bordo evita di ricampionare il campo cinque volte per colonna. Vive a livello di modulo perche'
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
      voxels += writeBlockDecor(world, block, 0, block.decor.length / DECOR_RECORD_SIZE);
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
      const worldY = baseY + py - HEIGHT_BORDER;
    const row = py * PADDED;
    for (let px = 0; px < PADDED; px++) {
      paddedHeights[row + px] = field.heightAt(baseX + px - HEIGHT_BORDER, worldY);
    }
  }

  const heights = new Int16Array(COLUMNS_PER_CHUNK);
  const biomes = new Uint8Array(COLUMNS_PER_CHUNK);
  const slopes = new Float32Array(COLUMNS_PER_CHUNK);
  const buildable = new Uint8Array(COLUMNS_PER_CHUNK);
  const water = new Uint8Array(COLUMNS_PER_CHUNK);

  let maxHeight = 0;
  let buildableCount = 0;

  // Una passata per cella, non per colonna: quota, bioma, pendenza ed
  // edificabilita' si decidono una volta sola e poi si replicano sulle colonne
  // della cella. Replicare invece di accorciare gli array e' deliberato — cosi'
  // `ColumnBlock` resta indicizzato per colonna e nessun consumatore a valle
  // (edificabilita', `TerrainMap`, opere di terra, picking, overlay) sa che la
  // grana e' cambiata.
  const cells = CHUNK / TERRAIN.cellSize;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const lx0 = cx * TERRAIN.cellSize;
      const ly0 = cy * TERRAIN.cellSize;
      const cell = sampleCell(lx0 + HEIGHT_BORDER, ly0 + HEIGHT_BORDER);
      const build = isBuildable(cell.biome, cell.slope);

      // La classe d'acqua si decide per cella come tutto il resto, e solo dove
      // la colonna e' sommersa: sonda il campo di quota, che e' funzione pura
      // del seed, quindi puo' guardare oltre il blocco senza cuciture al bordo.
      const waterClass =
        cell.height < TERRAIN.seaLevel
          ? classifyWater(
              baseX + lx0,
              baseY + ly0,
              TERRAIN.seaLevel - cell.height,
              (wx, wy) => field.heightAt(wx, wy),
            )
          : 0;

      for (let dy = 0; dy < TERRAIN.cellSize; dy++) {
        for (let dx = 0; dx < TERRAIN.cellSize; dx++) {
          const i = columnIndex(lx0 + dx, ly0 + dy);
          heights[i] = cell.height;
          biomes[i] = cell.biome;
          slopes[i] = cell.slope;
          water[i] = waterClass;
          if (build) {
            buildable[i] = 1;
            buildableCount++;
          }
        }
      }
      if (cell.height > maxHeight) maxHeight = cell.height;
    }
  }

  const decor: number[] = [];
  const minX = baseX - TREE_DECOR.ring;
  const minY = baseY - TREE_DECOR.ring;
  const maxX = baseX + CHUNK - 1 + TREE_DECOR.ring;
  const maxY = baseY + CHUNK - 1 + TREE_DECOR.ring;
  const minCellX = Math.floor((minX - JITTER_MAX) / TREE_DECOR.cellSize);
  const maxCellX = Math.floor((maxX - JITTER_MIN) / TREE_DECOR.cellSize);
  const minCellY = Math.floor((minY - JITTER_MAX) / TREE_DECOR.cellSize);
  const maxCellY = Math.floor((maxY - JITTER_MIN) / TREE_DECOR.cellSize);

  for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      const [x, y] = treeOrigin(field.seed, cellX, cellY);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      // L'albero poggia sulla cella di terreno che lo ospita, non sul campo
      // continuo sotto il tronco: se ricampionasse per conto suo si troverebbe
      // mezzo voxel sopra o sotto il cubo su cui sta, e le radici resterebbero
      // in aria. L'origine e' allineata alla cella, quindi il cubo e' uno solo.
      const cell = sampleCell(
        floorToCell(x) - baseX + HEIGHT_BORDER,
        floorToCell(y) - baseY + HEIGHT_BORDER,
      );
      const tree = treeAt(field.seed, cellX, cellY, cell.height, cell.biome, cell.slope);
      if (tree === null) continue;

      decor.push(x - baseX, y - baseY, tree.species, tree.trunkHeight, cell.height);
      maxHeight = Math.max(maxHeight, treeTop(tree, cell.height));
    }
  }

  return {
    ccx,
    ccy,
    heights,
    biomes,
    slopes,
    buildable,
    water,
    decor: new Int16Array(decor),
    maxHeight,
    buildableCount,
  };
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
  let written = 0;

  for (let i = from; i < end; i++) {
    const x = baseX + columnLocalX(i);
    const y = baseY + columnLocalY(i);
    const top = block.heights[i];
    const strata = BIOME_STRATA[block.biomes[i]];

    // Una colonna e' tre corse di terreno piu' due d'acqua, non trenta voxel
    // indipendenti: gli strati sono contigui per costruzione, quindi tagliarli
    // ai due confini di `STRATA_DEPTH` scrive lo stesso mondo di
    // `paletteForDepth` cella per cella, al prezzo di cinque scritture.
    const surfaceZ = Math.max(0, top - STRATA_DEPTH.surface);
    const subsoilZ = Math.max(0, top - STRATA_DEPTH.subsoil);
    written += world.fillColumn(x, y, 0, subsoilZ, strata.deep);
    written += world.fillColumn(x, y, subsoilZ, surfaceZ, strata.subsoil);
    written += world.fillColumn(x, y, surfaceZ, top, strata.surface);

    // L'acqua chiude ogni colonna che finisce sotto il livello del mare: e' cio'
    // che circonda l'isola invece di lasciare una fossa vuota.
    //
    // La classe viaggia nei bit di superficie del tratto di superficie — l'unico
    // che il mesher arrivi mai a emettere. Sotto non serve: quelle facce non
    // esistono, perche' fra due voxel entrambi pieni non nasce un quad.
    if (top < TERRAIN.seaLevel) {
      const deepTop = Math.max(top, WATER_SURFACE_Z);
      const waterClass = block.water[i] as SurfaceKind;
      written += world.fillColumn(x, y, top, deepTop, WATER_IDS.deep);
      written += world.fillColumn(x, y, deepTop, TERRAIN.seaLevel, WATER_IDS.surface, waterClass);
    }
  }

  return written;
}

/** Scrive gli alberi `[from, from + count)` del blocco, sempre dentro il suo rettangolo. */
export function writeBlockDecor(world: VoxelWorld, block: ColumnBlock, from: number, count: number): number {
  const total = block.decor.length / DECOR_RECORD_SIZE;
  const end = Math.min(total, from + count);
  const baseX = block.ccx * CHUNK;
  const baseY = block.ccy * CHUNK;
  let written = 0;

  for (let index = from; index < end; index++) {
    const offset = index * DECOR_RECORD_SIZE;
    const x = baseX + block.decor[offset];
    const y = baseY + block.decor[offset + 1];
    const species = block.decor[offset + 2];
    const trunkHeight = block.decor[offset + 3];
    const groundZ = block.decor[offset + 4];
    written += writeTree(
      world,
      treeSpec(x, y, species, trunkHeight),
      groundZ,
      baseX,
      baseY,
      baseX + CHUNK,
      baseY + CHUNK,
    );
  }
  return written;
}

function clampHeight(value: number): number {
  if (value < 0) return 0;
  if (value > TERRAIN.maxHeight) return TERRAIN.maxHeight;
  return value;
}

/** Coordinata di partenza della cella di terreno che contiene `v`. */
function floorToCell(v: number): number {
  return Math.floor(v / TERRAIN.cellSize) * TERRAIN.cellSize;
}

/** Quota, bioma e pendenza di una cella di terreno. */
interface CellSample {
  readonly height: number;
  readonly biome: number;
  readonly slope: number;
}

/**
 * Riassume una cella di terreno a partire dal suo angolo nel reticolo paddato.
 *
 * **Media e non campione d'angolo.** Prendere il valore di una sola colonna
 * ancorerebbe la cella a uno spigolo, e la quantizzazione trasformerebbe quel
 * mezzo voxel di scarto in un gradino intero: la media dei campioni della cella
 * centra il valore e toglie l'aliasing dal profilo della costa.
 *
 * **Pendenza media e non massima.** E' la stessa grandezza di prima — voxel di
 * dislivello per voxel — quindi tutte le soglie di `TERRAIN` valgono immutate.
 * Il massimo sui quattro angoli sarebbe stato un'altra grandezza: avrebbe
 * dichiarato ripida ogni cella che ne sfiora una, e mangiato l'edificabile.
 *
 * **Quantizzazione col pavimento.** Una cella non puo' stare a mezza quota: la
 * quota scende al multiplo di `cellSize` sotto di se', cosi' il cubo appoggia
 * sul terreno invece di sporgerne.
 */
function sampleCell(px: number, py: number): CellSample {
  let heightSum = 0;
  let slopeSum = 0;

  for (let dy = 0; dy < TERRAIN.cellSize; dy++) {
    for (let dx = 0; dx < TERRAIN.cellSize; dx++) {
      const p = (py + dy) * PADDED + (px + dx);
      const continuous = paddedHeights[p];
      heightSum += continuous;

      // Pendenza sul campo continuo, non sulle altezze quantizzate: quantizzare
      // prima schiaccerebbe tutto su 0 e 1 e i biomi non avrebbero piu' nulla da
      // cui distinguersi. L'anello paddato ricampiona le stesse coordinate mondo
      // dei blocchi vicini, quindi il valore non dipende da quale blocco lo
      // calcola.
      slopeSum += Math.max(
        Math.abs(paddedHeights[p + 1] - continuous),
        Math.abs(paddedHeights[p - 1] - continuous),
        Math.abs(paddedHeights[p + PADDED] - continuous),
        Math.abs(paddedHeights[p - PADDED] - continuous),
      );
    }
  }

  const columns = TERRAIN.cellSize * TERRAIN.cellSize;
  const height = clampHeight(floorToCell(heightSum / columns));
  const slope = slopeSum / columns;
  return { height, biome: classifyBiome(height, slope), slope };
}
