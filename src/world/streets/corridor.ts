import { STREETS } from './config';
import type { BlockId } from './streetGrid';

/**
 * Il raccordo fra un isolato e la rete che esiste gia'.
 *
 * **Perche' serve.** La maglia di `streetGrid.ts` copre il piano intero, ma a
 * schermo esiste solo dove qualcuno l'ha dipinta, e chi la dipinge lo fa per il
 * proprio isolato e basta. Due isolati contigui si trovano collegati senza che
 * nessuno se ne occupi — condividono la carreggiata che li separa — mentre un
 * isolato nato lontano da tutto resta un rettangolo d'asfalto in mezzo al prato:
 * il porto sulla costa, il quartiere che la crescita ha scavalcato. Alla domanda
 * «da qui a li' come ci si arriva» non rispondeva niente.
 *
 * **Sceglie linee, non le inventa.** Il percorso cammina sugli incroci della
 * maglia, e ogni tratto corre su un asse che il seed dichiara gia': il raccordo
 * decide *quali* linee mostrare, non dove passano. E' cio' che gli permette di
 * esistere senza toccare l'invariante — la geometria della rete resta una
 * funzione pura di `(seed, x, y)`, e cio' che e' stato dipinto resta uno stato di
 * chi dipinge, esattamente com'era.
 *
 * **Il terreno entra come costo e non come divieto**, che e' la stessa scelta di
 * `accepts` in `lots.ts`: qui dentro non c'e' ne' `TerrainMap` ne' mondo, quindi
 * la regola si verifica in Node scrivendo a mano quanto costa un tratto. Ed e'
 * anche cio' che fa curvare il percorso. Una L fra due punti separati da una
 * darsena finirebbe per meta' sull'acqua; una ricerca a costo minimo gira attorno
 * alla baia e ci arriva da terra, che e' l'unica differenza fra una strada e una
 * riga tirata su una mappa.
 *
 * **Perche' una ricerca e non due candidate a L.** Le L fra due isolati sono
 * otto, si valutano in niente, e su terreno libero danno la stessa risposta di
 * qui. Falliscono tutte insieme pero' proprio nel caso che questo modulo esiste
 * per risolvere — un ostacolo in mezzo — perche' nessuna delle otto ha il grado
 * di liberta' per scansarlo. Il reticolo di incroci fra i due capi conta poche
 * centinaia di nodi e la ricerca gira una manciata di volte per partita: e' il
 * posto sbagliato dove risparmiare.
 */

/** Lungo quale asse corre un tratto: 0 in x, 1 in y. */
export type Axis = 0 | 1;

/**
 * Un tratto di raccordo: una corsa lungo una sola linea della maglia.
 *
 * `line` e' l'indice della linea che **porta** il tratto, nella famiglia
 * ortogonale ad `along`; `from` e `to` sono gli indici estremi delle linee
 * **attraversate**, sempre ordinati. Un tratto orizzontale corre quindi sulla
 * linea `line` della famiglia y e copre le linee `from..to` della famiglia x —
 * incroci di testa e di coda compresi, che e' cio' che lo salda al tratto
 * successivo senza un caso a parte per gli angoli.
 */
export interface CorridorLeg {
  readonly along: Axis;
  readonly line: number;
  readonly from: number;
  readonly to: number;
}

export interface CorridorRequest {
  /** Isolato che va attaccato: e' quello appena nato. */
  readonly from: BlockId;
  /** Isolato gia' sulla rete a cui attaccarlo. */
  readonly to: BlockId;
  /**
   * Costo di un tratto **unitario**, cioe' di un solo passo fra due incroci.
   *
   * `Infinity` significa che di li' non si passa affatto, e il percorso lo
   * scansa. Ogni altro valore e' una preferenza: chi lo fornisce decide se una
   * colonna che non si puo' dipingere valga il doppio o il quadruplo di una che
   * si puo', e questo modulo non ha un'opinione in merito.
   */
  readonly costOf: (leg: CorridorLeg) => number;
}

/** I quattro incroci che delimitano un isolato. */
const CORNER_OFFSETS: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** I quattro passi fra incroci adiacenti. L'ordine fissa le parita' della ricerca. */
const STEPS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Percorso minimo fra i due isolati, o null se non ce n'e' uno.
 *
 * Parte da **tutti e quattro** gli incroci dell'isolato di partenza e arriva al
 * primo dei quattro dell'altro: un isolato non ha un ingresso, ha un perimetro, e
 * costringere il percorso a nascere da un angolo scelto a priori gli farebbe
 * girare l'isolato attorno prima di incamminarsi.
 *
 * Torna null anche quando i due isolati **si toccano gia'**, perche' allora i due
 * insiemi di incroci si intersecano e il percorso e' lungo zero passi. Non e' un
 * fallimento: e' la risposta giusta, e chi chiama non ha niente da costruire.
 */
