import { describe, expect, it } from 'vitest';
import { CHUNK } from '../chunkCoords';
import { classifyBiome, isBuildable, paletteForDepth } from './biomes';
import { columnIndex, COLUMNS_PER_CHUNK, type ColumnBlock } from './columnBlock';
import { BIOME, BIOME_STRATA, TERRAIN } from './config';
import { TerrainMap } from './TerrainMap';

function blockOf(ccx: number, ccy: number, fill: (i: number) => [number, number, number]): ColumnBlock {
  const heights = new Int16Array(COLUMNS_PER_CHUNK);
  const biomes = new Uint8Array(COLUMNS_PER_CHUNK);
  const slopes = new Float32Array(COLUMNS_PER_CHUNK);
  const buildable = new Uint8Array(COLUMNS_PER_CHUNK);
  let maxHeight = 0;
  let buildableCount = 0;

  for (let i = 0; i < COLUMNS_PER_CHUNK; i++) {
    const [height, biome, slope] = fill(i);
    heights[i] = height;
    biomes[i] = biome;
    slopes[i] = slope;
    if (isBuildable(biome, slope)) {
      buildable[i] = 1;
      buildableCount++;
    }
    if (height > maxHeight) maxHeight = height;
  }

  return {
    ccx,
    ccy,
    heights,
    biomes,
    slopes,
    buildable,
    water: new Uint8Array(COLUMNS_PER_CHUNK),
    waterTop: new Int16Array(COLUMNS_PER_CHUNK).fill(TERRAIN.seaLevel),
    cover: new Uint8Array(COLUMNS_PER_CHUNK),
    decor: new Int16Array(0),
    ledges: new Int16Array(0),
    maxHeight,
    buildableCount,
  };
}

describe('TerrainMap — struttura sparsa', () => {
  it('e’ vuota finche’ non adotta un blocco, anche su coordinate negative', () => {
    const map = new TerrainMap();

    expect(map.chunkCount).toBe(0);
    expect(map.columnCount).toBe(0);
    expect(map.has(-500, 900)).toBe(false);
    expect(map.heightAt(-500, 900)).toBe(0);
    expect(map.biomeAt(-500, 900)).toBe(BIOME.ocean);
    expect(map.slopeAt(-500, 900)).toBe(0);
    expect(map.isBuildable(-500, 900)).toBe(false);
    expect(map.columnAt(-500, 900)).toBeNull();
  });

  it('indicizza le colonne come il mondo, anche a chunk negativi', () => {
    const map = new TerrainMap();
    map.adopt(blockOf(-2, 3, (i) => [i, BIOME.plain, 0.1]));

    expect(map.hasChunk(-2, 3)).toBe(true);
    expect(map.has(-64, 96)).toBe(true);
    expect(map.heightAt(-64, 96)).toBe(0);
    expect(map.heightAt(-64 + 5, 96 + 2)).toBe(columnIndex(5, 2));
    expect(map.has(-65, 96)).toBe(false);
  });

  it('adotta i buffer senza copiarli', () => {
    const map = new TerrainMap();
    const block = blockOf(0, 0, () => [12, BIOME.plain, 0.1]);
    const chunk = map.adopt(block);

    expect(chunk.heights).toBe(block.heights);
    expect(chunk.biomes).toBe(block.biomes);
    expect(chunk.slopes).toBe(block.slopes);
    expect(chunk.buildable).toBe(block.buildable);
  });

  it('tiene il conto delle colonne edificabili anche sostituendo un blocco', () => {
    const map = new TerrainMap();

    map.adopt(blockOf(0, 0, () => [12, BIOME.plain, 0.1]));
    expect(map.buildableCount).toBe(COLUMNS_PER_CHUNK);

    map.adopt(blockOf(1, 0, () => [4, BIOME.ocean, 0.1]));
    expect(map.buildableCount).toBe(COLUMNS_PER_CHUNK);

    // Stessa colonna di chunk: il conteggio vecchio deve uscire, non sommarsi.
    map.adopt(blockOf(0, 0, () => [12, BIOME.plain, 0.9]));
    expect(map.buildableCount).toBe(0);
    expect(map.chunkCount).toBe(2);
    expect(map.columnCount).toBe(2 * COLUMNS_PER_CHUNK);
  });

  it('l’istogramma copre tutte le colonne adottate', () => {
    const map = new TerrainMap();
    map.adopt(blockOf(0, 0, (i) => [12, i < 100 ? BIOME.rock : BIOME.forest, 0.1]));

    const histogram = map.biomeHistogram();
    expect(histogram[BIOME.rock]).toBe(100);
    expect(histogram[BIOME.forest]).toBe(COLUMNS_PER_CHUNK - 100);
    expect(histogram.reduce((a, b) => a + b, 0)).toBe(COLUMNS_PER_CHUNK);
  });

  it('columnAt restituisce i quattro campi coerenti fra loro', () => {
    const map = new TerrainMap();
    map.adopt(blockOf(0, 0, () => [18, BIOME.forest, 0.12]));

    expect(map.columnAt(CHUNK - 1, CHUNK - 1)).toEqual({
      height: 18,
      biome: BIOME.forest,
      slope: Math.fround(0.12),
      buildable: true,
    });
  });

  it('accetta nuove espansioni senza sostituire la maschera base', () => {
    const map = new TerrainMap();
    expect(map.shape).toBeNull();

    const first = { centreX: 0, centreY: 0, radiusX: 10, radiusY: 10 };
    const expanded = {
      ...first,
      extensions: [{ id: 'nord:0', minX: -4, minY: 10, sizeX: 8, sizeY: 8 }],
    };
    map.rememberShape(first);
    map.rememberShape({ centreX: 99, centreY: 99, radiusX: 1, radiusY: 1 });
    map.rememberShape(expanded);

    expect(map.shape).toBe(expanded);
  });
});

