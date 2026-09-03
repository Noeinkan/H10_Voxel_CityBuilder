import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { coverageReportOf } from './coverage';
import { isDecayArmed, nextDecayPressure, nextDecaySites } from './decay';
import { addBuilding, addCatalyst, createSimState, type SimState } from './SimState';

const STRAIN = BALANCE.decay.strainCoverage;
const RECOVERY = BALANCE.decay.recoveryCoverage;

/** Sei case in fila, nessun servizio da nessuna parte. */
function unserved(): SimState {
  let state = createSimState();
  for (let i = 0; i < 6; i++) {
    state = addBuilding(state, { x: 100 + i * 4, y: 100, class: BUILDING_CLASS.residential });
  }
  return { ...state, coverageReport: coverageReportOf({ population: 600, civic: 0, funded: 1, services: 0 }) };
}

describe('nextDecayPressure — il fronte', () => {
  it('sale sotto la soglia di affanno', () => {
    expect(nextDecayPressure(0, STRAIN - 0.01)).toBeGreaterThan(0);
  });

  it('scende sopra la soglia di rientro', () => {
    expect(nextDecayPressure(0.5, RECOVERY + 0.01)).toBeLessThan(0.5);
  });

  it('nella banda morta non si muove: e’ il fronte, non una soglia', () => {
    const between = (STRAIN + RECOVERY) / 2;
    expect(nextDecayPressure(0.5, between)).toBe(0.5);
  });

  it('il pareggio esatto sta nella banda: una citta’ al limite non arma niente', () => {
    expect(nextDecayPressure(0.5, 1)).toBe(0.5);
  });

  it('rientra piu’ in fretta di quanto sia salito: il gesto giusto si vede', () => {
    const risen = nextDecayPressure(0.5, 0);
    const relieved = nextDecayPressure(0.5, RECOVERY + 0.5);
    expect(0.5 - relieved).toBeGreaterThan(risen - 0.5);
  });

  it('resta in [0, 1] comunque lo si spinga', () => {
    let pressure = 0;
    for (let i = 0; i < 5000; i++) pressure = nextDecayPressure(pressure, 0);
    expect(pressure).toBe(1);
    for (let i = 0; i < 5000; i++) pressure = nextDecayPressure(pressure, 2);
    expect(pressure).toBe(0);
  });

  it('minuti di scoperto continuo prima che il fronte si armi', () => {
    let state = { ...createSimState(), decayPressure: 0 };
    let ticks = 0;
    while (!isDecayArmed(state) && ticks < 100_000) {
      state = { ...state, decayPressure: nextDecayPressure(state.decayPressure, 0) };
      ticks++;
    }
    // Dieci tick al secondo: il declino deve dare al giocatore il tempo di
    // aprire la vista, capire dov'e' il buco e posarci un servizio. Un minuto e
    // mezzo e' il minimo sotto cui la conseguenza diventa un agguato.
    expect(ticks).toBeGreaterThanOrEqual(900);
  });
});

describe('nextDecaySites — chi e’ in difficolta’', () => {
  it('una citta’ servita non ha nessuno in difficolta’', () => {
    const state = {
      ...unserved(),
      coverageReport: coverageReportOf({ population: 100, civic: 10, funded: 1, services: 0 }),
    };
    expect(nextDecaySites(state, 6, 0).sites).toEqual([]);
  });

  it('una citta’ senza servizi li ha tutti', () => {
    expect(nextDecaySites(unserved(), 6, 0).sites).toHaveLength(6);
  });

  it('e’ deterministica: due chiamate identiche danno lo stesso esito', () => {
    const state = unserved();
    expect(nextDecaySites(state, 4, 2)).toEqual(nextDecaySites(state, 4, 2));
  });

  it('ordina dal peggio servito, e a pari copertura per posizione', () => {
    const state = unserved();
    const { sites } = nextDecaySites(state, 6, 0);
    for (let i = 1; i < sites.length; i++) {
      const before = sites[i - 1];
      const after = sites[i];
      expect(before.coverage < after.coverage
        || (before.coverage === after.coverage && before.x <= after.x)).toBe(true);
    }
  });

  it('il cursore copre tutti gli edifici in piu’ passate, e poi ricomincia', () => {
    const state = unserved();
    const seen = new Set<number>();
    let cursor = 0;
    for (let pass = 0; pass < 3; pass++) {
      const scan = nextDecaySites(state, 2, cursor);
      for (const site of scan.sites) seen.add(site.x);
      cursor = scan.cursor;
    }
    expect(seen.size).toBe(6);
    expect(cursor).toBe(0);
  });

  it('un catalizzatore civico toglie dalla lista chi copre', () => {
    // Due stati **indipendenti**: `addCatalyst` aggiorna il campo in place e ne
    // passa la proprieta', quindi posare una scuola sulla citta' scoperta
    // cambierebbe anche il termine di paragone.
    const served = addCatalyst(unserved(), {
      x: 100,
      y: 100,
      class: BUILDING_CLASS.civic,
      kind: 'school',
      strength: BALANCE.gameplay.catalyst.roles.school.strength,
      radius: BALANCE.gameplay.catalyst.roles.school.radius,
    });
    expect(nextDecaySites(served, 6, 0).sites.length)
      .toBeLessThan(nextDecaySites(unserved(), 6, 0).sites.length);
  });

  it('non guarda oltre quello che gli si chiede di guardare', () => {
    expect(nextDecaySites(unserved(), 2, 0).sites).toHaveLength(2);
    expect(nextDecaySites(unserved(), 0, 0).sites).toEqual([]);
  });

  it('una citta’ senza edifici non ha niente da dire', () => {
    expect(nextDecaySites(createSimState(), 10, 0).sites).toEqual([]);
  });
});
