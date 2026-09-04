import { describe, expect, it } from 'vitest';
import {
  addBuilding,
  addCatalyst,
  BALANCE,
  BUILDING_CLASS,
  catalystById,
  coverageReportOf,
  createSimState,
  EMPTY_COMMERCE,
  EMPTY_HARVEST,
  FARM_KIND,
  type SimState,
} from '../sim';
import { tipsFor, urgentTip, type GameTip } from './tips';

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

  it('la voce parla solo di salute, mai di rotta', () => {
    // Le opportunita' e le meccaniche stanno nel coach: qui restano solo crisi e
    // colli di bottiglia, ed e' la garanzia che non ci siano due voci sulla
    // stessa riga di schermo.
    for (const state of [city(), starving()]) {
      for (const tip of tipsFor(state)) {
        expect(['crisis', 'bottleneck']).toContain(tip.kind);
      }
    }
  });
});

describe('tips — il fronte del declino dice la verita’ sul proprio numero', () => {
  /**
   * Una citta' con quel rapporto di copertura e quel fronte.
   *
   * Il referto viene da `coverageReportOf` e non scritto a mano: `base` e' cio'
   * su cui si decide se qualcuno se ne va davvero, e un letterale lo farebbe
   * divergere dall'aritmetica che il tick usa.
   */
  function covered(ratio: number, decayPressure: number): SimState {
    const demand = POPULATION * BALANCE.coverage.demandPerResident;
    return city({
      decayPressure,
      coverageReport: coverageReportOf({
        population: POPULATION,
        civic: 0,
        funded: 1,
        services: (ratio * demand) / BALANCE.coverage.perService,
      }),
    });
  }

  // Il difetto che si vedeva a schermo: «Blocks are emptying: services cover
  // 105%» diceva due cose false insieme — non si stava svuotando niente, e il
  // numero smentiva la frase che lo accompagnava.
  it('sopra il pareggio non dice che gli isolati si svuotano', () => {
    const tip = urgentTip(covered(1.05, 1));
    expect(tip?.id).toBe('growth-halted');
    expect(tip?.title).not.toContain('emptying');
    expect(tip?.message).toContain('No blocks are being lost');
  });

  it('e dice quale numero serve per ripartire, non solo quello che c’e’', () => {
    const target = `${Math.round(BALANCE.decay.recoveryCoverage * 100)}%`;
    const tip = urgentTip(covered(1.05, 1));
    expect(tip?.title).toContain('105%');
    expect(tip?.title).toContain(target);
  });

  it('quando gli isolati si svuotano davvero, lo dice ancora', () => {
    const tip = urgentTip(covered(0.1, 1));
    expect(tip?.id).toBe('blocks-abandoned');
    expect(tip?.title).toContain('emptying');
  });

  it('un fronte che si carica allarma; uno che rientra da’ il riscontro', () => {
    expect(tipsFor(covered(0.5, 0.4)).map((tip) => tip.id))
      .toContain('services-falling-behind');
    expect(tipsFor(covered(1.05, 0.4)).map((tip) => tip.id))
      .toContain('services-recovering');
  });

  // Una notizia buona non deve prendersi la riga sola della targa: il consiglio
  // piu' urgente resta il problema vero.
  it('il riscontro non scavalca un collo di bottiglia vero', () => {
    const state = covered(1.05, 0.4);
    expect(idOf({ ...state, staffing: 0.2 })).toBe('short-handed');
  });

  it('a fronte scarico non dice niente del declino', () => {
    const ids = tipsFor(covered(1.05, 0)).map((tip) => tip.id);
    expect(ids).not.toContain('services-recovering');
    expect(ids).not.toContain('growth-halted');
  });
});

