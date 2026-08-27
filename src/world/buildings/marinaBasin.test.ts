import { describe, expect, it } from 'vitest';
import { testTerrain } from '../../sim/testTerrain';
import { GRADING } from '../grading/config';
import { BIOME, TERRAIN, WATER_IDS } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import type { BuildingRecord } from './BuildingRegistry';

/**
 * La marina scava il suo bacino e vive anche sul lago.
 *
 * **Due regressioni che si vedevano solo a schermo.** La prima: sul lago la
 * marina non nasceva proprio — la sponda e' una scarpata che `surveyGrade`
 * rifiutava, e la struttura restava una piazzola. La seconda: la darsena era il
 * mare che capitava di esserci; qui il bacino si **scava** dentro la riva e si
 * allaga fino al pelo, che e' la differenza fra una darsena e un molo.
 */

const DRY = TERRAIN.beachMaxHeight + 6;
const DEEP = TERRAIN.seaLevel - 6;

/**
 * Costa con un bassofondo **sommerso** di un voxel fra la terra e il largo.
 *
 * E' la colonna su cui lo scavo morde: il piazzamento porta la linea d'acqua
 * sul primo pelo sommerso, e le colonne del bacino che stanno a un voxel sotto
 * il pelo scendono a `basinDepth` — due sotto — prima di essere allagate.
 */
function shallowCoast(water: number): TerrainMap {
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: (x) => {
      if (x < water) return DRY;
      if (x < water + 8) return TERRAIN.seaLevel - 1;
      return DEEP;
    },
  });
}

/** Lago in quota: pelo a `level`, fondo due sotto, riva ripida quattro sopra. */
const LAKE_LEVEL = TERRAIN.seaLevel + 16;

function lakeAt(shoreX: number): TerrainMap {
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: (x) => (x >= shoreX ? LAKE_LEVEL - 2 : LAKE_LEVEL + 4),
    slopeAt: (x) => (x >= shoreX ? 0.1 : 0.6),
    waterTopAt: (x) => (x >= shoreX ? LAKE_LEVEL : TERRAIN.seaLevel),
  });
}

function builtMarinaAt(
  map: TerrainMap,
  x: number,
  y: number,
): { world: VoxelWorld; record: BuildingRecord | null } {
  const world = new VoxelWorld();
  const builder = new Builder(world, map, 4242);
  builder.placeLandmark(x, y, 'marina');
  while (builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) builder.step();
  for (const record of builder.registry.all) {
    if (record.landmark === 'marina') return { world, record };
  }
  return { world, record: null };
}

describe('la marina sul lago', () => {
  it('nasce sulla riva ripida che ogni altro ruolo rifiuterebbe', () => {
    const map = lakeAt(20);
    expect(map.biomeAt(18, 32)).not.toBe(BIOME.ocean);
    expect(map.slopeAt(18, 32)).toBeGreaterThan(0.46);

    const { world, record } = builtMarinaAt(map, 19, 32);
    expect(record).not.toBeNull();

    // Lo stadio zero e' la promenade: il piano c'e' davvero, non e' la piazzola
    // di ripiego. Le colonne del lago sotto il fronte sono state riempite fino
    // al piano — la banchina che la riva ripida non avrebbe mai concesso.
    expect(world.getBlock(record!.x + 2, record!.y + 6, record!.baseZ)).not.toBe(0);
    expect(world.getBlock(record!.x + 9, record!.y + 2, LAKE_LEVEL - 1)).not.toBe(0);
  });
});

describe('il bacino scavato', () => {
  it('approfondisce il bassofondo e lo allaga fino al pelo', () => {
    const map = shallowCoast(20);
    const { world, record } = builtMarinaAt(map, 22, 32);
    expect(record).not.toBeNull();

    // La colonna del bacino stava un voxel sotto il pelo; dopo lo scavo scende
    // a due e l'acqua la riempie fino alla superficie.
    const basinX = record!.x + 6;
    const basinY = record!.y + 1;
    expect(map.heightAt(basinX, basinY)).toBe(TERRAIN.seaLevel - 1);
    expect(world.getBlock(basinX, basinY, TERRAIN.seaLevel - 2)).toBe(WATER_IDS.surface);
    expect(world.getBlock(basinX, basinY, TERRAIN.seaLevel - 1)).toBe(WATER_IDS.surface);
    expect(world.getBlock(basinX, basinY, TERRAIN.seaLevel)).toBe(0);

    // Il muro di banchina scende a incontrare il fondo scavato, sotto il piede
    // che l'opera di terra gli aveva costruito.
    const wallX = record!.x + 5;
    const wallY = record!.y + 6;
    expect(world.getBlock(wallX, wallY, TERRAIN.seaLevel - 2)).toBe(GRADING.quayWall);
    expect(world.getBlock(wallX, wallY, TERRAIN.seaLevel - 1)).toBe(GRADING.quayWall);
  });
});
