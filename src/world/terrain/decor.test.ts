import { describe, expect, it } from 'vitest';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { VoxelWorld } from '../VoxelWorld';
import { BIOME, TREE_DECOR } from './config';
import { treeAt, treeSpec, treeTop, treeTopIn, TREELESS_BIOMES, writeTree } from './decor';
import { FLORA, TREE_SHAPES, TREE_SPECIES } from './flora';
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

  /**
   * I boschetti: la proprieta' che distingue un bosco da una manciata di alberi
   * sorteggiati uno per uno. Non e' «tutti uguali dentro il riquadro» — un albero
   * su tre resta il suo — ma due alberi dello stesso riquadro devono condividere
   * la specie molto piu' spesso di due alberi presi a caso nel bioma.
   */
  it('gli alberi vicini fanno macchia, non sale e pepe', () => {
    const speciesAt = (cellX: number, cellY: number): number | null => {
      const tree = treeAt(SEED, cellX, cellY, 34, BIOME.forest, 0.1);
      return tree === null ? null : tree.species;
    };

    let sameStand = 0;
    let standPairs = 0;
    let sameFar = 0;
    let farPairs = 0;
    for (let cellY = 0; cellY < 40; cellY++) {
      for (let cellX = 0; cellX < 40; cellX++) {
        const here = speciesAt(cellX, cellY);
        if (here === null) continue;

        const near = speciesAt(cellX + 1, cellY);
        // Solo dentro lo stesso riquadro: a cavallo di un bordo la coppia
        // racconta il contrario di quello che si sta misurando.
        const sameStandCell =
          Math.floor(cellX / TREE_DECOR.standCells) === Math.floor((cellX + 1) / TREE_DECOR.standCells);
        if (near !== null && sameStandCell) {
          standPairs++;
          if (near === here) sameStand++;
        }

        const far = speciesAt(cellX + 3 * TREE_DECOR.standCells, cellY);
        if (far !== null) {
          farPairs++;
          if (far === here) sameFar++;
        }
      }
    }

    expect(standPairs).toBeGreaterThan(40);
    expect(farPairs).toBeGreaterThan(40);
    expect(sameStand / standPairs).toBeGreaterThan((sameFar / farPairs) * 1.6);
  });

  it('la spiaggia ha la sua frangia, e sono quasi tutte palme', () => {
    const species = new Map<number, number>();
    for (let cell = 0; cell < 600; cell++) {
      const tree = treeAt(SEED, cell, cell * 3, 20, BIOME.beach, 0.05);
      if (tree === null) continue;
      species.set(tree.species, (species.get(tree.species) ?? 0) + 1);
    }
    const total = [...species.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBeGreaterThan(20);
    expect((species.get(TREE_SPECIES.palm) ?? 0) / total).toBeGreaterThan(0.5);
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

  /**
   * `treeTopIn` e' quello che alloca i chunk, e la sua unica ragione di esistere
   * e' che il livello **piu' largo** di una chioma non e' quello piu' alto: una
   * palma sfiorata dal blocco con le sole fronde ci scrive fin dove le fronde
   * arrivano, non fin dove arriva la punta. Deve percio' valere il voxel piu' alto
   * che `writeTree` scrive davvero dentro quel rettangolo — non un maggiorante,
   * o resta un chunk vuoto ogni volta che la punta non ce la fa.
   */
  it('treeTopIn e’ il voxel piu’ alto che l’albero scrive nel rettangolo', () => {
    const groundZ = 16;
    for (let species = 0; species < TREE_SHAPES.length; species++) {
      const shape = TREE_SHAPES[species];
      const tree = treeSpec(16, 16, species, shape.trunk[0]);
      // Il bordo scorre attraverso l'albero: fuori del tutto, di taglio sulla
      // chioma, e infine tutto dentro.
      for (const edge of [10, 13, 15, 16, 17, 19, 24]) {
        const world = new VoxelWorld();
        writeTree(world, tree, groundZ, edge, 0, 64, 64);

        let highest = 0;
        for (let z = 0; z < 96; z++) {
          for (let y = 0; y < 64; y++) {
            for (let x = edge; x < 64; x++) {
              if (world.getBlock(x, y, z) !== 0) highest = Math.max(highest, z + 1);
            }
          }
        }
        expect(treeTopIn(tree, groundZ, edge, 0, 64, 64), `specie ${species}, bordo ${edge}`)
          .toBe(highest);
      }
    }
  });

  it('la corteccia della betulla non e’ legno, e le altre si', () => {
    const groundZ = 8;
    const barkOf = (species: number): number => {
      const world = new VoxelWorld();
      const tree = treeSpec(16, 16, species, TREE_SHAPES[species].trunk[0]);
      writeTree(world, tree, groundZ, 0, 0, 32, 32);
      return world.getBlock(16, 16, groundZ);
    };

    expect(barkOf(TREE_SPECIES.birch)).toBe(TREE_SHAPES[TREE_SPECIES.birch].bark);
    expect(barkOf(TREE_SPECIES.birch)).not.toBe(barkOf(TREE_SPECIES.broadleaf));
    for (const species of [TREE_SPECIES.broadleaf, TREE_SPECIES.conifer, TREE_SPECIES.palm]) {
      expect(barkOf(species), `specie ${species}`).toBe(PALETTE_SLOTS.wood);
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
