import { AERIAL, AERIAL_PART, type AerialPart } from './config';
import {
  planDeck,
  type AerialProbe,
  type DeckPlan,
  type DeckRect,
  type DeckRefusal,
} from './deckPlan';
import type { FaceRun } from './terracePlan';

/**
 * La rete: un percorso in quota fra due mensole, con gambe proprie.
 *
 * **E' il debito che la 4.5 aveva dichiarato.** Una campata pretende due appoggi
 * gia' alti che si guardano da vicino, e il suo tetto di dodici voxel e' il punto
 * in cui «non e' piu' una passerella ma un viadotto, che ha bisogno di appoggi
 * propri a terra». Qui gli appoggi ci sono, quindi il percorso puo' essere lungo:
 * attraversa piu' di un isolato, ed e' quello il fatto della fase — la citta' si
 * intreccia in tre dimensioni invece di collegarsi dentro un isolato per volta.
 *
 * **Un percorso parte da una mensola, non da una facciata**, e non e' una
 * comodita': e' misurato. Gli edifici di questo progetto sono piramidali, e una
 * facciata offre una parete piana solo in due punti — in alto, dove la fascia e'
 * troppo stretta perche' ci atterri una passerella, e sulla sommita' del
 * basamento, cosi' in basso che una corsa lunga finisce dentro l'edificio
 * accanto. Su milleseicento tentativi non ne passava **nessuno**. La mensola
 * risolve tutte e due le cose in una: e' larga da quattro a otto, sta in aria
 * libera, e la sua quota e' gia' quella di un piano abitato.
 *
 * Ne segue la forma della rete, che e' anche quella delle immagini di
 * riferimento: **le mensole sono le stazioni, i percorsi sono le linee.**
 *
 * **Candidate, non un pathfinding.** Si costruiscono le poche polilinee
 * ortogonali plausibili — dritta quando i due capi si guardano, larga quando sono
 * sfalsati di poco, a zeta quando lo sono di molto — e si prende la prima che sta
 * in piedi. Questo progetto non ha un pathfinding e qui non serve: a variare il
 * percorso e' il luogo, non una ricerca.
 *
 * **Le quote non devono mettersi d'accordo.** Due mensole stanno quasi sempre a
 * quote diverse. La differenza la assorbono i nodi, un pianerottolo per volta:
 * e' cio' che tiene i livelli di questa citta' fluidi invece di costringerli a
 * una griglia.
 */

/**
 * Un capo di percorso: una mensola o un nodo gia' costruiti.
 *
 * E' un `BuildingRecord` ridotto all'osso, come `SpanSupport` per le campate. Il
 * bordo del riquadro **e'** l'atterraggio: non c'e' niente da cercare, perche'
 * quella superficie l'ha gia' costruita qualcuno.
 */
export interface RouteEnd {
  readonly id: number;
  readonly rect: DeckRect;
  /** Quota del piano calpestabile. */
  readonly deckZ: number;
  /**
   * Da che parte questo capo guarda il vuoto, se ha un ospite alle spalle.
   *
   * **Una mensola ha un davanti e un dietro.** Dietro c'e' l'edificio da cui
   * sporge, e un percorso che partisse di li' comincerebbe dentro un muro: e'
   * stato il rifiuto piu' comune del dominio finche' l'asse lo sceglieva la
   * distanza. Assente su un nodo, che di spalle non ne ha.
   */
  readonly open?: { readonly axis: 0 | 1; readonly sign: number };
}

/** Un pezzo di percorso: un tratto o un nodo, con il piano che lo regge. */
export interface RoutePiece {
  readonly part: AerialPart;
  readonly deck: DeckPlan;
}

export interface RoutePlan {
  /**
   * Gli id dei due edifici collegati, **in ordine di percorso**.
   *
   * Non ordinati per id: il primo pezzo si attacca a `fromId` e l'ultimo a
   * `toId`, e chi scrive i record ha bisogno di sapere quale capo e' quale per
   * dare a ciascuno il proprio guinzaglio.
   */
  readonly fromId: number;
  readonly toId: number;
  readonly pieces: readonly RoutePiece[];
  /** Quote dei due atterraggi. Servono a raccontare il percorso, non a costruirlo. */
  readonly fromZ: number;
  readonly toZ: number;
}

export const ROUTE_REFUSALS = [
  /** Un capo e' piu' stretto della passerella che dovrebbe partirne. */
  'noLanding',
  /** I due edifici sono troppo vicini — ci pensa una campata — o troppo lontani. */
  'badSeparation',
  /** I due fronti sono sfalsati di una misura in cui non ci sta nessuna forma. */
  'tooTight',
  /** Il dislivello fra i due atterraggi e' piu' di quanto i nodi assorbano. */
  'tooSteep',
] as const;

