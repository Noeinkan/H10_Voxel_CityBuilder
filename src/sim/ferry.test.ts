import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { ferryLinesOf, servedFerryLines, type FerryTerminal } from './ferry';

const { minRange, maxRange } = BALANCE.gameplay.ferry;

function terminal(x: number, y = 0): FerryTerminal {
  return { x, y, kind: 'ferry', class: BUILDING_CLASS.commercial };
}

function market(x: number, y = 0): FerryTerminal {
  return { x, y, kind: 'market', class: BUILDING_CLASS.commercial };
}

describe('linee di traghetto', () => {
  it('un imbarco solo non fa una linea', () => {
    // E' l'intera premessa del ruolo: quello che si e' costruito e' un molo con
    // delle barche, e finche' non c'e' l'altra sponda non collega niente.
    expect(ferryLinesOf([terminal(0)])).toHaveLength(0);
  });

  it('due imbarchi abbastanza lontani aprono una linea', () => {
    const lines = ferryLinesOf([terminal(0), terminal(minRange)]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ a: 0, b: 1, length: minRange });
  });

  it('due imbarchi vicini restano due moli', () => {
    expect(ferryLinesOf([terminal(0), terminal(minRange - 1)])).toHaveLength(0);
  });

  it('oltre la portata la linea non e servita', () => {
    expect(ferryLinesOf([terminal(0), terminal(maxRange + 1)])).toHaveLength(0);
  });

  it('gli altri ruoli non entrano nel conto', () => {
    expect(ferryLinesOf([terminal(0), market(minRange), market(maxRange)])).toHaveLength(0);
  });

  it('ogni imbarco serve una linea sola: tre moli fanno una linea e un attesa', () => {
    // Senza questo vincolo il contributo crescerebbe come il quadrato dei moli,
    // e la strategia migliore sarebbe coprire la costa invece di scegliere.
    const lines = ferryLinesOf([terminal(0), terminal(minRange), terminal(minRange * 2)]);
    expect(lines).toHaveLength(1);
  });

  it('quattro moli fanno due linee', () => {
    const lines = ferryLinesOf([
      terminal(0),
      terminal(minRange),
      terminal(0, 400),
      terminal(minRange, 400),
    ]);
    expect(lines).toHaveLength(2);
  });

  it('accoppia prima le coppie piu vicine, e non dipende dall ordine di lettura', () => {
    // A e B distano `minRange`, A e C distano di piu': la linea giusta e' A-B, e
    // deve restare A-B anche se C e' stato costruito prima.
    const near = ferryLinesOf([terminal(0), terminal(minRange), terminal(minRange + 20)]);
    expect(near[0].length).toBe(minRange);
  });

  it('il contributo alla soddisfazione ha un tetto', () => {
    const many: FerryTerminal[] = [];
    for (let i = 0; i < 12; i++) many.push(terminal(0, i * 400), terminal(minRange, i * 400));

    expect(ferryLinesOf(many).length).toBeGreaterThan(BALANCE.satisfaction.maxFerryLines);
    expect(servedFerryLines(many)).toBe(BALANCE.satisfaction.maxFerryLines);
  });
});
