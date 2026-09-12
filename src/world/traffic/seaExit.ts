import { TRAFFIC } from './config';
import { NEIGHBOURS, navigableAt, type LanePoint } from './seaLane';

/**
 * Da un ormeggio, fin dove si esce.
 *
 * **E' la domanda che mancava, e la sua assenza si vedeva a schermo.** Le rotte
 * dell'acqua sapevano gia' andare *da un punto a un altro* (`seaLane.ts`), ma
 * per due mezzi su tre il secondo punto non era dato: nessuno ha detto allo
 * yacht dov'e' il largo, e nessuno ha detto alla nave da carico dove finisce il
 * porto. Il ripiego era un sondaggio in linea retta nel verso in cui guarda
 * l'**intera struttura** — non il singolo ormeggio — e bastava una dita di molo
 * di traverso perche' finisse contro il cemento dopo tre voxel. Ne usciva la
 * barca che va avanti e indietro sul posto, che e' il difetto per cui questo
 * file esiste.
 *
 * **Puro come tutto il dominio.** Entrano un punto e un predicato che dice
 * dov'e' l'acqua, esce un punto: nessuna `TerrainMap`, nessuno stato, nessun
 * Three.js. Si prova scrivendo un porto a mano con cinque righe di stringa.
 *
 * **Cammina invece di guardare.** La ricerca e' in ampiezza sull'acqua, quindi
 * gira attorno a cio' che la ostruisce: la dita del molo, il pontile di testa,
 * il frangiflutti che il distretto costiero ha appena posato davanti al fronte.
 * E' la sola differenza con il sondaggio dritto di prima, ed e' tutta la
 * differenza: un frangiflutti costruito allo stadio tre **spegneva** la nave da
 * carico, perche' il sondaggio ci sbatteva contro e dichiarava che un largo non
 * c'era.
 */

/** Quante celle attorno all'ormeggio si cerca un punto di partenza navigabile. */
const SEED_RINGS = 4;

export interface ExitQuery {
  readonly from: LanePoint;
  /** true dove una barca puo' passare. Interrogato pigramente, mai in blocco. */
  readonly water: (x: number, y: number) => boolean;
  /**
   * Raggio massimo attorno al punto di partenza, in voxel.
   *
   * E' il guinzaglio, e insieme il costo: la griglia e' un quadrato di lato
   * `2 * reach / step`, quindi raddoppiarlo quadruplica la ricerca.
   */
  readonly reach: number;
  /** Passo della griglia. Assente vale `TRAFFIC.laneStep`. */
  readonly step?: number;
  /** Celle d'acqua da tenere fra il punto e la terra. */
  readonly clearance?: number;
  /**
   * Il verso che conta, se ce n'e' uno.
   *
   * **Senza, vince il punto piu' lontano; con, il punto piu' avanti.** Sono due
   * domande diverse e servono a due mezzi diversi. Lo yacht vuole uscire dal
   * proprio slip e girare per il bacino, e «lontano» e' esattamente cio' che
   * chiede. La nave da carico no: lei vuole *il mare*, e il punto piu' lontano
   * dentro il raggio potrebbe stare in fondo alla darsena, dietro di lei, o
   * lungo la costa — tutte acque vere e tutte nel verso sbagliato. Proiettando
   * su questo verso, quello che vince e' la bocca del porto.
   */
  readonly toward?: readonly [number, number];
  /** Tetto di celle visitate: oltre, la ricerca si ferma con cio' che ha. */
  readonly budget?: number;
}

/**
 * Il punto d'acqua navigabile piu' lontano — o piu' avanti — raggiungibile dal
 * punto di partenza, o `null` se la barca non ha dove andare.
 *
 * `null` non e' un errore: e' un ormeggio in fondo a un bacino che nessuna
 * uscita collega ancora al mare, e la risposta giusta e' una barca ferma
 * all'ormeggio. Il difetto resta visibile, che e' meglio di una barca che
 * attraversa il molo.
 */