export type RouteRefusal = (typeof ROUTE_REFUSALS)[number] | DeckRefusal;

/**
 * Quanto lontano e' arrivato un tentativo prima di arrendersi.
 *
 * `planRoute` prova molte combinazioni — due assi, quattro atterraggi per capo,
 * tre pieghe — e quasi tutte falliscono. Restituire l'ultimo motivo direbbe solo
 * com'e' finito l'ultimo tentativo, che e' quasi sempre il piu' disperato: si
 * tiene invece **quello arrivato piu' avanti**, che e' l'unico che dice qualcosa
 * su cosa manca davvero a questa coppia.
 */
const REFUSAL_DEPTH: Record<RouteRefusal, number> = {
  noLanding: 0,
  badSeparation: 1,
  tooTight: 2,
  tooSteep: 3,
  tooNarrow: 4,
  tooLow: 5,
  blocked: 6,
  onStreet: 7,
  noFooting: 8,
  tooTall: 9,
};

function deepest(a: RouteRefusal, b: RouteRefusal): RouteRefusal {
  return REFUSAL_DEPTH[b] > REFUSAL_DEPTH[a] ? b : a;
}

export type RouteResult =
  | { readonly ok: true; readonly plan: RoutePlan }
  | { readonly ok: false; readonly refusal: RouteRefusal };

export interface RouteQuery extends AerialProbe {
  readonly a: RouteEnd;
  readonly b: RouteEnd;
}

export function planRoute(query: RouteQuery): RouteResult {
  const { a, b } = query;

  // **L'asse lo decidono i capi, non la distanza.** Se una mensola guarda a est,
  // il percorso esce a est: e' l'unica direzione in cui davanti a lei c'e' aria.
  // Solo dove nessuno dei due capi ha un davanti — due nodi — si torna a
  // scegliere l'asse dominante, e allora si provano tutti e due.
  const axes = openAxes(a, b);

  let refusal: RouteRefusal = 'noLanding';
  for (const axis of axes) {
    const [lo, hi] = centerOf(a, axis) <= centerOf(b, axis) ? [a, b] : [b, a];
    if (!exitsFree(lo, axis, 1) || !exitsFree(hi, axis, -1)) continue;
    const result = planBetween(query, axis, {
      lo,
      hi,
      runLo: landingOf(lo, axis, 1),
      runHi: landingOf(hi, axis, -1),
    });
    if (result.ok) return result;
    refusal = deepest(refusal, result.refusal);
  }
  return { ok: false, refusal };
}

/** Gli assi su cui vale la pena provare, il dominante per primo. */
function openAxes(a: RouteEnd, b: RouteEnd): readonly (0 | 1)[] {
  return Math.abs(centerOf(a, 0) - centerOf(b, 0)) >= Math.abs(centerOf(a, 1) - centerOf(b, 1))
    ? [0, 1]
    : [1, 0];
}

/**
 * true se questo capo puo' uscire in quel verso.
 *
 * **Una mensola ha tre lati liberi, non uno.** E' un solaio attaccato a una
 * parete: davanti e sui due fianchi c'e' aria, e solo dietro c'e' l'ospite.
 * Chiedere che si esca dal davanti — la lettura sbagliata di questa stessa regola
 * — lasciava passare quaranta coppie su settecentocinquanta, e nessuna in piedi.
 */
function exitsFree(end: RouteEnd, axis: 0 | 1, outward: 1 | -1): boolean {
  if (end.open === undefined) return true;
  return !(end.open.axis === axis && Math.sign(end.open.sign) !== outward);
}

/** Il bordo di un capo su un asse: e' l'atterraggio, e non c'e' da cercarlo. */
function landingOf(end: RouteEnd, axis: 0 | 1, outward: 1 | -1): FaceRun {
  const { rect } = end;
  const along = axis === 0
    ? (outward > 0 ? rect.x + rect.sizeX - 1 : rect.x)
    : (outward > 0 ? rect.y + rect.sizeY - 1 : rect.y);
  const from = axis === 0 ? rect.y : rect.x;
  const size = axis === 0 ? rect.sizeY : rect.sizeX;
  return { z: end.deckZ, wall: along, from, to: from + size - 1 };
}

interface Landing {
  readonly lo: RouteEnd;
  readonly hi: RouteEnd;
  readonly runLo: FaceRun;
  readonly runHi: FaceRun;
}

