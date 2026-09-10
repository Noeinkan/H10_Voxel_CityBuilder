import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { charterOfFamily } from './charters';
import { decisionAt, decisionExpired, decisionFingerprint, lapseOption } from './decisions';
import { EMPTY_HARVEST, type FoodReport } from './farms';
import {
  createSimState,
  lapseDecision,
  resolveDecision,
  setPolicyActive,
  snoozeDecision,
  type SimState,
} from './SimState';
import { testTerrain } from './testTerrain';
import { tickMany } from './tick';

describe('cadenza del bacino', () => {
  it('non interrompe una citta ancora priva di un contesto significativo', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const state = tickMany(createSimState(), map, BALANCE.decisions.firstTick);

    expect(state.pendingDecision).toBeNull();
  });

  it('apre una scelta deterministica alla scadenza e la mantiene sospesa', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const first = tickMany(establishedCity(), map, BALANCE.decisions.firstTick);
    const second = tickMany(establishedCity(), map, BALANCE.decisions.firstTick);

    // **Pescata, non scelta a mano — ma dallo stesso flusso.** Due partite dallo
    // stesso stato vedono lo stesso evento: la pesca pesata legge `rngState`,
    // che il tick fa avanzare e il salvataggio porta con se'. E' cio' che
    // distingue «dinamico» da «casuale».
    expect(first.pendingDecision).toEqual(second.pendingDecision);
    expect(first.pendingDecision).not.toBeNull();
    expect(['public-space', 'investment']).toContain(first.pendingDecision?.eventId);
    expect(tickMany(first, map, 20).pendingDecision).toEqual(first.pendingDecision);
  });

  it('due citta diverse non vedono per forza lo stesso evento', () => {
    // Lo stesso contesto, un flusso diverso: e' l'unica differenza fra i due, e
    // basta a cambiare la pesca. Senza questa proprieta' il bacino sarebbe un
    // elenco in ordine fisso con dei pesi decorativi.
    const drawn = new Set<string>();
    for (let seed = 0; seed < 16; seed++) {
      const decision = decisionAt({ ...establishedCity(), rngState: seed * 0x9e37 }, 0);
      if (decision !== null) drawn.add(decision.eventId);
    }
    expect(drawn.size).toBeGreaterThan(1);
  });

  it('applica l alternativa e pianifica la prossima decisione', () => {
    const waiting = pending(squareCity());
    const option = waiting.pendingDecision?.options[0];
    if (option === undefined) throw new Error('decisione attesa');

    const resolved = resolveDecision(waiting, option.id);
    expect(resolved?.pendingDecision).toBeNull();
    expect(resolved?.decisionHistory.at(-1)?.optionId).toBe(option.id);
    expect(resolved?.decisionHistory.at(-1)?.eventId).toBe('public-space');
    expect(resolved?.nextDecisionTick).toBe(waiting.tickCount + BALANCE.decisions.intervalTicks);
    expect(resolveDecision(waiting, 'inesistente')).toBeNull();
  });

  /**
   * Il raffreddamento ha preso il posto della rotazione fra famiglie.
   *
   * Prima le scelte contestuali erano due e si alternavano guardando l'ultima
   * risolta: una regola che funziona con due voci e non si estende a tredici.
   * Adesso ogni voce ricorda quando e' stata risolta, e finche' non e' fredda
   * non rientra nella pesca — che e' la stessa promessa («non ti richiedo la
   * stessa cosa») fatta in un modo che regge un catalogo che cresce.
   */
  it('una voce appena risolta non rientra nella pesca finche non e fredda', () => {
    const resolved = resolveDecision(pending(squareCity()), 'leave-open');
    if (resolved === null) throw new Error('decisione attesa');
    expect(resolved.eventMemory.at(-1)?.id).toBe('public-space');

    // Scadenza passata, impronta azzerata: l'unica cosa che la trattiene e' il
    // raffreddamento, e in questa citta' `public-space` e' l'unica qualificata.
    const soon = {
      ...resolved,
      decisionStamp: -1,
      tickCount: resolved.tickCount + BALANCE.decisions.intervalTicks,
    };
    expect(decisionAt(soon, soon.tickCount)).toBeNull();

    const later = { ...soon, tickCount: resolved.tickCount + BALANCE.decisions.pool.cooldownTicks };
    expect(decisionAt(later, later.tickCount)?.eventId).toBe('public-space');
  });

  /**
   * La regola che separa una crisi da una routine, e l'unica ragione per cui
   * l'urgenza esiste come campo: un guasto in corso non ha un turno.
   */
  it('una crisi non aspetta la cadenza ordinaria', () => {
    const hungry = hungryCity();
    // Cadenza lontanissima e citta' immobile: entrambi i cancelli ordinari sono
    // chiusi, e una routine qui non passerebbe.
    const quiet = { ...hungry, decisionStamp: decisionFingerprint(hungry) };
    const far = hungry.tickCount + BALANCE.decisions.intervalTicks;

    const decision = decisionAt(quiet, far);
    expect(decision?.eventId).toBe('food-emergency');
    expect(decision?.urgency).toBe('crisis');
  });

  it('non riapre una scelta contestuale se la citta non e cambiata', () => {
    const city = squareCity();
    const quiet = {
      ...city,
      decisionStamp: decisionFingerprint(city),
      tickCount: BALANCE.decisions.intervalTicks,
    };
    expect(decisionAt(quiet, BALANCE.decisions.intervalTicks)).toBeNull();
  });

  it('si riapre comunque quando e passato il tetto di inattivita', () => {
    const city = squareCity();
    const overdue = {
      ...city,
      decisionStamp: decisionFingerprint(city),
      tickCount: BALANCE.decisions.maxIdleTicks,
    };
    expect(decisionAt(overdue, BALANCE.decisions.intervalTicks)?.family).toBe('publicSpace');
  });

  it('rinnova invece di ripetere quando il mandato della famiglia e gia attivo', () => {
    const leased = resolveDecision(pending(squareCity()), 'materials-market');
    if (leased === null) throw new Error('decisione attesa');

    const reopened = pending({
      ...leased,
      tickCount: leased.tickCount + BALANCE.decisions.pool.cooldownTicks,
      decisionStamp: -1,
      // Dare la piazza in affitto prenota la disputa sull'affitto, e un seguito
      // batte la pesca ordinaria: qui si parla della piazza, non della catena.
      scheduledEvents: [],
    });
    const option = reopened.pendingDecision?.options.find((entry) => entry.id === 'materials-market');
    expect(option?.label).toContain('Renew');
  });

  it('rimanda la scelta senza risolverla e la ripropone identica', () => {
    const waiting = pending(squareCity());
    const snoozed = snoozeDecision(waiting);
    expect(snoozed.pendingDecision).toEqual(waiting.pendingDecision);
    expect(snoozed.decisionDismissedUntil).toBe(waiting.tickCount + BALANCE.decisions.snoozeTicks);
    expect(snoozed.charters).toEqual(waiting.charters);
  });
});

