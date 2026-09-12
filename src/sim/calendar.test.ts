import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import {
  birthShift,
  calendarPhaseOf,
  calendarSeasonOf,
  calendarTickOf,
  jumpToSeason,
  shiftToSeason,
  type CalendarState,
} from './calendar';
import { harvestFactorAt, SEASON, SEASONS, YEAR_START_PHASE, type Season } from './seasons';
import { createSimState, reviveSimState, toSimStateData, type SimStateData } from './SimState';

const YEAR = BALANCE.seasons.yearTicks;

/** Un calendario nudo: qui non serve una simulazione, servono due numeri. */
function at(tickCount: number, calendarShift = 0): CalendarState {
  return { tickCount, calendarShift };
}

describe('calendarTickOf', () => {
  it('somma lo scorrimento all eta della citta', () => {
    expect(calendarTickOf(at(120))).toBe(120);
    expect(calendarTickOf(at(120, 900))).toBe(1020);
  });

  it('tratta uno scorrimento illeggibile come nessuno scorrimento', () => {
    // Non e' difesa di superficie: `calendarShift` arriva anche da un file di
    // salvataggio che l'utente puo' aver riscritto a mano, e un `NaN` qui
    // diventerebbe una fase `NaN`, cioe' un prato senza colore.
    expect(calendarTickOf(at(120, Number.NaN))).toBe(120);
    expect(calendarSeasonOf(at(0, Number.NaN))).toBe(SEASON.summer);
  });
});

describe('birthShift', () => {
  /**
   * Il default non e' una scelta di comodo: senza `?calendar=` una partita nasce
   * dove e' sempre nata, con lo stesso raccolto di partenza. Se questo diventasse
   * diverso da zero, ogni citta' nuova cambierebbe bilanciamento in silenzio.
   */
  it('lascia la partita d estate esattamente dov era', () => {
    expect(birthShift(SEASON.summer)).toBe(0);
    expect(calendarSeasonOf(at(0, birthShift(SEASON.summer)))).toBe(SEASON.summer);
    expect(calendarPhaseOf(at(0, birthShift(SEASON.summer)))).toBeCloseTo(YEAR_START_PHASE, 12);
  });

  it('fa nascere la citta nel cuore della stagione chiesta', () => {
    for (const season of SEASONS) {
      const born = at(0, birthShift(season));
      expect(calendarSeasonOf(born)).toBe(season);
      // Nel cuore e non sul confine: mezza stagione dall'inizio, cioe' il punto
      // in cui la resa vale quello che la stagione promette.
      const intoSeason = calendarPhaseOf(born) - season / SEASONS.length;
      expect(intoSeason).toBeCloseTo(0.5 / SEASONS.length, 6);
    }
  });

  it('resta dentro l anno, senza regalarne uno', () => {
    for (const season of SEASONS) {
      expect(birthShift(season)).toBeGreaterThanOrEqual(0);
      expect(birthShift(season)).toBeLessThan(YEAR);
    }
  });
});

