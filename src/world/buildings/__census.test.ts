import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  addCatalyst,
  createSimState,
  tick,
  urbanProfileAt,
} from '../../sim';
import { VoxelWorld } from '../VoxelWorld';
import { generateIsland } from '../terrain/IslandGenerator';
import { Builder } from './Builder';
import type { BuildingRecord } from './BuildingRegistry';
import { BUILDER } from './config';

/** Censimento temporaneo: quale tipologia domina una citta' matura. */
describe('census', () => {
  it('conta le tipologie', () => {
    const world = new VoxelWorld();
    const { map } = generateIsland(world, 4242, {
      minX: 0,
      minY: 0,
      sizeX: 256,
      sizeY: 256,
    });
    const builder = new Builder(world, map, 4242);

    let state = addCatalyst(createSimState(), {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    for (let i = 0; i < 450 * BUILDER.ticksPerBuild; i++) {
      state = tick(state, map);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    const records: BuildingRecord[] = [...builder.registry.all].filter((record) =>
      record.landmark === undefined &&
      record.span === undefined &&
      record.aerial === undefined);

    const byTypology = new Map<string, number>();
    const byLevel = new Map<number, number>();
    let wealthSum = 0;
    let wealthHigh = 0;
    for (const record of records) {
      const id = record.typology ?? '(none)';
      byTypology.set(id, (byTypology.get(id) ?? 0) + 1);
      byLevel.set(record.level, (byLevel.get(record.level) ?? 0) + 1);
      const profile = urbanProfileAt(state, record.x, record.y);
      wealthSum += profile.wealth;
      if (profile.wealth >= 0.6) wealthHigh++;
    }

    const rows = [...byTypology.entries()].sort((a, b) => b[1] - a[1]);
    console.log('edifici', records.length);
    console.log('tipologie', rows.map(([id, n]) =>
      `${id}=${n} (${Math.round((n / records.length) * 100)}%)`).join('  '));
    console.log('livelli', [...byLevel.entries()].sort((a, b) => a[0] - b[0])
      .map(([lvl, n]) => `${lvl}:${n}`).join(' '));
    console.log('wealth media', (wealthSum / records.length).toFixed(2),
      'sopra 0.6:', wealthHigh, `(${Math.round((wealthHigh / records.length) * 100)}%)`);

    expect(records.length).toBeGreaterThan(0);
  });
});
