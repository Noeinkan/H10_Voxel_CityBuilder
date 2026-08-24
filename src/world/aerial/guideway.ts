import { AERIAL } from './config';
import { surveyFooting, type AerialProbe, type DeckRect } from './deckPlan';

/**
 * La guida: la mobilita' in quota, come struttura di scena.
 *
 * **E' il pezzo che risponde al gate della fase.** Fin qui la citta' in quota
 * sapeva farsi dei piani abitati e collegarli fra loro, e non aveva una sola via
 * fra il suolo e quei piani: si abitava sopra la citta' senza poterci arrivare.
 * Il montante e' quella via — una guida verticale che sale lungo il fianco di un
 * impalcato dal terreno, o dal tetto su cui capita, fino al piano.
 *
 * **Verticale e orizzontale sono la stessa cosa posata in due modi.** Il montante
 * corre in piedi lungo una facciata; la linea corre incassata nel piano di un
 * tratto di percorso, ed e' un file di guida al posto della pavimentazione — non
 * un record in piu' e nemmeno un voxel in piu', il che e' anche il motivo per cui
 * non costa niente a nessun budget. Sono i convogli in verticale delle scene di
 * *Minority Report*: la guida sta sulla struttura, e le capsule stanno sulla
 * guida.
 *
 * **Niente si muove, ed e' una scelta.** Questo progetto non ha oggetti animati
 * fuori dai chunk, e inventarli qui vorrebbe dire un sottosistema di rendering
 * che nessuna sotto-fase ha chiesto. Le capsule sono voxel fermi a passo
 * deterministico: dicono che li' si sale, che e' cio' che serve leggere.
 *
 * Pura come `deckPlan.ts`, `terracePlan.ts` e `routeDrafts.ts`: il mondo entra
 * come predicato, e il vincolo della fase — «nessuna struttura sospesa senza
 * appoggi reali» — si verifica in un test in ambiente `node`.
 */

/** L'impalcato che il montante deve raggiungere, ridotto all'osso. */
export interface LiftTarget {
  readonly id: number;
  readonly rect: DeckRect;
  /** Prima quota occupata dall'impalcato: il montante si ferma sotto di lei. */
  readonly baseZ: number;
}

export const LIFT_REFUSALS = [
  /** L'impalcato e' piu' stretto della sezione di un montante. */
  'tooNarrow',
  /** Nessuna colonna sotto l'impalcato regge un piede: presa, molle, o carreggiata. */
  'noFooting',
  /** Il piede sta cosi' in basso che il montante sarebbe piu' alto di una torre. */
  'tooTall',
  /** Il piede e' gia' a filo dell'impalcato: non c'e' niente da salire. */
  'tooLow',
] as const;

export type LiftRefusal = (typeof LIFT_REFUSALS)[number];

export interface LiftPlan {
  /** Angolo minimo, largo `AERIAL.guide.side` sui due assi. */
  readonly x: number;
  readonly y: number;
  /** Prima quota occupata: il piede, che puo' essere terreno o tetto. */
  readonly baseZ: number;
  readonly height: number;
  /** Record su cui il piede poggia, o 0 se e' terreno nudo. */
  readonly carrier: number;
  /** L'impalcato servito: e' lui a reggere il montante in cima. */
  readonly deckId: number;
}

export type LiftResult =
  | { readonly ok: true; readonly plan: LiftPlan }
  | { readonly ok: false; readonly refusal: LiftRefusal };

/**
 * Il montante che porta a questo impalcato, o perche' non ce n'e' uno.
 *
 * **Sale dentro il riquadro dell'impalcato**, e non accanto. E' la scelta che
 * gli evita di doversi cercare un appoggio in cima: sopra di lui c'e' il piano
 * che deve servire, quindi il montante e' retto per costruzione da cio' a cui
 * porta. Sotto, il piede lo trova `surveyFooting`, che e' la stessa funzione con
 * cui una gamba di impalcato sceglie dove piantarsi: rifiuta la carreggiata,
 * rifiuta il suolo gia' preso, e **preferisce un tetto al prato** — un montante
 * che parte dalla copertura di un edificio piu' basso e' esattamente come sono
 * fatte le citta' a livelli.
 *
 * Le posizioni si provano dagli angoli verso il centro: un montante d'angolo
 * lascia libero il cuore dell'impalcato, che e' il posto in cui si costruisce.
 */
export function planLift(probe: AerialProbe, deck: LiftTarget): LiftResult {
  const side = AERIAL.guide.side;
  const { rect } = deck;
  if (rect.sizeX < side || rect.sizeY < side) return { ok: false, refusal: 'tooNarrow' };

  let refusal: LiftRefusal = 'noFooting';
  let best: LiftPlan | null = null;

  for (const [x, y] of corners(rect, side)) {
    // **Sul marciapiede si puo', e non e' una concessione.** Misurato su una
    // citta' cresciuta: dei cinquantaquattro impalcati, trentuno avevano sotto
    // di se' solo carreggiata e ventitre solo il tetto del proprio ospite. Una
    // mensola nasce sul fronte strada — e' cio' che la fa esistere — quindi
    // l'unico suolo che ha sotto e' quello su cui la gente cammina gia'.
    const footing = surveyFooting(probe, x, y, true);
    if (footing === 'taken' || footing === 'street') continue;

    const height = deck.baseZ - footing.baseZ;
    if (height <= 0) {
      refusal = worse(refusal, 'tooLow');
      continue;
    }
    if (height > AERIAL.maxPierHeight) {
      refusal = worse(refusal, 'tooTall');
      continue;
    }

    const plan: LiftPlan = {
      x,
      y,
      baseZ: footing.baseZ,
      height,
      carrier: footing.carrier,
      deckId: deck.id,
    };
    // Un tetto e' l'appoggio giusto e si prende subito: da li' il montante e'
    // corto, e la citta' si legge a livelli invece che a pali. Il prato si tiene
    // da parte, e vale solo se nessun angolo trova di meglio.
    if (footing.carrier !== 0) return { ok: true, plan };
    if (best === null) best = plan;
  }

  return best === null ? { ok: false, refusal } : { ok: true, plan: best };
}

/**
 * I quattro angoli del riquadro, in ordine dichiarato.
 *
 * L'ordine e' fisso e non dipende dal luogo: senza, la stessa citta' con lo
 * stesso seme metterebbe il montante in due posti diversi.
 */
function corners(rect: DeckRect, side: number): readonly (readonly [number, number])[] {
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.sizeX - side;
  const y1 = rect.y + rect.sizeY - side;
  return [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
}

/** Il rifiuto arrivato piu' avanti, come altrove in questo dominio. */
function worse(a: LiftRefusal, b: LiftRefusal): LiftRefusal {
  const depth: Record<LiftRefusal, number> = {
    tooNarrow: 0,
    noFooting: 1,
    tooLow: 2,
    tooTall: 3,
  };
  return depth[b] > depth[a] ? b : a;
}
