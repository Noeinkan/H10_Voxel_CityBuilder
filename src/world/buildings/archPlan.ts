import { ARCH } from './config/arch';

/**
 * L'arco che un edificio getta verso il dirimpettaio: da due record al braccio
 * di ciascuno.
 *
 * **Puro, e senza mondo.** Entrano due record gia' letti, le quote di fascia
 * delle loro sagome e una sonda sul pieno; esce una coppia di bracci o il
 * motivo per cui non c'e'. E' la stessa divisione di `cluster.ts`, `siting.ts`
 * e `spanPlan.ts`, e serve alla stessa cosa: la regola si verifica in un test
 * senza far crescere un'isola.
 *
 * **Il braccio non e' una campata.** Non ha un record proprio, non ha appoggi e
 * non cade: e' massa dell'edificio che lo getta, dipinta con la sua vernice e
 * rigenerata dal suo stesso `recordStamp`. Cio' che i due bracci hanno in comune
 * e' soltanto la quota — che questa regola sceglie una volta per la coppia — e
 * il fatto di incontrarsi in mezzo al vuoto.
 *
 * **Nessuno entra nelle colonne dell'altro.** Il vuoto si divide in due, e ogni
 * braccio si ferma a meta': `overlaps` continua a confrontare due riquadri
 * disgiunti, e nessun invariante del registry viene toccato. E' la ragione per
 * cui un arco puo' esistere qui senza il record multi-rettangolo.
 */

/** Il braccio di un edificio: cio' che il record conserva per poterlo ridisegnare. */
export interface BuildingArch {
  /**
   * Faccia da cui esce, negli indici di `facing`.
   *
   * **Non e' `facing`, ed e' costato la meta' di questa regola.** Il primo taglio
   * chiedeva che i due dirimpettai si guardassero anche nel *verso di strada* —
   * `a.facing` opposto a `b.facing` — e su una citta' cresciuta quarantacinque
   * coppie su quarantanove cadevano li'. La ragione e' la maglia: in questo
   * tessuto il fronte strada di un edificio e' la strada *piu' vicina*, e due
   * corpi che si affacciano sullo stesso vuoto spesso appartengono a due assi
   * diversi. **Un arco e' un fatto del vuoto, non della maglia**: chi getta il
   * primo braccio lo fa verso il proprio fronte, e il secondo lo getta verso il
   * primo, comunque sia orientato.
   */
  readonly face: number;

  /**
   * Voxel di cui il braccio esce **oltre l'impronta**.
   *
   * E' l'unico campo che l'inviluppo legge: `envelopeOf` cresce di tanto sul
   * verso di `facing`, esattamente come per lo sbalzo, e con lo stesso effetto —
   * niente si costruisce attraverso il braccio, ma sotto ci passa ancora la
   * carreggiata perche' `groundColumns` continua a prendere la sola impronta.
   */
  readonly reach: number;

  /**
   * Voxel di cui il braccio comincia **dentro** l'impronta.
   *
   * Un corpo e' piramidale: al filo dell'impronta la parete esiste solo nelle
   * prime fasce, e alla quota dell'arco quasi mai. E' la stessa lettura di
   * `highestLanding` per le campate — si rientra finche' non si trova il muro —
   * e resta fuori dall'inviluppo perche' quelle colonne il record le ha gia'.
   */
  readonly inset: number;

  /** Quota **assoluta** dell'estradosso meno lo spessore: la base del corso. */
  readonly z: number;

  /** Spessore del corso, in voxel. */
  readonly rise: number;

  /** Coordinata di mondo del primo voxel lungo il fronte. */
  readonly across: number;

  /** Voxel occupati lungo il fronte. */
  readonly width: number;

  /**
   * Id dell'edificio che il braccio va a incontrare.
   *
   * Non serve a ridisegnare niente — la sagoma esce interamente dai campi sopra
   * — e sta nel record per la ragione opposta: dice **con chi** la campata e'
   * stata concordata, ed e' cio' che impedisce a una passata successiva di
   * proporre un secondo arco alla stessa coppia o di lasciarne mezzo in piedi.
   */
  readonly mate: number;
}