/**
 * Il percorso fra due atterraggi scelti, o perche' non c'e'.
 *
 * Le tre forme si provano in ordine di semplicita', e la prima che si applica
 * vince: **un percorso piega solo se non puo' fare altrimenti**.
 */
function planBetween(query: RouteQuery, axis: 0 | 1, landing: Landing): RouteResult {
  const { runLo, runHi } = landing;
  const width = AERIAL.route.walkWidth;

  const from = runLo.wall + 1;
  const to = runHi.wall - 1;
  const length = to - from + 1;
  if (length < AERIAL.route.minSeparation || length > AERIAL.route.maxSeparation) {
    return { ok: false, refusal: 'badSeparation' };
  }
  if (runLo.to - runLo.from + 1 < width || runHi.to - runHi.from + 1 < width) {
    return { ok: false, refusal: 'noLanding' };
  }

  // **Prima si prova a non piegare.** Il tratto comune ai due fronti, se e' largo
  // quanto una passerella, e' gia' il percorso.
  const shared = Math.min(runLo.to, runHi.to) - Math.max(runLo.from, runHi.from) + 1;
  if (shared >= width) {
    const cross = Math.max(runLo.from, runHi.from) + ((shared - width) >> 1);
    return planStraight(query, axis, landing, { from, to, cross, width });
  }

  // Sfalsati di poco: invece di piegare, il tratto si allarga fino a prendersi
  // tutti e due i capi. Un percorso largo sei o otto e' un viale in quota, e a
  // schermo legge molto meglio di una zeta che gira per due voxel.
  const hull = Math.max(runLo.to, runHi.to) - Math.min(runLo.from, runHi.from) + 1;
  if (hull <= AERIAL.route.maxWidth) {
    const cross = Math.min(runLo.from, runHi.from);
    return planStraight(query, axis, landing, { from, to, cross, width: hull });
  }

  // **La piega non c'e', ed e' un debito dichiarato.** Un percorso a zeta esiste
  // sulla carta — due pianerottoli e un tratto di traverso — ma i suoi nodi
  // cadono in punti che il corridoio dritto non ha misurato, e su
  // settecentocinquanta coppie non ne reggeva nessuno. Meglio non averlo che
  // averlo rotto: chi non si guarda, per ora, non si collega.
  return { ok: false, refusal: 'tooTight' };
}

/**
 * Il percorso dritto, con i pianerottoli che il dislivello richiede.
 *
 * Senza dislivello e' un tratto solo: la forma piu' semplice che questo dominio
 * produce, e anche la piu' comune fra due torri che si guardano. Con dislivello,
 * i nodi non servono a girare ma **a salire**, ed e' la ragione per cui non sono
 * legati alle pieghe.
 */
function planStraight(
  query: RouteQuery,
  axis: 0 | 1,
  landing: Landing,
  route: { from: number; to: number; cross: number; width: number },
): RouteResult {
  const { from, to, cross, width } = route;
  const zLo = landing.runLo.z;
  const zHi = landing.runHi.z;

  // **Il percorso scavalca.** La quota di corsa non e' quella dei due capi: e'
  // quella che passa sopra tutto cio' che sta in mezzo, e i due capi ci salgono.
  // Senza questa riga un percorso lungo fra due mensole a quote diverse
  // attraversava qualunque cosa gli capitasse davanti — era il rifiuto piu'
  // comune del dominio.
  // Il colmo si misura sulla fascia che i **pianerottoli** occupano, non su
  // quella dei tratti: un nodo e' piu' largo di una passerella, e un edificio
  // appena fuori dal corridoio lo blocca lo stesso.
  const pad = (hubSide(width) - width) >> 1;
  const floor = Math.max(
    zLo,
    zHi,
    crestOf(query, axis, from, to, cross - pad, width + 2 * pad),
  );
  const side = hubSide(width);

  // **Se non passa, si alza.** Il colmo calcolato guarda cio' che il registry
  // sa — edifici e impalcati — e nel corridoio ci sono anche alberi, campate e
  // stratigrafia che nessuno ha registrato. Invece di indovinare, si riprova un
  // pianerottolo piu' su finche' i salti bastano: e' la stessa idea di
  // `highestLanding` in `spans/`, dal verso opposto.
  let refusal: RouteRefusal = 'blocked';
  for (let lift = 0; ; lift += AERIAL.route.stepPerNode) {
    const profile = climbProfile(zLo, zHi, floor + lift);
    if (profile === null) return { ok: false, refusal: lift === 0 ? 'tooSteep' : refusal };

    const spots = placeHubs(query, axis, { from, to, cross, width, profile });
    if (spots === null) {
      refusal = deepest(refusal, 'blocked');
      continue;
    }

    const nodes = profile.length - 1;
    const pieces: PieceDraft[] = [];
    let cursor = from;
    for (let i = 1; i <= nodes; i++) {
      pieces.push(walk(axis, cursor, spots[i - 1] - 1, cross, width, profile[i - 1]));
      pieces.push(hub(axis, spots[i - 1], cross, width, profile[i - 1], profile[i]));
      cursor = spots[i - 1] + side;
    }
    if (to < cursor) return { ok: false, refusal: 'tooTight' };
    pieces.push(walk(axis, cursor, to, cross, width, profile[nodes]));

    const result = assemble(query, landing, pieces);
    if (result.ok) return result;
    refusal = deepest(refusal, result.refusal);
  }
}