describe('classifyBiome — fasce', () => {
  it('l’ordine dei test mette la quota davanti alla pendenza', () => {
    expect(classifyBiome(TERRAIN.seaLevel - 1, 0)).toBe(BIOME.ocean);
    expect(classifyBiome(TERRAIN.seaLevel, 0)).toBe(BIOME.beach);
    expect(classifyBiome(TERRAIN.beachMaxHeight, 0)).toBe(BIOME.plain);
    expect(classifyBiome(TERRAIN.forestMinHeight, 0)).toBe(BIOME.forest);
    expect(classifyBiome(TERRAIN.hillMinHeight, 0)).toBe(BIOME.hill);
    expect(classifyBiome(TERRAIN.rockMinHeight, 0)).toBe(BIOME.rock);
  });

  it('una parete ripida diventa roccia anche a mezza quota', () => {
    const low = TERRAIN.beachMaxHeight;
    expect(classifyBiome(low, 0)).toBe(BIOME.plain);
    expect(classifyBiome(low, TERRAIN.forestMinSlope)).toBe(BIOME.forest);
    expect(classifyBiome(low, TERRAIN.hillMinSlope)).toBe(BIOME.hill);
    expect(classifyBiome(low, TERRAIN.rockMinSlope)).toBe(BIOME.rock);
  });

  it('acqua e roccia non sono mai edificabili, per nessuna pendenza', () => {
    for (const biome of [BIOME.ocean, BIOME.beach, BIOME.rock]) {
      expect(isBuildable(biome, 0)).toBe(false);
    }
    for (const biome of [BIOME.plain, BIOME.forest, BIOME.hill]) {
      expect(isBuildable(biome, 0)).toBe(true);
      expect(isBuildable(biome, TERRAIN.buildableMaxSlope)).toBe(false);
    }
  });
});

describe('paletteForDepth — stratigrafia', () => {
  it('superficie, sottosuolo e fondo secondo la profondita’', () => {
    const strata = BIOME_STRATA[BIOME.plain];

    // La superficie e' spessa una cella, non un voxel: di taglio, su un gradino
    // di terreno, deve essere alta quanto il cubo che la porta.
    expect(paletteForDepth(BIOME.plain, 0)).toBe(strata.surface);
    expect(paletteForDepth(BIOME.plain, TERRAIN.cellSize - 1)).toBe(strata.surface);
    expect(paletteForDepth(BIOME.plain, TERRAIN.cellSize)).toBe(strata.subsoil);
    expect(paletteForDepth(BIOME.plain, TERRAIN.cellSize + TERRAIN.subsoilDepth - 1))
      .toBe(strata.subsoil);
    expect(paletteForDepth(BIOME.plain, TERRAIN.cellSize + TERRAIN.subsoilDepth))
      .toBe(strata.deep);
  });

  it('ogni bioma ha tre indici distinti e nessuno e’ il vuoto', () => {
    for (const strata of BIOME_STRATA) {
      expect(new Set([strata.surface, strata.subsoil, strata.deep]).size).toBe(3);
      expect(strata.surface).toBeGreaterThan(0);
      expect(strata.subsoil).toBeGreaterThan(0);
      expect(strata.deep).toBeGreaterThan(0);
    }
  });
});
