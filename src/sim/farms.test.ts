import { describe, expect, it } from 'vitest';
import { BALANCE, FOOD_PER_HOUSE } from './balance';
import { BUILDING_CLASS } from './classes';
import {
  ALL_FARM_KINDS,
  FARM_COUNT,
  FARM_KIND,
  FARM_NAMES,
  farmUpkeepOf,
  farmWorkersOf,
  foodDeficitOf,
  foodYieldOf,
  isFarmKind,
  missingPlotsFor,
  missingPlotsOf,
} from './farms';
import {
  addBuilding,
  addFarm,
  createSimState,
  removeBuildings,
  removeFarm,
  reviveSimState,
  toSimStateData,
} from './SimState';

/** Contatori nudi, per provare le funzioni pure senza costruire uno stato. */
function counts(field = 0, orchard = 0, tower = 0): readonly number[] {
  return [field, orchard, tower];
}

describe('farms — vocabolario', () => {
  it('gli indici, i nomi e le etichette hanno la stessa lunghezza', () => {
    expect(FARM_COUNT).toBe(3);
    expect(FARM_NAMES).toHaveLength(FARM_COUNT);
    expect(ALL_FARM_KINDS).toHaveLength(FARM_COUNT);
    expect(BALANCE.farms).toHaveLength(FARM_COUNT);
  });

  it('ALL_FARM_KINDS e’ in ordine di indice', () => {
    expect(ALL_FARM_KINDS).toEqual([FARM_KIND.field, FARM_KIND.orchard, FARM_KIND.tower]);
  });

  it('isFarmKind rifiuta quello che non e’ un indice valido', () => {
    expect(isFarmKind(FARM_KIND.tower)).toBe(true);
    expect(isFarmKind(FARM_COUNT)).toBe(false);
    expect(isFarmKind(-1)).toBe(false);
    expect(isFarmKind(1.5)).toBe(false);
  });
});

describe('farms — listino', () => {
  it('il listino e’ in case sfamate: un campo ne vale due, una torre sei', () => {
    // E' la relazione 1:1 che ha preso il posto di `perProduction / perResident`.
    // Verificata sul prodotto, cosi' cambiare `residentialCapacity` la muove
    // invece di romperla.
    expect(foodYieldOf(counts(1), 1)).toBeCloseTo(2 * FOOD_PER_HOUSE, 12);
    expect(foodYieldOf(counts(0, 1), 1)).toBeCloseTo(1 * FOOD_PER_HOUSE, 12);
    expect(foodYieldOf(counts(0, 0, 1), 1)).toBeCloseTo(6 * FOOD_PER_HOUSE, 12);
  });

  it('FOOD_PER_HOUSE e’ derivato, non un letterale', () => {
    expect(FOOD_PER_HOUSE)
      .toBeCloseTo(BALANCE.weights.residentialCapacity * BALANCE.food.perResident, 12);
  });

  it('un campo senza braccia non raccoglie', () => {
    expect(foodYieldOf(counts(4), 0)).toBe(0);
    expect(foodYieldOf(counts(4), 0.5)).toBeCloseTo(foodYieldOf(counts(4), 1) / 2, 12);
  });

  it('i contatori si sommano invece di sovrapporsi', () => {
    const mixed = foodYieldOf(counts(2, 3, 1), 1);
    const apart = foodYieldOf(counts(2), 1) +
      foodYieldOf(counts(0, 3), 1) +
      foodYieldOf(counts(0, 0, 1), 1);
    expect(mixed).toBeCloseTo(apart, 12);
  });

  it('solo la torre costa fondi per tick', () => {
    expect(farmUpkeepOf(counts(10, 10))).toBe(0);
    expect(farmUpkeepOf(counts(0, 0, 1))).toBeGreaterThan(0);
  });

  it('le braccia si contano su tutti e tre', () => {
    expect(farmWorkersOf(counts(1))).toBe(BALANCE.farms[FARM_KIND.field].workers);
    expect(farmWorkersOf(counts(0, 0, 2))).toBe(2 * BALANCE.farms[FARM_KIND.tower].workers);
  });

  it('un contatore vuoto o assente vale zero e non NaN', () => {
    expect(foodYieldOf([], 1)).toBe(0);
    expect(farmWorkersOf([])).toBe(0);
    expect(farmUpkeepOf([])).toBe(0);
  });
});

