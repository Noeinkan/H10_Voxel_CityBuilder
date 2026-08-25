import {
  BALANCE,
  BUILDING_CLASS,
  catalystById,
  catalystRoleOf,
  effectiveCount,
  FARM_KIND,
  fedShareOf,
  missingPlotsFor,
  servedFerryLines,
  type SimState,
} from '../sim';

/**
 * Cosa il gioco ha da dire al giocatore, adesso.
 *
 * **Un consiglio nomina un gesto, o non e' un consiglio.** E' la riga che questo
 * modulo esiste per far rispettare: la voce che guidava prima diceva «Add
 * production near a residential area» a una citta' affamata, e quel gesto **non
 * produce cibo** — il cibo lo piantano i lotti di `src/world/farms/` da soli, e
 * quando la terra coltivabile finisce le uniche due risposte sono la torre
 * idroponica e il commercio esterno. Una diagnosi giusta con un rimedio
 * sbagliato e' peggio del silenzio: manda il giocatore a costruire la cosa che
 * non serve e gli lascia credere di aver capito.
 *
 * **Puro e senza storia.** Entra uno stato, esce un elenco ordinato. Non c'e' un
 * cursore, non c'e' un «gia' visto», e non deve essercene: un consiglio si
 * spegne quando la condizione che lo ha acceso non e' piu' vera, il che e' anche
 * l'unico modo perche' il giocatore capisca **quale** delle sue mosse lo ha
 * risolto. La rotazione degli evergreen e' l'unica eccezione, e passa dal
 * `tickCount` dello stato invece che da un contatore tenuto qui.
 *
 * **Quattro famiglie in ordine di urgenza.** Una crisi sta succedendo adesso; un
 * collo di bottiglia frena senza suonare nessun allarme — ed e' la categoria che
 * mancava del tutto, perche' e' fatta di cose che le barre non mostrano; una
 * opportunita' e' una porta aperta che il giocatore non ha visto; una meccanica
 * e' una regola che il gioco non dice da nessuna parte. Chi consuma ne mostra
 * una sola per volta, quindi l'ordine **e'** la scelta.
 */

export type TipKind = 'crisis' | 'bottleneck' | 'opportunity' | 'mechanic';

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
 * calibrano *quando parlare al giocatore*. Sono la stessa cosa solo finche' non
 * si vuole rendere la voce piu' o meno insistente senza toccare il bilancio —
 * che e' esattamente cio' che si vorra' fare provandoli a schermo.
 *
 * Le soglie di crisi restano invece quelle vere, lette da `gameplay.crisis`: li'
 * il consiglio non decide niente, riferisce una condizione che la simulazione
 * gia' conosce.
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
   * Una casa piena. **Non e' una rifinitura**: `staffing` vale zero anche in una
   * citta' che non ha ancora nessuno da mandare a lavorare, e il primo consiglio
   * dopo il tutorial diceva «only 0% staffed» a un'isola con due edifici sopra.
   * Sotto una casa piena non c'e' una carenza di braccia, c'e' una citta' che
   * deve ancora cominciare.
   */
  workforceFloor: BALANCE.weights.residentialCapacity,

  /** Tick fra un evergreen e il successivo, quando non c'e' altro da dire. */
  rotateTicks: 300,
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
    ...opportunityTips(state),
    ...mechanicTips(state),
  ];
}

/** Il consiglio piu' grave che non sia un evergreen, o null se la citta' sta bene. */
export function urgentTip(state: SimState): GameTip | null {
  return tipsFor(state).find((tip) => tip.kind !== 'mechanic') ?? null;
}

/**
 * La regola da raccontare quando non c'e' niente di urgente, al giro `turn`.
 *
 * **Il turno lo sceglie chi chiama, e non e' pigrizia.** Ricavarlo qui dal
 * `tickCount` sembrava piu' pulito e nascondeva un difetto: chi mostra queste
 * righe le alterna con il traguardo, quindi ne consuma una ogni due giri, e un
 * indice che avanza a ogni giro salterebbe per sempre meta' dell'elenco — con
 * due consigli, il primo non si vedrebbe mai. Un solo posto puo' sapere quanti
 * turni sono davvero passati **per questa voce**, ed e' quello che alterna.
 */
export function evergreenTip(state: SimState, turn: number): GameTip | null {
  const tips = mechanicTips(state);
  if (tips.length === 0) return null;
  return tips[Math.abs(Math.trunc(turn)) % tips.length];
}

