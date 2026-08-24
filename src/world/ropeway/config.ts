import { PALETTE_SLOTS } from '../../engine/paletteSlots';

/**
 * Unica fonte di verita' dei numeri della funivia.
 *
 * Vale la stessa regola di `terrain/config.ts`, `spans/config.ts` e
 * `crossings/config.ts`: nessun altro file di `src/world/ropeway/` contiene una
 * lunghezza, una quota o un indice di palette. Le misure della **cabina** stanno
 * invece in `traffic/config.ts`, con le altre sagome che si muovono: qui c'e' la
 * linea, non chi ci viaggia sopra.
 *
 * **Perche' esiste questo dominio, dato che i ponti ci sono gia'.** Il commento
 * di `CROSSINGS.maxLength` dice cosa sta oltre i novantasei voxel: «la distanza
 * oltre la quale un ponte smette di essere una scelta e diventa il modo per
 * annullare la geografia. Uno stretto piu' largo di cosi' vuole un traghetto».
 * Il traghetto pero' e' un catalizzatore — lo si piazza dove il ruolo ha senso,
 * non dove serve attraversare — e fra due rive che si guardano non c'e' ancora
 * niente che il giocatore possa **tirare**. Questa e' quella cosa.
 *
 * **L'invariante e' l'opposto esatto di quello degli attraversamenti.** Li' «un
 * attraversamento prende suolo», con le pile che scendono nel fondale; qui **una
 * campata di fune non prende niente**: fra due appoggi non c'e' impalcato, non
 * c'e' carreggiata e non c'e' pila. A prendere suolo sono solo le due stazioni e
 * i piloni, e i piloni stanno **solo sull'asciutto** — e' esattamente cio' che
 * permette alla linea di scavalcare uno stretto che nessuna pila reggerebbe, ed
 * e' anche la ragione per cui `maxLength` qui vale il doppio di la'.
 *
 * **La fune non e' materia.** Vale per lei la regola di `traffic/`: e' spessa
 * meno di un voxel, e disegnarla a cubi lungo duecento colonne darebbe una
 * scaletta di quad al posto di un cavo. La calcola `ropewayPlan.ts` come
 * spezzata, e la disegna `engine/RopewayView.ts` con mesh proprie fuori dal
 * volume voxel. E' la stessa divisione che vale per le barche, applicata per la
 * prima volta a qualcosa che sta fermo.
 */

/**
 * Cosa prende suolo su una linea.
 *
 * **Una voce sola, e non e' una tabella scritta a meta'.** Una traversata ha due
 * torri e nient'altro: fra le due rive non c'e' niente su cui piantare un
 * appoggio, e sull'avvicinamento non c'e' spazio — la stazione arretra proprio
 * perche' li' la citta' e' costruita. Il pilone intermedio e' roba da linea di
 * montagna, dove la corsa passa su terra per tutta la sua lunghezza: quando
 * quella linea arrivera' sara' la seconda voce di questa tabella, e trovera'
 * pronte occupazione, collisione, budget di chunk e comparsa a budget.
 */
export const ROPEWAY_PART = {
  /** Il capolinea: la torre su cui la fune e' ancorata e da cui si parte. */
  station: 'station',
} as const;

export type RopewayPart = (typeof ROPEWAY_PART)[keyof typeof ROPEWAY_PART];

