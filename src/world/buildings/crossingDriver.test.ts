import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { BIOME } from '../terrain/config';
import type { Region } from '../terrain/region';
import { VoxelWorld } from '../VoxelWorld';
import type { BuildContext } from './buildContext';
import { BuildingRegistry } from './BuildingRegistry';
import { CrossingDriver } from './crossingDriver';
import { GrowthQueue } from './growthQueue';
import { SpanDriver } from './spanDriver';

const PRIMARY: Region = { minX: -40, minY: -20, sizeX: 60, sizeY: 40 };
const SECONDARY: Region = { minX: 20, minY: -20, sizeX: 60, sizeY: 40 };

describe('CrossingDriver', () => {
  it('registra un ponte a budget, non prende suolo e segue i propri appoggi', () => {
    const world = new VoxelWorld();
    const registry = new BuildingRegistry();
    const growth = new GrowthQueue(world);
    const terrain = {
      heightAt: (x: number) => x >= 8 && x < 30 ? 8 : 20,
      biomeAt: (x: number) => x >= 8 && x < 30 ? BIOME.ocean : BIOME.plain,
    };
    const ctx = {
      world,
      terrain,
      registry,
      growth,
      seed: 1337,
    } as unknown as BuildContext;

    const primary = registry.add({
      x: 0, y: 0, baseZ: 20, footprint: 8, height: 64,
      class: BUILDING_CLASS.residential, level: 8, seed: 1,
    });
    const secondary = registry.add({
      x: 30, y: 0, baseZ: 20, footprint: 8, height: 64,
      class: BUILDING_CLASS.commercial, level: 8, seed: 2,
    });
    for (const tower of [primary, secondary]) {
      for (let y = tower.y; y < tower.y + tower.footprint; y++) {
        for (let x = tower.x; x < tower.x + tower.footprint; x++) {
          world.fillColumn(x, y, tower.baseZ, tower.baseZ + tower.height, PALETTE_SLOTS.concrete);
        }
      }
    }

    const driver = new CrossingDriver(ctx, PRIMARY);
    driver.register('east-0', SECONDARY);
    driver.pass();

    expect(driver.count).toBe(1);
    expect(registry.spanCount).toBe(1);
    expect(growth.queued).toBeGreaterThan(0);
    const bridge = registry.spans[0];
    expect(bridge.supports).toEqual([primary.id, secondary.id]);
    expect(registry.isOccupied(15, 3)).toBe(false);

    // Una promozione dell'appoggio passa dal driver delle campate: il ponte
    // lungo condivide lo stesso guinzaglio e non resta a mezz'aria.
    new SpanDriver(ctx).dropSupportedBy(primary.id);
    expect(driver.count).toBe(0);
    expect(registry.spanCount).toBe(0);
  });
});
