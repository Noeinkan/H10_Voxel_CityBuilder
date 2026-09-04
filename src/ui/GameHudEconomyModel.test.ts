import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  EMPTY_MATERIALS,
  EMPTY_SATISFACTION,
  NO_FUNDS_FLOW,
  type FundsReport,
  type FoodReport,
  type MaterialsReport,
  type SatisfactionReport,
} from '../sim';
import { EMPTY_HARVEST } from '../sim/farms';
import {
  foodHint,
  fundsHint,
  materialsHint,
  populationHint,
  satisfactionHint,
} from './GameHudEconomyModel';

/** Un referto dei fondi con le sole voci che interessano al caso. */
function funds(partial: Partial<FundsReport>): FundsReport {
  return { ...NO_FUNDS_FLOW, ...partial };
}

describe('fundsHint', () => {
  it('dice quanta parte delle bollette e stata pagata quando la cassa non basta', () => {
    expect(fundsHint(funds({ tax: 5, civic: 6, policies: 4, paid: 8 })))
      .toBe('Upkeep short: 80% of bills paid');
  });

  it('nomina la voce di spesa che supera le tasse', () => {
    expect(fundsHint(funds({ tax: 5, civic: 8, policies: 2, farms: 1, paid: 11 })))
      .toBe('Civic costs > taxes');
    expect(fundsHint(funds({ tax: 5, civic: 3, policies: 8, farms: 1, paid: 12 })))
      .toBe('Policy costs > taxes');
    expect(fundsHint(funds({ tax: 5, civic: 3, policies: 2, farms: 8, paid: 13 })))
      .toBe('Farm upkeep > taxes');
  });

  it('tace sul pareggio, e quando la spesa maggiore resta sotto le tasse', () => {
    expect(fundsHint(NO_FUNDS_FLOW)).toBe('Taxes cover the bills');
    expect(fundsHint(funds({ tax: 9, civic: 6, paid: 6 }))).toBe('Taxes cover the bills');
  });

  it('aggiunge la scadenza della cassa alla voce che pesa di piu', () => {
    expect(fundsHint(funds({ tax: 5, civic: 8, policies: 2, farms: 1, paid: 11 }), 23))
      .toBe('Civic costs > taxes · empty in ~23 ticks');
  });

  it('smette di rassicurare quando nessuna voce sfonda ma la somma si', () => {
    // Nessuna spesa supera le tasse da sola, e la cassa cala lo stesso: e' la
    // somma a non tornare, ed e' quello che la riga deve dire.
    expect(fundsHint(funds({ tax: 9, civic: 6, paid: 6 }), 1))
      .toBe('Upkeep outruns income · empty in ~1 tick');
  });

  it('non prevede una scadenza su una cassa gia finita', () => {
    expect(fundsHint(funds({ tax: 5, civic: 6, policies: 4, paid: 8 }), 0))
      .toBe('Upkeep short: 80% of bills paid');
  });
});

describe('foodHint', () => {
  /**
   * A meta' primavera la resa vale esattamente l'anno medio, quindi la riga non
   * porta la coda della stagione: e' il momento in cui il resto della frase si
   * legge da solo. Che la stagione compaia quando c'e' lo verifica il caso in
   * fondo.
   */
  const NEUTRAL = BALANCE.seasons.yearTicks / 8;

  it('annuncia le razioni quando la domanda non e servita tutta', () => {
    // Domanda 100 × 0.05 = 5, mangiato 3: il 60% della domanda.
    expect(foodHint(100, { ...EMPTY_HARVEST, eaten: 3 }, [0, 0, 0], 1, NEUTRAL))
      .toBe('Rationing: 60% of demand');
  });

  it('conta i campi che mancano al piano, al singolare e al plurale', () => {
    // Domanda 40 × 0.05 = 2, tutta servita; il piano a 1.15 chiede 2.3, e un
    // campo sfama 2.4: ne manca uno.
    const fedHarvest: FoodReport = { ...EMPTY_HARVEST, eaten: 2 };
    expect(foodHint(40, fedHarvest, [0, 0, 0], 1, NEUTRAL)).toBe('1 field under target');

    // Domanda 80 × 0.05 = 4, tutta servita; il piano chiede 4.6: due campi.
    expect(foodHint(80, { ...EMPTY_HARVEST, eaten: 4 }, [0, 0, 0], 1, NEUTRAL))
      .toBe('2 fields under target');
  });

  it('dichiara la copertura quando i campi bastano al piano', () => {
    // Tre campi rendono 3 × 2.4 = 7.2, sopra il piano di 4.6.
    expect(foodHint(80, { ...EMPTY_HARVEST, eaten: 4 }, [3, 0, 0], 1, NEUTRAL))
      .toBe('Covered: fields match the city');
  });

  /**
   * La stagione va detta **anche** a citta' sfamata: senza, l'unico modo di
   * accorgersi che la dispensa sta calando sarebbe guardarla scendere per un
   * minuto, e una scorta che non si vede non e' una mossa.
   */
  it('nomina la stagione quando sposta la resa, e tace quando non la sposta', () => {
    const year = BALANCE.seasons.yearTicks;
    const covered: FoodReport = { ...EMPTY_HARVEST, eaten: 4 };

    expect(foodHint(80, covered, [3, 0, 0], 1, Math.round(year * 0.875)))
      .toBe('Covered: fields match the city · Winter yield −35%');
    expect(foodHint(80, covered, [3, 0, 0], 1, Math.round(year * 0.375)))
      .toBe('Covered: fields match the city · Summer yield +35%');
    // A meta' autunno la curva passa per l'anno medio: niente da nominare.
    expect(foodHint(80, covered, [3, 0, 0], 1, Math.round(year * 0.625)))
      .toBe('Covered: fields match the city');
  });
});