export function seaExit(query: ExitQuery): LanePoint | null {
  const step = query.step ?? TRAFFIC.laneStep;
  const clearance = query.clearance ?? TRAFFIC.laneClearance;
  const budget = query.budget ?? TRAFFIC.laneBudget;

  const span = Math.max(1, Math.ceil(query.reach / step));
  const width = span * 2 + 1;
  const leash = query.reach * query.reach;
  const minX = query.from.x - span * step;
  const minY = query.from.y - span * step;
  const worldX = (i: number): number => minX + i * step;
  const worldY = (j: number): number => minY + j * step;

  const passes = navigableAt(query.water, step, clearance);
  const cache = new Int8Array(width * width);
  const open = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= width || j >= width) return false;
    const at = j * width + i;
    if (cache[at] !== 0) return cache[at] === 1;
    const ok = passes(worldX(i), worldY(j));
    cache[at] = ok ? 1 : -1;
    return ok;
  };

  const start = seed(span, width, open);
  if (start === -1) return null;

  const seen = new Uint8Array(width * width);
  const queue = new Int32Array(width * width);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  let visited = 0;

  let best = -1;
  let bestScore = 0;

  while (head < tail) {
    const at = queue[head++];
    if (++visited > budget) break;

    const i = at % width;
    const j = (at - i) / width;
    const dx = worldX(i) - query.from.x;
    const dy = worldY(j) - query.from.y;
    // **Il guinzaglio e' un cerchio, la griglia un quadrato**, e la differenza
    // e' il quaranta per cento sulla diagonale: senza questo taglio un raggio
    // da dieci voxel darebbe un capo lontano a quattordici, cioe' una barca
    // che esce dal proprio specchio dall'angolo. Si **attraversa** oltre il
    // cerchio — girare attorno a un molo lo richiede — ma non ci si ferma.
    const span2 = dx * dx + dy * dy;
    if (span2 <= leash) {
      // **Il pareggio lo vince chi e' arrivato prima**, ed e' la sola cosa che
      // tenga la risposta stabile: la visita in ampiezza ha un ordine fisso, il
      // punteggio no, e con un `>=` due partite identiche darebbero due rotte
      // diverse su uno specchio simmetrico.
      const score = query.toward === undefined
        ? span2
        : dx * query.toward[0] + dy * query.toward[1];
      if (score > bestScore) {
        bestScore = score;
        best = at;
      }
    }

    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= width || nj >= width) continue;
      const next = nj * width + ni;
      if (seen[next] === 1 || !open(ni, nj)) continue;
      // Una diagonale non taglia mai uno spigolo di terra: senza questo
      // controllo la ricerca sbucherebbe fuori dal bacino passando fra due
      // colonne di banchina che si toccano, e la rotta la seguirebbe.
      if (di !== 0 && dj !== 0 && (!open(i + di, j) || !open(i, j + dj))) continue;
      seen[next] = 1;
      queue[tail++] = next;
    }
  }

  if (best === -1) return null;
  const i = best % width;
  return { x: worldX(i), y: worldY((best - i) / width) };
}

/**
 * La cella navigabile da cui partire, cercata ad anelli attorno al centro.
 *
 * Il centro **e'** l'ormeggio, che sta sull'acqua per costruzione — chi chiama
 * ha gia' scartato gli ormeggi finiti all'asciutto. L'anello serve al caso in
 * cui il franco richiesto non ci stia proprio li': una nave da carico ormeggiata
 * a ridosso della banchina non ha quattro voxel d'acqua a sinistra, e cercarli
 * sulla sua stessa colonna la lascerebbe senza rotta.
 */
function seed(span: number, width: number, open: (i: number, j: number) => boolean): number {
  for (let ring = 0; ring <= SEED_RINGS; ring++) {
    for (let dj = -ring; dj <= ring; dj++) {
      for (let di = -ring; di <= ring; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const i = span + di;
        const j = span + dj;
        if (i < 0 || j < 0 || i >= width || j >= width) continue;
        if (open(i, j)) return j * width + i;
      }
    }
  }
  return -1;
}
