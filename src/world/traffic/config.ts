import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { TERRAIN } from '../terrain/config';

/**
 * Unica fonte di verita' dei numeri del traffico.
 *
 * Vale la stessa regola di `terrain/config.ts`, `streets/config.ts` e
 * `landmarks/config.ts`: nessun altro file di `src/world/traffic/` contiene una
 * velocita', una quota, una misura di sagoma o un indice di palette.
 *
 * **Perche' esiste questo dominio.** Un imbarco che promette «collega due punti
 * dell'isola» e un aeroporto che promette «collega l'isola al mondo» non avevano
 * niente che si muovesse: la barca del traghetto era un pugno di voxel disegnati
 * *dentro* lo stamp del molo, quindi ferma per costruzione e — visto che uno
 * stamp non sa scrivere sotto il proprio piano finito — sospesa sei voxel sopra
 * il pelo dell'acqua. Il mezzo che si muove non puo' essere un voxel: scriverlo
 * e riscriverlo a ogni frame marcherebbe sporchi i chunk della costa sessanta
 * volte al secondo, cioe' rimeshare mezza isola per far navigare una barca.
 *
 * **Percio' il traffico non e' materia.** Qui si calcola *dove sta* un mezzo a
 * un certo istante — puro, deterministico, senza mondo e senza Three.js — e a
 * disegnarlo e' `engine/TrafficView.ts` con una manciata di mesh proprie, fuori
 * dal volume voxel. E' la stessa divisione di `InfluenceOverlay`: cio' che si
 * muove sta sopra la scena, non dentro.
 */