describe('la scadenza di una crisi', () => {
  it('solo una crisi porta una scadenza', () => {
    const routine = pending(squareCity()).pendingDecision;
    expect(routine?.urgency).toBe('routine');
    expect(routine?.expiresAt).toBe(0);
    expect(decisionExpired(routine!, 10_000)).toBe(false);

    const crisis = pending(hungryCity()).pendingDecision;
    expect(crisis?.expiresAt).toBe(BALANCE.decisions.pool.crisisExpiryTicks);
  });

  /**
   * La proprieta' che rende «decidi piu' tardi» una scelta: allo scadere
   * l'alternativa marcata scatta da sola, ed e' la stessa che la carta mostrava
   * prima che il giocatore decidesse di rimandare.
   */
  it('allo scadere applica l alternativa marcata, e la registra come scaduta', () => {
    const waiting = pending(hungryCity());
    const decision = waiting.pendingDecision;
    if (decision === null) throw new Error('crisi attesa');
    const fallback = lapseOption(decision);
    expect(fallback?.id).toBe('ration');

    const late = { ...waiting, tickCount: decision.expiresAt };
    expect(decisionExpired(decision, late.tickCount)).toBe(true);

    const lapsed = lapseDecision(late);
    expect(lapsed.pendingDecision).toBeNull();
    expect(lapsed.decisionHistory.at(-1)?.optionId).toBe('ration');
    expect(lapsed.decisionHistory.at(-1)?.lapsed).toBe(true);
    // E l'effetto e' quello vero, non un rinvio: il mandato e' stato preso.
    expect(lapsed.charters).toEqual(['rationing']);
    expect(lapsed.satisfaction).toBeLessThan(late.satisfaction);
  });

  it('rimandare non ferma l orologio', () => {
    const waiting = pending(hungryCity());
    const snoozed = snoozeDecision(waiting);
    expect(snoozed.pendingDecision?.expiresAt).toBe(waiting.pendingDecision?.expiresAt);
  });
});

