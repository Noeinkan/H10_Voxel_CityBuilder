import { PALETTE_SLOTS } from '../../engine/paletteSlots';

/**
 * Unica fonte di verita' dei numeri della citta' in quota.
 *
 * Vale la stessa regola di `terrain/config.ts`, `streets/config.ts`,
 * `grading/config.ts` e `spans/config.ts`: nessun altro file di
 * `src/world/aerial/` contiene uno sporto, una luce, un franco o un indice di
 * palette.
 *
 * **Perche' esiste questo dominio.** Fino alla 4.5 la citta' sapeva sospendere
 * una struttura fra due edifici gia' alti nello stesso punto, e non sapeva fare
 * nient'altro in aria: nessuna mensola, nessun percorso piu' lungo di una
 * strada, nessuna quota che non fosse quella di una campata. Il commento della
 * regola delle campate dichiara il debito — «un impalcato con appoggi propri non
 * deve aspettare che due torri diventino alte nello stesso punto» — e questo
 * dominio e' quell'impalcato, in tutte le forme che prende.
 *
 * **Un impalcato in quota non prende suolo; lo prende solo la gamba che scende a
 * terra.** E' l'invariante del dominio, ed e' il complemento esatto di quello di
 * `spans/` («una campata non prende suolo»). Sotto una mensola o un percorso il
 * suolo resta di chi ci sta: la carreggiata si dipinge ancora e i lotti si
 * costruiscono ancora, tranne nelle due colonne di una gamba, che sono suolo
 * preso come quello di un edificio.
 *
 * **Nessuna quota e' imposta da fuori.** L'aggetto prende la quota dalla sommita'
 * di una fascia del proprio ospite, il tratto di percorso da dove i due corpi si
 * affacciano davvero, la gamba dal primo appoggio che trova scendendo. Non esiste
 * una griglia di livelli, e per la stessa ragione qui non esiste `align`: le
 * campate l'hanno gia' tolto — allineare al cubo di terreno sposta l'impalcato di
 * un voxel rispetto alla parete da cui parte, e le fasce rientrano centrate. Un
 * lotto in quota eredita la fase dall'impalcato che lo ospita, non dal terreno.
 */

/**
 * Le parti di cui la citta' in quota e' fatta.
 *
 * Sono quattro valori di un campo solo sul record, ed e' lo stampo esatto di
 * `SPAN_KIND`: un flag dice quale forma si sta guardando, e occupazione,
 * collisione, budget di chunk e comparsa a budget restano la macchina che c'e'
 * gia'. Rispondono a due domande e non a una:
 *
 * - **prende suolo?** solo la gamba;
 * - **ci si costruisce sopra?** tutto tranne il tratto di percorso e la gamba.
 */
export const AERIAL_PART = {
  /** Mensola che sporge da un fronte: ci si sta, e ci si costruisce. */
  terrace: 0,
  /** Tratto di percorso: ci si passa, e non ci si costruisce mai. */
  walk: 1,
  /** Nodo fra due tratti, anche a quote diverse: ci si sta e ci si costruisce. */
  node: 2,
  /** Gamba, dal proprio piede fino sotto la travatura: l'unica che prende suolo. */
  pier: 3,
  /**
   * Montante: la guida verticale che porta da terra a un impalcato abitato.
   *
   * **E' la sola parte che risponde alla domanda del gate**, «ci si muove fra i
   * livelli». Prende suolo come una gamba, e come lei non si costruisce sopra:
   * la differenza e' cio' che ci corre addosso — una guida, non del cemento — e
   * il fatto che nasce da un impalcato che qualcuno abita invece che da uno
   * sbalzo da reggere.
   */
  lift: 4,
} as const;

export type AerialPart = (typeof AERIAL_PART)[keyof typeof AERIAL_PART];

/** true se questa parte occupa il suolo della propria colonna. */
export function takesGround(part: AerialPart): boolean {
  return part === AERIAL_PART.pier || part === AERIAL_PART.lift;
}

/** true se sopra questa parte puo' nascere un edificio. */
export function isBuildable(part: AerialPart): boolean {
  return part === AERIAL_PART.terrace || part === AERIAL_PART.node;
}

