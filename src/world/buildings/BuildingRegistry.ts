import {
  CLASS_COUNT,
  type BuildingClass,
  type CatalystId,
  type DistrictId,
  type Specialization,
} from '../../sim';
import type { BuildingForm } from './config';
import type { BuildingArch } from './archPlan';
import type { ArcologyKind } from '../arcology/config';
import type { SpanKind } from '../spans/config';
import type { RopewayPart } from '../ropeway/config';
import type { LandmarkFormId } from '../landmarks/config';
import { isBuildable, takesGround, type AerialPart } from '../aerial/config';
import { columnKey, toChunk } from '../chunkCoords';
import { STRUCTURE_KIND, structureKindOf } from './structureKind';

/**
 * Unica fonte di verita' su cosa esiste.
 *
 * Il mondo voxel sa quali celle sono piene ma non sa perche': un muro e un
 * pezzo di collina sono lo stesso byte. Il registry sa che quei voxel sono un
 * edificio, di che classe, di che livello e con che seed — abbastanza da
 * rigenerarne l'impronta e cancellarla, senza conservarne una copia.
 *
 * **Non scrive voxel e non conosce il `VoxelWorld`.** E' un indice, non un
 * costruttore: chi lo interroga decide cosa farne. L'unico a scrivere resta il
 * Builder.
 *
 * **L'occupazione e' tridimensionale.** L'isola ha XY limitato e la citta'
 * cresce in altezza: due edifici sulla stessa colonna a quote disgiunte sono
 * legali, e devono esserlo, altrimenti la crescita verticale sarebbe impossibile
 * per costruzione. Il test di sovrapposizione confronta quindi anche gli
 * intervalli in z, non solo i riquadri.
 */

export interface BuildingRecord {
  readonly id: number;

  /** Angolo minimo dell'impronta sul piano di terra. */
  readonly x: number;
  readonly y: number;

  /** Voxel d'ancoraggio in altezza: la prima quota occupata. */
  readonly baseZ: number;

  /** Lato dell'impronta lungo x. Per un edificio e' anche l'unico lato. */
  readonly footprint: number;

  /**
   * Lato dell'impronta lungo y, quando non coincide con `footprint`.
   *
   * Gli edifici sono quadrati per contratto — la fascia di base riempie il
   * riquadro, e la collisione resta un confronto fra due quadrati. I landmark
   * no: un molo, una pista e un viadotto sono lineari per natura, e
   * schiacciarli in un quadrato li farebbe leggere come monconi. Resta
   * opzionale perche' un record quadrato non deve portarsi dietro un campo che
   * ripete `footprint`.
   */
  readonly footprintY?: number;

  /** Voxel occupati in altezza a partire da `baseZ`. */
  readonly height: number;

  /** Uso urbano primario. */
  readonly class: BuildingClass;

  /**
   * Secondo uso ospitato, se l'edificio e' misto.
   *
   * Sta nel registry e non solo nella simulazione perche' serve a ridisegnarlo:
   * il podio prende il colore e la grammatica del secondo uso, e senza questo
   * campo un upgrade lo perderebbe.
   */
  readonly mixed?: BuildingClass;

  readonly level: number;
  readonly seed: number;
  /** Profilo locale congelato per poter rigenerare esattamente lo stamp. */
  readonly form?: BuildingForm;
  /**
   * Tipologia con cui l'edificio e' stato scritto.
   *
   * E' l'altra meta' di cio' che serve a rigenerarne l'impronta: seed e livello
   * danno la sequenza, la tipologia da' la forma su cui quella sequenza si
   * applica. Cancellare un edificio rigenerandolo con la tipologia che il luogo
   * esprime *adesso* lascerebbe voxel orfani.
   */
  readonly typology?: string;

  /**
   * Stile del quartiere in cui l'edificio e' nato.
   *
   * **Ridondante per costruzione, e tenuto lo stesso.** `styleAt` e' una
   * funzione pura di `(worldSeed, isolato)`, quindi chiunque abbia il seme del
   * mondo lo ricava — ma `recordStamp` riceve un record e basta, e dargli il
   * seme del mondo vorrebbe dire passarlo attraverso cinque chiamanti che non ne
   * hanno altro uso. Un campo costa meno, e mette al riparo dal giorno in cui
   * qualcuno riordina il catalogo degli stili: le sagome gia' scritte
   * continuerebbero a rigenerarsi con la propria riga invece che con quella che
   * ora occupa il suo posto.
   */
  readonly style?: string;

  /**
   * Voxel di cui il corpo sporge oltre l'impronta, verso `facing`.
   *
   * **Uno sbalzo non prende suolo**, ed e' il gemello dei due invarianti che
   * questa cartella ha gia': una campata non prende suolo da nessuna parte, un
   * impalcato lo prende solo con la gamba. Qui il record entra in `columns`
   * sull'**inviluppo** — quindi niente si costruisce *attraverso* uno sbalzo — e
   * in `groundColumns` sulla sola **impronta**, quindi sotto la carreggiata si
   * dipinge ancora e accanto nasce ancora un lotto.
   *
   * Sta nel record per la stessa ragione di `typology`, `facing` e `baseBand`:
   * e' meta' di cio' che serve a rigenerare la sagoma per cancellarla. Zero non
   * si scrive — un edificio che non sporge non deve portarsi dietro un campo che
   * dice «non sporgo».
   */
  readonly overhang?: number;

  /**
   * Il braccio che questo edificio getta verso il dirimpettaio, se ne ha uno.
   *
   * **E' massa dell'edificio, non una struttura appoggiata**, ed e' l'unica
   * cosa che lo separa da una campata di `spans/`: nessun record in piu',
   * nessun appoggio, nessun guinzaglio: cresce e cade con chi lo porta, e
   * `recordStamp` lo ridisegna insieme al corpo. Verso `facing` e da nessun'altra
   * parte, come lo sbalzo — `envelopeOf` legge il solo `reach` e non deve sapere
   * altro.
   *
   * Sta nel record per la ragione di sempre: e' meta' di cio' che serve a
   * rigenerare la sagoma per cancellarla.
   */
  readonly arch?: BuildingArch;

  /**
   * Gli **altri** sedimi di questo record, oltre a quello di `x/y/footprint`.
   *
   * **E' la riga che toglie «un edificio, un rettangolo».** Fino a qui un record
   * occupava un riquadro solo, e tutto cio' che sta a valle — `columns`,
   * `overlaps`, la fondazione, la cancellazione — lo dava per scontato. Un
   * edificio che ha assorbito il dirimpettaio non e' un rettangolo: sono due
   * sedimi con in mezzo la carreggiata, che **resta carreggiata**.
   *
   * **Non e' l'inviluppo che si allarga.** Prendere il riquadro che li contiene
   * tutti e due sarebbe stato piu' semplice e sbagliato: prenoterebbe la strada
   * in mezzo, e sotto un edificio non ci passa piu' niente — ne' un ponte, ne'
   * una mensola, ne' l'asfalto. `plotOf` restituisce percio' i sedimi *veri*, e
   * `index` li scandisce uno per uno.
   *
   * Assente su quasi tutta la citta', e non e' un caso da gestire: `plotOf` di
   * un record senza questo campo e' il suo inviluppo, cioe' esattamente il
   * ciclo di prima.
   */
  readonly parts?: readonly PlanRect[];

