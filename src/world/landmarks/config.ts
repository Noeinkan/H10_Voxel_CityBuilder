import type { CatalystId } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { GRADING } from '../grading/config';
import { TERRACE } from '../terrain/config';
import { SURFACE_KIND } from '../visualBlock';
import { PART, box, type Part } from './parts';

/**
 * Unica fonte di verita' dei numeri e delle forme dei landmark.
 *
 * Vale la stessa regola di `terrain/config.ts`, `streets/config.ts` e
 * `buildings/config.ts`: nessun altro file di `src/world/landmarks/` contiene
 * una quota, un ingombro o un indice di palette.
 *
 * **Perche' esiste questo dominio.** Fino a qui un catalizzatore era un rombo di
 * asfalto di raggio quattro con un voxel colorato al centro — identico per tutti
 * e otto i ruoli. Il porto in particolare non esisteva affatto: quello che si
 * vedeva sull'acqua era la carreggiata dell'isolato costiero, non una banchina.
 * Un ruolo che promette «connette l'isola al mondo» deve avere una forma che lo
 * dica prima di qualunque tooltip.
 *
 * **Una ricetta e' una tabella, non un generatore.** Le parti sono dati
 * (`parts.ts`), quindi un test puo' misurarne l'ingombro senza disegnarle e
 * `generateLandmark` puo' ruotare una ricetta intera trasformando numeri.
 * Aggiungere un landmark e' aggiungere una riga: non c'e' codice da scrivere
 * altrove.
 *
 * **Gli stadi sono cumulativi.** Le parti di uno stadio si **aggiungono** a
 * quelle degli stadi precedenti, e l'ingombro dichiarato e' quello *finale*,
 * riservato fin dal primo stadio. Due conseguenze, entrambe volute: la crescita
 * non puo' mai restare bloccata a meta' da un edificio spuntato accanto, e la
 * cancellazione della sagoma vecchia durante un avanzamento e' un no-op per
 * costruzione, perche' lo stadio nuovo copre sempre quello vecchio.
 */

export const LANDMARK = {
  /**
   * Edifici che una passata di avanzamento puo' promuovere.
   *
   * I landmark sono unita', non migliaia: qui non c'e' un cursore da far
   * avanzare come in `upgradePass`, e uno per passata basta a non concentrare
   * due comparse grosse nello stesso frame.
   */
  stagesPerPass: 1,

  // Qui stava `maxDirtyChunks: 48`, il tetto di chunk sporchi alzato apposta per
  // i landmark. Non c'e' piu', ed e' la 4.5 ad averlo tolto: il suo stesso
  // commento diceva che una ricetta troppo grossa «andra' spezzata in segmenti —
  // non esentata», e adesso lo e'. `sliceStamps` la fa comparire a ritagli, e il
  // tetto torna a essere quello di ogni altra struttura,
  // `BUILDER.maxDirtyChunksPerBuilding`, senza eccezioni da mantenere.

  /**
   * Colore del grembiule fuori dal riquadro della struttura.
   *
   * Resta l'asfalto di prima: il grembiule non e' il landmark, e' il suolo
   * pubblico che gli sta attorno. A cambiare e' che ora ha qualcosa al centro.
   */
  apronPalette: PALETTE_SLOTS.asphalt,

  // Qui stava `fencePalette`, il colore del recinto di cantiere. Non c'e' piu':
  // il cantiere e' diventato `buildings/clearanceSite.ts`, condiviso con le
  // arcologie, e il recinto e' lo stesso segnale per tutti — due colori direbbero
  // che sono due cose diverse. Sta in `BUILDER.fencePalette`.

  /**
   * Sale con cui il seme del record sceglie l'esemplare.
   *
   * Serve per lo stesso motivo di `SKYLINE.peakSalt`, e contro lo stesso
   * inciampo: `record.seed` **e'** `hashCoords(worldSeed, x, y)`, cioe' lo
   * stesso intero da cui `landmarkFacing` ricava il verso di ripiego con `& 3`.
   * Chiedergli anche l'esemplare con un modulo legherebbe le due risposte — su
   * un landmark senza strada attorno verso e variante cambierebbero sempre
   * insieme — e la citta' mostrerebbe una regolarita' che nessuno ha scritto.
   * Un sale proprio le rende due domande diverse.
   */
  variantSalt: 0x5a3c_11d7,

  /**
   * Dislivello massimo che il terrapieno di un landmark puo' colmare.
   *
   * `GRADING.maxWorksStep` non va bene qui: copre la banchina che scende sul
   * fondale, e su una montagna lascerebbe un riquadro largo dodici colonne
   * prendere due o tre gradoni insieme. La struttura salirebbe alla quota del
   * piu' alto e le poche colonne esposte del muro diventerebbero guglie sottili
   * alte mezzo versante. Un landmark puo' scavalcare **un** ciglio naturale,
   * non cucire insieme piu' terrazze; l'alzata massima del terreno e' la misura
   * che dichiara esattamente quel limite.
   *
   * La banchina resta fuori da questa soglia: un porto ha davvero bisogno del
   * tetto strutturale piu' largo per arrivare dal piano al fondale.
   */
  maxTerraceDrop: TERRACE.maxStep,

  /**
   * Fin dove una parte **poggia** invece di sporgere, in voxel dal piano finito.
   *
   * E' cio' che l'opera di terra deve reggere, e la ragione per cui non e'
   * «tutto l'ingombro». Il braccio di una gru passa sopra la darsena a tredici
   * voxel d'altezza: contarlo vorrebbe dire riempire di terra l'acqua che
   * sorvola, ed e' esattamente il difetto che questa maschera esiste per
   * togliere. Sotto questa quota invece non c'e' niente a mezz'aria in nessuna
   * ricetta — il piano di banchina, il capannone, la gamba della gru — quindi le
   * prime quote *sono* il suolo che la struttura si costruisce.
   *
   * Quattro voxel sono due celle di terreno: abbastanza da prendere un piano piu'
   * il primo corso di qualunque cosa ci stia sopra, non abbastanza da arrivare a
   * un impalcato.
   */
  groundBand: 4,

  /**
   * Livello minimo dell'edificio che puo' ospitare una struttura sul tetto.
   *
   * **Sopra un grattacielo, non sopra una casa.** Uno scalo in quota su una
   * palazzina di due piani non e' una citta' verticale, e' un tetto attrezzato:
   * il gesto dice qualcosa solo se la torre e' gia' alta, e in cambio la torre
   * smette di crescere — chi regge non cresce — quindi il giocatore sta anche
   * spendendo la crescita futura di quel lotto.
   *
   * Sette su `BUILDER.maxLevel` a dodici: oltre la meta', dentro cio' che la
   * gerarchia verticale concede solo al centro.
   */
  aloftMinLevel: 7,
} as const;

/**
 * Cio' che basta a disegnare una sagoma da una tabella di parti.
 *
 * **Non e' un'astrazione anticipata: e' il confine fra due domande.** Questa
 * meta' risponde a «che forma ha, a questo stadio, in questo verso», e non sa
 * niente di catalizzatori, grembiuli o ormeggi — che sono cio' che fa di una
 * sagoma *un landmark*. Averla separata e' quello che permette a un altro
 * dominio con la stessa grammatica di parti — `src/world/arcology/`, che di
 * catalizzatori non ne ha — di riusare `generateFromRecipe` invece di
 * ricopiarlo: due copie dello stesso ciclo divergerebbero al primo stadio
 * cumulativo che qualcuno tocca.
 */
export interface PartsRecipe {
  /**
   * Ingombro canonico `[lungo, corto]`, in voxel, con il fronte a est.
   *
   * E' l'ingombro **finale**: si riserva al piazzamento e non cambia piu'. Il
   * porto, l'aeroporto e il trasporto hanno l'asse lungo maggiore degli altri —
   * un molo, una pista e un viadotto sono lineari per natura, e schiacciarli in
   * un quadrato li farebbe leggere come monconi.
   */
  readonly span: readonly [number, number];

