import {
  CATALYSTS,
  catalystById,
  catalystRoleOf,
  districtPairingsOf,
  fedShareOf,
  servedFerryLines,
  type Catalyst,
  type CatalystId,
  type SimState,
} from '../sim';
import { LANDMARK } from '../world/landmarks/config';
import { AERIAL } from '../world/aerial/config';
import { SKYLINE } from '../world/skyline/config';
import { TIER } from '../world/skyline/tiers';

/**
 * Il coach: la direzione di sviluppo che la voce suggerisce una volta che la
 * citta' ha superato il tutorial.
 *
 * **Puro come `tips.ts`, e per la stessa ragione.** Entra uno `SimState` piu'
 * una manciata di fatti del mondo gia' misurati, esce un elenco ordinato. Non
 * c'e' un cursore, non c'e' un «gia' visto»: un suggerimento si spegne quando la
 * condizione che lo ha acceso non e' piu' vera, e cosi' il giocatore capisce
 * *quale* delle sue mosse lo ha risolto. Vive in `src/game/` e non in
 * `src/sim/` perche' legge fatti del mondo — stadi dei landmark, arcologie,
 * quota del centro — che la simulazione non conosce (invariante 7).
 *
 * **Dove sta la differenza con `tips.ts`.** Quella voce parla di *salute*: una
 * crisi in corso, un collo di bottiglia che frena. Il coach parla di *rotta*:
 * cosa costruire dopo, quale combinazione provare, come salire. E' sempre
 * presente, non solo quando qualcosa va storto, ed e' il motivo per cui le
 * vecchie opportunita' (`open-trade`, `ferry-needs-a-pair`) e le meccaniche
 * (`overlap`, `the-city-eats-its-farms`, `towers-are-converted-industry`) sono
 * migrate qui invece di restare due voci concorrenti.
 *
 * **I numeri stanno qui, non in `balance.ts`.** Sono soglie di *quando parlare*,
 * non di come la simulazione calcola: calibrano la voce, come gia' fa
 * `TIPS` in `tips.ts`.
 */

export type CoachTier =
  | 'connections' | 'identity' | 'district' | 'food'
  | 'stage' | 'skyline' | 'aerial' | 'rooftop' | 'arcology' | 'landmark';

export interface CoachSuggestion {
  /** Stabile: identifica il consiglio, non il momento in cui e' apparso. */
  readonly id: string;
  readonly tier: CoachTier;
  readonly title: string;
  /** Nomina il gesto, mai solo la diagnosi. */
  readonly message: string;
  /** Catalizzatore esistente da evidenziare («tocca questo»), o null. */
  readonly highlight: { readonly x: number; readonly y: number } | null;
  /** Landmark a meta' stadio da far crescere, o null. */
  readonly grow: {
    readonly x: number;
    readonly y: number;
    readonly kind: CatalystId;
    readonly stage: number;
    /** Soglia dello stadio successivo. */
    readonly nextAt: number;
    /** Edifici gia' dentro il raggio, per contare «N in piu'». */
    readonly nearby: number;
  } | null;
}

export interface CoachLandmark {
  readonly kind: CatalystId;
  readonly x: number;
  readonly y: number;
  /** Stadio attuale, cioe' `record.level`. */
  readonly stage: number;
  /** Soglia dello stadio successivo, o null se e' al massimo. */
  readonly nextAt: number | null;
  /** Edifici dentro il raggio del catalizzatore: gli stessi numeri del driver. */
  readonly nearby: number;
}

export interface CoachContext {
  readonly state: SimState;
  /** Massimo livello edificato: la cima dello skyline. */
  readonly tallestLevel: number;
  readonly hasArcology: boolean;
  /** Cantiere dell'arcologia aperto. */
  readonly clearing: boolean;
  /**
   * true quando il centro ha abbastanza costruito ma non ancora saturo: la
   * condizione dell'arcologia e' prossima e il coach la annuncia.
   */
  readonly arcologyNear: boolean;
  /** true se esiste gia' un landmark in quota (Skyport, giardino o transito da tetto). */
  readonly hasAloftLandmark: boolean;
  readonly aerial: {
    readonly terraces: number;
    readonly routes: number;
    readonly lifts: number;
    readonly piers: number;
    readonly stacked: number;
  };
  readonly spans: number;
  readonly ropeways: number;
  readonly landmarks: readonly CoachLandmark[];
}

