import { STREETS } from './config';
import { FACING, type BlockRect, type Facing } from './streetGrid';

/**
 * Come un candidato della simulazione diventa un lotto accessibile.
 *
 * **Il lotto non e' un isolato.** `nextBuildSites` propone la posizione verso
 * cui la crescita deve tendere; qui si cerca l'impronta libera piu' vicina anche
 * attraverso i confini della maglia. Il rettangolo limita soltanto la scansione:
 * non deve diventare una forma leggibile nella citta'. Il bordo resta una
 * variante esplicita per le sole opere costiere che lo usano davvero.
 *
 * **Puro.** Nessun PRNG, nessuno stato, nessun mondo: la disponibilita' entra
 * come predicato. E' cio' che rende questa regola verificabile senza terreno e
 * che tiene la scelta indipendente dall'ordine in cui gli isolati si riempiono.
 */

export interface LotRequest {
  /** Riquadro edificabile dell'isolato, estremi inclusi. */
  readonly rect: BlockRect;
  /** Colonna proposta dalla simulazione: resta il centro della ricerca. */
  readonly x: number;
  readonly y: number;
  /** Lato massimo desiderato. Il lotto puo' uscire piu' stretto, mai piu' largo. */
  readonly footprint: number;
  /** true se il quadrato di lato `footprint` ancorato qui e' libero e costruibile. */
  readonly accepts: (x: number, y: number, footprint: number) => boolean;
  /** Solo le opere costiere richiedono ancora un lotto a contatto col bordo. */
  readonly edgeOnly?: boolean;
  /**
   * true se un'impronta ancorata qui ha un affaccio su strada.
   *
   * **E' una preferenza, non un filtro**, ed e' tutta la differenza fra una
   * citta' che segue le strade e una citta' fatta a nastri con dei vuoti in
   * mezzo. La ricerca percorre il rettangolo due volte: la prima accetta solo
   * gli ancoraggi che rispondono true, la seconda non guarda piu' nessuno. Il
   * risultato e' che il tessuto si addensa lungo la carreggiata e si dirada
   * allontanandosene — senza che nessuno disegni il confine, e senza che una
   * colonna lontana diventi inedificabile.
   *
   * Chi non ce l'ha la lascia fuori, e la ricerca e' quella di sempre: la
   * strada non e' un concetto di questo modulo, e non deve diventarlo.
   */
  readonly onFrontage?: (x: number, y: number, footprint: number) => boolean;
  /**
   * Orientamento fornito dal mondo. Nella posa libera orienta la facciata;
   * sulla costa sceglie prima il bordo rivolto all'acqua.
   */
  readonly facingAt?: (x: number, y: number, footprint: number) => Facing;
  /**
   * true se chi chiama sa gia' che questo lato non sta da nessuna parte nel
   * rettangolo.
   *
   * **La purezza resta qui.** Il modulo non tiene memoria: la memoria e' di chi
   * conosce il mondo e sa quando smette di valere, e queste due funzioni sono la
   * sola cosa che gli si chiede. Chi non ne ha una le lascia fuori e la ricerca
   * e' quella di sempre.
   */
  readonly exhausted?: (footprint: number) => boolean;
  /** Notifica che una scansione completa di questo lato non ha trovato niente. */
  readonly onExhausted?: (footprint: number) => void;
}

export interface Lot {
  /** Angolo minimo del lotto. */
  readonly x: number;
  readonly y: number;
  readonly footprint: number;
  /** Verso cui l'edificio si affaccia; non implica contatto con una strada. */
  readonly facing: Facing;
}

/**
 * Lotto piu' vicino alla colonna proposta, o null se l'isolato non ne ha piu'.
 *
 * La simulazione decide il luogo; il reticolo decide soltanto se l'impronta ci
 * sta. Cercare in tutta la superficie, per distanza dal candidato, evita che i
 * quattro bordi dell'isolato diventino la forma visibile della crescita.
 */
