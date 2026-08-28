import type { BuildingClass } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { BUILDER } from '../buildings/config';
import type { PartsRecipe } from '../landmarks/config';
import { withFacadeCourses } from './facadeCourses';
import { createArcologyProfileVariants } from './profileVariants';
import { createArcologyRecipes } from './recipes';

/**
 * Fonte di verita' delle regole e dei tipi delle arcologie.
 *
 * Le soglie globali restano qui; `recipes.ts` conserva le otto forme originarie,
 * `profileVariants.ts` aggiunge sagome derivate senza riscriverle e
 * `facadeCourses.ts` articola le facciate di entrambe senza toccarne la
 * geometria. La separazione tiene le responsabilita' sotto il limite lavorabile
 * e rende esplicito quali forme sono il catalogo storico, quali sono variazioni
 * e cosa invece e' solo il modo in cui un corpo si legge da fuori.
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
   * Una colonna e' l'unione dei corpi sovrapposti in pianta attraverso gli
   * stadi; la snellezza e' la sua altezza totale diviso il lato minore della
   * **sezione di base** — la piu' larga del gruppo — e non della sezione piu'
   * sottile. E' il numero che separa la rastremazione da un palo: le sezioni
   * superiori possono stringersi proprio perche' il tetto guarda la base, e una
   * guglia 3x3 alta centocinquanta quote resta un palo perche' la sua base e'
   * 3x3, non perche' in cima si e' stretta. Ventidue lascia salire un corpo da
   * [1,1] — base larga quanto l'isolato, sezione di base ~20 — fino a ~440
   * quote, che e' il triplo di oggi.
   *
   * La stessa soglia misura anche i **pennoni** (`mast`), per conto loro: il
   * montante unico 3x3 alto ottanta quote era il palo che passava la rete dei
   * corpi, e il gradone — tre tronchi che rientrano — e' il modo in cui una
   * cima la ripassa.
   */
  maxSlenderness: 22,

  /**
   * Vicini che aprono il primo stadio dopo il podio.
   *
   * Sta **sotto** `minBuilt`, di proposito: ogni arcologia appena fondata
   * (foundedNeighbours >= 64) supera subito questa soglia, quindi il corpo
   * comincia a salire nell'istante in cui nasce — un'arcologia tronca resta
   * comunque alta e leggibile, non un podio con due monconi.
   */
  firstStageNeighbours: 50,

  /**
   * Vicini che completano l'arcologia, identici per ogni ricetta.
   *
   * E' la stima documentata del centro denso (98; la misura completa di
   * `foundedNeighbours` non termina entro dieci minuti in questo ambiente)
   * meno cinque, e non il massimo stesso: tarare sull'estremo vorrebbe dire
   * che solo la citta' perfetta vede la corona.
   * Condiviso da tutte le ricette perche' la probabilita' di completarsi non
   * deve dipendere dal numero di stadi — con piu' stadi, soglie scritte a mano
   * per ricetta finirebbero con l'ultima piu' alta proprio sulle piu' grandi,
   * che sono quelle che devono arrivare in cima.
   */
  finalStageNeighbours: 93,
} as const;

/**
 * Le soglie di stadio di una ricetta, derivate dal numero di stadi.
 *
 * **Mai scritte a mano per ricetta.** Il primo stadio (dopo il podio) sta a
 * `firstStageNeighbours`, l'ultimo a `finalStageNeighbours`, e quelli in mezzo
 * cadono su una curva **quadratica**: fitti in basso — il corpo arriva presto —
 * e larghi in alto — rastremazione e corona si conquistano solo ad alta
 * densita'. Ne esce `[0, ...]`, lungo quanto `stages`: una voce per stadio, la
 * prima sempre zero.
 */
export function stageThresholds(stages: number): readonly number[] {
  if (stages <= 0) return [];
  if (stages === 1) return [0];
  const first = ARCOLOGY.firstStageNeighbours;
  const last = ARCOLOGY.finalStageNeighbours;
  if (stages === 2) return [0, last];
  const out: number[] = [0];
  for (let i = 1; i < stages; i++) {
    const t = (i - 1) / (stages - 2);
    out.push(first + Math.round((last - first) * t * t));
  }
  return out;
}

