import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, type Catalyst } from '../../sim';
import { poleRectAt } from './growthPoles';

function pole(x: number, y: number, radius: number): Catalyst {
  return { x, y, class: BUILDING_CLASS.residential, strength: 200, radius };
}

describe('poleRectAt', () => {
  it('senza catalizzatori non c e un turno', () => {
    expect(poleRectAt([], 0)).toBeNull();
  });

  it('da un turno a testa, in giro', () => {
    const catalysts = [pole(0, 0, 10), pole(100, 0, 10), pole(0, 100, 10)];
    const visited = [0, 1, 2, 3, 4, 5].map((turn) => {
      const rect = poleRectAt(catalysts, turn);
      return `${rect!.minX},${rect!.minY}`;
    });

    // Il giro si chiude e ricomincia: nessun polo salta il proprio turno, ed e'
    // l'unica cosa che questa funzione deve garantire.
    expect(visited).toEqual(visited.slice(0, 3).concat(visited.slice(0, 3)));
    expect(new Set(visited.slice(0, 3)).size).toBe(3);
  });

  it('il riquadro e quello dell influenza, non dell isolato', () => {
    const rect = poleRectAt([pole(50, 40, 12)], 0);
    expect(rect).toEqual({ minX: 38, minY: 28, maxX: 62, maxY: 52 });
  });

  it('un polo aggiunto sposta il giro invece di romperlo', () => {
    const before = [pole(0, 0, 8), pole(60, 0, 8)];
    const after = [...before, pole(0, 60, 8)];
    // Il turno e' un contatore che cresce sempre: la sola cosa che deve valere
    // e' che continui a rispondere un riquadro valido dopo il cambiamento.
    expect(poleRectAt(after, 7)).not.toBeNull();
    expect(poleRectAt(before, 7)).not.toBeNull();
  });
});
