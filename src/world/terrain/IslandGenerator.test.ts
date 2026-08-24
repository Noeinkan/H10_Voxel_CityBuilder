import { describe, expect, it } from 'vitest';
import { CHUNK } from '../chunkCoords';
import { VoxelWorld } from '../VoxelWorld';
import { paletteForDepth } from './biomes';
import { columnIndex, COLUMNS_PER_CHUNK } from './columnBlock';
import { BIOME, TERRACE, TERRAIN, WATER_IDS } from './config';
import { HeightField } from './heightField';
import { expandIsland, generateColumnBlock, generateIsland, type Region } from './IslandGenerator';
import { shapeFromRegion } from './region';
import type { TerrainMap } from './TerrainMap';

const SEED = 1337;
// Lato 512: e' la dimensione su cui e' tarata la calibrazione verticale di
// `TERRAIN`. Sotto, il tetto di `maxReliefSlope` abbassa il rilievo e le
// soglie assolute — `rockMinHeight` in testa — smettono di essere
// raggiungibili, cioe' il test misurerebbe l'isola sbagliata.
const ISLAND: Region = { minX: 0, minY: 0, sizeX: 512, sizeY: 512 };

/** I byte grezzi di una vista tipizzata, per i confronti "identici byte per byte". */
function bytesOf(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}

/**
 * Uguaglianza byte per byte fuori dal deep-equal di vitest.
 *
 * `toEqual` su un Uint8Array percorre ogni elemento con la macchina del
 * confronto profondo, e su un'isola 256x256 sono qualche centinaio di migliaia
 * di byte: costava piu' della generazione che sta verificando, al punto da
 * portare il file oltre il timeout quando la macchina e' occupata. Il ciclo
 * secco decide, e `toEqual` interviene solo sull'array che differisce davvero —
 * l'unico caso in cui il suo diff serve a qualcosa.
 */
function expectSameSignature(actual: Record<string, Uint8Array[]>, expected: Record<string, Uint8Array[]>): void {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const key of Object.keys(expected)) expectSameLayers(actual[key], expected[key], key);
}

function expectSameLayers(actual: Uint8Array[], expected: Uint8Array[], key: string): void {
  expect(actual?.length).toBe(expected.length);
  for (let layer = 0; layer < expected.length; layer++) {
    if (sameBytes(actual[layer], expected[layer])) continue;
    // Il contesto nel valore atteso: il messaggio dice quale chunk e quale
    // layer, che con sedici byte di diff non si capirebbe.
    expect({ key, layer, bytes: actual[layer] }).toEqual({ key, layer, bytes: expected[layer] });
  }
}

function sameBytes(actual: Uint8Array, expected: Uint8Array): boolean {
  if (actual === undefined || actual.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

/** Firma della mappa: i quattro array di ogni colonna di chunk, in ordine di chiave. */
function mapSignature(map: TerrainMap): Record<string, Uint8Array[]> {
  const out: Record<string, Uint8Array[]> = {};
  for (const key of Array.from(map.chunks.keys()).sort()) {
    const chunk = map.chunks.get(key);
    if (chunk === undefined) continue;
    out[key] = [
      bytesOf(chunk.heights),
      bytesOf(chunk.biomes),
      bytesOf(chunk.slopes),
      bytesOf(chunk.buildable),
    ];
  }
  return out;
}

/**
 * Firma del mondo: FNV-1a del layer `blocks` di ogni chunk allocato.
 *
 * Sui voxel si confronta l'impronta e non i byte: un'isola 256x256 alloca
 * qualche centinaio di chunk da 32 KB, e il confronto profondo di quegli array
 * costa piu' della generazione stessa. Il confronto byte per byte richiesto sta
 * su `mapSignature`, che e' la struttura di cui parla il criterio.
 */
function worldSignature(world: VoxelWorld): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Array.from(world.chunks.keys()).sort()) {
    const chunk = world.chunks.get(key);
    if (chunk === undefined) continue;
    let hash = 0x811c9dc5;
    for (let i = 0; i < chunk.blocks.length; i++) {
      hash = Math.imul(hash ^ chunk.blocks[i], 0x01000193);
    }
    out[key] = hash >>> 0;
  }
  return out;
}

