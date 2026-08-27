import { it } from 'vitest';
import {
  SWATCH_ARCOLOGIES,
  SWATCH_BUILDINGS,
  SWATCH_LANDMARKS,
  SWATCH_LINES,
  swatchExtent,
  swatchFocusExtent,
  SWATCH_FOCUS,
} from './swatchCatalog';

it('probe', () => {
  const dump = (name: string, subs: readonly { id: string; rect: { x0: number; y0: number; x1: number; y1: number } }[]) => {
    console.log(name, subs.map((s) => `${s.id}@[${s.rect.x0},${s.rect.y0},${s.rect.x1},${s.rect.y1}]`).join(' '));
  };
  dump('LINES', SWATCH_LINES);
  dump('BUILDINGS', SWATCH_BUILDINGS);
  dump('LANDMARKS', SWATCH_LANDMARKS);
  dump('ARCOLOGIES', SWATCH_ARCOLOGIES);
  console.log('EXTENT', JSON.stringify(swatchExtent()));
  console.log('ARC FOCUS', JSON.stringify(swatchFocusExtent(SWATCH_FOCUS.arcologies)));
});
