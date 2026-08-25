import { describe, expect, it } from 'vitest';
import {
  SWATCH_ARCOLOGIES,
  SWATCH_BUILDINGS,
  SWATCH_FOCUS,
  SWATCH_FOCUSES,
  SWATCH_LANDMARKS,
  SWATCH_SUBJECTS,
  swatchExtent,
  swatchFocusExtent,
  type SwatchFocus,
  type SwatchSubject,
} from './swatchCatalog';

describe('swatchCatalog · navigazione', () => {
  it('espone sei fasce nell\'ordine del pannello, e «Tutto» e\' l\'estensione intera', () => {
    expect(SWATCH_FOCUSES).toEqual([
      SWATCH_FOCUS.matrix,
      SWATCH_FOCUS.scale,
      SWATCH_FOCUS.buildings,
      SWATCH_FOCUS.landmarks,
      SWATCH_FOCUS.arcologies,
      SWATCH_FOCUS.all,
    ]);
    expect(swatchFocusExtent(SWATCH_FOCUS.all)).toEqual(swatchExtent());
  });

  it('ogni fascia inquadra i propri soggetti, con margine', () => {
    for (const focus of SWATCH_FOCUSES) {
      const e = swatchFocusExtent(focus);
      expect(e.sizeX).toBeGreaterThan(0);
      expect(e.sizeY).toBeGreaterThan(0);
      expect(e.sizeZ).toBeGreaterThan(0);

      for (const subject of subjectsOf(focus)) {
        expect(subject.rect.x0).toBeGreaterThanOrEqual(e.minX);
        expect(subject.rect.y0).toBeGreaterThanOrEqual(e.minY);
        expect(subject.rect.x1).toBeLessThanOrEqual(e.minX + e.sizeX);
        expect(subject.rect.y1).toBeLessThanOrEqual(e.minY + e.sizeY);
      }
    }
  });
});

/** I soggetti che una fascia promette di inquadrare. */
function subjectsOf(focus: SwatchFocus): readonly SwatchSubject[] {
  if (focus === SWATCH_FOCUS.all) return SWATCH_SUBJECTS;
  if (focus === SWATCH_FOCUS.buildings) return SWATCH_BUILDINGS;
  if (focus === SWATCH_FOCUS.landmarks) return SWATCH_LANDMARKS;
  if (focus === SWATCH_FOCUS.arcologies) return SWATCH_ARCOLOGIES;
  return SWATCH_SUBJECTS.filter((subject) =>
    focus === SWATCH_FOCUS.matrix
      ? subject.kind === 'matrix'
      : subject.kind === 'strata' || subject.kind === 'scale');
}
