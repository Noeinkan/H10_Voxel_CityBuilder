import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { DEFAULT_BUILDING_FORM } from './config';
import { generateBuilding } from './generate';

describe('forma urbana locale', () => {
  it('resta deterministica ma cambia con densita, ricchezza e accessibilita', () => {
    const urban = { density: 1, wealth: 1, accessibility: 1, satisfaction: 1 };
    let changed = false;
    for (let seed = 0; seed < 24; seed++) {
      const low = generateBuilding(BUILDING_CLASS.residential, 4, seed, 4, 1, DEFAULT_BUILDING_FORM);
      const high = generateBuilding(BUILDING_CLASS.residential, 4, seed, 4, 1, urban);
      const again = generateBuilding(BUILDING_CLASS.residential, 4, seed, 4, 1, urban);
      expect(high.voxels).toEqual(again.voxels);
      if (high.sizeX !== low.sizeX || high.sizeZ !== low.sizeZ || !high.voxels.every((v, i) => v === low.voxels[i])) {
        changed = true;
      }
    }
    expect(changed).toBe(true);
  });
});
