import { describe, expect, it } from 'vitest';
import { BALANCE } from '../sim/balance';
import { DAYLIGHT } from '../engine/daylight';
import { SIM_TICK_RATE } from '../game/simScene';
import { SEASON_COUNT } from '../sim/seasons';
import { cityClock, cityYear, clockTime } from './cityClock';

const YEAR = BALANCE.seasons.yearTicks;

describe('cityYear', () => {
  it('la citta nasce nel primo anno e cambia anno a ogni giro intero', () => {
    expect(cityYear(0)).toBe(1);
    expect(cityYear(YEAR - 1)).toBe(1);
    expect(cityYear(YEAR)).toBe(2);
    expect(cityYear(YEAR * 3 + 5)).toBe(4);
  });

  it('non scende sotto il primo anno ne inciampa su un tick assurdo', () => {
    expect(cityYear(-10)).toBe(1);
    expect(cityYear(Number.NaN)).toBe(1);
  });
});

describe('clockTime', () => {
  it('scrive ore e minuti a due cifre', () => {
    expect(clockTime(0)).toBe('00:00');
    expect(clockTime(9.5)).toBe('09:30');
    expect(clockTime(14 + 20 / 60)).toBe('14:20');
  });

  /**
   * Arrotondando al piu' vicino, l'ultimo minuto del giorno diventerebbe
   * `24:00`: un'ora che nessun orologio mostra, e che comparirebbe una volta
   * per giro proprio mentre si guarda il tramonto.
   */
  it('non inventa le ventiquattro', () => {
    expect(clockTime(23.999)).toBe('23:59');
    expect(clockTime(24)).toBe('00:00');
    expect(clockTime(-1)).toBe('23:00');
  });

  it('dichiara di non sapere invece di scrivere un numero falso', () => {
    expect(clockTime(Number.NaN)).toBe('--:--');
  });
});

describe('cityClock', () => {
  it('mette insieme le tre lancette', () => {
    // Il tick zero cade a meta' estate: e' `YEAR_START_PHASE`, e la ragione sta
    // in `src/sim/seasons.ts` — la citta' non deve nascere sotto la brina.
    expect(cityClock(0, 8)).toBe('Year 1 · Summer · 08:00');
    expect(cityClock(YEAR * 2, 18.25)).toBe('Year 3 · Summer · 18:15');
    // Un quarto d'anno piu' avanti e' un'altra stagione, con l'anno fermo.
    expect(cityClock(YEAR / 4, 6)).toBe('Year 1 · Autumn · 06:00');
  });

  /**
   * Un minuto di citta' dura un quarto di secondo: mostrandoli tutti la cifra
   * sfarfallerebbe invece di dire l'ora, e un numero illeggibile non dimostra
   * che il tempo scorre — che e' l'unica ragione per cui questa riga esiste.
   */
  it('si muove a quarti d ora, non a minuti', () => {
    expect(cityClock(0, 9.6)).toBe('Year 1 · Summer · 09:30');
    expect(cityClock(0, 9.99)).toBe('Year 1 · Summer · 09:45');
    expect(cityClock(0, 10)).toBe('Year 1 · Summer · 10:00');
  });

  /**
   * Il contratto che rende onesta la riga: una **stagione** dura esattamente un
   * giro del sole. Se i due numeri si separassero, ci sarebbe una stagione che
   * si apre e si chiude senza che il sole abbia fatto il giro — o un giorno che
   * ne attraversa due — e la data smetterebbe di stare accanto all'ora. La
   * ragione della scelta, e il prezzo che ha, stanno in `balance.ts`.
   */
  it('una stagione dura esattamente un giro del sole', () => {
    expect(YEAR / SEASON_COUNT / SIM_TICK_RATE).toBeCloseTo(DAYLIGHT.daySeconds, 6);
  });

  /** E il minimo dichiarato: cinque minuti veri di stagione a velocita' uno. */
  it('una stagione non scende sotto i cinque minuti', () => {
    expect(YEAR / SEASON_COUNT / SIM_TICK_RATE).toBeGreaterThanOrEqual(5 * 60);
  });
});