  readonly district?: DistrictId;
  readonly specialization?: Specialization | null;
  /**
   * Faccia rivolta alla strada, negli indici di `accentFace`.
   *
   * Sta nel record per la stessa ragione di `typology`: e' meta' di cio' che
   * serve a rigenerare l'impronta. Un upgrade che ricalcolasse l'orientamento
   * dalla rete di adesso cancellerebbe la sagoma vecchia con una nuova che
   * porta l'accento su un'altra faccia, e lascerebbe voxel orfani.
   */
  readonly facing?: number;

  /**
   * Ruolo del catalizzatore, se questo record e' il suo landmark.
   *
   * **E' l'unica cosa che distingue un landmark da un edificio.** Tutto il
   * resto — occupazione, collisione, budget di chunk, comparsa a budget,
   * avanzamento — e' la stessa macchina, e `level` e' lo stadio. Cambia solo
   * quale generatore disegna lo stamp, ed e' cio' che ha permesso di aggiungere
   * otto strutture senza una seconda passata e senza un secondo indice.
   *
   * Un record con questo campo resta fuori dagli istogrammi: la simulazione non
   * lo ha mai contato come edificio, e vederlo comparire in `countsByClass`
   * significherebbe che l'HUD conta otto edifici che nessuno ha costruito.
   */
  readonly landmark?: CatalystId;

  /**
   * Vero se questo landmark poggia su un **tetto** invece che sul terreno.
   *
   * E' la quarta riga della stessa macchina di `landmark`, `span` e `aerial`: un
   * flag dice quale ricetta disegna lo stamp, e occupazione, collisione, budget
   * di chunk e comparsa a budget restano quelle che ci sono gia'. Cambia due
   * cose, ed entrambe seguono dal non toccare terra: non prende le colonne di
   * suolo — sotto ci passa ancora la carreggiata, che e' l'invariante di
   * `aerial/` — e mette il proprio ospite fra quelli che **non promuovono**,
   * perche' una torre che cambia sagoma sotto uno scalo lo lascerebbe appeso.
   */
  readonly aloft?: boolean;

  /**
   * La forma contestuale con cui il landmark e' stato scritto, se il luogo ne
   * ha scelta una.
   *
   * **E' la ricetta, e `landmark` il ruolo.** Il catalizzatore, l'influenza e la
   * selezione restano del ruolo; questa stringa dice quale sagoma lo disegna.
   * Due forme dello stesso ruolo convivono cosi' senza un secondo flag — il
   * record conserva la forma e `landmarkDriver` la rilegge a ogni avanzamento.
   *
   * Resta fuori dall'indice: la sola cosa che il registry deve sapere di una
   * forma e' se prende suolo, e quella e' `aloft`, denormalizzato al piazzamento
   * e letto da `takesGroundOf` senza dipendere da `landmarks/`.
   */
  readonly landmarkForm?: LandmarkFormId;

  /**
   * Quota dello specchio che il landmark fronteggia, in voxel.
   *
   * Assente per chi non guarda l'acqua. Sul mare vale il livello del mare, sul
   * lago quello della conca: chi la legge — lo scavo del bacino, gli ormeggi a
   * galla — non deve chiedere di nuovo al terreno, che per una marina sul lago
   * non lo saprebbe dire senza sapere quale colonna sia la bocca del bacino.
   */
  readonly waterZ?: number;

  /**
   * Forma dell'arcologia, se questo record e' una megastruttura.
   *
   * **E' la quinta riga della stessa macchina di `landmark`, `span`, `aerial` e
   * `aloft`**: un flag dice quale generatore disegna lo stamp, e occupazione,
   * collisione, budget di chunk e comparsa a budget restano quelle che ci sono
   * gia'. Come per un landmark, `level` e' lo **stadio** e non il livello urbano.
   *
   * A distinguerla dalle altre quattro c'e' `uses`: un'arcologia e' l'unica
   * struttura che la simulazione conta, perche' e' l'unica che ospita davvero
   * qualcuno.
   */
  readonly arcology?: ArcologyKind;

  /**
   * Vicini entro `ARCOLOGY.radius` al momento della fondazione, congelati.
   *
   * Serve alla sola progressione degli stadi, e non al conteggio vivo: la
   * fondazione sventra l'isolato, e ricalcolare `countWithinRadius` dopo lo
   * sventramento toglie dal conto proprio gli edifici che avevano fatto
   * superare `minBuilt` — il podio nasce e non trova piu' i vicini per salire
   * alla corona. Congelando qui il valore letto da `arcologyReady`, la stessa
   * misura decide fondazione e stadi, sullo stesso istante. Solo le arcologie
   * lo portano: i landmark nascono presto e la citta' gli cresce intorno, quindi
   * il loro stadio legge il conteggio vivo.
   */
  readonly foundedNeighbours?: number;

  /**
   * Gli usi che questa struttura ospita, uno per fascia di quota.
   *
   * **Non e' `mixed` generalizzato**, ed e' importante non confonderli. `mixed`
   * e' il secondo uso della *grammatica delle fasce* di un edificio: cambia il
   * colore e la forma del podio, quindi serve a **ridisegnarlo**. Questo non
   * disegna niente: e' cio' che la struttura contiene, e serve a **contarlo**.
   *
   * `tally` legge queste voci al posto della `class` del record, e il driver
   * chiama `addBuilding` una volta per voce dello stesso array: e' cosi' che
   * `countsByClass` resta esattamente uguale a `state.buildingCounts` anche con
   * una struttura che vale quattro edifici. Un solo posto da tenere allineato.
   *
   * **Non e' piu' solo delle arcologie.** Un edificio che ne ha assorbito un
   * altro fondendosi porta qui l'uso di chi si e' preso: due record diventano
   * uno, e senza questo elenco la citta' perderebbe un edificio dall'istogramma
   * mentre la simulazione ne conta ancora due. Il primo elemento e' sempre
   * l'uso proprio del record, cosi' chi conta non deve sommare due sorgenti.
   */
  readonly uses?: readonly BuildingClass[];

  /**
   * Fila di edifici contigui a cui questo appartiene, se ne ha una.
   *
   * **Un cluster e' due numeri su un record, non un'entita'.** Questo dice solo
   * *con chi*; l'altro e' `baseBand`. La quota condivisa non ha bisogno di un
   * campo suo, perche' e' gia' `baseZ`. Non esiste nessuna struttura che
   * sopravviva ai membri, ed e' il motivo per cui collisione, budget di chunk e
   * cancellazione restano esattamente quelli di un edificio solo.
   */
  readonly cluster?: number;

  /**
   * Altezza in voxel del corso di base condiviso con la fila. Zero o assente
   * dove la fila non ne ha uno.
   *
   * Sta nel record per la stessa ragione di `typology` e `facing`: e' meta' di
   * cio' che serve a rigenerare l'impronta. Un upgrade che ricalcolasse il
   * basamento dalla fila di adesso cancellerebbe la sagoma vecchia con una che
   * parte da un'altra quota, e bucherebbe lo zoccolo sotto il vicino.
   */
  readonly baseBand?: number;

