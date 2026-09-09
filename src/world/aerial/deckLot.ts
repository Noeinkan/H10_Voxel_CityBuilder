import type { DeckRect } from './deckPlan';

/**
 * Dove, dentro un impalcato, un lotto ci sta davvero.
 *
 * **Il riquadro dell'impalcato non e' il lotto**, ed e' il difetto che teneva
 * `stacked` a zero. Una mensola comincia dalla parete a cui e' appesa, quindi le
 * sue prime colonne stanno **dentro** l'ospite: un'impronta centrata sul riquadro
 * ci finisce sopra, `overlaps` la rifiuta come occupata, e il rifiuto non e'
 * nemmeno definitivo — la stessa colonna torna candidata a ogni infornata per
 * sentirsi dire di no dalla stessa geometria. Misurato su una citta' di
 * quattrocentoventi edifici: ottantanove mensole, quarantacinque abbastanza
 * larghe, e **zero** lotti in quota.
 *
 * Il lotto e' allora il quadrato libero piu' grande dentro il riquadro, e la
 * parete resta fuori da sola: nessuna regola in piu' per l'ospite, che e'
 * semplicemente la cosa occupata piu' vicina. Vale identico per un nodo di
 * percorso, che di ospite non ne ha e offre il proprio riquadro intero.
 *
 * **Puro come il resto di `aerial/`**: entrano un riquadro e un predicato, esce
 * un riquadro. Chi ha il registry in mano fa la domanda per colonna, come
 * `planDeck` riceve una sonda invece del mondo.
 */

export interface DeckLotQuery {
  /** Il piano offerto, per intero. */
  readonly rect: DeckRect;
  /** true se sopra questa colonna, a questa quota, non c'e' niente. */
  readonly free: (x: number, y: number) => boolean;
  /** Sotto questo lato non c'e' un edificio ma un palo: meglio niente. */
  readonly minSide: number;
  /** Il tetto d'impronta della citta' ordinaria: in quota non si sale sopra. */
  readonly maxSide: number;
}

/**
 * Il quadrato libero piu' grande dentro l'impalcato, o `null` se non ce n'e'.
 *
 * **Il piu' grande prima del piu' centrato**, perche' il lato decide che
 * edificio ci nasce — `levelCapsOf` lega impronta e fasce — mentre lo
 * scostamento decide solo dove: fra un lotto grande di lato e uno piccolo al
 * centro, il primo e' una casa e il secondo un palo.
 *
 * A parita' di lato vince il piu' vicino al centro del riquadro, cosi' cio' che
 * avanza resta terrazza tutto attorno invece di ammucchiarsi da un lato solo. I
 * pareggi si rompono su `y` e poi su `x`, che e' l'ordine totale di questo
 * progetto: nessun ordine di visita non dichiarato deve poter cambiare la stessa
 * citta' a parita' di seme.
 */
export function deckLot(query: DeckLotQuery): DeckRect | null {
  const { rect, minSide } = query;
  const maxSide = Math.min(query.maxSide, rect.sizeX, rect.sizeY);
  if (maxSide < minSide) return null;

  // La griglia una volta sola: il ciclo qui sotto guarda ogni colonna una volta
  // per lato provato, e `free` interroga il registry.
  const open: boolean[] = [];
  for (let dy = 0; dy < rect.sizeY; dy++) {
    for (let dx = 0; dx < rect.sizeX; dx++) {
      open.push(query.free(rect.x + dx, rect.y + dy));
    }
  }

  // Corse libere verso il basso, colonna per colonna: e' cio' che rende il
  // controllo di un quadrato una scansione di lato invece che di area.
  const runs = new Int32Array(rect.sizeX * rect.sizeY);
  for (let dx = 0; dx < rect.sizeX; dx++) {
    let run = 0;
    for (let dy = rect.sizeY - 1; dy >= 0; dy--) {
      run = open[dy * rect.sizeX + dx] ? run + 1 : 0;
      runs[dy * rect.sizeX + dx] = run;
    }
  }

  // Il centro in mezze colonne, cosi' che un lato pari e uno dispari si misurino
  // con la stessa aritmetica intera.
  const centerX = 2 * rect.x + rect.sizeX;
  const centerY = 2 * rect.y + rect.sizeY;

  for (let side = maxSide; side >= minSide; side--) {
    let best: DeckRect | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let dy = 0; dy + side <= rect.sizeY; dy++) {
      for (let dx = 0; dx + side <= rect.sizeX; dx++) {
        let fits = true;
        for (let k = 0; k < side && fits; k++) {
          if (runs[dy * rect.sizeX + dx + k] < side) fits = false;
        }
        if (!fits) continue;

        const x = rect.x + dx;
        const y = rect.y + dy;
        const offX = 2 * x + side - centerX;
        const offY = 2 * y + side - centerY;
        const distance = offX * offX + offY * offY;
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        best = { x, y, sizeX: side, sizeY: side };
      }
    }

    if (best !== null) return best;
  }

  return null;
}
