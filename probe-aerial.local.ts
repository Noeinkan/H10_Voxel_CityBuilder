/**
 * Sonda: perche' `stacked` e' zero sulla citta' di prova della 4.9.
 * File `*.local.ts`, quindi fuori da git. Da cancellare a diagnosi fatta.
 */
import { BUILDING_CLASS, addCatalyst, createSimState, tick, type SimState } from './src/sim';
import { testTerrain } from './src/sim/testTerrain';
import { VoxelWorld } from './src/world/VoxelWorld';
import { Builder, REJECT_REASONS } from './src/world/buildings/Builder';
import { BUILDER, MAX_FOOTPRINT, MIN_FOOTPRINT } from './src/world/buildings/config';
import { footprintDepth, type BuildingRecord } from './src/world/buildings/BuildingRegistry';
import { AERIAL_LOT_PROBE } from './src/world/buildings/lotSearch';
import { ROUTE_PROBE } from './src/world/buildings/aerialDriver';
import { AERIAL_PART, isBuildable, type AerialPart } from './src/world/aerial/config';
import type { TerrainMap } from './src/world/terrain/TerrainMap';
import { nextBuildSites } from './src/sim/nextBuildSites';

function tickHeld(state: SimState, terrain: TerrainMap): SimState {
  return { ...tick(state, terrain), decayPressure: 0 };
}

const builds = 210;
const seed = 1337;
const world = new VoxelWorld();
const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
const builder = new Builder(world, terrain, seed);

let state = createSimState();
state = addCatalyst(state, {
  x: 128, y: 128, class: BUILDING_CLASS.residential, strength: 255, radius: 96,
});

for (let i = 0; i < builds * BUILDER.ticksPerBuild; i++) {
  state = tickHeld(state, terrain);
  state = builder.onTick(state);
  while (builder.stats.growing > 0) builder.step();
}
while (builder.stats.surfaceQueued > 0) builder.step();

const s = builder.stats;
console.log('--- sonda lotto in quota ---', JSON.stringify(AERIAL_LOT_PROBE));
console.log('--- sonda percorsi ---', JSON.stringify(ROUTE_PROBE));
console.log('--- stats ---');
console.log('placed', s.placed, 'terraces', s.terraces, 'routes', s.routes,
  'piers', s.piers, 'stacked', s.stacked, 'lifts', s.lifts, 'arcologies', s.arcologies);
console.log('rejected:', REJECT_REASONS.map((r, i) => `${r}=${s.rejected[i]}`).join(' '));
console.log('MIN_FOOTPRINT', MIN_FOOTPRINT, 'MAX_FOOTPRINT', MAX_FOOTPRINT);

const all = [...builder.registry.all];
const byPart = new Map<AerialPart, BuildingRecord[]>();
for (const r of all) {
  if (r.aerial === undefined) continue;
  const list = byPart.get(r.aerial) ?? [];
  list.push(r);
  byPart.set(r.aerial, list);
}
console.log('--- parti in quota ---');
for (const [part, list] of [...byPart].sort((a, b) => a[0] - b[0])) {
  const name = Object.entries(AERIAL_PART).find(([, v]) => v === part)?.[0];
  console.log(`${name} (${part}): ${list.length}`);
}

