import { describe, expect, it } from 'vitest';
import {
  addCatalyst,
  BALANCE,
  BUILDING_CLASS,
  catalystById,
  createSimState,
  EMPTY_HARVEST,
  type SimState,
} from '../sim';
import {
  coachSuggestion,
  coachSuggestions,
  type CoachContext,
  type CoachLandmark,
} from './coach';

const POPULATION = 400;

/** I tre ruoli del tutorial, senza edifici: il punto da cui una partita parte. */
function founded(): SimState {
  let state = createSimState();
  for (const [index, id] of (['market', 'factory', 'park'] as const).entries()) {
    state = addCatalyst(state, {
      x: index * 40,
      y: 0,
      class: catalystById(id).class,
      kind: id,
      strength: 200,
      radius: 12,
    });
  }
  return state;
}

/** Cibo servito per una frazione della domanda: e' `eaten` scritto dal referto. */
function fedAt(population: number, share: number): SimState['harvest'] {
  const eaten = population * BALANCE.food.perResident * share;
  return { ...EMPTY_HARVEST, grown: [eaten, 0, 0], eaten };
}

/** Una citta' che funziona: sfamata e con la dispensa piena. */
function city(overrides: Partial<SimState> = {}): SimState {
  return {
    ...founded(),
    population: { stock: POPULATION, delta: 1 },
    harvest: fedAt(POPULATION, 1),
    food: { stock: 500, delta: 1 },
    materials: { stock: 200, delta: 1 },
    funds: { stock: 0, delta: 0 },
    ...overrides,
  };
}

function context(state: SimState, overrides: Partial<CoachContext> = {}): CoachContext {
  return {
    state,
    tallestLevel: 0,
    hasArcology: false,
    clearing: false,
    arcologyNear: false,
    hasAloftLandmark: false,
    aerial: { terraces: 0, routes: 0, lifts: 0, piers: 0, stacked: 0 },
    spans: 0,
    ropeways: 0,
    landmarks: [],
    ...overrides,
  };
}

describe('coach — il cibo', () => {
  it('propone la serra a una citta’ che mangia piu’ di quanto produce', () => {
    const state = city({ harvest: fedAt(POPULATION, 0.6) });
    const tip = coachSuggestion(context(state));
    expect(tip?.id).toBe('coach-food');
    expect(tip?.message).toContain('Greenhouse');
  });

  it('tace a zero abitanti anche con il referto vuoto', () => {
    const state = founded();
    expect(coachSuggestion(context(state))?.tier).not.toBe('food');
  });

  it('tace quando la citta’ e’ sfamata', () => {
    const state = city({ harvest: fedAt(POPULATION, 1) });
    expect(coachSuggestion(context(state))?.tier).not.toBe('food');
  });
});

describe('coach — le connessioni', () => {
  it('propone il porto a chi puo’ permetterselo e non ha collegamenti', () => {
    const cost = catalystById('port').cost;
    const state = city({ funds: { stock: cost, delta: 1 } });
    expect(coachSuggestion(context(state))?.id).toBe('coach-port');
  });

  it('dice a chi ha un molo solo che gliene manca un secondo', () => {
    const state = addCatalyst(city(), {
      x: 200, y: 0, class: catalystById('ferry').class, kind: 'ferry', strength: 180, radius: 12,
    });
    const tip = coachSuggestion(context(state));
    expect(tip?.id).toBe('coach-ferry-pair');
    expect(tip?.highlight).not.toBeNull();
  });

  it('tace a chi non puo’ ancora permettersi il porto', () => {
    const state = city({ funds: { stock: 10, delta: 0 } });
    expect(coachSuggestion(context(state))?.id).not.toBe('coach-port');
  });
});

describe('coach — l’identita’', () => {
  it('propone il primo landmark di identita’ quando manca', () => {
    const state = city();
    const tip = coachSuggestion(context(state));
    expect(tip?.id).toBe('coach-identity');
    expect(tip?.message).toContain('University');
  });

  it('tace quando un catalizzatore di identita’ c’e’ gia’', () => {
    const state = addCatalyst(city(), {
      x: 300, y: 0, class: catalystById('university').class, kind: 'university',
      strength: 200, radius: 12,
    });
    expect(coachSuggestion(context(state))?.tier).not.toBe('identity');
  });
});

