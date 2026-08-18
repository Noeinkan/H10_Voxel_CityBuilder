import { describe, expect, it } from 'vitest';
import { CHUNK, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { greedyMesh } from './greedyMesher';

/** Volume paddato vuoto. Le coordinate locali 0..31 stanno a px = lx + 1. */
function emptyPadded(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

/** Scrive una cella in coordinate locali di chunk (0..31 valide, -1 e 32 = padding). */
function setLocal(padded: Uint8Array, lx: number, ly: number, lz: number, id: number): void {
  padded[paddedIdx(lx + 1, ly + 1, lz + 1)] = id;
}

function fillBox(
  padded: Uint8Array,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  id: number,
): void {
  for (let z = z0; z < z1; z++) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) setLocal(padded, x, y, z, id);
    }
  }
}

/** Conta i triangoli: 2 per quad, 3 indici per triangolo. */
function triangleCount(indices: Uint32Array): number {
  return indices.length / 3;
}

describe('greedyMesh', () => {
  it('un chunk vuoto non produce ne vertici ne indici', () => {
    const mesh = greedyMesh(emptyPadded());

    expect(mesh.quadCount).toBe(0);
    expect(mesh.positions.length).toBe(0);
    expect(mesh.faces.length).toBe(0);
    expect(mesh.palettes.length).toBe(0);
    expect(mesh.indices.length).toBe(0);
  });

  it('un cubo 2x2x2 pieno produce 12 triangoli', () => {
    const padded = emptyPadded();
    fillBox(padded, 4, 4, 4, 6, 6, 6, 7);

    const mesh = greedyMesh(padded);

    expect(mesh.quadCount).toBe(6);
    expect(triangleCount(mesh.indices)).toBe(12);
    expect(mesh.positions.length / 3).toBe(24);
    // Ogni faccia e' un unico quad 2x2: le sei direzioni compaiono una volta a testa.
    const faces = new Set(mesh.faces);
    expect([...faces].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(mesh.min).toEqual([4, 4, 4]);
    expect(mesh.max).toEqual([6, 6, 6]);
  });

  it('due voxel adiacenti dello stesso colore fondono la faccia comune', () => {
    const padded = emptyPadded();
    setLocal(padded, 10, 10, 10, 3);
    setLocal(padded, 11, 10, 10, 3);

    const mesh = greedyMesh(padded);

    // La faccia condivisa non esiste piu' e le quattro facce longitudinali sono
    // fuse in un solo quad 2x1: restano 6 quad, come per un singolo voxel.
    expect(mesh.quadCount).toBe(6);
    expect(triangleCount(mesh.indices)).toBe(12);
    expect(new Set(mesh.palettes)).toEqual(new Set([3]));
  });

  it('due voxel adiacenti di colore diverso non fondono le facce longitudinali', () => {
    const padded = emptyPadded();
    setLocal(padded, 10, 10, 10, 3);
    setLocal(padded, 11, 10, 10, 4);

    const mesh = greedyMesh(padded);

    // La faccia comune resta assente (entrambi solidi) ma le 4 facce lungo X si
    // spezzano in due quad ciascuna: 2 tappi + 8 = 10 quad.
    expect(mesh.quadCount).toBe(10);
    expect(new Set(mesh.palettes)).toEqual(new Set([3, 4]));
  });

  it('un singolo voxel produce 6 quad con una direzione di faccia per lato', () => {
    const padded = emptyPadded();
    setLocal(padded, 0, 0, 0, 1);

    const mesh = greedyMesh(padded);

    expect(mesh.quadCount).toBe(6);
    expect([...mesh.faces].filter((f) => f === 4).length).toBe(4); // +Z: un quad, 4 vertici
    expect(mesh.min).toEqual([0, 0, 0]);
    expect(mesh.max).toEqual([1, 1, 1]);
  });

  it('il padding di un vicino solido sopprime le facce di bordo', () => {
    const solidChunk = (): Uint8Array => {
      const padded = emptyPadded();
      fillBox(padded, 0, 0, 0, CHUNK, CHUNK, CHUNK, 5);
      return padded;
    };

    // Chunk pieno isolato: 6 facce da 32x32, un quad per lato.
    const isolated = greedyMesh(solidChunk());
    expect(isolated.quadCount).toBe(6);

    // Con il vicino +X pieno nel padding, la faccia +X non viene emessa.
    const withNeighbour = solidChunk();
    for (let z = 0; z < CHUNK; z++) {
      for (let y = 0; y < CHUNK; y++) setLocal(withNeighbour, CHUNK, y, z, 5);
    }
    const meshed = greedyMesh(withNeighbour);
    expect(meshed.quadCount).toBe(5);
    expect([...meshed.faces].includes(0)).toBe(false); // nessuna faccia +X
  });

  it('una faccia al bordo viene emessa da un solo lato', () => {
    // Voxel locale a lx = 0 con vicino -X vuoto: la faccia -X appartiene a questo
    // chunk. Il vicino, con il nostro voxel nel proprio padding a px = 33, non
    // deve emettere la stessa faccia.
    const owner = emptyPadded();
    setLocal(owner, 0, 5, 5, 2);
    const ownerMesh = greedyMesh(owner);
    expect([...ownerMesh.faces].filter((f) => f === 1).length).toBe(4); // -X presente

    const neighbour = emptyPadded();
    setLocal(neighbour, CHUNK, 5, 5, 2); // solo padding, nessun voxel proprio
    const neighbourMesh = greedyMesh(neighbour);
    expect(neighbourMesh.quadCount).toBe(0);
  });

  it('fonde un piano 32x32 in un unico quad per direzione', () => {
    const padded = emptyPadded();
    fillBox(padded, 0, 0, 0, CHUNK, CHUNK, 1, 9);

    const mesh = greedyMesh(padded);

    // Un lastrone alto 1: +Z e -Z sono un quad da 32x32, i 4 lati un quad da 32x1.
    expect(mesh.quadCount).toBe(6);
    expect(mesh.min).toEqual([0, 0, 0]);
    expect(mesh.max).toEqual([CHUNK, CHUNK, 1]);
  });

  it('assegna AO massima a un piano isolato', () => {
    const padded = emptyPadded();
    fillBox(padded, 0, 0, 0, CHUNK, CHUNK, 1, 9);

    const mesh = greedyMesh(padded);

    expect([...mesh.ao]).toHaveLength(mesh.quadCount * 4);
    expect([...mesh.ao].every((value) => value === 3)).toBe(true);
  });

  it('scurisce i corner interni di uno spigolo concavo', () => {
    const padded = emptyPadded();
    // La faccia +Z del voxel centrale resta esposta, ma ha due muri ortogonali
    // nella cella vuota subito sopra: il suo corner -X/-Y e' completamente chiuso.
    setLocal(padded, 1, 1, 1, 4);
    setLocal(padded, 0, 1, 2, 4);
    setLocal(padded, 1, 0, 2, 4);

    const mesh = greedyMesh(padded);
    const topAo: number[] = [];
    for (let i = 0; i < mesh.faces.length; i++) {
      const z = mesh.positions[i * 3 + 2];
      if (mesh.faces[i] === 4 && z === 2) topAo.push(mesh.ao[i]);
    }

    expect(topAo).toHaveLength(4);
    expect(topAo).toContain(0);
    expect(topAo).toContain(3);
  });

  it('non fonde facce adiacenti quando la loro AO e’ diversa', () => {
    const padded = emptyPadded();
    setLocal(padded, 1, 1, 0, 4);
    setLocal(padded, 2, 1, 0, 4);
    // Muro accanto alla prima cella: cambia il suo AO, non quello della seconda.
    setLocal(padded, 0, 1, 1, 4);

    const mesh = greedyMesh(padded);
    let topQuads = 0;
    for (let i = 0; i < mesh.faces.length; i += 4) {
      if (mesh.faces[i] === 4 && mesh.positions[i * 3 + 2] === 1) topQuads++;
    }
    expect(topQuads).toBe(2);
  });

  it('rifiuta un volume di dimensione sbagliata', () => {
    expect(() => greedyMesh(new Uint8Array(1000))).toThrow(/39304/);
  });
});