/**
 * Dove cadono i pianerottoli, cercando loro un posto invece di imporglielo.
 *
 * **E' il pezzo che decide se una rete esiste.** Un nodo e' un blocco di sei per
 * sei alto quanto il salto che assorbe: piantato a distanze uguali lungo la
 * corsa, nove volte su dieci finisce dentro qualcosa — e' stato il rifiuto di
 * milleduecento tentativi su millequattrocento. Lasciarlo scorrere lungo la
 * corsa, dalla posizione ideale verso fuori, costa qualche prova e trova il
 * vuoto che c'e'. E' anche il motivo per cui due percorsi paralleli girano in
 * punti diversi: il posto lo decide cio' che c'e' sotto.
 */
function placeHubs(
  query: RouteQuery,
  axis: 0 | 1,
  route: {
    from: number;
    to: number;
    cross: number;
    width: number;
    profile: readonly number[];
  },
): number[] | null {
  const { from, to, cross, width, profile } = route;
  const side = hubSide(width);
  const nodes = profile.length - 1;

  const spots: number[] = [];
  let cursor = from + 1;
  for (let i = 1; i <= nodes; i++) {
    const ideal = from + Math.round(((to - from + 1 - side) * i) / (nodes + 1));
    const last = to - side;
    let placed = -1;

    for (const t of slideOrder(ideal, cursor, last)) {
      const draft = hub(axis, t, cross, width, profile[i - 1], profile[i]);
      const result = planDeck({
        rect: draft.rect,
        deckZ: draft.deckZ,
        drop: draft.drop,
        anchors: [],
        ground: query.ground,
        solid: query.solid,
      });
      if (result.ok) {
        placed = t;
        break;
      }
    }
    if (placed < 0) return null;
    spots.push(placed);
    cursor = placed + side + 1;
  }
  return spots;
}

/** Le posizioni da provare: quella ideale, e poi via via piu' lontane. */
function slideOrder(ideal: number, min: number, max: number): readonly number[] {
  const out: number[] = [];
  for (let step = 0; step <= AERIAL.route.hubSlide; step += 2) {
    for (const t of step === 0 ? [ideal] : [ideal - step, ideal + step]) {
      if (t >= min && t <= max) out.push(t);
    }
  }
  return out;
}

/**
 * La quota piu' bassa a cui una corsa passa sopra tutto quello che copre.
 *
 * E' la stessa domanda del franco di `planDeck`, posta prima invece che dopo:
 * li' serve a rifiutare, qui a scegliere. Costa una lettura per colonna del
 * corridoio, ed e' la lettura che evita di provare quote che non possono
 * funzionare.
 */
function crestOf(
  probe: AerialProbe,
  axis: 0 | 1,
  from: number,
  to: number,
  cross: number,
  width: number,
): number {
  let top = 0;
  for (let v = from; v <= to; v++) {
    for (let w = cross; w < cross + width; w++) {
      const column = axis === 0 ? probe.ground(v, w) : probe.ground(w, v);
      if (column.top > top) top = column.top;
    }
  }
  return top + AERIAL.clearance + AERIAL.girderDepth;
}

/**
 * Le quote dei tratti, salendo da un capo alla corsa e ridiscendendo all'altro.
 *
 * Un pianerottolo per salto, e il salto ha un tetto: e' cio' che rende il
 * dislivello una cosa che si vede — un fianco alto quanto un mezzo piano —
 * invece di una rampa che questo progetto non sa disegnare. `null` se i
 * pianerottoli ammessi non bastano a coprire il dislivello.
 */
function climbProfile(zLo: number, zHi: number, runZ: number): number[] | null {
  const step = AERIAL.route.stepPerNode;
  const up = Math.ceil((runZ - zLo) / step);
  const down = Math.ceil((runZ - zHi) / step);
  if (up + down > AERIAL.route.maxNodes) return null;

  const profile: number[] = [];
  for (let i = 0; i < up; i++) profile.push(zLo + Math.round(((runZ - zLo) * i) / up));
  profile.push(runZ);
  for (let i = 1; i <= down; i++) profile.push(runZ - Math.round(((runZ - zHi) * i) / down));
  return profile;
}

