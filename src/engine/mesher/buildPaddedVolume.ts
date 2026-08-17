import type { Chunk } from '../../world/Chunk';
import { CHUNK, idx, paddedIdx, PADDED } from '../../world/chunkCoords';
import type { VoxelWorld } from '../../world/VoxelWorld';

/**
 * Riempie il volume paddato 34^3 con il chunk e i sei piani di bordo dei vicini.
 *
 * Spigoli e angoli restano a zero di proposito: il greedy meshing guarda +-1
 * solo lungo il proprio asse di sweep, quindi non li legge mai. Il buffer deve
 * arrivare azzerato (`MesherPool.acquirePadded` lo garantisce), altrimenti i
 * residui del job precedente si comporterebbero da vicini fantasma.
 */
export function buildPaddedVolume(world: VoxelWorld, chunk: Chunk, padded: Uint8Array): void {
  const blocks = chunk.blocks;

  // Corpo del chunk: una riga di 32 byte per volta, contigua in entrambi i layout.
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let ly = 0; ly < CHUNK; ly++) {
      const src = idx(0, ly, lz);
      padded.set(blocks.subarray(src, src + CHUNK), paddedIdx(1, ly + 1, lz + 1));
    }
  }

  const { cx, cy, cz } = chunk;

  // -X e +X: piani con stride sia in lettura sia in scrittura, copia scalare.
  const nx = world.getChunk(cx - 1, cy, cz);
  if (nx !== null && !nx.isEmpty) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let ly = 0; ly < CHUNK; ly++) {
        padded[paddedIdx(0, ly + 1, lz + 1)] = nx.blocks[idx(CHUNK - 1, ly, lz)];
      }
    }
  }
  const px = world.getChunk(cx + 1, cy, cz);
  if (px !== null && !px.isEmpty) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let ly = 0; ly < CHUNK; ly++) {
        padded[paddedIdx(PADDED - 1, ly + 1, lz + 1)] = px.blocks[idx(0, ly, lz)];
      }
    }
  }

  // -Y, +Y, -Z, +Z: le righe lungo x sono contigue, si copiano in blocco.
  const ny = world.getChunk(cx, cy - 1, cz);
  if (ny !== null && !ny.isEmpty) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const src = idx(0, CHUNK - 1, lz);
      padded.set(ny.blocks.subarray(src, src + CHUNK), paddedIdx(1, 0, lz + 1));
    }
  }
  const py = world.getChunk(cx, cy + 1, cz);
  if (py !== null && !py.isEmpty) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const src = idx(0, 0, lz);
      padded.set(py.blocks.subarray(src, src + CHUNK), paddedIdx(1, PADDED - 1, lz + 1));
    }
  }
  const nz = world.getChunk(cx, cy, cz - 1);
  if (nz !== null && !nz.isEmpty) {
    for (let ly = 0; ly < CHUNK; ly++) {
      const src = idx(0, ly, CHUNK - 1);
      padded.set(nz.blocks.subarray(src, src + CHUNK), paddedIdx(1, ly + 1, 0));
    }
  }
  const pz = world.getChunk(cx, cy, cz + 1);
  if (pz !== null && !pz.isEmpty) {
    for (let ly = 0; ly < CHUNK; ly++) {
      const src = idx(0, ly, 0);
      padded.set(pz.blocks.subarray(src, src + CHUNK), paddedIdx(1, ly + 1, PADDED - 1));
    }
  }
}