/** I due bracci di una campata, uno per edificio. */
export interface ArchPair {
  readonly a: BuildingArch;
  readonly b: BuildingArch;
}

/** Cio' che la regola ha bisogno di sapere di un edificio. */
export interface ArchSide {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly baseZ: number;
  readonly footprint: number;
  readonly footprintY?: number;
  readonly height: number;
  readonly level: number;
  /**
   * Fronte strada, e si legge **solo su chi apre la coppia**.
   *
   * E' la direzione in cui il primo dei due guarda, e quindi l'asse su cui la
   * campata si misura; il secondo riceve la faccia opposta per costruzione e il
   * proprio fronte non entra nella regola. Vedi `BuildingArch.face`.
   */
  readonly facing?: number;
  readonly arch?: BuildingArch;
  /**
   * Quote di inizio delle fasce della sagoma, locali alla base del record.
   *
   * Sono `VoxelStamp.bandStarts`, e sono qui per la stessa ragione per cui
   * `faceRuns` le legge: **la quota di un arco e' la sommita' di una fascia**,
   * non un numero tirato. Due edifici che non hanno una fascia in comune non
   * hanno una campata, ed e' cio' che fa comparire gli archi dove il tessuto e'
   * gia' coerente invece che ovunque.
   */
  readonly bands: readonly number[];
  /** true se la sagoma del record e' piena in quella colonna di mondo, a quella quota. */
  readonly solid: (x: number, y: number, z: number) => boolean;
}

export interface ArchQuery {
  readonly a: ArchSide;
  readonly b: ArchSide;
  /** Quota del terreno nel vuoto fra i due: e' da li' che si misura il franco. */
  readonly groundZ: number;
}

export const ARCH_REFUSALS = {
  /** Chi apre la coppia non ha un fronte strada: non c'e' un asse su cui misurare. */
  notFacing: 'notFacing',
  /** Uno dei due non e' cresciuto abbastanza. */
  tooLow: 'tooLow',
  /** Uno dei due ha gia' un braccio: se ne getta uno solo. */
  alreadyArched: 'alreadyArched',
  /** Si toccano gia', o sono troppo lontani. */
  badGap: 'badGap',
  /** I due fronti non si affacciano su un tratto abbastanza largo. */
  noOverlap: 'noOverlap',
  /** Nessuna quota di fascia in comune sopra il franco e sotto le due cime. */
  noCommonBand: 'noCommonBand',
  /** A quella quota, uno dei due non ha piu' parete entro l'impronta. */
  noWall: 'noWall',
} as const;

export type ArchRefusal = (typeof ARCH_REFUSALS)[keyof typeof ARCH_REFUSALS];

export type ArchResult =
  | { readonly ok: true; readonly pair: ArchPair }
  | { readonly ok: false; readonly refusal: ArchRefusal };

/** Profondita' dell'impronta lungo y: quella dichiarata, o il lato quadrato. */
function depthOf(side: ArchSide): number {
  return side.footprintY ?? side.footprint;
}

/** La faccia opposta: 0 con 1, 2 con 3. */
function opposite(face: number): number {
  return face ^ 1;
}

/**
 * Il vuoto fra le due impronte lungo il verso di `a`, in voxel.
 *
 * Negativo o zero se si toccano o si sovrappongono, e chi chiama lo legge come
 * un rifiuto invece di come una campata lunga zero.
 */
function gapBetween(a: ArchSide, b: ArchSide, face: number): number {
  switch (face) {
    case 0:
      return b.x - (a.x + a.footprint);
    case 1:
      return a.x - (b.x + b.footprint);
    case 2:
      return b.y - (a.y + depthOf(a));
    default:
      return a.y - (b.y + depthOf(b));
  }
}

/** L'intervallo di mondo su cui i due fronti si guardano, sull'asse del fronte. */
function overlapAcross(a: ArchSide, b: ArchSide, face: number): { from: number; to: number } {
  if (face <= 1) {
    return {
      from: Math.max(a.y, b.y),
      to: Math.min(a.y + depthOf(a), b.y + depthOf(b)),
    };
  }
  return {
    from: Math.max(a.x, b.x),
    to: Math.min(a.x + a.footprint, b.x + b.footprint),
  };
}

