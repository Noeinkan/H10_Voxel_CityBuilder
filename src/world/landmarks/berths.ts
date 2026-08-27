/**
 * Cosa sta fermo in un punto d'ormeggio.
 *
 * Vive in un file suo perche' lo usano due lati che altrimenti si
 * importerebbero in cerchio: `config.ts` — che elenca le ricette — e le
 * ricette stesse in `recipes/`, che da `config.ts` possono importare solo i
 * tipi. Un import di valori attraverserebbe il ciclo al caricamento, e una
 * ricetta che legge `BERTH` a meta' del giro troverebbe il simbolo ancora non
 * inizializzato. Da qui la separazione: i consumatori storici continuano a
 * leggerlo da `config.ts`, che lo ri-esporta.
 */
export const BERTH = {
  /** Barca da lavoro: compare appena la struttura esiste. */
  vessel: 'vessel',
  /** Posto barca di una marina: uno yacht da diporto, non una barca da lavoro. */
  yacht: 'yacht',
  /** Accosto di una linea di traghetti, e destinazione della traversata. */
  ferry: 'ferry',
  /** Banchina di una nave da carico, che arriva dal largo. */
  cargo: 'cargo',
  /** Piazzola di sosta di un aereo. */
  aircraft: 'aircraft',
  /** Pilone d'ormeggio di un dirigibile. */
  airship: 'airship',
  /**
   * Piazzola di un eVTOL: non ci sta fermo niente, ci si posa.
   *
   * E' il solo ormeggio da cui parte un giro **chiuso** che torna a toccarlo:
   * un pilone tiene appeso, una piazzola fa scendere. Il `heading` conta piu'
   * che altrove — decide da che parte arriva l'avvicinamento — e va puntato
   * verso il lato libero del tetto.
   */
  pad: 'pad',
  /** Pilone di ritenuta di una mongolfiera: il capo di qua della sua corsa. */
  balloon: 'balloon',
  /**
   * Soglia di pista: non ci sta fermo niente.
   *
   * Sono i due capi da cui il circuito di volo si costruisce, e stanno qui
   * perche' sono l'unica cosa che di una pista il traffico deve sapere — dove
   * comincia, dove finisce, e quindi in che verso si decolla.
   */
  runway: 'runway',
} as const;

export type BerthKind = (typeof BERTH)[keyof typeof BERTH];
