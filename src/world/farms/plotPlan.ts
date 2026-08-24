import { hashCoords } from '../rng';
import { BIOME } from '../terrain/config';
import { FARMS } from './config';

/**
 * Dove puo' stare un lotto agricolo, e perche' no.
 *
 * **Pura come `grading/`, `sites/` e `cluster.ts`.** Entrano delle sonde sul
 * terreno e sull'occupazione, esce un piano o un rifiuto motivato: niente mondo
 * voxel, niente registry, niente `Math.random`. E' cio' che la rende verificabile
 * senza far crescere una citta'.
 *
 * **Non fa opere di terra, e non e' una dimenticanza.** Il terreno si riempie e
 * non si scava, ma un campo non ha bisogno ne' dell'una ne' dell'altra cosa: i
 * solchi seguono la quota che trovano, colonna per colonna. Il limite di
 * pendenza per colonna basta da solo a tenere un lotto fuori da un dirupo, e in
 * cambio un campo su un fianco terrazzato esce a gradoni — che e' come stanno i
 * campi su un fianco terrazzato.
 */

/** Cosa il piano ha bisogno di sapere del mondo. Una funzione per domanda. */
export interface FarmProbe {
  readonly biomeAt: (x: number, y: number) => number;
  readonly slopeAt: (x: number, y: number) => number;
  /** true se qualcosa poggia gia' su quella colonna. */
  readonly occupied: (x: number, y: number) => boolean;
  /** Edifici entro `FARMS.edgeRadius`: quanto e' costruito attorno. */
  readonly builtNear: (x: number, y: number) => number;
}

/**
 * I due lotti che il mondo sa disegnare.
 *
 * Coincidono con i primi due `FARM_KIND` della simulazione, e la corrispondenza
 * la fa il driver: qui non si importa `src/sim/`, perche' un piano su un
 * quadrato di terreno non ha bisogno di sapere quanto rende.
 */
export const PLOT_KIND = {
  field: 0,
  orchard: 1,
} as const;

export type PlotKind = (typeof PLOT_KIND)[keyof typeof PLOT_KIND];

export type FarmRefusal =
  /** Almeno una colonna e' gia' presa da qualcosa che sta al suolo. */
  | 'occupied'
  /** Bioma senza erba: spiaggia, roccia o acqua. Un solco non si vedrebbe. */
  | 'infertile'
  /** Troppo ripida: e' lo stesso limite che rifiuta un edificio. */
  | 'steep'
  /** Qui e' gia' citta': un campo in mezzo agli isolati non e' campagna. */
  | 'urban';

/** Un lotto pianificato: un quadrato di colonne e il verso dei suoi solchi. */
export interface FarmPlot {
  /** Angolo minimo, sul reticolo di `FARMS.lattice`. */
  readonly x: number;
  readonly y: number;
  readonly side: number;
  /**
   * Campo o frutteto. La torre non passa di qui: e' un edificio.
   *
   * **Lo decide il bioma, non il seme.** Dove c'era bosco si pianta un frutteto e
   * dove c'era prato un campo: e' la lettura che il giocatore fa comunque
   * guardando l'isola, e legarla a un tiro di dado la cancellerebbe. La collina
   * segue il bosco perche' e' li' che un frutteto terrazzato ha senso — e perche'
   * un campo di grano su un fianco non regge la lettura.
   */
  readonly kind: PlotKind;
  /**
   * Verso dei solchi: `false` lungo x, `true` lungo y.
   *
   * Esce dal seme della cella e non da una regola sul terreno, ed e' voluto: due
   * lotti vicini con verso diverso sono la trapunta che si vede sorvolando una
   * campagna vera. Una regola geografica — per esempio «lungo la pendenza» —
   * darebbe invece campi tutti orientati allo stesso modo su tutto un versante.
   */
  readonly alongY: boolean;
}

export type FarmPlan =
  | { readonly ok: true; readonly plot: FarmPlot }
  | { readonly ok: false; readonly reason: FarmRefusal };

function refuse(reason: FarmRefusal): FarmPlan {
  return { ok: false, reason };
}

