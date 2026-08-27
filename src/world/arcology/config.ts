import { BUILDING_CLASS, type BuildingClass } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { BUILDER } from '../buildings/config';
import type { PartsRecipe } from '../landmarks/config';
import { PART, box } from '../landmarks/parts';
import { SURFACE_KIND } from '../visualBlock';

/**
 * Unica fonte di verita' dei numeri e delle forme delle arcologie.
 *
 * Vale la stessa regola di `terrain/config.ts`, `landmarks/config.ts` e
 * `aerial/config.ts`: nessun altro file di `src/world/arcology/` contiene una
 * quota, un ingombro, una soglia o un indice di palette.
 *
 * **Perche' esiste questo dominio.** Quando la gerarchia verticale satura, un
 * isolato del centro non ha piu' niente da diventare: `upgradePass` lo salta per
 * quota ammessa e la citta' smette di cambiare figura proprio dove e' piu'
 * densa. L'arcologia e' quel «dopo» — un'opera sola che vale un quartiere, con
 * usi diversi su quote diverse dentro un unico volume.
 *
 * **Non e' un edificio grosso, ed e' la ragione per cui non sta in
 * `buildings/`.** Un edificio e' una grammatica di fasce che ricava ognuna da
 * quella sotto, ha *un* uso e *un* livello, e la sua pianta e' un rettangolo
 * pieno. Qui gli usi sono quattro e distribuiti in verticale, il livello e' uno
 * **stadio**, e la pianta ha dei vuoti in mezzo che sono il tratto distintivo
 * invece di uno scarto. La macchina che somiglia a questa e' quella dei
 * landmark, e infatti la ricetta e' la loro: `PartsRecipe`, disegnata da
 * `generateFromRecipe`.
 *
 * **Il vuoto dentro l'ingombro non e' una nota di gusto.** Il volume che legge
 * come megastruttura non e' il piu' alto: e' quello che **scavalca il vuoto**.
 * Due steli e un impalcato che li unisce a mezz'altezza ritagliano una finestra
 * di cielo dentro il costruito, e quella finestra e' cio' che dice la scala —
 * senza, una torre grossa e' solo grossa. Per questo `window` e `maxFill` sono
 * numeri di questa tabella e non commenti: un test li chiede a ogni ricetta, e
 * un'arcologia che riempie il proprio ingombro non compila la suite.
 */

