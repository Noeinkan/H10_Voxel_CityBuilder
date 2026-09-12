import { describe, expect, it } from 'vitest';
import {
  buildLandmarkSurface,
  sameBox,
  MAX_SILHOUETTE_FACES,
  type VoxelReader,
} from './landmarkSurface';
import type { InspectBox } from './inspect';
import { XRAY } from './xray';

/** Un reticolo scritto a mano: il modulo non deve conoscere il `VoxelWorld`. */
function readerOf(solid: Iterable<readonly [number, number, number]>): VoxelReader {
  const set = new Set<string>();
  for (const [x, y, z] of solid) set.add(`${x},${y},${z}`);
  return (x, y, z) => (set.has(`${x},${y},${z}`) ? 1 : 0);
}

function boxOf(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): InspectBox {
  return { x0, y0, z0, x1, y1, z1 };
}

/** Quante facce sono uscite: sei vertici ciascuna, triangoli sciolti. */
function faceCount(vertexCount: number): number {
  return vertexCount / 6;
}

describe('buildLandmarkSurface', () => {
  it('un voxel isolato porta le sue sei facce', () => {
    const surface = buildLandmarkSurface(readerOf([[0, 0, 0]]), boxOf(0, 0, 0, 1, 1, 1));
    expect(faceCount(surface.vertexCount)).toBe(6);
  });

  it('la faccia fra due voxel attaccati non si disegna', () => {
    // E' l'unica ragione per cui serve leggere il vicino invece di stampare sei
    // facce per cella: una buccia con dentro i tramezzi non e' una buccia.
    const surface = buildLandmarkSurface(
      readerOf([[0, 0, 0], [1, 0, 0]]),
      boxOf(0, 0, 0, 2, 1, 1),
    );
    expect(faceCount(surface.vertexCount)).toBe(10);
  });

  it('il vicino conta anche fuori dal riquadro', () => {
    // Un landmark che tocca l'edificio accanto non deve accendere la parete che
    // li separa: nessuno puo' vederla, e a schermo sarebbe una faccia sospesa
    // dentro il vicino.
    const attached = buildLandmarkSurface(
      readerOf([[0, 0, 0], [1, 0, 0]]),
      boxOf(0, 0, 0, 1, 1, 1),
    );
    expect(faceCount(attached.vertexCount)).toBe(5);
  });

  it('le facce guardano fuori', () => {
    // Il verso non e' un dettaglio: la sagoma si disegna con le back-face
    // scartate, e una faccia girata al contrario non si vedrebbe affatto. La
    // normale si ricava dai due lati del primo triangolo e deve puntare via dal
    // centro del voxel.
    const surface = buildLandmarkSurface(readerOf([[0, 0, 0]]), boxOf(0, 0, 0, 1, 1, 1));
    const centre = [0.5, 0.5, 0.5];
    for (let face = 0; face < 6; face++) {
      const base = face * 6 * 3;
      const p = (index: number): number[] => [
        surface.positions[base + index * 3]!,
        surface.positions[base + index * 3 + 1]!,
        surface.positions[base + index * 3 + 2]!,
      ];
      const [a, b, c] = [p(0), p(1), p(2)] as [number[], number[], number[]];
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const e2 = [c[0]! - b[0]!, c[1]! - b[1]!, c[2]! - b[2]!];
      const normal = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      // Dal centro del voxel verso il centro della faccia: stesso verso della
      // normale, quindi prodotto scalare positivo.
      const outward = [a[0]! - centre[0]!, a[1]! - centre[1]!, a[2]! - centre[2]!];
      const dot = normal[0]! * outward[0]! + normal[1]! * outward[1]! + normal[2]! * outward[2]!;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('i colori sono la tinta delle guide, scurita per faccia', () => {
    const surface = buildLandmarkSurface(readerOf([[0, 0, 0]]), boxOf(0, 0, 0, 1, 1, 1));
    // Nessun canale supera la tinta piena: la sagoma si legge, non acceca.
    for (let index = 0; index < surface.vertexCount * 3; index += 3) {
      expect(surface.colors[index]!).toBeGreaterThan(0);
      expect(surface.colors[index]!).toBeLessThanOrEqual(XRAY.glow.r);
      expect(surface.colors[index + 1]!).toBeLessThanOrEqual(XRAY.glow.g);
      expect(surface.colors[index + 2]!).toBeLessThanOrEqual(XRAY.glow.b);
    }
    // Il tetto e' la faccia a piena luce, il sotto la piu' scura: senza questo
    // scarto la sagoma e' una macchia piatta e si perde proprio la forma.
    const top = surface.colors[4 * 6 * 3]!;
    const bottom = surface.colors[5 * 6 * 3]!;
    expect(top).toBeGreaterThan(bottom);
  });

  it('il tetto di facce tronca invece di allocare a vuoto', () => {
    // Una scacchiera e' il caso peggiore: nessuna faccia interna si annulla,
    // quindi ogni cella piena ne porta sei.
    const solid: [number, number, number][] = [];
    for (let z = 0; z < 22; z++) {
      for (let y = 0; y < 22; y++) {
        for (let x = 0; x < 22; x++) {
          if ((x + y + z) % 2 === 0) solid.push([x, y, z]);
        }
      }
    }
    const surface = buildLandmarkSurface(readerOf(solid), boxOf(0, 0, 0, 22, 22, 22));
    expect(faceCount(surface.vertexCount)).toBe(MAX_SILHOUETTE_FACES);
  });

  it('i buffer si riusano invece di riallocare', () => {
    const box = boxOf(0, 0, 0, 1, 1, 1);
    const first = buildLandmarkSurface(readerOf([[0, 0, 0]]), box);
    const second = buildLandmarkSurface(readerOf([[0, 0, 0]]), box, first);
    expect(second.positions).toBe(first.positions);
    expect(second.colors).toBe(first.colors);
  });

  it('una scatola vuota non produce niente', () => {
    const surface = buildLandmarkSurface(readerOf([]), boxOf(0, 0, 0, 4, 4, 4));
    expect(surface.vertexCount).toBe(0);
  });
});

describe('sameBox', () => {
  it('riconosce la stessa scatola e distingue una quota diversa', () => {
    const a = boxOf(0, 0, 0, 4, 4, 10);
    expect(sameBox(a, boxOf(0, 0, 0, 4, 4, 10))).toBe(true);
    // Un landmark che avanza di stadio cresce in altezza: e' cosi' che la buccia
    // si rifa' da sola quando il monumento cambia, senza un secondo segnale.
    expect(sameBox(a, boxOf(0, 0, 0, 4, 4, 14))).toBe(false);
    expect(sameBox(a, null)).toBe(false);
    expect(sameBox(null, null)).toBe(true);
  });
});
