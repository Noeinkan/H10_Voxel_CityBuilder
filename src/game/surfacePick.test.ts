import { describe, expect, it } from 'vitest';
import { testTerrain } from '../sim/testTerrain';
import { pickSolidCell, pickSurfaceCell } from './surfacePick';

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

describe('pickSolidCell', () => {
  /** Una torre alta trenta voxel sulle colonne 14..17, e nient'altro. */
  const tower = (x: number): number => (x >= 14 && x <= 17 ? 30 : 0);

  it('si ferma sulla torre, non sulla terra che le sta dietro', () => {
    // Il difetto che questa funzione chiude: la heightmap non conosce gli
    // edifici, quindi il raggio attraversava la torre come se fosse vetro e si
    // fermava molte colonne piu' in la'. Le viste ci si agganciavano, e puntare
    // un grattacielo apriva la lente su un altro isolato.
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const ray = { origin: [20, 9.5, 40], direction: [-0.3, 0, -0.954] } as const;

    expect(pickSolidCell(ray, map, null, 64)?.x).toBe(11);
    expect(pickSolidCell(ray, map, tower, 64)).toEqual({ x: 16, y: 9, z: 12, buildable: true });
  });

  it('la colonna resta quella del terreno, anche fermandosi su un tetto', () => {
    // Chi la riceve ragiona sul suolo — l'isolato, la carreggiata, il mirino —
    // e la quota di cio' che ci sta sopra la chiede a chi la sa.
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const straight = { origin: [15.5, 9.5, 40], direction: [0, 0, -1] } as const;

    expect(pickSolidCell(straight, map, tower, 64)?.z).toBe(12);
  });

  it('senza edifici risponde esattamente come la sola heightmap', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    for (const ray of [
      { origin: [8.5, 9.5, 40], direction: [0, 0, -1] },
      { origin: [17, 8, 40], direction: [0.5, 0, -1] },
      { origin: [80, 80, 40], direction: [0, 0, -1] },
    ] as const) {
      expect(pickSolidCell(ray, map, () => 0, 64)).toEqual(pickSurfaceCell(ray, map));
    }
  });
});
