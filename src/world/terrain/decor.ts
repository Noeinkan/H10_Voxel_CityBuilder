import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import type { VoxelWorld } from '../VoxelWorld';
import { hashCoords, mulberry32 } from '../rng';
import { BIOME, TERRAIN, TREE_DECOR } from './config';

export const TREE_SPECIES = {
  conifer: 0,
  broadleaf: 1,
  autumn: 2,
} as const;

export interface TreeSpec {
  readonly x: number;
  readonly y: number;
  readonly species: number;
  readonly trunkHeight: number;
  readonly canopyRadius: number;
}

/** Origine jitterata, indipendente da bioma e quota: serve al generatore per campionarle. */
export function treeOrigin(seed: number, cellX: number, cellY: number): readonly [number, number] {
  const random = mulberry32(hashCoords(seed, cellX, cellY));
  // La prima estrazione e' riservata alla densita', cosi' `treeAt` e questa
  // funzione leggono lo stesso flusso senza introdurre uno stato condiviso.
  random();
  return [
    cellX * TREE_DECOR.cellSize + 2 + Math.floor(random() * TREE_DECOR.jitterSize),
    cellY * TREE_DECOR.cellSize + 2 + Math.floor(random() * TREE_DECOR.jitterSize),
  ];
}

/**
 * Candidato puro di una cella di decorazione. Il PRNG e' locale alla cella,
 * dunque il risultato e' identico indipendentemente dall'ordine dei blocchi.
 */
export function treeAt(
  seed: number,
  cellX: number,
  cellY: number,
  height: number,
  biome: number,
  slope: number,
): TreeSpec | null {
  if (TREE_DECOR.density[biome] === undefined || TREE_DECOR.density[biome] === 0) return null;
  if (slope >= TERRAIN.buildableMaxSlope || height < TERRAIN.seaLevel) return null;

  const random = mulberry32(hashCoords(seed, cellX, cellY));
  if (random() >= TREE_DECOR.density[biome]) return null;

  const x = cellX * TREE_DECOR.cellSize + 2 + Math.floor(random() * TREE_DECOR.jitterSize);
  const y = cellY * TREE_DECOR.cellSize + 2 + Math.floor(random() * TREE_DECOR.jitterSize);
  const species = Math.floor(random() * 3);
  const trunkHeight = 3 + Math.floor(random() * 2);
  // Le conifere snelle sono l'unica specie con chioma da un voxel; tutte le
  // altre arrivano al massimo raggio dichiarato dall'anello.
  const canopyRadius = species === TREE_SPECIES.conifer ? 1 : TREE_DECOR.ring;

  return { x, y, species, trunkHeight, canopyRadius };
}

/** Altezza esclusiva massima toccata dall'albero, utile per allocare i chunk. */
export function treeTop(tree: TreeSpec, groundZ: number): number {
  return groundZ + tree.trunkHeight + 1;
}

/** Scrive soltanto la porzione dell'albero che cade nel rettangolo del blocco. */
export function writeTree(
  world: VoxelWorld,
  tree: TreeSpec,
  groundZ: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  let written = 0;
  const put = (x: number, y: number, z: number, palette: number): void => {
    if (x < minX || x >= maxX || y < minY || y >= maxY) return;
    world.setBlock(x, y, z, palette);
    written++;
  };

  for (let z = groundZ; z < groundZ + tree.trunkHeight; z++) {
    put(tree.x, tree.y, z, PALETTE_SLOTS.wood);
  }

  const leaf =
    tree.species === TREE_SPECIES.autumn
      ? PALETTE_SLOTS.brickLight
      : tree.species === TREE_SPECIES.conifer
        ? PALETTE_SLOTS.grassDark
        : PALETTE_SLOTS.grassLight;
  const baseZ = groundZ + tree.trunkHeight - 2;
  for (let level = 0; level < 3; level++) {
    const radius = level === 2 ? Math.max(0, tree.canopyRadius - 1) : tree.canopyRadius;
    for (let y = tree.y - radius; y <= tree.y + radius; y++) {
      for (let x = tree.x - radius; x <= tree.x + radius; x++) {
        // Smussa gli angoli della chioma senza usare forme o randomness extra.
        if (Math.abs(x - tree.x) + Math.abs(y - tree.y) > radius + 1) continue;
        put(x, y, baseZ + level, leaf);
      }
    }
  }
  return written;
}

/** I biomi che devono restare senza alberi, esposti per test e documentazione. */
export const TREELESS_BIOMES: readonly number[] = [BIOME.ocean, BIOME.beach, BIOME.rock];
