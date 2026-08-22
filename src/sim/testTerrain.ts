import { CHUNK } from '../world/chunkCoords';
import { columnIndex, COLUMNS_PER_CHUNK, type ColumnBlock } from '../world/terrain/columnBlock';
import { classifyBiome, isBuildable as isTerrainBuildable } from '../world/terrain/biomes';
import { BIOME } from '../world/terrain/config';
import { TerrainMap } from '../world/terrain/TerrainMap';

/**
 * Fixture di terreno per i test della simulazione.
 *
 * I test del campo e delle decisioni hanno bisogno di sapere esattamente quali
 * colonne sono edificabili: generare un'isola vera darebbe una mappa realistica
 * ma opaca, e ogni asserzione dipenderebbe dal seed. Qui l'edificabilita' e' un
 * predicato scritto dal test.
 *
 * Non e' codice di produzione e nessun modulo raggiungibile da `main.ts` lo
 * importa.
 */

export interface TestTerrainOptions {
  /** Colonne di chunk sul lato x. */
  readonly chunksX: number;
  /** Colonne di chunk sul lato y. */
  readonly chunksY: number;
  /** true se la colonna di mondo e' edificabile. Default: tutte. */
  readonly buildable?: (x: number, y: number) => boolean;
  /** Altezza costante delle colonne. */
  readonly height?: number;

  /**
   * Rilievo per colonna, al posto dell'altezza costante.
   *
   * Quando c'e', bioma ed edificabilita' **non** sono piu' scritti a mano: si
   * ricavano da `classifyBiome` e `isBuildable`, le stesse funzioni che usa il
   * generatore. E' cio' che permette a un test di scrivere un dislivello o una
   * linea di costa e ottenere la classificazione vera invece di una
   * plausibile — senza, una fixture potrebbe dichiarare edificabile una colonna
   * che sull'isola vera non lo sarebbe mai, e il test verificherebbe un mondo
   * che non esiste.
   */
  readonly heightAt?: (x: number, y: number) => number;

  /** Pendenza per colonna, usata solo insieme a `heightAt`. Default: 0,1. */
  readonly slopeAt?: (x: number, y: number) => number;
}

export function testTerrain(options: TestTerrainOptions): TerrainMap {
  const map = new TerrainMap();

  for (let ccy = 0; ccy < options.chunksY; ccy++) {
    for (let ccx = 0; ccx < options.chunksX; ccx++) {
      map.adopt(blockOf(ccx, ccy, options));
    }
  }

  return map;
}

function blockOf(ccx: number, ccy: number, options: TestTerrainOptions): ColumnBlock {
  const heights = new Int16Array(COLUMNS_PER_CHUNK);
  const biomes = new Uint8Array(COLUMNS_PER_CHUNK);
  const slopes = new Float32Array(COLUMNS_PER_CHUNK);
  const buildable = new Uint8Array(COLUMNS_PER_CHUNK);
  let buildableCount = 0;
  let maxHeight = 0;

  const flat = options.height ?? 12;
  const declared = options.buildable;

  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const i = columnIndex(lx, ly);
      const x = ccx * CHUNK + lx;
      const y = ccy * CHUNK + ly;

      const height = options.heightAt === undefined ? flat : options.heightAt(x, y);
      const slope = options.slopeAt === undefined ? 0.1 : options.slopeAt(x, y);
      const biome = options.heightAt === undefined
        ? BIOME.plain
        : classifyBiome(height, slope);

      heights[i] = height;
      biomes[i] = biome;
      slopes[i] = slope;
      if (height > maxHeight) maxHeight = height;

      const ok = declared !== undefined
        ? declared(x, y)
        : options.heightAt === undefined || isTerrainBuildable(biome, slope);
      if (ok) {
        buildable[i] = 1;
        buildableCount++;
      }
    }
  }

  return {
    ccx,
    ccy,
    heights,
    biomes,
    slopes,
    buildable,
    water: new Uint8Array(COLUMNS_PER_CHUNK),
    decor: new Int16Array(0),
    maxHeight,
    buildableCount,
  };
}
