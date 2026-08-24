import { describe, expect, it } from 'vitest';
import {
  computeReach,
  distAt,
  falloff,
  reachAt,
  ReachCache,
  UNIFORM_COST,
  type StepCost,
} from './reach';

/** Costo che rende invalicabili le celle scelte da un predicato. */
function wall(blocked: (x: number, y: number) => boolean): StepCost {
  return (x, y) => (blocked(x, y) ? Infinity : 1);
}

describe('reach — costo uniforme', () => {
  it('riproduce esattamente la distanza di Chebyshev', () => {
    // E' l'ancora di regressione del modulo: finche' questo vale, la geodetica
    // e' una generalizzazione della forma di prima e non una sostituzione.
    const radius = 12;
    const field = computeReach(100, 100, radius, UNIFORM_COST);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
        const d = distAt(field, 100 + dx, 100 + dy);
        if (chebyshev < radius) expect(d).toBe(chebyshev);
        // Da `radius` in poi il peso e' zero comunque: la cella resta potata.
        else expect(d).toBe(Infinity);
      }
    }
  });

  it('da lo stesso peso della vecchia formula lineare', () => {
    const radius = 20;
    const field = computeReach(0, 0, radius, UNIFORM_COST);

    for (const dist of [0, 1, 5, 10, 19]) {
      const expected = 1 - dist / radius;
      expect(reachAt(field, dist, 0)).toBe(expected);
      expect(reachAt(field, 0, dist)).toBe(expected);
      // Chebyshev: la diagonale sta alla stessa distanza dell'asse.
      expect(reachAt(field, dist, dist)).toBe(expected);
    }

    expect(reachAt(field, radius, 0)).toBe(0);
    expect(reachAt(field, radius, radius)).toBe(0);
  });
});

describe('reach — invarianti', () => {
  it('non esce mai dal quadrato del raggio, comunque sia fatto il costo', () => {
    const radius = 10;
    const costs: readonly StepCost[] = [
      UNIFORM_COST,
      () => 3.7,
      (x, y) => 1 + ((x * 7 + y * 13) % 5),
      // Un costo sotto 1 va tenuto al pavimento: e' cio' che impedisce alla
      // forma di superare il quadrato che il campo ricalcola.
      () => 0.1,
    ];

    for (const cost of costs) {
      const field = computeReach(50, 50, radius, cost);
      for (const [dx, dy] of [
        [radius, 0],
        [0, radius],
        [radius, radius],
        [-radius, 3],
        [radius + 1, 0],
        [radius * 3, radius * 3],
      ]) {
        expect(reachAt(field, 50 + dx, 50 + dy)).toBe(0);
      }
    }
  });

  it('un costo sotto 1 non porta piu’ lontano di un costo pari a 1', () => {
    const cheap = computeReach(0, 0, 15, () => 0.25);
    const plain = computeReach(0, 0, 15, UNIFORM_COST);

    for (let dx = -15; dx <= 15; dx++) {
      expect(distAt(cheap, dx, 0)).toBe(distAt(plain, dx, 0));
    }
  });

  it('il centro vale 0 anche su una cella invalicabile', () => {
    // E' l'invariante per cui la desiderabilita' al centro vale esattamente
    // `strength`: un catalizzatore non puo' velarsi da solo.
    const field = computeReach(7, 7, 6, wall((x, y) => x === 7 && y === 7));

    expect(distAt(field, 7, 7)).toBe(0);
    expect(reachAt(field, 7, 7)).toBe(1);
  });

  it('e’ deterministico', () => {
    const cost: StepCost = (x, y) => 1 + ((x + y) & 1);
    const a = computeReach(3, -4, 9, cost);
    const b = computeReach(3, -4, 9, cost);

    expect([...a.dist]).toEqual([...b.dist]);
  });

  it('la distanza non decresce allontanandosi lungo un asse', () => {
    const field = computeReach(0, 0, 16, (x, y) => 1 + Math.abs(x % 3) + Math.abs(y % 2));

    let previous = 0;
    for (let dx = 0; dx < 16; dx++) {
      const d = distAt(field, dx, 0);
      if (d === Infinity) break;
      expect(d).toBeGreaterThanOrEqual(previous);
      previous = d;
    }
  });
});

