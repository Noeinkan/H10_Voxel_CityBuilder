import { describe, expect, it } from 'vitest';
import { CHUNK, PADDED_VOL, paddedIdx } from '../../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND } from '../../../world/visualBlock';
import { PALETTE_SLOTS } from '../../paletteSlots';
import { greedyMesh } from '../greedyMesher';
import { planCarves } from '../carvePlan';

function setLocal(p: Uint8Array, x: number, y: number, z: number, b: number): void {
  p[paddedIdx(x + 1, y + 1, z + 1)] = b;
}

describe('probe', () => {
  it('cella roofTech isolata', () => {
    const roof = packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech);
    const padded = new Uint8Array(PADDED_VOL);
    setLocal(padded, CHUNK - 1, 10, 10, roof);
    const marks = new Uint8Array(PADDED_VOL);
    const plan = planCarves(padded, marks, [0, 0, 0]);
    const m = greedyMesh(padded);
    console.info('isolata: carves=', plan.cells.length, 'quads=', plan.quads,
      'detail=', m.detailQuadCount, 'base=', m.quadCount - m.detailQuadCount);
    expect(true).toBe(true);
  });

  it('striscia roofTech', () => {
    const roof = packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech);
    for (const length of [2, 5, 16]) {
      const padded = new Uint8Array(PADDED_VOL);
      for (let i = 0; i < length; i++) setLocal(padded, 10, 10 + i, 10, roof);
      const marks = new Uint8Array(PADDED_VOL);
      const plan = planCarves(padded, marks, [0, 0, 0]);
      const m = greedyMesh(padded);
      console.info('striscia', length, ': carves=', plan.cells.length,
        'detail=', m.detailQuadCount, 'base=', m.quadCount - m.detailQuadCount);
    }
    expect(true).toBe(true);
  });
});