describe('coach — i distretti', () => {
  it('con due catalizzatori e zero usi misti propone di sovrapporre i campi', () => {
    const state = addCatalyst(city(), {
      x: 300, y: 0, class: catalystById('university').class, kind: 'university',
      strength: 200, radius: 12,
    });
    const tip = coachSuggestion(context(state));
    expect(tip?.id).toBe('coach-overlap');
    expect(tip?.message).toContain('overlap');
  });

  it('con gli usi misti avviati propone una coppia non ancora provata', () => {
    const state = addCatalyst(city(), {
      x: 300, y: 0, class: catalystById('university').class, kind: 'university',
      strength: 200, radius: 12,
    });
    const mixed = [...state.mixedCounts];
    mixed[BUILDING_CLASS.residential] = 1;
    const tip = coachSuggestion(context({ ...state, mixedCounts: mixed }));
    expect(tip?.tier).toBe('district');
    expect(tip?.id).not.toBe('coach-overlap');
    expect(tip?.highlight).not.toBeNull();
  });

  it('con un solo catalizzatore non parla di sovrapposizione', () => {
    const state = createSimState();
    const lone = addCatalyst(state, {
      x: 0, y: 0, class: catalystById('market').class, kind: 'market', strength: 200, radius: 12,
    });
    expect(coachSuggestion(context(lone))?.id).not.toBe('coach-overlap');
  });
});

describe('coach — gli stadi', () => {
  it('dice quanto manca a un landmark quasi cresciuto', () => {
    const landmark: CoachLandmark = {
      kind: 'market', x: 0, y: 0, stage: 1, nextAt: 16, nearby: 12,
    };
    const tip = coachSuggestion(context(city(), { landmarks: [landmark] }));
    expect(tip?.id).toBe('coach-stage-market');
    expect(tip?.message).toContain('4 more');
    expect(tip?.grow?.nextAt).toBe(16);
    expect(tip?.grow?.nearby).toBe(12);
  });

  it('non compare per un landmark al massimo stadio', () => {
    const landmark: CoachLandmark = {
      kind: 'market', x: 0, y: 0, stage: 3, nextAt: null, nearby: 40,
    };
    expect(coachSuggestion(context(city(), { landmarks: [landmark] }))?.tier).not.toBe('stage');
  });

  it('non parla di un landmark ancora lontano dalla soglia', () => {
    const landmark: CoachLandmark = {
      kind: 'market', x: 0, y: 0, stage: 1, nextAt: 32, nearby: 4,
    };
    expect(coachSuggestion(context(city(), { landmarks: [landmark] }))?.tier).not.toBe('stage');
  });
});

describe('coach — la priorita’', () => {
  it('una citta’ affamata ma senza connessioni chiede prima il cibo', () => {
    const state = city({
      harvest: fedAt(POPULATION, 0.5),
      funds: { stock: catalystById('port').cost, delta: 1 },
    });
    expect(coachSuggestion(context(state))?.id).toBe('coach-food');
  });

  it('una citta’ sana senza connessioni chiede il porto', () => {
    const state = city({ funds: { stock: catalystById('port').cost, delta: 1 } });
    expect(coachSuggestion(context(state))?.id).toBe('coach-port');
  });

  it('l’elenco e’ ordinato e senza duplicati di id', () => {
    const state = city({ harvest: fedAt(POPULATION, 0.5) });
    const tips = coachSuggestions(context(state));
    expect(tips.length).toBeGreaterThan(0);
    expect(new Set(tips.map((tip) => tip.id)).size).toBe(tips.length);
    expect(tips[0].id).toBe('coach-food');
  });
});

describe('coach — purezza', () => {
  it('lo stesso contesto produce lo stesso output', () => {
    const state = city({ harvest: fedAt(POPULATION, 0.5) });
    const first = coachSuggestion(context(state));
    const second = coachSuggestion(context(state));
    expect(first).toEqual(second);
  });

  it('non nomina mai un gesto che non sia nel messaggio', () => {
    for (const tier of coachSuggestions(context(city({ harvest: fedAt(POPULATION, 0.5) })))) {
      expect(tier.title.length).toBeGreaterThan(0);
      expect(tier.message.length).toBeGreaterThan(0);
    }
  });
});
