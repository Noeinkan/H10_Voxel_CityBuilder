import { describe, expect, it } from 'vitest';
import { VoxelWorld } from '../VoxelWorld';
import { BIOME, TREE_DECOR } from './config';
import { treeAt, treeSpec, treeTop, TREELESS_BIOMES, writeTree } from './decor';
import { FLORA, TREE_SHAPES } from './flora';
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

  it('estrae solo specie dell’elenco del proprio bioma', () => {
    for (let biome = 0; biome < FLORA.length; biome++) {
      const allowed = new Set(FLORA[biome].species.map((entry) => entry.species));
      for (let cell = 0; cell < 400; cell++) {
        const tree = treeAt(SEED, cell, cell * 7, 34, biome, 0.1);
        if (tree === null) continue;
        expect(allowed.has(tree.species), `bioma ${biome}, specie ${tree.species}`).toBe(true);
      }
    }
  });

  it('la montagna e la pianura non fanno lo stesso bosco', () => {
    // La proprieta' che il catalogo per bioma esiste per avere: sulla stessa
    // griglia di celle, alla stessa quota e con la stessa pendenza, le due fasce
    // devono produrre insiemi di specie diversi. Prima di `FLORA` erano identici
    // per costruzione, e a distinguerle restava solo la densita'.
    const speciesIn = (biome: number): Set<number> => {
      const out = new Set<number>();
      for (let cell = 0; cell < 600; cell++) {
        const tree = treeAt(SEED, cell, -cell, 42, biome, 0.05);
        if (tree !== null) out.add(tree.species);
      }
      return out;
    };

    const plain = speciesIn(BIOME.plain);
    const rock = speciesIn(BIOME.rock);
    expect(plain.size).toBeGreaterThan(1);
    expect(rock.size).toBeGreaterThan(1);

    // Non insiemi disgiunti — il cespuglio cresce dappertutto, ed e' giusto —
    // ma ciascuna delle due deve avere qualcosa che l'altra non ha.
    expect([...rock].some((species) => !plain.has(species))).toBe(true);
    expect([...plain].some((species) => !rock.has(species))).toBe(true);
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

describe('profili delle specie', () => {
  it('nessuna chioma esce dalla cella che le e’ assegnata', () => {
    for (const shape of TREE_SHAPES) {
      for (const level of shape.canopy) {
        expect(level.radius).toBeLessThanOrEqual(TREE_DECOR.ring);
        // Un `cut` oltre il diametro non smusserebbe piu' niente: sarebbe una
        // riga che dice una cosa e ne fa un'altra.
        expect(level.cut).toBeLessThanOrEqual(2 * level.radius);
      }
    }
    expect(2 * TREE_DECOR.ring + TREE_DECOR.jitterSize).toBeLessThanOrEqual(TREE_DECOR.cellSize);
  });

  it('il tronco resta scoperto sotto la chioma', () => {
    for (const shape of TREE_SHAPES) {
      expect(shape.sink).toBeLessThan(shape.trunk[0]);
      expect(shape.trunk[1]).toBeGreaterThanOrEqual(1);
      for (const level of shape.canopy) expect(shape.tones[level.tone]).toBeGreaterThan(0);
    }
  });

  it('treeTop e’ esattamente il voxel piu’ alto che l’albero scrive', () => {
    const groundZ = 16;
    for (let species = 0; species < TREE_SHAPES.length; species++) {
      const shape = TREE_SHAPES[species];
      for (let extraTrunk = 0; extraTrunk < shape.trunk[1]; extraTrunk++) {
        const world = new VoxelWorld();
        const tree = treeSpec(8, 8, species, shape.trunk[0] + extraTrunk);
        const written = writeTree(world, tree, groundZ, 0, 0, 32, 32);

        let highest = -1;
        let lowest = Number.POSITIVE_INFINITY;
        for (let z = 0; z < 64; z++) {
          for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
              if (world.getBlock(x, y, z) === 0) continue;
              if (z > highest) highest = z;
              if (z < lowest) lowest = z;
            }
          }
        }

        // Sotto sta la colonna di terreno: un voxel piu' in basso vorrebbe dire
        // che l'albero si sta scavando il piedistallo.
        expect(lowest).toBe(groundZ);
        expect(highest).toBe(treeTop(tree, groundZ) - 1);
        expect(written).toBeGreaterThan(shape.trunk[0]);
      }
    }
  });
});
