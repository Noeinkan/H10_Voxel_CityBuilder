import { describe, expect, it } from 'vitest';
import { addBuilding, BUILDING_CLASS, createSimState, FARM_KIND } from '../sim';
import { PLOT_KIND, plotRows, type FarmPlot } from '../world/farms/plotPlan';
import { createInfoSampler } from './infoViews';

const FIELD: FarmPlot = { x: 20, y: 20, side: 4, kind: PLOT_KIND.field, alongY: false };
const ORCHARD: FarmPlot = { x: 40, y: 40, side: 4, kind: PLOT_KIND.orchard, alongY: true };

describe('infoViews — la vista del cibo', () => {
  it('assegna campo e frutteto alle loro colonne e lascia il prato vuoto', () => {
    let state = createSimState();
    state = addBuilding(state, { x: 60, y: 60, class: BUILDING_CLASS.industrial, specialization: 'farming' });

    const sampler = createInfoSampler('food', state, [FIELD, ORCHARD]);

    for (const cell of plotRows(FIELD)) {
      expect(sampler.sample(cell.x, cell.y)).toBe(FARM_KIND.field);
    }
    for (const cell of plotRows(ORCHARD)) {
      expect(sampler.sample(cell.x, cell.y)).toBe(FARM_KIND.orchard);
    }
    // La torre idroponica e' un edificio con specializzazione farming.
    expect(sampler.sample(60, 60)).toBe(FARM_KIND.tower);
    // Fuori da ogni produttore non c'e' cibo: categoria assente.
    expect(sampler.sample(0, 0)).toBe(-1);
  });

  it('senza lotti ne’ torri la mappa del cibo e’ tutta vuota', () => {
    const sampler = createInfoSampler('food', createSimState(), []);
    expect(sampler.sample(20, 20)).toBe(-1);
  });
});

describe('infoViews — delega alla simulazione', () => {
  it('densita’ e materiali passano dal campionatore della simulazione', () => {
    let state = createSimState();
    state = addBuilding(state, { x: 2, y: 2, class: BUILDING_CLASS.residential });
    const sampler = createInfoSampler('density', state, []);
    expect(sampler.sample(2, 2)).toBeGreaterThan(0);
    expect(sampler.sample(50, 50)).toBe(0);
  });
});
