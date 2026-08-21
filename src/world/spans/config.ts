import { PALETTE_SLOTS } from '../../engine/paletteSlots';

/**
 * Unica fonte di verita' dei numeri delle campate.
 *
 * Vale la stessa regola di `terrain/config.ts`, `streets/config.ts`,
 * `grading/config.ts` e `landmarks/config.ts`: nessun altro file di
 * `src/world/spans/` contiene una lunghezza, una quota o un indice di palette.
 *
 * **Perche' esiste questo dominio.** Fino alla 4.4 la citta' cresceva per
 * aggregazione ma restava tutta appoggiata al suolo: due file di edifici ai due
 * lati di una carreggiata non avevano modo di toccarsi, e l'unica cosa che
 * attraversava una strada era lo sguardo. La campata e' la prima struttura che
 * **non poggia a terra**, ed e' quello — non la sua forma — il fatto nuovo.
 *
 * **Una campata non prende suolo.** E' l'invariante del dominio, e da lui
 * discende tutto il resto: sotto un ponte la carreggiata si dipinge ancora, i
 * lotti si costruiscono ancora, e se un edificio cresce attraverso la campata a
 * cedere e' la campata. Il suolo appartiene a chi ci sta sopra. E' anche cio'
 * che tiene questa fase distinta dalla 4.9, dove il suolo artificiale i propri
 * appoggi ce li ha.
 *
 * **Cio' che regge si vede.** Un impalcato che sembra galleggiare toglie proprio
 * l'informazione per cui esiste: e' il salto sotto di lui a dire l'altezza. Da
 * qui la sezione in tre righe — travi, carreggiata, parapetto — invece di un
 * piano da un voxel, che a distanza di gioco legge come un nastro incollato al
 * cielo.
 */

/**
 * Cosa collega una campata.
 *
 * Sono tre righe della stessa regola e non tre meccanismi: cambia la quota da
 * cui si parte e cosa dev'esserci nel vuoto. Il ponte scavalca la carreggiata e
 * chiede il franco di un sottopasso; il mezzanino resta dentro l'isolato,
 * all'altezza del basamento che la fila gia' condivide, e sopra una strada non
 * avrebbe l'aria per starci; la piazza copre il cuore di un isolato e non ha due
 * appoggi ma tre o piu'.
 */
export const SPAN_KIND = {
  /** Passerella fra due tetti, sopra la carreggiata. */
  bridge: 0,
  /** Collegamento a quota di basamento fra due membri della stessa fila. */
  mezzanine: 1,
  /** Impalcato abitato sopra il cuore di un isolato: il nodo della rete. */
  plaza: 2,
} as const;

export type SpanKind = (typeof SPAN_KIND)[keyof typeof SPAN_KIND];

/** Cosa un tipo di campata pretende dal luogo. Indicizzata come `SPAN_KIND`. */
export interface SpanRule {
  /**
   * true se il vuoto deve contenere almeno una colonna di carreggiata.
   *
   * E' cio' che distingue i tipi dal lato del luogo, e non e' una preferenza
   * estetica: un ponte che non scavalca niente e' un corridoio sospeso, e un
   * mezzanino sopra una strada e' un ostacolo alto cinque voxel in mezzo alla
   * carreggiata. Il ponte lo pretende, gli altri due lo escludono.
   */
  readonly overStreet: boolean;

  /** Voxel liberi fra la trave piu' bassa e il terreno piu' alto del vuoto. */
  readonly clearance: number;

  /** Quanto la carreggiata deve stare sopra la base degli appoggi. */
  readonly minRise: number;

  /** Livello minimo di ogni appoggio. */
  readonly minLevel: number;

  /**
   * Larghezza dell'impalcato in voxel. Per la piazza e' il lato **minimo**.
   *
   * «Abbastanza larga da essere abitata e non un filo teso»: sei voxel sono tre
   * cubi di terreno, cioe' due filari di parapetto e quattro di passaggio. A
   * quattro il passaggio e' due e ci si cammina; a tre sarebbe uno, che alla
   * scala di questo progetto e' mezzo cubo e legge come una trave.
   */
  readonly width: number;
}

