import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { harvestFactorAt, SEASON, SEASON_NAMES, seasonAt, yearPhaseAt } from './seasons';

const YEAR = BALANCE.seasons.yearTicks;

describe('yearPhaseAt', () => {
  it('parte da zero e torna da capo dopo un anno', () => {
    expect(yearPhaseAt(0)).toBe(0);
    expect(yearPhaseAt(YEAR)).toBe(0);
    expect(yearPhaseAt(YEAR * 7)).toBe(0);
    expect(yearPhaseAt(YEAR / 2)).toBeCloseTo(0.5, 12);
  });

  it('resta in [0, 1) anche prima dell inizio della partita', () => {
    for (const tick of [-1, -YEAR / 3, -YEAR, -YEAR * 2 - 5]) {
      const phase = yearPhaseAt(tick);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});

describe('seasonAt', () => {
  it('divide l anno in quattro quarti uguali, nell ordine dichiarato', () => {
    expect(seasonAt(0)).toBe(SEASON.spring);
    expect(seasonAt(YEAR * 0.3)).toBe(SEASON.summer);
    expect(seasonAt(YEAR * 0.55)).toBe(SEASON.autumn);
    expect(seasonAt(YEAR * 0.8)).toBe(SEASON.winter);
    expect(seasonAt(YEAR - 1)).toBe(SEASON.winter);
    expect(seasonAt(YEAR)).toBe(SEASON.spring);
  });

  it('ha un nome per ogni indice, senza buchi', () => {
    for (const season of [SEASON.spring, SEASON.summer, SEASON.autumn, SEASON.winter]) {
      expect(SEASON_NAMES[season]).toMatch(/^[A-Z][a-z]+$/);
    }
  });
});

describe('harvestFactorAt', () => {
  /**
   * E' la proprieta' su cui si regge il dimensionamento della campagna:
   * `missingPlotsOf` non passa il fattore e conta sulla resa nominale, quindi se
   * la media annua non valesse uno pianterebbe sistematicamente troppo o troppo
   * poco, per sempre.
   */
  it('vale in media esattamente uno sull anno', () => {
    let sum = 0;
    for (let tick = 0; tick < YEAR; tick++) sum += harvestFactorAt(tick);
    expect(sum / YEAR).toBeCloseTo(1, 6);
  });

  it('ha il picco a meta estate e il minimo a meta inverno', () => {
    const amplitude = BALANCE.seasons.yieldAmplitude;
    expect(harvestFactorAt(YEAR * 0.375)).toBeCloseTo(1 + amplitude, 6);
    expect(harvestFactorAt(YEAR * 0.875)).toBeCloseTo(1 - amplitude, 6);
    // Primavera e autunno valgono uno al loro centro: sono le due meta' in cui
    // la citta' cambia verso, non due stagioni con un segno proprio.
    expect(harvestFactorAt(YEAR * 0.125)).toBeCloseTo(1, 6);
    expect(harvestFactorAt(YEAR * 0.625)).toBeCloseTo(1, 6);
  });

  /**
   * Un moltiplicatore a gradini farebbe saltare il raccolto di mezzo da un tick
   * al successivo, e a schermo sarebbe un guasto invece che una stagione.
   */
  it('non ha scalini: fra due tick vicini si muove di pochissimo', () => {
    let worst = 0;
    for (let tick = 0; tick < YEAR; tick++) {
      worst = Math.max(worst, Math.abs(harvestFactorAt(tick + 1) - harvestFactorAt(tick)));
    }
    expect(worst).toBeLessThan(0.002);
  });

  it('non arriva mai a resa nulla, o l inverno sarebbe una pausa e non una stagione', () => {
    for (let tick = 0; tick < YEAR; tick++) {
      expect(harvestFactorAt(tick)).toBeGreaterThan(0.5);
    }
  });
});

/**
 * Il contratto che lega l'ampiezza al piano, e la ragione per cui i due numeri
 * non si toccano separatamente.
 *
 * Una campagna dimensionata come `missingPlotsOf` la vuole — `targetCoverage`
 * sopra il pareggio — deve attraversare l'inverno con la sola scorta accumulata
 * prima. Se non ci riuscisse, la stagione non sarebbe un ritmo ma una carestia
 * annuale che nessuna mossa del giocatore evita, e ricadremmo nel difetto che la
 * fase 8 esiste per togliere: una perdita che non ha una risposta.
 */
describe('il ritmo contro il piano', () => {
  it('una campagna al bersaglio attraversa l anno senza mai svuotare la dispensa', () => {
    const coverage = BALANCE.food.targetCoverage;
    // Si parte dal punto in cui il raccolto torna a superare il pasto, che e'
    // dove una scorta comincia a esistere: prima di quello non c'e' niente da
    // mettere da parte, e una dispensa vuota in quel tratto e' cio' che
    // `start.food` copre — la citta' nasce con seicento unita' e zero abitanti.
    let start = 0;
    while (start < YEAR && coverage * harvestFactorAt(start) < 1) start++;

    // Domanda unitaria per tick: quello che conta e' il rapporto, non la scala.
    let stock = 0;
    let worst = Number.POSITIVE_INFINITY;
    for (let tick = start; tick < start + YEAR; tick++) {
      stock += coverage * harvestFactorAt(tick) - 1;
      worst = Math.min(worst, stock);
    }
    expect(worst).toBeGreaterThanOrEqual(0);
    // E torna in pari con margine: il ciclo si chiude in avanzo, non a filo.
    expect(stock).toBeGreaterThan(YEAR * 0.1);
  });

  it('e la scorta serve davvero: senza, l inverno non pareggia', () => {
    const coverage = BALANCE.food.targetCoverage;
    let deficits = 0;
    for (let tick = 0; tick < YEAR; tick++) {
      if (coverage * harvestFactorAt(tick) < 1) deficits++;
    }
    // Non e' un margine che copre tutto l'anno: una parte dell'anno la citta'
    // mangia cio' che ha messo da parte, ed e' il punto dell'incremento.
    expect(deficits).toBeGreaterThan(YEAR / 5);
    expect(deficits).toBeLessThan(YEAR / 2);
  });
});
