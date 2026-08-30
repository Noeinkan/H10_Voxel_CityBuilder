import { hashCoords } from '../rng';
import { blockRect, FACING, type Facing } from '../streets/streetGrid';
import {
  ARCOLOGY,
  SUNKEN_ARCOLOGY_RECIPES,
  TALL_ARCOLOGY_RECIPES,
  sunkenDepthOf,
  type ArcologyRecipe,
} from './config';
import { arcologySpan } from './generate';
import type { BlockBounds } from './siting';

/**
 * Forma deterministica che entra nell'isolato — o nel cluster — se il catalogo
 * ne contiene una.
 *
 * La rotazione del catalogo conserva la varieta' senza trasformarla in fortuna:
 * lo stesso isolato dello stesso seed sceglie sempre la stessa forma. Saltare
 * le ricette troppo larghe e' la correzione importante — la Twin Stem da sedici
 * non deve rendere irraggiungibile una Branching Core da quattordici.
 *
 * Le ricette multi-blocco dichiarano `blocks` e chiedono il **cluster** di
 * isolati adiacenti al posto del singolo isolato: qui si calcola il riquadro
 * che li unisce e si verifica che l'ingombro ci stia.
 */
export interface ArcologyPick {
  readonly recipe: ArcologyRecipe;
  /** Riquadro in cui l'ingombro deve stare: l'isolato o il cluster di blocchi. */
  readonly rect: BlockBounds;
}

/** Riquadro che unisce `bx × by` blocchi, con l'angolo su `(kx, ky)`. */
function clusterRectOf(
  seed: number,
  kx: number,
  ky: number,
  bx: number,
  by: number,
): BlockBounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let j = 0; j < by; j++) {
    for (let i = 0; i < bx; i++) {
      const r = blockRect(seed, { kx: kx + i, ky: ky + j });
      x0 = Math.min(x0, r.x0);
      y0 = Math.min(y0, r.y0);
      x1 = Math.max(x1, r.x1);
      y1 = Math.max(y1, r.y1);
    }
  }
  return { x0, y0, x1, y1 };
}

/** Il numero di blocchi di una ricetta, gia' portato sul verso vero. */
function orientedBlocks(recipe: ArcologyRecipe, facing: Facing): [number, number] {
  const [bx, by] = recipe.blocks;
  return facing === FACING.east || facing === FACING.west ? [bx, by] : [by, bx];
}

/**
 * Le due famiglie del catalogo: quella che sale e quella che scende.
 *
 * **Si sceglie prima della forma, e la sceglie la fascia.** Un cratere nel
 * centro denso e una torre dove la gerarchia non concede altezza sarebbero
 * entrambi la stessa cosa sbagliata — la megastruttura che ignora la ragione per
 * cui esiste. Pescare dall'unione dei cataloghi lo avrebbe reso possibile una
 * volta su tre.
 */
export type ArcologyFamily = 'tall' | 'sunken';

function familyOf(family: ArcologyFamily): readonly ArcologyRecipe[] {
  return family === 'sunken' ? SUNKEN_ARCOLOGY_RECIPES : TALL_ARCOLOGY_RECIPES;
}

export function arcologyForBlock(
  seed: number,
  blockKx: number,
  blockKy: number,
  facing: Facing,
  family: ArcologyFamily = 'tall',
  /**
   * Quote scavabili nel sito. Una ricetta che ne chiede di piu' viene saltata.
   *
   * **E' lo stesso scorrimento che gia' salta le ricette troppo larghe**, e per
   * lo stesso motivo: la Twin Stem da sedici non deve rendere irraggiungibile
   * una Branching Core da quattordici, e la piramide da ventidue non deve
   * rendere irraggiungibile la corte da sedici. Su un'isola dove due terzi dei
   * siti reggono ventidue quote e tutti ne reggono sedici, senza questa riga un
   * isolato buono si perderebbe per la sola forma sorteggiata.
   */
  availableDepth = Number.MAX_SAFE_INTEGER,
): ArcologyPick {
  const catalog = familyOf(family);
  const start = hashCoords((seed ^ ARCOLOGY.kindSalt) >>> 0, blockKx, blockKy) % catalog.length;

  for (let offset = 0; offset < catalog.length; offset++) {
    const recipe = catalog[(start + offset) % catalog.length];
    if (sunkenDepthOf(recipe) > availableDepth) continue;
    const [bx, by] = orientedBlocks(recipe, facing);
    const rect = clusterRectOf(seed, blockKx, blockKy, bx, by);
    const width = rect.x1 - rect.x0 + 1;
    const depth = rect.y1 - rect.y0 + 1;
    const span = arcologySpan(recipe, facing);
    if (span.sizeX <= width && span.sizeY <= depth) return { recipe, rect };
  }

  // Il predicato di sito produrra' `blockTooSmall` o `tooShallow`; restituire
  // una ricetta mantiene una sola via di rifiuto invece di inventarne una qui.
  const recipe = catalog[start];
  const [bx, by] = orientedBlocks(recipe, facing);
  return { recipe, rect: clusterRectOf(seed, blockKx, blockKy, bx, by) };
}
