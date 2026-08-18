import { describe, expect, it } from 'vitest';
import { testTerrain } from '../sim/testTerrain';
import { BUILDING_CLASS } from '../sim';
import { VoxelWorld } from '../world/VoxelWorld';
import { GrowthScene } from './growthScene';

describe('GrowthScene', () => {
  it('chiude il ciclo tick, costruzione e registrazione voxel', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 64, sizeY: 64 }, 1337);
    expect(scene.placeCatalyst(16, 16, BUILDING_CLASS.residential).success).toBe(true);
    expect(scene.placeCatalyst(32, 16, BUILDING_CLASS.production).success).toBe(true);
    for (let i = 0; i < 20; i++) scene.advance(0.1);
    expect(scene.stats.tick).toBe(20);
    expect(scene.stats.buildings).toBeGreaterThan(0);
    expect(scene.registry.count).toBe(scene.stats.buildings);
    expect(world.solidVoxelCount).toBeGreaterThan(0);
  });

  it('promuove gli edifici e produce crescita verticale osservabile', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 64, sizeY: 64 }, 1337);
    expect(scene.placeCatalyst(16, 16, BUILDING_CLASS.residential).success).toBe(true);
    expect(scene.placeCatalyst(32, 16, BUILDING_CLASS.production).success).toBe(true);

    for (let i = 0; i < 240; i++) scene.advance(0.1);

    expect(scene.stats.builder.upgraded).toBeGreaterThan(0);
    expect(scene.stats.levels.slice(1).some((count) => count > 0)).toBe(true);
  });

  it('rispetta pausa e velocita del ciclo di gioco', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 32, sizeY: 32 }, 9);
    scene.setPaused(true);
    scene.advance(1);
    expect(scene.stats.tick).toBe(0);
    scene.setPaused(false);
    scene.setSpeed(2);
    scene.advance(0.1);
    expect(scene.stats.tick).toBe(2);
  });
});
