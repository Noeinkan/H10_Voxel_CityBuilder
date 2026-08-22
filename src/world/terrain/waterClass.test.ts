import { describe, expect, it } from 'vitest';
import { WATER_CLASS } from '../visualBlock';
import { TERRAIN } from './config';
import { classifyWater } from './waterClass';

/** Campo di quota di comodo: terra dove il predicato dice di si', fondale altrove. */
function field(isLand: (x: number, y: number) => boolean): (x: number, y: number) => number {
  return (x, y) => (isLand(x, y) ? TERRAIN.seaLevel + 4 : 0);
}

const OPEN_SEA = field(() => false);

describe('classifyWater', () => {
  it('la profondita’ decide per prima: il bassofondo non guarda le sponde', () => {
    for (let depth = 1; depth <= TERRAIN.shallowDepth; depth++) {
      expect(classifyWater(0, 0, depth, OPEN_SEA), `${depth}`).toBe(WATER_CLASS.shallow);
    }
    expect(classifyWater(0, 0, TERRAIN.shallowDepth + 1, OPEN_SEA)).not.toBe(WATER_CLASS.shallow);
  });

  it('senza sponde e’ mare aperto a qualunque profondita’', () => {
    expect(classifyWater(0, 0, TERRAIN.shallowDepth + 1, OPEN_SEA)).toBe(WATER_CLASS.open);
    expect(classifyWater(0, 0, TERRAIN.seaLevel, OPEN_SEA)).toBe(WATER_CLASS.open);
  });

  it('un braccio chiuso su un asse e’ un canale', () => {
    // Terra a ovest e a est, mare a nord e a sud: e' esattamente un canale.
    const canal = field((x) => x <= -3 || x >= 3);
    expect(classifyWater(0, 0, TERRAIN.shallowDepth + 1, canal)).toBe(WATER_CLASS.canal);

    // Lo stesso ruotato di novanta gradi: gli assi si guardano entrambi.
    const rotated = field((_x, y) => y <= -3 || y >= 3);
    expect(classifyWater(0, 0, TERRAIN.shallowDepth + 1, rotated)).toBe(WATER_CLASS.canal);
  });

  it('una baia con una sponda sola resta mare', () => {
    // E' la distinzione che porta il lavoro: una riva vicina non basta, perche'
    // altrimenti tutta la costa dell'isola diventerebbe canale.
    const bay = field((x) => x <= -3);
    expect(classifyWater(0, 0, TERRAIN.shallowDepth + 1, bay)).toBe(WATER_CLASS.open);
  });

  it('oltre la portata le sponde non contano piu’', () => {
    const wide = field((x) => Math.abs(x) > TERRAIN.canalReach);
    expect(classifyWater(0, 0, TERRAIN.shallowDepth + 1, wide)).toBe(WATER_CLASS.open);

    const narrow = field((x) => Math.abs(x) >= TERRAIN.canalReach);
    expect(classifyWater(0, 0, TERRAIN.shallowDepth + 1, narrow)).toBe(WATER_CLASS.canal);
  });

  it('un braccio profondo e’ un fiordo, e si guarda come mare', () => {
    const canal = field((x) => x <= -3 || x >= 3);
    expect(classifyWater(0, 0, TERRAIN.canalMaxDepth, canal)).toBe(WATER_CLASS.canal);
    expect(classifyWater(0, 0, TERRAIN.canalMaxDepth + 1, canal)).toBe(WATER_CLASS.open);
  });

  it('le tre classi restano valori di superficie distinti', () => {
    // Viaggiano nei tre bit di `visualBlock`: devono starci e non collidere fra
    // loro, o due specchi diversi finirebbero con la stessa risposta.
    const values = [WATER_CLASS.open, WATER_CLASS.shallow, WATER_CLASS.canal];
    expect(new Set(values).size).toBe(3);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(7);
    }
  });
});
