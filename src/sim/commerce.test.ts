import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { resolveCommerce } from './commerce';
import { addBuilding, createSimState, type SimState } from './SimState';
import { testTerrain } from './testTerrain';
import { tick, tickMany } from './tick';

const CAPACITY = BALANCE.weights.commercialCapacity;

function city(residential: number, commercial: number, industrial: number): SimState {
  let state = createSimState();
  let x = 4;
  for (let i = 0; i < residential; i++) state = addBuilding(state, { x: x++, y: 4, class: BUILDING_CLASS.residential });
  for (let i = 0; i < commercial; i++) state = addBuilding(state, { x: x++, y: 8, class: BUILDING_CLASS.commercial });
  for (let i = 0; i < industrial; i++) state = addBuilding(state, { x: x++, y: 12, class: BUILDING_CLASS.industrial });
  return state;
}

describe('resolveCommerce — le tre strozzature', () => {
  it('serve la domanda quando banchi, personale e merce bastano', () => {
    const report = resolveCommerce({
      commercial: 2,
      population: CAPACITY,
      staffing: 1,
      materials: 1000,
      capacityPerBuilding: CAPACITY,
    });

    expect(report.demand).toBe(CAPACITY);
    expect(report.capacity).toBe(CAPACITY * 2);
    expect(report.served).toBe(CAPACITY);
    // Domanda tutta servita, ma metà dei banchi vuoti: sono due numeri diversi
    // e devono restare distinguibili, altrimenti "troppi negozi" e "abbastanza
    // negozi" si leggono uguale.
    expect(report.service).toBe(1);
    expect(report.occupancy).toBe(0.5);
  });

  it('senza personale i banchi restano chiusi', () => {
    const report = resolveCommerce({
      commercial: 4,
      population: CAPACITY * 4,
      staffing: 0.25,
      materials: 1000,
      capacityPerBuilding: CAPACITY,
    });

    expect(report.served).toBeCloseTo(report.capacity * 0.25, 9);
    expect(report.service).toBeCloseTo(0.25, 9);
  });

  it('senza merce non si vende: il commercio dipende dall industria', () => {
    const report = resolveCommerce({
      commercial: 2,
      population: CAPACITY * 2,
      staffing: 1,
      materials: 0,
      capacityPerBuilding: CAPACITY,
    });

    expect(report.goods).toBe(0);
    expect(report.served).toBe(0);
    expect(report.revenue).toBe(0);
  });

  it('con merce a metà vende a metà, senza scavare nel magazzino', () => {
    const wanted = CAPACITY * 2 * BALANCE.commerce.goodsPerCustomer;
    const report = resolveCommerce({
      commercial: 2,
      population: CAPACITY * 2,
      staffing: 1,
      materials: wanted / 2,
      capacityPerBuilding: CAPACITY,
    });

    expect(report.goods).toBeCloseTo(wanted / 2, 9);
    expect(report.served).toBeCloseTo(CAPACITY, 9);
    expect(report.goods).toBeLessThanOrEqual(wanted / 2);
  });

  it('senza negozi o senza abitanti non produce niente e non rompe nulla', () => {
    const noShops = resolveCommerce({
      commercial: 0,
      population: 100,
      staffing: 1,
      materials: 100,
      capacityPerBuilding: CAPACITY,
    });
    expect(noShops.served).toBe(0);
    expect(noShops.service).toBe(0);
    expect(noShops.revenue).toBe(0);

    const noPeople = resolveCommerce({
      commercial: 4,
      population: 0,
      staffing: 1,
      materials: 100,
      capacityPerBuilding: CAPACITY,
    });
    expect(noPeople.served).toBe(0);
    expect(noPeople.occupancy).toBe(0);
  });
});

describe('commercio nel tick — due cicli economici distinguibili', () => {
  const map = testTerrain({ chunksX: 4, chunksY: 4 });

  it('ricostituisce la riserva prima di consegnare materiali ai negozi', () => {
    let state = city(4, 8, 1);
    state = {
      ...state,
      population: { stock: 4 * CAPACITY, delta: 0 },
      materials: { stock: 0, delta: 0 },
    };

    const first = tick(state, map);
    expect(first.materials.stock).toBeGreaterThan(0);
    expect(first.commerce.goods).toBe(0);

    const settled = tickMany(first, map, 100);
    const reserve = settled.buildings.length * BALANCE.materials.reservePerBuilding;
    expect(settled.materials.stock).toBeCloseTo(reserve, 9);
    expect(settled.commerce.goods).toBeGreaterThan(0);
  });

  it('la citta mercantile fa fondi, quella industriale fa materiali', () => {
    // Stessa base residenziale, stesso numero di edifici non residenziali:
    // cambia solo come sono spesi. Se le due catene non fossero distinte, i due
    // bilanci finirebbero sullo stesso punto.
    const merchant = tickMany(city(8, 6, 2), map, 600);
    const industrial = tickMany(city(8, 2, 6), map, 600);

    expect(merchant.commerce.revenue).toBeGreaterThan(industrial.commerce.revenue);
    expect(industrial.materials.stock).toBeGreaterThan(merchant.materials.stock);
    expect(merchant.satisfaction).toBeGreaterThan(industrial.satisfaction);
  });

  it('i negozi consumano i materiali che l industria produce', () => {
    const withShops = tickMany(city(8, 6, 4), map, 400);
    const withoutShops = tickMany(city(8, 0, 4), map, 400);

    expect(withShops.commerce.goods).toBeGreaterThan(0);
    expect(withShops.materials.stock).toBeLessThan(withoutShops.materials.stock);
  });

  it('negozi e fabbriche competono per la stessa forza lavoro', () => {
    // La stessa popolazione deve coprire due fabbisogni: aggiungendo negozi la
    // produzione industriale cala, anche se le fabbriche sono le stesse.
    const fewShops = tickMany(city(4, 1, 6), map, 200);
    const manyShops = tickMany(city(4, 8, 6), map, 200);

    expect(manyShops.materials.delta).toBeLessThan(fewShops.materials.delta);
  });

  it('una citta servita e piu contenta di una identica senza negozi', () => {
    const served = tickMany(city(8, 6, 6), map, 800);
    const unserved = tickMany(city(8, 0, 6), map, 800);

    expect(served.commerce.service).toBeGreaterThan(0.5);
    expect(served.satisfaction).toBeGreaterThan(unserved.satisfaction);
  });

  it('resta dentro gli invarianti degli stock anche a lungo', () => {
    let state = city(10, 10, 10);
    for (let i = 0; i < 5000; i++) {
      state = tickMany(state, map, 1);
      expect(Number.isFinite(state.commerce.revenue)).toBe(true);
      expect(state.commerce.service).toBeGreaterThanOrEqual(0);
      expect(state.commerce.service).toBeLessThanOrEqual(1);
      expect(state.commerce.occupancy).toBeLessThanOrEqual(1);
      expect(state.materials.stock).toBeGreaterThanOrEqual(0);
    }
  });
});