/**
 * Le quote di fascia su cui un corpo accetterebbe un arco.
 *
 * Sopra il franco minimo perche' sotto il braccio ci passa la carreggiata, e
 * sotto la cima meno `crownDrop` perche' il coronamento e' gia' ristretto: un
 * arco attaccato li' sarebbe una passerella di servizio sul tetto. La fascia
 * zero non entra mai — e' il corso di base, che sta sotto il franco per
 * costruzione — e nemmeno l'ultima voce, che e' la cima dello stamp e non
 * l'inizio di niente.
 */
function bandTops(side: ArchSide, groundZ: number): number[] {
  const floor = groundZ + ARCH.minClearance;
  const ceiling = side.baseZ + side.height - ARCH.crownDrop - ARCH.rise;
  const out: number[] = [];
  for (let i = 1; i < side.bands.length - 1; i++) {
    const z = side.baseZ + side.bands[i];
    if (z >= floor && z <= ceiling) out.push(z);
  }
  return out;
}

/** Il tratto di parete che una faccia offre a una quota, e quanto si e' rientrati. */
interface FaceRun {
  readonly inset: number;
  readonly from: number;
  readonly to: number;
}

/**
 * Il muro su cui il braccio si imposta, cercato **rientrando**.
 *
 * **La larghezza la detta la parete, non l'impronta**, ed e' la correzione che
 * questa regola ha dovuto imparare due volte — la stessa di `highestLanding`
 * per le campate. Un corpo e' piramidale: al filo dell'impronta la parete
 * esiste solo nelle prime fasce, e alla quota di un arco quasi mai. Misurando il
 * braccio sul sovrapposto delle *impronte* nessun edificio vero lo avrebbe mai
 * ottenuto: alla quota di torre il fronte e' largo la meta'.
 *
 * Si rientra di un voxel per volta e ci si ferma alla prima quota in cui il
 * fronte offre un tratto continuo abbastanza largo. Il piu' lungo di quel
 * livello, non il primo: due tronconi separati da una loggia sono due archi
 * possibili, e prendere il maggiore e' l'unico criterio che non dipende dal
 * verso della scansione.
 */
function faceRun(
  side: ArchSide,
  face: number,
  from: number,
  to: number,
  z: number,
): FaceRun | null {
  const limit = face <= 1 ? side.footprint : depthOf(side);
  for (let inset = 0; inset < limit; inset++) {
    const run = longestRun(side, face, from, to, z, inset);
    if (run !== null) return { inset, from: run.from, to: run.to };
  }
  return null;
}

/** Il tratto pieno piu' lungo dentro `[from, to)`, se arriva alla larghezza minima. */
function longestRun(
  side: ArchSide,
  face: number,
  from: number,
  to: number,
  z: number,
  inset: number,
): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null;
  let start = -1;
  for (let at = from; at <= to; at++) {
    if (at < to && solidAt(side, face, at, z, inset)) {
      if (start < 0) start = at;
      continue;
    }
    if (start >= 0) {
      const length = at - start;
      if (length >= ARCH.minWidth && (best === null || length > best.to - best.from)) {
        best = { from: start, to: at };
      }
      start = -1;
    }
  }
  return best;
}

/** true se il fronte e' pieno in quella colonna, rientrando di `inset` dal filo. */
function solidAt(side: ArchSide, face: number, at: number, z: number, inset: number): boolean {
  switch (face) {
    case 0: return side.solid(side.x + side.footprint - 1 - inset, at, z);
    case 1: return side.solid(side.x + inset, at, z);
    case 2: return side.solid(at, side.y + depthOf(side) - 1 - inset, z);
    default: return side.solid(at, side.y + inset, z);
  }
}

/**
 * I due bracci che chiudono il vuoto fra due edifici, o il motivo per cui non
 * si chiude.
 *
 * **Il vuoto si divide in due, e il resto lo prende chi ha l'id minore.** Serve
 * un criterio, e serve che sia deterministico: la stessa coppia deve dare la
 * stessa coppia di bracci a ogni caricamento, o la sagoma da cancellare non
 * sarebbe quella scritta.
 */