export const TRAFFIC = {
  // --- Rotta sull'acqua ---------------------------------------------------

  /**
   * Passo della griglia su cui si cerca la rotta fra due imbarchi, in voxel.
   *
   * Due celle di terreno. Piu' fine non servirebbe — una barca larga tre voxel
   * non ha bisogno di sapere dove sta ogni scoglio — e costerebbe il quadrato:
   * la ricerca copre il rettangolo dei due capi allargato di `laneMargin`, che a
   * passo uno sarebbe un quarto di milione di celle invece di quindicimila.
   */
  laneStep: TERRAIN.cellSize * 2,

  /**
   * Quanto la griglia di ricerca sborda oltre il rettangolo dei due capi.
   *
   * E' quanto una rotta puo' allontanarsi per aggirare un promontorio. Senza
   * margine la ricerca fallirebbe ogni volta che i due imbarchi stanno sui due
   * lati di una penisola, che e' esattamente il caso in cui un traghetto serve.
   */
  laneMargin: 72,

  /**
   * Celle d'acqua da tenere fra la rotta e la terra piu' vicina.
   *
   * Una rotta che rade la costa fa passare la barca *dentro* la battigia a
   * distanza di gioco: la sagoma e' larga tre voxel e la cella di ricerca otto.
   * Una cella di franco costa qualche passo di rotta e toglie il problema.
   */
  laneClearance: 1,

  /**
   * Passo della ricerca **dentro** un bacino, in voxel.
   *
   * Una cella di terreno, cioe' la meta' di `laneStep`. Il passo grosso serve a
   * traversare l'isola e va bene per farlo: fra due imbarchi ci sono centinaia
   * di voxel, e mezza cella di errore non si vede. Dentro una marina no —
   * l'intera struttura e' larga sedici colonne e uno slip ne e' largo tre —
   * quindi a passo quattro il bacino sarebbe una griglia da quattro celle per
   * tre, e ogni posto barca cadrebbe sulla stessa. E' la grana piu' fine che
   * il terreno stesso possieda: sotto non c'e' piu' niente da distinguere.
   */
  basinStep: TERRAIN.cellSize,

  /**
   * Franco laterale **dentro** un bacino: nessuno.
   *
   * Zero e' un numero scelto, non un'omissione. `laneClearance` esiste perche'
   * una rotta di traversata che rade la costa fa passare la barca dentro la
   * battigia; dentro un porto vale il contrario — una darsena e' scavata su
   * misura, uno slip e' largo tre colonne, e pretendere quattro voxel d'acqua
   * per lato dichiarerebbe **non navigabile ogni ormeggio del gioco**. E' il
   * conto che teneva la nave da carico ferma al molo: il sondaggio le chiedeva
   * quattro voxel d'acqua a nord, e a nord c'era il braccio di sopravento del
   * porto che la ospita.
   */
  basinClearance: 0,

  /**
   * Tratto minimo perche' l'uscita di uno yacht si legga come un'uscita.
   *
   * Sotto, resta ormeggiato. Il posto barca in testa al bacino di una marina si
   * chiude davvero — dallo stadio due il pontile di testa gli sta davanti — e
   * quattro voxel di avanti-indietro non raccontano una gita: raccontano una
   * barca che vibra. Un mezzo fermo all'ormeggio e' il difetto onesto, e in un
   * porticciolo pieno e' anche la verita': non escono tutti insieme.
   */
  yachtMinRun: 6,

  /**
   * Fin dove si cerca la **bocca** del bacino, in voxel dall'ormeggio.
   *
   * Non e' quanto lontano va la nave — quello lo dice `cargoReach` — ma dove
   * finisce il porto e comincia il mare: la colonna d'acqua piu' al largo che
   * si raggiunga senza uscire dal circondario della struttura. Quarantotto
   * voxel coprono il caso peggiore che il distretto costiero sappia costruire:
   * insenatura, molo di terra guadagnata e canale di accesso sommati portano il
   * fronte del porto a diciotto colonne oltre l'ingombro, e il frangiflutti sta
   * ancora due piu' in la' — con la sua campata da quattordici da doppiare di
   * lato.
   */
  harborReach: 48,

  /**
   * Fin dove la ricerca si spinge prima di rinunciare, in celle visitate.
   *
   * Un tetto e non una speranza: la ricerca gira sul thread principale quando
   * il giocatore piazza il secondo imbarco, e una griglia grande piu' del
   * previsto non deve poter mangiare un frame intero. Oltre il tetto la linea
   * resta senza rotta e la barca non compare — che e' un difetto visibile e
   * onesto, non un blocco.
   */
  laneBudget: 40_000,

  // --- Mezzi sull'acqua ---------------------------------------------------

  /** Quota del pelo dell'acqua: e' li' che galleggia tutto quanto. */
  waterZ: TERRAIN.seaLevel,

  /** Velocita' di un traghetto di linea, in voxel al secondo. */
  ferrySpeed: 4,

  /**
   * Frazione del periodo che un traghetto passa fermo a ciascun capo.
   *
   * Serve a far leggere la linea come un servizio invece che come un pendolo:
   * una barca che inverte la marcia senza fermarsi non sta attraccando, sta
   * rimbalzando.
   */
  ferryDwell: 0.12,

  /** Velocita' di una nave da carico. Piu' lenta: e' molto piu' grande. */
  cargoSpeed: 2.5,

  /**
   * Quanto una nave da carico resta a ciascun capo, in frazione di periodo.
   *
   * I due capi non sono la stessa cosa da quando la rotta e' `offworld`: al molo
   * e' il tempo di scarico, e la nave si vede; al bordo del mondo e' il tempo che
   * passa **fuori**, e la nave non c'e'. Una sola manopola per le due, perche'
   * sono due letture dello stesso quarto di ciclo.
   */
  cargoDwell: 0.22,

  /**
   * Fin dove si cerca il bordo del mondo andando dritti al largo, in voxel.
   *
   * **Non e' quanto lontano va la nave**: e' il tetto della ricerca. La nave
   * arriva dove il mare finisce — il bordo della mappa generata, o la terra che
   * le taglia la strada — ed e' li' che esce dal mondo. Il tetto tiene finito il
   * ciclo e nient'altro: su un'isola centrata in un mondo da 512 la costa dista
   * dal bordo molto meno di questo numero, quindi a fermare la ricerca e'
   * sempre il mare, che e' il verso giusto.
   */
  cargoReach: 512,

  /**
   * Tratto di mare minimo perche' ci sia un «fuori» da cui arrivare, in voxel.
   *
   * Sotto, la nave resta ormeggiata: sparire a due lunghezze dal molo non si
   * legge come una partenza, si legge come un difetto. E' il doppio abbondante
   * della sagoma piu' lunga che naviga.
   */
  cargoMinRun: 40,

  /**
   * Velocita' di uno yacht da diporto che gironzola davanti alla marina.
   *
   * Lenta, e piu' lenta della barca da lavoro: lo yacht non deve arrivare da
   * nessuna parte, deve farsi vedere uscire dal posto barca e rientrare.
   */
  yachtSpeed: 2,

  /**
   * Frazione del periodo che uno yacht resta fermo a ciascun capo del suo giro.
   *
   * Il capo di qua e' il posto barca, quello di la' il largo del bacino: senza
   * sosta il giro legge come un rimbalzo, non come un'uscita e un rientro.
   */
  yachtDwell: 0.2,

  /**
   * Fin dove uno yacht si allontana dal posto barca, in voxel.
   *
   * E' il guinzaglio del «non si allontana troppo»: lo yacht esce lungo il
   * proprio slip e rientra, senza mai perdere la marina. Il tratto vero si
   * ferma comunque prima, dove finisce l'acqua navigabile.
   */
  yachtReach: 10,

  // --- Quanti mezzi ---------------------------------------------------------

  /**
   * Quanti mezzi al massimo un ruolo mette sulla propria rotta.
   *
   * **La rotta e' una sola, i mezzi sopra sono tanti.** Una posa e' una lettura
   * del tempo, quindi due navi sulla stessa spezzata costano una moltiplicazione
   * in piu' e nient'altro: nessuna seconda ricerca di rotta, nessuna geometria
   * nuova, la stessa mesh condivisa del pool. E' anche cio' che rende sensato
   * legare il numero alla simulazione — se ogni nave costasse una ricerca, il
   * porto pieno sarebbe il caso lento.
   *
   * Tre e non di piu': un traghetto e' lungo undici voxel e una nave da carico
   * diciassette, e su una traversata da un centinaio la quarta comincia a
   * leggersi come una fila invece che come un servizio.
   */
  maxFleet: 3,

  /**
   * Volume di commercio, in unita' per tick, oltre il quale un porto e' pieno.
   *
   * **Derivato dai numeri di `sim/balance.ts`, non scelto a occhio.** Un porto
   * da solo esporta `exportMaterialsPerTick` (cinque) e copre `importFoodShare`
   * (il 12%) della spesa alimentare, che vale `population * food.perResident`
   * — cinque centesimi a testa. Su una citta' da tremila abitanti fanno diciotto
   * unita' di cibo piu' cinque di materiali: ventitre. Ventiquattro e' quella
   * soglia arrotondata, cioe' «l'isola cresciuta che commercia davvero».
   *
   * Non e' un numero di bilanciamento e non decide niente della simulazione:
   * decide solo quante sagome si vedono in mare.
   */
  cargoFullLoad: 24,

  /**
   * Residenti oltre i quali una linea di traghetto e' al pieno servizio.
   *
   * **La popolazione e' un ripiego dichiarato**: la simulazione non conta i
   * passeggeri, e non deve cominciare a farlo per decidere quante barche si
   * vedono. Quello che conta e' che due partite alla stessa taglia mostrino lo
   * stesso servizio, e che una citta' di duecento abitanti non abbia tre
   * traghetti in fila su un braccio di mare.
   */
  ferryFullLoad: 2000,

  // --- Mezzi in aria ------------------------------------------------------

  /** Velocita' di un aereo sul circuito, in voxel al secondo. */
  planeSpeed: 16,

  /** Quota di crociera sopra il piano della pista. */
  planeCruise: 44,

  /**
   * Franco fra la pancia di un aereo e la cosa piu' alta che sorvola.
   *
   * **Il circuito non e' piu' una quota fissa, ed e' questo numero a dirlo.**
   * Quarantaquattro voxel sopra la pista bastavano finche' l'aeroporto stava al
   * margine di una citta' bassa; con `BUILDER.maxLevel` a dodici una torre del
   * centro supera i centoquaranta voxel, e un semilato di circuito da
   * ottantaquattro ce la porta dentro in pieno. La rotta si alza percio' sopra
   * cio' che trova sotto di se': la quota di crociera e' il massimo fra quella
   * dichiarata e la cima sorvolata piu' questo franco.
   *
   * Diciotto voxel sono due piani buoni: abbastanza da leggersi come un
   * sorvolo e non come una sfiorata, e abbastanza da coprire il coronamento che
   * `supportAt` non conta perche' non e' un record a se'.
   */
  planeClearance: 18,

  /**
   * Lo stesso franco per cio' che in quota va piano: dirigibili, eVTOL, palloni.
   *
   * Piu' stretto di quello dell'aereo, e non per distrazione: un dirigibile che
   * gira attorno al proprio pilone *appartiene* a quel tetto, e allontanarlo di
   * due piani lo staccherebbe dalla struttura che lo tiene. Serve a non farlo
   * passare dentro la torre accanto, non a portarlo in stratosfera.
   */
  aloftClearance: 10,

  /**
   * Passo con cui si sonda la citta' sotto una rotta di volo, in voxel.
   *
   * Tre celle di terreno. Il sondaggio serve a trovare **la cosa piu' alta**
   * sotto una spezzata lunga qualche centinaio di voxel, non a profilarne il
   * contorno: una torre e' larga almeno quattro colonne, quindi un passo di sei
   * non ne salta nessuna che conti, e costa una cinquantina di letture per
   * circuito invece di trecento.
   */
  ceilingStep: 6,

  /**
   * Quanto il sondaggio sporge di lato dalla linea di centro della rotta.
   *
   * **La linea non e' il mezzo.** Un dirigibile e' lungo sedici e largo cinque:
   * alzare la rotta solo dove una colonna cade *esattamente* sotto la spezzata
   * significa lasciare che la gondola o l'involucro sfiorino la torre accanto a
   * quella sondata. Per ogni punto si sonda quindi una croce di colonne a questa
   * distanza, e il massimo delle nove risposte decide la quota. Cinque voxel
   * coprono l'ingombro piu' largo che vola — l'aereo e il pallone — piu' un
   * margine.
   */
  hullProbe: 5,

  /** Semilato del circuito di attesa attorno al campo, in voxel. */
  planeCircuit: 84,

  /** Quanto la corsa di decollo resta a terra prima di staccare, in voxel. */
  planeRoll: 14,

  /** Velocita' di un dirigibile. Lenta, ed e' meta' di cio' che lo dichiara. */
  airshipSpeed: 3,

  /** Quota di crociera di un dirigibile sopra il proprio ormeggio. */
  airshipCruise: 14,

  /** Raggio del giro che un dirigibile fa attorno al proprio pilone. */
  airshipOrbit: 34,

  /**
   * Ampiezza e periodo del beccheggio di un dirigibile all'ormeggio.
   *
   * Un dirigibile ormeggiato perfettamente fermo legge come un pezzo di
   * edificio. Mezzo voxel di oscillazione lenta e' quanto basta a dire che
   * galleggia, e non abbastanza da distrarre.
   */
  airshipBob: 0.6,
  airshipBobPeriod: 7,

  /**
   * Velocita' di un eVTOL sul proprio circuito, in voxel al secondo.
   *
   * Fra il dirigibile e l'aereo, e piu' vicina al dirigibile: cio' che un eVTOL
   * promette non e' la velocita' di crociera ma il fatto di posarsi su una
   * piazzola di tre colonne. Troppo veloce, il giro attorno allo scalo finisce
   * prima che l'occhio abbia visto dove si e' posato.
   */
  evtolSpeed: 9,

  /** Quota di crociera di un eVTOL sopra la propria piazzola. */
  evtolCruise: 22,

  /**
   * Raggio del giro che un eVTOL fa attorno al proprio scalo.
   *
   * Stretto, e piu' stretto di quello del dirigibile: e' il mezzo che serve il
   * tetto su cui sta, non l'isola. Un circuito largo lo porterebbe fuori dalla
   * torre e lo farebbe leggere come un aereo piccolo.
   */
  evtolCircuit: 26,

  /**
   * Velocita' di una mongolfiera, in voxel al secondo. La piu' lenta di tutte.
   *
   * Un pallone non si guida: sale, si lascia portare e torna. La lentezza **e'**
   * la sagoma, come i conci rastremati sono quella del dirigibile.
   */
  balloonSpeed: 1.6,

  /** Quanto una mongolfiera resta all'ormeggio, in frazione di periodo. */
  balloonDwell: 0.18,

  /** Quanto una mongolfiera sale sopra il proprio ormeggio, in voxel. */
  balloonRise: 26,

  /**
   * Quanto la deriva porta lontano una mongolfiera, in voxel.
   *
   * Il verso lo dichiara l'ormeggio della ricetta e non il vento di `plume`: la
   * deriva del pennacchio e' una costante del mondo, un ormeggio e' una
   * coordinata canonica che ruota con la struttura, e legare il pallone al vento
   * manderebbe meta' dei palloni della citta' dentro il proprio scalo.
   */
  balloonDrift: 46,

  /**
   * Quanto il pallone si allontana **mentre sale**, in voxel.
   *
   * E' il punto di mezzo della corsa, e serve a una cosa sola: senza, la salita
   * si spalmerebbe su tutta la deriva e il pallone striscerebbe sui tetti per il
   * primo terzo di ogni corsa. Corto rispetto a `balloonDrift` perche' un pallone
   * sale ripido — l'aria calda non ha bisogno di rincorsa.
   */
  balloonLead: 12,

  /**
   * Beccheggio di una mongolfiera all'ormeggio.
   *
   * Piu' ampio di quello del dirigibile perche' e' piu' leggera: un involucro
   * d'aria calda trattenuto da una cima si muove, ed e' l'unica cosa che dica
   * che non e' appoggiato al pilone.
   */
  balloonBob: 0.9,

  // --- Mezzi appesi -------------------------------------------------------

  /**
   * Velocita' di una cabina di funivia, in voxel al secondo.
   *
   * Fra il traghetto e l'aereo, e piu' vicina al traghetto: cio' che una funivia
   * promette non e' la velocita' ma il fatto che il mare sotto non conti. Troppo
   * veloce, la traversata finisce prima che l'occhio la segua.
   */
  gondolaSpeed: 5,

  /** Quanto una cabina resta in stazione, in frazione di periodo. */
  gondolaDwell: 0.1,

  /**
   * Lunghezza dell'attacco fra la fune e il tetto della cabina, in voxel.
   *
   * **Sommata all'altezza della cabina da' `ROPEWAY.cabinDrop`**, che e' la
   * misura con cui la regola della linea calcola il franco: se le due
   * divergessero, la cabina passerebbe piu' in basso di quanto la fune e' stata
   * alzata per farla passare. Un test tiene ferma l'uguaglianza — e' la stessa
   * rete di sicurezza con cui il modello di luce tiene allineate la copia TS e
   * quella GLSL.
   */
  gondolaHanger: 1,

  // --- Sagome -------------------------------------------------------------

  /**
   * Misure d'ingombro delle sagome, in voxel: lunghezza, larghezza, altezza.
   *
   * Sono l'**involucro dello scafo**, non l'altezza totale: una tuga, una deriva
   * o una ciminiera stanno sopra il ponte e sforano `height`, come un
   * coronamento sfora la fascia che lo regge. Su queste tre misure si appoggia
   * la sagoma di `engine/vehicleHulls.ts`, che le riempie di scatole.
   */
  hull: {
    /** Barca da lavoro all'ormeggio in un porto o in una darsena. */
    boat: { length: 7, width: 3, height: 2, palette: PALETTE_SLOTS.metalRust },
    /**
     * Yacht da diporto al posto barca di una marina: piu' corto e piu' stretto
     * della barca da lavoro, ed e' la misura a distinguerlo — una marina piena
     * di barche da sette voxel leggerebbe come un porto peschereccio.
     */
    yacht: { length: 5, width: 2, height: 2, palette: PALETTE_SLOTS.concreteWhite },
    /** Traghetto di linea: doppia estremita', tuga chiara. */
    ferry: { length: 11, width: 4, height: 3, palette: PALETTE_SLOTS.concreteWhite },
    /**
     * Nave da carico: la sagoma piu' lunga che naviga.
     *
     * Lo scafo sta nei corpi neutri e non fra i metalli scuri, che in ogni tema
     * sono bruni caldi: sotto una fascia di galleggiamento `asphaltShadow` — che
     * e' fredda — un bruno faceva leggere la riga come un nastro azzurro
     * appiccicato al fianco invece che come l'ombra dell'immersione. Nella stessa
     * famiglia la fascia torna a essere lo scafo in ombra, che e' cio' che deve
     * sembrare.
     */
    cargo: { length: 17, width: 5, height: 4, palette: PALETTE_SLOTS.concrete },
    /** Aereo di linea. */
    plane: { length: 9, width: 9, height: 2, palette: PALETTE_SLOTS.concreteWhite },
    /** Dirigibile: l'unico piu' alto che largo, ed e' la sua firma. */
    airship: { length: 16, width: 5, height: 5, palette: PALETTE_SLOTS.roofPale },
    /**
     * eVTOL: piu' largo che lungo, ed e' la sua firma.
     *
     * L'aereo ha l'ala a freccia e la fusoliera lunga; questo ha una cabina
     * corta e quattro rotori su un trave trasversale, quindi la sagoma vista da
     * sopra e' un quadrato con quattro dischi. Sono i due modi opposti di dire
     * «vola» con delle scatole, e a distanza isometrica non si confondono.
     */
    evtol: { length: 5, width: 6, height: 2, palette: PALETTE_SLOTS.concreteWhite },
    /**
     * Mongolfiera: l'unica sagoma che sta quasi tutta **sopra** l'origine.
     *
     * `height` e' l'involucro, e la navicella gli pende sotto — lo scafo di una
     * barca sta sotto il ponte, qui e' il contrario. Larga quanto alta perche'
     * un pallone e' un pallone: schiacciarlo lo farebbe leggere come un
     * dirigibile corto, che e' l'unica altra cosa in cielo con cui potrebbe
     * confondersi.
     */
    balloon: { length: 7, width: 7, height: 9, palette: PALETTE_SLOTS.metalBrass },
    /**
     * Cabina di funivia: la sola sagoma che non poggia su niente.
     *
     * Piccola perche' e' appesa: una cabina larga quanto un traghetto, sospesa a
     * una fune spessa un terzo di voxel, legge come un errore di scala. Le tre
     * misure sono quelle della **scatola**, e l'attacco che la tiene sta sopra —
     * come una tuga sta sopra il ponte.
     */
    gondola: { length: 4, width: 3, height: 2, palette: PALETTE_SLOTS.glassPale },
  },

  /** Vetri: oblo', fasce di finestrini, plance, cupolini. */
  cabinPalette: PALETTE_SLOTS.glassDeep,

  /**
   * Sovrastrutture: tughe, plance, gondole.
   *
   * Non e' il colore dello scafo, ed e' voluto: due tinte vicine ma diverse sono
   * cio' che, a distanza isometrica, separa il volume che galleggia da quello
   * che ci sta sopra. Con una sola tinta la barca torna a leggersi come un
   * blocco, che e' il difetto da cui nasce tutta questa tabella.
   */
  housePalette: PALETTE_SLOTS.concretePale,

  /** Calpestii: ponti, coperte, passerelle. */
  deckPalette: PALETTE_SLOTS.stoneWarm,

  /**
   * Fascia di galleggiamento: la riga scura dove lo scafo incontra l'acqua.
   *
   * E' un dettaglio di due decimi di voxel, e vale piu' di qualunque altro: senza
   * di essa una barca chiara su acqua chiara non ha un bordo inferiore, e sembra
   * appoggiata sopra il mare invece che immersa.
   */
  bandPalette: PALETTE_SLOTS.asphaltShadow,

  /** Ferramenta: parapetti, cappelli di ciminiera, gondole dei motori, alberi. */
  trimPalette: PALETTE_SLOTS.asphaltDark,

  /**
   * I container di coperta, presi in ordine fisso.
   *
   * Fisso e non a caso: una nave e' un pool di mesh condivise per tipo, quindi
   * due navi da carico sono la **stessa** geometria: un tiro qui darebbe una
   * tinta sola per tutta la flotta, non una flotta variegata.
   *
   * **Due tinte calde e una neutra, non tre famiglie diverse.** Il carico e' la
   * superficie piu' estesa che si veda della nave, quindi e' una massa e non un
   * accento — e la citta' le masse le fa con i corpi neutri, tenendo i saturi
   * per le parti piccole. Prendendo il verde dell'erba e l'azzurro dei vetri per
   * due terzi della coperta, la nave era l'unica cosa in scena a non seguire
   * quella regola: tre famiglie a saturazione piena su un oggetto solo, mentre a
   * dieci voxel di distanza un edificio ne porta una. Dentro l'accento caldo del
   * tema — mattone e ruggine — i container seguono la palette invece di restare
   * tre tinte fisse, e l'azzurro sulla nave torna a essere soltanto un vetro.
   */
  cratePalettes: [
    PALETTE_SLOTS.brickDark,
    PALETTE_SLOTS.metalRust,
    PALETTE_SLOTS.concreteLight,
  ],

  /** Colore dei fanali di via e delle luci di navigazione. */
  lightPalette: PALETTE_SLOTS.metalGold,

  // --- Ciminiere e pennacchio ---------------------------------------------

  /**
   * Chi ha una ciminiera, e dove ne sta la bocca nel sistema del mezzo.
   *
   * **Una voce sola per due lettori**, ed e' il punto: `engine/vehicleHulls.ts`
   * ci disegna il fumaiolo e `plume.ts` ci fa uscire il fumo. Tenere le due
   * misure separate vorrebbe dire scoprire da uno screenshot che il pennacchio
   * esce da mezzo metro sopra il cappello.
   *
   * `along` e' l'offset verso prua dal centro del mezzo, `mouth` la quota della
   * bocca sopra il pelo dell'acqua, `width` il lato del fusto. Chi manca da
   * questa tabella semplicemente non fuma.
   */
  funnel: {
    ferry: { along: -1.8, mouth: 5.9, width: 1.1, palette: PALETTE_SLOTS.metalRust },
    cargo: { along: -6.2, mouth: 8.6, width: 1.6, palette: PALETTE_SLOTS.metalRust },
  } as Partial<Record<VehicleKind, VehicleFunnel>>,

  /**
   * Il pennacchio: quanti sbuffi, quanto vivono, dove vanno.
   *
   * Uno sbuffo non e' una particella con una velocita' da integrare: e' la
   * **stessa posa letta nel passato** — dov'era la nave `age` secondi fa — piu'
   * una salita e una deriva lineari. Vale qui la ragione che vale per le pose:
   * in pausa il fumo si ferma, a 4x accelera, e due partite identiche fanno lo
   * stesso fumo negli stessi punti senza tenere in vita nessuno stato.
   */
  plume: {
    /** Secondi fra due sbuffi. Il numero di sbuffi vivi e' `life / every`. */
    every: 0.65,
    /** Quanto vive uno sbuffo, in secondi. */
    life: 4.8,
    /** Quanto sale in un secondo, in voxel. */
    rise: 1.5,
    /**
     * Deriva del vento, in voxel al secondo.
     *
     * Fissa nel mondo e non rispetto alla prua: e' cio' che fa piegare tutti i
     * pennacchi della citta' dalla stessa parte. Una deriva relativa al mezzo
     * darebbe due traghetti che si incrociano con il fumo che va in due versi.
     */
    windX: 0.55,
    windY: 0.3,
    /**
     * Lato del cubetto appena uscito, e di quanto cresce in un secondo.
     *
     * La crescita e' meta' della salita, e non e' un caso: piu' in fretta di
     * cosi' l'ultimo sbuffo diventa piu' largo della tuga da cui esce, e la nave
     * finisce dietro il proprio fumo.
     */
    size: 0.9,
    growth: 0.34,
    /**
     * Scarto laterale degli sbuffi, in voxel.
     *
     * Non e' rumore: e' una funzione dell'istante in cui lo sbuffo e' uscito,
     * quindi resta deterministica come tutto il resto. Serve perche' una colonna
     * di cubetti perfettamente allineati non legge come fumo, legge come un palo.
     */
    wobble: 0.28,
    /** Densita' dello sbuffo appena uscito: sopra, il fumo coprirebbe la nave. */
    peak: 0.8,
    palette: PALETTE_SLOTS.roofWhite,
  },

  // --- Scia sull'acqua ------------------------------------------------------

  /**
   * La schiuma che uno scafo lascia dietro di se'.
   *
   * **E' il pennacchio letto in orizzontale**, e non per analogia: un segno di
   * scia e' la stessa posa letta nel passato — dov'era la nave `age` secondi fa —
   * piu' un'apertura laterale lineare. Ne discende tutto cio' che discendeva dal
   * fumo: in pausa la scia si ferma, a 4x si allunga alla stessa velocita' della
   * nave, e due partite identiche lasciano gli stessi segni negli stessi punti
   * senza tenere in vita nessuno stato.
   *
   * **Serve a una cosa sola, ed e' quella che mancava di piu'.** Uno scafo che
   * scivola su un mare intatto non e' *dentro* l'acqua: e' una figurina appoggiata
   * sopra, e nessun dettaglio di sagoma corregge quella lettura. La fascia di
   * galleggiamento da' il bordo inferiore, la scia da' il fatto che l'acqua si
   * accorga del passaggio.
   */
  wake: {
    /** Secondi fra due segni. Il numero di segni vivi e' `life / every`. */
    every: 0.4,
    /** Quanto vive un segno, in secondi. */
    life: 7,
    /**
     * Semiangolo della V, in gradi.
     *
     * **Un angolo e non una velocita', e la differenza si vedeva a schermo.**
     * Prima l'apertura era in voxel al secondo, che sembra la stessa cosa
     * scritta in un'altra unita' e non lo e': a parita' di secondi, chi corre di
     * piu' resta piu' avanti, e la sua V esce piu' stretta. I tre scafi
     * finivano quindi con tre scie diverse — traghetto 12,7 gradi, nave da
     * carico 19,8, yacht 24,2 — e la piu' sbagliata era quella del traghetto,
     * che e' anche la barca che si vede attraversare piu' spesso: a
     * quell'angolo i due rami non si staccano dalla rimestata centrale, e la
     * traccia legge come una riga posata sull'acqua invece che come una scia.
     *
     * Diciannove gradi e mezzo e' l'angolo di Kelvin, e la ragione per cui
     * questo numero e' uno solo per tutti: l'apertura di una scia e' un fatto
     * della forma d'onda e **non** dipende da quanto va la barca. Il vecchio
     * `spread: 0.9` era di fatto tarato sulla nave da carico, la sola dei tre
     * che ci cadesse sopra per caso.
     */
    spreadAngle: 19.47,
    /** Larghezza della bava laterale appena aperta, e di quanto cresce in un secondo. */
    width: 0.85,
    growth: 0.5,
    /**
     * Quanto la scia centrale e' piu' larga della bava laterale.
     *
     * Le due non sono lo stesso segno: la V e' l'onda di prua, la centrale e'
     * l'acqua rimestata dall'elica. Senza la seconda restano due righe parallele
     * che sembrano un binario, e il mezzo pare passare **fra** le due invece che
     * lasciarle entrambe.
     */
    washWidth: 1.9,
    /** Quanto e' bianca la bava appena aperta, e quanto lo e' la scia centrale. */
    peak: 0.5,
    washPeak: 0.3,
    /**
     * Sotto questa velocita' non c'e' scia, in voxel al secondo.
     *
     * Una barca all'ormeggio ripete la stessa posa: senza questa soglia i segni
     * si impilerebbero tutti nello stesso punto, e una barca ferma sarebbe la
     * cosa piu' bianca del porto.
     */
    minSpeed: 0.8,
    /**
     * Quanto la schiuma sta sopra il pelo dell'acqua, in voxel.
     *
     * Il minimo che eviti lo z-fighting con la faccia superiore del mare, non un
     * rilievo: una schiuma sollevata si vede da sotto quando la camera si
     * abbassa, e diventa un nastro sospeso.
     */
    lift: 0.08,
    /** Passo del granello di schiuma, in voxel: e' la scala su cui si sgrana. */
    grain: 0.75,
    palette: PALETTE_SLOTS.roofWhite,
  },
} as const;

