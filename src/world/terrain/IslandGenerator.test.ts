import { describe, expect, it } from 'vitest';
import { CHUNK } from '../chunkCoords';
import { VoxelWorld } from '../VoxelWorld';
import { columnIndex, COLUMNS_PER_CHUNK } from './columnBlock';
import { BIOME, TERRAIN, WATER_IDS } from './config';
import { HeightField } from './heightField';
import { expandIsland, generateColumnBlock, generateIsland, type Region } from './IslandGenerator';
import { shapeFromRegion } from './region';
import type { TerrainMap } from './TerrainMap';

const SEED = 1337;
const ISLAND: Region = { minX: 0, minY: 0, sizeX: 256, sizeY: 256 };

/** I byte grezzi di una vista tipizzata, per i confronti "identici byte per byte". */
function bytesOf(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
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

describe('generateIsland — determinismo', () => {
  it('due chiamate con lo stesso seed danno mappa e mondo identici byte per byte', () => {
    const worldA = new VoxelWorld();
    const worldB = new VoxelWorld();
    const first = generateIsland(worldA, SEED, ISLAND);
    const second = generateIsland(worldB, SEED, ISLAND);

    expect(mapSignature(second.map)).toEqual(mapSignature(first.map));
    expect(worldSignature(worldB)).toEqual(worldSignature(worldA));
    expect(second.buildableColumns).toBe(first.buildableColumns);
    expect(second.voxelsWritten).toBe(first.voxelsWritten);
  });

  it('generare A poi B equivale a generare B poi A', () => {
    const a: Region = { minX: 0, minY: 0, sizeX: 128, sizeY: 128 };
    const b: Region = { minX: 128, minY: 0, sizeX: 128, sizeY: 128 };

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

    expect(mapSignature(ba2.map)).toEqual(mapSignature(ab2.map));
    expect(worldSignature(worldBA2)).toEqual(worldSignature(worldAB2));
    expect(ba.map.chunkCount).toBe(ab.map.chunkCount);
  });

  it('generare per blocchi sparsi da’ le stesse colonne di una region intera', () => {
    // Un quarto d'isola: 16 colonne di chunk bastano a mostrare che l'ordine non
    // conta, e sono quattro volte piu' economiche di sessantaquattro.
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
    expect(mapSignature(map)).toEqual(mapSignature(whole.map));
    expect(worldSignature(piecemeal)).toEqual(worldSignature(wholeWorld));
  });
});

describe('generateIsland — continuita’ al confine', () => {
  /**
   * Le due meta' dell'isola generate separatamente, con la maschera dell'isola
   * intera: la cucitura cade in mezzo al rilievo, dove un gradino si vedrebbe.
   */
  it('fra due region adiacenti il dislivello di colonne contigue non supera 1', () => {
    const shape = shapeFromRegion(ISLAND);
    const world = new VoxelWorld();

    const left = generateIsland(world, SEED, { minX: 0, minY: 0, sizeX: 128, sizeY: 256 }, { shape });
    const right = generateIsland(
      world,
      SEED,
      { minX: 128, minY: 0, sizeX: 128, sizeY: 256 },
      { map: left.map, shape },
    );
    const map = right.map;

    let worst = 0;
    for (let y = 0; y < 256; y++) {
      const delta = Math.abs(map.heightAt(128, y) - map.heightAt(127, y));
      if (delta > worst) worst = delta;
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('la cucitura non e’ un caso particolare: vale per tutte le colonne dell’isola', () => {
    const { map } = generateIsland(new VoxelWorld(), SEED, ISLAND);

    let worst = 0;
    for (let y = 1; y < 255; y++) {
      for (let x = 1; x < 255; x++) {
        const h = map.heightAt(x, y);
        const delta = Math.max(
          Math.abs(map.heightAt(x + 1, y) - h),
          Math.abs(map.heightAt(x, y + 1) - h),
        );
        if (delta > worst) worst = delta;
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('anche due isole affiancate senza maschera condivisa si toccano al livello del fondale', () => {
    const world = new VoxelWorld();
    const a = generateIsland(world, SEED, ISLAND);
    const b = generateIsland(world, SEED, { minX: 256, minY: 0, sizeX: 256, sizeY: 256 }, { map: a.map });

    for (let y = 0; y < 256; y++) {
      expect(Math.abs(b.map.heightAt(256, y) - b.map.heightAt(255, y))).toBeLessThanOrEqual(1);
    }
  });
});

describe('expandIsland', () => {
  it('non rigenera le colonne esistenti e continua la stessa costa', () => {
    const world = new VoxelWorld();
    const base = generateIsland(world, SEED, ISLAND);
    const before = mapSignature(base.map);
    const chunksBefore = base.map.chunkCount;

    const strip: Region = { minX: 0, minY: 256, sizeX: 256, sizeY: CHUNK * 2 };
    const grown = expandIsland(world, SEED, strip, { map: base.map });

    // Solo la striscia nuova: 8 colonne di chunk x 2 file.
    expect(grown.blocks).toBe(16);
    expect(grown.map.chunkCount).toBe(chunksBefore + 16);

    // Le colonne di prima sono rimaste esattamente quelle di prima.
    const after = mapSignature(grown.map);
    for (const key of Object.keys(before)) expect(after[key]).toEqual(before[key]);

    // E la maschera ereditata rende continuo anche il confine nuovo.
    for (let x = 0; x < 256; x++) {
      expect(Math.abs(grown.map.heightAt(x, 256) - grown.map.heightAt(x, 255))).toBeLessThanOrEqual(1);
    }
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
    // piccole restano a 128 perche' generare tre isole da 256 e' quasi tutto
    // tempo di scrittura voxel, che qui non si sta misurando.
    const regions: [number, Region][] = [
      [SEED, ISLAND],
      [7, { minX: 0, minY: 0, sizeX: 128, sizeY: 128 }],
      [99991, { minX: 0, minY: 0, sizeX: 128, sizeY: 128 }],
    ];

    for (const [seed, region] of regions) {
      const { map } = generateIsland(new VoxelWorld(), seed, region);
      let buildable = 0;
      forEachColumn(map, (_x, _y, height, biome, slope, isBuildable) => {
        if (!isBuildable) return;
        buildable++;
        expect(height).toBeGreaterThanOrEqual(TERRAIN.seaLevel);
        expect(slope).toBeLessThan(TERRAIN.buildableMaxSlope);
        expect([BIOME.plain, BIOME.forest, BIOME.hill]).toContain(biome);
      });
      expect(buildable).toBeGreaterThan(500);
    }
  });

  it('tutti e sei i biomi compaiono, con la spiaggia sulla costa e la roccia in quota', () => {
    const { map } = generateIsland(new VoxelWorld(), SEED, ISLAND);
    const histogram = map.biomeHistogram();

    for (let biome = 0; biome < histogram.length; biome++) {
      expect(histogram[biome]).toBeGreaterThan(0);
    }

    // Nessuna sovrapposizione fra le fasce di quota: e' cio' che rende leggibile
    // il toggle per bioma nella scena di debug.
    let beachMax = 0;
    let rockMin = Number.POSITIVE_INFINITY;
    let oceanMax = 0;
    forEachColumn(map, (_x, _y, height, biome) => {
      if (biome === BIOME.ocean) oceanMax = Math.max(oceanMax, height);
      if (biome === BIOME.beach) beachMax = Math.max(beachMax, height);
      if (biome === BIOME.rock) rockMin = Math.min(rockMin, height);
    });

    expect(oceanMax).toBeLessThan(TERRAIN.seaLevel);
    expect(beachMax).toBeLessThan(TERRAIN.beachMaxHeight);
    expect(beachMax).toBeGreaterThanOrEqual(TERRAIN.seaLevel);
    expect(rockMin).toBeGreaterThanOrEqual(TERRAIN.seaLevel);
  });

  it('la pendenza e’ coerente con le altezze delle colonne vicine', () => {
    const { map } = generateIsland(new VoxelWorld(), SEED, ISLAND);
    const field = new HeightField(SEED, shapeFromRegion(ISLAND));

    for (let y = 64; y < 192; y += 7) {
      for (let x = 64; x < 192; x += 7) {
        const expected = Math.max(
          Math.abs(Math.fround(field.heightAt(x + 1, y)) - Math.fround(field.heightAt(x, y))),
          Math.abs(Math.fround(field.heightAt(x - 1, y)) - Math.fround(field.heightAt(x, y))),
          Math.abs(Math.fround(field.heightAt(x, y + 1)) - Math.fround(field.heightAt(x, y))),
          Math.abs(Math.fround(field.heightAt(x, y - 1)) - Math.fround(field.heightAt(x, y))),
        );
        expect(map.slopeAt(x, y)).toBeCloseTo(expected, 5);
      }
    }
  });
});

describe('generateIsland — scrittura nel mondo', () => {
  it('l’isola e’ circondata d’acqua su tutti i lati', () => {
    const world = new VoxelWorld();
    const { map } = generateIsland(world, SEED, ISLAND);
    const waterIds = [WATER_IDS.surface, WATER_IDS.deep];

    for (let i = 0; i < 256; i++) {
      for (const [x, y] of [
        [i, 0],
        [i, 255],
        [0, i],
        [255, i],
      ]) {
        expect(map.heightAt(x, y)).toBeLessThan(TERRAIN.seaLevel);
        expect(map.biomeAt(x, y)).toBe(BIOME.ocean);
        expect(waterIds).toContain(world.getBlock(x, y, TERRAIN.seaLevel - 1));
      }
    }
  });

  it('ogni colonna e’ piena fino alla sua altezza e vuota sopra il pelo dell’acqua', () => {
    const world = new VoxelWorld();
    const { map } = generateIsland(world, SEED, ISLAND);

    for (let y = 0; y < 256; y += 11) {
      for (let x = 0; x < 256; x += 11) {
        const height = map.heightAt(x, y);
        const top = Math.max(height, TERRAIN.seaLevel);
        for (let z = 0; z < top; z++) expect(world.getBlock(x, y, z)).not.toBe(0);
        expect(world.getBlock(x, y, top)).toBe(0);
      }
    }
  });

  it('la superficie di terra usa la tinta del bioma e il sottosuolo un’altra', () => {
    const world = new VoxelWorld();
    const { map } = generateIsland(world, SEED, ISLAND);

    let checked = 0;
    for (let y = 0; y < 256 && checked < 50; y += 3) {
      for (let x = 0; x < 256 && checked < 50; x += 3) {
        const height = map.heightAt(x, y);
        if (height < TERRAIN.seaLevel + TERRAIN.subsoilDepth + 2) continue;
        const surface = world.getBlock(x, y, height - 1);
        const subsoil = world.getBlock(x, y, height - 2);
        const deep = world.getBlock(x, y, height - TERRAIN.subsoilDepth - 2);
        expect(surface).not.toBe(subsoil);
        expect(subsoil).not.toBe(deep);
        checked++;
      }
    }
    expect(checked).toBe(50);
  });

  it('non scrive mai nel layer data', () => {
    const world = new VoxelWorld();
    generateIsland(world, SEED, ISLAND);

    for (const chunk of world.chunks.values()) {
      expect(chunk.data.some((value) => value !== 0)).toBe(false);
    }
  });

  it('non alloca chunk verticali che resterebbero vuoti', () => {
    const world = new VoxelWorld();
    generateIsland(world, SEED, ISLAND);

    for (const chunk of world.chunks.values()) {
      expect(chunk.isEmpty).toBe(false);
    }
  });
});

describe('generateColumnBlock — costo', () => {
  it('un’isola 256x256 sta sotto gli 800 ms di sola generazione', () => {
    const field = new HeightField(SEED, shapeFromRegion(ISLAND));

    const started = performance.now();
    let columns = 0;
    for (let ccy = 0; ccy < 8; ccy++) {
      for (let ccx = 0; ccx < 8; ccx++) {
        columns += generateColumnBlock(field, ccx, ccy).heights.length;
      }
    }
    const elapsed = performance.now() - started;

    expect(columns).toBe(256 * 256);
    expect(columns).toBe(64 * COLUMNS_PER_CHUNK);
    expect(elapsed).toBeLessThan(800);
  });
});
