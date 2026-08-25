import { describe, expect, it } from 'vitest';
import { BALANCE, BUILDING_CLASS, catalystById, createSimState, defaultCatalystOfClass } from '../sim';
import { testTerrain } from '../sim/testTerrain';
import { BUILD_WEIGHT, GRADING } from '../world/grading/config';
import { TERRAIN } from '../world/terrain/config';
import {
  buyExpansion,
  catalystFailure,
  catalystSiteCost,
  grantSite,
  placeCatalyst,
  placeRopeway,
  placeTerrace,
  ropewayFailure,
  terraceFailure,
  togglePolicy,
} from './actions';

/** Prima colonna asciutta di una fixture con il mare a ovest. */
const SHORE_X = 20;

/**
 * Isola con una costa vera, non un piano a quota arbitraria.
 *
 * Serve da quando il ruolo decide il luogo: `testTerrain({ height })` dichiara
 * il bioma `plain` ma lascia la quota sotto il livello del mare, quindi un porto
 * ci passerebbe ovunque — la fixture direbbe di si' per un motivo che sull'isola
 * vera non esiste.
 */
function coast() {
  return testTerrain({
    chunksX: 2,
    chunksY: 2,
    heightAt: (x) => (x < SHORE_X ? TERRAIN.seaLevel - 6 : TERRAIN.beachMaxHeight + 6),
  });
}

describe('azioni di gioco', () => {
  it('terrazze e funivie richiedono industria e pagano entrambi i listini', () => {
    const base = createSimState();
    const ready = {
      ...base,
      population: { stock: 100, delta: 0 },
      funds: { stock: 2_000, delta: 0 },
    };
    const empty = { ...ready, materials: { stock: 0, delta: 0 } };
    expect(terraceFailure(empty, null)).toBe('insufficient-materials');
    expect(ropewayFailure(empty, null)).toBe('insufficient-materials');

    const terrace = placeTerrace(ready, null);
    expect(terrace.success).toBe(true);
    if (!terrace.success) return;
    expect(terrace.state.funds.stock).toBe(2_000 - BALANCE.gameplay.terrace.cost);
    expect(terrace.state.materials.stock)
      .toBe(base.materials.stock - BALANCE.gameplay.terrace.materials);
    expect(terrace.state.materialFlows.construction).toBe(BALANCE.gameplay.terrace.materials);

    const ropeway = placeRopeway(ready, null);
    expect(ropeway.success).toBe(true);
    if (!ropeway.success) return;
    expect(ropeway.state.materials.stock)
      .toBe(base.materials.stock - BALANCE.gameplay.ropeway.materials);
  });

  it('piazza un catalizzatore pagando una sola volta', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const state = createSimState();
    const result = placeCatalyst(state, map, 8, 8, BUILDING_CLASS.residential);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.catalysts).toHaveLength(1);
    expect(result.state.funds.stock).toBeLessThan(state.funds.stock);
  });

  it('rifiuta atomicamente terreno assente e catalizzatori troppo vicini', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const state = createSimState();
    const missing = placeCatalyst(state, map, 99, 99, BUILDING_CLASS.residential);
    expect(missing).toEqual({ success: false, reason: 'terrain-loading' });

    const first = placeCatalyst(state, map, 8, 8, BUILDING_CLASS.residential);
    if (!first.success) throw new Error('fixture non valida');
    const close = placeCatalyst(first.state, map, 10, 10, BUILDING_CLASS.residential);
    expect(close).toEqual({ success: false, reason: 'too-close' });
    expect(first.state.catalysts).toHaveLength(1);
    expect(catalystFailure(first.state, map, 10, 10, BUILDING_CLASS.residential)).toBe('too-close');
  });

  it('applica costi e prerequisiti delle policy senza mutare un rifiuto', () => {
    const state = createSimState();
    expect(togglePolicy(state, 'denseHousing')).toEqual({
      success: false,
      reason: 'population-required',
    });
    expect(state.policies).toEqual([]);
    expect(togglePolicy(state, 'austerity').success).toBe(true);
  });

  it('permette ruoli diversi della stessa classe e blocca policy incompatibili', () => {
    const map = coast();
    const port = placeCatalyst(createSimState(), map, SHORE_X, 32, 'port');
    if (!port.success) throw new Error('porto fixture non valido');
    expect(placeCatalyst(port.state, map, SHORE_X + 2, 34, 'factory').success).toBe(true);

    const base = createSimState();
    const funded = {
      ...base,
      population: { stock: 100, delta: 0 },
      funds: { stock: 2_000, delta: 0 },
    };
    const dense = togglePolicy(funded, 'denseHousing');
    if (!dense.success) throw new Error('policy fixture non valida');
    expect(togglePolicy(dense.state, 'greenBelt')).toEqual({
      success: false,
      reason: 'policy-incompatible',
    });
  });

  it('il porto vuole il fronte mare, e lo dice prima del click', () => {
    const map = coast();
    const state = { ...createSimState(), funds: { stock: 2_000, delta: 0 } };
    const inland = SHORE_X + 20;

    expect(catalystFailure(state, map, inland, 32, 'port')).toBe('needs-coast');
    expect(placeCatalyst(state, map, inland, 32, 'port')).toEqual({
      success: false,
      reason: 'needs-coast',
    });
    expect(catalystFailure(state, map, SHORE_X, 32, 'port')).toBeNull();
    // Il vincolo vale per il ruolo e non per il terreno: sulla stessa colonna
    // rifiutata al porto, un mercato entra senza discutere.
    expect(catalystFailure(state, map, inland, 32, 'market')).toBeNull();
  });

  it('l’aeroporto vuole una superficie, che la battigia non e’', () => {
    const map = coast();
    const state = { ...createSimState(), funds: { stock: 2_000, delta: 0 } };

    expect(catalystFailure(state, map, SHORE_X, 32, 'airport')).toBe('needs-open-ground');
    expect(catalystFailure(state, map, SHORE_X + 20, 32, 'airport')).toBeNull();
  });

  it('il vincolo di sito precede la distanza e i fondi', () => {
    const map = coast();
    const inland = SHORE_X + 20;
    const first = placeCatalyst(
      { ...createSimState(), funds: { stock: 2_000, delta: 0 } },
      map,
      SHORE_X,
      32,
      'port',
    );
    if (!first.success) throw new Error('porto fixture non valido');

    // Senza fondi e a due passi da un altro porto: il motivo che si legge resta
    // il luogo, perche' spostarsi di venti celle non risolverebbe niente.
    const broke = { ...first.state, funds: { stock: 0, delta: 0 } };
    expect(catalystFailure(broke, map, inland, 32, 'port')).toBe('needs-coast');
    expect(catalystFailure(broke, map, SHORE_X + 2, 32, 'port')).toBe('too-close');
  });

  it('blocca l’espansione prima della soglia di popolazione', () => {
    expect(buyExpansion(createSimState())).toEqual({
      success: false,
      reason: 'population-required',
    });
  });

  it('impedisce di pagare due volte lo stesso settore', () => {
    const base = createSimState();
    const state = {
      ...base,
      population: { stock: 100, delta: 0 },
      funds: { stock: 2_000, delta: 0 },
    };
    expect(buyExpansion(state, true)).toEqual({ success: false, reason: 'already-unlocked' });
    expect(state.funds.stock).toBe(2_000);
  });
});