/**
 * Sotto quale quota di domanda servita il cibo e' insufficiente.
 *
 * Uno vuol dire «mangia meno di cio' che le serve»: sotto il pareggio, ma non
 * ancora crisi — la crisi scatta solo con la dispensa vuota, e qui si parla
 * *prima*. E' la finestra in cui la serra e' la risposta invece di un
 * pannicello.
 */
const FOOD = {
  insufficientShare: 1,
} as const;

/**
 * A quale frazione della soglia successiva un landmark «sta quasi crescendo».
 *
 * Tre quarti: sotto, l'avanzamento e' lontano e nominarlo sarebbe rumore;
 * sopra, la citta' ha davvero quasi guadagnato lo stadio e vale la pena dire
 * quanto manca.
 */
const STAGE = {
  nearShare: 0.75,
} as const;

/**
 * Tutti i suggerimenti che valgono adesso, dal piu' urgente al meno.
 *
 * L'elenco intero e non solo il primo, come `tipsFor`: la voce mostra una riga
 * sola, ma un test — o un pannello futuro — vuole vedere cosa il coach direbbe
 * se il piu' urgente si risolvesse.
 */
export function coachSuggestions(context: CoachContext): readonly CoachSuggestion[] {
  const out: CoachSuggestion[] = [];
  const push = (suggestion: CoachSuggestion | null): void => {
    if (suggestion !== null) out.push(suggestion);
  };
  push(foodSuggestion(context));
  push(connectionsSuggestion(context));
  push(identitySuggestion(context));
  push(overlapSuggestion(context));
  push(missingLandmarkSuggestion(context));
  push(stageSuggestion(context));
  push(skylineSuggestion(context));
  push(rooftopSuggestion(context));
  push(aerialSuggestion(context));
  push(arcologySuggestion(context));
  return out;
}

/** Il primo suggerimento, o null se il coach non ha niente da dire. */
export function coachSuggestion(context: CoachContext): CoachSuggestion | null {
  return coachSuggestions(context)[0] ?? null;
}

// --- Cibo -------------------------------------------------------------------

function foodSuggestion(context: CoachContext): CoachSuggestion | null {
  const { state } = context;
  const population = state.population.stock;
  if (population <= 0) return null;
  if (fedShareOf(state.harvest, population) >= FOOD.insufficientShare) return null;

  const anchor = catalystAnchor(state, 'factory') ?? catalystAnchor(state, 'market');
  return {
      id: 'coach-food',
      tier: 'food',
      title: 'Place a Greenhouse',
      message: 'People don\'t have enough food: the city eats more than its ground can grow. To fix that, place a Greenhouse close to your Factory (or Market): the glass farm turns nearby industry into hydroponic towers — food without spending a plot of farmland.',
    highlight: anchor,
    grow: null,
  };
}

// --- Connessioni ------------------------------------------------------------

function connectionsSuggestion(context: CoachContext): CoachSuggestion | null {
  const { state } = context;

  if (state.trade.links.length === 0 && state.funds.stock >= catalystById('port').cost) {
    return {
      id: 'coach-port',
      tier: 'connections',
      title: 'Place a Port',
      message: 'The island has no way to trade with the world, and you can afford to open one. To fix that, place a Port on the coast: it opens external trade, and imported food scales with what the city eats, so it keeps helping as it grows.',
      highlight: null,
      grow: null,
    };
  }

  const terminals = state.catalysts.filter((entry) => catalystRoleOf(entry) === 'ferry').length;
  if (terminals > 0 && servedFerryLines(state.catalysts) === 0) {
    return {
      id: 'coach-ferry-pair',
      tier: 'connections',
      title: 'Place a second Ferry',
      message: 'Your Ferry has only one terminal, so no line is open — a pier is not a line. To fix that, place a second Ferry terminal on the opposite coast: the line opens and both sides get happier.',
      highlight: catalystAnchor(state, 'ferry'),
      grow: null,
    };
  }

  // Il Transit e' il collegamento interno: arriva quando i distretti sono gia'
  // diversi e nessuno li lega insieme. Soglia di cinque per non rubare la riga
  // all'identita' e ai distretti — appena finito il tutorial non c'e' ancora
  // niente da collegare, e «Overlap two fields» insegna di piu'.
  const hasTransport = state.catalysts.some((entry) => catalystRoleOf(entry) === 'transport');
  if (state.catalysts.length >= 5 && !hasTransport) {
    return {
      id: 'coach-transport',
      tier: 'connections',
      title: 'Place a Transit',
      message: 'Your districts are spreading far apart, and nothing ties them together. To fix that, place a Transit close to your busiest quarter: it lifts homes, shops and workshops alike, and asks nothing of the site.',
      highlight: null,
      grow: null,
    };
  }

  return null;
}

