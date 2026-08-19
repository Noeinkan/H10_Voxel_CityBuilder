import { describe, expect, it } from 'vitest';
import {
  blockPalette,
  blockSurface,
  packVisualBlock,
  SURFACE_KIND,
} from './visualBlock';

describe('visualBlock', () => {
  it('conserva palette e superficie nello stesso byte', () => {
    for (const surface of Object.values(SURFACE_KIND)) {
      const block = packVisualBlock(31, surface);
      expect(block).toBeLessThanOrEqual(255);
      expect(blockPalette(block)).toBe(31);
      expect(blockSurface(block)).toBe(surface);
    }
  });

  it('il vuoto ignora la superficie', () => {
    expect(packVisualBlock(0, SURFACE_KIND.luminous)).toBe(0);
    expect(blockPalette(0)).toBe(0);
    expect(blockSurface(0)).toBe(SURFACE_KIND.plain);
  });
});
