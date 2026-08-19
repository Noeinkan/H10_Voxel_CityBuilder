import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { createSimState, setPolicyActive } from './SimState';
import { testTerrain } from './testTerrain';
import { tick } from './tick';

describe('costi continuativi delle policy', () => {
  it('addebita il costo a ogni tick anche senza edifici', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const active = setPolicyActive(createSimState(), 'austerity', true);
    const after = tick(active, map);
    expect(after.funds.delta).toBeCloseTo(-BALANCE.gameplay.policy.austerity.upkeep, 12);
  });
});