describe('materialsHint', () => {
  const waiting: MaterialsReport = { ...EMPTY_MATERIALS, reserve: 12, waitingCost: 20 };

  it('mette davanti il cantiere in attesa, con quanto manca', () => {
    expect(materialsHint(waiting, 14)).toBe('Construction waiting: 20 materials · ~14 ticks away');
    expect(materialsHint(waiting, 1)).toBe('Construction waiting: 20 materials · ~1 tick away');
  });

  it('dice che la scorta e ferma invece di tacere: tacere leggerebbe «presto»', () => {
    expect(materialsHint(waiting)).toBe('Construction waiting: 20 materials · stock not growing');
  });

  it('annuncia il cantiere gia pagabile', () => {
    expect(materialsHint(waiting, 0)).toBe('Construction waiting: 20 materials · starting now');
  });

  it('sulla riserva dice che nessuno la sta aspettando', () => {
    const report: MaterialsReport = { ...EMPTY_MATERIALS, reserve: 12 };
    expect(materialsHint(report)).toBe('12 reserved · nothing waiting on them');
  });

  it('altrimenti dichiara che l industria copre la citta', () => {
    expect(materialsHint(EMPTY_MATERIALS)).toBe('Industry covers the city');
  });
});

describe('populationHint', () => {
  it('senza case chiede di lasciar crescere gli isolati', () => {
    expect(populationHint(0, 0, 1, 1)).toBe('No homes yet: let buildings grow');
  });

  it('a capienza piena chiede case nuove', () => {
    expect(populationHint(24, 24, 1, 1)).toBe('Housing full: build homes');
  });

  it('grida la terra che finisce prima della fame che frena', () => {
    expect(populationHint(10, 24, 0.1, 0.9)).toBe('City is running out of land');
  });

  it('nomina il cibo quando e lui a trattenere la crescita', () => {
    expect(populationHint(10, 24, 1, 0.5)).toBe('Growth held back: not enough food');
  });

  it('altrimenti conta le case libere', () => {
    expect(populationHint(10, 24, 1, 1)).toBe('14 homes free');
  });

  it('dice in quanto si riempiono, quando la stima c e', () => {
    expect(populationHint(10, 24, 1, 1, 39)).toBe('14 homes free · full in ~39 ticks');
  });

  it('tace sulla stima quando le case sono gia prese', () => {
    expect(populationHint(10, 24, 1, 1, 0)).toBe('14 homes free');
  });
});

describe('satisfactionHint', () => {
  const calm: SatisfactionReport = {
    ...EMPTY_SATISFACTION,
    occupancy: 0.8,
    target: BALANCE.satisfaction.base,
  };

  it('nomina l affollamento quando le case traboccano', () => {
    const crowded: SatisfactionReport = { ...calm, occupancy: 1.5, crowding: 0.2 };
    expect(satisfactionHint(crowded, NO_FUNDS_FLOW)).toBe('Crowding: homes 150% full');
  });

  it('nomina i servizi civici quando non sono pagati per intero', () => {
    expect(satisfactionHint(calm, funds({ civic: 10, paid: 5 })))
      .toBe('Civic services underfunded');
  });

  it('nomina i negozi quando servono troppo poca domanda', () => {
    const retail = 0.3 * BALANCE.commerce.satisfactionPerService;
    const report: SatisfactionReport = { ...calm, retail };
    expect(satisfactionHint(report, funds({ civic: 10, paid: 10 })))
      .toBe('Shops falling behind: service at 30%');
  });

  it('altrimenti dichiara la citta contenta', () => {
    const retail = BALANCE.commerce.satisfactionPerService;
    const report: SatisfactionReport = { ...calm, retail };
    expect(satisfactionHint(report, funds({ civic: 10, paid: 10 })))
      .toBe('City is content');
  });
});
