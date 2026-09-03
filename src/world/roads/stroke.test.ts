import { describe, expect, it } from 'vitest';
import { ROADS, ROAD_RANK, type RoadRank } from './config';
import { strokeRoads, strokeViaduct, type StrokeInput } from './stroke';
import type { ViaductColumn } from './viaduct';

/**
 * La larghezza e' una trasformazione senza scelte: entra un asse, esce un
 * nastro. Cio' che vale la pena verificare e' che il nastro non abbia buchi
 * sulle diagonali e che un incrocio si legga come il tratto piu' importante che
 * ci passa.
 */

function node(x: number, y: number, rank: RoadRank = ROAD_RANK.street): StrokeInput {
  return { x, y, level: 12, rank };
}

describe('strokeRoads — dall asse al nastro', () => {
  it('un vicolo resta la colonna che era', () => {
    const cells = strokeRoads([node(5, 5, ROAD_RANK.lane)]);

    expect(ROADS.rankWidth[ROAD_RANK.lane]).toBe(1);
    expect(cells).toHaveLength(1);
  });

  it('ogni rango porta la propria larghezza', () => {
    for (const rank of [ROAD_RANK.lane, ROAD_RANK.street, ROAD_RANK.avenue, ROAD_RANK.trunk]) {
      const cells = strokeRoads([node(0, 0, rank)]);
      const width = ROADS.rankWidth[rank];
      expect(cells).toHaveLength(width * width);
    }
  });

  it('una diagonale non lascia buchi: i quadrati consecutivi si toccano', () => {
    const diagonal = [node(0, 0), node(1, 1), node(2, 2), node(3, 3)];
    const cells = strokeRoads(diagonal);
    const painted = new Set(cells.map((cell) => `${cell.x},${cell.y}`));

    // Ogni colonna d'asse e le due che la separano dalla successiva.
    for (const step of diagonal) expect(painted.has(`${step.x},${step.y}`)).toBe(true);
    expect(painted.has('1,0')).toBe(true);
    expect(painted.has('0,1')).toBe(true);
  });

  it('all incrocio vince il rango piu alto', () => {
    const cells = strokeRoads([node(0, 0, ROAD_RANK.trunk), node(0, 0, ROAD_RANK.lane)]);
    const centre = cells.find((cell) => cell.x === 0 && cell.y === 0);

    expect(centre?.rank).toBe(ROAD_RANK.trunk);
  });

  it('l ordine e totale e non dipende da come sono arrivati i nodi', () => {
    const forward = strokeRoads([node(3, 1), node(0, 2), node(1, 0)]);
    const backward = strokeRoads([node(1, 0), node(0, 2), node(3, 1)]);

    expect(forward).toEqual(backward);
  });
});

describe('strokeViaduct — l impalcato si allarga, la pila no', () => {
  function column(x: number, pier: boolean): ViaductColumn {
    return { x, y: 0, level: 30, rank: ROAD_RANK.trunk, pier };
  }

  it('la pila resta sulla sola linea d asse', () => {
    const cells = strokeViaduct([column(0, true)]);
    const piers = cells.filter((cell) => cell.pier);

    expect(cells.length).toBe(ROADS.rankWidth[ROAD_RANK.trunk] ** 2);
    expect(piers).toHaveLength(1);
    expect(piers[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('una colonna senza pila non ne guadagna una allargandosi', () => {
    const cells = strokeViaduct([column(0, false)]);

    expect(cells.some((cell) => cell.pier)).toBe(false);
  });

  it('l impalcato conserva la quota su tutta la larghezza', () => {
    const cells = strokeViaduct([column(0, true), column(1, false)]);

    for (const cell of cells) expect(cell.level).toBe(30);
  });
});
