import { describe, it } from 'vitest';
import { LANDFORM, TERRAIN } from './config';
import { HeightField } from './heightField';
import { shapeFromRegion } from './region';

const SHAPE = shapeFromRegion({ minX: 0, minY: 0, sizeX: 512, sizeY: 512 });
const SEEDS = [1337, 7, 42, 99991, 2024, 65535, 314159, 8675309];
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

describe('probe conche', () => {
  it('conta i candidati che cadono a ogni filtro', () => {
    for (const seed of SEEDS) {
      const field = new HeightField(seed, SHAPE);
      const floorZ = TERRAIN.seaLevel - LANDFORM.basinFloorBelow;
      const rimMin = TERRAIN.seaLevel + LANDFORM.basinRimAbove[0];
      const rimMax = TERRAIN.seaLevel + LANDFORM.basinRimAbove[1];
      const wall = LANDFORM.basinSlope * (1 - LANDFORM.basinPlateau);
      const spread = LANDFORM.basinReach[1];

      let inBand = 0;
      let smallEnough = 0;
      let best = 0;
      const dryHistogram = new Map<number, number>();

      for (let i = 0; i < LANDFORM.basinCandidates; i++) {
        const ratio = LANDFORM.basinReach[0] + spread * Math.sqrt((i + 0.5) / LANDFORM.basinCandidates);
        const angle = i * GOLDEN_ANGLE;
        const cx = SHAPE.centreX + ratio * SHAPE.radiusX * Math.cos(angle);
        const cy = SHAPE.centreY + ratio * SHAPE.radiusY * Math.sin(angle);
        const rim = field.heightAt(cx, cy);
        if (rim < rimMin || rim > rimMax) continue;
        inBand++;
        const radius = (HALF_PI * (rim - floorZ)) / wall;
        if (radius > LANDFORM.basinMaxRadius * Math.min(SHAPE.radiusX, SHAPE.radiusY)) continue;
        smallEnough++;

        let dry = 0;
        for (let p = 0; p < LANDFORM.basinShoreProbes; p++) {
          const a = (p * TAU) / LANDFORM.basinShoreProbes;
          const x = cx + radius * LANDFORM.basinShoreReach * Math.cos(a);
          const y = cy + radius * LANDFORM.basinShoreReach * Math.sin(a);
          if (field.heightAt(x, y) >= TERRAIN.seaLevel + LANDFORM.basinShoreMargin) dry++;
        }
        dryHistogram.set(dry, (dryHistogram.get(dry) ?? 0) + 1);
        if (dry > best) best = dry;
      }

      const histogram = Array.from(dryHistogram.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([dry, n]) => `${dry}:${n}`)
        .join(' ');
      console.log(
        `seed ${String(seed).padStart(8)}  in fascia ${inBand}  raggio ok ${smallEnough}  `
        + `migliore ${best}/${LANDFORM.basinShoreProbes}  istogramma ${histogram}`,
      );
    }
  });
});
