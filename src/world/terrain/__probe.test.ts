import { describe, it } from 'vitest';
import { TERRAIN } from './config';
import { HeightField } from './heightField';
import { shapeFromRegion } from './region';

const ISLAND = { minX: 0, minY: 0, sizeX: 512, sizeY: 512 };
const SHAPE = shapeFromRegion(ISLAND);
const SEEDS = [1337, 7, 42, 99991, 2024, 65535, 314159, 8675309];

/** Acqua non collegata al bordo della mappa: flood fill dal bordo, il resto e' lago. */
function interiorWater(grid: Float64Array, size: number, side: number): number {
  const sea = new Uint8Array(side * side);
  const stack: number[] = [];
  const push = (i: number): void => {
    if (sea[i] === 1) return;
    const h = grid[i];
    if (h >= TERRAIN.seaLevel) return;
    sea[i] = 1;
    stack.push(i);
  };
  for (let k = 0; k < side; k++) {
    push(k);
    push((side - 1) * side + k);
    push(k * side);
    push(k * side + side - 1);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % side;
    const y = (i - x) / side;
    if (x > 0) push(i - 1);
    if (x < side - 1) push(i + 1);
    if (y > 0) push(i - side);
    if (y < side - 1) push(i + side);
  }

  let lake = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y + 1) * side + (x + 1);
      if (grid[i] < TERRAIN.seaLevel && sea[i] === 0) lake++;
    }
  }
  return lake;
}

describe('probe', () => {
  it('misura il margine di Lipschitz e la distribuzione', () => {
    const size = 512;
    const side = size + 2;
    let globalWorst = 0;
    const rows: string[] = [];

    for (const seed of SEEDS) {
      const field = new HeightField(seed, SHAPE);
      const grid = new Float64Array(side * side);
      for (let y = -1; y <= size; y++) {
        for (let x = -1; x <= size; x++) grid[(y + 1) * side + (x + 1)] = field.heightAt(x, y);
      }

      let worst = 0;
      let land = 0;
      let peak = 0;
      let border = 0;
      const bands = [0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y + 1) * side + (x + 1);
          const h = grid[i];
          const delta = Math.max(
            Math.abs(grid[i + 1] - h),
            Math.abs(grid[i - 1] - h),
            Math.abs(grid[i + side] - h),
            Math.abs(grid[i - side] - h),
          );
          if (delta > worst) worst = delta;
          if (h > peak) peak = h;
          if (h >= TERRAIN.seaLevel) land++;
          if ((x === 0 || y === 0 || x === size - 1 || y === size - 1) && h >= TERRAIN.seaLevel) border++;
          if (h < TERRAIN.seaLevel) bands[0]++;
          else if (h < TERRAIN.beachMaxHeight) bands[1]++;
          else if (h < TERRAIN.forestMinHeight) bands[2]++;
          else if (h < TERRAIN.hillMinHeight) bands[3]++;
          else if (h < TERRAIN.rockMinHeight) bands[4]++;
          else bands[5]++;
        }
      }
      if (worst > globalWorst) globalWorst = worst;
      rows.push(
        `seed ${String(seed).padStart(8)}  worst ${worst.toFixed(3)}  peak ${peak.toFixed(1)}  `
        + `bordo ${border}  laghi ${interiorWater(grid, size, side)}  `
        + `terra ${(100 * land / (size * size)).toFixed(1)}%  `
        + `fasce `
        + bands.map((b) => (100 * b / (size * size)).toFixed(1)).join('/'),
      );
    }

    console.log(rows.join('\n'));
    console.log(`worst globale ${globalWorst.toFixed(4)} (tetto del test 0.8)`);
  });
});
