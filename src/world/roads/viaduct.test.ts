import { describe, expect, it } from 'vitest';
import { ROADS, ROAD_RANK, type RoadRank } from './config';
import type { RoadNode } from './network';
import { planViaducts, type ViaductProbe } from './viaduct';

/**
 * Un viadotto si riconosce da un percorso gia' tracciato, quindi qui la fixture
 * e' una fila di colonne e una sonda che dice quali toccano terra. Nessun
 * terreno vero: cio' che va provato e' dove comincia la campata, a che quota sta
 * e dove scendono le pile.
 */

function line(length: number, rank: RoadRank = ROAD_RANK.street): readonly RoadNode[] {
  const nodes: RoadNode[] = [];
  for (let x = 0; x < length; x++) nodes.push({ x, y: 0, level: 10, rank, load: 1 });
  return nodes;
}

/** Terra ovunque tranne il tratto `[from, to)`, che e' acqua a quota `waterTop`. */
function gap(from: number, to: number, waterTop = 4): ViaductProbe {
  return {
    carries: (x) => x < from || x >= to,
    clearanceAt: (x) => (x >= from && x < to ? waterTop : 10),
  };
}

describe('planViaducts — dove la strada lascia il suolo', () => {
  it('una corsa corta resta a terra: la risolve la rampa, non una struttura', () => {
    const runs = planViaducts(line(20), gap(8, 8 + ROADS.viaductMinRun - 1));

    expect(runs).toHaveLength(0);
  });

  it('una corsa lunga diventa campata', () => {
    const runs = planViaducts(line(30), gap(10, 20));

    expect(runs).toHaveLength(1);
  });

  it('le spalle entrano nella campata: l impalcato non finisce a mezz aria', () => {
    const runs = planViaducts(line(30), gap(10, 20));
    const columns = runs[0].columns;

    // Dalla colonna 9 (ultima a terra) alla 20 (prima a terra dall'altra parte).
    expect(columns[0].x).toBe(9);
    expect(columns[columns.length - 1].x).toBe(20);
  });

  it('l impalcato e piano e sta sopra cio che scavalca, con il franco', () => {
    const waterTop = 4;
    const runs = planViaducts(line(30), gap(10, 20, waterTop));
    const levels = new Set(runs[0].columns.map((column) => column.level));

    expect(levels.size).toBe(1);
    // Le spalle stanno a 10, l'acqua chiede `4 + franco`: vince la piu' alta
    // delle due, che e' quello che tiene la carreggiata continua.
    expect(runs[0].level).toBe(Math.max(10, waterTop + ROADS.viaductClearance));
  });

  it('scavalca un tetto alto alzandosi, non tagliandolo', () => {
    const roof = 40;
    const runs = planViaducts(line(30), {
      carries: (x) => x < 10 || x >= 20,
      clearanceAt: (x) => (x >= 10 && x < 20 ? roof : 10),
    });

    expect(runs[0].level).toBe(roof + ROADS.viaductClearance);
  });

  it('le pile stanno sotto la campata e mai sotto le spalle', () => {
    const runs = planViaducts(line(30), gap(10, 22));
    const columns = runs[0].columns;
    const piers = columns.filter((column) => column.pier);

    expect(piers.length).toBeGreaterThan(0);
    for (const pier of piers) {
      expect(pier.x).toBeGreaterThan(columns[0].x);
      expect(pier.x).toBeLessThan(columns[columns.length - 1].x);
    }
  });

  it('le pile rispettano il passo dichiarato', () => {
    const runs = planViaducts(line(40), gap(10, 32));
    const piers = runs[0].columns.filter((column) => column.pier).map((column) => column.x);

    for (let i = 1; i < piers.length; i++) {
      expect(piers[i] - piers[i - 1]).toBe(ROADS.viaductPierPitch);
    }
  });

  it('la campata prende il rango piu alto che la attraversa', () => {
    const nodes = [...line(30)].map((node, x) =>
      x >= 10 && x < 20 ? { ...node, rank: ROAD_RANK.trunk } : node);
    const runs = planViaducts(nodes, gap(10, 20));

    expect(runs[0].rank).toBe(ROAD_RANK.trunk);
  });

  it('una corsa che arriva al capo del ramo non diventa un ponte verso il nulla', () => {
    const runs = planViaducts(line(20), { carries: (x) => x < 10, clearanceAt: () => 4 });

    expect(runs).toHaveLength(0);
  });

  it('due bracci d acqua danno due campate distinte', () => {
    const runs = planViaducts(line(60), {
      carries: (x) => !((x >= 10 && x < 20) || (x >= 35 && x < 45)),
      clearanceAt: () => 4,
    });

    expect(runs).toHaveLength(2);
  });
});
