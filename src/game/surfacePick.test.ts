import { describe, expect, it } from 'vitest';
import { testTerrain } from '../sim/testTerrain';
import { pickSurfaceCell } from './surfacePick';

describe('pickSurfaceCell', () => {
  it('trova la colonna sotto un raggio verticale', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    expect(pickSurfaceCell({ origin: [8.5, 9.5, 40], direction: [0, 0, -1] }, map)).toEqual({
      x: 8,
      y: 9,
      z: 12,
      buildable: true,
    });
  });

  it('non inventa colonne fuori dalla mappa o dietro il raggio', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    expect(pickSurfaceCell({ origin: [80, 80, 40], direction: [0, 0, -1] }, map)).toBeNull();
    expect(pickSurfaceCell({ origin: [8, 8, 40], direction: [0, 0, 1] }, map)).toBeNull();
  });

  it('entra dall’alto quando la proiezione sul piano zero cade fuori mappa', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    expect(pickSurfaceCell({ origin: [17, 8, 40], direction: [0.5, 0, -1] }, map)).toEqual({
      x: 31,
      y: 8,
      z: 12,
      buildable: true,
    });
  });
});