  /** Quota massima. Riservata anch'essa dal primo stadio. */
  readonly height: number;

  /**
   * Dove cade, dentro il riquadro canonico, la colonna che il giocatore ha
   * cliccato.
   *
   * Non e' il centro: il porto deve avere la banchina sotto il click e il molo
   * davanti, altrimenti meta' del magazzino finisce in mare.
   */
  readonly anchor: readonly [number, number];

  /**
   * Edifici entro il raggio del catalizzatore che sbloccano ogni stadio.
   *
   * L'indice e' lo stadio e il primo vale sempre 0: lo stadio zero e' cio' che
   * compare al piazzamento. E' la trasposizione del modello dei monumenti di
   * Anno 1800 — una costruzione a fasi che corona una citta' **gia' edificata**
   * — con il solo dato che il Builder possiede davvero: cosa e' stato costruito
   * li' attorno. La desiderabilita' non servirebbe, perche' un catalizzatore
   * siede al centro della propria influenza e il campo li' e' quasi sempre
   * saturo: il landmark salterebbe tutti gli stadi al primo tick.
   */
  readonly stages: readonly number[];

  /**
   * Il tronco: parti aggiunte da ciascuno stadio, disegnate per ogni esemplare.
   *
   * Cumulative — lo stadio n disegna 0..n — e comuni a tutte le varianti: qui
   * sta cio' che dice **il ruolo**, cioe' quello che il giocatore deve
   * riconoscere da lontano senza doverlo imparare due volte.
   */
  readonly parts: readonly (readonly Part[])[];

  /**
   * Gli esemplari: cio' che dice **quale** porto, non che e' un porto.
   *
   * Assente vale un esemplare solo, cioe' il comportamento di prima, e questo
   * non e' un ripiego: un ruolo la cui forma e' gia' tutta nel tronco non ha
   * niente da variare, e non deve dichiarare una lista di uno per dirlo.
   *
   * **Perche' un'aggiunta e non una ricetta alternativa.** La nota di
   * `generate.ts` contro il PRNG resta vera: se ogni esemplare fosse una lista
   * di parti a se', due porti potrebbero non avere piu' niente in comune e il
   * ruolo smetterebbe di essere leggibile. Tenendo il tronco fuori dalla
   * variante, la leggibilita' e' garantita per costruzione invece che per
   * disciplina di chi scrive la tabella — e la varieta' arriva dove serve, sul
   * secondo sguardo.
   */
  readonly variants?: readonly LandmarkVariant[];
}

/** La sagoma di un ruolo, piu' cio' che ne fa il monumento di un catalizzatore. */
export interface LandmarkRecipe extends PartsRecipe {
  readonly kind: CatalystId;

  /** Raggio di Manhattan del grembiule dipinto attorno alla struttura. */
  readonly apron: number;

  /**
   * Dove i mezzi di `src/world/traffic/` stanno fermi, nel canonico.
   *
   * **Sta nella ricetta e non nel traffico**, ed e' la stessa ragione per cui
   * l'ancora sta qui: sono coordinate *della forma*. Il punto in cui una barca
   * attracca e' il bordo di una darsena che questa tabella disegna, e tenerlo
   * altrove significherebbe due file da correggere ogni volta che il molo si
   * sposta di una colonna — con il difetto che si vede solo a schermo, perche'
   * nessun test puo' sapere che *quel* voxel era il bordo.
   *
   * Assente vale «nessun mezzo»: sette ruoli su nove non ne hanno.
   */
  readonly moorings?: readonly LandmarkMooring[];

  /**
   * Colonna canonica in cui la ricetta si aspetta che **cominci il mare**.
   *
   * **Senza questo numero il porto restava senza barche, ed e' il difetto che
   * lo ha fatto nascere.** Il vincolo di sito ammette il click fino a
   * `SITE.coastalRadius` colonne dall'acqua — sei, e lo fa apposta, perche' la
   * scelta fra la banchina e il primo terreno asciutto dietro *e'* la decisione
   * che un porto comporta — mentre gli ormeggi del porto stanno quattro e cinque
   * colonne oltre il click. Su una costa che dista piu' di quattro, la darsena
   * cadeva sull'asciutto, l'opera di terra la riempiva, e `planTraffic` scartava
   * ogni ormeggio a galla: un porto perfettamente costruito, con la sua fila di
   * gru, e niente in acqua.
   *
   * Dichiararlo permette al piazzamento di far **scorrere la struttura lungo il
   * proprio fronte** finche' questa colonna cade sulla battigia vera: il
   * catalizzatore resta dove il dito l'ha messo — e' lui a portare l'influenza —
   * e la banchina va a incontrare l'acqua. Il conto sta in `landmarkDriver.ts`,
   * che il terreno lo conosce; qui c'e' solo cosa la forma pretende.
   *
   * Assente vale «questa ricetta non guarda l'acqua», che e' il caso di sette
   * ruoli su nove e di ogni ricetta da tetto.
   */
  readonly waterline?: number;
}

/** Cosa sta fermo in un punto d'ormeggio. */
export const BERTH = {
  /** Barca da lavoro: compare appena la struttura esiste. */
  vessel: 'vessel',
  /** Accosto di una linea di traghetti, e destinazione della traversata. */
  ferry: 'ferry',
  /** Banchina di una nave da carico, che arriva dal largo. */
  cargo: 'cargo',
  /** Piazzola di sosta di un aereo. */
  aircraft: 'aircraft',
  /** Pilone d'ormeggio di un dirigibile. */
  airship: 'airship',
  /**
   * Piazzola di un eVTOL: non ci sta fermo niente, ci si posa.
   *
   * E' il solo ormeggio da cui parte un giro **chiuso** che torna a toccarlo:
   * un pilone tiene appeso, una piazzola fa scendere. Il `heading` conta piu'
   * che altrove — decide da che parte arriva l'avvicinamento — e va puntato
   * verso il lato libero del tetto.
   */
  pad: 'pad',
  /** Pilone di ritenuta di una mongolfiera: il capo di qua della sua corsa. */
  balloon: 'balloon',
  /**
   * Soglia di pista: non ci sta fermo niente.
   *
   * Sono i due capi da cui il circuito di volo si costruisce, e stanno qui
   * perche' sono l'unica cosa che di una pista il traffico deve sapere — dove
   * comincia, dove finisce, e quindi in che verso si decolla.
   */
  runway: 'runway',
} as const;

export type BerthKind = (typeof BERTH)[keyof typeof BERTH];

export interface LandmarkMooring {
  /** Colonna canonica, in voxel dallo spigolo dell'ingombro. */
  readonly x: number;
  readonly y: number;
  /** Quota dal piano finito. Zero e' il piano stesso. */
  readonly z: number;
  readonly berth: BerthKind;
  /**
   * Verso in cui il mezzo guarda nel canonico, in radianti: `0` e' est.
   *
   * Un angolo e non un `Facing`, perche' quello che ne esce va sommato alla
   * rotazione della ricetta e finisce dritto in una matrice di rotazione: gli
   * indici andrebbero comunque tradotti, e tradurli due volte e' il modo con cui
   * un molo si ritrova le barche di traverso su meta' dei versi.
   */
  readonly heading: number;
}

export interface LandmarkVariant {
  /** Nome dell'esemplare. Serve a chi legge la tabella e ai test, non al disegno. */
  readonly name: string;

  /**
   * Parti che questo esemplare aggiunge al tronco, stadio per stadio.
   *
   * Stessa lunghezza e stessa regola cumulativa del tronco. Una voce vuota e'
   * legittima e frequente: un esemplare si distingue di solito in uno o due
   * stadi, non in tutti.
   */
  readonly parts: readonly (readonly Part[])[];
}

