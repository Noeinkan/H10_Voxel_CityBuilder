import { describe, expect, it } from 'vitest';
import { VoxelWorld } from '../VoxelWorld';
import { BIOME } from './config';
import { treeAt, TREELESS_BIOMES } from './decor';
import { generateIsland, type Region } from './IslandGenerator';
import { shapeFromRegion } from './region';

const SEED = 1337;

function signature(world: VoxelWorld): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, chunk] of world.chunks) {
    let hash = 0x811c9dc5;
    for (const block of chunk.blocks) hash = Math.imul(hash ^ block, 0x01000193);
    result[key] = hash >>> 0;
  }
  return result;
}

describe('decorazioni degli alberi', () => {
  it('sceglie lo stesso candidato per lo stesso seed e la stessa cella', () => {
    const a = treeAt(SEED, 4, -3, 18, BIOME.forest, 0.1);
    const b = treeAt(SEED, 4, -3, 18, BIOME.forest, 0.1);
    expect(a).toEqual(b);
  });

  it('non genera alberi nei biomi esclusi', () => {
    for (const biome of TREELESS_BIOMES) {
      expect(treeAt(SEED, 0, 0, 28, biome, 0.1)).toBeNull();
    }
  });

  it('mantiene chiome distinte nella griglia delle celle', () => {
    const trees = [];
    for (let y = -8; y <= 8; y++) {
      for (let x = -8; x <= 8; x++) {
        const tree = treeAt(SEED, x, y, 18, BIOME.forest, 0.1);
        if (tree !== null) trees.push(tree);
      }
    }

    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const a = trees[i];
        const b = trees[j];
        const separateX = Math.abs(a.x - b.x) > a.canopyRadius + b.canopyRadius;
        const separateY = Math.abs(a.y - b.y) > a.canopyRadius + b.canopyRadius;
        expect(separateX || separateY).toBe(true);
      }
    }
  });

  it('scrive lo stesso mondo anche invertendo l’ordine dei blocchi', () => {
    const shape = shapeFromRegion({ minX: 0, minY: 0, sizeX: 128, sizeY: 128 });
    const left: Region = { minX: 0, minY: 0, sizeX: 32, sizeY: 32 };
    const right: Region = { minX: 32, minY: 0, sizeX: 32, sizeY: 32 };

    const worldAB = new VoxelWorld();
    const first = generateIsland(worldAB, SEED, left, { shape });
    generateIsland(worldAB, SEED, right, { map: first.map, shape });

    const worldBA = new VoxelWorld();
    const second = generateIsland(worldBA, SEED, right, { shape });
    generateIsland(worldBA, SEED, left, { map: second.map, shape });

    expect(signature(worldBA)).toEqual(signature(worldAB));
  });
});