// --- Identita' --------------------------------------------------------------

function identitySuggestion(context: CoachContext): CoachSuggestion | null {
  const { state } = context;
  const hasIdentity = state.catalysts.some(
    (entry) => catalystById(catalystRoleOf(entry)).group === 'identity',
  );
  if (hasIdentity) return null;

  return {
      id: 'coach-identity',
      tier: 'identity',
      title: 'Place a University',
      message: 'The city has homes, jobs and parks, but no landmark that gives it character. To fix that, place a University close to your Park or Transport: together they open a campus quarter that no growth catalyst builds.',
    highlight: null,
    grow: null,
  };
}

// --- Distretti --------------------------------------------------------------

/**
 * La lezione del sovrapporre: si dice una volta sola, appena c'e' materia, e
 * sta **prima** del catalogo perche' insegna la regola che lo rende utile.
 */
function overlapSuggestion(context: CoachContext): CoachSuggestion | null {
  const { state } = context;
  const mixed = state.mixedCounts.reduce((sum, count) => sum + count, 0);

  if (state.catalysts.length >= 2 && mixed <= 0) {
    return {
      id: 'coach-overlap',
      tier: 'district',
      title: 'Overlap two fields',
      message: 'No block hosts two uses yet — nobody zones anything here. Where two influence fields overlap, a block starts hosting two uses at once, a shop under the flats. To fix that, place a catalyst so its field overlaps the Market or Factory.',
      highlight: null,
      grow: null,
    };
  }
  return null;
}

// --- Stadi ------------------------------------------------------------------

function stageSuggestion(context: CoachContext): CoachSuggestion | null {
  for (const landmark of context.landmarks) {
    if (landmark.nextAt === null) continue;
    if (landmark.nearby >= landmark.nextAt) continue;
    if (landmark.nearby < landmark.nextAt * STAGE.nearShare) continue;

    const remaining = landmark.nextAt - landmark.nearby;
    const label = catalystById(landmark.kind).label;
    return {
      id: `coach-stage-${landmark.kind}`,
      tier: 'stage',
      title: `Build ${remaining} more near the ${label}`,
      message: `Your ${label} is close to its next stage. To fix that, build ${remaining} more ${remaining === 1 ? 'building' : 'buildings'} near it: each stage strengthens its catalyst, so an early monument pays off for the whole game.`,
      highlight: null,
      grow: {
        x: landmark.x,
        y: landmark.y,
        kind: landmark.kind,
        stage: landmark.stage,
        nextAt: landmark.nextAt,
        nearby: landmark.nearby,
      },
    };
  }
  return null;
}

// --- Skyline ----------------------------------------------------------------

function skylineSuggestion(context: CoachContext): CoachSuggestion | null {
  if (context.tallestLevel >= SKYLINE.levelCap[TIER.core]) return null;

  return {
    id: 'coach-skyline',
    tier: 'skyline',
    title: 'Overlap fields in the center',
    message: 'Your tallest tower is below what the core allows — the center can still rise. To fix that, place catalysts so their fields overlap the center: a block only earns the core tier, and its height, where two fields touch.',
    highlight: null,
    grow: null,
  };
}

// --- Tetti ------------------------------------------------------------------

function rooftopSuggestion(context: CoachContext): CoachSuggestion | null {
  if (context.hasAloftLandmark) return null;
  if (context.tallestLevel < LANDMARK.aloftMinLevel) return null;

  return {
    id: 'coach-skyport',
    tier: 'rooftop',
    title: 'Place the Airport on a roof',
    message: 'A building is tall enough to carry a rooftop structure, but none has one yet. To fix that, place the Airport on its facade: it becomes a Skyport for airships, eVTOLs and balloons.',
    highlight: null,
    grow: null,
  };
}

// --- Citta' in quota --------------------------------------------------------

