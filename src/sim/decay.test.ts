import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BUILDING_CLASS } from './classes';
import { coverageReportOf } from './coverage';
import {
  isDecayArmed,
  isDistressPossible,
  nextDecayPressure,
  nextDecaySites,
} from './decay';
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

  it('nella banda rientra piano invece di restare fermo', () => {
    const between = (STRAIN + RECOVERY) / 2;
    expect(nextDecayPressure(0.5, between)).toBeLessThan(0.5);
  });

  it('il pareggio esatto rientra: coprire tutto non puo’ lasciare il fronte carico', () => {
    expect(nextDecayPressure(0.5, 1)).toBeLessThan(0.5);
  });

  it('rientra piu’ in fretta di quanto sia salito: il gesto giusto si vede', () => {
    const risen = nextDecayPressure(0.5, 0);
    const relieved = nextDecayPressure(0.5, RECOVERY + 0.5);
    expect(0.5 - relieved).toBeGreaterThan(risen - 0.5);
  });

  it('posare il servizio rientra piu’ in fretta che tenere la linea', () => {
    const inBand = 0.5 - nextDecayPressure(0.5, (STRAIN + RECOVERY) / 2);
    const beyond = 0.5 - nextDecayPressure(0.5, RECOVERY);
    expect(beyond).toBeGreaterThan(inBand);
  });

  it('resta in [0, pressureCeiling] comunque lo si spinga', () => {
    let pressure = 0;
    for (let i = 0; i < 10_000; i++) pressure = nextDecayPressure(pressure, 0);
    expect(pressure).toBe(BALANCE.decay.pressureCeiling);
    for (let i = 0; i < 10_000; i++) pressure = nextDecayPressure(pressure, 2);
    expect(pressure).toBe(0);
  });

  it('il tetto sta sopra l’armamento: e’ li’ che vive l’isteresi', () => {
    expect(BALANCE.decay.pressureCeiling).toBeGreaterThan(1);
  });

  // **La trappola che questa forma esiste per non avere.** Con la banda
  // congelata un fronte armato non rientrava piu' sotto `recoveryCoverage`: la
  // citta' risalita al 105% restava ferma per sempre, con la crescita bloccata e
  // un avviso che le chiedeva di coprire il 105% di quello che gia' copriva.
  it('un fronte armato rientra anche restando dentro la banda', () => {
    let state: SimState = {
      ...createSimState(),
      decayPressure: BALANCE.decay.pressureCeiling,
    };
    const held = (STRAIN + RECOVERY) / 2;
    let ticks = 0;
    while (isDecayArmed(state) && ticks < 100_000) {
      state = { ...state, decayPressure: nextDecayPressure(state.decayPressure, held) };
      ticks++;
    }
    expect(isDecayArmed(state)).toBe(false);
    // Rientra, ma non subito: tenere la linea costa il tempo che c'e' voluto a
    // perderla, ed e' cio' che tiene il rientro distinguibile dal gesto giusto.
    expect(ticks).toBeGreaterThanOrEqual(600);
  });

  // Il difetto opposto, ed e' quello per cui non basta far perdere la banda:
  // un allarme che si spegne al primo tick sopra soglia si riaccende al tick
  // dopo, e il giocatore vede lampeggiare invece di leggere.
  it('non lampeggia: un tick solo sopra la soglia non disarma un fronte carico', () => {
    const saturated = BALANCE.decay.pressureCeiling;
    const eased = nextDecayPressure(saturated, RECOVERY + 1);
    expect(isDecayArmed({ ...createSimState(), decayPressure: eased })).toBe(true);
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

describe('isDistressPossible — se il fronte armato puo’ portare via qualcosa', () => {
  /**
   * Un referto con quel rapporto esatto, dagli stessi ingressi del tick.
   *
   * Mille abitanti chiedono `1000 * demandPerResident`, e un'unita' di servizio
   * ne vale `perService`: il numero di servizi che pareggia esce da li' e non da
   * una costante scritta a mano, o il giorno che il listino cambia questi test
   * misurerebbero un rapporto diverso da quello che dicono.
   */
  function at(ratio: number) {
    const demand = 1000 * BALANCE.coverage.demandPerResident;
    const services = (ratio * demand) / BALANCE.coverage.perService;
    return coverageReportOf({ population: 1000, civic: 0, funded: 1, services });
  }

  it('sopra il pareggio non se ne va nessuno: il pavimento cittadino li tiene', () => {
    expect(isDistressPossible(at(1.05))).toBe(false);
  });

  it('nemmeno a meta’ copertura, ed e’ aritmetica: il pavimento sta sopra la soglia', () => {
    expect(isDistressPossible(at(0.5))).toBe(false);
  });

  it('una citta’ quasi scoperta li perde davvero', () => {
    expect(isDistressPossible(at(0.1))).toBe(true);
  });

  // La riga che lega le due meta': sotto questo rapporto il pavimento scende
  // sotto la soglia di difficolta', e non un tick prima.
  it('la soglia e’ il rapporto fra difficolta’ e quota cittadina', () => {
    const edge = BALANCE.decay.distressCoverage / BALANCE.coverage.cityShare;
    expect(isDistressPossible(at(edge - 0.01))).toBe(true);
    expect(isDistressPossible(at(edge + 0.01))).toBe(false);
  });

  it('una citta’ che non e’ partita non ha nessuno da perdere', () => {
    expect(isDistressPossible(createSimState().coverageReport)).toBe(false);
  });
});
