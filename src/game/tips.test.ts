import { describe, expect, it } from 'vitest';
import {
  addBuilding,
  addCatalyst,
  BALANCE,
  BUILDING_CLASS,
  catalystById,
  createSimState,
  EMPTY_HARVEST,
  FARM_KIND,
  type SimState,
} from '../sim';
import { evergreenTip, tipsFor, urgentTip, TIP_TURN_TICKS } from './tips';

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

/**
 * Una citta' che funziona: oltre il tutorial, sfamata e con campi a sufficienza.
 *
 * **I campi ci sono di proposito.** Una fixture senza lotti ha sempre un deficit
 * agricolo, quindi `countryside-behind` risponderebbe a ogni domanda e ogni
 * prova su un altro consiglio misurerebbe quello: il punto di partenza di un
 * test sui consigli dev'essere una citta' a cui non manca niente.
 */
function city(overrides: Partial<SimState> = {}): SimState {
  let state = founded();
  state = addBuilding(state, { x: 0, y: 20, class: BUILDING_CLASS.residential });
  state = addBuilding(state, { x: 1, y: 20, class: BUILDING_CLASS.industrial });
  return {
    ...state,
    population: { stock: POPULATION, delta: 1 },
    staffing: 1,
    farmCounts: [12, 0, 0],
    food: { stock: 500, delta: 1 },
    harvest: fedAt(POPULATION, 1),
    materials: { stock: 200, delta: 1 },
    funds: { stock: 0, delta: 0 },
    ...overrides,
  };
}

/** Cibo servito per una frazione della domanda: e' `fed` scritto dal referto. */
function fedAt(population: number, share: number): SimState['harvest'] {
  const eaten = population * BALANCE.food.perResident * share;
  return { ...EMPTY_HARVEST, grown: [eaten, 0, 0], eaten };
}

function starving(overrides: Partial<SimState> = {}): SimState {
  return city({
    food: { stock: 0, delta: 0 },
    harvest: fedAt(POPULATION, 0.4),
    ...overrides,
  });
}

function idOf(state: SimState): string | null {
  return urgentTip(state)?.id ?? null;
}

describe('tips — cosa la citta’ ha da dire', () => {
  it('ogni consiglio ha un id unico e non e’ mai una riga vuota', () => {
    const tips = tipsFor(starving());
    expect(tips.length).toBeGreaterThan(0);
    expect(new Set(tips.map((tip) => tip.id)).size).toBe(tips.length);
    for (const tip of tips) {
      expect(tip.title.length, tip.id).toBeGreaterThan(0);
      expect(tip.message.length, tip.id).toBeGreaterThan(0);
    }
  });

  it('mette la crisi davanti a tutto il resto', () => {
    // Stessa citta', due guai insieme: quello che sta uccidendo la popolazione
    // deve vincere la riga contro quello che le costa dei fondi.
    const state = starving({
      funds: { stock: 0, delta: -5 },
      staffing: 0.2,
    });
    expect(idOf(state)).toBe('food-shortage');
    expect(tipsFor(state).map((tip) => tip.kind)[0]).toBe('crisis');
  });

  it('non propone mai una meccanica come cosa urgente', () => {
    // Gli evergreen sono veri sempre, quindi entrerebbero in ogni elenco: se
    // scivolassero in `urgentTip` coprirebbero una crisi con una nozione.
    for (const state of [city(), starving()]) {
      expect(urgentTip(state)?.kind).not.toBe('mechanic');
    }
  });
});

describe('tips — il consiglio sul cibo nomina il gesto giusto', () => {
  it('senza torri ne’ porto propone tutte e due le vie d’uscita', () => {
    const message = urgentTip(starving())?.message ?? '';
    expect(message).toContain('Transit');
    expect(message).toContain('Port');
    // La rassicurazione resta: la fame non e' una sconfitta, e dirlo evita che
    // il giocatore ricominci la partita quando basterebbe aspettare.
    expect(message).toContain('can recover');
  });

  it('a chi il porto ce l’ha gia’ non lo ripropone', () => {
    const state = starving({
      trade: { connected: true, links: ['port'], food: 4, materials: 0, funds: 0 },
    });
    const message = urgentTip(state)?.message ?? '';
    expect(message).toContain('Prioritize food');
    expect(message).not.toContain('a Port opens');
  });

  it('a chi le torri ce le ha gia’ parla di commercio e non di torri', () => {
    const farmCounts = [0, 0, 0];
    farmCounts[FARM_KIND.tower] = 4;
    const message = urgentTip(starving({ farmCounts }))?.message ?? '';
    expect(message).toContain('Port');
    expect(message).not.toContain('Transit');
  });
});

