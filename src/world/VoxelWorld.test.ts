import { describe, expect, it } from 'vitest';
import { CHUNK, idx } from './chunkCoords';
import { VoxelWorld } from './VoxelWorld';

describe('VoxelWorld — storage', () => {
  it('setData non modifica blocks e non marca il chunk sporco', () => {
    const world = new VoxelWorld();
    const chunk = world.ensureChunk(0, 0, 0);
    world.flush(); // parte da uno stato pulito

    world.setData(3, 4, 5, 200);

    expect(world.getData(3, 4, 5)).toBe(200);
    expect(world.getBlock(3, 4, 5)).toBe(0);
    expect(chunk.blocks[idx(3, 4, 5)]).toBe(0);
    expect(chunk.blocks.some((v) => v !== 0)).toBe(false);
    expect(chunk.solidCount).toBe(0);
    expect(chunk.dirty).toBe(false);
    expect(world.dirtyCount).toBe(0);
    expect(world.flush()).toEqual([]);
  });

  it('setBlock non tocca il layer data', () => {
    const world = new VoxelWorld();
    world.setData(1, 2, 3, 42);

    world.setBlock(1, 2, 3, 9);

    expect(world.getData(1, 2, 3)).toBe(42);
    expect(world.getBlock(1, 2, 3)).toBe(9);
  });

  it('setBlock marca sporco il chunk e flush lo restituisce una volta sola', () => {
    const world = new VoxelWorld();

    world.setBlock(10, 10, 10, 1);
    world.setBlock(11, 10, 10, 1);

    expect(world.dirtyCount).toBe(1);
    expect(world.flush()).toEqual(['0,0,0']);
    expect(world.flush()).toEqual([]);
    expect(world.chunks.get('0,0,0')?.dirty).toBe(false);
  });

  it('scrivere lo stesso valore non marca sporco', () => {
    const world = new VoxelWorld();
    world.setBlock(5, 5, 5, 7);
    world.flush();

    world.setBlock(5, 5, 5, 7);

    expect(world.dirtyCount).toBe(0);
  });

  it('una cella di bordo marca sporchi solo i vicini esistenti', () => {
    const world = new VoxelWorld();
    world.ensureChunk(0, 0, 0);
    world.ensureChunk(-1, 0, 0); // vicino -X presente, gli altri no
    world.flush();

    world.setBlock(0, 10, 10, 4); // lx === 0

    const keys = [...world.flush()].sort();
    expect(keys).toEqual(['-1,0,0', '0,0,0']);
  });

  it('una cella interna non marca alcun vicino', () => {
    const world = new VoxelWorld();
    world.ensureChunk(0, 0, 0);
    world.ensureChunk(1, 0, 0);
    world.ensureChunk(0, 1, 0);
    world.flush();

    world.setBlock(15, 15, 15, 4);

    expect(world.flush()).toEqual(['0,0,0']);
  });

  it('marca il vicino corretto su ciascuno dei sei lati', () => {
    const cases: readonly [number, number, number, string][] = [
      [0, 10, 10, '-1,0,0'],
      [CHUNK - 1, 10, 10, '1,0,0'],
      [10, 0, 10, '0,-1,0'],
      [10, CHUNK - 1, 10, '0,1,0'],
      [10, 10, 0, '0,0,-1'],
      [10, 10, CHUNK - 1, '0,0,1'],
    ];

    for (const [x, y, z, expectedNeighbour] of cases) {
      const world = new VoxelWorld();
      world.ensureChunk(0, 0, 0);
      world.ensureChunk(-1, 0, 0);
      world.ensureChunk(1, 0, 0);
      world.ensureChunk(0, -1, 0);
      world.ensureChunk(0, 1, 0);
      world.ensureChunk(0, 0, -1);
      world.ensureChunk(0, 0, 1);
      world.flush();

      world.setBlock(x, y, z, 1);

      expect([...world.flush()].sort()).toEqual(['0,0,0', expectedNeighbour].sort());
    }
  });

  it('getBlock e getData fuori dai chunk allocati restituiscono 0 senza allocare', () => {
    const world = new VoxelWorld();

    expect(world.getBlock(1000, -50, 12)).toBe(0);
    expect(world.getData(1000, -50, 12)).toBe(0);
    expect(world.chunkCount).toBe(0);
  });

  it('svuotare una cella di un chunk inesistente non alloca', () => {
    const world = new VoxelWorld();

    world.setBlock(500, 500, 10, 0);
    world.setData(500, 500, 10, 0);

    expect(world.chunkCount).toBe(0);
    expect(world.dirtyCount).toBe(0);
  });

  it('ensureChunk alloca un chunk azzerato e non ricrea quelli esistenti', () => {
    const world = new VoxelWorld();

    const first = world.ensureChunk(2, 3, 1);
    expect(first.blocks.length).toBe(CHUNK ** 3);
    expect(first.data.length).toBe(CHUNK ** 3);
    expect(first.blocks.every((v) => v === 0)).toBe(true);
    expect(world.ensureChunk(2, 3, 1)).toBe(first);
    expect(world.chunkCount).toBe(1);
  });

  it('aggiungere chunk a runtime non rialloca gli array di quelli esistenti', () => {
    const world = new VoxelWorld();
    const existing = world.ensureChunk(0, 0, 0);
    existing.blocks[idx(1, 1, 1)] = 12;
    const blocksRef = existing.blocks;
    const dataRef = existing.data;

    for (let i = 0; i < 64; i++) world.ensureChunk(4 + (i & 7), 4 + (i >> 3), 0);

    expect(world.chunkCount).toBe(65);
    expect(world.chunks.get('0,0,0')).toBe(existing);
    expect(existing.blocks).toBe(blocksRef);
    expect(existing.data).toBe(dataRef);
    expect(existing.blocks[idx(1, 1, 1)]).toBe(12);
  });

  it('mantiene solidCount e il totale dei voxel pieni', () => {
    const world = new VoxelWorld();

    world.setBlock(1, 1, 1, 5);
    world.setBlock(2, 1, 1, 5);
    world.setBlock(2, 1, 1, 6); // sovrascrittura: nessun cambio di conteggio
    expect(world.solidVoxelCount).toBe(2);
    expect(world.chunks.get('0,0,0')?.solidCount).toBe(2);

    world.setBlock(1, 1, 1, 0); // svuotamento
    expect(world.solidVoxelCount).toBe(1);
    expect(world.chunks.get('0,0,0')?.isEmpty).toBe(false);

    world.setBlock(2, 1, 1, 0);
    expect(world.solidVoxelCount).toBe(0);
    expect(world.chunks.get('0,0,0')?.isEmpty).toBe(true);
  });

  it('gestisce le coordinate negative senza limiti di mondo', () => {
    const world = new VoxelWorld();

    world.setBlock(-1, -1, -1, 3);
    world.setBlock(-33, 5, 70, 4);

    expect(world.getBlock(-1, -1, -1)).toBe(3);
    expect(world.getBlock(-33, 5, 70)).toBe(4);
    expect(world.chunks.has('-1,-1,-1')).toBe(true);
    expect(world.chunks.has('-2,0,2')).toBe(true);
  });

  it("l'AABB cresce con i chunk e la versione cambia solo quando si estende", () => {
    const world = new VoxelWorld();
    world.ensureChunk(0, 0, 0);
    const v0 = world.version;

    world.ensureChunk(0, 0, 0); // stesso chunk
    expect(world.version).toBe(v0);

    world.ensureChunk(3, 2, 1);
    expect(world.version).toBeGreaterThan(v0);

    const b = world.bounds;
    expect([b.minCx, b.minCy, b.minCz]).toEqual([0, 0, 0]);
    expect([b.maxCx, b.maxCy, b.maxCz]).toEqual([3, 2, 1]);
    expect([b.minX, b.minY, b.minZ]).toEqual([0, 0, 0]);
    expect([b.maxX, b.maxY, b.maxZ]).toEqual([4 * CHUNK, 3 * CHUNK, 2 * CHUNK]);
  });

  it('markAllDirty accoda tutti i chunk allocati', () => {
    const world = new VoxelWorld();
    world.ensureChunk(0, 0, 0);
    world.ensureChunk(1, 0, 0);
    world.flush();

    world.markAllDirty();

    expect(world.dirtyCount).toBe(2);
    expect([...world.flush()].sort()).toEqual(['0,0,0', '1,0,0']);
  });
});