export const ARCOLOGY = {
  /**
   * Tick fra due passate. Piu' rada di tutte, e non per costo.
   *
   * Una passata puo' aprire un cantiere che sventra un isolato intero: farla
   * spesso non produrrebbe piu' arcologie — sono due per isola — ma solo piu'
   * scansioni a vuoto sulla citta' matura, che e' quando la condizione e'
   * finalmente vera.
   */
  ticksPerPass: 20,

  /** Record esaminati per passata. Un cursore, quindi il costo non cresce con la citta'. */
  examinedPerPass: 24,

  /** Stadi che una passata puo' far avanzare. */
  stagesPerPass: 1,

  /** Separa la scelta della forma dagli altri hash sullo stesso isolato. */
  kindSalt: 0x6a31_9d4b,

  /**
   * Edifici per cui la citta' si guadagna un'arcologia in piu'.
   *
   * **La quota scala con la citta', non e' un tetto fisso.** L'arcologia e' la
   * risposta a un quartiere saturo — `minBuilt` edifici entro `radius` — quindi
   * il numero di arcologie ammesse cresce con gli edifici totali: uno ogni due
   * quartieri saturi (`minBuilt * 2`). Il minimo di due resta per non lasciare
   * senza vertice un'isola piccola (vedi `arcologyQuota` in `siting.ts`).
   */
  buildingsPerArcology: 128,

  /**
   * Blocchi di distanza minima fra un'arcologia e la successiva.
   *
   * **E' la spaziatura, non un secondo tetto.** La quota dice *quante*; questa
   * dice *dove*: senza, una citta' da mille edifici metterebbe le sue otto
   * arcologie tutte nello stesso quadrante del centro. A due blocchi restano
   * distribuite, e l'economia dei materiali continua a dettarne il ritmo.
   */
  minSpacing: 2,

  /**
   * Raggio entro cui si contano gli edifici, per la condizione e per gli stadi.
   *
   * E' la stessa domanda del landmark — «cosa ha davvero costruito la citta'
   * qui attorno» — e per la stessa ragione non si legge la desiderabilita': il
   * centro e' saturo per definizione, e un campo saturo salterebbe tutti gli
   * stadi al primo tick.
   */
  radius: 24,

  /** Edifici entro il raggio sotto i quali qui non c'e' abbastanza citta'. */
  minBuilt: 64,

  /**
   * Vicini che non possono piu' crescere: al tetto o inchiodati dalla citta' in quota.
   *
   * **E' la mezza riga che rende la fase quello che dice di essere.** La densita'
   * da sola direbbe «qui c'e' molta citta'»; questa dice «qui la citta' non ha
   * piu' niente da diventare», che e' la condizione a cui l'arcologia e' la
   * risposta. Un ospite di un impalcato abitato e' saturo anche sotto il tetto:
   * la rete lo ha reso immutabile, quindi aspettare una promozione impossibile
   * terrebbe chiusa la fase per sempre.
   */
  minCapped: 2,

  /**
   * Fin dove si puo' sventrare per farle spazio.
   *
   * **Permissiva, al contrario di quella del catalizzatore, e per un motivo che
   * non si trasferisce.** La soglia di `BALANCE.gameplay.catalyst.clearing`
   * esiste perche' il piazzamento e' un *gesto*: senza, il giocatore
   * cliccherebbe dove gli pare e la citta' si farebbe da parte. Qui non c'e'
   * nessun gesto — l'arcologia nasce da una condizione, al massimo due per
   * isola, e solo dove la quota ammessa e' gia' satura, cioe' proprio dove gli
   * edifici sono **alti**. Una soglia bassa qui non proteggerebbe niente:
   * renderebbe la condizione insoddisfacibile per costruzione.
   */
  clearing: { maxLevel: BUILDER.maxLevel },

  /**
   * Fin dove una parte **poggia** invece di sporgere, in voxel dal piano finito.
   *
   * Stessa idea e stesso numero di `LANDMARK.groundBand`: e' cio' che l'opera di
   * terra deve reggere. Qui conta il doppio, perche' sopra questa quota
   * l'arcologia e' quasi tutta vuoto — contare l'ingombro intero riempirebbe di
   * terra proprio la finestra di cielo che la fase esiste per aprire.
   */
  groundBand: 4,

  /** Raggio di Manhattan del grembiule di suolo pubblico attorno all'ingombro. */
  apron: 1,

  /** Colore del grembiule. E' suolo pubblico, come quello dei landmark. */
  apronPalette: PALETTE_SLOTS.asphalt,

  /**
   * Cosa deve essere una finestra di cielo per contare come tale.
   *
   * I numeri servono a **escludere** i vuoti che ogni ricetta ha comunque: il
   * portico del podio e' alto quattro voxel ed e' un portico, non una finestra.
   * Sopra questa soglia il vuoto e' abbastanza grande da vedersi da fuori a
   * distanza di gioco, che e' l'unica cosa che lo rende il tratto distintivo.
   */
  window: {
    /** Quote vuote consecutive. */
    minHeight: 12,
    /** Colonne del riquadro vuoto. */
    minColumns: 16,
  },

  /**
   * Frazione massima dell'inviluppo che una ricetta puo' riempire.
   *
   * «Un'arcologia che riempie il proprio ingombro ha sbagliato ricetta», detto
   * come un numero che un test possa leggere. Quaranta per cento e' largo di
   * proposito: non e' una taratura estetica, e' la rete che ferma la ricetta
   * scritta come un parallelepipedo.
   */
  maxFill: 0.4,

  /**
   * Frazione minima dell'inviluppo che una ricetta deve riempire.
   *
   * `maxFill` e' un soffitto senza pavimento: una ricetta con sei guglie 3x3 su
   * un'ingombro da settantadue riempie l'otto per cento e passa, ma a distanza
   * di gioco non si legge come un edificio — si legge come fuscelli. Il
   * pavimento ferma quella ricetta prima che la taratura diventi un gusto.
   */
  minFill: 0.15,

  /**
   * Snellezza massima di una colonna verticale continua.
   *
   * Una colonna e' l'unione delle `shell` sovrapposte in pianta attraverso gli
   * stadi; la snellezza e' la sua altezza totale diviso il lato minore della
   * sezione. Una guglia 3x3 alta centocinquanta quote vale cinquanta, e si
   * legge come un palo; sotto venti la sezione e' abbastanza larga da reggere
   * la propria altezza e la sagoma legge come un corpo costruito.
   */
  maxSlenderness: 20,
} as const;