export const SPANS = {
  /**
   * Vuoto minimo e massimo che una campata attraversa, in voxel.
   *
   * Il minimo e' la carreggiata secondaria, larga due: sotto, i due edifici si
   * toccano e non c'e' niente da collegare. Il massimo tiene dentro l'asse
   * principale con lo scarto dei lotti sui due lati, e il cuore di un isolato
   * stretto; oltre non e' piu' una passerella ma un viadotto, che ha bisogno di
   * appoggi propri a terra e quindi della 4.9.
   */
  minGap: 2,
  maxGap: 12,

  /**
   * Spessore strutturale sotto la carreggiata, in voxel.
   *
   * Sono le travi longitudinali, ed e' la differenza fra una passerella e un
   * nastro: due voxel — un cubo di terreno — bastano perche' di taglio la
   * campata abbia un'altezza propria. Sotto le travi c'e' aria, quindi da sotto
   * si vede attraverso: e' una travatura, non una soletta.
   */
  girderDepth: 2,

  /**
   * Colonne, a ciascuna testata, in cui le travi riempiono tutta la larghezza.
   *
   * E' la mensola su cui la campata si appoggia all'edificio. Senza, le due
   * travi entrerebbero nel muro come due stecchi e il punto di appoggio — che e'
   * cio' che il gate chiede di rendere vero *e* visibile — non si leggerebbe.
   */
  corbel: 2,

  /**
   * Lunghezza massima di un segmento, in voxel.
   *
   * **Le campate lunghe si spezzano, non si esentano.** E' la stessa regola che
   * il commento di `LANDMARK.maxDirtyChunks` gia' annunciava per le ricette
   * troppo grosse, e otto voxel — quattro cubi di terreno — la rendono viva sul
   * terreno vero invece che solo nei test: una campata sopra un asse principale
   * ne conta due, e compare per campate come un ponte vero.
   */
  segmentLength: 8,

  /**
   * Da quanto sotto il tetto piu' basso **comincia** la ricerca della quota.
   *
   * Non e' la quota della carreggiata: quella la trova `highestLanding`,
   * scendendo da qui finche' i due corpi non si affacciano davvero. E' solo il
   * punto di partenza, e serve a saltare il coronamento — che e' alto due-quattro
   * voxel e gia' ristretto, quindi un ponte attaccato li' sarebbe una passerella
   * di servizio sul tetto invece di un piano che continua.
   *
   * Tenerlo basso e' cio' che rende la regola applicabile: ogni voxel di
   * `deckDrop` in piu' e' una quota candidata in meno, e insieme un edificio di
   * altezza pari a quel valore che smette di poter reggere qualsiasi campata.
   */
  deckDrop: 4,

  /**
   * Campate proposte al massimo da una passata, e tick fra due passate.
   *
   * La passata ha un cursore come `upgradePass`, quindi il costo non cresce con
   * la citta'. La cadenza e' piu' lenta di quella degli upgrade perche' una
   * campata ha bisogno di due edifici gia' alti: proporla piu' spesso vorrebbe
   * dire ripassare gli stessi record per sentirsi dire di no.
   */
  perPass: 2,
  ticksPerPass: 20,

  /**
   * Record esaminati da una passata.
   *
   * Come `BUILDER.upgradesPerPass`, e per la stessa ragione: e' il numero che
   * tiene il costo della passata indipendente dal numero di edifici.
   */
  examinedPerPass: 48,

  /**
   * Campate che un singolo edificio puo' reggere.
   *
   * Serve alla forma della rete, non alla struttura: senza, l'albero di
   * connessione farebbe di una torre alta e centrale lo snodo di otto ponti,
   * perche' e' compatibile con tutti. Tre lascia passare un percorso — entra,
   * esce, e una diramazione — e distribuisce il resto sui vicini.
   */
  maxPerSupport: 3,

  /**
   * Chunk che un **segmento** puo' marcare sporchi.
   *
   * E' lo stesso tetto degli edifici, e non e' un caso: da quando i segmenti
   * esistono, nessuna struttura ha piu' bisogno di un'eccezione: se un segmento
   * non ci sta, e' `segmentLength` a doversi accorciare.
   */
  maxDirtyChunks: 24,

  // Qui stava `align: TERRAIN.cellSize`, il passo con cui l'impalcato si
  // allineava al cubo di terreno. Non c'e' piu': quel passo esiste perche' un
  // **lotto** poggi su cubi interi, e una campata il terreno non lo tocca.
  // Allinearla la spostava di un voxel rispetto al centro del fronte comune, ed
  // era il voxel di troppo — le fasce rientrano centrate, quindi un impalcato
  // centrato trova la parete e uno spostato di uno la manca da un lato, su ogni
  // edificio e a ogni quota.

  /**
   * Di quanto il mezzanino sta sopra il basamento che la fila condivide.
   *
   * **A filo dello zoccolo non ci sta.** Il basamento e' alto
   * `CLUSTER.baseHeight`, cioe' sei voxel: un impalcato posato sulla sua
   * sommita' lascerebbe sotto di se' tre voxel di aria una volta tolte le travi,
   * che alla scala di questo progetto e' mezzo piano — e a schermo legge come una
   * passerella appoggiata sull'erba, non come un mezzanino. Una fascia piu' su e'
   * anche cio' che la parola dice: un mezzanino e' il piano sopra il piano terra,
   * e da quello condiviso ci si arriva.
   */
  mezzanineRise: 6,

  /**
   * Larghezza da cui il cuore dell'impalcato diventa verde.
   *
   * Sotto, l'interno e' tutto passaggio e piantarlo lascerebbe due filari di
   * aiuola senza un posto da cui guardarli. E' la stessa soglia di spirito di
   * `GRAMMAR.terraceMinSide`: un luogo comincia a esistere quando ci si sta.
   */
  plantedMinWidth: 6,

  /** La piazza in quota: il nodo della rete, sopra il cuore di un isolato. */
  plaza: {
    /**
     * Appoggi minimi sul perimetro dell'isolato.
     *
     * Due appoggi darebbero un ponte largo, che e' gia' la riga `bridge`. A tre
     * l'impalcato e' retto su lati diversi e legge come un piano sospeso invece
     * che come una traversata — ed e' anche la ragione per cui puo' fare da
     * nodo: le campate ci arrivano da direzioni diverse.
     */
    minSupports: 3,

    /**
     * Isolati a cui una passata prova a dare una piazza.
     *
     * Cercare il cuore libero costa una scansione dell'isolato, che e' la cosa
     * piu' cara del dominio: due tentativi per passata la tengono a un paio di
     * migliaia di letture ogni `ticksPerPass` tick, e una piazza per isolato si
     * costruisce comunque una volta sola.
     */
    attemptsPerPass: 4,

    /**
     * Lato minimo e massimo del cuore, in voxel.
     *
     * Il minimo e' il lato sotto cui una piazza non e' una piazza ma uno slargo:
     * sei voxel sono tre cubi di terreno, cioe' l'ingombro di una casa piccola.
     * A otto restavano fuori dodici isolati su ventidue, perche' un isolato di
     * ventidue colonne con gli edifici su tutti e quattro i fronti lascia in
     * mezzo pochissimo. Il massimo e' quanto un impalcato retto solo ai bordi
     * copre prima di chiedere a occhio un appoggio in mezzo, che una campata per
     * definizione non ha: quello e' suolo artificiale, cioe' la 4.9.
     */
    minSide: 6,
    maxSide: 16,

    /**
     * Colonne contigue con cui un edificio deve toccare il bordo della piazza
     * per contare come appoggio.
     *
     * Un edificio che la sfiora per un voxel d'angolo non la regge, e contarlo
     * riempirebbe la soglia di `minSupports` con appoggi che a schermo non si
     * vedono. Quattro voxel sono due cubi di terreno: il minimo perche' il punto
     * d'attacco si legga come tale.
     */
    minAbutRun: 4,

  },

  /**
   * Colore della carreggiata, per tipo di campata.
   *
   * Il parapetto non e' qui: lo emette `emitRoofTech` con il proprio slot, ed e'
   * lui a dare il contrasto. Qui serve solo un piano che non si confonda con il
   * tetto da cui parte.
   */
  deckPalette: [
    PALETTE_SLOTS.concreteLight,
    PALETTE_SLOTS.stoneWarm,
    PALETTE_SLOTS.stone,
  ] as readonly number[],

  /** Travi e mensole: e' la struttura, e porta la grammatica delle infrastrutture. */
  girderPalette: PALETTE_SLOTS.metalDark,

  /** Verde del cuore dell'impalcato, con gli slot che la 4.3 usa gia' sui tetti. */
  gardenPalette: PALETTE_SLOTS.grassLight,

  /** Le tre righe della regola, indicizzate come `SPAN_KIND`. */
  rules: [
    // ponte — scavalca la carreggiata, alto sopra i tetti
    {
      overStreet: true,
      // **Due cubi di terreno di aria sotto le travi.** E' poco, ed e' misurato
      // e non scelto: la citta' di oggi e' alta una sessantina di voxel e le sue
      // fasce rientrano in fretta, quindi l'unica fascia larga abbastanza da
      // reggere un impalcato da quattro sta fra il quarto e l'ottavo voxel sopra
      // il suolo. Con un franco piu' generoso il pavimento saliva sopra quella
      // fascia e **nessuna coppia** passava piu': non un ponte piu' alto, zero
      // ponti. A liberare la quota sara' la 4.6, che alza i tre tetti che tengono
      // la citta' a mezz'aria; qui si costruisce con l'altezza che c'e'.
      clearance: 4,
      minRise: 6,
      // **Il livello e' un prefiltro, non il vincolo.** A dire se un edificio e'
      // abbastanza alto e' `minRise`, che guarda la quota vera; il livello
      // guarda una fascia di catalogo e sbaglia in entrambe le direzioni. Tenuto
      // a tre escludeva quattro edifici su cinque prima ancora di misurarli, e su
      // una citta' cresciuta davvero non passava piu' nessuna coppia. A uno
      // restano fuori le sole casupole di livello zero, e a decidere e' la quota.
      minLevel: 1,
      // **Quattro e non sei.** Sei voxel di fronte comune sono piu' di quanto due
      // impronte affacciate su una strada quasi mai condividano — le impronte
      // vanno da quattro a otto e si accostano al fronte, non l'una all'altra —
      // e a sei la regola rifiutava per `tooNarrow` la meta' delle coppie che
      // avevano superato tutto il resto. Quattro sono due cubi di terreno: due
      // filari di parapetto e due di passaggio, che e' un passaggio vero. A
      // portare la larghezza abitata e' la piazza, che nasce su un cortile e non
      // ha un fronte comune da rispettare.
      width: 4,
    },
    // mezzanino — dentro l'isolato, alla quota del basamento condiviso
    {
      overStreet: false,
      // Due cubi: un mezzanino attraversa un cuore d'isolato, non una strada, e
      // il franco che gli serve e' quello di un portico.
      clearance: 4,
      minRise: 4,
      minLevel: 1,
      width: 4,
    },
    // piazza — sopra il cuore dell'isolato, retta dal suo perimetro
    {
      overStreet: false,
      // Le stesse quote del ponte, e per la stessa ragione misurata: la citta'
      // di oggi e' alta una sessantina di voxel e le sue fasce rientrano in
      // fretta. Chiedere di piu' non alza la piazza, la cancella.
      clearance: 4,
      minRise: 6,
      minLevel: 1,
      // Non e' la larghezza dell'impalcato — quella e' il cuore dell'isolato,
      // tale e quale — ma il lato sotto cui non vale la pena: lo dice
      // `SPANS.plaza.minSide`, e questo campo resta allineato a lui.
      width: 6,
    },
  ] as readonly SpanRule[],
} as const;
