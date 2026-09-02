import { CHUNK, CHUNK_SHIFT } from '../chunkCoords';
import type { VoxelWorld } from '../VoxelWorld';
import { isBuildable, STRATA_DEPTH } from './biomes';
import {
  buildCellGrid,
  CELL_STEPS,
  CELLS_PER_BLOCK,
  gridIndex,
  inGrid,
  type CellGrid,
} from './cellGrid';
import {
  columnIndex,
  columnLocalX,
  columnLocalY,
  COLUMNS_PER_CHUNK,
  DECOR_RECORD_SIZE,
  type ColumnBlock,
} from './columnBlock';
import { treeAt, treeOrigin, treeSpec, treeTopIn, writeTree } from './decor';
import { BIOME, BIOME_STRATA, TERRAIN, TREE_DECOR, WATER_IDS } from './config';
import { COVER, coverAt } from './groundcover';
import { HeightField } from './heightField';
import {
  ledgeAt,
  ledgeSpec,
  ledgeTop,
  ledgeTouches,
  LEDGE_RECORD_SIZE,
  writeLedge,
} from './ledges';
import { chunkSpanOf, shapeFromRegion, type IslandShape, type Region } from './region';
import { rockBandAt, rockSubsoil, rockSurface } from './rockTone';
import { isCliff } from './terrace';
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
 *
 * **Tre cose finiscono nel mondo, non una.** Le colonne — quote, strati, acqua e
 * copertura — piu' gli alberi e le sporgenze, che stanno *sopra* il terreno e
 * possono ricadere nel blocco pur nascendo appena fuori. Le tre hanno una fase
 * di scrittura ciascuna proprio perche' chi ha un budget di frame possa
 * fermarsi in mezzo a una qualunque.
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

/**
 * Estremi dello scostamento di un'origine d'albero dentro la sua cella decor.
 *
 * Servono a invertire il calcolo: da quali celle puo' arrivare un albero che
 * cade nel rettangolo di questo blocco. Devono seguire `treeJitter` in
 * `decor.ts` — sono lo stesso intervallo letto dal lato opposto.
 */
