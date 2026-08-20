import { describe, expect, it } from 'vitest';
import { placeLot, type Lot } from './lots';
import { FACING, type BlockRect } from './streetGrid';

/**
 * La scelta del lotto e' pura e riceve la disponibilita' come predicato, quindi
 * si verifica senza mondo, senza terreno e senza registry: basta scrivere un
 * predicato che dica cosa e' libero.
 */

const RECT: BlockRect = { x0: 10, y0: 20, x1: 21, y1: 29 };

const FREE = (): boolean => true;

/** true se il lotto tocca il lato verso cui dichiara di affacciarsi. */
function hugsItsEdge(lot: Lot, rect: BlockRect): boolean {
  switch (lot.facing) {
    case FACING.east:
      return lot.x + lot.footprint - 1 === rect.x1;
    case FACING.west:
      return lot.x === rect.x0;
    case FACING.north:
      return lot.y + lot.footprint - 1 === rect.y1;
    default:
      return lot.y === rect.y0;
  }
}

function insideRect(lot: Lot, rect: BlockRect): boolean {
  return lot.x >= rect.x0 && lot.x + lot.footprint - 1 <= rect.x1 &&
    lot.y >= rect.y0 && lot.y + lot.footprint - 1 <= rect.y1;
}

describe('placeLot — il lotto sta sul fronte', () => {
  it('ogni lotto tocca un lato dell isolato e resta dentro il riquadro', () => {
    for (let y = RECT.y0; y <= RECT.y1; y++) {
      for (let x = RECT.x0; x <= RECT.x1; x++) {
        const lot = placeLot({ rect: RECT, x, y, footprint: 4, accepts: FREE });
        expect(lot).not.toBeNull();
        expect(insideRect(lot as Lot, RECT)).toBe(true);
        expect(hugsItsEdge(lot as Lot, RECT)).toBe(true);
      }
    }
  });

  it('una colonna del cuore esce comunque su strada', () => {
    // E' il caso che giustifica l'intera regola: due terzi dei candidati della
    // simulazione cadono qui, e scartarli fermerebbe la crescita.
    const lot = placeLot({ rect: RECT, x: 15, y: 24, footprint: 4, accepts: FREE });
    expect(lot).not.toBeNull();
    expect(hugsItsEdge(lot as Lot, RECT)).toBe(true);
  });

  it('il fronte piu vicino vince', () => {
    const west = placeLot({ rect: RECT, x: RECT.x0, y: 25, footprint: 3, accepts: FREE });
    expect(west?.facing).toBe(FACING.west);

    const east = placeLot({ rect: RECT, x: RECT.x1, y: 25, footprint: 3, accepts: FREE });
    expect(east?.facing).toBe(FACING.east);

    const south = placeLot({ rect: RECT, x: 16, y: RECT.y0, footprint: 3, accepts: FREE });
    expect(south?.facing).toBe(FACING.south);

    const north = placeLot({ rect: RECT, x: 16, y: RECT.y1, footprint: 3, accepts: FREE });
    expect(north?.facing).toBe(FACING.north);
  });
});

describe('placeLot — impronta', () => {
  it('non supera mai il lato richiesto ne quello dell isolato', () => {
    const narrow: BlockRect = { x0: 0, y0: 0, x1: 2, y1: 9 };
    const lot = placeLot({ rect: narrow, x: 1, y: 5, footprint: 4, accepts: FREE });
    expect(lot?.footprint).toBe(3);
    expect(insideRect(lot as Lot, narrow)).toBe(true);
  });

  it('si stringe solo dopo aver provato tutti e quattro i fronti', () => {
    // Un solo lotto largo 4 resta libero, in fondo all'ordine di preferenza.
    // Deve comunque vincere su un lotto largo 3 piu' vicino: e' l'allineamento
    // a leggersi da lontano, non la dimensione.
    const accepts = (x: number, y: number, side: number): boolean =>
      side < 4 ? false : x === RECT.x0 && y === RECT.y0;
    const lot = placeLot({ rect: RECT, x: RECT.x1, y: RECT.y1, footprint: 4, accepts });
    expect(lot?.footprint).toBe(4);
    expect(lot?.x).toBe(RECT.x0);
    expect(lot?.y).toBe(RECT.y0);
  });
});

describe('placeLot — isolato pieno', () => {
  it('risponde null quando niente e libero', () => {
    const lot = placeLot({ rect: RECT, x: 15, y: 24, footprint: 4, accepts: () => false });
    expect(lot).toBeNull();
  });

  it('riempie un fronte senza mai riproporre lo stesso lotto', () => {
    const taken = new Set<string>();
    const accepts = (x: number, y: number, side: number): boolean => {
      for (let dy = 0; dy < side; dy++) {
        for (let dx = 0; dx < side; dx++) {
          if (taken.has(`${x + dx},${y + dy}`)) return false;
        }
      }
      return true;
    };

    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const lot = placeLot({ rect: RECT, x: 15, y: 24, footprint: 3, accepts });
      if (lot === null) break;
      const key = `${lot.x},${lot.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      for (let dy = 0; dy < lot.footprint; dy++) {
        for (let dx = 0; dx < lot.footprint; dx++) taken.add(`${lot.x + dx},${lot.y + dy}`);
      }
    }

    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('placeLot — determinismo', () => {
  it('gli stessi argomenti danno lo stesso lotto', () => {
    for (let i = 0; i < 20; i++) {
      const a = placeLot({ rect: RECT, x: 14, y: 23, footprint: 4, accepts: FREE });
      const b = placeLot({ rect: RECT, x: 14, y: 23, footprint: 4, accepts: FREE });
      expect(a).toEqual(b);
    }
  });
});
