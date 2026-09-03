import { describe, expect, it } from 'vitest';
import { NIGHT_WINDOWS, litShare, storeyGain, towerBias } from './nightWindows';

const BIASES = [
  NIGHT_WINDOWS.towerBias.low,
  1,
  NIGHT_WINDOWS.towerBias.high,
];

/** Numeri casuali uniformi, come li vede il frammento su una facciata intera. */
function sweep(): number[] {
  return Array.from({ length: 2000 }, (_, i) => (i + 0.5) / 2000);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Quanto della quota di una torre sopravvive in media lungo la sua altezza. */
const MEAN_STOREY_GAIN = mean(sweep().map(storeyGain));

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
    // meta' del disegno, e con una soglia sola spariva a citta' piena. Da quando
    // c'e' la grana verticale la punta vale su un blocco di piani e non piu'
    // sulla facciata intera, quindi a dover restare una minoranza e' la media
    // lungo l'altezza: e' quella che si vede da lontano.
    const brightest = litShare(1, NIGHT_WINDOWS.towerBias.high);
    expect(brightest).toBeGreaterThan(NIGHT_WINDOWS.peakShare);
    expect(brightest * MEAN_STOREY_GAIN).toBeLessThan(0.4);
  });

  it('una citta’ piena resta in netta minoranza di finestre accese', () => {
    // La media su torri e blocchi: il numero che decide se lo skyline si legge
    // come edifici o come retino. Il limite basso e' altrettanto vincolante —
    // una citta' piena e spenta sarebbe un bug quanto un muro di luce.
    const towers = mean(sweep().map((hash) => litShare(1, towerBias(hash))));
    expect(towers * MEAN_STOREY_GAIN).toBeGreaterThan(0.1);
    expect(towers * MEAN_STOREY_GAIN).toBeLessThan(0.25);
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

describe('storeyGain', () => {
  it('toglie luce e non ne aggiunge mai', () => {
    // E' la proprieta' che lascia valide, blocco per blocco, tutte le invarianti
    // scritte sulla quota della torre: la soglia del piano d'ufficio in primis,
    // che romperebbe se la quota effettiva superasse `floorFill`.
    for (const hash of [-1, 0, 0.31, 0.32, 0.5, 0.999, 1, 2]) {
      expect(storeyGain(hash)).toBeGreaterThanOrEqual(0);
      expect(storeyGain(hash)).toBeLessThanOrEqual(1);
    }
  });

  it('spegne del tutto la frazione dichiarata di blocchi', () => {
    const dark = sweep().filter((hash) => storeyGain(hash) === 0).length / 2000;
    expect(dark).toBeCloseTo(NIGHT_WINDOWS.storey.darkShare, 2);
  });

  it('non lascia mai un blocco acceso a filo di zero', () => {
    // Fra spento e acceso non c'e' continuita', ed e' voluto: un blocco appena
    // acceso sarebbe una fascia sporca invece di un piano vuoto.
    const lit = sweep().map(storeyGain).filter((gain) => gain > 0);
    expect(Math.min(...lit)).toBeGreaterThanOrEqual(NIGHT_WINDOWS.storey.dimmest - 1e-6);
  });

  it('dimezza circa la luce di una torre', () => {
    // Il numero con cui e' stata ritarata `peakShare`: se la grana smettesse di
    // togliere questa meta', la citta' finirebbe piu' accesa di prima del
    // modello invece che meno.
    expect(MEAN_STOREY_GAIN).toBeGreaterThan(0.42);
    expect(MEAN_STOREY_GAIN).toBeLessThan(0.56);
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
