import { describe, expect, it } from 'vitest';
import { MINIATURE_FACE, projectMiniature, type Miniature, type VoxelVolume } from './voxelMiniature';

function volume(sizeX: number, sizeY: number, sizeZ: number, fill: (x: number, y: number, z: number) => number): VoxelVolume {
  const voxels = new Uint8Array(sizeX * sizeY * sizeZ);
  for (let z = 0; z < sizeZ; z++) {
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) voxels[x + sizeX * (y + sizeY * z)] = fill(x, y, z);
    }
  }
  return { sizeX, sizeY, sizeZ, voxels };
}

/** I poligoni di un tracciato `M…L…Z`, come liste di vertici. */
function polygons(d: string): number[][][] {
  return d.split('Z').filter((part) => part !== '').map((part) =>
    part.split(/[ML]/).filter((point) => point !== '').map((point) => point.split(' ').map(Number)),
  );
}

/** Area in unita' di reticolo: un triangolo vale 1 (lato verticale 2, altezza 1). */
function area(miniature: Miniature): number {
  let total = 0;
  for (const group of miniature.groups) {
    for (const polygon of polygons(group.d)) {
      let twice = 0;
      for (let i = 0; i < polygon.length; i++) {
        const [x0, y0] = polygon[i];
        const [x1, y1] = polygon[(i + 1) % polygon.length];
        twice += x0 * y1 - x1 * y0;
      }
      total += Math.abs(twice) / 2;
    }
  }
  return total;
}

describe('projectMiniature', () => {
  it('un voxel solo mostra tre facce da due triangoli ciascuna', () => {
    const mini = projectMiniature(volume(1, 1, 1, () => 7));
    expect(mini.groups.map((group) => [group.slot, group.face])).toEqual([
      [7, MINIATURE_FACE.top],
      [7, MINIATURE_FACE.left],
      [7, MINIATURE_FACE.right],
    ]);
    expect(area(mini)).toBe(6);
    // L'esagono di un cubo: due colonne, e quattro mezzi spigoli di altezza.
    expect(mini.columns).toBe(2);
    expect(mini.rows).toBe(4);
  });

  it('un cubo pieno copre esattamente il suo esagono, senza sovrapposizioni', () => {
    // Se due gruppi coprissero lo stesso triangolo l'area sommata supererebbe
    // quella della sagoma: e' il controllo che lo z-buffer ha risolto tutto.
    for (const n of [2, 3, 5]) {
      const mini = projectMiniature(volume(n, n, n, () => 4));
      expect(area(mini), `cubo ${n}`).toBe(6 * n * n);
      expect(mini.groups).toHaveLength(3);
    }
  });

  it('una faccia intera diventa strisce, non triangoli', () => {
    // Il tetto di una lastra 4×4 e' un rombo: quattro colonne di tracciato, non
    // trentadue triangoli. E' cio' che tiene piccolo l'SVG di una torre.
    const mini = projectMiniature(volume(4, 4, 1, () => 2));
    const top = mini.groups.find((group) => group.face === MINIATURE_FACE.top);
    expect(polygons(top?.d ?? '')).toHaveLength(8);
    expect(area(mini)).toBe(2 * 16 + 2 * 4 + 2 * 4);
  });

  it('il voxel piu vicino alla camera vince sullo stesso triangolo', () => {
    // (1,1,1) cade sullo schermo esattamente sopra (0,0,0): quello dietro non
    // deve lasciare nemmeno un triangolo, qualunque sia l'ordine di visita.
    const mini = projectMiniature(volume(2, 2, 2, (x, y, z) => {
      if (x === 0 && y === 0 && z === 0) return 3;
      return x === 1 && y === 1 && z === 1 ? 9 : 0;
    }));
    expect(new Set(mini.groups.map((group) => group.slot))).toEqual(new Set([9]));
    expect(area(mini)).toBe(6);
  });

  it('una faccia coperta a meta resta visibile per la meta scoperta', () => {
    // Un voxel un passo verso `+x` e uno piu' in alto copre, con la sua faccia
    // destra, meta' tetto e meta' fianco di quello sotto: due triangoli su sei.
    const mini = projectMiniature(volume(2, 1, 2, (x, _y, z) => {
      if (x === 0 && z === 0) return 5;
      return x === 1 && z === 1 ? 6 : 0;
    }));
    expect(mini.groups.filter((group) => group.slot === 5)).toHaveLength(3);
    expect(mini.groups.filter((group) => group.slot === 6)).toHaveLength(3);
    expect(area(mini)).toBe(10);
  });

  it('un volume vuoto non produce niente', () => {
    expect(projectMiniature(volume(3, 3, 3, () => 0)).groups).toEqual([]);
    expect(projectMiniature({ sizeX: 0, sizeY: 0, sizeZ: 0, voxels: new Uint8Array(0) }).groups).toEqual([]);
  });

  it('e deterministico', () => {
    const shape = volume(4, 3, 5, (x, y, z) => ((x * 7 + y * 3 + z * 5) % 4 === 0 ? 0 : 1 + ((x + z) % 3)));
    expect(projectMiniature(shape)).toEqual(projectMiniature(shape));
  });
});