/** Le otto forme originarie, conservate come catalogo stabile. */
export const BASE_ARCOLOGY_KIND = {
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

export type BaseArcologyKind =
  (typeof BASE_ARCOLOGY_KIND)[keyof typeof BASE_ARCOLOGY_KIND];

/** Varianti che articolano il profilo verticale senza sostituire le originali. */
export const PROFILE_ARCOLOGY_KIND = {
  /** Twin Stem con due torri che cambiano quota e si ricuciono su terrazze sfalsate. */
  terracedTwin: 'terracedTwin',
  /** Branching Core che conserva quattro rami bassi e porta in cima soltanto una coppia. */
  splitCrown: 'splitCrown',
  /** Double Bar con i due corpi che avanzano a quote diverse lungo tutta la salita. */
  steppedBar: 'steppedBar',
  /** Quad Cluster a quattro torri scalari, con due sole che raggiungono la corona. */
  courtCascade: 'courtCascade',
} as const;

export type ProfileArcologyKind =
  (typeof PROFILE_ARCOLOGY_KIND)[keyof typeof PROFILE_ARCOLOGY_KIND];

/** Tutte le forme selezionabili dal driver. */
export const ARCOLOGY_KIND = {
  ...BASE_ARCOLOGY_KIND,
  ...PROFILE_ARCOLOGY_KIND,
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
  /** Forma originaria di cui questa ricetta articola il profilo; assente sulle originali. */
  readonly variationOf?: BaseArcologyKind;
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
 * Ricette costruite dopo regole e tipi, senza soglie duplicate nel catalogo.
 *
 * `withFacadeCourses` articola i corpi di **entrambi** i cataloghi: la monotonia
 * di una shell alta e monocroma non e' un difetto delle variazioni, e' come si
 * scrive un corpo qui. La trasformazione non tocca un voxel — solo palette,
 * linguaggio di facciata e riga di cornice — quindi le forme restano quelle che
 * i due cataloghi dichiarano.
 */
const BASE_ARCOLOGIES = withFacadeCourses(createArcologyRecipes(stageThresholds));
const PROFILE_ARCOLOGIES = withFacadeCourses(createArcologyProfileVariants(stageThresholds));
const ARCOLOGIES: Readonly<Record<ArcologyKind, ArcologyRecipe>> = {
  ...BASE_ARCOLOGIES,
  ...PROFILE_ARCOLOGIES,
};

export const TWIN_STEM = BASE_ARCOLOGIES.twinStem;
export const BRANCHING_CORE = BASE_ARCOLOGIES.branchingCore;
export const SKY_WEAVE = BASE_ARCOLOGIES.skyWeave;
export const SPIRE_RING = BASE_ARCOLOGIES.spireRing;
export const DOUBLE_BAR = BASE_ARCOLOGIES.doubleBar;
export const STACK_PAIR = BASE_ARCOLOGIES.stackPair;
export const QUAD_CLUSTER = BASE_ARCOLOGIES.quadCluster;
export const TRI_SPAN = BASE_ARCOLOGIES.triSpan;

export const TERRACED_TWIN = PROFILE_ARCOLOGIES.terracedTwin;
export const SPLIT_CROWN = PROFILE_ARCOLOGIES.splitCrown;
export const STEPPED_BAR = PROFILE_ARCOLOGIES.steppedBar;
export const COURT_CASCADE = PROFILE_ARCOLOGIES.courtCascade;

/** Le forme originarie, invariate e nello stesso ordine storico. */
export const BASE_ARCOLOGY_RECIPES: readonly ArcologyRecipe[] =
  Object.values(BASE_ARCOLOGIES);

/** Le sole variazioni di profilo verticale. */
export const PROFILE_ARCOLOGY_RECIPES: readonly ArcologyRecipe[] =
  Object.values(PROFILE_ARCOLOGIES);

/** Tutte le ricette, in ordine di catalogo. */
export const ARCOLOGY_RECIPES: readonly ArcologyRecipe[] = Object.values(ARCOLOGIES);

export function arcologyOf(kind: ArcologyKind): ArcologyRecipe {
  return ARCOLOGIES[kind];
}
