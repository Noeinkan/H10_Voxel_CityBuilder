import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { dominantOutflow, fundsIn, fundsOut, NO_FUNDS_FLOW } from './flows';
import { createSimState } from './SimState';
import { tick } from './tick';
import { testTerrain } from './testTerrain';

describe('FundsReport', () => {
  it('la scomposizione torna con il saldo dei fondi', () => {
    // E' la sola proprieta' che conta davvero: un popover che non somma al
    // delta che sta scritto due centimetri piu' su e' peggio di nessun popover,
    // perche' insegna a non fidarsi della barra.
    let state = createSimState();
    const terrain = testTerrain({ chunksX: 4, chunksY: 4 });

    for (let step = 0; step < 40; step += 1) {
      const before = state.funds.stock;
      state = tick(state, terrain);
      const flows = state.flows;
      const net = fundsIn(flows) - fundsOut(flows);

      expect(state.funds.stock).toBeCloseTo(before + net, 6);
      expect(state.funds.delta).toBeCloseTo(net, 6);
    }
  });

  it('non si paga piu di quanto si ha in cassa', () => {
    // A cassa vuota i servizi restano scoperti, ed e' cio' che fa scendere la
    // soddisfazione: `paid` deve poter essere meno della somma degli oneri, o la
    // scomposizione mostrerebbe un'uscita che non e' mai avvenuta.
    let state = createSimState();
    const terrain = testTerrain({ chunksX: 4, chunksY: 4 });
    for (let step = 0; step < 20; step += 1) state = tick(state, terrain);

    const { civic, policies, farms, paid } = state.flows;
    expect(paid).toBeLessThanOrEqual(civic + policies + farms + 1e-9);
    expect(paid).toBeGreaterThanOrEqual(0);
  });

  it('le tasse seguono la popolazione', () => {
    let state = createSimState();
    state = tick(state, testTerrain({ chunksX: 4, chunksY: 4 }));

    expect(state.flows.tax).toBeCloseTo(
      BALANCE.start.population * BALANCE.funds.taxPerResident,
      6,
    );
  });

  it('una citta appena nata non ha ancora flussi', () => {
    const state = createSimState();
    expect(state.flows).toEqual(NO_FUNDS_FLOW);
    expect(fundsIn(state.flows)).toBe(0);
    expect(fundsOut(state.flows)).toBe(0);
  });

  it('nomina la voce che pesa di piu, non le sei insieme', () => {
    expect(dominantOutflow({ ...NO_FUNDS_FLOW, civic: 9, policies: 3 })).toBe('civic');
    expect(dominantOutflow({ ...NO_FUNDS_FLOW, civic: 2, policies: 7 })).toBe('policies');
    expect(dominantOutflow(NO_FUNDS_FLOW)).toBeNull();
  });

  it('un saldo commerciale negativo conta come uscita, non come entrata mancata', () => {
    // Il commercio esterno e' l'unica voce a doppio verso: comprare cibo e'
    // un'uscita, e sommarlo alle entrate con il segno meno lo nasconderebbe
    // dentro un'entrata piccola invece di mostrarlo come costo.
    const buying = { ...NO_FUNDS_FLOW, tax: 10, trade: -4 };
    expect(fundsIn(buying)).toBe(10);
    expect(fundsOut(buying)).toBe(4);
  });
});
