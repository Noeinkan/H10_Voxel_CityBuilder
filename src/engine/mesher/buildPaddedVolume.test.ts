import { describe, expect, it } from 'vitest';
import { CHUNK, PADDED, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { VoxelWorld } from '../../world/VoxelWorld';
import { buildPaddedVolume } from './buildPaddedVolume';
import { greedyMesh } from './greedyMesher';

/** Riempie di solido il chunk indicato, in coordinate di mondo. */
function fillChunk(world: VoxelWorld, cx: number, cy: number, cz: number, id: number): void {
  for (let z = 0; z < CHUNK; z++) {
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        world.setBlock(cx * CHUNK + x, cy * CHUNK + y, cz * CHUNK + z, id);
      }
    }
  }
}

function paddedFor(world: VoxelWorld, cx: number, cy: number, cz: number): Uint8Array {
  const chunk = world.getChunk(cx, cy, cz);
  if (chunk === null) throw new Error('chunk assente');
  const padded = new Uint8Array(PADDED_VOL);
  buildPaddedVolume(world, chunk, padded);
  return padded;
}

describe('buildPaddedVolume', () => {
  it('copia il corpo del chunk nella posizione giusta', () => {
    const world = new VoxelWorld();
    world.setBlock(0, 0, 0, 5);
    world.setBlock(31, 17, 3, 9);

    const padded = paddedFor(world, 0, 0, 0);

    expect(padded[paddedIdx(1, 1, 1)]).toBe(5);
    expect(padded[paddedIdx(32, 18, 4)]).toBe(9);
    // Nessun vicino: il bordo resta vuoto.
    expect(padded[paddedIdx(0, 1, 1)]).toBe(0);
    expect(padded[paddedIdx(PADDED - 1, 18, 4)]).toBe(0);
  });

  it('porta i sei piani di bordo dai vicini esistenti', () => {
    const world = new VoxelWorld();
    world.ensureChunk(0, 0, 0);
    // Un voxel nell'angolo di ciascun vicino, adiacente al nostro bordo.
    world.setBlock(-1, 5, 6, 11); // vicino -X, sua faccia lx = 31
    world.setBlock(CHUNK, 5, 6, 12); // vicino +X, sua faccia lx = 0
    world.setBlock(5, -1, 6, 13);
    world.setBlock(5, CHUNK, 6, 14);
    world.setBlock(5, 6, -1, 15);
    world.setBlock(5, 6, CHUNK, 16);

    const padded = paddedFor(world, 0, 0, 0);

    expect(padded[paddedIdx(0, 6, 7)]).toBe(11);
    expect(padded[paddedIdx(PADDED - 1, 6, 7)]).toBe(12);
    expect(padded[paddedIdx(6, 0, 7)]).toBe(13);
    expect(padded[paddedIdx(6, PADDED - 1, 7)]).toBe(14);
    expect(padded[paddedIdx(6, 7, 0)]).toBe(15);
    expect(padded[paddedIdx(6, 7, PADDED - 1)]).toBe(16);
  });

  it('porta anche gli spigoli e gli angoli dai vicini diagonali', () => {
    const world = new VoxelWorld();
    world.ensureChunk(0, 0, 0);
    world.setBlock(-1, -1, 7, 21); // spigolo -X/-Y
    world.setBlock(CHUNK, CHUNK, -1, 22); // angolo +X/+Y/-Z

    const padded = paddedFor(world, 0, 0, 0);

    expect(padded[paddedIdx(0, 0, 8)]).toBe(21);
    expect(padded[paddedIdx(PADDED - 1, PADDED - 1, 0)]).toBe(22);
  });

  it('due chunk pieni adiacenti non disegnano la faccia in comune', () => {
    const world = new VoxelWorld();
    fillChunk(world, 0, 0, 0, 4);
    fillChunk(world, 1, 0, 0, 4);

    const left = greedyMesh(paddedFor(world, 0, 0, 0));
    const right = greedyMesh(paddedFor(world, 1, 0, 0));

    // Un chunk pieno isolato fa 6 quad. Appaiati ne fanno 5 ciascuno: la faccia
    // sul confine non viene emessa ne da un lato ne dall'altro.
    expect(left.quadCount).toBe(5);
    expect(right.quadCount).toBe(5);
    expect([...left.faces].includes(0)).toBe(false); // niente +X a sinistra
    expect([...right.faces].includes(1)).toBe(false); // niente -X a destra
  });

  it('la faccia sul confine viene emessa una volta sola quando un lato e vuoto', () => {
    const world = new VoxelWorld();
    fillChunk(world, 0, 0, 0, 4);
    world.ensureChunk(1, 0, 0); // vicino allocato ma vuoto

    const left = greedyMesh(paddedFor(world, 0, 0, 0));
    const right = greedyMesh(paddedFor(world, 1, 0, 0));

    expect(left.quadCount).toBe(6); // il chunk pieno emette tutte le sue facce
    expect(right.quadCount).toBe(0); // il vicino vuoto non ne duplica nessuna
  });

  it('svuotare una cella di bordo riapre la faccia del vicino', () => {
    const world = new VoxelWorld();
    fillChunk(world, 0, 0, 0, 4);
    fillChunk(world, 1, 0, 0, 4);
    expect(greedyMesh(paddedFor(world, 1, 0, 0)).quadCount).toBe(5);

    // Un buco nella colonna di bordo del chunk di sinistra.
    world.setBlock(CHUNK - 1, 10, 10, 0);

    const right = greedyMesh(paddedFor(world, 1, 0, 0));
    // Ora il vicino destro deve mostrare un quad -X in corrispondenza del buco.
    expect(right.quadCount).toBe(6);
    expect([...right.faces].filter((f) => f === 1).length).toBe(4);
  });

  it('un vicino vuoto non costa una copia di piano', () => {
    const world = new VoxelWorld();
    fillChunk(world, 0, 0, 0, 4);
    world.ensureChunk(-1, 0, 0); // allocato, ma isEmpty

    const padded = paddedFor(world, 0, 0, 0);

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let ly = 0; ly < CHUNK; ly++) {
        expect(padded[paddedIdx(0, ly + 1, lz + 1)]).toBe(0);
      }
    }
  });
});
