import {
  BALANCE,
  BUILDING_CLASS,
  effectiveCount,
  FARM_KIND,
  fedShareOf,
  missingPlotsFor,
  type SimState,
} from '../sim';

/**
 * La **salute** della citta', detta quando serve e solo quando serve.
 *
 * **Un consiglio nomina un gesto, o non e' un consiglio.** E' la riga che questo
 * modulo esiste per far rispettare: la voce che guidava prima diceva «Add
 * production near a residential area» a una citta' affamata, e quel gesto **non
 * produce cibo** — il cibo lo piantano i lotti di `src/world/farms/` da soli, e
 * quando la terra coltivabile finisce le uniche due risposte sono la torre
 * idroponica e il commercio esterno. Una diagnosi giusta con un rimedio
 * sbagliato e' peggio del silenzio.
 *
 * **Puro e senza storia.** Entra uno stato, esce un elenco ordinato. Non c'e' un
 * cursore, non c'e' un «gia' visto»: un consiglio si spegne quando la condizione
 * che lo ha acceso non e' piu' vera, il che e' anche l'unico modo perche' il
 * giocatore capisca **quale** delle sue mosse lo ha risolto.
 *
 * **Due famiglie in ordine di urgenza, e basta.** Una crisi sta succedendo
 * adesso; un collo di bottiglia frena senza suonare nessun allarme — ed e' la
 * categoria fatta di cose che le barre non mostrano. Le opportunita' e le
 * meccaniche sono migrate nel **coach** (`coach.ts`), che parla di *rotta*
 * mentre qui si parla di *salute*: due voci che dicevano cose simili su una riga
 * sola si contendevano lo schermo, e il coach le ha assorbite.
 */

export type TipKind = 'crisis' | 'bottleneck';

export interface GameTip {
  /** Stabile: identifica il consiglio, non il momento in cui e' apparso. */
  readonly id: string;
  readonly kind: TipKind;
  readonly title: string;
  /** Cosa sta succedendo **e** il gesto che lo risolve. Mai solo la diagnosi. */
  readonly message: string;
}

/**
 * Le soglie a cui un consiglio si accende.
 *
 * Stanno qui e non in `balance.ts` di proposito, ed e' una distinzione che vale
 * la pena tenere: `balance.ts` calibra la **simulazione**, questi numeri
 * calibrano *quando parlare al giocatore*. Le soglie di crisi restano invece
 * quelle vere, lette da `gameplay.crisis`: li' il consiglio non decide niente,
 * riferisce una condizione che la simulazione gia' conosce.
 */
const TIPS = {
  /**
   * Organico sotto il quale la citta' e' a corto di braccia.
   *
   * Sette decimi e non uno: l'organico oscilla mentre la citta' cresce, e un
   * consiglio che si accendesse a ogni edificio nuovo sarebbe rumore. A 0,7
   * un'infornata su tre di cio' che la citta' produce si sta gia' perdendo.
   */
  staffingFloor: 0.7,

  /**
   * Sotto quanti abitanti non ha senso parlare di organico.
   *
   * Una casa piena. `staffing` vale zero anche in una citta' che non ha ancora
   * nessuno da mandare a lavorare, e il primo consiglio dopo il tutorial diceva
   * «only 0% staffed» a un'isola con due edifici sopra. Sotto una casa piena non
   * c'e' una carenza di braccia, c'e' una citta' che deve ancora cominciare.
   */
  workforceFloor: BALANCE.weights.residentialCapacity,
} as const;

/**
 * Tutti i consigli che valgono adesso, dal piu' urgente al meno.
 *
 * L'elenco intero e non solo il primo: chi mostra una riga sola prende
 * `urgentTip`, ma un pannello — o un test — vuole poter vedere cosa la citta'
 * direbbe se il piu' grave si risolvesse.
 */
export function tipsFor(state: SimState): readonly GameTip[] {
  return [
    ...crisisTips(state),
    ...bottleneckTips(state),
  ];
}

/** Il consiglio piu' grave, o null se la citta' sta bene. */
export function urgentTip(state: SimState): GameTip | null {
  return tipsFor(state)[0] ?? null;
}

// --- Crisi ------------------------------------------------------------------