/** Le forme che un'arcologia puo' prendere. */
export const ARCOLOGY_KIND = {
  /** Sei steli su due fronti, un mezzanino che li unisce, una corona che li richiude. */
  twinStem: 'twinStem',
  /** Un nucleo che si divide in sei guglie su due file e si ricuce in quota. */
  branchingCore: 'branchingCore',
  /** Sei steli sfalsati attraversati da impalcati su assi e quote diverse. */
  skyWeave: 'skyWeave',
  /** Sei guglie in anello attorno a un vuoto centrale attraversato da una trave. */
  spireRing: 'spireRing',
  /** Due isolati in linea uniti da una campata: un doppio pettine. */
  doubleBar: 'doubleBar',
  /** Due isolati impilati: una coppia di corpi affiancati in verticale. */
  stackPair: 'stackPair',
  /** Quattro isolati a quadrato attorno a un cavedio d'angolo. */
  quadCluster: 'quadCluster',
  /** Tre isolati in linea: una barra che vale un quartiere intero. */
  triSpan: 'triSpan',
} as const;

export type ArcologyKind = (typeof ARCOLOGY_KIND)[keyof typeof ARCOLOGY_KIND];

/**
 * Un uso ospitato da una fascia di quota.
 *
 * **E' il modo in cui la simulazione conta un'arcologia senza imparare la
 * verticale.** La colonna d'ancoraggio e' una coppia `(x, y)` dentro l'ingombro,
 * distinta da quella delle altre fasce: quando lo stadio che apre la fascia
 * arriva, il driver chiama `addBuilding` su quella colonna, e `src/sim/` vede un
 * edificio del suo uso esattamente come ne vede uno qualunque. Quattro fasce
 * sono quattro edifici su quattro colonne, e la capacita' si conta come si e'
 * sempre contata (invariante 7).
 *
 * `z` non entra in nessun conto: e' li' perche' chi legge la tabella deve poter
 * dire a che quota sta la fascia senza ricostruirla dalle parti, e perche' un
 * test la confronta con le parti di quello stadio.
 */
export interface ArcologyBand {
  /** Stadio che apre la fascia. */
  readonly stage: number;
  readonly use: BuildingClass;
  /** Colonna canonica d'ancoraggio, distinta da quella di ogni altra fascia. */
  readonly x: number;
  readonly y: number;
  /** Quota di base della fascia, dal piano finito. */
  readonly z: number;
  /** Nome della fascia, per chi legge la tabella e per i test. */
  readonly label: string;
}

/**
 * Un piazzale: dove la rete in quota puo' attraccare.
 *
 * **Sta sul perimetro dell'inviluppo, e non e' una preferenza.** `openSideOf`
 * cerca un fianco libero da cui un percorso possa uscire, e un piazzale al
 * centro non ne ha nessuno: sarebbe un impalcato raggiungibile solo da dentro,
 * cioe' esattamente il monumento che la casella «innestarla nella rete» esiste
 * per non costruire.
 *
 * I suoi voxel li disegna la ricetta, come tutto il resto: il record che ne
 * nasce e' un `AERIAL_PART.node` **senza sagoma propria**, che dice alla rete in
 * quota «qui si arriva» e nient'altro.
 */
export interface ArcologyLanding {
  /** Stadio che lo apre. */
  readonly stage: number;
  /** Angolo minimo del riquadro, nel canonico. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Prima quota **libera** sopra il piano calpestabile, dal piano finito. */
  readonly z: number;
}

export interface ArcologyRecipe extends PartsRecipe {
  readonly kind: ArcologyKind;
  /**
   * Blocchi di isolato occupati in pianta, `[larghezza, profondita']`.
   *
   * **Le ricette ordinarie stanno in un isolato `[1, 1]`; le multi-blocco
   * dichiarano il cluster** — `[2, 1]` due in linea, `[2, 2]` un quadrato — e
   * `arcologyForBlock` usa questo numero per costruire il riquadro del cluster
   * invece del singolo isolato. Lo `span` resta l'inviluppo in voxel, che puo'
   * superare `segmentSide`: la comparsa lo spezza in ritagli, il podio copre
   * anche la carreggiata fra i blocchi.
   */
  readonly blocks: readonly [number, number];
  /** Gli usi, uno per fascia di quota, in ordine di stadio. */
  readonly bands: readonly ArcologyBand[];
  /** Gli attracchi della rete in quota, in ordine di stadio. */
  readonly landings: readonly ArcologyLanding[];
}

/**
 * L'arcologia a sei steli.
 *
 * Cinque stadi, e ognuno e' una frase: **il podio** che si prende l'isolato,
 * **gli steli** — tre per fronte, che salgono lasciando il vuoto in mezzo — **il
 * mezzanino** che lo scavalca, **i corpi** che continuano a salire piu' stretti,
 * **la corona** che li richiude in alto. Il secondo e il terzo sono la coppia che
 * conta: senza il vuoto dello stadio uno il mezzanino sarebbe un piano qualunque,
 * e senza il mezzanino dello stadio due il vuoto sarebbe lo spazio fra due file
 * di torri.
 *
 * **L'ingombro e' sedici colonne, e il numero non e' rotondo per caso.** Sotto
 * ci sono gli isolati stretti, che ne misurano quattordici e non la
 * conterrebbero; sopra c'e' `BUILDER.segmentSide`, oltre il quale `sliceStamps`
 * comincia a ritagliare in pianta. A sedici l'arcologia sta in un isolato e
 * compare in un pezzo solo per volta, e a spezzarne la comparsa resta il taglio
 * in quota degli stadi — che e' quello giusto, perche' cade dove la struttura
 * cambia davvero.
 */
