import { describe, expect, it } from 'vitest';
import { addBuilding, addCatalyst, BUILDING_CLASS, createSimState, type SimState } from '../sim';
import { BALANCE } from '../sim/balance';
import { cityCondition, isSelfSufficient } from './cityCondition';

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
});

function completeCity(): SimState {
  let state = createSimState();
  for (const [index, cls] of [
    BUILDING_CLASS.residential,
    BUILDING_CLASS.production,
    BUILDING_CLASS.civic,
  ].entries()) {
    state = addCatalyst(state, { x: index * 20, y: 0, class: cls, strength: 200, radius: 12 });
  }
  return state;
}

function selfSufficientCity(): SimState {
  let state = completeCity();
  for (const cls of [BUILDING_CLASS.residential, BUILDING_CLASS.production, BUILDING_CLASS.civic]) {
    for (let i = 0; i < BALANCE.gameplay.success.buildingsPerClass; i++) {
      state = addBuilding(state, { x: cls * 30 + i, y: 20, class: cls });
    }
  }
  return {
    ...state,
    population: { stock: BALANCE.gameplay.success.population, delta: 1 },
    food: { stock: 100, delta: 1 },
    materials: { stock: 100, delta: 1 },
    funds: { stock: 100, delta: 1 },
    satisfaction: BALANCE.gameplay.success.satisfaction,
  };
}
