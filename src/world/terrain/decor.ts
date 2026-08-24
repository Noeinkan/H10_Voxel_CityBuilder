import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import type { VoxelWorld } from '../VoxelWorld';
import { hashCoords, mulberry32 } from '../rng';
import { BIOME, TERRAIN, TREE_DECOR } from './config';
import { FLORA, pickSpecies, TREE_SHAPES } from './flora';

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

/**
 * Scostamento dell'origine dentro la cella, in voxel.
 *
 * Parte da `ring` perche' e' la chioma a decidere il margine: sotto quel valore
 * l'albero sporgerebbe dalla propria cella e finirebbe addosso al vicino.
 */
function treeJitter(random: () => number): number {
  return TREE_DECOR.ring + Math.floor(random() * TREE_DECOR.jitterSize);
}

/** Origine jitterata, indipendente da bioma e quota: serve al generatore per campionarle. */
export function treeOrigin(seed: number, cellX: number, cellY: number): readonly [number, number] {
  const random = mulberry32(hashCoords(seed, cellX, cellY));
  // La prima estrazione e' riservata alla densita', cosi' `treeAt` e questa
  // funzione leggono lo stesso flusso senza introdurre uno stato condiviso.
  random();
  return [
    cellX * TREE_DECOR.cellSize + treeJitter(random),
    cellY * TREE_DECOR.cellSize + treeJitter(random),
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
  const flora = FLORA[biome];
  if (flora === undefined || flora.density <= 0) return null;
  if (slope >= TERRAIN.buildableMaxSlope || height < TERRAIN.seaLevel) return null;

  const random = mulberry32(hashCoords(seed, cellX, cellY));
  if (random() >= flora.density) return null;

  const x = cellX * TREE_DECOR.cellSize + treeJitter(random);
  const y = cellY * TREE_DECOR.cellSize + treeJitter(random);
  // La specie esce dai pesi del bioma, non dal catalogo intero: e' la sola
  // differenza fra una montagna e una pianura piu' rada. Resta **una** sola
  // estrazione, o `treeOrigin` leggerebbe il flusso sfasato.
  const species = pickSpecies(flora, random());
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

  // Tronco di un voxel. Ingrossarlo con la scala sembrava dovuto e invece no:
  // due voxel su una chioma larga nove leggono come un pilastro, e comunque il
  // tronco si vede solo sotto la chioma, dove la parte che conta e' l'ombra che
  // proietta, non la sua sezione.
  for (let z = groundZ; z < groundZ + tree.trunkHeight; z++) {
    put(tree.x, tree.y, z, PALETTE_SLOTS.wood);
  }

  // La chioma passa sopra la cima del tronco e la copre: e' voluto, quei voxel
  // sono interni e non si vedono, e costa meno che ritagliarli.
  const shape = TREE_SHAPES[tree.species];
  const baseZ = canopyBaseZ(shape, groundZ, tree.trunkHeight);

  // Un PRNG per albero, derivato dalla posizione e non conservato nel record
  // decor: due blocchi che si dividono lo stesso albero a cavallo di una
  // cucitura ne ricavano la stessa sequenza, quindi ne disegnano meta' coerenti.
  // Le estrazioni non dipendono dal rettangolo di ritaglio — `put` scarta dopo
  // aver tirato — che e' cio' che rende vera quella coerenza.
  const random = mulberry32(hashCoords(tree.x, tree.y, tree.species));

  for (let level = 0; level < shape.canopy.length; level++) {
    const { radius, cut, tone } = shape.canopy[level];
    const leaf = shape.tones[tone];
    const z = baseZ + level;

    // Il livello puo' pendere solo di quanto avanza fra il suo raggio e quello
    // della specie: l'ingombro dichiarato resta vero, e due chiome vicine non
    // arrivano a toccarsi nemmeno quando pendono l'una verso l'altra.
    const lean = Math.min(TREE_DECOR.maxLean, tree.canopyRadius - radius);
    const cx = tree.x + pickLean(random, lean);
    const cy = tree.y + pickLean(random, lean);

    // `cut` smussa gli angoli senza forme dedicate: a `cut === radius` esce un
    // rombo, a `2 * radius` il quadrato pieno, in mezzo tutte le vie di mezzo.
    const inShape = (px: number, py: number): boolean => {
      const dx = Math.abs(px - cx);
      const dy = Math.abs(py - cy);
      return dx <= radius && dy <= radius && dx + dy <= cut;
    };

    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!inShape(x, y)) continue;

        // La pelle esterna del livello — i voxel che hanno almeno un vicino
        // fuori forma — viene mangiata a caso. E' cio' che toglie alla chioma
        // l'aria di solido geometrico: senza, a raggio quattro un ottagono
        // esatto si legge come un cristallo e non come un albero. Rosicchiare
        // il bordo e non l'interno tiene la chioma piena e la silhouette rotta,
        // che e' esattamente il verso giusto.
        //
        // L'asse della chioma non si mangia mai: su un livello piccolo — la
        // punta di una conifera e' un voxel solo — l'erosione lo decapiterebbe,
        // e `treeTop` smetterebbe di essere la quota che l'albero raggiunge
        // davvero. Ogni livello scrive quindi almeno il proprio centro.
        const onSkin = (x !== cx || y !== cy) &&
          (!inShape(x + 1, y) || !inShape(x - 1, y) ||
            !inShape(x, y + 1) || !inShape(x, y - 1));
        if (onSkin) {
          if (random() < TREE_DECOR.edgeErosion) continue;
          // Quel che resta del bordo prende il tono piu' chiaro: chiude la
          // chioma come volume invece che come profilo tagliato di netto.
          put(x, y, z, shape.tones[Math.min(tone + 1, shape.tones.length - 1)]);
          continue;
        }
        put(x, y, z, leaf);
      }
    }
  }
  return written;
}

/** Scostamento intero in `[-lean, lean]`. A `lean` zero non consuma varieta'. */
function pickLean(random: () => number, lean: number): number {
  if (lean <= 0) return 0;
  return Math.floor(random() * (2 * lean + 1)) - lean;
}

/**
 * I biomi che devono restare spogli, esposti per test e documentazione.
 *
 * **La roccia non c'e' piu'.** Era spoglia da quando era anche l'unico terreno
 * vietato alla citta', cioe' un posto dove non succedeva niente; da quando la
 * roccia si paga invece di essere rifiutata, l'unica ragione per tenerla nuda
 * era l'inerzia. Restano l'acqua, dove non cresce niente, e la spiaggia, che e'
 * il terreno su cui la citta' arriva per prima.
 */
export const TREELESS_BIOMES: readonly number[] = [BIOME.ocean, BIOME.beach];
