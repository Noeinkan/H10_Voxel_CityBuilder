import type { BuildingClass, CatalystId } from '../../sim';
import { BUILDING_CLASS } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';

/**
 * Unica fonte di verita' dei numeri del distretto costiero.
 *
 * **Che cos'e' il distretto costiero.** Un landmark che vive sull'acqua —
 * marina, porto, traghetto — non e' soltanto la struttura del catalizzatore:
 * e' il mestiere del posto, e il posto lo dice con gli edifici che ci
 * crescono attorno (un club nautico, un capannone container, una casa sul
 * canale) e con le opere che il mestiere comporta (banchine guadagnate al
 * mare, canali scavati nella riva, frangiflutti). Il distretto e' l'impronta
 * che il landmark lascia sul circondario, e nasce con lui: qui stanno le sue
 * misure, nel solo file che il dominio autorizza a portarne.
 *
 * **Contenuto per costruzione.** L'anello del distretto cresce con lo stadio
 * del landmark e ha un tetto — `ringByStage` dell'ultimo stadio — mai piu' di
 * due isolati. Ogni opera dichiara il proprio confine: il molo una
 * profondita', il canale una lunghezza, il frangiflutti una campata. Niente
 * di tutto questo si estende: e' la differenza fra un'impronta e una colata.
 *
 * **Gli edifici portano bonus e malus come tutti gli altri.** Non c'e' una
 * porta nuova verso la simulazione: gli edifici del distretto sono record
 * ordinari, quindi pagano la congestione e portano capacita' come chiunque,
 * e il bonus di settore arriva dal catalizzatore — che cresce di stadio con
 * il landmark — e dalle tipologie che il ruolo sblocca. `src/sim/` non sa
 * che il distretto esiste, esattamente come non sa che i landmark esistono.
 */

