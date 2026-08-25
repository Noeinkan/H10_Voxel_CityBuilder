import { describe, expect, it } from 'vitest';
import { CHUNK } from '../world/chunkCoords';
import { VoxelWorld } from '../world/VoxelWorld';
import { BUILDING_CLASS, type BuildingClass } from './classes';
import { writeDesirabilityData } from './debugData';
import { DesirabilityField } from './DesirabilityField';
import {
  addBuilding,
  addCatalyst,
  createSimState,
  removeBuildings,
  reviveSimState,
  setPolicyActive,
  setSelectedClass,
  toSimStateData,
  type SimStateData,
  type SimState,
} from './SimState';
import { testTerrain } from './testTerrain';
import { tickMany } from './tick';

function populated(): SimState {
  let state = createSimState();
  state = addCatalyst(state, {
    x: 40,
    y: 44,
    class: BUILDING_CLASS.residential,
    strength: 210,
    radius: 18,
  });
  state = addCatalyst(state, {
    x: 55,
    y: 40,
    class: BUILDING_CLASS.industrial,
    strength: 170,
    radius: 14,
  });
  state = addBuilding(state, { x: 41, y: 44, class: BUILDING_CLASS.residential });
  state = addBuilding(state, { x: 44, y: 46, class: BUILDING_CLASS.industrial });
  state = setPolicyActive(state, 'greenBelt', true);
  state = setSelectedClass(state, BUILDING_CLASS.industrial);
  return tickMany(state, testTerrain({ chunksX: 4, chunksY: 4 }), 37);
}

/** Tutte le celle non nulle di una classe, per confrontare due campi. */
function snapshot(field: DesirabilityField, cls: BuildingClass): Map<string, number> {
  const out = new Map<string, number>();
  for (const chunk of field.chunks.values()) {
    const originX = DesirabilityField.originOf(chunk.ccx);
    const originY = DesirabilityField.originOf(chunk.ccy);
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const value = field.valueAt(originX + lx, originY + ly, cls);
        if (value !== 0) out.set(`${originX + lx},${originY + ly}`, value);
      }
    }
  }
  return out;
}

describe('SimState — serializzazione', () => {
  it('il giro in JSON non perde niente', () => {
    const state = populated();
    const data = toSimStateData(state);

    const roundTripped = JSON.parse(JSON.stringify(data)) as typeof data;

    expect(roundTripped).toEqual(data);
  });

  it('il campo si ricostruisce identico dai soli dati serializzati', () => {
    const state = populated();

    const revived = reviveSimState(JSON.parse(JSON.stringify(toSimStateData(state))));

    for (const cls of [0, 1, 2] as const) {
      expect(snapshot(revived.field, cls)).toEqual(snapshot(state.field, cls));
    }
    expect(revived.field.occupiedCells).toBe(state.field.occupiedCells);
    expect(revived.field.isFree(41, 44)).toBe(false);
    expect(snapshot(state.field, BUILDING_CLASS.residential).size).toBeGreaterThan(0);
  });

  it('i mandati sopravvivono al giro in JSON in forma canonica', () => {
    const state = { ...populated(), charters: ['leasedSquare', 'rationing'] as const };
    const revived = reviveSimState(JSON.parse(JSON.stringify(toSimStateData(state))));

    expect(revived.charters).toEqual(['rationing', 'leasedSquare']);
  });

  it('rianima un salvataggio scritto prima dei mandati', () => {
    const { charters: _charters, ...older } = toSimStateData(populated());

    expect(reviveSimState(older as SimStateData).charters).toEqual([]);
  });

  it('l’organico sopravvive al giro in JSON', () => {
    const state = { ...populated(), staffing: 0.625 };

    expect(reviveSimState(JSON.parse(JSON.stringify(toSimStateData(state)))).staffing).toBe(0.625);
  });

  it('rianima ottimista un salvataggio scritto prima dell’organico', () => {
    // Era il comportamento del driver prima che questo numero esistesse, e il
    // primo tick lo riscrive comunque con quello vero.
    const { staffing: _staffing, ...older } = toSimStateData(populated());

    expect(reviveSimState(older as SimStateData).staffing).toBe(1);
  });

  it('lo stato serializzato non contiene array tipizzati ne’ oggetti opachi', () => {
    const data = toSimStateData(populated());

    expect(Object.hasOwn(data, 'field')).toBe(false);
    for (const value of Object.values(data)) {
      expect(ArrayBuffer.isView(value)).toBe(false);
      expect(typeof value).not.toBe('function');
    }
    expect(Number.isInteger(data.rngState)).toBe(true);
    expect(data.rngState).toBeGreaterThanOrEqual(0);
  });

  it('normalizza i catalizzatori, cosi’ il giro in JSON non cambia il campo', () => {
    const state = addCatalyst(createSimState(), {
      x: 10.4,
      y: 20.6,
      class: BUILDING_CLASS.civic,
      strength: 300.7,
      radius: 8.2,
    });

    expect(state.catalysts[0]).toEqual({
      x: 10,
      y: 21,
      class: BUILDING_CLASS.civic,
      strength: 255,
      radius: 8,
    });
  });
});

