import { describe, expect, it } from 'vitest';
import {
  blockPalette,
  blockSurface,
  coverMarkKind,
  isCoverMark,
  packCoverMark,
  packVisualBlock,
  SURFACE_KIND,
} from './visualBlock';

describe('visualBlock', () => {
  it('conserva palette e superficie nello stesso byte', () => {
    for (const surface of Object.values(SURFACE_KIND)) {
      const block = packVisualBlock(31, surface);
      expect(block).toBeLessThanOrEqual(255);
      expect(blockPalette(block)).toBe(31);
      expect(blockSurface(block)).toBe(surface);
    }
  });

  it('il vuoto ignora la superficie', () => {
    expect(packVisualBlock(0, SURFACE_KIND.luminous)).toBe(0);
    expect(blockPalette(0)).toBe(0);
    expect(blockSurface(0)).toBe(SURFACE_KIND.plain);
  });

  it('i marcatori di copertura vivono dove nessun voxel puo’ finire', () => {
    // E' l'invariante che rende il sovraccarico sicuro: se un solo byte prodotto
    // da `packVisualBlock` cadesse qui dentro, il mesher toglierebbe dal volume
    // un pezzo di citta' scambiandolo per un ciuffo d'erba.
    for (let palette = 1; palette < 32; palette++) {
      for (const surface of Object.values(SURFACE_KIND)) {
        expect(isCoverMark(packVisualBlock(palette, surface))).toBe(false);
      }
    }
    expect(isCoverMark(0)).toBe(false);
  });

  it('un marcatore e’ pieno, senza palette, e si rilegge intero', () => {
    for (let kind = 1; kind < 8; kind++) {
      const mark = packCoverMark(kind);
      expect(mark).toBeGreaterThan(0);
      expect(mark).toBeLessThanOrEqual(255);
      expect(isCoverMark(mark)).toBe(true);
      expect(coverMarkKind(mark)).toBe(kind);
      // Nessuna palette: per `getBlock`, e quindi per chi cerca un ostacolo,
      // un'erbetta non c'e'.
      expect(blockPalette(mark)).toBe(0);
    }
    expect(packCoverMark(0)).toBe(0);
    expect(coverMarkKind(packVisualBlock(20, SURFACE_KIND.habitat))).toBe(0);
  });
});
