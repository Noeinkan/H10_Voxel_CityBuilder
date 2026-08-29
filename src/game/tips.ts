import {
  BALANCE,
  BUILDING_CLASS,
  catalystRoleOf,
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
  /**
   * **La riga che il giocatore legge davvero**, e quindi l'unica che deve
   * bastare da sola: la targa in basso a sinistra mostra il titolo e nient'altro
   * — il messaggio vive nel cassetto Citta', che si apre solo se si decide di
   * aprirlo.
   *
   * Ne segue un contratto in due parti, e le crisi sul cibo erano le sole a
   * rispettarlo. **Porta la causa misurata**: «Build more homes» non dice quanto
   * manchi, mentre il 42% di organico che stava sepolto nel messaggio e' proprio
   * il numero che il giocatore puo' guardare risalire. **E nomina un gesto che
   * il giocatore puo' fare**: case e campi crescono da soli — li pianta il driver
   * di `src/world/` — quindi «Build more homes» e «Plant more farms» chiedevano
   * l'unica cosa che nessun click ottiene. Il gesto vero e' il catalizzatore che
   * li fa nascere.
   *
   * Sta in due righe da ~55 caratteri, che e' quanto la targa concede.
   */
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
    const advice = foodAdvice(state);
    out.push({
      id: 'food-shortage',
      kind: 'crisis',
      title: advice.title,
      message: advice.message,
    });
  }

  if (state.funds.stock <= BALANCE.gameplay.crisis.fundsReserve && state.funds.delta < 0) {
    // La cassa e non il delta: la crisi scatta su un saldo che scende, ma il
    // delta di un tick puo' arrotondarsi a zero e «losing 0 funds» non e' un
    // avviso. Quanto resta in cassa e' il numero che si guarda scendere.
    const left = Math.max(0, Math.round(state.funds.stock));
    out.push({
      id: 'budget-deficit',
      kind: 'crisis',
      title: `Budget deficit: ${left} funds left — place a Market, or switch on Austerity.`,
      message: 'The city is losing funds every tick: services cost more than the shops earn. To fix that, place a Market so commerce pays for them, or switch on Austerity. No buildings will be lost.',
    });
  }

  if (state.satisfaction <= BALANCE.gameplay.crisis.satisfaction) {
    // «Happiness» e la percentuale sono le stesse parole della barra risorse:
    // un consiglio che ribattezza cio' che sta gia' a schermo si fa cercare.
    const percent = Math.round(state.satisfaction * 100);
    out.push({
      id: 'unhappy-city',
      kind: 'crisis',
      title: `Happiness ${percent}%: crowded and underserved — place a Park, then a Market.`,
      message: 'The city is overcrowded or underserved, and satisfaction has hit rock bottom. To fix that, place a Park to raise civic life, a Market so shops serve people, and more housing to lower the crowding that causes it.',
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
 *
 * **Titolo e messaggio nascono insieme.** Il titolo e' l'unica riga che il toast
 * mostra per una crisi, quindi porta gia' causa e rimedio — «Food shortage
 * because X, so do Y» — mentre il messaggio aggiunge il come e la rassicurazione
 * che la fame non e' una sconfitta.
 */
function foodAdvice(state: SimState): { title: string; message: string } {
  const towers = state.farmCounts[FARM_KIND.tower] ?? 0;
  const connected = state.trade.links.length > 0;
  const hasGreenhouse = state.catalysts.some(
    (catalyst) => catalystRoleOf(catalyst) === 'greenhouse',
  );
  const recover = 'Population declines slowly and can recover.';

  if (towers <= 0 && hasGreenhouse) {
    const trade = connected
      ? 'Keep trade on Prioritize food while it grows.'
      : 'A Port on the coast can cover part of the deficit while it grows.';
    return {
      title: 'Food shortage: no tower yet — overlap the Greenhouse with the Factory.',
      message: `People don't have enough food: the Greenhouse is already in place, but no hydroponic tower has formed yet. To fix that, overlap its ring with your Factory (or Market) and let an industrial building inside grow until a Hydroponic tower appears. ${trade} ${recover}`,
    };
  }
  if (!connected && towers <= 0) {
    return {
      title: 'Food shortage: the fields can\'t feed the city — add a Greenhouse or a Port.',
      message: `People don't have enough food: the fields alone can no longer feed the city — the island runs out of good ground long before it runs out of people. To fix that, place a Greenhouse close to your Factory (or Market): the glass farm turns nearby industry into hydroponic towers. A Port on the coast opens food imports instead. ${recover}`,
    };
  }
  if (connected && towers <= 0) {
    return {
      title: 'Food shortage: imports aren\'t enough — prioritize food or add a Greenhouse.',
      message: `People don't have enough food: imports alone are not keeping up. To fix that, switch trade to Prioritize food, or place a Greenhouse close to your Factory so dense industry grows hydroponic towers. ${recover}`,
    };
  }
  if (!connected) {
    return {
      title: 'Food shortage: towers fall short — add a Port for imports.',
      message: `People don't have enough food: even your towers fall short. To fix that, place a Port on the coast — imported food arrives as a share of what the city eats, so it keeps scaling with it. ${recover}`,
    };
  }
  return {
    title: 'Food shortage: farms and imports lag — slow the clock to catch up.',
    message: `People don't have enough food: farms and imports are both behind the city's appetite. To fix that, slow the clock and let the countryside catch up before growing further. ${recover}`,
  };
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
      title: `Only ${percent}% staffed — place another Market so homes grow.`,
      message: `Factories, shops and fields share one workforce, and it is only ${percent}% staffed — every one of them is producing that fraction. To fix that, build more homes: houses grow around your Market, so place another Market instead of more industry.`,
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
      title: 'Shops have nothing to sell — place a Factory near the Market.',
      message: 'Your shops are open with nothing to sell: commerce burns materials, and the warehouse is empty. To fix that, place a Factory close to your Market — it stocks the shelves, and until then the shops earn nothing.',
    });
  }

  // La campagna che insegue: si dice **prima** che la dispensa finisca, perche'
  // dopo e' gia' la crisi qui sopra e il tempo per piantare non c'e' piu'.
  const wanted = missingPlotsFor(state);
  if (wanted > 0 && state.population.stock > 0 &&
    fedShareOf(state.harvest, state.population.stock) >= 1) {
    const hasGreenhouse = state.catalysts.some(
      (catalyst) => catalystRoleOf(catalyst) === 'greenhouse',
    );
    // «Plant more farms» chiedeva l'unico gesto che il giocatore non ha: i lotti
    // li pianta il driver di `src/world/` sulla terra fertile che trova libera.
    // Cio' che dipende da chi gioca e' lasciargliela, o togliere del tutto la
    // domanda di terra con la serra.
    const gesture = hasGreenhouse
      ? 'overlap the Greenhouse ring with the Factory.'
      : 'place a Greenhouse near the Factory.';
    const response = hasGreenhouse
      ? 'Keep open ground inside the existing Greenhouse ring for new plots, or overlap that ring with the Factory so dense industry can become hydroponic towers.'
      : 'Leave open ground for new plots — or place a Greenhouse close to the Factory for hydroponic towers that spend no farmland.';
    out.push({
      id: 'countryside-behind',
      kind: 'bottleneck',
      title: `Fields are ${wanted} plots behind — ${gesture}`,
      message: `The city eats well today, but its fields are about ${wanted} plots behind its appetite. To fix that, ${response}`,
    });
  }

  return out;
}
