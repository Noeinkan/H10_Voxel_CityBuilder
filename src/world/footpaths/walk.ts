import { FOOTPATHS } from './config';

/**
 * Il percorso di un sentiero: cammino a costo minimo fra le case.
 *
 * **Puro, e senza mondo.** Entrano un capo, un criterio di arrivo e una sonda;
 * esce una spezzata di colonne. E' la stessa scelta di `roads/trace.ts` e di
 * `streets/corridor.ts`: il luogo entra come *costo*, quindi la regola si
 * verifica in Node scrivendo a mano dove stanno i muri, e non serve far crescere
 * una citta' per sapere se il vicolo ci passa in mezzo.
 *
 * **Perche' non e' `traceRoad`, che gia' esiste.** Quella ricerca e' tarata su
 * una carreggiata e ne porta dentro tre numeri che qui sarebbero sbagliati:
 * `maxRise` a un cubo di terreno — cioe' un sentiero che non sale mai una
 * scala —, `risePerVoxel` a otto — cioe' che gira sempre attorno al gradino — e
 * nessuna nozione di muro accanto. Il progetto ha gia' quattro ricerche distinte
 * (`trace.ts`, `corridor.ts`, `traffic/seaLane.ts`, `sim/reach.ts`) e le tiene
 * separate per la stessa ragione: e' la stessa struttura dati con un grafo
 * diverso sotto, e il grafo e' il punto.
 *
 * **L'arrivo e' sempre diffuso**, e da qui segue che non c'e' euristica: un
 * sentiero non va in un punto, va «alla prima cosa lastricata che incontra». E'
 * Dijkstra e non A\*, ed e' corretto che lo sia — con un capo ignoto non c'e'
 * nessuna direzione da preferire. Costa poco lo stesso perche' il riquadro e'
 * quello di `FOOTPATHS.reach`, cioe' qualche centinaio di colonne.
 */

/** Cosa il sentiero ha bisogno di sapere di una colonna. */
export interface FootpathProbe {
  /** Quota del piano calpestabile: il terreno, che un sentiero non solleva mai. */
  readonly levelAt: (x: number, y: number) => number;
  /**
   * Costo di stare in questa colonna, senza il termine di dislivello.
   *
   * `Infinity` significa che di li' non si passa: suolo occupato, acqua, parete,
   * o mondo non ancora generato. Ogni altro valore e' una preferenza, ed e' il
   * chiamante a decidere quanto valga un muro accanto rispetto al prato aperto.
   */
  readonly costAt: (x: number, y: number) => number;
}

/** Riquadro entro cui cercare, estremi inclusi. */
export interface WalkBounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface WalkRequest {
  readonly fromX: number;
  readonly fromY: number;
  /**
   * Arrivo diffuso: ci si ferma alla prima colonna che risponde true.
   *
   * E' il suolo pubblico — carreggiata o sentiero gia' posato — ed e' cio' che fa
   * di questa rete una rete: un vicolo che incontri un vicolo si innesta li'
   * invece di correre parallelo fino alla strada.
   */
  readonly toAny: (x: number, y: number) => boolean;
  readonly bounds: WalkBounds;
  readonly probe: FootpathProbe;
}

/** Una colonna del percorso, con la quota a cui il lastricato ci arriva. */
export interface FootpathStep {
  readonly x: number;
  readonly y: number;
  readonly level: number;
}

export interface FootpathWalk {
  readonly steps: readonly FootpathStep[];
  readonly cost: number;
}

/**
 * Gli otto passi del sentiero.
 *
 * Otto e non quattro perche' un vicolo che possa andare solo in croce disegna
 * scalinate a gradoni in mezzo al prato: la diagonale e' cio' che gli permette
 * di seguire lo spigolo di una casa invece di girarci attorno a squadra.
 */
export const WALK_STEPS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Il riquadro attorno a un capo, allargato di `margin` colonne. */
export function walkBounds(x: number, y: number, margin: number): WalkBounds {
  return { x0: x - margin, y0: y - margin, x1: x + margin, y1: y + margin };
}

/**
 * Cammino a costo minimo dal capo al primo suolo pubblico, o null se non ce n'e'.
 *
 * Torna anche il cammino lungo un passo solo — il capo era gia' pubblico — ed e'
 * il chiamante a decidere che farne: e' `FOOTPATHS.minCells` a dire quando un
 * lastricato e' troppo corto per valere la pena, e quella e' una soglia di forma
 * urbana, non di ricerca.
 */
