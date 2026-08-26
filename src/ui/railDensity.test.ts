import { describe, expect, it } from 'vitest';
import {
  nextRailDensity,
  RAIL_DENSITY_MAX,
  RAIL_DENSITY_MIN,
  RAIL_DENSITY_START,
  RAIL_SQUEEZE_MIN,
  type RailDensity,
  type RailFit,
} from './railDensity';

/**
 * Un rail finto: si dichiara quanto costa ogni gradino, e la misura viene da li'.
 *
 * I numeri sono quelli **misurati** sul rail vero con `--hud-unit` al suo
 * pavimento — 835.5px ai gradini 0 e 1, 683.9 al 2, 623.4 al 3, 571.9 al 4 —
 * perche' la proprieta' che interessa e' che il ciclo si fermi sul gradino
 * giusto proprio dove il rail sbordava prima. I gradini 0 e 1 costano uguale in
 * quota di proposito: con gruppi da sei tessere tre colonne e quattro fanno le
 * stesse righe, e il ciclo deve attraversare quel pianerottolo senza fermarcisi.
 */
const NEED_BY_STEP = [835.5, 835.5, 683.9, 623.4, 571.9];
const TILES_BY_STEP = [265, 265, 264, 264, 212.5];

function fitAt(state: RailDensity, avail: number): RailFit {
  const tiles = TILES_BY_STEP[state.step] * state.squeeze;
  return {
    need: NEED_BY_STEP[state.step] - TILES_BY_STEP[state.step] + tiles,
    avail,
    tiles,
  };
}

/** Fa girare il ciclo fino a quando si ferma, o si arrende dopo `limit` giri. */
function settle(avail: number, limit = 12): { state: RailDensity; turns: number } {
  let state = RAIL_DENSITY_START;
  for (let turn = 1; turn <= limit; turn += 1) {
    const next = nextRailDensity(state, fitAt(state, avail));
    if (next.step === state.step && next.squeeze === state.squeeze) {
      return { state: next, turns: turn };
    }
    state = next;
  }
  throw new Error(`il ciclo non si ferma a ${avail}px`);
}

describe('nextRailDensity', () => {
  it('tiene il gradino largo dove la quota avanza davvero', () => {
    expect(settle(1200).state.step).toBe(RAIL_DENSITY_MIN);
  });

  it('sceglie il gradino che entra, non quello che una soglia aveva previsto', () => {
    // Le quote che prima cadevano nei buchi fra le media query: 780 e' un 1080p
    // con lo zoom di Windows al 125%, 820 una finestra su un 1600x900, 650 un
    // portatile piccolo. Prima sbordavano tutte e tre.
    expect(settle(820).state.step).toBe(2);
    expect(settle(780).state.step).toBe(2);
    expect(settle(650).state.step).toBe(3);
    expect(settle(600).state.step).toBe(4);
  });

  it('attraversa il pianerottolo fra i due gradini che costano uguale', () => {
    // 0 e 1 chiedono la stessa quota: chi sbordava a 1 non deve fermarsi li'
    // credendo di aver fatto qualcosa. A 1000 invece 0 entra, e vince perche' e'
    // il rail piu' stretto dei due.
    expect(settle(1000).state.step).toBe(RAIL_DENSITY_MIN);
    expect(settle(830).state.step).toBe(2);
  });

  it('lascia il contenuto dentro la quota a ogni gradino scelto', () => {
    for (let avail = 560; avail <= 1200; avail += 20) {
      const { state } = settle(avail);
      const fit = fitAt(state, avail);
      expect(fit.need).toBeLessThanOrEqual(avail + 0.5);
    }
  });

  it('stringe la tessera solo quando i gradini sono finiti', () => {
    expect(settle(700).state.squeeze).toBe(1);
    const tight = settle(500).state;
    expect(tight.step).toBe(RAIL_DENSITY_MAX);
    expect(tight.squeeze).toBeLessThan(1);
    expect(tight.squeeze).toBeGreaterThanOrEqual(RAIL_SQUEEZE_MIN);
  });

  it('non assottiglia la tessera oltre il bersaglio minimo', () => {
    expect(settle(120).state.squeeze).toBe(RAIL_SQUEEZE_MIN);
  });

  it('e\' idempotente: la stretta applicata non si giudica da sola', () => {
    const settled = settle(500).state;
    const again = nextRailDensity(settled, fitAt(settled, 500));
    expect(again).toEqual(settled);
  });

  it('non oscilla fra due gradini alla stessa quota', () => {
    // Una quota scelta apposta perche' il gradino piu' largo ci manchi di poco.
    const avail = NEED_BY_STEP[2] + 4;
    const { state, turns } = settle(avail);
    expect(state.step).toBe(2);
    expect(turns).toBeLessThanOrEqual(6);
    // E resta li' anche insistendo: e' `relaxFloor` a tenerlo fermo.
    let held = state;
    for (let turn = 0; turn < 5; turn += 1) held = nextRailDensity(held, fitAt(held, avail));
    expect(held.step).toBe(2);
  });

  it('riallarga quando la finestra ricresce', () => {
    const tight = settle(650).state;
    expect(tight.step).toBe(3);
    let state = tight;
    for (let turn = 0; turn < 8; turn += 1) state = nextRailDensity(state, fitAt(state, 1200));
    expect(state.step).toBe(RAIL_DENSITY_MIN);
  });

  it("non cerca un gradino piu' stretto di quelli che ci sono", () => {
    let state = RAIL_DENSITY_START;
    for (let turn = 0; turn < 20; turn += 1) state = nextRailDensity(state, fitAt(state, 50));
    expect(state.step).toBe(RAIL_DENSITY_MAX);
  });
});
