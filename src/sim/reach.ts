/**
 * Portata di un catalizzatore: fin dove arriva la sua influenza, e con che peso.
 *
 * E' l'unico posto del progetto in cui vive la curva di decadimento. Prima
 * stava riscritta in tre file — il campo di desiderabilita', il profilo urbano
 * dei distretti e la gerarchia dello skyline — e i commenti di due di quei tre
 * dichiaravano gia' di temere il disallineamento: se la heatmap, i distretti e
 * l'altezza degli edifici non dicono «vicino al polo» nello stesso modo, il
 * centro della citta' cade in tre punti diversi.
 *
 * **La distanza e' geodetica, non in linea retta.** L'influenza si propaga
 * sulle celle percorribili: l'acqua la ferma, un dirupo la rallenta, una strada
 * la porta piu' lontano. Su un'isola fatta di terrazze e canali la distanza
 * euclidea era l'unica cosa che la citta' sapesse misurare, e prometteva
 * influenza dall'altra parte di un braccio di mare.
 *
 * **Con costo uniforme la geodetica e' esattamente la vecchia distanza di
 * Chebyshev.** Un passo diagonale copre 1 su entrambi gli assi allo stesso
 * prezzo, quindi il minimo numero di passi verso `(dx, dy)` e'
 * `max(|dx|, |dy|)`. Non e' un dettaglio implementativo: e' cio' che rende
 * questo modulo una generalizzazione stretta invece di una sostituzione, e cio'
 * che tiene verdi senza modifiche i test scritti sulla forma di prima.
 *
 * **Il costo di un passo non scende mai sotto 1**, e da qui viene l'invariante
 * che regge il campo: la distanza geodetica e' sempre almeno quella di
 * Chebyshev, quindi il supporto della forma non esce mai dal quadrato
 * `rectAround(x, y, radius)`. Il prefiltro e il perimetro di ricalcolo di
 * `DesirabilityField` restano quelli di prima, e con loro l'equivalenza fra
 * percorso incrementale e ricostruzione totale. Una strada non costa quindi
 * *meno* di 1: a costare di piu' e' tutto il resto, e la strada vince in
 * termini relativi.
 */

/** Sottomultipli di cella su cui si quantizzano i costi. */
const COST_SCALE = 16;

/**
 * Peso dell'influenza a distanza relativa `t`, con `t` in 0..1.
 *
 * Lineare, e a `t = 1` vale esattamente 0: a distanza pari al raggio un
 * catalizzatore non si sente piu'. Il clamp copre i chiamanti che interrogano
 * oltre il raggio invece di fermarsi prima — `poleReach` lo fa — dove prima
 * usciva un numero negativo che poi perdeva il confronto con lo zero.
 */
export function falloff(t: number): number {
  return t >= 1 ? 0 : 1 - t;
}

/**
 * Costo di *entrare* nella cella, in celle. Deve valere almeno 1.
 *
 * `Infinity` significa invalicabile. Il costo entra come funzione e non come
 * `TerrainMap` per la stessa ragione per cui `SkylineQuery` prende un
 * `waterDistance` invece del mondo: qui il dominio resta puro, e a leggere il
 * terreno e' chi ce l'ha gia' in mano.
 */
export type StepCost = (x: number, y: number) => number;

/** Il costo che riproduce esattamente la distanza di Chebyshev di prima. */
export const UNIFORM_COST: StepCost = () => 1;

export interface ReachField {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  /**
   * Distanza geodetica per cella del quadrato, `Infinity` dove non si arriva.
   *
   * Sono distanze e non pesi gia' divisi, ed e' voluto: `Float32` rappresenta
   * esattamente i sedicesimi, quindi con costo uniforme la distanza resta
   * l'intero esatto e la divisione `d / radius` avviene in doppia precisione
   * nel ciclo per cella, come faceva la formula di prima. Memorizzare il peso
   * gia' diviso introdurrebbe un arrotondamento a 32 bit sotto ogni valore del
   * campo.
   */
  readonly dist: Float32Array;
}

