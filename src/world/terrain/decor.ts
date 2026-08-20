import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import type { VoxelWorld } from '../VoxelWorld';
import { hashCoords, mulberry32 } from '../rng';
import { BIOME, TERRAIN, TREE_DECOR, TREE_SHAPES } from './config';

/** Indici nel catalogo `TREE_SHAPES`: l'ordine dei due elenchi e' lo stesso. */
export const TREE_SPECIES = {
  conifer: 0,
  broadleaf: 1,
  autumn: 2,
} as const;

/**
 * Raggio di ingombro di ogni specie, dedotto dal suo profilo una volta sola.
 *
 * E' il numero che tiene separate le chiome vicine e che dice al generatore
 * quanto largo valutare l'anello: dedurlo invece di dichiararlo evita che una
 * riga del catalogo e il resto del terreno raccontino due storie diverse.
 */
const CANOPY_RADII: readonly number[] = TREE_SHAPES.map((shape) =>
  shape.canopy.reduce((widest, level) => Math.max(widest, level.radius), 0),
);

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
  const species = Math.floor(random() * TREE_SHAPES.length);
  const shape = TREE_SHAPES[species];
  const trunkHeight = shape.trunk[0] + Math.floor(random() * shape.trunk[1]);

  return treeSpec(x, y, species, trunkHeight);
}

/**
 * Ricompone lo spec dai soli campi serializzati nel record decor.
 *
 * Il blocco porta specie e tronco, non l'ingombro: sta qui l'unico punto in cui
 * si ricava, cosi' il generatore non ne tiene una copia propria.
 */
export function treeSpec(x: number, y: number, species: number, trunkHeight: number): TreeSpec {
  return { x, y, species, trunkHeight, canopyRadius: CANOPY_RADII[species] };
}

/** Altezza esclusiva massima toccata dall'albero, utile per allocare i chunk. */
export function treeTop(tree: TreeSpec, groundZ: number): number {
  const shape = TREE_SHAPES[tree.species];
  // Il massimo non e' decorativo: un profilo che affondasse la chioma piu' di
  // quanto e' alta lascerebbe il tronco a sporgere, e i chunk vanno allocati
  // fino a li' comunque.
  return Math.max(
    groundZ + tree.trunkHeight,
    canopyBaseZ(shape, groundZ, tree.trunkHeight) + shape.canopy.length,
  );
}

/** Quota del primo livello di chioma: da qui in su si impila il profilo. */
function canopyBaseZ(shape: (typeof TREE_SHAPES)[number], groundZ: number, trunkHeight: number): number {
  return groundZ + trunkHeight - shape.sink;
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

  // La chioma passa sopra la cima del tronco e la copre: e' voluto, quei voxel
  // sono interni e non si vedono, e costa meno che ritagliarli.
  const shape = TREE_SHAPES[tree.species];
  const baseZ = canopyBaseZ(shape, groundZ, tree.trunkHeight);
  for (let level = 0; level < shape.canopy.length; level++) {
    const { radius, cut, tone } = shape.canopy[level];
    const leaf = shape.tones[tone];
    const z = baseZ + level;
    for (let y = tree.y - radius; y <= tree.y + radius; y++) {
      for (let x = tree.x - radius; x <= tree.x + radius; x++) {
        // Smussa gli angoli senza forme dedicate ne' randomness extra.
        if (Math.abs(x - tree.x) + Math.abs(y - tree.y) > cut) continue;
        put(x, y, z, leaf);
      }
    }
  }
  return written;
}

/** I biomi che devono restare senza alberi, esposti per test e documentazione. */
export const TREELESS_BIOMES: readonly number[] = [BIOME.ocean, BIOME.beach, BIOME.rock];
