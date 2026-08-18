import { describe, expect, it } from 'vitest';
import { testTerrain } from '../sim/testTerrain';
import { VoxelWorld } from '../world/VoxelWorld';
import { GrowthScene } from './growthScene';

describe('GrowthScene', () => {
  it('chiude il ciclo tick, costruzione e registrazione voxel', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 64, sizeY: 64 }, 1337);
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

    for (let i = 0; i < 240; i++) scene.advance(0.1);

    expect(scene.stats.builder.upgraded).toBeGreaterThan(0);
    expect(scene.stats.levels.slice(1).some((count) => count > 0)).toBe(true);
  });
});
