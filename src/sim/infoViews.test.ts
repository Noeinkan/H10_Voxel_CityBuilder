import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from './classes';
import { urbanFieldAt, urbanProfileAt } from './districts';
import {
  capacityIndex,
  createSimInfoSampler,
  INFO_VIEWS,
  infoViewVersion,
  nextInfoView,
  type InfoViewKind,
} from './infoViews';
import { addBuilding, addCatalyst, createSimState } from './SimState';

function seeded(): ReturnType<typeof createSimState> {
  let state = createSimState();
  state = addCatalyst(state, { x: 40, y: 40, kind: 'market', class: BUILDING_CLASS.commercial, strength: 210, radius: 30 });
  state = addCatalyst(state, { x: 50, y: 40, kind: 'park', class: BUILDING_CLASS.civic, strength: 195, radius: 24 });
  return state;
}

describe('infoViews — catalogo', () => {
  it('il giro delle viste parte dalla citta’ nuda e ci torna', () => {
    let kind: InfoViewKind = 'off';
    const seen: string[] = [];
    for (let i = 0; i < INFO_VIEWS.length - 1; i++) {
      kind = nextInfoView(kind);
      seen.push(kind);
    }
    expect(seen).toEqual(['food', 'materials', 'density', 'coverage', 'happiness', 'districts']);
    expect(nextInfoView('districts')).toBe('off');
  });

  it('cibo e distretti sono categorici, il resto continuo', () => {
    expect(INFO_VIEWS.find((spec) => spec.kind === 'food')?.mode).toBe('categorical');
    expect(INFO_VIEWS.find((spec) => spec.kind === 'districts')?.mode).toBe('categorical');
    expect(INFO_VIEWS.find((spec) => spec.kind === 'happiness')?.mode).toBe('continuous');
    expect(INFO_VIEWS.find((spec) => spec.kind === 'density')?.mode).toBe('continuous');
  });

  it('la felicita’ e’ gia’ normalizzata, densita’ e materiali no', () => {
    expect(INFO_VIEWS.find((spec) => spec.kind === 'happiness')?.normalized).toBe(true);
    expect(INFO_VIEWS.find((spec) => spec.kind === 'density')?.normalized).toBe(false);
    expect(INFO_VIEWS.find((spec) => spec.kind === 'materials')?.normalized).toBe(false);
    // La copertura e' un rapporto, quindi non va rinormalizzata sul massimo
    // della regione: se lo fosse, una citta' scoperta uniformemente si
    // ridipingerebbe tutta verde e la vista direbbe il contrario del vero.
    expect(INFO_VIEWS.find((spec) => spec.kind === 'coverage')?.normalized).toBe(true);
    expect(INFO_VIEWS.find((spec) => spec.kind === 'coverage')?.mode).toBe('continuous');
  });

  it('sparse distingue cio’ che sta su una colonna da cio’ che e’ un campo', () => {
    // La heatmap decima: cio' che vive su colonne esatte va cercato su tutta
    // l'impronta della cella, o cinque industrie su un'isola sparivano.
    for (const kind of ['food', 'materials', 'density'] as const) {
      expect(INFO_VIEWS.find((spec) => spec.kind === kind)?.sparse).toBe(true);
    }
    // Questi tre interpolano fra colonne vicine: pungere l'angolo basta.
    for (const kind of ['coverage', 'happiness', 'districts'] as const) {
      expect(INFO_VIEWS.find((spec) => spec.kind === kind)?.sparse).toBe(false);
    }
  });

  it('il campionatore riporta il flag della sua vista, non uno suo', () => {
    expect(createSimInfoSampler('materials', createSimState()).sparse).toBe(true);
    expect(createSimInfoSampler('districts', seeded()).sparse).toBe(false);
  });
});

