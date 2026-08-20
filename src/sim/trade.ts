import { BALANCE } from './balance';
import { CATALYSTS, catalystRoleOf, type CatalystId } from './catalysts';
import type { BuildingClass } from './classes';

export type TradeMode = keyof typeof BALANCE.trade.modeMultiplier;

/** Ruolo che collega l'isola al mondo. Gli altri non commerciano. */
export type TradeLink = keyof typeof BALANCE.trade.link;

export interface TradeReport {
  /** Vero se esiste almeno un collegamento: derivato da `links`, non deciso a parte. */
  readonly connected: boolean;
  /**
   * Collegamenti attivi, in ordine di catalogo.
   *
   * Ha sostituito il solo `connected` perche' quel booleano rendeva il porto e
   * l'aeroporto due prezzi per lo stesso sblocco: acceso il canale, il secondo
   * collegamento non aggiungeva niente. L'ordine viene dal catalogo e non
   * dall'ordine di piazzamento, o due partite identiche darebbero due array
   * diversi.
   */
  readonly links: readonly TradeLink[];
  /** Quantita' importata: positiva. */
  readonly food: number;
  /** Quantita' esportata: positiva. */
  readonly materials: number;
  /** Saldo di fondi del solo commercio. */
  readonly funds: number;
}

export interface TradeResult extends TradeReport {
  readonly foodStock: number;
  readonly materialsStock: number;
  readonly fundsStock: number;
}

export const TRADE_MODES: readonly { readonly id: TradeMode; readonly label: string; readonly description: string }[] = [
  { id: 'balanced', label: 'Balanced trade', description: 'Imports food reserves and exports surplus materials.' },
  { id: 'foodImports', label: 'Prioritize food', description: 'Buys more food and keeps a larger material reserve.' },
  { id: 'materialExports', label: 'Prioritize exports', description: 'Sells more materials while accepting a smaller food reserve.' },
];

export const EMPTY_TRADE: TradeReport = {
  connected: false,
  links: [],
  food: 0,
  materials: 0,
  funds: 0,
};

/** true se il ruolo e' uno dei collegamenti con l'esterno. */
export function isTradeLink(id: CatalystId): id is TradeLink {
  return id in BALANCE.trade.link;
}

/**
 * Collegamenti presenti nella citta', in ordine di catalogo e senza ripetizioni.
 *
 * Unico punto di verita': il tick e l'HUD chiedono qui, invece di ricalcolarlo
 * ciascuno a modo suo. Passa da `catalystRoleOf` e non da `kind`, cosi' un
 * catalizzatore senza ruolo dichiarato — un salvataggio dell'MVP, una fixture
 * di scena — vale quanto uno che ce l'ha.
 */
export function tradeLinksOf(
  catalysts: readonly { readonly kind?: CatalystId; readonly class: BuildingClass }[],
): readonly TradeLink[] {
  const present = new Set<CatalystId>();
  for (const catalyst of catalysts) present.add(catalystRoleOf(catalyst));
  return CATALYSTS.filter((entry) => isTradeLink(entry.id) && present.has(entry.id))
    .map((entry) => entry.id as TradeLink);
}

/**
 * Un solo scambio aggregato per tick: costo O(1), attivo solo con un collegamento.
 *
 * **Le capacita' si sommano, i profili no.** Ogni collegamento porta la propria
 * capacita' di importare cibo e di esportare materiali, e i due ruoli le hanno
 * opposte: il porto muove volume, l'aeroporto muove valore — carica poco ma lo
 * spunta meglio. Sommare le capacita' e' cio' che rende il secondo collegamento
 * una scelta invece di un doppione, e tenere separato il prezzo e' cio' che
 * impedisce all'aeroporto di essere solo un porto piu' caro.
 */
export function resolveExternalTrade(inputs: {
  readonly links: readonly TradeLink[];
  readonly mode: TradeMode;
  readonly population: number;
  readonly buildings: number;
  readonly food: number;
  readonly materials: number;
  readonly funds: number;
}): TradeResult {
  if (inputs.links.length === 0) {
    return {
      ...EMPTY_TRADE,
      foodStock: inputs.food,
      materialsStock: inputs.materials,
      fundsStock: inputs.funds,
    };
  }

  let foodCapacity = 0;
  let materialsCapacity = 0;
  let priceWeighted = 0;
  for (const link of inputs.links) {
    const profile = BALANCE.trade.link[link];
    foodCapacity += profile.food;
    materialsCapacity += profile.materials;
    priceWeighted += profile.materials * profile.price;
  }

  const multipliers = BALANCE.trade.modeMultiplier[inputs.mode];
  const foodTarget = inputs.population * BALANCE.trade.foodReservePerResident;
  const foodWanted = Math.max(0, foodTarget - inputs.food);
  const foodByRate = BALANCE.trade.importFoodPerTick * multipliers.food * foodCapacity;
  const foodByFunds = inputs.funds / BALANCE.trade.importFoodPrice;
  const foodImported = Math.min(foodWanted, foodByRate, foodByFunds);
  const importCost = foodImported * BALANCE.trade.importFoodPrice;

  const materialTarget = inputs.buildings * BALANCE.trade.materialReservePerBuilding;
  const materialSurplus = Math.max(0, inputs.materials - materialTarget);
  const materialsExported = Math.min(
    materialSurplus,
    BALANCE.trade.exportMaterialsPerTick * multipliers.materials * materialsCapacity,
  );
  // Media pesata sulla capacita', non somma: il prezzo e' una qualita' del
  // carico e non una quantita'. Con capacita' nulla non c'e' carico da valutare,
  // e il ramo non si raggiunge perche' anche l'export e' zero.
  const exportPrice = materialsCapacity === 0
    ? BALANCE.trade.exportMaterialPrice
    : BALANCE.trade.exportMaterialPrice * (priceWeighted / materialsCapacity);
  const exportIncome = materialsExported * exportPrice;
  const fundsDelta = exportIncome - importCost;

  return {
    connected: true,
    links: inputs.links,
    food: foodImported,
    materials: materialsExported,
    funds: fundsDelta,
    foodStock: inputs.food + foodImported,
    materialsStock: inputs.materials - materialsExported,
    fundsStock: inputs.funds + fundsDelta,
  };
}

export function isTradeMode(value: string): value is TradeMode {
  return TRADE_MODES.some((mode) => mode.id === value);
}