  /**
   * Tipo di campata, se questo record e' una campata e non un edificio.
   *
   * **E' l'altra meta' del mestiere di `landmark`**, e la stessa mossa: un flag
   * dice quale generatore disegna lo stamp, e tutto il resto — occupazione,
   * collisione, budget di chunk, comparsa a budget — resta la macchina che c'e'
   * gia'. A distinguere una campata da un landmark c'e' un fatto solo, ed e'
   * quello che la fase 4.5 esiste per introdurre: **una campata non prende
   * suolo**. Non entra in `groundColumns`, quindi sotto un ponte la carreggiata
   * si dipinge ancora e i lotti si costruiscono ancora.
   *
   * `baseZ` smette qui di venire dal terreno: e' la prima cosa che poggia su
   * altre cose, ed e' l'assunzione che la 4.9 dovra' rompere comunque.
   */
  readonly span?: SpanKind;

  /**
   * Parte di una funivia, se questo record e' una delle sue torri.
   *
   * **E' la quinta riga della stessa macchina di `landmark`, `span`, `aerial` e
   * `aloft`**: un flag dice quale generatore disegna lo stamp, e occupazione,
   * collisione, budget di chunk e comparsa a budget restano quelle che ci sono
   * gia'. Una stazione prende suolo come un edificio — poggia a terra, e sotto
   * di lei non passa niente — quindi qui non c'e' niente da togliere a
   * `groundColumns`: l'unica differenza e' che non e' un edificio, e `tally` la
   * salta come salta gli altri quattro.
   *
   * **La fune non ha un record**, e non e' una dimenticanza: non e' materia, e
   * fra le due torri non prende nessuna colonna. Vale per lei la regola del
   * traffico, non quella delle strutture.
   */
  readonly ropeway?: RopewayPart;

  /**
   * Parte della citta' in quota, se questo record e' una delle sue.
   *
   * **E' la terza riga della stessa macchina di `landmark` e `span`**: un flag
   * dice quale generatore disegna lo stamp, e occupazione, collisione, budget
   * di chunk e comparsa a budget restano quelle che ci sono gia'. A distinguere
   * le sue quattro forme c'e' l'invariante del dominio — **un impalcato in quota
   * non prende suolo; lo prende solo la gamba che scende a terra** — che qui e'
   * una riga di `index`: la gamba entra in `groundColumns`, mensole, tratti e
   * nodi no.
   *
   * E' l'esatto complemento di `span`, che non prende suolo da nessuna parte, ed
   * e' anche cio' che rompe l'assunzione annunciata li' sopra: sopra una mensola
   * o un nodo, `baseZ` non viene piu' dal terreno.
   */
  readonly aerial?: AerialPart;

  /**
   * Gli id degli edifici su cui la campata — o l'impalcato — poggia.
   *
   * Sono il suo posto nella rete e insieme il suo guinzaglio: quando uno di
   * questi cambia livello o sagoma la campata cade, perche' la sagoma su cui si
   * appoggiava non esiste piu'. Un appoggio che fosse solo un numero lascerebbe
   * campate a mezz'aria, che e' esattamente cio' che il vincolo della fase vieta.
   *
   * Per un impalcato in quota il guinzaglio tira dall'altra parte: un edificio
   * che ospita una mensola o regge una gamba **smette di promuovere**, perche'
   * cambiare sagoma sotto un impalcato lo lascerebbe appeso. Chi regge non
   * cresce.
   */
  readonly supports?: readonly number[];
}

/** Profondita' dell'impronta lungo y: quella dichiarata, o il lato quadrato. */
export function footprintDepth(record: {
  readonly footprint: number;
  readonly footprintY?: number;
}): number {
  return record.footprintY ?? record.footprint;
}

/** Cio' che serve a ricostruire l'inviluppo di un record. */
export interface EnvelopeSource {
  readonly x: number;
  readonly y: number;
  readonly footprint: number;
  readonly footprintY?: number;
  readonly overhang?: number;
  readonly facing?: number;
  readonly arch?: { readonly reach: number; readonly face: number };
  readonly parts?: readonly PlanRect[];
}