/** Quanti tick dura un turno della voce. Lo legge chi alterna. */
export const TIP_TURN_TICKS = TIPS.rotateTicks;

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
      message: 'Services cost more than your income. Shops are what pay for them, so let commerce grow — or switch on Austerity. No buildings will be lost.',
    });
  }

  if (state.satisfaction <= BALANCE.gameplay.crisis.satisfaction) {
    out.push({
      id: 'unhappy-city',
      kind: 'crisis',
      title: 'Critical happiness',
      message: 'The city is overcrowded or underserved. A Park raises civic life, shops raise it too by serving people — and more housing lowers the crowding that causes it.',
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
    return `Fields alone can no longer feed the city — the island runs out of good ground long before it runs out of people. Place a Transit beside your Factory: a dense industrial district grows hydroponic towers. A Port opens food imports instead. ${recover}`;
  }
  if (connected && towers <= 0) {
    return `Imports are not keeping up on their own. Switch trade to Prioritize food, or build upward: a Transit beside your Factory turns dense industry into hydroponic towers. ${recover}`;
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
      title: 'Short of hands',
      message: `Factories, shops and fields share one workforce, and it is only ${percent}% staffed — every one of them is producing that fraction. Let housing catch up before adding more industry.`,
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
      title: 'Empty shelves',
      message: 'Your shops are open with nothing to sell: commerce burns materials, and the warehouse is empty. A Factory is what stocks them — until then the shops earn nothing.',
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
      title: 'The countryside is behind',
      message: `The city is eating well today, but it has outgrown its fields by about ${wanted} plots and the farms are still catching up. Growth from here will run the pantry down.`,
    });
  }

  return out;
}

// --- Opportunita' -----------------------------------------------------------

function opportunityTips(state: SimState): GameTip[] {
  const out: GameTip[] = [];

  if (state.population.stock > 0 &&
    state.trade.links.length === 0 &&
    state.funds.stock >= catalystById('port').cost) {
    out.push({
      id: 'open-trade',
      kind: 'opportunity',
      title: 'The world is one Port away',
      message: 'You can afford a Port. It has to sit on the coast, and it opens external trade: imported food scales with how much the city eats, so it keeps helping as you grow.',
    });
  }

  // Un molo solo non e' una linea, ed e' l'unico ruolo che da solo non chiude la
  // propria promessa: senza il secondo capo il giocatore ha pagato e non vede
  // niente, che e' il modo piu' rapido per credere che la meccanica sia rotta.
  const terminals = state.catalysts.filter((entry) => catalystRoleOf(entry) === 'ferry').length;
  if (terminals > 0 && servedFerryLines(state.catalysts) === 0) {
    out.push({
      id: 'ferry-needs-a-pair',
      kind: 'opportunity',
      title: 'A pier is not a line',
      message: 'A Ferry only pays off in pairs. Place a second terminal on the far shore, far enough that the crossing is a crossing — then the line opens and both sides get happier.',
    });
  }

  return out;
}

// --- Meccaniche -------------------------------------------------------------

/**
 * Le regole che il gioco non dice da nessuna parte.
 *
 * Ognuna si accende solo dove e' **osservabile**: dire che la citta' si mangia i
 * propri campi a chi non ne ha ancora uno e' una nozione, dirlo a chi ne ha
 * dodici e' la spiegazione di una cosa che sta guardando.
 */
function mechanicTips(state: SimState): GameTip[] {
  const out: GameTip[] = [];

  const mixed = state.mixedCounts.reduce((sum, count) => sum + count, 0);
  if (state.catalysts.length >= 2 && mixed <= 0) {
    out.push({
      id: 'overlap-makes-mixed-use',
      kind: 'mechanic',
      title: 'Overlap your fields',
      message: 'Nobody zones anything in this city. Where two influence fields overlap, a block starts hosting two uses at once — a shop under the flats. Place your next catalyst so its reach touches an existing one.',
    });
  }

  const plots = (state.farmCounts[FARM_KIND.field] ?? 0) +
    (state.farmCounts[FARM_KIND.orchard] ?? 0);
  if (plots > 0) {
    out.push({
      id: 'the-city-eats-its-farms',
      kind: 'mechanic',
      title: 'The city eats its own fields',
      message: 'Farm plots never block a building: when the blocks reach them, the fields retire. That is the pressure behind the whole food economy — the pantry per resident shrinks as the city grows.',
    });
  }

  if ((state.farmCounts[FARM_KIND.tower] ?? 0) > 0) {
    out.push({
      id: 'towers-are-converted-industry',
      kind: 'mechanic',
      title: 'A tower is a factory that grows food',
      message: 'A hydroponic tower feeds six houses and takes no farmland — but it counts as industry that stopped making materials, and it costs funds every tick. Growing food upward is a trade, not a shortcut.',
    });
  }

  return out;
}
