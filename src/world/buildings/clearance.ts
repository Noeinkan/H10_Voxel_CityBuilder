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
 * **Perche' la soglia esiste.** Senza, un monumento cancellerebbe un centro
 * direzionale intero e il piazzamento diventerebbe un gesto senza lettura:
 * clicchi dove ti pare e la citta' si fa da parte. Con la soglia si sventra
 * solo il tessuto minuto, e trovare la sacca bassa dentro il quartiere denso
 * **e'** la giocata. Che poi un edificio basso sia anche un volume dell'ordine
 * di una campata — cioe' cancellabile senza far male al frame — e' il genere di
 * coincidenza che conviene incassare, non su cui conviene poggiare.
 */

/**
 * Cosa e' un record, per chi deve decidere se puo' cadere.
 *
 * Tre casi e non i cinque campi del `BuildingRecord`: qui non serve sapere se
 * qualcosa e' una mensola, una gamba o un nodo di percorso — serve sapere che
 * non si tocca.
 */
export const CLEARANCE_KIND = {
  /** Un edificio della citta': cade se e' abbastanza basso. */
  building: 0,
  /** Struttura: un altro landmark, la citta' in quota, chi la porta. Non si tocca. */
  structure: 1,
  /** Una campata: cade da sola, e non e' un ostacolo. */
  span: 2,
} as const;

export type ClearanceKind = (typeof CLEARANCE_KIND)[keyof typeof CLEARANCE_KIND];

export interface ClearanceRecord {
  readonly id: number;
  readonly level: number;
  readonly kind: ClearanceKind;
}

/** Perche' un riquadro non si puo' sgomberare. */
export type ClearanceRefusal = 'block-too-tall' | 'structure-in-the-way';

export interface ClearancePlan {
  /** Record da abbattere, in ordine di lettura. Vuoto se il riquadro era gia' libero. */
  readonly doomed: readonly number[];
  /** Motivo del rifiuto, o null se il riquadro si sgombera. */
  readonly refusal: ClearanceRefusal | null;
}

export interface ClearanceRule {
  /** Livello massimo che si puo' abbattere. Oltre, il riquadro rifiuta. */
  readonly maxLevel: number;
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
    if (record.level > rule.maxLevel) {
      tooTall = true;
      continue;
    }
    doomed.push(record.id);
  }

  if (tooTall) return { doomed: [], refusal: 'block-too-tall' };
  return { doomed, refusal: null };
}
