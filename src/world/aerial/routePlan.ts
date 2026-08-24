import { AERIAL, type AerialPart } from './config';
import type { AerialProbe, DeckPlan, DeckRect, DeckRefusal } from './deckPlan';
import {
  assemble,
  climbProfile,
  crestOf,
  hubDraft,
  hubPad,
  hubSide,
  placeHubs,
  rectOf,
  slideOrder,
  walkDraft,
  type Landing,
  type PieceDraft,
  type RouteEnd,
} from './routeDrafts';
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

// L'atterraggio e i pezzi vivono in `routeDrafts.ts`: qui ci sono le forme.
export type { RouteEnd };

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
 * `planRoute` prova molte combinazioni — due assi, tre forme, molte posizioni di
 * piega — e quasi tutte falliscono. Restituire l'ultimo motivo direbbe solo
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
    const cross = bestLane(query, axis, landing, { from, to, width });
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

  // Sfalsati di molto: non resta che girare.
  return planZigzag(query, axis, landing, { from, to, width });
}

/**
 * La corsia piu' sgombra fra quelle che reggono tutti e due gli atterraggi.
 *
 * **Una mensola non sta tutta fuori dal proprio ospite.** L'aggetto parte dalla
 * parete, e su una fascia rientrata le prime colonne cadono ancora dentro
 * l'impronta — e' voluto, e' la terrazza che la grammatica produce gia'. Ma il
 * corridoio di un percorso ereditava quella fascia, e allora **tagliava i corpi
 * degli edifici vicini sullo stesso fronte**: su una citta' vera tutte e dieci
 * le coppie con gli atterraggi allineati morivano cosi', che sono esattamente
 * quelle il cui corridoio correrebbe lungo la strada.
 *
 * Si prova allora ogni corsia che poggi su tutti e due i capi per almeno meta'
 * della propria larghezza — meno di cosi' la passerella arriverebbe di spigolo —
 * e si tiene quella che ha meno roba sopra la testa. E' la stessa idea con cui
 * un pianerottolo scorre lungo la corsa per trovare il vuoto invece di
 * pretenderlo dove capita, applicata di traverso.
 */
function bestLane(
  query: RouteQuery,
  axis: 0 | 1,
  landing: Landing,
  route: { from: number; to: number; width: number },
): number {
  const { from, to, width } = route;
  const { runLo, runHi } = landing;
  const seat = width >> 1;

  const first = Math.min(runLo.from, runHi.from) - width + seat;
  const last = Math.max(runLo.to, runHi.to) - seat + 1;

  let best = Math.max(runLo.from, runHi.from);
  let lowest = Number.POSITIVE_INFINITY;

  for (let cross = first; cross <= last; cross++) {
    // Poggiata su tutti e due, o non e' una passerella fra i due.
    const onLo = Math.min(cross + width - 1, runLo.to) - Math.max(cross, runLo.from) + 1;
    const onHi = Math.min(cross + width - 1, runHi.to) - Math.max(cross, runHi.from) + 1;
    if (onLo < seat || onHi < seat) continue;

    const crest = crestOf(query, [rectOf(axis, from, to, cross, width)]);
    // A parita' vince la prima, che sull'asse cresce: senza un ordine dichiarato
    // la stessa citta' con lo stesso seme farebbe passare la corsia altrove.
    if (crest < lowest) {
      lowest = crest;
      best = cross;
    }
  }
  return best;
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

  // **Il percorso si infila, e scavalca solo se non passa.** La corsa parte dalla
  // quota dei due capi: alla quota di una mensola, fra i corpi degli edifici,
  // sopra una carreggiata, quasi sempre c'e' il vuoto che serve.
  //
  // Partire dal **colmo** — cioe' dalla quota che passa sopra ogni tetto sotto il
  // corridoio — era la lettura precedente, e su una citta' vera cancellava la
  // rete: delle cinquantadue coppie che la passata prova davvero, quarantotto
  // morivano su `tooSteep` perche' il colmo chiedeva ai due capi di salire in
  // cima al quartiere. Il colmo resta e serve al **caso peggiore** — sotto, il
  // ciclo alza la corsa di un pianerottolo per volta finche' il luogo la accetta
  // o finche' i salti finiscono — ma non e' piu' il punto di partenza.
  const floor = Math.max(zLo, zHi);
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
      pieces.push(walkDraft(axis, cursor, spots[i - 1] - 1, cross, width, profile[i - 1]));
      pieces.push(hubDraft(axis, spots[i - 1], cross, width, profile[i - 1], profile[i]));
      cursor = spots[i - 1] + side;
    }
    if (to < cursor) return { ok: false, refusal: 'tooTight' };
    pieces.push(walkDraft(axis, cursor, to, cross, width, profile[nodes]));

    const result = finish(query, landing, pieces);
    if (result.ok) return result;
    refusal = deepest(refusal, result.refusal);
  }
}

/**
 * Il percorso a zeta: due angoli e un tratto di traverso.
 *
 * **E' la forma che era stata tolta, e il motivo per cui torna adesso.** La zeta
 * esisteva gia' e non reggeva su nessuna coppia di una citta' vera: i suoi
 * pianerottoli cadevano in punti che il corridoio dritto non misura, quindi il
 * colmo prometteva un franco che il tratto di traverso non aveva. `crestOf` ora
 * prende i **riquadri veri dei pezzi**, e ciascuna forma misura cio' che davvero
 * scavalca — che e' tutta la correzione.
 *
 * I due angoli sono anche i due pianerottoli: uno sale dal capo basso alla quota
 * di corsa, l'altro ridiscende all'altro capo. Non ce ne sono altri, ed e'
 * voluto — `AERIAL.route.maxTurns` vale due, e una zeta che dovesse anche salire
 * a tappe sarebbe un giro, non un collegamento.
 */
