import { afterEach, describe, expect, it, vi } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { FARM_KIND } from './farms';
import {
  addBuilding,
  addCatalyst,
  addFarm,
  createSimState,
  toSimStateData,
  type SimState,
} from './SimState';
import { testTerrain } from './testTerrain';
import { effectiveCount, tick, tickMany, weightsOf } from './tick';

/**
 * Configurazione di partenza standard: una citta' gia' avviata, 20 edifici.
 *
 * I sei campi non sono decorazione della fixture: dal momento in cui il cibo non
 * esce piu' dalla fabbrica, dodici case vogliono dodici case sfamate, cioe' sei
 * campi da due. E' il pareggio alimentare scritto in `BALANCE.farms`, ed e' il
 * motivo per cui questa citta' regge duemila tick invece di consumarsi.
 */
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
    state = addBuilding(state, { x: 40 + i * 3, y: 48, class: BUILDING_CLASS.industrial });
  }
  for (let i = 0; i < 3; i++) {
    state = addBuilding(state, { x: 40 + i * 3, y: 56, class: BUILDING_CLASS.civic });
  }
  for (let i = 0; i < 6; i++) state = addFarm(state, FARM_KIND.field);

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

  it('senza produttori di cibo la citta’ consuma la scorta e smette di crescere', () => {
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

  it('l’industria non sfama piu’ nessuno: senza lotti agricoli la scorta finisce comunque', () => {
    // E' la rottura voluta della 3.1. Prima di questa fase la stessa citta'
    // stava in pareggio — dieci fabbriche sfamavano dieci case — e adesso la
    // fabbrica fa solo materiali. Se un giorno questo test tornasse verde senza
    // che nessuno abbia piantato niente, il cibo e' rientrato nel termine
    // industriale da qualche parte.
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    let state = createSimState();
    for (let i = 0; i < 10; i++) {
      state = addBuilding(state, { x: 5 + i * 2, y: 5, class: BUILDING_CLASS.residential });
    }
    for (let i = 0; i < 10; i++) {
      state = addBuilding(state, { x: 5 + i * 2, y: 12, class: BUILDING_CLASS.industrial });
    }

    const late = tickMany(state, terrainMap, 4000);

    expect(late.food.stock).toBe(0);
    expect(late.materials.stock).toBeGreaterThan(0);
  });

  it('il pareggio alimentare e’ dichiarato: un campo sfama due case piene', () => {
    // La relazione che sostituisce `perProduction / perResident`. E' verificata
    // sul bilancio vero e non sulla tabella, cosi' resta vera anche se un giorno
    // cambia il modo in cui il tick arriva al raccolto.
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    const houses = 4;
    let state = createSimState();
    for (let i = 0; i < houses; i++) {
      state = addBuilding(state, { x: 5 + i * 2, y: 5, class: BUILDING_CLASS.residential });
    }
    for (let i = 0; i < houses / 2; i++) state = addFarm(state, FARM_KIND.field);

    // Popolazione esattamente a capacita': la domanda e' al suo massimo, e con
    // l'organico pieno il raccolto deve pareggiarla esattamente.
    //
    // A meta' primavera, perche' il listino e' una resa **all'anno medio** e la
    // stagione la scosta in entrambi i versi: il centro di primavera e' uno dei
    // due istanti in cui il moltiplicatore vale esattamente uno, quindi qui il
    // pareggio si legge secco. Che la media annua valga uno lo verifica
    // `seasons.test.ts`; questo test guarda il listino.
    state = {
      ...state,
      tickCount: BALANCE.seasons.yearTicks / 8,
      population: { stock: houses * BALANCE.weights.residentialCapacity, delta: 0 },
    };

    const before = state.food.stock;
    const after = tick(state, terrainMap);

    expect(after.food.stock).toBeCloseTo(before, 6);
  });

  it('una torre idroponica converte industria in cibo: piu’ raccolto, meno materiali', () => {
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    const base = (): SimState => {
      let state = createSimState();
      for (let i = 0; i < 8; i++) {
        state = addBuilding(state, { x: 5 + i * 2, y: 5, class: BUILDING_CLASS.residential });
      }
      return { ...state, population: { stock: 160, delta: 0 } };
    };

    let factories = base();
    let towers = base();
    for (let i = 0; i < 3; i++) {
      factories = addBuilding(factories, { x: 5 + i * 2, y: 12, class: BUILDING_CLASS.industrial });
      towers = addBuilding(towers, {
        x: 5 + i * 2,
        y: 12,
        class: BUILDING_CLASS.industrial,
        specialization: 'farming',
      });
    }

    // Stesso uso del suolo: la torre e' industria, e conta come tale.
    expect(towers.buildingCounts[BUILDING_CLASS.industrial])
      .toBe(factories.buildingCounts[BUILDING_CLASS.industrial]);
    expect(towers.farmCounts[FARM_KIND.tower]).toBe(3);

    const withFactories = tick(factories, terrainMap);
    const withTowers = tick(towers, terrainMap);

    expect(withTowers.food.stock).toBeGreaterThan(withFactories.food.stock);
    expect(withTowers.materials.stock).toBeLessThan(withFactories.materials.stock);
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

/**
 * I referti di soddisfazione e terra: il tick li persiste, e chi li legge non
 * deve rifare il conto.
 */
describe('tick — i referti di soddisfazione e terra', () => {
  it('la quota converge verso il bersaglio del proprio referto', () => {
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    const state = standardCity();

    const after = tick(state, terrainMap);

    const expected = Math.min(1, Math.max(0,
      state.satisfaction
        + (after.satisfactionReport.target - state.satisfaction) * BALANCE.satisfaction.inertia,
    ));
    expect(after.satisfaction).toBeCloseTo(expected);
    expect(after.satisfactionReport.target).toBeGreaterThanOrEqual(0);
    expect(after.satisfactionReport.target).toBeLessThanOrEqual(1);
  });

  it('l occupazione del referto e quella del bilancio coincidono', () => {
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    const state = standardCity();
    const capacity = effectiveCount(state, BUILDING_CLASS.residential)
      * weightsOf(state).residentialCapacity;

    const after = tick(state, terrainMap);

    expect(after.satisfactionReport.occupancy).toBeCloseTo(
      Math.min(BALANCE.satisfaction.maxOccupancy, state.population.stock / capacity),
    );
  });

  it('il fattore di terra e la quota di colonne edificabili che resta', () => {
    const cramped = testTerrain({
      chunksX: 8,
      chunksY: 8,
      buildable: (x, y) => x < 6 && y < 5,
    });
    const state = standardCity();

    const after = tick(state, cramped);

    const buildable = Math.max(1, cramped.buildableCount);
    expect(after.landFactor).toBeCloseTo(
      Math.min(1, Math.max(0, 1 - (state.buildings.length / buildable) * BALANCE.population.landPressure)),
    );
    expect(after.landFactor).toBeGreaterThanOrEqual(0);
    expect(after.landFactor).toBeLessThanOrEqual(1);
  });

  it('i referti sopravvivono al giro in JSON', () => {
    const terrainMap = testTerrain({ chunksX: 4, chunksY: 4 });
    const after = tickMany(standardCity(), terrainMap, 12);

    const revived = JSON.parse(JSON.stringify(toSimStateData(after)));
    expect(revived.satisfactionReport).toEqual(after.satisfactionReport);
    expect(revived.landFactor).toBe(after.landFactor);
  });
});

/**
 * Il fronte dell'emergenza alimentare: cosa lo riarma e cosa no.
 *
 * Riarmarlo vuol dire «la carestia si puo' dichiarare di nuovo», e la domanda e'
 * sempre la stessa: la citta' ha risolto in un modo che regge il tick successivo
 * **senza** una decisione nuova? Il raccolto si', una dotazione no.
 */
describe('tick — il fronte dell’emergenza', () => {
  const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });

  /**
   * Una citta' disarmata che raccoglie il 90% di cio' che mangia, con la dispensa
   * piena di roba che non ha coltivato. Due campi su dodici case: sotto il
   * pareggio, e la scorta e' li' apposta perche' non deve contare.
   */
  function starving(): SimState {
    return {
      ...standardCity(),
      population: { stock: 100, delta: 0 },
      farmCounts: [2, 0, 0],
      food: { stock: 10_000, delta: 0 },
      supplyArmed: false,
    };
  }

  it('non si riarma su una dispensa piena che nessuno ha raccolto', () => {
    expect(tick(starving(), terrainMap).supplyArmed).toBe(false);
  });

  /**
   * Una citta' che **compra** il proprio cibo l'ha risolto davvero, e senza questo
   * termine non riarmerebbe mai: il giorno in cui i fondi finissero, l'emergenza
   * non tornerebbe piu' a suonare. Si somma la portata del collegamento e non
   * quanto e' passato davvero, che dipende da quanto c'e' gia' in dispensa.
   */
  it('un collegamento con l’esterno riarma quello che il raccolto non copre', () => {
    const connected = addCatalyst({ ...starving(), tradeMode: 'foodImports' }, {
      x: 40,
      y: 40,
      kind: 'port',
      class: BUILDING_CLASS.industrial,
      strength: 190,
      radius: 24,
    });
    const withAirport = addCatalyst(connected, {
      x: 88,
      y: 40,
      kind: 'airport',
      class: BUILDING_CLASS.commercial,
      strength: 190,
      radius: 24,
    });

    expect(tick(withAirport, terrainMap).supplyArmed).toBe(true);
  });

  /**
   * Il fronte guarda la campagna, non il mese che fa.
   *
   * E' il vincolo che la 8.4 non negozia: la resa stagionale scende sotto il
   * pareggio ogni inverno per costruzione, quindi un fronte che leggesse il
   * raccolto di oggi si disarmerebbe e riarmerebbe una volta l'anno senza che
   * nessuno abbia fatto niente — e la carestia tornerebbe a essere un
   * appuntamento invece che una conseguenza.
   */
  it('si riarma in inverno come in estate: legge la campagna, non la stagione', () => {
    const provisioned: SimState = { ...starving(), farmCounts: [40, 0, 0] };
    const year = BALANCE.seasons.yearTicks;

    for (const phase of [0, 0.125, 0.375, 0.625, 0.875]) {
      const moment = { ...provisioned, tickCount: Math.round(year * phase) };
      expect(tick(moment, terrainMap).supplyArmed, `fase ${phase}`).toBe(true);
    }
  });

  /** E la resa, quella si', deve sentire la stagione: e' l'altra meta'. */
  it('la stessa citta raccoglie di piu in estate che in inverno', () => {
    const provisioned: SimState = { ...starving(), farmCounts: [40, 0, 0] };
    const year = BALANCE.seasons.yearTicks;

    const summer = tick({ ...provisioned, tickCount: Math.round(year * 0.375) }, terrainMap);
    const winter = tick({ ...provisioned, tickCount: Math.round(year * 0.875) }, terrainMap);

    const grownIn = (state: SimState) => state.harvest.grown.reduce((sum, v) => sum + v, 0);
    expect(grownIn(summer)).toBeGreaterThan(grownIn(winter));
    // E i due si scostano dall'anno medio dello stesso tanto, nei due versi.
    const spring = tick({ ...provisioned, tickCount: Math.round(year * 0.125) }, terrainMap);
    expect(grownIn(summer) - grownIn(spring)).toBeCloseTo(grownIn(spring) - grownIn(winter), 6);
  });
});
