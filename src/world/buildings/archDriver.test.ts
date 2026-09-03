import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { BIOME } from '../terrain/config';
import { VoxelWorld } from '../VoxelWorld';
import { ArchDriver } from './archDriver';
import type { BuildContext } from './buildContext';
import { BuildingRegistry, envelopeOf, type BuildingRecord } from './BuildingRegistry';
import { ARCH } from './config';
import { GrowthQueue } from './growthQueue';
import { recordStamp } from './recordStamp';

/** Un dirimpettaio: stesso seme dell'altro, cosi' le fasce cadono alle stesse quote. */
function draft(x: number, facing: number): Omit<BuildingRecord, 'id' | 'height'> {
  return {
    x,
    y: 0,
    baseZ: 0,
    footprint: 8,
    class: BUILDING_CLASS.residential,
    level: ARCH.minLevel + 2,
    seed: 4242,
    facing,
  };
}

function city(gap: number, mateFacing = 1): {
  driver: ArchDriver;
  registry: BuildingRegistry;
  growth: GrowthQueue;
  ids: readonly number[];
} {
  const world = new VoxelWorld();
  const registry = new BuildingRegistry();
  const growth = new GrowthQueue(world);
  const ctx = {
    world,
    registry,
    growth,
    seed: 1337,
    terrain: { heightAt: () => 0, has: () => true, biomeAt: () => BIOME.plain },
  } as unknown as BuildContext;

  const ids: number[] = [];
  for (const [x, facing] of [[0, 0], [8 + gap, mateFacing]]) {
    const shape = draft(x, facing);
    const height = recordStamp({ ...shape, id: 0, height: 0 }).sizeZ;
    ids.push(registry.add({ ...shape, height }).id);
  }

  return { driver: new ArchDriver(ctx), registry, growth, ids };
}

describe('ArchDriver', () => {
  it('fa crescere due bracci che si incontrano in mezzo alla strada', () => {
    const { driver, registry, growth, ids } = city(4);
    driver.pass();

    expect(driver.count).toBe(1);
    const [a, b] = ids.map((id) => registry.get(id));
    expect(a?.arch).toBeDefined();
    expect(b?.arch).toBeDefined();
    if (!a?.arch || !b?.arch) return;

    // La quota e' della coppia, non dei due, e i due bracci si toccano senza
    // sovrapporsi: e' cio' che permette all'arco di esistere senza che un record
    // entri nelle colonne dell'altro.
    expect(a.arch.z).toBe(b.arch.z);
    expect(a.arch.reach + b.arch.reach).toBe(4);
    expect(a.arch.mate).toBe(b.id);
    expect(b.arch.mate).toBe(a.id);
    expect(growth.queued).toBe(2);
  });

  it('prenota l’aria sopra la carreggiata e non il suolo', () => {
    // **E' l'invariante dello sbalzo, riletto sull'arco.** Il record entra in
    // `columns` sull'inviluppo — quindi niente ci si costruisce attraverso — e
    // in `groundColumns` sulla sola impronta, quindi sotto ci passa ancora la
    // carreggiata.
    const { driver, registry, ids } = city(4);
    driver.pass();

    const a = registry.get(ids[0]);
    expect(a).not.toBeNull();
    if (a === null) return;
    const env = envelopeOf(a);
    expect(env.sizeX).toBe(a.footprint + (a.arch?.reach ?? 0));
    const outside = a.x + a.footprint;
    expect(registry.at(outside, 3).some((r) => r.id === a.id)).toBe(true);
    expect(registry.isOccupied(outside, 3)).toBe(false);
  });

  it('non ne getta un secondo sulla stessa coppia', () => {
    const { driver } = city(4);
    driver.pass();
    driver.pass();

    expect(driver.count).toBe(1);
  });

  it('non attraversa un vuoto piu’ largo del massimo', () => {
    const { driver, registry, ids } = city(ARCH.maxGap + 2);
    driver.pass();

    expect(driver.count).toBe(0);
    expect(registry.get(ids[0])?.arch).toBeUndefined();
  });

  it('non lo concede a chi non e’ cresciuto abbastanza', () => {
    const world = new VoxelWorld();
    const registry = new BuildingRegistry();
    const growth = new GrowthQueue(world);
    const ctx = {
      world, registry, growth, seed: 1337,
      terrain: { heightAt: () => 0, has: () => true, biomeAt: () => BIOME.plain },
    } as unknown as BuildContext;

    for (const [x, facing] of [[0, 0], [12, 1]] as const) {
      const shape = { ...draft(x, facing), level: ARCH.minLevel - 1 };
      const height = recordStamp({ ...shape, id: 0, height: 0 }).sizeZ;
      registry.add({ ...shape, height });
    }

    const driver = new ArchDriver(ctx);
    driver.pass();
    expect(driver.count).toBe(0);
  });
});

describe('la coppia come la trova una citta vera', () => {
  it('accetta un dirimpettaio che guarda un’altra strada', () => {
    // **E' il caso dominante, misurato.** Su una citta' cresciuta, quarantacinque
    // coppie affacciate su quarantanove avevano i due fronti su assi diversi: in
    // questa maglia `facing` e' la strada *piu' vicina*, non il vuoto che si ha
    // davanti. Chiedendo i due fronti opposti la campata sarebbe stata una
    // macchina che nessuna partita accende.
    const { driver, registry, ids } = city(4, 2);
    driver.pass();

    expect(driver.count).toBe(1);
    const [a, b] = ids.map((id) => registry.get(id));
    expect(a?.arch?.face).toBe(0);
    expect(b?.arch?.face).toBe(1);
  });

  it('non tocca il fronte su cui il dirimpettaio sporge', () => {
    // Lo sbalzo e il braccio possono stare su due facce diverse: l'inviluppo
    // cresce su tutte e due, e il riquadro resta un riquadro.
    const { registry, ids, driver } = city(4, 2);
    driver.pass();

    const b = registry.get(ids[1]);
    expect(b).not.toBeNull();
    if (b === null || b.arch === undefined) return;
    const env = envelopeOf(b);
    expect(env.x).toBe(b.x - b.arch.reach);
    expect(env.sizeX).toBe(b.footprint + b.arch.reach + (b.facing === 0 ? (b.overhang ?? 0) : 0));
  });
});
