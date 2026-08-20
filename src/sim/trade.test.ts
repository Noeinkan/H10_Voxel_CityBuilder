import { describe, expect, it } from 'vitest';
import { addCatalyst, createSimState, setTradeMode } from './SimState';
import { tick } from './tick';
import { testTerrain } from './testTerrain';
import { resolveExternalTrade } from './trade';
import { BUILDING_CLASS } from './classes';

describe('commercio esterno', () => {
  it('resta chiuso senza porto e si attiva con il porto', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const base = {
      ...createSimState(),
      population: { stock: 100, delta: 0 },
      food: { stock: 0, delta: 0 },
    };
    expect(tick(base, map).trade.connected).toBe(false);

    const connected = addCatalyst(base, {
      x: 8,
      y: 8,
      kind: 'port',
      class: BUILDING_CLASS.industrial,
      strength: 190,
      radius: 24,
    });
    const after = tick(connected, map);
    expect(after.trade.connected).toBe(true);
    expect(after.trade.food).toBeGreaterThan(0);
  });

  it('le priorita cambiano deterministicamente il volume scambiato', () => {
    const common = {
      connected: true,
      population: 100,
      buildings: 10,
      food: 0,
      materials: 200,
      funds: 1_000,
    } as const;
    const food = resolveExternalTrade({ ...common, mode: 'foodImports' });
    const exports = resolveExternalTrade({ ...common, mode: 'materialExports' });
    expect(food.food).toBeGreaterThan(exports.food);
    expect(exports.materials).toBeGreaterThan(food.materials);
    expect(setTradeMode(createSimState(), 'foodImports').tradeMode).toBe('foodImports');
  });
});
