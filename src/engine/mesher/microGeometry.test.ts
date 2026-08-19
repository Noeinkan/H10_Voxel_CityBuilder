import { describe, expect, it } from 'vitest';
import { CHUNK, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { greedyMesh } from './greedyMesher';
import { MAX_DETAIL_QUADS_PER_CHUNK } from './microGeometry';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';

function volume(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

function setLocal(padded: Uint8Array, x: number, y: number, z: number, block: number): void {
  padded[paddedIdx(x + 1, y + 1, z + 1)] = block;
}

function detailPositions(mesh: ReturnType<typeof greedyMesh>): Int16Array {
  const baseVertices = (mesh.quadCount - mesh.detailQuadCount) * 4;
  return mesh.positions.slice(baseVertices * 3);
}

describe('microgeometria 1/16', () => {
  it('conserva il greedy pass in un Int16 esatto e ammette coordinate negative', () => {
    const padded = volume();
    setLocal(padded, 0, 4, 4, packVisualBlock(PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic));

    const mesh = greedyMesh(padded);
    const basePositionCount = (mesh.quadCount - mesh.detailQuadCount) * 4 * 3;

    expect(mesh.positions).toBeInstanceOf(Int16Array);
    expect([...mesh.positions.slice(0, basePositionCount)].every((value) => value % MESH_UNITS_PER_VOXEL === 0)).toBe(true);
    expect([...detailPositions(mesh)]).toContain(-3);
    expect(mesh.min[0]).toBe(-3 / MESH_UNITS_PER_VOXEL);
  });

  it('non aggiunge dettagli a plain o a una superficie interamente occlusa', () => {
    const plain = volume();
    setLocal(plain, 8, 8, 8, PALETTE_SLOTS.concrete);
    expect(greedyMesh(plain).detailQuadCount).toBe(0);

    const hidden = volume();
    setLocal(hidden, 8, 8, 8, packVisualBlock(PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic));
    setLocal(hidden, 7, 8, 8, PALETTE_SLOTS.concrete);
    setLocal(hidden, 9, 8, 8, PALETTE_SLOTS.concrete);
    setLocal(hidden, 8, 7, 8, PALETTE_SLOTS.concrete);
    setLocal(hidden, 8, 9, 8, PALETTE_SLOTS.concrete);
    setLocal(hidden, 8, 8, 7, PALETTE_SLOTS.concrete);
    setLocal(hidden, 8, 8, 9, PALETTE_SLOTS.concrete);
    expect(greedyMesh(hidden).detailQuadCount).toBe(0);
  });

  it('usa il padding per non creare un parapetto sul confine condiviso', () => {
    const roof = packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech);
    const isolated = volume();
    setLocal(isolated, CHUNK - 1, 10, 10, roof);

    const connected = isolated.slice();
    setLocal(connected, CHUNK, 10, 10, roof);

    // Il vicino oltre confine toglie l'intero parapetto +X (5 quad) e sopprime
    // una testata per ciascuno dei due parapetti ortogonali (1 quad l'una): le
    // chiude il chunk accanto, che dal suo lato vede lo stesso confine.
    expect(greedyMesh(isolated).detailQuadCount).toBe(20);
    expect(greedyMesh(connected).detailQuadCount).toBe(13);
  });

  it('fonde una corsa di parapetto in un solo prisma, qualunque sia la lunghezza', () => {
    const roof = packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech);

    // Un tetto lungo `length` celle: i due parapetti che gli corrono a fianco
    // sono una corsa sola, e i due di testa restano lunghi una cella. Quattro
    // prismi da cinque facce, indipendenti dalla lunghezza: e' esattamente la
    // proprieta' che tiene il costo dei dettagli fuori dal numero di voxel.
    for (const length of [2, 3, 5, 8, 16]) {
      const padded = volume();
      for (let i = 0; i < length; i++) setLocal(padded, 10, 10 + i, 10, roof);
      expect(greedyMesh(padded).detailQuadCount).toBe(20);
    }
  });

  it('tiene continua la cornice luminosa invece di spezzarla per cella', () => {
    const glow = packVisualBlock(PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous);
    const padded = volume();
    for (let i = 0; i < 4; i++) setLocal(padded, 10, 10 + i, 10, glow);

    const y = [...detailPositions(greedyMesh(padded))].filter((_, i) => i % 3 === 1);

    // Il traverso rientra di 1/16 ai due estremi veri della fascia...
    expect(y).toContain(10 * MESH_UNITS_PER_VOXEL + 1);
    expect(y).toContain(14 * MESH_UNITS_PER_VOXEL - 1);
    // ...e non ai confini fra una cella e l'altra, dove un prisma per cella
    // lascerebbe due sedicesimi di buco sotto una testata gia' soppressa.
    expect(y).not.toContain(11 * MESH_UNITS_PER_VOXEL + 1);
    expect(y).not.toContain(12 * MESH_UNITS_PER_VOXEL - 1);
  });

  it('estende l AABB sopra il chunk per un parapetto in quota 32', () => {
    const padded = volume();
    setLocal(padded, 10, 10, CHUNK - 1, packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech));

    const mesh = greedyMesh(padded);

    expect(mesh.max[2]).toBe(CHUNK + 3 / MESH_UNITS_PER_VOXEL);
  });

  it('e deterministica, privilegia i portali e non sfonda il tetto', () => {
    const padded = volume();
    setLocal(padded, CHUNK - 1, CHUNK - 1, CHUNK - 1, packVisualBlock(PALETTE_SLOTS.glassDark, SURFACE_KIND.portal));
    // Voxel civici isolati: ognuno chiede otto prismi che nessuna corsa puo'
    // fondere, ed e' il modo piu' rapido per sfondare il tetto.
    for (let z = 0; z < CHUNK; z += 2) {
      for (let y = 0; y < CHUNK; y += 2) {
        for (let x = 0; x < CHUNK; x += 2) {
          setLocal(padded, x, y, z, packVisualBlock(PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic));
        }
      }
    }

    const first = greedyMesh(padded);
    const second = greedyMesh(padded);
    const detailVertex = (first.quadCount - first.detailQuadCount) * 4;

    expect(first.detailQuadCount).toBeLessThanOrEqual(MAX_DETAIL_QUADS_PER_CHUNK);
    expect(first.detailQuadCount).toBeGreaterThan(MAX_DETAIL_QUADS_PER_CHUNK - 64);
    expect(first.palettes[detailVertex]).toBe(PALETTE_SLOTS.metalBrass);
    expect(first.positions).toEqual(second.positions);
    expect(first.indices).toEqual(second.indices);
    expect(first.detailQuadCount).toBe(second.detailQuadCount);
  });
});
