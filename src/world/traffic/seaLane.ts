import { TRAFFIC } from './config';

/**
 * La rotta che una barca segue fra due punti, aggirando la terra.
 *
 * **Puro.** Entrano due punti e un predicato che dice dov'e' l'acqua, esce una
 * spezzata: niente `TerrainMap`, niente mondo, nessuno stato. E' cio' che
 * permette di verificare una rotta in un test scrivendo un'isola a mano con
 * cinque righe di stringa, invece di generarne una.
 *
 * **Perche' non basta la retta.** I due capi di una linea stanno sulla costa per
 * definizione — glielo impone il vincolo di sito del ruolo — e due punti di costa
 * a meno di un centinaio di voxel l'uno dall'altro hanno quasi sempre un pezzo di
 * isola in mezzo: e' proprio la forma che rende utile un traghetto. Una barca che
 * attraversasse in linea retta passerebbe *dentro* la collina, cioe' l'unico modo
 * di rendere il collegamento meno credibile di quanto fosse senza barca.
 */

export interface LanePoint {
  readonly x: number;
  readonly y: number;
}

export interface LaneQuery {
  readonly from: LanePoint;
  readonly to: LanePoint;
  /** true dove una barca puo' passare. Interrogato pigramente, mai in blocco. */
  readonly water: (x: number, y: number) => boolean;
  /** Passo della griglia di ricerca. Assente vale `TRAFFIC.laneStep`. */
  readonly step?: number;
  /** Quanto la griglia sborda oltre il rettangolo dei due capi. */
  readonly margin?: number;
  /** Celle d'acqua da tenere fra la rotta e la terra. */
  readonly clearance?: number;
  /** Tetto di celle visitate: oltre, la ricerca rinuncia invece di insistere. */
  readonly budget?: number;
}

/** Quante celle attorno alla proiezione si cerca un ormeggio navigabile. */
const SNAP_RINGS = 4;

/** I vicini, in ordine fisso: la ricerca deve dare la stessa rotta a ogni partita. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * La spezzata da `from` a `to` che resta sull'acqua, o null se non ce n'e' una.
 *
 * I due estremi restituiti sono quelli chiesti e non le celle di griglia: un
 * ormeggio sta dove sta il molo, e arrotondarlo al passo della ricerca farebbe
 * fermare la barca qualche voxel dentro la banchina.
 */
export function planSeaLane(query: LaneQuery): readonly LanePoint[] | null {
  const step = query.step ?? TRAFFIC.laneStep;
  const margin = query.margin ?? TRAFFIC.laneMargin;
  const clearance = query.clearance ?? TRAFFIC.laneClearance;
  const budget = query.budget ?? TRAFFIC.laneBudget;

  const minX = Math.min(query.from.x, query.to.x) - margin;
  const minY = Math.min(query.from.y, query.to.y) - margin;
  const width = Math.ceil((Math.max(query.from.x, query.to.x) + margin - minX) / step) + 1;
  const height = Math.ceil((Math.max(query.from.y, query.to.y) + margin - minY) / step) + 1;
  if (width <= 0 || height <= 0) return null;

  const worldX = (i: number): number => minX + i * step;
  const worldY = (j: number): number => minY + j * step;

  /**
   * Navigabilita' di una cella, con memoria.
   *
   * Il franco si misura sui quattro assi e non sul quadrato, per la stessa
   * ragione di `seesWater` in `sites/`: e' la stessa domanda a un ottavo del
   * costo, e una secca raggiungibile solo in diagonale e' comunque una secca da
   * cui conviene stare alla larga.
   */
  const cache = new Int8Array(width * height);
  const open = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= width || j >= height) return false;
    const at = j * width + i;
    if (cache[at] !== 0) return cache[at] === 1;

    let ok = query.water(worldX(i), worldY(j));
    for (let d = 1; ok && d <= clearance; d++) {
      ok = query.water(worldX(i) + d * step, worldY(j)) &&
        query.water(worldX(i) - d * step, worldY(j)) &&
        query.water(worldX(i), worldY(j) + d * step) &&
        query.water(worldX(i), worldY(j) - d * step);
    }
    cache[at] = ok ? 1 : -1;
    return ok;
  };

  const start = snap(query.from, minX, minY, step, width, height, open);
  const goal = snap(query.to, minX, minY, step, width, height, open);
  if (start === -1 || goal === -1) return null;
  if (start === goal) return [query.from, query.to];

  const cameFrom = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  cameFrom[start] = start;
  let visited = 0;

  while (head < tail) {
    const at = queue[head++];
    if (at === goal) break;
    if (++visited > budget) return null;

    const i = at % width;
    const j = (at - i) / width;
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= width || nj >= height) continue;
      const next = nj * width + ni;
      if (cameFrom[next] !== -1 || !open(ni, nj)) continue;
      // Una diagonale non taglia mai uno spigolo di terra: senza questo
      // controllo la rotta passerebbe fra due colonne di costa che si toccano.
      if (di !== 0 && dj !== 0 && (!open(i + di, j) || !open(i, j + dj))) continue;
      cameFrom[next] = at;
      queue[tail++] = next;
    }
  }

  if (cameFrom[goal] === -1) return null;

  const cells: number[] = [];
  for (let at = goal; at !== start; at = cameFrom[at]) cells.push(at);
  cells.push(start);
  cells.reverse();

  const path: LanePoint[] = cells.map((at) => {
    const i = at % width;
    return { x: worldX(i), y: worldY((at - i) / width) };
  });
  path[0] = query.from;
  path[path.length - 1] = query.to;
  return simplify(path, step, query.water, clearance);
}

