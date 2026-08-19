import { bench, describe } from 'vitest';
import { CHUNK, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND } from '../../world/visualBlock';
import { createScratch, greedyMesh } from './greedyMesher';

/**
 * Misura il costo di un rebuild di chunk: il criterio di accettazione chiede
 * meno di 8 ms per chunk sul worker.
 *
 * `npm run bench`
 */

const scratch = createScratch();

function volume(fill: (set: (x: number, y: number, z: number, id: number) => void) => void): Uint8Array {
  const padded = new Uint8Array(PADDED_VOL);
  fill((x, y, z, id) => {
    padded[paddedIdx(x + 1, y + 1, z + 1)] = id;
  });
  return padded;
}

/** Caso tipico della scena di accettazione: due edifici solidi con bande di palette. */
const buildingChunk = volume((set) => {
  for (const [ox, oy] of [
    [2, 2],
    [18, 16],
  ]) {
    for (let z = 0; z < CHUNK; z++) {
      const id = z < 2 ? 10 : z % 6 === 0 ? 7 : 4;
      for (let y = oy; y < oy + 12; y++) {
        for (let x = ox; x < ox + 12; x++) set(x, y, z, id);
      }
    }
  }
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) set(x, y, 0, 1);
  }
});

/**
 * La stessa scena con la grammatica sci-fi addosso: e' l'unica che accende la
 * microgeometria, quindi l'unica che ne misura il costo. Senza `packVisualBlock`
 * ogni voxel e' `plain` e i dettagli non vengono nemmeno tentati.
 */
const scifiChunk = volume((set) => {
  for (const [ox, oy] of [
    [2, 2],
    [18, 16],
  ]) {
    for (let z = 0; z < CHUNK; z++) {
      const surface = z < 2
        ? SURFACE_KIND.portal
        : z === CHUNK - 1
          ? SURFACE_KIND.roofTech
          : z % 6 === 0
            ? SURFACE_KIND.luminous
            : ox === 2 ? SURFACE_KIND.habitat : SURFACE_KIND.civic;
      const palette = z < 2 ? 10 : z % 6 === 0 ? 7 : 4;
      for (let y = oy; y < oy + 12; y++) {
        for (let x = ox; x < ox + 12; x++) set(x, y, z, packVisualBlock(palette, surface));
      }
    }
  }
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) set(x, y, 0, 1);
  }
});

/** Chunk interamente pieno: il caso migliore per il greedy, sei quad. */
const solidChunk = volume((set) => {
  for (let z = 0; z < CHUNK; z++) {
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) set(x, y, z, 4);
    }
  }
});

/** Scacchiera: il caso peggiore assoluto, 98304 quad. */
const checkerChunk = volume((set) => {
  for (let z = 0; z < CHUNK; z++) {
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        if ((x + y + z) % 2 === 0) set(x, y, z, 1 + ((x * 7 + y * 3 + z) % 31));
      }
    }
  }
});

/** Riempimento casuale al 20 percento: il caso della scena 'noise'. */
const noiseChunk = volume((set) => {
  let state = 12345;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let z = 0; z < CHUNK; z++) {
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        if (next() < 0.2) set(x, y, z, 1 + Math.floor(next() * 31));
      }
    }
  }
});

describe('greedyMesh — un chunk', () => {
  bench('vuoto', () => {
    greedyMesh(new Uint8Array(PADDED_VOL), scratch);
  });

  bench('edifici (scena di accettazione)', () => {
    greedyMesh(buildingChunk, scratch);
  });

  bench('edifici sci-fi (con microgeometria)', () => {
    greedyMesh(scifiChunk, scratch);
  });

  bench('pieno', () => {
    greedyMesh(solidChunk, scratch);
  });

  bench('rumore al 20 percento', () => {
    greedyMesh(noiseChunk, scratch);
  });

  bench('scacchiera (caso peggiore)', () => {
    greedyMesh(checkerChunk, scratch);
  });
});