export const ROPEWAY = {
  // --- La linea in pianta -------------------------------------------------

  /**
   * Lato di una stazione, in voxel. **Dispari**, e non e' un dettaglio.
   *
   * La fune parte dal centro della stazione: su un lato pari il centro cade fra
   * due colonne, e la spezzata della fune — che la cabina percorre e la vista
   * disegna — correrebbe mezzo voxel di lato rispetto ai piloni, che invece un
   * lato dispari centra esatti. Cinque sono due cubi e mezzo di terreno: si
   * riconosce come edificio, e sta comodamente sotto `MAX_FOOTPRINT`.
   */
  stationSide: 5,

  /**
   * Luce minima fra i due capi, in voxel.
   *
   * Sotto questa soglia il compito e' di `crossings/`, che un ponte lo fa gia' e
   * ci si cammina sopra. Trentadue voxel sono sedici cubi di terreno: una
   * funivia piu' corta di cosi' sarebbe un ascensore in orizzontale, e a schermo
   * si leggerebbe come un errore di scala.
   */
  minLength: 32,

  /**
   * Luce massima, in voxel.
   *
   * Il doppio di `CROSSINGS.maxLength`, ed e' tutta la ragione per cui questo
   * dominio esiste: senza impalcato da reggere il limite non e' piu' la
   * struttura ma il gioco — oltre centonovantadue voxel, cioe' tre quarti del
   * lato di un'isola di riferimento, la linea non collega due rive ma annulla il
   * mare in mezzo.
   */
  maxLength: 192,

  /**
   * Colonne d'acqua che la linea deve scavalcare perche' sia una traversata.
   *
   * **Una funivia che non attraversa niente non e' questo strumento.** Senza
   * questa soglia il primo click su un prato tirerebbe una linea fra due punti
   * dello stesso prato, che e' un uso legittimo ma non quello per cui si paga:
   * ventiquattro voxel sono dodici cubi di terreno, cioe' un braccio di mare che
   * a piedi si aggira soltanto.
   */
  minWaterGap: 24,

  /**
   * Quanto lontano dal click si cerca la riva, in voxel.
   *
   * Stessa concessione di `CROSSINGS.shoreSearch`, e per la stessa ragione: il
   * click dice «di qua», non «esattamente sul voxel di battigia».
   */
  shoreSearch: 24,

  /**
   * Quanto la stazione puo' arretrare dalla riva per trovare la propria
   * piazzola, in voxel.
   *
   * **Il lungomare di una citta' cresciuta e' costruito**, ed e' il caso normale
   * e non l'eccezione: una regola che pretendesse la piazzola sulla battigia
   * rifiuterebbe la funivia proprio dove la citta' c'e'. Si cerca quindi la
   * piazzola buona **piu' vicina all'acqua** camminando all'indietro, e
   * ventiquattro voxel — dodici cubi di terreno, un isolato — sono quanto si
   * concede prima di ammettere che di qua non si parte.
   *
   * Oltre questa soglia la risposta onesta e' che di qua non si parte: una
   * stazione mezzo isolato dentro non serve piu' la riva che dice di servire.
   */
  maxSetback: 24,

  // --- Quote --------------------------------------------------------------

  /**
   * Voxel fra la pancia della cabina e cio' che le passa sotto.
   *
   * E' il franco della linea sul suolo, sugli alberi e sui tetti insieme: chi
   * pianifica non guarda il terreno ma **la prima quota libera** di ogni
   * colonna, che sopra un edificio e' il suo tetto. Sei voxel sono tre cubi di
   * terreno — abbastanza perche' da sotto si veda passare, non tanti da farla
   * sparire nel cielo.
   */
  cabinClearance: 6,

  /**
   * Franco della cabina sul pelo dell'acqua, in voxel.
   *
   * Piu' generoso di quello a terra e per una ragione che si vede: sotto una
   * funivia che scavalca uno stretto ci passano i traghetti, che sono alti tre
   * voxel piu' la tuga. Dieci lasciano il margine e fanno leggere la traversata
   * come un volo invece che come un guado.
   */
  waterClearance: 10,

  /**
   * Quanto la cabina pende sotto la fune, in voxel.
   *
   * E' la lunghezza dell'attacco, ed e' l'unica misura della cabina che sta qui
   * invece che in `traffic/config.ts`: non descrive il mezzo ma il rapporto fra
   * il mezzo e la linea, ed e' quello che la quota della fune deve tenere in
   * conto per non far strisciare niente.
   */
  cabinDrop: 3,

  /**
   * Quota minima della fune sopra il piano della stazione, in voxel.
   *
   * Senza, su due rive alte e affacciate la fune correrebbe a filo del terreno e
   * la stazione sarebbe una piazzola: dodici voxel sono sei cubi di terreno,
   * cioe' una torre che si riconosce come torre.
   */
  minStationRise: 12,

  /**
   * Quota massima della fune sopra il piano di una stazione, in voxel.
   *
   * E' il rifiuto `tooTall`, e dice una cosa precisa: fra i due capi c'e'
   * qualcosa di talmente alto che per scavalcarlo la linea partirebbe da una
   * torre piu' alta della citta'. Quel luogo vuole un ponte fra grattacieli, non
   * una funivia.
   */
  maxStationRise: 56,

  /**
   * Freccia della fune, come frazione della campata che pende.
   *
   * **Ed e' cio' che la fa leggere come una fune.** Un cavo teso in linea retta
   * fra due torri e' un tirante: la pancia e' l'unica cosa che dica «qui non c'e'
   * struttura, c'e' una corda». Quattro centesimi e mezzo sono la pendenza che a
   * distanza isometrica si vede senza sembrare un cavo lento.
   */
  sagRatio: 0.045,

  /** Freccia massima, in voxel: oltre, una campata lunga sembrerebbe cedere. */
  maxSag: 6,

  /**
   * Passo con cui la spezzata della fune campiona la curva, in voxel.
   *
   * Non e' un dettaglio di disegno: e' la stessa spezzata che percorre la
   * cabina, quindi il passo decide insieme quanto e' liscia la curva e quanti
   * segmenti la vista costruisce. Quattro voxel — due cubi di terreno — su una
   * campata da trentadue danno otto tratti, che alla distanza di gioco e' gia'
   * una curva.
   */
  cableStep: 4,

  /**
   * Quanto il piano d'imbarco sta sotto la fune, in voxel.
   *
   * Due voxel: la cabina arriva **sopra** la banchina e non dentro, ed e' quel
   * mezzo cubo di scarto a far leggere l'attracco come un attracco.
   */
  deckDrop: 2,

  /** Tetto di chunk sporchi per pezzo scritto. Lo stesso delle campate. */
  maxDirtyChunks: 24,

  // --- Colori -------------------------------------------------------------

  /** Corpo della stazione: cemento, come tutto cio' che e' infrastruttura. */
  stationPalette: PALETTE_SLOTS.concrete,

  /** Banchina d'imbarco: la stessa pietra della carreggiata di un ponte. */
  deckPalette: PALETTE_SLOTS.stone,

  /** Testata e coronamento: la riga chiara che dichiara costruito un prisma. */
  copingPalette: PALETTE_SLOTS.concretePale,

  /** La fune. Non e' un voxel: e' il colore che la vista da' alle sue mesh. */
  cablePalette: PALETTE_SLOTS.metalDark,
} as const;
