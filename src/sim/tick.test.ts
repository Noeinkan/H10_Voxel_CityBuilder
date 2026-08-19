import { afterEach, describe, expect, it, vi } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { addBuilding, addCatalyst, createSimState, toSimStateData, type SimState } from './SimState';
import { testTerrain } from './testTerrain';
import { tick, tickMany } from './tick';

/** Configurazione di partenza standard: una citta' gia' avviata, 20 edifici. */
function standardCity(): SimState {
  let state = createSimState();
  state = addCatalyst(state, {
    x: 64,
    y: 64,
    class: BUILDING_CLASS.residential,
    strength: 220,
    radius: 24,
  });

  for (let i = 0; i < 12; i++) {
    state = addBuilding(state, { x: 40 + i * 3, y: 40, class: BUILDING_CLASS.residential });
  }
  for (let i = 0; i < 5; i++) {
    state = addBuilding(state, { x: 40 + i * 3, y: 48, class: BUILDING_CLASS.production });
  }
  for (let i = 0; i < 3; i++) {
    state = addBuilding(state, { x: 40 + i * 3, y: 56, class: BUILDING_CLASS.civic });
  }

  return state;
}

const STOCKS = ['population', 'food', 'materials', 'funds'] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tick — determinismo', () => {
  it('1000 tick dallo stesso stato iniziale danno sempre lo stesso stato finale', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });

    const first = tickMany(standardCity(), terrainMap, 1000);
    const second = tickMany(standardCity(), terrainMap, 1000);

    expect(toSimStateData(first)).toEqual(toSimStateData(second));
    expect(first.tickCount).toBe(1000);
    expect(first.population.stock).toBeGreaterThan(0);
  });

  it('non legge Math.random ne’ Date.now', () => {
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    const random = vi.spyOn(Math, 'random');
    const now = vi.spyOn(Date, 'now');

    tickMany(standardCity(), terrainMap, 200);

    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it('il rumore viene dal seed dello stato: seed diversi divergono', () => {
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });

    const a = tickMany(standardCity(), terrainMap, 50);
    const b = tickMany(
      { ...standardCity(), rngState: 0x1234_5678 },
      terrainMap,
      50,
    );

    expect(a.population.stock).not.toBe(b.population.stock);
    // Ma restano entrambi nello stesso ordine di grandezza: il rumore e' rumore.
    expect(Math.abs(a.population.stock - b.population.stock)).toBeLessThan(
      a.population.stock * 0.2,
    );
  });

  it('non muta lo stato in ingresso', () => {
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    const state = standardCity();
    const before = structuredClone(toSimStateData(state));

    const after = tick(state, terrainMap);

    expect(toSimStateData(state)).toEqual(before);
    expect(after).not.toBe(state);
    expect(after.population).not.toBe(state.population);
    // Il campo non e' toccato dal tick, quindi viaggia per riferimento.
    expect(after.field).toBe(state.field);
  });
});