/** Percorre tutte le colonne generate della mappa. */
function forEachColumn(
  map: TerrainMap,
  visit: (x: number, y: number, height: number, biome: number, slope: number, buildable: boolean) => void,
): void {
  for (const chunk of map.chunks.values()) {
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = columnIndex(lx, ly);
        visit(
          chunk.ccx * CHUNK + lx,
          chunk.ccy * CHUNK + ly,
          chunk.heights[i],
          chunk.biomes[i],
          chunk.slopes[i],
          chunk.buildable[i] === 1,
        );
      }
    }
  }
}

/**
 * L'isola di riferimento, generata una volta sola per tutto il file.
 *
 * Quasi tutti i test qui sotto leggono la stessa isola 512x512 senza toccarla, e
 * rigenerarla per ognuno costava una dozzina di generazioni intere — di gran
 * lunga la voce piu' cara del file. Il terreno dipende solo da
 * `(seed, shape, ccx, ccy)`, quindi condividerla non cambia cosa si verifica: che
 * due generazioni con lo stesso seed coincidano byte per byte e' proprio cio' che
 * prova il primo test. Chi scrive nel mondo, espande la mappa o affianca una
 * seconda isola continua a generarsi la propria.
 */
let sharedIsland: { world: VoxelWorld; map: TerrainMap } | undefined;

function referenceIsland(): { world: VoxelWorld; map: TerrainMap } {
  if (sharedIsland === undefined) {
    const world = new VoxelWorld();
    sharedIsland = { world, map: generateIsland(world, SEED, ISLAND).map };
  }
  return sharedIsland;
}

/**
 * Prima violazione incontrata, o `null` se non ce n'e'. Come `expectSameLayers`,
 * esiste perche' su questi cicli l'assertion costa piu' di cio' che verifica: un
 * `expect` per colonna su un'isola 512x512 sono centinaia di migliaia di
 * chiamate, e il ciclo secco con una sola assertion in coda dice la stessa cosa.
 */
function scanColumns(scan: () => string | null): void {
  expect(scan()).toBeNull();
}

describe('generateIsland — determinismo', () => {
  it('due chiamate con lo stesso seed danno mappa e mondo identici byte per byte', () => {
    const worldA = new VoxelWorld();
    const worldB = new VoxelWorld();
    const first = generateIsland(worldA, SEED, ISLAND);
    const second = generateIsland(worldB, SEED, ISLAND);

    expectSameSignature(mapSignature(second.map), mapSignature(first.map));
    expect(worldSignature(worldB)).toEqual(worldSignature(worldA));
    expect(second.buildableColumns).toBe(first.buildableColumns);
    expect(second.voxelsWritten).toBe(first.voxelsWritten);
  });

  it('generare A poi B equivale a generare B poi A', () => {
    const a: Region = { minX: 0, minY: 0, sizeX: 256, sizeY: 256 };
    const b: Region = { minX: 256, minY: 0, sizeX: 256, sizeY: 256 };

    const worldAB = new VoxelWorld();
    const ab = generateIsland(worldAB, SEED, a);
    generateIsland(worldAB, SEED, b, { map: ab.map });

    const worldBA = new VoxelWorld();
    const ba = generateIsland(worldBA, SEED, b);
    generateIsland(worldBA, SEED, a, { map: ba.map });

    // Le due mappe nascono da maschere diverse (ognuna eredita quella della
    // prima region generata), quindi si confrontano a parita' di maschera.
    const worldAB2 = new VoxelWorld();
    const shape = shapeFromRegion(ISLAND);
    const ab2 = generateIsland(worldAB2, SEED, a, { shape });
    generateIsland(worldAB2, SEED, b, { map: ab2.map, shape });

    const worldBA2 = new VoxelWorld();
    const ba2 = generateIsland(worldBA2, SEED, b, { shape });
    generateIsland(worldBA2, SEED, a, { map: ba2.map, shape });

    expectSameSignature(mapSignature(ba2.map), mapSignature(ab2.map));
    expect(worldSignature(worldBA2)).toEqual(worldSignature(worldAB2));
    expect(ba.map.chunkCount).toBe(ab.map.chunkCount);
  });

  it('generare per blocchi sparsi da’ le stesse colonne di una region intera', () => {
    // Un angolo d'isola: 16 colonne di chunk bastano a mostrare che l'ordine non
    // conta. L'indipendenza dall'ordine e' una proprieta' della funzione, non
    // della taglia, quindi qui non serve l'isola intera — e a 512 costerebbe
    // sedici volte tanto per dire la stessa cosa.
    const quarter: Region = { minX: 0, minY: 0, sizeX: 128, sizeY: 128 };
    const wholeWorld = new VoxelWorld();
    const shape = shapeFromRegion(ISLAND);
    const whole = generateIsland(wholeWorld, SEED, quarter, { shape });

    // Stessa maschera, ma una colonna di chunk alla volta e in ordine invertito.
    const piecemeal = new VoxelWorld();
    let map: TerrainMap | undefined;
    for (let ccy = 3; ccy >= 0; ccy--) {
      for (let ccx = 3; ccx >= 0; ccx--) {
        map = generateIsland(
          piecemeal,
          SEED,
          { minX: ccx * CHUNK, minY: ccy * CHUNK, sizeX: CHUNK, sizeY: CHUNK },
          { map, shape },
        ).map;
      }
    }

    expect(map).toBeDefined();
    if (map === undefined) return;
    expectSameSignature(mapSignature(map), mapSignature(whole.map));
    expect(worldSignature(piecemeal)).toEqual(worldSignature(wholeWorld));
  });
});

