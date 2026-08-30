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
 * gia' finito di crescere — al tetto oppure reso immutabile da una struttura
 * abitata in quota. Senza quella misura la megastruttura arriverebbe in un
 * quartiere che stava ancora crescendo per conto suo, e gli toglierebbe il
 * posto invece di dargli un seguito.
 *
 * **Ne' la fascia entra piu' nella condizione, e la misura ha smentito anche
 * quella.** `tier !== core` sembrava la governance giusta — la 4.6 dice gia'
 * dove sta l'altezza — e su seed 4242 con cinque poli produce sette isolati
 * `core` contigui, che sommati a `minSpacing: 2` lasciavano passare **due**
 * candidati su tutta l'isola, e una sola arcologia fondata. Tre regole scritte
 * per distribuire si stavano moltiplicando in un tetto.
 *
 * A decidere *dove* resta la **densita' costruita**, che e' una misura del luogo
 * invece che un'etichetta: un isolato di periferia con quaranta edifici entro
 * ventiquattro colonne e' un quartiere, e un isolato `core` senza non lo e'. E'
 * anche la sola delle tre che non puo' diventare vuota per come il giocatore
 * dispone i poli — il difetto che questo dominio ha gia' incontrato tre volte.
 *
 * **`isPeakBlock` qui non entra, e la misura ha smentito il progetto.** Sembrava
 * ovvio chiedere che l'arcologia stesse su uno degli isolati che la 4.6 elegge a
 * picco — dove la gerarchia concentra gia' l'altezza — e con quella riga in piu'
 * su una citta' matura non ne nasceva **nessuna**, mai: due terzi degli isolati
 * eletti sono piu' stretti dell'ingombro, il centro e' piccolo, e l'intersezione
 * dei tre insiemi era vuota su ogni seed provato. Tolta la riga, la prima arriva
 * a ottocento tick. Il difetto non era la taratura: `isPeakBlock` e' un tiro
 * ogni sette isolati **su tutta la mappa**, tarato perche' le guglie non
 * diventino un bosco, e non ha niente da dire su una struttura che esiste in un
 * numero di esemplari **derivato dagli edifici** (vedi `arcologyQuota`). La
 * governance dell'eccezione e' la quota — un numero derivato invece di una
 * probabilita' — piu' la fascia `core` — che e' gia'
 * la risposta di `skyline/` alla domanda «dove sta l'altezza».
 */

/** Perche' qui non nasce un'arcologia. */
export const ARCOLOGY_REFUSALS = [
  /** L'isola ne ha gia' quante ne ammette. */
  'enough',
  /**
   * La roccia sotto non basta, o l'acqua arriva troppo vicino al bordo.
   *
   * Misurato, non stimato: l'isola standard e' molto piu' piatta di quanto
   * `TERRAIN.maxHeight` faccia pensare, e questo rifiuto e' quello che scatta
   * piu' spesso sulla famiglia interrata.
   */
  'tooShallow',
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
  /** Edifici totali della citta': decidono la quota (vedi `arcologyQuota`). */
  readonly buildings: number;
  readonly blockRect: BlockBounds;
  /** Ingombro in pianta della ricetta, gia' portato sul verso vero. */
  readonly spanX: number;
  readonly spanY: number;
  /** Record entro `ARCOLOGY.radius`. */
  readonly builtNeighbours: number;
  /** Quanti di quelli non possono piu' crescere. */
  readonly cappedNeighbours: number;
}

/**
 * Quante arcologie la citta' ammette, dati i suoi edifici.
 *
 * **La quota scala con la citta', non e' un tetto.** Un'arcologia e' la risposta
 * a un quartiere saturo — `minBuilt` edifici entro `radius` — quindi il conto
 * cresce con gli edifici totali: uno ogni `buildingsPerArcology`, con un minimo
 * di due perche' un'isola piccola non resti senza vertici. E' la sostituzione del
 * vecchio `maxPerIsland`: un numero derivato invece di una costante.
 */
export function arcologyQuota(buildings: number): number {
  return Math.max(2, Math.ceil(buildings / ARCOLOGY.buildingsPerArcology));
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
  if (query.existing >= arcologyQuota(query.buildings)) return 'enough';
  return commonRefusal(query);
}

/**
 * Le domande che le due famiglie fanno nello stesso modo.
 *
 * Sono quattro su cinque, e sono anche le due misure care: stanno in fondo
 * perche' chi chiede in fila su venti isolati le paga solo dove tutto il resto
 * e' gia' passato. Estrarle e' l'unico modo di essere sicuri che un giorno la
 * quota o la densita' non cambino per la torre e non per il cratere.
 */
function commonRefusal(query: ArcologyQuery): ArcologyRefusal | null {
  const { blockRect } = query;
  if (blockRect.x1 - blockRect.x0 + 1 < query.spanX) return 'blockTooSmall';
  if (blockRect.y1 - blockRect.y0 + 1 < query.spanY) return 'blockTooSmall';

  if (query.builtNeighbours < ARCOLOGY.minBuilt) return 'thin';
  if (query.cappedNeighbours < ARCOLOGY.minCapped) return 'notCapped';
  return null;
}

/** Quanta roccia il sito offre, e quanta la ricetta ne chiede. */
export interface SunkenQuery extends ArcologyQuery {
  /** Quote scavabili sotto il piano finito, gia' misurate. */
  readonly availableDepth: number;
  /** Quote che la ricetta scelta pretende. */
  readonly requiredDepth: number;
  /** Falso se una colonna bagnata arriva troppo vicino all'ingombro. */
  readonly dryRim: boolean;
}

/**
 * Il primo motivo per cui qui non si scava, o null se si scava.
 *
 * **E' `arcologyReady` con la prima domanda rovesciata**, e la simmetria e' il
 * contenuto della famiglia: l'arcologia arriva sulla **cresta** della gerarchia,
 * dove il cono concede tutta l'altezza che sa concedere; l'earthscraper sulla
 * **spalla**, dove il tetto ha gia' cominciato a scendere e salire non e' piu' la
 * risposta. E' la lettura letterale del progetto da cui prende il nome: non la
 * periferia, ma il centro denso in cui l'altezza e' negata.
 *
 * **La prima versione chiedeva `tier !== core`, ed era quasi vuota.** Misurata su
 * una citta' cresciuta, la fascia non distingue niente di utile: il tessuto denso
 * cade tutto dentro la portata di un polo — quindi `core` — e cio' che resta
 * fuori e' rado, cioe' `fringe` per densita' e non per quota, oltre a essere
 * costiero e percio' non scavabile. L'intersezione fra «non e' centro» e «ha i
 * vicini che una megastruttura chiede» era vuota su ogni seed provato: lo stesso
 * difetto di `isPeakBlock`, la terza volta che questo dominio lo incontra. Il
 * bonus di quota lo evita per costruzione, perche' e' una misura **dentro** la
 * fascia e non un'alternativa a essa.
 *
 * La densita' resta la stessa richiesta di sempre: un cratere in mezzo al prato
 * sarebbe una cava, non un pezzo di citta'. Anche `cappedNeighbours` resta —
 * scavare e' la risposta a un quartiere che ha smesso di crescere, esattamente
 * come salire.
 */
export function earthscraperReady(query: SunkenQuery): ArcologyRefusal | null {
  if (query.existing >= arcologyQuota(query.buildings)) return 'enough';
  if (!query.dryRim || query.availableDepth < query.requiredDepth) return 'tooShallow';
  return commonRefusal(query);
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
