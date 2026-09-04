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
 *
 * **La stagione e' un fattore a parte, e non va sommata a `staffing`.** I due
 * moltiplicano lo stesso numero ma rispondono a domande diverse — quanta gente
 * c'e' andata, e quanto c'era da raccogliere — e chi legge il referto deve poter
 * sapere quale dei due manca. Assente vale uno, ed e' il verso giusto in cui
 * sbagliare: chi **pianta** ragiona sull'anno medio, non sul mese che fa.
 */
export function harvestOf(
  farmCounts: readonly number[],
  staffing: number,
  yieldFactor = 1,
): readonly number[] {
  const out = new Array<number>(FARM_COUNT).fill(0);
  const scale = FOOD_PER_HOUSE * staffing * Math.max(0, yieldFactor);
  for (const kind of ALL_FARM_KINDS) {
    out[kind] = (farmCounts[kind] ?? 0) * BALANCE.farms[kind].houses * scale;
  }
  return out;
}

/** Cibo prodotto in un tick, in tutto. E' la somma di `harvestOf`, non un secondo conto. */
export function foodYieldOf(
  farmCounts: readonly number[],
  staffing: number,
  yieldFactor = 1,
): number {
  let total = 0;
  for (const yielded of harvestOf(farmCounts, staffing, yieldFactor)) total += yielded;
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

/**
 * Quanti lotti mancano alla citta' per pareggiare, o 0 se e' a posto.
 *
 * E' `foodDeficitOf` diviso la resa di un campo, e sta **qui** perche' qui sta il
 * listino: chi pianta sa dove c'e' terra fertile, non quanto rende un solco.
 *
 * **E' il numero che prima si perdeva.** Fino alla 4.7 attraversava il confine il
 * cibo mancante e il driver lo riduceva a un booleano: piantava due lotti che ne
 * mancassero due o duecento. La domanda pero' cresce con la citta' — un campo
 * ogni due residenziali — mentre l'offerta restava una costante di
 * `farms/config.ts`, e le due divergevano dal primo isolato. Una citta' arrivava
 * a mangiare un terzo di cio' che le serviva senza che niente lo dicesse.
 *
 * **Punta sopra il pareggio, e non e' la stessa cosa di `foodDeficitOf`.** Quello
 * e' il fatto — quanto cibo manca adesso — e resta zero appena i conti tornano;
 * questo e' il piano, e il piano lascia un margine (`food.targetCoverage`). Al
 * pareggio secco la dispensa vale zero per costruzione, e una citta' senza scorta
 * trasforma in carestia qualunque oscillazione.
 *
 * **Il divisore resta la resa a organico pieno**, anche quando il deficit e'
 * misurato con le braccia di oggi. Non e' una svista: piantare un campo abbassa
 * l'organico di *tutti* — e' un bacino solo — quindi contare il rimedio alla resa
 * ridotta chiederebbe piu' lotti di quanti ne servano e la passata dopo ne
 * chiederebbe altri. Contandolo ottimista il driver cammina verso il punto fisso
 * invece di saltarlo, ed e' anche il verso in cui sbagliare costa meno.
 */
export function missingPlotsOf(
  population: number,
  farmCounts: readonly number[],
  staffing: number,
): number {
  const perPlot = BALANCE.farms[FARM_KIND.field].houses * FOOD_PER_HOUSE;
  // Il margine si chiede come «una citta' un po' piu' grande da sfamare», non
  // come un coefficiente sul deficit: cosi' `foodDeficitOf` resta la stessa
  // funzione con lo stesso significato, e il piano si distingue dal fatto.
  const planFor = population * BALANCE.food.targetCoverage;
  return Math.ceil(foodDeficitOf(planFor, farmCounts, staffing) / perPlot);
}

/**
 * Quanti lotti mancano a **questa** citta'. E' la porta che usa chi pianta.
 *
 * Esiste perche' attraversi il confine un numero solo, come dichiara il
 * `FarmDriver`: l'organico con cui stimare il raccolto e' una scelta della
 * simulazione — e' lei che sa cosa `foodYieldOf` fara' di quel numero — non un
 * parametro da indovinare fuori. `missingPlotsOf` resta l'aritmetica sotto,
 * dove i test la possono interrogare a organico scelto.
 *
 * **L'organico e' quello vero, e prima era il pieno.** Il driver passava `1` per
 * non far piantare campi a una citta' che ha gia' piu' campi che braccia; la
 * conseguenza pero' era che una citta' a 0,7 di organico raccoglieva il 70% di
 * cio' per cui aveva piantato e il driver si fermava credendosi in pareggio. Il
 * timore resta vero ma lo copre il divisore ottimista di `missingPlotsOf`, non
 * una domanda posta sulle braccia sbagliate.
 */
export function missingPlotsFor(state: {
  readonly population: { readonly stock: number };
  readonly farmCounts: readonly number[];
  readonly staffing: number;
}): number {
  return missingPlotsOf(state.population.stock, state.farmCounts, state.staffing);
}

/**
 * Quanta della domanda alimentare e' stata davvero servita, in [0, 1].
 *
 * E' il `fed` del tick riletto dal referto, non un secondo conto — vale la stessa
 * ragione per cui `FoodReport` esiste.
 *
 * **Serve perche' il segno del delta non sa distinguere una carestia da un
 * pareggio.** Ogni consumo e' un `min(domanda, disponibile)`, quindi uno stock
 * esaurito si ferma a zero e il delta vale *esattamente* zero: una citta' che
 * mangia un terzo di cio' che le serve e una in equilibrio scrivono lo stesso
 * numero. Chi deve rispondere a «la citta' mangia?» chiede qui.
 */
export function fedShareOf(harvest: FoodReport, population: number): number {
  const demand = population * BALANCE.food.perResident;
  return demand > 0 ? Math.min(1, harvest.eaten / demand) : 1;
}