// --- Scorciatoie di lettura delle ricette ---------------------------------
//
// Non sono astrazioni: sono nomi per gli argomenti posizionali, cosi' che una
// riga di ricetta si legga come una frase invece che come nove numeri. `box` sta
// in `parts.ts`, accanto al vocabolario che nomina: le tabelle che lo usano sono
// due, e qui restano solo le scorciatoie che parlano di catalizzatori.

/**
 * Una gru di banchina: gamba, braccio a sbalzo sull'acqua, contrappeso.
 *
 * E' l'unica ricetta che si ripete tre volte con il solo `y` diverso, ed e' cio'
 * che rende il porto leggibile da lontano: la fila di bracci sopra la linea
 * dell'acqua e' la firma verticale del ruolo.
 */
function craneAt(y: number): readonly Part[] {
  return [
    box(PART.mast, 9, y, 2, 3, 1, 12, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial),
    box(PART.boom, 9, y, 11, 2, 13, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
      cap: PALETTE_SLOTS.metalBrass,
    }),
    box(PART.slab, 6, y, 3, 2, 13, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial),
  ];
}

/**
 * Il piano di una banchina o di un molo: pietra alla quota del piano finito.
 *
 * **Qui non c'e' piu' nessuna darsena disegnata, ed e' il punto.** Fino alla 4.x
 * il porto scriveva l'acqua dentro il proprio stamp, perche' le opere portavano
 * *tutta* l'impronta alla quota della banchina e sotto non restava mare da
 * mostrare. Il risultato era una piattaforma rettangolare in mezzo al golfo con
 * dentro una pozza piu' alta del mare che la circondava. Ora l'opera si getta
 * solo sotto le colonne che una parte occupa (`stampFootprint` piu' la maschera
 * di `buildWorks`), quindi **la darsena e' il mare che c'era**: la ricetta la
 * ottiene non disegnando niente.
 */
function quay(x: number, y: number, w: number, h: number): Part {
  return box(PART.deck, x, y, w, h, 0, 1, GRADING.quayDeck, SURFACE_KIND.utility);
}

/**
 * Una bitta d'ormeggio: un cubo di ghisa sul filo della banchina.
 *
 * E' la parte piu' piccola del catalogo e serve a una cosa sola: dire dove
 * finisce la pietra e comincia l'acqua. Su un molo lungo quattordici colonne il
 * bordo e' altrimenti una linea sola, e a distanza isometrica una linea non ha
 * spessore.
 */
function bollard(x: number, y: number): Part {
  return box(PART.mast, x, y, 1, 1, 1, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial);
}

/**
 * Un vano d'ingresso: la parete riscritta con il linguaggio del portale.
 *
 * **Non disegna niente di piu' di una scatola**, e proprio per questo vale la
 * pena: `SURFACE_KIND.portal` e' il canale su cui il mesher aggancia montanti,
 * architrave e pensilina — sono gia' scritti in `microGeometry.ts` — e nessuna
 * ricetta di landmark lo usava. Otto strutture pubbliche senza una porta erano
 * otto volumi in cui non si entra, e la pensilina sopra l'ingresso e' il
 * dettaglio che a distanza di gioco dice «qui si entra» meglio di qualunque
 * differenza di colore.
 *
 * Va disegnato **dopo** la parete che buca: `put` sovrascrive, e un vano e'
 * esattamente questo, la stessa colonna con un altro linguaggio.
 */
function entrance(x: number, y: number, w: number, h: number, height: number): Part {
  return box(PART.slab, x, y, w, h, 1, height, PALETTE_SLOTS.glassDeep, SURFACE_KIND.portal);
}

/**
 * Una fascia d'insegna: la parete riscritta con il linguaggio luminoso.
 *
 * Stessa idea del vano, altro canale. `emitLuminous` le mette attorno una
 * cornice di 1/16 e il fragment le da' emissione notturna, quindi una fascia
 * costa una riga di tabella e rende il landmark visibile **anche di notte** —
 * che per una struttura civica alta venti voxel e' meta' del tempo di gioco.
 *
 * Resta una fascia e non una facciata: la superficie luminosa frammenta la
 * fusione del greedy mesher, e vestirci un volume intero si paga in quad su
 * ogni parete vicina.
 */
function signBand(x: number, y: number, w: number, h: number, z: number): Part {
  return box(PART.slab, x, y, w, h, z, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous);
}

/**
 * Un albero: tronco sottile e chioma squadrata.
 *
 * Non riusa `writeTree` di `terrain/decor.ts`, e non per distrazione: quella
 * scrive nel `VoxelWorld` a coordinate di mondo, mentre qui siamo dentro uno
 * stamp che non sa dove finira'. Alla scala del parco la differenza fra una
 * chioma profilata e un cubo verde su un tronco non si vede; la differenza fra
 * uno stamp puro e uno che conosce il mondo si vedrebbe in ogni test.
 */
function tree(x: number, y: number): readonly Part[] {
  return [
    box(PART.mast, x + 1, y + 1, 1, 1, 1, 4, PALETTE_SLOTS.wood, SURFACE_KIND.plain),
    box(PART.slab, x, y, 3, 3, 5, 3, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain, {
      cap: PALETTE_SLOTS.grassLight,
    }),
  ];
}

/**
 * Il catalogo.
 *
 * E' parziale di proposito: un ruolo senza ricetta resta giocabile e ottiene il
 * solo grembiule, che e' esattamente cio' che tutti e otto avevano prima. Un
 * ruolo nuovo aggiunto a `CATALYSTS` non puo' quindi rompere la citta' mentre la
 * sua forma non e' ancora stata disegnata.
 *
 * **Perche' gli ingombri sono contenuti.** Un landmark occupa il cuore del
 * proprio catalizzatore, cioe' esattamente il punto dove la desiderabilita' e'
 * piu' alta e dove nascerebbero gli edifici migliori. Le prime ricette erano
 * larghe sedici voxel — otto celle di terreno, quasi un isolato intero — e il
 * risultato l'ha detto un test gia' esistente: gli usi misti, che vivono dove
 * due catalizzatori si sovrappongono, sparivano perche' quella sovrapposizione
 * finiva sepolta sotto le strutture. Dodici voxel sono una volta e mezza
 * l'impronta massima di un edificio: si vedono, e lasciano vivere l'isolato.
 */