function crisisTips(state: SimState): GameTip[] {
  const out: GameTip[] = [];
  const population = state.population.stock;

  if (population > 0 &&
    state.food.stock <= BALANCE.gameplay.crisis.foodReserve &&
    fedShareOf(state.harvest, population) < 1) {
    out.push({
      id: 'food-shortage',
      kind: 'crisis',
      title: 'Food shortage',
      message: foodAdvice(state),
    });
  }

  if (state.funds.stock <= BALANCE.gameplay.crisis.fundsReserve && state.funds.delta < 0) {
    out.push({
      id: 'budget-deficit',
      kind: 'crisis',
      title: 'Budget deficit',
      message: 'Services cost more than your income, and only shops pay for them. Place a Market so commerce can grow, or switch on Austerity. No buildings will be lost.',
    });
  }

  if (state.satisfaction <= BALANCE.gameplay.crisis.satisfaction) {
    out.push({
      id: 'unhappy-city',
      kind: 'crisis',
      title: 'Critical happiness',
      message: 'The city is overcrowded or underserved. Place a Park to raise civic life and a Market so shops serve people; more housing lowers the crowding that causes it.',
    });
  }

  return out;
}

/**
 * Cosa dire a una citta' che non mangia, che dipende da **cosa ha gia' provato**.
 *
 * Le due vie d'uscita sono la verticale e il commercio, e nominarle tutte e due
 * ogni volta sarebbe dire al giocatore di comprare cio' che ha gia'. Il ramo si
 * sceglie sui fatti dello stato: le torri che ha, il collegamento che ha aperto.
 */
function foodAdvice(state: SimState): string {
  const towers = state.farmCounts[FARM_KIND.tower] ?? 0;
  const connected = state.trade.links.length > 0;
  const recover = 'Population declines slowly and can recover.';

  if (!connected && towers <= 0) {
    return `Fields alone can no longer feed the city — the island runs out of good ground long before it runs out of people. Place a Greenhouse beside your Factory (or Market): the glass farm turns nearby industry into hydroponic towers. A Port opens food imports instead. ${recover}`;
  }
  if (connected && towers <= 0) {
    return `Imports are not keeping up on their own. Switch trade to Prioritize food, or build upward: a Greenhouse beside your Factory turns dense industry into hydroponic towers. ${recover}`;
  }
  if (!connected) {
    return `Your towers are not enough on their own. A Port opens food imports, which arrive as a share of what the city eats and so keep scaling with it. ${recover}`;
  }
  return `Both your farms and your imports are behind the city's appetite. Slow the clock and let the countryside catch up before growing further. ${recover}`;
}

// --- Colli di bottiglia -----------------------------------------------------

function bottleneckTips(state: SimState): GameTip[] {
  const out: GameTip[] = [];

  // **L'unico bacino di lavoro**, ed e' la cosa che nessuna barra mostra: sotto
  // organico *tutto* rende meno insieme — le fabbriche, i negozi e il raccolto —
  // quindi il giocatore vede tre problemi e ne ha uno.
  const farmPlots = (state.farmCounts[FARM_KIND.field] ?? 0) +
    (state.farmCounts[FARM_KIND.orchard] ?? 0) +
    (state.farmCounts[FARM_KIND.tower] ?? 0);
  const asksForWork = effectiveCount(state, BUILDING_CLASS.industrial) > 0 ||
    effectiveCount(state, BUILDING_CLASS.commercial) > 0 ||
    farmPlots > 0;

  if (asksForWork &&
    state.population.stock >= TIPS.workforceFloor &&
    state.staffing < TIPS.staffingFloor) {
    const percent = Math.round(state.staffing * 100);
    out.push({
      id: 'short-handed',
      kind: 'bottleneck',
      title: 'Build more homes',
      message: `Factories, shops and fields share one workforce, and it is only ${percent}% staffed — every one of them is producing that fraction. Build more homes: houses grow around your Market, so place another Market instead of more industry.`,
    });
  }

  // Il magazzino a zero non e' un allarme di risorsa: e' un negozio aperto e
  // vuoto, che incassa nulla e non serve nessuno. La causa sta una catena
  // indietro, ed e' quella che va nominata.
  if (state.commerce.capacity > 0 &&
    state.materials.stock <= 0 &&
    state.commerce.served < state.commerce.demand) {
    out.push({
      id: 'empty-shelves',
      kind: 'bottleneck',
      title: 'Place a Factory',
      message: 'Your shops are open with nothing to sell: commerce burns materials, and the warehouse is empty. Place a Factory to stock them — until then the shops earn nothing.',
    });
  }

  // La campagna che insegue: si dice **prima** che la dispensa finisca, perche'
  // dopo e' gia' la crisi qui sopra e il tempo per piantare non c'e' piu'.
  const wanted = missingPlotsFor(state);
  if (wanted > 0 && state.population.stock > 0 &&
    fedShareOf(state.harvest, state.population.stock) >= 1) {
    out.push({
      id: 'countryside-behind',
      kind: 'bottleneck',
      title: 'Plant more farms',
      message: `The city is eating well today, but it has outgrown its fields by about ${wanted} plots. Plant more farms — or place a Greenhouse beside your Factory to grow hydroponic towers without farmland.`,
    });
  }

  return out;
}
