/**
 * Cosa un landmark puo' togliere di mezzo, e cosa lo ferma.
 *
 * **Puro e senza mondo**, come `aerial/decks.ts` e `skyline/tiers.ts`: entrano
 * record ridotti all'osso, esce un verdetto. Chi il registry ce l'ha in mano fa
 * la raccolta e la classificazione; qui si decide soltanto.
 *
 * **Perche' non sta in `src/game/`.** La regola parla di livelli e di strutture,
 * cioe' di cose che vivono nel registry: `src/game/` non ha un registry e non
 * deve averlo — compone, come gia' compone il vincolo di sito con quello di
 * distanza. Il numero che la regola usa resta pero' di la', in `balance.ts`,
 * perche' *quanto* si puo' abbattere e' una taratura di gioco e non una
 * proprieta' del mondo.
 *
 * **Perche' la soglia esiste.** E' la manopola di chi la usa, non di questo
 * file: un landmark la lascia aperta — il giocatore demolisce il costruito e il
 * monumento prende il suo posto — mentre un'arcologia la tiene sul livello
 * massimo degli edifici, perche' una megastruttura non si ferma davanti a una
 * torre ma non deve nemmeno cancellarla senza leggere la citta'. Cio' che
 * *nessuno* dei due puo' toccare e' qui: la citta' in quota, le arcologie e chi
 * le porta, perche' far cadere una rete non e' demolire. E i monumenti stessi
 * stanno qui, con un rifiuto loro: un landmark non si demolisce piazzandone un
 * altro, solo la gomma li tocca.
 */

/**
 * Cosa e' un record, per chi deve decidere se puo' cadere.
 *
 * Quattro casi e non i cinque campi del `BuildingRecord`: qui non serve sapere
 * se qualcosa e' una mensola, una gamba o un nodo di percorso — serve sapere
 * se e come si tocca.
 */
export const CLEARANCE_KIND = {
  /** Un edificio della citta': cade secondo la soglia di altezza. */
  building: 0,
  /** Struttura: la citta' in quota, un'arcologia, chi le porta. Non si tocca. */
  structure: 1,
  /** Una campata: cade da sola, e non e' un ostacolo. */
  span: 2,
  /**
   * Un landmark: cade solo per chi lo dichiara.
   *
   * La gomma lo demolisce come il resto del costruito — e' lo strumento del
   * gesto — ma il piazzamento di un monumento no: un landmark non sostituisce un
   * altro landmark, e nemmeno un'arcologia se lo porta via per farsi spazio. Chi
   * vuole togliere un monumento deve dirlo esplicitamente.
   */
  landmark: 3,
} as const;

export type ClearanceKind = (typeof CLEARANCE_KIND)[keyof typeof CLEARANCE_KIND];

export interface ClearanceRecord {
  readonly id: number;
  readonly level: number;
  readonly kind: ClearanceKind;
}

/**
 * Perche' un riquadro non si puo' sgomberare.
 *
 * `landmark-in-the-way` e' il solo rifiuto che un landmark produce e nessun
 * altro: una struttura — la citta' in quota, un'arcologia, chi le porta — resta
 * `structure-in-the-way`, definitiva e condivisa. Un monumento, invece, non
 * cade nemmeno sotto un altro monumento, e a chi piazza serve saperlo per
 * non puntare il cursore a caso su cio' che non cederà mai.
 */
export type ClearanceRefusal = 'block-too-tall' | 'structure-in-the-way' | 'landmark-in-the-way';

export interface ClearancePlan {
  /** Record da abbattere, in ordine di lettura. Vuoto se il riquadro era gia' libero. */
  readonly doomed: readonly number[];
  /** Motivo del rifiuto, o null se il riquadro si sgombera. */
  readonly refusal: ClearanceRefusal | null;
}

export interface ClearanceRule {
  /** Livello massimo che si puo' abbattere. Oltre, il riquadro rifiuta. */
  readonly maxLevel: number;
  /**
   * true se il riquadro puo' portarsi via anche i landmark che ci trova.
   *
   * E' la differenza fra la gomma — che demolisce tutto, monumenti compresi —
   * e chi costruisce: il piazzamento di un monumento si ferma sui monumenti
   * e cerca altrove, esattamente come la megastruttura.
   */
  readonly clearsLandmarks?: boolean;
}

/**
 * Chi cade e chi ferma tutto.
 *
 * **Il rifiuto e' del riquadro, non del singolo record**: un ingombro sgomberato
 * a meta' non e' un ingombro sgomberato, e lasciar cadere le case attorno a una
 * torre che resta in piedi darebbe un buco al posto del landmark. Basta un
 * ostacolo perche' non cada niente.
 *
 * La struttura precede l'altezza fra i due rifiuti: e' definitiva — nessuna
 * attesa la risolve — mentre una torre e' alta *oggi*, e sapere quale dei due
 * si e' letto cambia se ha senso riprovare altrove o piu' tardi.
 */
export function planClearance(
  records: readonly ClearanceRecord[],
  rule: ClearanceRule,
): ClearancePlan {
  const doomed: number[] = [];
  let tooTall = false;

  for (const record of records) {
    if (record.kind === CLEARANCE_KIND.span) continue;
    if (record.kind === CLEARANCE_KIND.structure) {
      return { doomed: [], refusal: 'structure-in-the-way' };
    }
    if (record.kind === CLEARANCE_KIND.landmark) {
      if (rule.clearsLandmarks === true) {
        doomed.push(record.id);
        continue;
      }
      return { doomed: [], refusal: 'landmark-in-the-way' };
    }
    if (record.level > rule.maxLevel) {
      tooTall = true;
      continue;
    }
    doomed.push(record.id);
  }

  if (tooTall) return { doomed: [], refusal: 'block-too-tall' };
  return { doomed, refusal: null };
}
