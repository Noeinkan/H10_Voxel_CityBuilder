import { describe, expect, it } from 'vitest';
import { generateIsland } from '../world/terrain/IslandGenerator';
import { VoxelWorld } from '../world/VoxelWorld';
import { BALANCE } from './balance';
import { ALL_CLASSES, BUILDING_CLASS } from './classes';
import { nextBuildSites } from './nextBuildSites';
import { createScenarioState } from './scenario';
import { addBuilding, addCatalyst, createSimState, setPolicyActive, type SimState } from './SimState';
import { testTerrain } from './testTerrain';

/** Metà scacchiera edificabile: costringe i candidati a scegliere. */
function checkerTerrain() {
  return testTerrain({
    chunksX: 8,
    chunksY: 8,
    buildable: (x, y) => (x + y) % 2 === 0,
  });
}

function seededState(): SimState {
  let state = createSimState();
  state = addCatalyst(state, {
    x: 100,
    y: 100,
    class: BUILDING_CLASS.residential,
    strength: 240,
    radius: 22,
  });
  state = addCatalyst(state, {
    x: 130,
    y: 90,
    class: BUILDING_CLASS.industrial,
    strength: 200,
    radius: 18,
  });
  state = addCatalyst(state, {
    x: 108,
    y: 128,
    class: BUILDING_CLASS.civic,
    strength: 180,
    radius: 16,
  });
  return state;
}

describe('nextBuildSites — validita’ dei candidati', () => {
  it('non restituisce mai una cella non buildable ne’ una gia’ occupata', () => {
    const terrainMap = checkerTerrain();
    let state = seededState();

    // Occupa a mano il cuore del catalizzatore residenziale, dove il campo e'
    // massimo: se l'occupazione non fosse controllata uscirebbe comunque prima.
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        state = addBuilding(state, { x: 100 + dx, y: 100 + dy, class: BUILDING_CLASS.residential });
      }
    }

    const sites = nextBuildSites(state, terrainMap, 200);
    expect(sites.length).toBeGreaterThan(0);

    for (const site of sites) {
      expect(terrainMap.isBuildable(site.x, site.y)).toBe(true);
      expect(state.field.isFree(site.x, site.y)).toBe(true);
      expect(site.score).toBeGreaterThan(BALANCE.desirability.siteThreshold[site.class]);
      expect(site.score).toBe(state.field.valueAt(site.x, site.y, site.class));
    }
  });

  it('regge una mappa dove nessuna colonna e’ edificabile', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8, buildable: () => false });
    expect(nextBuildSites(seededState(), terrainMap, 10)).toEqual([]);
  });

  it('senza catalizzatori non ci sono candidati, per quanto grande sia la mappa', () => {
    const terrainMap = testTerrain({ chunksX: 16, chunksY: 16 });
    expect(nextBuildSites(createSimState(), terrainMap, 10)).toEqual([]);
  });

  it('rispetta la soglia della classe, che e’ da superare e non da pareggiare', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
    const cls = BUILDING_CLASS.industrial;
    const threshold = BALANCE.desirability.siteThreshold[cls];

    // Un catalizzatore la cui intensita' e' esattamente la soglia: solo il
    // centro la raggiunge, e raggiungerla non basta.
    const state = addCatalyst(createSimState(), {
      x: 60,
      y: 60,
      class: cls,
      strength: threshold,
      radius: 10,
    });

    expect(state.field.valueAt(60, 60, cls)).toBe(threshold);
    expect(nextBuildSites(state, terrainMap, 10)).toEqual([]);
  });

  it('non restituisce piu’ di n candidati e li da’ dal migliore al peggiore', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
    const state = seededState();

    const sites = nextBuildSites(state, terrainMap, 10);
    expect(sites).toHaveLength(10);

    for (let i = 1; i < sites.length; i++) {
      expect(sites[i].score).toBeLessThanOrEqual(sites[i - 1].score);
    }

    // I primi dieci di una lista lunga sono gli stessi dei primi dieci di n=10.
    const many = nextBuildSites(state, terrainMap, 500);
    expect(many.slice(0, 10)).toEqual(sites);
    expect(nextBuildSites(state, terrainMap, 0)).toEqual([]);
  });

  it('una cella compare una volta sola, con la classe di punteggio piu’ alto', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
    let state = createSimState();
    for (const cls of ALL_CLASSES) {
      state = addCatalyst(state, { x: 70, y: 70, class: cls, strength: 200, radius: 20 });
    }

    const sites = nextBuildSites(state, terrainMap, 500);
    const keys = sites.map((site) => `${site.x},${site.y}`);
    expect(new Set(keys).size).toBe(keys.length);

    const centre = sites.find((site) => site.x === 70 && site.y === 70);
    expect(centre).toBeDefined();
    const best = Math.max(...ALL_CLASSES.map((cls) => state.field.valueAt(70, 70, cls)));
    expect(centre?.score).toBe(best);
  });

  it('e’ deterministico: stessi ingressi, stessa lista', () => {
    const terrainMap = checkerTerrain();
    const state = seededState();

    expect(nextBuildSites(state, terrainMap, 25)).toEqual(nextBuildSites(state, terrainMap, 25));
  });

  it('non scrive niente: ne’ stato, ne’ campo', () => {
    const terrainMap = checkerTerrain();
    const state = seededState();
    const chunksBefore = state.field.chunkCount;
    const cellsBefore = state.field.totalRecomputedCells;

    nextBuildSites(state, terrainMap, 50);

    expect(state.field.chunkCount).toBe(chunksBefore);
    expect(state.field.totalRecomputedCells).toBe(cellsBefore);
    expect(state.buildings).toEqual([]);
  });

  it('una policy che alza un peso porta in lista celle che prima non passavano', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
    let state = addCatalyst(createSimState(), {
      x: 70,
      y: 70,
      class: BUILDING_CLASS.residential,
      strength: 60,
      radius: 12,
    });

    // Si conta il solo uso che la policy tocca. Sulla lista senza filtro la
    // differenza sparirebbe: un mercato favorisce anche il commercio, la cui
    // soglia e' piu' bassa, e quelle celle erano gia' candidate — con un altro
    // uso primario, ma candidate.
    const cls = BUILDING_CLASS.residential;
    const before = nextBuildSites(state, terrainMap, 500, { class: cls }).length;
    state = setPolicyActive(state, 'greenBelt', true);
    const after = nextBuildSites(state, terrainMap, 500, { class: cls }).length;

    expect(after).toBeGreaterThan(before);
  });
});

