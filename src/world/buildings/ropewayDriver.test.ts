import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, addBuilding, createSimState } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { ROPEWAY, ROPEWAY_PART } from '../ropeway/config';
import { TERRAIN } from '../terrain/config';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';

/**
 * La funivia dal lato del mondo: dal click ai voxel.
 *
 * **Uno stretto scritto a mano e non un'isola vera.** Un'isola di seed e' un solo
 * pezzo di terra circondato dall'oceano: dalla costa, andando in fuori, non c'e'
 * nessuna sponda opposta entro `maxLength`, e la traversata dipenderebbe dal
 * fatto che quel seed abbia scavato una baia larga al punto giusto. Qui il canale
 * e' una riga di `heightAt`, e i biomi restano quelli veri — `testTerrain` li
 * ricava da `classifyBiome`, la stessa funzione del generatore.
 */

const WATER_FROM = 96;
const WATER_TO = 136;
const LAND_TOP = 24;
const CLICK = { x: 80, y: 64 };

function strait(): { world: VoxelWorld; builder: Builder } {
  const world = new VoxelWorld();
  const terrain = testTerrain({
    chunksX: 8,
    chunksY: 4,
    heightAt: (x) => (x >= WATER_FROM && x < WATER_TO ? 4 : LAND_TOP),
  });
  return { world, builder: new Builder(world, terrain, 1337) };
}

/** Posa una linea e la fa comparire tutta. */
function tie(): { world: VoxelWorld; builder: Builder } {
  const city = strait();
  expect(city.builder.placeRopeway(CLICK.x, CLICK.y)).toBe('raised');
  while (city.builder.stats.growing > 0) city.builder.step();
  return city;
}

describe('RopewayDriver', () => {
  it('un click su una riva tira la linea e ne registra le due torri', () => {
    const { builder } = tie();

    const towers = [...builder.registry.all].filter((r) => r.ropeway === ROPEWAY_PART.station);
    expect(towers).toHaveLength(2);
    expect(builder.registry.ropewayCount).toBe(2);
    expect(builder.stats.ropeways).toBe(1);
  });

  it('le torri non sono edifici e non entrano nei conteggi della citta', () => {
    const { builder } = tie();
    // E' la stessa regola di landmark, campate e impalcati: la simulazione non
    // le ha mai registrate con `addBuilding`, e vederle nell'HUD vorrebbe dire
    // due civici che nessuno ha costruito per ogni linea.
    expect(builder.registry.count).toBe(0);
    expect(builder.registry.countsByClass.every((count) => count === 0)).toBe(true);
  });

  it('le due torri stanno sulle due rive, non in acqua', () => {
    const { builder } = tie();
    const towers = [...builder.registry.all]
      .filter((r) => r.ropeway !== undefined)
      .sort((a, b) => a.x - b.x);

    expect(towers[0].x + ROPEWAY.stationSide).toBeLessThanOrEqual(WATER_FROM);
    expect(towers[1].x).toBeGreaterThanOrEqual(WATER_TO);
    for (const tower of towers) expect(tower.baseZ).toBe(LAND_TOP);
  });

  it('le torri compaiono davvero, e arrivano alla fune', () => {
    const { world, builder } = tie();
    const [cable] = builder.ropewayCables;
    const towers = [...builder.registry.all].filter((r) => r.ropeway !== undefined);

    for (const tower of towers) {
      const centre = { x: tower.x + 2, y: tower.y + 2 };
      expect(world.getBlock(centre.x, centre.y, tower.baseZ)).not.toBe(0);
      // L'architrave sta alla quota della fune: e' li' che la fune si ancora.
      expect(world.getBlock(centre.x, centre.y, cable.path[0].z)).not.toBe(0);
    }
  });

  it('fra le due torri non c e un solo voxel: la fune non e materia', () => {
    const { world, builder } = tie();
    const [cable] = builder.ropewayCables;

    // **E' l'invariante del dominio.** Una campata di fune non prende suolo e non
    // prende nemmeno il cielo: sopra l'acqua, alla quota della fune e sotto di
    // lei, non c'e' niente da rimeshare.
    for (let x = WATER_FROM; x < WATER_TO; x++) {
      for (let z = TERRAIN.seaLevel; z <= cable.path[0].z; z++) {
        expect(world.getBlock(x, CLICK.y, z)).toBe(0);
      }
    }
  });

  it('la fune va da un ancoraggio all altro, e la corsa le sta sotto', () => {
    const { builder } = tie();
    const [cable] = builder.ropewayCables;
    const [ride] = builder.ropewayRides;
    const towers = [...builder.registry.all]
      .filter((r) => r.ropeway !== undefined)
      .sort((a, b) => a.x - b.x);

    expect(cable.path[0].x).toBe(towers[0].x + 2);
    expect(cable.path[cable.path.length - 1].x).toBe(towers[1].x + 2);
    expect(ride.path).toHaveLength(cable.path.length);
    for (let i = 0; i < ride.path.length; i++) {
      expect(ride.path[i].z).toBeCloseTo(cable.path[i].z - ROPEWAY.cabinDrop);
    }
  });

  it('l array delle funi cambia identita solo quando ne nasce una', () => {
    const { builder } = strait();
    const before = builder.ropewayCables;
    expect(builder.ropewayCables).toBe(before);

    builder.placeRopeway(CLICK.x, CLICK.y);
    // E' il confronto su cui si regge `RopewayView.setLines`: se l'array fosse
    // lo stesso, la vista non ricostruirebbe mai la geometria.
    expect(builder.ropewayCables).not.toBe(before);
  });

  it('due torri occupano il suolo, e nessuno ci costruisce sopra', () => {
    const { builder } = tie();
    const towers = [...builder.registry.all].filter((r) => r.ropeway !== undefined);

    for (const tower of towers) {
      expect(builder.registry.isOccupied(tower.x + 2, tower.y + 2)).toBe(true);
    }
  });

  it('un click in mezzo all acqua non tira niente', () => {
    const { builder } = strait();
    expect(builder.placeRopeway(WATER_FROM + 10, CLICK.y)).toBeNull();
    expect(builder.ropewayCables).toHaveLength(0);
  });
});

