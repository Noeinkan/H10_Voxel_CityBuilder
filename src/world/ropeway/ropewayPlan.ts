import { TERRAIN } from '../terrain/config';
import { ROPEWAY } from './config';

/**
 * La regola che decide dove passa una funivia, e se puo' passarci.
 *
 * **Pura come `crossings/crossingPlan.ts`, da cui prende la forma.** Non conosce
 * il `VoxelWorld`, non conosce il registry e non conosce la `TerrainMap`: cio'
 * che deve sapere del luogo entra come **predicato**. Ne segue che «una linea
 * non passa mai dentro una collina» si verifica in un test in ambiente `node`.
 *
 * **Un click, non una coppia.** E' la stessa forma degli attraversamenti: il
 * giocatore indica un capo e la regola trova l'altro, provando le quattro
 * direzioni e tenendo la linea piu' corta fra quelle che passano la convalida.
 *
 * **Il franco si misura sulla prima quota libera, non sul terreno.** `top` dice
 * la sommita' di cio' che c'e' — un prato, un bosco, un tetto — ed e' l'unica
 * lettura del luogo che serve alla quota della fune. Non c'e' nessun sondaggio
 * voxel per voxel: il corridoio e' lungo fino a centonovantadue colonne, e
 * chiederne il contenuto cubo per cubo a ogni `pointermove` del cursore
 * costerebbe piu' di tutto il resto della regola messo insieme.
 *
 * **Il limite noto:** un edificio che cresce *dopo*, sotto la corsa, non alza la
 * fune. E' il prezzo di una linea che non e' materia e non ha una colonna a
 * registro fra i due capi — la stessa ragione per cui la cabina non e' un voxel.
 * A schermo si vede, ed e' un difetto onesto: la citta' cresce attorno a una
 * linea che il giocatore ha deciso, non attraverso di lei.
 */

/** I predicati con cui il luogo entra in una regola pura. */
export interface RopewayProbe {
  /**
   * Prima quota **libera** sopra cio' che occupa la colonna: terreno o tetto.
   *
   * E' `AerialColumn.top` detto per questo dominio, ed e' voluto: la fune
   * scavalca la citta' come scavalca una collina, e chiedere due letture diverse
   * significherebbe farla passare dentro un edificio che il terreno non vede.
   */
  readonly top: (x: number, y: number) => number;
  /** true se la colonna e' terra emersa. Sott'acqua e' false, sempre. */
  readonly land: (x: number, y: number) => boolean;
  /** true se il terreno di quella colonna regge una fondazione. */
  readonly firm: (x: number, y: number) => boolean;
  /** true se nessuno prende gia' il suolo di quella colonna. */
  readonly free: (x: number, y: number) => boolean;
}

export interface RopewayQuery extends RopewayProbe {
  /** La colonna che il giocatore ha cliccato. */
  readonly x: number;
  readonly y: number;
}

/**
 * Perche' una funivia non si puo' tirare da qui.
 *
 * Come per gli attraversamenti sono motivi e non errori: tre direzioni su
 * quattro ne meritano uno, ed e' normale. Servono al cursore, che senza di loro
 * potrebbe solo dire «no».
 */
export const ROPEWAY_REFUSALS = [
  /** Nessuna delle quattro direzioni porta da qualche parte. */
  'noPartner',
  /** Il click non e' su terra emersa, e una stazione poggia a terra. */
  'notAshore',
  /** Entro la ricerca non c'e' abbastanza acqua: non c'e' niente da scavalcare. */
  'dryGap',
  /** La luce e' roba da ponte: `crossings/` la fa gia', e ci si cammina sopra. */
  'tooShort',
  /** L'altra riva e' oltre il tetto, o non c'e' affatto. */
  'tooLong',
  /** Una delle due stazioni non trova cinque colonne di terreno buono e libero. */
  'noPad',
  /** Per scavalcare cio' che sta in mezzo servirebbe una torre fuori scala. */
  'tooTall',
] as const;

export type RopewayRefusal = (typeof ROPEWAY_REFUSALS)[number];

/**
 * Quanto lontano e' arrivato un tentativo prima di arrendersi.
 *
 * Stessa scelta di `CROSSING_REFUSALS`: l'ordine e' quello in cui la regola
 * incontra i controlli, e si tiene il motivo arrivato piu' avanti. Un `tooTall`
 * dice che la linea era giusta e la montagna no, e vale molto di piu' di un
 * `notAshore`, che dice solo che da quella parte c'e' il mare.
 */
