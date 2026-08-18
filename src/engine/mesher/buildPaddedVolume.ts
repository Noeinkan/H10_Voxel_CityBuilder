import type { Chunk } from '../../world/Chunk';
import { CHUNK, idx, paddedIdx, PADDED } from '../../world/chunkCoords';
import type { VoxelWorld } from '../../world/VoxelWorld';

/**
 * Riempie il volume paddato 34^3 con il chunk e tutti i 26 vicini immediati.
 *
 * L'AO per vertice legge anche diagonali sul piano della faccia, quindi i soli
 * sei piani non bastano piu': servono spigoli e angoli. Il buffer deve arrivare
 * azzerato (`MesherPool.acquirePadded` lo garantisce), altrimenti i residui del
 * job precedente si comporterebbero da vicini fantasma.
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

  // Un unico percorso per piani, spigoli e angoli. Quando dx e' zero la riga
  // lungo X e' contigua in entrambi i layout e si puo' copiare in blocco.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const neighbour = world.getChunk(cx + dx, cy + dy, cz + dz);
        if (neighbour === null || neighbour.isEmpty) continue;

        const srcX = dx < 0 ? CHUNK - 1 : 0;
        const srcY = dy < 0 ? CHUNK - 1 : 0;
        const srcZ = dz < 0 ? CHUNK - 1 : 0;
        const dstX = dx < 0 ? 0 : dx > 0 ? PADDED - 1 : 1;
        const dstY = dy < 0 ? 0 : dy > 0 ? PADDED - 1 : 1;
        const dstZ = dz < 0 ? 0 : dz > 0 ? PADDED - 1 : 1;
        const width = dx === 0 ? CHUNK : 1;
        const height = dy === 0 ? CHUNK : 1;
        const depth = dz === 0 ? CHUNK : 1;

        for (let z = 0; z < depth; z++) {
          for (let y = 0; y < height; y++) {
            const source = idx(srcX, srcY + y, srcZ + z);
            const destination = paddedIdx(dstX, dstY + y, dstZ + z);
            if (width === CHUNK) {
              padded.set(neighbour.blocks.subarray(source, source + CHUNK), destination);
            } else {
              padded[destination] = neighbour.blocks[source];
            }
          }
        }
      }
    }
  }
}
