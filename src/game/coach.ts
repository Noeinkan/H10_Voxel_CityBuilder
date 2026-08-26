import {
  catalystById,
  catalystRoleOf,
  districtPairingsOf,
  fedShareOf,
  servedFerryLines,
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
  | 'stage' | 'skyline' | 'aerial' | 'rooftop' | 'arcology';

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
  push(districtSuggestion(context));
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
    title: 'Grow food upward',
    message: 'The city eats more than its ground can grow. Place a Greenhouse beside your Factory or Market: the glass farm turns nearby industry into hydroponic towers — food without spending farmland.',
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
      title: 'The world is one Port away',
      message: 'You can afford a Port. Place it on the coast: it opens external trade, and imported food scales with the city, so it keeps helping as you grow.',
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
      message: 'A Ferry only pays off in pairs. Place a second Ferry terminal on the opposite coast: the line opens and both sides get happier.',
      highlight: catalystAnchor(state, 'ferry'),
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
      title: 'Give the city an identity',
      message: 'Growth and connections are in place, but the city has no character. Place a University beside your Park or Transport: together they open a campus quarter that no growth catalyst builds.',
    highlight: null,
    grow: null,
  };
}

// --- Distretti --------------------------------------------------------------

function districtSuggestion(context: CoachContext): CoachSuggestion | null {
  const { state } = context;
  const mixed = state.mixedCounts.reduce((sum, count) => sum + count, 0);

  if (state.catalysts.length >= 2 && mixed <= 0) {
    return {
      id: 'coach-overlap',
      tier: 'district',
      title: 'Overlap your fields',
      message: 'Nobody zones anything in this city. Where two influence fields overlap, a block starts hosting two uses at once — a shop under the flats. Place a catalyst so its field overlaps the Market or Factory.',
      highlight: null,
      grow: null,
    };
  }

  // Una coppia si propone solo a chi ha gia' imparato a sovrapporre: prima di
  // aver visto un uso misto, «metti X accanto a Y» e' la stessa lezione con un
  // nome in piu', e i due consigli si contenderebbero la riga.
  if (mixed > 0) return pairSuggestion(context);
  return null;
}

/**
 * Una coppia di ruoli non ancora provata, proposta come quartiere.
 *
 * Il quartiere nasce dalla *coppia* di due campi sovrapposti: si prende un
 * catalizzatore gia' piazzato e si nomina il partner che gli manca, con la
 * promessa del quartiere che i due insieme aprono.
 */
function pairSuggestion(context: CoachContext): CoachSuggestion | null {
  const roles = new Set(context.state.catalysts.map((entry) => catalystRoleOf(entry)));
  if (roles.size === 0) return null;

  for (const entry of context.state.catalysts) {
    const role = catalystRoleOf(entry);
    for (const pairing of districtPairingsOf(role)) {
      for (const partner of pairing.partners) {
        if (roles.has(partner)) continue;
        return {
          id: `coach-pair-${pairing.district}`,
          tier: 'district',
          title: `Open a ${pairing.district} quarter`,
          message: `Place a ${catalystById(partner).label} beside your ${catalystById(role).label}: together they form a ${pairing.district} quarter, which opens forms no single catalyst builds.`,
          highlight: { x: entry.x, y: entry.y },
          grow: null,
        };
      }
    }
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
      title: `${label} is almost grown`,
      message: `Build ${remaining} more ${remaining === 1 ? 'building' : 'buildings'} near your ${label}: each stage strengthens its catalyst.`,
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
    title: 'Raise the center',
    message: 'Your tallest tower is below what the core allows. Place catalysts so their fields overlap the center: a block only earns the core tier — and its height — where two fields touch.',
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
    title: 'Put a port on a rooftop',
    message: 'A building is tall enough to carry a rooftop structure. Place the Airport on its facade: it becomes a Skyport for airships, eVTOLs and balloons.',
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
      title: 'Hang a floor off a tower',
      message: 'Buildings are tall enough to carry a floor above the street. Choose the Terrace and hang it off the facade of a tall building: it is the first piece of the city aloft.',
      highlight: null,
      grow: null,
    };
  }
  if (aerial.routes === 0) {
    return {
      id: 'coach-aerial-route',
      tier: 'aerial',
      title: 'Join the terraces',
      message: 'Your terraces stand alone. Hang another Terrace facing the first: facing terraces weave a walkway between them, and the network crosses whole blocks.',
      highlight: null,
      grow: null,
    };
  }
  if (aerial.lifts === 0) {
    return {
      id: 'coach-lifts',
      tier: 'aerial',
      title: 'Reach the city above',
      message: 'The city lives above the street, but nothing climbs to it. Build on your decks: inhabited decks raise lifts that connect the levels to the street.',
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
      title: 'The arcology site is open',
      message: 'The center is saturating and a site is being cleared: an arcology is about to rise where the city can no longer grow.',
      highlight: null,
      grow: null,
    };
  }
  if (context.hasArcology) return null;
  if (!context.arcologyNear) return null;

  return {
    id: 'coach-arcology',
    tier: 'arcology',
    title: 'The center is about to crown',
    message: 'The core is dense and its towers have stopped growing: an arcology is about to crown the city. Place more catalysts so their fields overlap the core, and it rises on its own.',
    highlight: null,
    grow: null,
  };
}

// --- Raccolta dei fatti -----------------------------------------------------

/** La posizione del primo catalizzatore di questo ruolo, o null. */
function catalystAnchor(state: SimState, kind: CatalystId): { readonly x: number; readonly y: number } | null {
  const entry = state.catalysts.find((candidate) => catalystRoleOf(candidate) === kind);
  return entry === undefined ? null : { x: entry.x, y: entry.y };
}
