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

  /** Parti aggiunte da ciascuno stadio. Cumulative: lo stadio n disegna 0..n. */
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
  extra: Partial<Pick<Part, 'step' | 'cap'>> = {},
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
  },

  // Ciminiere molto piu' alte del corpo: la fabbrica si riconosce dal fumo che
  // non c'e', cioe' dalle verticali sottili sopra un capannone basso e lungo.
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
  },
};

export function landmarkOf(kind: CatalystId): LandmarkRecipe | null {
  return LANDMARKS[kind] ?? null;
}

/** Ultimo stadio raggiungibile da una ricetta. */
export function maxStageOf(recipe: LandmarkRecipe): number {
  return recipe.parts.length - 1;
}