describe('infoViews — capacita’ per colonna', () => {
  it('somma le capacita’ per classe e tiene fuori la torre dall’industria', () => {
    let state = createSimState();
    state = addBuilding(state, { x: 10, y: 10, class: BUILDING_CLASS.residential, level: 0 });
    state = addBuilding(state, { x: 10, y: 10, class: BUILDING_CLASS.residential, level: 1 });
    state = addBuilding(state, { x: 12, y: 10, class: BUILDING_CLASS.industrial, level: 0 });
    state = addBuilding(state, { x: 14, y: 10, class: BUILDING_CLASS.industrial, level: 0, specialization: 'farming' });

    const index = capacityIndex(state);
    // Due case sulla stessa colonna: capacita' 1 + 1,25 del livello 1.
    expect(index.map.get('10,10')?.residential).toBe(2.25);
    expect(index.map.get('12,10')?.industrial).toBe(1);
    // La torre idroponica produce cibo, non materiali: non conta come industria.
    expect(index.map.get('14,10')?.industrial).toBe(0);
    expect(index.map.get('14,10')?.residential).toBe(0);
  });

  it('una colonna vuota non ha capacita’, e il campionatore la lascia a zero', () => {
    const state = createSimState();
    const sampler = createSimInfoSampler('density', state);
    expect(sampler.sample(5, 5)).toBe(0);
  });
});

describe('infoViews — campionatori della simulazione', () => {
  it('densita’ legge la capacita’ residenziale della colonna', () => {
    let state = createSimState();
    state = addBuilding(state, { x: 7, y: 8, class: BUILDING_CLASS.residential, level: 2 });
    const sampler = createSimInfoSampler('density', state);
    expect(sampler.sample(7, 8)).toBeGreaterThan(0);
    expect(sampler.sample(9, 9)).toBe(0);
  });

  it('la copertura cala allontanandosi dal servizio, e resta in [0, 1]', () => {
    const state = seeded();
    const sampler = createSimInfoSampler('coverage', state);
    const near = sampler.sample(50, 40);
    const far = sampler.sample(200, 200);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThanOrEqual(1);
    expect(far).toBeGreaterThanOrEqual(0);
  });

  it('materiali legge la capacita’ industriale, non la residenziale', () => {
    let state = createSimState();
    state = addBuilding(state, { x: 3, y: 3, class: BUILDING_CLASS.residential, level: 0 });
    state = addBuilding(state, { x: 4, y: 3, class: BUILDING_CLASS.industrial, level: 0 });
    const sampler = createSimInfoSampler('materials', state);
    expect(sampler.sample(3, 3)).toBe(0);
    expect(sampler.sample(4, 3)).toBeGreaterThan(0);
  });

  it('distretti restituisce un indice dentro l’ordine canonico', () => {
    const sampler = createSimInfoSampler('districts', seeded());
    const value = sampler.sample(42, 42);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(8);
  });

  it('il cibo non ha campionatore nella simulazione: lo compone il mondo', () => {
    expect(() => createSimInfoSampler('food', createSimState())).toThrow();
  });
});

describe('infoViews — allineamento con il profilo urbano', () => {
  it('urbanFieldAt racconta la stessa felicita’ e lo stesso distretto di urbanProfileAt', () => {
    const state = seeded();
    const probes: readonly (readonly [number, number])[] = [
      [40, 40],
      [45, 42],
      [30, 30],
      [60, 50],
      [0, 0],
    ];
    for (const [x, y] of probes) {
      const field = urbanFieldAt(state, x, y);
      const profile = urbanProfileAt(state, x, y);
      expect(field.satisfaction).toBe(profile.satisfaction);
      expect(field.district).toBe(profile.district);
    }
  });
});

describe('infoViews — versione del campo', () => {
  it('cambia quando entra un edificio o un catalizzatore, non con il tick', () => {
    let state = createSimState();
    const before = infoViewVersion(state);
    state = addCatalyst(state, { x: 0, y: 0, kind: 'market', class: BUILDING_CLASS.commercial, strength: 100, radius: 10 });
    expect(infoViewVersion(state)).not.toBe(before);
    const afterCatalyst = infoViewVersion(state);
    state = addBuilding(state, { x: 0, y: 0, class: BUILDING_CLASS.residential });
    expect(infoViewVersion(state)).not.toBe(afterCatalyst);
  });
});