/**
 * Il terreno non risponde piu' si'/no: risponde con un prezzo. Questi test
 * scrivono quota e pendenza a mano e leggono il conto, perche' e' li' che la
 * regola si vede — una mesa piana che prima veniva rifiutata senza spiegazione.
 */
describe('prezzo del terreno', () => {
  const listino = catalystById(defaultCatalystOfClass(BUILDING_CLASS.residential)).cost;

  /** Mesa: sopra `rockMinHeight`, quindi roccia, ma piatta come un tavolo. */
  function mesa(slope = 0) {
    return testTerrain({
      chunksX: 1,
      chunksY: 1,
      heightAt: () => TERRAIN.rockMinHeight + 5,
      slopeAt: () => slope,
    });
  }

  it('una mesa piana si costruisce, e si paga il sovrapprezzo della roccia', () => {
    const map = mesa();
    // Il bit del generatore la dichiara ancora non edificabile: e' esattamente
    // il giudizio che questa azione ha smesso di consultare.
    expect(map.isBuildable(8, 8)).toBe(false);

    const state = createSimState();
    const placed = placeCatalyst(state, map, 8, 8, BUILDING_CLASS.residential);
    expect(placed.success).toBe(true);
    if (!placed.success) return;

    const atteso = Math.round(listino * BUILD_WEIGHT.rock);
    expect(state.funds.stock - placed.state.funds.stock).toBe(atteso);
    expect(catalystSiteCost(map, 8, 8, BUILDING_CLASS.residential)?.cost).toBe(atteso);
  });

  it('la parete resta un rifiuto: e la pendenza a dirlo, non il bioma', () => {
    const wall = mesa(GRADING.maxTerraceSlope);
    expect(catalystFailure(createSimState(), wall, 8, 8, BUILDING_CLASS.residential))
      .toBe('not-buildable');
  });

  it('il prato paga il listino, senza arrotondamenti nascosti', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    expect(catalystSiteCost(map, 8, 8, BUILDING_CLASS.residential)?.cost).toBe(listino);
  });

  it('il sovrapprezzo entra anche nel controllo dei fondi', () => {
    const map = mesa();
    const povero = {
      ...createSimState(),
      funds: { stock: listino, delta: 0 },
    };
    expect(catalystFailure(povero, map, 8, 8, BUILDING_CLASS.residential))
      .toBe('insufficient-funds');
  });
});

describe('sito dell opera concessa da una decisione', () => {
  const sites = [{ x: 8, y: 8 }, { x: 40, y: 40 }];

  it('prende il primo candidato che il terreno regge', () => {
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    expect(grantSite(createSimState(), map, 'market', sites)).toEqual({ x: 8, y: 8 });
  });

  // L'opera non si paga: la citta' senza un soldo se la vede comparire lo
  // stesso, altrimenti l'alternativa che la concede sarebbe una promessa vuota
  // proprio quando la decisione e' stata presa per mancanza di fondi.
  it('non chiede fondi, perche il prezzo l ha gia pagato la decisione', () => {
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const broke = { ...createSimState(), funds: { stock: 0, delta: 0 } };
    expect(grantSite(broke, map, 'market', sites)).toEqual({ x: 8, y: 8 });
  });

  it('salta il candidato troppo vicino a un mercato che esiste gia', () => {
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const placed = placeCatalyst(createSimState(), map, 8, 8, 'market');
    if (!placed.success) throw new Error('piazzamento atteso');

    expect(grantSite(placed.state, map, 'market', sites)).toEqual({ x: 40, y: 40 });
  });

  it('senza nessun candidato valido rinuncia invece di inventarsi un posto', () => {
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    expect(grantSite(createSimState(), map, 'market', [])).toBeNull();
  });
});