export const HARBOR = {
  /** Cadenza della passata del distretto, in tick. */
  ticksPerPass: 10,

  /** Quanti edifici di settore un'infornata puo' far nascere. */
  sitesPerPass: 1,

  /** Lato massimo di un ritaglio di scavo o di colmata, in colonne. */
  pieceSpan: 16,

  /** Quota del frangiflutti sopra il pelo dell'acqua, in voxel. */
  breakwaterFreeboard: 2,

  /**
   * Quota del piano di un pontile sopra il pelo, in voxel.
   *
   * **Un pontile non e' una banchina, ed e' l'altezza a dirlo.** La banchina sta
   * a `GRADING.quayFreeboard` — sei voxel, tre piani di cubo — perche' e' il
   * bordo costruito della terra e deve stare in quota con il piano della citta'
   * che ci arriva sopra. Un pontile e' un tavolato appoggiato sull'acqua: due
   * voxel, come il frangiflutti, e sopra ci si cammina soltanto.
   *
   * Era il difetto piu' visibile del distretto a schermo: i pontili si
   * colmavano al piano della banchina e uscivano dall'acqua come **blocchi di
   * pietra alti dodici voxel** — dal fondale fino a sei sopra il pelo — invece
   * che come tavolati.
   */
  pierFreeboard: 2,

  /**
   * Passo dei pali di un pontile, in colonne.
   *
   * **Un pontile e' vuoto sotto**, ed e' l'altra meta' di cio' che lo distingue
   * da una colmata: la pietra scende solo sui pali, il resto e' acqua che ci
   * passa sotto. Tre colonne e' il passo piu' largo che regga la lettura a
   * distanza isometrica — a quattro il tavolato sembra sospeso sul niente.
   */
  pierPile: 3,

  /** Profondita' dei canali del distretto sotto il pelo, in voxel. */
  canalDepth: 2,

  /**
   * Quanto oltre il fronte costruito il frangiflutti cerca l'acqua, in colonne.
   *
   * **Le opere erano tagliate sul riquadro canonico, non sulla costa.** Un
   * canale cominciava a `waterline` meno la propria lunghezza, e il frangiflutti
   * stava alla somma dei fronti piu' il proprio stacco: numeri della ricetta e
   * della tabella, non del terreno. Vanno bene finche' la riva e' parallela al
   * fronte della struttura, che e' il caso che si guarda quando si scrive la
   * tabella e quasi mai quello che il seme produce — il piazzamento porta *una*
   * colonna sulla battigia, e le colonne a dieci di distanza possono essere
   * terra ferma o mare aperto. Ne uscivano canali che finivano nel prato e
   * bracci di pietra posati sulla spiaggia.
   *
   * Il canale non ha bisogno di questo numero: la sua sonda si ferma al bordo
   * dell'anello, che e' gia' il confine del distretto. Il frangiflutti invece
   * parte **da** quel bordo e guarda oltre, quindi un tetto suo gli serve.
   * Ventiquattro colonne sono il doppio abbondante di quanto una costa si sposta
   * sotto un ingombro da venti: oltre, non e' piu' lo specchio che quel porto
   * protegge, ed e' giusto che il braccio non si costruisca.
   */
  shoreReach: 24,

  /** Voxel del corpo del frangiflutti e della colmata, sotto il piano. */
  fillBody: PALETTE_SLOTS.stone,

  /** Ultimo voxel del frangiflutti: il cappello che si legge dal mare. */
  fillCap: PALETTE_SLOTS.stoneDark,

  /**
   * Il tavolato di un pontile, e i pali che lo reggono.
   *
   * **Il legno e' meta' di cio' che distingue un pontile da una banchina**, e a
   * distanza isometrica e' la meta' che si vede per prima: la pietra chiara
   * della banchina e il bruno del tavolato sono due materiali diversi prima
   * ancora di essere due quote diverse. I pali stanno nei bruni scuri, cosi'
   * che l'ombra sotto il tavolato si legga come vuoto e non come basamento.
   */
  pierDeckPalette: PALETTE_SLOTS.wood,
  pierPilePalette: PALETTE_SLOTS.asphaltDark,

  /**
   * La calata: il gradino con cui una banchina scende verso l'acqua.
   *
   * **Una banchina alta sei voxel senza un gradino e' un muro**, e a distanza
   * di gioco e' esattamente cosi' che si legge — un bordo netto fra la citta' e
   * il mare, senza niente che dica come si passa dall'una all'altro. La calata
   * e' la prima riga di colonne sul filo dell'acqua, riscritta un cubo piu' in
   * basso: costa un confronto per colonna e rompe la parete in due quote.
   */
  quayLanding: PALETTE_SLOTS.stoneWarm,

  /**
   * Passo delle scalette che scendono dalla calata all'acqua, in colonne.
   *
   * Una ogni dodici: abbastanza rare da restare un dettaglio, abbastanza fitte
   * perche' su una dita di banchina da ventisei colonne ce ne siano due.
   */
  stairPitch: 12,

  /** Colore della passeggiata del distretto: il suolo pubblico del fronte. */
  promenadePalette: PALETTE_SLOTS.concretePale,

  // --- Il vocabolario delle figure d'acqua ----------------------------------

  /**
   * Fin dove una figura si spinge, in colonne dallo zero canonico.
   *
   * **Due isolati.** La maglia stradale ha passo quaranta colonne, quindi
   * ottanta sono due isolati esatti — ed e' la scala che il vocabolario chiede:
   * una darsena leggibile vuole venti colonne per quaranta, un canale settanta
   * di lunghezza. L'anello del distretto resta quello che era, otto colonne, e
   * continua a governare la **passeggiata**: quella e' suolo pubblico dipinto
   * attorno alla struttura, non una figura, e allargarla a due isolati
   * dipingerebbe mezzo quartiere.
   *
   * E' anche il tetto della sonda della costa: oltre, non e' piu' la riva di
   * questo landmark.
   */
  figureReach: 80,

  /**
   * Terra dietro la riva che le darsene a pettine pretendono, in colonne.
   *
   * Ventotto: un bacino da venti piu' la testata murata piu' il margine con cui
   * il pettine si stacca da cio' che sta dietro. Sotto, il pettine uscirebbe dal
   * fondo del proprio bacino, che e' il modo in cui una darsena diventa una
   * trincea nel prato.
   */
  dockLand: 28,

  /**
   * Terra dietro la riva che il canale pretende, in colonne.
   *
   * Meta' delle darsene, perche' un canale e' sottile: gli servono la sua
   * larghezza, l'isola che stacca verso il mare e la sponda di terra dall'altra
   * parte. Sotto questa soglia resta l'argine.
   */
  canalLand: 14,

  /**
   * Quanto la riva puo' spostarsi perche' si chiami dritta, in colonne.
   *
   * Riguarda le sole darsene, ed e' il vincolo che le distingue dal canale: i
   * bacini di un pettine si aprono **tutti sullo stesso mare**, quindi su una
   * costa che rientra di quindici colonne meta' di loro si aprirebbe
   * sull'asciutto. Il canale no: lui la riva la segue.
   */
  straightSpread: 10,

  /** Larghezza di un bacino di darsena, e della dita di banchina fra due. */
  dockWidth: 10,
  dockFinger: 8,
  /** Quanto un bacino entra nella terra, in colonne. */
  dockLength: 26,
  /** Quanti bacini al massimo, quando la fascia li regge tutti. */
  dockCount: 3,

  /**
   * La gru di banchina: sbraccio, altezza del braccio sopra il piano, palette.
   *
   * **E' la firma verticale di una darsena.** A distanza isometrica un bacino
   * rettangolare senza niente sopra e' una vasca: e' il braccio a sbalzo sopra
   * l'acqua a dire che di li' si scarica qualcosa. Otto colonne di sbraccio
   * coprono quasi tutto il bacino da dieci, e dodici voxel di altezza mettono il
   * braccio sopra i tetti degli edifici bassi che nascono sulla dita.
   */
  craneReach: 8,
  craneHeight: 12,
  cranePalette: PALETTE_SLOTS.metalRust,
  craneCap: PALETTE_SLOTS.metalBrass,

  /** Larghezza del canale e della sua isola verso il mare, in colonne. */
  canalWidth: 4,
  canalIsland: 10,
  /** Lunghezza del canale lungo la costa, in colonne. */
  canalRun: 64,

  /** Braccio del porticciolo: sporto verso il largo, spessore, bocca. */
  coveArm: 18,
  coveThickness: 2,
  coveMouth: 8,

  /** Argine: profondita' della banchina guadagnata e passo dei pontili. */
  embankmentDeck: 4,
  embankmentPier: 16,

  /**
   * Passo fra due lotti sulla stessa banchina, in colonne.
   *
   * Dodici: un edificio ordinario ne occupa otto al massimo, e quattro di
   * respiro sono la calata fra due fronti. Piu' fitto e la dita di banchina
   * diventa una fila continua, che a distanza isometrica legge come un muro
   * lungo quaranta colonne invece che come una citta' sull'acqua.
   */
  lotPitch: 12,
} as const;

