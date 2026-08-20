import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, addBuilding, addCatalyst, createSimState, tick } from '../../sim';
import { StreetNetwork } from '../streets/StreetNetwork';
import { STREETS } from '../streets/config';
import { FACING } from '../streets/streetGrid';
import type { BuildingRecord } from './BuildingRegistry';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { generateIsland } from '../terrain/IslandGenerator';
import { SURFACE_KIND } from '../visualBlock';
import { Builder } from './Builder';
import { BUILDER, CLASS_PROFILE } from './config';
import { GRADING } from '../grading/config';
import { GROUND, groundKindOf, type GroundKind } from '../grading/grade';
import { TERRAIN } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';

describe('Builder', () => {
  it('trasforma un candidato della simulazione in voxel e occupazione', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);
    let state = createSimState();
    state = addCatalyst(state, {
      x: 24,
      y: 24,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 20,
    });

    state = builder.onTick(state);
    expect(builder.stats.placed).toBeGreaterThan(0);
    expect(state.buildings).toHaveLength(builder.stats.placed);
    expect(builder.registry.count).toBe(builder.stats.placed);

    while (builder.stats.growing > 0) builder.step();
    expect(world.solidVoxelCount).toBeGreaterThan(0);
  });

  it('materializza subito gli edifici gia presenti nello stato', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);
    const state = addBuilding(createSimState(), {
      x: 12,
      y: 12,
      class: BUILDING_CLASS.residential,
    });

    builder.materialize(state.buildings);

    expect(builder.registry.count).toBe(1);
    expect(builder.stats.growing).toBe(0);
    expect(world.solidVoxelCount).toBeGreaterThan(0);
    expect(world.getSurfaceKind(12, 12, 12)).not.toBe(SURFACE_KIND.plain);
  });

  it('dipinge una piazzola di catalizzatore a budget senza cambiare la quota', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);

    builder.decorateCatalyst(24, 24, BUILDING_CLASS.residential);
    expect(builder.stats.surfaceQueued).toBeGreaterThan(0);
    while (builder.stats.surfaceQueued > 0) builder.step();

    expect(world.getBlock(24, 24, 11)).toBe(CLASS_PROFILE[BUILDING_CLASS.residential].accent);
    expect(world.getBlock(25, 24, 11)).toBe(PALETTE_SLOTS.asphalt);
    expect(terrain.columnAt(24, 24)?.height).toBe(12);

    // Il sentiero di un edificio successivo puo' arrivare al centro, ma non
    // deve cancellare il segno cromatico del catalizzatore gia' dipinto.
    builder.materialize([{ x: 30, y: 24, class: BUILDING_CLASS.industrial }]);
    while (builder.stats.surfaceQueued > 0) builder.step();
    expect(world.getBlock(24, 24, 11)).toBe(CLASS_PROFILE[BUILDING_CLASS.residential].accent);
  });

  it('bonifica la vegetazione che interseca un nuovo lotto', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);
    world.setBlock(11, 12, 12, PALETTE_SLOTS.wood);
    world.setBlock(11, 12, 13, PALETTE_SLOTS.grassLight);

    builder.materialize([{ x: 12, y: 12, class: BUILDING_CLASS.residential }]);

    expect(world.getBlock(11, 12, 12)).toBe(0);
    expect(world.getBlock(11, 12, 13)).toBe(0);
  });
});

/**
 * Il gate della fase 4.1, verificato invece che dichiarato: un edificio nato da
 * un candidato della simulazione deve trovarsi sul fronte strada, con la faccia
 * d'accento e il portale rivolti alla carreggiata, e senza mai occupare la
 * carreggiata stessa.
 */
