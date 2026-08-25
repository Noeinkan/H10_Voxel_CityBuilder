import { hashCoords } from '../rng';
import type { Facing } from '../streets/streetGrid';
import { ARCOLOGY, ARCOLOGY_RECIPES, type ArcologyRecipe } from './config';
import { arcologySpan } from './generate';
import type { BlockBounds } from './siting';

/**
 * Forma deterministica che entra nell'isolato, se il catalogo ne contiene una.
 *
 * La rotazione del catalogo conserva la varieta' senza trasformarla in fortuna:
 * lo stesso isolato dello stesso seed sceglie sempre la stessa forma. Saltare
 * le ricette troppo larghe e' la correzione importante — la Twin Stem da
 * sedici non deve rendere irraggiungibile una Branching Core da quattordici.
 */
export function arcologyForBlock(
  seed: number,
  blockKx: number,
  blockKy: number,
  blockRect: BlockBounds,
  facing: Facing,
): ArcologyRecipe {
  const start = hashCoords((seed ^ ARCOLOGY.kindSalt) >>> 0, blockKx, blockKy) %
    ARCOLOGY_RECIPES.length;
  const width = blockRect.x1 - blockRect.x0 + 1;
  const depth = blockRect.y1 - blockRect.y0 + 1;

  for (let offset = 0; offset < ARCOLOGY_RECIPES.length; offset++) {
    const recipe = ARCOLOGY_RECIPES[(start + offset) % ARCOLOGY_RECIPES.length];
    const span = arcologySpan(recipe, facing);
    if (span.sizeX <= width && span.sizeY <= depth) return recipe;
  }

  // Il predicato di sito produrra' `blockTooSmall`; restituire una ricetta
  // mantiene una sola via di rifiuto invece di inventarne una qui.
  return ARCOLOGY_RECIPES[start];
}