const REFUSAL_DEPTH: Record<RopewayRefusal, number> = {
  noPartner: 0,
  notAshore: 1,
  dryGap: 2,
  tooLong: 3,
  tooShort: 4,
  noPad: 5,
  tooTall: 6,
};

/** Una stazione: il prisma che prende suolo, piu' il punto da cui parte la fune. */
export interface RopewayStation {
  /** Angolo minimo dell'impronta. Il lato e' `ROPEWAY.stationSide`. */
  readonly x: number;
  readonly y: number;
  /** Prima quota occupata: il terreno piu' basso sotto la piazzola. */
  readonly baseZ: number;
  /** Voxel occupati in altezza: la torre arriva fino alla fune compresa. */
  readonly height: number;
  /** Colonna centrale, dove la fune e' ancorata. */
  readonly anchorX: number;
  readonly anchorY: number;
}

/** Un vertice della spezzata che la fune descrive. `z` non e' intero: pende. */
export interface CablePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RopewayPlan {
  /** 0 se la corsa e' lungo x, 1 lungo y. */
  readonly axis: 0 | 1;
  /** Quota della fune agli appoggi. Fra due appoggi sta piu' in basso. */
  readonly cableZ: number;
  /** I due capi, in ordine di coordinata crescente lungo l'asse. */
  readonly stations: readonly [RopewayStation, RopewayStation];
  /** La fune campionata: la percorre la cabina, la disegna la vista. */
  readonly cable: readonly CablePoint[];
  /** Distanza fra i due ancoraggi, in voxel. */
  readonly length: number;
}

export type RopewayResult =
  | { readonly ok: true; readonly plan: RopewayPlan }
  | { readonly ok: false; readonly refusal: RopewayRefusal };

function refuse(refusal: RopewayRefusal): RopewayResult {
  return { ok: false, refusal };
}