/**
 * Il mestiere di un ruolo sull'acqua: quali opere costruisce e con quale
 * confine, quanti edifici di settore merita per stadio e di che uso.
 */
export interface HarborRoleConfig {
  /** Larghezza dell'anello del distretto per stadio, in colonne. */
  readonly ringByStage: readonly number[];

  /**
   * L'insenatura scavata oltre il fronte della struttura, che cresce con
   * l'anello: la darsena che si allarga dentro la riva a ogni stadio.
   */
  readonly inlet?: {
    readonly fromStage: number;
    /** Profondita' sotto il pelo, in voxel. */
    readonly depth: number;
  };

  /**
   * La figura d'acqua di scala: darsene, canale, porticciolo o argine.
   *
   * **Il ruolo dice solo quando**, non quale. A scegliere e' la costa che il
   * landmark si e' trovato davanti (`site.ts`), ed e' voluto: due porti sulla
   * stessa isola vengono diversi perche' stanno in due posti diversi, che e' la
   * ragione per cui in una citta' vera i due porti sono diversi.
   *
   * Ha sostituito `canals`, che erano due rettangoli perpendicolari alla costa
   * larghi tre e lunghi dodici — la stessa forma per ogni ruolo, ogni luogo e
   * ogni seme.
   */
  readonly figure?: {
    readonly fromStage: number;
  };