describe('shiftToSeason', () => {
  it('porta il calendario al primo giorno della stagione chiesta', () => {
    for (const season of SEASONS) {
      const moved = at(0, shiftToSeason(at(0), season));
      expect(calendarSeasonOf(moved)).toBe(season);
    }
  });

  /**
   * La stagione appena cominciata dev'essere quella chiesta e non la successiva:
   * e' il caso che un arrotondamento sbagliato romperebbe, lasciando il bottone
   * premuto spento e la citta' un capello prima del confine.
   */
  it('atterra all inizio della stagione, non un tick prima', () => {
    const from = at(0);
    for (const season of SEASONS) {
      // L'estate no: e' quella in cui il tick zero sta gia', e un salto che non
      // avviene non ha un confine su cui atterrare. Che non si muova lo dice il
      // test qui sotto.
      if (calendarSeasonOf(from) === season) continue;
      const shift = shiftToSeason(from, season);
      expect(calendarSeasonOf(at(from.tickCount, shift))).toBe(season);
      expect(calendarSeasonOf(at(from.tickCount - 1, shift))).not.toBe(season);
    }
  });

  it('non muove niente se la citta e gia in quella stagione', () => {
    // Zero e' meta' estate: chiedere l'estate da meta' estate non deve buttare
    // via i tre quarti d'anno che mancano al prossimo giro.
    expect(shiftToSeason(at(0), SEASON.summer)).toBe(0);
    const inWinter = at(0, birthShift(SEASON.winter));
    expect(shiftToSeason(inWinter, SEASON.winter)).toBe(inWinter.calendarShift);
  });

  it('va sempre avanti, da qualunque punto dell anno', () => {
    for (let tick = 0; tick < YEAR; tick += Math.floor(YEAR / 12)) {
      for (const season of SEASONS) {
        const before = at(tick);
        const shift = shiftToSeason(before, season);
        expect(shift).toBeGreaterThanOrEqual(before.calendarShift);
        expect(shift - before.calendarShift).toBeLessThan(YEAR);
      }
    }
  });

  it('accumula i salti senza mai tornare indietro', () => {
    let state = at(0);
    let previous = calendarTickOf(state);
    // Due giri interi di stagioni, che e' il caso in cui uno scorrimento tenuto
    // dentro l'anno con un modulo si vedrebbe: la data farebbe un passo
    // all'indietro e l'orologio dell'HUD perderebbe un anno.
    for (let round = 0; round < 2; round++) {
      for (const season of SEASONS) {
        state = at(state.tickCount, shiftToSeason(state, season));
        expect(calendarTickOf(state)).toBeGreaterThanOrEqual(previous);
        previous = calendarTickOf(state);
      }
    }
  });
});

describe('il calendario nel salvataggio', () => {
  it('riapre la partita nel mese in cui e stata lasciata', () => {
    const moved = jumpToSeason(createSimState(), SEASON.winter);
    const revived = reviveSimState(toSimStateData(moved));
    expect(revived.calendarShift).toBe(moved.calendarShift);
    expect(calendarSeasonOf(revived)).toBe(SEASON.winter);
  });

  /**
   * Un file scritto prima che il calendario si potesse spostare non ha il campo:
   * torna a zero, cioe' con l'anno agganciato all'eta' della citta'. E' come
   * quella partita si e' sempre comportata, e nessuno perde una stagione che non
   * aveva mai scelto.
   */
  it('apre un salvataggio piu vecchio con l anno agganciato all eta', () => {
    const { calendarShift: _absent, ...older } = toSimStateData(createSimState());
    const revived = reviveSimState(older as SimStateData);
    expect(revived.calendarShift).toBe(0);
    expect(calendarSeasonOf(revived)).toBe(SEASON.summer);
  });
});

describe('jumpToSeason', () => {
  it('lascia lo stato per identita quando non c e niente da spostare', () => {
    const state = createSimState();
    expect(jumpToSeason(state, SEASON.summer)).toBe(state);
  });

  it('sposta soltanto il calendario, non l eta della citta', () => {
    const state = createSimState();
    const moved = jumpToSeason(state, SEASON.winter);
    expect(moved.tickCount).toBe(state.tickCount);
    expect(moved.calendarShift).toBeGreaterThan(0);
    expect(calendarSeasonOf(moved)).toBe(SEASON.winter);
  });

  /**
   * Colore e resa escono dalla stessa fase, ed e' il punto dell'intera feature:
   * un inverno che si vede senza sentirsi sarebbe decorazione.
   */
  it('porta con se il raccolto della stagione in cui arriva', () => {
    const state = createSimState();
    const seasons: readonly Season[] = SEASONS;
    const yields = seasons.map((season) => harvestFactorAt(calendarTickOf(jumpToSeason(state, season))));
    const [spring, summer, autumn, winter] = yields as [number, number, number, number];

    // All'**inizio** delle stagioni la resa non e' agli estremi — quelli stanno
    // al centro — ma l'ordine e' quello dell'anno: si sale verso l'estate e si
    // scende verso l'inverno.
    expect(summer).toBeGreaterThan(1);
    expect(autumn).toBeGreaterThan(1);
    expect(spring).toBeLessThan(1);
    expect(winter).toBeLessThan(1);
    expect(summer).toBeGreaterThan(winter);
  });
});