describe('nextBuildSites — su un’isola vera', () => {
  it('i candidati della scena di debug cadono tutti su colonne edificabili', () => {
    // L'isola vera ha coste, rocce e pendenze: e' la prova che il filtro di
    // edificabilita' e' quello della `TerrainMap` e non un'ipotesi del fixture.
    const world = new VoxelWorld();
    const region = { minX: 0, minY: 0, sizeX: 256, sizeY: 256 };
    const { map } = generateIsland(world, 1337, region);

    const state = createScenarioState(map, region);
    const sites = nextBuildSites(state, map, 10);

    expect(state.catalysts.length).toBeGreaterThan(0);
    expect(sites).toHaveLength(10);
    for (const site of sites) {
      expect(map.isBuildable(site.x, site.y)).toBe(true);
      expect(state.field.isFree(site.x, site.y)).toBe(true);
    }

    // Lo scenario e' funzione della sola mappa: stessa isola, stessi catalizzatori.
    expect(createScenarioState(map, region).catalysts).toEqual(state.catalysts);
  });
});

describe('nextBuildSites — filtro di classe', () => {
  it('con una classe indicata restituisce solo quella', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
    const state = seededState();

    for (const cls of ALL_CLASSES) {
      const sites = nextBuildSites(state, terrainMap, 50, { class: cls });
      expect(sites.length).toBeGreaterThan(0);
      for (const site of sites) {
        expect(site.class).toBe(cls);
        expect(site.score).toBe(state.field.valueAt(site.x, site.y, cls));
        expect(site.score).toBeGreaterThan(BALANCE.desirability.siteThreshold[cls]);
      }
    }
  });

  it('il filtro segue il vettore di influenza del ruolo, uso per uso', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
    // Un parco: porta il civico a pieno, tira su anche le case e i negozi di
    // quartiere, e caccia via l'industria. Il filtro deve raccontare
    // esattamente quel vettore, non "la classe del catalizzatore".
    const state = addCatalyst(createSimState(), {
      x: 70,
      y: 70,
      kind: 'park',
      class: BUILDING_CLASS.civic,
      strength: 200,
      radius: 20,
    });

    expect(nextBuildSites(state, terrainMap, 10, { class: BUILDING_CLASS.civic }).length).toBe(10);
    expect(nextBuildSites(state, terrainMap, 10, { class: BUILDING_CLASS.residential }).length)
      .toBeGreaterThan(0);
    // Influenza negativa: il campo resta a zero, quindi nessun candidato. E'
    // l'altra meta' del vettore, quella che rende un parco una scelta e non
    // solo un bonus.
    expect(nextBuildSites(state, terrainMap, 10, { class: BUILDING_CLASS.industrial })).toEqual([]);
  });

  it('senza filtro la lista e’ quella di prima: il parametro e’ opzionale', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
    const state = seededState();

    expect(nextBuildSites(state, terrainMap, 20, {})).toEqual(
      nextBuildSites(state, terrainMap, 20),
    );
  });

  it('il nucleo della scena di debug esce nel rapporto voluto', () => {
    const world = new VoxelWorld();
    const region = { minX: 0, minY: 0, sizeX: 256, sizeY: 256 };
    const { map } = generateIsland(world, 1337, region);

    const state = createScenarioState(map, region);

    // Dieci residenziali, sei commerciali, dieci industriali, quattro civici:
    // il rapporto 1:1 fra residenziale e industriale e' cio' che tiene in
    // pareggio il bilancio alimentare.
    expect(state.buildingCounts).toEqual([10, 6, 10, 4]);
    for (const building of state.buildings) {
      expect(map.isBuildable(building.x, building.y)).toBe(true);
    }
    // Nessuna cella occupata due volte.
    const keys = state.buildings.map((b) => `${b.x},${b.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
