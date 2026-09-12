import { ROADS, ROAD_RANK, type RoadRank } from './config';
import { roadRegions, type RoadRegions } from './regions';
import { traceRoad, type RoadProbe, type TraceBounds, type TraceStep } from './trace';

/**
 * La rete: quali strade esistono, e quale di loro e' l'arteria.
 *
 * **Un albero cresciuto dal centro, non una maglia.** Si parte dal polo piu'
 * forte della terraferma — il posto dove le torri finiranno per stare — e ogni
 * altro polo si attacca alla **prima carreggiata che incontra**, non al polo piu'
 * vicino. Sono due cose diverse e la differenza si vede: attaccarsi a un polo
 * darebbe raggi che si incrociano senza toccarsi, attaccarsi alla rete da' un
 * raccordo che confluisce, e da li' in poi le due strade sono la stessa strada.
 *
 * **«Della terraferma» e non «in assoluto», e non e' una sfumatura.** La radice
 * e' l'unico polo che non si attacca a niente: tutti gli altri raggiungono lei,
 * o non hanno strada. Presa dove capita — il polo piu' forte puo' stare su uno
 * scoglio — la rete serve lo scoglio e abbandona la citta'. Misurato su un
 * salvataggio maturo: un avanzamento di stadio che spostava la radice portava le
 * colonne asfaltate da 2946 a 1189 e i poli collegati da 33 a 14, cioe' la
 * citta' perdeva tre quinti delle proprie strade mentre cresceva. La regione che
 * contiene piu' poli e' la citta'; la radice sta li', e ci resta.
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
  /**
   * Serve solo a ordinare, e nient'altro la legge.
   *
   * Decide chi sopravvive a una fusione fra poli vicini e in che ordine i rami si
   * attaccano; la radice e' il primo di quest'ordine **fra i poli della regione
   * piu' popolata**, non il primo in assoluto. E' per questo che
   * `RoadNetwork.update` non la mette nella propria firma: cambiarla senza
   * cambiare l'ordine non cambia una strada.
   */
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
 * Gli stessi poli con la radice in testa: il primo dell'ordine fra quelli della
 * regione che ne contiene di piu'.
 *
 * **Non riordina il resto, e conta.** L'ordine di `normalisePoles` decide in che
 * sequenza i rami si attaccano, e cambiarlo cambia il disegno di tutta la rete:
 * qui si sposta un polo solo, davanti, perche' la radice e' l'unica posizione che
 * abbia un effetto oltre al proprio ramo.
 *
 * **Quante teste e non quanto grande.** La regione piu' estesa e' spesso la
 * stessa, ma non e' cio' che conta: una penisola deserta puo' essere larga il
 * doppio del centro. I poli *sono* la citta' — un catalizzatore e' una cosa che il
 * giocatore ha piantato — e la rete deve servire loro.
 *
 * Un polo senza regione — una colonna in cui non si entra — vale zero e non
 * diventa radice se c'e' di meglio: sarebbe una radice che nessuno puo'
 * raggiungere, cioe' una citta' senza strade.
 */
function fromCentre(kept: readonly RoadPole[], regions: RoadRegions): readonly RoadPole[] {
  const crowd = new Map<number, number>();
  for (const pole of kept) {
    const region = regions.labelAt(pole.x, pole.y);
    if (region < 0) continue;
    crowd.set(region, (crowd.get(region) ?? 0) + 1);
  }

  let at = 0;
  let best = -1;
  for (let i = 0; i < kept.length; i++) {
    // Il confronto e' stretto: a pari popolazione vince il primo, cioe' il piu'
    // forte. E' cio' che rende la radice una funzione dei soli poli e terreno, e
    // non dell'ordine in cui la simulazione li ha consegnati.
    const here = crowd.get(regions.labelAt(kept[i].x, kept[i].y)) ?? 0;
    if (here > best) {
      best = here;
      at = i;
    }
  }

  if (at === 0) return kept;
  return [kept[at], ...kept.slice(0, at), ...kept.slice(at + 1)];
}

/**
 * Traccia la rete e ne misura la gerarchia.
 *
 * Il costo e' `poli` ricerche sul riquadro, e non `poli^2`: ogni polo si attacca
 * alla rete intera con un arrivo diffuso invece di confrontarsi con ognuno degli
 * altri. E' la stessa mossa di Prim con una coda sola, e su una ventina di poli
 * e' la differenza fra una ricerca e duecento.
 *
 * **Ma sono i poli *collegabili*, e la differenza e' tutta li'.** Un arrivo
 * diffuso non ha un capo noto, quindi la ricerca non ha un'euristica: quando il
 * cammino esiste la coda si chiude in fretta attorno alla prima carreggiata, e
 * quando non esiste esaurisce la regione intera prima di dirlo. `regions.ts`
 * etichetta il riquadro una volta e quelle ricerche non partono affatto — vedi
 * il commento dentro al ciclo.
 */