const JITTER_MIN = TREE_DECOR.ring;
const JITTER_MAX = TREE_DECOR.ring + TREE_DECOR.jitterSize - 1;

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
      voxels += writeBlockLedges(world, block, 0, block.ledges.length / LEDGE_RECORD_SIZE);
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
  const cells = buildCellGrid(field, baseX, baseY);

  const heights = new Int16Array(COLUMNS_PER_CHUNK);
  const biomes = new Uint8Array(COLUMNS_PER_CHUNK);
  const slopes = new Float32Array(COLUMNS_PER_CHUNK);
  const buildable = new Uint8Array(COLUMNS_PER_CHUNK);
  const water = new Uint8Array(COLUMNS_PER_CHUNK);
  const waterTop = new Int16Array(COLUMNS_PER_CHUNK);
  const cover = new Uint8Array(COLUMNS_PER_CHUNK);

  let maxHeight = 0;
  let buildableCount = 0;

  // Una passata per cella, non per colonna: quota, bioma, pendenza ed
  // edificabilita' si decidono una volta sola e poi si replicano sulle colonne
  // della cella. Replicare invece di accorciare gli array e' deliberato — cosi'
  // `ColumnBlock` resta indicizzato per colonna e nessun consumatore a valle
  // (edificabilita', `TerrainMap`, opere di terra, picking, overlay) sa che la
  // grana e' cambiata.
  for (let cy = 0; cy < CELLS_PER_BLOCK; cy++) {
    for (let cx = 0; cx < CELLS_PER_BLOCK; cx++) {
      const g = gridIndex(cx, cy);
      const height = cells.heights[g];
      const slope = cells.slopes[g];
      const level = cells.waterTop[g];
      const lx0 = cx * TERRAIN.cellSize;
      const ly0 = cy * TERRAIN.cellSize;

      // Sul **ciglio** di un gradone affiora la roccia. E' la sola differenza
      // fra la classificazione del reticolo e quella che finisce nella mappa, e
      // non e' cosmetica: la faccia verticale che si vede di taglio e' alta fino
      // a quattro cubi, e un prato tagliato di netto la farebbe leggere come un
      // errore invece che come una parete. Da qui segue anche che il ciglio non
      // si costruisce — la roccia non e' un bioma edificabile — che e' il verso
      // giusto: il muro sta sotto, e il lotto lo prende comunque a due colonne
      // di distanza pagando le sue opere.
      const biome = isCliff(cells.drops[g]) ? BIOME.rock : cells.biomes[g];
      const build = isBuildable(biome, slope);

      // La classe d'acqua si decide per cella come tutto il resto, e solo dove
      // la colonna e' sommersa: sonda il campo di quota, che e' funzione pura
      // del seed, quindi puo' guardare oltre il blocco senza cuciture al bordo.
      const waterClass =
        height < level
          ? classifyWater(
              baseX + lx0,
              baseY + ly0,
              level - height,
              (wx, wy) => field.heightAt(wx, wy),
              level,
            )
          : 0;

      for (let dy = 0; dy < TERRAIN.cellSize; dy++) {
        for (let dx = 0; dx < TERRAIN.cellSize; dx++) {
          const i = columnIndex(lx0 + dx, ly0 + dy);
          heights[i] = height;
          biomes[i] = biome;
          slopes[i] = slope;
          water[i] = waterClass;
          waterTop[i] = level;
          if (build) {
            buildable[i] = 1;
            buildableCount++;
          }
          // La copertura e' l'unica cosa che si decide per colonna e non per
          // cella: e' quello che le da' la scala giusta — un quarto della faccia
          // superiore di un cubo — e non costa un PRNG, solo un hash.
          if (height >= level) {
            cover[i] = coverAt(field.seed, baseX + lx0 + dx, baseY + ly0 + dy, biome);
            // Un ciuffo vale un voxel in piu' da allocare, ma solo dove c'e'
            // davvero: contarlo su ogni colonna emersa lascerebbe un chunk vuoto
            // ogni volta che la cima di un blocco cade su un confine di chunk.
            if (cover[i] !== 0 && height + 1 > maxHeight) maxHeight = height + 1;
          }
        }
      }

      if (height > maxHeight) maxHeight = height;
      // Un lago sta sopra il terreno che lo contiene: senza questo, il chunk in
      // cui galleggia la sua superficie potrebbe non essere allocato.
      if (level > maxHeight) maxHeight = level;
    }
  }

  const decor = collectDecor(field, cells, baseX, baseY);
  const ledges = collectLedges(field, cells, baseX, baseY);
  for (let i = 0; i < decor.length; i += DECOR_RECORD_SIZE) {
    const tree = treeSpec(decor[i], decor[i + 1], decor[i + 2], decor[i + 3]);
    // I record sono gia' in coordinate locali: il rettangolo del blocco parte
    // da zero, e l'altezza da allocare e' quella che l'albero tocca **qui**.
    maxHeight = Math.max(maxHeight, treeTopIn(tree, decor[i + 4], 0, 0, CHUNK, CHUNK));
  }
  for (let i = 0; i < ledges.length; i += LEDGE_RECORD_SIZE) {
    maxHeight = Math.max(maxHeight, ledgeTop(ledges[i + 3]));
  }

  return {
    ccx,
    ccy,
    heights,
    biomes,
    slopes,
    buildable,
    water,
    waterTop,
    cover,
    decor: new Int16Array(decor),
    ledges: new Int16Array(ledges),
    maxHeight,
    buildableCount,
  };
}

/**
 * Gli alberi che possono intersecare il blocco, in coordinate locali.
 *
 * L'anello di celle decorative da esaminare si ricava invertendo il jitter: da
 * quali celle puo' arrivare un'origine che cade nel rettangolo allargato di
 * `TREE_DECOR.ring`.
 */