export function placeLot(request: LotRequest): Lot | null {
  const { rect } = request;
  const width = rect.x1 - rect.x0 + 1;
  const height = rect.y1 - rect.y0 + 1;
  const largest = Math.min(request.footprint, width, height);

  for (let footprint = largest; footprint >= 1; footprint--) {
    if (request.exhausted?.(footprint) === true) continue;
    const lot = request.edgeOnly
      ? placeAlongEdge(request, footprint)
      : placeAroundCandidate(request, footprint);
    if (lot !== null) return lot;
    // **Solo la ricerca radiale percorre il rettangolo per intero**, e il punto
    // eletto ne cambia soltanto l'ordine: il suo "niente" vale per la
    // superficie, non per il candidato. La ricerca lungo il bordo salta invece
    // di `align` in `align` su un fronte per volta, e il suo "niente" e' un
    // fatto di quella passeggiata: dirlo al chiamante lo farebbe rinunciare a
    // celle mai provate.
    if (request.edgeOnly !== true) request.onExhausted?.(footprint);
  }

  return null;
}

/**
 * Cerca l'impronta il cui centro e' piu' vicino al punto eletto dal campo.
 *
 * L'ordine totale sui pareggi e' intenzionale: nessun PRNG e nessuna storia del
 * registry devono cambiare la stessa citta' a parita' di seed. Non si forza il
 * passo stradale: quel passo descrive la rete, non il tessuto che le cresce fra.
 */
function placeAroundCandidate(request: LotRequest, footprint: number): Lot | null {
  const { rect } = request;
  const maxX = rect.x1 - footprint + 1;
  const maxY = rect.y1 - footprint + 1;
  if (maxX < rect.x0 || maxY < rect.y0) return null;

  const preferredX = clamp(Math.round(request.x - (footprint - 1) * 0.5), rect.x0, maxX);
  const preferredY = clamp(Math.round(request.y - (footprint - 1) * 0.5), rect.y0, maxY);
  const reach = Math.max(
    preferredX - rect.x0,
    maxX - preferredX,
    preferredY - rect.y0,
    maxY - preferredY,
  );

  const centerDx = preferredX * 2 + footprint - 1 - request.x * 2;
  const centerDy = preferredY * 2 + footprint - 1 - request.y * 2;
  // L'ordine e' euclideo sull'intero raggio, non quadrato per anelli di
  // Chebyshev: a saturazione e' questa differenza a separare una macchia urbana
  // da un altro isolato gigante. La lista dipende da tre interi piccoli e viene
  // riusata fra tutti i candidati della stessa scala.
  const offsets = radialOffsets(reach, centerDx, centerDy);

  // Due passate sulla stessa lista invece di due liste: la prima chiede anche
  // l'affaccio, la seconda si accontenta. Chi non ha un `onFrontage` fa solo la
  // seconda, ed e' la ricerca di sempre — nessun costo per chi non la usa.
  const frontage = request.onFrontage;
  if (frontage !== undefined) {
    const found = scan(request, offsets, preferredX, preferredY, maxX, maxY, footprint, frontage);
    if (found !== null) return found;
  }
  return scan(request, offsets, preferredX, preferredY, maxX, maxY, footprint, null);
}

/** Una passata sugli scostamenti, con o senza il filtro dell'affaccio. */
function scan(
  request: LotRequest,
  offsets: readonly Offset[],
  preferredX: number,
  preferredY: number,
  maxX: number,
  maxY: number,
  footprint: number,
  frontage: ((x: number, y: number, footprint: number) => boolean) | null,
): Lot | null {
  const { rect } = request;
  for (const offset of offsets) {
    const candidate = { x: preferredX + offset.x, y: preferredY + offset.y };
    if (candidate.x < rect.x0 || candidate.x > maxX ||
      candidate.y < rect.y0 || candidate.y > maxY) continue;
    // L'affaccio si chiede **prima** dell'occupazione: e' una lettura su un
    // indice in memoria, mentre `accepts` interroga terreno e registry per ogni
    // colonna dell'impronta. Invertirli farebbe pagare la sonda cara su ogni
    // ancoraggio che il filtro scarta comunque.
    if (frontage !== null && !frontage(candidate.x, candidate.y, footprint)) continue;
    if (!request.accepts(candidate.x, candidate.y, footprint)) continue;
    return {
      x: candidate.x,
      y: candidate.y,
      footprint,
      facing: request.facingAt?.(candidate.x, candidate.y, footprint) ??
        nearestFacing(rect, candidate.x, candidate.y, footprint),
    };
  }
  return null;
}

interface Offset {
  readonly x: number;
  readonly y: number;
  readonly distance2: number;
}

const RADIAL_OFFSETS = new Map<string, readonly Offset[]>();