function planZigzag(
  query: RouteQuery,
  axis: 0 | 1,
  landing: Landing,
  route: { from: number; to: number; width: number },
): RouteResult {
  const { from, to, width } = route;
  const { runLo, runHi } = landing;
  const zLo = runLo.z;
  const zHi = runHi.z;
  const side = hubSide(width);
  const pad = hubPad(width);

  // I due tratti dritti corrono in mezzeria del rispettivo atterraggio.
  const crossLo = runLo.from + ((runLo.to - runLo.from + 1 - width) >> 1);
  const crossHi = runHi.from + ((runHi.to - runHi.from + 1 - width) >> 1);
  const step = Math.sign(crossHi - crossLo);
  // Sotto un lato di pianerottolo i due angoli si compenetrerebbero: quel caso
  // e' gia' del tratto largo, che lo risolve senza girare.
  if (Math.abs(crossHi - crossLo) < side) return { ok: false, refusal: 'tooTight' };

  // La piega assorbe il dislivello con i suoi due angoli, uno per capo: piu' di
  // cosi' vorrebbe pianerottoli in mezzo ai tratti, e i giri ammessi sono due.
  const ideal = from + ((to - from + 1 - side) >> 1);
  let refusal: RouteRefusal = 'tooTight';

  for (const at of slideOrder(ideal, from + 1, to - side)) {
    const hubLo = hubDraft(axis, at, crossLo, width, zLo, zLo);
    const hubHi = hubDraft(axis, at, crossHi, width, zHi, zHi);
    // Il tratto di traverso unisce i due angoli, e sta **fuori dal corridoio**:
    // e' esattamente il pezzo che il colmo della corsa non misurava.
    const linkFrom = step > 0 ? crossLo - pad + side : crossHi - pad + side;
    const linkTo = step > 0 ? crossHi - pad - 1 : crossLo - pad - 1;

    const crossAxis = (1 - axis) as 0 | 1;
    const rects: DeckRect[] = [
      rectOf(axis, from, at - 1, crossLo, width),
      hubLo.rect,
      hubHi.rect,
      rectOf(axis, at + side, to, crossHi, width),
    ];
    if (linkFrom <= linkTo) rects.push(rectOf(crossAxis, linkFrom, linkTo, at + pad, width));

    // **Il colmo si misura qui sui riquadri veri dei pezzi**, ed e' il difetto
    // per cui la piega era stata tolta: il tratto di traverso e i due angoli
    // stanno fuori dal corridoio, e il colmo della corsa non li guardava. Serve
    // come tetto della ricerca — sopra di lui non c'e' piu' niente da scavalcare
    // — mentre a partire e' sempre la quota dei due capi.
    // Il colmo e' un **tetto** della ricerca, non un pavimento: sopra di lui non
    // resta niente da scavalcare. Dove i due capi stanno gia' piu' in alto di
    // tutto cio' che il percorso copre — il caso normale fra due mensole in
    // aria — il tetto non deve far saltare il tentativo alla quota dei capi, che
    // e' proprio quello giusto.
    const start = Math.max(zLo, zHi);
    const roof = Math.max(start, crestOf(query, rects));

    for (let runZ = start; runZ <= roof; runZ += AERIAL.route.stepPerNode) {
      // I due angoli sono anche i due pianerottoli, e ciascuno tiene un salto
      // solo: piu' in alto della corsa nessuno dei due arriva.
      if (runZ - zLo > AERIAL.route.stepPerNode || runZ - zHi > AERIAL.route.stepPerNode) {
        refusal = deepest(refusal, 'tooSteep');
        break;
      }

      const drafts: PieceDraft[] = [
        walkDraft(axis, from, at - 1, crossLo, width, zLo),
        hubDraft(axis, at, crossLo, width, zLo, runZ),
      ];
      if (linkFrom <= linkTo) {
        drafts.push(walkDraft(crossAxis, linkFrom, linkTo, at + pad, width, runZ));
      }
      drafts.push(
        hubDraft(axis, at, crossHi, width, runZ, zHi),
        walkDraft(axis, at + side, to, crossHi, width, zHi),
      );

      const result = finish(query, landing, drafts);
      if (result.ok) return result;
      refusal = deepest(refusal, result.refusal);
    }
  }

  return { ok: false, refusal };
}

/** Chiede al luogo se i pezzi reggono, e ne fa un piano di percorso. */
function finish(
  query: RouteQuery,
  landing: Landing,
  drafts: readonly PieceDraft[],
): RouteResult {
  const result = assemble(query, landing, drafts);
  if (!result.ok) return result;
  return {
    ok: true,
    plan: {
      fromId: landing.lo.id,
      toId: landing.hi.id,
      pieces: drafts.map((draft, i) => ({ part: draft.part, deck: result.plans[i] })),
      fromZ: landing.runLo.z,
      toZ: landing.runHi.z,
    },
  };
}

/** Il centro di un capo su un asse, in mezzi voxel per non perdere il dispari. */
function centerOf(end: RouteEnd, axis: 0 | 1): number {
  return axis === 0
    ? 2 * end.rect.x + end.rect.sizeX
    : 2 * end.rect.y + end.rect.sizeY;
}
