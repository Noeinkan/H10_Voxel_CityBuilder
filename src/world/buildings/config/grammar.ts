import {
  MAX_OVERHANG,
  SCALE,
  minBandSideOf,
  minFootprintOf,
  terraceMinRingOf,
} from '../../scale';
import { VISUAL_LEVELS } from './visual';

/**
 * Il vocabolario della forma: spessori, trasformazioni di fascia, coronamenti e
 * ruoli di lotto.
 *
 * Sono i nomi che il catalogo (`typologies.ts`) cita e che `generate.ts`
 * applica. Nessuna **regola** vive qui: quella delle fasce sta in `bandOps.ts`,
 * quella dei ruoli in `blockForm.ts`, e in quel verso e non nell'altro — se il
 * vocabolario importasse la regola, le due dipendenze si chiuderebbero in
 * cerchio e chi carica `blockForm` per primo troverebbe il catalogo a meta'
 * costruzione. Non e' teoria — e' successo scrivendolo.
 */

/**
 * Lato massimo assoluto di un'impronta, su qualunque livello.
 *
 * **E' la manopola orizzontale della scala**, importata da `src/world/scale.ts`
 * e non piu' un numero scritto qui: e' in voxel, e il voxel di un edificio e'
 * quello fine — un edificio e' fatto di mattoni piu' piccoli del cubo di terreno
 * su cui poggia (`TERRAIN.cellSize`). Raddoppiare il modulo qui significa
 * raddoppiare l'asse orizzontale senza ritoccare nessun altro numero.
 */
export const MAX_FOOTPRINT = SCALE.moduleFootprint;

/**
 * Lato minimo assoluto: sotto, un edificio e' un palo e non una casa.
 *
 * Deriva dal modulo (`moduleFootprint / 2`): serve dichiarato perche' il tiro
 * dell'impronta parte da qui, e un minimo che non seguisse la scala darebbe
 * casupole o pali a seconda di dove si gira la manopola.
 */
export const MIN_FOOTPRINT = minFootprintOf();

/**
 * Spessori della grammatica, in voxel.
 *
 * Sono le sole quote che non dipendono ne' dalla classe ne' dal livello: lo
 * zoccolo a terra, il portale al piano terra, il coronamento in cima e il lato
 * del dettaglio sul tetto. Stanno qui e non in `generate.ts` per la stessa
 * ragione di tutto il resto — un numero che decide una proporzione visibile si
 * cambia in un file solo.
 *
 * Sono tutti multipli di due perche' il voxel di un edificio e' la meta' del
 * cubo di terreno: alla scala vecchia uno zoccolo da un voxel era alto quanto
 * un gradino di terreno, e i due si confondevano.
 */
