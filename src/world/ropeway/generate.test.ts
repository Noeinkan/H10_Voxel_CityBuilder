import { describe, expect, it } from 'vitest';
import { SURFACE_KIND } from '../visualBlock';
import { STAMP_EMPTY, stampIndex } from '../buildings/stamp';
import { ROPEWAY } from './config';
import { generateStation } from './generate';
import type { RopewayStation } from './ropewayPlan';

const BASE_Z = 20;

function station(height: number): RopewayStation {
  return { x: 40, y: 40, baseZ: BASE_Z, height, anchorX: 42, anchorY: 42 };
}

describe('generateStation', () => {
  it('dichiara l ingombro che la regola le ha dato', () => {
    const stamp = generateStation(station(24), 0);
    expect(stamp.sizeX).toBe(ROPEWAY.stationSide);
    expect(stamp.sizeY).toBe(ROPEWAY.stationSide);
    expect(stamp.sizeZ).toBe(24);
  });

  it('lo zoccolo posa la torre a terra, pieno per tutta la pianta', () => {
    const stamp = generateStation(station(24), 0);
    for (let ly = 0; ly < stamp.sizeY; ly++) {
      for (let lx = 0; lx < stamp.sizeX; lx++) {
        expect(stamp.voxels[stampIndex(stamp, lx, ly, 0)]).not.toBe(STAMP_EMPTY);
      }
    }
  });

  it('la banchina sta deckDrop sotto la fune, e si calpesta', () => {
    const height = 24;
    const stamp = generateStation(station(height), 0);
    const deck = height - 1 - ROPEWAY.deckDrop;

    for (let ly = 0; ly < stamp.sizeY; ly++) {
      for (let lx = 0; lx < stamp.sizeX; lx++) {
        const index = stampIndex(stamp, lx, ly, deck);
        expect(stamp.voxels[index]).not.toBe(STAMP_EMPTY);
        expect(stamp.surfaces[index]).toBe(SURFACE_KIND.roofTech);
      }
    }
  });

  it('l architrave corre in mezzeria alla quota della fune', () => {
    const height = 24;
    const stamp = generateStation(station(height), 0);
    const top = height - 1;
    const half = (ROPEWAY.stationSide - 1) / 2;

    // Lungo l'asse, in mezzeria: pieno. E' li' che la fune si ancora.
    for (let lx = 0; lx < stamp.sizeX; lx++) {
      expect(stamp.voxels[stampIndex(stamp, lx, half, top)]).not.toBe(STAMP_EMPTY);
    }
    // Fuori mezzeria, alla stessa quota: aria. Altrimenti la cima sarebbe un tetto.
    expect(stamp.voxels[stampIndex(stamp, 0, 0, top)]).toBe(STAMP_EMPTY);
  });

  it('l asse gira il castello senza cambiare l ingombro', () => {
    const height = 24;
    const along = generateStation(station(height), 0);
    const across = generateStation(station(height), 1);
    const top = height - 1;
    const half = (ROPEWAY.stationSide - 1) / 2;

    expect(across.voxels[stampIndex(across, half, 0, top)]).not.toBe(STAMP_EMPTY);
    expect(across.voxels[stampIndex(across, 0, half, top)]).toBe(STAMP_EMPTY);
    expect(along.voxels.length).toBe(across.voxels.length);
  });

  it('e deterministico', () => {
    expect(generateStation(station(30), 1)).toEqual(generateStation(station(30), 1));
  });
});