describe('generateIsland — continuita’ al confine', () => {
  /**
   * Le due meta' dell'isola generate separatamente, con la maschera dell'isola
   * intera: la cucitura cade in mezzo al rilievo, dove un gradino si vedrebbe.
   */
  it('fra due region adiacenti il dislivello di colonne contigue resta un’alzata', () => {
    const shape = shapeFromRegion(ISLAND);
    const world = new VoxelWorld();

    const left = generateIsland(world, SEED, { minX: 0, minY: 0, sizeX: 256, sizeY: 512 }, { shape });
    const right = generateIsland(
      world,
      SEED,
      { minX: 256, minY: 0, sizeX: 256, sizeY: 512 },
      { map: left.map, shape },
    );
    const map = right.map;

    let worst = 0;
    for (let y = 0; y < 512; y++) {
      const delta = Math.abs(map.heightAt(256, y) - map.heightAt(255, y));
      if (delta > worst) worst = delta;
    }
    // L'invariante e' in celle e in **alzate**, non in cubi: due celle contigue
    // cadono su pedate contigue della stessa scala, quindi il loro dislivello e'
    // al piu' un'alzata. Dentro una cella resta zero per costruzione.
    expect(worst).toBeLessThanOrEqual(TERRACE.maxStep);
  });

  it('la cucitura non e’ un caso particolare: vale per tutte le colonne dell’isola', () => {
    const { map } = referenceIsland();

    let worst = 0;
    // La pianura non si terrazza, e questo e' cio' che lo verifica sul mondo
    // vero invece che sulla scala: sotto la soglia il gradino resta il cubo di
    // sempre, ed e' la sola ragione per cui la citta' non e' cambiata.
    let worstBelowTerrace = 0;
    for (let y = 1; y < 511; y++) {
      for (let x = 1; x < 511; x++) {
        const h = map.heightAt(x, y);
        const neighbours = [map.heightAt(x + 1, y), map.heightAt(x, y + 1)];
        for (const n of neighbours) {
          const delta = Math.abs(n - h);
          if (delta > worst) worst = delta;
          if (Math.max(h, n) < TERRACE.fromHeight && delta > worstBelowTerrace) {
            worstBelowTerrace = delta;
          }
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(TERRACE.maxStep);
    expect(worstBelowTerrace).toBeLessThanOrEqual(TERRAIN.cellSize);
  });

  it('la montagna si spezza davvero: in quota compaiono i cigli', () => {
    // E' il criterio della 4.x, e senza di lui il terrazzamento sarebbe un
    // meccanismo che funziona su un'isola che non lo usa mai: le alzate alte
    // esistono solo dove il rilievo ci arriva.
    const { map } = referenceIsland();

    let cliffs = 0;
    let tallest = 0;
    for (let y = 1; y < 511; y++) {
      for (let x = 1; x < 511; x++) {
        const h = map.heightAt(x, y);
        const delta = Math.max(
          Math.abs(map.heightAt(x + 1, y) - h),
          Math.abs(map.heightAt(x, y + 1) - h),
        );
        if (delta > TERRAIN.cellSize) cliffs++;
        if (delta > tallest) tallest = delta;
      }
    }

    expect(cliffs).toBeGreaterThan(500);
    expect(tallest).toBeGreaterThan(TERRAIN.cellSize * 2);
  });

  it('sul ciglio affiora la roccia, e nessuno ci costruisce', () => {
    const { map } = referenceIsland();

    scanColumns(() => {
      for (let y = 1; y < 511; y++) {
        for (let x = 1; x < 511; x++) {
          const h = map.heightAt(x, y);
          const drop = Math.max(
            h - map.heightAt(x + 1, y),
            h - map.heightAt(x - 1, y),
            h - map.heightAt(x, y + 1),
            h - map.heightAt(x, y - 1),
          );
          if (drop <= TERRAIN.cellSize) continue;
          if (map.biomeAt(x, y) !== BIOME.rock) return `(${x}, ${y}) ciglio senza roccia`;
          if (map.isBuildable(x, y)) return `(${x}, ${y}) ciglio edificabile`;
        }
      }
      return null;
    });
  });

  it('ogni quota e’ un multiplo della cella: il terreno non sta mai a mezzo cubo', () => {
    const { map } = referenceIsland();

    scanColumns(() => {
      for (let y = 0; y < 512; y += 3) {
        for (let x = 0; x < 512; x += 3) {
          const height = map.heightAt(x, y);
          if (height % TERRAIN.cellSize !== 0) return `(${x}, ${y}) a quota ${height}`;
        }
      }
      return null;
    });
  });

  it('una cella e’ piatta: le sue colonne condividono quota, bioma e pendenza', () => {
    const { map } = referenceIsland();

    for (let y = 0; y < 512; y += TERRAIN.cellSize * 5) {
      for (let x = 0; x < 512; x += TERRAIN.cellSize * 5) {
        const x0 = x - (x % TERRAIN.cellSize);
        const y0 = y - (y % TERRAIN.cellSize);
        const reference = map.columnAt(x0, y0);
        expect(reference).not.toBeNull();

        // Il deep-equal si paga solo sulla colonna che differisce davvero: e'
        // l'unico caso in cui il suo diff dice qualcosa.
        for (let dy = 0; dy < TERRAIN.cellSize; dy++) {
          for (let dx = 0; dx < TERRAIN.cellSize; dx++) {
            const here = map.columnAt(x0 + dx, y0 + dy);
            if (
              here?.height !== reference?.height
              || here?.biome !== reference?.biome
              || here?.slope !== reference?.slope
              || here?.buildable !== reference?.buildable
            ) {
              expect(here).toEqual(reference);
            }
          }
        }
      }
    }
  });

  it('anche due isole affiancate senza maschera condivisa si toccano al livello del fondale', () => {
    const world = new VoxelWorld();
    const a = generateIsland(world, SEED, ISLAND);
    const b = generateIsland(world, SEED, { minX: 512, minY: 0, sizeX: 512, sizeY: 512 }, { map: a.map });

    scanColumns(() => {
      for (let y = 0; y < 512; y++) {
        const delta = Math.abs(b.map.heightAt(512, y) - b.map.heightAt(511, y));
        if (delta > TERRAIN.cellSize) return `dislivello ${delta} alla riga ${y}`;
      }
      return null;
    });
  });
});

describe('expandIsland', () => {
  it('non rigenera le colonne esistenti e continua la stessa costa', () => {
    const world = new VoxelWorld();
    const base = generateIsland(world, SEED, ISLAND);
    const before = mapSignature(base.map);
    const chunksBefore = base.map.chunkCount;

    const strip: Region = { minX: 0, minY: 512, sizeX: 512, sizeY: CHUNK * 2 };
    const grown = expandIsland(world, SEED, strip, { map: base.map });

    // Solo la striscia nuova: 16 colonne di chunk x 2 file.
    expect(grown.blocks).toBe(32);
    expect(grown.map.chunkCount).toBe(chunksBefore + 32);

    // Le colonne di prima sono rimaste esattamente quelle di prima.
    const after = mapSignature(grown.map);
    for (const key of Object.keys(before)) expectSameLayers(after[key], before[key], key);

    // E la maschera ereditata rende continuo anche il confine nuovo.
    scanColumns(() => {
      for (let x = 0; x < 512; x++) {
        const delta = Math.abs(grown.map.heightAt(x, 512) - grown.map.heightAt(x, 511));
        if (delta > TERRAIN.cellSize) return `dislivello ${delta} alla colonna ${x}`;
      }
      return null;
    });
  });

  it('una seconda chiamata sulla stessa region non scrive nulla', () => {
    const world = new VoxelWorld();
    const base = generateIsland(world, SEED, ISLAND);
    const again = expandIsland(world, SEED, ISLAND, { map: base.map });

    expect(again.blocks).toBe(0);
    expect(again.voxelsWritten).toBe(0);
  });
});

describe('generateIsland — colonne e biomi', () => {
  it('nessuna colonna edificabile sta sotto il livello del mare', () => {
    // Un'isola intera piu' due piu' piccole su altri seed: la proprieta' e'
    // dell'intera fascia edificabile, non del seed di riferimento. Le due
    // piccole restano a 256 perche' generare tre isole da 512 e' quasi tutto
    // tempo di scrittura voxel, che qui non si sta misurando.
    const regions: [number, Region][] = [
      [SEED, ISLAND],
      [7, { minX: 0, minY: 0, sizeX: 256, sizeY: 256 }],
      [99991, { minX: 0, minY: 0, sizeX: 256, sizeY: 256 }],
    ];

    const buildableBiomes: number[] = [BIOME.plain, BIOME.forest, BIOME.hill];
    for (const [seed, region] of regions) {
      const map = region === ISLAND
        ? referenceIsland().map
        : generateIsland(new VoxelWorld(), seed, region).map;
      let buildable = 0;
      scanColumns(() => {
        let bad: string | null = null;
        forEachColumn(map, (x, y, height, biome, slope, isBuildable) => {
          if (!isBuildable || bad !== null) return;
          buildable++;
          if (height < TERRAIN.seaLevel) bad = `(${x}, ${y}) edificabile sotto il mare`;
          else if (slope >= TERRAIN.buildableMaxSlope) bad = `(${x}, ${y}) pendenza ${slope}`;
          else if (!buildableBiomes.includes(biome)) bad = `(${x}, ${y}) bioma ${biome}`;
        });
        return bad;
      });
      expect(buildable).toBeGreaterThan(500);
    }
  });

  it('tutti e sei i biomi compaiono, con la spiaggia sulla costa e la roccia in quota', () => {
    const { map } = referenceIsland();
    const histogram = map.biomeHistogram();

    for (let biome = 0; biome < histogram.length; biome++) {
      expect(histogram[biome]).toBeGreaterThan(0);
    }

    // Nessuna sovrapposizione fra le fasce di quota: e' cio' che rende leggibile
    // il toggle per bioma nella scena di debug.
    let beachMax = 0;
    let rockMin = Number.POSITIVE_INFINITY;
    // `ocean` vuol dire **sott'acqua**, non "sul mare": dentro una conca lo
    // specchio sta alla quota del lago, e la colonna che ci sta sotto e' oceano
    // a cinquanta voxel d'altezza. Il confronto che resta vero e' quello con lo
    // specchio che quella colonna ha davvero sopra.
    let emerged = 0;
    forEachColumn(map, (x, y, height, biome) => {
      if (biome === BIOME.ocean && height >= map.waterTopAt(x, y)) emerged++;
      if (biome === BIOME.beach) beachMax = Math.max(beachMax, height);
      if (biome === BIOME.rock) rockMin = Math.min(rockMin, height);
    });

    expect(emerged).toBe(0);
    expect(beachMax).toBeLessThan(TERRAIN.beachMaxHeight);
    expect(beachMax).toBeGreaterThanOrEqual(TERRAIN.seaLevel);
    expect(rockMin).toBeGreaterThanOrEqual(TERRAIN.seaLevel);
  });

  it('un lago sta in quota, e’ chiuso e la sua acqua arriva al proprio pelo', () => {
    const { world, map } = referenceIsland();

    // Colonne sommerse da uno specchio piu' alto del mare: sono i laghi.
    const lake: { x: number; y: number; level: number }[] = [];
    forEachColumn(map, (x, y, height) => {
      const level = map.waterTopAt(x, y);
      if (level > TERRAIN.seaLevel && height < level) lake.push({ x, y, level });
    });
    expect(lake.length).toBeGreaterThan(256);

    // Uno specchio solo, alla stessa quota: un lago non e' una scala d'acqua.
    const levels = new Set(lake.map((column) => column.level));
    expect(levels.size).toBe(1);

    scanColumns(() => {
      for (const { x, y, level } of lake) {
        // Il pelo e' pieno d'acqua e sopra c'e' aria: il lago non e' un buco.
        if (world.getBlock(x, y, level - 1) !== WATER_IDS.surface) return `(${x}, ${y}) senza pelo`;
        if (world.getBlock(x, y, level) !== 0) return `(${x}, ${y}) coperta sopra il pelo`;
        // Profondita' dentro il bassofondo: e' cio' che lo fa leggere come pozza
        // e non come mare aperto.
        const depth = level - map.heightAt(x, y);
        if (depth > TERRAIN.shallowDepth) return `(${x}, ${y}) profonda ${depth}`;
        // E il bioma dice sott'acqua, quindi niente alberi e niente edifici.
        if (map.biomeAt(x, y) !== BIOME.ocean) return `(${x}, ${y}) non e' sott'acqua`;
        if (map.isBuildable(x, y)) return `(${x}, ${y}) edificabile`;
      }
      return null;
    });

    // Chiuso: ogni colonna confinante che non e' lago sta sopra il pelo. Senza
    // questo l'acqua sarebbe una toppa piatta appoggiata su un pendio.
    const inLake = new Set(lake.map(({ x, y }) => `${x},${y}`));
    scanColumns(() => {
      for (const { x, y, level } of lake) {
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (inLake.has(`${nx},${ny}`)) continue;
          if (map.heightAt(nx, ny) < level) return `(${nx}, ${ny}) sotto il pelo del lago`;
        }
      }
      return null;
    });
  });

  it('la pendenza e’ coerente con le altezze delle colonne vicine', () => {
    const { map } = referenceIsland();
    const field = new HeightField(SEED, shapeFromRegion(ISLAND));

    // La pendenza pubblicata e' quella della cella: la media delle pendenze
    // continue delle sue colonne. Resta la stessa grandezza di prima — voxel di
    // dislivello per voxel — ed e' per questo che le soglie di `TERRAIN` non
    // hanno dovuto muoversi con la scala.
    const columnSlope = (x: number, y: number): number => Math.max(
      Math.abs(Math.fround(field.heightAt(x + 1, y)) - Math.fround(field.heightAt(x, y))),
      Math.abs(Math.fround(field.heightAt(x - 1, y)) - Math.fround(field.heightAt(x, y))),
      Math.abs(Math.fround(field.heightAt(x, y + 1)) - Math.fround(field.heightAt(x, y))),
      Math.abs(Math.fround(field.heightAt(x, y - 1)) - Math.fround(field.heightAt(x, y))),
    );

    for (let y = 64; y < 192; y += 7) {
      for (let x = 64; x < 192; x += 7) {
        const x0 = x - (x % TERRAIN.cellSize);
        const y0 = y - (y % TERRAIN.cellSize);
        let sum = 0;
        for (let dy = 0; dy < TERRAIN.cellSize; dy++) {
          for (let dx = 0; dx < TERRAIN.cellSize; dx++) sum += columnSlope(x0 + dx, y0 + dy);
        }
        const expected = sum / (TERRAIN.cellSize * TERRAIN.cellSize);
        expect(map.slopeAt(x, y)).toBeCloseTo(expected, 5);
      }
    }
  });
});

describe('generateIsland — scrittura nel mondo', () => {
  it('l’isola e’ circondata d’acqua su tutti i lati', () => {
    const { world, map } = referenceIsland();
    const waterIds: number[] = [WATER_IDS.surface, WATER_IDS.deep];

    scanColumns(() => {
      for (let i = 0; i < 512; i++) {
        for (const [x, y] of [
          [i, 0],
          [i, 511],
          [0, i],
          [511, i],
        ]) {
          if (map.heightAt(x, y) >= TERRAIN.seaLevel) return `(${x}, ${y}) emerge`;
          if (map.biomeAt(x, y) !== BIOME.ocean) return `(${x}, ${y}) non e' oceano`;
          if (!waterIds.includes(world.getBlock(x, y, TERRAIN.seaLevel - 1))) {
            return `(${x}, ${y}) non ha acqua sotto il pelo`;
          }
        }
      }
      return null;
    });
  });

  it('ogni colonna e’ piena fino alla sua altezza e le decorazioni restano sopra', () => {
    const { world, map } = referenceIsland();

    scanColumns(() => {
      for (let y = 0; y < 512; y += 11) {
        for (let x = 0; x < 512; x += 11) {
          const height = map.heightAt(x, y);
          const top = Math.max(height, TERRAIN.seaLevel);
          for (let z = 0; z < top; z++) {
            if (world.getBlock(x, y, z) === 0) return `(${x}, ${y}) vuota a quota ${z}`;
          }
          // Gli alberi possono occupare l'aria sopra la colonna, ma non devono
          // mai scavare o sostituire la stratigrafia che li sostiene.
          if (height >= TERRAIN.seaLevel && world.getBlock(x, y, height - 1) === 0) {
            return `(${x}, ${y}) scavata sotto la superficie`;
          }
        }
      }
      return null;
    });
  });

  it('la superficie di terra usa la tinta del bioma e il sottosuolo un’altra', () => {
    const { world, map } = referenceIsland();

    let checked = 0;
    for (let y = 0; y < 512 && checked < 50; y += 3) {
      for (let x = 0; x < 512 && checked < 50; x += 3) {
        const height = map.heightAt(x, y);
        if (height < TERRAIN.seaLevel + TERRAIN.cellSize + TERRAIN.subsoilDepth + 1) continue;
        // Ogni strato e' spesso un numero intero di celle: la superficie occupa
        // i primi `cellSize` voxel, il sottosuolo i `subsoilDepth` successivi.
        const surface = world.getBlock(x, y, height - 1);
        const subsoil = world.getBlock(x, y, height - 1 - TERRAIN.cellSize);
        const deep = world.getBlock(x, y, height - 1 - TERRAIN.cellSize - TERRAIN.subsoilDepth);
        expect(surface).not.toBe(subsoil);
        expect(subsoil).not.toBe(deep);
        checked++;
      }
    }
    expect(checked).toBe(50);
  });

  it('la colonna scritta a corse coincide voxel per voxel con paletteForDepth', () => {
    // Il generatore taglia la colonna ai due confini di `STRATA_DEPTH` e scrive
    // tre corse invece di trenta voxel: e' un'ottimizzazione di scrittura, non
    // una regola nuova. Questo test e' cio' che tiene le due letture della stessa
    // stratigrafia — a tratti e per voxel — dalla stessa parte.
    const { world, map } = referenceIsland();

    scanColumns(() => {
      for (let y = 0; y < 512; y += 13) {
        for (let x = 0; x < 512; x += 13) {
          const height = map.heightAt(x, y);
          const biome = map.biomeAt(x, y);
          for (let z = 0; z < height; z++) {
            const expected = paletteForDepth(biome, height - 1 - z);
            if (world.getBlock(x, y, z) !== expected) return `(${x}, ${y}, ${z}) fuori stratigrafia`;
          }
          for (let z = height; z < TERRAIN.seaLevel; z++) {
            const expected = z >= TERRAIN.seaLevel - TERRAIN.waterSurfaceDepth
              ? WATER_IDS.surface
              : WATER_IDS.deep;
            if (world.getBlock(x, y, z) !== expected) return `(${x}, ${y}, ${z}) acqua sbagliata`;
          }
        }
      }
      return null;
    });
  });

  it('non scrive mai nel layer data', () => {
    const { world } = referenceIsland();

    for (const chunk of world.chunks.values()) {
      expect(chunk.data.some((value) => value !== 0)).toBe(false);
    }
  });

  it('non alloca chunk verticali che resterebbero vuoti', () => {
    const { world } = referenceIsland();

    for (const chunk of world.chunks.values()) {
      expect(chunk.isEmpty).toBe(false);
    }
  });
});

describe('generateColumnBlock — costo', () => {
  it('un’isola 512x512 sta sotto i 2400 ms di sola generazione', () => {
    const field = new HeightField(SEED, shapeFromRegion(ISLAND));

    const started = performance.now();
    let columns = 0;
    for (let ccy = 0; ccy < 16; ccy++) {
      for (let ccx = 0; ccx < 16; ccx++) {
        columns += generateColumnBlock(field, ccx, ccy).heights.length;
      }
    }
    const elapsed = performance.now() - started;

    expect(columns).toBe(512 * 512);
    expect(columns).toBe(256 * COLUMNS_PER_CHUNK);
    expect(elapsed).toBeLessThan(2400);
  });
});
