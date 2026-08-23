import type { CatalystId } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { GRADING } from '../grading/config';
import { SURFACE_KIND } from '../visualBlock';
import { PART, type Part } from './parts';

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

  /**
   * Colore del recinto attorno a un riquadro che si sta sgomberando.
   *
   * **Un cantiere deve leggersi come un cantiere**, non come un buco. Fra il
   * click e la struttura passano diverse passate — gli edifici cadono uno per
   * volta, a budget — e senza un segno il giocatore vede solo case che spariscono
   * senza sapere perche'. Il ruggine e' il colore piu' lontano dall'asfalto del
   * grembiule che lo sostituira': il passaggio da recinto a suolo pubblico si
   * vede, ed e' il modo in cui il cantiere dichiara di essere finito.
   */
  fencePalette: PALETTE_SLOTS.metalRust,

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
} as const;

export interface LandmarkRecipe {
  readonly kind: CatalystId;

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

  /** Raggio di Manhattan del grembiule dipinto attorno alla struttura. */
  readonly apron: number;

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
// riga di ricetta si legga come una frase invece che come nove numeri.

function box(
  kind: Part['kind'],
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  height: number,
  palette: number,
  surface: Part['surface'],
  extra: Partial<Pick<Part, 'step' | 'cap' | 'chamfer'>> = {},
): Part {
  return { kind, x, y, w, h, z, height, palette, surface, ...extra };
}

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
 * Una darsena: lo specchio d'acqua che il piano di banchina non ha riempito.
 *
 * **L'acqua e' scritta dentro lo stamp**, com'e' gia' lo stagno del parco, e non
 * e' un buco lasciato al terreno. Le opere portano *tutta* l'impronta alla quota
 * della banchina prima che lo stamp scriva — `buildWorks` riempie il riquadro,
 * non le sole colonne che una parte occupa — quindi qui sotto c'e' terra ferma e
 * questo e' un voxel di pelo d'acqua. E' l'unico modo che una ricetta ha di
 * tenersi dell'acqua dentro l'ingombro, ed e' cio' che permette a una barca di
 * stare *in* un porto invece che accanto.
 */
function basin(x: number, y: number, w: number, h: number): Part {
  return box(PART.deck, x, y, w, h, 0, 1, PALETTE_SLOTS.water, SURFACE_KIND.plain);
}

/**
 * Un pontile: un piano di legno alla quota del pelo d'acqua.
 *
 * Sta a zero come la darsena, non un voxel piu' su, e la ragione e' la stessa
 * per cui una banchina sta due voxel sopra il mare: un pontile *galleggia*, e
 * cio' che lo distingue dal molo e' proprio non avere un salto sotto. A distanza
 * di gioco la differenza fra i due la fa il materiale, il legno contro la
 * pietra, e il fatto che uno sia sull'acqua e l'altro sopra.
 */
function pontoon(x: number, y: number, w: number, h: number): Part {
  return box(PART.deck, x, y, w, h, 0, 1, PALETTE_SLOTS.wood, SURFACE_KIND.utility);
}

/**
 * Una barca all'ormeggio: scafo rastremato e tuga.
 *
 * Lo scafo parte dalla quota del pelo d'acqua e non da sotto: una ricetta non sa
 * scrivere sotto il proprio piano finito, e la linea di galleggiamento sul pelo
 * e' l'approssimazione che a distanza isometrica non si distingue da un
 * pescaggio vero. Due voxel di bordo libero — un cubo di terreno — piu' la tuga
 * sopra: e' quanto basta perche' di taglio la barca abbia un'altezza propria e
 * non legga come una chiazza di colore sull'acqua.
 */
function moored(x: number, y: number, length: number): readonly Part[] {
  return [
    box(PART.hull, x, y, length, 3, 0, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
      step: 1,
      cap: PALETTE_SLOTS.wood,
    }),
    box(PART.mast, x + length - 3, y + 1, 2, 1, 2, 2, PALETTE_SLOTS.concretePale, SURFACE_KIND.plain, {
      cap: PALETTE_SLOTS.glassDeep,
    }),
  ];
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
  // sotto il click, il molo davanti e i magazzini alle spalle. La fila di bracci
  // di gru sopra la linea dell'acqua e' la firma del ruolo.
  port: {
    kind: 'port',
    span: [20, 12],
    height: 18,
    anchor: [11, 6],
    apron: 4,
    stages: [0, 6, 16, 32],
    parts: [
      [
        box(PART.deck, 0, 0, 12, 12, 0, 1, GRADING.quayDeck, SURFACE_KIND.utility),
        // Lo specchio d'acqua c'e' dal primo stadio: e' cio' che fa leggere il
        // fronte come un porto quando la banchina e' ancora sola. Il molo dello
        // stadio dopo lo taglia in due darsene, e riscrivere un voxel d'acqua
        // come pietra e' il modo in cui una ricetta cumulativa esprime «qui ora
        // c'e' terra» senza togliere niente a nessuno.
        basin(12, 0, 8, 12),
        box(PART.shell, 1, 2, 6, 7, 1, 8, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        box(PART.deck, 1, 2, 6, 7, 9, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.slab, 12, 4, 8, 4, 0, 1, GRADING.quayDeck, SURFACE_KIND.utility),
        pontoon(12, 3, 7, 1),
        ...craneAt(5),
      ],
      [
        ...craneAt(1),
        ...moored(13, 0, 6),
        box(PART.slab, 1, 10, 6, 2, 1, 4, PALETTE_SLOTS.metalRust, SURFACE_KIND.plain),
        box(PART.slab, 8, 10, 4, 2, 1, 2, PALETTE_SLOTS.glassDeep, SURFACE_KIND.plain),
      ],
      [
        ...craneAt(9),
        pontoon(12, 8, 7, 1),
        ...moored(13, 9, 6),
        box(PART.shell, 8, 0, 4, 3, 1, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        box(PART.deck, 8, 0, 4, 3, 7, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
        box(PART.mast, 18, 5, 2, 2, 1, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    variants: [
      // Merci alla rinfusa: silo, silo, nastro. La sagoma resta quella del
      // porto — banchina, magazzino, gru — e cambia cosa ci si scarica.
      {
        name: 'granaio',
        parts: [
          [],
          [box(PART.slab, 0, 9, 4, 3, 1, 12, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
            chamfer: 1,
            cap: PALETTE_SLOTS.concretePale,
          })],
          [
            box(PART.slab, 4, 9, 4, 3, 1, 9, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
              chamfer: 1,
              cap: PALETTE_SLOTS.concretePale,
            }),
            box(PART.boom, 2, 10, 10, 2, 13, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
              cap: PALETTE_SLOTS.metalBrass,
            }),
          ],
          [entrance(1, 8, 2, 1, 3)],
        ],
      },
      // Cantiere navale: due tralicci a cavallo della darsena e il ponte che li
      // unisce. E' il portale sotto cui passa lo scafo, ed e' l'unico esemplare
      // che si legge da sopra prima che di taglio.
      {
        name: 'cantiere',
        parts: [
          [],
          [box(PART.truss, 12, 0, 3, 12, 1, 13, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 3,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.boom, 12, 4, 8, 3, 13, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.truss, 17, 0, 3, 12, 1, 13, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 3,
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
          [box(PART.pitch, 1, 2, 6, 7, 10, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [signBand(6, 3, 1, 5, 6)],
          [entrance(6, 5, 1, 2, 4)],
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
        // L'acqua per prima: tutto il resto le scrive sopra, e quel che resta
        // scoperto e' lo specchio in cui le barche stanno.
        basin(8, 0, 14, 12),
        box(PART.deck, 0, 0, 8, 12, 0, 1, GRADING.quayDeck, SURFACE_KIND.utility),
        box(PART.shell, 1, 3, 6, 6, 1, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.deck, 1, 3, 6, 6, 7, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        // Il molo: stretto e lungo, perche' e' un passaggio e non un piazzale.
        box(PART.slab, 8, 4, 12, 4, 0, 1, GRADING.quayDeck, SURFACE_KIND.utility),
      ],
      [
        pontoon(8, 3, 11, 1),
        ...moored(9, 0, 7),
      ],
      [
        pontoon(8, 8, 11, 1),
        ...moored(9, 9, 7),
        // Il fanale in punta e' la sola verticale della ricetta: da lontano e'
        // quello a separare un molo da una lingua di terra.
        box(PART.mast, 18, 5, 2, 2, 1, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
      [
        // La pensilina sul molo: il vuoto sotto un tetto e' cio' che nessuna
        // scatola cava sa dare, ed e' la stessa primitiva del mercato.
        box(PART.colonnade, 9, 4, 10, 4, 1, 5, PALETTE_SLOTS.wood, SURFACE_KIND.habitat, {
          step: 3,
          cap: PALETTE_SLOTS.brickLight,
        }),
        box(PART.slab, 1, 0, 6, 2, 1, 3, PALETTE_SLOTS.brickLight, SURFACE_KIND.habitat),
        box(PART.shell, 1, 9, 6, 3, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.deck, 1, 9, 6, 3, 6, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
    ],
    variants: [
      // Imbarcadero: la tettoia sul molo, l'ingresso e l'insegna. E' il ferry
      // che si comporta da stazione, e la falda sopra il colonnato e' cio' che
      // lo distingue dal molo nudo.
      {
        name: 'imbarcadero',
        parts: [
          [],
          [box(PART.pitch, 9, 4, 10, 4, 6, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [entrance(6, 5, 1, 2, 4)],
          [signBand(6, 4, 1, 4, 5)],
        ],
      },
      // Faro in punta al molo: tamburo smussato, lanterna accesa, cupola a
      // gradoni. E' l'unico landmark che di notte fa luce sull'acqua.
      {
        name: 'faro',
        parts: [
          [],
          [box(PART.slab, 18, 4, 4, 4, 1, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            chamfer: 1,
            cap: PALETTE_SLOTS.metalGold,
          })],
          [box(PART.slab, 19, 5, 2, 2, 11, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous)],
          [box(PART.steps, 18, 4, 4, 4, 13, 3, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
            step: 1,
            chamfer: 1,
          })],
        ],
      },
      // Darsena da lavoro: una barca in piu' e la gru che la serve. Stessa
      // banchina, altro mestiere.
      {
        name: 'darsena',
        parts: [
          [],
          [...moored(15, 1, 6)],
          [box(PART.truss, 8, 9, 2, 3, 1, 11, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 3,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.boom, 8, 10, 9, 2, 11, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
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

  // Un piano lungo e nient'altro alla sua altezza, piu' una torre sottile: e'
  // il contrasto fra i due, non la pista da sola, a dire «aeroporto».
  airport: {
    kind: 'airport',
    span: [26, 12],
    height: 20,
    anchor: [7, 6],
    apron: 4,
    stages: [0, 10, 24, 44],
    parts: [
      [
        box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.shell, 0, 1, 9, 9, 1, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        }),
        box(PART.deck, 0, 1, 9, 9, 8, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.deck, 12, 4, 14, 4, 0, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
        // Le soglie sono lo stesso piano riscritto piu' chiaro: una pista senza
        // segnaletica e' una striscia d'asfalto, e a distanza non si legge.
        box(PART.deck, 14, 5, 3, 2, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        box(PART.deck, 19, 5, 3, 2, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        box(PART.deck, 24, 5, 2, 2, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      ],
      [
        box(PART.mast, 10, 1, 3, 3, 1, 14, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        }),
        box(PART.slab, 9, 0, 5, 5, 15, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 9, 0, 5, 5, 18, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.shell, 13, 9, 10, 3, 1, 6, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        }),
        box(PART.deck, 13, 9, 10, 3, 7, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
        box(PART.deck, 12, 8, 14, 1, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      ],
    ],
    variants: [
      // Hub passeggeri: falda sull'aerostazione, un finger verso il piazzale,
      // ingresso e insegna sul fronte citta'.
      {
        name: 'hub',
        parts: [
          [],
          [box(PART.pitch, 0, 1, 9, 9, 9, 4, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
            step: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.boom, 9, 2, 3, 2, 4, 2, PALETTE_SLOTS.concretePale, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.glassPale,
          })],
          [entrance(0, 4, 1, 3, 4), signBand(0, 3, 1, 5, 6)],
        ],
      },
      // Scalo merci: capannone a traliccio, cisterne smussate, torre di sfiato.
      // Nessuna fascia luminosa: di notte questo esemplare resta buio, ed e'
      // esattamente cio' che lo distingue dall'hub a colpo d'occhio.
      {
        name: 'merci',
        parts: [
          [],
          [box(PART.truss, 13, 9, 10, 3, 7, 8, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 3,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.slab, 23, 8, 3, 4, 1, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
            chamfer: 1,
            cap: PALETTE_SLOTS.metalBrass,
          })],
          [box(PART.mast, 24, 0, 2, 2, 1, 16, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalGold,
          })],
        ],
      },
      // Radar: un traliccio in fondo alla pista con la cupola accesa in cima, e
      // tre luci di avvicinamento sull'asse. E' l'esemplare che si legge di
      // notte da lontano quanto di giorno.
      {
        name: 'radar',
        parts: [
          [],
          [box(PART.truss, 22, 0, 4, 4, 1, 15, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
            step: 3,
            cap: PALETTE_SLOTS.concretePale,
          })],
          [box(PART.slab, 23, 1, 2, 2, 16, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous)],
          [signBand(12, 5, 1, 2, 1), signBand(17, 5, 1, 2, 1), signBand(22, 5, 1, 2, 1)],
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

export function landmarkOf(kind: CatalystId): LandmarkRecipe | null {
  return LANDMARKS[kind] ?? null;
}

/** Ultimo stadio raggiungibile da una ricetta. */
export function maxStageOf(recipe: LandmarkRecipe): number {
  return recipe.parts.length - 1;
}

/**
 * Gli esemplari di una ricetta, mai meno di uno.
 *
 * Una ricetta senza `variants` ne ha comunque uno — il tronco nudo — e dirlo
 * qui invece che in `generateLandmark` evita al generatore di distinguere il
 * caso: sceglie sempre dentro una lista, che a volte e' lunga uno.
 */
export function variantsOf(recipe: LandmarkRecipe): readonly LandmarkVariant[] {
  if (recipe.variants === undefined || recipe.variants.length === 0) return [TRUNK_ONLY];
  return recipe.variants;
}

const TRUNK_ONLY: LandmarkVariant = { name: 'base', parts: [] };
