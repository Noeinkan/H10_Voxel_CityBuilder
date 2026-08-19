import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, addBuilding, addCatalyst, createSimState } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { SURFACE_KIND } from '../visualBlock';
import { Builder } from './Builder';
import { CLASS_PROFILE } from './config';

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
    expect(world.getSurfaceKind(12, 12, 12)).not.toBe(SURFACE_KIND.plain);
  });

  it('dipinge una piazzola di catalizzatore a budget senza cambiare la quota', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);

    builder.decorateCatalyst(24, 24, BUILDING_CLASS.residential);
    expect(builder.stats.surfaceQueued).toBeGreaterThan(0);
    while (builder.stats.surfaceQueued > 0) builder.step();

    expect(world.getBlock(24, 24, 11)).toBe(CLASS_PROFILE[BUILDING_CLASS.residential].accent);
    expect(world.getBlock(25, 24, 11)).toBe(PALETTE_SLOTS.asphalt);
    expect(terrain.columnAt(24, 24)?.height).toBe(12);

    // Il sentiero di un edificio successivo puo' arrivare al centro, ma non
    // deve cancellare il segno cromatico del catalizzatore gia' dipinto.
    builder.materialize([{ x: 30, y: 24, class: BUILDING_CLASS.production }]);
    while (builder.stats.surfaceQueued > 0) builder.step();
    expect(world.getBlock(24, 24, 11)).toBe(CLASS_PROFILE[BUILDING_CLASS.residential].accent);
  });

  it('bonifica la vegetazione che interseca un nuovo lotto', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);
    world.setBlock(11, 12, 12, PALETTE_SLOTS.wood);
    world.setBlock(11, 12, 13, PALETTE_SLOTS.grassLight);

    builder.materialize([{ x: 12, y: 12, class: BUILDING_CLASS.residential }]);

    expect(world.getBlock(11, 12, 12)).toBe(0);
    expect(world.getBlock(11, 12, 13)).toBe(0);
  });
});
