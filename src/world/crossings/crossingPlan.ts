import { TERRAIN } from '../terrain/config';
import { CROSSINGS, CROSSING_KIND, type CrossingKind } from './config';

/**
 * La regola che decide dove passa un attraversamento, e se puo' passarci.
 *
 * **Pura come `spans/spanPlan.ts`, `grading/grade.ts` e `sites/siteRules.ts`.**
 * Non conosce il `VoxelWorld`, non conosce il registry e non conosce la
 * `TerrainMap`: cio' che deve sapere del luogo entra come **predicato**. Ne segue
 * che «un ponte poggia sempre su appoggi reali» si verifica in un test in
 * ambiente `node`, senza mondo e senza GPU, e non a occhio su una citta'
 * cresciuta.
 *
 * **Un click, non una coppia.** E' la differenza di forma rispetto a `planSpan`,
 * che riceve gia' due appoggi perche' a proporglieli e' una passata che esamina
 * tutte le coppie. Qui il giocatore indica **un capo solo** e la regola deve
 * trovare l'altro: si provano le quattro direzioni, o tutte le torri, e si tiene
 * il compagno migliore — il piu' vicino fra quelli che passano la convalida,
 * perche' il ponte piu' corto e' anche quello che si stava guardando.
 *
 * **Ogni misura e' «lungo» e «attraverso».** La corsa ha un asse, e tutto il
 * file lavora in quella coppia di coordinate invece che in `x` e `y`: `point`
 * traduce, e nient'altro lo fa. Scrivere `axis === 0 ? [i, w] : [w, i]` a ogni
 * riga e' il modo classico di sbagliarne una.
 */

/** Cio' che serve di un edificio per farne una testata. E' un `BuildingRecord` all'osso. */
export interface CrossingTower {
  readonly id: number;
  /** Angolo minimo dell'impronta. */
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /** Prima quota occupata. */
  readonly baseZ: number;
  /** Voxel occupati in altezza a partire da `baseZ`. */
  readonly height: number;
}

/** I predicati con cui il luogo entra in una regola pura. */
export interface CrossingProbe {
  /** Quota del terreno: il primo voxel **libero** sopra il suolo. */
  readonly ground: (x: number, y: number) => number;
  /** true se la colonna e' terra emersa. Sott'acqua e' false, sempre. */
  readonly land: (x: number, y: number) => boolean;
  /** true se un edificio occupa il suolo di quella colonna. */
  readonly occupied: (x: number, y: number) => boolean;
  /** true se nel mondo quel voxel e' pieno. E' cio' che verifica l'appoggio vero. */
  readonly solid: (x: number, y: number, z: number) => boolean;
}

export interface CrossingQuery extends CrossingProbe {
  /** La colonna che il giocatore ha cliccato. */
  readonly x: number;
  readonly y: number;
  /**
   * L'edificio sotto il click, se c'e'.
   *
   * E' l'unica cosa che decide quale delle due regole vale, e non un'opzione: un
   * click su una torre chiede un ponte in quota, un click sulla riva chiede un
   * ponte a terra. Il giocatore non sceglie il tipo da un menu — lo sceglie
   * indicando il capo, che e' cio' che «un click» vuol dire.
   */
  readonly from?: CrossingTower;
  /** Gli altri edifici, come possibili secondi appoggi. Un ponte a terra li ignora. */
  readonly towers?: readonly CrossingTower[];
}

/**
 * Perche' un attraversamento non si puo' fare.
 *
 * Sono motivi e non errori: quasi tutte le direzioni e quasi tutte le torri ne
 * meritano uno, ed e' normale. Servono al cursore, che senza di loro potrebbe
 * solo dire «no», e ai test, che senza di loro non potrebbero dire «no per la
 * ragione giusta».
 */
