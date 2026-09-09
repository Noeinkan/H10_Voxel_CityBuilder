import { BUILDING_CLASS, addCatalyst, createSimState, tick, type SimState } from './src/sim';
import { testTerrain } from './src/sim/testTerrain';
import { VoxelWorld } from './src/world/VoxelWorld';
import { Builder } from './src/world/buildings/Builder';
import { BUILDER } from './src/world/buildings/config';
import type { TerrainMap } from './src/world/terrain/TerrainMap';

function tickHeld(state: SimState, terrain: TerrainMap): SimState {
  return { ...tick(state, terrain), decayPressure: 0 };
}

const world = new VoxelWorld();
const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
const builder = new Builder(world, terrain, 1337);
let state = createSimState();
state = addCatalyst(state, {
  x: 128, y: 128, class: BUILDING_CLASS.residential, strength: 255, radius: 96,
});
for (let i = 0; i < 20 * BUILDER.ticksPerBuild; i++) {
  state = tickHeld(state, terrain);
  state = builder.onTick(state);
  while (builder.stats.growing > 0) builder.step();
}
while (builder.stats.surfaceQueued > 0) builder.step();

const s = builder.stats;
console.log('placed', s.placed, 'terraces', s.terraces, 'stacked', s.stacked, 'piers', s.piers);
const records = [...builder.registry.all].filter((r) =>
  r.landmark === undefined && r.span === undefined && r.aerial === undefined);
const noFacing = records.filter((r) => r.facing === undefined);
console.log('edifici', records.length, 'senza facing', noFacing.length);
for (const r of noFacing.slice(0, 6)) {
  console.log('  id', r.id, r.x, r.y, 'baseZ', r.baseZ, 'supports', r.supports,
    'footprint', r.footprint, 'level', r.level);
  for (const under of builder.registry.at(r.x, r.y)) {
    console.log('    sotto:', under.id, 'aerial', under.aerial, 'baseZ', under.baseZ,
      'h', under.height, 'supports', under.supports);
  }
}
