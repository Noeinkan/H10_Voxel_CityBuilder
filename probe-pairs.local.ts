/** Sonda: come sono fatte davvero le coppie di mensole che un percorso vorrebbe. */
import { BUILDING_CLASS, addCatalyst, createSimState, tick, type SimState } from './src/sim';
import { testTerrain } from './src/sim/testTerrain';
import { VoxelWorld } from './src/world/VoxelWorld';
import { Builder } from './src/world/buildings/Builder';
import { BUILDER } from './src/world/buildings/config';
import { footprintDepth, type BuildingRecord } from './src/world/buildings/BuildingRegistry';
import { AERIAL, AERIAL_PART } from './src/world/aerial/config';
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
for (let i = 0; i < 210 * BUILDER.ticksPerBuild; i++) {
  state = tickHeld(state, terrain);
  state = builder.onTick(state);
  while (builder.stats.growing > 0) builder.step();
}
while (builder.stats.surfaceQueued > 0) builder.step();

const registry = builder.registry;
const terraces = [...registry.all].filter((r) => r.aerial === AERIAL_PART.terrace);
console.log('mensole', terraces.length);

function openSideOf(r: BuildingRecord): { axis: 0 | 1; sign: number } | null {
  const hostId = r.supports?.[0];
  if (hostId === undefined) return null;
  const host = registry.get(hostId);
  if (host === null) return null;
  const dx = (2 * r.x + r.footprint) - (2 * host.x + host.footprint);
  const dy = (2 * r.y + footprintDepth(r)) - (2 * host.y + footprintDepth(host));
  if (dx === 0 && dy === 0) return null;
  return Math.abs(dx) >= Math.abs(dy)
    ? { axis: 0 as const, sign: Math.sign(dx) }
    : { axis: 1 as const, sign: Math.sign(dy) };
}

function gap(a: BuildingRecord, b: BuildingRecord): number {
  const gx = Math.max(a.x - (b.x + b.footprint), b.x - (a.x + a.footprint));
  const gy = Math.max(a.y - (b.y + footprintDepth(b)), b.y - (a.y + footprintDepth(a)));
  return Math.max(0, gx, gy);
}

// Per ogni mensola: la dirimpettaia vera (davanti, con le impronte che si
// guardano di traverso), la distanza e il dislivello.
let withFacing = 0;
const gaps = new Map<number, number>();
const drops = new Map<number, number>();
for (const a of terraces) {
  const open = openSideOf(a);
  if (open === null) continue;
  let best: BuildingRecord | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const b of terraces) {
    if (b.id === a.id) continue;
    const delta = open.axis === 0
      ? (2 * b.x + b.footprint) - (2 * a.x + a.footprint)
      : (2 * b.y + footprintDepth(b)) - (2 * a.y + footprintDepth(a));
    if (delta * open.sign <= 0) continue;
    const a0 = open.axis === 0 ? a.y : a.x;
    const a1 = a0 + (open.axis === 0 ? footprintDepth(a) : a.footprint);
    const b0 = open.axis === 0 ? b.y : b.x;
    const b1 = b0 + (open.axis === 0 ? footprintDepth(b) : b.footprint);
    if (!(a0 < b1 && b0 < a1)) continue;
    const d = gap(a, b);
    if (d > AERIAL.route.maxSeparation) continue;
    if (d < bestGap) { bestGap = d; best = b; }
  }
  if (best === null) continue;
  withFacing++;
  const bucket = Math.min(60, Math.floor(bestGap / 4) * 4);
  gaps.set(bucket, (gaps.get(bucket) ?? 0) + 1);
  const drop = Math.abs((a.baseZ + a.height) - (best.baseZ + best.height));
  const db = Math.min(40, Math.floor(drop / 4) * 4);
  drops.set(db, (drops.get(db) ?? 0) + 1);
}
console.log('mensole con una dirimpettaia entro maxSeparation:', withFacing);
console.log('distanza (a gruppi di 4):',
  [...gaps].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('dislivello (a gruppi di 4):',
  [...drops].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('minSeparation', AERIAL.route.minSeparation, 'stepPerNode', AERIAL.route.stepPerNode,
  'nodeSide', AERIAL.route.nodeSide, 'walkWidth', AERIAL.route.walkWidth);

// E quanto e' largo il vuoto fra due FRONTI (non fra due mensole): e' lo spazio
// che una coppia affacciata avrebbe a disposizione.
const hosts = new Set<number>();
for (const t of terraces) {
  const h = t.supports?.[0];
  if (h !== undefined) hosts.add(h);
}
console.log('ospiti con almeno una mensola:', hosts.size);

// Cosa c'e' davvero nel corridoio di una coppia affacciata, alla quota dei capi.
// Si guarda il registry, che e' cio' che `deckFits` guardera' comunque.
const WIDTH = AERIAL.route.walkWidth;
let corridors = 0;
const blockers = new Map<string, number>();
function bump(k: string): void { blockers.set(k, (blockers.get(k) ?? 0) + 1); }

for (const a of terraces) {
  const open = openSideOf(a);
  if (open === null) continue;
  for (const b of terraces) {
    if (b.id <= a.id) continue;
    const delta = open.axis === 0
      ? (2 * b.x + b.footprint) - (2 * a.x + a.footprint)
      : (2 * b.y + footprintDepth(b)) - (2 * a.y + footprintDepth(a));
    if (delta * open.sign <= 0) continue;
    const d = gap(a, b);
    if (d < AERIAL.route.minSeparation || d > AERIAL.route.maxSeparation) continue;
    const a0 = open.axis === 0 ? a.y : a.x;
    const a1 = a0 + (open.axis === 0 ? footprintDepth(a) : a.footprint);
    const b0 = open.axis === 0 ? b.y : b.x;
    const b1 = b0 + (open.axis === 0 ? footprintDepth(b) : b.footprint);
    const lo = Math.max(a0, b0);
    const hi = Math.min(a1, b1);
    if (hi - lo < WIDTH) continue;

    corridors++;
    const z = Math.max(a.baseZ + a.height, b.baseZ + b.height) - 1;
    const from = open.sign > 0
      ? (open.axis === 0 ? a.x + a.footprint : a.y + footprintDepth(a))
      : (open.axis === 0 ? b.x + b.footprint : b.y + footprintDepth(b));
    const to = open.sign > 0
      ? (open.axis === 0 ? b.x : b.y) - 1
      : (open.axis === 0 ? a.x : a.y) - 1;

    let kind = 'libero';
    outer:
    for (let along = from; along <= to; along++) {
      for (let cross = lo; cross < lo + WIDTH; cross++) {
        const x = open.axis === 0 ? along : cross;
        const y = open.axis === 0 ? cross : along;
        for (const rec of registry.at(x, y)) {
          if (rec.id === a.id || rec.id === b.id) continue;
          if (rec.baseZ >= z + AERIAL.clearance || rec.baseZ + rec.height <= z) continue;
          kind = rec.aerial === undefined ? 'edificio'
            : rec.aerial === AERIAL_PART.terrace ? 'mensola'
              : rec.aerial === AERIAL_PART.pier ? 'gamba' : 'altro in quota';
          break outer;
        }
      }
    }
    bump(kind);
  }
}
console.log('corridoi affacciati misurati:', corridors);
console.log('primo ostacolo:', [...blockers].map(([k, v]) => `${k}=${v}`).join(' '));
