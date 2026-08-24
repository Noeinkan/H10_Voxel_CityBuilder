import { AERIAL, AERIAL_PART, type AerialPart } from './config';
import {
  planDeck,
  type AerialProbe,
  type DeckPlan,
  type DeckRect,
  type DeckRefusal,
} from './deckPlan';
// L'atterraggio e' lo stesso oggetto a cui una mensola si appende: le due
// strutture devono chiamarlo con lo stesso nome, o finirebbero per accettare due
// insiemi di pareti diversi.
import type { FaceRun } from './terracePlan';

/**
 * I pezzi di cui un percorso in quota e' fatto, e la meccanica che li regge.
 *
 * **Sta separato da `routePlan.ts` perche' e' un lavoro diverso.** Di la' si
 * scelgono le *forme* — dritta, larga, a zeta — e si decide quale provare; qui
 * c'e' cosa un pezzo e', dove cade un pianerottolo, quanto in alto deve passare
 * la corsa e se il luogo regge il tutto. Sono i due mestieri che la regola dei
 * seicento righe di `AGENTS.md` chiede di non tenere nello stesso file: le forme
 * cambiano quando cambia il disegno della citta', questa macchina quando cambia
 * il modo di stare in piedi.
 *
 * Puro come tutto `aerial/`: il mondo entra come predicato, e i test girano in
 * ambiente `node`.
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

/** I due capi gia' ordinati lungo l'asse, con i rispettivi atterraggi. */
export interface Landing {
  readonly lo: RouteEnd;
  readonly hi: RouteEnd;
  readonly runLo: FaceRun;
  readonly runHi: FaceRun;
}

/** Un pezzo prima che il luogo lo confermi: il riquadro, la quota e cosa e'. */
export interface PieceDraft {
  readonly part: AerialPart;
  readonly rect: DeckRect;
  readonly deckZ: number;
  readonly drop: number;
}

/** Lato di un pianerottolo: mai piu' stretto del tratto che ci arriva, piu' un bordo. */
export function hubSide(width: number): number {
  return Math.max(AERIAL.route.nodeSide, width + 2);
}

/** Di quanto un pianerottolo sborda dal tratto, per lato. */
export function hubPad(width: number): number {
  return (hubSide(width) - width) >> 1;
}

/** Un riquadro dato in coordinate «lungo l'asse» e «di traverso». */
export function rectOf(
  axis: 0 | 1,
  from: number,
  to: number,
  cross: number,
  width: number,
): DeckRect {
  return axis === 0
    ? { x: from, y: cross, sizeX: to - from + 1, sizeY: width }
    : { x: cross, y: from, sizeX: width, sizeY: to - from + 1 };
}

/** Un tratto lungo l'asse del percorso, dalla colonna `from` alla `to` comprese. */
export function walkDraft(
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
export function hubDraft(
  axis: 0 | 1,
  along: number,
  cross: number,
  width: number,
  zA: number,
  zB: number,
): PieceDraft {
  const side = hubSide(width);
  const pad = hubPad(width);
  return {
    part: AERIAL_PART.node,
    rect: rectOf(axis, along, along + side - 1, cross - pad, side),
    deckZ: Math.max(zA, zB),
    drop: Math.abs(zA - zB),
  };
}

/**
 * La quota piu' bassa a cui una corsa passa sopra tutto quello che copre.
 *
 * E' la stessa domanda del franco di `planDeck`, posta prima invece che dopo:
 * li' serve a rifiutare, qui a scegliere.
 *
 * **Si misura sui riquadri veri dei pezzi, non su quello della corsa**, ed e' il
 * difetto per cui la piega era stata tolta. Un percorso a zeta ha un tratto di
 * traverso che esce dal corridoio, e i suoi pianerottoli cadono dove il corridoio
 * non guarda: misurato li', il colmo diceva «passa» di un percorso che entrava
 * dentro un edificio. Passando i riquadri, la stessa funzione serve tutte e tre
 * le forme e ciascuna misura cio' che davvero scavalca.
 */
export function crestOf(probe: AerialProbe, rects: readonly DeckRect[]): number {
  let top = 0;
  for (const rect of rects) {
    for (let dy = 0; dy < rect.sizeY; dy++) {
      for (let dx = 0; dx < rect.sizeX; dx++) {
        const column = probe.ground(rect.x + dx, rect.y + dy);
        if (column.top > top) top = column.top;
      }
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
 *
 * `reserved` sono i pianerottoli che la forma si e' gia' presa per girare: una
 * zeta ne spende due negli angoli, e quelli non possono essere spesi anche per
 * salire.
 */
export function climbProfile(
  zLo: number,
  zHi: number,
  runZ: number,
  reserved = 0,
): number[] | null {
  const step = AERIAL.route.stepPerNode;
  const up = Math.ceil((runZ - zLo) / step);
  const down = Math.ceil((runZ - zHi) / step);
  if (up + down + reserved > AERIAL.route.maxNodes) return null;

  const profile: number[] = [];
  for (let i = 0; i < up; i++) profile.push(zLo + Math.round(((runZ - zLo) * i) / up));
  profile.push(runZ);
  for (let i = 1; i <= down; i++) profile.push(runZ - Math.round(((runZ - zHi) * i) / down));
  return profile;
}

/** Le posizioni da provare: quella ideale, e poi via via piu' lontane. */
export function slideOrder(ideal: number, min: number, max: number): readonly number[] {
  const out: number[] = [];
  for (let step = 0; step <= AERIAL.route.hubSlide; step += 2) {
    for (const t of step === 0 ? [ideal] : [ideal - step, ideal + step]) {
      if (t >= min && t <= max) out.push(t);
    }
  }
  return out;
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
export function placeHubs(
  query: AerialProbe,
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
      const draft = hubDraft(axis, t, cross, width, profile[i - 1], profile[i]);
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

export type AssembleResult =
  | { readonly ok: true; readonly plans: readonly DeckPlan[] }
  | { readonly ok: false; readonly refusal: DeckRefusal };

/**
 * Chiede al luogo se i pezzi stanno in piedi, **prima i nodi**.
 *
 * L'ordine non e' un dettaglio: un nodo non e' appeso a niente e si pianta le
 * proprie gambe, e solo dopo i tratti possono contarlo come ancoraggio. Al
 * contrario, ogni tratto sarebbe uno sbalzo dal solo capo da cui parte.
 */
export function assemble(
  query: AerialProbe,
  landing: Landing,
  drafts: readonly PieceDraft[],
): AssembleResult {
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

  return { ok: true, plans: drafts.map((_, i) => plans.get(i) as DeckPlan) };
}
