import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { isCatalystId } from './catalysts';
import { charterOfFamily, isCharterId } from './charters';
import { decisionAt, type DecisionOption } from './decisions';
import { EMPTY_HARVEST, type FoodReport } from './farms';
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
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const first = resolveDecision(pending(hungryCity()), 'community-gardens');
    if (first === null) throw new Error('decisione attesa');

    // Il fronte si rialza solo piantando: due campi coprono la domanda di
    // quarantotto abitanti con margine, e **questo** e' rientrare. E' l'unico
    // modo per riaprire la stessa famiglia, ed e' anche il caso che conta — la
    // citta' ci ricasca dopo aver risolto per davvero.
    const recovered = tickMany({ ...first, farmCounts: [2, 0, 0] }, map, 1);
    expect(recovered.supplyArmed).toBe(true);

    const hungryAgain = pending({
      ...recovered,
      tickCount: first.nextDecisionTick,
      harvest: fedHarvest(recovered.population.stock, 0.5),
    });
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

describe('l emergenza alimentare', () => {
  // La regressione che conta: era la condizione permanentemente vera, e la
  // scelta si ripresentava a ogni scadenza per il resto della partita.
  it('non scatta per una citta che mangia quanto raccoglie', () => {
    const balanced = {
      ...establishedCity(),
      // Dispensa a zero, nessuna carestia: e' lo stato **normale** di una citta'
      // sfamata, perche' `missingPlotsOf` punta al pareggio e non a una scorta.
      food: { stock: 0, delta: 0 },
      harvest: fedHarvest(48, 1),
    };

    expect(decisionAt(balanced, 0)?.family).not.toBe('supply');
  });

  it('non si ripresenta finche non e rientrata', () => {
    const resolved = resolveDecision(pending(hungryCity()), 'ration');
    if (resolved === null) throw new Error('decisione attesa');
    expect(resolved.supplyArmed).toBe(false);

    // Ancora affamata e scadenza passata: senza il fronte questa era esattamente
    // la condizione che la riapriva ogni novanta secondi.
    const stillHungry = { ...resolved, tickCount: resolved.nextDecisionTick };
    expect(decisionAt(stillHungry, stillHungry.tickCount)?.family).not.toBe('supply');
  });

  // La seconda meta' dello stesso guasto, e quella che i test unitari non
  // avevano visto: misurata su novemila tick, la scelta si riapriva dieci volte
  // anche col fronte, perche' il fronte si rialzava sul cibo appena regalato.
  it('non si riarma sulla dotazione che l ha appena risolta', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const resolved = resolveDecision(pending(hungryCity()), 'buy-food');
    if (resolved === null) throw new Error('decisione attesa');

    // La citta' mangia — la dispensa e' piena di roba comprata — ma non produce
    // niente: `farmCounts` e' a zero. Non ha risolto, quindi non rientra.
    const eating = tickMany(resolved, map, 200);
    expect(eating.harvest.eaten).toBeGreaterThan(0);
    expect(eating.supplyArmed).toBe(false);
  });

  /**
   * Il bersaglio di chi pianta deve stare **sopra** la soglia di rientro, o
   * piantare non riarmerebbe mai il fronte: la campagna arriverebbe esattamente
   * dove l'emergenza non la considera ancora rientrata, e una carestia si potrebbe
   * dichiarare una volta sola per partita.
   */
  it('la campagna punta sopra la soglia che fa rientrare l emergenza', () => {
    expect(BALANCE.food.targetCoverage).toBeGreaterThan(BALANCE.decisions.recoveryCoverage);
  });

  it('la dotazione copre lo stesso respiro a ogni taglia della citta', () => {
    // L'invariante che mancava, e adesso e' esatto invece che approssimato: la
    // dotazione si conta in tick di spesa vera, non in edifici interi. Piatta, a
    // tremila abitanti copriva 0,7 tick — meno di un secondo — e due alternative
    // su tre erano gesti simbolici.
    for (const population of [7, 48, 480, 4800]) {
      const decision = decisionAt(hungryCity(population), 0);
      if (decision === null) throw new Error('emergenza attesa');
      expect(decision.family).toBe('supply');

      const demand = population * BALANCE.food.perResident;
      for (const option of decision.options) {
        expect((option.effect.food ?? 0) / demand).toBeCloseTo(BALANCE.decisions.reliefTicks);
      }
    }
  });

  // Cento tick di respiro erano dieci secondi a schermo: il tempo di leggere il
  // messaggio, non di piantare un campo. Il respiro si misura contro la scadenza
  // della prossima decisione, ed e' quello che rende la scelta una scelta.
  it('il respiro dura fino a ridosso della decisione successiva', () => {
    expect(BALANCE.decisions.reliefTicks).toBeGreaterThan(BALANCE.decisions.intervalTicks / 2);
    expect(BALANCE.decisions.reliefTicks).toBeLessThan(BALANCE.decisions.intervalTicks);
  });

  it('anche la fiera paga in proporzione alla citta che la fa', () => {
    // L'ultimo numero alimentare piatto: a costo fisso, a citta' grande la fiera
    // era soddisfazione gratis e le altre due alternative non esistevano piu'.
    const small = investmentOptions(240);
    const large = investmentOptions(2400);
    const cost = (options: readonly DecisionOption[]): number =>
      -(options.find((entry) => entry.id === 'food-fair')?.effect.food ?? 0);

    expect(cost(large) / cost(small)).toBeCloseTo(10);
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

/** Le alternative della famiglia investimento a una data taglia di citta'. */
function investmentOptions(population: number): readonly DecisionOption[] {
  const decision = decisionAt(
    { ...establishedCity(population), decisionHistory: [outcome('publicSpace')] },
    0,
  );
  if (decision === null || decision.family !== 'investment') {
    throw new Error('decisione di investimento attesa');
  }
  return decision.options;
}

function pending(state: SimState): SimState {
  const decision = decisionAt(state, state.tickCount);
  if (decision === null) throw new Error('decisione attesa');
  return { ...state, pendingDecision: decision };
}

function outcome(family: 'supply' | 'publicSpace' | 'investment') {
  return { tick: 0, decisionId: `${family}-0`, family, optionId: 'x', summary: '' };
}

/**
 * Una citta' che non riesce a sfamarsi: e' il contesto che apre l'emergenza.
 *
 * **Non e' piu' «dispensa vuota».** Quella la tiene anche una citta' in
 * pareggio, ed era la ragione per cui l'emergenza non si spegneva mai: quello
 * che la apre e' il raccolto che non copre la domanda.
 */
function hungryCity(population = 48): SimState {
  const state = establishedCity(population);
  return { ...state, harvest: fedHarvest(population, 0.5) };
}

function establishedCity(population = 48): SimState {
  const state = createSimState();
  return {
    ...state,
    population: { stock: population, delta: 0 },
    food: { stock: 1_000_000, delta: 0 },
    // Una citta' stabilita mangia. Senza il referto varrebbe il raccolto vuoto
    // di `createSimState`, che `fedShareOf` legge come una carestia: l'emergenza
    // coprirebbe le altre due famiglie e nessuna di loro sarebbe raggiungibile.
    harvest: fedHarvest(population, 1),
    // Residenziale, commerciale, industriale, civico: la decisione sullo spazio
    // pubblico chiede almeno un civico, quella sull'investimento un industriale.
    buildingCounts: [4, 1, 2, 1],
    capacityCounts: [4, 1, 2, 1],
    mixedCounts: [0, 0, 0, 0],
    mixedCapacityCounts: [0, 0, 0, 0],
  };
}

/** Referto di un raccolto che copre `share` della domanda di `population`. */
function fedHarvest(population: number, share: number): FoodReport {
  return { ...EMPTY_HARVEST, eaten: population * BALANCE.food.perResident * share };
}
