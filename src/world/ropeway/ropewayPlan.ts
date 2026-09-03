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
  /**
   * Quota del terreno nudo, senza cio' che ci sta sopra.
   *
   * E' l'altra meta' di `top`, e serve a una domanda sola: **su cosa poggerebbe
   * la torre se l'edificio che c'e' adesso non ci fosse**. Con il solo `top` una
   * piazzola interamente coperta dal costruito prenderebbe come piano il tetto
   * piu' basso, e la stazione nascerebbe sui tetti di case che il cantiere sta
   * demolendo.
   */
  readonly ground: (x: number, y: number) => number;
  /** true se la colonna e' terra emersa. Sott'acqua e' false, sempre. */
  readonly land: (x: number, y: number) => boolean;
  /** true se il terreno di quella colonna regge una fondazione. */
  readonly firm: (x: number, y: number) => boolean;
  /** true se nessuno prende gia' il suolo di quella colonna. */
  readonly free: (x: number, y: number) => boolean;
  /**
   * true se cio' che prende il suolo di questa colonna **puo' cadere** per far
   * posto a una torre. Su una colonna gia' libera e' true.
   *
   * **La traversata ha la precedenza sul tessuto urbano.** Una linea si tira fra
   * due rive che si guardano, e su una citta' cresciuta quelle rive sono
   * costruite: pretendere due piazzole vergini significava rifiutare la funivia
   * proprio dove serviva, o spingerla mezzo isolato dentro. La citta' ricresce
   * attorno alle torri, e un lungomare che ricresce vale piu' di una linea che
   * non parte.
   *
   * Cio' che **non** cade e' il monumento, ed e' l'unica eccezione: un landmark
   * non si demolisce costruendoci sopra. Chi implementa il predicato ci mette
   * dentro anche cio' che il proprio dominio non deve toccare — un'altra
   * funivia, un cantiere gia' aperto — perche' qui la regola non ha un registry
   * per saperlo.
   */
  readonly clearable: (x: number, y: number) => boolean;
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
  /**
   * Una delle due stazioni non trova cinque colonne di terreno buono.
   *
   * «Buono» vuol dire asciutto, saldo e **libero o sgomberabile**: il costruito
   * ordinario non ferma piu' una linea, un monumento si'.
   */
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
  /**
   * Colonne occupate che le due piazzole si porteranno via. **Zero e' il caso
   * normale**, e chi scrive la linea puo' allora posarla senza aprire cantieri.
   *
   * Sono colonne e non edifici: la regola e' pura e non ha un registry per
   * contare i record: le serve solo a preferire, fra due linee valide, quella
   * che demolisce meno.
   */
  readonly taken: number;
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
 *
 * **Ma prima di corta, la linea si vuole a mani pulite.** Da quando una piazzola
 * puo' sgomberare il costruito, fra quattro direzioni ce n'e' spesso una che non
 * demolisce niente e una piu' corta che rade un isolato: preferire sempre la
 * seconda farebbe pagare al giocatore, con due case, un accorciamento che non ha
 * chiesto. La precedenza sul tessuto urbano e' il permesso di passare dove
 * altrimenti non si passa, non un invito a demolire.
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
    if (best === null || better(attempt.plan, best)) best = attempt.plan;
  }

  return best === null ? refuse(worst) : { ok: true, plan: best };
}