/** Riquadro in pianta, estremi esclusi in alto. */
export interface PlanRect {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

/**
 * Il riquadro che un record **prenota**: l'impronta piu' lo sbalzo.
 *
 * **E' diverso dall'impronta solo in aria.** L'impronta e' cio' che poggia — la
 * legge chi cerca un lotto, chi progetta l'opera di terra, chi dipinge la
 * carreggiata — e non si muove di un voxel. L'inviluppo e' cio' che nessun altro
 * puo' attraversare, e lo legge `overlaps`. Sono lo stesso rettangolo su ogni
 * edificio che non sporge, cioe' su quasi tutti.
 *
 * Lo sbalzo va **da una parte sola**, quella di `facing`: e' cio' che permette a
 * due edifici accostati di restare accostati. Un inviluppo simmetrico li farebbe
 * collidere, e con loro cadrebbe l'aggregazione in fila — che e' precisamente il
 * modo in cui questa citta' fa gli isolati.
 *
 * **Un braccio puo' uscire da un'altra parte, e per questo la crescita si conta
 * per faccia.** L'arco che un edificio getta verso il dirimpettaio va dove sta
 * il vuoto, che non e' sempre il proprio fronte strada: in questa maglia due
 * corpi che si affacciano sullo stesso vuoto appartengono spesso a due assi
 * diversi. Sulla stessa faccia i due crescono al massimo dell'uno e dell'altro;
 * su facce diverse crescono tutti e due, e l'inviluppo resta un rettangolo — il
 * record multi-rettangolo e' un'altra cosa, e non serve qui.
 *
 * Resta vero cio' che conta: **la crescita e' solo dove il vuoto c'e' gia'**.
 * Un braccio nasce unicamente dentro uno stacco di due-dieci voxel che nessuno
 * occupa, quindi l'inviluppo non puo' andare a cadere sul vicino di fila — che
 * e' l'incidente contro cui l'asimmetria dello sbalzo era stata scritta.
 */
export function envelopeOf(record: EnvelopeSource): PlanRect {
  const depth = footprintDepth(record);
  // Una casella per faccia, negli indici di `facing`: 0 e 1 sull'asse x, 2 e 3
  // sull'asse y. E' il modo in cui «al massimo» e «tutti e due» diventano la
  // stessa aritmetica invece di due rami.
  const grown = [0, 0, 0, 0];
  const over = record.overhang ?? 0;
  if (over > 0 && record.facing !== undefined) grown[record.facing] = over;
  const arch = record.arch;
  if (arch !== undefined && arch.reach > 0) {
    grown[arch.face] = Math.max(grown[arch.face], arch.reach);
  }
  return {
    x: record.x - grown[1],
    y: record.y - grown[3],
    sizeX: record.footprint + grown[0] + grown[1],
    sizeY: depth + grown[2] + grown[3],
  };
}

/**
 * Tutti i sedimi che un record prenota: l'inviluppo, piu' gli altri se li ha.
 *
 * **E' il ciclo di `index` reso plurale, e su quasi tutta la citta' e' quello di
 * prima**: senza `parts` l'elenco ha una voce sola e la scansione e' identica.
 * Chi ne ha piu' d'uno e' l'edificio che ha assorbito il dirimpettaio, e per lui
 * la differenza e' tutta: i suoi due sedimi entrano negli indici *separati*,
 * quindi la carreggiata in mezzo resta libera e continua a dipingersi. Prendere
 * il riquadro che li contiene sarebbe stato una riga in meno e una strada in
 * meno.
 */
export function plotOf(record: EnvelopeSource): readonly PlanRect[] {
  const base = envelopeOf(record);
  return record.parts === undefined || record.parts.length === 0
    ? [base]
    : [base, ...record.parts];
}

/**
 * Il riquadro che contiene tutti i sedimi di un record.
 *
 * **Non e' cio' che il record prenota**, ed e' importante non confonderlo con
 * `plotOf`: qui dentro c'e' anche la strada. Serve a chi ha bisogno di *un*
 * rettangolo e non di un'occupazione — il conto dei chunk sporchi, la tela su
 * cui la sagoma si compone — cioe' a chi misura un ingombro, mai a chi decide
 * chi puo' costruire dove.
 */
export function boundsOf(record: EnvelopeSource): PlanRect {
  const rects = plotOf(record);
  let x0 = rects[0].x;
  let y0 = rects[0].y;
  let x1 = x0 + rects[0].sizeX;
  let y1 = y0 + rects[0].sizeY;
  for (const rect of rects) {
    x0 = Math.min(x0, rect.x);
    y0 = Math.min(y0, rect.y);
    x1 = Math.max(x1, rect.x + rect.sizeX);
    y1 = Math.max(y1, rect.y + rect.sizeY);
  }
  return { x: x0, y: y0, sizeX: x1 - x0, sizeY: y1 - y0 };
}

/**
 * Cio' che il resto del progetto puo' fare al registry: leggere.
 *
 * Il tipo esiste per essere il parametro di chiunque non sia il Builder. Non e'
 * una convenzione da rispettare a memoria: chi riceve questo tipo non ha
 * proprio i metodi per scrivere.
 */
export interface ReadonlyBuildingRegistry {
  /**
   * Tutti i record, in ordine di inserimento.
   *
   * E' una lettura come le altre — l'iteratore non espone niente con cui
   * scrivere — e serve a chi deve passare in rassegna la citta' intera: la
   * passata di upgrade, gli overlay, i test di forma urbana. L'alternativa
   * sarebbe scandire le colonne con `at`, che risponderebbe la stessa cosa
   * costando quanto la mappa invece che quanto la citta'.
   */
  readonly all: IterableIterator<BuildingRecord>;
  get(id: number): BuildingRecord | null;
  /**
   * true se un qualunque edificio **prende il suolo** di questa colonna.
   *
   * E' `at(x, y).length > 0` senza il costo di `at`, che materializza un array
   * di record per rispondere. La differenza non conta su una colonna, conta
   * quando la ricerca di un lotto ne interroga qualche migliaio per infornata.
   *
   * **Le campate non contano.** La domanda qui e' «questo suolo e' preso», e un
   * ponte scavalca il suolo senza prenderlo: sotto ci passa ancora la
   * carreggiata e ci nasce ancora un lotto. Chi vuole sapere se un *volume* e'
   * libero chiede a `overlaps`, che confronta anche le quote.
   */
  isOccupied(x: number, y: number): boolean;
  at(x: number, y: number): readonly BuildingRecord[];
  withinRadius(x: number, y: number, radius: number): readonly BuildingRecord[];
  /**
   * Quanti record cadono entro `radius`, senza materializzarli.
   *
   * E' `withinRadius(...).length` senza l'array, e la differenza non e' di stile:
   * la gerarchia verticale chiede «quanto e' costruito qui attorno» una volta per
   * record esaminato in una passata di upgrade, cioe' decine di volte per
   * passata, e in un centro denso ogni domanda tocca qualche centinaio di record.
   * Costruire quell'array per leggerne solo la lunghezza era, misurato, la meta'
   * del costo della passata.
   */
  countWithinRadius(x: number, y: number, radius: number): number;
  overlaps(
    x: number,
    y: number,
    footprint: number,
    baseZ: number,
    height: number,
    footprintY?: number,
    except?: readonly number[],
  ): boolean;
  /** Quota della prima cella libera sopra cio' che gia' occupa la colonna. */
  topOf(x: number, y: number): number;
  /**
   * Su cosa si puo' poggiare qualcosa, in questa colonna: quota e portante.
   *
   * E' `topOf` **meno le campate**, piu' l'id di chi porta quella quota. Una
   * passerella non regge una gamba — la sua sagoma dipende dai suoi appoggi, e
   * quando quelli promuovono lei cade — quindi il piede di un impalcato la
   * ignora e appoggia su cio' che c'e' sotto. `id` vale 0 dove non c'e' niente
   * e la quota e' quella del terreno, che il registry non conosce.
   */
  supportAt(x: number, y: number): { readonly z: number; readonly id: number };
  readonly count: number;
  /** Landmark dei catalizzatori: contati a parte, mai fra gli edifici. */
  readonly landmarkCount: number;
  /**
    * Arcologie esistenti.
    *
    * Contate a parte come i landmark, ma per una ragione in piu': e' da qui che
    * la passata legge la quota (`arcologyQuota`), invece di tenersi un
    * contatore proprio che una demolizione potrebbe far divergere.
    */
  readonly arcologyCount: number;
  /**
   * Le campate esistenti, in ordine di inserimento.
   *
   * Sono unita', non migliaia, e si tengono in un indice proprio invece di
   * filtrare `all`: la rete in quota si ricostruisce a ogni passata, e farlo
   * scandendo la citta' intera sarebbe l'unica cosa nel ciclo il cui costo
   * cresce con il numero di edifici.
   */
  readonly spans: readonly BuildingRecord[];
  /** Quante campate esistono, senza materializzarle. */
  readonly spanCount: number;
  /** Le campate che poggiano su questo edificio. */
  spansOf(supportId: number): readonly BuildingRecord[];
  /**
   * Gli impalcati in quota su cui si costruisce — mensole e nodi — in ordine di
   * inserimento.
   *
   * Come `spans`, e per la stessa ragione: sono unita', le passate li riguardano
   * tutti, e filtrare `all` per trovarli sarebbe l'unica cosa nel ciclo il cui
   * costo cresce con il numero di edifici.
   */
  readonly decks: readonly BuildingRecord[];
  readonly deckCount: number;
  /** Quante parti della citta' in quota esistono: mensole, tratti, nodi e gambe. */
  readonly aerialCount: number;
  /** Quante torri di funivia esistono: due per linea. */
  readonly ropewayCount: number;
  /**
   * Gli impalcati appesi a questo edificio.
   *
   * Serve alla stessa cosa di `spansOf`, e per la stessa ragione: quando l'ospite
   * cambia sagoma, cio' che gli e' appeso deve seguirlo o sparire — mai restare a
   * mezz'aria.
   */
  decksOf(supportId: number): readonly BuildingRecord[];
  /**
   * true se un impalcato in quota poggia su questo record.
   *
   * **Chi regge non cresce.** Un edificio che ospita una mensola o porta una
   * gamba non puo' piu' cambiare sagoma: una campata che perde l'appoggio cade e
   * la passata successiva la ripropone, ma sopra un impalcato c'e' una citta', e
   * farlo cadere sarebbe una demolizione. Il verso del guinzaglio si inverte, e
   * questa e' la domanda che l'upgrade fa prima di promuovere.
   */
  carries(id: number): boolean;
  readonly countsByClass: readonly number[];
  /** Edifici che *ospitano* un uso come secondo, con la stessa indicizzazione. */
  readonly mixedByClass: readonly number[];
  readonly levelHistogram: readonly number[];
  /** Edifici per tipologia, in ordine di prima comparsa. Serve all'overlay. */
  readonly typologyHistogram: ReadonlyMap<string, number>;
}

const EMPTY: readonly BuildingRecord[] = [];

export class BuildingRegistry implements ReadonlyBuildingRegistry {
  private readonly records = new Map<number, BuildingRecord>();

