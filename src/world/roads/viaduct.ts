import { ROADS, type RoadRank } from './config';
import type { RoadNode } from './network';

/**
 * Dove la strada lascia il suolo.
 *
 * **Un viadotto non si progetta: si riconosce.** Il tracciato di `network.ts` non
 * sa niente di quote e passa dove costa meno, quindi attraversa una baia o un
 * quartiere fitto quando aggirarli costerebbe di piu'. Qui si guarda quel
 * percorso e si chiede, colonna per colonna, «questa regge una carreggiata
 * appoggiata?». Le corse di risposte negative abbastanza lunghe diventano
 * struttura; le altre restano un problema di rampa, e le risolve `grading/` come
 * ha sempre fatto.
 *
 * **La soglia esiste perche' il difetto opposto e' peggiore.** Un viadotto da due
 * campate sopra una battigia legge come un errore di posa — un pezzo di strada
 * che si stacca da terra per niente — mentre una carreggiata dipinta su tre
 * colonne d'acqua legge come dei sassi in mezzo al mare. `viaductMinRun` separa
 * i due casi, ed e' lo stesso ragionamento di `linkMinPaved` in
 * `streets/config.ts`.
 *
 * **L'impalcato e' piano.** Non segue il fondale ne' i tetti sotto: prende la
 * quota piu' alta che deve scavalcare, ci somma il franco, e resta li' da una
 * spalla all'altra. E' cio' che lo fa leggere come una struttura invece che come
 * un nastro che ondeggia, ed e' anche il motivo per cui la pendenza in ingresso
 * la assorbono le due spalle e non il ponte.
 */

/** Cosa il viadotto ha bisogno di sapere di una colonna. */
export interface ViaductProbe {
  /** true se qui la carreggiata puo' appoggiarsi al terreno. */
  readonly carries: (x: number, y: number) => boolean;
  /**
   * Quota sopra la quale l'impalcato deve passare.
   *
   * E' il pelo dell'acqua su una baia e il tetto piu' alto sopra il costruito:
   * chi la fornisce ha in mano mondo e registry, e questo modulo non li vuole.
   */
  readonly clearanceAt: (x: number, y: number) => number;
}

/** Una colonna di viadotto: impalcato, e se serve la pila che lo regge. */
export interface ViaductColumn {
  readonly x: number;
  readonly y: number;
  /** Quota del piano calpestabile. Costante su tutta la campata. */
  readonly level: number;
  readonly rank: RoadRank;
  /** true se qui scende una pila fino a terra. */
  readonly pier: boolean;
}

/** Una campata riconosciuta, dalla spalla di partenza a quella d'arrivo. */
export interface ViaductRun {
  readonly columns: readonly ViaductColumn[];
  readonly rank: RoadRank;
  readonly level: number;
}

/**
 * Le campate di un ramo, dalla sua linea d'asse.
 *
 * Le spalle — il nodo a terra prima e dopo la corsa — entrano nella campata:
 * senza, l'impalcato finirebbe a mezz'aria a una colonna dalla riva, e il salto
 * fra la quota del ponte e quella della strada resterebbe scoperto.
 */
export function planViaducts(
  path: readonly RoadNode[],
  probe: ViaductProbe,
): readonly ViaductRun[] {
  const runs: ViaductRun[] = [];

  let start = -1;
  for (let i = 0; i <= path.length; i++) {
    const airborne = i < path.length && !probe.carries(path[i].x, path[i].y);
    if (airborne) {
      if (start === -1) start = i;
      continue;
    }
    if (start === -1) continue;

    const length = i - start;
    if (length >= ROADS.viaductMinRun) {
      const run = buildRun(path, start, i, probe);
      if (run !== null) runs.push(run);
    }
    start = -1;
  }

  return runs;
}

/**
 * Una campata fra `from` e `to` esclusi, con le due spalle attorno.
 *
 * Torna null quando manca una spalla: una corsa che comincia o finisce fuori dal
 * ramo e' un ponte verso il nulla, e il tracciato non ha niente da appoggiarci
 * dall'altra parte.
 */
function buildRun(
  path: readonly RoadNode[],
  from: number,
  to: number,
  probe: ViaductProbe,
): ViaductRun | null {
  const head = from - 1;
  const tail = to;
  if (head < 0 || tail >= path.length) return null;

  let rank = path[head].rank;
  for (let i = from; i < to; i++) {
    if (path[i].rank > rank) rank = path[i].rank;
  }

  // **Il franco si misura sotto tutto l'impalcato, non sotto la sua linea
  // d'asse.** La campata verra' allargata a `rankWidth[rank]` da `stroke.ts`, e
  // le colonne di bordo scavalcano roba che l'asse non tocca: misurando solo in
  // mezzo, un ponte che passa di fianco a uno scoglio finiva con quattro voxel
  // di franco invece di sei — visto su un canale vero, non dedotto.
  //
  // **Ma solo cio' che non regge**, ed e' la condizione che tiene in piedi il
  // conto: la terra a fianco della corsa e' la riva su cui il ponte sta
  // atterrando, e pretendere il franco anche sopra di lei alzerebbe l'impalcato
  // per scavalcare la propria spalla. A quello ci pensa gia' la quota delle due
  // spalle, che e' il primo termine del massimo.
  const width = ROADS.rankWidth[rank];
  const back = (width - 1) >> 1;
  let level = Math.max(path[head].level, path[tail].level);
  for (let i = from; i < to; i++) {
    const node = path[i];
    for (let dy = 0; dy < width; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const bx = node.x - back + dx;
        const by = node.y - back + dy;
        if (probe.carries(bx, by)) continue;
        const needed = probe.clearanceAt(bx, by) + ROADS.viaductClearance;
        if (needed > level) level = needed;
      }
    }
  }

  const columns: ViaductColumn[] = [];
  for (let i = head; i <= tail; i++) {
    const node = path[i];
    // Le spalle stanno a terra e non portano pila: la pila sotto una spalla
    // sarebbe un muro alto zero. Nel mezzo, una pila ogni `viaductPierPitch`
    // colonne contate dalla prima campata, cosi' che il passo non dipenda da
    // dove il ramo e' stato tagliato.
    const inner = i > head && i < tail;
    columns.push({
      x: node.x,
      y: node.y,
      level,
      rank,
      pier: inner && (i - from) % ROADS.viaductPierPitch === 0,
    });
  }

  return { columns, rank, level };
}
