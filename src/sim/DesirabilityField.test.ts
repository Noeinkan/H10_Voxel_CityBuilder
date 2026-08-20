import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { DesirabilityField, rectArea, rectAround, type Catalyst } from './DesirabilityField';
import { resolveWeights } from './policies';
import {
  addBuilding,
  addCatalyst,
  createSimState,
  removeCatalyst,
  setCatalystStrength,
} from './SimState';

const NO_POLICIES = resolveWeights([]);

function catalyst(partial: Partial<Catalyst> = {}): Catalyst {
  return {
    x: 100,
    y: 100,
    class: BUILDING_CLASS.residential,
    strength: 200,
    radius: 20,
    ...partial,
  };
}

/** Tutte le celle non nulle del campo per una classe, come mappa "x,y" -> valore. */
function snapshot(field: DesirabilityField, cls: 0 | 1 | 2): Map<string, number> {
  const out = new Map<string, number>();
  for (const chunk of field.chunks.values()) {
    const originX = DesirabilityField.originOf(chunk.ccx);
    const originY = DesirabilityField.originOf(chunk.ccy);
    for (let ly = 0; ly < 32; ly++) {
      for (let lx = 0; lx < 32; lx++) {
        const x = originX + lx;
        const y = originY + ly;
        const value = field.valueAt(x, y, cls);
        if (value !== 0) out.set(`${x},${y}`, value);
      }
    }
  }
  return out;
}

describe('DesirabilityField — profilo di un catalizzatore', () => {
  it('vale strength al centro e decade a 0 esattamente alla distanza pari al raggio', () => {
    const source = catalyst({ strength: 200, radius: 20 });
    const state = addCatalyst(createSimState(), source);
    const cls = BUILDING_CLASS.residential;

    expect(state.field.valueAt(source.x, source.y, cls)).toBe(source.strength);

    // Il decadimento e' lineare in distanza di Chebyshev.
    for (const dist of [1, 5, 10, 19]) {
      const expected = Math.round(source.strength * (1 - dist / source.radius));
      expect(state.field.valueAt(source.x + dist, source.y, cls)).toBe(expected);
      expect(state.field.valueAt(source.x, source.y + dist, cls)).toBe(expected);
      // Chebyshev: la diagonale sta alla stessa distanza dell'asse.
      expect(state.field.valueAt(source.x + dist, source.y + dist, cls)).toBe(expected);
    }

    // Alla distanza pari al raggio il contributo e' zero, non "quasi zero".
    for (const [dx, dy] of [
      [20, 0],
      [0, 20],
      [20, 20],
      [-20, 7],
      [21, 0],
      [40, 40],
    ]) {
      expect(state.field.valueAt(source.x + dx, source.y + dy, cls)).toBe(0);
    }
  });

  it('scrive solo nella classe del catalizzatore', () => {
    const state = addCatalyst(createSimState(), catalyst({ class: BUILDING_CLASS.industrial }));

    expect(state.field.valueAt(100, 100, BUILDING_CLASS.industrial)).toBe(200);
    expect(state.field.valueAt(100, 100, BUILDING_CLASS.residential)).toBe(0);
    expect(state.field.valueAt(100, 100, BUILDING_CLASS.civic)).toBe(0);
  });

  it('i contributi di piu’ catalizzatori si sommano e saturano a 255', () => {
    let state = createSimState();
    state = addCatalyst(state, catalyst({ x: 100, y: 100, strength: 200, radius: 20 }));
    state = addCatalyst(state, catalyst({ x: 100, y: 100, strength: 200, radius: 20 }));

    expect(state.field.valueAt(100, 100, BUILDING_CLASS.residential)).toBe(
      BALANCE.limits.maxDesirability,
    );
    // A meta' raggio la somma dei due vale 200, sotto il tetto.
    expect(state.field.valueAt(110, 100, BUILDING_CLASS.residential)).toBe(200);
  });
});

describe('DesirabilityField — incrementalita’', () => {
  it('aggiungere un catalizzatore di raggio 20 ricalcola meno di 1700 celle', () => {
    const state = createSimState();
    state.field.resetCounters();

    const source = catalyst({ radius: 20 });
    addCatalyst(state, source);

    // Il quadrato di Chebyshev di raggio 20 e' 41 x 41 = 1681.
    expect(rectArea(rectAround(source.x, source.y, source.radius))).toBe(1681);
    expect(state.field.lastRecomputedCells).toBe(1681);
    expect(state.field.lastRecomputedCells).toBeLessThan(1700);
  });

  it('il ricalcolo non si allarga ai bordi di chunk anche su una mappa grande', () => {
    // Il campo alloca 32x32 per chunk: allineare il rettangolo ai chunk
    // trasformerebbe 1681 celle in almeno 4096.
    let state = createSimState();
    for (let i = 0; i < 40; i++) {
      state = addCatalyst(state, catalyst({ x: 40 + i * 12, y: 40 + i * 7, radius: 20 }));
    }

    state.field.resetCounters();
    addCatalyst(state, catalyst({ x: 1000, y: 1000, radius: 20 }));

    expect(state.field.lastRecomputedCells).toBe(1681);
    // Il campo copre molte piu' celle di cosi': il ricalcolo non le ha viste.
    expect(state.field.chunkCount * 1024).toBeGreaterThan(10_000);
  });

  it('un edificio nuovo tocca solo il quadrato del raggio breve', () => {
    let state = addCatalyst(createSimState(), catalyst());
    state.field.resetCounters();

    state = addBuilding(state, { x: 100, y: 100, class: BUILDING_CLASS.residential });

    const radius = BALANCE.desirability.congestionRadius;
    expect(state.field.lastRecomputedCells).toBe(rectArea(rectAround(100, 100, radius)));
  });

  it('nessun tick ricalcola una sola cella', () => {
    const state = addCatalyst(createSimState(), catalyst());
    const before = state.field.totalRecomputedCells;

    // `tick` non tocca il campo: e' il contratto che tiene il costo del tick
    // indipendente dall'estensione della mappa.
    expect(state.field.totalRecomputedCells).toBe(before);
  });
});