describe('tips — i colli di bottiglia che nessuna barra mostra', () => {
  it('dice l’organico quando morde, e tace quando non morde', () => {
    expect(idOf(city({ staffing: 0.42 }))).toBe('short-handed');
    expect(urgentTip(city({ staffing: 0.42 }))?.message).toContain('42%');
    expect(idOf(city({ staffing: 1 }))).not.toBe('short-handed');
  });

  it('non accusa di essere a corto di braccia una citta’ che non ne chiede', () => {
    // `staffing` vale 0 anche quando **nessuno** cerca lavoro, ed e' il caso di
    // una citta' appena fondata: senza questa guardia il primo messaggio dopo il
    // tutorial sarebbe un allarme su un problema che non esiste.
    expect(idOf({ ...founded(), staffing: 0 })).not.toBe('short-handed');
  });

  it('avvisa che la campagna e’ indietro **prima** che la dispensa finisca', () => {
    // La citta' mangia ancora: e' esattamente il momento in cui il consiglio ha
    // valore, perche' un lotto piantato adesso fa in tempo a crescere.
    const state = city({
      population: { stock: 4000, delta: 10 },
      harvest: fedAt(4000, 1),
    });
    expect(idOf(state)).toBe('countryside-behind');
  });
});

describe('tips — le opportunita’', () => {
  it('propone il porto solo a chi puo’ permetterselo e non ne ha', () => {
    const cost = catalystById('port').cost;
    expect(idOf(city({ funds: { stock: cost, delta: 1 } }))).toBe('open-trade');
    expect(idOf(city({ funds: { stock: cost - 1, delta: 1 } }))).not.toBe('open-trade');
  });

  it('dice a chi ha un molo solo che gliene manca un secondo', () => {
    const state = addCatalyst(city(), {
      x: 200, y: 0, class: catalystById('ferry').class, kind: 'ferry', strength: 180, radius: 12,
    });
    expect(idOf(state)).toBe('ferry-needs-a-pair');
  });
});

describe('tips — la rotazione degli evergreen', () => {
  it('percorre tutto l’elenco invece di saltarne meta’', () => {
    // **E' il difetto che ha fatto spostare il turno fuori da qui.** Chi mostra
    // questi consigli li alterna con il traguardo, quindi ne consuma uno ogni
    // due giri: con l'indice ricavato dal tick, meta' dell'elenco non sarebbe
    // uscita mai.
    const state = city();
    const available = tipsFor(state).filter((tip) => tip.kind === 'mechanic');
    expect(available.length).toBeGreaterThan(1);

    const seen = new Set<string>();
    for (let turn = 0; turn < available.length * 2; turn++) {
      seen.add(evergreenTip(state, turn)?.id ?? '');
    }
    expect([...seen].sort()).toEqual(available.map((tip) => tip.id).sort());
  });

  it('e’ deterministico e non ha un turno che manda in errore', () => {
    const state = city();
    expect(evergreenTip(state, 3)).toEqual(evergreenTip(state, 3));
    expect(evergreenTip(state, 0)).not.toBeNull();
    expect(() => evergreenTip(state, -1)).not.toThrow();
  });

  it('tace del tutto quando non c’e’ nessuna regola osservabile', () => {
    // Una citta' vuota non ha campi da mangiarsi ne' torri da spiegare, e i due
    // catalizzatori che servono all'uso misto non ci sono: qui la voce non ha
    // niente da insegnare, e deve dirlo tacendo invece di riempire.
    expect(evergreenTip(createSimState(), 0)).toBeNull();
  });

  it('la durata di un turno e’ quella che la voce usa per alternare', () => {
    expect(TIP_TURN_TICKS).toBeGreaterThan(0);
  });
});