  /**
   * Riquadri prenotati da un cantiere aperto.
   *
   * **Non sono record e non ne aggiungono uno**, e il motivo vale la pena
   * dirlo: il cantiere demolisce a budget, e mentre dura la citta' continua a
   * crescere — gli angoli del riquadro che i condannati non occupano restano
   * liberi, e la simulazione ci costruirebbe dentro. La prenotazione dice a
   * `isOccupied` e a `overlaps` che quelle colonne sono di chi sta per
   * arrivare, cosi' la struttura trova il posto esattamente come l'ha lasciato
   * il preventivo. Vale per l'intera colonna — niente voli sopra il cantiere —
   * ed e' voluto: un impalcato che attraversa un riquadro in demolizione
   * fermerebbe la costruzione che arriva.
   */
  private readonly reservations: PlanRect[] = [];

  /**
   * Quante volte questo registro ha **liberato** suolo.
   *
   * Sale a ogni prenotazione rilasciata e a ogni record tolto, e non scende mai:
   * e' l'unico verso che interessa a chi tiene una memoria di cio' che era
   * occupato. Chi la tiene — il `BlockMemo` della ricerca dei lotti — non ha
   * bisogno di sapere *cosa* si e' liberato, solo che qualcosa lo ha fatto, e un
   * contatore monotono e' la forma piu' piccola di quella domanda. Sta qui e non
   * nel `Builder` perche' e' questo oggetto a rispondere `isOccupied`: la
   * memoria e il fatto che invalida devono stare nella stessa casa.
   */
  private vacatedCount = 0;

  get vacated(): number {
    return this.vacatedCount;
  }

  /** Prenota il riquadro per chi ci sta costruendo dentro. */
  reserveRect(rect: PlanRect): void {
    this.reservations.push(rect);
  }

  /** Rilascia il riquadro: il cantiere ha finito. */
  releaseRect(rect: PlanRect): void {
    const index = this.reservations.findIndex((reserved) =>
      reserved.x === rect.x && reserved.y === rect.y &&
      reserved.sizeX === rect.sizeX && reserved.sizeY === rect.sizeY);
    if (index >= 0) {
      this.reservations.splice(index, 1);
      this.vacatedCount++;
    }
  }

  private isReserved(x: number, y: number): boolean {
    for (const rect of this.reservations) {
      if (x >= rect.x && x < rect.x + rect.sizeX &&
        y >= rect.y && y < rect.y + rect.sizeY) {
        return true;
      }
    }
    return false;
  }

  /**
   * Id che coprono una colonna. Un'impronta e' al massimo 3x3, quindi un
   * edificio compare in al massimo nove voci: e' cio' che rende il test di
   * sovrapposizione esatto invece che approssimato da un riquadro.
   */
  private readonly columns = new Map<number, number[]>();

  /**
   * Le sole colonne di cui qualcuno **prende il suolo**.
   *
   * E' `columns` meno le campate, e vive separato invece di essere un filtro
   * perche' `isOccupied` sta nel percorso caldo di `placeLot`, dove le colonne
   * si contano a migliaia per infornata: filtrare vorrebbe dire risolvere gli id
   * in record proprio li'. Cosi' la domanda «questo suolo e' preso» costa
   * esattamente quello che costava prima, e un ponte non toglie un lotto a
   * nessuno.
   */
  private readonly groundColumns = new Map<number, number[]>();

  /** Le campate, per poterle scorrere senza scandire la citta'. */
  private readonly spanIds = new Set<number>();

  /** Gli impalcati edificabili, per la stessa ragione delle campate. */
  private readonly deckIds = new Set<number>();

  /**
   * Quanti impalcati in quota poggiano su un record.
   *
   * Un contatore e non un elenco: la sola domanda che si fa e' «questo edificio
   * regge qualcosa?», e tenerne la lista costerebbe un array per ogni gamba
   * piantata su un tetto per rispondere a un booleano.
   */
  private readonly carried = new Map<number, number>();

  /** Impalcati per edificio che li ospita, come `spansBySupport` per le campate. */
  private readonly decksBySupport = new Map<number, number[]>();

  /**
   * Campate per edificio che le regge.
   *
   * E' il guinzaglio del vincolo della fase: quando un appoggio cambia livello o
   * sagoma, da qui si ritrova in O(1) cosa deve cadere con lui.
   */
  private readonly spansBySupport = new Map<number, number[]>();

  /**
   * Id per colonna di chunk, con la stessa chunkatura del resto del progetto.
   *
   * Serve solo a `withinRadius`: senza, una query per raggio scandirebbe tutti i
   * record della citta', e con duemila edifici e' esattamente la scansione che
   * non ci si puo' permettere in un ciclo.
   */
  private readonly buckets = new Map<number, number[]>();

  private readonly classCounts = new Array<number>(CLASS_COUNT).fill(0);
  private readonly mixedCounts = new Array<number>(CLASS_COUNT).fill(0);
  private readonly levelCounts: number[] = [];
  private readonly typologyCounts = new Map<string, number>();

  private landmarks = 0;

  /**
   * Record della citta' in quota: mensole, tratti, nodi e gambe insieme.
   *
   * Nessuna delle quattro parti e' un edificio: la simulazione non le ha mai
   * registrate con `addBuilding`, e contarle qui farebbe divergere gli
   * istogrammi dell'HUD dai conteggi su cui il bilancio ragiona — che e' la
   * stessa ragione per cui non ci sono i landmark ne' le campate.
   */
  private aerialParts = 0;

  /**
   * Le torri di funivia esistenti.
   *
   * Stessa ragione delle quattro parti in quota, e stesso trattamento: prendono
   * suolo come un edificio, ma un edificio non sono, e contarle fra loro
   * mostrerebbe nell'HUD due civici che nessuno ha costruito per ogni linea.
   */
  private ropewayParts = 0;

  /**
   * Le arcologie esistenti.
   *
   * Non sono edifici — `count` le esclude come esclude le altre quattro
   * strutture — ma **contengono** edifici, e quelli `classCounts` li conta. E'
    * l'unico record del progetto per cui le due cose non coincidono, ed e' anche
    * la ragione per cui questo contatore esiste separato: la quota di arcologie
    * (`arcologyQuota`) si legge da qui e non contando a mano nella passata.
    */
  private arcologies = 0;

