import { describe, expect, it } from 'vitest';
import { addBuilding, BUILDING_CLASS, createSimState, type SimState } from '../../sim';
import { AERIAL_PART } from '../../world/aerial/config';
import { BASE_ARCOLOGY_KIND } from '../../world/arcology/config';
import { ROPEWAY_PART } from '../../world/ropeway/config';
import { SPAN_KIND } from '../../world/spans/config';
import type { BuildingRecord } from '../../world/buildings/BuildingRegistry';
import { captureSave } from './capture';
import { SAVE_VERSION } from './format';

const SCENE = { paused: false, speed: 1, clock: 0, healthyTicks: 0 };

function record(id: number, x: number, extra: Partial<BuildingRecord> = {}): BuildingRecord {
  return {
    id,
    x,
    y: 0,
    baseZ: 0,
    footprint: 1,
    height: 4,
    class: BUILDING_CLASS.residential,
    level: 0,
    seed: 1,
    ...extra,
  };
}

function capture(state: SimState, records: readonly BuildingRecord[]) {
  return captureSave({ seed: 7, state, records, sectors: [], scene: SCENE, savedAt: 0 });
}

describe('cattura del salvataggio', () => {
  it('porta seed, versione e settori nel file', () => {
    const save = captureSave({
      seed: 7,
      state: createSimState(),
      records: [],
      sectors: ['north-0', 'east-1'],
      scene: SCENE,
      savedAt: 123,
    });
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.seed).toBe(7);
    expect(save.savedAt).toBe(123);
    expect(save.sectors).toEqual(['north-0', 'east-1']);
  });

  it('tiene edifici, landmark e arcologie, che si sanno ridisegnare', () => {
    const records = [
      record(1, 0),
      record(2, 2, { landmark: 'market' }),
      record(3, 4, { arcology: BASE_ARCOLOGY_KIND.twinStem, uses: [BUILDING_CLASS.residential] }),
    ];
    const save = capture(createSimState(), records);
    expect(save.records.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('pota cio che nessun generatore sa ridisegnare da un record', () => {
    const records = [
      record(1, 0),
      record(2, 2, { span: SPAN_KIND.bridge }),
      record(3, 4, { aerial: AERIAL_PART.terrace }),
      record(4, 6, { ropeway: ROPEWAY_PART.station }),
    ];
    expect(capture(createSimState(), records).records.map((r) => r.id)).toEqual([1]);
  });

  it('porta via anche chi poggiava su cio che e stato potato', () => {
    // Un edificio sopra un impalcato, senza il suo impalcato, resterebbe
    // sospeso in aria: cade con lui, e la passata in quota lo riproporra'.
    const records = [
      record(1, 0),
      record(2, 2, { aerial: AERIAL_PART.terrace, supports: [1] }),
      record(3, 2, { baseZ: 12, supports: [2] }),
      record(4, 2, { baseZ: 20, supports: [3] }),
    ];
    expect(capture(createSimState(), records).records.map((r) => r.id)).toEqual([1]);
  });

  it('toglie dalla simulazione gli edifici che ha potato', () => {
    // E' la coerenza su cui il caricamento si appoggia: i record e `buildings`
    // devono descrivere la stessa citta', o i conteggi divergono per sempre.
    let state = createSimState();
    state = addBuilding(state, { x: 0, y: 0, class: BUILDING_CLASS.residential });
    state = addBuilding(state, { x: 2, y: 0, class: BUILDING_CLASS.residential });

    const save = capture(state, [
      record(1, 0),
      record(2, 2, { aerial: AERIAL_PART.terrace }),
      record(3, 2, { baseZ: 12, supports: [2] }),
    ]);

    expect(save.sim.buildings).toHaveLength(1);
    expect(save.sim.buildings[0]?.x).toBe(0);
    expect(save.sim.buildingCounts[BUILDING_CLASS.residential]).toBe(1);
  });

  it('non tocca la partita in corso mentre la salva', () => {
    // `removeBuildings` aggiorna il campo **in place**: se la potatura girasse
    // sullo stato vivo, salvare cancellerebbe edifici dalla citta' giocata.
    let state = createSimState();
    state = addBuilding(state, { x: 2, y: 0, class: BUILDING_CLASS.residential });
    const before = state.buildings.length;

    capture(state, [
      record(2, 2, { aerial: AERIAL_PART.terrace }),
      record(3, 2, { baseZ: 12, supports: [2] }),
    ]);

    expect(state.buildings).toHaveLength(before);
    expect(state.buildingCounts[BUILDING_CLASS.residential]).toBe(1);
  });

  it('non paga il ramo costoso quando non c e niente da potare', () => {
    const state = createSimState();
    const save = capture(state, [record(1, 0)]);
    // Stessa lista, non una copia ricostruita: e' il segno che la potatura non
    // ha rifatto il campo per niente.
    expect(save.sim.buildings).toBe(state.buildings);
  });
});