export function walkFootpath(request: WalkRequest): FootpathWalk | null {
  const { bounds, probe } = request;
  const width = bounds.x1 - bounds.x0 + 1;
  const height = bounds.y1 - bounds.y0 + 1;
  if (width <= 0 || height <= 0) return null;

  const startX = request.fromX - bounds.x0;
  const startY = request.fromY - bounds.y0;
  if (outside(startX, startY, width, height)) return null;

  const cells = width * height;
  const best = new Float64Array(cells).fill(Number.POSITIVE_INFINITY);
  const from = new Int32Array(cells).fill(-1);
  const done = new Uint8Array(cells);

  const start = startY * width + startX;
  best[start] = 0;

  const open = new Heap(cells);
  open.push(start, 0);

  while (open.size > 0) {
    const current = open.pop();
    if (done[current] === 1) continue;
    done[current] = 1;

    const cx = current % width;
    const cy = (current / width) | 0;
    const wx = bounds.x0 + cx;
    const wy = bounds.y0 + cy;

    // Il capo non conta come arrivo: un portone che dia gia' sulla strada
    // restituirebbe un cammino lungo zero, e chi chiama non saprebbe
    // distinguerlo da un sentiero vero di una colonna.
    if (current !== start && request.toAny(wx, wy)) {
      return unwind(from, best, current, bounds, width, probe);
    }

    const level = probe.levelAt(wx, wy);

    for (const [dx, dy] of WALK_STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (outside(nx, ny, width, height)) continue;
      const next = ny * width + nx;
      if (done[next] === 1) continue;

      const tx = bounds.x0 + nx;
      const ty = bounds.y0 + ny;
      const ground = probe.costAt(tx, ty);
      if (!(ground < Number.POSITIVE_INFINITY)) continue;

      const diagonal = dx !== 0 && dy !== 0;
      // **Una diagonale fra due spigoli non e' un passaggio.** Dove due case si
      // toccano d'angolo, le due colonne in asse sono entrambe piene e il varco
      // in diagonale esiste solo nella griglia: a schermo il lastricato
      // attraverserebbe il punto in cui i due muri si incontrano. Con un solo
      // lato pieno invece si sfiora uno spigolo, che e' come cammina chiunque.
      if (diagonal && blocked(probe, wx + dx, wy) && blocked(probe, wx, wy + dy)) continue;

      // **Il dislivello e' un costo del passo, non della colonna**: lo stesso
      // pendio e' gratis a percorrerlo lungo il fianco e caro a salirci dritto,
      // e una sonda per colonna non saprebbe distinguere i due casi.
      const rise = Math.abs(probe.levelAt(tx, ty) - level);
      if (rise > FOOTPATHS.maxStep) continue;

      const step = ground * (diagonal ? FOOTPATHS.diagonalCost : 1)
        + rise * FOOTPATHS.risePerVoxel;
      const candidate = best[current] + step;
      if (candidate >= best[next]) continue;

      best[next] = candidate;
      from[next] = current;
      open.push(next, candidate);
    }
  }

  return null;
}

function outside(x: number, y: number, width: number, height: number): boolean {
  return x < 0 || y < 0 || x >= width || y >= height;
}

function blocked(probe: FootpathProbe, x: number, y: number): boolean {
  return !(probe.costAt(x, y) < Number.POSITIVE_INFINITY);
}

function unwind(
  from: Int32Array,
  best: Float64Array,
  goal: number,
  bounds: WalkBounds,
  width: number,
  probe: FootpathProbe,
): FootpathWalk {
  const steps: FootpathStep[] = [];
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
 * Gemella di quella di `roads/trace.ts` e tenuta qui invece che condivisa: e'
 * privata anche li', e un modulo comune per trentacinque righe legherebbe due
 * domini che il progetto tiene separati di proposito. Non cresce mai, perche' il
 * numero di inserimenti ha un tetto vero — una cella rientra in coda al piu' una
 * volta per arco entrante, cioe' otto, piu' il capo di partenza.
 */
class Heap {
  private readonly items: Int32Array;
  private readonly keys: Float64Array;
  private count = 0;

  constructor(cells: number) {
    const room = Math.max(16, cells * WALK_STEPS.length + 1);
    this.items = new Int32Array(room);
    this.keys = new Float64Array(room);
  }

  get size(): number {
    return this.count;
  }

  push(item: number, key: number): void {
    // Irraggiungibile per il conto qui sopra, e tenuto lo stesso: un array
    // tipizzato ignora in silenzio una scrittura fuori bordo, quindi senza
    // guardia un tetto sbagliato non darebbe un errore ma un cammino storto.
    if (this.count === this.items.length) return;
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

  private swap(a: number, b: number): void {
    const item = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = item;
    const key = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = key;
  }
}
