import { describe, expect, it } from 'vitest';
import { ROADS } from './config';
import { boundsAround, traceRoad, type RoadProbe, type TraceStep } from './trace';

/**
 * Il tracciato e' puro e riceve il terreno come sonda, quindi si verifica senza
 * mondo: basta scrivere una funzione che dica quanto e' alta una colonna.
 *
 * Le fixture qui sotto sono profili di quota, non mappe: una parete e' «da
 * questa x in poi il terreno sale», ed e' abbastanza per far comparire il
 * tornante, che e' la sola proprieta' che vale la pena verificare.
 */

const FLAT: RoadProbe = {
  levelAt: () => 0,
  costAt: () => ROADS.landCost,
};

/** Il costo della spezzata, ricalcolato dai passi: nessun salto oltre `maxRise`. */
function rises(steps: readonly TraceStep[]): readonly number[] {
  const out: number[] = [];
  for (let i = 1; i < steps.length; i++) out.push(Math.abs(steps[i].level - steps[i - 1].level));
  return out;
}

function contiguous(steps: readonly TraceStep[]): boolean {
  for (let i = 1; i < steps.length; i++) {
    const dx = Math.abs(steps[i].x - steps[i - 1].x);
    const dy = Math.abs(steps[i].y - steps[i - 1].y);
    if (Math.max(dx, dy) !== 1) return false;
  }
  return true;
}

describe('traceRoad — il cammino minimo sul terreno', () => {
  it('su terreno piano va dritto, e la spezzata e adiacente a otto', () => {
    const trace = traceRoad({
      fromX: 0, fromY: 0,
      to: { x: 12, y: 0 },
      bounds: boundsAround(0, 0, 12, 0, 8),
      probe: FLAT,
    });

    expect(trace).not.toBeNull();
    expect(trace?.steps).toHaveLength(13);
    expect(contiguous(trace?.steps ?? [])).toBe(true);
  });

  it('la diagonale costa come la retta: otto vicini, non quattro', () => {
    const trace = traceRoad({
      fromX: 0, fromY: 0,
      to: { x: 10, y: 10 },
      bounds: boundsAround(0, 0, 10, 10, 6),
      probe: FLAT,
    });

    // Undici colonne e non ventuno: senza i passi diagonali il tracciato
    // disegnerebbe le L di una maglia quadrata, che e' cio' da cui si scappa.
    expect(trace?.steps).toHaveLength(11);
  });

  it('gira attorno a un ostacolo caro invece di attraversarlo', () => {
    // Una barriera verticale in x = 5, aperta solo in y >= 6.
    const probe: RoadProbe = {
      levelAt: () => 0,
      costAt: (x, y) => (x === 5 && y < 6 ? ROADS.waterCost * 4 : ROADS.landCost),
    };

    const trace = traceRoad({
      fromX: 0, fromY: 0,
      to: { x: 10, y: 0 },
      bounds: boundsAround(0, 0, 10, 0, 12),
      probe,
    });

    const crossing = trace?.steps.find((step) => step.x === 5);
    expect(crossing).toBeDefined();
    expect(crossing?.y).toBeGreaterThanOrEqual(6);
  });

  it('non supera mai maxRise in un passo, e per questo tornanteggia', () => {
    // Una rampa che sale di un voxel ogni colonna in x, cioe' oltre `maxRise`
    // solo se la si prende in diagonale saltando due colonne: il cammino deve
    // salire lungo y, dove il terreno e' piano.
    const probe: RoadProbe = {
      levelAt: (x) => x * ROADS.maxRise,
      costAt: () => ROADS.landCost,
    };

    const trace = traceRoad({
      fromX: 0, fromY: 0,
      to: { x: 6, y: 0 },
      bounds: boundsAround(0, 0, 6, 0, 10),
      probe,
    });

    expect(trace).not.toBeNull();
    for (const rise of rises(trace?.steps ?? [])) {
      expect(rise).toBeLessThanOrEqual(ROADS.maxRise);
    }
  });

  it('rinuncia quando la parete e invalicabile a ogni passo', () => {
    const wall: RoadProbe = {
      // Una parete alta il doppio di `maxRise` su tutta la colonna x = 3.
      levelAt: (x) => (x >= 3 ? ROADS.maxRise * 2 : 0),
      costAt: () => ROADS.landCost,
    };

    const trace = traceRoad({
      fromX: 0, fromY: 0,
      to: { x: 6, y: 0 },
      bounds: boundsAround(0, 0, 6, 0, 4),
      probe: wall,
    });

    expect(trace).toBeNull();
  });

  it('con un arrivo diffuso si ferma alla prima colonna che risponde', () => {
    const trace = traceRoad({
      fromX: 0, fromY: 0,
      toAny: (x) => x >= 4,
      bounds: boundsAround(0, 0, 20, 0, 6),
      probe: FLAT,
    });

    expect(trace).not.toBeNull();
    const last = trace?.steps[trace.steps.length - 1];
    expect(last?.x).toBe(4);
  });

  it('una carreggiata gia posata costa meno della terra vergine, e attira', () => {
    // Un corridoio gia' in rete lungo y = 3: il cammino ci sale sopra invece di
    // andare dritto, ed e' cio' che fa confluire i rami.
    const probe: RoadProbe = {
      levelAt: () => 0,
      costAt: (_x, y) => (y === 3 ? ROADS.flatCost : ROADS.landCost),
    };

    const trace = traceRoad({
      fromX: 0, fromY: 0,
      to: { x: 24, y: 0 },
      bounds: boundsAround(0, 0, 24, 0, 8),
      probe,
    });

    const onCorridor = (trace?.steps ?? []).filter((step) => step.y === 3).length;
    expect(onCorridor).toBeGreaterThan(10);
  });
});