export const CROSSING_REFUSALS = [
  /** Nessun compagno su nessuna delle quattro direzioni, o nessuna torre. */
  'noPartner',
  /** Il click non e' su terra emersa, e un ponte a terra parte da riva. */
  'notAshore',
  /** Entro la distanza di ricerca non c'e' acqua: niente da attraversare. */
  'dryGap',
  /** Le due impronte non si guardano su nessun asse, o si sovrappongono. */
  'notFacing',
  /** Il fronte comune e' piu' stretto dell'impalcato. */
  'tooNarrow',
  /** La luce e' roba da campata: `spans/` la fa gia', e senza pile. */
  'tooShort',
  /** La luce supera il tetto. */
  'tooLong',
  /** Una riva non offre abbastanza terra asciutta per la spalla. */
  'noAbutment',
  /** Un edificio occupa la corsa, o il volume dell'impalcato non e' aria. */
  'blocked',
  /** Una pila non trova fondale: troppo profondo. */
  'noFooting',
  /** I due edifici non portano la carreggiata abbastanza in alto. */
  'lowTowers',
] as const;

export type CrossingRefusal = (typeof CROSSING_REFUSALS)[number];

/**
 * Quanto lontano e' arrivato un tentativo prima di arrendersi.
 *
 * L'ordine e' quello in cui la regola incontra i controlli, non una gravita': un
 * `noFooting` dice che il ponte era giusto e il fondale no, e vale molto di piu'
 * di un `notFacing`, che dice solo che quelle due torri non si guardano.
 * Restituire l'ultimo motivo racconterebbe com'e' finito il tentativo piu'
 * disperato; si tiene quello arrivato piu' avanti.
 */
const REFUSAL_DEPTH: Record<CrossingRefusal, number> = {
  noPartner: 0,
  notAshore: 1,
  notFacing: 2,
  dryGap: 3,
  tooNarrow: 4,
  tooShort: 5,
  tooLong: 6,
  noAbutment: 7,
  lowTowers: 8,
  blocked: 9,
  noFooting: 10,
};

/** Una pila, o una spalla: entrambe sono un prisma che sale dal suolo all'impalcato. */
export interface CrossingPier {
  /** Angolo minimo in pianta. */
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /** Prima quota occupata: il suolo, o il fondale. */
  readonly baseZ: number;
  readonly height: number;
}

/**
 * Un tratto in cui la comparsa si spezza.
 *
 * **Non e' un record.** Un attraversamento resta una struttura sola; i segmenti
 * sono il modo in cui *compare*, uno per volta, cosi' che il picco di chunk
 * sporchi resti quello di una struttura e non quello di novantasei voxel di
 * corsa accodati insieme. E' la stessa scelta di `SpanSegment`.
 */