describe('reach — la forma del luogo', () => {
  it('l’acqua ferma l’influenza ma la costa la lascia passare', () => {
    // Un canale che taglia il quadrato da parte a parte. Un cammino che uscisse
    // dal quadrato per aggirarlo costerebbe piu' di due volte il raggio, quindi
    // fermare Dijkstra al quadrato non toglie niente di raggiungibile.
    const radius = 20;
    const field = computeReach(0, 0, radius, wall((x) => x === 3));

    expect(reachAt(field, 4, 0)).toBe(0);
    expect(reachAt(field, 10, 0)).toBe(0);
    // Sulla stessa sponda si arriva come sempre.
    expect(reachAt(field, 2, 0)).toBe(falloff(2 / radius));
    expect(reachAt(field, 0, 10)).toBe(falloff(10 / radius));
    expect(reachAt(field, -10, -10)).toBe(falloff(10 / radius));
  });

  it('una strada porta piu’ lontano della terra a pari distanza in linea d’aria', () => {
    const radius = 30;
    const road: StepCost = (_x, y) => (y === 0 ? 1 : 2);
    const field = computeReach(0, 0, radius, road);

    expect(distAt(field, 10, 0)).toBe(10);
    expect(distAt(field, 0, 10)).toBe(20);
    expect(reachAt(field, 10, 0)).toBeGreaterThan(reachAt(field, 0, 10));
  });

  it('l’influenza gira attorno a un ostacolo invece di attraversarlo', () => {
    // Un muro corto: la cella dietro si raggiunge, ma pagando il giro.
    const radius = 20;
    const field = computeReach(0, 0, radius, wall((x, y) => x === 2 && Math.abs(y) <= 2));

    expect(distAt(field, 4, 0)).toBeGreaterThan(4);
    expect(distAt(field, 4, 0)).toBeLessThan(Infinity);
    // Fuori dall'ombra del muro la distanza e' quella di sempre.
    expect(distAt(field, 4, 8)).toBe(8);
  });
});

describe('falloff', () => {
  it('vale 1 al centro, 0 al raggio, e non scende sotto zero oltre', () => {
    expect(falloff(0)).toBe(1);
    expect(falloff(0.25)).toBe(0.75);
    expect(falloff(1)).toBe(0);
    // `poleReach` interroga anche oltre il raggio: prima ne usciva un negativo
    // che poi perdeva il confronto con lo zero.
    expect(falloff(4)).toBe(0);
  });
});

describe('ReachCache', () => {
  it('riusa la portata per centro e raggio, e la ricalcola dopo invalidate', () => {
    let calls = 0;
    const cost: StepCost = () => {
      calls++;
      return 1;
    };
    const cache = new ReachCache(cost);

    const first = cache.get(10, 10, 5);
    expect(cache.get(10, 10, 5)).toBe(first);
    expect(cache.size).toBe(1);

    const after = calls;
    cache.invalidate(10, 10, 5);
    expect(cache.get(10, 10, 5)).not.toBe(first);
    expect(calls).toBeGreaterThan(after);
  });

  it('clear butta via tutto: serve quando il terreno cambia sotto', () => {
    const cache = new ReachCache(UNIFORM_COST);
    cache.get(0, 0, 4);
    cache.get(9, 9, 4);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('i poli portano la portata geodetica e non si ricostruiscono per colonna', () => {
    // La gerarchia dello skyline li interroga per colonna: costruirne di nuovi
    // a ogni chiamata sarebbe una regressione nel percorso caldo del Builder.
    const cache = new ReachCache((x) => (x === 5 ? Infinity : 1));
    const catalysts = [{ x: 0, y: 0, radius: 12 }];

    const poles = cache.polesOf(catalysts);
    expect(cache.polesOf(catalysts)).toBe(poles);

    expect(poles[0].reachAt(0, 0)).toBe(1);
    expect(poles[0].reachAt(3, 0)).toBe(falloff(3 / 12));
    // Oltre il muro non si sente, mentre la Chebyshev direbbe di si'.
    expect(poles[0].reachAt(6, 0)).toBe(0);
  });

  it('il memo dei poli scade con invalidate e con clear', () => {
    const cache = new ReachCache();
    const catalysts = [{ x: 0, y: 0, radius: 8 }];

    const first = cache.polesOf(catalysts);
    cache.invalidate(0, 0, 8);
    expect(cache.polesOf(catalysts)).not.toBe(first);

    const second = cache.polesOf(catalysts);
    cache.clear();
    expect(cache.polesOf(catalysts)).not.toBe(second);
  });

  it('senza costo esplicito si comporta come la Chebyshev di prima', () => {
    const field = new ReachCache().get(0, 0, 10);

    expect(distAt(field, 6, 6)).toBe(6);
    expect(distAt(field, 6, 0)).toBe(6);
  });
});
