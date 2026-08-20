import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { isCatalystId } from './catalysts';
import { charterOfFamily, isCharterId } from './charters';
import { decisionAt } from './decisions';
import { createSimState, resolveDecision, type SimState } from './SimState';
import { testTerrain } from './testTerrain';
import { tickMany } from './tick';

describe('decisioni periodiche', () => {
  it('non interrompe una citta ancora priva di un contesto significativo', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const state = tickMany(createSimState(), map, BALANCE.decisions.firstTick);

    expect(state.pendingDecision).toBeNull();
  });

  it('apre una scelta deterministica alla scadenza e la mantiene sospesa', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const city = establishedCity();
    const first = tickMany(city, map, BALANCE.decisions.firstTick);
    const second = tickMany(establishedCity(), map, BALANCE.decisions.firstTick);
    expect(first.pendingDecision).toEqual(second.pendingDecision);
    expect(first.pendingDecision?.id).toMatch(/^public-space-/);
    expect(first.pendingDecision?.options).toHaveLength(3);
    expect(tickMany(first, map, 20).pendingDecision).toEqual(first.pendingDecision);
  });

  it('applica l alternativa e pianifica la prossima decisione', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const waiting = tickMany(establishedCity(), map, BALANCE.decisions.firstTick);
    const option = waiting.pendingDecision?.options[0];
    if (option === undefined) throw new Error('decisione attesa');
    const resolved = resolveDecision(waiting, option.id);
    expect(resolved?.pendingDecision).toBeNull();
    expect(resolved?.decisionHistory.at(-1)?.optionId).toBe(option.id);
    expect(resolved?.nextDecisionTick).toBe(waiting.tickCount + BALANCE.decisions.intervalTicks);
    expect(resolveDecision(waiting, 'inesistente')).toBeNull();
  });

  it('alterna le scelte contestuali invece di usare la parita del tick', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const first = tickMany(establishedCity(), map, BALANCE.decisions.firstTick);
    const resolved = resolveDecision(first, 'leave-open');
    if (resolved === null) throw new Error('decisione attesa');

    const second = tickMany(resolved, map, BALANCE.decisions.intervalTicks);
    expect(second.pendingDecision?.id).toMatch(/^investment-/);
    expect(second.pendingDecision?.family).toBe('investment');
  });
});

describe('il segno che una decisione lascia sulla citta', () => {
  it('ogni alternativa del catalogo dichiara un mandato e un opera validi', () => {
    for (const decision of allDecisions()) {
      for (const option of decision.options) {
        if (option.charter !== undefined && option.charter !== null) {
          expect(isCharterId(option.charter)).toBe(true);
        }
        if (option.grant !== undefined) expect(isCatalystId(option.grant.kind)).toBe(true);
      }
    }
  });

  it('scegliere occupa lo slot della famiglia', () => {
    const waiting = pending(hungryCity());
    expect(waiting.pendingDecision?.family).toBe('supply');

    const resolved = resolveDecision(waiting, 'community-gardens');
    expect(resolved?.charters).toEqual(['communityGardens']);
    expect(charterOfFamily(resolved?.charters ?? [], 'supply')).toBe('communityGardens');
  });

  // E' la proprieta' che sostituisce la scadenza a tick: la citta' porta il
  // segno dell'ultima scelta di ogni famiglia, non la somma di tutte.
  it('la scelta successiva della stessa famiglia sostituisce la precedente', () => {
    const first = resolveDecision(pending(hungryCity()), 'community-gardens');
    if (first === null) throw new Error('decisione attesa');

    // La riserva torna sotto il fabbisogno: e' l'unico modo per riaprire la
    // stessa famiglia, ed e' anche il caso che conta — la citta' ci ricasca.
    const hungryAgain = pending({ ...first, tickCount: first.nextDecisionTick, food: { stock: 0, delta: 0 } });
    expect(hungryAgain.pendingDecision?.family).toBe('supply');

    const second = resolveDecision(hungryAgain, 'ration');
    expect(second?.charters).toEqual(['rationing']);
  });

  it('tenere la piazza libera svuota lo slot invece di non fare niente', () => {
    const leased = resolveDecision(pending(establishedCity()), 'materials-market');
    expect(leased?.charters).toEqual(['leasedSquare']);
    if (leased === null) throw new Error('decisione attesa');

    // Dopo una decisione sullo spazio pubblico tocca all'investimento: si
    // riapre la stessa famiglia azzerando il registro.
    const reopened = pending({ ...leased, tickCount: leased.nextDecisionTick, decisionHistory: [] });
    expect(reopened.pendingDecision?.family).toBe('publicSpace');
    expect(resolveDecision(reopened, 'leave-open')?.charters).toEqual([]);
  });

  it('registra la famiglia risolta insieme all esito', () => {
    const resolved = resolveDecision(pending(hungryCity()), 'ration');
    expect(resolved?.decisionHistory.at(-1)?.family).toBe('supply');
  });
});

/** Le decisioni raggiungibili dai tre contesti, per scorrerne le alternative. */
function allDecisions() {
  const hungry = decisionAt(hungryCity(), 0);
  const square = decisionAt(establishedCity(), 0);
  const investment = decisionAt(
    { ...establishedCity(), decisionHistory: [outcome('publicSpace')] },
    0,
  );
  if (hungry === null || square === null || investment === null) {
    throw new Error('fixture delle decisioni incompleta');
  }
  return [hungry, square, investment];
}

function pending(state: SimState): SimState {
  const decision = decisionAt(state, state.tickCount);
  if (decision === null) throw new Error('decisione attesa');
  return { ...state, pendingDecision: decision };
}

function outcome(family: 'supply' | 'publicSpace' | 'investment') {
  return { tick: 0, decisionId: `${family}-0`, family, optionId: 'x', summary: '' };
}

/** Riserva sotto il fabbisogno: e' il contesto che apre la decisione sul cibo. */
function hungryCity(): SimState {
  return { ...establishedCity(), food: { stock: 0, delta: 0 } };
}

function establishedCity(): SimState {
  const state = createSimState();
  return {
    ...state,
    population: { stock: 48, delta: 0 },
    food: { stock: 1_000_000, delta: 0 },
    // Residenziale, commerciale, industriale, civico: la decisione sullo spazio
    // pubblico chiede almeno un civico, quella sull'investimento un industriale.
    buildingCounts: [4, 1, 2, 1],
    mixedCounts: [0, 0, 0, 0],
  };
}