/** Una ciminiera, nel sistema del mezzo: `+x` e' la prua, `z` il pelo dell'acqua. */
export interface VehicleFunnel {
  readonly along: number;
  readonly mouth: number;
  readonly width: number;
  readonly palette: number;
}

/** La ciminiera di un mezzo, o `undefined` se quel mezzo non fuma. */
export function funnelOf(kind: VehicleKind): VehicleFunnel | undefined {
  return TRAFFIC.funnel[kind];
}

/**
 * Quanti mezzi mette in moto un lavoro di questa portata: da uno a `maxFleet`.
 *
 * **Mai zero**, ed e' una scelta. Un porto che non commercia ancora resta un
 * porto, e la nave in banchina e' cio' che lo dichiara: togliergliela
 * significherebbe mostrare un molo con delle gru e nient'altro, che si legge
 * come un difetto e non come «questa citta' non ha ancora niente da vendere».
 * Quello che la simulazione decide e' se ce n'e' **una** o se ce ne sono tre.
 *
 * Sta qui e non in chi chiama perche' e' una misura di traffico come le altre,
 * e perche' ha due lettori: chi costruisce le rotte e chi decide se valga la
 * pena ricostruirle — e se i due quantizzassero diversamente, la citta'
 * rifarebbe ogni ricerca di rotta a ogni tick.
 */
