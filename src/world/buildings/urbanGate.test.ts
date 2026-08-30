import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  addCatalyst,
  createSimState,
  tick,
  type SimState,
} from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { SCALE } from '../scale';
import { SKYLINE } from '../skyline/config';
import { isPeakBlock } from '../skyline/tiers';
import { StreetNetwork } from '../streets/StreetNetwork';
import type { BlockId, BlockRect } from '../streets/streetGrid';
import type { Lot } from '../streets/lots';
import { buildStamp } from './assemble';
import { Builder } from './Builder';
import type { BuildingRegistry, ReadonlyBuildingRegistry } from './BuildingRegistry';
import { BUILDER, MAX_FOOTPRINT } from './config';

/** Il confine di fase letto attraverso il vero percorso `Builder.findLot`. */
describe('Builder — gate degli assemblaggi urbani', () => {
  const seed = 1337;

  interface Probe {
    readonly builder: Builder;
    readonly registry: BuildingRegistry;
    readonly streets: StreetNetwork;
    readonly state: SimState;
    readonly rect: BlockRect;
    readonly centerX: number;
    readonly centerY: number;
    findLot(x: number, y: number, state: SimState): Lot | null;
  }

  function peakAndPlain(): { peak: BlockId; plain: BlockId } {
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    for (let ky = 1; ky < 9; ky++) {
      for (let kx = 1; kx < 9; kx++) {
        if (!isPeakBlock(seed, kx, ky)) continue;
        for (const [dx, dy] of steps) {
          const plain = { kx: kx + dx, ky: ky + dy };
          if (!isPeakBlock(seed, plain.kx, plain.ky)) {
            return { peak: { kx, ky }, plain };
          }
        }
      }
    }
    throw new Error('nessun picco con un vicino ordinario');
  }

  function probe(block: BlockId, mature: boolean): Probe {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 16, chunksY: 16, height: 24 });
    const builder = new Builder(world, terrain, seed);
    const streets = new StreetNetwork(seed);
    const rect = streets.blockRect(block);
    const centerX = rect.x0 + ((rect.x1 - rect.x0) >> 1);
    const centerY = rect.y0 + ((rect.y1 - rect.y0) >> 1);
    const internals = builder as unknown as {
      ctx: { registry: ReadonlyBuildingRegistry };
      findLot(x: number, y: number, state: SimState): Lot | null;
    };

    if (mature) {
      const real = internals.ctx.registry;
      internals.ctx.registry = new Proxy(real, {
        get(target, property, receiver) {
          if (property === 'countWithinRadius') return () => SKYLINE.edgeCore;
          const value: unknown = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }

    const state = addCatalyst(createSimState(), {
      x: centerX,
      y: centerY,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    return {
      builder,
      registry: builder.registry as BuildingRegistry,
      streets,
      state,
      rect,
      centerX,
      centerY,
      findLot: internals.findLot.bind(builder),
    };
  }

  function blockSide(rect: BlockRect): number {
    return Math.min(rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);
  }

  it('la citta iniziale resta entro otto anche in un isolato eletto', () => {
    const { peak } = peakAndPlain();
    const city = probe(peak, false);
    expect(city.findLot(city.centerX, city.centerY, city.state)?.footprint)
      .toBeLessThanOrEqual(MAX_FOOTPRINT);
  });

  it('un core maturo non eletto resta entro otto', () => {
    const { plain } = peakAndPlain();
    const city = probe(plain, true);
    expect(city.findLot(city.centerX, city.centerY, city.state)?.footprint)
      .toBeLessThanOrEqual(MAX_FOOTPRINT);
  });

  it('il picco maturo eletto usa il lato libero e passa all assemblatore', () => {
    const { peak } = peakAndPlain();
    const city = probe(peak, true);
    const lot = city.findLot(city.centerX, city.centerY, city.state);
    expect(lot?.footprint).toBe(blockSide(city.rect));
    expect(lot?.footprint).toBeGreaterThan(MAX_FOOTPRINT);
    if (lot === null) return;

    const stamp = buildStamp({
      class: BUILDING_CLASS.residential,
      level: BUILDER.maxLevel,
      seed,
    }, lot.footprint);
    expect([stamp.sizeX, stamp.sizeY]).toEqual([lot.footprint, lot.footprint]);
  });

  it('cercando nei vicini rivaluta il gate del blocco trovato', () => {
    const { peak, plain } = peakAndPlain();
    const city = probe(peak, true);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const block = { kx: peak.kx + dx, ky: peak.ky + dy };
        if (block.kx === plain.kx && block.ky === plain.ky) continue;
        const rect = city.streets.blockRect(block);
        city.registry.reserveRect({
          x: rect.x0,
          y: rect.y0,
          sizeX: rect.x1 - rect.x0 + 1,
          sizeY: rect.y1 - rect.y0 + 1,
        });
      }
    }

    const lot = city.findLot(city.centerX, city.centerY, city.state);
    expect(lot).not.toBeNull();
    if (lot === null) return;
    expect(city.streets.blockAt(lot.x, lot.y)).toEqual(plain);
    expect(lot.footprint).toBeLessThanOrEqual(MAX_FOOTPRINT);
  });

  it('stesso stato e seed producono la stessa decisione e lo stesso stamp', () => {
    const { peak } = peakAndPlain();
    const a = probe(peak, true);
    const b = probe(peak, true);
    const lotA = a.findLot(a.centerX, a.centerY, a.state);
    const lotB = b.findLot(b.centerX, b.centerY, b.state);
    expect(lotB).toEqual(lotA);
    if (lotA === null || lotB === null) return;

    const request = { class: BUILDING_CLASS.residential, level: BUILDER.maxLevel, seed };
    const stampA = buildStamp(request, lotA.footprint);
    const stampB = buildStamp(request, lotB.footprint);
    expect(Array.from(stampB.voxels)).toEqual(Array.from(stampA.voxels));
    expect(Array.from(stampB.surfaces)).toEqual(Array.from(stampA.surfaces));
  });

  it('gli upgrade allargano per gradini, e l isolato intero resta al picco', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const builder = new Builder(world, terrain, seed);
    const streets = new StreetNetwork(seed);
    let state = addCatalyst(createSimState(), {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    for (let i = 0; i < 60 * BUILDER.ticksPerBuild; i++) {
      state = tick(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }

    const ordinary = [...builder.registry.all].filter((record) =>
      record.landmark === undefined && record.arcology === undefined &&
      record.span === undefined && record.aerial === undefined && record.ropeway === undefined);
    expect(ordinary.length).toBeGreaterThan(20);
    for (const record of ordinary) {
      if (record.footprint <= MAX_FOOTPRINT) continue;
      const block = streets.blockAt(record.x, record.y);
      const rect = streets.blockRect(block);
      const side = Math.min(rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);

      // **Oltre il modulo si va per gradini, non per interruttore.** Un isolato
      // ordinario puo' arrivare alla scala mega quando la gerarchia lo ammette;
      // il lato libero dell'isolato resta invece il premio del picco, ed e'
      // quello l'invariante che questo test difende.
      if (record.footprint > SCALE.megaFootprint) {
        expect(isPeakBlock(seed, block.kx, block.ky)).toBe(true);
      }
      expect(record.footprint).toBeLessThanOrEqual(side);
    }
  });
});
