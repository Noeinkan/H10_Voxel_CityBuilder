import { describe, expect, it } from 'vitest';
import { STAMP_EMPTY, type VoxelStamp } from '../buildings/stamp';
import { fillRatio, skyWindowOf } from './window';

/**
 * Le sagome di prova sono scritte a mano e minime: qui si verifica il
 * **predicato**, non le ricette. Che le ricette lo soddisfino e' un'altra
 * domanda, e la fa `generate.test.ts` — tenerle insieme vorrebbe dire non sapere
 * piu' quale delle due e' rotta quando una fallisce.
 */

const RULE = { minHeight: 3, minColumns: 2 };

function blank(sizeX: number, sizeY: number, sizeZ: number): VoxelStamp {
  return {
    sizeX,
    sizeY,
    sizeZ,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels: new Uint8Array(sizeX * sizeY * sizeZ),
    surfaces: new Uint8Array(sizeX * sizeY * sizeZ),
    bandStarts: [0, sizeZ],
  };
}

function fill(
  stamp: VoxelStamp,
  x0: number, y0: number, z0: number,
  sizeX: number, sizeY: number, sizeZ: number,
): void {
  for (let z = z0; z < z0 + sizeZ; z++) {
    for (let y = y0; y < y0 + sizeY; y++) {
      for (let x = x0; x < x0 + sizeX; x++) {
        stamp.voxels[x + stamp.sizeX * (y + stamp.sizeY * z)] = 4;
      }
    }
  }
}

/** Due steli e un impalcato che li unisce: la forma che la fase esiste per fare. */
function twinStems(): VoxelStamp {
  const stamp = blank(8, 4, 16);
  fill(stamp, 0, 0, 0, 2, 4, 12);
  fill(stamp, 6, 0, 0, 2, 4, 12);
  fill(stamp, 2, 0, 10, 4, 4, 2);
  return stamp;
}

describe('skyWindowOf', () => {
  it('trova il vuoto fra due steli, con la quota dell impalcato che lo scavalca', () => {
    const found = skyWindowOf(twinStems(), RULE);

    expect(found).not.toBeNull();
    expect(found!.bridgeZ).toBe(10);
    expect(found!.z0).toBe(0);
    expect(found!.z1).toBe(9);
    expect(found!.x).toBe(2);
    expect(found!.sizeX).toBe(4);
    // Il pieno sta a est e a ovest; il cielo si vede quindi guardando lungo y.
    expect(found!.throughAxis).toBe(1);
  });

  it('il cavedio dentro uno stelo non e una finestra: non ci si vede attraverso', () => {
    const stamp = blank(8, 8, 16);
    // Una scatola cava e un tetto sopra: pieno a destra e a sinistra come due
    // torri, e da fuori non ci si vede attraverso niente. E' il caso che ha
    // fatto sbagliare la prima versione del predicato.
    for (let z = 0; z < 12; z++) {
      for (let y = 1; y < 7; y++) {
        for (let x = 1; x < 7; x++) {
          const onEdge = x === 1 || x === 6 || y === 1 || y === 6;
          if (onEdge) stamp.voxels[x + 8 * (y + 8 * z)] = 4;
        }
      }
    }
    fill(stamp, 1, 1, 12, 6, 6, 1);

    expect(skyWindowOf(stamp, RULE)).toBeNull();
  });

  it('un prisma pieno non ha nessuna finestra', () => {
    const stamp = blank(8, 4, 16);
    fill(stamp, 0, 0, 0, 8, 4, 16);

    expect(skyWindowOf(stamp, RULE)).toBeNull();
  });

  it('uno sbalzo dal fianco non e una finestra: il vuoto sotto e il cielo di fuori', () => {
    const stamp = blank(8, 4, 16);
    // Una torre sola a ovest, e una mensola che sporge nel vuoto verso est.
    fill(stamp, 0, 0, 0, 2, 4, 12);
    fill(stamp, 2, 0, 10, 4, 4, 2);

    expect(skyWindowOf(stamp, RULE)).toBeNull();
  });

  it('un vuoto troppo basso non conta: e un portico, non una finestra', () => {
    const stamp = blank(8, 4, 16);
    fill(stamp, 0, 0, 0, 2, 4, 12);
    fill(stamp, 6, 0, 0, 2, 4, 12);
    // Lo scavalco sta a due voxel dal suolo: sotto ci passa una persona, non
    // la citta'.
    fill(stamp, 2, 0, 2, 4, 4, 2);

    expect(skyWindowOf(stamp, RULE)).toBeNull();
  });

  it('un vuoto troppo stretto non conta', () => {
    const stamp = blank(8, 4, 16);
    fill(stamp, 0, 0, 0, 3, 1, 12);
    fill(stamp, 4, 0, 0, 4, 1, 12);
    fill(stamp, 3, 0, 10, 1, 1, 2);

    expect(skyWindowOf(stamp, { minHeight: 3, minColumns: 4 })).toBeNull();
  });

  it('fra due finestre vince la piu alta', () => {
    const stamp = blank(8, 4, 24);
    fill(stamp, 0, 0, 0, 2, 4, 24);
    fill(stamp, 6, 0, 0, 2, 4, 24);
    // Il primo scavalco a quota 4, il secondo a quota 20: sotto il secondo ci
    // sono quindici quote di vuoto, sotto il primo quattro.
    fill(stamp, 2, 0, 4, 4, 4, 1);
    fill(stamp, 2, 0, 20, 4, 4, 1);

    const found = skyWindowOf(stamp, RULE);
    expect(found!.bridgeZ).toBe(20);
    expect(found!.z0).toBe(5);
  });

  it('una sagoma vuota o alta un voxel non risponde', () => {
    expect(skyWindowOf(blank(0, 0, 0), RULE)).toBeNull();
    expect(skyWindowOf(blank(4, 4, 1), RULE)).toBeNull();
  });
});

describe('fillRatio', () => {
  it('misura la frazione dell inviluppo che la sagoma occupa', () => {
    const stamp = blank(4, 4, 4);
    fill(stamp, 0, 0, 0, 4, 4, 2);

    expect(fillRatio(stamp)).toBeCloseTo(0.5);
  });

  it('un inviluppo di volume zero vale zero invece di dividere per zero', () => {
    expect(fillRatio(blank(0, 4, 4))).toBe(0);
  });

  it('conta i voxel pieni e non le celle scritte con il vuoto', () => {
    const stamp = blank(2, 2, 2);
    stamp.voxels[0] = STAMP_EMPTY;

    expect(fillRatio(stamp)).toBe(0);
  });
});