  /** Molo di terra guadagnata oltre la battigia: la baia artificiale. */
  readonly reclamation?: {
    readonly fromStage: number;
    /** Quante colonne oltre il fronte della struttura. */
    readonly depth: number;
    /** Margine laterale del molo, in colonne. */
    readonly sideMargin: number;
  };

  /** Canale di accesso approfondito davanti al molo. */
  readonly access?: {
    readonly fromStage: number;
    /** Profondita' sotto il pelo, in voxel. */
    readonly depth: number;
    /** Quante colonne oltre il molo. */
    readonly span: number;
  };

  /** Frangiflutti staccato davanti al fronte: chiude lo specchio d'acqua. */
  readonly breakwater?: {
    readonly fromStage: number;
    /** Campata lungo la costa, in colonne: i due bracci **piu'** il varco. */
    readonly length: number;
    /** Colonne fra il fronte piu' avanzato e il frangiflutti. */
    readonly gap: number;
    /** Spessore del braccio, in colonne. */
    readonly width: number;
    /**
     * Il varco fra i due bracci, in colonne: la bocca del porto.
     *
     * **Un frangiflutti senza varco e' una diga**, ed e' quello che era: una
     * campata piena davanti al fronte, che chiudeva lo specchio *e* la strada.
     * Le rotte adesso camminano sull'acqua e sanno doppiarlo — quindi il difetto
     * non ferma piu' nessuna nave — ma doppiare un braccio di quattordici
     * colonne per rientrare in un porto che ha la bocca davanti e' esattamente
     * il percorso che si legge come «la barca gira a caso».
     *
     * Sta al centro della campata, dove guardano gli ormeggi della ricetta, ed
     * e' largo quanto la sagoma piu' larga che ci passa piu' un margine: cinque
     * voxel per una nave da carico, quattro per un traghetto, due per uno yacht.
     */
    readonly mouth: number;
  };

  /** Edifici di settore cumulativi per stadio. */
  readonly sitesByStage: readonly number[];

  /** Uso di ogni slot di settore, in ordine di sblocco. */
  readonly siteClasses: readonly BuildingClass[];
}

/**
 * I ruoli che lasciano un'impronta sulla costa, e le loro misure.
 *
 * **Gli stadi sono quelli del landmark**: lo zero e' la sola struttura,
 * e il distretto arriva con cio' che il quartiere ha meritato. La marina
 * scava l'insenatura e i canali — il suo mestiere e' l'acqua calma dentro
 * la riva — e chiude un frangiflutti corto; il porto guadagna terra al mare
 * e scava il canale di accesso — il suo mestiere e' la banchina — con un
 * braccio di pietra lungo quanto lo specchio che protegge; il traghetto si
 * allunga di un molo solo, perche' il suo posto e' il collegamento e non il
 * bacino.
 */
export const HARBOR_ROLES: Partial<Record<CatalystId, HarborRoleConfig>> = {
  marina: {
    ringByStage: [0, 3, 6, 8],
    inlet: { fromStage: 1, depth: 2 },
    figure: { fromStage: 2 },
    breakwater: { fromStage: 3, length: 12, gap: 1, width: 2, mouth: 4 },
    sitesByStage: [0, 1, 3, 5],
    siteClasses: [
      BUILDING_CLASS.residential,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.residential,
      BUILDING_CLASS.commercial,
    ],
  },
  port: {
    ringByStage: [0, 3, 6, 8],
    reclamation: { fromStage: 2, depth: 6, sideMargin: 2 },
    figure: { fromStage: 2 },
    access: { fromStage: 3, depth: 3, span: 4 },
    breakwater: { fromStage: 3, length: 18, gap: 2, width: 2, mouth: 6 },
    sitesByStage: [0, 1, 3, 5],
    siteClasses: [
      BUILDING_CLASS.industrial,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.industrial,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.industrial,
    ],
  },
  ferry: {
    ringByStage: [0, 2, 4, 6],
    reclamation: { fromStage: 2, depth: 3, sideMargin: 3 },
    figure: { fromStage: 3 },
    breakwater: { fromStage: 3, length: 12, gap: 2, width: 2, mouth: 5 },
    sitesByStage: [0, 1, 2, 3],
    siteClasses: [
      BUILDING_CLASS.civic,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.civic,
    ],
  },
};