function aerialSuggestion(context: CoachContext): CoachSuggestion | null {
  const { aerial, tallestLevel } = context;
  if (tallestLevel < AERIAL.minHostLevel) return null;

  if (aerial.terraces === 0) {
    return {
      id: 'coach-terrace',
      tier: 'aerial',
      title: 'Place a Terrace',
      message: 'Your buildings are tall enough to carry a floor above the street, but none do. To fix that, place a Terrace on a tall facade: it is the first piece of the city aloft.',
      highlight: null,
      grow: null,
    };
  }
  if (aerial.routes === 0) {
    return {
      id: 'coach-aerial-route',
      tier: 'aerial',
      title: 'Place a second Terrace',
      message: 'Your terraces stand alone — none faces another, so no walkway links them. To fix that, place a second Terrace facing the first: facing terraces weave a walkway between them, and the network crosses whole blocks.',
      highlight: null,
      grow: null,
    };
  }
  if (aerial.lifts === 0) {
    return {
      id: 'coach-lifts',
      tier: 'aerial',
      title: 'Build on your decks',
      message: 'The city lives above the street, but nothing climbs to it — the decks are unreachable from the ground. To fix that, build on your decks: inhabited decks raise lifts that connect the levels to the street.',
      highlight: null,
      grow: null,
    };
  }
  return null;
}

// --- Arcologie --------------------------------------------------------------

function arcologySuggestion(context: CoachContext): CoachSuggestion | null {
  if (context.clearing) {
    return {
      id: 'coach-arcology-site',
      tier: 'arcology',
      title: 'An arcology is being built',
      message: 'A site is being cleared in the center: an arcology is about to rise where the city can no longer grow.',
      highlight: null,
      grow: null,
    };
  }
  if (context.hasArcology) return null;
  if (!context.arcologyNear) return null;

  return {
    id: 'coach-arcology',
    tier: 'arcology',
    title: 'An arcology is about to rise',
    message: 'The core is dense and its towers have stopped growing — the center is saturating. To fix that, place more catalysts so their fields overlap the core, and the arcology crowns on its own.',
    highlight: null,
    grow: null,
  };
}

// --- Catalogo ---------------------------------------------------------------

/**
 * Il catalogo: ogni landmark che la citta' non ha ancora, con il perche'.
 *
 * E' il cuore della voce: quando nessun tier strategico ha niente da dire, c'e'
 * comunque un landmark da piazzare e un motivo per farlo. Scorre la toolbar in
 * ordine — crescita, connessioni, identita' — e propone il primo che manca.
 * Se quel landmark apre un quartiere con un ruolo gia' piazzato, lo dice:
 * «mettilo accanto a X, insieme fanno Y». Mercato, fabbrica e parco restano
 * fuori perche' il tutorial li ha gia' chiesti.
 */
function missingLandmarkSuggestion(context: CoachContext): CoachSuggestion | null {
  const placed = new Set(context.state.catalysts.map((entry) => catalystRoleOf(entry)));
  for (const definition of CATALYSTS) {
    if (placed.has(definition.id)) continue;

    const pairing = nearestPairing(definition.id, context.state.catalysts);
    if (pairing !== null) {
      return {
        id: `coach-missing-${definition.id}`,
        tier: 'landmark',
        title: `Place a ${definition.label}`,
        message: `Place a ${definition.label} close to your ${catalystById(pairing.role).label}: together they form a ${pairing.district} quarter. ${definition.description}`,
        highlight: { x: pairing.x, y: pairing.y },
        grow: null,
      };
    }

    return {
      id: `coach-missing-${definition.id}`,
      tier: 'landmark',
      title: `Place a ${definition.label}`,
      message: `You haven't placed the ${definition.label} yet. ${definition.description}`,
      highlight: null,
      grow: null,
    };
  }
  return null;
}

/**
 * Il quartiere che questo landmark aprirebbe con un ruolo gia' piazzato, o null.
 *
 * E' la stessa lettura di `districtPairingsOf` che prima stava nel tier
 * distretti: accanto al catalogo arricchisce la tessera mancante con il «dove»
 * invece di nominarla e basta.
 */
function nearestPairing(
  kind: CatalystId,
  catalysts: readonly Catalyst[],
): { readonly role: CatalystId; readonly district: string; readonly x: number; readonly y: number } | null {
  for (const pairing of districtPairingsOf(kind)) {
    for (const partner of pairing.partners) {
      const entry = catalysts.find((candidate) => catalystRoleOf(candidate) === partner);
      if (entry !== undefined) {
        return { role: partner, district: pairing.district, x: entry.x, y: entry.y };
      }
    }
  }
  return null;
}

// --- Raccolta dei fatti -----------------------------------------------------

/** La posizione del primo catalizzatore di questo ruolo, o null. */
function catalystAnchor(state: SimState, kind: CatalystId): { readonly x: number; readonly y: number } | null {
  const entry = state.catalysts.find((candidate) => catalystRoleOf(candidate) === kind);
  return entry === undefined ? null : { x: entry.x, y: entry.y };
}