export interface CrossingSegment {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

export interface CrossingPlan {
  readonly kind: CrossingKind;
  /** 0 se la corsa e' lungo x, 1 lungo y. */
  readonly axis: 0 | 1;
  /** Quota della carreggiata: la riga di voxel calpestabile. */
  readonly deckZ: number;
  /** Angolo minimo dell'ingombro dell'impalcato, con `sizeX`/`sizeY`. */
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /** Colonne, dai due capi, in cui le travi riempiono tutta la larghezza. */
  readonly corbel: number;
  /** Gli id degli appoggi, in ordine crescente. Vuoto per un ponte a terra. */
  readonly supports: readonly number[];
  /** Pile e spalle. Vuoto per un ponte in quota, che non prende suolo. */
  readonly piers: readonly CrossingPier[];
  readonly segments: readonly CrossingSegment[];
}

export type CrossingResult =
  | { readonly ok: true; readonly plan: CrossingPlan }
  | { readonly ok: false; readonly refusal: CrossingRefusal };

function refuse(refusal: CrossingRefusal): CrossingResult {
  return { ok: false, refusal };
}

/** Prima quota occupata dall'impalcato: le travi stanno sotto la carreggiata. */
export function crossingBaseZ(deckZ: number): number {
  return deckZ - CROSSINGS.girderDepth;
}

/** Voxel occupati in altezza dall'impalcato: le travi piu' la carreggiata. */
export const CROSSING_HEIGHT = CROSSINGS.girderDepth + 1;

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

/**
 * Il miglior attraversamento che parte dalla colonna cliccata, o il motivo.
 *
 * Il click sceglie la regola: sopra un edificio si cerca un ponte in quota, su
 * terra ferma un ponte a terra. Non c'e' un terzo caso — un click sull'acqua non
 * ha un capo da cui partire, e si prende `notAshore`.
 */
export function chooseCrossing(query: CrossingQuery): CrossingResult {
  return query.from === undefined ? chooseGround(query) : chooseSky(query, query.from);
}

// --- Ponte a terra ---------------------------------------------------------

/**
 * Il ponte a terra piu' corto fra quelli che le quattro direzioni concedono.
 *
 * Cerca la riva partendo dal click, non dal click stesso: chi gioca indica «di
 * qua», e pretendere il voxel esatto di battigia da un attrezzo a un click
 * sarebbe pretendere la precisione che l'attrezzo esiste per togliere.
 */
function chooseGround(query: CrossingQuery): CrossingResult {
  if (!query.land(query.x, query.y)) return refuse('notAshore');

  let best: CrossingPlan | null = null;
  let worst: CrossingRefusal = 'noPartner';

  for (const [dx, dy] of DIRECTIONS) {
    const attempt = planGround(query, dx, dy);
    if (!attempt.ok) {
      worst = deepest(worst, attempt.refusal);
      continue;
    }
    if (best === null || runOf(attempt.plan) < runOf(best)) best = attempt.plan;
  }

  return best === null ? refuse(worst) : { ok: true, plan: best };
}

function planGround(query: CrossingQuery, dx: number, dy: number): CrossingResult {
  const axis: 0 | 1 = dx !== 0 ? 0 : 1;
  // La corsa si misura in passi dal click, con il segno della direzione dentro
  // `alongAt`: cosi' le quattro direzioni sono un caso solo, e l'ingombro finale
  // si normalizza una volta sola in `assemble`.
  const step = dx + dy;
  const origin = axis === 0 ? query.x : query.y;
  const cross = axis === 0 ? query.y : query.x;
  const alongAt = (d: number): number => origin + d * step;

  // 1. La riva: l'ultima colonna di terra prima dell'acqua.
  let d = 0;
  while (d <= CROSSINGS.shoreSearch && query.land(...point(axis, alongAt(d), cross))) d++;
  if (d > CROSSINGS.shoreSearch) return refuse('dryGap');
  const nearShore = d - 1;

  // 2. L'altra riva: la prima colonna di terra oltre l'acqua.
  const limit = d + CROSSINGS.maxLength;
  while (d <= limit && !query.land(...point(axis, alongAt(d), cross))) d++;
  if (d > limit) return refuse('tooLong');
  const farShore = d;

  // 3. Le due spalle poggiano sulla terra, non sulla battigia.
  if (!dryRun(query, axis, alongAt, cross, nearShore, -1)) return refuse('noAbutment');
  if (!dryRun(query, axis, alongAt, cross, farShore, 1)) return refuse('noAbutment');

  const from = nearShore - CROSSINGS.abutment + 1;
  const to = farShore + CROSSINGS.abutment - 1;
  const length = to - from + 1;
  if (length < CROSSINGS.minLength) return refuse('tooShort');
  if (length > CROSSINGS.maxLength) return refuse('tooLong');

  // 4. La corsa dev'essere libera, e la quota piu' alta sotto di lei decide il
  //    franco. Si guarda tutta la larghezza dell'impalcato e non la sola
  //    mezzeria: un ponte che passa dentro un edificio per meta' e' un ponte
  //    dentro un edificio.
  const crossMin = cross - (CROSSINGS.width >> 1);
  let highest = 0;
  for (let i = from; i <= to; i++) {
    for (let w = 0; w < CROSSINGS.width; w++) {
      const [cx, cy] = point(axis, alongAt(i), crossMin + w);
      if (query.occupied(cx, cy)) return refuse('blocked');
      const height = query.ground(cx, cy);
      if (height > highest) highest = height;
    }
  }

  // 5. La quota della carreggiata: vince il piu' alto fra la spalla sopra la
  //    riva, il franco di navigazione e il franco sul terreno scavalcato.
  const deckZ = Math.max(
    highest + CROSSINGS.shoreRise,
    TERRAIN.seaLevel + CROSSINGS.waterClearance + CROSSINGS.girderDepth,
    highest + CROSSINGS.landClearance + CROSSINGS.girderDepth,
  );

  const piers = groundPiers(query, axis, alongAt, crossMin, from, to, deckZ);
  if (piers === null) return refuse('noFooting');

  return {
    ok: true,
    plan: assemble(CROSSING_KIND.ground, axis, alongAt, crossMin, from, to, deckZ, [], piers),
  };
}

/** true se da `start`, camminando di `direction`, ci sono `abutment` colonne di terra libera. */
function dryRun(
  query: CrossingQuery,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  cross: number,
  start: number,
  direction: number,
): boolean {
  for (let i = 0; i < CROSSINGS.abutment; i++) {
    const [cx, cy] = point(axis, alongAt(start + i * direction), cross);
    if (!query.land(cx, cy)) return false;
    if (query.occupied(cx, cy)) return false;
  }
  return true;
}

/**
 * Le pile della corsa piu' le due spalle, o null se il fondale non regge.
 *
 * **Le spalle sono pile anche loro.** Un capo che poggia sulla riva ha comunque
 * un dislivello da colmare fra il terreno e la trave, e chiamarlo in un altro
 * modo vorrebbe dire scriverne il disegno una seconda volta. La differenza sta
 * nella pianta: la spalla e' larga quanto l'impalcato e lunga la mensola, la
 * pila e' un quadrato — ed e' quello a farle leggere come due cose diverse.
 */
function groundPiers(
  query: CrossingQuery,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  crossMin: number,
  from: number,
  to: number,
  deckZ: number,
): readonly CrossingPier[] | null {
  const underside = crossingBaseZ(deckZ);
  const piers: CrossingPier[] = [];

  const abutment = (start: number): CrossingPier => {
    const a = alongAt(start);
    const b = alongAt(start + CROSSINGS.corbel - 1);
    const [ax, ay] = point(axis, Math.min(a, b), crossMin);
    const baseZ = Math.min(query.ground(ax, ay), ...columnHeights(query, axis, a, b, crossMin));
    return {
      x: ax,
      y: ay,
      sizeX: axis === 0 ? CROSSINGS.corbel : CROSSINGS.width,
      sizeY: axis === 0 ? CROSSINGS.width : CROSSINGS.corbel,
      baseZ,
      height: Math.max(0, underside - baseZ),
    };
  };

  piers.push(abutment(from), abutment(to - CROSSINGS.corbel + 1));

  // Le pile partono dal primo passo *dentro* la corsa e non dalla testata, che
  // la spalla occupa gia': una pila sotto una spalla e' una pila dentro il
  // terrapieno di se stessa.
  const inset = (CROSSINGS.width - CROSSINGS.pierSide) >> 1;
  for (let i = from + CROSSINGS.pierSpacing; i < to - CROSSINGS.corbel; i += CROSSINGS.pierSpacing) {
    const a = alongAt(i);
    const b = alongAt(i + CROSSINGS.pierSide - 1);
    const [px, py] = point(axis, Math.min(a, b), crossMin + inset);
    const baseZ = query.ground(px, py);
    if (TERRAIN.seaLevel - baseZ > CROSSINGS.maxPierDepth) return null;
    const height = underside - baseZ;
    if (height <= 0) continue;
    piers.push({ x: px, y: py, sizeX: CROSSINGS.pierSide, sizeY: CROSSINGS.pierSide, baseZ, height });
  }

  return piers;
}

/** Quote del terreno sotto una testata, per farne poggiare la spalla sulla piu' bassa. */
function columnHeights(
  query: CrossingQuery,
  axis: 0 | 1,
  a: number,
  b: number,
  crossMin: number,
): number[] {
  const out: number[] = [];
  for (let along = Math.min(a, b); along <= Math.max(a, b); along++) {
    for (let w = 0; w < CROSSINGS.width; w++) {
      const [cx, cy] = point(axis, along, crossMin + w);
      out.push(query.ground(cx, cy));
    }
  }
  return out;
}

// --- Ponte in quota --------------------------------------------------------

/**
 * Il miglior ponte fra la torre cliccata e un'altra, o il motivo.
 *
 * A parita' di lunghezza vince la torre il cui tetto e' piu' vicino a quello di
 * partenza: l'impalcato prende comunque la quota del piu' basso dei due, e un
 * compagno molto piu' alto lo farebbe entrare nel suo fianco parecchio sotto la
 * cima — attacco legittimo, ma non quello che si stava indicando.
 */
function chooseSky(query: CrossingQuery, from: CrossingTower): CrossingResult {
  let best: CrossingPlan | null = null;
  let bestScore = 0;
  let worst: CrossingRefusal = 'noPartner';

  const fromTop = from.baseZ + from.height - 1;
  for (const tower of query.towers ?? []) {
    if (tower.id === from.id) continue;
    const attempt = planSky(query, from, tower);
    if (!attempt.ok) {
      worst = deepest(worst, attempt.refusal);
      continue;
    }
    const top = tower.baseZ + tower.height - 1;
    const score = runOf(attempt.plan) * 4 + Math.abs(top - fromTop);
    if (best === null || score < bestScore) {
      best = attempt.plan;
      bestScore = score;
    }
  }

  return best === null ? refuse(worst) : { ok: true, plan: best };
}

function planSky(query: CrossingQuery, a: CrossingTower, b: CrossingTower): CrossingResult {
  const ax1 = a.x + a.sizeX - 1;
  const ay1 = a.y + a.sizeY - 1;
  const bx1 = b.x + b.sizeX - 1;
  const by1 = b.y + b.sizeY - 1;

  // Esattamente uno dei due vuoti dev'essere non negativo: se lo sono entrambi
  // le impronte stanno in diagonale, se nessuno lo e' si sovrappongono. E' la
  // stessa misura di `planSpan`, e deve restare la stessa: due regole diverse
  // per «si guardano» darebbero due risposte diverse sulla stessa coppia.
  const gapX = a.x > bx1 ? a.x - bx1 - 1 : b.x > ax1 ? b.x - ax1 - 1 : -1;
  const gapY = a.y > by1 ? a.y - by1 - 1 : b.y > ay1 ? b.y - ay1 - 1 : -1;
  if ((gapX >= 0) === (gapY >= 0)) return refuse('notFacing');

  const axis: 0 | 1 = gapX >= 0 ? 0 : 1;

  const lo = axis === 0 ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
  const hi = axis === 0 ? Math.min(ay1, by1) : Math.min(ax1, bx1);
  if (hi - lo + 1 < CROSSINGS.width) return refuse('tooNarrow');
  const crossMin = lo + ((hi - lo + 1 - CROSSINGS.width) >> 1);

  const first = (axis === 0 ? a.x > bx1 : a.y > by1) ? b : a;
  const second = first === a ? b : a;
  const firstEnd = axis === 0 ? first.x + first.sizeX - 1 : first.y + first.sizeY - 1;
  const secondStart = axis === 0 ? second.x : second.y;

  const from = firstEnd - CROSSINGS.corbel + 1;
  const to = secondStart + CROSSINGS.corbel - 1;
  const length = to - from + 1;
  if (length < CROSSINGS.minLength) return refuse('tooShort');
  if (length > CROSSINGS.maxLength) return refuse('tooLong');

  const deckZ = Math.min(a.baseZ + a.height - 1, b.baseZ + b.height - 1) - CROSSINGS.skyDeckDrop;
  const underside = crossingBaseZ(deckZ);

  // Il terreno sotto il **vuoto vero**, cioe' fra i due corpi: e' quello il
  // salto che si vede da sotto, e quindi quello che decide se questo e' un ponte
  // nel cielo o una passerella che `spans/` farebbe meglio e senza pretese.
  let highest = 0;
  for (let along = firstEnd + 1; along < secondStart; along++) {
    for (let w = 0; w < CROSSINGS.width; w++) {
      const [cx, cy] = point(axis, along, crossMin + w);
      const height = query.ground(cx, cy);
      if (height > highest) highest = height;
      for (let z = underside; z <= deckZ; z++) {
        if (query.solid(cx, cy, z)) return refuse('blocked');
      }
    }
  }
  if (deckZ - highest < CROSSINGS.minSkyRise) return refuse('lowTowers');

  // L'appoggio dev'essere vero: alla quota delle travi, sotto la mensola, il
  // corpo dei due edifici dev'esserci davvero. E' il controllo che tiene onesto
  // tutto il resto — un ponte orfano e' un bug, non uno stile.
  for (const end of [firstEnd, secondStart]) {
    let anchored = false;
    for (let w = 0; w < CROSSINGS.width; w++) {
      const [cx, cy] = point(axis, end, crossMin + w);
      if (query.solid(cx, cy, underside)) anchored = true;
    }
    if (!anchored) return refuse('blocked');
  }

  const supports = [a.id, b.id].sort((p, q) => p - q);
  return {
    ok: true,
    plan: assemble(CROSSING_KIND.sky, axis, (d) => d, crossMin, from, to, deckZ, supports, []),
  };
}

// --- Comune ----------------------------------------------------------------

function runOf(plan: CrossingPlan): number {
  return plan.axis === 0 ? plan.sizeX : plan.sizeY;
}

function deepest(a: CrossingRefusal, b: CrossingRefusal): CrossingRefusal {
  return REFUSAL_DEPTH[b] > REFUSAL_DEPTH[a] ? b : a;
}

function assemble(
  kind: CrossingKind,
  axis: 0 | 1,
  alongAt: (d: number) => number,
  crossMin: number,
  from: number,
  to: number,
  deckZ: number,
  supports: readonly number[],
  piers: readonly CrossingPier[],
): CrossingPlan {
  const ends = [alongAt(from), alongAt(to)];
  const [x, y] = point(axis, Math.min(...ends), crossMin);
  const length = to - from + 1;
  const sizeX = axis === 0 ? length : CROSSINGS.width;
  const sizeY = axis === 0 ? CROSSINGS.width : length;

  return {
    kind,
    axis,
    deckZ,
    x,
    y,
    sizeX,
    sizeY,
    corbel: CROSSINGS.corbel,
    supports,
    piers,
    segments: sliceRun(axis, x, y, sizeX, sizeY),
  };
}

/**
 * La corsa spezzata in tratti lunghi al piu' `segmentLength`.
 *
 * L'ultimo tratto assorbe il resto invece di aprirne uno da un voxel: un
 * segmento cosi' costerebbe una passata di mesh per una fetta che non si vede, e
 * il tetto di chunk sporchi tollera senza problemi un tratto lungo una volta e
 * mezza il passo.
 */
function sliceRun(
  axis: 0 | 1,
  x: number,
  y: number,
  sizeX: number,
  sizeY: number,
): CrossingSegment[] {
  const run = axis === 0 ? sizeX : sizeY;
  const segments: CrossingSegment[] = [];

  let offset = 0;
  while (offset < run) {
    let size = Math.min(CROSSINGS.segmentLength, run - offset);
    if (run - offset - size < CROSSINGS.segmentLength / 2) size = run - offset;
    segments.push({
      x: axis === 0 ? x + offset : x,
      y: axis === 0 ? y : y + offset,
      sizeX: axis === 0 ? size : sizeX,
      sizeY: axis === 0 ? sizeY : size,
    });
    offset += size;
  }

  return segments;
}
