import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, addBuilding, addCatalyst, createSimState } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';

describe('Builder', () => {
  it('trasforma un candidato della simulazione in voxel e occupazione', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);
    let state = createSimState();
    state = addCatalyst(state, {
      x: 24,
      y: 24,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 20,
    });

    state = builder.onTick(state);
    expect(builder.stats.placed).toBeGreaterThan(0);
    expect(state.buildings).toHaveLength(builder.stats.placed);
    expect(builder.registry.count).toBe(builder.stats.placed);

    while (builder.stats.growing > 0) builder.step();
    expect(world.solidVoxelCount).toBeGreaterThan(0);
  });

  it('materializza subito gli edifici gia presenti nello stato', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);
    const state = addBuilding(createSimState(), {
      x: 12,
      y: 12,
      class: BUILDING_CLASS.residential,
    });

    builder.materialize(state.buildings);

    expect(builder.registry.count).toBe(1);
    expect(builder.stats.growing).toBe(0);
    expect(world.solidVoxelCount).toBeGreaterThan(0);
  });
});
