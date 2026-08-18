import { CHUNK } from '../world/chunkCoords';
import { columnIndex, COLUMNS_PER_CHUNK, type ColumnBlock } from '../world/terrain/columnBlock';
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
}

export function testTerrain(options: TestTerrainOptions): TerrainMap {
  const map = new TerrainMap();
  const isBuildable = options.buildable ?? ((): boolean => true);
  const height = options.height ?? 12;

  for (let ccy = 0; ccy < options.chunksY; ccy++) {
    for (let ccx = 0; ccx < options.chunksX; ccx++) {
      map.adopt(blockOf(ccx, ccy, height, isBuildable));
    }
  }

  return map;
}

function blockOf(
  ccx: number,
  ccy: number,
  height: number,
  isBuildable: (x: number, y: number) => boolean,
): ColumnBlock {
  const heights = new Int16Array(COLUMNS_PER_CHUNK);
  const biomes = new Uint8Array(COLUMNS_PER_CHUNK);
  const slopes = new Float32Array(COLUMNS_PER_CHUNK);
  const buildable = new Uint8Array(COLUMNS_PER_CHUNK);
  let buildableCount = 0;

  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const i = columnIndex(lx, ly);
      const x = ccx * CHUNK + lx;
      const y = ccy * CHUNK + ly;
      heights[i] = height;
      biomes[i] = BIOME.plain;
      slopes[i] = 0.1;
      if (isBuildable(x, y)) {
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
    decor: new Int16Array(0),
    maxHeight: height,
    buildableCount,
  };
}
