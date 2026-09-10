import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import {
  CHARTERS,
  canonicalCharters,
  charterById,
  charterOfFamily,
  governanceOf,
  isCharterId,
  withCharter,
  withoutFamily,
  type CharterFamily,
} from './charters';
import { ALL_CLASSES } from './classes';

/** Le famiglie, in un posto solo: aggiungerne una si vede qui e non altrove. */
const FAMILIES: readonly CharterFamily[] = ['supply', 'publicSpace', 'investment', 'governance'];

describe('catalogo dei mandati', () => {
  it('copre esattamente i vettori dichiarati in balance', () => {
    const declared = Object.keys(BALANCE.districts.spatialCharter).sort();
    expect(CHARTERS.map((entry) => entry.id).sort()).toEqual(declared);
  });

  it('dichiara per ognuno una famiglia e un portante validi', () => {
    for (const charter of CHARTERS) {
      expect(FAMILIES).toContain(charter.family);
      expect(ALL_CLASSES).toContain(charter.carrier);
      expect(charterById(charter.id)).toBe(charter);
    }
  });

  it('ogni famiglia offre almeno due direzioni distinguibili', () => {
    for (const family of FAMILIES) {
      const inFamily = CHARTERS.filter((entry) => entry.family === family);
      expect(inFamily.length).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * La quarta famiglia e' l'unica che tocca il pannello delle policy, ed e' la
   * ragione per cui esiste: senza almeno un mandato che sposti slot, prezzo o
   * mantenimento, «governance» sarebbe una quarta etichetta e non una cerniera.
   */
  it('la famiglia di governo agisce sulle policy, non solo sul quartiere', () => {
    const governance = CHARTERS.filter((entry) => entry.family === 'governance');
    for (const charter of governance) {
      const touches = (charter.policySlots ?? 0) !== 0
        || (charter.upkeepFactor ?? 1) !== 1
        || (charter.costFactor ?? 1) !== 1;
      expect(touches).toBe(true);
    }
    // E nessun'altra famiglia lo fa: il vettore spaziale e' il loro unico segno.
    for (const charter of CHARTERS) {
      if (charter.family === 'governance') continue;
      expect(charter.policySlots ?? 0).toBe(0);
      expect(charter.upkeepFactor ?? 1).toBe(1);
      expect(charter.costFactor ?? 1).toBe(1);
    }
  });

  it('compone i mandati attivi in un solo verdetto sul governo', () => {
    expect(governanceOf([])).toEqual({ extraSlots: 0, upkeepFactor: 1, costFactor: 1 });

    const powers = governanceOf(['emergencyPowers']);
    expect(powers.extraSlots).toBe(BALANCE.decisions.mandate.slotGrant);
    expect(powers.upkeepFactor).toBe(1);

    const books = governanceOf(['openBooks']);
    expect(books.upkeepFactor).toBe(BALANCE.decisions.mandate.thriftUpkeep);
    expect(books.extraSlots).toBe(0);
  });

  it('riconosce solo gli id del catalogo', () => {
    expect(isCharterId('rationing')).toBe(true);
    expect(isCharterId('denseHousing')).toBe(false);
  });
});

describe('slot per famiglia', () => {
  it('la seconda scelta della stessa famiglia sostituisce la prima', () => {
    const first = withCharter([], 'communityGardens');
    const second = withCharter(first, 'rationing');

    expect(first).toEqual(['communityGardens']);
    expect(second).toEqual(['rationing']);
  });

  it('famiglie diverse convivono, e non piu di una per famiglia', () => {
    let active = withCharter([], 'rationing');
    active = withCharter(active, 'leasedSquare');
    active = withCharter(active, 'soldReserves');

    expect(active).toHaveLength(3);
    expect(charterOfFamily(active, 'supply')).toBe('rationing');
    expect(charterOfFamily(active, 'publicSpace')).toBe('leasedSquare');
    expect(charterOfFamily(active, 'investment')).toBe('soldReserves');

    // Il tetto e' strutturale: quante decisioni si risolvano, i mandati attivi
    // restano tre. E' cio' che sostituisce una scadenza a tick.
    active = withCharter(active, 'festivalGrounds');
    active = withCharter(active, 'foodFair');
    expect(active).toHaveLength(3);
  });

  it('svuota lo slot di una famiglia senza toccare le altre', () => {
    let active = withCharter(withCharter([], 'rationing'), 'leasedSquare');
    active = withoutFamily(active, 'publicSpace');

    expect(active).toEqual(['rationing']);
    expect(charterOfFamily(active, 'publicSpace')).toBeNull();
    // Svuotare uno slot gia' vuoto non e' un errore e non cambia niente.
    expect(withoutFamily(active, 'publicSpace')).toEqual(['rationing']);
  });

  it('produce sempre l ordine di catalogo, qualunque sia l ordine di scelta', () => {
    const forward = withCharter(withCharter(withCharter([], 'rationing'), 'leasedSquare'), 'foodFair');
    const backward = withCharter(withCharter(withCharter([], 'foodFair'), 'leasedSquare'), 'rationing');

    expect(forward).toEqual(backward);
  });
});

describe('canonicalizzazione di una lista letta da JSON', () => {
  it('scarta gli id sconosciuti e tiene l ultimo di ogni famiglia', () => {
    expect(canonicalCharters(['communityGardens', 'inesistente', 'rationing']))
      .toEqual(['rationing']);
  });

  it('una lista gia canonica resta identica', () => {
    const canonical = withCharter(withCharter([], 'rationing'), 'soldReserves');
    expect(canonicalCharters(canonical)).toEqual(canonical);
  });
});
