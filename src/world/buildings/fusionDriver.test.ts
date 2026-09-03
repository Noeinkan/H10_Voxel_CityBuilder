import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, addBuilding, createSimState, type SimState } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { StreetNetwork } from '../streets/StreetNetwork';
import { VoxelWorld } from '../VoxelWorld';
import type { BuildContext } from './buildContext';
import { BuildingRegistry, type BuildingRecord } from './BuildingRegistry';
import { ArchDriver } from './archDriver';
import { ClearanceSites } from './clearanceSite';
import { FUSION } from './config/fusion';
import { FusionDriver } from './fusionDriver';
import { GrowthQueue } from './growthQueue';
import { recordStamp } from './recordStamp';
import { SpanDriver } from './spanDriver';
import { SurfaceQueue } from './surfaceQueue';

const SEED = 1337;

/**
 * Un pezzo di citta' vero: le stesse parti che il `Builder` mette insieme.
 *
 * La fusione tocca il cantiere di sgombero e la coda di comparsa, e nessuno dei
 * due si puo' fingere: il cantiere chiude quando i voxel del condannato sono
 * spariti davvero, che e' esattamente la cosa che questa passata aspetta.
 */
function city() {
  const world = new VoxelWorld();
  const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
  const streets = new StreetNetwork(SEED);
  const registry = new BuildingRegistry();
  const growth = new GrowthQueue(world);
  const surface = new SurfaceQueue(world, terrain, streets, registry);
  const ctx: BuildContext = { world, terrain, streets, registry, growth, surface, seed: SEED };
  const spans = new SpanDriver(ctx);
  const clearance = new ClearanceSites(ctx, spans);
  return { ctx, terrain, streets, registry, growth, clearance, spans, world };
}

/** Posa un edificio vero: record, voxel e conteggio della simulazione. */
function place(
  ctx: BuildContext,
  state: SimState,
  at: { x: number; y: number; level: number; seed: number; class?: number; facing?: number },
): { record: BuildingRecord; state: SimState } {
  const baseZ = ctx.terrain.heightAt(at.x, at.y);
  const shape = {
    x: at.x,
    y: at.y,
    baseZ,
    footprint: 8,
    class: (at.class ?? BUILDING_CLASS.residential) as BuildingRecord['class'],
    level: at.level,
    seed: at.seed,
    facing: at.facing ?? 0,
  };
  const stamp = recordStamp({ ...shape, id: 0, height: 0 });
  const record = ctx.registry.add({ ...shape, height: stamp.sizeZ });
  ctx.growth.enqueue(record.id, { x: record.x, y: record.y, z: record.baseZ }, stamp);
  while (ctx.growth.queued > 0) ctx.growth.step();
  return {
    record,
    state: addBuilding(state, { x: record.x, y: record.y, class: record.class }),
  };
}

/**
 * Un vicinato abbastanza fitto perche' la gerarchia conceda la scala mega.
 *
 * Il tetto d'impronta lo decide `allowedLevel`, che legge quanto e' costruito
 * attorno: senza vicini la colonna resta corona e l'isolato concede il solo
 * modulo, cioe' il rifiuto `noRoom`. Sono la stessa condizione che in partita
 * arriva da sola dopo qualche minuto di crescita.
 */
function crowd(ctx: BuildContext, state: SimState, around: { x: number; y: number }): SimState {
  let next = state;
  let seed = 900;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
      const x = around.x + dx * 10;
      const y = around.y + dy * 10;
      if (ctx.registry.overlaps(x, y, 8, ctx.terrain.heightAt(x, y), 1)) continue;
      next = place(ctx, next, { x, y, level: 4, seed: seed++ }).state;
    }
  }
  return next;
}

