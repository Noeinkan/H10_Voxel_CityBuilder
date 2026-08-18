/**
 * Le tre classi di edificio, come indici densi.
 *
 * Sono indici e non stringhe perche' alimentano array paralleli: il campo di
 * desiderabilita' tiene un `Uint8Array` per classe, le soglie di sito sono una
 * tupla, e la classe di un catalizzatore finisce dentro strutture che vengono
 * serializzate a JSON. Un intero 0..2 sopravvive al giro senza perdita e non
 * costringe a una mappa nome -> indice in ogni ciclo caldo.
 *
 * **Coordinate.** Tutto `src/sim/` vive sul piano di terra `(x, y)` del motore
 * (mondo Z-up: x est, y nord, z altezza). Non esiste una coordinata verticale
 * nella simulazione: una cella e' una colonna, esattamente come nella
 * `TerrainMap`.
 */

export const BUILDING_CLASS = {
  residential: 0,
  production: 1,
  civic: 2,
} as const;

export type BuildingClass = (typeof BUILDING_CLASS)[keyof typeof BUILDING_CLASS];

/** Nomi in ordine di indice, per overlay e messaggi di test. */
export const CLASS_NAMES: readonly string[] = ['residential', 'production', 'civic'];

export const CLASS_COUNT = CLASS_NAMES.length;

/** Tutte le classi in ordine di indice: evita di riscrivere `[0, 1, 2]` ovunque. */
export const ALL_CLASSES: readonly BuildingClass[] = [
  BUILDING_CLASS.residential,
  BUILDING_CLASS.production,
  BUILDING_CLASS.civic,
];

/** true se il valore e' un indice di classe valido. Serve a validare il JSON in ingresso. */
export function isBuildingClass(value: number): value is BuildingClass {
  return value === 0 || value === 1 || value === 2;
}