describe('le catene fra decisioni', () => {
  it('una scelta prenota il proprio seguito, che si apre solo dopo il ritardo', () => {
    const bought = resolveDecision(pending(hungryCity()), 'buy-food');
    if (bought === null) throw new Error('decisione attesa');

    const booked = bought.scheduledEvents.find((entry) => entry.id === 'supply-price-shock');
    expect(booked?.at).toBe(bought.tickCount + BALANCE.decisions.pool.chainDelayTicks);

    // Prima del ritardo il seguito non esiste ancora per nessuno.
    expect(decisionAt({ ...bought, tickCount: booked!.at - 1 }, Number.MAX_SAFE_INTEGER)).toBeNull();

    // Dopo, si apre **anche se** la cadenza ordinaria e' lontanissima: un
    // seguito e' gia' stato scelto, non aspetta un secondo turno.
    const due = { ...bought, tickCount: booked!.at };
    expect(decisionAt(due, Number.MAX_SAFE_INTEGER)?.eventId).toBe('supply-price-shock');
  });

  it('un seguito senza piu soggetto si dimentica invece di aprirsi', () => {
    const bought = resolveDecision(pending(hungryCity()), 'buy-food');
    if (bought === null) throw new Error('decisione attesa');
    const booked = bought.scheduledEvents.find((entry) => entry.id === 'supply-price-shock');

    // Il mandato che la catena racconta non c'e' piu': la citta' ha cambiato
    // strada, e il seguito non ha piu' niente da chiedere.
    const changed = { ...bought, tickCount: booked!.at, charters: [] as const };
    expect(decisionAt(changed, Number.MAX_SAFE_INTEGER)).toBeNull();
  });

  it('le voci di sola catena non compaiono da sole', () => {
    // `supply-price-shock` qualifica su un mandato che questa citta' ha, ma
    // nessuno lo ha prenotato: senza `chainedOnly` svelerebbe il finale di una
    // catena mai iniziata.
    const imported = { ...squareCity(), charters: ['importedSupply'] as const };
    const decision = decisionAt(imported, 0);
    expect(decision?.eventId).not.toBe('supply-price-shock');
  });
});

