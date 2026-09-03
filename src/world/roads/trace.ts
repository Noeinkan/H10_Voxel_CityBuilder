import { ROADS } from './config';

/**
 * Il percorso di una strada fra due punti: cammino a costo minimo sul terreno.
 *
 * **Puro, e senza mondo.** Entrano due punti e una sonda, esce una spezzata di
 * colonne. E' la stessa scelta di `lots.ts` e di `corridor.ts`: il terreno entra
 * come *costo*, quindi la regola si verifica in Node scrivendo a mano quanto
 * costa una collina, e non serve far crescere un'isola per sapere se la strada
 * la gira attorno.
 *
 * **La differenza con `streets/corridor.ts`, che e' tutta la differenza.**
 * Quello cammina sugli incroci della maglia e *sceglie linee, non le inventa*:
 * ogni suo tratto corre su un asse che il seed dichiara gia', ed e' per questo
 * che produce percorsi a L su un reticolo quadrato. Qui i nodi sono le colonne
 * del piano e i passi sono otto, quindi la spezzata puo' andare in qualunque
 * direzione e la sua forma la decide il rilievo. E' la stessa struttura dati con
 * un grafo diverso sotto, e il grafo e' il punto.
 *
 * **Da dove viene la forma organica.** Non da un rumore e non da una curva di
 * Bezier: da `risePerVoxel`. Salire costa otto volte una colonna piana e oltre
 * `maxRise` non si sale affatto, quindi il cammino minimo fra due punti separati
 * da un pendio **non** e' la retta: e' la diagonale che taglia il pendio al
 * minimo dislivello, cioe' una curva di livello, e dove il pendio e' troppo
 * ripido per essere tagliato in un colpo diventa un tornante. Le strade che ne
 * escono somigliano a quelle vere per la stessa ragione per cui quelle vere sono
 * fatte cosi': costava meno.
 */

/** Cosa il tracciato ha bisogno di sapere di una colonna. */
export interface RoadProbe {
  /**
   * Quota del piano su cui la carreggiata si appoggerebbe.
   *
   * Sull'acqua e' il pelo e non il fondale: un viadotto e' piano, e misurare la
   * salita dal fondo di una baia farebbe rifiutare ogni ponte per pendenza.
   */
  readonly levelAt: (x: number, y: number) => number;
  /**
   * Costo di stare in questa colonna, senza il termine di dislivello.
   *
   * `Infinity` significa che di li' non si passa affatto — fuori dal mondo
   * generato, o acqua fonda oltre la portata di una campata. Ogni altro valore
   * e' una preferenza, ed e' il chiamante a decidere quanto valga una parete
   * rispetto a un prato.
   */
  readonly costAt: (x: number, y: number) => number;
}

export interface TraceRequest {
  readonly fromX: number;
  readonly fromY: number;
  /**
   * Il capo di arrivo, quando e' un punto solo.
   *
   * Datelo quando lo sapete: con un capo noto la ricerca ha un'euristica e va a
   * colpo sicuro; senza, degenera in un Dijkstra che si allarga in tutte le
   * direzioni. La differenza su un'isola da 512 e' fra qualche migliaio di celle
   * visitate e qualche centinaio di migliaia.
   */
  readonly to?: { readonly x: number; readonly y: number };
  /**
   * Arrivo diffuso: si ferma alla prima colonna che risponde true.
   *
   * E' il modo in cui un ramo si attacca **alla rete** invece che a un punto
   * della rete. Chiedere il polo piu' vicino e poi tracciare fin li' darebbe una
   * strada che ignora tutto cio' che ha attraversato per arrivarci; chiedere «la
   * prima carreggiata che incontri» da' il raccordo vero, che e' quasi sempre
   * perpendicolare al tratto piu' vicino.
   */
  readonly toAny?: (x: number, y: number) => boolean;
  /**
   * Riquadro entro cui cercare, estremi inclusi.
   *
   * Non e' un dettaglio di prestazione ma parte della regola: senza, un percorso
   * bloccato farebbe una passeggiata sull'intero piano prima di rinunciare. Il
   * margine oltre i due capi e' il gioco che la strada ha per scansare un
   * ostacolo, e chi lo stringe sta dicendo «da qui non uscire».
   */
  readonly bounds: TraceBounds;
  readonly probe: RoadProbe;
}

