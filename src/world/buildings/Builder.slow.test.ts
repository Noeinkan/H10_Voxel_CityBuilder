import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  addCatalyst,
  createSimState,
  tick,
} from '../../sim';
import { VoxelWorld } from '../VoxelWorld';
import { generateIsland } from '../terrain/IslandGenerator';
import { Builder, REJECT_REASONS } from './Builder';
import type { BuildingRecord } from './BuildingRegistry';
import { BUILDER } from './config';

/**
 * Sentinelle end-to-end che fanno maturare un mondo intero.
 *
 * Restano fuori dal percorso rapido: il contratto del budget e' coperto in
 * millisecondi da `chunkBudget.test.ts`, mentre qui si conserva la prova che
 * crescita, gerarchia e promozioni arrivino insieme allo stesso risultato.
 */
describe('Builder — sentinelle lente', () => {
  it('nessun edificio alto sparisce in silenzio per budget di chunk', () => {
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
    const chunkBudget = REJECT_REASONS.indexOf('chunkBudget');

    expect(builder.stats.rejected[chunkBudget]).toBe(0);
    const tallest = Math.max(...records.map((record) => record.level));
    expect(tallest).toBeGreaterThan(BUILDER.upgradeThreshold.length - 1);
  });
});
