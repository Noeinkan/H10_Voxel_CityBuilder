import { describe, expect, it } from 'vitest';
import { ALL_CLASSES, type BuildingClass } from '../../sim';
import {
  assembleBuilding,
  assembleLayoutCells,
  buildStamp,
  urbanFootprintCap,
} from './assemble';
import { BUILDER, GRAMMAR, MAX_FOOTPRINT } from './config';
import { generateBuilding } from './generate';
import { STAMP_EMPTY, type VoxelStamp } from './stamp';
import { SKYLINE } from '../skyline/config';
import { allowedLevelAt, isPeakBlock, type SkylineQuery } from '../skyline/tiers';
import { StreetNetwork } from '../streets/StreetNetwork';

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
const CAPS = [MAX_FOOTPRINT + 1, 10, 12, 16, 24, 32, 40] as const;

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

describe('urbanFootprintCap', () => {
  const worldSeed = 1337;
  const streets = new StreetNetwork(worldSeed);

  function core(blockKx: number, blockKy: number, builtNeighbours: number = SKYLINE.edgeCore): SkylineQuery {
    return {
      x: 128,
      y: 128,
      poles: [{ x: 128, y: 128, radius: 96 }],
      waterDistance: null,
      builtNeighbours,
      seed: worldSeed,
      blockKx,
      blockKy,
    };
  }

  function neighbouringBlocks(): { peak: [number, number]; plain: [number, number] } {
    for (let ky = 0; ky < 32; ky++) {
      for (let kx = 0; kx < 32; kx++) {
        const here = isPeakBlock(worldSeed, kx, ky);
        const east = isPeakBlock(worldSeed, kx + 1, ky);
        if (here !== east) {
          return here
            ? { peak: [kx, ky], plain: [kx + 1, ky] }
            : { peak: [kx + 1, ky], plain: [kx, ky] };
        }
      }
    }
    throw new Error('nessuna coppia di isolati diversi');
  }

  function gate(
    block: readonly [number, number],
    builtNeighbours: number = SKYLINE.edgeCore,
  ): { cap: number; blockSide: number } {
    const rect = streets.blockRect({ kx: block[0], ky: block[1] });
    const blockSide = Math.min(rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);
    const cap = urbanFootprintCap(rect, (x, y) => {
      const owner = streets.blockAt(x, y);
      return allowedLevelAt(core(owner.kx, owner.ky, builtNeighbours));
    });
    return { cap, blockSide };
  }

  it('citta iniziale e periferia restano entro il modulo ordinario', () => {
    const { peak } = neighbouringBlocks();
    expect(gate(peak, 0).cap).toBe(MAX_FOOTPRINT);
  });

  it('il core non eletto resta ordinario e solo il picco maturo usa l isolato', () => {
    const { peak, plain } = neighbouringBlocks();
    const peakGate = gate(peak);
    const plainGate = gate(plain);

    expect(plainGate.cap).toBe(MAX_FOOTPRINT);
    expect(peakGate.cap).toBe(peakGate.blockSide);
  });

  it('due isolati vicini conservano ciascuno la propria decisione', () => {
    const { peak, plain } = neighbouringBlocks();
    const peakGate = gate(peak);
    expect([peakGate.cap, gate(plain).cap]).toEqual([peakGate.blockSide, MAX_FOOTPRINT]);
  });

  it('lo stesso stato e seme producono la stessa decisione e lo stesso stamp', () => {
    const { peak } = neighbouringBlocks();
    const capA = gate(peak).cap;
    const capB = gate(peak).cap;
    const a = buildStamp(request(ALL_CLASSES[0], BUILDER.maxLevel, 4242), capA);
    const b = buildStamp(request(ALL_CLASSES[0], BUILDER.maxLevel, 4242), capB);

    expect(capB).toBe(capA);
    expect(Array.from(b.voxels)).toEqual(Array.from(a.voxels));
    expect(Array.from(b.surfaces)).toEqual(Array.from(a.surfaces));
  });
});