function collectDecor(
  field: HeightField,
  cells: CellGrid,
  baseX: number,
  baseY: number,
): number[] {
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
      // in aria. La cella e' gia' nel reticolo — il margine di due celle copre
      // esattamente l'anello decorativo — quindi non si ricampiona niente.
      const cx = Math.floor((x - baseX) / TERRAIN.cellSize);
      const cy = Math.floor((y - baseY) / TERRAIN.cellSize);
      if (!inGrid(cx, cy)) continue;
      const g = gridIndex(cx, cy);

      // Il bioma e' quello del reticolo, non quello riscritto dal ciglio: la
      // flora si decide sul terreno che c'e' sotto la roccia che affiora, ed e'
      // anche l'unica lettura che ogni blocco puo' fare allo stesso modo — il
      // ciglio esiste solo dove il margine basta a calcolarlo.
      const tree = treeAt(field.seed, cellX, cellY, cells.heights[g], cells.biomes[g], cells.slopes[g]);
      if (tree === null) continue;

      // Un albero nato nell'anello puo' non arrivare a toccare il blocco: le
      // specie non sono tutte larghe uguali, e un cespuglio di raggio due a
      // quattro colonne dal bordo sta tutto di la'. Tenerne il record vorrebbe
      // dire allocare chunk per una chioma che questo blocco non scrive.
      // Il conto e' per livello e non sull'ingombro: il livello piu' largo non
      // e' quello piu' alto, e un albero che sfiora il blocco con la sola base
      // non ci porta dentro la propria punta.
      if (treeTopIn(tree, cells.heights[g], baseX, baseY, baseX + CHUNK, baseY + CHUNK) === 0) {
        continue;
      }

      decor.push(x - baseX, y - baseY, tree.species, tree.trunkHeight, cells.heights[g]);
    }
  }
  return decor;
}

/**
 * Le sporgenze che cadono nel blocco, in coordinate locali.
 *
 * Si guarda un anello di **una** cella oltre il blocco: una lastra e' larga una
 * cella e sporge dalla propria ancora, quindi piu' in la' di cosi' non puo'
 * arrivare. Ogni blocco poi scrive solo il proprio rettangolo, come per gli
 * alberi: la sporgenza a cavallo di una cucitura la disegnano in due, ciascuno
 * per la sua meta', e con lo stesso identico calcolo.
 */
