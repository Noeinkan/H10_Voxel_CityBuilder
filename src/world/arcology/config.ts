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
   * Quante arcologie l'isola ammette.
   *
   * **E' il vertice della gerarchia, e un vertice e' uno.** La 4.6 governa lo
   * skyline eleggendo pochi isolati di picco; qui il tetto e' esplicito perche'
   * la condizione che apre un'arcologia — centro denso e saturo — e' vera su
   * *tutto* il nucleo di una citta' matura, non su un isolato solo. Senza questo
   * numero il centro diventerebbe un secondo tappeto, piu' in alto.
   */
  maxPerIsland: 2,

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
} as const;

/** Le forme che un'arcologia puo' prendere. */
export const ARCOLOGY_KIND = {
  /** Due steli, un mezzanino che li unisce, una corona che li richiude. */
  twinStem: 'twinStem',
  /** Un nucleo che si divide in quattro bracci abitati e si ricuce in quota. */
  branchingCore: 'branchingCore',
  /** Tre steli sfalsati attraversati da impalcati su assi e quote diverse. */
  skyWeave: 'skyWeave',
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
  /** Gli usi, uno per fascia di quota, in ordine di stadio. */
  readonly bands: readonly ArcologyBand[];
  /** Gli attracchi della rete in quota, in ordine di stadio. */
  readonly landings: readonly ArcologyLanding[];
}

