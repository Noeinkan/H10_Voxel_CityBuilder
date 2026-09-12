import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { catalystUpkeepOf } from './catalysts';
import { BUILDING_CLASS } from './classes';
import {
  dominantOutflow,
  fundsIn,
  fundsOut,
  fundsOwed,
  NO_FUNDS_FLOW,
  servicesUpkeepOf,
} from './flows';
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

    expect(state.flows.paid).toBeLessThanOrEqual(fundsOwed(state.flows) + 1e-9);
    expect(state.flows.paid).toBeGreaterThanOrEqual(0);
  });

  it('i servizi urbani si pagano sulla capacita, con una soglia esente sotto', () => {
    // E' la voce che mancava al bilancio: senza, le uscite guardavano tre
    // sottoinsiemi — civici, policy, torri — che non crescono con la citta',
    // mentre le entrate crescevano con gli abitanti. Su venti minuti misurati la
    // cassa arrivava a diciassette milioni.
    const { servicesFree, servicesPerCapacity } = BALANCE.funds;
    expect(servicesUpkeepOf(0)).toBe(0);
    expect(servicesUpkeepOf(servicesFree)).toBe(0);
    expect(servicesUpkeepOf(servicesFree + 10)).toBeCloseTo(10 * servicesPerCapacity, 9);

    // Lineare sopra la soglia: raddoppiare la capacita' oltre l'esenzione
    // raddoppia il conto, o il rapporto fra entrate e uscite dipenderebbe dalla
    // scala della citta' invece che dalle manopole.
    expect(servicesUpkeepOf(servicesFree + 20)).toBeCloseTo(
      2 * servicesUpkeepOf(servicesFree + 10),
      9,
    );
  });

  it('un catalizzatore costa ogni tick, in proporzione al listino', () => {
    // Era l'unica cosa nel gioco a pagarsi una volta e rendere per sempre.
    const share = BALANCE.gameplay.catalyst.upkeepShare;
    expect(catalystUpkeepOf([])).toBe(0);
    expect(catalystUpkeepOf([{ kind: 'market', class: BUILDING_CLASS.residential }])).toBeCloseTo(
      BALANCE.gameplay.catalyst.roles.market.cost * share,
      9,
    );
    // Lo stadio costa piu' del mercato perche' costa piu' del mercato: la
    // manutenzione esce dal listino e non da una seconda tabella.
    expect(catalystUpkeepOf([{ kind: 'stadium', class: BUILDING_CLASS.commercial }]))
      .toBeGreaterThan(catalystUpkeepOf([{ kind: 'market', class: BUILDING_CLASS.residential }]));
    // Un salvataggio dell'MVP non dichiara il ruolo: paga quello di ripiego
    // invece di non pagare niente.
    expect(catalystUpkeepOf([{ class: BUILDING_CLASS.industrial }])).toBeCloseTo(
      BALANCE.gameplay.catalyst.roles.factory.cost * share,
      9,
    );
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

  it('nomina la voce che pesa di piu, non le cinque insieme', () => {
    expect(dominantOutflow({ ...NO_FUNDS_FLOW, civic: 9, policies: 3 })).toBe('civic');
    expect(dominantOutflow({ ...NO_FUNDS_FLOW, civic: 2, policies: 7 })).toBe('policies');
    expect(dominantOutflow({ ...NO_FUNDS_FLOW, services: 12, civic: 9 })).toBe('services');
    expect(dominantOutflow({ ...NO_FUNDS_FLOW, catalysts: 4, farms: 1 })).toBe('catalysts');
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
