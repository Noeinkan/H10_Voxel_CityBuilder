import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { SURFACE_KIND } from '../visualBlock';
import { VoxelWorld } from '../VoxelWorld';
import { createDioramaScene, type DioramaOptions, type DioramaScene } from './dioramaScene';

const SUBJECT: DioramaOptions = {
  seed: 1337,
  originX: 0,
  originY: 0,
  use: BUILDING_CLASS.commercial,
  level: 6,
};

/** Genera tutto in una volta: il budget serve solo al frame loop. */
function compose(options: DioramaOptions): { world: VoxelWorld; scene: DioramaScene } {
  const world = new VoxelWorld();
  const scene = createDioramaScene(world, options);
  let guard = 0;
  while (!scene.step(Number.POSITIVE_INFINITY)) {
    if (++guard > 10_000) throw new Error('generatore che non termina');
  }
  expect(scene.done).toBe(true);
  expect(scene.progress).toBe(1);
  return { world, scene };
}

/** Voxel pieni del mondo, letti cella per cella dentro un riquadro. */
function solidsIn(world: VoxelWorld, x0: number, y0: number, x1: number, y1: number, z1: number): number {
  let count = 0;
  for (let z = 0; z < z1; z++) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (world.getBlock(x, y, z) !== 0) count++;
      }
    }
  }
  return count;
}

describe('dioramaScene', () => {
  it('e\' deterministica: stesso seed, stessi voxel', () => {
    const a = compose(SUBJECT);
    const b = compose(SUBJECT);

    expect(b.scene.subject).toEqual(a.scene.subject);
    expect(b.world.solidVoxelCount).toBe(a.world.solidVoxelCount);

    const s = a.scene.subject;
    for (let z = 0; z < s.sizeZ + 2; z++) {
      for (let y = s.y; y < s.y + s.sizeY; y++) {
        for (let x = s.x; x < s.x + s.sizeX; x++) {
          expect(b.world.getBlock(x, y, z)).toBe(a.world.getBlock(x, y, z));
        }
      }
    }
  });

  it('il soggetto sta dentro l\'ingombro che dichiara', () => {
    const { world, scene } = compose(SUBJECT);
    const s = scene.subject;

    // Sopra il basamento non c'e' niente fuori dall'impronta: se ci fosse,
    // l'inquadratura che legge `subject` taglierebbe fuori un pezzo di edificio.
    const above = solidsIn(world, s.x - 4, s.y - 4, s.x + s.sizeX + 4, s.y + s.sizeY + 4, s.z + s.sizeZ + 2);
    const inside = solidsIn(world, s.x, s.y, s.x + s.sizeX, s.y + s.sizeY, s.z + s.sizeZ + 2);
    const pad = (s.sizeX + 8) * (s.sizeY + 8) * 2 - s.sizeX * s.sizeY * 2;
    expect(above - inside).toBe(pad);

    const bounds = world.bounds;
    expect(bounds.maxZ).toBeLessThanOrEqual(s.z + s.sizeZ + 1);
  });

  it('mette una carreggiata sul fronte, che e\' il lato verso cui guarda l\'edificio', () => {
    const { world, scene } = compose(SUBJECT);
    const s = scene.subject;

    // `FACING.east` e' +x: la strada sta oltre l'impronta da quella parte, e il
    // prato dall'altra. E' questo contorno a rendere giudicabili i dettagli
    // agganciati al fronte strada.
    const road = world.getBlock(s.x + s.sizeX + 6, s.y + 2, s.z);
    const lawn = world.getBlock(s.x - 2, s.y + 2, s.z);
    expect(road).not.toBe(lawn);
  });

  it('porta nel mondo la grammatica di superficie dello stamp', () => {
    const { world, scene } = compose(SUBJECT);
    const s = scene.subject;

    // A livello 6 la faccia d'accento e' accesa e il piano terra ha un portale:
    // se le superfici non arrivassero al mondo, il diorama mostrerebbe un
    // edificio piatto e giudicheremmo il dettaglio sbagliato.
    const kinds = new Set<number>();
    for (let z = s.z + 1; z < s.z + s.sizeZ + 1; z++) {
      for (let y = s.y; y < s.y + s.sizeY; y++) {
        for (let x = s.x; x < s.x + s.sizeX; x++) {
          if (world.getBlock(x, y, z) !== 0) kinds.add(world.getSurfaceKind(x, y, z));
        }
      }
    }
    expect(kinds.has(SURFACE_KIND.portal)).toBe(true);
    expect(kinds.has(SURFACE_KIND.luminous)).toBe(true);
  });

  it('la tipologia forzata arriva dove il luogo non la concederebbe', () => {
    // Senza profilo locale `selectTypology` puo' solo ripiegare sulla riga senza
    // condizioni dell'uso: e' corretto, ed e' anche il motivo per cui il diorama
    // deve poter forzare una tipologia per id. Altrimenti le forme interessanti
    // — quelle che un distretto concede — resterebbero invisibili qui.
    const free = compose(SUBJECT).scene.subject;
    const forced = compose({ ...SUBJECT, typologyId: 'officeTower' }).scene.subject;

    expect(free.typology).toBe('retailRow');
    expect(forced.typology).toBe('officeTower');
    expect(forced.sizeZ).toBeGreaterThan(free.sizeZ);
  });
});