export interface FarmPlotQuery extends FarmProbe {
  /** Angolo minimo del lotto candidato. Va gia' sul reticolo. */
  readonly x: number;
  readonly y: number;
  readonly seed: number;
  /**
   * Se la citta' ha un mandato che spinge verso il verde piantato.
   *
   * E' l'unica cosa che il mondo lascia decidere a una scelta del giocatore
   * invece che al terreno, e serve a `communityGardens`: quel mandato prometteva
   * di trasformare materiali in cibo e fino alla 3.1 lasciava solo una tipologia
   * residenziale piu' verde, cioe' decorazione. Adesso abbassa la soglia di cio'
   * che diventa frutteto — un quarto di bosco invece della meta' — e il mandato
   * si vede nella campagna oltre che negli isolati.
   */
  readonly preferOrchard?: boolean;
}

/**
 * Il lotto che sta in questo angolo, o il motivo per cui non ci sta.
 *
 * Le condizioni si valutano **tutte sulla stessa scansione** e nell'ordine in cui
 * costano: prima l'occupazione, che e' una lettura di indice, poi bioma e
 * pendenza. Il rifiuto e' del **quadrato intero** e non della colonna, come per
 * il riquadro di un landmark: un campo bucato non e' un campo.
 */
export function planPlot(query: FarmPlotQuery): FarmPlan {
  const { x, y, seed } = query;
  const side = FARMS.plotSide;

  // Prima di scandire 144 colonne: qui e' ancora campagna? E' una domanda sola
  // sul centro, e scarta in un colpo i candidati dentro la citta'.
  const cx = x + (side >> 1);
  const cy = y + (side >> 1);
  if (query.builtNear(cx, cy) > FARMS.edgeMaxNeighbours) return refuse('urban');

  // Il bioma piu' frequente del quadrato decide cosa ci si pianta. Si conta
  // nella stessa scansione che valida — un secondo giro sulle stesse 144 colonne
  // per una domanda che si puo' rispondere in questa non si giustifica.
  let wooded = 0;
  for (let py = y; py < y + side; py++) {
    for (let px = x; px < x + side; px++) {
      if (query.occupied(px, py)) return refuse('occupied');
      const biome = query.biomeAt(px, py);
      if (!FARMS.fertile.includes(biome)) return refuse('infertile');
      if (query.slopeAt(px, py) >= FARMS.maxSlope) return refuse('steep');
      if (biome !== BIOME.plain) wooded++;
    }
  }

  return {
    ok: true,
    plot: {
      x,
      y,
      side,
      // Metа' del quadrato boscoso lo rende un frutteto; con il mandato ne basta
      // un quarto. Il confronto e' fra interi apposta: una frazione qui
      // introdurrebbe una virgola mobile in una decisione che deve restare
      // identica a se stessa a ogni rigenerazione.
      kind: wooded * (query.preferOrchard === true ? 4 : 2) > side * side
        ? PLOT_KIND.orchard
        : PLOT_KIND.field,
      alongY: (hashCoords(seed ^ FARMS.salt, x, y) & 1) === 1,
    },
  };
}

/**
 * Le colonne di un lotto che portano un solco, in ordine di scansione.
 *
 * **Il passo si conta dall'angolo del lotto, non dal mondo.** Contato in
 * coordinate assolute, due lotti adiacenti con lo stesso verso potrebbero
 * cadere in controfase e mostrare una fila doppia sulla cucitura; ancorato
 * all'angolo, ogni lotto e' regolare per conto suo.
 *
 * Il passo corre **ortogonale** al verso dei solchi: una fila lunga lungo x si
 * ripete salendo lungo y, o non ci sarebbe niente da distanziare.
 */
export function* plotRows(plot: FarmPlot): Generator<{ x: number; y: number }> {
  const { x, y, side, alongY } = plot;
  for (let dy = 0; dy < side; dy++) {
    for (let dx = 0; dx < side; dx++) {
      const across = alongY ? dx : dy;
      if (across % FARMS.rowPitch !== 0) continue;
      yield { x: x + dx, y: y + dy };
    }
  }
}

/** Quante colonne di un lotto portano un solco. Utile a chi deve stimare un budget. */
export function plotRowCount(side: number): number {
  return side * Math.ceil(side / FARMS.rowPitch);
}