  private nextId = 1;

  /**
   * Edifici veri: landmark e campate occupano il registry ma non sono edifici.
   *
   * La simulazione non li ha mai registrati con `addBuilding`, e contarli qui
   * farebbe divergere gli istogrammi dell'HUD dai conteggi su cui il bilancio
   * ragiona.
   */
  get count(): number {
    return this.records.size - this.landmarks - this.spanIds.size - this.aerialParts -
      this.ropewayParts - this.arcologies;
  }

  get landmarkCount(): number {
    return this.landmarks;
  }

  get arcologyCount(): number {
    return this.arcologies;
  }

  get spans(): readonly BuildingRecord[] {
    const out: BuildingRecord[] = [];
    for (const id of this.spanIds) {
      const record = this.records.get(id);
      if (record !== undefined) out.push(record);
    }
    return out;
  }

  get spanCount(): number {
    return this.spanIds.size;
  }

  spansOf(supportId: number): readonly BuildingRecord[] {
    const ids = this.spansBySupport.get(supportId);
    if (ids === undefined) return EMPTY;
    return ids.map((id) => this.records.get(id)).filter(isRecord);
  }

  get decks(): readonly BuildingRecord[] {
    const out: BuildingRecord[] = [];
    for (const id of this.deckIds) {
      const record = this.records.get(id);
      if (record !== undefined) out.push(record);
    }
    return out;
  }

  get deckCount(): number {
    return this.deckIds.size;
  }

  get aerialCount(): number {
    return this.aerialParts;
  }

  /** Le torri di funivia: due per linea, e nessun edificio fra loro. */
  get ropewayCount(): number {
    return this.ropewayParts;
  }

  decksOf(supportId: number): readonly BuildingRecord[] {
    const ids = this.decksBySupport.get(supportId);
    if (ids === undefined) return EMPTY;
    return ids.map((id) => this.records.get(id)).filter(isRecord);
  }

  carries(id: number): boolean {
    return (this.carried.get(id) ?? 0) > 0;
  }

  get countsByClass(): readonly number[] {
    return this.classCounts;
  }

  get mixedByClass(): readonly number[] {
    return this.mixedCounts;
  }

  get levelHistogram(): readonly number[] {
    return this.levelCounts;
  }

  get typologyHistogram(): ReadonlyMap<string, number> {
    return this.typologyCounts;
  }

  /** Tutti i record, in ordine di inserimento. La passata di upgrade li scorre. */
  get all(): IterableIterator<BuildingRecord> {
    return this.records.values();
  }

  get(id: number): BuildingRecord | null {
    return this.records.get(id) ?? null;
  }

  at(x: number, y: number): readonly BuildingRecord[] {
    const ids = this.columns.get(columnKey(x, y));
    if (ids === undefined) return EMPTY;
    return ids.map((id) => this.records.get(id)).filter(isRecord);
  }

  isOccupied(x: number, y: number): boolean {
    if (this.isReserved(x, y)) return true;
    const ids = this.groundColumns.get(columnKey(x, y));
    return ids !== undefined && ids.length > 0;
  }

  /**
   * Quota della prima cella libera sopra la colonna.
   *
   * E' il punto d'ancoraggio di chi vuole costruire sopra qualcosa. Restituisce
   * 0 su una colonna libera: chi costruisce a terra parte dal terreno, e la
   * quota del terreno la sa la `TerrainMap`, non il registry.
   */
  topOf(x: number, y: number): number {
    let top = 0;
    for (const record of this.at(x, y)) {
      const above = record.baseZ + record.height;
      if (above > top) top = above;
    }
    return top;
  }

  /**
   * Quota e portante di cio' su cui si puo' poggiare in questa colonna.
   *
   * Le campate restano fuori: la loro sagoma dipende dagli appoggi, e piantare
   * un pilone su un ponte significherebbe legare una piattaforma al livello di
   * due torri — cioe' il contrario di cio' per cui il suolo artificiale esiste.
   */
  supportAt(x: number, y: number): { readonly z: number; readonly id: number } {
    let z = 0;
    let id = 0;
    for (const record of this.at(x, y)) {
      if (record.span !== undefined) continue;
      const above = record.baseZ + record.height;
      if (above > z) {
        z = above;
        id = record.id;
      }
    }
    return { z, id };
  }

  /** Record il cui angolo minimo cade entro `radius` in distanza di Chebyshev. */
  withinRadius(x: number, y: number, radius: number): readonly BuildingRecord[] {
    const out: BuildingRecord[] = [];
    this.scanRadius(x, y, radius, (record) => { out.push(record); });
    return out;
  }

  countWithinRadius(x: number, y: number, radius: number): number {
    let count = 0;
    this.scanRadius(x, y, radius, () => { count++; });
    return count;
  }

  /**
   * Scorre i record entro `radius`, senza raccoglierli.
   *
   * Un punto solo per le due domande — «quali» e «quanti» — perche' la
   * chunkatura dei bucket e il filtro di Chebyshev sono la parte che deve restare
   * identica fra loro: due copie divergerebbero al primo raggio che cambia.
   */
  private scanRadius(
    x: number,
    y: number,
    radius: number,
    visit: (record: BuildingRecord) => void,
  ): void {
    const minCc = toChunk(x - radius);
    const maxCc = toChunk(x + radius);
    const minCcy = toChunk(y - radius);
    const maxCcy = toChunk(y + radius);

    for (let ccy = minCcy; ccy <= maxCcy; ccy++) {
      for (let ccx = minCc; ccx <= maxCc; ccx++) {
        const ids = this.buckets.get(columnKey(ccx, ccy));
        if (ids === undefined) continue;
        for (const id of ids) {
          const record = this.records.get(id);
          if (record === undefined) continue;
          if (Math.abs(record.x - x) > radius || Math.abs(record.y - y) > radius) continue;
          visit(record);
        }
      }
    }
  }

  /**
   * true se il volume proposto tocca un edificio esistente.
   *
   * Due volumi sulla stessa colonna ma con intervalli di quota disgiunti non si
   * sovrappongono: e' la condizione che permette a un edificio di poggiare
   * esattamente sul tetto di un altro.
   *
   * **`except` e' per chi si appoggia a qualcosa.** Una campata atterra dove i
   * corpi si affacciano davvero, e le fasce alte sono rientrate: l'impalcato
   * passa quindi sopra le fasce basse dei propri appoggi, dentro il loro riquadro
   * ma nel loro vuoto. Toccare cio' a cui si e' attaccati non e' una collisione —
   * e' come ci si attacca. Tutto il resto resta vietato.
   */
  overlaps(
    x: number,
    y: number,
    footprint: number,
    baseZ: number,
    height: number,
    footprintY: number = footprint,
    except: readonly number[] = EMPTY_IDS,
  ): boolean {
    // La prenotazione di un cantiere vale sull'intera colonna: chi sta per
    // costruire qui non deve trovare nel frattempo ne' un volume ne' un volo.
    for (const rect of this.reservations) {
      if (x < rect.x + rect.sizeX && rect.x < x + footprint &&
        y < rect.y + rect.sizeY && rect.y < y + footprintY) {
        return true;
      }
    }

    const top = baseZ + height;
    for (let dy = 0; dy < footprintY; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const ids = this.columns.get(columnKey(x + dx, y + dy));
        if (ids === undefined) continue;
        for (const id of ids) {
          if (except.includes(id)) continue;
          const record = this.records.get(id);
          if (record === undefined) continue;
          if (record.baseZ < top && baseZ < record.baseZ + record.height) return true;
        }
      }
    }
    return false;
  }

