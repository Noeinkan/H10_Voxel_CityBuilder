/**
 * I quattro **usi urbani**, come indici densi.
 *
 * Sono indici e non stringhe perche' alimentano array paralleli: il campo di
 * desiderabilita' tiene un `Uint8Array` per uso, le soglie di sito sono una
 * tupla, e l'uso di un edificio finisce dentro strutture che vengono
 * serializzate a JSON. Un intero 0..3 sopravvive al giro senza perdita e non
 * costringe a una mappa nome -> indice in ogni ciclo caldo.
 *
 * **Uso urbano, non catalizzatore e non tipologia.** Sono tre cose separate e
 * vanno tenute separate: l'uso dice *cosa si fa* in quella colonna, il
 * catalizzatore (`catalysts.ts`) dice *cosa il giocatore ha piazzato* e influenza
 * piu' usi insieme, la tipologia — che vive fuori da `src/sim/`, insieme a chi
 * disegna i voxel — dice *che forma prende* l'edificio che ne nasce. Uffici,
 * turismo, ricerca, logistica e intrattenimento non sono usi: sono
 * specializzazioni di questi quattro, e vivono in `districts.ts`.
 *
 * **L'ordine e' contratto.** Va dall'uso piu' morbido al piu' duro, e ogni
 * tupla indicizzata per uso — soglie, pesi, profili di classe, palette — segue
 * questo ordine. Cambiarlo significa cambiare tutte quelle tuple insieme.
 *
 * **Coordinate.** Tutto `src/sim/` vive sul piano di terra `(x, y)` del motore
 * (mondo Z-up: x est, y nord, z altezza). Non esiste una coordinata verticale
 * nella simulazione: una cella e' una colonna, esattamente come nella
 * `TerrainMap`.
 */

export const BUILDING_CLASS = {
  residential: 0,
  commercial: 1,
  industrial: 2,
  civic: 3,
} as const;

export type BuildingClass = (typeof BUILDING_CLASS)[keyof typeof BUILDING_CLASS];

/** Nomi in ordine di indice, per overlay e messaggi di test. */
export const CLASS_NAMES: readonly string[] = [
  'residential',
  'commercial',
  'industrial',
  'civic',
];

/** Etichette brevi in ordine di indice, per la HUD di gioco. */
export const CLASS_LABELS: readonly string[] = ['Housing', 'Commerce', 'Industry', 'Civic'];

export const CLASS_COUNT = CLASS_NAMES.length;

/** Tutti gli usi in ordine di indice: evita di riscrivere `[0, 1, 2, 3]` ovunque. */
export const ALL_CLASSES: readonly BuildingClass[] = [
  BUILDING_CLASS.residential,
  BUILDING_CLASS.commercial,
  BUILDING_CLASS.industrial,
  BUILDING_CLASS.civic,
];

/** true se il valore e' un indice di uso valido. Serve a validare il JSON in ingresso. */
export function isBuildingClass(value: number): value is BuildingClass {
  return Number.isInteger(value) && value >= 0 && value < CLASS_COUNT;
}
