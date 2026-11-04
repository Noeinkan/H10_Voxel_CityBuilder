import { describe, expect, it } from 'vitest';
import { planValley, valleyCutAt } from './valley';
import { shapeFromRegion, withCoastalExtension } from './region';

const shape = shapeFromRegion({ minX: 0, minY: 0, sizeX: 512, sizeY: 512 });

describe('valle principale', () => {
  it('dipende dal seed e dalla sagoma base, non dalle estensioni', () => {
    const grown = withCoastalExtension(
      shape,
      { minX: 384, minY: 192, sizeX: 128, sizeY: 128 },
      'settore',
    );
    expect(planValley(1337, grown, 76.8)).toEqual(planValley(1337, shape, 76.8));
    expect(planValley(1338, shape, 76.8)).not.toEqual(planValley(1337, shape, 76.8));
  });

  it('abbassa il centro del corridoio e svanisce sui fianchi e verso la costa', () => {
    const valley = planValley(1337, shape, 76.8);
    const across = valley.offset + valley.bend;
    const x = valley.centreX - valley.sin * across;
    const y = valley.centreY + valley.cos * across;
    expect(valleyCutAt(valley, x, y)).toBeCloseTo(valley.depth);
    expect(valleyCutAt(valley, x - valley.sin * valley.width * 2, y + valley.cos * valley.width * 2))
      .toBe(0);
    expect(valleyCutAt(valley, x + valley.cos * valley.radius, y + valley.sin * valley.radius))
      .toBe(0);
  });
});
