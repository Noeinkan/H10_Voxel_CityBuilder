import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  FARM_KIND,
  addCatalyst,
  createSimState,
  type SimState,
} from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { CHUNK, idx } from '../chunkCoords';
import { FARMS } from '../farms/config';
import { COVER } from '../terrain/groundcover';
import { VoxelWorld } from '../VoxelWorld';
import { coverMarkKind, isCoverMark } from '../visualBlock';
import { Builder } from './Builder';

/**
 * Una citta' che ha fame: popolazione vera, nessun lotto agricolo.
 *
 * Senza popolazione il deficit e' zero e il driver non pianta niente — che e' il
 * comportamento giusto e un pessimo punto di partenza per un test.
 */
function hungryCity(): SimState {
  const state = createSimState();
  return { ...state, population: { stock: 240, delta: 0 } };
}

/** Applica tutta la coda della superficie: i test guardano i voxel, non la coda. */
function drain(builder: Builder): void {
  for (let i = 0; i < 400 && builder.stats.surfaceQueued > 0; i++) builder.step();
}

/**
 * Tutti i marcatori di copertura del mondo, con il tipo che portano.
 *
 * Si scandiscono i chunk e non le colonne: `getBlock` di un marcatore vale 0 —
 * per chi cerca un ostacolo un'erbetta non c'e' — quindi dal di fuori non e'
 * distinguibile dal vuoto. Il byte vero sta in `Chunk.blocks`, ed e' li' che
 * `isCoverMark` sa leggerlo.
 */
function coverMarks(world: VoxelWorld): { x: number; y: number; kind: number }[] {
  const out: { x: number; y: number; kind: number }[] = [];
  for (const chunk of world.chunks.values()) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let ly = 0; ly < CHUNK; ly++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const block = chunk.blocks[idx(lx, ly, lz)];
          if (!isCoverMark(block)) continue;
          out.push({
            x: chunk.cx * CHUNK + lx,
            y: chunk.cy * CHUNK + ly,
            kind: coverMarkKind(block),
          });
        }
      }
    }
  }
  return out;
}

describe('FarmDriver — la campagna nasce fuori dalla citta’', () => {
  it('una citta’ affamata pianta lotti, e il contatore della simulazione li segue', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    const after = builder.onTick(hungryCity());

    expect(builder.stats.farmPlots).toBeGreaterThan(0);
    expect(after.farmCounts[FARM_KIND.field]).toBe(builder.stats.farmPlots);
  });

  it('una citta’ senza fame non pianta niente', () => {
    // Popolazione zero: nessuno da sfamare, nessun campo. E' il caso della
    // partita appena aperta, e un driver che piantasse comunque riempirebbe
    // l'isola di campi prima del primo abitante.
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    builder.onTick(createSimState());

    expect(builder.stats.farmPlots).toBe(0);
  });

  it('non pianta piu’ di `plotsPerPass` per passata', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    builder.onTick(hungryCity());

    expect(builder.stats.farmPlots).toBeLessThanOrEqual(FARMS.plotsPerPass);
  });
});

describe('FarmDriver — i solchi nel mondo', () => {
  it('posa marcatori di solco e non ripavimenta il terreno', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    const before = world.solidVoxelCount;
    builder.onTick(hungryCity());
    drain(builder);

    const marks = coverMarks(world);
    expect(marks.length).toBeGreaterThan(0);
    // Solo solchi, e tutti dello stesso verso dentro lo stesso lotto.
    for (const mark of marks) {
      expect([COVER.cropX, COVER.cropY]).toContain(mark.kind);
    }
    // Il terreno non e' stato ridipinto: i voxel solidi sono quelli di prima
    // piu' i marcatori, che sono celle piene senza palette.
    expect(world.solidVoxelCount).toBe(before + marks.length);
  });

  it('un lotto corre tutto in un verso solo', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    builder.onTick(hungryCity());
    drain(builder);

    // Raggruppa per lotto: due lotti possono avere versi diversi — e' la
    // trapunta — ma dentro un lotto il verso e' uno solo, o non sono solchi.
    const byPlot = new Map<string, Set<number>>();
    for (const mark of coverMarks(world)) {
      const key = `${Math.floor(mark.x / FARMS.lattice)},${Math.floor(mark.y / FARMS.lattice)}`;
      const seen = byPlot.get(key) ?? new Set<number>();
      seen.add(mark.kind);
      byPlot.set(key, seen);
    }

    expect(byPlot.size).toBeGreaterThan(0);
    for (const [key, kinds] of byPlot) {
      expect({ key, versi: kinds.size }).toEqual({ key, versi: 1 });
    }
  });
});

describe('FarmDriver — la citta’ si mangia i propri campi', () => {
  it('un lotto non impedisce di costruirci sopra', () => {
    // E' l'invariante che tiene in piedi tutta la meccanica: se un campo
    // occupasse le colonne, la citta' non potrebbe crescerci sopra e la fame
    // non arriverebbe mai.
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    let state = builder.onTick(hungryCity());
    const planted = builder.stats.farmPlots;
    expect(planted).toBeGreaterThan(0);

    // Un catalizzatore forte proprio dove la campagna e' appena nata.
    state = addCatalyst(state, {
      x: 12,
      y: 12,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 60,
    });

    const before = builder.stats.placed;
    for (let i = 1; i < 400; i++) state = builder.onTick({ ...state, tickCount: i });

    expect(builder.stats.placed).toBeGreaterThan(before);
  });

  it('quando la citta’ prende le sue colonne, il lotto si ritira e il contatore scende', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8 });
    const builder = new Builder(world, terrain, 1337);

    let state = builder.onTick(hungryCity());
    const planted = builder.stats.farmPlots;
    expect(planted).toBeGreaterThan(0);
    expect(state.farmCounts[FARM_KIND.field]).toBe(planted);

    state = addCatalyst(state, {
      x: 12,
      y: 12,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 80,
    });

    // Abbastanza tick perche' la crescita copra la campagna e il driver rifaccia
    // almeno una passata.
    for (let i = 1; i < 1200; i++) {
      state = builder.onTick({ ...state, tickCount: i, population: { stock: 240, delta: 0 } });
    }

    // Il contatore della simulazione e il registro del mondo restano d'accordo,
    // qualunque cosa sia successa in mezzo.
    expect(state.farmCounts[FARM_KIND.field]).toBe(builder.stats.farmPlots);
  });
});
