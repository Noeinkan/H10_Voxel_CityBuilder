import { BALANCE } from './balance';

export type TradeMode = keyof typeof BALANCE.trade.modeMultiplier;

export interface TradeReport {
  readonly connected: boolean;
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

export const EMPTY_TRADE: TradeReport = { connected: false, food: 0, materials: 0, funds: 0 };

/** Un solo scambio aggregato per tick: costo O(1), attivo esclusivamente col porto. */
export function resolveExternalTrade(inputs: {
  readonly connected: boolean;
  readonly mode: TradeMode;
  readonly population: number;
  readonly buildings: number;
  readonly food: number;
  readonly materials: number;
  readonly funds: number;
}): TradeResult {
  if (!inputs.connected) {
    return {
      ...EMPTY_TRADE,
      foodStock: inputs.food,
      materialsStock: inputs.materials,
      fundsStock: inputs.funds,
    };
  }

  const multipliers = BALANCE.trade.modeMultiplier[inputs.mode];
  const foodTarget = inputs.population * BALANCE.trade.foodReservePerResident;
  const foodWanted = Math.max(0, foodTarget - inputs.food);
  const foodByRate = BALANCE.trade.importFoodPerTick * multipliers.food;
  const foodByFunds = inputs.funds / BALANCE.trade.importFoodPrice;
  const foodImported = Math.min(foodWanted, foodByRate, foodByFunds);
  const importCost = foodImported * BALANCE.trade.importFoodPrice;

  const materialTarget = inputs.buildings * BALANCE.trade.materialReservePerBuilding;
  const materialSurplus = Math.max(0, inputs.materials - materialTarget);
  const materialsExported = Math.min(
    materialSurplus,
    BALANCE.trade.exportMaterialsPerTick * multipliers.materials,
  );
  const exportIncome = materialsExported * BALANCE.trade.exportMaterialPrice;
  const fundsDelta = exportIncome - importCost;

  return {
    connected: true,
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