/** Quel tanto di un catalizzatore che basta a farne un polo. */
export interface ReachSource {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Un polo con la sua portata gia' agganciata.
 *
 * E' la forma che `src/world/skyline/` chiama `Pole`, e la corrispondenza e'
 * strutturale di proposito: quel dominio dichiara di non voler conoscere il
 * catalogo della simulazione, e questo modulo non ha ragione di conoscere lo
 * skyline.
 */
export interface ReachPole extends ReachSource {
  readonly reachAt: (x: number, y: number) => number;
}

/** Lato del quadrato di un raggio, estremi inclusi. */
function sideOf(radius: number): number {
  return radius * 2 + 1;
}

/**
 * Distanza geodetica dal centro alla cella, `Infinity` fuori dal quadrato o
 * dove il costo non la raggiunge entro il raggio.
 */
export function distAt(field: ReachField, x: number, y: number): number {
  const lx = x - field.cx + field.radius;
  const ly = y - field.cy + field.radius;
  const side = sideOf(field.radius);
  if (lx < 0 || ly < 0 || lx >= side || ly >= side) return Infinity;
  return field.dist[ly * side + lx];
}

/** Peso dell'influenza nella cella, 0..1. Zero da `radius` in poi. */
export function reachAt(field: ReachField, x: number, y: number): number {
  const d = distAt(field, x, y);
  if (d >= field.radius) return 0;
  return falloff(d / field.radius);
}

// I secchielli sopravvivono alle chiamate: `computeReach` gira anche a ogni
// spostamento del cursore, e rialloccare un migliaio di array per movimento
// sarebbe la spesa principale della funzione.
let buckets: number[][] = [];

function ensureBuckets(count: number): number[][] {
  while (buckets.length < count) buckets.push([]);
  for (let i = 0; i < count; i++) buckets[i].length = 0;
  return buckets;
}

/**
 * Dijkstra a 8 vicini dal centro, tagliato al raggio.
 *
 * I costi sono quantizzati in sedicesimi di cella, quindi le distanze interne
 * sono interi e la coda e' a secchielli invece che a priorita': si evita il
 * fattore logaritmico, e con costo uniforme le distanze restano gli interi
 * esatti che la formula di prima calcolava a mano.
 *
 * Le celle da `radius` in poi restano `Infinity` invece di ricevere la loro
 * distanza vera: il loro peso sarebbe comunque zero, e potarle e' cio' che
 * rende il costo proporzionale alla forma invece che al quadrato che la
 * contiene.
 *
 * La propagazione si ferma al quadrato, e non perde niente di raggiungibile:
 * uscirne costa almeno `radius + 1` passi, e rientrare altrettanti. Un giro
 * largo attorno a un ostacolo e' quindi gia' fuori budget prima di cominciare.
 */
export function computeReach(
  cx: number,
  cy: number,
  radius: number,
  cost: StepCost,
): ReachField {
  const side = sideOf(radius);
  const cells = side * side;
  const dist = new Float32Array(cells).fill(Infinity);
  if (radius <= 0) return { cx, cy, radius, dist };

  const maxDist = radius * COST_SCALE;
  const scaled = new Int32Array(cells).fill(maxDist);
  const queue = ensureBuckets(maxDist);

  const centre = radius * side + radius;
  // Il centro vale zero comunque sia fatto il terreno sotto: e' l'invariante
  // per cui la desiderabilita' al centro vale esattamente `strength`.
  scaled[centre] = 0;
  queue[0].push(centre);

  for (let d = 0; d < maxDist; d++) {
    const bucket = queue[d];
    for (let entry = 0; entry < bucket.length; entry++) {
      const i = bucket[entry];
      // Voce stantia: la cella e' gia' stata raggiunta meglio da un altro lato.
      if (scaled[i] !== d) continue;

      const lx = i % side;
      const ly = (i / side) | 0;

      for (let oy = -1; oy <= 1; oy++) {
        const nly = ly + oy;
        if (nly < 0 || nly >= side) continue;
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nlx = lx + ox;
          if (nlx < 0 || nlx >= side) continue;

          const raw = cost(cx - radius + nlx, cy - radius + nly);
          if (!(raw < Infinity)) continue;
          // Il pavimento a 1 e' l'invariante del modulo, non una cortesia al
          // chiamante: sotto, la forma uscirebbe dal quadrato che il campo
          // ricalcola.
          const step = Math.max(COST_SCALE, Math.round(raw * COST_SCALE));

          const nd = d + step;
          if (nd >= maxDist) continue;
          const ni = nly * side + nlx;
          if (nd >= scaled[ni]) continue;
          scaled[ni] = nd;
          queue[nd].push(ni);
        }
      }
    }
  }