  // --- Scrittura -------------------------------------------------------------

  /** Registra un edificio e restituisce il record con l'id assegnato. */
  add(record: Omit<BuildingRecord, 'id'>): BuildingRecord {
    const stored: BuildingRecord = { ...record, id: this.nextId++ };
    this.records.set(stored.id, stored);
    this.index(stored);
    this.tally(stored, 1);
    return stored;
  }

  /**
   * Sostituisce un record esistente conservandone l'id.
   *
   * E' l'upgrade: stesso edificio, geometria nuova. Passa da qui e non da una
   * coppia `remove` + `add` perche' l'id e' cio' che lega il record ai voxel gia'
   * scritti, e cambiarlo renderebbe impossibile dire quale volume cancellare.
   */
  replace(id: number, next: Omit<BuildingRecord, 'id'>): BuildingRecord | null {
    if (!this.records.has(id)) return null;
    this.remove(id);
    const stored: BuildingRecord = { ...next, id };
    this.records.set(id, stored);
    this.index(stored);
    this.tally(stored, 1);
    return stored;
  }

  /**
   * Mette un record in tutti gli indici che lo riguardano.
   *
   * `columns` li prende tutti, perche' e' quello che regge `overlaps`: niente
   * puo' essere costruito **attraverso** una campata. `groundColumns` prende
   * solo chi il suolo lo occupa davvero, ed e' la differenza che permette a un
   * ponte di scavalcare una carreggiata senza togliere a nessuno ne' la strada
   * ne' il lotto.
   */
  private index(record: BuildingRecord): void {
    const onGround = takesGroundOf(record);

    // **Un ciclo solo con un test dentro, mai due cicli.** Due cicli sullo stesso
    // record — uno per l'inviluppo e uno per l'impronta — divergerebbero al primo
    // che qualcuno tocca, e la divergenza sarebbe una colonna indicizzata in
    // `columns` e non in `groundColumns` (o peggio il contrario) che nessun test
    // guarda direttamente.
    //
    // I sedimi sono **plurali** da quando un edificio puo' aver assorbito il
    // dirimpettaio, e su tutto il resto della citta' l'elenco ne ha uno solo:
    // vedi `plotOf`.
    for (const plot of plotOf(record)) {
      for (let dy = 0; dy < plot.sizeY; dy++) {
        for (let dx = 0; dx < plot.sizeX; dx++) {
          const cx = plot.x + dx;
          const cy = plot.y + dy;
          push(this.columns, columnKey(cx, cy), record.id);
          // Il suolo e' l'impronta, non l'inviluppo: sotto lo sbalzo non c'e'
          // niente che poggi.
          if (onGround && groundColumnOf(record, cx, cy)) {
            push(this.groundColumns, columnKey(cx, cy), record.id);
          }
        }
      }
    }
    push(this.buckets, columnKey(toChunk(record.x), toChunk(record.y)), record.id);

    if (record.span !== undefined) {
      this.spanIds.add(record.id);
      for (const support of record.supports ?? EMPTY_IDS) {
        push(this.spansBySupport, support, record.id);
      }
    }
    if (record.aerial !== undefined && isBuildable(record.aerial)) {
      this.deckIds.add(record.id);
    }
    // `aloft` entra qui accanto ad `aerial` e non e' un caso a parte: un landmark
    // su un tetto e' cio' che sta sopra, visto da sotto, e il guinzaglio tira
    // nella stessa direzione — chi regge non cresce.
    if (record.aerial !== undefined || record.aloft === true) {
      for (const support of record.supports ?? EMPTY_IDS) {
        this.carried.set(support, (this.carried.get(support) ?? 0) + 1);
        push(this.decksBySupport, support, record.id);
      }
    }
  }

  /** L'inverso esatto di `index`. */
  private unindex(record: BuildingRecord): void {
    // Scandisce gli stessi sedimi di `index`, ed e' l'unica cosa che conta qui:
    // togliere dalla sola impronta lascerebbe l'id dello sbalzo dentro `columns`
    // per sempre, e quelle colonne resterebbero occupate da un edificio che non
    // esiste piu'. `drop` su una chiave che non c'e' non fa niente, quindi lo
    // stesso ciclo serve anche a `groundColumns`.
    for (const plot of plotOf(record)) {
      for (let dy = 0; dy < plot.sizeY; dy++) {
        for (let dx = 0; dx < plot.sizeX; dx++) {
          const key = columnKey(plot.x + dx, plot.y + dy);
          drop(this.columns, key, record.id);
          drop(this.groundColumns, key, record.id);
        }
      }
    }
    drop(this.buckets, columnKey(toChunk(record.x), toChunk(record.y)), record.id);

    if (record.span !== undefined) {
      this.spanIds.delete(record.id);
      for (const support of record.supports ?? EMPTY_IDS) {
        drop(this.spansBySupport, support, record.id);
      }
    }
    if (record.aerial !== undefined || record.aloft === true) {
      this.deckIds.delete(record.id);
      for (const support of record.supports ?? EMPTY_IDS) {
        const left = (this.carried.get(support) ?? 0) - 1;
        if (left <= 0) this.carried.delete(support);
        else this.carried.set(support, left);
        drop(this.decksBySupport, support, record.id);
      }
    }
  }

