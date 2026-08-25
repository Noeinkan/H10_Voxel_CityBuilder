import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import {
  addBuilding,
  createSimState,
  reviveSimState,
  setIslandConnections,
  toSimStateData,
  type SimStateData,
} from './SimState';
import { testTerrain } from './testTerrain';
import { tickMany } from './tick';

function settledCity() {
  let state = createSimState();
  state = addBuilding(state, { x: 4, y: 4, class: BUILDING_CLASS.residential });
  state = addBuilding(state, { x: 8, y: 4, class: BUILDING_CLASS.commercial });
  return {
    ...state,
    population: { stock: 12, delta: 0 },
    satisfaction: BALANCE.satisfaction.base,
  };
}

describe('bonus dei ponti fra isole', () => {
  it('alza il bersaglio della soddisfazione e quindi la crescita', () => {
    const terrain = testTerrain({ chunksX: 2, chunksY: 2 });
    const plain = tickMany(settledCity(), terrain, 40);
    const connected = tickMany(setIslandConnections(settledCity(), 1), terrain, 40);

    expect(connected.satisfaction).toBeGreaterThan(plain.satisfaction);
    expect(connected.population.stock).toBeGreaterThan(plain.population.stock);
  });

  it('sopravvive al salvataggio e i salvataggi vecchi ripartono da zero', () => {
    const connected = setIslandConnections(createSimState(), 2);
    expect(reviveSimState(toSimStateData(connected)).islandConnections).toBe(2);

    const { islandConnections: _connections, ...legacy } = toSimStateData(createSimState());
    expect(reviveSimState(legacy as SimStateData).islandConnections).toBe(0);
  });

  it('limita valori esterni non validi', () => {
    expect(setIslandConnections(createSimState(), Number.POSITIVE_INFINITY).islandConnections).toBe(0);
    expect(setIslandConnections(createSimState(), 100).islandConnections)
      .toBe(BALANCE.satisfaction.maxIslandBridges);
  });
});