describe('gli eventi che toccano le policy', () => {
  it('un alternativa puo revocare una policy, e la blocca per un po', () => {
    const strained = budgetCrisisCity();
    const waiting = pending(strained);
    expect(waiting.pendingDecision?.eventId).toBe('budget-crisis');

    // L'alternativa nomina **quale** policy taglia: una scelta che dicesse solo
    // «taglia» sarebbe una scommessa.
    const cut = waiting.pendingDecision?.options.find((entry) => entry.id === 'cut-policy');
    expect(cut?.label).toContain('civic pride');
    expect(cut?.onLapse).toBe(true);

    const resolved = resolveDecision(waiting, 'cut-policy');
    if (resolved === null) throw new Error('decisione attesa');
    expect(resolved.policies).not.toContain('civicPride');
    expect(resolved.policyLocks.find((lock) => lock.id === 'civicPride')?.until)
      .toBe(waiting.tickCount + BALANCE.decisions.pool.policyLockTicks);
  });

  it('un alternativa puo vararne una, e allora non la blocca', () => {
    const stalled = pending(stalledWorksCity());
    expect(stalled.pendingDecision?.eventId).toBe('works-backlog');

    const resolved = resolveDecision(stalled, 'subsidize-industry');
    if (resolved === null) throw new Error('decisione attesa');
    expect(resolved.policies).toContain('industrialSubsidy');
    // Bloccare cio' che si e' appena varato sarebbe una punizione senza causa.
    expect(resolved.policyLocks).toEqual([]);
  });

  /**
   * La crisi che una policy si e' comprata: e' il senso di tutto l'incremento.
   * Sovvenzionare l'industria sconta la desiderabilita' residenziale; quando lo
   * scontento arriva, la citta' chiede conto **di quella policy**, nel pannello
   * in cui e' stata varata.
   */
  it('una crisi si qualifica sulla policy che l ha causata', () => {
    const smoggy = smogCity();
    expect(decisionAt(smoggy, Number.MAX_SAFE_INTEGER)?.eventId).toBe('industrial-smog');

    // Senza quella policy attiva, la stessa citta' scontenta non apre la crisi.
    const clean = setPolicyActive(smogCity(), 'industrialSubsidy', false);
    expect(decisionAt(clean, Number.MAX_SAFE_INTEGER)?.eventId).not.toBe('industrial-smog');
  });
});