export interface TraceBounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Una colonna del percorso, con la quota a cui la carreggiata ci arriva. */
export interface TraceStep {
  readonly x: number;
  readonly y: number;
  readonly level: number;
}

export interface Trace {
  readonly steps: readonly TraceStep[];
  /** Costo totale del cammino: e' cio' che l'albero della rete confronta. */
  readonly cost: number;
}

/** Il riquadro che contiene i due capi, allargato di `margin` colonne. */
export function boundsAround(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  margin: number,
): TraceBounds {
  return {
    x0: Math.min(fromX, toX) - margin,
    y0: Math.min(fromY, toY) - margin,
    x1: Math.max(fromX, toX) + margin,
    y1: Math.max(fromY, toY) + margin,
  };
}

/** L'unione di due riquadri: il campo di ricerca di un ramo che ne tocca due. */
export function unionBounds(a: TraceBounds, b: TraceBounds): TraceBounds {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * Cammino a costo minimo fra i due capi, o null se non ce n'e' uno.
 *
 * A* con euristica di Chebyshev pesata su `flatCost`: e' ammissibile perche'
 * nessun passo costa meno di quello — `costAt` non scende sotto `flatCost` per
 * contratto del chiamante — quindi il cammino trovato e' davvero il minimo e non
 * solo un cammino buono. Serve: il rango di un tratto si decide confrontando
 * lunghezze, e con un'euristica ottimistica sbagliata due tratti vicini
 * riceverebbero ranghi diversi per un artefatto della ricerca.
 */
export function traceRoad(request: TraceRequest): Trace | null {
  const { bounds, probe } = request;
  const width = bounds.x1 - bounds.x0 + 1;
  const height = bounds.y1 - bounds.y0 + 1;
  if (width <= 0 || height <= 0) return null;

  const startX = request.fromX - bounds.x0;
  const startY = request.fromY - bounds.y0;
  if (outside(startX, startY, width, height)) return null;

  const goalX = request.to === undefined ? -1 : request.to.x - bounds.x0;
  const goalY = request.to === undefined ? -1 : request.to.y - bounds.y0;
  if (request.to !== undefined && outside(goalX, goalY, width, height)) return null;
  const goal = request.to === undefined ? -1 : goalY * width + goalX;
  const reached = request.toAny;
  if (goal === -1 && reached === undefined) return null;

  const cells = width * height;
  const best = new Float64Array(cells).fill(Number.POSITIVE_INFINITY);
  const from = new Int32Array(cells).fill(-1);
  const done = new Uint8Array(cells);

  const start = startY * width + startX;
  best[start] = 0;

  const open = new Heap(cells);
  // Senza un capo noto l'euristica vale zero e A* degenera in Dijkstra, che e'
  // esattamente cio' che serve a un arrivo diffuso: non c'e' una direzione da
  // preferire finche' non si e' trovata la rete.
  open.push(start, goal === -1 ? 0 : heuristic(startX, startY, goalX, goalY));

  while (open.size > 0) {
    const current = open.pop();
    if (done[current] === 1) continue;
    if (current === goal) return unwind(from, best, current, bounds, width, probe);
    if (reached !== undefined && current !== start &&
      reached(bounds.x0 + (current % width), bounds.y0 + ((current / width) | 0))) {
      return unwind(from, best, current, bounds, width, probe);
    }
    done[current] = 1;

    const cx = current % width;
    const cy = (current / width) | 0;
    const level = probe.levelAt(bounds.x0 + cx, bounds.y0 + cy);

    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (outside(nx, ny, width, height)) continue;
      const next = ny * width + nx;
      if (done[next] === 1) continue;

      const wx = bounds.x0 + nx;
      const wy = bounds.y0 + ny;
      const ground = probe.costAt(wx, wy);
      if (!(ground < Number.POSITIVE_INFINITY)) continue;

      // **Il dislivello e' un costo del passo, non della colonna**, e per questo
      // non puo' stare dentro `costAt`: la stessa collina e' gratis a percorrerla
      // in piano lungo il fianco e cara a salirci dritto, e una sonda per colonna
      // non saprebbe distinguere i due casi.
      const rise = Math.abs(probe.levelAt(wx, wy) - level);
      if (rise > ROADS.maxRise) continue;

      const step = ground + rise * ROADS.risePerVoxel;
      const candidate = best[current] + step;
      if (candidate >= best[next]) continue;

      best[next] = candidate;
      from[next] = current;
      open.push(next, goal === -1 ? candidate : candidate + heuristic(nx, ny, goalX, goalY));
    }
  }

  return null;
}