describe('Builder — allineamento alla rete stradale', () => {
  function grow(seed: number, rounds: number): {
    world: VoxelWorld;
    builder: Builder;
    records: readonly BuildingRecord[];
  } {
    const world = new VoxelWorld();
    // Otto colonne di chunk e non quattro: con il passo della maglia a 22 e un
    // asse principale ogni quattro, il primo arteriale dopo l'origine cade a
    // ottantotto colonne. Su 128 la citta' non ci arrivava, e il test avrebbe
    // letto "nessun asse principale" dove il vero problema era la fixture.
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const builder = new Builder(world, terrain, seed);

    let state = createSimState();
    state = addCatalyst(state, {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    for (let i = 0; i < rounds; i++) {
      state = tick(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, builder, records: [...builder.registry.all] };
  }

  /** true se la carreggiata sta davvero sul lato verso cui l'edificio affaccia. */
  function pavementOnFacing(streets: StreetNetwork, record: BuildingRecord): boolean {
    const side = record.footprint;
    for (let d = 0; d < side; d++) {
      switch (record.facing) {
        case FACING.east:
          if (streets.isPavement(record.x + side, record.y + d)) return true;
          break;
        case FACING.west:
          if (streets.isPavement(record.x - 1, record.y + d)) return true;
          break;
        case FACING.north:
          if (streets.isPavement(record.x + d, record.y + side)) return true;
          break;
        default:
          if (streets.isPavement(record.x + d, record.y - 1)) return true;
      }
    }
    return false;
  }

  it('ogni edificio nasce con un fronte sulla carreggiata', () => {
    const streets = new StreetNetwork(1337);
    const { records } = grow(1337, 40);

    expect(records.length).toBeGreaterThan(5);
    for (const record of records) {
      expect(record.facing).toBeDefined();
      expect(pavementOnFacing(streets, record)).toBe(true);
    }
  });

  it('nessun edificio occupa la carreggiata', () => {
    const streets = new StreetNetwork(1337);
    const { records } = grow(1337, 40);

    for (const record of records) {
      for (let dy = 0; dy < record.footprint; dy++) {
        for (let dx = 0; dx < record.footprint; dx++) {
          expect(streets.isPavement(record.x + dx, record.y + dy)).toBe(false);
        }
      }
    }
  });

  it('la carreggiata viene dipinta sul suolo attorno agli isolati costruiti', () => {
    const { world } = grow(1337, 40);

    let minor = 0;
    let arterial = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const block = world.getBlock(x, y, 23);
        if (block === STREETS.minorPalette) minor++;
        else if (block === STREETS.arterialPalette) arterial++;
      }
    }

    // Entrambe le gerarchie devono comparire: una citta' con i soli assi
    // secondari non ha una struttura leggibile, e una con i soli principali
    // non ha isolati.
    expect(minor).toBeGreaterThan(0);
    expect(arterial).toBeGreaterThan(0);
  });

  it('a parita di seed la citta e identica', () => {
    const a = grow(1337, 30).records.map((r) => `${r.x},${r.y},${r.footprint},${r.facing}`);
    const b = grow(1337, 30).records.map((r) => `${r.x},${r.y},${r.footprint},${r.facing}`);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
  });
});

/**
 * Le opere di terra non si vedono su un terreno piatto: la fixture piana dei
 * test precedenti le lascerebbe tutte spente. Qui il rilievo e' scritto dal
 * test — un fianco a gradoni, una linea di costa — e bioma ed edificabilita' li
 * ricava `testTerrain` dalle stesse funzioni del generatore, cosi' le colonne
 * sono classificate come lo sarebbero sull'isola vera.
 */
describe('Builder — opere di terra', () => {
  /** Fianco a gradoni: strisce ripide e strisce dolci alternate. */
  function hillside(): TerrainMap {
    return testTerrain({
      chunksX: 4,
      chunksY: 4,
      heightAt: (x) => 24 + Math.floor(x / 6),
      // Le strisce ripide non sono `buildable`: prima della 4.2 la citta' le
      // saltava del tutto, e sono meta' del fianco.
      slopeAt: (x) => (Math.floor(x / 8) % 2 === 0 ? 0.2 : 0.4),
    });
  }

  /** Costa: fondale, battigia e pianura in sequenza lungo x. */
  function coast(): TerrainMap {
    return testTerrain({
      chunksX: 4,
      chunksY: 4,
      heightAt: (x) => Math.max(4, Math.min(36, 4 + Math.floor(x / 2))),
      slopeAt: () => 0.15,
    });
  }

  function grow(terrain: TerrainMap, anchor: number, rounds: number): {
    world: VoxelWorld;
    builder: Builder;
    records: readonly BuildingRecord[];
  } {
    const world = new VoxelWorld();
    const builder = new Builder(world, terrain, 1337);

    let state = createSimState();
    state = addCatalyst(state, {
      x: anchor,
      y: 64,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 80,
    });

    for (let i = 0; i < rounds; i++) {
      state = tick(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, builder, records: [...builder.registry.all] };
  }

  /**
   * Un'isola vera con sopra una citta' cresciuta dalla costa.
   *
   * Il catalizzatore va sulla colonna edificabile piu' vicina al mare: e' li'
   * che battigia, bassofondo e fianco stanno tutti dentro il raggio in cui la
   * citta' arriva davvero, e quindi l'unico posto da cui le quattro opere si
   * osservano tutte nello stesso mondo.
   */
  function growIsland(): {
    world: VoxelWorld;
    map: TerrainMap;
    builder: Builder;
  } {
    const world = new VoxelWorld();
    // Lato 256 e non 128: la calibrazione verticale di `TERRAIN` e' tarata su
    // 512, e sotto i 256 il tetto di `maxReliefSlope` schiaccia l'isola tutta
    // sotto `beachMaxHeight` — niente terra edificabile, niente fianchi, niente
    // da terrazzare. A 256 le pendenze sono gia' quelle vere; manca solo la
    // fascia rocciosa, che qui non serve.
    const { map } = generateIsland(world, 4242, { minX: 0, minY: 0, sizeX: 256, sizeY: 256 });

    const anchor = seaward(map);
    const builder = new Builder(world, map, 4242);
    let state = createSimState();
    state = addCatalyst(state, {
      x: anchor.x,
      y: anchor.y,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 80,
    });

    for (let i = 0; i < 60; i++) {
      state = tick(state, map);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, map, builder };
  }

  /** I tipi di terreno sotto l'impronta di un edificio. */
  function lotGround(terrain: TerrainMap, record: BuildingRecord): GroundKind[] {
    const kinds: GroundKind[] = [];
    for (let dy = 0; dy < record.footprint; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        kinds.push(groundKindOf(
          terrain.biomeAt(record.x + dx, record.y + dy),
          terrain.slopeAt(record.x + dx, record.y + dy),
          terrain.heightAt(record.x + dx, record.y + dy),
        ));
      }
    }
    return kinds;
  }

  it('costruisce sul fianco in pendenza invece di saltarlo', () => {
    const terrain = hillside();
    const { records } = grow(terrain, 64, 40);

    const sloped = records.filter((r) => lotGround(terrain, r).includes(GROUND.sloped));
    // Prima della 4.2 queste colonne non erano `buildable` e nessun edificio
    // poteva nascerci: il fianco restava un buco nella citta'.
    expect(sloped.length).toBeGreaterThan(0);
  });

  it('il salto e costruito: il muro porta la grammatica delle infrastrutture', () => {
    const terrain = hillside();
    const { world } = grow(terrain, 64, 40);

    let wall = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        // Fino a 64: il fianco della fixture sta fra 24 e 45, e il muro con
        // lui. A 24 la scansione si fermava sotto il terreno.
        for (let z = 0; z < 64; z++) {
          if (world.getBlock(x, y, z) === 0) continue;
          if (world.getSurfaceKind(x, y, z) === SURFACE_KIND.utility) wall++;
        }
      }
    }
    // Solo le opere scrivono `utility`: il terreno e gli edifici no.
    expect(wall).toBeGreaterThan(0);
  });

  it('si riempie e non si scava: nessuna colonna perde il terreno che aveva', () => {
    // E' il vincolo centrale della fase, e uno dei test che ha bisogno di
    // un'isola vera: `testTerrain` riempie la `TerrainMap` ma non scrive un
    // voxel, quindi su quella fixture "il terreno e' sparito" e "il terreno non
    // c'e' mai stato" sarebbero indistinguibili.
    const { world, map, builder } = growIsland();
    expect(builder.registry.count).toBeGreaterThan(20);

    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const height = map.heightAt(x, y);
        for (let z = 0; z < height; z++) {
          if (world.getBlock(x, y, z) === 0) {
            expect({ x, y, z, height }).toBe('colonna piena fino alla quota naturale');
          }
        }
      }
    }
  });

  it('sull isola vera la citta raggiunge la costa e il fianco', () => {
    const { map, builder } = growIsland();

    let shore = 0;
    let sloped = 0;
    for (const record of builder.registry.all) {
      const kinds = lotGround(map, record);
      if (kinds.includes(GROUND.shore)) shore++;
      if (kinds.includes(GROUND.sloped)) sloped++;
    }
    // Sull'isola vera meta' della terra emersa non era `buildable`: battigia e
    // pendenza insieme. Se questi due tornano a zero, la 4.2 e' stata annullata.
    expect(shore).toBeGreaterThan(0);
    expect(sloped).toBeGreaterThan(0);
  });

  it('la costa diventa fronte costruito invece di un bordo', () => {
    const terrain = coast();
    const { records } = grow(terrain, 26, 40);

    const onShore = records.filter((r) => lotGround(terrain, r).includes(GROUND.shore));
    expect(onShore.length).toBeGreaterThan(0);
  });

  it('la banchina si spinge oltre la battigia, sopra l acqua', () => {
    // Sull'isola vera e non sulla fixture: il molo nasce dove la citta'
    // incontra il bassofondo, e una costa scritta a mano o lo mette sotto il
    // primo isolato o lo lascia fuori portata — in entrambi i casi il test
    // direbbe piu' di come e' fatta la fixture che di come e' fatta la citta'.
    const { world, map } = growIsland();

    let overWater = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        if (map.heightAt(x, y) >= TERRAIN.seaLevel) continue;
        // Pieno alla quota del molo dove il terreno lasciava acqua: e' banchina.
        if (world.getBlock(x, y, GRADING.quayLevel - 1) !== 0) overWater++;
      }
    }
    expect(overWater).toBeGreaterThan(0);
  });

  it('la piazza si livella quando il dislivello lo giustifica', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({
      chunksX: 1,
      chunksY: 1,
      heightAt: (x) => (x < 16 ? 12 : 12 + GRADING.plazaMinStep),
      slopeAt: () => 0.1,
    });
    const builder = new Builder(world, terrain, 1337);

    builder.decorateCatalyst(16, 16, BUILDING_CLASS.residential);
    while (builder.stats.surfaceQueued > 0) builder.step();

    const radius = BUILDER.catalystPlazaRadius;
    const levels = new Set<number>();
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        levels.add(topSolid(world, 16 + dx, 16 + dy));
      }
    }
    // Un piano solo: la piazza e' una piattaforma, non un prato colorato.
    expect([...levels]).toEqual([12 + GRADING.plazaMinStep - 1]);
  });

  it('la rampa non lascia gradini fra due colonne di carreggiata', () => {
    const terrain = coast();
    const streets = new StreetNetwork(1337);
    const { world, builder } = grow(terrain, 26, 40);

    for (let y = 1; y < 127; y++) {
      for (let x = 1; x < 127; x++) {
        if (!streets.isPavement(x, y) || builder.registry.isOccupied(x, y)) continue;
        const here = topSolid(world, x, y);
        if (here < 0) continue;
        for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
          if (!streets.isPavement(nx, ny) || builder.registry.isOccupied(nx, ny)) continue;
          const there = topSolid(world, nx, ny);
          if (there < 0) continue;
          // Un voxel per colonna e' la pendenza massima che una strada
          // percorre: oltre, la carreggiata e' un salto e non una rampa.
          expect(Math.abs(here - there)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('a parita di seed il rilievo produce la stessa citta', () => {
    const a = grow(coast(), 26, 30).records.map((r) => `${r.x},${r.y},${r.baseZ},${r.footprint}`);
    const b = grow(coast(), 26, 30).records.map((r) => `${r.x},${r.y},${r.baseZ},${r.footprint}`);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
  });
});

/** Colonna edificabile piu' vicina al mare: e' li' che le opere si vedono. */
function seaward(map: TerrainMap): { x: number; y: number } {
  let best = { x: 64, y: 64, distance: Number.MAX_SAFE_INTEGER };
  for (let y = 16; y < 112; y++) {
    for (let x = 16; x < 112; x++) {
      if (!map.isBuildable(x, y)) continue;
      for (let r = 1; r < best.distance && r < 16; r++) {
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          if (map.heightAt(x + dx, y + dy) < TERRAIN.seaLevel) best = { x, y, distance: r };
        }
      }
    }
  }
  return best;
}

/** Quota del voxel pieno piu' alto di una colonna, -1 se e' vuota. */
function topSolid(world: VoxelWorld, x: number, y: number): number {
  for (let z = 40; z >= 0; z--) {
    if (world.getBlock(x, y, z) !== 0) return z;
  }
  return -1;
}