export function planArch(query: ArchQuery): ArchResult {
  const { a, b, groundZ } = query;

  if (a.facing === undefined) return { ok: false, refusal: ARCH_REFUSALS.notFacing };
  const back = opposite(a.facing);
  if (a.level < ARCH.minLevel || b.level < ARCH.minLevel) {
    return { ok: false, refusal: ARCH_REFUSALS.tooLow };
  }
  if (a.arch !== undefined || b.arch !== undefined) {
    return { ok: false, refusal: ARCH_REFUSALS.alreadyArched };
  }

  const gap = gapBetween(a, b, a.facing);
  if (gap < ARCH.minGap || gap > ARCH.maxGap) {
    return { ok: false, refusal: ARCH_REFUSALS.badGap };
  }

  const overlap = overlapAcross(a, b, a.facing);
  if (overlap.to - overlap.from < ARCH.minWidth) {
    return { ok: false, refusal: ARCH_REFUSALS.noOverlap };
  }

  const shared = commonBands(a, b, groundZ);
  if (shared.length === 0) return { ok: false, refusal: ARCH_REFUSALS.noCommonBand };

  // **Si scende finche' il muro c'e'.** La quota piu' alta e' la piu' bella —
  // un arco alto racconta due torri che si toccano, uno basso un portico — ma
  // sopra una certa fascia i due corpi sono gia' rientrati e non si guardano
  // piu' su un tratto utile. Provare solo la prima e rinunciare avrebbe reso la
  // campata un fatto raro due volte: per la fascia in comune e per la parete.
  for (const z of shared) {
    const runA = faceRun(a, a.facing, overlap.from, overlap.to, z);
    const runB = faceRun(b, back, overlap.from, overlap.to, z);
    if (runA === null || runB === null) continue;

    const from = Math.max(runA.from, runB.from);
    const room = Math.min(runA.to, runB.to) - from;
    if (room < ARCH.minWidth) continue;

    const width = Math.min(room, ARCH.maxWidth);
    // Centrato sul tratto in cui le due pareti si guardano: un braccio accostato
    // a un capo lascerebbe l'arco storto rispetto al vuoto che scavalca.
    const across = from + ((room - width) >> 1);

    // Il resto della divisione va a chi ha l'id minore: e' l'unico criterio
    // disponibile che non dipenda dall'ordine in cui la passata li ha incontrati.
    const first = a.id < b.id;
    const half = gap >> 1;
    const extra = gap - half * 2;

    return {
      ok: true,
      pair: {
        a: {
          face: a.facing, reach: half + (first ? extra : 0), inset: runA.inset,
          z, rise: ARCH.rise, across, width, mate: b.id,
        },
        b: {
          face: back, reach: half + (first ? 0 : extra), inset: runB.inset,
          z, rise: ARCH.rise, across, width, mate: a.id,
        },
      },
    };
  }

  return { ok: false, refusal: ARCH_REFUSALS.noWall };
}

/**
 * Le quote su cui i due corpi hanno una fascia in comune, dalla piu' alta.
 *
 * **La tolleranza e' cio' che rende la regola applicabile.** Complanari per
 * costruzione lo sono solo sulla sommita' del corso di base condiviso, che sta
 * sotto il franco: piu' in su le fasce pescano l'altezza da canali separati e
 * le due quote si scostano. `ARCH.plumb` — due voxel, un cubo di terreno — e'
 * lo scarto che a distanza isometrica non si vede, e la quota che ne esce e' la
 * piu' bassa delle due, cosi' l'arco parte da parete piena su tutti e due.
 */
function commonBands(a: ArchSide, b: ArchSide, groundZ: number): readonly number[] {
  const topsB = bandTops(b, groundZ);
  const out = new Set<number>();
  for (const za of bandTops(a, groundZ)) {
    for (const zb of topsB) {
      if (Math.abs(za - zb) <= ARCH.plumb) out.add(Math.min(za, zb));
    }
  }
  return [...out].sort((first, second) => second - first);
}
