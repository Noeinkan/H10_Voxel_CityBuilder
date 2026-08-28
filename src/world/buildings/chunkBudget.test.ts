import { describe, expect, it } from 'vitest';
import { CHUNK } from '../chunkCoords';
import { WORKS, type GradePlan } from '../grading/grade';
import { maxTowerHeightOf } from '../scale';
import { dirtyChunkCount, fitsChunkBudget } from './chunkBudget';
import { BUILDER, GRAMMAR, MAX_FOOTPRINT } from './config';
import type { VoxelStamp } from './stamp';

/**
 * Uno stamp pieno delle misure date.
 *
 * Il contenuto non conta: il budget di chunk misura l'ingombro, non i voxel
 * pieni. Serve solo che `sliceStamps` abbia qualcosa di reale da ritagliare.
 */
function block(sizeX: number, sizeY: number, sizeZ: number): VoxelStamp {
  const voxels = new Uint8Array(sizeX * sizeY * sizeZ).fill(1);
  return {
    sizeX,
    sizeY,
    sizeZ,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces: new Uint8Array(voxels.length),
    bandStarts: [0, sizeZ],
  };
}

function plan(footZ: number, padZ: number): GradePlan {
  return { works: WORKS.terrace, padZ, footZ, fill: padZ - footZ };
}

describe('dirtyChunkCount', () => {
  it('un volume dentro un chunk solo ne conta uno', () => {
    // Lontano da ogni cucitura: 4..7 su tutti e tre gli assi.
    expect(dirtyChunkCount(4, 4, 4, 4, 8)).toBe(1);
  });

  it('un volume a cavallo di una cucitura conta i chunk che attraversa', () => {
    // Da 30 a 33 in x: due chunk in pianta, uno in quota.
    expect(dirtyChunkCount(30, 4, 4, 4, 8)).toBe(2);
  });

  it('conta il vicino che una scrittura sulla cella di bordo costringe a rimeshare', () => {
    // L'impronta sta tutta nel chunk 0, ma tocca la cella locale 0: il chunk
    // a ovest va rimeshato lo stesso. E' la stima per eccesso dichiarata.
    const onSeam = dirtyChunkCount(0, 4, 4, 4, 8);
    const inside = dirtyChunkCount(4, 4, 4, 4, 8);
    expect(inside).toBe(1);
    expect(onSeam).toBe(2);
  });

  it('il vicino di bordo si conta su tutte e tre le direzioni', () => {
    // Angolo minimo del chunk: un vicino per asse, piu' il chunk stesso.
    // I vicini si sommano per combinazione, non uno solo in tutto.
    expect(dirtyChunkCount(0, 0, 1, 0, 1)).toBeGreaterThan(3);
  });

  it('l impronta rettangolare usa la propria profondita', () => {
    const square = dirtyChunkCount(4, 4, 4, 4, 8);
    const long = dirtyChunkCount(4, 4, 4, 4, 8, CHUNK + 4);
    expect(square).toBe(1);
    expect(long).toBeGreaterThan(square);
  });

  it('non dipende dall ordine: e una funzione del solo ingombro', () => {
    const first = dirtyChunkCount(12, 20, 6, 10, 40);
    const second = dirtyChunkCount(12, 20, 6, 10, 40);
    expect(first).toBe(second);
  });

  it('il volume verticale massimo passa su ogni fase di cucitura', () => {
    // E' il gate rapido del difetto che prima richiedeva una citta da 2.700
    // tick. Usa l'inviluppo orizzontale massimo e la torre teorica piu' alta:
    // nessun sito reale puo' sporcare piu' chunk di questo volume.
    const side = MAX_FOOTPRINT + GRAMMAR.maxOverhang;
    const height = maxTowerHeightOf();
    let worst = 0;

    for (let xPhase = 0; xPhase < CHUNK; xPhase++) {
      for (let yPhase = 0; yPhase < CHUNK; yPhase++) {
        for (let zPhase = 0; zPhase < CHUNK; zPhase++) {
          worst = Math.max(
            worst,
            dirtyChunkCount(
              xPhase,
              yPhase,
              side,
              zPhase,
              zPhase + height,
              side,
            ),
          );
        }
      }
    }

    expect(height).toBeGreaterThan(CHUNK);
    expect(worst).toBeLessThanOrEqual(BUILDER.maxDirtyChunksPerBuilding);
  });
});

describe('fitsChunkBudget', () => {
  it('accetta un edificio normale', () => {
    expect(fitsChunkBudget(4, 4, 4, 4, plan(4, 8), block(4, 4, 12))).toBe(true);
  });

  it('misura il singolo ritaglio e non il volume intero', () => {
    // Una struttura lunga come un molo: piu' larga di `segmentSide`, quindi
    // `sliceStamps` la spezza. Misurata tutta insieme sforerebbe il tetto;
    // misurata a ritagli passa, ed e' la proprieta' per cui i ritagli esistono.
    const side = BUILDER.segmentSide;
    const long = block(side * 3, 4, 8);
    expect(long.sizeX).toBeGreaterThan(side);
    expect(fitsChunkBudget(4, 4, long.sizeX, long.sizeY, plan(4, 6), long)).toBe(true);
  });

  it('rifiuta quando la sola fondazione sfora il tetto', () => {
    // Una fondazione altissima su un'impronta larga: i piani di chunk che
    // attraversa bastano da soli a superare `maxDirtyChunksPerBuilding`.
    const deep = plan(0, CHUNK * 8);
    expect(fitsChunkBudget(0, 0, CHUNK * 2, CHUNK * 2, deep, block(4, 4, 4))).toBe(false);
  });

  it('il tetto e quello dichiarato in config, non un numero scritto qui', () => {
    // Un volume calibrato appena sopra il tetto: se qualcuno alza
    // `maxDirtyChunksPerBuilding` senza pensarci, questo test lo dice.
    const cap = BUILDER.maxDirtyChunksPerBuilding;
    const tall = plan(0, CHUNK * (cap + 2));
    expect(fitsChunkBudget(4, 4, 4, 4, tall, block(4, 4, 4))).toBe(false);
  });
});