function outside(x: number, y: number, width: number, height: number): boolean {
  return x < 0 || y < 0 || x >= width || y >= height;
}

function heuristic(x: number, y: number, goalX: number, goalY: number): number {
  return Math.max(Math.abs(goalX - x), Math.abs(goalY - y)) * ROADS.flatCost;
}

function unwind(
  from: Int32Array,
  best: Float64Array,
  goal: number,
  bounds: TraceBounds,
  width: number,
  probe: RoadProbe,
): Trace {
  const steps: TraceStep[] = [];
  for (let at = goal; at !== -1; at = from[at]) {
    const x = bounds.x0 + (at % width);
    const y = bounds.y0 + ((at / width) | 0);
    steps.push({ x, y, level: probe.levelAt(x, y) });
  }
  steps.reverse();
  return { steps, cost: best[goal] };
}

/**
 * Coda a priorita' binaria sugli indici di cella.
 *
 * Non e' la coda a secchielli di `sim/reach.ts`, e la ragione e' il dominio: li'
 * i costi sono sedicesimi di cella e il massimo e' il raggio, qui un passo puo'
 * costare venti volte un altro e la lunghezza del tronco non ha un tetto noto.
 * Con secchielli si allocherebbe un array proporzionale al costo peggiore
 * immaginabile invece che al numero di nodi aperti.
 */
class Heap {
  private items: Int32Array;
  private keys: Float64Array;
  private count = 0;

  constructor(capacity: number) {
    // Un nodo puo' rientrare in coda con una chiave migliore prima di essere
    // chiuso, quindi la capacita' e' sul numero di inserimenti e non di celle.
    // Nella pratica sono meno di due per cella; il raddoppio qui sotto copre il
    // resto senza che la stima debba essere giusta.
    this.items = new Int32Array(Math.max(16, capacity));
    this.keys = new Float64Array(this.items.length);
  }

  get size(): number {
    return this.count;
  }

  push(item: number, key: number): void {
    if (this.count === this.items.length) this.grow();
    let at = this.count++;
    this.items[at] = item;
    this.keys[at] = key;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (this.keys[parent] <= this.keys[at]) break;
      this.swap(at, parent);
      at = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    this.count--;
    if (this.count > 0) {
      this.items[0] = this.items[this.count];
      this.keys[0] = this.keys[this.count];
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let small = at;
        if (left < this.count && this.keys[left] < this.keys[small]) small = left;
        if (right < this.count && this.keys[right] < this.keys[small]) small = right;
        if (small === at) break;
        this.swap(at, small);
        at = small;
      }
    }
    return top;
  }

  private grow(): void {
    const items = new Int32Array(this.items.length * 2);
    const keys = new Float64Array(items.length);
    items.set(this.items);
    keys.set(this.keys);
    this.items = items;
    this.keys = keys;
  }

  private swap(a: number, b: number): void {
    const item = this.items[a];
    const key = this.keys[a];
    this.items[a] = this.items[b];
    this.keys[a] = this.keys[b];
    this.items[b] = item;
    this.keys[b] = key;
  }
}
