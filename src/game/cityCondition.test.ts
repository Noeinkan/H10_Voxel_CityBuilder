import { describe, expect, it } from 'vitest';
import {
  addBuilding,
  addCatalyst,
  ALL_CLASSES,
  BUILDING_CLASS,
  createSimState,
  EMPTY_HARVEST,
  type SimState,
} from '../sim';
import { BALANCE } from '../sim/balance';
import { cityCondition, isSelfSufficient } from './cityCondition';
import type { CoachSuggestion } from './coach';

/** Un coach qualunque: al test serve la priorita', non il contenuto. */
const COACH: CoachSuggestion = {
  id: 'test-coach',
  tier: 'district',
  title: 'Test coach',
  message: 'Do the thing.',
  highlight: null,
  grow: null,
};

describe('condizioni della città', () => {
  it('mostra prima il tutorial e poi una crisi con una via di recupero', () => {
    expect(cityCondition(createSimState(), 0).kind).toBe('onboarding');
    const state = {
      ...completeCity(),
      food: { stock: 0, delta: -2 },
      population: { stock: 60, delta: -1 },
    };
    const condition = cityCondition(state, 0);
    expect(condition.kind).toBe('crisis');
    expect(condition.message).toContain('can recover');
  });

  it('richiede stabilità prima di dichiarare il successo', () => {
    const state = selfSufficientCity();
    expect(isSelfSufficient(state)).toBe(true);
    expect(cityCondition(state, BALANCE.gameplay.success.stableTicks - 1).kind).toBe('development');
    expect(cityCondition(state, BALANCE.gameplay.success.stableTicks).kind).toBe('success');
  });

  it('una carestia stabile non è un pareggio', () => {
    // Il caso che il segno del delta non sapeva vedere: scorte finite da un
    // pezzo, quindi `min(domanda, disponibile)` le tiene a zero e il delta vale
    // esattamente zero. La citta' mangia un terzo di cio' che le serve.
    const eaten = BALANCE.gameplay.success.population * BALANCE.food.perResident / 3;
    const state: SimState = {
      ...selfSufficientCity(),
      food: { stock: 0, delta: 0 },
      harvest: { ...EMPTY_HARVEST, grown: [eaten, 0, 0], eaten },
    };

    expect(isSelfSufficient(state)).toBe(false);
    expect(cityCondition(state, 0).kind).toBe('crisis');
    // Il titolo porta gia' causa e rimedio, non solo la diagnosi.
    expect(cityCondition(state, 0).title).toContain('Food shortage');
    expect(cityCondition(state, 0).title).toContain('Greenhouse');
  });

  it('ordina onboarding → crisi → collo di bottiglia → coach → successo', () => {
    // Il tutorial vince su tutto.
    expect(cityCondition(createSimState(), 0, COACH).kind).toBe('onboarding');

    // La crisi passa davanti al coach.
    const starving = {
      ...completeCity(),
      food: { stock: 0, delta: -2 },
      population: { stock: 60, delta: -1 },
    };
    expect(cityCondition(starving, 0, COACH).kind).toBe('crisis');

    // Il collo di bottiglia passa davanti al coach: «l'organico e' al 40%» e'
    // vero adesso, la rotta puo' aspettare.
    let bottleneck = completeCity();
    bottleneck = addBuilding(bottleneck, { x: 0, y: 20, class: BUILDING_CLASS.industrial });
    bottleneck = { ...bottleneck, staffing: 0.4, population: { stock: 60, delta: 1 } };
    const held = cityCondition(bottleneck, 0, COACH);
    expect(held.kind).toBe('development');
    expect(held.tone).toBe('warning');

    // Con la salute a posto la riga va al coach.
    expect(cityCondition(selfSufficientCity(), 0, COACH).kind).toBe('coach');

    // Il traguardo compare solo quando il coach tace.
    expect(cityCondition(
      selfSufficientCity(),
      BALANCE.gameplay.success.stableTicks,
    ).kind).toBe('success');
  });
});

function completeCity(): SimState {
  let state = createSimState();
  for (const [index, cls] of [
    BUILDING_CLASS.residential,
    BUILDING_CLASS.industrial,
    BUILDING_CLASS.commercial,
    BUILDING_CLASS.civic,
  ].entries()) {
    state = addCatalyst(state, { x: index * 20, y: 0, class: cls, strength: 200, radius: 12 });
  }
  return state;
}

function selfSufficientCity(): SimState {
  let state = completeCity();
  for (const cls of ALL_CLASSES) {
    for (let i = 0; i < BALANCE.gameplay.success.buildingsPerClass; i++) {
      state = addBuilding(state, { x: cls * 30 + i, y: 20, class: cls });
    }
  }
  const population = BALANCE.gameplay.success.population;
  // Il referto del raccolto e non solo lo stock: «sfamata» vuol dire che la
  // domanda del tick e' stata servita tutta, e un magazzino pieno da solo non
  // lo dice — ci si arriva anche mangiando una riserva che sta finendo.
  const eaten = population * BALANCE.food.perResident;
  return {
    ...state,
    population: { stock: population, delta: 1 },
    food: { stock: 100, delta: 1 },
    harvest: { ...EMPTY_HARVEST, grown: [eaten, 0, 0], eaten },
    materials: { stock: 100, delta: 1 },
    funds: { stock: 100, delta: 1 },
    satisfaction: BALANCE.gameplay.success.satisfaction,
    // Campi a sufficienza, altrimenti `countryside-behind` (un collo di
    // bottiglia) passerebbe davanti al successo nella scala della voce.
    farmCounts: [3, 0, 0],
  };
}