export const TWIN_STEM: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.twinStem,
  blocks: [1, 1],
  // **L'ingombro supera il modulo e sta nel segmento.** Sopra il modulo c'e' una
  // megastruttura, non una torre grossa; dentro `segmentSide` perche' non si
  // spezzi in pianta. L'ingombro scala con il modulo (`arcologySpanOf`), come la
  // quota che deve superare la torre piu' alta del catalogo.
  span: [20, 20],
  height: 245,
  // Il centro: a differenza del porto, qui non c'e' un fronte da tenere sotto il
  // dito. La colonna che apre il cantiere e' quella che la condizione ha scelto,
  // e sta al centro dell'isolato che l'arcologia si prende per intero.
  anchor: [10, 10],
  /**
   * **Tarati sulla misura, e la misura ha cambiato l'idea che c'era dietro.**
   * Il modello dei landmark — un catalizzatore piantato presto, il quartiere che
   * gli cresce intorno, gli stadi che seguono — qui non si applica: un'arcologia
   * nasce quando la citta' ha **gia' smesso** di crescere, ed e' la sua
   * condizione a chiederlo. Su una citta' matura il conto dei vicini non sale
   * quasi piu' dopo la fondazione: nel centro denso sono novantotto, in periferia
   * cinquantaquattro, e i primi numeri scritti a occhio — centoquarantacinque per
   * l'ultimo stadio — non li avrebbe raggiunti nessuno.
   *
   * **Il conto si legge una volta sola, alla fondazione, e resta congelato.**
   * `climb` non ricalcola piu' `countWithinRadius`: lo sventramento toglie dal
   * conteggio proprio gli edifici che avevano fatto superare `minBuilt`, e un
   * podio fondato a sessantaquattro si ritrovava senza i vicini per la corona.
   * `foundedNeighbours` congela il valore letto da `arcologyReady`, prima dello
   * sventramento: la stessa misura decide fondazione e stadi.
   *
   * Le soglie sono percio' sulla scala **pre-sventramento**, che sta una decina
   * di edifici sopra quella post-sventramento su cui erano stati tarati i primi
   * numeri (minBuilt e' sessantaquattro, il conto di periferia dopo lo
   * sventramento e' cinquantaquattro): da li' il +10 su tutta la scala. Il tetto
   * della corona resta da riconfermare a runtime con `?debug=1`, perche' il conto
   * del centro denso pre-sventramento e' una stima e non una misura.
   *
   * Quindi non e' il tempo a far salire gli stadi, e' il **luogo**: quanto era
   * densa la citta' li' attorno decide fin dove quell'arcologia arriva, e ci
   * arriva in una manciata di passate. Dove il centro e' pieno la struttura si
   * completa; dove lo era meno resta un podio con gli steli, che e' la stessa
   * cosa detta dalla forma.
   */
  stages: [0, 50, 68, 82, 98],
  parts: [
    // --- 0 · il podio produttivo -------------------------------------------
    [
      box(PART.slab, 0, 0, 20, 20, 0, 13, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 3,
      }),
      box(PART.deck, 0, 0, 20, 20, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 3,
      }),
      box(PART.colonnade, 0, 0, 20, 20, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
        step: 3,
        chamfer: 3,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 20, 20, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 3,
      }),
      box(PART.slab, 6, 0, 8, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 6, 14, 8, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    // --- 1 · i due corpi, uno per fronte ------------------------------------
    [
      // Due barre di sezione 8x14 invece di sei guglie 3x3: la sezione larga e'
      // cio' che tiene la snellezza sotto il tetto e fa leggere il corpo come un
      // edificio e non come un palo. Il vuoto fra le barre e' la finestra.
      box(PART.shell, 0, 3, 8, 14, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.shell, 12, 3, 8, 14, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
    ],
    // --- 2 · il mezzanino commerciale --------------------------------------
    [
      // La trave che scavalca il vuoto centrale: poggia sulle due barre con due
      // assi sovrapposti, e sotto resta la finestra di cielo.
      box(PART.boom, 8, 3, 4, 14, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 8, 3, 4, 14, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    // --- 3 · i corpi abitati ------------------------------------------------
    // Ripartono esattamente dove finiscono gli steli (88): una colonna continua.
    [
      box(PART.shell, 0, 3, 8, 14, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.shell, 12, 3, 8, 14, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.glassPale,
      }),
    ],
    // --- 4 · la corona civica -----------------------------------------------
    [
      // La trave di corona a quota 168, sovrapposta ai corpi (che finiscono a
      // 168): chiude le due barre in una struttura sola e regge i montanti.
      box(PART.boom, 0, 7, 20, 6, 168, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 0, 7, 20, 6, 174, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.steps, 2, 7, 16, 6, 175, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 1,
        chamfer: 1,
      }),
      box(PART.mast, 4, 9, 2, 2, 181, 62, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 14, 9, 2, 2, 181, 62, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 5, y: 5, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 9, y: 9, z: 80, label: 'mezzanine' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 4, y: 10, z: 89, label: 'bodies' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 15, y: 10, z: 168, label: 'crown' },
  ],
  /**
   * Tre misure hanno riscritto questa tabella, e nessuna si vedeva dai test puri.
   *
   * *La quota.* Un percorso in quota assorbe al massimo `maxNodes * stepPerNode`
   * — trentadue voxel — di dislivello. Con il solo piazzale del mezzanino, a
   * sessantanove dal piano finito, non gli si affacciava nessun compagno: la
   * struttura c'era ed era un monumento con un molo in cima. Il tetto del podio,
   * a ventuno, sta invece alla quota delle mensole del centro. Il mezzanino resta
   * in tabella per chi arriva da sopra — una campata, un impalcato piu' alto —
   * perche' il piano lo disegna comunque la ricetta.
   *
   * *Il riquadro.* Sei per sei, e il sei viene da `AERIAL.route.walkWidth`:
   * `planBetween` rifiuta con `noLanding` un capo il cui fronte sia piu' stretto
   * di una passerella **su quell'asse**. I primi piazzali erano profondi tre, e
   * ogni percorso che correva lungo il lato lungo moriva senza che niente lo
   * dicesse — un attracco largo abbastanza per una sola direzione e' meta'
   * attracco.
   *
   * *I fronti.* Uno solo era un tiro di dado. `openSideOf` da' a un piazzale una
   * direzione sola, `routePartner` prova il compagno piu' vicino e lo brucia se
   * il piano fallisce: con un fronte, dopo otto tentativi l'arcologia aveva
   * finito i compagni possibili e non ne aveva costruito nessuno. Due fronti
   * opposti guardano due quartieri diversi, ed e' anche la lettura giusta di una
   * struttura che si prende l'isolato intero — un isolato ha quattro lati, e da
   * uno solo non ci si arriva.
   */
  landings: [
    { stage: 0, x: 6, y: 0, w: 8, h: 6, z: 23 },
    { stage: 0, x: 6, y: 14, w: 8, h: 6, z: 23 },
  ],
};

/**
 * Un nucleo che si divide in sei guglie su due file.
 *
 * L'ingombro da diciotto colonne e' deliberato: e' la misura degli isolati
 * stretti che il mercato giocabile costruisce davvero, appena sotto la Twin
 * Stem. Il podio porta sei steli; due travi ortogonali li attraversano e la
 * corona li attraversa di nuovo, cosi' la struttura si legge come una coppia di
 * file sfalsate e non come sei torri accostate.
 */
export const BRANCHING_CORE: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.branchingCore,
  blocks: [1, 1],
  span: [18, 18],
  height: 245,
  anchor: [9, 9],
  // +10 come Twin Stem: le soglie leggono `foundedNeighbours`, congelato prima
  // dello sventramento (vedi il commento su `TWIN_STEM.stages`).
  stages: [0, 50, 68, 82, 98],
  parts: [
    [
      box(PART.slab, 0, 0, 18, 18, 0, 13, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
        chamfer: 2,
      }),
      box(PART.deck, 0, 0, 18, 18, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.colonnade, 0, 0, 18, 18, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 18, 18, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.slab, 6, 0, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 6, 12, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    [
      // Due barre di sezione 14x8, una sopra e una sotto, con il vuoto orizzontale
      // in mezzo: e' la finestra, e le barre larghe la tengono aperta senza pali.
      box(PART.shell, 2, 0, 14, 8, 19, 70, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.shell, 2, 10, 14, 8, 19, 70, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous, {
        cap: PALETTE_SLOTS.glassPale,
      }),
    ],
    [
      // La trave che attraversa il vuoto: poggia sulle due barre.
      box(PART.boom, 2, 8, 14, 2, 80, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 2, 8, 14, 2, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.shell, 2, 0, 14, 8, 89, 80, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.shell, 2, 10, 14, 8, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
    ],
    [
      // Corona a quota 168, sovrapposta ai corpi: chiude le due barre in alto.
      box(PART.boom, 2, 8, 14, 2, 168, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 2, 8, 14, 2, 174, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.mast, 4, 9, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 12, 9, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 9, y: 8, z: 80, label: 'crossroads' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 4, y: 2, z: 89, label: 'branches' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 5, y: 8, z: 168, label: 'crown' },
  ],
  landings: [
    { stage: 0, x: 6, y: 0, w: 6, h: 6, z: 23 },
    { stage: 0, x: 6, y: 12, w: 6, h: 6, z: 23 },
  ],
};

/** Sei steli sfalsati, cuciti da due traversi che si incrociano in quota. */
export const SKY_WEAVE: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.skyWeave,
  blocks: [1, 1],
  span: [18, 18],
  height: 245,
  anchor: [9, 9],
  // +10 come Twin Stem: le soglie leggono `foundedNeighbours`, congelato prima
  // dello sventramento (vedi il commento su `TWIN_STEM.stages`).
  stages: [0, 52, 68, 84, 100],
  parts: [
    [
      box(PART.slab, 0, 0, 18, 18, 0, 13, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 2,
      }),
      box(PART.deck, 0, 0, 18, 18, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.colonnade, 0, 0, 18, 18, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 18, 18, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.slab, 6, 0, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 6, 12, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    [
      box(PART.shell, 0, 2, 8, 14, 19, 70, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      box(PART.shell, 10, 2, 8, 14, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
    ],
    [
      box(PART.boom, 8, 2, 2, 14, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 8, 2, 2, 14, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.shell, 0, 2, 8, 14, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.shell, 10, 2, 8, 14, 89, 80, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
    ],
    [
      box(PART.boom, 0, 7, 18, 4, 168, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 0, 7, 18, 4, 174, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.mast, 4, 8, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 12, 8, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 8, y: 9, z: 80, label: 'weave' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 4, y: 9, z: 89, label: 'spires' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 9, y: 8, z: 168, label: 'crown' },
  ],
  landings: [
    { stage: 0, x: 6, y: 0, w: 6, h: 6, z: 23 },
    { stage: 0, x: 6, y: 12, w: 6, h: 6, z: 23 },
  ],
};

/**
 * L'anello di sei guglie.
 *
 * La forma piu' esplicita sul vuoto: sei steli disposti ad anello intorno a un
 * cavedio centrale, e una trave che lo attraversa in quota lo trasforma nella
 * finestra di cielo. Le guglie stanno sui vertici di un esagono — due a nord,
 * due a sud e una per fianco — e il centro resta aperto per tutta l'altezza,
 * chiuso soltanto dal traverso della corona.
 */
export const SPIRE_RING: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.spireRing,
  blocks: [1, 1],
  span: [18, 18],
  height: 245,
  anchor: [9, 9],
  stages: [0, 50, 66, 82, 98],
  parts: [
    [
      box(PART.slab, 0, 0, 18, 18, 0, 13, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
        chamfer: 2,
      }),
      box(PART.deck, 0, 0, 18, 18, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.colonnade, 0, 0, 18, 18, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 18, 18, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.slab, 6, 0, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 6, 12, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    [
      box(PART.shell, 0, 0, 8, 8, 19, 70, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      box(PART.shell, 10, 0, 8, 8, 19, 70, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      box(PART.shell, 0, 10, 8, 8, 19, 70, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      box(PART.shell, 10, 10, 8, 8, 19, 70, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
    ],
    [
      // Il traverso attraversa il cavedio a croce: poggia sulle quattro barre.
      box(PART.boom, 8, 0, 2, 18, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 8, 0, 2, 18, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.shell, 0, 0, 8, 8, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.shell, 10, 0, 8, 8, 89, 80, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.shell, 0, 10, 8, 8, 89, 80, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.shell, 10, 10, 8, 8, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
    ],
    [
      // La corona a quota 168 chiude le quattro barre e regge i montanti.
      box(PART.boom, 0, 8, 18, 2, 168, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 0, 8, 18, 2, 174, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.mast, 4, 8, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 12, 8, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 8, y: 9, z: 80, label: 'crossbar' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 0, y: 0, z: 89, label: 'spires' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 9, y: 8, z: 168, label: 'crown' },
  ],
  landings: [
    { stage: 0, x: 6, y: 0, w: 6, h: 6, z: 23 },
    { stage: 0, x: 6, y: 12, w: 6, h: 6, z: 23 },
  ],
};

/**
 * Due isolati in linea: un doppio pettine.
 *
 * La prima forma multi-blocco: sei guglie in un'unica fila che attraversa due
 * isolati, con il vuoto centrale fra la terza e la quarta — dove corre la
 * carreggiata fra i due blocchi — scavalcato dalla trave di mezzanino e dalla
 * corona. Il podio copre l'inviluppo per intero, carreggiata compresa.
 */
export const DOUBLE_BAR: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.doubleBar,
  blocks: [2, 1],
  span: [48, 20],
  height: 245,
  anchor: [24, 10],
  stages: [0, 50, 68, 82, 98],
  parts: [
    [
      box(PART.slab, 0, 0, 48, 20, 0, 13, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 2,
      }),
      box(PART.deck, 0, 0, 48, 20, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.colonnade, 0, 0, 48, 20, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 48, 20, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.slab, 18, 0, 12, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 18, 14, 12, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    [
      // Tre barre piene di sezione 12x10 invece di sei guglie 3x3: la sezione
      // larga tiene la snellezza sotto il tetto e riempie l'inviluppo.
      box(PART.slab, 4, 5, 12, 10, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.slab, 18, 5, 12, 10, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.slab, 32, 5, 12, 10, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
    ],
    [
      box(PART.boom, 16, 5, 2, 10, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 16, 5, 2, 10, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.boom, 30, 5, 2, 10, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 30, 5, 2, 10, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.slab, 4, 5, 12, 10, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.slab, 18, 5, 12, 10, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.slab, 32, 5, 12, 10, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
    ],
    [
      // La corona a quota 168, sovrapposta alle barre: le chiude in alto.
      box(PART.boom, 4, 7, 40, 6, 168, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 4, 7, 40, 6, 174, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.mast, 20, 8, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 26, 8, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 17, y: 9, z: 80, label: 'span' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 4, y: 5, z: 89, label: 'spires' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 24, y: 8, z: 168, label: 'crown' },
  ],
  landings: [
    { stage: 0, x: 18, y: 0, w: 12, h: 6, z: 23 },
    { stage: 0, x: 18, y: 14, w: 12, h: 6, z: 23 },
  ],
};

/**
 * Due isolati impilati: una coppia di corpi in verticale.
 *
 * Sei guglie in un'unica colonna che attraversa due isolati in altezza, con il
 * vuoto centrale fra la terza e la quarta scavalcato dalle travi. L'asse lungo
 * corre lungo y: ruotata di un quarto di giro e' la gemella verticale del
 * doppio pettine.
 */
export const STACK_PAIR: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.stackPair,
  blocks: [1, 2],
  span: [20, 48],
  height: 245,
  anchor: [10, 24],
  stages: [0, 50, 68, 82, 98],
  parts: [
    [
      box(PART.slab, 0, 0, 20, 48, 0, 13, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
        chamfer: 2,
      }),
      box(PART.deck, 0, 0, 20, 48, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.colonnade, 0, 0, 20, 48, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 20, 48, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.slab, 0, 18, 6, 12, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 14, 18, 6, 12, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    [
      // Tre barre piene di sezione 10x12 in colonna, con due vuoti orizzontali.
      box(PART.slab, 4, 4, 12, 10, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.slab, 4, 18, 12, 10, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.slab, 4, 32, 12, 10, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
    ],
    [
      box(PART.boom, 5, 16, 10, 2, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 5, 16, 10, 2, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.boom, 5, 30, 10, 2, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 5, 30, 10, 2, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.slab, 4, 4, 12, 10, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.slab, 4, 18, 12, 10, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.slab, 4, 32, 12, 10, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
    ],
    [
      // La corona a quota 168 chiude le tre barre in alto.
      box(PART.boom, 5, 4, 10, 40, 168, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 5, 4, 10, 40, 174, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.mast, 8, 20, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 8, 26, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 9, y: 17, z: 80, label: 'span' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 4, y: 5, z: 89, label: 'spires' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 8, y: 24, z: 168, label: 'crown' },
  ],
  landings: [
    { stage: 0, x: 0, y: 18, w: 6, h: 12, z: 23 },
    { stage: 0, x: 14, y: 18, w: 6, h: 12, z: 23 },
  ],
};

/**
 * Quattro isolati a quadrato: un cavedio d'angolo al centro.
 *
 * Sei guglie su due file sfalsate che occupano quattro isolati, con il vuoto
 * centrale a croce — il quadrato e' l'inviluppo, non il pieno — attraversato
 * dalle travi. La forma piu' larga del catalogo.
 */
export const QUAD_CLUSTER: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.quadCluster,
  blocks: [2, 2],
  span: [48, 48],
  height: 245,
  anchor: [24, 24],
  stages: [0, 50, 68, 82, 98],
  parts: [
    [
      box(PART.slab, 0, 0, 48, 48, 0, 13, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 3,
      }),
      box(PART.deck, 0, 0, 48, 48, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 3,
      }),
      box(PART.colonnade, 0, 0, 48, 48, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        chamfer: 3,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 48, 48, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 3,
      }),
      box(PART.slab, 18, 0, 12, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 18, 42, 12, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    [
      // Quattro barre piene 12x12 ai quattro angoli, con il cavedio a croce al
      // centro: la sezione larga regge l'altezza senza diventare un palo.
      box(PART.slab, 4, 4, 12, 12, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.slab, 32, 4, 12, 12, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.slab, 4, 32, 12, 12, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.slab, 32, 32, 12, 12, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
    ],
    [
      // Il traverso passa sul bordo del cavedio: adiacente alle barre di sopra,
      // cosi' poggia su di esse e sotto resta la finestra di cielo.
      box(PART.boom, 4, 16, 40, 3, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 4, 16, 40, 3, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.slab, 4, 4, 12, 12, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.slab, 32, 4, 12, 12, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.slab, 4, 32, 12, 12, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.slab, 32, 32, 12, 12, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
    ],
    [
      // La corona a quota 168, sovrapposta alle barre: chiude il quadrato in alto.
      box(PART.boom, 4, 16, 40, 3, 168, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 4, 16, 40, 3, 174, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.mast, 22, 16, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 26, 16, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 6, y: 6, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 23, y: 17, z: 80, label: 'cross' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 4, y: 4, z: 89, label: 'spires' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 24, y: 17, z: 168, label: 'crown' },
  ],
  landings: [
    { stage: 0, x: 18, y: 0, w: 12, h: 6, z: 23 },
    { stage: 0, x: 18, y: 42, w: 12, h: 6, z: 23 },
  ],
};

/**
 * Tre isolati in linea: una barra che vale un quartiere intero.
 *
 * Sei guglie a coppie su tre blocchi, con un vuoto fra una coppia e la
 * successiva — i due attraversamenti stradali — scavalcato dalle travi. La
 * forma piu' lunga del catalogo.
 */
export const TRI_SPAN: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.triSpan,
  blocks: [3, 1],
  span: [72, 20],
  height: 245,
  anchor: [36, 10],
  stages: [0, 50, 68, 82, 98],
  parts: [
    [
      box(PART.slab, 0, 0, 72, 20, 0, 13, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
        chamfer: 2,
      }),
      box(PART.deck, 0, 0, 72, 20, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.colonnade, 0, 0, 72, 20, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 72, 20, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.slab, 30, 0, 12, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 30, 14, 12, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    [
      // Tre barre piene 16x12, una per isolato, con due vuoti orizzontali.
      box(PART.slab, 4, 4, 16, 12, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.slab, 28, 4, 16, 12, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.slab, 52, 4, 16, 12, 19, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
    ],
    [
      box(PART.boom, 20, 4, 8, 12, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 20, 4, 8, 12, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.boom, 44, 4, 8, 12, 80, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 44, 4, 8, 12, 85, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.slab, 4, 4, 16, 12, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.slab, 28, 4, 16, 12, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.slab, 52, 4, 16, 12, 89, 80, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
    ],
    [
      // La corona a quota 168, sovrapposta alle barre: le chiude in alto.
      box(PART.boom, 4, 7, 64, 6, 168, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 4, 7, 64, 6, 174, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.mast, 32, 8, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 38, 8, 2, 2, 175, 70, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 6, y: 4, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 24, y: 9, z: 80, label: 'span' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 4, y: 4, z: 89, label: 'spires' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 36, y: 8, z: 168, label: 'crown' },
  ],
  landings: [
    { stage: 0, x: 30, y: 0, w: 12, h: 6, z: 23 },
    { stage: 0, x: 30, y: 14, w: 12, h: 6, z: 23 },
  ],
};

const ARCOLOGIES: Record<ArcologyKind, ArcologyRecipe> = {
  twinStem: TWIN_STEM,
  branchingCore: BRANCHING_CORE,
  skyWeave: SKY_WEAVE,
  spireRing: SPIRE_RING,
  doubleBar: DOUBLE_BAR,
  stackPair: STACK_PAIR,
  quadCluster: QUAD_CLUSTER,
  triSpan: TRI_SPAN,
};

/** Tutte le ricette, in ordine di catalogo. */
export const ARCOLOGY_RECIPES: readonly ArcologyRecipe[] = Object.values(ARCOLOGIES);

export function arcologyOf(kind: ArcologyKind): ArcologyRecipe {
  return ARCOLOGIES[kind];
}