describe('farms — deficit', () => {
  it('e’ zero in pareggio e positivo in carenza', () => {
    const houses = 4;
    const population = houses * BALANCE.weights.residentialCapacity;
    // Due campi sfamano quattro case: pareggio esatto.
    expect(foodDeficitOf(population, counts(2), 1)).toBeCloseTo(0, 12);
    expect(foodDeficitOf(population, counts(1), 1)).toBeGreaterThan(0);
  });

  it('non scende mai sotto zero: il surplus non e’ un deficit negativo', () => {
    expect(foodDeficitOf(10, counts(50), 1)).toBe(0);
  });
});

describe('farms — il piano di chi pianta', () => {
  const houses = 4;
  const population = houses * BALANCE.weights.residentialCapacity;

  /**
   * Il piano non e' il deficit, e la differenza e' una dispensa.
   *
   * Al pareggio secco `foodDeficitOf` vale zero — ed e' giusto, e' un fatto — ma
   * una citta' che punta al pareggio tiene lo stock a **zero per costruzione**: il
   * raccolto pareggia il pasto e non avanza niente. Da li' ogni oscillazione e'
   * carestia, ed era la ragione per cui la HUD mostrava FOOD 0 a citta' sana.
   */
  it('punta sopra il pareggio, dove il deficit e’ gia’ zero', () => {
    expect(foodDeficitOf(population, counts(2), 1)).toBeCloseTo(0, 12);
    expect(missingPlotsOf(population, counts(2), 1)).toBeGreaterThan(0);
    // Il margine e' un margine, non una riserva senza fondo: un campo basta.
    expect(missingPlotsOf(population, counts(3), 1)).toBe(0);
  });

  /**
   * La stima si fa con le braccia che la citta' ha, non con quelle che vorrebbe.
   * Il driver passava `1` scritto a mano: una citta' a meta' organico raccoglieva
   * la meta' di cio' per cui aveva piantato e si fermava credendosi in pareggio.
   */
  it('con meno braccia chiede piu’ lotti', () => {
    const full = missingPlotsOf(population, counts(2), 1);
    const half = missingPlotsOf(population, counts(2), 0.5);

    expect(half).toBeGreaterThan(full);
  });

  it('legge l’organico dallo stato, senza farselo passare', () => {
    const base = { population: { stock: population }, farmCounts: counts(2) };

    expect(missingPlotsFor({ ...base, staffing: 0.5 }))
      .toBe(missingPlotsOf(population, counts(2), 0.5));
    expect(missingPlotsFor({ ...base, staffing: 1 }))
      .toBe(missingPlotsOf(population, counts(2), 1));
  });
});

/**
 * Un frutteto rende meta' di un campo: e' il suo prezzo, e sta nella **terra**.
 * Con tre braccia ne pagava anche un secondo — 0,4 di cibo per braccio contro
 * 0,6 — cioe' era peggiore su tutti gli assi, e il mandato `communityGardens`,
 * che spinge verso il frutteto, peggiorava il raccolto due volte.
 */
describe('farms — il frutteto non e’ un declassamento', () => {
  it('rende come un campo per braccio impiegato', () => {
    const perWorker = (kind: number): number =>
      foodYieldOf(counts(kind === FARM_KIND.field ? 1 : 0, kind === FARM_KIND.orchard ? 1 : 0), 1) /
      BALANCE.farms[kind].workers;

    expect(perWorker(FARM_KIND.orchard)).toBeCloseTo(perWorker(FARM_KIND.field), 12);
  });

  it('ma costa il doppio della terra per lo stesso raccolto', () => {
    expect(foodYieldOf(counts(0, 2), 1)).toBeCloseTo(foodYieldOf(counts(1), 1), 12);
  });
});

