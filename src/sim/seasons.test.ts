import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import {
  harvestFactorAt,
  nextSeason,
  resolveSeason,
  SEASON,
  SEASON_IDS,
  SEASON_NAMES,
  SEASONS,
  seasonAt,
  seasonHeartPhase,
  seasonStartPhase,
  tickAtPhase as tickAt,
  YEAR_START_PHASE,
  yearPhaseAt,
} from './seasons';

const YEAR = BALANCE.seasons.yearTicks;

describe('yearPhaseAt', () => {
  it('parte da zero e torna da capo dopo un anno', () => {
    expect(yearPhaseAt(tickAt(0))).toBe(0);
    expect(yearPhaseAt(tickAt(0) + YEAR)).toBe(0);
    expect(yearPhaseAt(tickAt(0) + YEAR * 7)).toBe(0);
    expect(yearPhaseAt(tickAt(0.5))).toBeCloseTo(0.5, 12);
  });

  /**
   * E' il motivo per cui il calendario e' sfasato: a meta' estate ne' l'oro ne'
   * la brina toccano il prato, quindi la citta' nasce sul verde che il tema
   * dichiara invece che sotto il residuo dell'inverno.
   */
  it('fa nascere la citta a meta estate', () => {
    expect(yearPhaseAt(0)).toBeCloseTo(YEAR_START_PHASE, 12);
    expect(seasonAt(0)).toBe(SEASON.summer);
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
    expect(seasonAt(tickAt(0))).toBe(SEASON.spring);
    expect(seasonAt(tickAt(0.3))).toBe(SEASON.summer);
    expect(seasonAt(tickAt(0.55))).toBe(SEASON.autumn);
    expect(seasonAt(tickAt(0.8))).toBe(SEASON.winter);
    expect(seasonAt(tickAt(0) - 1)).toBe(SEASON.winter);
    expect(seasonAt(tickAt(0) + YEAR)).toBe(SEASON.spring);
  });

  it('ha un nome per ogni indice, senza buchi', () => {
    for (const season of [SEASON.spring, SEASON.summer, SEASON.autumn, SEASON.winter]) {
      expect(SEASON_NAMES[season]).toMatch(/^[A-Z][a-z]+$/);
    }
  });
});

describe('confini e cuore delle stagioni', () => {
  it('mette l inizio di ogni stagione dove seasonAt la fa cominciare', () => {
    for (const season of SEASONS) {
      expect(seasonAt(tickAt(seasonStartPhase(season)))).toBe(season);
      expect(seasonAt(tickAt(seasonHeartPhase(season)))).toBe(season);
    }
  });

  /**
   * La costante non e' un numero scelto a mano: e' il centro dell'estate. Se un
   * giorno il calendario cambiasse verso, questo test direbbe subito che le due
   * cose si sono staccate — ed e' l'invariante su cui poggia `birthShift`, che
   * fa nascere in estate una partita che non chiede niente.
   */
  it('fa coincidere l inizio di partita con il cuore dell estate', () => {
    expect(YEAR_START_PHASE).toBeCloseTo(seasonHeartPhase(SEASON.summer), 12);
  });

  it('gira le quattro in cerchio, nell ordine dell anno', () => {
    expect(nextSeason(SEASON.spring)).toBe(SEASON.summer);
    expect(nextSeason(SEASON.winter)).toBe(SEASON.spring);
    expect(SEASONS.map(nextSeason)).toHaveLength(SEASONS.length);
  });
});

describe('resolveSeason', () => {
  it('legge i quattro id, anche scritti male', () => {
    expect(resolveSeason('spring')).toBe(SEASON.spring);
    expect(resolveSeason(' Winter ')).toBe(SEASON.winter);
    for (const season of SEASONS) {
      expect(resolveSeason(SEASON_IDS[season] ?? '')).toBe(season);
    }
  });

  it('rifiuta cio che non e una stagione, senza ripiegare su una', () => {
    // `null` e non l'estate: chi chiama deve poter distinguere «non l'ha
    // chiesto» da «ha chiesto l'estate», o `?calendar=banana` farebbe nascere
    // un'isola come se il parametro non ci fosse mai stato.
    expect(resolveSeason(null)).toBeNull();
    expect(resolveSeason('banana')).toBeNull();
    expect(resolveSeason('0.875')).toBeNull();
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
    expect(harvestFactorAt(tickAt(0.375))).toBeCloseTo(1 + amplitude, 6);
    expect(harvestFactorAt(tickAt(0.875))).toBeCloseTo(1 - amplitude, 6);
    // Primavera e autunno valgono uno al loro centro: sono le due meta' in cui
    // la citta' cambia verso, non due stagioni con un segno proprio.
    expect(harvestFactorAt(tickAt(0.125))).toBeCloseTo(1, 6);
    expect(harvestFactorAt(tickAt(0.625))).toBeCloseTo(1, 6);
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
    // Si cerca a partire da meta' inverno, che e' il minimo della resa e quindi
    // l'unico istante in cui il deficit e' certo: partire dal tick zero non
    // servirebbe piu' — da quando il calendario e' sfasato quello e' il picco,
    // la disuguaglianza e' gia' soddisfatta e la ricerca si fermerebbe subito,
    // su un punto che non e' l'inizio di nessuna scorta.
    let start = tickAt(0.875);
    while (start < tickAt(0.875) + YEAR && coverage * harvestFactorAt(start) < 1) start++;

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
