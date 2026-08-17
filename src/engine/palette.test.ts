import { describe, expect, it } from 'vitest';
import { isValidHexColor, PALETTE_SIZE, paletteHex, toPaletteArray } from './palette';
import { PALETTE_SLOTS } from './paletteSlots';

describe('palette', () => {
  it('palette.json contiene esattamente 32 colori validi', () => {
    expect(paletteHex.length).toBe(PALETTE_SIZE);
    for (const [index, hex] of paletteHex.entries()) {
      expect(isValidHexColor(hex), `colore ${index}: ${hex}`).toBe(true);
    }
  });

  it('produce un Float32Array(96) in spazio lineare', () => {
    const array = toPaletteArray(paletteHex);

    expect(array).toBeInstanceOf(Float32Array);
    expect(array.length).toBe(PALETTE_SIZE * 3);
    for (const value of array) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }

    // "#000000" resta nero: l'indice 0 e' il vuoto e non viene mai disegnato.
    expect([array[0], array[1], array[2]]).toEqual([0, 0, 0]);
    // La conversione sRGB -> lineare non e' l'identita': un grigio medio scende.
    const white = toPaletteArray(new Array<string>(PALETTE_SIZE).fill('#808080'));
    expect(white[0]).toBeLessThan(0.5);
    expect(white[0]).toBeGreaterThan(0.2);
  });

  it('rifiuta una palette di lunghezza sbagliata', () => {
    expect(() => toPaletteArray(['#ffffff'])).toThrow(/32/);
  });

  it('rifiuta un colore malformato', () => {
    const broken = [...paletteHex];
    broken[7] = 'rosso';
    expect(() => toPaletteArray(broken)).toThrow(/indice 7/);
  });

  it('gli slot puntano a indici distinti e dentro la palette', () => {
    const values = Object.values(PALETTE_SLOTS);

    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(PALETTE_SIZE);
    }
    expect(PALETTE_SLOTS.empty).toBe(0);
  });
});
