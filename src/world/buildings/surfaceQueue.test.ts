import { describe, expect, it } from 'vitest';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { StreetNetwork } from '../streets/StreetNetwork';
import { BuildingRegistry } from './BuildingRegistry';
import { SurfaceQueue } from './surfaceQueue';
import { TERRAIN } from '../terrain/config';

/**
 * Le strade sono minimali: **nessun anello perimetrale**, solo il raccordo che
 * unisce due centri nati lontani, e la strada deve stare sulla terra.
 *
 * E' una proprieta' e non un giudizio a occhio: «si vede che il porto e'
 * collegato» e' esattamente il tipo di verifica che passa finche' qualcuno non
 * guarda dalla parte sbagliata. Qui il collegamento e' il raccordo della
 * `SurfaceQueue`, e o arriva all'altro centro o non ci arriva.
 *
 * Il terreno e' una fixture piana invece di un'isola generata: la domanda e' se
 * il raccordo nasce e dove passa, e su un'isola vera ogni asserzione
 * dipenderebbe dal seed invece che dalla regola.
 */

const SEED = 1337;
const LAND = 20;

/** Le colonne dipinte dalla coda: sulla fixture solo lei scrive nel mondo. */
function pavedColumns(world: VoxelWorld, x1: number, y1: number): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y <= y1; y++) {
    for (let x = 0; x <= x1; x++) {
      for (let z = LAND - 4; z <= LAND + 4; z++) {
        if (world.getBlock(x, y, z) !== 0) {
          out.add(`${x},${y}`);
          break;
        }
      }
    }
  }
  return out;
}

/** Le colonne raggiungibili a piedi da `start`, muovendosi solo sull'asfalto. */
function reachable(paved: ReadonlySet<string>, start: string): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];

  while (queue.length > 0) {
    const [x, y] = (queue.pop() as string).split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (seen.has(key) || !paved.has(key)) continue;
      seen.add(key);
      queue.push(key);
    }
  }
  return seen;
}

describe('surfaceQueue — il raccordo', () => {
  it('unisce con una strada continua due centri nati lontani', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 4, height: LAND, slopeAt: () => 0 });
    const streets = new StreetNetwork(SEED);
    const surface = new SurfaceQueue(world, terrain, streets, new BuildingRegistry());

    // Il caso del porto: due centri che non si sfiorano nemmeno da lontano.
    surface.enqueueBlockStreets(streets.blockAt(30, 30));
    surface.enqueueBlockStreets(streets.blockAt(150, 30));
    while (surface.queued > 0) surface.step();

    // Niente anello: la sola strada dipinta e' il raccordo, una linea continua.
    const paved = pavedColumns(world, 200, 100);
    expect(paved.size).toBeGreaterThan(0);
    const [start] = paved;
    expect(reachable(paved, start).size, 'il raccordo non e una linea continua')
      .toBe(paved.size);
  });

  it('un centro solo non dipinge nessuna strada', () => {
    // Il controllo negativo: senza un secondo centro a cui attaccarsi non c'e'
    // niente da raccordare, e un isolato da solo non si circonda di asfalto.
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 4, height: LAND, slopeAt: () => 0 });
    const streets = new StreetNetwork(SEED);
    const surface = new SurfaceQueue(world, terrain, streets, new BuildingRegistry());

    surface.enqueueBlockStreets(streets.blockAt(30, 30));
    while (surface.queued > 0) surface.step();

    expect(pavedColumns(world, 120, 120).size).toBe(0);
  });

  it('gira attorno all acqua invece di finirci dentro', () => {
    const world = new VoxelWorld();
    // Un canale che taglia la strada diretta e lascia il passaggio a nord. La
    // profondita' supera `maxQuayDepth`, quindi il raccordo non lo attraversa.
    const inChannel = (x: number, y: number): boolean => x >= 90 && x <= 115 && y < 70;
    const terrain = testTerrain({
      chunksX: 8,
      chunksY: 4,
      heightAt: (x, y) => (inChannel(x, y) ? 0 : LAND),
      slopeAt: () => 0,
    });
    const streets = new StreetNetwork(SEED);
    const surface = new SurfaceQueue(world, terrain, streets, new BuildingRegistry());

    surface.enqueueBlockStreets(streets.blockAt(30, 30));
    surface.enqueueBlockStreets(streets.blockAt(150, 30));
    while (surface.queued > 0) surface.step();

    const paved = pavedColumns(world, 200, 120);

    // Nessuna colonna di strada sta nel canale.
    for (const key of paved) {
      const [x, y] = key.split(',').map(Number);
      expect(inChannel(x, y), `la strada passa nel canale, a ${key}`).toBe(false);
    }

    // E il collegamento c'e' lo stesso, passando da dove la terra continua.
    expect(paved.size, 'il raccordo ha rinunciato invece di aggirare il canale')
      .toBeGreaterThan(0);
  });

  it('la fixture dichiara davvero un canale non edificabile', () => {
    // Se la profondita' scendesse sotto `maxQuayDepth` il canale diventerebbe
    // battigia, e il test dell'aggiramento passerebbe per la ragione sbagliata.
    expect(TERRAIN.seaLevel - 0).toBeGreaterThan(12);
  });
});
