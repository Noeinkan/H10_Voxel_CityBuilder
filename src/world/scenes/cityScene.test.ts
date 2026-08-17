import { describe, expect, it } from 'vitest';
import { VoxelWorld } from '../VoxelWorld';
import { createScene, type SceneOptions } from './cityScene';

const ACCEPTANCE: SceneOptions = {
  kind: 'city',
  seed: 1337,
  originX: 0,
  originY: 0,
  sizeX: 512,
  sizeY: 512,
  sizeZ: 64,
};

/** Genera tutto in una volta: il budget serve solo al frame loop. */
function generate(options: SceneOptions): VoxelWorld {
  const world = new VoxelWorld();
  const generator = createScene(world, options);
  let guard = 0;
  while (!generator.step(Number.POSITIVE_INFINITY)) {
    if (++guard > 10_000) throw new Error('generatore che non termina');
  }
  expect(generator.done).toBe(true);
  return world;
}

describe('cityScene', () => {
  it('la scena di accettazione riempie il 20 percento del volume', () => {
    const world = generate(ACCEPTANCE);
    const volume = ACCEPTANCE.sizeX * ACCEPTANCE.sizeY * ACCEPTANCE.sizeZ;
    const fill = world.solidVoxelCount / volume;

    // Il criterio di accettazione parla del 20 percento: la calibrazione delle
    // altezze in cityScene.ts deve restare in questa finestra.
    expect(fill).toBeGreaterThan(0.19);
    expect(fill).toBeLessThan(0.21);
  });

  it('alloca solo i chunk toccati: il livello alto resta in parte vuoto', () => {
    const world = generate(ACCEPTANCE);

    // Le strade coprono tutto il piano di terra, quindi i 256 chunk a cz = 0
    // esistono tutti; a cz = 1 esistono solo quelli dove un edificio supera i 32
    // voxel di altezza. E' esattamente il comportamento sparso dello storage.
    let ground = 0;
    let upper = 0;
    for (const chunk of world.chunks.values()) {
      if (chunk.cz === 0) ground++;
      else upper++;
    }
    expect(ground).toBe(256);
    expect(upper).toBeGreaterThan(0);
    expect(upper).toBeLessThan(256);
    expect(world.chunkCount).toBe(ground + upper);

    const b = world.bounds;
    expect([b.minCx, b.minCy, b.minCz]).toEqual([0, 0, 0]);
    expect([b.maxCx, b.maxCy, b.maxCz]).toEqual([15, 15, 1]);
  });

  it('e deterministica: lo stesso seed produce lo stesso mondo', () => {
    const a = generate(ACCEPTANCE);
    const b = generate(ACCEPTANCE);

    expect(b.solidVoxelCount).toBe(a.solidVoxelCount);
    expect(b.chunkCount).toBe(a.chunkCount);
    for (const [key, chunk] of a.chunks) {
      const other = b.chunks.get(key);
      expect(other).toBeDefined();
      expect(other?.solidCount).toBe(chunk.solidCount);
    }
  });

  it('un seed diverso produce un mondo diverso', () => {
    const a = generate({ ...ACCEPTANCE, sizeX: 128, sizeY: 128 });
    const b = generate({ ...ACCEPTANCE, sizeX: 128, sizeY: 128, seed: 4242 });

    expect(b.solidVoxelCount).not.toBe(a.solidVoxelCount);
  });

  it('la suddivisione in passi non cambia il risultato', () => {
    const options: SceneOptions = { ...ACCEPTANCE, sizeX: 128, sizeY: 128 };
    const whole = generate(options);

    // Un budget di zero millisecondi forza un lotto per passo.
    const world = new VoxelWorld();
    const generator = createScene(world, options);
    let steps = 0;
    while (!generator.step(0)) {
      if (++steps > 10_000) throw new Error('generatore che non termina');
    }

    expect(steps).toBeGreaterThan(1);
    expect(world.solidVoxelCount).toBe(whole.solidVoxelCount);
    for (const [key, chunk] of whole.chunks) {
      expect(world.chunks.get(key)?.solidCount).toBe(chunk.solidCount);
    }
  });

  it('non scrive mai fuori dalla regione richiesta', () => {
    const world = generate({ ...ACCEPTANCE, originX: 64, originY: 96, sizeX: 96, sizeY: 96, sizeZ: 32 });
    const b = world.bounds;

    expect(b.minX).toBeGreaterThanOrEqual(64 - 32);
    expect(b.maxX).toBeLessThanOrEqual(64 + 96 + 32);
    expect(b.minY).toBeGreaterThanOrEqual(96 - 32);
    expect(b.maxY).toBeLessThanOrEqual(96 + 96 + 32);
    expect(b.maxZ).toBeLessThanOrEqual(32);
  });

  it('non tocca il layer data', () => {
    const world = generate({ ...ACCEPTANCE, sizeX: 64, sizeY: 64 });

    for (const chunk of world.chunks.values()) {
      expect(chunk.data.some((v) => v !== 0)).toBe(false);
    }
  });

  it('la scena noise raggiunge la frazione di riempimento richiesta', () => {
    const world = generate({
      kind: 'noise',
      seed: 7,
      originX: 0,
      originY: 0,
      sizeX: 64,
      sizeY: 64,
      sizeZ: 64,
      noiseFill: 0.2,
    });

    const fill = world.solidVoxelCount / (64 * 64 * 64);
    expect(fill).toBeGreaterThan(0.18);
    expect(fill).toBeLessThan(0.22);
  });
});