export function planCorridor(request: CorridorRequest): readonly CorridorLeg[] | null {
  const { from, to } = request;
  const margin = STREETS.linkMargin;
  const kx0 = Math.min(from.kx, to.kx) - margin;
  const kx1 = Math.max(from.kx, to.kx) + 1 + margin;
  const ky0 = Math.min(from.ky, to.ky) - margin;
  const ky1 = Math.max(from.ky, to.ky) + 1 + margin;

  const width = kx1 - kx0 + 1;
  const height = ky1 - ky0 + 1;
  const nodes = width * height;

  const dist = new Float64Array(nodes).fill(Number.POSITIVE_INFINITY);
  const came = new Int32Array(nodes).fill(-1);
  const settled = new Uint8Array(nodes);
  const at = (kx: number, ky: number): number => (ky - ky0) * width + (kx - kx0);

  for (const [dx, dy] of CORNER_OFFSETS) dist[at(from.kx + dx, from.ky + dy)] = 0;

  const goals = new Set<number>();
  for (const [dx, dy] of CORNER_OFFSETS) goals.add(at(to.kx + dx, to.ky + dy));

  // Estrazione del minimo a scansione lineare invece che con una coda a
  // priorita': il reticolo ha poche centinaia di nodi e la ricerca gira quando
  // nasce un insediamento staccato, cioe' una manciata di volte per partita. Una
  // heap qui sarebbe codice in piu' per un costo che non si misura.
  let reached = -1;
  for (;;) {
    let best = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < nodes; i++) {
      // Confronto stretto: a parita' di distanza vince l'indice piu' basso, ed e'
      // quello che rende il percorso indipendente dall'ordine di visita.
      if (settled[i] === 0 && dist[i] < bestDist) {
        bestDist = dist[i];
        best = i;
      }
    }
    if (best < 0) break;
    settled[best] = 1;
    if (goals.has(best)) {
      reached = best;
      break;
    }

    const kx = kx0 + (best % width);
    const ky = ky0 + Math.floor(best / width);
    for (const [dx, dy] of STEPS) {
      const nx = kx + dx;
      const ny = ky + dy;
      if (nx < kx0 || nx > kx1 || ny < ky0 || ny > ky1) continue;
      const next = at(nx, ny);
      if (settled[next] === 1) continue;

      const step = request.costOf(stepLeg(kx, ky, dx, dy));
      if (!Number.isFinite(step)) continue;
      const total = bestDist + step;
      if (total < dist[next]) {
        dist[next] = total;
        came[next] = best;
      }
    }
  }

  if (reached < 0) return null;

  const path: number[] = [];
  for (let node = reached; node >= 0; node = came[node]) path.push(node);
  path.reverse();
  if (path.length < 2) return null;

  const legs: CorridorLeg[] = [];
  for (let i = 1; i < path.length; i++) {
    const ax = kx0 + (path[i - 1] % width);
    const ay = ky0 + Math.floor(path[i - 1] / width);
    const bx = kx0 + (path[i] % width);
    const by = ky0 + Math.floor(path[i] / width);
    legs.push(stepLeg(ax, ay, bx - ax, by - ay));
  }
  return mergeLegs(legs);
}

/**
 * L'isolato collegato piu' vicino, o null se nessuno e' a portata.
 *
 * Distanza di Manhattan sugli indici e non euclidea, perche' e' quella che il
 * percorso paga davvero: si cammina lungo gli assi, e due isolati in diagonale
 * distano la somma dei due scarti. A parita' vince l'indice minore — prima `kx`,
 * poi `ky` — per la stessa ragione per cui `edgeOrder` in `lots.ts` ordina i
 * fronti: senza un ordine totale la scelta dipenderebbe da quale isolato e' stato
 * dipinto per primo, che e' esattamente il tipo di dipendenza nascosta che rompe
 * il determinismo.
 */
export function nearestBlock(from: BlockId, candidates: Iterable<BlockId>): BlockId | null {
  let best: BlockId | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.kx === from.kx && candidate.ky === from.ky) continue;
    const distance = Math.abs(candidate.kx - from.kx) + Math.abs(candidate.ky - from.ky);
    if (distance > STREETS.linkReach) continue;
    if (distance > bestDistance) continue;
    if (distance === bestDistance && best !== null &&
      (candidate.kx > best.kx || (candidate.kx === best.kx && candidate.ky >= best.ky))) {
      continue;
    }
    bestDistance = distance;
    best = candidate;
  }

  return best;
}

/**
 * Gli otto isolati che confinano con questo, angoli compresi.
 *
 * **Gli angoli contano davvero**, e non e' una comodita': l'anello di un isolato
 * copre le due carreggiate che lo delimitano per tutta la sua estensione, quindi
 * due isolati in diagonale condividono l'incrocio che li separa. Sono collegati
 * come lo sono due isolati affiancati, e chiedere un raccordo fra loro
 * ridipingerebbe una strada che c'e' gia'.
 */
export function blockNeighbours(block: BlockId): readonly BlockId[] {
  const out: BlockId[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      out.push({ kx: block.kx + dx, ky: block.ky + dy });
    }
  }
  return out;
}

/** Il tratto unitario che porta dall'incrocio `(kx, ky)` al vicino in `(dx, dy)`. */
function stepLeg(kx: number, ky: number, dx: number, dy: number): CorridorLeg {
  if (dx !== 0) {
    const start = dx > 0 ? kx : kx + dx;
    return { along: 0, line: ky, from: start, to: start + 1 };
  }
  const start = dy > 0 ? ky : ky + dy;
  return { along: 1, line: kx, from: start, to: start + 1 };
}

/**
 * Fonde i passi consecutivi che corrono sulla stessa linea.
 *
 * Serve a chi dipinge, non alla ricerca: un rettilineo di sei passi e' una strada
 * sola, e tenerlo spezzato costringerebbe a ricalcolare sei volte la rampa che lo
 * porta in quota — una per tratto, ognuna cieca rispetto alle altre, con un
 * gradino a ogni giunzione.
 */
function mergeLegs(legs: readonly CorridorLeg[]): readonly CorridorLeg[] {
  const out: CorridorLeg[] = [];
  for (const leg of legs) {
    const last = out[out.length - 1];
    if (last !== undefined && last.along === leg.along && last.line === leg.line) {
      out[out.length - 1] = {
        along: last.along,
        line: last.line,
        from: Math.min(last.from, leg.from),
        to: Math.max(last.to, leg.to),
      };
      continue;
    }
    out.push(leg);
  }
  return out;
}