describe('il segno che una decisione lascia sulla citta', () => {
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
    // quarantotto abitanti con margine, e **questo** e' rientrare.
    const recovered = tickMany({ ...first, farmCounts: [2, 0, 0] }, map, 1);
    expect(recovered.supplyArmed).toBe(true);

    // E la ricaduta dev'essere **strutturale**: la citta' e' cresciuta oltre la
    // propria campagna. Il raffreddamento della voce e' passato, o la crisi non
    // rientrerebbe nella pesca comunque.
    const outgrown = {
      ...recovered,
      population: { stock: 480, delta: 0 },
      tickCount: recovered.tickCount + BALANCE.decisions.pool.crisisCooldownTicks,
    };
    const hungryAgain = pending({
      ...outgrown,
      harvest: fedHarvest(outgrown.population.stock, 0.5),
    });
    expect(hungryAgain.pendingDecision?.family).toBe('supply');

    const second = resolveDecision(hungryAgain, 'ration');
    expect(second?.charters).toEqual(['rationing']);
  });

  it('tenere la piazza libera svuota lo slot invece di non fare niente', () => {
    const leased = resolveDecision(pending(squareCity()), 'materials-market');
    expect(leased?.charters).toEqual(['leasedSquare']);
    if (leased === null) throw new Error('decisione attesa');

    const reopened = pending({
      ...leased,
      tickCount: leased.tickCount + BALANCE.decisions.pool.cooldownTicks,
      decisionStamp: -1,
      scheduledEvents: [],
    });
    expect(reopened.pendingDecision?.family).toBe('publicSpace');
    expect(resolveDecision(reopened, 'leave-open')?.charters).toEqual([]);
  });

  it('registra la famiglia e la voce di catalogo risolte insieme all esito', () => {
    const resolved = resolveDecision(pending(hungryCity()), 'ration');
    expect(resolved?.decisionHistory.at(-1)?.family).toBe('supply');
    expect(resolved?.decisionHistory.at(-1)?.eventId).toBe('food-emergency');
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

  /**
   * L'altra meta' della stessa regola: con la resa stagionale una citta' ben
   * servita smette di mangiare ogni inverno, e un allarme che scattasse li'
   * sarebbe un appuntamento annuale che nessuna mossa evita — cioe' rumore. Si
   * dichiara emergenza quando la **campagna** non basta, non quando fa freddo.
   */
  it('non scatta per un inverno che la primavera risolve da sola', () => {
    const winter = {
      ...establishedCity(),
      harvest: fedHarvest(48, 0.5),
      farmCounts: [4, 0, 0],
      staffing: 1,
    };
    expect(decisionAt(winter, 0)?.eventId).not.toBe('food-emergency');

    // La stessa citta' senza campagna la apre: e' la sola differenza fra i due.
    expect(decisionAt({ ...winter, farmCounts: [0, 0, 0] }, 0)?.eventId).toBe('food-emergency');
  });

  it('non si ripresenta finche non e rientrata', () => {
    const resolved = resolveDecision(pending(hungryCity()), 'ration');
    if (resolved === null) throw new Error('decisione attesa');
    expect(resolved.supplyArmed).toBe(false);

    // Ancora affamata, scadenza passata e raffreddamento finito: senza il fronte
    // questa era esattamente la condizione che la riapriva ogni novanta secondi.
    const stillHungry = {
      ...resolved,
      tickCount: resolved.tickCount + BALANCE.decisions.pool.crisisCooldownTicks,
    };
    expect(decisionAt(stillHungry, stillHungry.tickCount)?.eventId).not.toBe('food-emergency');
  });

  // La seconda meta' dello stesso guasto, e quella che i test unitari non
  // avevano visto: misurata su novemila tick, la scelta si riapriva dieci volte
  // anche col fronte, perche' il fronte si rialzava sul cibo appena regalato.
  it('non si riarma sulla dotazione che l ha appena risolta', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const resolved = resolveDecision(pending(hungryCity()), 'buy-food');
    if (resolved === null) throw new Error('decisione attesa');

    const eating = tickMany(resolved, map, 200);
    expect(eating.harvest.eaten).toBeGreaterThan(0);
    expect(eating.supplyArmed).toBe(false);
  });

  /**
   * Il bersaglio di chi pianta deve stare **sopra** la soglia di rientro, o
   * piantare non riarmerebbe mai il fronte.
   */
  it('la campagna punta sopra la soglia che fa rientrare l emergenza', () => {
    expect(BALANCE.food.targetCoverage).toBeGreaterThan(BALANCE.decisions.recoveryCoverage);
  });

  it('la dotazione copre lo stesso respiro a ogni taglia della citta', () => {
    // L'invariante che mancava, e adesso e' esatto invece che approssimato: la
    // dotazione si conta in tick di spesa vera, non in edifici interi.
    for (const population of [7, 48, 480, 4800]) {
      const decision = decisionAt(hungryCity(population), 0);
      if (decision === null) throw new Error('emergenza attesa');
      expect(decision.eventId).toBe('food-emergency');

      const demand = population * BALANCE.food.perResident;
      for (const option of decision.options) {
        expect((option.effect.food ?? 0) / demand).toBeCloseTo(BALANCE.decisions.reliefTicks);
      }
    }
  });

  // Cento tick di respiro erano dieci secondi a schermo: il tempo di leggere il
  // messaggio, non di piantare un campo.
  it('il respiro dura fino a ridosso della decisione successiva', () => {
    expect(BALANCE.decisions.reliefTicks).toBeGreaterThan(BALANCE.decisions.intervalTicks / 2);
    expect(BALANCE.decisions.reliefTicks).toBeLessThan(BALANCE.decisions.intervalTicks);
  });

  it('anche la fiera paga in proporzione alla citta che la fa', () => {
    // L'ultimo numero alimentare piatto: a costo fisso, a citta' grande la fiera
    // era soddisfazione gratis e le altre due alternative non esistevano piu'.
    const cost = (population: number): number => {
      const decision = decisionAt(investmentCity(population), 0);
      if (decision?.eventId !== 'investment') throw new Error('investimento atteso');
      return -(decision.options.find((entry) => entry.id === 'food-fair')?.effect.food ?? 0);
    };

    expect(cost(2400) / cost(240)).toBeCloseTo(10);
  });
});

