import { hashCoords, mulberry32 } from '../rng';
import { LANDFORM } from './config';
import { capForRadius, domeFalloff } from './landform';
import type { IslandShape } from './region';

/** Una valle larga che attraversa l'altopiano e sfuma prima della costa. */
export interface Valley {
  readonly centreX: number;
  readonly centreY: number;
  readonly cos: number;
  readonly sin: number;
  readonly radius: number;
  readonly width: number;
  readonly offset: number;
  readonly bend: number;
  readonly depth: number;
}

/** Il piano usa soltanto seed e sagoma base: le estensioni non muovono l'isola. */
export function planValley(seed: number, shape: IslandShape, relief: number): Valley {
  const rnd = mulberry32(hashCoords(seed, LANDFORM.valleySalt, 0));
  const angle = rnd() * Math.PI * 2;
  const radius = Math.min(shape.radiusX, shape.radiusY);
  const width = radius * (LANDFORM.valleyWidth[0] + rnd() * LANDFORM.valleyWidth[1]);
  return {
    centreX: shape.centreX,
    centreY: shape.centreY,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    radius,
    width,
    offset: (rnd() * 2 - 1) * radius * LANDFORM.valleyOffset,
    bend: (rnd() * 2 - 1) * radius * LANDFORM.valleyBend,
    depth: capForRadius(width, relief, LANDFORM.valleySlope),
  };
}

/** Quota normalizzata sottratta al rilievo prima di scavare eventuali laghi. */
export function valleyCutAt(valley: Valley, x: number, y: number): number {
  const dx = x - valley.centreX;
  const dy = y - valley.centreY;
  const along = (dx * valley.cos + dy * valley.sin) / valley.radius;
  const across = -dx * valley.sin + dy * valley.cos;
  const centre = valley.offset + valley.bend * (1 - along * along);
  const lateral = domeFalloff(Math.abs(across - centre) / valley.width);
  const fade = Math.max(0, Math.abs(along) - LANDFORM.valleyFlatLength)
    / LANDFORM.valleyFadeLength;
  return valley.depth * lateral * domeFalloff(fade);
}
