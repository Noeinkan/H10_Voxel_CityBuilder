import { TIER, type SkylineTier } from '../skyline/tiers';
import { ARCOLOGY } from './config';

/**
 * Quando la citta' e' pronta a darsi una megastruttura.
 *
 * **Puro e senza mondo**, come `skyline/tiers.ts` e `aerial/decks.ts`: entrano
 * dei numeri gia' misurati, esce un verdetto. Chi il registry ce l'ha in mano fa
 * la raccolta; qui si decide soltanto.
 *
 * **Il giocatore modifica le condizioni della crescita, non posa la
 * megastruttura.** Non c'e' nessuno strumento in toolbar e nessun costo in
 * `BALANCE`: le leve restano quelle che ci sono gia' — dove piazza i
 * catalizzatori, quali policy tiene accese, quanto lascia crescere il centro — e
 * l'arcologia e' la **conseguenza** di come le ha usate. E' anche il motivo per
 * cui `src/sim/` non guadagna una riga per questa fase.
 *
 * **La densita' da sola non basterebbe, ed e' il punto della condizione.** «Qui
 * c'e' molta citta'» e' vero in mezzo nucleo di una partita matura; la domanda a
 * cui l'arcologia e' la risposta e' un'altra — «qui la citta' non ha piu' niente
 * da diventare» — e a dirla e' `cappedNeighbours`, cioe' quanti vicini hanno
 * gia' toccato la propria quota ammessa. Senza quella misura la megastruttura
 * arriverebbe in un quartiere che stava ancora crescendo per conto suo, e gli
 * toglierebbe il posto invece di dargli un seguito.
 *
 * **`isPeakBlock` qui non entra, e la misura ha smentito il progetto.** Sembrava
 * ovvio chiedere che l'arcologia stesse su uno degli isolati che la 4.6 elegge a
 * picco — dove la gerarchia concentra gia' l'altezza — e con quella riga in piu'
 * su una citta' matura non ne nasceva **nessuna**, mai: due terzi degli isolati
 * eletti sono piu' stretti dell'ingombro, il centro e' piccolo, e l'intersezione
 * dei tre insiemi era vuota su ogni seed provato. Tolta la riga, la prima arriva
 * a ottocento tick. Il difetto non era la taratura: `isPeakBlock` e' un tiro
 * ogni sette isolati **su tutta la mappa**, tarato perche' le guglie non
 * diventino un bosco, e non ha niente da dire su una struttura che esiste in due
 * esemplari contati. La governance dell'eccezione e' `maxPerIsland`, che e' un
 * numero esatto invece di una probabilita', piu' la fascia `core` — che e' gia'
 * la risposta di `skyline/` alla domanda «dove sta l'altezza».
 */

/** Perche' qui non nasce un'arcologia. */
export const ARCOLOGY_REFUSALS = [
  /** L'isola ne ha gia' quante ne ammette. */
  'enough',
  /** Non e' il centro: la fascia non e' quella che la gerarchia chiama `core`. */
  'notCore',
  /** L'isolato non contiene l'ingombro. */
  'blockTooSmall',
  /** Non c'e' abbastanza citta' costruita qui attorno. */
  'thin',
  /** La citta' qui sta ancora crescendo da sola: la quota ammessa non e' satura. */
  'notCapped',
  /**
   * La condizione era vera e il riquadro non si sgombera: dentro c'e' qualcosa
   * che non cade.
   */
  'blocked',
  /**
   * La condizione era vera e il luogo non regge: terreno, volume gia' impegnato
   * o budget di chunk.
   *
   * **Non lo decide `arcologyReady`**, e sta comunque in questo elenco: chi
   * guarda l'overlay vuole sapere perche' non c'e' un'arcologia, e distinguere
   * «la citta' non e' pronta» da «il luogo non la regge» e' esattamente
   * l'informazione che serve. Un rifiuto che il predicato puro non puo' produrre
   * ma che il driver sa nominare resta un rifiuto di questo dominio.
   */
  'site',
] as const;

export type ArcologyRefusal = (typeof ARCOLOGY_REFUSALS)[number];

/** Il riquadro di un isolato, con gli estremi inclusi. */
export interface BlockBounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface ArcologyQuery {
  /** Arcologie gia' esistenti. */
  readonly existing: number;
  /** Fascia della gerarchia verticale in questa colonna. */
  readonly tier: SkylineTier;
  readonly blockRect: BlockBounds;
  /** Ingombro in pianta della ricetta, gia' portato sul verso vero. */
  readonly spanX: number;
  readonly spanY: number;
  /** Record entro `ARCOLOGY.radius`. */
  readonly builtNeighbours: number;
  /** Quanti di quelli hanno gia' raggiunto la propria quota ammessa. */
  readonly cappedNeighbours: number;
}

/**
 * Il primo motivo per cui qui non nasce, o null se nasce.
 *
 * **L'ordine delle domande e' parte della regola**, come in `tierAt`, e non e'
 * commutativo per chi legge: la prima risposta e' quella che il giocatore vede,
 * e sapere che l'isola e' gia' piena e' un'informazione diversa dal sapere che
 * questo isolato e' stretto. Le due misure che costano una scansione del
 * registry stanno per ultime, cosi' chi chiede in fila su venti isolati le paga
 * solo dove tutto il resto e' gia' passato.
 */
export function arcologyReady(query: ArcologyQuery): ArcologyRefusal | null {
  if (query.existing >= ARCOLOGY.maxPerIsland) return 'enough';
  if (query.tier !== TIER.core) return 'notCore';

  const { blockRect } = query;
  if (blockRect.x1 - blockRect.x0 + 1 < query.spanX) return 'blockTooSmall';
  if (blockRect.y1 - blockRect.y0 + 1 < query.spanY) return 'blockTooSmall';

  if (query.builtNeighbours < ARCOLOGY.minBuilt) return 'thin';
  if (query.cappedNeighbours < ARCOLOGY.minCapped) return 'notCapped';
  return null;
}

/**
 * Dove va l'ingombro dentro l'isolato: al centro.
 *
 * Non c'e' un fronte da tenere sotto il dito, come per il porto, e non c'e'
 * nessun dito: l'arcologia si prende l'isolato per intero, e il centro e' l'unico
 * punto che non privilegia una carreggiata sulle altre tre. Restituisce la
 * colonna da passare a `arcologyOrigin`, cioe' quella su cui cade l'ancora della
 * ricetta.
 */
export function arcologyAnchor(blockRect: BlockBounds): { x: number; y: number } {
  return {
    x: blockRect.x0 + ((blockRect.x1 - blockRect.x0) >> 1),
    y: blockRect.y0 + ((blockRect.y1 - blockRect.y0) >> 1),
  };
}
