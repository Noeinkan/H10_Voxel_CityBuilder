import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  BUILDING_CLASS,
  FARM_KIND,
  addBuilding,
  createSimState,
  foodYieldOf,
  type SimState,
} from '../sim';
import { testTerrain } from '../sim/testTerrain';
import { VoxelWorld } from '../world/VoxelWorld';
import { SURFACE_KIND } from '../world/visualBlock';
import { StreetNetwork } from '../world/streets/StreetNetwork';
import { BuildingRegistry } from '../world/buildings/BuildingRegistry';
import { AERIAL_PART } from '../world/aerial/config';
import { SPAN_KIND } from '../world/spans/config';
import { resolveSelection, type SelectionQuery } from './selection';
import { pickSolidCell, type SurfaceCell } from './surfacePick';

const SEED = 1337;

/** Il minimo che il registry pretende: il resto dei campi e' opzionale. */
function record(x: number, y: number, baseZ: number, height: number) {
  return { x, y, baseZ, height, footprint: 4, class: BUILDING_CLASS.residential, level: 2, seed: 7 };
}

function harness(overrides: Partial<SelectionQuery> = {}): Omit<SelectionQuery, 'cell'> {
  return {
    world: new VoxelWorld(),
    map: testTerrain({ chunksX: 2, chunksY: 2, height: 12 }),
    registry: new BuildingRegistry(),
    streets: new StreetNetwork(SEED),
    state: createSimState(),
    seed: SEED,
    ...overrides,
  };
}

function cell(x: number, y: number, hitZ: number, z = 12): SurfaceCell {
  return { x, y, z, hitZ, buildable: true };
}

/** Case dichiarate alla simulazione: e' `buildingCounts` che il conteggio legge. */
function withHomes(state: SimState, count: number): SimState {
  let out = state;
  for (let i = 0; i < count; i++) {
    out = addBuilding(out, { x: 30 + i * 2, y: 30, class: BUILDING_CLASS.residential });
  }
  return out;
}

