import {
  BALANCE,
  BUILDING_CLASS,
  catalystById,
  catalystRoleOf,
  districtPairingsOf,
  FARM_KIND,
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
 * cosa costruire dopo, quale combinazione provare, come salire. Parla soltanto
 * quando puo' nominare un traguardo osservabile, ed e' il motivo per cui le
 * vecchie opportunita' (`open-trade`, `ferry-needs-a-pair`) e le meccaniche
 * (`overlap`, `the-city-eats-its-farms`, `towers-are-converted-industry`) sono
 * migrate qui invece di restare due voci concorrenti.
 *
 * **I numeri stanno qui, non in `balance.ts`.** Sono soglie di *quando parlare*,
 * non di come la simulazione calcola: calibrano la voce, come gia' fa
 * `TIPS` in `tips.ts`.
 */

export type CoachTier =
  | 'food' | 'foundation' | 'development' | 'district' | 'connections'
  | 'identity' | 'stage' | 'skyline' | 'aerial' | 'rooftop' | 'arcology';

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
  /**
   * Dove posare un nuovo catalizzatore («metti qui»), con il raggio del landmark
   * suggerito. E' il centro da coprire: l'overlay vi traccia l'anello del campo
   * che il landmark produrrebbe. Assente per i suggerimenti che non piazzano nulla.
   */
  readonly place?: { readonly x: number; readonly y: number; readonly radius: number } | null;
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
  /**
   * La colonna piu' densa: dove il centro deve guadagnare un campo per salire.
   * Null finche' nessuna colonna raggiunge la densita' del nucleo, e in quel
   * caso lo skyline non e' ancora un problema di catalizzatori ma di costruito.
   */
  readonly center: { readonly x: number; readonly y: number } | null;
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

/** Prima di suggerire un'altra spesa, lascia che i tre campi iniziali parlino. */
const FOUNDATION = {
  observedBuildings: 6,
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
  push(foundationSuggestion(context));
  push(overlapSuggestion(context));
  push(developmentSuggestion(context));
  push(connectionsSuggestion(context));
  push(stageSuggestion(context));
  push(identitySuggestion(context));
  push(rooftopSuggestion(context));
  push(aerialSuggestion(context));
  push(skylineSuggestion(context));
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

  // Il coach apre una via, non continua a venderla dopo che il giocatore l'ha
  // imboccata. Serra, torre e commercio sono le tre risposte strutturali al
  // cibo: se almeno una esiste, l'eventuale carestia resta alla voce di salute
  // (`tips.ts`), che sa dire quale anello della risposta non sta funzionando.
  // Lasciare qui il solo controllo sul raccolto teneva invece questa riga al
  // primo posto per sempre e nascondeva tutta la progressione successiva.
  const hasGreenhouse = state.catalysts.some(
    (catalyst) => catalystRoleOf(catalyst) === 'greenhouse',
  );
  const hasTower = (state.farmCounts[FARM_KIND.tower] ?? 0) > 0;
  const hasTrade = state.trade.links.length > 0;
  if (hasGreenhouse || hasTower || hasTrade) return null;

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

// --- Fondazione -------------------------------------------------------------

/**
 * La prima lezione dopo i tre click e' osservare la conseguenza, non farne un
 * quarto. Senza questa pausa il coach chiedeva subito un landmark nuovo mentre
 * la citta' non aveva ancora costruito un solo isolato: il giocatore imparava a
 * svuotare la toolbar, non a leggere la simulazione.
 */
function foundationSuggestion(context: CoachContext): CoachSuggestion | null {
  const built = context.state.buildings.length;
  if (built >= FOUNDATION.observedBuildings) return null;
  const remaining = FOUNDATION.observedBuildings - built;
  return {
    id: 'coach-observe-foundation',
    tier: 'foundation',
    title: `Let ${remaining} more ${remaining === 1 ? 'block' : 'blocks'} grow`,
    message: `Set speed to 4× and do not place another catalyst yet. When the city reaches ${FOUNDATION.observedBuildings} buildings, compare Population, Materials and Funds; the first weak number decides the next move.`,
    highlight: catalystAnchor(context.state, 'market'),
    grow: null,
  };
}

// --- Sviluppo ---------------------------------------------------------------

interface DevelopmentPlan {
  readonly kind: CatalystId;
  readonly partner: CatalystId;
  readonly noun: string;
  readonly result: string;
}

/** Una risposta concreta per ciascuno dei quattro usi, nello stesso ordine contratto. */
const DEVELOPMENT_PLAN: readonly DevelopmentPlan[] = [
  { kind: 'school', partner: 'market', noun: 'homes', result: 'adds housing and civic life' },
  { kind: 'monument', partner: 'market', noun: 'shops', result: 'draws commerce and visitors' },
  { kind: 'power', partner: 'factory', noun: 'workshops', result: 'strengthens industry' },
  { kind: 'school', partner: 'park', noun: 'civic uses', result: 'extends the civic district' },
] as const;

/**
 * Porta la citta' al prossimo traguardo misurabile, invece di percorrere i
 * landmark in ordine di catalogo. Il numero citato e' lo stesso che compare nel
 * traguardo di autosufficienza e include gli usi secondari dei blocchi misti.
 */
function developmentSuggestion(context: CoachContext): CoachSuggestion | null {
  const target = BALANCE.gameplay.success.buildingsPerClass;
  let chosen = -1;
  let largestGap = 0;
  for (let cls = BUILDING_CLASS.residential; cls <= BUILDING_CLASS.civic; cls++) {
    const count = context.state.buildingCounts[cls] + context.state.mixedCounts[cls];
    const gap = target - count;
    if (gap > largestGap) {
      largestGap = gap;
      chosen = cls;
    }
  }
  if (chosen < 0) return null;

  const plan = DEVELOPMENT_PLAN[chosen];
  if (plan === undefined) return null;
  const count = context.state.buildingCounts[chosen] + context.state.mixedCounts[chosen];
  const definition = catalystById(plan.kind);
  const partner = catalystAnchor(context.state, plan.partner);
  const shortfall = Math.max(0, Math.ceil(definition.cost - context.state.funds.stock));
  const first = shortfall > 0
    ? `Save ${shortfall} more Funds for a ${definition.label}.`
    : `Place a ${definition.label} so its ring overlaps your ${catalystById(plan.partner).label}.`;
  return {
    id: `coach-development-${chosen}`,
    tier: 'development',
    title: `Add ${plan.noun} · ${count}/${target}`,
    message: `${first} That overlap ${plan.result}; this step is complete when ${plan.noun} reach ${target}.`,
    highlight: partner,
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
      message: 'Choose Connections → Port and aim at a highlighted coastal site. The step is complete when Trade shows a connection; imports can then cover food the island cannot grow.',
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
      message: 'Place a second Ferry on a different coast, across water from the highlighted terminal. The step is complete when a route and moving ferry appear between them.',
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
      message: 'Place a Transit where its ring covers buildings from two existing districts. It lifts homes, shops and workshops together; watch the shared area become denser.',
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

  const kind = 'university';
  const definition = catalystById(kind);
  const pairing = nearestPairing(kind, context.state.catalysts);
  const shortfall = Math.max(0, Math.ceil(definition.cost - context.state.funds.stock));
  const first = shortfall > 0
    ? `Save ${shortfall} more Funds for a ${definition.label}.`
    : pairing === null
      ? `Place a ${definition.label} where its ring covers an established district.`
      : `Place a ${definition.label} beside the highlighted ${catalystById(pairing.role).label}.`;
  return {
      id: 'coach-identity',
      tier: 'identity',
      title: 'Open a campus quarter',
      message: `${first} Their overlapping rings create a campus and unlock research buildings; the step is complete when Research appears in the district view.`,
    highlight: pairing === null ? null : { x: pairing.x, y: pairing.y },
    grow: null,
  };
}

// --- Distretti --------------------------------------------------------------

/**
 * La lezione del sovrapporre: si dice una volta sola, appena c'e' materia. Sta
 * prima dei nuovi landmark perche' insegna a leggere quelli che ci sono gia'.
 */
function overlapSuggestion(context: CoachContext): CoachSuggestion | null {
  const { state } = context;
  const mixed = state.mixedCounts.reduce((sum, count) => sum + count, 0);

  if (state.catalysts.length >= 2 && mixed <= 0) {
    return {
      id: 'coach-overlap',
      tier: 'district',
      title: 'Create the first mixed-use block',
      message: 'Place the next catalyst so its ring overlaps the highlighted Market ring. The step is complete when Mixed-use blocks in City rises above zero.',
      highlight: catalystAnchor(state, 'market'),
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
      message: `Build inside the highlighted ${label} ring until ${remaining} more ${remaining === 1 ? 'building appears' : 'buildings appear'}. Its next stage then increases the strength of the same field.`,
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

/**
 * I landmark che il coach chiede di posare sul centro, dal campo piu' largo al
 * piu' economico. Il campo largo e' il gesto giusto: un landmark di identita'
 * copre tutto il nucleo denso con una sola spesa, e il cono regala due livelli
 * solo dove il campo e' pieno, cioe' a ridosso del landmark.
 */
const SKYLINE_CANDIDATES: readonly CatalystId[] = ['university', 'transport', 'market'];

/**
 * Il campo piu' largo che i fondi coprono, o il piu' economico con il saldo.
 *
 * Non e' un elenco di desideri: nomina un solo landmark, come ogni altra riga
 * del coach. Chi ha fondi sceglie il campo largo, chi no il gesto minimo — un
 * Market basta ad aprire la fascia core, e l'anello si rafforza poi.
 */
function skylinePlan(funds: number): { readonly kind: CatalystId; readonly shortfall: number } {
  for (const kind of SKYLINE_CANDIDATES) {
    const cost = catalystById(kind).cost;
    if (funds >= cost) return { kind, shortfall: 0 };
  }
  const cheapest = SKYLINE_CANDIDATES[SKYLINE_CANDIDATES.length - 1];
  return { kind: cheapest, shortfall: Math.ceil(catalystById(cheapest).cost - funds) };
}

function skylineSuggestion(context: CoachContext): CoachSuggestion | null {
  if (context.tallestLevel >= SKYLINE.levelCap[TIER.core]) return null;
  const center = context.center;
  if (center === null) return null;

  const { state } = context;
  const coreCap = SKYLINE.levelCap[TIER.core];
  const plan = skylinePlan(state.funds.stock);
  const definition = catalystById(plan.kind);

  const spend = plan.shortfall > 0
    ? `Save ${plan.shortfall} more Funds for a ${definition.label}.`
    : `Place a ${definition.label} so its ring covers the densest block.`;

  const message = `Your tallest tower is level ${context.tallestLevel}, but the core allows ${coreCap}: the densest block sits outside a strong field, so its towers stay capped in the middle band. ${spend} The step is complete when a tower beside it reaches level ${coreCap}.`;

  return {
    id: 'coach-skyline',
    tier: 'skyline',
    title: 'Cover the center with a field',
    message,
    highlight: null,
    grow: null,
    place: { x: center.x, y: center.y, radius: definition.radius },
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

/**
 * Il quartiere che un landmark aprirebbe con un ruolo gia' piazzato, o null.
 * Serve ai soli suggerimenti che chiedono davvero quella sinergia: non percorre
 * piu' il catalogo per tenere la voce artificialmente piena.
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