/** true se `candidate` batte `standing`: prima cosa demolisce, poi quanto e' lunga. */
function better(candidate: RopewayPlan, standing: RopewayPlan): boolean {
  if (candidate.taken !== standing.taken) return candidate.taken < standing.taken;
  return candidate.length < standing.length;
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
  const cableZ = liftCable(query, axis, alongAt, cross, padA, padB);
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
 *
 * **Due passate e non una, ed e' tutta la differenza.** La prima cerca una
 * piazzola vergine e arretra fino a `maxSetback` come ha sempre fatto: se il
 * lungomare finisce entro un isolato, la linea nasce senza che cada niente. Solo
 * quando *nessuna* posizione e' libera si riparte dalla riva accettando di
 * sgomberare, e allora la stazione torna a stare dove serve — sull'acqua — invece
 * di non esistere. Fare una passata sola con lo sgombero gia' concesso
 * demolirebbe il primo isolato ogni volta, avendo il secondo libero due colonne
 * piu' in la'.
 */
function seekPad(
  query: RopewayQuery,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  cross: number,
  from: number,
  inward: number,
): Footing | null {
  for (const demolish of [false, true]) {
    for (let back = 0; back <= ROPEWAY.maxSetback; back++) {
      const at = from + inward * back;
      const pad = surveyPad(query, axis, alongAt, cross, at, demolish);
      if (pad !== null) return { at, ...pad };
    }
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
  demolish: boolean,
): Pad | null {
  return footing(query, axis, alongAt, cross, centre, STATION_HALF, demolish);
}

/** Cosa una piazzola offre: il piano su cui poggia, e cosa deve togliersi di mezzo. */
interface Pad {
  readonly baseZ: number;
  /** Colonne occupate da sgomberare. Zero su una piazzola vergine. */
  readonly taken: number;
}

/** Un appoggio prima di diventare un volume: dove cade e su cosa poggia. */
interface Footing extends Pad {
  readonly at: number;
}

/**
 * Il terreno sotto un quadrato di lato `2 * half + 1`, o null se non lo regge.
 *
 * Una sola regola per la piazzola e per il pilone: sono lo stesso controllo su
 * due piante diverse — asciutto, saldo, e libero o sgomberabile — e tenerne due
 * copie vorrebbe dire che un giorno un pilone finisce in acqua e una stazione no.
 *
 * Si prende la quota **piu' bassa** delle colonne: cosi' su un terreno che sale
 * la torre resta sepolta da un lato invece di restare sospesa dall'altro. Una
 * colonna che verra' sgomberata entra nel minimo con il **terreno**, non con il
 * tetto che sta per sparire: e' l'unico posto in cui le due letture del luogo
 * divergono, e sbagliarlo pianterebbe la torre sulle case che sta demolendo.
 */
function footing(
  query: RopewayQuery,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  cross: number,
  centre: number,
  half: number,
  demolish: boolean,
): Pad | null {
  let baseZ = Number.POSITIVE_INFINITY;
  let taken = 0;
  for (let i = -half; i <= half; i++) {
    for (let w = -half; w <= half; w++) {
      const [cx, cy] = point(axis, alongAt(centre + i), cross + w);
      if (!query.land(cx, cy)) return null;
      if (!query.firm(cx, cy)) return null;
      if (query.free(cx, cy)) {
        baseZ = Math.min(baseZ, query.top(cx, cy));
        continue;
      }
      if (!demolish || !query.clearable(cx, cy)) return null;
      taken++;
      baseZ = Math.min(baseZ, query.ground(cx, cy));
    }
  }
  return Number.isFinite(baseZ) ? { baseZ, taken } : null;
}

/**
 * La quota della fune agli appoggi.
 *
 * Per ogni colonna della corsa si chiede quanto in alto dovrebbe passare la fune
 * perche' **li'** la cabina abbia il suo franco, e si tiene il massimo. La
 * freccia entra dentro il massimo e non dopo: sommarla alla fine alzerebbe anche
 * gli appoggi, dove la fune non pende affatto, e la linea partirebbe da due
 * torri piu' alte del necessario.
 *
 * **Sotto le due piazzole si guarda il terreno, non i tetti.** Cio' che sta
 * dentro un'impronta che il cantiere sgombera non c'e' piu' quando la cabina
 * parte, e tenerne conto alzerebbe la fune — quindi le torri — per scavalcare
 * una torre che si sta abbattendo: proprio dove la citta' e' alta, la linea si
 * rifiuterebbe da sola con un `tooTall`.
 */
function liftCable(
  query: RopewayQuery,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  cross: number,
  padA: Footing,
  padB: Footing,
): number {
  const from = padA.at;
  const to = padB.at;
  /** true dove la colonna sta dentro l'impronta di una delle due stazioni. */
  const inPad = (d: number): boolean =>
    Math.abs(d - from) <= STATION_HALF || Math.abs(d - to) <= STATION_HALF;
  /** La sommita' che la fune deve scavalcare **dopo** lo sgombero. */
  const level = (d: number, cx: number, cy: number): number =>
    inPad(d) && !query.free(cx, cy) ? query.ground(cx, cy) : query.top(cx, cy);

  // La torre minima: una funivia che parte da terra non e' una funivia.
  let needed = Math.max(
    level(from, ...point(axis, alongAt(from), cross)),
    level(to, ...point(axis, alongAt(to), cross)),
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
        obstacle = Math.max(obstacle, level(d, cx, cy) + ROPEWAY.cabinClearance);
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
    taken: padA.taken + padB.taken,
  };
}
