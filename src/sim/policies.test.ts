import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { POLICIES, resolveWeights, withPolicy, type PolicyId } from './policies';
import {
  addCatalyst,
  clearPolicies,
  createSimState,
  setPolicyActive,
  type SimState,
} from './SimState';

const ALL_IDS: readonly PolicyId[] = POLICIES.map((policy) => policy.id);

function withAllPolicies(): SimState {
  let state = addCatalyst(createSimState(), {
    x: 100,
    y: 100,
    class: BUILDING_CLASS.residential,
    strength: 160,
    radius: 20,
  });
  for (const id of ALL_IDS) state = setPolicyActive(state, id, true);
  return state;
}

describe('policies — i pesi tornano esatti', () => {
  it('disattivare tutte le policy riporta ai valori base di balance.ts', () => {
    let state = withAllPolicies();
    expect(state.policies).toHaveLength(ALL_IDS.length);

    state = clearPolicies(state);

    expect(state.policies).toEqual([]);
    expect(resolveWeights(state.policies)).toEqual({ ...BALANCE.weights });
  });

  it('spegnere tutto e riaccendere tutto riporta ai pesi esatti di partenza', () => {
    const start = withAllPolicies();
    const before = resolveWeights(start.policies);

    let state = clearPolicies(start);
    for (const id of ALL_IDS) state = setPolicyActive(state, id, true);

    const after = resolveWeights(state.policies);

    // Uguaglianza esatta, non approssimata: i pesi si ricalcolano dal valore
    // base moltiplicando, non si dividono per tornare indietro.
    expect(after).toEqual(before);
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      expect(Object.is(after[key], before[key])).toBe(true);
    }
  });

  it('sopporta dieci giri di spegnimento e riaccensione senza derivare', () => {
    const start = withAllPolicies();
    const before = resolveWeights(start.policies);

    let state = start;
    for (let round = 0; round < 10; round++) {
      state = clearPolicies(state);
      for (const id of ALL_IDS) state = setPolicyActive(state, id, true);
    }

    expect(resolveWeights(state.policies)).toEqual(before);
    expect(state.policies).toEqual(start.policies);
  });

  it('l’ordine di attivazione non cambia ne’ i pesi ne’ la lista', () => {
    let forward = createSimState();
    for (const id of ALL_IDS) forward = setPolicyActive(forward, id, true);

    let backward = createSimState();
    for (const id of [...ALL_IDS].reverse()) backward = setPolicyActive(backward, id, true);

    expect(backward.policies).toEqual(forward.policies);
    expect(resolveWeights(backward.policies)).toEqual(resolveWeights(forward.policies));
  });

  it('ogni policy muove due pesi — quello che guadagna e quello che paga', () => {
    const base = resolveWeights([]);

    for (const policy of POLICIES) {
      const weights = resolveWeights([policy.id]);
      const trade = policy.tradeoff;
      // Il peso su cui guadagna. Nessuna policy sconta il proprio: sarebbe una
      // voce che si annulla da sola, e il catalogo non ne ammette.
      expect(trade.weight).not.toBe(policy.weight);
      expect(weights[policy.weight]).toBe(base[policy.weight] * policy.multiplier);
      expect(weights[trade.weight]).toBe(base[trade.weight] * trade.multiplier);

      for (const key of Object.keys(base) as (keyof typeof base)[]) {
        if (key === policy.weight || key === trade.weight) continue;
        expect(weights[key]).toBe(base[key]);
      }
    }
  });

  /**
   * La proprieta' che rende il pannello una scelta: nessuna policy e' gratis.
   *
   * Non basta che lo scambio esista — dev'essere nel **verso** giusto. Su
   * `civicUpkeep` alto significa costoso, quindi li' un prezzo e' un
   * moltiplicatore maggiore di uno; su tutti gli altri e' minore. Senza questo
   * test una contropartita scritta al contrario sarebbe un secondo bonus, e
   * nessun altro controllo se ne accorgerebbe.
   */
  it('nessuna policy e gratis, e il prezzo va nel verso del peso che tocca', () => {
    for (const policy of POLICIES) {
      const { weight, multiplier } = policy.tradeoff;
      if (weight === 'civicUpkeep') expect(multiplier).toBeGreaterThan(1);
      else expect(multiplier).toBeLessThan(1);
      expect(policy.tradeoffEffect.length).toBeGreaterThan(0);
    }
  });

  it('withPolicy tiene la lista in ordine di catalogo e non duplica', () => {
    let active = withPolicy([], 'civicPride', true);
    active = withPolicy(active, 'denseHousing', true);
    active = withPolicy(active, 'civicPride', true);

    expect(active).toEqual(['denseHousing', 'civicPride']);
    expect(withPolicy(active, 'austerity', false)).toEqual(active);
  });
});

