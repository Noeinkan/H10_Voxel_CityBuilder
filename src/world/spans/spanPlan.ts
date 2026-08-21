import { SPANS, SPAN_KIND, type SpanKind } from './config';

/**
 * La regola che decide se due edifici possono darsi una campata, e dove.
 *
 * **Pura come `grading/grade.ts`, `sites/siteRules.ts` e `buildings/cluster.ts`.**
 * Non conosce il `VoxelWorld`, non conosce il registry e non conosce la
 * `TerrainMap`: cio' che deve sapere del luogo entra come **predicato**, che e'
 * lo stesso patto che `placeLot` ha con la disponibilita' dei lotti. Ne segue
 * che il gate della fase — «poggiano sempre su appoggi reali» — si verifica in
 * un test in ambiente `node`, senza mondo e senza GPU, invece che a occhio su
 * una citta' cresciuta.
 *
 * **Il vuoto decide il tipo, non il contrario.** Un ponte pretende una
 * carreggiata sotto di se' e un mezzanino la esclude: sono righe di
 * `SPANS.rules`, e la funzione non ha un ramo per l'uno e uno per l'altro.
 */

/** Cio' che serve sapere di un appoggio. E' un `BuildingRecord` ridotto all'osso. */
export interface SpanSupport {
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
  readonly level: number;
  /** Altezza del corso di base condiviso con la fila; zero se non ne ha uno. */
  readonly baseBand: number;
  /** Fila a cui appartiene, se ne ha una. */
  readonly cluster?: number;
}

/** Cio' che serve sapere di una colonna del vuoto. */
export interface GapColumn {
  /** Quota del terreno: il primo voxel **libero** sopra il suolo. */
  readonly height: number;
  readonly pavement: boolean;
  /** true se nessun edificio occupa il suolo di questa colonna. */
  readonly free: boolean;
}

/** I due predicati con cui il luogo entra in una regola pura. */
export interface SpanProbe {
  /** Come si presenta una colonna del vuoto. */
  readonly ground: (x: number, y: number) => GapColumn;
  /** true se nel mondo quel voxel e' pieno. E' cio' che verifica l'appoggio vero. */
  readonly solid: (x: number, y: number, z: number) => boolean;
}

export interface SpanQuery extends SpanProbe {
  readonly a: SpanSupport;
  readonly b: SpanSupport;
  readonly kind: SpanKind;
}

/**
 * Perche' due edifici non possono darsi una campata.
 *
 * Sono motivi e non errori: la stragrande maggioranza delle coppie che la
 * passata esamina ne merita uno, ed e' normale. Servono ai test, che senza di
 * loro potrebbero solo dire "no" e non "no per la ragione giusta".
 */
export const SPAN_REFUSALS = [
  /** Le impronte non si guardano su nessun asse, o si sovrappongono in pianta. */
  'notFacing',
  /** Il fronte comune e' piu' stretto dell'impalcato. */
  'tooNarrow',
  /** Il vuoto e' troppo corto o troppo lungo. */
  'badGap',
  /** Un edificio occupa il suolo del vuoto. */
  'groundTaken',
  /** Un ponte senza carreggiata sotto, o un mezzanino che ne ha una. */
  'wrongGround',
  /** Un appoggio non e' abbastanza alto. */
  'level',
  /** Non c'e' quota che stia sopra gli appoggi e lasci il franco al vuoto. */
  'tooLow',
  /** Nessuna quota ammessa ha entrambe le testate piene. */
  'noAbutment',
  /** Un mezzanino fra due edifici che non stanno nella stessa fila. */
  'notInRow',
  /** Il cuore dell'isolato e' troppo piccolo per una piazza. */
  'noCourtyard',
  /** Il perimetro non offre abbastanza appoggi a una quota comune. */
  'fewSupports',
  /** Gli appoggi stanno tutti su un lato: sarebbe una traversata, non una piazza. */
  'oneSided',
] as const;

export type SpanRefusal = (typeof SPAN_REFUSALS)[number];

/**
 * Un tratto in cui la comparsa si spezza.
 *
 * **Non e' un record.** Una campata resta un record solo — con i suoi appoggi e
 * il suo posto nella rete — e i segmenti sono il modo in cui *compare*: entrano
 * nella coda uno per volta, cosi' il picco di chunk sporchi resta quello di una
 * struttura sola. Accodarli tutti insieme li sporcherebbe comunque tutti, che e'
 * esattamente cio' che il tetto esiste per impedire.
 */