export function planRoads(
  poles: readonly RoadPole[],
  probe: RoadProbe,
  bounds: TraceBounds,
): RoadPlan {
  const kept = normalisePoles(poles);
  if (kept.length === 0) return EMPTY_PLAN;

  const regions = roadRegions(bounds, probe);
  const nodes = fromCentre(kept, regions);

  // Le colonne gia' in rete costano `flatCost`: e' cio' che fa confluire i rami
  // invece di lasciarli correre paralleli, e non e' un caso a parte nella
  // ricerca ma un costo come un altro.
  const onNet = new Map<string, TraceStep>();
  const parent = new Map<string, string | null>();
  const load = new Map<string, number>();

  // **La stessa domanda, decine di milioni di volte.** «Questa colonna e' gia'
  // in rete?» arriva una volta per ogni passo verso ognuno degli otto vicini di
  // ogni colonna visitata da ognuna delle ricerche, e chiederla alla mappa vuol
  // dire costruire una stringa — e poi buttarla — ogni volta: nel profilo di una
  // ricostruzione erano tre secondi e mezzo di solo involucro, piu' il tempo di
  // raccogliere le stringhe. La maschera risponde con una lettura di array. La
  // mappa resta perche' `parent` e `resolved` vogliono il passo e non un si/no,
  // e quelle domande sono poche migliaia.
  const width = bounds.x1 - bounds.x0 + 1;
  const height = bounds.y1 - bounds.y0 + 1;
  const net = new Uint8Array(width > 0 && height > 0 ? width * height : 0);

  /** L'indice nella maschera, o -1 per una colonna fuori dal riquadro. */
  const slot = (x: number, y: number): number => {
    const lx = x - bounds.x0;
    const ly = y - bounds.y0;
    if (lx < 0 || ly < 0 || lx >= width || ly >= height) return -1;
    return ly * width + lx;
  };

  const onNetAt = (x: number, y: number): boolean => {
    const at = slot(x, y);
    // Fuori dal riquadro la maschera non ha una casella, e la domanda torna alla
    // mappa invece di rispondere «no». Tracciando non capita — ogni passo sta nel
    // riquadro per costruzione — ma una risposta sbagliata qui sarebbe un ramo
    // che non confluisce, e un ramo in meno non somiglia a un difetto.
    return at === -1 ? onNet.has(keyOf(x, y)) : net[at] === 1;
  };

  const join = (key: string, step: TraceStep): void => {
    onNet.set(key, step);
    const at = slot(step.x, step.y);
    if (at !== -1) net[at] = 1;
  };

  const netProbe: RoadProbe = {
    levelAt: probe.levelAt,
    costAt: (x, y) => (onNetAt(x, y) ? ROADS.flatCost : probe.costAt(x, y)),
  };

  const root = nodes[0];
  const rootKey = keyOf(root.x, root.y);
  const rootRegion = regions.labelAt(root.x, root.y);
  join(rootKey, { x: root.x, y: root.y, level: probe.levelAt(root.x, root.y) });
  parent.set(rootKey, null);

  const connected: RoadPole[] = [root];
  const orphans: RoadPole[] = [];
  const terminals: string[] = [rootKey];
  const routes: (readonly TraceStep[])[] = [];

  for (let i = 1; i < nodes.length; i++) {
    const pole = nodes[i];

    // **Un polo di un'altra regione e' orfano senza cercare, e si sa prima.**
    // Ogni colonna di carreggiata sta nella regione della radice — un ramo e'
    // fatto di colonne in cui la ricerca e' entrata — quindi di qui non c'e'
    // niente da raggiungere, e non ce ne sara' nemmeno quando l'albero sara'
    // cresciuto. Senza questo controllo la ricerca lo scopre da sola, ma solo
    // dopo aver esaurito la regione intera: e' la scansione da 244 mila colonne
    // che bloccava il frame, moltiplicata per il numero di poli su un'altra
    // costa. Il `>= 0` dei due lati lascia cercare chi non ha regione: una
    // colonna in cui non si entra non ne ha una, ma puo' essere il capo di
    // partenza di un cammino che esce.
    const region = regions.labelAt(pole.x, pole.y);
    if (region >= 0 && rootRegion >= 0 && region !== rootRegion) {
      orphans.push(pole);
      continue;
    }

    const trace = traceRoad({
      fromX: pole.x,
      fromY: pole.y,
      toAny: onNetAt,
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
      if (!onNetAt(step.x, step.y)) join(key, step);
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
