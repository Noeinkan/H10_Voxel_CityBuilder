import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, addBuilding, addCatalyst, createSimState, tick } from '../../sim';
import { StreetNetwork } from '../streets/StreetNetwork';
import { STREETS } from '../streets/config';
import { FACING } from '../streets/streetGrid';
import type { BuildingRecord } from './BuildingRegistry';
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
    builder.materialize([{ x: 30, y: 24, class: BUILDING_CLASS.industrial }]);
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

/**
 * Il gate della fase 4.1, verificato invece che dichiarato: un edificio nato da
 * un candidato della simulazione deve trovarsi sul fronte strada, con la faccia
 * d'accento e il portale rivolti alla carreggiata, e senza mai occupare la
 * carreggiata stessa.
 */
describe('Builder — allineamento alla rete stradale', () => {
  function grow(seed: number, rounds: number): {
    world: VoxelWorld;
    builder: Builder;
    records: readonly BuildingRecord[];
  } {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });
    const builder = new Builder(world, terrain, seed);

    let state = createSimState();
    state = addCatalyst(state, {
      x: 64,
      y: 64,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 48,
    });

    for (let i = 0; i < rounds; i++) {
      state = tick(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, builder, records: [...builder.registry.all] };
  }

  /** true se la carreggiata sta davvero sul lato verso cui l'edificio affaccia. */
  function pavementOnFacing(streets: StreetNetwork, record: BuildingRecord): boolean {
    const side = record.footprint;
    for (let d = 0; d < side; d++) {
      switch (record.facing) {
        case FACING.east:
          if (streets.isPavement(record.x + side, record.y + d)) return true;
          break;
        case FACING.west:
          if (streets.isPavement(record.x - 1, record.y + d)) return true;
          break;
        case FACING.north:
          if (streets.isPavement(record.x + d, record.y + side)) return true;
          break;
        default:
          if (streets.isPavement(record.x + d, record.y - 1)) return true;
      }
    }
    return false;
  }

  it('ogni edificio nasce con un fronte sulla carreggiata', () => {
    const streets = new StreetNetwork(1337);
    const { records } = grow(1337, 40);

    expect(records.length).toBeGreaterThan(5);
    for (const record of records) {
      expect(record.facing).toBeDefined();
      expect(pavementOnFacing(streets, record)).toBe(true);
    }
  });

  it('nessun edificio occupa la carreggiata', () => {
    const streets = new StreetNetwork(1337);
    const { records } = grow(1337, 40);

    for (const record of records) {
      for (let dy = 0; dy < record.footprint; dy++) {
        for (let dx = 0; dx < record.footprint; dx++) {
          expect(streets.isPavement(record.x + dx, record.y + dy)).toBe(false);
        }
      }
    }
  });

  it('la carreggiata viene dipinta sul suolo attorno agli isolati costruiti', () => {
    const { world } = grow(1337, 40);

    let minor = 0;
    let arterial = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const block = world.getBlock(x, y, 11);
        if (block === STREETS.minorPalette) minor++;
        else if (block === STREETS.arterialPalette) arterial++;
      }
    }

    // Entrambe le gerarchie devono comparire: una citta' con i soli assi
    // secondari non ha una struttura leggibile, e una con i soli principali
    // non ha isolati.
    expect(minor).toBeGreaterThan(0);
    expect(arterial).toBeGreaterThan(0);
  });

  it('a parita di seed la citta e identica', () => {
    const a = grow(1337, 30).records.map((r) => `${r.x},${r.y},${r.footprint},${r.facing}`);
    const b = grow(1337, 30).records.map((r) => `${r.x},${r.y},${r.footprint},${r.facing}`);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
  });
});
