import { BALANCE, FOOD_PER_HOUSE } from './balance';

/**
 * I tre **produttori di cibo**, come indici densi.
 *
 * Sono indici e non stringhe per la stessa ragione degli usi urbani
 * (`classes.ts`): alimentano array paralleli che finiscono in JSON, e un intero
 * sopravvive al giro senza perdita.
 *
 * **Non sono un quinto uso urbano.** Un uso entra nel campo di desiderabilita' —
 * un `Uint8Array` per uso per chunk — e detta la forma di ogni tupla indicizzata
 * del bilancio. Il cibo non ha bisogno di niente di tutto cio': non compete per
 * la desiderabilita', compete per la **terra**, e la terra la sa il mondo. Qui
 * restano dei contatori, e i quattro usi restano quattro (contratto 10).
 *
 * **L'ordine e' da chi consuma piu' suolo a chi ne consuma meno**, ed e' anche la
 * curva della partita: il campo e' quasi gratis ma vuole pianura, il frutteto ne
 * vuole meno e regge il pendio, la torre non ne vuole affatto e si paga in fondi
 * e braccia. Quando l'isola finisce, il cibo sale con tutto il resto.
 *
 * **La torre e' un edificio, gli altri due no.** Campo e frutteto sono lotti che
 * vivono in `src/world/farms/` e non compaiono in `buildingCounts`; la torre e'
 * un edificio industriale con la specializzazione `farming`, quindi conta come
 * industria *e* come produttore di cibo. E' quello che rende la conversione una
 * scelta: una torre in piu' e' una fabbrica in meno.
 */

export const FARM_KIND = {
  field: 0,
  orchard: 1,
  tower: 2,
} as const;

export type FarmKind = (typeof FARM_KIND)[keyof typeof FARM_KIND];

/** Nomi in ordine di indice, per overlay e messaggi di test. */
export const FARM_NAMES: readonly string[] = ['field', 'orchard', 'tower'];

/** Etichette brevi in ordine di indice, per la HUD di gioco. */
export const FARM_LABELS: readonly string[] = ['Fields', 'Orchards', 'Towers'];

export const FARM_COUNT = FARM_NAMES.length;

/** Tutti i produttori in ordine di indice. */
export const ALL_FARM_KINDS: readonly FarmKind[] = [
  FARM_KIND.field,
  FARM_KIND.orchard,
  FARM_KIND.tower,
];

/** true se il valore e' un indice di produttore valido. Serve a validare il JSON. */
export function isFarmKind(value: number): value is FarmKind {
  return Number.isInteger(value) && value >= 0 && value < FARM_COUNT;
}

/**
 * Cibo prodotto in un tick da ciascun produttore, a organico `staffing`.
 *
 * **Un campo senza braccia non raccoglie.** Lo stesso rapporto che frena
 * fabbriche e negozi frena anche la raccolta: e' l'unico bacino di lavoro, e
 * tenerne fuori l'agricoltura vorrebbe dire che una citta' senza lavoratori
 * mangia lo stesso.
 *
 * Il listino sta in edifici residenziali sfamati e diventa cibo qui, moltiplicato
 * per `FOOD_PER_HOUSE`: e' cosi' che la relazione 1:1 resta leggibile nella
 * tabella invece di essere un numero da dividere per un altro.
 *
 * Torna la scomposizione e non il totale perche' e' **la stessa aritmetica** che
 * serve al bilancio e all'HUD: quest'ultimo mostra da dove viene il cibo, e un
 * secondo conto scritto nell'interfaccia divergerebbe dal numero che gli sta
 * sopra alla prima ritaratura del listino.
 */
export function harvestOf(farmCounts: readonly number[], staffing: number): readonly number[] {
  const out = new Array<number>(FARM_COUNT).fill(0);
  for (const kind of ALL_FARM_KINDS) {
    out[kind] = (farmCounts[kind] ?? 0) * BALANCE.farms[kind].houses * FOOD_PER_HOUSE * staffing;
  }
  return out;
}

/** Cibo prodotto in un tick, in tutto. E' la somma di `harvestOf`, non un secondo conto. */
export function foodYieldOf(farmCounts: readonly number[], staffing: number): number {
  let total = 0;
  for (const yielded of harvestOf(farmCounts, staffing)) total += yielded;
  return total;
}

/**
 * Da dove e' venuto il cibo dell'ultimo tick, e dove e' andato.
 *
 * Stessa natura di `CommerceReport` e `FundsReport`, e per la stessa ragione:
 * derivato dal tick e non accumulato, quindi ricostruirlo non richiede storia.
 * Risponde a «da dove viene quello che mangiamo», che con un saldo solo non ha
 * risposta — ed e' la domanda che questa fase esiste per rendere ponibile.
 */
export interface FoodReport {
  /** Raccolto per produttore, indicizzato come `FARM_KIND`. */
  readonly grown: readonly number[];
  /** Quanto ne e' arrivato dal commercio esterno. */
  readonly imported: number;
  /** Quanto ne hanno mangiato gli abitanti: mai piu' di quanto ce n'era. */
  readonly eaten: number;
}

export const EMPTY_HARVEST: FoodReport = {
  grown: new Array<number>(FARM_COUNT).fill(0),
  imported: 0,
  eaten: 0,
};

/** Braccia richieste da tutti i produttori per andare a pieno regime. */
export function farmWorkersOf(farmCounts: readonly number[]): number {
  let total = 0;
  for (const kind of ALL_FARM_KINDS) {
    total += (farmCounts[kind] ?? 0) * BALANCE.farms[kind].workers;
  }
  return total;
}

/** Fondi consumati per tick dai produttori che ne chiedono. */
export function farmUpkeepOf(farmCounts: readonly number[]): number {
  let total = 0;
  for (const kind of ALL_FARM_KINDS) {
    total += (farmCounts[kind] ?? 0) * BALANCE.farms[kind].upkeep;
  }
  return total;
}

/**
 * Quanto cibo manca alla citta' per tick, o 0 se e' in pareggio.
 *
 * E' l'**unico numero** che la simulazione consegna a chi pianta: il driver in
 * `src/world/` decide dove sta un lotto — che e' geografia, e la geografia non
 * sta qui — ma quanti ne servano lo dice il bilancio. E' la stessa divisione di
 * `headroomAt` in `nextBuildSites`, nel verso opposto.
 */
export function foodDeficitOf(
  population: number,
  farmCounts: readonly number[],
  staffing: number,
): number {
  const demand = population * BALANCE.food.perResident;
  return Math.max(0, demand - foodYieldOf(farmCounts, staffing));
}