/** Ordine radiale stabile, memorizzato per non riordinare migliaia di celle a lotto. */
function radialOffsets(reach: number, centerDx: number, centerDy: number): readonly Offset[] {
  const key = `${reach},${centerDx},${centerDy}`;
  const cached = RADIAL_OFFSETS.get(key);
  if (cached !== undefined) return cached;

  const offsets: Offset[] = [];
  for (let y = -reach; y <= reach; y++) {
    for (let x = -reach; x <= reach; x++) {
      const dx = centerDx + x * 2;
      const dy = centerDy + y * 2;
      offsets.push({ x, y, distance2: dx * dx + dy * dy });
    }
  }
  offsets.sort((a, b) => a.distance2 - b.distance2 || a.y - b.y || a.x - b.x);
  RADIAL_OFFSETS.set(key, offsets);
  return offsets;
}

/** Il fronte orienta portale e facciata anche quando l'edificio e' arretrato. */
function nearestFacing(rect: BlockRect, x: number, y: number, footprint: number): Facing {
  const ranked = [
    { facing: FACING.east, distance: rect.x1 - (x + footprint - 1) },
    { facing: FACING.west, distance: x - rect.x0 },
    { facing: FACING.north, distance: rect.y1 - (y + footprint - 1) },
    { facing: FACING.south, distance: y - rect.y0 },
  ];
  ranked.sort((a, b) => a.distance - b.distance || a.facing - b.facing);
  return ranked[0].facing;
}

/** Variante riservata alle opere che devono davvero raggiungere acqua o banchina. */
function placeAlongEdge(request: LotRequest, footprint: number): Lot | null {
  for (const facing of edgeOrder(request, footprint)) {
    const lot = slideAlongEdge(request, facing, footprint);
    if (lot !== null) return lot;
  }
  return null;
}

/** I quattro fronti, dal piu' vicino alla colonna proposta al piu' lontano. */
function edgeOrder(request: LotRequest, footprint: number): readonly Facing[] {
  const { rect, x, y } = request;
  const preferred = request.facingAt?.(x, y, footprint);
  const ranked = [
    { facing: FACING.east, distance: rect.x1 - x },
    { facing: FACING.west, distance: x - rect.x0 },
    { facing: FACING.north, distance: rect.y1 - y },
    { facing: FACING.south, distance: y - rect.y0 },
  ];
  ranked.sort((a, b) =>
    Number(b.facing === preferred) - Number(a.facing === preferred) ||
    a.distance - b.distance ||
    a.facing - b.facing);
  return ranked.map((entry) => entry.facing);
}

/**
 * Prima riserva libera lungo un fronte, partendo dalla posizione preferita.
 *
 * L'ancora sul lato scelto resta fissa per l'accesso; l'altra coordinata segue
 * il candidato. Questo percorso non viene usato dal tessuto ordinario.
 */
function slideAlongEdge(request: LotRequest, facing: Facing, footprint: number): Lot | null {
  const { rect } = request;
  const slidesAlongY = facing === FACING.east || facing === FACING.west;

  const fixed = facing === FACING.east
    ? rect.x1 - footprint + 1
    : facing === FACING.west
      ? rect.x0
      : facing === FACING.north
        ? rect.y1 - footprint + 1
        : rect.y0;

  const min = slidesAlongY ? rect.y0 : rect.x0;
  const max = (slidesAlongY ? rect.y1 : rect.x1) - footprint + 1;
  if (max < min) return null;

  const align = STREETS.align;
  const centre = slidesAlongY ? request.y : request.x;
  const preferred = alignDown(clamp(centre - Math.floor((footprint - 1) * 0.5), min, max), min, align);
  const reach = Math.floor((max - min) / align);

  for (let step = 0; step <= reach; step++) {
    for (const sign of step === 0 ? CENTRE : BOTH) {
      const along = preferred + sign * step * align;
      if (along < min || along > max) continue;

      const x = slidesAlongY ? fixed : along;
      const y = slidesAlongY ? along : fixed;
      if (request.accepts(x, y, footprint)) return { x, y, footprint, facing };
    }
  }

  return null;
}

/** Al passo zero c'e' una sola posizione: provarla due volte la valuterebbe due volte. */
const CENTRE: readonly number[] = [0];
/** In avanti prima che indietro, per fissare l'ordine a parita' di distanza. */
const BOTH: readonly number[] = [1, -1];

/** Arrotonda `value` al multiplo di `step` non superiore, contato da `origin`. */
function alignDown(value: number, origin: number, step: number): number {
  return origin + Math.floor((value - origin) / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