export const AERIAL = {
  /**
   * Spessore strutturale sotto il piano calpestabile.
   *
   * Come per la campata, e per la stessa ragione: **cio' che regge si vede**. Un
   * piano da un voxel appeso a una parete legge come un vassoio, non come una
   * terrazza; con due — un cubo di terreno — di taglio l'aggetto ha un'altezza
   * propria e da sotto si vede che c'e' una trave a tenerlo su.
   */
  girderDepth: 2,

  /**
   * Voxel liberi fra la trave piu' bassa e cio' che c'e' sotto.
   *
   * Quattro, come le campate, e per la stessa ragione **misurata**: la 4.5 ha
   * provato sei e otto, e non ha alzato le strutture — le ha cancellate. La
   * fascia in cui una parete e' larga abbastanza da reggere un impalcato sta
   * bassa, e ogni voxel di franco in piu' porta il piano sopra quella fascia.
   */
  clearance: 4,

  /**
   * Quanto il piano deve stare sopra il terreno della colonna piu' alta sotto.
   *
   * Sei voxel sono tre cubi: la soglia sotto cui un aggetto non legge come un
   * piano di citta' ma come una tettoia sopra la testa. E' anche il `minRise`
   * del ponte, e non e' un caso — sono la stessa domanda posta due volte.
   */
  minRise: 6,

  /**
   * Da quanto sotto la cima comincia la ricerca della quota d'attacco.
   *
   * Stessa idea di `SPANS.deckDrop`: salta il coronamento, che e' alto pochi
   * voxel e gia' ristretto, quindi una mensola attaccata li' sarebbe un cornicione
   * sul tetto invece di un piano che continua fuori dall'edificio.
   */
  deckDrop: 3,

  /** L'aggetto: la mensola che sporge da un fronte. */
  terrace: {
    /**
     * Corsa minima di parete a cui una mensola si attacca.
     *
     * Quattro voxel sono due cubi di terreno, cioe' la larghezza dell'impalcato
     * di un ponte — «due filari di parapetto e due di passaggio, che e' un
     * passaggio vero». Sotto, l'attacco e' piu' stretto della cosa che regge.
     */
    minRun: 4,

    /**
     * Sporto minimo e massimo, in voxel.
     *
     * Il minimo e' tre, cioe' la soglia di `GRAMMAR.terraceMinSide`: sotto, la
     * pavimentazione mentirebbe e il parapetto sarebbe un bordo che nessuno legge
     * come praticabile. Il massimo e' otto, l'impronta massima di un edificio:
     * una mensola piu' profonda di cosi' non e' piu' un aggetto ma un edificio
     * appeso, e a quel punto conviene che sia un edificio.
     *
     * **Il massimo esiste anche per farsi le gambe.** Oltre `reach` la mensola
     * non sta piu' in piedi da sola, e `planDeck` le pianta un appoggio: e' cosi'
     * che un aggetto grosso si costruisce i propri piloni senza una regola a
     * parte per lui.
     */
    minOverhang: 3,
    maxOverhang: 8,

    /**
     * Di quanto la parete d'attacco puo' essere rientrata dal filo dell'impronta.
     *
     * Gli edifici di questo progetto sono piramidali: piu' in alto si guarda, piu'
     * la parete e' lontana dal filo. Una mensola attaccata a una fascia molto
     * rientrata partirebbe dal centro dell'edificio e uscirebbe da tutti e due i
     * lati — un cappello, non un aggetto. Tre voxel tengono la mensola sul piano
     * della facciata, che e' cio' che la fa leggere come una cosa che sporge.
     *
     * E' anche il motivo per cui la mensola puo' invadere il rientro: quelle
     * poche colonne sono la terrazza che la grammatica produce gia', e l'aggetto
     * la continua verso fuori invece di ricominciarla accanto.
     */
    maxRecess: 3,

    /**
     * Quote su cui si prova a posare, dalla piu' alta in giu'.
     *
     * Il limite esiste per il costo, non per la forma: ogni tentativo e' una
     * scansione del volume, e la quota buona — se c'e' — sta quasi sempre nelle
     * prime. E' la stessa idea di `SPANS.plaza.attemptsPerPass`.
     */
    attempts: 4,

    /**
     * Da che punto della facciata comincia un balcone, in frazione dell'altezza
     * dell'ospite.
     *
     * **Vale solo dove la sagoma non detta la quota.** Dove una fascia rientra,
     * l'aggetto continua la terrazza che c'e' gia' e quella quota e' un fatto
     * dell'edificio: li' non si sceglie niente, e la scansione dal basso resta
     * quella che rende complanari due vicini. Su **facciata piena** invece nessuna
     * quota e' migliore di un'altra, e prendere comunque la piu' bassa voleva dire
     * `minRise` — tre cubi sopra il marciapiede. Su meta' della citta', che sale a
     * prisma e non arretra mai, e' li' che finivano tutte: una mensola appiccicata
     * al piede di una torre di trenta cubi non si legge come un piano in facciata
     * ma come una pensilina sopra la strada.
     *
     * Una frazione e non una quota fissa perche' cio' che conta e' **dove sta
     * sulla facciata**, non a che altezza dal suolo: quattro decimi mettono il
     * balcone appena sopra il basamento in una torre e a mezza altezza in un
     * corpo basso, che e' la stessa lettura in due edifici diversi.
     */
    facadeRise: 0.42,

    /**
     * Le forme in pianta di una mensola: che parte della corsa occupa, quanto
     * sporge, a quale capo si appoggia.
     *
     * **Prima ce n'era una sola, e non per scelta.** `overhangOf` legava lo sporto
     * alla lunghezza della corsa — «quanto e' larga, tanto e' profonda» — e dentro
     * i due estremi quella riga e' l'identita': con `MAX_FOOTPRINT` a otto, ogni
     * corsa fra tre e otto usciva **quadrata**. La regola resta, ma come *misura
     * di riferimento* invece che come risultato: qui ogni forma la piega a modo
     * suo, e le mensole di una citta' smettono di essere lo stesso quadrato in
     * quattro dimensioni.
     *
     * - `run` — frazione della corsa occupata; 1 e' tutto il fronte.
     * - `depth` — frazione dello sporto di riferimento.
     * - `align` — dove il riquadro si appoggia sulla corsa: 0 il capo basso, 1
     *   quello alto, 0,5 centrato.
     *
     * Sono quattro perche' tre danno ancora una rotazione riconoscibile su una
     * fila di edifici uguali, e il quarto e' il gemello speculare del terzo: e'
     * la coppia che fa leggere due vicini come due edifici invece che come due
     * copie.
     */
    forms: [
      // Balcone: tutto il fronte, sporto minimo. E' la mensola sottile, quella
      // che disegna una linea sulla facciata invece di aggiungerle un volume.
      { run: 1, depth: 0.4, align: 0.5 },
      // Loggia: quasi tutto il fronte e sporto pieno, centrata. E' la piu' vicina
      // alla mensola di prima, e resta la piu' abitabile.
      { run: 0.75, depth: 1, align: 0.5 },
      // Ala: mezzo fronte, sporto quasi pieno, spinta a un capo. E' quella che
      // rompe la simmetria della facciata.
      { run: 0.55, depth: 0.85, align: 0 },
      // Sperone: poco fronte e sporto pieno, all'altro capo. Piu' profondo che
      // largo, cioe' l'unica forma che sporge davvero invece di allargarsi.
      { run: 0.5, depth: 1, align: 1 },
    ],

    /**
     * Fin dove la trave bassa accompagna la mensola, oltre il filo della parete.
     *
     * **E' la rastremazione, ed e' il motivo per cui una mensola non e' una
     * cassa.** La travatura da due voxel su tutto il perimetro dava alla punta lo
     * stesso spessore dell'attacco: da sotto e da lontano leggeva come una lastra
     * di calcestruzzo alta tre voxel, cioe' un piano e mezzo di edificio appeso al
     * muro. Due voxel di trave presso la parete e niente piu' in la' danno la
     * sezione che una mensola ha davvero — grossa dove scarica, sottile dove
     * finisce — e non costano un voxel in piu' a nessun budget: ne tolgono.
     */
    taperReach: 2,

    /**
     * Smusso massimo degli angoli esterni, in voxel.
     *
     * I due angoli lontani dalla parete sono i soli che si vedono per intero da
     * fuori, ed erano due spigoli retti: tagliarli in diagonale e' la differenza
     * fra un riquadro e una sagoma. Due voxel sono la meta' dello sporto minimo —
     * si legge dalla camera isometrica e non mangia il piano. Su una mensola
     * piccola si riduce da solo: `cornerCutOf` non taglia mai piu' di un terzo del
     * lato, o di un balcone da tre resterebbe il triangolo.
     */
    cornerCut: 2,

    /**
     * Mensole proposte al massimo da una passata, e tick fra due passate.
     *
     * Piu' rapida della rete perche' un aggetto chiede un edificio solo: e' il
     * dettaglio che rende abitata la quota, e serve che ce ne siano molti perche'
     * la citta' si legga intrecciata invece che punteggiata.
     */
    perPass: 2,
    ticksPerPass: 16,
    examinedPerPass: 64,

    /**
     * Mensole che un singolo edificio puo' portare.
     *
     * Una per fronte sarebbe quattro, e a quel punto l'edificio sparisce dentro
     * le proprie terrazze. Due lasciano una silhouette che si legge ancora, e
     * bastano perche' un percorso ci arrivi da due lati.
     */
    maxPerHost: 3,
  },

  /** La rete: percorsi lunghi con gambe proprie, fra edifici di isolati diversi. */
  route: {
    /** Larghezza di un tratto: la stessa del ponte, e per la stessa misura. */
    walkWidth: 4,

    /**
     * Larghezza fino a cui un tratto si allarga invece di piegare.
     *
     * Due fronti sfalsati di poco non hanno bisogno di una zeta: il tratto si
     * prende tutte e due le corse e diventa un viale in quota. Otto voxel sono
     * l'impronta massima di un edificio — oltre, non e' piu' un percorso ma un
     * impalcato, e per quello c'e' la mensola.
     */
    maxWidth: 8,

    /**
     * Lato di un nodo.
     *
     * Sei voxel sono tre cubi: il minimo perche' l'incrocio di due tratti larghi
     * quattro sia un luogo e non una piega. E' anche la soglia da cui il cuore di
     * un impalcato diventa verde, e da cui `MIN_FOOTPRINT` ci sta dentro: sul
     * nodo si puo' costruire, ed e' voluto — sono i pianerottoli abitati che
     * tengono su una rete invece dei semplici gomiti.
     */
    nodeSide: 6,

    /**
     * Distanza minima e massima, in voxel, fra i due capi che un percorso lega.
     *
     * **Il minimo valeva quattordici, e la ragione era sbagliata.** Diceva: sotto
     * il tetto delle campate ci pensa gia' la 4.5, meglio e senza gambe. Misurato
     * su una citta' cresciuta, **nessuna delle venti campate tocca una mensola**:
     * `planSpan` cerca due corpi affacciati e una mensola non e' un corpo, quindi
     * il vuoto corto fra due impalcati non lo colmava nessuno. Erano
     * centocinquantuno coppie su millequattrocento, ed erano le migliori — due
     * mensole vicine sullo stesso fronte stanno alla stessa quota e hanno in
     * mezzo la carreggiata, cioe' l'unico corridoio davvero sgombro di un
     * quartiere fitto.
     *
     * Sei voxel sono tre cubi: sotto, i due impalcati si toccano quasi, e un
     * tratto di passerella piu' corto del proprio parapetto non si legge come un
     * collegamento. Il massimo sono tre passi d'isolato: **e' il punto della
     * fase** — la rete attraversa piu' di un isolato — ma non mezza isola, o un
     * percorso solo costerebbe piu' chunk di un quartiere.
     */
    minSeparation: 6,
    maxSeparation: 66,

    /**
     * Dislivello massimo che un nodo assorbe.
     *
     * I due capi di un percorso quasi mai si affacciano alla stessa quota, e
     * costringerli a farlo cancellerebbe la rete invece di spianarla — e' la
     * lezione misurata del franco delle campate. Il nodo e' allora un
     * pianerottolo che tiene due quote: quattro voxel sono due cubi, cioe' un
     * salto che si legge come un mezzo piano e non come un dirupo.
     */
    stepPerNode: 8,

    /**
     * Pieghe massime di un percorso: la zeta e' la piu' complicata.
     *
     * E' la polilinea piu' articolata che si produca senza un pathfinding, che
     * questo progetto non ha. Oltre non e' piu' un collegamento ma un giro.
     */
    maxTurns: 2,

    /**
     * Pianerottoli massimi di un percorso.
     *
     * Servono a **salire**, e sono una cosa diversa dalle pieghe: un percorso
     * dritto fra due mensole a quote diverse ne ha bisogno tanto quanto uno che
     * gira. Quattro coprono, a `stepPerNode` per volta, un dislivello di
     * trentadue voxel — abbastanza per scavalcare un edificio che sta in mezzo,
     * che e' esattamente il motivo per cui la corsa si alza.
     */
    maxNodes: 4,

    /**
     * Di quanto un pianerottolo puo' scorrere lungo la corsa per trovare posto.
     *
     * Sedici voxel — otto cubi — in avanti o indietro dalla posizione ideale. E'
     * il numero che fa esistere la rete: un nodo e' un blocco alto quanto il
     * salto che assorbe, e a distanze fisse finisce quasi sempre dentro qualcosa.
     */
    hubSlide: 16,

    /**
     * Percorsi proposti al massimo da una passata, e tick fra due passate.
     *
     * Piu' lenta della passata delle mensole: un percorso e' molti record e molti
     * chunk, e proporne uno a ogni giro riempirebbe il cielo prima che sotto ci
     * sia una citta' da collegare.
     */
    perPass: 1,
    ticksPerPass: 24,
    examinedPerPass: 64,

    /** Percorsi che un singolo edificio puo' vedere arrivare. */
    maxPerHost: 2,

    /**
     * Di quanto la parete d'atterraggio puo' essere rientrata dal filo.
     *
     * Molto piu' larga di quella di una mensola, e **misurato**. Gli edifici di
     * questo progetto sono piramidali: alle quote alte la parete sta parecchio
     * dentro il riquadro, e con il limite della mensola — tre voxel — l'unica
     * parete che un percorso trovava era la sommita' del basamento. A quella
     * quota una corsa lunga venti o quaranta voxel passa dentro tutto quello che
     * incontra, e la rete restava a zero.
     *
     * Un percorso, a differenza di una mensola, non ha bisogno di stare sul
     * piano della facciata: gli basta una parete su cui atterrare. Otto e'
     * l'impronta massima, cioe' «ovunque dentro l'edificio».
     */
    maxRecess: 8,
  },

  /**
   * Livello minimo perche' un edificio possa portare qualcosa in quota.
   *
   * **Chi regge non cresce**, quindi ospitare e' una rinuncia: l'edificio si
   * ferma dov'e'. Chiedere che abbia gia' raggiunto il proprio tetto sarebbe la
   * regola piu' pulita, ed e' misurato che non funziona — la gerarchia della 4.6
   * alza il tetto man mano che il quartiere si riempie, e gli upgrade lo
   * inseguono a `upgradesPerPass` per volta, quindi su una citta' che cresce
   * quasi nessun edificio e' mai «arrivato»: su duecento infornate passavano
   * ventotto record su ottocento esaminati.
   *
   * Quattro su dodici e' invece una soglia che si raggiunge presto e che
   * garantisce comunque un corpo: sotto, l'ospite e' una casupola, e una mensola
   * attaccata a una casupola e' piu' grande di lei.
   */
  minHostLevel: 3,

  /**
   * Sbalzo massimo, in voxel, fra una colonna di impalcato e il suo appoggio.
   *
   * E' il numero che decide **da solo** dove nascono le gambe: ogni colonna
   * dev'essere entro questo raggio da una parete d'attacco o da una gamba, e dove
   * non lo e' `planDeck` ne pianta una. Sei voxel sono tre cubi, cioe' la meta'
   * della luce che la 4.5 aveva gia' dichiarato come confine («oltre quel lato
   * servirebbe un appoggio in mezzo, che una campata per definizione non ha»).
   *
   * Ne segue, senza nessuna regola in piu': una mensola corta non ha gambe, una
   * profonda se le conta da sola, un tratto lungo ne pianta una ogni tanto.
   */
  reach: 6,

  /**
   * Lato di una gamba, in voxel.
   *
   * Un cubo di terreno. A un voxel la gamba e' un filo e l'impalcato torna a
   * sembrare sospeso — che e' esattamente cio' che questo dominio esiste per
   * togliere; a quattro diventa un muro e sotto non ci si passa piu'.
   */
  pierSide: 2,

  /**
   * Di quanto una gamba puo' scorrere per cercare un appoggio migliore.
   *
   * **Una gamba si sposta per trovare un tetto.** Prima di piantarla nel prato la
   * si prova qualche colonna piu' in la': se li' sotto c'e' un edificio, la gamba
   * poggia sul suo tetto e il suolo resta libero. Non e' un vezzo — e' la
   * correzione dell'errore misurato del primo tentativo, in cui le gambe piantate
   * nei cuori d'isolato toglievano alla piazza della 4.5 il luogo per cui esiste.
   */
  nudge: 4,

  /**
   * Altezza massima di una gamba, in voxel.
   *
   * Ha lo stesso mestiere di `GRADING.maxWorksStep`: dice quanta struttura si e'
   * disposti a costruire prima di rinunciare. Quarantotto voxel sono ventiquattro
   * cubi — piu' del rilievo dell'isola e meno di una torre del centro.
   */
  maxPierHeight: 48,

  /**
   * Lato massimo di un segmento di comparsa, in voxel.
   *
   * **Gli impalcati grandi si spezzano, non si esentano.** Un percorso lungo
   * sessanta voxel marcherebbe sporchi tutti i suoi chunk nello stesso frame;
   * spezzato in riquadri da otto compare come compare un ponte, e il picco torna
   * quello di una struttura sola.
   */
  segmentSide: 8,

  /**
   * Chunk che un singolo segmento puo' marcare sporchi.
   *
   * Lo stesso tetto di `SPANS.maxDirtyChunks`, e non e' un caso: da quando i
   * segmenti esistono nessuna struttura ha piu' bisogno di un'eccezione — se un
   * segmento non ci sta, e' `segmentSide` a doversi abbassare.
   */
  maxDirtyChunks: 24,

  /**
   * Larghezza da cui il cuore di un impalcato diventa verde.
   *
   * La stessa di `SPANS.plantedMinWidth`, e per la stessa ragione: sotto, il
   * cuore e' tutto passaggio, e piantarlo lascerebbe due filari di aiuola senza
   * un posto da cui guardarli. Un luogo comincia a esistere quando ci si sta.
   */
  plantedMinWidth: 6,

  /**
   * La guida: la mobilita' in quota, come struttura di scena.
   *
   * **Una cosa sola posata in due modi.** In verticale e' il montante d'isolato,
   * che sale lungo una facciata da terra a un impalcato abitato; in orizzontale
   * e' la linea, che corre incassata nel piano di un tratto di percorso. Non e'
   * un meccanismo di simulazione e non si muove niente: questo progetto non ha
   * oggetti animati fuori dai chunk, e le capsule sono voxel fermi sulla guida.
   *
   * Il montante non chiede appoggi propri: sale dentro il riquadro
   * dell'impalcato che serve, quindi cio' che lo regge in cima e' l'impalcato
   * stesso e cio' su cui poggia in basso lo trova `surveyFooting`, che sa gia'
   * rifiutare la carreggiata e preferire un tetto al prato.
   */
  guide: {
    /**
     * Lato del montante, in voxel.
     *
     * Lo stesso di una gamba, e non per pigrizia: e' la sezione sotto cui una
     * struttura verticale torna a leggersi come un filo invece che come un
     * volume, ed e' la misura con cui la 4.5 ha gia' tarato i propri appoggi.
     */
    side: 2,

    /**
     * Quota, sopra il piede, a cui comincia la prima capsula.
     *
     * Sei voxel — tre cubi — cosi' che la capsula piu' bassa stia sopra la testa
     * di chi passa e non davanti a una vetrina.
     */
    podStart: 6,

    /**
     * Passo delle capsule lungo la guida, in voxel.
     *
     * Dodici e' la luce massima di una campata, cioe' la distanza a cui due cose
     * si leggono ancora come una coppia: piu' fitte diventano una catena, piu'
     * rade non raccontano che li' si sale.
     */
    podPitch: 12,

    /**
     * Montanti proposti al massimo da una passata, e tick fra due passate.
     *
     * Piu' rada delle mensole e piu' fitta dei percorsi: un montante e' una
     * struttura piccola, ma serve **uno per impalcato abitato** e non di piu' —
     * due vie da terra allo stesso piano sono una ridondanza che non si legge.
     */
    perPass: 1,
    ticksPerPass: 20,
    examinedPerPass: 48,

    /** Fusto del montante: cemento, come le gambe da cui eredita il mestiere. */
    shaftPalette: PALETTE_SLOTS.concrete,
    /** La guida vera: metallo, la grammatica delle infrastrutture. */
    railPalette: PALETTE_SLOTS.metalDark,
    /** La capsula: si accende di notte, ed e' cio' che dice che la linea e' viva. */
    podPalette: PALETTE_SLOTS.metalBrass,
  },

  /** Piano calpestabile: e' suolo, e prende il colore di un suolo costruito. */
  deckPalette: PALETTE_SLOTS.concreteLight,

  /** Travatura e gambe: e' la struttura, e porta la grammatica delle infrastrutture. */
  girderPalette: PALETTE_SLOTS.metalDark,
  pierPalette: PALETTE_SLOTS.concrete,

  /** Verde del cuore, con gli slot che la 4.3 usa gia' sui tetti. */
  gardenPalette: PALETTE_SLOTS.grassLight,
} as const;

/** Voxel occupati in altezza da un impalcato piano: la travatura piu' il piano. */
export const DECK_HEIGHT = AERIAL.girderDepth + 1;