describe('SimState — operazioni', () => {
  it('addBuilding tiene i conteggi per uso allineati alla lista', () => {
    let state = createSimState();
    state = addBuilding(state, { x: 1, y: 1, class: BUILDING_CLASS.residential });
    state = addBuilding(state, { x: 2, y: 1, class: BUILDING_CLASS.residential });
    state = addBuilding(state, { x: 3, y: 1, class: BUILDING_CLASS.civic });

    expect(state.buildingCounts).toEqual([2, 0, 0, 1]);
    expect(state.mixedCounts).toEqual([0, 0, 0, 0]);
    expect(state.buildings).toHaveLength(3);
  });

  it('un edificio misto conta una volta come primario e una come secondario', () => {
    let state = createSimState();
    state = addBuilding(state, {
      x: 1,
      y: 1,
      class: BUILDING_CLASS.residential,
      mixed: BUILDING_CLASS.commercial,
    });

    // Un volume solo: la somma dei due conteggi non e' il numero di edifici, e
    // il bilancio li rimette insieme una volta sola, nella capacita' efficace.
    expect(state.buildings).toHaveLength(1);
    expect(state.buildingCounts).toEqual([1, 0, 0, 0]);
    expect(state.mixedCounts).toEqual([0, 1, 0, 0]);
    expect(state.field.occupantAt(1, 1)).toBe(BUILDING_CLASS.residential);
  });

  it('scarta un uso secondario uguale al primario invece di contarlo due volte', () => {
    let state = createSimState();
    state = addBuilding(state, {
      x: 4,
      y: 4,
      class: BUILDING_CLASS.commercial,
      mixed: BUILDING_CLASS.commercial,
    });

    expect(state.buildingCounts).toEqual([0, 1, 0, 0]);
    expect(state.mixedCounts).toEqual([0, 0, 0, 0]);
    expect(state.buildings[0].mixed).toBeUndefined();
  });

  it('removeBuildings riporta lista e conteggi a prima delle costruzioni', () => {
    const before = createSimState();
    const doomed = [
      { x: 1, y: 1, class: BUILDING_CLASS.residential },
      { x: 3, y: 1, class: BUILDING_CLASS.civic, mixed: BUILDING_CLASS.commercial },
    ];

    let state = before;
    state = addBuilding(state, doomed[0]);
    state = addBuilding(state, { x: 2, y: 1, class: BUILDING_CLASS.residential });
    state = addBuilding(state, doomed[1]);
    expect(state.buildingCounts).toEqual([2, 0, 0, 1]);
    expect(state.mixedCounts).toEqual([0, 1, 0, 0]);

    state = removeBuildings(state, doomed);

    // Resta il solo edificio che nessuno ha chiesto di abbattere.
    expect(state.buildings).toEqual([{ x: 2, y: 1, class: BUILDING_CLASS.residential }]);
    expect(state.buildingCounts).toEqual([1, 0, 0, 0]);
    expect(state.mixedCounts).toEqual(before.mixedCounts);
  });

  it('removeBuildings consuma una voce per edificio chiesto, non tutta la colonna', () => {
    let state = createSimState();
    const twin = { x: 5, y: 5, class: BUILDING_CLASS.residential };
    state = addBuilding(state, twin);
    state = addBuilding(state, twin);

    state = removeBuildings(state, [twin]);

    // Due volumi sovrapposti sono due edifici: toglierne uno non deve
    // sgomberare anche il piano di sopra.
    expect(state.buildings).toHaveLength(1);
    expect(state.buildingCounts).toEqual([1, 0, 0, 0]);
  });

  it('removeBuildings lascia cadere in silenzio cio che non trova', () => {
    const state = addBuilding(createSimState(), { x: 1, y: 1, class: BUILDING_CLASS.residential });
    const same = removeBuildings(state, [{ x: 9, y: 9, class: BUILDING_CLASS.civic }]);

    expect(same).toBe(state);
  });

  it('createSimState scarta le policy sconosciute e mette in ordine quelle valide', () => {
    const state = createSimState({ policies: ['civicPride', 'inventata', 'denseHousing'] as never });
    expect(state.policies).toEqual(['denseHousing', 'civicPride']);
  });
});

describe('debugData — la simulazione scrive solo in data', () => {
  it('scrive la desiderabilita’ della classe selezionata e non tocca blocks', () => {
    const world = new VoxelWorld();
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });
    const state = setSelectedClass(populated(), BUILDING_CLASS.residential);

    // Il mondo parte con un solo voxel, cosi' si vede se `blocks` cambia.
    world.setBlock(0, 0, 0, 7);
    world.flush();
    const solidBefore = world.solidVoxelCount;

    const written = writeDesirabilityData(world, state, terrainMap);

    expect(written).toBeGreaterThan(0);
    expect(world.solidVoxelCount).toBe(solidBefore);
    expect(world.dirtyCount).toBe(0);
    expect(world.getBlock(41, 44, 11)).toBe(0);

    // Il valore finisce sul voxel di superficie, a z = height - 1.
    expect(world.getData(40, 44, 11)).toBe(
      state.field.valueAt(40, 44, BUILDING_CLASS.residential),
    );
    expect(world.getData(40, 44, 11)).toBeGreaterThan(0);
  });

  it('cambiare classe selezionata cambia cio’ che finisce in data', () => {
    const world = new VoxelWorld();
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4, height: 12 });

    const residential = setSelectedClass(populated(), BUILDING_CLASS.residential);
    writeDesirabilityData(world, residential, terrainMap);
    const asResidential = world.getData(40, 44, 11);

    const production = setSelectedClass(residential, BUILDING_CLASS.industrial);
    writeDesirabilityData(world, production, terrainMap);

    expect(world.getData(40, 44, 11)).toBe(production.field.valueAt(40, 44, BUILDING_CLASS.industrial));
    expect(world.getData(40, 44, 11)).not.toBe(asResidential);
  });
});