describe('policies — effetto sul campo', () => {
  it('una policy di desiderabilita’ riscala la sola classe che tocca', () => {
    const cls = BUILDING_CLASS.residential;
    let state = addCatalyst(createSimState(), {
      x: 100,
      y: 100,
      class: cls,
      strength: 160,
      radius: 20,
    });
    state = addCatalyst(state, {
      x: 100,
      y: 100,
      class: BUILDING_CLASS.industrial,
      strength: 160,
      radius: 20,
    });

    const before = state.field.valueAt(100, 100, cls);
    const beforeOther = state.field.valueAt(100, 100, BUILDING_CLASS.industrial);

    state = setPolicyActive(state, 'greenBelt', true);

    expect(state.field.valueAt(100, 100, cls)).toBe(
      Math.round(before * BALANCE.policyMultipliers.greenBelt),
    );
    expect(state.field.valueAt(100, 100, BUILDING_CLASS.industrial)).toBe(beforeOther);
  });

  it('accendere e spegnere una policy riporta il campo esattamente a com’era', () => {
    const cls = BUILDING_CLASS.residential;
    let state = addCatalyst(createSimState(), {
      x: 100,
      y: 100,
      class: cls,
      strength: 137,
      radius: 17,
    });

    const before: number[] = [];
    for (let d = 0; d <= 20; d++) before.push(state.field.valueAt(100 + d, 100, cls));

    state = setPolicyActive(state, 'greenBelt', true);
    state = setPolicyActive(state, 'greenBelt', false);

    const after: number[] = [];
    for (let d = 0; d <= 20; d++) after.push(state.field.valueAt(100 + d, 100, cls));

    expect(after).toEqual(before);
  });

  it('una policy che non tocca nessuna desiderabilita’ lascia il campo intatto', () => {
    const cls = BUILDING_CLASS.residential;
    let state = addCatalyst(createSimState(), {
      x: 100,
      y: 100,
      class: cls,
      strength: 200,
      radius: 20,
    });
    const before = state.field.valueAt(100, 100, cls);

    // `tariffShield` e' l'unica del catalogo i cui **due** pesi stanno fuori dal
    // campo: guadagna sulla resa industriale e paga sulla capacita' commerciale.
    state = setPolicyActive(state, 'tariffShield', true);

    expect(state.field.valueAt(100, 100, cls)).toBe(before);
    expect(resolveWeights(state.policies).productionYield).toBe(
      BALANCE.weights.productionYield * BALANCE.policyMultipliers.tariffShield,
    );
  });

  /**
   * La regressione che il prezzo ha portato con se': `setPolicyActive`
   * ricostruiva **un** uso, quello su cui la policy guadagna. Da quando ogni
   * policy sconta anche un secondo peso, ricostruirne uno solo lascia il campo
   * dell'altro fermo su un moltiplicatore che non e' piu' quello attivo — e non
   * si vede finche' non si guarda la heatmap.
   */
  it('accendere una policy ricostruisce anche l’uso su cui paga', () => {
    const cls = BUILDING_CLASS.residential;
    let state = addCatalyst(createSimState(), {
      x: 100,
      y: 100,
      class: cls,
      strength: 200,
      radius: 20,
    });
    const before = state.field.valueAt(100, 100, cls);

    // `denseHousing` guadagna sulla capacita' — fuori dal campo — e paga sulla
    // desiderabilita' residenziale, che nel campo c'e'.
    state = setPolicyActive(state, 'denseHousing', true);

    expect(state.field.valueAt(100, 100, cls)).toBe(
      Math.round(before * BALANCE.policyTradeoffs.denseHousing.multiplier),
    );
  });
});