/**
 * La cella navigabile piu' vicina a un punto, o -1 se non ce n'e' nessuna.
 *
 * Un imbarco sta **sulla** banchina, cioe' sulla terra: la sua cella di griglia
 * non e' quasi mai acqua, e cercare la rotta da li' fallirebbe sempre. Gli anelli
 * crescenti trovano il primo specchio libero davanti al molo, che e' esattamente
 * il punto da cui una barca parte.
 */
function snap(
  point: LanePoint,
  minX: number,
  minY: number,
  step: number,
  width: number,
  height: number,
  open: (i: number, j: number) => boolean,
): number {
  const ci = Math.round((point.x - minX) / step);
  const cj = Math.round((point.y - minY) / step);
  for (let ring = 0; ring <= SNAP_RINGS; ring++) {
    for (let dj = -ring; dj <= ring; dj++) {
      for (let di = -ring; di <= ring; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= width || j >= height) continue;
        if (open(i, j)) return j * width + i;
      }
    }
  }
  return -1;
}

/**
 * Toglie i punti che la rotta puo' saltare andando dritta.
 *
 * Una rotta di griglia e' fatta di scalini a quarantacinque gradi, e una barca
 * che li seguisse zigzagherebbe per tutta la traversata. Il tiro di corda —
 * tieni un punto, avanza finche' la retta resta in acqua, poi fissa l'ultimo che
 * ci arriva — la riporta a due o tre bracci di mare, che e' come si naviga.
 */
function simplify(
  path: readonly LanePoint[],
  step: number,
  water: (x: number, y: number) => boolean,
  clearance: number,
): readonly LanePoint[] {
  const out: LanePoint[] = [path[0]];
  let anchor = 0;

  while (anchor < path.length - 1) {
    let best = anchor + 1;
    for (let candidate = path.length - 1; candidate > anchor + 1; candidate--) {
      if (clear(path[anchor], path[candidate], step, water, clearance)) {
        best = candidate;
        break;
      }
    }
    out.push(path[best]);
    anchor = best;
  }
  return out;
}

/** true se il segmento resta in acqua, campionato a mezzo passo di griglia. */
function clear(
  a: LanePoint,
  b: LanePoint,
  step: number,
  water: (x: number, y: number) => boolean,
  clearance: number,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const samples = Math.ceil((Math.abs(dx) + Math.abs(dy)) / (step / 2));
  const side = clearance * step;

  for (let s = 1; s < samples; s++) {
    const x = a.x + (dx * s) / samples;
    const y = a.y + (dy * s) / samples;
    if (!water(x, y)) return false;
    if (side > 0 && !(water(x + side, y) && water(x - side, y) &&
      water(x, y + side) && water(x, y - side))) {
      return false;
    }
  }
  return true;
}
