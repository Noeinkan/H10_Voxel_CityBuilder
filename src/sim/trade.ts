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
  /**
   * Quantita' di materiali **importata**: positiva, e zero in ogni modalita' che
   * non sia `materialImports`.
   *
   * E' un campo suo e non il segno di `materials` perche' quello e' letto come
   * «esportato» da `MaterialsReport.exported` e dall'HUD: cambiargli il dominio
   * avrebbe chiesto a ogni lettore di imparare un verso, e il primo che non
   * l'avesse imparato avrebbe mostrato un export dove c'era un acquisto.
   */
  readonly materialsIn: number;
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
  {
    id: 'materialImports',
    label: 'Buy materials',
    description: 'Buys materials to restart stalled construction, at a price above what exports fetch.',
  },
];

export const EMPTY_TRADE: TradeReport = {
  connected: false,
  links: [],
  food: 0,
  materials: 0,
  materialsIn: 0,
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
 * Quanta della spesa alimentare i collegamenti sanno coprire in un tick.
 *
 * **E' una quota e non una quantita'**, ed e' li' che stava il difetto: la
 * domanda vale `pop * food.perResident` e cresce con la citta', quindi una
 * portata assoluta sbaglia da tutte e due le parti — sovrabbondante al primo
 * isolato, irrilevante al decimo. Vedi `trade.importFoodShare` per i numeri.
 *
 * Torna **la quota** e non gia' il cibo perche' ha due lettori: `resolveExternalTrade`
 * la moltiplica per la domanda, e `tick` la somma alla copertura del raccolto per
 * decidere se l'emergenza alimentare e' rientrata. Li' serve la *portata* e non
 * quanto e' passato davvero — cio' che entra dipende da quanto c'e' gia' in
 * dispensa, e una dotazione d'emergenza lo falserebbe.
 */
export function foodImportShareOf(links: readonly TradeLink[], mode: TradeMode): number {
  let capacity = 0;
  for (const link of links) capacity += BALANCE.trade.link[link].food;
  return BALANCE.trade.importFoodShare * BALANCE.trade.modeMultiplier[mode].food * capacity;
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

  let materialsCapacity = 0;
  let priceWeighted = 0;
  for (const link of inputs.links) {
    const profile = BALANCE.trade.link[link];
    materialsCapacity += profile.materials;
    priceWeighted += profile.materials * profile.price;
  }

  const multipliers = BALANCE.trade.modeMultiplier[inputs.mode];
  const foodTarget = inputs.population * BALANCE.trade.foodReservePerResident;
  const foodWanted = Math.max(0, foodTarget - inputs.food);
  // La portata segue la taglia della citta': la quota la sa `foodImportShareOf`,
  // qui si moltiplica per la spesa di questo tick. Una sola aritmetica per i due
  // lettori — l'altro e' il fronte dell'emergenza in `tick`.
  const foodByRate = inputs.population * BALANCE.food.perResident *
    foodImportShareOf(inputs.links, inputs.mode);
  const foodByFunds = inputs.funds / BALANCE.trade.importFoodPrice;
  const foodImported = Math.min(foodWanted, foodByRate, foodByFunds);
  const importCost = foodImported * BALANCE.trade.importFoodPrice;

  const materialTarget = inputs.buildings * BALANCE.materials.reservePerBuilding;
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

  // Il verso opposto, e i fondi che gli restano sono quelli che il cibo non ha
  // gia' speso: la dispensa ha la precedenza sul cantiere perche' una citta' che
  // compra travi mentre smette di mangiare perde gli abitanti che le
  // costruirebbero. E' l'unico ordine che le due voci possono avere.
  const materialGoal = inputs.buildings * BALANCE.trade.importMaterialTarget;
  const materialsWanted = Math.max(0, materialGoal - inputs.materials);
  const materialsByRate = BALANCE.trade.importMaterialsPerTick *
    multipliers.materialsIn * materialsCapacity;
  const fundsAfterFood = Math.max(0, inputs.funds - importCost);
  const materialsByFunds = fundsAfterFood / BALANCE.trade.importMaterialPrice;
  const materialsImported = Math.min(materialsWanted, materialsByRate, materialsByFunds);
  const materialsCost = materialsImported * BALANCE.trade.importMaterialPrice;

  const fundsDelta = exportIncome - importCost - materialsCost;

  return {
    connected: true,
    links: inputs.links,
    food: foodImported,
    materials: materialsExported,
    materialsIn: materialsImported,
    funds: fundsDelta,
    foodStock: inputs.food + foodImported,
    materialsStock: inputs.materials - materialsExported + materialsImported,
    fundsStock: inputs.funds + fundsDelta,
  };
}

export function isTradeMode(value: string): value is TradeMode {
  return TRADE_MODES.some((mode) => mode.id === value);
}
