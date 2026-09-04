import { describe, expect, it } from 'vitest';
import { addCatalyst, createSimState, setTradeMode } from './SimState';
import { tick } from './tick';
import { testTerrain } from './testTerrain';
import { TRADE_MODES, foodImportShareOf, resolveExternalTrade, tradeLinksOf } from './trade';
import { BUILDING_CLASS } from './classes';
import { BALANCE } from './balance';

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

  it('compra materiali solo nella modalita che lo chiede', () => {
    // Il verso che mancava: prima dei materiali si poteva soltanto uscire, e una
    // citta' con i cantieri fermi non aveva nessun gesto da fare.
    const empty = { ...common, links: ['port'], materials: 0 } as const;
    const buying = resolveExternalTrade({ ...empty, mode: 'materialImports' });

    expect(buying.materialsIn).toBeGreaterThan(0);
    expect(buying.materialsStock).toBeGreaterThan(empty.materials);
    expect(buying.funds).toBeLessThan(0);

    for (const mode of ['balanced', 'foodImports', 'materialExports'] as const) {
      expect(resolveExternalTrade({ ...empty, mode }).materialsIn).toBe(0);
    }
    expect(resolveExternalTrade({ ...empty, mode: 'materialImports', links: [] }).materialsIn).toBe(0);
  });

  it('nessuna modalita apre i due versi insieme', () => {
    // E' il contratto su cui poggia la riga sola del cassetto Citta': se una
    // modalita' comprasse e vendesse nello stesso tick, quella riga mostrerebbe
    // meta' della verita'.
    for (const mode of TRADE_MODES) {
      const both = resolveExternalTrade({
        ...common,
        mode: mode.id,
        links: ['port', 'airport'],
        materials: 1,
        funds: 1_000_000,
      });
      expect(Math.min(both.materials, both.materialsIn)).toBe(0);
    }
  });

  it('si ferma al bersaglio invece di riempire all’infinito', () => {
    const goal = common.buildings * BALANCE.trade.importMaterialTarget;
    const full = resolveExternalTrade({
      ...common,
      mode: 'materialImports',
      links: ['port'],
      materials: goal,
    });
    // Un tick solo non copre tutto il bersaglio: e' la portata a limitare, non
    // il traguardo. Sopra il traguardo invece il canale si chiude del tutto.
    const empty = resolveExternalTrade({
      ...common, mode: 'materialImports', links: ['port'], materials: 0,
    });

    expect(full.materialsIn).toBe(0);
    expect(empty.materialsIn).toBeLessThan(goal);
    expect(empty.materialsIn).toBeGreaterThan(0);
  });

  it('la dispensa ha la precedenza sui fondi che il cantiere vorrebbe', () => {
    // L'ordine e' quello giusto perche' una citta' che smette di mangiare perde
    // gli abitanti che il cantiere serviva. Si vede in due modi: a fondi scarsi
    // il cibo compra quanto la sua portata gli concede comunque, e le travi si
    // accontentano di cio' che avanza.
    const starving = {
      ...common, mode: 'materialImports', links: ['port'], materials: 0, food: 0,
    } as const;
    const rich = resolveExternalTrade({ ...starving, funds: 1_000_000 });
    const scarce = resolveExternalTrade({ ...starving, funds: 1 });

    expect(scarce.food).toBe(rich.food);
    expect(scarce.materialsIn).toBeLessThan(rich.materialsIn);
    expect(scarce.materialsIn * BALANCE.trade.importMaterialPrice)
      .toBeLessThanOrEqual(1 - scarce.food * BALANCE.trade.importFoodPrice + 1e-9);
    expect(scarce.fundsStock).toBeGreaterThanOrEqual(0);

    // Quando i fondi non bastano nemmeno alla dispensa, il canale dei materiali
    // non parte affatto: e' il residuo a comandare, non una quota riservata.
    const broke = resolveExternalTrade({ ...starving, funds: 0.1 });
    expect(broke.food).toBeGreaterThan(0);
    expect(broke.materialsIn).toBe(0);
  });

  /**
   * Le due modalita' si escludono dentro un tick, non fra due: senza questo
   * margine, alternarle a mano fabbricherebbe fondi dal nulla.
   */
  it('comprare costa piu di quanto rendere rivendendo', () => {
    const bestExport = BALANCE.trade.exportMaterialPrice *
      Math.max(...Object.values(BALANCE.trade.link).map((profile) => profile.price));
    expect(BALANCE.trade.importMaterialPrice).toBeGreaterThan(bestExport);
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
