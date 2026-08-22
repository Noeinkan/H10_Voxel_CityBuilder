import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { addBuilding, createSimState } from './SimState';
import { testTerrain } from './testTerrain';
import { tickMany } from './tick';
import { cityVitality, DEFAULT_VITALITY } from './vitality';

const terrain = testTerrain({ chunksX: 4, chunksY: 4 });

/**
 * Stato con `count` case e `ticks` tick alle spalle.
 *
 * I tick servono: `BALANCE.start.population` e' zero, quindi una citta' appena
 * creata non ha nessuno da alloggiare e l'occupazione sarebbe sempre zero.
 */
function withHomes(count: number, ticks = 0) {
  let state = createSimState();
  for (let i = 0; i < count; i++) {
    state = addBuilding(state, { x: 10 + i, y: 10, class: BUILDING_CLASS.residential });
  }
  return ticks > 0 ? tickMany(state, terrain, ticks) : state;
}

describe('cityVitality', () => {
  it('senza case la citta resta al buio', () => {
    const vitality = cityVitality(createSimState());
    expect(vitality.homes).toBe(0);
  });

  it('legge l occupazione come popolazione su capacita', () => {
    const capacity = BALANCE.weights.residentialCapacity;
    const state = withHomes(4, 30);
    const expected = state.population.stock / (4 * capacity);

    expect(state.population.stock).toBeGreaterThan(0);
    expect(cityVitality(state).homes).toBeCloseTo(Math.min(1, expected), 6);
  });

  it('resta fra zero e uno anche con una casa sola e una citta che cresce', () => {
    const crowded = withHomes(1, 200);
    expect(cityVitality(crowded).homes).toBeLessThanOrEqual(1);
    expect(cityVitality(crowded).homes).toBeGreaterThanOrEqual(0);
  });

  it('costruire case senza popolazione nuova abbassa l occupazione', () => {
    const lived = withHomes(2, 30);
    let overbuilt = lived;
    for (let i = 0; i < 18; i++) {
      overbuilt = addBuilding(overbuilt, { x: 40 + i, y: 20, class: BUILDING_CLASS.residential });
    }

    // E' la lettura che serve alla notte: una citta' che costruisce piu' di
    // quanto cresca ha piu' finestre spente, non le stesse di prima. Nessun
    // tick in mezzo, quindi a cambiare e' solo la capacita'.
    expect(cityVitality(overbuilt).homes).toBeLessThan(cityVitality(lived).homes);
  });

  it('e una lettura pura: non tocca lo stato ne fa girare un tick', () => {
    const state = withHomes(6, 10);
    const before = state.tickCount;
    cityVitality(state);
    cityVitality(state);
    expect(state.tickCount).toBe(before);
  });

  it('il commercio segue il ciclo interno, e senza negozi resta a zero', () => {
    expect(cityVitality(withHomes(3, 5)).commerce).toBe(0);

    let trading = withHomes(6);
    for (let i = 0; i < 4; i++) {
      trading = addBuilding(trading, { x: 20 + i, y: 12, class: BUILDING_CLASS.commercial });
    }
    for (let i = 0; i < 3; i++) {
      trading = addBuilding(trading, { x: 24 + i, y: 14, class: BUILDING_CLASS.industrial });
    }
    const busy = tickMany(trading, terrain, 40);
    expect(cityVitality(busy).commerce).toBeGreaterThan(0);
  });

  it('il default vale per chi non ha una simulazione dietro', () => {
    expect(DEFAULT_VITALITY.homes).toBeGreaterThan(0);
    expect(DEFAULT_VITALITY.commerce).toBe(1);
  });
});
