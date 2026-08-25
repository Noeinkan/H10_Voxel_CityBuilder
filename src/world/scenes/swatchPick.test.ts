import { describe, expect, it } from 'vitest';
import { firstSolidVoxel, type SwatchBox } from './swatchPick';

const BOX: SwatchBox = { minX: 0, minY: 0, minZ: 0, maxX: 16, maxY: 16, maxZ: 24 };

describe('swatchPick', () => {
  it('scende sul voxel piu\' alto della colonna sotto il raggio', () => {
    // Colonna piena in (2, 3) da z 0 a 4; il raggio scende dritto e si ferma a 4.
    const hit = firstSolidVoxel(
      { ox: 2.3, oy: 3.4, oz: 12, dx: 0, dy: 0, dz: -1 },
      BOX,
      (x, y, z) => x === 2 && y === 3 && z <= 4,
    );
    expect(hit).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('si ferma sul solido piu\' vicino, anche quando un altro sta dietro', () => {
    // Una torre alta in x=4 e una piu' bassa in x=6. Il raggio scende in
    // diagonale e deve fermarsi sulla torre davanti, non attraversarla.
    const hit = firstSolidVoxel(
      { ox: 3.0, oy: 0, oz: 12, dx: 0.4, dy: 0, dz: -1 },
      BOX,
      (x, _y, z) => (x === 4 && z <= 10) || (x === 6 && z <= 3),
    );
    expect(hit).not.toBeNull();
    expect(hit!.x).toBe(4);
    expect(hit!.z).toBeLessThanOrEqual(10);
  });

  it('attraversa il vuoto e non si ferma su un solido fuori dalla rotta', () => {
    // Tutto vuoto: il raggio esce dal riquadro senza colpire niente.
    expect(firstSolidVoxel(
      { ox: 1, oy: 1, oz: 5, dx: 0, dy: 0, dz: -1 },
      BOX,
      () => false,
    )).toBeNull();

    // Un solido fuori dalla rotta (a y=9) non conta.
    expect(firstSolidVoxel(
      { ox: 1, oy: 1, oz: 5, dx: 0, dy: 0, dz: -1 },
      BOX,
      (_x, y) => y === 9,
    )).toBeNull();
  });

  it('lascia perdere un raggio che non incrocia il riquadro', () => {
    expect(firstSolidVoxel(
      { ox: -5, oy: 0, oz: 5, dx: 0, dy: 0, dz: -1 },
      BOX,
      () => true,
    )).toBeNull();
  });

  it('non salta voxel lungo una diagonale: il primo pieno e\' quello esatto', () => {
    // Un cubo pieno in (5, 5, 5): il raggio lo attraversa di taglio e deve
    // fermarsi sulla prima cella che tocca, senza scavalcarne nessuna.
    const hit = firstSolidVoxel(
      { ox: 4.2, oy: 4.2, oz: 7, dx: 0.5, dy: 0.5, dz: -0.5 },
      BOX,
      (x, y, z) => x === 5 && y === 5 && z === 5,
    );
    expect(hit).toEqual({ x: 5, y: 5, z: 5 });
  });
});