export const GRAMMAR = {
  /** Zoccolo a contatto col terreno: i voxel piu' bassi dell'intero edificio. */
  plinthHeight: 2,

  /** Quota entro cui una faccia sul fronte d'accento diventa portale. */
  portalHeight: 4,

  /**
   * Fascia piena alla base di ogni piano, sotto le aperture della campata.
   *
   * E' il parapetto, ed e' cio' che separa una facciata da un reticolo: senza,
   * l'apertura partirebbe dal solaio e fra una cornice e l'altra resterebbe una
   * vetrata continua. Due voxel sono un cubo di terreno, come lo zoccolo, e su
   * una fascia da quattro lasciano una sola riga di apertura — che e' la
   * proporzione giusta per il piano piu' basso che la grammatica produce.
   */
  spandrelHeight: 2,

  /** Altezza del coronamento, `[minimo, massimo]` inclusi. */
  crownHeight: [2, 4] as readonly [number, number],

  /** Altezza del coronamento quando la tipologia lo vuole piatto. */
  flatCrownHeight: 2,

  /**
   * Altezza della lanterna, sommata a quella tirata per il coronamento.
   *
   * E' la sola forma di coronamento che *sale* invece di chiudere: senza il
   * supplemento rientrerebbe di quattro voxel per lato e resterebbe bassa, cioe'
   * un cappello minuscolo invece di una torretta.
   */
  lanternRise: 4,

  /**
   * Lato del dettaglio verticale sul tetto.
   *
   * A un voxel su un tetto largo otto sparirebbe alla distanza di gioco, che e'
   * il contrario di cio' per cui esiste: chiudere la silhouette.
   */
  roofPropSide: 2,

  /**
   * Lato sotto cui una fascia non scende.
   *
   * Senza, una catena di rientranze porta la cima a un voxel e la torre finisce
   * a punta di spillo: succedeva gia' con `shrink` ripetuto, e con `stack` in
   * repertorio succederebbe in meta' delle fasce.
   *
   * **Deriva dal modulo, e non e' un gusto.** Con gli scarti di fascia
   * proporzionali al modulo (vedi `bandOps.ts`), un `minBandSide` fermo
   * riporterebbe un modulo largo a restringersi a un palo entro le prime fasce.
   * Meta' del modulo tiene il corpo un volume per tutta la salita: il coronamento
   * puo' assottigliarsi oltre, perche' e' il suo mestiere; il corpo no.
   */
  minBandSide: minBandSideOf(),

  /**
   * Larghezza minima dell'**anello scoperto** perche' una rientranza diventi
   * terrazza invece di restare uno scalino.
   *
   * Sotto, l'anello e' largo un passo e non ci si sta: verniciarlo di
   * pavimentazione mentirebbe, e — dato che la terrazza chiede a `emitRoofTech`
   * un parapetto — pagherebbe geometria di dettaglio per un bordo che nessuno
   * legge come praticabile.
   *
   * **Deriva dal passo degli scarti** (`terraceMinRingOf`): e' la profondita' di
   * `setback`, cioe' due passi. Uno scarto da un passo solo — un `jog` — resta
   * un gradino, ed e' proprio la distinzione che tiene la terrazza un luogo
   * invece che una cornice su ogni piano.
   */
  terraceMinRing: terraceMinRingOf(),

  /**
   * Voxel di cui l'inviluppo puo' uscire dall'impronta, **verso la strada**.
   *
   * **E' microgeometria e resta fisso.** Due sono un cubo di terreno: il piu'
   * piccolo sbalzo che si legga come tale invece che come un bordo storto. Sta
   * in `scale.ts` come `MAX_OVERHANG` perche' `segmentSide` deve tenerne conto,
   * e qui lo si riesporta perche' il vocabolario e' il posto in cui la grammatica
   * lo cita. Il tetto vero non e' un gusto ma aritmetica: `MAX_FOOTPRINT +
   * maxOverhang` deve restare sotto `CHUNK` e dentro `segmentSide`, e i conti
   * stanno in `scale.test.ts` e `overhang.test.ts`.
   */
  maxOverhang: MAX_OVERHANG,

  /**
   * Quota sotto cui nessuna fascia esce dall'impronta.
   *
   * Uno sbalzo a un voxel da terra non e' uno sbalzo, e' un ingombro sul
   * marciapiede. Sei voxel sono tre cubi di terreno: ci si passa sotto, ed e'
   * anche la quota sopra la quale il basamento condiviso di una fila
   * (`CLUSTER.baseHeight`) ha finito di salire — cosi' uno sbalzo non puo' mai
   * uscire dal fianco di uno zoccolo che i vicini condividono.
   */
  overhangFromZ: 6,

  /**
   * Smusso massimo ammesso a una tipologia, in voxel di lato.
   *
   * Sopra due, un lato da otto perde meta' della propria pianta e l'ottagono
   * diventa un rombo: non e' piu' un angolo tagliato ma un'altra forma, e le
   * facciate che restano sono troppo corte perche' la campata ci trovi una
   * colonna. Due e' anche il cubo di terreno, cioe' il taglio piu' piccolo che si
   * legga come voluto invece che come un errore di un voxel.
   */
  maxChamfer: 2,

  /**
   * Quota entro cui un portico e' vuoto, e altezza del suo architrave.
   *
   * Coincide con `portalHeight` e non e' una coincidenza: sono la stessa quota
   * vista da due parti — l'ingresso di un edificio qualunque e la luce di un
   * portico — e tenerle separate vorrebbe dire poter tarare un ingresso alto e
   * un portico basso sulla stessa facciata.
   */
  arcadeHeight: 4,

  /**
   * Fronte minimo perche' un portico si apra.
   *
   * Sotto, fra i due cantonali — che restano sempre pieni, come nella campata —
   * non resta spazio per una sola luce, e il portico sarebbe un buco in un muro.
   */
  arcadeMinSide: 5,

  /**
   * Livello da cui la faccia d'accento comincia a essere luminosa.
   *
   * Sotto, resta la grammatica di superficie dell'uso: una casa appena costruita
   * non deve sembrare un'insegna, e sono la maggioranza degli edifici — quindi
   * e' anche la voce che tiene basso il conto delle corse di `emitLuminous`.
   *
   * **E' la soglia `consolidated` delle cinque visuali**, non un numero suo: le
   * soglie vivono in `visual.ts`, e qui si riesporta solo la voce che la
   * grammatica cita.
   */
  luminousFromLevel: VISUAL_LEVELS.consolidated,

  /**
   * Livello da cui la lama luminosa sale su tutta la fascia.
   *
   * Fra le due soglie si accende il solo voxel di sommita': una riga per piano,
   * che a distanza legge come marcapiano illuminato e non come colonna al neon.
   * Come `luminousFromLevel`, e' la soglia `mature` delle cinque visuali.
   */
  luminousFullLevel: VISUAL_LEVELS.mature,
} as const;

/**
 * Le trasformazioni della regola di fascia, per nome.
 *
 * Sono la grammatica: una fascia si ricava da quella sotto applicando una di
 * queste, e non esiste altro modo di salire. Il podio, che prima era un ramo nel
 * ciclo, e' `keep` ripetuto; l'arretramento netto sopra di esso e' `shrink`.
 * Tenerle in tabella e non nel codice e' cio' che permette a un uso — e a una
 * tipologia, che sovrascrive il profilo — di avere un repertorio proprio senza
 * che `generate.ts` sappia chi sta chiedendo cosa.
 */