  /**
   * Somma `delta` a tutti i contatori derivati di un record.
   *
   * Un punto solo per tre istogrammi: `add`, `replace` e `remove` li toccavano
   * tutti, e ogni contatore aggiunto altrove sarebbe stato un'occasione per
   * dimenticarne uno dei tre.
   */
  private tally(record: BuildingRecord, delta: number): void {
    const kind = structureKindOf(record);
    switch (kind) {
      // Un landmark occupa spazio ma non e' un edificio: la simulazione non lo
      // ha mai registrato con `addBuilding`, e contarlo qui farebbe divergere
      // gli istogrammi dell'HUD dai conteggi su cui il bilancio ragiona. Quello
      // su un tetto sta nello stesso contatore: e' lo stesso monumento, e chi
      // legge `landmarks` non ha mai distinto le due fondazioni.
      case STRUCTURE_KIND.landmark:
      case STRUCTURE_KIND.rooftopLandmark:
        this.landmarks += delta;
        return;

      // Vale identico per una campata, che non e' nemmeno appoggiata al suolo:
      // il suo conto lo tiene `spanIds`, ed e' `index` a riempirlo.
      case STRUCTURE_KIND.span:
        return;

      // E per la citta' in quota, in tutte e quattro le sue parti: una gamba
      // prende suolo come un edificio ma non e' un edificio, e nessuna delle
      // quattro e' mai passata da `addBuilding`.
      case STRUCTURE_KIND.aerial:
        this.aerialParts += delta;
        return;

      // E per le torri di una funivia, con la stessa ragione di sempre: prendono
      // suolo, ma nessuna delle due e' mai passata da `addBuilding`.
      case STRUCTURE_KIND.ropeway:
        this.ropewayParts += delta;
        return;

      // **Un'arcologia conta una volta per fascia, non una volta.** E' l'unica
      // struttura che `addBuilding` vede davvero, e la vede quattro volte — una
      // per uso, su quattro colonne distinte del suo ingombro. Contarla come un
      // record solo, o non contarla affatto come le altre quattro strutture,
      // farebbe divergere gli istogrammi dell'HUD dai conteggi su cui il
      // bilancio ragiona: e' la stessa divergenza che i rami qui sopra esistono
      // per evitare, presa dal lato opposto.
      //
      // `level` e' lo stadio, quindi resta fuori dall'istogramma dei livelli,
      // come per un landmark.
      case STRUCTURE_KIND.arcology:
        this.arcologies += delta;
        for (const use of record.uses ?? EMPTY_USES) this.classCounts[use] += delta;
        return;

      // **Un edificio fuso conta una volta per uso ereditato**, ed e' la stessa
      // riga dell'arcologia qui sopra letta per un record ordinario. Assorbendo
      // un vicino il registry passa da due record a uno, e senza questo la
      // citta' perderebbe un edificio dall'istogramma mentre la simulazione ne
      // conta ancora due — la divergenza esatta che i rami di questa tabella
      // esistono per evitare. `uses` porta l'uso proprio in prima posizione,
      // quindi c'e' un solo conto e non due sommati.
      //
      // `mixed`, il livello e la tipologia restano **per record**: un
      // assemblaggio ha una sagoma sola, un livello solo e una tipologia sola,
      // e contarli per uso direbbe che quella riga di catalogo e' stata scritta
      // due volte.
      case STRUCTURE_KIND.plain:
        if (record.uses === undefined) this.classCounts[record.class] += delta;
        else for (const use of record.uses) this.classCounts[use] += delta;
        if (record.mixed !== undefined) this.mixedCounts[record.mixed] += delta;
        this.levelCounts[record.level] = (this.levelCounts[record.level] ?? 0) + delta;
        if (record.typology !== undefined) {
          const next = (this.typologyCounts.get(record.typology) ?? 0) + delta;
          if (next <= 0) this.typologyCounts.delete(record.typology);
          else this.typologyCounts.set(record.typology, next);
        }
        return;

      default:
        // **La rete che `clearanceKindOf` ha gratis, qui va chiesta.** Uno
        // `switch` dentro una funzione che non restituisce niente lascerebbe un
        // tipo nuovo scivolare fuori senza toccare nessun contatore, ed e'
        // esattamente il silenzio che questo modulo esiste per togliere: `never`
        // fa fallire la compilazione finche' il ramo non c'e'.
        kind satisfies never;
    }
  }

  /** Toglie un record da tutti gli indici. */
  remove(id: number): boolean {
    const record = this.records.get(id);
    if (record === undefined) return false;

    this.unindex(record);
    this.tally(record, -1);
    this.records.delete(id);
    this.vacatedCount++;
    return true;
  }

  /**
   * Reinserisce un record conservandone l'id.
   *
   * Ha **due chiamanti con lo stesso bisogno**. L'annullamento della gomma: un
   * edificio portato via per intero torna nel registro con la sua identita' — id
   * compreso — invece di riceverne una nuova. E il caricamento di una partita,
   * che rimette dentro un registro vuoto record nati in un'altra sessione.
   *
   * L'id non e' un dettaglio contabile: `supports` cita gli id, e riassegnarli
   * spezzerebbe ogni guinzaglio fra cio' che regge e cio' che e' retto. Per la
   * stessa ragione i record vanno reinseriti in ordine crescente — un appoggio
   * esiste sempre prima di cio' che regge, quindi in quell'ordine ogni citazione
   * trova gia' il proprio record.
   *
   * **`nextId` sale**, e serve al secondo chiamante: nell'annullamento e' gia'
   * piu' avanti e questa riga non fa niente, ma un registro appena costruito
   * riparte da uno e assegnerebbe a cio' che la citta' costruisce da qui in poi
   * l'id di qualcosa che esiste gia'.
   */
  restore(record: BuildingRecord): void {
    this.records.set(record.id, record);
    this.index(record);
    this.tally(record, 1);
    if (record.id >= this.nextId) this.nextId = record.id + 1;
  }
}

/** Nessun appoggio: un edificio non e' una campata e non ne ha. */
const EMPTY_IDS: readonly number[] = [];

/** Nessun uso dichiarato: solo un'arcologia ne ha. */
const EMPTY_USES: readonly BuildingClass[] = [];

/** Nessun secondo sedime: quasi tutta la citta'. */
const EMPTY_PARTS: readonly PlanRect[] = [];

/**
 * true se quella colonna e' **suolo** del record, e non aria che si e' prenotato.
 *
 * Separa cio' che poggia da cio' che sporge, ed e' la stessa distinzione che
 * `envelopeOf` fa in pianta: dentro l'impronta e dentro ogni altro sedime si
 * poggia, sotto uno sbalzo o sotto un braccio no. Un `parts` e' un sedime a
 * tutti gli effetti — l'edificio ci sta sopra — quindi entra intero.
 */
function groundColumnOf(record: BuildingRecord, cx: number, cy: number): boolean {
  const depth = footprintDepth(record);
  if (cx >= record.x && cx < record.x + record.footprint &&
    cy >= record.y && cy < record.y + depth) {
    return true;
  }
  for (const part of record.parts ?? EMPTY_PARTS) {
    if (cx >= part.x && cx < part.x + part.sizeX &&
      cy >= part.y && cy < part.y + part.sizeY) {
      return true;
    }
  }
  return false;
}

/**
 * true se il record occupa il suolo delle proprie colonne.
 *
 * Sono i due invarianti gemelli, detti in una riga sola: **una campata non
 * prende suolo** da nessuna parte, e **un impalcato in quota lo prende solo dove
 * poggia** — cioe' nelle gambe, che sono record propri. Tutto il resto, edifici
 * e landmark compresi, il suolo se lo prende tutto.
 */
function takesGroundOf(record: BuildingRecord): boolean {
  if (record.span !== undefined) return false;
  // Un landmark su un tetto e' l'unico che non prende il suolo delle proprie
  // colonne pur non essendo `aerial`: sotto di lui c'e' l'edificio che lo
  // ospita, e quello il suolo se l'e' gia' preso.
  if (record.aloft === true) return false;
  if (record.aerial !== undefined) return takesGround(record.aerial);
  return true;
}

function push<K>(index: Map<K, number[]>, key: K, id: number): void {
  const existing = index.get(key);
  if (existing === undefined) index.set(key, [id]);
  else existing.push(id);
}

function drop<K>(index: Map<K, number[]>, key: K, id: number): void {
  const existing = index.get(key);
  if (existing === undefined) return;
  const at = existing.indexOf(id);
  if (at !== -1) existing.splice(at, 1);
  if (existing.length === 0) index.delete(key);
}

function isRecord(record: BuildingRecord | undefined): record is BuildingRecord {
  return record !== undefined;
}