describe('tips — il consiglio sul cibo nomina il gesto giusto', () => {
  it('senza torri ne’ porto propone tutte e due le vie d’uscita', () => {
    const message = urgentTip(starving())?.message ?? '';
    expect(message).toContain('Greenhouse');
    expect(message).toContain('Port');
    // La rassicurazione resta: la fame non e' una sconfitta, e dirlo evita che
    // il giocatore ricominci la partita quando basterebbe aspettare.
    expect(message).toContain('can recover');
  });

  it('a chi il porto ce l’ha gia’ non lo ripropone', () => {
    const state = starving({
      trade: { connected: true, links: ['port'], food: 4, materials: 0, materialsIn: 0, funds: 0 },
    });
    const message = urgentTip(state)?.message ?? '';
    expect(message).toContain('Prioritize food');
    expect(message).not.toContain('a Port opens');
  });

  it('a chi le torri ce le ha gia’ parla di commercio e non di serra', () => {
    const farmCounts = [0, 0, 0];
    farmCounts[FARM_KIND.tower] = 4;
    const message = urgentTip(starving({ farmCounts }))?.message ?? '';
    expect(message).toContain('Port');
    expect(message).not.toContain('Greenhouse');
  });

  it('non chiede una seconda serra quando la prima deve ancora produrre una torre', () => {
    const state = addCatalyst(starving(), {
      x: 300, y: 0, class: catalystById('greenhouse').class, kind: 'greenhouse',
      strength: 200, radius: 12,
    });
    const message = urgentTip(state)?.message ?? '';
    expect(message).toContain('already in place');
    expect(message).toContain('Hydroponic tower');
    expect(message).not.toContain('place a Greenhouse');
  });

  /**
   * La riga che il consiglio generico non sapeva dire. «Sovrapponi l'anello alla
   * fabbrica» e' vero anche quando l'anello e' gia' sovrapposto: da li' in poi il
   * giocatore aspetta senza sapere se sta aspettando qualcosa che arrivera'.
   */
  it('con un industriale nell’anello dice quale soglia manca e di quanto', () => {
    // La serra addosso all'industriale che `city()` costruisce a (1, 20).
    const state = addCatalyst(starving(), {
      x: 1, y: 20, class: catalystById('greenhouse').class, kind: 'greenhouse',
      strength: 200, radius: 40,
    });
    const tip = urgentTip(state);
    const title = tip?.title ?? '';
    const message = tip?.message ?? '';

    expect(title).toContain('best block');
    // I due numeri della soglia vincolante, non una frase qualitativa.
    const shown = title.match(/at (\d+)% (density|industry), towers need (\d+)%/);
    expect(shown).not.toBeNull();
    expect(message).toContain('Hydroponic tower needs');
    // E un gesto, che e' la regola del modulo: la metrica ne sceglie uno.
    expect(message).toMatch(/place a(nother)? (Factory|Market)/);

    // Le metriche del profilo stanno in [0, 1]: arrotondarle senza scalarle
    // dava «0 of 0», due zeri al posto di 31% e 40%. La riga vale solo se i due
    // numeri sono numeri, e il secondo dev'essere piu' alto del primo — sotto
    // soglia e' la ragione per cui la torre non c'e' ancora.
    const have = Number(shown?.[1]);
    const need = Number(shown?.[3]);
    expect(have).toBeGreaterThan(0);
    expect(need).toBeGreaterThan(have);
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

  it('usa la serra esistente invece di suggerirne un’altra quando la campagna insegue', () => {
    let state = city({
      population: { stock: 4000, delta: 10 },
      harvest: fedAt(4000, 1),
    });
    state = addCatalyst(state, {
      x: 300, y: 0, class: catalystById('greenhouse').class, kind: 'greenhouse',
      strength: 200, radius: 12,
    });
    const message = urgentTip(state)?.message ?? '';
    expect(message).toContain('existing Greenhouse');
    expect(message).not.toContain('place a Greenhouse');
  });
});

/**
 * **Il titolo e' tutto cio' che il giocatore legge**, e queste sono le due prove
 * che lo tengono tale. La targa dell'HUD mostra il titolo e nient'altro: il
 * messaggio sta nel cassetto Citta', che si apre solo se si decide di aprirlo.
 *
 * Le prove nascono da due guasti opposti visti sullo stesso schermo — un titolo
 * cosi' lungo che l'ellissi ne mangiava il rimedio, e cinque cosi' corti da non
 * dire niente — e li fissano dai due lati: **entra nella targa** e **nomina
 * qualcosa che si puo' fare**.
 */
describe('tips — la targa deve bastare da sola', () => {
  /** Due righe da ~55 caratteri: quanto `.hud-toast[data-kind="condition"]` concede. */
  const PLAQUE_BUDGET = 110;

  /** Ogni consiglio che il modulo sa produrre, uno stato per ciascuno. */
  function everyTip(): readonly GameTip[] {
    const crowded = city({ population: { stock: 4000, delta: 10 }, harvest: fedAt(4000, 1) });
    const states: readonly SimState[] = [
      starving(),
      starving({ funds: { stock: 12, delta: -5 } }),
      city({ satisfaction: 0.08 }),
      city({ staffing: 0.42 }),
      city({
        materials: { stock: 0, delta: 0 },
        commerce: { ...EMPTY_COMMERCE, demand: 40, capacity: 30, served: 0 },
      }),
      crowded,
      addCatalyst(crowded, {
        x: 300, y: 0, class: catalystById('greenhouse').class, kind: 'greenhouse',
        strength: 200, radius: 12,
      }),
    ];
    return states.flatMap((state) => tipsFor(state));
  }

  it('copre ogni consiglio che il modulo sa produrre', () => {
    // Senza questa riga le due prove sotto passerebbero anche misurando meta'
    // dei consigli, e sarebbe il modo silenzioso in cui smettono di valere.
    expect(new Set(everyTip().map((tip) => tip.id))).toEqual(new Set([
      'food-shortage', 'budget-deficit', 'unhappy-city',
      'short-handed', 'empty-shelves', 'countryside-behind',
    ]));
  });

  it('ogni titolo entra nella targa e separa la causa dal gesto', () => {
    for (const tip of everyTip()) {
      expect(tip.title.length, `${tip.id}: «${tip.title}»`).toBeLessThanOrEqual(PLAQUE_BUDGET);
      // Il trattino o i due punti sono la giuntura fra «cosa succede» e «cosa
      // fare»: un titolo che non ne ha nessuno sta dicendo una cosa sola.
      expect(tip.title, tip.id).toMatch(/[—:]/);
    }
  });

  it('non chiede mai un gesto che il giocatore non ha', () => {
    // Case e campi li fa crescere il driver di `src/world/` sul terreno che
    // trova libero: «Build more homes» e «Plant more farms» erano istruzioni per
    // un pulsante che non esiste. Il gesto vero e' il catalizzatore.
    for (const tip of everyTip()) {
      expect(tip.title, tip.id).not.toMatch(/build (more )?homes|plant (more )?farms/i);
    }
  });
});