describe('tick — invarianti sugli stock', () => {
  it('in 10000 tick nessuno stock diventa negativo o NaN', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
    let state = standardCity();

    // Le violazioni si raccolgono e si asseriscono una volta sola: sessantamila
    // `expect` dentro il ciclo costerebbero piu' dei diecimila tick stessi.
    const violations: string[] = [];
    for (let i = 0; i < 10_000; i++) {
      state = tick(state, terrainMap);
      for (const key of STOCKS) {
        const { stock, delta } = state[key];
        if (!Number.isFinite(stock)) violations.push(`tick ${i}: ${key}.stock = ${stock}`);
        if (!Number.isFinite(delta)) violations.push(`tick ${i}: ${key}.delta = ${delta}`);
        if (stock < 0) violations.push(`tick ${i}: ${key}.stock negativo (${stock})`);
      }
      if (!(state.satisfaction >= 0 && state.satisfaction <= 1)) {
        violations.push(`tick ${i}: satisfaction fuori da [0,1] (${state.satisfaction})`);
      }
    }

    expect(violations).toEqual([]);
    expect(state.tickCount).toBe(10_000);
  });

  it('regge 10000 tick anche senza edifici, senza cibo e senza fondi', () => {
    const terrainMap = testTerrain({ chunksX: 2, chunksY: 2 });
    let state: SimState = {
      ...createSimState(),
      food: { stock: 0, delta: 0 },
      funds: { stock: 0, delta: 0 },
      materials: { stock: 0, delta: 0 },
      population: { stock: 500, delta: 0 },
    };

    state = tickMany(state, terrainMap, 10_000);

    for (const key of STOCKS) {
      expect(Number.isFinite(state[key].stock)).toBe(true);
      expect(state[key].stock).toBeGreaterThanOrEqual(0);
    }
    // Senza case ne' cibo la citta' si svuota. Il decadimento e' esponenziale,
    // quindi si avvicina a zero senza toccarlo: cio' che conta e' che non lo
    // scavalchi mai.
    expect(state.population.stock).toBeLessThan(1e-6);
  });

  it('regge una citta’ di soli edifici civici che finisce i fondi', () => {
    const terrainMap = testTerrain({ chunksX: 2, chunksY: 2 });
    let state = createSimState();
    for (let i = 0; i < 30; i++) {
      state = addBuilding(state, { x: 5 + i, y: 5, class: BUILDING_CLASS.civic });
    }

    state = tickMany(state, terrainMap, 2000);

    expect(state.funds.stock).toBe(0);
    expect(state.funds.stock).toBeGreaterThanOrEqual(0);
    expect(state.satisfaction).toBeGreaterThanOrEqual(0);
  });

  it('delta e’ la differenza rispetto al tick precedente', () => {
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    const before = tickMany(standardCity(), terrainMap, 20);
    const after = tick(before, terrainMap);

    for (const key of STOCKS) {
      expect(after[key].delta).toBeCloseTo(after[key].stock - before[key].stock, 12);
    }
  });
});

describe('tick — bilancio', () => {
  it('una scelta iniziale imperfetta lascia tempo e popolazione per recuperare', () => {
    const terrainMap = testTerrain({ chunksX: 2, chunksY: 2 });
    let state = createSimState();
    for (let i = 0; i < 3; i++) {
      state = addBuilding(state, { x: 5 + i * 4, y: 5, class: BUILDING_CLASS.residential });
    }
    state = {
      ...state,
      population: { stock: 60, delta: 0 },
      food: { stock: 0, delta: 0 },
    };

    const afterTwentySeconds = tickMany(state, terrainMap, 200);

    expect(afterTwentySeconds.population.stock).toBeGreaterThan(35);
    expect(afterTwentySeconds.population.delta).toBeLessThan(0);
  });

  it('la popolazione converge alla capacita’ residenziale e non la supera', () => {
    const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
    const state = tickMany(standardCity(), terrainMap, 2000);

    const capacity = state.buildingCounts[BUILDING_CLASS.residential] * BALANCE.weights.residentialCapacity;
    expect(state.population.stock).toBeLessThanOrEqual(capacity);
    expect(state.population.stock).toBeGreaterThan(capacity * 0.5);
  });

  it('senza edifici produttivi la citta’ consuma il cibo e smette di crescere', () => {
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    let state = createSimState();
    for (let i = 0; i < 20; i++) {
      state = addBuilding(state, { x: 5 + i, y: 5, class: BUILDING_CLASS.residential });
    }

    const early = tickMany(state, terrainMap, 100);
    const late = tickMany(early, terrainMap, 3000);

    expect(late.food.stock).toBe(0);
    expect(late.population.stock).toBeLessThan(early.population.stock);
  });

  it('l’isola satura frena la crescita: le colonne edificabili entrano nel bilancio', () => {
    // Stessa citta', due isole: una grande e una in cui gli edifici pesano quasi
    // quanto tutte le colonne edificabili disponibili.
    const roomy = testTerrain({ chunksX: 8, chunksY: 8 });
    const cramped = testTerrain({
      chunksX: 8,
      chunksY: 8,
      buildable: (x, y) => x < 6 && y < 5,
    });

    const onRoomy = tickMany(standardCity(), roomy, 60);
    const onCramped = tickMany(standardCity(), cramped, 60);

    expect(onCramped.population.stock).toBeLessThan(onRoomy.population.stock);
  });
});
