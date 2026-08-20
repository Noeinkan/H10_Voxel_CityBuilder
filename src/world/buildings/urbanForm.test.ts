import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { DEFAULT_BUILDING_FORM } from './config';
import { generateBuilding } from './generate';
import type { BuildingForm } from './config';

function build(seed: number, form: BuildingForm) {
  return generateBuilding({
    class: BUILDING_CLASS.residential,
    level: 4,
    seed,
    footprintCap: 4,
    footprintFloor: 1,
    form,
  });
}

describe('forma urbana locale', () => {
  it('resta deterministica ma cambia con densita, ricchezza e accessibilita', () => {
    const urban = { density: 1, wealth: 1, accessibility: 1, satisfaction: 1 };
    let changed = false;
    for (let seed = 0; seed < 24; seed++) {
      const low = build(seed, DEFAULT_BUILDING_FORM);
      const high = build(seed, urban);
      const again = build(seed, urban);
      expect(high.voxels).toEqual(again.voxels);
      if (high.sizeX !== low.sizeX || high.sizeZ !== low.sizeZ || !high.voxels.every((v, i) => v === low.voxels[i])) {
        changed = true;
      }
    }
    expect(changed).toBe(true);
  });
});