export function fleetOf(load: number, full: number): number {
  if (!(load > 0) || !(full > 0)) return 1;
  const share = Math.min(1, load / full);
  return 1 + Math.round(share * (TRAFFIC.maxFleet - 1));
}

/** I mezzi che il traffico sa mettere in moto. */
export const VEHICLE = {
  boat: 'boat',
  yacht: 'yacht',
  ferry: 'ferry',
  cargo: 'cargo',
  plane: 'plane',
  airship: 'airship',
  /** eVTOL: l'unico che si posa su una piazzola invece di rullare o ormeggiare. */
  evtol: 'evtol',
  /** Mongolfiera: sale, si lascia portare dal vento e torna. */
  balloon: 'balloon',
  /** Cabina di funivia: l'unico mezzo che non galleggia e non vola — pende. */
  gondola: 'gondola',
} as const;

export type VehicleKind = (typeof VEHICLE)[keyof typeof VEHICLE];

export const VEHICLE_KINDS: readonly VehicleKind[] = [
  VEHICLE.boat,
  VEHICLE.yacht,
  VEHICLE.ferry,
  VEHICLE.cargo,
  VEHICLE.plane,
  VEHICLE.airship,
  VEHICLE.evtol,
  VEHICLE.balloon,
  VEHICLE.gondola,
];

/**
 * Chi galleggia, e quindi chi porta una fascia di galleggiamento e lascia scia.
 *
 * Un elenco e non un predicato su `hull`: cosa tocchi l'acqua e' una proprieta'
 * del mezzo, non una conseguenza delle sue misure. Lo leggono la sagoma, la scia
 * e il test che sorveglia la fascia — tre letture, una fonte.
 */
export const FLOATING_KINDS: readonly VehicleKind[] = [
  VEHICLE.boat,
  VEHICLE.yacht,
  VEHICLE.ferry,
  VEHICLE.cargo,
];

/** Vero se questo mezzo naviga: lo chiede la scia, che nasce solo sull'acqua. */
export function floats(kind: VehicleKind): boolean {
  return FLOATING_KINDS.includes(kind);
}