// Gli impalcati su cui si costruisce: che lato offrono davvero?
const decks = builder.registry.decks.filter((d) => d.aerial !== undefined && isBuildable(d.aerial));
console.log('--- impalcati edificabili ---', decks.length);
const sides = new Map<number, number>();
for (const d of decks) {
  const side = Math.min(d.footprint, footprintDepth(d), MAX_FOOTPRINT);
  sides.set(side, (sides.get(side) ?? 0) + 1);
}
console.log('lato utile (min sizeX,sizeY,MAX):',
  [...sides].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
const wide = decks.filter((d) => Math.min(d.footprint, footprintDepth(d), MAX_FOOTPRINT) >= MIN_FOOTPRINT);
console.log('abbastanza larghi per un edificio:', wide.length);

// Per quelli abbastanza larghi: le loro colonne passerebbero `columnIsFree`?
const roads = builder.roads;
let anyCandidate = 0;
const causes = new Map<string, number>();
function bump(k: string): void { causes.set(k, (causes.get(k) ?? 0) + 1); }
for (const d of wide) {
  let ok = true;
  const depth = footprintDepth(d);
  for (let dy = 0; dy < depth && ok; dy++) {
    for (let dx = 0; dx < d.footprint && ok; dx++) {
      const x = d.x + dx;
      const y = d.y + dy;
      if (roads.hasRoad(x, y)) { bump('carreggiata'); ok = false; break; }
      if (!terrain.isBuildable(x, y)) { bump('terreno non edificabile'); ok = false; break; }
    }
  }
  if (ok) anyCandidate++;
}
console.log('impalcati larghi le cui colonne non sono ne strada ne terreno rifiutato:', anyCandidate);
console.log('cause di scarto:', [...causes].map(([k, v]) => `${k}=${v}`).join(' '));

// La simulazione propone mai una colonna sotto un impalcato?
const deckCols = new Set<string>();
for (const d of decks) {
  for (let dy = 0; dy < footprintDepth(d); dy++) {
    for (let dx = 0; dx < d.footprint; dx++) deckCols.add(`${d.x + dx},${d.y + dy}`);
  }
}
console.log('colonne coperte da un impalcato edificabile:', deckCols.size);
let occupiedDeckCols = 0;
for (const key of deckCols) {
  const [x, y] = key.split(',').map(Number);
  if (builder.registry.isOccupied(x, y)) occupiedDeckCols++;
}
console.log('  di cui con suolo gia occupato:', occupiedDeckCols);

// Il quadrato libero piu' grande dentro ciascun impalcato, al suo piano.
console.log('--- quadrato libero dentro l impalcato ---');
const fits = new Map<number, number>();
for (const d of decks) {
  const z = d.baseZ + d.height;
  const sizeX = d.footprint;
  const sizeY = footprintDepth(d);
  const free: boolean[] = [];
  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      free.push(!builder.registry.overlaps(d.x + dx, d.y + dy, 1, z, 1));
    }
  }
  let best = 0;
  for (let side = Math.min(sizeX, sizeY, MAX_FOOTPRINT); side >= 1 && best === 0; side--) {
    for (let oy = 0; oy + side <= sizeY && best === 0; oy++) {
      for (let ox = 0; ox + side <= sizeX && best === 0; ox++) {
        let ok = true;
        for (let dy = 0; dy < side && ok; dy++) {
          for (let dx = 0; dx < side && ok; dx++) {
            if (!free[(oy + dy) * sizeX + (ox + dx)]) ok = false;
          }
        }
        if (ok) best = side;
      }
    }
  }
  fits.set(best, (fits.get(best) ?? 0) + 1);
}
console.log('lato del quadrato libero:',
  [...fits].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('impalcati che reggerebbero un lotto (lato >= MIN_FOOTPRINT):',
  [...fits].filter(([k]) => k >= MIN_FOOTPRINT).reduce((s, [, v]) => s + v, 0));

// Quante colonne con impalcato hanno headroom > quote spese, cioe' il campo le
// riproporrebbe?
let withHeadroom = 0;
for (const key of deckCols) {
  const [x, y] = key.split(',').map(Number);
  if (builder.registry.isOccupied(x, y)) withHeadroom++;
}
console.log('colonne con impalcato e suolo occupato (candidabili dal campo):', withHeadroom);

// Il campo propone mai una colonna con impalcato? Con lo stesso `headroomAt`
// che il Builder passa.
const headroomAt = (x: number, y: number): number => {
  let n = 1;
  for (const r of builder.registry.at(x, y)) {
    if (r.aerial !== undefined && isBuildable(r.aerial)) n++;
  }
  return n;
};
for (const limit of [32, 256, 4096]) {
  const sites = nextBuildSites(state, terrain, limit, { headroomAt });
  let onDeck = 0;
  for (const s of sites) if (deckCols.has(`${s.x},${s.y}`)) onDeck++;
  console.log(`siti proposti (limit ${limit}): ${sites.length}, di cui su impalcato: ${onDeck}`);
}

// E la stessa domanda su una singola colonna nota: che dice il campo?
const probeDeck = decks.find((d) =>
  Math.min(d.footprint, footprintDepth(d), MAX_FOOTPRINT) >= MIN_FOOTPRINT);
if (probeDeck !== undefined) {
  const x = probeDeck.x;
  const y = probeDeck.y;
  console.log('mensola di prova', x, y, 'baseZ', probeDeck.baseZ,
    'occupata', builder.registry.isOccupied(x, y),
    'headroom', headroomAt(x, y),
    'terreno edificabile', terrain.isBuildable(x, y));
}