describe('FusionDriver', () => {
  it('assorbe il vicino e diventa un assemblaggio', () => {
    const { ctx, streets, registry, growth, clearance, spans } = city();
    const block = streets.blockRect(streets.blockAt(100, 100));
    const hostAt = { x: block.x0, y: block.y0 };

    let state = createSimState();
    state = crowd(ctx, state, { x: hostAt.x + 8, y: hostAt.y + 8 });
    const host = place(ctx, state, { ...hostAt, level: FUSION.minLevel + 4, seed: 11 });
    state = host.state;
    const mate = place(ctx, state, {
      x: hostAt.x + 8, y: hostAt.y, level: FUSION.minLevel,
      seed: 12, class: BUILDING_CLASS.commercial,
    });
    state = mate.state;

    const driver = new FusionDriver(ctx, clearance, spans);
    // Il primo giro apre i cantieri; la fusione si compie quando hanno finito.
    state = driver.pass(state);
    expect(registry.get(mate.record.id)).not.toBeNull();

    for (let i = 0; i < 200 && registry.get(mate.record.id) !== null; i++) {
      state = clearance.pass(state);
      growth.step();
    }
    expect(registry.get(mate.record.id)).toBeNull();

    state = driver.pass(state);
    expect(driver.count).toBe(1);

    const fused = registry.get(host.record.id);
    expect(fused).not.toBeNull();
    if (fused === null) return;
    expect(fused.footprint).toBeGreaterThan(8);
    // **Un edificio in meno non e' un abitante in meno**: il sopravvissuto
    // dichiara anche l'uso di chi ha assorbito, e la simulazione lo conta.
    expect(fused.uses).toEqual([BUILDING_CLASS.residential, BUILDING_CLASS.commercial]);
    expect(registry.countsByClass[BUILDING_CLASS.commercial])
      .toBe(state.buildingCounts[BUILDING_CLASS.commercial]);
  });

  it('attraversa la strada quando i due si sono gia’ toccati', () => {
    // **E' l'incremento che chiude l'arco.** I due si sono trovati con una
    // campata, e qui smettono di essere due: il lotto del dirimpettaio diventa
    // un sedime del sopravvissuto, il mezzo braccio diventa l'arco intero, e
    // la carreggiata in mezzo resta carreggiata.
    const { ctx, registry, growth, clearance, spans } = city();
    const hostAt = { x: 100, y: 100 };

    const host = place(ctx, createSimState(), {
      ...hostAt, level: FUSION.minLevel + 3, seed: 21,
    });
    let state = host.state;
    const mate = place(ctx, state, {
      x: hostAt.x + 12, y: hostAt.y, level: FUSION.minLevel + 1,
      seed: 22, class: BUILDING_CLASS.commercial, facing: 1,
    });
    state = mate.state;

    new ArchDriver(ctx).pass();
    while (growth.queued > 0) growth.step();
    expect(registry.get(host.record.id)?.arch?.mate).toBe(mate.record.id);

    const driver = new FusionDriver(ctx, clearance, spans);
    state = driver.pass(state);
    for (let i = 0; i < 400 && registry.get(mate.record.id) !== null; i++) {
      state = clearance.pass(state);
      growth.step();
    }
    expect(registry.get(mate.record.id)).toBeNull();

    state = driver.pass(state);
    expect(driver.count).toBe(1);

    const fused = registry.get(host.record.id);
    expect(fused).not.toBeNull();
    if (fused === null) return;
    // L'impronta principale non si e' mossa: si e' aggiunto un secondo sedime.
    expect(fused.footprint).toBe(8);
    expect(fused.parts).toEqual([{ x: mate.record.x, y: mate.record.y, sizeX: 8, sizeY: 8 }]);
    // Il braccio non incontra piu' nessuno: `mate` a zero e' cio' che gli fa
    // specchiare la spalla e diventare una campata intera.
    expect(fused.arch?.mate).toBe(0);
    expect(fused.uses).toEqual([BUILDING_CLASS.residential, BUILDING_CLASS.commercial]);
    // **La strada resta di tutti**: il suolo fra i due sedimi non e' di nessuno.
    expect(registry.isOccupied(hostAt.x + 9, hostAt.y + 4)).toBe(false);
    expect(registry.isOccupied(mate.record.x, mate.record.y)).toBe(true);
  });

  it('non apre niente quando il vicino e’ cresciuto di piu’', () => {
    const { ctx, streets, registry, clearance, spans } = city();
    const block = streets.blockRect(streets.blockAt(100, 100));
    const hostAt = { x: block.x0, y: block.y0 };

    let state = createSimState();
    state = crowd(ctx, state, { x: hostAt.x + 8, y: hostAt.y + 8 });
    state = place(ctx, state, { ...hostAt, level: FUSION.minLevel, seed: 11 }).state;
    const mate = place(ctx, state, {
      x: hostAt.x + 8, y: hostAt.y, level: FUSION.minLevel + 4, seed: 12,
    });
    state = mate.state;

    const driver = new FusionDriver(ctx, clearance, spans);
    driver.pass(state);

    expect(driver.count).toBe(0);
    expect(registry.get(mate.record.id)).not.toBeNull();
  });
});