/**
 * L'arcologia a due steli.
 *
 * Cinque stadi, e ognuno e' una frase: **il podio** che si prende l'isolato,
 * **gli steli** che salgono lasciando il vuoto in mezzo, **il mezzanino** che lo
 * scavalca, **i corpi** che continuano a salire piu' stretti, **la corona** che
 * li richiude in alto. Il secondo e il terzo sono la coppia che conta: senza il
 * vuoto dello stadio uno il mezzanino sarebbe un piano qualunque, e senza il
 * mezzanino dello stadio due il vuoto sarebbe lo spazio fra due torri.
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
  span: [16, 16],
  height: 192,
  // Il centro: a differenza del porto, qui non c'e' un fronte da tenere sotto il
  // dito. La colonna che apre il cantiere e' quella che la condizione ha scelto,
  // e sta al centro dell'isolato che l'arcologia si prende per intero.
  anchor: [8, 8],
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
   * Quindi non e' il tempo a far salire gli stadi, e' il **luogo**: quanto era
   * densa la citta' li' attorno decide fin dove quell'arcologia arriva, e ci
   * arriva in una manciata di passate. Dove il centro e' pieno la struttura si
   * completa; dove lo era meno resta un podio con gli steli, che e' la stessa
   * cosa detta dalla forma.
   */
  stages: [0, 45, 60, 75, 92],
  parts: [
    // --- 0 · il podio produttivo -------------------------------------------
    [
      box(PART.slab, 0, 0, 16, 16, 0, 15, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 3,
      }),
      box(PART.deck, 0, 0, 16, 16, 15, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 3,
      }),
      // Il portico: e' l'unica primitiva che produce vuoto **sotto** un pieno, e
      // qui serve a dire che il podio e' abitato invece che pieno. Non e' una
      // finestra di cielo — quattro voxel non si vedono da fuori — ed e' la
      // ragione per cui `window.minHeight` esiste.
      box(PART.colonnade, 0, 0, 16, 16, 16, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
        step: 3,
        chamfer: 3,
        cap: PALETTE_SLOTS.concretePale,
      }),
      // Il tetto del podio, e non e' una finitura: e' **la quota a cui la rete in
      // quota sa arrivare**. Ventuno voxel sopra il piano finito stanno dentro i
      // trentadue che quattro pianerottoli assorbono, e ci sta anche una mensola
      // di un edificio normale del centro. Il piazzale del mezzanino, settanta
      // voxel piu' su, non ci sta e non ci stara' mai: senza questo piano
      // l'arcologia sarebbe attraccabile solo sulla carta.
      box(PART.deck, 0, 0, 16, 16, 20, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 3,
      }),
      // I due moli, uno per fronte. **Sono rialzati, e il rialzo e' la
      // correzione di una misura.** Con il piazzale a filo del tetto, la corsia
      // di un percorso partiva alla quota del tetto stesso: sull'asse dominante
      // i primi cinque voxel cadevano dentro il podio, e la coppia migliore
      // della citta' — dislivello uno, undici voxel di vuoto — moriva su
      // `blocked` senza che si vedesse da nessuna parte. Quattro voxel di
      // zoccolo bastano perche' la corsia passi **sopra** il tetto invece che
      // dentro.
      box(PART.slab, 5, 0, 6, 6, 21, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 5, 10, 6, 6, 21, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    // --- 1 · i due steli ----------------------------------------------------
    [
      // Partono da ventuno perche' sotto c'e' il tetto del podio: gli steli
      // **poggiano** su quel piano invece di attraversarlo.
      box(PART.shell, 0, 3, 5, 10, 21, 77, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.shell, 11, 3, 5, 10, 21, 77, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      // I due montanti di servizio, sulle spalle opposte dei due steli: hanno
      // aria dentro, ed e' l'aria a dire «struttura» prima di qualunque colore.
      box(PART.truss, 1, 12, 3, 4, 21, 59, PALETTE_SLOTS.metalRust, SURFACE_KIND.utility, {
        step: 5,
      }),
      box(PART.truss, 12, 0, 3, 4, 21, 59, PALETTE_SLOTS.metalRust, SURFACE_KIND.utility, {
        step: 5,
      }),
    ],
    // --- 2 · il mezzanino commerciale --------------------------------------
    [
      // La trave che scavalca: sotto restano quarantadue quote di vuoto passante,
      // ed e' quella la finestra di cielo.
      box(PART.boom, 5, 5, 6, 6, 62, 6, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 5, 5, 6, 6, 68, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.slab, 6, 6, 4, 4, 69, 8, PALETTE_SLOTS.glass, SURFACE_KIND.luminous, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      // Il piazzale del mezzanino: sei per sei come quello del podio, e per la
      // stessa misura — sotto la larghezza di una passerella un attracco non e'
      // un attracco.
      box(PART.deck, 5, 0, 6, 6, 68, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
    ],
    // --- 3 · i corpi abitati ------------------------------------------------
    [
      box(PART.deck, 0, 3, 5, 10, 98, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      box(PART.deck, 11, 3, 5, 10, 98, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      box(PART.shell, 1, 4, 3, 8, 99, 51, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.shell, 12, 4, 3, 8, 99, 51, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.glassPale,
      }),
    ],
    // --- 4 · la corona civica -----------------------------------------------
    [
      // Il secondo scavalco, ottanta quote sopra il primo: e' quello che si vede
      // da inquadratura d'insieme, ed e' anche cio' che chiude i due corpi in una
      // struttura sola invece di lasciarli due torri gemelle.
      box(PART.boom, 4, 6, 8, 4, 150, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 4, 6, 8, 4, 155, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.steps, 5, 6, 6, 4, 156, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 1,
        chamfer: 1,
      }),
      box(PART.mast, 2, 7, 2, 2, 150, 40, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 12, 7, 2, 2, 150, 40, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 2, 7, 2, 2, 190, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.slab, 12, 7, 2, 2, 190, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 3, y: 3, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 8, y: 8, z: 62, label: 'mezzanine' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 2, y: 8, z: 99, label: 'bodies' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 13, y: 8, z: 150, label: 'crown' },
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
    { stage: 0, x: 5, y: 0, w: 6, h: 6, z: 25 },
    { stage: 0, x: 5, y: 10, w: 6, h: 6, z: 25 },
    { stage: 2, x: 5, y: 0, w: 6, h: 6, z: 69 },
  ],
};

/**
 * Un nucleo che si ramifica in quattro torri.
 *
 * L'ingombro da quattordici colonne e' deliberato: e' la misura degli isolati
 * stretti che il mercato giocabile costruisce davvero. Il podio porta un solo
 * fusto; due travi ortogonali lo dividono in quattro bracci e la corona li
 * attraversa di nuovo, cosi' la struttura si legge come una biforcazione e non
 * come quattro torri accostate.
 */
export const BRANCHING_CORE: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.branchingCore,
  span: [14, 14],
  height: 188,
  anchor: [7, 7],
  stages: [0, 40, 58, 72, 88],
  parts: [
    [
      box(PART.slab, 0, 0, 14, 14, 0, 13, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
        chamfer: 2,
      }),
      box(PART.deck, 0, 0, 14, 14, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.colonnade, 0, 0, 14, 14, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 14, 14, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.slab, 4, 0, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 4, 8, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    [
      box(PART.shell, 5, 5, 4, 4, 19, 48, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.truss, 4, 4, 6, 6, 19, 38, PALETTE_SLOTS.metalRust, SURFACE_KIND.utility, {
        step: 5,
      }),
    ],
    [
      box(PART.boom, 1, 5, 12, 4, 55, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.boom, 5, 1, 4, 12, 61, 6, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 1, 5, 12, 4, 67, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.shell, 1, 5, 3, 4, 68, 79, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.shell, 10, 5, 3, 4, 68, 79, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.shell, 5, 1, 4, 3, 68, 79, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.shell, 5, 10, 4, 3, 68, 79, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
    ],
    [
      box(PART.boom, 1, 5, 12, 4, 147, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.boom, 5, 1, 4, 12, 152, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 2, 6, 2, 2, 152, 34, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 10, 6, 2, 2, 152, 34, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 2, 6, 2, 2, 186, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.slab, 10, 6, 2, 2, 186, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 2, y: 2, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 7, y: 6, z: 55, label: 'crossroads' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 2, y: 7, z: 68, label: 'branches' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 7, y: 2, z: 152, label: 'crown' },
  ],
  landings: [
    { stage: 0, x: 4, y: 0, w: 6, h: 6, z: 23 },
    { stage: 0, x: 4, y: 8, w: 6, h: 6, z: 23 },
  ],
};

/** Tre steli sfalsati, cuciti da due traversi che si incrociano in quota. */
export const SKY_WEAVE: ArcologyRecipe = {
  kind: ARCOLOGY_KIND.skyWeave,
  span: [14, 14],
  height: 184,
  anchor: [7, 7],
  stages: [0, 42, 58, 74, 90],
  parts: [
    [
      box(PART.slab, 0, 0, 14, 14, 0, 13, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 2,
      }),
      box(PART.deck, 0, 0, 14, 14, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.colonnade, 0, 0, 14, 14, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 14, 14, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, {
        chamfer: 2,
      }),
      box(PART.slab, 4, 0, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      box(PART.slab, 4, 8, 6, 6, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
    ],
    [
      box(PART.shell, 0, 2, 4, 5, 19, 75, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      box(PART.shell, 5, 7, 4, 5, 19, 57, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.shell, 10, 2, 4, 5, 19, 75, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
    ],
    [
      box(PART.boom, 0, 3, 14, 3, 57, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.boom, 6, 3, 3, 10, 62, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.deck, 4, 8, 6, 6, 67, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.shell, 1, 3, 3, 3, 94, 60, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      box(PART.shell, 5, 8, 4, 4, 76, 78, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      box(PART.shell, 10, 3, 3, 3, 94, 60, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
    ],
    [
      box(PART.boom, 1, 3, 12, 3, 154, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      box(PART.boom, 6, 3, 3, 9, 159, 5, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 2, 4, 2, 2, 159, 23, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 10, 4, 2, 2, 159, 23, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 2, 4, 2, 2, 182, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.slab, 10, 4, 2, 2, 182, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
  ],
  bands: [
    { stage: 0, use: BUILDING_CLASS.industrial, x: 2, y: 2, z: 0, label: 'podium' },
    { stage: 2, use: BUILDING_CLASS.commercial, x: 7, y: 4, z: 57, label: 'weave' },
    { stage: 3, use: BUILDING_CLASS.residential, x: 2, y: 4, z: 94, label: 'spires' },
    { stage: 4, use: BUILDING_CLASS.civic, x: 7, y: 9, z: 159, label: 'crown' },
  ],
  landings: [
    { stage: 0, x: 4, y: 0, w: 6, h: 6, z: 23 },
    { stage: 0, x: 4, y: 8, w: 6, h: 6, z: 23 },
  ],
};

const ARCOLOGIES: Record<ArcologyKind, ArcologyRecipe> = {
  twinStem: TWIN_STEM,
  branchingCore: BRANCHING_CORE,
  skyWeave: SKY_WEAVE,
};

/** Tutte le ricette, in ordine di catalogo. */
export const ARCOLOGY_RECIPES: readonly ArcologyRecipe[] = Object.values(ARCOLOGIES);

export function arcologyOf(kind: ArcologyKind): ArcologyRecipe {
  return ARCOLOGIES[kind];
}
