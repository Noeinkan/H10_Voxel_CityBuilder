import { hashCoords } from '../rng';
import { STREETS } from './config';

/**
 * Geometria pura della rete stradale.
 *
 * **Non conosce niente.** Nessun `VoxelWorld`, nessuna `TerrainMap`, nessuno
 * stato: entra `(seed, x, y)` ed esce il ruolo di quella colonna. E' cio' che
 * rende la rete verificabile in Node senza mondo, indipendente dall'ordine di
 * visita e gratuita da conservare — non c'e' niente da salvare, perche' non
 * c'e' niente di memorizzato.
 *
 * **Il terreno non entra qui.** Una colonna sott'acqua o non edificabile resta
 * "carreggiata" per questo modulo: e' chi dipinge e chi costruisce a scartarla,
 * confrontandola con la `TerrainMap`. Tenere fuori il terreno e' cio' che
 * permette alla maglia di essere una funzione della sola coppia di coordinate;
 * il ritaglio sulla forma dell'isola avviene comunque, ma a valle e senza
 * bisogno che la griglia sappia che il mare esiste.
 */

/** Cosa fa una colonna dentro la rete. */
export const STREET_ROLE = {
  /** Carreggiata di un asse principale. */
  arterial: 0,
  /** Carreggiata di un asse secondario. */
  minor: 1,
  /** Colonna edificabile a contatto con una carreggiata: e' il fronte strada. */
  frontage: 2,
  /** Cuore dell'isolato, non raggiunto da nessuna carreggiata. */
  interior: 3,
} as const;

export type StreetRole = (typeof STREET_ROLE)[keyof typeof STREET_ROLE];

/**
 * Direzione verso cui un edificio si affaccia.
 *
 * Gli indici coincidono con `accentFace` in `buildings/generate.ts`, e non per
 * comodita': e' quel valore a decidere quale faccia porta l'accento e dove si
 * apre il portale a piano terra. Se le due enumerazioni divergessero, gli
 * ingressi guarderebbero il cuore dell'isolato invece della strada.
 */
export const FACING = {
  east: 0,
  west: 1,
  north: 2,
  south: 3,
} as const;

export type Facing = (typeof FACING)[keyof typeof FACING];

/** Isolato, identificato dagli assi che lo delimitano a ovest e a sud. */
export interface BlockId {
  readonly kx: number;
  readonly ky: number;
}

/** Riquadro di colonne, **estremi inclusi** su entrambi gli assi. */
export interface BlockRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Sale distinte per i due assi: senza, la maglia sarebbe simmetrica sulla diagonale. */
const AXIS_SALT: readonly number[] = [0x51ed2701, 0x2f9c17b3];

/** Resto sempre non negativo: gli indici di asse sono legittimamente negativi. */
function mod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

/** true se l'asse `k` e' principale. */
export function isArterial(k: number): boolean {
  return mod(k, STREETS.arterialEvery) === 0;
}

/** Larghezza della carreggiata dell'asse `k`. */
export function lineWidth(k: number): number {
  return isArterial(k) ? STREETS.arterialWidth : STREETS.minorWidth;
}

/**
 * Prima colonna della carreggiata dell'asse `k`.
 *
 * Lo scostamento e' un hash dell'indice dell'asse, non una passeggiata
 * cumulativa: cosi' la posizione dell'asse millesimo si calcola senza conoscere
 * i primi novecentonovantanove, e la maglia resta una funzione a costo
 * costante.
 */
export function lineStart(seed: number, axis: number, k: number): number {
  // Con `jitter` a zero la formula degenera da sola in `nominal`: lo span vale
  // uno, il resto e' sempre zero. Non serve un ramo per spegnere lo scostamento.
  // Lo scostamento e' un multiplo di `align`, non un voxel qualunque: `pitch` e
  // le larghezze di carreggiata lo sono gia', quindi cosi' ogni asse — e con lui
  // ogni bordo di isolato — cade sul confine di un cubo di terreno.
  const steps = Math.floor(STREETS.jitter / STREETS.align) * 2 + 1;
  const offset = (hashCoords(seed ^ AXIS_SALT[axis], k, 0) % steps) * STREETS.align;
  return k * STREETS.pitch + offset - Math.floor(STREETS.jitter / STREETS.align) * STREETS.align;
}

/** Ultima colonna della carreggiata dell'asse `k`. */
export function lineEnd(seed: number, axis: number, k: number): number {
  return lineStart(seed, axis, k) + lineWidth(k) - 1;
}