/** Coordinate di mondo di una posizione «lungo la corsa, attraverso la corsa». */
function point(axis: 0 | 1, along: number, cross: number): readonly [number, number] {
  return axis === 0 ? [along, cross] : [cross, along];
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Semilato di una stazione: il lato e' dispari apposta perche' questo sia intero. */
const STATION_HALF = (ROPEWAY.stationSide - 1) / 2;

/**
 * La funivia piu' corta fra quelle che le quattro direzioni concedono, o il
 * motivo per cui nessuna passa.
 *
 * La linea piu' corta e non la piu' spettacolare: fra due tentativi validi
 * quello corto e' anche quello che il giocatore stava guardando, ed e' la stessa
 * scelta di `chooseCrossing`.
 */
export function chooseRopeway(query: RopewayQuery): RopewayResult {
  if (!query.land(query.x, query.y)) return refuse('notAshore');

  let best: RopewayPlan | null = null;
  let worst: RopewayRefusal = 'noPartner';

  for (const [dx, dy] of DIRECTIONS) {
    const attempt = planLine(query, dx, dy);
    if (!attempt.ok) {
      worst = deepest(worst, attempt.refusal);
      continue;
    }
    if (best === null || attempt.plan.length < best.length) best = attempt.plan;
  }

  return best === null ? refuse(worst) : { ok: true, plan: best };
}

/**
 * La linea che parte dal click e va in una direzione, o perche' non ci va.
 *
 * Tutto il file lavora in «lungo» e «attraverso» invece che in `x` e `y`, come
 * `crossingPlan.ts`: `alongAt` porta il passo in coordinate di mondo e `point`
 * traduce la coppia. Scrivere `axis === 0 ? [i, w] : [w, i]` a ogni riga e' il
 * modo classico di sbagliarne una.
 */
function planLine(query: RopewayQuery, dx: number, dy: number): RopewayResult {
  const axis: 0 | 1 = dx !== 0 ? 0 : 1;
  const step = dx + dy;
  const origin = axis === 0 ? query.x : query.y;
  const cross = axis === 0 ? query.y : query.x;
  const alongAt = (d: number): number => origin + d * step;

  // 1. La riva di qua: l'ultima colonna di terra prima dell'acqua.
  let d = 0;
  while (d <= ROPEWAY.shoreSearch && query.land(...point(axis, alongAt(d), cross))) d++;
  if (d > ROPEWAY.shoreSearch) return refuse('dryGap');
  const nearShore = d - 1;

  // 2. La riva di la': la prima colonna di terra oltre l'acqua.
  const limit = d + ROPEWAY.maxLength;
  while (d <= limit && !query.land(...point(axis, alongAt(d), cross))) d++;
  if (d > limit) return refuse('tooLong');
  const farShore = d;

  // 3. Il mare in mezzo dev'essere mare, non una pozza: e' cio' che distingue
  //    questo strumento da un percorso in quota fra due punti dello stesso prato.
  if (farShore - nearShore - 1 < ROPEWAY.minWaterGap) return refuse('dryGap');

  // 4. Le due piazzole, ciascuna la piu' vicina all'acqua che regga una
  //    stazione: su un lungomare costruito la prima buona sta un isolato dentro.
  const padA = seekPad(query, axis, alongAt, cross, nearShore - STATION_HALF, -1);
  if (padA === null) return refuse('noPad');
  const padB = seekPad(query, axis, alongAt, cross, farShore + STATION_HALF, 1);
  if (padB === null) return refuse('noPad');

  const anchorA = padA.at;
  const anchorB = padB.at;
  const length = anchorB - anchorA;
  if (length < ROPEWAY.minLength) return refuse('tooShort');
  if (length > ROPEWAY.maxLength) return refuse('tooLong');

  // 5. La quota della fune: la piu' bassa che tenga il franco **ovunque**, con
  //    la pancia gia' scontata. Calcolarla prima della freccia darebbe una linea
  //    che passa alta alle torri e striscia in mezzo alla campata.
  const cableZ = liftCable(query, axis, alongAt, cross, anchorA, anchorB);
  if (cableZ - padA.baseZ > ROPEWAY.maxStationRise) return refuse('tooTall');
  if (cableZ - padB.baseZ > ROPEWAY.maxStationRise) return refuse('tooTall');

  return { ok: true, plan: assemble(axis, alongAt, cross, cableZ, padA, padB) };
}

/**
 * La piazzola buona piu' vicina all'acqua, camminando all'indietro dalla riva.
 *
 * **Il lungomare costruito e' il caso normale.** Pretendere la stazione sulla
 * battigia rifiuterebbe la funivia proprio dove la citta' c'e', e chiedere al
 * giocatore di cliccare esattamente sulla prima colonna libera sarebbe
 * pretendere la precisione che uno strumento a un click esiste per togliere.
 */
function seekPad(
  query: RopewayQuery,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  cross: number,
  from: number,
  inward: number,
): Footing | null {
  for (let back = 0; back <= ROPEWAY.maxSetback; back++) {
    const at = from + inward * back;
    const baseZ = surveyPad(query, axis, alongAt, cross, at);
    if (baseZ !== null) return { at, baseZ };
  }
  return null;
}

/** Il terreno sotto una piazzola: la quota piu' bassa, o null se non la regge. */
function surveyPad(
  query: RopewayQuery,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  cross: number,
  centre: number,
): number | null {
  return footing(query, axis, alongAt, cross, centre, STATION_HALF);
}

/** Un appoggio prima di diventare un volume: dove cade e su cosa poggia. */
interface Footing {
  readonly at: number;
  readonly baseZ: number;
}

/**
 * Il terreno sotto un quadrato di lato `2 * half + 1`, o null se non lo regge.
 *
 * Una sola regola per la piazzola e per il pilone: sono lo stesso controllo su
 * due piante diverse — asciutto, saldo, libero — e tenerne due copie vorrebbe
 * dire che un giorno un pilone finisce in acqua e una stazione no.
 *
 * Si prende la quota **piu' bassa** delle colonne: cosi' su un terreno che sale
 * la torre resta sepolta da un lato invece di restare sospesa dall'altro.
 */
function footing(
  query: RopewayQuery,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  cross: number,
  centre: number,
  half: number,
): number | null {
  let baseZ = Number.POSITIVE_INFINITY;
  for (let i = -half; i <= half; i++) {
    for (let w = -half; w <= half; w++) {
      const [cx, cy] = point(axis, alongAt(centre + i), cross + w);
      if (!query.land(cx, cy)) return null;
      if (!query.firm(cx, cy)) return null;
      if (!query.free(cx, cy)) return null;
      baseZ = Math.min(baseZ, query.top(cx, cy));
    }
  }
  return Number.isFinite(baseZ) ? baseZ : null;
}

/**
 * La quota della fune agli appoggi.
 *
 * Per ogni colonna della corsa si chiede quanto in alto dovrebbe passare la fune
 * perche' **li'** la cabina abbia il suo franco, e si tiene il massimo. La
 * freccia entra dentro il massimo e non dopo: sommarla alla fine alzerebbe anche
 * gli appoggi, dove la fune non pende affatto, e la linea partirebbe da due
 * torri piu' alte del necessario.
 */
function liftCable(
  query: RopewayQuery,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  cross: number,
  from: number,
  to: number,
): number {
  // La torre minima: una funivia che parte da terra non e' una funivia.
  let needed = Math.max(
    query.top(...point(axis, alongAt(from), cross)),
    query.top(...point(axis, alongAt(to), cross)),
  ) + ROPEWAY.minStationRise;

  for (let d = from; d <= to; d++) {
    // Il corridoio e' largo quanto la cabina: una linea che rade un tetto di
    // fianco lo urta comunque, e in isometrica si vede prima che di fronte.
    let obstacle = Number.NEGATIVE_INFINITY;
    let overWater = true;
    for (let w = -1; w <= 1; w++) {
      const [cx, cy] = point(axis, alongAt(d), cross + w);
      if (query.land(cx, cy)) {
        overWater = false;
        obstacle = Math.max(obstacle, query.top(cx, cy) + ROPEWAY.cabinClearance);
      }
    }
    const floor = overWater
      ? TERRAIN.seaLevel + ROPEWAY.waterClearance
      : obstacle;
    needed = Math.max(needed, floor + ROPEWAY.cabinDrop + sagAt(from, to, d));
  }

  return Math.ceil(needed);
}

/**
 * Di quanto la fune pende sotto la quota delle torri, alla posizione `d`.
 *
 * Una parabola invece della catenaria vera: fra due appoggi la differenza e'
 * sotto il voxel, e questa si legge in una riga senza un coseno iperbolico e
 * senza risolvere un parametro per ogni campata.
 */
function sagAt(from: number, to: number, d: number): number {
  const span = to - from;
  if (span <= 0) return 0;
  const dip = Math.min(ROPEWAY.maxSag, span * ROPEWAY.sagRatio);
  const t = (d - from) / span;
  return 4 * dip * t * (1 - t);
}

function deepest(a: RopewayRefusal, b: RopewayRefusal): RopewayRefusal {
  return REFUSAL_DEPTH[b] > REFUSAL_DEPTH[a] ? b : a;
}

function assemble(
  axis: 0 | 1,
  alongAt: (d: number) => number,
  cross: number,
  cableZ: number,
  padA: Footing,
  padB: Footing,
): RopewayPlan {
  const station = (pad: Footing): RopewayStation => {
    const ends = [alongAt(pad.at - STATION_HALF), alongAt(pad.at + STATION_HALF)];
    const [x, y] = point(axis, Math.min(...ends), cross - STATION_HALF);
    const [anchorX, anchorY] = point(axis, alongAt(pad.at), cross);
    return { x, y, baseZ: pad.baseZ, height: cableZ + 1 - pad.baseZ, anchorX, anchorY };
  };

  // La spezzata comprende sempre i due capi: e' li' che la fune torna alla sua
  // quota, e un passo che non li centrasse la lascerebbe appesa a mezz'aria un
  // voxel accanto all'architrave.
  const stops = new Set<number>([padA.at, padB.at]);
  for (let d = padA.at; d <= padB.at; d += ROPEWAY.cableStep) stops.add(d);

  const cable: CablePoint[] = [];
  for (const d of [...stops].sort((p, q) => p - q)) {
    const [x, y] = point(axis, alongAt(d), cross);
    cable.push({ x, y, z: cableZ - sagAt(padA.at, padB.at, d) });
  }
  // Verso di percorrenza: la spezzata va sempre dal capo A al capo B, e su una
  // direzione negativa `alongAt` la produrrebbe al contrario.
  if (alongAt(padA.at) > alongAt(padB.at)) cable.reverse();

  const first = station(padA);
  const second = station(padB);
  const forward = alongAt(padA.at) <= alongAt(padB.at);

  return {
    axis,
    cableZ,
    stations: forward ? [first, second] : [second, first],
    cable,
    length: padB.at - padA.at,
  };
}