/**
 * La riva di qua larga esattamente quanto una piazzola: cinque colonne, e oltre
 * c'e' oceano.
 *
 * **Serve a togliere l'arretramento di mezzo.** Su una riva profonda la stazione
 * si sposta un isolato dentro e non demolisce niente — che e' il comportamento
 * giusto e quello che il piano prova gia' — quindi qui non si misurerebbe nulla.
 * Con una sola piazzola possibile resta un bivio solo: sgomberare, o rifiutare.
 */
const NARROW_SHORE = 91;

function narrowStrait(): { world: VoxelWorld; builder: Builder } {
  const world = new VoxelWorld();
  const terrain = testTerrain({
    chunksX: 8,
    chunksY: 4,
    heightAt: (x) =>
      (x >= NARROW_SHORE && x < WATER_FROM) || x >= WATER_TO ? LAND_TOP : 4,
  });
  return { world, builder: new Builder(world, terrain, 1337) };
}

describe('RopewayDriver — la precedenza sul tessuto urbano', () => {
  const NARROW_CLICK = { x: 93, y: 64 };

  it('sgombera il lungomare invece di rifiutare la linea', () => {
    const { builder } = narrowStrait();
    let state = addBuilding(createSimState(), {
      x: 92,
      y: 63,
      class: BUILDING_CLASS.residential,
      level: 4,
    });
    builder.materialize(state.buildings);
    expect(builder.registry.count).toBe(1);
    expect(builder.registry.isOccupied(NARROW_CLICK.x, NARROW_CLICK.y)).toBe(true);

    // Il click e' accolto, ma la linea non c'e' ancora: prima cade il lungomare.
    expect(builder.placeRopeway(NARROW_CLICK.x, NARROW_CLICK.y)).toBe('clearing');
    expect(builder.ropewayCables).toHaveLength(0);

    for (let i = 0; i < 200 && builder.ropewayCables.length === 0; i++) {
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }

    expect(builder.ropewayCables).toHaveLength(1);
    const towers = [...builder.registry.all].filter((r) => r.ropeway !== undefined);
    expect(towers).toHaveLength(2);
    // La casa e' caduta davvero, e la torre poggia sul terreno dov'era: non sul
    // tetto che il cantiere stava portando via.
    expect(builder.registry.count).toBe(0);
    const near = towers.find((tower) => tower.x < WATER_FROM)!;
    expect(near.baseZ).toBe(LAND_TOP);
  });

  it('finche il cantiere e aperto nessuno costruisce nelle due piazzole', () => {
    const { builder } = narrowStrait();
    const state = addBuilding(createSimState(), {
      x: 92,
      y: 63,
      class: BUILDING_CLASS.residential,
      level: 4,
    });
    builder.materialize(state.buildings);
    builder.placeRopeway(NARROW_CLICK.x, NARROW_CLICK.y);

    // La piazzola di la' e' libera e non ha un cantiere suo: senza prenotazione
    // la citta' ci crescerebbe dentro, e la linea nascerebbe con una torre sola.
    expect(builder.registry.isOccupied(WATER_TO + 2, NARROW_CLICK.y)).toBe(true);
  });
});