export const BAND_OP = {
  /** Ripete la fascia sotto: corpo continuo, e le fasce del basamento. */
  keep: 0,
  /** Rientranza centrata di un voxel per lato. */
  shrink: 1,
  /** Rientranza di un voxel su un lato solo: le terrazze asimmetriche. */
  shrinkOneSide: 2,
  /** Scarto laterale di un voxel a parita' di dimensione. */
  jog: 3,
  /** Allargamento di un voxel su un lato, dentro il riquadro. */
  grow: 4,
  /** Arretramento di due voxel su un lato: una terrazza in cui ci si sta. */
  setback: 5,
  /** Rientra due per lato e ricentra: e' il corpo sovrapposto, non un gradino. */
  stack: 6,
  /**
   * Scarto laterale di **due** voxel a parita' di dimensione.
   *
   * E' `jog` a scala leggibile. Un voxel di scarto su una torre da venti fasce
   * non si vede: e' meta' cubo di terreno, e a distanza di gioco legge come un
   * bordo storto invece che come un corpo spostato. Due voxel sono il cubo
   * intero, ed e' lo scarto che produce le pile sfalsate — una fascia che sporge
   * da una parte e rientra dall'altra, invece di una canna che sale dritta.
   */
  shear: 7,
  /**
   * Stringe un asse e allarga l'altro: il corpo che ruota invece di rastremarsi.
   *
   * E' l'unica voce che cambia **proporzione** senza cambiare massa. Tutte le
   * altre o rimpiccioliscono o spostano, quindi una silhouette e' sempre una
   * piramide o una canna; con questa una torre puo' presentare il lato lungo a
   * una strada in basso e all'altra in alto, che e' cio' che da' il movimento
   * alle pile senza spendere un voxel in piu'.
   */
  corner: 8,
  /**
   * Allarga la fascia di due **verso la strada**, oltre il filo dell'impronta.
   *
   * E' l'unica voce del repertorio che non sia una funzione della sola fascia
   * sotto: le serve sapere da che parte guarda l'edificio, perche' uno sbalzo va
   * sopra il marciapiede e mai sopra il vicino. Ed e' l'unica che esce
   * dall'impronta — il resto della grammatica non puo' farlo per costruzione.
   *
   * Allarga invece di spostare, e la differenza si vede da dietro: spostando, il
   * retro dell'edificio rientrerebbe di due e resterebbe un intaglio sul cortile.
   * Allargando, il piano sporge sulla via e il resto resta dov'era, che e' come
   * uno sbalzo e' fatto davvero.
   */
  jut: 9,
} as const;

export type BandOp = typeof BAND_OP[keyof typeof BAND_OP];

/**
 * Come una tipologia chiude la silhouette.
 *
 * Il coronamento era un booleano — piatto o no — e produceva due sole cime per
 * tutta la citta'. Qui ogni voce e' una geometria diversa applicata all'ultima
 * fascia del corpo, e la scelta arriva dal catalogo: sono i ripieghi per uso a
 * dare a ciascun uso la propria cima, e le righe con `minLevel` a distinguerla
 * per livello.
 */
export const CROWN_KIND = {
  /** Rientra di uno per lato e porta il dettaglio verticale. L'attuale default. */
  taper: 0,
  /** Non rientra affatto, basso e senza dettaglio: la copertura di un capannone. */
  flat: 1,
  /** Due gradini che rientrano: un cappello a gradoni, senza dettaglio. */
  stepped: 2,
  /** Rientra su un asse solo: la copertura lunga di un mercato o di un deposito. */
  ridge: 3,
  /** Rientra di due per lato e sale: la lanterna dei civici alti, con dettaglio. */
  lantern: 4,
  /**
   * Tre rientranze di fila sul solo asse corto: la falda a gradoni.
   *
   * E' `ridge` portato fino in fondo. Quello rientra una volta e resta un
   * cappello lungo; questo arriva al colmo, ed e' l'unica cima del repertorio che
   * finisca su una **linea** invece che su un piano. Serve alle case basse e ai
   * magazzini, dove un tetto piatto legge come un edificio non finito.
   */
  gable: 5,
} as const;

export type CrownKind = typeof CROWN_KIND[keyof typeof CROWN_KIND];

/**
 * Che parte di un isolato occupa un lotto.
 *
 * Sta qui accanto a `BAND_OP` e `CROWN_KIND` perche' e' la stessa cosa: un
 * vocabolario che il catalogo cita per nome. La **regola** che lo calcola vive in
 * `blockForm.ts`, come quella delle fasce vive in `bandOps.ts`.
 */
export const LOT_ROLE = {
  /** Sul fronte strada, in mezzo a un lato dell'isolato. */
  frontage: 0,
  /** All'incrocio di due fronti: e' il lotto che puo' allargarsi. */
  corner: 1,
  /** Nel cuore, senza un fronte proprio. */
  interior: 2,
} as const;

export type LotRole = (typeof LOT_ROLE)[keyof typeof LOT_ROLE];
