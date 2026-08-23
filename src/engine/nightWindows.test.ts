import { describe, expect, it } from 'vitest';
import { NIGHT_WINDOWS, litShare, towerBias } from './nightWindows';

const BIASES = [
  NIGHT_WINDOWS.towerBias.low,
  1,
  NIGHT_WINDOWS.towerBias.high,
];

describe('litShare', () => {
  it('una citta’ senza case resta al buio', () => {
    // Non e' un caso limite da tappare: `vitality.ts` restituisce zero quando non
    // c'e' capacita' residenziale, e lo spegnimento e' la lettura giusta.
    for (const bias of BIASES) expect(litShare(0, bias)).toBe(0);
  });

  it('cresce con l’occupazione e non torna mai indietro', () => {
    for (const bias of BIASES) {
      let previous = -1;
      for (let occupancy = 0; occupancy <= 1.0001; occupancy += 0.05) {
        const share = litShare(occupancy, bias);
        expect(share).toBeGreaterThanOrEqual(previous);
        previous = share;
      }
    }
  });

  it('nemmeno la torre piu’ viva di una citta’ piena accende tutto', () => {
    // E' l'invariante per cui esiste questo modello: il buio fra le luci e' la
    // meta' del disegno, e con una soglia sola spariva a citta' piena.
    const brightest = litShare(1, NIGHT_WINDOWS.towerBias.high);
    expect(brightest).toBeLessThan(0.7);
    expect(brightest).toBeGreaterThan(NIGHT_WINDOWS.peakShare);
  });

  it('lascia sempre torri buie accanto a torri accese', () => {
    const darkest = litShare(1, NIGHT_WINDOWS.towerBias.low);
    const brightest = litShare(1, NIGHT_WINDOWS.towerBias.high);
    expect(brightest / darkest).toBeGreaterThan(3);
  });

  it('la soglia del piano d’ufficio resta dentro l’intervallo utile', () => {
    // Il frammento calcola `1 - share / floorFill`: se `share` superasse il
    // riempimento la soglia uscirebbe sotto zero e **ogni** piano si
    // accenderebbe, cioe' proprio il muro di luce che il tetto esclude.
    expect(litShare(1, NIGHT_WINDOWS.towerBias.high)).toBeLessThan(NIGHT_WINDOWS.floorFill);
  });

  it('a meta’ occupazione la citta’ e’ gia’ ben oltre meta’ delle sue luci', () => {
    const half = litShare(0.5, 1);
    const full = litShare(1, 1);
    expect(half / full).toBeGreaterThan(0.6);
  });
});

describe('towerBias', () => {
  it('copre l’intervallo dichiarato e ci resta dentro', () => {
    expect(towerBias(0)).toBeCloseTo(NIGHT_WINDOWS.towerBias.low, 10);
    expect(towerBias(1)).toBeCloseTo(NIGHT_WINDOWS.towerBias.high, 10);
    for (const hash of [-1, 0.25, 0.5, 2]) {
      expect(towerBias(hash)).toBeGreaterThanOrEqual(NIGHT_WINDOWS.towerBias.low);
      expect(towerBias(hash)).toBeLessThanOrEqual(NIGHT_WINDOWS.towerBias.high);
    }
  });
});

describe('costanti', () => {
  it('il gruppo di colonne non coincide con nessuna impronta ammessa', () => {
    // Se coincidesse, ogni edificio cadrebbe in un gruppo solo e le torri larghe
    // perderebbero le ali accese in modo diverso, che e' meta' dell'effetto.
    expect(NIGHT_WINDOWS.towerCell).toBeGreaterThan(4);
    expect(NIGHT_WINDOWS.towerCell).toBeLessThan(8);
  });

  it('di notte le finestre emettono piu’ che di giorno', () => {
    expect(NIGHT_WINDOWS.gain.night).toBeGreaterThan(NIGHT_WINDOWS.gain.day);
  });
});
