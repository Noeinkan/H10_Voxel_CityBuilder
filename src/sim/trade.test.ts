import { describe, expect, it } from 'vitest';
import { addCatalyst, createSimState, setTradeMode } from './SimState';
import { tick } from './tick';
import { testTerrain } from './testTerrain';
import { foodImportShareOf, resolveExternalTrade, tradeLinksOf } from './trade';
import { BUILDING_CLASS } from './classes';

describe('commercio esterno', () => {
  it('resta chiuso senza porto e si attiva con il porto', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1 });
    const base = {
      ...createSimState(),
      population: { stock: 100, delta: 0 },
      food: { stock: 0, delta: 0 },
    };
    expect(tick(base, map).trade.connected).toBe(false);

    const connected = addCatalyst(base, {
      x: 8,
      y: 8,
      kind: 'port',
      class: BUILDING_CLASS.industrial,
      strength: 190,
      radius: 24,
    });
    const after = tick(connected, map);
    expect(after.trade.connected).toBe(true);
    expect(after.trade.links).toEqual(['port']);
    expect(after.trade.food).toBeGreaterThan(0);
  });

  it('le priorita cambiano deterministicamente il volume scambiato', () => {
    const common = {
      links: ['port'],
      population: 100,
      buildings: 10,
      food: 0,
      materials: 200,
      funds: 1_000,
    } as const;
    const food = resolveExternalTrade({ ...common, mode: 'foodImports' });
    const exports = resolveExternalTrade({ ...common, mode: 'materialExports' });
    expect(food.food).toBeGreaterThan(exports.food);
    expect(exports.materials).toBeGreaterThan(food.materials);
    expect(setTradeMode(createSimState(), 'foodImports').tradeMode).toBe('foodImports');
  });
});

/**
 * Il porto muove volume, l'aeroporto valore: se i due collegamenti dessero lo
 * stesso scambio, il secondo sarebbe solo un prezzo diverso per lo stesso
 * sblocco, che e' esattamente quello che il `connected` binario faceva.
 */
describe('collegamenti con l’esterno', () => {
  const common = {
    mode: 'balanced',
    population: 100,
    buildings: 10,
    food: 0,
    materials: 200,
    funds: 1_000,
  } as const;

  it('senza collegamenti non scambia niente e non tocca gli stock', () => {
    const closed = resolveExternalTrade({ ...common, links: [] });
    expect(closed.connected).toBe(false);
    expect(closed.links).toEqual([]);
    expect(closed.food).toBe(0);
    expect(closed.materials).toBe(0);
    expect(closed.fundsStock).toBe(common.funds);
  });

  it('i due collegamenti hanno profili opposti', () => {
    const port = resolveExternalTrade({ ...common, links: ['port'] });
    const airport = resolveExternalTrade({ ...common, links: ['airport'] });

    expect(airport.food).toBeGreaterThan(port.food);
    expect(port.materials).toBeGreaterThan(airport.materials);
  });

  it('le capacita si sommano invece di sovrapporsi', () => {
    const port = resolveExternalTrade({ ...common, links: ['port'] });
    const both = resolveExternalTrade({ ...common, links: ['port', 'airport'] });

    expect(both.food).toBeGreaterThan(port.food);
    expect(both.materials).toBeGreaterThan(port.materials);
    expect(both.links).toEqual(['port', 'airport']);
  });

  it('l’aeroporto spunta un prezzo migliore sul poco che carica', () => {
    // A parita' di materiali esportati il ricavo dev'essere piu' alto: e' cio'
    // che distingue "carica meno" da "vale meno".
    const surplus = { ...common, materials: 1_000_000, food: 1_000_000, population: 0 };
    const port = resolveExternalTrade({ ...surplus, links: ['port'] });
    const airport = resolveExternalTrade({ ...surplus, links: ['airport'] });

    expect(port.food).toBe(0);
    expect(airport.food).toBe(0);
    expect(airport.funds / airport.materials).toBeGreaterThan(port.funds / port.materials);
  });

  /**
   * La regressione diretta: `importFoodPerTick` era una quantita' assoluta, quindi
   * i due scambi qui sotto tornavano **identici**. La domanda pero' vale
   * `pop * food.perResident`, e una portata che non la segue e' sovrabbondante al
   * primo isolato — un porto copriva il 667% della spesa a 240 abitanti — e
   * decorativa al decimo: il 4,9% a 3.268.
   */
  it('la portata del porto segue la taglia della citta', () => {
    const small = resolveExternalTrade({ ...common, links: ['port'], population: 100 });
    const large = resolveExternalTrade({ ...common, links: ['port'], population: 1_000, funds: 1_000_000 });

    expect(large.food / small.food).toBeCloseTo(10);
  });

  it('un collegamento resta un supplemento, non sostituisce la campagna', () => {
    // Il tetto della portata a citta' ferma: tutti i collegamenti, tutta la
    // priorita' sul cibo. Se questo arrivasse a 1 il cibo smetterebbe di
    // competere per la terra, che e' l'unica ragione per cui ha un posto sulla
    // mappa.
    expect(foodImportShareOf(['port', 'airport'], 'foodImports')).toBeLessThan(1);
    expect(foodImportShareOf(['port'], 'balanced')).toBeGreaterThan(0);
    expect(foodImportShareOf([], 'foodImports')).toBe(0);
  });

  it('legge il ruolo e non il campo kind, in ordine di catalogo', () => {
    // Un catalizzatore senza `kind` — salvataggio dell'MVP, fixture di scena —
    // resta un collegamento: e' il ruolo a contare, non il campo dichiarato.
    expect(tradeLinksOf([{ class: BUILDING_CLASS.industrial }])).toEqual([]);
    expect(tradeLinksOf([
      { kind: 'airport', class: BUILDING_CLASS.commercial },
      { kind: 'port', class: BUILDING_CLASS.industrial },
      { kind: 'port', class: BUILDING_CLASS.industrial },
    ])).toEqual(['port', 'airport']);
  });
});