function collectLedges(
  field: HeightField,
  cells: CellGrid,
  baseX: number,
  baseY: number,
): number[] {
  const ledges: number[] = [];
  const originCellX = baseX / TERRAIN.cellSize;
  const originCellY = baseY / TERRAIN.cellSize;

  for (let cy = -1; cy <= CELLS_PER_BLOCK; cy++) {
    for (let cx = -1; cx <= CELLS_PER_BLOCK; cx++) {
      const g = gridIndex(cx, cy);
      const drop = cells.drops[g];
      if (!isCliff(drop)) continue;

      const dir = cells.dropDirs[g];
      const [dx, dy] = CELL_STEPS[dir];
      const below = gridIndex(cx + dx, cy + dy);
      // Sotto la lastra ci va aria, e l'aria comincia sopra cio' che c'e': il
      // terreno, oppure il pelo dell'acqua se e' piu' alto.
      const floorZ = Math.max(cells.heights[below], cells.waterTop[below]);
      const spec = ledgeAt(
        field.seed,
        originCellX + cx,
        originCellY + cy,
        cells.heights[g],
        floorZ,
        dir,
      );
      if (spec === null) continue;
      // Una lastra ancorata al margine puo' cadere tutta di la' dalla cucitura:
      // il record sarebbe solo una quota in piu' da allocare per niente.
      if (!ledgeTouches(spec, baseX, baseY, baseX + CHUNK, baseY + CHUNK)) continue;

      ledges.push(spec.x - baseX, spec.y - baseY, spec.dir, spec.baseZ);
    }
  }
  return ledges;
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
    const biome = block.biomes[i];
    const strata = BIOME_STRATA[biome];

    // La roccia e' l'unico bioma che non ha una tinta sola: le sue pareti si
    // guardano di taglio, e un grigio solo alto quattro cubi e' una campitura.
    // Lo strato esce dalla quota — nessun dato in piu' nel blocco.
    const band = biome === BIOME.rock ? rockBandAt(top) : 0;
    const surface = biome === BIOME.rock ? rockSurface(band) : strata.surface;
    const subsoil = biome === BIOME.rock ? rockSubsoil(band) : strata.subsoil;

    // Una colonna e' tre corse di terreno piu' due d'acqua, non trenta voxel
    // indipendenti: gli strati sono contigui per costruzione, quindi tagliarli
    // ai due confini di `STRATA_DEPTH` scrive lo stesso mondo di
    // `paletteForDepth` cella per cella, al prezzo di cinque scritture.
    const surfaceZ = Math.max(0, top - STRATA_DEPTH.surface);
    const subsoilZ = Math.max(0, top - STRATA_DEPTH.subsoil);
    written += world.fillColumn(x, y, 0, subsoilZ, strata.deep);
    written += world.fillColumn(x, y, subsoilZ, surfaceZ, subsoil);
    written += world.fillColumn(x, y, surfaceZ, top, surface);

    // L'acqua chiude ogni colonna che finisce sotto il proprio specchio: e' cio'
    // che circonda l'isola invece di lasciare una fossa vuota, ed e' anche cio'
    // che riempie un lago — la quota arriva per colonna, quindi qui non c'e'
    // nessun caso in piu' da distinguere.
    //
    // La classe viaggia nei bit di superficie del tratto di superficie — l'unico
    // che il mesher arrivi mai a emettere. Sotto non serve: quelle facce non
    // esistono, perche' fra due voxel entrambi pieni non nasce un quad.
    const level = block.waterTop[i];
    if (top < level) {
      const deepTop = Math.max(top, level - TERRAIN.waterSurfaceDepth);
      const waterClass = block.water[i] as SurfaceKind;
      written += world.fillColumn(x, y, top, deepTop, WATER_IDS.deep);
      written += world.fillColumn(x, y, deepTop, level, WATER_IDS.surface, waterClass);
      continue;
    }

    // Il ciuffo d'erba sta **sopra** la colonna, come un albero: una cella sola,
    // e solo dove la colonna emerge. Non porta una tinta perche' non e' un cubo:
    // il mesher toglie il marcatore dal volume e ci disegna lame, steli e sassi
    // in prismi da 1/16, prendendo il tono dal terreno che ha gia' sotto.
    const cover = block.cover[i];
    if (cover !== COVER.none) {
      world.setCoverMark(x, y, top, cover);
      written++;
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

/** Scrive le sporgenze `[from, from + count)`, sempre dentro il rettangolo del blocco. */
export function writeBlockLedges(
  world: VoxelWorld,
  block: ColumnBlock,
  from: number,
  count: number,
): number {
  const total = block.ledges.length / LEDGE_RECORD_SIZE;
  const end = Math.min(total, from + count);
  const baseX = block.ccx * CHUNK;
  const baseY = block.ccy * CHUNK;
  let written = 0;

  for (let index = from; index < end; index++) {
    const offset = index * LEDGE_RECORD_SIZE;
    written += writeLedge(
      world,
      ledgeSpec(
        baseX + block.ledges[offset],
        baseY + block.ledges[offset + 1],
        block.ledges[offset + 2],
        block.ledges[offset + 3],
      ),
      baseX,
      baseY,
      baseX + CHUNK,
      baseY + CHUNK,
    );
  }
  return written;
}
