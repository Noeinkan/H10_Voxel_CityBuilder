import { describe, expect, it } from 'vitest';
import { ALL_CLASSES, type BuildingClass } from '../../sim';
import {
  assembleBuilding,
  assembleLayoutCells,
  buildStamp,
} from './assemble';
import { GRAMMAR, MAX_FOOTPRINT } from './config';
import { generateBuilding } from './generate';
import { STAMP_EMPTY, type VoxelStamp } from './stamp';

/**
 * La rete dell'assemblatore: lo stamp fuso e' un solo `VoxelStamp` quadrato di
 * lato `footprintCap`, con i sotto-volumi dentro il modulo e il podio pieno
 * sotto di loro. Non verifica l'estetica del layout — quella e' il mestiere
 * dell'occhio — ma le invarianti su cui poggiano collisione, budget di chunk e
 * cancellazione: stessa impronta rigenerabile, niente sbalzo, niente vuoti
 * orfani nel basamento, e un sotto-volume che non sfora mai il modulo.
 */

const SEEDS = [0, 1, 13, 4242, 15851] as const;

/** Impronte oltre il modulo: dal primo lotto largo fino all'isolato intero. */
const CAPS = [17, 18, 20, 24, 32, 33, 40] as const;

function request(cls: BuildingClass, level: number, seed: number) {
  return { class: cls, level, seed };
}

function planeSolid(stamp: VoxelStamp, z: number): boolean {
  const base = stamp.sizeX * stamp.sizeY * z;
  for (let i = 0; i < stamp.sizeX * stamp.sizeY; i++) {
    if (stamp.voxels[base + i] === STAMP_EMPTY) return false;
  }
  return true;
}

describe('assembleBuilding', () => {
  it('e deterministico sugli stessi argomenti', () => {
    for (const cls of ALL_CLASSES) {
      for (const cap of CAPS) {
        for (const seed of SEEDS) {
          const a = assembleBuilding(request(cls, 6, seed), cap);
          const b = assembleBuilding(request(cls, 6, seed), cap);
          expect(Array.from(b.voxels)).toEqual(Array.from(a.voxels));
          expect(Array.from(b.surfaces)).toEqual(Array.from(a.surfaces));
          expect(b.bandStarts).toEqual(a.bandStarts);
        }
      }
    }
  });

  it('produce uno stamp quadrato di lato esattamente footprintCap', () => {
    for (const cls of ALL_CLASSES) {
      for (const cap of CAPS) {
        const stamp = assembleBuilding(request(cls, 3, 4242), cap);
        expect(stamp.sizeX).toBe(cap);
        expect(stamp.sizeY).toBe(cap);
        expect(stamp.anchorX).toBe(0);
        expect(stamp.anchorY).toBe(0);
      }
    }
  });

  it('il podio riempie l intera impronta, senza vuoti orfani nel basamento', () => {
    for (const cls of ALL_CLASSES) {
      for (const cap of CAPS) {
        const stamp = assembleBuilding(request(cls, 5, 13), cap);
        for (let z = 0; z < GRAMMAR.plinthHeight; z++) {
          expect(planeSolid(stamp, z), `piano ${z} su ${cap}`).toBe(true);
        }
      }
    }
  });

  it('non sporge: l inviluppo coincide con l impronta', () => {
    for (const cls of ALL_CLASSES) {
      for (const cap of CAPS) {
        const stamp = assembleBuilding(request(cls, 4, 1), cap);
        // Con `overhang` a zero l'impronta e' lo stamp intero: nessuna striscia
        // sopra il marciapiede, quindi nessuna colonna oltre `[0, footprintCap)`.
        expect(stamp.sizeX).toBe(cap);
        expect(stamp.sizeY).toBe(cap);
      }
    }
  });
});

describe('assembleLayoutCells', () => {
  it('ogni sotto-volume sta dentro il modulo e dentro l impronta', () => {
    for (const cap of CAPS) {
      for (let seed = 0; seed < 64; seed++) {
        for (const cell of assembleLayoutCells(seed, cap)) {
          expect(cell.side).toBeGreaterThanOrEqual(1);
          expect(cell.side).toBeLessThanOrEqual(MAX_FOOTPRINT);
          expect(cell.x).toBeGreaterThanOrEqual(0);
          expect(cell.y).toBeGreaterThanOrEqual(0);
          expect(cell.x + cell.side).toBeLessThanOrEqual(cap);
          expect(cell.y + cell.side).toBeLessThanOrEqual(cap);
        }
      }
    }
  });

  it('e deterministico', () => {
    for (const cap of CAPS) {
      expect(assembleLayoutCells(4242, cap)).toEqual(assembleLayoutCells(4242, cap));
    }
  });
});

describe('buildStamp', () => {
  it('sotto il modulo delega al generatore singolo', () => {
    const cap = MAX_FOOTPRINT;
    const assembled = buildStamp(request(ALL_CLASSES[0], 3, 13), cap);
    const single = generateBuilding({ ...request(ALL_CLASSES[0], 3, 13), footprintCap: cap });
    expect(Array.from(assembled.voxels)).toEqual(Array.from(single.voxels));
    expect(assembled.sizeX).toBe(single.sizeX);
  });

  it('oltre il modulo assembla invece di restringersi', () => {
    const cap = 24;
    const stamp = buildStamp(request(ALL_CLASSES[0], 3, 13), cap);
    expect(stamp.sizeX).toBe(cap);
    expect(stamp.sizeY).toBe(cap);
  });
});
