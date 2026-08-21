import { describe, expect, it } from 'vitest';
import { INSPECT, INSPECT_MODE, INSPECT_MODES } from '../engine/inspect';
import { buildViewMenuModel, viewAfterToolPicked } from './ViewMenuModel';

describe('buildViewMenuModel', () => {
  it('elenca tutte le viste nell’ordine in cui `V` le cicla', () => {
    const model = buildViewMenuModel(INSPECT_MODE.off, 40, 90);

    expect(model.options.map((option) => option.mode)).toEqual([...INSPECT_MODES]);
    // Il ciclo del tasto e l'ordine del menu sono la stessa sequenza: chi impara
    // l'uno sa gia' l'altro.
    expect(model.options[0].label).toBe('Normal');
    expect(model.options.map((option) => option.label)).toEqual([
      'Normal',
      'X-ray',
      'Levels',
      'Cutaway',
      'Block focus',
    ]);
  });

  it('segna attiva una sola vista, e ne riporta etichetta e riga', () => {
    const model = buildViewMenuModel(INSPECT_MODE.section, 40, 90);

    expect(model.options.filter((option) => option.active)).toHaveLength(1);
    expect(model.options.find((option) => option.active)?.mode).toBe(INSPECT_MODE.section);
    expect(model.activeLabel).toBe('Cutaway');
    expect(model.activeDescription).toContain('street');
  });

  it('ogni vista dice cosa si va a vedere', () => {
    const model = buildViewMenuModel(INSPECT_MODE.off, 40, 90);
    for (const option of model.options) {
      expect(option.description.length).toBeGreaterThan(0);
      expect(option.description.endsWith('.')).toBe(true);
    }
  });

  it('la barra dei livelli compare solo dove c’e’ una quota da muovere', () => {
    for (const mode of INSPECT_MODES) {
      const model = buildViewMenuModel(mode, 40, 90);
      const cuts = mode === INSPECT_MODE.slice || mode === INSPECT_MODE.section;
      expect(model.levelVisible).toBe(cuts);
    }
  });

  it('l’estremo della barra segue la citta’ senza uscire dagli estremi ammessi', () => {
    expect(buildViewMenuModel(INSPECT_MODE.slice, 40, 90.2).levelMax).toBe(91);
    expect(buildViewMenuModel(INSPECT_MODE.slice, 40, 1e6).levelMax).toBe(INSPECT.maxSliceZ);
    // Mondo appena generato: la barra resta trascinabile invece di collassare.
    expect(buildViewMenuModel(INSPECT_MODE.slice, 0, 0).levelMax).toBeGreaterThan(INSPECT.minSliceZ);
  });
});

describe('viewAfterToolPicked', () => {
  it('prendere uno strumento chiude una vista che taglia', () => {
    // Con la citta' tagliata si piazzerebbe su un terreno che non si vede.
    expect(viewAfterToolPicked(INSPECT_MODE.slice)).toBe(INSPECT_MODE.off);
    expect(viewAfterToolPicked(INSPECT_MODE.section)).toBe(INSPECT_MODE.off);
  });

  it('le viste a velo sopravvivono allo strumento', () => {
    // Sotto il retino il suolo si legge ancora, e spegnerle toglierebbe proprio
    // il contesto che serviva a decidere dove costruire.
    expect(viewAfterToolPicked(INSPECT_MODE.xray)).toBe(INSPECT_MODE.xray);
    expect(viewAfterToolPicked(INSPECT_MODE.block)).toBe(INSPECT_MODE.block);
    expect(viewAfterToolPicked(INSPECT_MODE.off)).toBe(INSPECT_MODE.off);
  });
});
