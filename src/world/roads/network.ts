import { ROADS, ROAD_RANK, type RoadRank } from './config';
import { traceRoad, type RoadProbe, type TraceBounds, type TraceStep } from './trace';

/**
 * La rete: quali strade esistono, e quale di loro e' l'arteria.
 *
 * **Un albero cresciuto dal centro, non una maglia.** Si parte dal polo piu'
 * forte — il posto dove le torri finiranno per stare — e ogni altro polo si
 * attacca alla **prima carreggiata che incontra**, non al polo piu' vicino. Sono
 * due cose diverse e la differenza si vede: attaccarsi a un polo darebbe raggi
 * che si incrociano senza toccarsi, attaccarsi alla rete da' un raccordo che
 * confluisce, e da li' in poi le due strade sono la stessa strada.
 *
 * **Il rango non si dichiara, si misura.** Ogni tratto porta il proprio carico —
 * quanti poli ci passano sopra per arrivare al centro — e la larghezza esce da
 * li'. Non c'e' nessuna tabella che dica «questa e' l'autostrada»: e'
 * l'autostrada perche' ci passa tutta la citta', e se il giocatore pianta il
 * prossimo catalizzatore dall'altra parte dell'isola l'autostrada si sposta da
 * sola. E' anche il motivo per cui le strade *portano al centro*: non perche'
 * qualcuno le punti li', ma perche' il centro e' la radice dell'albero e ogni
 * cammino ci finisce.
 *
 * **Puro.** Entrano poli, sonda e riquadro; esce la spezzata. Nessun mondo,
 * nessun voxel, nessuno stato: chi la tiene e' `RoadNetwork`, che sa anche
 * quando buttarla.
 */

/** Un polo della rete: un catalizzatore visto da qui. */
export interface RoadPole {
  readonly x: number;
  readonly y: number;
  /** Serve solo a ordinare: il piu' forte diventa la radice, cioe' il centro. */
  readonly strength: number;
}

/** Una colonna della linea d'asse di un tratto. */
export interface RoadNode extends TraceStep {
  readonly rank: RoadRank;
  /** Quanti poli passano di qui per arrivare al centro. */
  readonly load: number;
}

export interface RoadPlan {
  /** Le colonne dell'asse, senza larghezza: la larghezza la da' `stroke.ts`. */
  readonly nodes: readonly RoadNode[];
  /**
   * Gli stessi nodi **in ordine di percorso**, un elenco per ramo.
   *
   * `nodes` e' ordinato per coordinate perche' la posa a budget dev'essere
   * riproducibile; ma un viadotto e' un tratto *consecutivo* di colonne che non
   * toccano terra, e per riconoscerlo serve sapere in che ordine si cammina. Non
   * e' una seconda copia dei dati: sono gli stessi oggetti, in due indici.
   */
  readonly paths: readonly (readonly RoadNode[])[];
  /** I poli davvero collegati, nell'ordine in cui sono entrati. */
  readonly connected: readonly RoadPole[];
  /** I poli che la sonda non ha saputo raggiungere: un'altra isola, o un lago. */
  readonly orphans: readonly RoadPole[];
}

export const EMPTY_PLAN: RoadPlan = { nodes: [], paths: [], connected: [], orphans: [] };

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * I poli ridotti a quelli che meritano un nodo, in ordine deterministico.
 *
 * Due catalizzatori a meno di `mergeDistance` sono lo stesso posto: la strada
 * fra loro sarebbe piu' corta del proprio raccordo e a schermo sarebbe un
 * moncone. Si tiene il piu' forte, che e' anche quello che il giocatore ha
 * pagato di piu'.
 *
 * L'ordine e' per intensita' decrescente e poi per coordinate: senza un ordine
 * totale la stessa partita darebbe reti diverse a seconda di come la lista dei
 * catalizzatori e' stata costruita.
 */
export function normalisePoles(poles: readonly RoadPole[]): readonly RoadPole[] {
  const sorted = [...poles].sort((a, b) =>
    b.strength - a.strength || a.x - b.x || a.y - b.y);

  const kept: RoadPole[] = [];
  for (const pole of sorted) {
    if (kept.length >= ROADS.maxPoles) break;
    const near = kept.some((other) =>
      Math.max(Math.abs(other.x - pole.x), Math.abs(other.y - pole.y)) < ROADS.mergeDistance);
    if (!near) kept.push(pole);
  }
  return kept;
}