export interface SpanSegment {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

export interface SpanPlan {
  readonly kind: SpanKind;
  /** 0 se la campata corre lungo x, 1 lungo y. Per la piazza non ha corsa: vale 0. */
  readonly axis: 0 | 1;
  /** Quota della carreggiata: la riga di voxel calpestabile. */
  readonly deckZ: number;
  /** Angolo minimo dell'ingombro, con `sizeX`/`sizeY`: e' il riquadro del record. */
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /**
   * Colonne, dai due capi della corsa, in cui le travi riempiono la larghezza.
   *
   * Zero per la piazza, che non ha due testate ma un perimetro.
   */
  readonly corbel: number;
  /** Gli id degli appoggi, in ordine crescente: la coppia si propone una volta sola. */
  readonly supports: readonly number[];
  readonly segments: readonly SpanSegment[];
}

export type SpanResult =
  | { readonly ok: true; readonly plan: SpanPlan }
  | { readonly ok: false; readonly refusal: SpanRefusal };

export function refuse(refusal: SpanRefusal): SpanResult {
  return { ok: false, refusal };
}

/** Prima quota occupata dalla campata: le travi stanno sotto la carreggiata. */
export function spanBaseZ(deckZ: number): number {
  return deckZ - SPANS.girderDepth;
}

/** Voxel occupati in altezza: le travi piu' la carreggiata. */
export const SPAN_HEIGHT = SPANS.girderDepth + 1;

export function planSpan(query: SpanQuery): SpanResult {
  const { a, b, kind } = query;
  const rule = SPANS.rules[kind];

  if (a.level < rule.minLevel || b.level < rule.minLevel) return refuse('level');
  // Un mezzanino e' un piano che continua dentro la fila: fra due file diverse
  // sarebbe un ponte basso, cioe' la cosa che la riga `bridge` fa meglio.
  if (kind === SPAN_KIND.mezzanine &&
    (a.cluster === undefined || a.cluster !== b.cluster || a.baseBand <= 0 || b.baseBand <= 0)) {
    return refuse('notInRow');
  }

  const ax1 = a.x + a.sizeX - 1;
  const ay1 = a.y + a.sizeY - 1;
  const bx1 = b.x + b.sizeX - 1;
  const by1 = b.y + b.sizeY - 1;

  // Su quale asse le due impronte si guardano. Esattamente uno dei due vuoti
  // dev'essere non negativo: se lo sono entrambi le impronte stanno in diagonale
  // e non hanno un fronte comune, se nessuno lo e' si sovrappongono in pianta.
  const gapX = a.x > bx1 ? a.x - bx1 - 1 : b.x > ax1 ? b.x - ax1 - 1 : -1;
  const gapY = a.y > by1 ? a.y - by1 - 1 : b.y > ay1 ? b.y - ay1 - 1 : -1;
  if ((gapX >= 0) === (gapY >= 0)) return refuse('notFacing');

  const axis: 0 | 1 = gapX >= 0 ? 0 : 1;
  const gap = axis === 0 ? gapX : gapY;
  if (gap < SPANS.minGap || gap > SPANS.maxGap) return refuse('badGap');

  // Il fronte comune sull'asse perpendicolare, e dove ci si centra l'impalcato.
  const lo = axis === 0 ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
  const hi = axis === 0 ? Math.min(ay1, by1) : Math.min(ax1, bx1);
  if (hi - lo + 1 < rule.width) return refuse('tooNarrow');

  // **Centrato, e non allineato al cubo di terreno.** L'allineamento di
  // `STREETS.align` esiste perche' un lotto poggi su cubi interi, e una campata
  // il terreno non lo tocca. Allinearla la spostava di un voxel rispetto al
  // centro, ed era esattamente il voxel di troppo: le fasce rientrano
  // **centrate**, quindi un impalcato centrato trova la parete e uno spostato di
  // uno la manca da un lato — su ogni edificio, a ogni quota.
  const cross = clamp(
    lo + ((hi - lo + 1 - rule.width) >> 1),
    lo,
    hi - rule.width + 1,
  );

  // Chi dei due sta prima sull'asse: serve a sapere, per ciascuno, da che parte
  // il corpo si affaccia sull'altro.
  const first = (axis === 0 ? a.x > bx1 : a.y > by1) ? b : a;
  const second = first === a ? b : a;
  const firstEnd = axis === 0 ? first.x + first.sizeX - 1 : first.y + first.sizeY - 1;
  const secondStart = axis === 0 ? second.x : second.y;

  // Il **vuoto vero** fra le due impronte: e' qui che si misurano carreggiata e
  // franco, e solo qui. La campata puo' sporgere sopra le impronte stesse —
  // passa sopra le fasce basse dei propri appoggi — ma cio' che scavalca sta in
  // mezzo.
  const from = firstEnd + 1;
  const to = secondStart - 1;

  let street = false;
  let highest = 0;
  for (let v = from; v <= to; v++) {
    for (let w = cross; w < cross + rule.width; w++) {
      const column = axis === 0 ? query.ground(v, w) : query.ground(w, v);
      if (!column.free) return refuse('groundTaken');
      if (column.pavement) street = true;
      if (column.height > highest) highest = column.height;
    }
  }
  if (rule.overStreet !== street) return refuse('wrongGround');

  // La quota piu' bassa ammessa. Il franco si misura dalla trave, non dalla
  // carreggiata: e' il punto piu' basso della struttura, ed e' quello che
  // toccherebbe chi passa sotto.
  const floorZ = Math.max(
    Math.max(a.baseZ, b.baseZ) + rule.minRise,
    highest + rule.clearance + SPANS.girderDepth,
  );
  const startZ = kind === SPAN_KIND.mezzanine
    // Una fascia sopra il basamento che la fila gia' condivide: a filo dello
    // zoccolo le travi non lascerebbero aria sotto di se', e un mezzanino e'
    // comunque il piano *sopra* quello terra.
    ? Math.max(a.baseZ + a.baseBand, b.baseZ + b.baseBand) - 1 + SPANS.mezzanineRise
    : Math.min(a.baseZ + a.height, b.baseZ + b.height) - SPANS.deckDrop;
  if (startZ < floorZ) return refuse('tooLow');

  const landing = highestLanding(query, {
    axis,
    cross,
    width: rule.width,
    first,
    second,
    startZ,
    floorZ,
  });
  if (landing === null) return refuse('noAbutment');

  const { deckZ, deckFrom, deckTo } = landing;
  // La campata puo' uscire piu' lunga del vuoto, perche' parte da dove i corpi
  // si affacciano davvero. Oltre il tetto non e' piu' una passerella ma un
  // viadotto, che ha bisogno di appoggi propri a terra — cioe' della 4.9.
  const length = deckTo - deckFrom + 1;
  if (length > SPANS.maxGap) return refuse('badGap');

  const x = axis === 0 ? deckFrom : cross;
  const y = axis === 0 ? cross : deckFrom;
  const sizeX = axis === 0 ? length : rule.width;
  const sizeY = axis === 0 ? rule.width : length;

  return {
    ok: true,
    plan: {
      kind,
      axis,
      deckZ,
      x,
      y,
      sizeX,
      sizeY,
      // La mensola non puo' mangiarsi meta' campata da ciascun capo: su un vuoto
      // di due voxel le due testate si toccherebbero e la travatura sparirebbe
      // dentro il pieno, cioe' proprio la struttura che si vuole mostrare.
      corbel: Math.min(SPANS.corbel, length >> 1),
      supports: a.id <= b.id ? [a.id, b.id] : [b.id, a.id],
      segments: segmentsOf(axis, deckFrom, deckTo, cross, rule.width),
    },
  };
}

interface LandingQuery {
  readonly axis: 0 | 1;
  readonly cross: number;
  readonly width: number;
  /** L'appoggio che sta prima sull'asse, e quello che sta dopo. */
  readonly first: SpanSupport;
  readonly second: SpanSupport;
  readonly startZ: number;
  readonly floorZ: number;
}

/**
 * Dove la campata atterra: la quota piu' alta in cui **entrambi** i corpi si
 * affacciano davvero, e le due colonne fra cui l'impalcato corre.
 *
 * **E' il gate della fase, scritto come codice**, e la ragione per cui non basta
 * guardare il bordo dell'impronta. Gli edifici di questo progetto sono
 * piramidali: la fascia zero riempie il riquadro, e da li' in su ogni fascia
 * rientra. Al filo dell'impronta la parete c'e' solo nei primi voxel — sotto
 * qualunque franco che una strada possa chiedere — e cercare l'appoggio li'
 * significa non trovarlo mai.
 *
 * Il corpo lo si cerca quindi **rientrando**: dal bordo dell'impronta verso il
 * centro, finche' non si trova la parete a quella quota. La campata che ne esce
 * e' piu' lunga del vuoto e passa sopra le fasce basse dei propri appoggi — che
 * e' esattamente come atterra una passerella vera, sull'arretramento e non sul
 * filo del basamento.
 *
 * Si chiede l'intera larghezza e non meta': una campata appoggiata solo per un
 * pezzo del proprio fronte sporge nel vuoto da un lato, e a distanza di gioco
 * quello si vede.
 */
function highestLanding(query: SpanProbe, request: LandingQuery): {
  deckZ: number;
  deckFrom: number;
  deckTo: number;
} | null {
  const { axis, cross, width, first, second, startZ, floorZ } = request;

  const firstStart = axis === 0 ? first.x : first.y;
  const firstEnd = firstStart + (axis === 0 ? first.sizeX : first.sizeY) - 1;
  const secondStart = axis === 0 ? second.x : second.y;
  const secondEnd = secondStart + (axis === 0 ? second.sizeX : second.sizeY) - 1;

  for (let z = startZ; z >= floorZ; z--) {
    // Dal bordo che guarda l'altro, rientrando: la prima colonna in cui la
    // parete c'e' per tutta la larghezza dell'impalcato.
    const near = wallAt(query, axis, cross, width, z, firstEnd, firstStart, -1);
    if (near === null) continue;
    const far = wallAt(query, axis, cross, width, z, secondStart, secondEnd, 1);
    if (far === null) continue;
    // Serve almeno una colonna di campata fra le due pareti: se si toccano, i
    // due corpi sono gia' attaccati e non c'e' niente da collegare.
    if (far - near < 2) continue;
    // E il volume dev'essere **tutto aria**. La campata sporge sopra le fasce
    // basse dei propri appoggi, quindi passa dentro il loro riquadro: se ci
    // trovasse pieno lo sovrascriverebbe, e cancellarla piu' tardi bucherebbe
    // l'edificio invece di togliere la campata. Meglio scendere di una quota.
    if (!boxIsClear(query, axis, cross, width, near + 1, far - 1, z)) continue;
    return { deckZ: z, deckFrom: near + 1, deckTo: far - 1 };
  }
  return null;
}

/**
 * true se tutto il volume della campata — travi comprese — e' aria.
 *
 * E' cio' che rende la cancellazione sicura: finche' nel riquadro della campata
 * non c'e' altro che la campata, toglierla e' svuotare quel riquadro. Se invece
 * ci scrivesse sopra qualcosa, cancellarla toglierebbe anche quel qualcosa.
 */
function boxIsClear(
  query: SpanProbe,
  axis: 0 | 1,
  cross: number,
  width: number,
  from: number,
  to: number,
  deckZ: number,
): boolean {
  for (let z = deckZ - SPANS.girderDepth; z <= deckZ; z++) {
    for (let v = from; v <= to; v++) {
      for (let w = cross; w < cross + width; w++) {
        const solid = axis === 0 ? query.solid(v, w, z) : query.solid(w, v, z);
        if (solid) return false;
      }
    }
  }
  return true;
}

/**
 * La prima colonna, fra `from` e `to` nel verso `step`, in cui la parete e'
 * piena per tutta la larghezza dell'impalcato. `null` se non ce n'e'.
 */
function wallAt(
  query: SpanProbe,
  axis: 0 | 1,
  cross: number,
  width: number,
  z: number,
  from: number,
  to: number,
  step: 1 | -1,
): number | null {
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
    if (abutmentSolid(query, axis, cross, width, v, z)) return v;
  }
  return null;
}