  for (let i = 0; i < cells; i++) {
    if (scaled[i] < maxDist) dist[i] = scaled[i] / COST_SCALE;
  }
  return { cx, cy, radius, dist };
}

/**
 * Portate gia' calcolate, per centro e raggio.
 *
 * E' un indice derivato come il campo di desiderabilita': si ricostruisce per
 * intero da catalizzatori e costo, e per questo non entra nella
 * serializzazione. La chiave e' `(x, y, radius)` e non l'identita'
 * dell'oggetto, perche' ogni transizione di stato ricrea i catalizzatori — e
 * perche' due catalizzatori sovrapposti hanno davvero la stessa portata.
 */
export class ReachCache {
  private readonly map = new Map<string, ReachField>();

  // Memo dei poli, sull'identita' della lista. Vedi `polesOf`.
  private poleSource: readonly ReachSource[] | null = null;
  private poleCache: readonly ReachPole[] = [];

  constructor(readonly cost: StepCost = UNIFORM_COST) {}

  get size(): number {
    return this.map.size;
  }

  /**
   * Gli stessi catalizzatori visti come poli, con la portata gia' agganciata.
   *
   * E' cio' che fa misurare a `src/world/skyline/` la stessa distanza del
   * campo: senza, l'altezza degli edifici continuerebbe a decidersi in linea
   * retta mentre la desiderabilita' gira attorno ai dirupi, e il centro della
   * citta' cadrebbe in due punti diversi.
   *
   * **Memoizzato sull'identita' della lista**, e non e' un ottimismo: la
   * gerarchia interroga i poli per colonna, e costruire N chiusure a ogni
   * colonna sarebbe una regressione nel percorso caldo del Builder. La lista
   * dei catalizzatori e' un array nuovo solo quando qualcosa e' cambiato
   * davvero, che e' esattamente quando il memo deve scadere.
   */
  polesOf(sources: readonly ReachSource[]): readonly ReachPole[] {
    if (sources === this.poleSource) return this.poleCache;

    const poles = sources.map((source) => {
      // Il campo si risolve **una volta qui**, non a ogni interrogazione: la
      // chiusura se lo porta dietro, e non ripaga una ricerca per chiave.
      const field = this.get(source.x, source.y, source.radius);
      return {
        x: source.x,
        y: source.y,
        radius: source.radius,
        reachAt: (x: number, y: number) => reachAt(field, x, y),
      };
    });

    this.poleSource = sources;
    this.poleCache = poles;
    return poles;
  }

  get(cx: number, cy: number, radius: number): ReachField {
    const key = `${cx},${cy},${radius}`;
    const found = this.map.get(key);
    if (found !== undefined) return found;
    const field = computeReach(cx, cy, radius, this.cost);
    this.map.set(key, field);
    return field;
  }

  invalidate(cx: number, cy: number, radius: number): void {
    this.map.delete(`${cx},${cy},${radius}`);
    // I poli tengono il campo per riferimento: sopravvivere a un invalidate
    // significherebbe rispondere con una portata che non e' piu' quella.
    this.poleSource = null;
  }

  /** Da chiamare quando il costo cambia sotto: terreno nuovo, isola allargata. */
  clear(): void {
    this.map.clear();
    this.poleSource = null;
  }
}