/** Apre la decisione che il bacino sceglie per questo stato, o fallisce. */
function pending(state: SimState): SimState {
  const decision = decisionAt(state, state.tickCount);
  if (decision === null) throw new Error('decisione attesa');
  return { ...state, pendingDecision: decision };
}

/**
 * Una citta' che non riesce a sfamarsi: e' il contesto che apre l'emergenza.
 *
 * **Non e' «dispensa vuota».** Quella la tiene anche una citta' in pareggio, ed
 * era la ragione per cui l'emergenza non si spegneva mai: quello che la apre e'
 * il raccolto che non copre la domanda.
 */
function hungryCity(population = 48): SimState {
  const state = establishedCity(population);
  return { ...state, harvest: fedHarvest(population, 0.5) };
}

/**
 * Una citta' in cui l'unica voce ordinaria qualificata e' la piazza.
 *
 * Con il bacino, un contesto che qualifica due voci ne fa pescare una a caso —
 * corretto in gioco, inutile in un test che parla di *quella* scelta. Togliere
 * l'industria chiude `investment` e lascia una qualificata sola.
 */
function squareCity(population = 48): SimState {
  return { ...establishedCity(population), buildingCounts: [4, 1, 0, 1] };
}

/** L'opposto: senza civici resta qualificato solo l'investimento. */
function investmentCity(population = 48): SimState {
  return { ...establishedCity(population), buildingCounts: [4, 2, 2, 0] };
}

/**
 * Una citta' con la cassa in caduta e una policy da tagliare.
 *
 * L'autonomia si misura sul **ritmo**, non sul saldo: `funds.delta` negativo e
 * uno stock che copre meno di `fundsRunwayTicks` tick e' la definizione di
 * allarme, e senza il delta questa citta' sarebbe soltanto povera.
 */
function budgetCrisisCity(): SimState {
  const state = setPolicyActive(squareCity(), 'civicPride', true);
  return {
    ...state,
    funds: { stock: 100, delta: -10 },
  };
}

/**
 * Cantieri fermi: riserva sotto il minimo e produzione sotto il consumo.
 *
 * Senza civici e sotto la soglia di edifici dell'investimento, cosi' che
 * `works-backlog` sia l'unica voce ordinaria qualificata: con due candidate la
 * pesca ne prenderebbe una, ed e' giusto in gioco ma inutile qui.
 */
function stalledWorksCity(): SimState {
  return {
    ...establishedCity(),
    buildingCounts: [3, 1, 1, 0],
    materials: { stock: 10, delta: -1 },
    materialFlows: { ...createSimState().materialFlows, produced: 1, upkeep: 5 },
  };
}

/** Sovvenzione industriale attiva e citta' scontenta: la crisi che ne segue. */
function smogCity(): SimState {
  const state = setPolicyActive(establishedCity(), 'industrialSubsidy', true);
  return { ...state, satisfaction: 0.2 };
}

function establishedCity(population = 48): SimState {
  const state = createSimState();
  return {
    ...state,
    population: { stock: population, delta: 0 },
    food: { stock: 1_000_000, delta: 0 },
    // Una citta' stabilita mangia. Senza il referto varrebbe il raccolto vuoto
    // di `createSimState`, che `fedShareOf` legge come una carestia: l'emergenza
    // coprirebbe le altre famiglie e nessuna sarebbe raggiungibile.
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
