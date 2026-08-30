import { describe, expect, it } from 'vitest';
import { columnKey } from './chunkCoords';

/**
 * `columnKey` sostituisce una chiave di testo nel percorso caldo dei lotti, e
 * una chiave numerica sbaglia in silenzio: due colonne diverse che collidono non
 * danno un errore, danno un edificio dentro un altro. Qui si fissa fin dove e'
 * iniettiva, che e' l'unica cosa che la rende un sostituto onesto.
 */
describe('columnKey', () => {
  it('non fa collidere due colonne diverse', () => {
    const seen = new Map<number, string>();
    for (let y = -600; y <= 600; y += 7) {
      for (let x = -600; x <= 600; x += 7) {
        const key = columnKey(x, y);
        const at = `${x},${y}`;
        expect(seen.get(key) ?? at).toBe(at);
        seen.set(key, at);
      }
    }
  });

  it('resta un intero piccolo agli estremi del dominio dichiarato', () => {
    for (const value of [-16384, -1, 0, 1, 16383]) {
      for (const other of [-16384, 0, 16383]) {
        const key = columnKey(value, other);
        expect(Number.isSafeInteger(key)).toBe(true);
        // Sopra i trentun bit V8 smetterebbe di trattarlo come intero piccolo,
        // e la chiave tornerebbe a essere un oggetto sul mucchio.
        expect(key).toBeGreaterThanOrEqual(0);
        expect(key).toBeLessThan(2 ** 31);
      }
    }
  });

  it('distingue le due coordinate: non e una somma', () => {
    expect(columnKey(3, 5)).not.toBe(columnKey(5, 3));
  });
});