export const LANDMARKS: Partial<Record<CatalystId, LandmarkRecipe>> = {
  // Il fronte canonico guarda l'acqua: `x` cresce verso il mare, la banchina sta
  // sotto il click, i moli davanti e i magazzini alle spalle.
  //
  // **La forma in pianta e' il porto.** Due bracci che escono dalla banchina, un
  // pontile in mezzo, e fra loro due specchi d'acqua che la ricetta ottiene *non
  // disegnando niente*: l'opera di terra si getta solo dove una parte poggia,
  // quindi cio' che resta vuoto qui resta mare la' fuori. E' l'unica differenza
  // fra un porto e un piazzale sul mare, e prima non c'era.
  port: {
    kind: 'port',
    span: [20, 12],
    height: 18,
    anchor: [10, 6],
    apron: 4,
    stages: [0, 6, 16, 32],
    parts: [
      [
        // La banchina e il braccio di sopravento: il bacino esiste da subito,
        // ed e' l'acqua che il molo ha appena chiuso su un lato.
        quay(0, 0, 12, 12),
        quay(12, 0, 8, 2),
        box(PART.shell, 1, 1, 7, 5, 1, 8, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        box(PART.deck, 1, 1, 7, 5, 9, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
        bollard(11, 4),
        bollard(11, 7),
        bollard(13, 1),
        bollard(17, 1),
      ],
      [
        // Il braccio di sottovento chiude il bacino, e la prima gru porta il
        // proprio sbraccio sopra l'acqua: e' la sagoma che si legge da lontano.
        quay(12, 10, 8, 2),
        ...craneAt(3),
        bollard(13, 10),
        bollard(17, 10),
      ],
      [
        ...craneAt(7),
        box(PART.slab, 1, 7, 3, 2, 1, 3, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        }),
        box(PART.slab, 5, 7, 3, 2, 1, 2, PALETTE_SLOTS.glassDeep, SURFACE_KIND.industrial),
        box(PART.shell, 8, 8, 4, 4, 1, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        box(PART.deck, 8, 8, 4, 4, 7, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      ],
      [
        // La capitaneria in punta al braccio: la sola verticale sull'acqua, e la
        // sola cosa accesa di notte in un ruolo fatto di lamiera.
        box(PART.mast, 17, 0, 2, 2, 1, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.slab, 16, 0, 4, 2, 13, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        box(PART.deck, 16, 0, 4, 2, 15, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
    ],
    // La banchina piena finisce a `x` 11 e i bracci escono da 12: **e' li' che
    // il porto pretende il mare**, ed e' quello che il piazzamento va a cercare
    // sul terreno vero invece di sperare che il click ci sia caduto sopra.
    waterline: 12,
    // Il bacino e' `x` 12..19, `y` 2..9: la nave da carico accosta al braccio di
    // sopravento, la barca da lavoro sta in fondo. Sono punti d'acqua vera —
    // l'opera di terra non li tocca — quindi i mezzi ci galleggiano alla quota
    // del mare invece che sei voxel sopra come quando l'ormeggio era disegnato.
    moorings: [
      { x: 15, y: 4, z: 0, berth: BERTH.cargo, heading: 0 },
      { x: 14, y: 8, z: 0, berth: BERTH.vessel, heading: 0 },
    ],
    variants: [
      // Merci alla rinfusa: silo, silo, nastro. La sagoma resta quella del
      // porto — banchina, magazzini, gru — e cambia cosa ci si scarica.
      {
        name: 'granaio',
        parts: [
          [],
          [box(PART.slab, 8, 1, 3, 3, 1, 12, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
            chamfer: 1,
            cap: PALETTE_SLOTS.concretePale,
          })],
          [
            box(PART.slab, 8, 4, 3, 3, 1, 9, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
              chamfer: 1,
              cap: PALETTE_SLOTS.concretePale,
            }),
            // Il nastro esce sopra il molo di sopravento: passa alto, e passare
            // alto e' cio' che gli permette di scavalcare l'acqua senza che
            // l'opera di terra debba riempirla.
            box(PART.boom, 9, 1, 9, 2, 13, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
              cap: PALETTE_SLOTS.metalBrass,
            }),
          ],
          [entrance(1, 2, 1, 2, 3)],
        ],
      },
      // Cantiere navale: due tralicci, uno per braccio, e il ponte che li unisce
      // scavalcando il bacino. E' il portale sotto cui passa lo scafo, ed e'
      // l'unico esemplare che si legge da sopra prima che di taglio. I montanti
      // stanno **sui moli** e mai sull'acqua: una gamba piantata nel bacino lo
      // farebbe riempire di terra, che e' il difetto che questa fase toglie.
      {
        name: 'cantiere',
        parts: [
          [],
          [box(PART.truss, 13, 0, 2, 2, 1, 12, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 3,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.truss, 13, 10, 2, 2, 1, 12, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 3,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.boom, 13, 0, 2, 12, 13, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalBrass,
          })],
        ],
      },
      // Terminal passeggeri: falda sul magazzino, insegna e ingresso sul fronte.
      // E' l'esemplare che di notte si vede, perche' e' il solo con una fascia
      // luminosa dove gli altri hanno lamiera.
      {
        name: 'stazione',
        parts: [
          [],
          [box(PART.pitch, 1, 1, 7, 5, 10, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [signBand(7, 2, 1, 3, 6)],
          [entrance(7, 2, 1, 3, 4)],
        ],
      },
    ],
  },

  // Ciminiere molto piu' alte del corpo: la fabbrica si riconosce dal fumo che
  // non c'e', cioe' dalle verticali sottili sopra un capannone basso e lungo.
  // Il contrario del porto sullo stesso fronte mare: niente gru, niente
  // capannoni, e al posto della banchina un molo stretto che esce in mezzo
  // all'acqua con un pontile per lato. E' la sagoma a dire che di qui passano
  // persone e non container — e sono i due ormeggi, vuoti finche' la citta' non
  // e' cresciuta, a dire che a un molo solo manca ancora qualcosa.
  ferry: {
    kind: 'ferry',
    span: [22, 12],
    height: 16,
    anchor: [4, 6],
    apron: 4,
    stages: [0, 5, 14, 28],
    parts: [
      [
        // Il piazzale a terra e il molo che ne esce: **due sole strisce di
        // pietra**, e tutto il resto del riquadro resta il mare che c'era. Sono
        // i due accosti — sopra e sotto il molo — dove le barche di
        // `world/traffic/` attraccano davvero, alla quota vera del pelo
        // dell'acqua invece che sei voxel sopra come quando l'ormeggio era
        // disegnato dentro lo stamp.
        quay(0, 0, 8, 12),
        quay(8, 4, 14, 4),
        box(PART.shell, 1, 3, 6, 6, 1, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.deck, 1, 3, 6, 6, 7, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        bollard(9, 4),
        bollard(9, 7),
      ],
      [
        // La pensilina sul molo: il vuoto sotto un tetto e' cio' che nessuna
        // scatola cava sa dare, ed e' la stessa primitiva del mercato.
        box(PART.colonnade, 9, 4, 7, 4, 1, 5, PALETTE_SLOTS.wood, SURFACE_KIND.habitat, {
          step: 3,
          cap: PALETTE_SLOTS.brickLight,
        }),
        bollard(13, 4),
        bollard(13, 7),
      ],
      [
        // Il fanale in punta: da lontano e' quello a separare un molo da una
        // lingua di terra.
        box(PART.mast, 20, 5, 2, 2, 1, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.slab, 20, 5, 2, 2, 13, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        bollard(21, 4),
        bollard(21, 7),
      ],
      [
        // La sala d'attesa in testa al molo e la biglietteria a terra: due
        // volumi bassi che dicono che di qui passano persone.
        box(PART.shell, 16, 4, 4, 4, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.deck, 16, 4, 4, 4, 6, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.shell, 1, 9, 6, 3, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.deck, 1, 9, 6, 3, 6, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
    ],
    // Il piazzale a terra e' `x` 0..7 e il molo esce da 8: e' quella la colonna
    // su cui il piazzamento porta la battigia. Il ferry se la cavava gia' quasi
    // sempre — gli accosti stanno a `x` 13, cioe' nove colonne oltre il click, e
    // il mare entro sei le copriva comunque — ma «quasi sempre» qui vuol dire
    // che il molo comincia sulla sabbia invece che sull'acqua.
    waterline: 8,
    // I due accosti, uno per lato del molo. Quello di nord e' il capolinea della
    // traversata — se esiste un secondo imbarco, e' da li' che la barca parte —
    // e quello di sud tiene la barca da lavoro che c'e' comunque: **un imbarco
    // solo non e' una linea**, ed e' esattamente cio' che deve leggersi a
    // schermo prima che nel tooltip.
    moorings: [
      { x: 13, y: 2, z: 0, berth: BERTH.ferry, heading: 0 },
      { x: 13, y: 9, z: 0, berth: BERTH.vessel, heading: 0 },
    ],
    variants: [
      // Imbarcadero: la tettoia sul molo, l'ingresso e l'insegna. E' il ferry
      // che si comporta da stazione, e la falda sopra il colonnato e' cio' che
      // lo distingue dal molo nudo.
      {
        name: 'imbarcadero',
        parts: [
          [],
          [box(PART.pitch, 9, 4, 7, 4, 6, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [entrance(6, 5, 1, 2, 4)],
          [signBand(6, 4, 1, 4, 5)],
        ],
      },
      // Faro in punta al molo: tamburo smussato, ballatoio e cappello sopra il
      // fanale. E' l'unico landmark che di notte fa luce sull'acqua, e il
      // cappello sta **sopra** la lanterna del tronco invece che addosso: una
      // cupola posata li' sopra la spegnerebbe, che e' il modo piu' silenzioso
      // che un esemplare ha di rovinare la ricetta che varia.
      {
        name: 'faro',
        parts: [
          [],
          [box(PART.slab, 19, 4, 3, 4, 1, 10, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            chamfer: 1,
            cap: PALETTE_SLOTS.metalGold,
          })],
          [box(PART.steps, 18, 4, 4, 4, 11, 2, PALETTE_SLOTS.stone, SURFACE_KIND.roofTech, {
            step: 1,
            chamfer: 1,
          })],
          [box(PART.steps, 19, 4, 3, 4, 15, 1, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
            step: 1,
            chamfer: 1,
          })],
        ],
      },
      // Darsena da lavoro: la gru che serve gli accosti, e il braccio che
      // scavalca l'acqua passando alto. Stesso molo, altro mestiere.
      {
        name: 'darsena',
        parts: [
          [],
          [box(PART.truss, 10, 4, 2, 2, 1, 11, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 3,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.boom, 10, 2, 2, 4, 11, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.slab, 2, 0, 4, 2, 1, 3, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalBrass,
          })],
        ],
      },
    ],
  },

  factory: {
    kind: 'factory',
    span: [14, 12],
    height: 22,
    anchor: [7, 6],
    apron: 4,
    stages: [0, 8, 20, 40],
    parts: [
      [
        box(PART.deck, 0, 0, 14, 12, 0, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
        box(PART.shell, 0, 0, 9, 8, 1, 8, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalDark,
        }),
        box(PART.deck, 0, 0, 9, 8, 9, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 10, 1, 3, 3, 1, 18, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalDark,
        }),
        box(PART.mast, 10, 5, 3, 3, 1, 14, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalDark,
        }),
      ],
      [
        box(PART.mast, 0, 9, 3, 3, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        box(PART.mast, 4, 9, 3, 3, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        // Il nastro trasportatore lega i silos al capannone: e' la parte che fa
        // leggere il complesso come un impianto e non come tre volumi vicini.
        box(PART.boom, 2, 10, 10, 2, 11, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        }),
      ],
      [
        box(PART.mast, 8, 9, 3, 3, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        box(PART.shell, 2, 2, 5, 4, 10, 3, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalDark,
        }),
        box(PART.deck, 2, 2, 5, 4, 13, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
        box(PART.mast, 13, 6, 1, 2, 1, 20, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    variants: [
      // Acciaieria: castello di estrazione a traliccio e il ponte che porta al
      // capannone. Il traliccio ha aria dentro, ed e' l'aria a dire «impianto»
      // dove un prisma pieno direbbe solo «volume alto».
      {
        name: 'acciaieria',
        parts: [
          [],
          [box(PART.truss, 0, 9, 4, 3, 1, 16, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 3,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.boom, 0, 10, 11, 2, 16, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [entrance(0, 3, 1, 2, 4)],
        ],
      },
      // Raffineria: serbatoi cilindrici e una torcia sottilissima. Lo smusso e'
      // tutta la differenza fra un serbatoio e una cassa.
      {
        name: 'raffineria',
        parts: [
          [],
          [box(PART.slab, 9, 8, 5, 4, 1, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
            chamfer: 1,
            cap: PALETTE_SLOTS.metalDark,
          })],
          [box(PART.slab, 0, 9, 4, 3, 1, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
            chamfer: 1,
            cap: PALETTE_SLOTS.metalDark,
          })],
          [box(PART.mast, 6, 9, 2, 2, 1, 20, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalGold,
          })],
        ],
      },
      // Manifattura: falda sul capannone, insegna e ingresso. E' la fabbrica che
      // sta dentro la citta' invece che al suo margine.
      {
        name: 'manifattura',
        parts: [
          [],
          [box(PART.pitch, 0, 0, 9, 8, 10, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [signBand(8, 1, 1, 6, 6)],
          [entrance(8, 3, 1, 2, 4)],
        ],
      },
    ],
  },

  // L'unico landmark con il vuoto sotto un tetto: una tettoia su pilastri, che
  // nessuna scatola cava sa dare e che a distanza di gioco lo distingue subito.
  market: {
    kind: 'market',
    span: [12, 12],
    height: 18,
    anchor: [6, 6],
    apron: 4,
    stages: [0, 6, 16, 32],
    parts: [
      [
        box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.utility),
        box(PART.colonnade, 1, 1, 10, 10, 1, 6, PALETTE_SLOTS.wood, SURFACE_KIND.habitat, {
          step: 3,
          cap: PALETTE_SLOTS.brickLight,
        }),
        box(PART.deck, 1, 1, 10, 10, 7, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.slab, 2, 2, 2, 2, 1, 3, PALETTE_SLOTS.brick, SURFACE_KIND.plain),
        box(PART.slab, 8, 2, 2, 2, 1, 3, PALETTE_SLOTS.metalBrass, SURFACE_KIND.plain),
        box(PART.slab, 2, 8, 2, 2, 1, 3, PALETTE_SLOTS.brickLight, SURFACE_KIND.plain),
        box(PART.slab, 8, 8, 2, 2, 1, 3, PALETTE_SLOTS.wood, SURFACE_KIND.plain),
      ],
      [
        box(PART.shell, 3, 3, 6, 6, 8, 5, PALETTE_SLOTS.brickLight, SURFACE_KIND.habitat, {
          cap: PALETTE_SLOTS.wood,
        }),
        box(PART.deck, 3, 3, 6, 6, 13, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 0, 0, 3, 3, 1, 14, PALETTE_SLOTS.brick, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.steps, 0, 0, 3, 3, 15, 2, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
          step: 1,
        }),
      ],
    ],
    variants: [
      // Loggia: un tiburio ottagonale sul tetto, che e' la sagoma che il
      // mercato coperto ha in mezza Europa e che nessuna scatola sa dare.
      {
        name: 'loggia',
        parts: [
          [],
          [box(PART.colonnade, 3, 3, 6, 6, 14, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 2,
            chamfer: 1,
            cap: PALETTE_SLOTS.concreteWhite,
          })],
          [box(PART.steps, 4, 4, 4, 4, 17, 1, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
            step: 1,
            chamfer: 1,
          })],
          [entrance(1, 5, 1, 2, 3)],
        ],
      },
      // Mercato coperto: una falda unica su tutta la tettoia. E' l'esemplare
      // piu' basso e piu' largo, e di taglio non somiglia agli altri due.
      {
        name: 'coperto',
        parts: [
          [],
          [box(PART.pitch, 1, 1, 10, 10, 14, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [signBand(8, 4, 1, 4, 10)],
          [entrance(10, 5, 1, 2, 3)],
        ],
      },
      // Torri d'angolo: il mercato fortificato. Tre verticali in laterizio agli
      // spigoli liberi, che la ricetta base lascia vuoti.
      {
        name: 'torri',
        parts: [
          [],
          [box(PART.mast, 9, 0, 3, 3, 1, 12, PALETTE_SLOTS.brick, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          })],
          [box(PART.mast, 0, 9, 3, 3, 1, 12, PALETTE_SLOTS.brick, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          })],
          [box(PART.mast, 9, 9, 3, 3, 1, 12, PALETTE_SLOTS.brick, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          })],
        ],
      },
    ],
  },

  // L'unico che non costruisce quasi niente: massa verde bassa e chiome, con un
  // chiosco al centro. Si riconosce per assenza di volume, che fra otto ruoli e'
  // una firma buona quanto una guglia.
  park: {
    kind: 'park',
    span: [12, 12],
    height: 12,
    anchor: [6, 6],
    apron: 6,
    stages: [0, 6, 14, 28],
    parts: [
      [
        box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
        box(PART.slab, 7, 7, 4, 4, 0, 1, PALETTE_SLOTS.water, SURFACE_KIND.plain),
      ],
      [...tree(0, 0), ...tree(9, 0), ...tree(0, 9)],
      [
        box(PART.colonnade, 3, 1, 5, 5, 1, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.stone,
        }),
        box(PART.steps, 3, 1, 5, 5, 5, 3, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
          step: 1,
        }),
      ],
      [
        ...tree(4, 9),
        box(PART.slab, 0, 6, 2, 3, 1, 2, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
        box(PART.slab, 10, 6, 2, 3, 1, 2, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      ],
    ],
    variants: [
      // Belvedere: un padiglione ottagonale nell'angolo libero. Il parco si
      // riconosce per assenza di volume, quindi il suo esemplare non puo'
      // aggiungerne molto: aggiunge una forma.
      {
        name: 'belvedere',
        parts: [
          [],
          [box(PART.colonnade, 8, 1, 4, 4, 1, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 2,
            chamfer: 1,
            cap: PALETTE_SLOTS.stone,
          })],
          [box(PART.steps, 8, 1, 4, 4, 5, 3, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
            step: 1,
            chamfer: 1,
          })],
          [...tree(5, 6)],
        ],
      },
      // Giardino d'acqua: lo stagno si allarga e il chiosco prende una falda.
      {
        name: 'acqua',
        parts: [
          [],
          [box(PART.deck, 5, 6, 6, 6, 0, 1, PALETTE_SLOTS.water, SURFACE_KIND.plain)],
          [box(PART.pitch, 3, 1, 5, 5, 8, 3, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [...tree(9, 4)],
        ],
      },
      // Viale alberato: un asse lastricato, due chiome in piu' e una pergola.
      // E' il parco disegnato invece che lasciato crescere.
      {
        name: 'viale',
        parts: [
          [],
          [box(PART.deck, 0, 5, 12, 2, 0, 1, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.utility)],
          [...tree(2, 9), ...tree(6, 9)],
          [box(PART.truss, 5, 0, 2, 3, 1, 8, PALETTE_SLOTS.wood, SURFACE_KIND.habitat, {
            step: 2,
            cap: PALETTE_SLOTS.grassDark,
          })],
        ],
      },
    ],
  },

  // **Un campo di volo, non una striscia d'asfalto accanto a una scatola.** La
  // ricetta di prima aveva una pista larga quattro e lunga quattordici in un
  // angolo del riquadro, e il resto era prato: da sopra non si leggeva come un
  // aeroporto perche' mancava tutto quello che di un aeroporto si riconosce —
  // il campo erboso spianato, il raccordo che porta la pista al piazzale, le
  // piazzole di sosta, gli hangar in fondo. Qui la pista corre per tutta la
  // lunghezza dell'ingombro, il raccordo la lega al piazzale e gli aerei di
  // `world/traffic/` ci rullano davvero.
  airport: {
    kind: 'airport',
    span: [26, 12],
    height: 20,
    anchor: [6, 3],
    apron: 4,
    stages: [0, 10, 24, 44],
    parts: [
      [
        // Il campo spianato per intero: e' la prima cosa che dice «aeroporto»
        // vista da sopra, ed e' anche cio' che rende l'opera di terra un piano
        // unico invece di tre strisce a quote diverse.
        box(PART.deck, 0, 0, 26, 12, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
        box(PART.deck, 0, 0, 12, 5, 0, 1, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.shell, 1, 0, 8, 4, 1, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.deck, 1, 0, 8, 4, 7, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        // La pista, il raccordo e la segnaletica. Le soglie e la mezzeria sono
        // lo stesso piano riscritto piu' chiaro: una pista senza segni e' una
        // striscia d'asfalto, e a distanza di gioco non si legge.
        box(PART.deck, 2, 6, 24, 3, 0, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
        box(PART.deck, 2, 6, 2, 3, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        box(PART.deck, 24, 6, 2, 3, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        box(PART.deck, 7, 7, 3, 1, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        box(PART.deck, 13, 7, 3, 1, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        box(PART.deck, 19, 7, 3, 1, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        box(PART.deck, 2, 5, 10, 1, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
        // Le luci di avvicinamento in testa alla pista: due cubi accesi, ed e'
        // l'unica cosa che di notte dica da che parte si atterra.
        box(PART.mast, 0, 6, 1, 3, 1, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      ],
      [
        // La torre di controllo: il contrasto fra il piano lungo e la verticale
        // sottile e' cio' che dice il ruolo prima di qualunque dettaglio.
        box(PART.mast, 9, 1, 3, 3, 1, 14, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        box(PART.slab, 8, 0, 5, 5, 15, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 8, 0, 5, 5, 18, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        // Gli hangar e il loro raccordo. Sono in fondo al campo, dalla parte
        // opposta all'aerostazione: e' come si dispone uno scalo vero, e da
        // sopra e' la simmetria spezzata a dire che i due lati fanno due cose.
        box(PART.deck, 12, 9, 2, 3, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
        box(PART.shell, 14, 9, 10, 3, 1, 6, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        }),
        box(PART.deck, 14, 9, 10, 3, 7, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
        // Le due piazzole di attesa a bordo pista: sono i riquadri chiari dove
        // gli aerei del traffico stanno fermi fra un giro e l'altro, e stanno
        // **lontano dai volumi** — un'ala di sei voxel parcheggiata contro
        // l'aerostazione le passerebbe dentro.
        box(PART.deck, 11, 3, 4, 2, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        box(PART.deck, 17, 3, 4, 2, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      ],
    ],
    // Le due soglie della pista e le due piazzole. Le soglie non ospitano
    // niente: sono i capi da cui il circuito di volo si costruisce, cioe' la
    // sola cosa che di una pista il traffico deve sapere.
    moorings: [
      { x: 2, y: 7, z: 0, berth: BERTH.runway, heading: 0 },
      { x: 25, y: 7, z: 0, berth: BERTH.runway, heading: 0 },
      { x: 13, y: 4, z: 0, berth: BERTH.aircraft, heading: 0 },
      { x: 19, y: 4, z: 0, berth: BERTH.aircraft, heading: 0 },
    ],
    variants: [
      // Hub passeggeri: falda sull'aerostazione, un finger sul piazzale,
      // ingresso e insegna sul fronte citta'.
      {
        name: 'hub',
        parts: [
          [],
          [box(PART.pitch, 1, 0, 8, 4, 8, 3, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.boom, 2, 4, 6, 2, 3, 2, PALETTE_SLOTS.concretePale, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.glassPale,
          })],
          [entrance(1, 1, 1, 2, 4), signBand(1, 0, 1, 4, 5)],
        ],
      },
      // Scalo merci: capannone a traliccio, cisterna smussata, torre di sfiato.
      // Nessuna fascia luminosa: di notte questo esemplare resta buio, ed e'
      // esattamente cio' che lo distingue dall'hub a colpo d'occhio.
      {
        name: 'merci',
        parts: [
          [],
          [box(PART.truss, 14, 9, 10, 3, 7, 7, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 3,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.slab, 22, 0, 4, 4, 1, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
            chamfer: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.mast, 20, 1, 2, 2, 1, 16, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalGold,
          })],
        ],
      },
      // Radar: un traliccio in fondo al campo con la cupola accesa in cima. E'
      // l'esemplare che si legge di notte da lontano quanto di giorno.
      {
        name: 'radar',
        parts: [
          [],
          [box(PART.truss, 21, 0, 4, 4, 1, 15, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
            step: 3,
            cap: PALETTE_SLOTS.concretePale,
          })],
          [box(PART.slab, 22, 1, 2, 2, 16, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous)],
          [
            box(PART.mast, 16, 4, 1, 1, 1, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
            box(PART.mast, 20, 4, 1, 1, 1, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
          ],
        ],
      },
    ],
  },

  // Una linea sospesa con il vuoto sotto. E' anche la prima «campata fra due
  // appoggi» del progetto, e ha appoggi veri: il viadotto poggia sui suoi pylon.
  transport: {
    kind: 'transport',
    span: [24, 10],
    height: 20,
    anchor: [12, 5],
    apron: 4,
    stages: [0, 8, 18, 36],
    parts: [
      [
        box(PART.deck, 6, 0, 12, 10, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
        box(PART.shell, 7, 1, 10, 8, 1, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        box(PART.deck, 7, 1, 10, 8, 7, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 1, 3, 3, 4, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
          cap: PALETTE_SLOTS.stone,
        }),
        box(PART.mast, 20, 3, 3, 4, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
          cap: PALETTE_SLOTS.stone,
        }),
        box(PART.boom, 0, 3, 24, 4, 11, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
          cap: PALETTE_SLOTS.asphaltDark,
        }),
      ],
      [
        box(PART.mast, 7, 3, 3, 4, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
          cap: PALETTE_SLOTS.stone,
        }),
        box(PART.mast, 14, 3, 3, 4, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
          cap: PALETTE_SLOTS.stone,
        }),
        box(PART.boom, 0, 3, 24, 1, 13, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
        box(PART.boom, 0, 6, 24, 1, 13, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      ],
      [
        box(PART.mast, 3, 4, 1, 1, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
        box(PART.mast, 12, 4, 1, 1, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
        box(PART.mast, 20, 4, 1, 1, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
        box(PART.steps, 17, 0, 5, 2, 1, 9, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
          step: 1,
        }),
      ],
    ],
    variants: [
      // Stazione a volta: la falda sulla sala, l'ingresso e l'insegna. E' il
      // nodo che si comporta da capolinea ferroviario.
      {
        name: 'volta',
        parts: [
          [],
          [box(PART.pitch, 7, 1, 10, 8, 8, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [entrance(7, 3, 1, 4, 5)],
          [signBand(7, 2, 1, 6, 6)],
        ],
      },
      // Viadotto elettrificato: tre portali a traliccio sopra l'impalcato. E'
      // l'unico esemplare che aggiunge struttura *sopra* la linea invece che
      // accanto, e di taglio allunga la sagoma verso l'alto.
      {
        name: 'elettrificato',
        parts: [
          [],
          [box(PART.truss, 0, 3, 2, 4, 13, 7, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.truss, 11, 3, 2, 4, 13, 7, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.truss, 22, 3, 2, 4, 13, 7, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          })],
        ],
      },
      // Capolinea: torre dell'orologio con il quadrante acceso e la pensilina
      // sulle banchine.
      {
        name: 'capolinea',
        parts: [
          [],
          [box(PART.mast, 17, 6, 3, 3, 1, 16, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          })],
          [box(PART.slab, 17, 6, 3, 3, 14, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous)],
          [box(PART.pitch, 6, 0, 12, 2, 8, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
        ],
      },
    ],
  },

  // Un quadrato cavo con una torre su un lato: il cortile e' la forma, e la
  // scatola cava e' la sola primitiva che lo produca senza svuotare niente.
  university: {
    kind: 'university',
    span: [12, 12],
    height: 20,
    anchor: [6, 6],
    apron: 4,
    stages: [0, 8, 20, 40],
    parts: [
      [
        box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
        // Due anelli concentrici: un'ala spessa un voxel sarebbe un recinto, non
        // un edificio, e il cortile deve leggersi come *dentro* qualcosa.
        box(PART.shell, 0, 0, 12, 12, 1, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.shell, 1, 1, 10, 10, 1, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.shell, 0, 0, 12, 12, 9, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.shell, 1, 1, 10, 10, 9, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.deck, 2, 2, 8, 8, 0, 1, PALETTE_SLOTS.grassLight, SURFACE_KIND.plain),
        box(PART.colonnade, 2, 2, 8, 8, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        }),
      ],
      [
        box(PART.mast, 9, 4, 3, 4, 1, 13, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.steps, 9, 4, 3, 4, 14, 2, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
          step: 1,
        }),
      ],
      [
        box(PART.shell, 0, 0, 5, 5, 10, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.deck, 0, 0, 5, 5, 15, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.steps, 1, 1, 3, 3, 16, 2, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
          step: 1,
        }),
      ],
    ],
    variants: [
      // Rettorato a cupola: la piramide d'angolo si allarga e si smussa. Il
      // gradone smussato e' la cosa piu' vicina a una cupola che questo
      // vocabolario sappia dire, e a distanza di gioco basta.
      {
        name: 'rettorato',
        parts: [
          [],
          [box(PART.steps, 0, 0, 5, 5, 16, 3, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 1,
            chamfer: 1,
            cap: PALETTE_SLOTS.metalGold,
          })],
          [box(PART.slab, 1, 1, 3, 3, 19, 1, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech)],
          [entrance(0, 5, 1, 2, 4)],
        ],
      },
      // Biblioteca: un'ala a falda sul quadrilatero, insegna e ingresso sul
      // fronte est. Lascia libera la torre, che resta la firma del ruolo.
      {
        name: 'biblioteca',
        parts: [
          [],
          [box(PART.pitch, 0, 0, 9, 12, 10, 4, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [signBand(11, 4, 1, 4, 7)],
          [entrance(11, 5, 1, 2, 4)],
        ],
      },
      // Campanile: un traliccio in pietra sull'angolo libero, con la cella
      // campanaria accesa. E' la verticale che il quadrilatero non ha.
      {
        name: 'campanile',
        parts: [
          [],
          [box(PART.truss, 0, 9, 3, 3, 10, 8, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
            step: 3,
            cap: PALETTE_SLOTS.concreteWhite,
          })],
          [box(PART.slab, 1, 10, 1, 1, 14, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous)],
          [box(PART.slab, 0, 9, 3, 3, 18, 1, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech)],
        ],
      },
    ],
  },

  // La cosa piu' alta e piu' stretta dell'isola. Non ha una funzione da
  // raccontare, quindi la sagoma e' tutto quello che ha.
  monument: {
    kind: 'monument',
    span: [12, 12],
    height: 26,
    anchor: [6, 6],
    apron: 5,
    stages: [0, 10, 24, 48],
    parts: [
      [
        box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
        box(PART.steps, 3, 3, 6, 6, 1, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          step: 1,
          cap: PALETTE_SLOTS.concreteWhite,
        }),
      ],
      [
        box(PART.mast, 5, 5, 2, 2, 4, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
      [
        box(PART.colonnade, 1, 1, 10, 10, 1, 6, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.concreteWhite,
        }),
        box(PART.deck, 0, 5, 12, 2, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        box(PART.deck, 5, 0, 2, 12, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      ],
      [
        box(PART.mast, 5, 5, 2, 2, 18, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.steps, 4, 4, 4, 4, 23, 2, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
          step: 1,
        }),
      ],
    ],
    variants: [
      // Obelisco: zoccolo largo e smussato, fusto ottagonale, punta d'oro. E'
      // l'esemplare piu' snello, e lo si riconosce dal basamento prima che
      // dalla guglia.
      {
        name: 'obelisco',
        parts: [
          [],
          [box(PART.steps, 2, 2, 8, 8, 1, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 1,
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          })],
          [box(PART.slab, 4, 4, 4, 4, 4, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            chamfer: 1,
            cap: PALETTE_SLOTS.metalGold,
          })],
          [box(PART.steps, 4, 4, 4, 4, 23, 3, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
            step: 1,
            chamfer: 1,
          })],
        ],
      },
      // Rotonda: un tamburo ottagonale attorno al fusto e una cupola a gradoni.
      // E' l'esemplare piu' massiccio dei tre, e l'unico in cui la guglia
      // sparisce dentro il volume invece di uscirne.
      {
        name: 'rotonda',
        parts: [
          [],
          [box(PART.shell, 2, 2, 8, 8, 7, 10, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          })],
          [box(PART.steps, 2, 2, 8, 8, 17, 4, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
            step: 1,
            chamfer: 2,
          })],
          [entrance(1, 5, 1, 2, 4)],
        ],
      },
      // Arco: due piloni, un architrave e una corona a traliccio. E' l'unico
      // che si attraversa, e il vuoto sotto l'architrave e' la sua firma.
      {
        name: 'arco',
        parts: [
          [],
          [box(PART.slab, 0, 4, 3, 4, 1, 10, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.concreteWhite,
          })],
          [
            box(PART.slab, 9, 4, 3, 4, 1, 10, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
              cap: PALETTE_SLOTS.concreteWhite,
            }),
            box(PART.boom, 0, 4, 12, 4, 11, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
              cap: PALETTE_SLOTS.metalGold,
            }),
          ],
          [box(PART.truss, 3, 4, 6, 4, 14, 6, PALETTE_SLOTS.metalGold, SURFACE_KIND.civic, {
            step: 2,
          })],
        ],
      },
    ],
  },
};

/**
 * Lo scalo in quota: l'aeroporto quando il click cade su un tetto.
 *
 * **Non e' una variante e non poteva esserlo.** Un esemplare si sceglie dal
 * seme e condivide ingombro e tronco con gli altri; qui l'ingombro *deve*
 * cambiare, perche' un campo di volo largo ventisei colonne non sta su nessun
 * tetto — `MAX_FOOTPRINT` e' otto. E' una ricetta a se' che il **luogo**
 * seleziona, che e' l'unica cosa in questo dominio a non dipendere dal seme.
 *
 * Fuori dal catalogo `LANDMARKS`, e non per timidezza: quella tabella promette
 * «una struttura per ruolo» e un test la verifica. Questa e' la seconda forma
 * dello stesso ruolo, e tenerla in un'altra tabella e' il modo di dirlo senza
 * indebolire la prima.
 *
 * Niente pista e niente ali: **in quota non si atterra su una corsa, ci si posa
 * o ci si aggancia**, e i tre modi di farlo sono i tre mezzi che questo scalo
 * mostra. Il dirigibile si appende a un pilone e ci resta; l'eVTOL scende su
 * una piazzola di tre colonne, che e' l'unico modo di *arrivare* davvero su un
 * piattaforma di otto; la mongolfiera si stacca da una cima, prende quota e rientra.
 * Tre sagome che nessun campo di volo produrrebbe, e nessuna che chieda i
 * ventisei voxel di pista che qui non ci sono.
 */
export const SKYPORT: LandmarkRecipe = {
  kind: 'airport',
  span: [8, 8],
  height: 16,
  anchor: [4, 4],
  // Nessun grembiule: la cornice di suolo pubblico e' suolo, mentre questa
  // piattaforma sta fuori dalla facciata. Chi la posa salta la mano di vernice.
  apron: 0,
  stages: [0, 4, 12, 24],
  parts: [
    [
      box(PART.deck, 0, 0, 8, 8, 0, 1, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      box(PART.shell, 0, 0, 8, 8, 1, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.deck, 2, 2, 4, 4, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
    ],
    [
      // Il pilone maggiore: e' la parte che dice il ruolo, e da qui in avanti la
      // sagoma sul cielo e' quella di un ormeggio e non di un tetto attrezzato.
      box(PART.mast, 2, 2, 2, 2, 1, 11, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 2, 2, 2, 2, 12, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
    [
      box(PART.shell, 5, 0, 3, 3, 1, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 5, 0, 3, 3, 5, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.mast, 0, 7, 1, 1, 1, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 7, 7, 1, 1, 1, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      // La cima della mongolfiera nell'angolo libero, e nell'**unico** che lo
      // sia: i due piloni stanno in diagonale al centro, l'aerostazione occupa
      // il fronte e il colonnato il fianco. Un pallone e' largo sette voxel e
      // deve potersene andare senza attraversare niente.
      box(PART.mast, 0, 0, 1, 1, 1, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.slab, 0, 0, 2, 2, 0, 1, PALETTE_SLOTS.metalBrass, SURFACE_KIND.utility),
    ],
    [
      box(PART.mast, 4, 5, 2, 2, 1, 9, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 4, 5, 2, 2, 10, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.colonnade, 0, 3, 4, 4, 1, 3, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 3,
        cap: PALETTE_SLOTS.concretePale,
      }),
      // La piazzola dell'eVTOL **sopra l'aerostazione**, non sul piano: otto
      // colonne di tetto sono tutte impegnate, e l'unico posto libero su uno
      // scalo in quota e' un altro tetto. Sborda di una colonna a ovest, che e'
      // lo sbalzo che la fa leggere come una piazzola invece che come la
      // copertura del volume sotto.
      box(PART.deck, 4, 0, 3, 3, 6, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
      box(PART.deck, 5, 1, 1, 1, 6, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
    ],
  ],
  // **Quattro ormeggi per tre mestieri**, tutti su quote e angoli diversi.
  //
  // I due dirigibili stanno accanto ai piloni con le prue opposte: due sagome
  // lunghe sedici voxel appese allo stesso tetto si attraverserebbero, e due
  // dirigibili incastrati sono peggio di uno solo. La piazzola guarda a est —
  // il verso da cui l'eVTOL scende — perche' e' l'unico lato del riquadro senza
  // un pilone davanti; la cima del pallone guarda a sud per la stessa ragione,
  // ed e' anche il verso in cui il pallone si allontana.
  moorings: [
    { x: 2, y: 2, z: 10, berth: BERTH.airship, heading: Math.PI },
    { x: 5, y: 6, z: 8, berth: BERTH.airship, heading: 0 },
    { x: 5, y: 1, z: 7, berth: BERTH.pad, heading: 0 },
    { x: 0, y: 0, z: 6, berth: BERTH.balloon, heading: -Math.PI / 2 },
  ],
};

/**
 * Le ricette che una facciata sa ospitare, per ruolo.
 *
 * Una sola, per ora, e la tabella esiste comunque: il giorno in cui un secondo
 * ruolo impara a posarsi in quota, il piazzamento non deve imparare niente.
 */
const ALOFT: Partial<Record<CatalystId, LandmarkRecipe>> = {
  airport: SKYPORT,
};

/**
 * La ricetta di un ruolo, a terra o su una facciata.
 *
 * `aloft` non e' una preferenza: e' il luogo che il click ha scelto, e un ruolo
 * che non sa stare in quota risponde `null` invece di ripiegare a terra —
 * ripiegare significherebbe costruire un campo di volo dentro un grattacielo.
 */
export function landmarkOf(kind: CatalystId, aloft = false): LandmarkRecipe | null {
  if (aloft) return ALOFT[kind] ?? null;
  return LANDMARKS[kind] ?? null;
}

/** true se questo ruolo ha una forma da tetto oltre a quella da terra. */
export function hasAloftRecipe(kind: CatalystId): boolean {
  return ALOFT[kind] !== undefined;
}

/** Ultimo stadio raggiungibile da una ricetta. */
export function maxStageOf(recipe: PartsRecipe): number {
  return recipe.parts.length - 1;
}

/**
 * Gli esemplari di una ricetta, mai meno di uno.
 *
 * Una ricetta senza `variants` ne ha comunque uno — il tronco nudo — e dirlo
 * qui invece che in `generateLandmark` evita al generatore di distinguere il
 * caso: sceglie sempre dentro una lista, che a volte e' lunga uno.
 */
export function variantsOf(recipe: PartsRecipe): readonly LandmarkVariant[] {
  if (recipe.variants === undefined || recipe.variants.length === 0) return [TRUNK_ONLY];
  return recipe.variants;
}

const TRUNK_ONLY: LandmarkVariant = { name: 'base', parts: [] };