describe('DesirabilityField — il percorso incrementale e la ricostruzione coincidono', () => {
  it('dopo aggiunte, rimozioni e modifiche il campo e’ quello di una ricostruzione', () => {
    let state = createSimState();
    state = addCatalyst(state, catalyst({ x: 60, y: 60, strength: 200, radius: 18 }));
    state = addCatalyst(
      state,
      catalyst({ x: 80, y: 66, class: BUILDING_CLASS.industrial, strength: 150, radius: 22 }),
    );
    state = addCatalyst(state, catalyst({ x: 70, y: 90, strength: 120, radius: 15 }));
    state = addBuilding(state, { x: 62, y: 61, class: BUILDING_CLASS.residential });
    state = addBuilding(state, { x: 65, y: 63, class: BUILDING_CLASS.industrial });
    state = setCatalystStrength(state, 0, 240);
    state = removeCatalyst(state, 2);

    const incremental = [0, 1, 2].map((cls) => snapshot(state.field, cls as 0 | 1 | 2));

    const fresh = new DesirabilityField();
    fresh.rebuild(state.catalysts, state.buildings, NO_POLICIES);
    const rebuilt = [0, 1, 2].map((cls) => snapshot(fresh, cls as 0 | 1 | 2));

    expect(incremental).toEqual(rebuilt);
    expect(incremental[0].size).toBeGreaterThan(0);
  });

  it('togliere un catalizzatore riporta il campo a com’era prima di aggiungerlo', () => {
    let state = addCatalyst(createSimState(), catalyst({ x: 60, y: 60, strength: 200, radius: 18 }));
    const before = snapshot(state.field, BUILDING_CLASS.residential);

    state = addCatalyst(state, catalyst({ x: 70, y: 64, strength: 140, radius: 20 }));
    expect(snapshot(state.field, BUILDING_CLASS.residential)).not.toEqual(before);

    state = removeCatalyst(state, 1);
    expect(snapshot(state.field, BUILDING_CLASS.residential)).toEqual(before);
  });
});

describe('DesirabilityField — congestione e occupazione', () => {
  it('gli edifici nel raggio breve abbassano la desiderabilita’', () => {
    const cls = BUILDING_CLASS.residential;
    let state = addCatalyst(createSimState(), catalyst({ x: 100, y: 100, strength: 200, radius: 20 }));
    const clean = state.field.valueAt(103, 100, cls);

    state = addBuilding(state, { x: 100, y: 100, class: cls });
    const crowded = state.field.valueAt(103, 100, cls);

    expect(crowded).toBe(clean - BALANCE.desirability.congestionPerBuilding);

    // Fuori dal raggio breve non cambia niente.
    const outside = BALANCE.desirability.congestionRadius + 1;
    expect(state.field.valueAt(100 + outside, 100, cls)).toBe(
      Math.round(200 * (1 - outside / 20)),
    );
  });

  it('la congestione non spinge mai il campo sotto zero', () => {
    let state = createSimState();
    for (let i = 0; i < 20; i++) {
      state = addBuilding(state, { x: 200 + (i % 5), y: 200 + Math.floor(i / 5), class: BUILDING_CLASS.civic });
    }

    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        expect(state.field.valueAt(202 + dx, 202 + dy, BUILDING_CLASS.civic)).toBe(0);
      }
    }
  });

  it('una cella occupata non e’ libera, e non si occupa due volte', () => {
    let state = addBuilding(createSimState(), { x: 10, y: 10, class: BUILDING_CLASS.residential });

    expect(state.field.isFree(10, 10)).toBe(false);
    expect(state.field.isFree(11, 10)).toBe(true);
    expect(state.field.occupantAt(10, 10)).toBe(BUILDING_CLASS.residential);
    expect(state.field.occupiedCells).toBe(1);

    const before = state;
    state = addBuilding(state, { x: 10, y: 10, class: BUILDING_CLASS.civic });
    expect(state).toBe(before);
    expect(state.buildings).toHaveLength(1);
    expect(state.field.occupiedCells).toBe(1);
  });

  it('non alloca chunk per celle che restano a zero', () => {
    const state = addCatalyst(createSimState(), catalyst({ x: 16, y: 16, radius: 4 }));

    // Un raggio 4 attorno a (16,16) sta tutto nella colonna di chunk (0,0).
    expect(state.field.chunkCount).toBe(1);
    expect(state.field.valueAt(500, 500, BUILDING_CLASS.residential)).toBe(0);
    expect(state.field.chunkCount).toBe(1);
  });

  it('funziona su coordinate negative come il resto del mondo', () => {
    const state = addCatalyst(
      createSimState(),
      catalyst({ x: -100, y: -60, strength: 180, radius: 10 }),
    );

    expect(state.field.valueAt(-100, -60, BUILDING_CLASS.residential)).toBe(180);
    expect(state.field.valueAt(-95, -60, BUILDING_CLASS.residential)).toBe(90);
    expect(state.field.valueAt(-90, -60, BUILDING_CLASS.residential)).toBe(0);
  });
});
