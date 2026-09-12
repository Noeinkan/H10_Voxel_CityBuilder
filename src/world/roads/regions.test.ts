import { describe, expect, it } from 'vitest';
import { ROADS } from './config';
import { roadRegions } from './regions';
import { traceRoad, type RoadProbe, type TraceBounds } from './trace';

/**
 * Le regioni servono a **non** cercare, quindi l'unica cosa che conta davvero e'
 * che non dicano mai «irraggiungibile» a un polo che `traceRoad` raggiungerebbe:
 * il ramo mancante non somiglia a un errore, somiglia a una scelta di tracciato.
 * Per questo ogni caso qui sotto confronta l'etichetta con la ricerca vera sulla
 * stessa sonda, invece di fidarsi del numero.
 */

const BOUNDS: TraceBounds = { x0: -10, y0: -10, x1: 110, y1: 10 };

const FLAT: RoadProbe = {
  levelAt: () => 0,
  costAt: () => ROADS.landCost,
};

/** Una parete alta quattro volte il passo massimo, sulla colonna x = 50. */
const WALLED: RoadProbe = {
  levelAt: (x) => (x === 50 ? ROADS.maxRise * 4 : 0),
  costAt: () => ROADS.landCost,
};

/** Lo stesso taglio, ma fatto di colonne in cui non si entra affatto. */
const VOID: RoadProbe = {
  levelAt: () => 0,
  costAt: (x) => (x === 50 ? Number.POSITIVE_INFINITY : ROADS.landCost),
};

function reaches(probe: RoadProbe, fromX: number, toX: number): boolean {
  return traceRoad({
    fromX,
    fromY: 0,
    to: { x: toX, y: 0 },
    bounds: BOUNDS,
    probe,
  }) !== null;
}

describe('roadRegions — chi si raggiunge con chi', () => {
  it('una pianura e una regione sola', () => {
    const regions = roadRegions(BOUNDS, FLAT);

    expect(regions.count).toBe(1);
    expect(regions.labelAt(0, 0)).toBe(regions.labelAt(100, 0));
    expect(reaches(FLAT, 0, 100)).toBe(true);
  });

  it('una parete divide, e la ricerca e d accordo', () => {
    const regions = roadRegions(BOUNDS, WALLED);
    const west = regions.labelAt(0, 0);
    const east = regions.labelAt(100, 0);

    expect(west).toBeGreaterThanOrEqual(0);
    expect(east).toBeGreaterThanOrEqual(0);
    expect(west).not.toBe(east);
    expect(reaches(WALLED, 0, 100)).toBe(false);

    // Il ciglio della parete e' una regione sua: ci si cammina sopra, ma non ci
    // si arriva da nessuno dei due lati. E' l'unico caso in cui una colonna
    // percorribile non serve a niente.
    const ridge = regions.labelAt(50, 0);
    expect(ridge).toBeGreaterThanOrEqual(0);
    expect(ridge).not.toBe(west);
    expect(ridge).not.toBe(east);
  });

  it('una colonna in cui non si entra non ha regione', () => {
    const regions = roadRegions(BOUNDS, VOID);

    expect(regions.labelAt(50, 0)).toBe(-1);
    expect(regions.labelAt(0, 0)).not.toBe(regions.labelAt(100, 0));
    expect(reaches(VOID, 0, 100)).toBe(false);
  });

  it('il costo non divide niente: la regione dice dove si passa, non quanto costa', () => {
    const expensive: RoadProbe = {
      levelAt: () => 0,
      costAt: (x) => (x === 50 ? ROADS.builtCost : ROADS.landCost),
    };
    const regions = roadRegions(BOUNDS, expensive);

    expect(regions.count).toBe(1);
    expect(reaches(expensive, 0, 100)).toBe(true);
  });

  it('fuori dal riquadro nessuna colonna ha regione', () => {
    const regions = roadRegions(BOUNDS, FLAT);

    expect(regions.labelAt(BOUNDS.x0 - 1, 0)).toBe(-1);
    expect(regions.labelAt(0, BOUNDS.y1 + 1)).toBe(-1);
  });

  it('un riquadro rovesciato non ha regioni invece di esplodere', () => {
    const regions = roadRegions({ x0: 10, y0: 10, x1: 0, y1: 0 }, FLAT);

    expect(regions.count).toBe(0);
    expect(regions.labelAt(5, 5)).toBe(-1);
  });

  it('un gradino sotto maxRise non divide, uno sopra si', () => {
    const step = (rise: number): RoadProbe => ({
      levelAt: (x) => (x >= 50 ? rise : 0),
      costAt: () => ROADS.landCost,
    });

    const low = step(ROADS.maxRise);
    expect(roadRegions(BOUNDS, low).count).toBe(1);
    expect(reaches(low, 0, 100)).toBe(true);

    const high = step(ROADS.maxRise + 1);
    const regions = roadRegions(BOUNDS, high);
    expect(regions.labelAt(0, 0)).not.toBe(regions.labelAt(100, 0));
    expect(reaches(high, 0, 100)).toBe(false);
  });
});