/**
 * Traccia la rete e ne misura la gerarchia.
 *
 * Il costo e' `poli` ricerche sul riquadro, e non `poli^2`: ogni polo si attacca
 * alla rete intera con un arrivo diffuso invece di confrontarsi con ognuno degli
 * altri. E' la stessa mossa di Prim con una coda sola, e su una ventina di poli
 * e' la differenza fra una ricerca e duecento.
 */
export function planRoads(
  poles: readonly RoadPole[],
  probe: RoadProbe,
  bounds: TraceBounds,
): RoadPlan {
  const nodes = normalisePoles(poles);
  if (nodes.length === 0) return EMPTY_PLAN;

  // Le colonne gia' in rete costano `flatCost`: e' cio' che fa confluire i rami
  // invece di lasciarli correre paralleli, e non e' un caso a parte nella
  // ricerca ma un costo come un altro.
  const onNet = new Map<string, TraceStep>();
  const parent = new Map<string, string | null>();
  const load = new Map<string, number>();

  const netProbe: RoadProbe = {
    levelAt: probe.levelAt,
    costAt: (x, y) => (onNet.has(keyOf(x, y)) ? ROADS.flatCost : probe.costAt(x, y)),
  };

  const root = nodes[0];
  const rootKey = keyOf(root.x, root.y);
  onNet.set(rootKey, { x: root.x, y: root.y, level: probe.levelAt(root.x, root.y) });
  parent.set(rootKey, null);

  const connected: RoadPole[] = [root];
  const orphans: RoadPole[] = [];
  const terminals: string[] = [rootKey];
  const routes: (readonly TraceStep[])[] = [];

  for (let i = 1; i < nodes.length; i++) {
    const pole = nodes[i];
    const trace = traceRoad({
      fromX: pole.x,
      fromY: pole.y,
      toAny: (x, y) => onNet.has(keyOf(x, y)),
      bounds,
      probe: netProbe,
    });
    if (trace === null) {
      orphans.push(pole);
      continue;
    }
    routes.push(trace.steps);

    // I passi vanno dal polo alla rete, quindi il padre di ognuno e' il
    // successivo: l'ultimo e' gia' in rete e il suo padre esiste da prima.
    for (let s = 0; s < trace.steps.length; s++) {
      const step = trace.steps[s];
      const key = keyOf(step.x, step.y);
      if (!onNet.has(key)) onNet.set(key, step);
      if (parent.has(key)) continue;
      const next = trace.steps[s + 1];
      parent.set(key, next === undefined ? rootKey : keyOf(next.x, next.y));
    }

    connected.push(pole);
    terminals.push(keyOf(pole.x, pole.y));
  }

  // Il carico: ogni polo incrementa tutto cio' che attraversa per arrivare alla
  // radice. La radice e' l'unica senza padre, ed e' la condizione d'arresto.
  for (const terminal of terminals) {
    let at: string | null | undefined = terminal;
    const seen = new Set<string>();
    while (at !== null && at !== undefined && !seen.has(at)) {
      seen.add(at);
      load.set(at, (load.get(at) ?? 0) + 1);
      at = parent.get(at);
    }
  }

  let peak = 1;
  for (const value of load.values()) if (value > peak) peak = value;

  const resolved = new Map<string, RoadNode>();
  for (const [key, step] of onNet) {
    const carried = load.get(key) ?? 1;
    resolved.set(key, { ...step, load: carried, rank: rankOf(carried / peak) });
  }

  const out = [...resolved.values()];
  // Ordine totale sulle colonne: la posa a budget deve essere la stessa a ogni
  // ricostruzione, e l'iterazione di una `Map` segue l'ordine di inserimento,
  // che dipende da quale polo e' stato piazzato prima.
  out.sort((a, b) => a.x - b.x || a.y - b.y);

  const paths = routes.map((route) => {
    const walk: RoadNode[] = [];
    for (const step of route) {
      const node = resolved.get(keyOf(step.x, step.y));
      if (node !== undefined) walk.push(node);
    }
    return walk;
  });

  return { nodes: out, paths, connected, orphans };
}

/** Il rango che compete a un carico, in frazione del massimo della rete. */
export function rankOf(share: number): RoadRank {
  if (share >= ROADS.trunkShare) return ROAD_RANK.trunk;
  if (share >= ROADS.avenueShare) return ROAD_RANK.avenue;
  if (share >= ROADS.streetShare) return ROAD_RANK.street;
  return ROAD_RANK.lane;
}