/** true se tutte le colonne di una testata sono piene a quella quota. */
export function abutmentSolid(
  query: SpanProbe,
  axis: 0 | 1,
  cross: number,
  width: number,
  side: number,
  z: number,
): boolean {
  for (let w = cross; w < cross + width; w++) {
    const solid = axis === 0 ? query.solid(side, w, z) : query.solid(w, side, z);
    if (!solid) return false;
  }
  return true;
}

/**
 * I tratti in cui la corsa si spezza.
 *
 * **Le campate lunghe si spezzano, non si esentano**: e' il settimo punto della
 * fase, ed e' anche cio' che il commento di `LANDMARK.maxDirtyChunks` aveva gia'
 * annunciato per le ricette troppo grosse.
 */
function segmentsOf(
  axis: 0 | 1,
  from: number,
  to: number,
  cross: number,
  width: number,
): readonly SpanSegment[] {
  const out: SpanSegment[] = [];
  for (let v = from; v <= to; v += SPANS.segmentLength) {
    const length = Math.min(SPANS.segmentLength, to - v + 1);
    out.push(axis === 0
      ? { x: v, y: cross, sizeX: length, sizeY: width }
      : { x: cross, y: v, sizeX: width, sizeY: length });
  }
  return out;
}

/** Spezza un riquadro qualunque in tratti larghi al massimo `SPANS.segmentLength`. */
export function tileSegments(
  x: number,
  y: number,
  sizeX: number,
  sizeY: number,
): readonly SpanSegment[] {
  const out: SpanSegment[] = [];
  for (let dy = 0; dy < sizeY; dy += SPANS.segmentLength) {
    for (let dx = 0; dx < sizeX; dx += SPANS.segmentLength) {
      out.push({
        x: x + dx,
        y: y + dy,
        sizeX: Math.min(SPANS.segmentLength, sizeX - dx),
        sizeY: Math.min(SPANS.segmentLength, sizeY - dy),
      });
    }
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