/** Un pezzo prima che il luogo lo confermi: il riquadro, la quota e cosa e'. */
interface PieceDraft {
  readonly part: AerialPart;
  readonly rect: DeckRect;
  readonly deckZ: number;
  readonly drop: number;
}

/** Lato di un pianerottolo: mai piu' stretto del tratto che ci arriva, piu' un bordo. */
function hubSide(width: number): number {
  return Math.max(AERIAL.route.nodeSide, width + 2);
}

/** Un tratto lungo l'asse del percorso, dalla colonna `from` alla `to` comprese. */
function walk(
  axis: 0 | 1,
  from: number,
  to: number,
  cross: number,
  width: number,
  z: number,
): PieceDraft {
  return {
    part: AERIAL_PART.walk,
    rect: rectOf(axis, from, to, cross, width),
    deckZ: z,
    drop: 0,
  };
}

/**
 * Un nodo, che tiene due quote.
 *
 * Il piano sta alla quota alta e il fianco scende fino alla bassa: il tratto che
 * arriva da sotto si appoggia al suo fianco, e il salto si vede. E' un
 * pianerottolo, ed e' anche un posto in cui si costruisce — sono i nodi abitati
 * a fare di una rete una citta' invece di un traliccio.
 */
function hub(
  axis: 0 | 1,
  along: number,
  cross: number,
  width: number,
  zA: number,
  zB: number,
): PieceDraft {
  const side = hubSide(width);
  const pad = (side - width) >> 1;
  return {
    part: AERIAL_PART.node,
    rect: rectOf(axis, along, along + side - 1, cross - pad, side),
    deckZ: Math.max(zA, zB),
    drop: Math.abs(zA - zB),
  };
}

/**
 * Chiede al luogo se i pezzi stanno in piedi, **prima i nodi**.
 *
 * L'ordine non e' un dettaglio: un nodo non e' appeso a niente e si pianta le
 * proprie gambe, e solo dopo i tratti possono contarlo come ancoraggio. Al
 * contrario, ogni tratto sarebbe uno sbalzo dal solo capo da cui parte.
 */
function assemble(query: RouteQuery, landing: Landing, drafts: readonly PieceDraft[]): RouteResult {
  const plans = new Map<number, DeckPlan>();

  for (let i = 0; i < drafts.length; i++) {
    if (drafts[i].part !== AERIAL_PART.node) continue;
    const result = planDeck({
      rect: drafts[i].rect,
      deckZ: drafts[i].deckZ,
      drop: drafts[i].drop,
      anchors: [],
      ground: query.ground,
      solid: query.solid,
    });
    if (!result.ok) return { ok: false, refusal: result.refusal };
    plans.set(i, result.plan);
  }

  for (let i = 0; i < drafts.length; i++) {
    if (drafts[i].part === AERIAL_PART.node) continue;
    const anchors: DeckRect[] = [];
    anchors.push(i === 0 ? landing.lo.rect : drafts[i - 1].rect);
    anchors.push(i === drafts.length - 1 ? landing.hi.rect : drafts[i + 1].rect);

    const result = planDeck({
      rect: drafts[i].rect,
      deckZ: drafts[i].deckZ,
      anchors,
      ground: query.ground,
      solid: query.solid,
    });
    if (!result.ok) return { ok: false, refusal: result.refusal };
    plans.set(i, result.plan);
  }

  return {
    ok: true,
    plan: {
      fromId: landing.lo.id,
      toId: landing.hi.id,
      pieces: drafts.map((draft, i) => ({ part: draft.part, deck: plans.get(i) as DeckPlan })),
      fromZ: landing.runLo.z,
      toZ: landing.runHi.z,
    },
  };
}

/** Un riquadro dato in coordinate «lungo l'asse» e «di traverso». */
function rectOf(axis: 0 | 1, from: number, to: number, cross: number, width: number): DeckRect {
  return axis === 0
    ? { x: from, y: cross, sizeX: to - from + 1, sizeY: width }
    : { x: cross, y: from, sizeX: width, sizeY: to - from + 1 };
}

/** Il centro di un capo su un asse, in mezzi voxel per non perdere il dispari. */
function centerOf(end: RouteEnd, axis: 0 | 1): number {
  return axis === 0
    ? 2 * end.rect.x + end.rect.sizeX
    : 2 * end.rect.y + end.rect.sizeY;
}