describe('farms — porte dello stato', () => {
  it('addFarm incrementa il contatore giusto e lascia il resto fermo', () => {
    const before = createSimState();
    const after = addFarm(addFarm(before, FARM_KIND.field), FARM_KIND.orchard);

    expect(after.farmCounts[FARM_KIND.field]).toBe(1);
    expect(after.farmCounts[FARM_KIND.orchard]).toBe(1);
    expect(after.farmCounts[FARM_KIND.tower]).toBe(0);
    expect(after.buildingCounts).toEqual(before.buildingCounts);
    expect(after.buildings).toEqual(before.buildings);
  });

  it('non muta lo stato in ingresso', () => {
    const before = createSimState();
    const snapshot = [...before.farmCounts];
    addFarm(before, FARM_KIND.field);
    expect([...before.farmCounts]).toEqual(snapshot);
  });

  it('la torre non passa da addFarm: la registra addBuilding col suo volume', () => {
    const state = addFarm(createSimState(), FARM_KIND.tower);
    expect(state.farmCounts[FARM_KIND.tower]).toBe(0);
  });

  it('removeFarm scende ma non sotto zero', () => {
    const planted = addFarm(createSimState(), FARM_KIND.field);
    const cleared = removeFarm(planted, FARM_KIND.field);
    expect(cleared.farmCounts[FARM_KIND.field]).toBe(0);
    // Un contatore gia' a zero resta lo stesso oggetto: niente da fare, niente
    // da allocare.
    expect(removeFarm(cleared, FARM_KIND.field)).toBe(cleared);
  });

  it('una torre conta due volte: come industria e come produttore', () => {
    const state = addBuilding(createSimState(), {
      x: 10,
      y: 10,
      class: BUILDING_CLASS.industrial,
      specialization: 'farming',
    });

    expect(state.buildingCounts[BUILDING_CLASS.industrial]).toBe(1);
    expect(state.farmCounts[FARM_KIND.tower]).toBe(1);
  });

  it('una fabbrica normale non tocca i contatori agricoli', () => {
    const state = addBuilding(createSimState(), {
      x: 10,
      y: 10,
      class: BUILDING_CLASS.industrial,
    });
    expect(state.farmCounts[FARM_KIND.tower]).toBe(0);
  });

  it('sventrare una torre disfa esattamente cio’ che era stato contato', () => {
    const tower = { x: 10, y: 10, class: BUILDING_CLASS.industrial, specialization: 'farming' } as const;
    const built = addBuilding(createSimState(), tower);
    const razed = removeBuildings(built, [tower]);

    expect(razed.buildingCounts[BUILDING_CLASS.industrial]).toBe(0);
    expect(razed.farmCounts[FARM_KIND.tower]).toBe(0);
  });
});

describe('farms — serializzazione', () => {
  it('i contatori sopravvivono al giro in JSON', () => {
    let state = createSimState();
    state = addFarm(state, FARM_KIND.field);
    state = addFarm(state, FARM_KIND.orchard);
    state = addBuilding(state, {
      x: 20,
      y: 20,
      class: BUILDING_CLASS.industrial,
      specialization: 'farming',
    });

    const data = toSimStateData(state);
    const revived = reviveSimState(JSON.parse(JSON.stringify(data)) as typeof data);

    expect([...revived.farmCounts]).toEqual([...state.farmCounts]);
  });

  it('un salvataggio senza farmCounts ricostruisce le torri e azzera i lotti', () => {
    // I lotti non sono edifici e non stanno nella lista: a ripopolare il
    // contatore e' il driver del mondo, non questa funzione. Le torri invece
    // sono nella lista, quindi tornano.
    let state = createSimState();
    state = addFarm(state, FARM_KIND.field);
    state = addBuilding(state, {
      x: 20,
      y: 20,
      class: BUILDING_CLASS.industrial,
      specialization: 'farming',
    });

    const { farmCounts: _dropped, ...legacy } = toSimStateData(state);
    const revived = reviveSimState(legacy as ReturnType<typeof toSimStateData>);

    expect(revived.farmCounts[FARM_KIND.tower]).toBe(1);
    expect(revived.farmCounts[FARM_KIND.field]).toBe(0);
  });
});