interface LineHit {
  readonly k: number;
}

/**
 * Asse la cui carreggiata copre `v`, o null se `v` cade fra due assi.
 *
 * Bastano tre candidati: con lo scostamento sotto meta' passo, l'intervallo
 * degli indici che possono coprire `v` e' largo meno di uno, quindi cade sempre
 * dentro `base - 1 .. base + 1`.
 */
function lineAt(seed: number, axis: number, v: number): LineHit | null {
  const base = Math.floor(v / STREETS.pitch);
  for (let k = base - 1; k <= base + 1; k++) {
    const start = lineStart(seed, axis, k);
    if (v >= start && v < start + lineWidth(k)) return { k };
  }
  return null;
}

/** true se la colonna sta su una carreggiata, principale o secondaria. */
export function isPavement(seed: number, x: number, y: number): boolean {
  return lineAt(seed, 0, x) !== null || lineAt(seed, 1, y) !== null;
}

/**
 * Centro della carreggiata piu' vicina a `v` su un asse.
 *
 * Serve a chi deve **posare qualcosa sulla rete** senza partire da una colonna
 * che ci sta gia' sopra — la sezione verticale dell'harness taglia qui, cosi' il
 * piano cade su una strada e mostra il fronte degli isolati invece di affettare
 * i volumi a caso. Stessa finestra a tre candidati di `lineAt`: con lo
 * scostamento sotto meta' passo, la piu' vicina non puo' stare piu' in la'.
 */
export function nearestLine(seed: number, axis: number, v: number): number {
  const base = Math.floor(v / STREETS.pitch);
  let best = v;
  let bestDistance = Infinity;
  for (let k = base - 1; k <= base + 1; k++) {
    const centre = lineStart(seed, axis, k) + lineWidth(k) * 0.5;
    const distance = Math.abs(centre - v);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = centre;
    }
  }
  return best;
}

/**
 * Ruolo di una colonna.
 *
 * Un incrocio fra un asse principale e uno secondario e' principale: la
 * carreggiata piu' importante attraversa, non si interrompe.
 */
export function streetRoleAt(seed: number, x: number, y: number): StreetRole {
  const hx = lineAt(seed, 0, x);
  const hy = lineAt(seed, 1, y);
  if (hx !== null || hy !== null) {
    const arterial = (hx !== null && isArterial(hx.k)) || (hy !== null && isArterial(hy.k));
    return arterial ? STREET_ROLE.arterial : STREET_ROLE.minor;
  }

  if (
    isPavement(seed, x + 1, y) ||
    isPavement(seed, x - 1, y) ||
    isPavement(seed, x, y + 1) ||
    isPavement(seed, x, y - 1)
  ) {
    return STREET_ROLE.frontage;
  }

  return STREET_ROLE.interior;
}

/** Indice dell'ultimo asse che sta interamente prima di `v`. */
function blockIndexAt(seed: number, axis: number, v: number): number {
  const base = Math.floor(v / STREETS.pitch) + 1;
  for (let k = base; k > base - 4; k--) {
    if (v >= lineStart(seed, axis, k) + lineWidth(k)) return k;
  }
  return base - 4;
}

/**
 * Isolato che contiene la colonna.
 *
 * Vale anche per una colonna di carreggiata, e in quel caso risponde l'isolato
 * che le sta a est o a nord. Non e' un caso da gestire: chi chiede l'isolato di
 * una strada vuole comunque un isolato su cui lavorare.
 */
export function blockAt(seed: number, x: number, y: number): BlockId {
  return {
    kx: blockIndexAt(seed, 0, x),
    ky: blockIndexAt(seed, 1, y),
  };
}

/** Riquadro edificabile dell'isolato: fra una carreggiata e la successiva. */
export function blockRect(seed: number, block: BlockId): BlockRect {
  return {
    x0: lineStart(seed, 0, block.kx) + lineWidth(block.kx),
    x1: lineStart(seed, 0, block.kx + 1) - 1,
    y0: lineStart(seed, 1, block.ky) + lineWidth(block.ky),
    y1: lineStart(seed, 1, block.ky + 1) - 1,
  };
}

/** Chiave stabile di un isolato, per gli insiemi che ne tengono traccia. */
export function blockKey(block: BlockId): string {
  return `${block.kx},${block.ky}`;
}
