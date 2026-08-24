import { describe, expect, it } from 'vitest';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { StreetNetwork } from '../streets/StreetNetwork';
import { BuildingRegistry } from './BuildingRegistry';
import { SurfaceQueue } from './surfaceQueue';
import { TERRAIN } from '../terrain/config';

/**
 * Il gate del raccordo: **due insediamenti lontani devono restare uniti da una
 * strada continua**, e la strada deve stare sulla terra.
 *
 * E' una proprieta' e non un giudizio a occhio, per la stessa ragione per cui lo
 * e' la continuita' della rete in quota (`spans/network.ts`): «si vede che il
 * porto e' collegato» e' esattamente il tipo di verifica che passa finche'
 * qualcuno non guarda dalla parte sbagliata. Qui il collegamento e' un
 * riempimento a partire dall'anello di un isolato, e o arriva all'altro o non ci
 * arriva.
 *
 * Il terreno e' una fixture piana invece di un'isola generata: la domanda e' se
 * il raccordo nasce e dove passa, e su un'isola vera ogni asserzione dipenderebbe
 * dal seed invece che dalla regola.
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

/** Una colonna qualunque della carreggiata attorno all'isolato di `(x, y)`. */
function ringCellOf(streets: StreetNetwork, x: number, y: number): string {
  const ring = streets.pavementRing(streets.blockAt(x, y));
  return `${ring[0].x},${ring[0].y}`;
}

describe('surfaceQueue — il raccordo', () => {
  it('collega con una strada continua due isolati nati lontani', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 4, height: LAND, slopeAt: () => 0 });
    const streets = new StreetNetwork(SEED);
    const surface = new SurfaceQueue(world, terrain, streets, new BuildingRegistry());

    // Il caso del porto: due isolati che non si sfiorano nemmeno da lontano.
    surface.enqueueBlockStreets(streets.blockAt(30, 30));
    surface.enqueueBlockStreets(streets.blockAt(150, 30));
    while (surface.queued > 0) surface.step();

    const paved = pavedColumns(world, 200, 100);
    const walk = reachable(paved, ringCellOf(streets, 30, 30));

    expect(walk.has(ringCellOf(streets, 150, 30)),
      'dal primo isolato non si arriva al secondo camminando sull asfalto').toBe(true);
  });

  it('senza raccordo i due anelli resterebbero due isole di asfalto', () => {
    // Il controllo negativo: e' la prova che il test sopra misura il raccordo e
    // non una coincidenza della maglia. Dipingendo i due anelli **e basta** —
    // cioe' cio' che faceva la versione precedente — il cammino non arriva.
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 4, height: LAND, slopeAt: () => 0 });
    const streets = new StreetNetwork(SEED);

    const paint = (x: number, y: number): void => {
      const registry = new BuildingRegistry();
      const queue = new SurfaceQueue(world, terrain, streets, registry);
      queue.enqueueBlockStreets(streets.blockAt(x, y));
      while (queue.queued > 0) queue.step();
    };
    // Una coda per isolato: cosi' nessuna delle due sa dell'altra, e il raccordo
    // non ha una rete a cui attaccarsi.
    paint(30, 30);
    paint(150, 30);

    const paved = pavedColumns(world, 200, 100);
    const walk = reachable(paved, ringCellOf(streets, 30, 30));
    expect(walk.has(ringCellOf(streets, 150, 30))).toBe(false);
  });

  it('gira attorno all acqua invece di finirci dentro', () => {
    const world = new VoxelWorld();
    // Un canale che taglia la strada diretta e lascia il passaggio a nord. La
    // profondita' supera `maxQuayDepth`, quindi nessuna banchina lo compra: e'
    // un rifiuto vero, non un terreno caro.
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

    // Nessuna colonna di strada sta nel canale: una carreggiata sul fondale e'
    // esattamente cio' che `linkMinPaved` esiste per impedire.
    for (const key of paved) {
      const [x, y] = key.split(',').map(Number);
      expect(inChannel(x, y), `la strada passa nel canale, a ${key}`).toBe(false);
    }

    // E il collegamento c'e' lo stesso, passando da dove la terra continua.
    const walk = reachable(paved, ringCellOf(streets, 30, 30));
    expect(walk.has(ringCellOf(streets, 150, 30)),
      'il raccordo ha rinunciato invece di aggirare il canale').toBe(true);
  });

  it('non dipinge niente in piu quando i due isolati si toccano gia', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 4, chunksY: 4, height: LAND, slopeAt: () => 0 });
    const streets = new StreetNetwork(SEED);
    const surface = new SurfaceQueue(world, terrain, streets, new BuildingRegistry());

    const origin = streets.blockAt(30, 30);
    surface.enqueueBlockStreets(origin);
    while (surface.queued > 0) surface.step();
    const alone = pavedColumns(world, 120, 120).size;

    // Il vicino in diagonale condivide l'incrocio: e' gia' collegato, e il
    // raccordo non deve aggiungere una sola colonna oltre al suo anello.
    surface.enqueueBlockStreets({ kx: origin.kx + 1, ky: origin.ky + 1 });
    while (surface.queued > 0) surface.step();

    const ring = streets.pavementRing({ kx: origin.kx + 1, ky: origin.ky + 1 });
    const together = pavedColumns(world, 120, 120).size;
    expect(together).toBeLessThanOrEqual(alone + ring.length);
  });

  it('la fixture dichiara davvero un canale non edificabile', () => {
    // Se la profondita' scendesse sotto `maxQuayDepth` il canale diventerebbe
    // battigia, il raccordo ci passerebbe sopra con una banchina, e il test
    // dell'aggiramento passerebbe per la ragione sbagliata.
    expect(TERRAIN.seaLevel - 0).toBeGreaterThan(12);
  });
});