describe('resolveSelection', () => {
  it('sceglie il record il cui intervallo di quota contiene il punto colpito', () => {
    // E' il caso per cui la quota del puntatore esiste. L'occupazione e'
    // tridimensionale, quindi `at` restituisce entrambi i record e senza la
    // quota non ci sarebbe modo di dire quale sia stato puntato: cliccare la
    // passerella deve dare la passerella, non la casa che ci sta sotto.
    const registry = new BuildingRegistry();
    const ground = registry.add(record(20, 20, 12, 10));
    const bridge = registry.add({ ...record(20, 20, 30, 3), span: SPAN_KIND.bridge });
    const base = harness({ registry });

    expect(resolveSelection({ ...base, cell: cell(21, 21, 18) })?.structure?.record.id)
      .toBe(ground.id);
    expect(resolveSelection({ ...base, cell: cell(21, 21, 31) })?.structure?.record.id)
      .toBe(bridge.id);
  });

  it('il punto colpito e\' il tetto, non l\'aria sopra di lui', () => {
    // Il raggio si ferma **sul piano** della cima, quindi la parte intera della
    // sua quota e' la prima cella libera. Senza il clamp la struttura piu' alta
    // di una colonna non sarebbe mai selezionabile dal proprio tetto — cioe'
    // esattamente da dove la si clicca.
    const registry = new BuildingRegistry();
    const tower = registry.add(record(20, 20, 12, 18));
    const base = harness({ registry });

    // 30 e' `baseZ + height`: la cima, dove il raggio si ferma davvero.
    const picked = resolveSelection({ ...base, cell: cell(21, 21, 30) });
    expect(picked?.voxel.z).toBe(29);
    expect(picked?.structure?.record.id).toBe(tower.id);
  });

  it('su terreno nudo restano comunque tre strati su quattro', () => {
    const picked = resolveSelection({ ...harness(), cell: cell(40, 40, 12) });

    expect(picked).not.toBeNull();
    expect(picked?.structure).toBeNull();
    expect(picked?.column.height).toBe(12);
    expect(picked?.column.desirability).toHaveLength(4);
    expect(picked?.block.key).toMatch(/^-?\d+,-?\d+$/);
    expect(picked?.voxel.z).toBe(11);
  });

  it('fuori dalla mappa non c\'e\' niente da dire', () => {
    expect(resolveSelection({ ...harness(), cell: cell(900, 900, 12) })).toBeNull();
  });

  it('legge palette e superficie del voxel davvero colpito', () => {
    const world = new VoxelWorld();
    world.setBlock(21, 21, 11, 6, SURFACE_KIND.habitat);
    const picked = resolveSelection({ ...harness({ world }), cell: cell(21, 21, 12) });

    expect(picked?.voxel.palette).toBe(6);
    expect(picked?.voxel.surface).toBe(SURFACE_KIND.habitat);
    expect(picked?.voxel.water).toBe(false);
    expect(picked?.voxel.chunkKey).toBe('0,0,0');
  });

  it('l\'aggregato dell\'isolato conta gli edifici e non cio\' che edificio non e\'', () => {
    // La stessa regola del registry: landmark, campate e parti in quota occupano
    // spazio ma la simulazione non li ha mai contati con `addBuilding`. Sommarli
    // qui farebbe dire a questa scheda un numero che l'HUD non conferma.
    const registry = new BuildingRegistry();
    const streets = new StreetNetwork(SEED);
    const rect = streets.blockRect(streets.blockAt(40, 40));

    registry.add({ ...record(rect.x0, rect.y0, 12, 8), level: 3 });
    registry.add({ ...record(rect.x0 + 5, rect.y0, 12, 8), class: BUILDING_CLASS.commercial });
    registry.add({ ...record(rect.x0, rect.y0 + 5, 12, 8), landmark: 'market' });
    registry.add({ ...record(rect.x0 + 5, rect.y0 + 5, 30, 3), span: SPAN_KIND.bridge });
    registry.add({ ...record(rect.x0 + 10, rect.y0, 30, 3), aerial: AERIAL_PART.terrace });

    const picked = resolveSelection({ ...harness({ registry, streets }), cell: cell(40, 40, 12) });

    expect(picked?.block.buildings).toBe(2);
    expect(picked?.block.landmarks).toBe(1);
    expect(picked?.block.structures).toBe(2);
    expect(picked?.block.byClass[BUILDING_CLASS.residential]).toBe(1);
    expect(picked?.block.byClass[BUILDING_CLASS.commercial]).toBe(1);
    expect(picked?.block.maxLevel).toBe(3);
    expect(picked?.block.productivity.housingCapacity).toBe(BALANCE.weights.residentialCapacity);
    expect(picked?.block.productivity.commerceCapacity).toBe(BALANCE.weights.commercialCapacity);
  });

  it('la produttivita\' dell\'isolato segue usi misti, torri agricole e organico', () => {
    const registry = new BuildingRegistry();
    const streets = new StreetNetwork(SEED);
    const rect = streets.blockRect(streets.blockAt(40, 40));

    registry.add({
      ...record(rect.x0, rect.y0, 12, 8),
      class: BUILDING_CLASS.commercial,
      mixed: BUILDING_CLASS.residential,
    });
    registry.add({
      ...record(rect.x0 + 5, rect.y0, 12, 8),
      class: BUILDING_CLASS.industrial,
    });
    registry.add({
      ...record(rect.x0 + 10, rect.y0, 12, 8),
      class: BUILDING_CLASS.industrial,
      specialization: 'farming',
    });
    const state = { ...createSimState(), staffing: 0.5 };

    const picked = resolveSelection({ ...harness({ registry, streets, state }), cell: cell(40, 40, 12) });
    const productivity = picked?.block.productivity;

    expect(productivity?.housingCapacity).toBe(
      BALANCE.weights.residentialCapacity * BALANCE.mixedUse.secondaryShare,
    );
    expect(productivity?.commerceCapacity).toBe(BALANCE.weights.commercialCapacity);
    expect(productivity?.materialsPerTick).toBe(BALANCE.weights.productionYield * 0.5);
    const localFarms: number[] = [];
    localFarms[FARM_KIND.tower] = 1;
    expect(productivity?.foodPerTick).toBe(foodYieldOf(localFarms, 0.5));
    expect(productivity?.staffing).toBe(0.5);
  });

  it('l\'aggregato non prende gli edifici dell\'isolato accanto', () => {
    // `withinRadius` misura in distanza di Chebyshev sull'angolo minimo, cioe'
    // su un quadrato piu' largo dell'isolato: senza il filtro sul rettangolo la
    // scheda conterebbe i vicini di fronte.
    const registry = new BuildingRegistry();
    const streets = new StreetNetwork(SEED);
    const rect = streets.blockRect(streets.blockAt(40, 40));

    registry.add(record(rect.x0, rect.y0, 12, 8));
    registry.add(record(rect.x1 + 6, rect.y0, 12, 8));

    const picked = resolveSelection({ ...harness({ registry, streets }), cell: cell(40, 40, 12) });
    expect(picked?.block.buildings).toBe(1);
  });

  it('un edificio porta il rendimento del suo uso, non il proprio', () => {
    // La simulazione non sa niente di *questo* palazzo: `perBuilding` e' il peso
    // dell'uso e `count` il parco costruito, cioe' due fatti che valgono per
    // qualunque edificio come lui.
    const registry = new BuildingRegistry();
    registry.add(record(20, 20, 12, 10));
    const state = withHomes(createSimState(), 3);

    const picked = resolveSelection({ ...harness({ registry, state }), cell: cell(21, 21, 18) });
    const uses = picked?.structure?.uses ?? [];

    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({
      cls: BUILDING_CLASS.residential,
      secondary: false,
      perBuilding: BALANCE.weights.residentialCapacity,
      count: 3,
    });
    // Definita perche' la citta' ha case: e' `popolazione / capacita'`, che e' un
    // numero della citta' e non di questo edificio.
    expect(uses[0]?.cityUse).toBeTypeOf('number');
  });

  it('il rendimento passa per le policy attive, e non per la costante nuda', () => {
    // `denseHousing` moltiplica `residentialCapacity`: leggere `BALANCE` a crudo
    // mostrerebbe una capacita' che il tick non usa piu'.
    const registry = new BuildingRegistry();
    registry.add(record(20, 20, 12, 10));
    const state = withHomes(createSimState({ policies: ['denseHousing'] }), 1);

    const picked = resolveSelection({ ...harness({ registry, state }), cell: cell(21, 21, 18) });

    expect(picked?.structure?.uses[0]?.perBuilding).toBeCloseTo(
      BALANCE.weights.residentialCapacity * BALANCE.policyMultipliers.denseHousing,
    );
  });

  it('un uso misto porta due usi, e l\'ospite solo la sua quota', () => {
    // La stessa quota che `effectiveCount` somma: col rendimento pieno la scheda
    // direbbe che un misto vale due edifici mentre il tick ne conta uno e mezzo.
    const registry = new BuildingRegistry();
    registry.add({
      ...record(20, 20, 12, 10),
      class: BUILDING_CLASS.commercial,
      mixed: BUILDING_CLASS.residential,
    });

    const picked = resolveSelection({ ...harness({ registry }), cell: cell(21, 21, 18) });
    const uses = picked?.structure?.uses ?? [];

    expect(uses.map((entry) => entry.cls))
      .toEqual([BUILDING_CLASS.commercial, BUILDING_CLASS.residential]);
    expect(uses[1]).toMatchObject({
      secondary: true,
      perBuilding: BALANCE.weights.residentialCapacity * BALANCE.mixedUse.secondaryShare,
    });
  });

  it('cio\' che edificio non e\' non porta nessun rendimento', () => {
    // Il campo `class` c'e' su tutti e quattro i tipi di record, ma la
    // simulazione non ha mai contato landmark, campate e parti in quota: un
    // rendimento accanto a un viadotto sarebbe un numero che nessun tick somma.
    const registry = new BuildingRegistry();
    registry.add({ ...record(20, 20, 12, 10), landmark: 'market' });
    registry.add({ ...record(20, 20, 30, 3), span: SPAN_KIND.bridge });
    registry.add({ ...record(20, 20, 40, 2), aerial: AERIAL_PART.terrace });
    const base = harness({ registry });

    expect(resolveSelection({ ...base, cell: cell(21, 21, 18) })?.structure?.uses).toEqual([]);
    expect(resolveSelection({ ...base, cell: cell(21, 21, 31) })?.structure?.uses).toEqual([]);
    expect(resolveSelection({ ...base, cell: cell(21, 21, 41) })?.structure?.uses).toEqual([]);
  });

  it('un landmark risale al catalizzatore che influenza davvero il quartiere', () => {
    const registry = new BuildingRegistry();
    registry.add({ ...record(20, 20, 12, 10), landmark: 'market' });
    const catalyst = {
      x: 21,
      y: 22,
      class: BUILDING_CLASS.residential,
      kind: 'market' as const,
      strength: 173,
      radius: 24,
    };
    const state = createSimState({ catalysts: [catalyst] });

    const picked = resolveSelection({
      ...harness({ registry, state }),
      cell: cell(21, 21, 18),
    });

    expect(picked?.structure?.catalyst).toEqual(catalyst);
  });

  it('sta in piedi sul risultato vero di `pickSolidCell`', () => {
    // La quota che arriva qui e' frazionaria, perche' la marcia scende a passi
    // di un quarto di voxel: la catena va provata con quel numero e non con un
    // intero costruito a mano.
    const registry = new BuildingRegistry();
    const tower = registry.add(record(14, 8, 12, 18));
    const base = harness({ registry });
    const ray = { origin: [15.5, 9.5, 40], direction: [0, 0, -1] } as const;

    const picked = pickSolidCell(ray, base.map, (x, y) => registry.topOf(x, y), 64);
    expect(picked).not.toBeNull();
    expect(resolveSelection({ ...base, cell: picked! })?.structure?.record.id).toBe(tower.id);
  });
});
