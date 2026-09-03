import { VISUAL_LEVELS } from './visual';

/**
 * La campata dell'edificio: quando due fronti smettono di guardarsi e si
 * toccano.
 *
 * **Non e' una campata di `spans/`, ed e' la distinzione che questo file
 * esiste per tenere.** Una campata di `spans/` e' un record proprio, con un
 * generatore proprio, che *cade* quando i suoi appoggi cambiano sagoma: e'
 * infrastruttura appoggiata a due edifici. Questa e' massa dell'edificio —
 * stesso record, stessa vernice, stesso livello — e cresce con lui. Da fuori le
 * due si distinguono a colpo d'occhio, ed e' esattamente cio' che si vuole: un
 * ponte si legge come qualcosa che *attraversa*, un braccio come qualcosa che
 * *continua*.
 *
 * **Il braccio e' mezzo arco.** Nessun record esce dalle colonne di un altro:
 * i due edifici si sporgono ciascuno per meta' del vuoto e si incontrano in
 * mezzo alla carreggiata. E' cio' che permette all'arco di esistere senza
 * toccare un solo invariante — `overlaps` continua a confrontare due riquadri
 * che non si intersecano, e nessuno dei due prende il suolo dell'altro.
 *
 * **Verso `facing` e da nessun'altra parte**, come lo sbalzo. Non e' prudenza:
 * l'inviluppo cresce su un asse solo, e un braccio verso il cuore dell'isolato
 * farebbe collidere due membri della stessa fila — la stessa ragione per cui
 * `envelopeOf` non e' simmetrico. E' anche il verso giusto per l'immagine: il
 * vuoto che una campata scavalca e' la strada, e la strada sta li'.
 */
export const ARCH = {
  /**
   * Tick fra una passata e la successiva, e coppie proposte da una passata.
   *
   * Piu' lenta delle campate di `spans/`, che sono gia' la passata lenta: una
   * coppia ha bisogno di due edifici maturi che si guardino *e* che abbiano una
   * quota di fascia in comune, e la coincidenza e' rara per costruzione.
   * Riproporla piu' spesso vorrebbe dire ripassare gli stessi record per
   * sentirsi dire di no.
   */
  ticksPerPass: 40,
  perPass: 1,

  /**
   * Record esaminati da una passata.
   *
   * Come `BUILDER.upgradesPerPass` e `SPANS.perPassRecords`: e' il numero che
   * tiene il costo indipendente dal numero di edifici, con il cursore a
   * garantire che nessuno resti indietro per sempre.
   */
  perPassRecords: 48,

  /**
   * Livello da cui un edificio puo' gettare un braccio.
   *
   * E' la soglia di **torre**, non quella di maturo, e la ragione e' di
   * lettura: la campata di facciata e la lama d'accento arrivano prima, e un
   * arco su un edificio che non ha ancora nessuna delle due si legge come un
   * errore di posa invece che come il gesto di una citta' cresciuta. E' anche
   * la soglia oltre cui il corpo ha abbastanza fasce perche' due vicini ne
   * abbiano una in comune.
   */
  minLevel: VISUAL_LEVELS.tower,

  /**
   * Vuoto minimo e massimo fra le due impronte, in voxel.
   *
   * Il minimo e' la carreggiata secondaria: sotto, i due edifici si toccano gia'
   * e non c'e' niente da scavalcare. Il massimo e' quello delle campate di
   * `spans/` meno lo scarto dei lotti — un braccio non ha appoggi propri, quindi
   * ogni voxel oltre e' mensola pura, e oltre otto per lato la lastra si
   * leggerebbe come un aggetto impossibile invece che come un arco.
   */
  minGap: 2,
  maxGap: 10,

  /**
   * Spessore del corso, in voxel.
   *
   * Tre e non due, che e' lo spessore delle travi di una campata: la differenza
   * e' cio' che a distanza distingue un piano che continua da una passerella
   * appesa. Sotto tre, di taglio, il braccio torna un nastro.
   */
  rise: 3,

  /**
   * Colonne di rinfianco alla radice del braccio.
   *
   * **E' cio' che rende l'arco un arco.** Il corso e' piano di sopra e scende
   * di un voxel per colonna avvicinandosi al muro: da sotto, i due bracci che si
   * incontrano disegnano una spalla che si allarga verso l'imposta, che e' la
   * sagoma di una campata e non di una mensola. Zero darebbe due lastre che si
   * toccano in punta.
   */
  haunch: 2,

  /**
   * Larghezza del braccio lungo il fronte, in voxel.
   *
   * Il minimo e' il lato minimo di una fascia (`GRAMMAR.minBandSide` e' quattro,
   * e un braccio piu' stretto della parete che lo genera si leggerebbe come un
   * dettaglio); il massimo tiene il braccio dentro il fronte anche quando i due
   * edifici sono larghi il doppio l'uno dell'altro, dove prendere tutto il
   * sovrapposto darebbe una soletta continua invece di una campata.
   */
  minWidth: 4,
  maxWidth: 8,

  /**
   * Franco minimo fra il terreno e l'intradosso, in voxel.
   *
   * Sotto il braccio ci passa la carreggiata, e la carreggiata e' l'unica cosa
   * che lo giustifica: un arco a sei voxel dal marciapiede e' un portico, non
   * una campata. Dodici sono due piani della grammatica.
   */
  minClearance: 12,

  /**
   * Quanto le due quote di fascia possono differire perche' contino come una,
   * in voxel.
   *
   * **Zero sarebbe la regola giusta e non si avvererebbe mai.** Due vicini sono
   * complanari per costruzione solo sulla sommita' del corso di base condiviso,
   * che sta sotto `minClearance`; piu' in alto le fasce pescano l'altezza da
   * canali separati e le quote si scostano di un voxel o due. La tolleranza e'
   * cio' che rende la regola applicabile, e due voxel — un cubo di terreno — e'
   * lo scarto che a distanza isometrica non si vede.
   */
  plumb: 2,

  /**
   * Quanto sotto la cima di un corpo la ricerca della quota **comincia**.
   *
   * La stessa ragione di `SPANS.deckDrop`: sopra c'e' il coronamento, gia'
   * ristretto, e un arco attaccato li' sarebbe una passerella di servizio sul
   * tetto. Piu' alto di `deckDrop` perche' qui il corso e' anche piu' spesso.
   */
  crownDrop: 6,
} as const;
