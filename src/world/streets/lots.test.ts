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

function insideRect(lot: Lot, rect: BlockRect): boolean {
  return lot.x >= rect.x0 && lot.x + lot.footprint - 1 <= rect.x1 &&
    lot.y >= rect.y0 && lot.y + lot.footprint - 1 <= rect.y1;
}

function distance2(lot: Lot, x: number, y: number): number {
  const dx = lot.x * 2 + lot.footprint - 1 - x * 2;
  const dy = lot.y * 2 + lot.footprint - 1 - y * 2;
  return dx * dx + dy * dy;
}

describe('placeLot — conserva il luogo proposto', () => {
  it('parte dal cuore invece che dai quattro fronti', () => {
    const lot = placeLot({ rect: RECT, x: 15, y: 24, footprint: 4, accepts: FREE });

    expect(lot).not.toBeNull();
    expect(insideRect(lot as Lot, RECT)).toBe(true);
    const touchesAccess = lot!.x === RECT.x0 || lot!.y === RECT.y0 ||
      lot!.x + lot!.footprint - 1 === RECT.x1 ||
      lot!.y + lot!.footprint - 1 === RECT.y1;
    expect(touchesAccess).toBe(false);
    expect(distance2(lot!, 15, 24)).toBeLessThanOrEqual(2);
  });

  it('sceglie l ancora libera piu vicina al candidato, non la prima del reticolo', () => {
    const wanted = { x: 17, y: 25 };
    const lot = placeLot({ ...wanted, rect: RECT, footprint: 3, accepts: FREE });
    expect(lot).not.toBeNull();

    const first: Lot = { x: RECT.x0, y: RECT.y0, footprint: 3, facing: FACING.east };
    expect(distance2(lot!, wanted.x, wanted.y)).toBeLessThan(distance2(first, wanted.x, wanted.y));
  });

  it('quando il centro e occupato si apre radialmente sul posto libero piu vicino', () => {
    const centre = { x: 15, y: 24 };
    const first = placeLot({ ...centre, rect: RECT, footprint: 4, accepts: FREE });
    expect(first).not.toBeNull();
    const lot = placeLot({
      ...centre,
      rect: RECT,
      footprint: 4,
      accepts: (x, y) => x !== first!.x || y !== first!.y,
    });

    expect(lot).not.toBeNull();
    expect(`${lot!.x},${lot!.y}`).not.toBe(`${first!.x},${first!.y}`);
    expect(distance2(lot!, centre.x, centre.y))
      .toBeGreaterThanOrEqual(distance2(first!, centre.x, centre.y));
    expect(distance2(lot!, centre.x, centre.y)).toBeLessThan(90);
  });

  it('il lato piu vicino orienta l edificio senza spostarlo fino alla strada', () => {
    const west = placeLot({ rect: RECT, x: RECT.x0, y: 25, footprint: 3, accepts: FREE });
    expect(west?.facing).toBe(FACING.west);

    const east = placeLot({ rect: RECT, x: RECT.x1, y: 25, footprint: 3, accepts: FREE });
    expect(east?.facing).toBe(FACING.east);

    const south = placeLot({ rect: RECT, x: 16, y: RECT.y0, footprint: 3, accepts: FREE });
    expect(south?.facing).toBe(FACING.south);

    const north = placeLot({ rect: RECT, x: 16, y: RECT.y1, footprint: 3, accepts: FREE });
    expect(north?.facing).toBe(FACING.north);
  });

  it('limita al bordo soltanto una posa che lo richiede esplicitamente', () => {
    const lot = placeLot({
      rect: RECT,
      x: 15,
      y: 24,
      footprint: 4,
      edgeOnly: true,
      accepts: FREE,
    });

    expect(lot).not.toBeNull();
    expect(
      lot!.x === RECT.x0 || lot!.y === RECT.y0 ||
      lot!.x + lot!.footprint - 1 === RECT.x1 ||
      lot!.y + lot!.footprint - 1 === RECT.y1,
    ).toBe(true);
  });

  it('sulla costa preferisce il bordo rivolto all acqua', () => {
    const lot = placeLot({
      rect: RECT,
      x: RECT.x0 + 1,
      y: 24,
      footprint: 4,
      edgeOnly: true,
      facingAt: () => FACING.east,
      accepts: FREE,
    });

    expect(lot?.facing).toBe(FACING.east);
    expect(lot!.x + lot!.footprint - 1).toBe(RECT.x1);
  });
});

describe('placeLot — impronta', () => {
  it('non supera mai il lato richiesto ne quello dell isolato', () => {
    const narrow: BlockRect = { x0: 0, y0: 0, x1: 2, y1: 9 };
    const lot = placeLot({ rect: narrow, x: 1, y: 5, footprint: 4, accepts: FREE });
    expect(lot?.footprint).toBe(3);
    expect(insideRect(lot as Lot, narrow)).toBe(true);
  });

  it('prova tutta la misura larga prima di restringersi', () => {
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

  it('riempie l isolato senza mai riproporre lo stesso lotto', () => {
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

describe('placeLot — determinismo e posizione', () => {
  it('gli stessi argomenti danno lo stesso lotto', () => {
    for (let i = 0; i < 20; i++) {
      const a = placeLot({ rect: RECT, x: 14, y: 23, footprint: 4, accepts: FREE });
      const b = placeLot({ rect: RECT, x: 14, y: 23, footprint: 4, accepts: FREE });
      expect(a).toEqual(b);
    }
  });

  it('centra esattamente una misura dispari sulla colonna proposta', () => {
    const lot = placeLot({ rect: RECT, x: 15, y: 24, footprint: 3, accepts: FREE });

    expect(lot).toMatchObject({ x: 14, y: 23, footprint: 3 });
  });
});
