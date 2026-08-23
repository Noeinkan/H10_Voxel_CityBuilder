import { PALETTE_SLOTS } from '../../engine/paletteSlots';

/**
 * Unica fonte di verita' dei numeri del terreno.
 *
 * Nessun altro file di `src/world/terrain/` contiene soglie, frequenze o
 * ampiezze: tutto passa da qui, cosi' la calibrazione e' un file solo.
 *
 * **Asse verticale.** Il mondo e' Z-up (`x` est, `y` nord, `z` altezza), quindi
 * "livello del mare a 8" e "altezza massima 40" sono valori di `z`. Il piano
 * delle colonne e' `(x, y)`.
 */

/** Identificatori di bioma. Sono indici densi: alimentano tabelle e `Uint8Array`. */
export const BIOME = {
  ocean: 0,
  beach: 1,
  plain: 2,
  forest: 3,
  hill: 4,
  rock: 5,
} as const;

export type BiomeId = (typeof BIOME)[keyof typeof BIOME];

/** Nomi in ordine di indice, per overlay e messaggi di test. */
export const BIOME_NAMES: readonly string[] = ['ocean', 'beach', 'plain', 'forest', 'hill', 'rock'];

export const BIOME_COUNT = BIOME_NAMES.length;

export const TERRAIN = {
  // --- Grana del terreno --------------------------------------------------

  /**
   * Voxel per lato del cubo di terreno, sui tre assi.
   *
   * E' la sola cosa che separa la scala del terreno da quella di cio' che ci
   * sta sopra. Il terreno campiona e quantizza su questa cella — in pianta e in
   * quota — mentre edifici e alberi restano a dettaglio di un voxel: un cubo di
   * prato si legge percio' grosso il doppio di un voxel di facciata, ed e'
   * quella differenza a dare la scala all'isola. Con tutto sullo stesso passo
   * una chioma d'albero era larga quanto un edificio intero.
   *
   * Deve dividere `CHUNK`. Le celle sono allineate al mondo e ogni blocco parte
   * da un `baseX` multiplo di 32: solo se questo vale l'allineamento locale al
   * chunk coincide con quello globale, e una cella non cade a cavallo di una
   * cucitura con due quote diverse.
   */
  cellSize: 2,

  // --- Quote assolute (voxel sull'asse z) ---------------------------------
  //
  // Sono voxel, non celle, ma quasi tutte vogliono essere multiple di
  // `cellSize`: una soglia dispari cade a meta' di un cubo, e il gradino da un
  // voxel che ne esce e' esattamente il dettaglio che il terreno a celle deve
  // togliere di mezzo.
  //
  // **Sono tarate su un'isola di lato 512.** La verticale non e' libera dalla
  // orizzontale: il gradiente del campo vale rilievo diviso raggio, quindi
  // un'isola larga il doppio con lo stesso rilievo e' la stessa montagna
  // spalmata su due volte lo spazio — una frittella senza fianchi, senza
  // `sloped` e senza niente da terrazzare. Raddoppiando il lato dell'isola sono
  // raddoppiate anche queste, e con loro le frequenze del rumore: le pendenze
  // restano quelle calibrate, e la calibrazione vale ancora.

  /** Superficie dell'acqua: l'ultimo voxel d'acqua sta a `z = seaLevel - 1`. */
  seaLevel: 16,

  /**
   * Profondita' entro cui l'acqua si guarda come bassofondo.
   *
   * Tre e non `GRADING.maxQuayDepth`, che vale dodici: quella e' la soglia di
   * cio' che una banchina riesce a colmare, e come limite di look prenderebbe
   * quasi tutto il perimetro dell'isola. Qui serve la fascia in cui si legge
   * ancora la sabbia sotto.
   */
  shallowDepth: 3,

  /**
   * Oltre questa profondita' un braccio stretto si guarda come mare aperto.
   *
   * Un canale e' acqua ferma perche' e' poca e chiusa; un braccio profondo fra
   * due pareti e' un fiordo, e l'onda lunga gli si addice piu' dello specchio.
   */
  canalMaxDepth: 8,

  /** Quanto lontano si cerca la sponda opposta prima di rinunciare al canale. */
  canalReach: 7,

  /** Tetto duro dell'altezza di colonna. Nessuna colonna supera questa quota. */
  maxHeight: 80,

  /** Altezza a cui la maschera radiale schiaccia il bordo della region. */
  oceanFloor: 4,

  /**
   * Rilievo massimo per voxel di raggio dell'isola.
   *
   * Il gradiente del campo scala come rilievo diviso raggio: un'isola stretta
   * con lo stesso rilievo di una larga e' la stessa montagna schiacciata in meta'
   * spazio, quindi con pendenze doppie. Senza questo tetto la calibrazione
   * varrebbe solo per il lato 256 su cui e' stata fatta, e su una region piu'
   * piccola cadrebbero sia il criterio di continuita' sia l'edificabilita'.
   *
   * A raggio 256 il tetto vale 76,8 e morde appena: il rilievo resta
   * `maxHeight - oceanFloor`, cioe' 76. Sotto, l'isola si abbassa in proporzione
   * — che e' anche il comportamento giusto, un isolotto non ha una vetta da 80
   * voxel.
   */
  maxReliefSlope: 0.3,

  /**
   * I lobi da 128 voxel hanno raggio minore dell'isola base: questa frazione
   * compensa la scala senza dare loro il rilievo pieno, mantenendo il raccordo
   * sotto un voxel di dislivello e abbastanza alto da produrre pianura.
   */
  coastalExtensionRelief: 1.8,

  // --- Campo di rumore ----------------------------------------------------

  /**
   * Tre ottave di simplex sommate con ampiezza `persistence^i` e frequenza
   * `baseFrequency * lacunarity^i`.
   *
   * Le frequenze sono deliberatamente basse. Il criterio "due colonne adiacenti
   * non differiscono di piu' di 1 in altezza" e' un vincolo di Lipschitz sul
   * campo continuo: con un rilievo di `maxHeight - oceanFloor` voxel, la somma
   * pesata `Σ w_i * f_i` moltiplicata per il gradiente massimo del simplex deve
   * restare sotto ~1 voxel per voxel, maschera radiale inclusa. Alzare
   * `baseFrequency` o `maxHeight` rompe quel test: `heightField.test.ts` misura
   * il margine effettivo.
   *
   * **Erano quattro, e la quarta era l'ottava piu' cara del campo.** In un fbm
   * normalizzato ogni ottava pesa sul gradiente `w_i * f_i`, e con
   * `lacunarity = 2` e `persistence = 0.5` quel prodotto e' **lo stesso per
   * tutte**: l'ultima ottava si prendeva un quarto del budget di pendenza per
   * il sei per cento dell'ampiezza, cioe' tre voxel di increspatura su una
   * lunghezza d'onda di quarantotto. Quel quarto e' passato a `LANDFORM`, dove
   * gli stessi voxel di dislivello fanno una collina o la sponda di un lago
   * invece di grana che la quantizzazione a celle cancella comunque.
   */
  octaves: 3,
  baseFrequency: 1 / 384,
  lacunarity: 2,
  persistence: 0.5,

  /**
   * Quota che la maschera radiale alza da sola, come frazione del rilievo. Il
   * rumore si prende il resto. Senza questo termine l'isola dipende troppo da
   * dove cadono le creste del seed: alcuni seed davano un banco piatto senza
   * collina ne' roccia.
   */
  domeBias: 0.35,

  /** Sale del seed per ottava: tiene le ottave indipendenti fra loro. */
  noiseSalt: 0x5eed_1a1d,

  /**
   * Deformazione del raggio della maschera radiale.
   *
   * Senza, l'isola e' un'ellisse e le fasce di bioma escono come cerchi
   * concentrici: un bersaglio, non una costa. Un rumore a frequenza molto bassa
   * che allunga e accorcia il raggio rompe la simmetria con poche anse larghe,
   * e costa quasi nulla in gradiente proprio perche' e' cosi' lento.
   *
   * `warpAmount` ha un tetto duro intorno a 0,26: e' il punto in cui la
   * maschera sul bordo della region sale abbastanza da portare una colonna di
   * rumore massimo sopra `seaLevel`, cioe' terra attaccata al bordo invece di
   * acqua. Sotto quel valore l'isola resta circondata d'acqua per costruzione.
   * I due termini si sommano, quindi il tetto vale sulla loro somma.
   */
  warpAmount: 0.16,
  warpFrequency: 1 / 640,
  warpSalt: 0x00c0_a571,

  /**
   * Seconda ottava della deformazione, quella che fa le insenature.
   *
   * La prima e' lentissima per scelta — una lunghezza d'onda piu' lunga
   * dell'isola — e da sola produce un'ellisse spostata da un lato: rompe la
   * simmetria ma non fa una costa. Questa e' quattro volte piu' rapida e vale
   * un terzo: aggiunge alla linea di riva qualche ansa e qualche capo alla
   * scala di un quartiere, che e' la scala a cui la costa si guarda.
   *
   * Costa poco proprio perche' e' bassa: il contributo al gradiente e'
   * `ampiezza * frequenza`, e mezzo punto percentuale di ampiezza in piu' su
   * una frequenza quadrupla resta sotto il decimo di voxel per voxel.
   */
  warpDetail: 0.055,
  warpDetailFrequency: 1 / 168,
  warpDetailSalt: 0x00c0_a572,

  // --- Soglie di bioma ----------------------------------------------------
  //
  // Valutate nell'ordine di `classifyBiome`: oceano, spiaggia, roccia, collina,
  // foresta, pianura. Le soglie di altezza sono in voxel, quelle di pendenza in
  // voxel per voxel (dislivello massimo verso i quattro vicini ortogonali).

  /** Sopra il mare ma entro questa quota si resta costa. */
  beachMaxHeight: 24,

  /**
   * Roccia, collina e foresta si dividono il rilievo in fasce da otto voxel
   * — quattro celle — sopra la pianura. Il tetto e' `rockMinHeight`: la calibrazione
   * del rumore garantisce che ogni seed arrivi almeno li', altrimenti
   * esisterebbero isole senza vetta (`heightField.test.ts` lo verifica).
   *
   * Le soglie sono multiple di `cellSize` perche' le quote quantizzate lo sono:
   * una soglia dispari verrebbe attraversata sempre e solo dalla stessa meta'
   * dei valori possibili, e la fascia uscirebbe larga il doppio o la meta' di
   * quanto dichiara.
   */
  rockMinHeight: 48,
  rockMinSlope: 0.52,

  hillMinHeight: 40,
  hillMinSlope: 0.42,

  forestMinHeight: 32,
  forestMinSlope: 0.36,

  /**
   * Pendenza massima per cui una colonna resta edificabile. Sta sotto
   * `forestMinSlope` di proposito: le colonne edificabili sono le piu' dolci
   * della loro fascia, non tutta la fascia.
   */
  buildableMaxSlope: 0.34,

  // --- Stratigrafia della colonna -----------------------------------------
  //
  // Ogni strato e' spesso un numero intero di celle, e `paletteForDepth` lo
  // conta a partire da `cellSize`. La ragione si vede solo di taglio: su una
  // parete la superficie deve essere alta quanto il cubo che la porta, altrimenti
  // sotto il prato spunta una riga di terra da un voxel e il gradino torna a
  // leggersi alla scala sbagliata.

  /** Voxel di sottosuolo sotto la superficie prima di passare al fondo. */
  subsoilDepth: 8,

  /** Voxel d'acqua chiara sopra l'acqua profonda. */
  waterSurfaceDepth: 4,
} as const;

/**
 * Numeri della sagoma: lobi della costa, rilievi interni, conche dei laghi.
 *
 * Stanno qui e non in `landform.ts` per la stessa ragione di tutto il resto —
 * la calibrazione del terreno e' un file solo. Le grandezze sono **relative**:
 * distanze e raggi in frazioni del raggio dell'isola, quote in frazioni del
 * rilievo, cosi' un'isola piu' piccola prende elementi piu' piccoli senza che
 * nessuno di questi numeri debba muoversi.
 *
 * **Nessuna altezza e' dichiarata qui.** Gli elementi scelgono il raggio, e
 * l'altezza gliela detta il budget di pendenza in `capForRadius`: dichiararla
 * significherebbe poter scrivere una collina che il campo non regge, e
 * accorgersene solo quando cade il test di Lipschitz.
 *
 * Gli intervalli sono `[minimo, ampiezza]` per i continui e
 * `[minimo, alternative]` per i conteggi, come `TreeShape.trunk`.
 */
export const LANDFORM = {
  // --- Lobi della costa ---------------------------------------------------

  /** Quanti lobi si aggiungono all'isola base. */
  lobeCount: [2, 2],

  /** Distanza del centro del lobo dal centro dell'isola, in frazioni di raggio. */
  lobeDistance: [0.34, 0.14],

  /** Raggio del lobo, in frazioni del raggio dell'isola. */
  lobeRadius: [0.36, 0.16],

  /**
   * Quanto lontano puo' arrivare il bordo di un lobo, `distanza + raggio`.
   *
   * Sotto 1 di un margine largo: la costa vera dell'isola base cade intorno a
   * 0,68 del raggio — la' dove la maschera scende sotto la soglia di emersione
   * — quindi un lobo che arriva a 0,86 sporge dalla costa di quasi un quinto
   * del raggio senza avvicinarsi al bordo della region.
   */
  lobeReach: 0.86,

  /** Pendenza massima concessa al fianco di un lobo. */
  lobeSlope: 0.3,

  /** Frazione di passo angolare di cui un lobo puo' spostarsi dal suo settore. */
  lobeJitter: 0.55,

  lobeSalt: 0x10b0_5eed,

  // --- Rilievi interni ----------------------------------------------------

  /** Quante cupole spostano le vette fuori dal centro. */
  moundCount: [1, 2],

  moundDistance: [0.16, 0.3],
  moundRadius: [0.24, 0.14],

  /**
   * Pendenza massima concessa al fianco di un rilievo.
   *
   * E' il numero che decide se le colline si vedono: su un'isola di raggio 256
   * e rilievo 76, una cupola larga un quarto sale di una dozzina di voxel —
   * sei celle di terreno sopra cio' che la circonda, quanto basta perche' la
   * fascia di bioma cambi e la vetta non sia piu' una sola.
   */
  moundSlope: 0.22,

  moundJitter: 0.5,

  moundSalt: 0x4001_dd05,

  // --- Conche dei laghi ---------------------------------------------------

  /** Quanti specchi d'acqua interni si tenta di aprire. */
  basinCount: [1, 1],

  /** Quanti siti si esaminano prima di rinunciare. */
  basinCandidates: 192,

  /** Fascia radiale in cui si cercano i siti, `[minimo, ampiezza]`. */
  basinReach: [0.18, 0.52],

  /**
   * Quota della corona sopra il livello del mare, `[minimo, massimo]`.
   *
   * E' la fascia in cui una conca ha senso. Piu' in basso lo specchio si
   * fonderebbe con il mare; piu' in alto la parete che serve a raggiungere il
   * fondo diventa piu' larga della fascia bassa che la ospita, e la conca
   * sfonda la costa da qualche parte.
   */
  basinRimAbove: [4, 9],

  /**
   * Quanto il fondo sta sotto il livello del mare.
   *
   * Due voxel, cioe' una cella: e' la profondita' che tiene tutto lo specchio
   * dentro `shallowDepth` e quindi dentro `WATER_CLASS.shallow` — increspatura
   * fitta e fondale che si vede sotto. Un fondo piu' basso darebbe a una pozza
   * di quaranta voxel l'onda lunga del mare aperto.
   */
  basinFloorBelow: 2,

  /** Pendenza massima concessa alla sponda. */
  basinSlope: 0.3,

  /**
   * Frazione del raggio occupata dal fondo piatto.
   *
   * Il fondo piatto e' la superficie d'acqua: senza, lo specchio si riduce al
   * punto centrale della conca. Costa raggio — la sponda deve scendere nello
   * spazio che resta — ed e' per questo che non e' piu' largo.
   */
  basinPlateau: 0.32,

  /** Raggio massimo di una conca, in frazioni del raggio dell'isola. */
  basinMaxRadius: 0.3,

  /** Distanza minima fra due conche, in multipli della somma dei raggi. */
  basinSpacing: 1.15,

  /** Sonde sulla corona e loro raggio, in multipli del raggio della conca. */
  basinShoreProbes: 12,
  basinShoreReach: 1.04,

  /** Quanto la corona deve stare sopra il mare perche' il lago sia chiuso. */
  basinShoreMargin: 2,

  basinSalt: 0x0acc_a1a0,
} as const;

/** Biomi su cui si puo' costruire, prima di applicare la soglia di pendenza. */
export const BUILDABLE_BIOMES: readonly boolean[] = [
  false, // ocean
  false, // beach
  true, //  plain
  true, //  forest
  true, //  hill
  false, // rock
];

/** Strati di una colonna: superficie, sottosuolo, fondo. Indici di palette. */
export interface BiomeStrata {
  readonly surface: number;
  readonly subsoil: number;
  readonly deep: number;
}

/**
 * Colori per bioma, in ordine di `BIOME`.
 *
 * La palette resta quella del motore: 32 slot esatti, fissati dall'uniform
 * `vec3[32]`. Non ci sono indici nuovi da aggiungere, quindi il terreno riusa
 * gli slot esistenti e questa tabella e' l'unico posto dove si legge quale
 * tinta fa cosa.
 */
export const BIOME_STRATA: readonly BiomeStrata[] = [
  // ocean — sabbia bagnata sul fondale
  { surface: PALETTE_SLOTS.stoneWarm, subsoil: PALETTE_SLOTS.stoneDark, deep: PALETTE_SLOTS.stoneDeep },
  // beach — sabbia asciutta, la piu' chiara del gruppo `stone`
  { surface: PALETTE_SLOTS.stone, subsoil: PALETTE_SLOTS.stoneWarm, deep: PALETTE_SLOTS.stoneDeep },
  // plain — erba su terra
  { surface: PALETTE_SLOTS.grass, subsoil: PALETTE_SLOTS.wood, deep: PALETTE_SLOTS.stoneDeep },
  // forest — erba scura su terra
  { surface: PALETTE_SLOTS.grassDark, subsoil: PALETTE_SLOTS.wood, deep: PALETTE_SLOTS.stoneDeep },
  // hill — erba chiara su sabbia compatta
  { surface: PALETTE_SLOTS.grassLight, subsoil: PALETTE_SLOTS.stoneWarm, deep: PALETTE_SLOTS.stoneDeep },
  // rock — il gruppo `concrete` fa sia il cemento della citta' sia la roccia nuda
  { surface: PALETTE_SLOTS.concreteLight, subsoil: PALETTE_SLOTS.concrete, deep: PALETTE_SLOTS.stoneDeep },
];

/** Acqua: chiara in superficie, scura in profondita'. */
export const WATER_IDS = {
  surface: PALETTE_SLOTS.water,
  deep: PALETTE_SLOTS.waterDeep,
} as const;

/**
 * Parametri delle decorazioni voxel. Le probabilita' sono per cella 12x12.
 *
 * Un albero e' *contenuto*, non terreno: sta sul reticolo fine da un voxel come
 * gli edifici, e non su quello da `TERRAIN.cellSize`. La sua cella qui sotto e'
 * quindi una cosa diversa dal cubo di terreno — e' il passo con cui si
 * spaziano gli alberi, non la grana con cui sono fatti.
 */
export const TREE_DECOR = {
  /**
   * Raggio massimo della chioma; definisce anche l'anello valutato dai blocchi.
   *
   * Vale `2 * ring + jitterSize <= cellSize`: cosi' la chioma piu' larga resta
   * dentro la sua cella comunque cada il jitter, e due alberi vicini non si
   * compenetrano mai. Nessun profilo di `TREE_SHAPES` puo' superarlo — se un
   * giorno servisse una chioma piu' larga va allargata prima la cella.
   */
  ring: 4,
  cellSize: 12,
  /**
   * Posizioni interne per asse, a passo di un voxel.
   *
   * Quattro per asse fanno sedici disposizioni per cella contro le quattro di
   * prima. Non e' varieta' per sport: con chiome larghe il doppio, una griglia
   * di alberi tutti sul medesimo scarto si legge come carta da parati. Quattro
   * e non cinque perche' e' quanto lascia l'invariante qui sopra.
   */
  jitterSize: 4,
  /**
   * Densita' per bioma: niente alberi su oceano, spiaggia e roccia.
   *
   * Non cambia con la scala: la cella ha quattro volte l'area di prima e ospita
   * un albero quattro volte piu' largo in pianta, quindi la frazione di suolo
   * coperta da chioma resta quella calibrata.
   */
  density: [0, 0, 0.18, 0.62, 0.34, 0] as const,

  /**
   * Frazione dei voxel sull'ultimo anello di un livello di chioma che cade.
   *
   * E' cio' che toglie la geometria alla chioma. Il taglio di Manhattan da solo
   * produce rombi e ottagoni esatti, e a raggio quattro un ottagono esatto si
   * legge come un solido, non come un albero: mangiando a caso il bordo la
   * silhouette torna irregolare senza aggiungere ne' forme dedicate ne' voxel.
   */
  edgeErosion: 0.45,

  /**
   * Scostamento laterale massimo di un livello di chioma rispetto al tronco.
   *
   * Un livello si sposta solo di quanto avanza fra il suo raggio e quello della
   * specie, quindi l'ingombro dichiarato resta vero e due chiome vicine non si
   * toccano lo stesso. E' quel che basta perche' una chioma penda da un lato
   * invece di essere un solido di rotazione perfetto.
   */
  maxLean: 1,
} as const;

/**
 * Un livello di chioma: un disco orizzontale di foglie.
 *
 * `radius` e' il mezzo lato del quadrato, `cut` la distanza di Manhattan
 * massima ammessa al suo interno — e' quel numero, e non una forma dedicata, a
 * smussare gli angoli: `cut = radius` da' un rombo, `cut = 2 * radius` il
 * quadrato pieno, e i valori in mezzo tutte le vie di mezzo. `tone` indicizza
 * le tinte della specie.
 */
export interface TreeCanopyLevel {
  readonly radius: number;
  readonly cut: number;
  readonly tone: number;
}

/** Profilo completo di una specie: tronco piu' chioma impilata dal basso. */
export interface TreeShape {
  /** Altezza del tronco come `[minimo, alternative]`: una estrazione del PRNG. */
  readonly trunk: readonly [number, number];
  /**
   * Di quanti livelli la chioma scende ad avvolgere il tronco.
   *
   * Deve restare minore di `trunk[0]`, altrimenti la chioma comincerebbe sotto
   * la quota del suolo e scaverebbe la colonna che la sostiene.
   */
  readonly sink: number;
  /** Tinte della chioma, dalla piu' scura alla piu' chiara. */
  readonly tones: readonly number[];
  /** Livelli dal basso verso l'alto; la lunghezza e' l'altezza della chioma. */
  readonly canopy: readonly TreeCanopyLevel[];
}

/**
 * Catalogo delle specie, nell'ordine di `TREE_SPECIES` in `decor.ts`.
 *
 * La chioma si schiarisce salendo: e' quanto basta a farla leggere come volume
 * invece che come blocco unico, e non costa niente perche' il colore vive
 * nell'uniform di palette. Il raggio della specie non e' dichiarato — si ricava
 * dal massimo dei suoi livelli, cosi' una riga sbagliata non puo' mentire al
 * generatore su quanto largo sia l'anello da valutare.
 */
export const TREE_SHAPES: readonly TreeShape[] = [
  // Conifera: guglia a piani sfalsati, il classico abete a gradoni. I livelli
  // larghi alternati agli stretti sono cio' che da' la silhouette dentellata —
  // e con quattro raggi disponibili invece di due i gradoni sono davvero
  // gradoni, non tre scalini contati.
  {
    trunk: [9, 4],
    sink: 6,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass, PALETTE_SLOTS.grassLight],
    canopy: [
      { radius: 4, cut: 4, tone: 0 },
      { radius: 4, cut: 5, tone: 0 },
      { radius: 3, cut: 4, tone: 0 },
      { radius: 4, cut: 4, tone: 0 },
      { radius: 3, cut: 3, tone: 0 },
      { radius: 3, cut: 4, tone: 1 },
      { radius: 2, cut: 4, tone: 1 },
      { radius: 3, cut: 3, tone: 1 },
      { radius: 2, cut: 3, tone: 1 },
      { radius: 2, cut: 2, tone: 2 },
      { radius: 1, cut: 2, tone: 2 },
      { radius: 0, cut: 0, tone: 2 },
    ],
  },
  // Latifoglia: chioma tonda e piena, la piu' voluminosa delle tre. Il ventre
  // sta a `cut: 7` su raggio 4, cioe' quasi il quadrato pieno: e' la sola via
  // per una sfera, perche' il rombo a quella scala legge come un ottaedro.
  {
    trunk: [8, 5],
    sink: 4,
    tones: [PALETTE_SLOTS.grassDark, PALETTE_SLOTS.grass, PALETTE_SLOTS.grassLight],
    canopy: [
      { radius: 3, cut: 4, tone: 0 },
      { radius: 4, cut: 5, tone: 0 },
      { radius: 4, cut: 6, tone: 1 },
      { radius: 4, cut: 7, tone: 1 },
      { radius: 4, cut: 7, tone: 1 },
      { radius: 4, cut: 6, tone: 1 },
      { radius: 4, cut: 5, tone: 2 },
      { radius: 3, cut: 4, tone: 2 },
      { radius: 2, cut: 3, tone: 2 },
      { radius: 1, cut: 2, tone: 2 },
    ],
  },
  // Autunnale: stessa scala della latifoglia ma piu' schiacciata, e in caldo.
  {
    trunk: [8, 4],
    sink: 4,
    tones: [PALETTE_SLOTS.metalRust, PALETTE_SLOTS.brickLight, PALETTE_SLOTS.metalBrass],
    canopy: [
      { radius: 3, cut: 5, tone: 0 },
      { radius: 4, cut: 6, tone: 0 },
      { radius: 4, cut: 7, tone: 1 },
      { radius: 4, cut: 7, tone: 1 },
      { radius: 4, cut: 6, tone: 1 },
      { radius: 3, cut: 5, tone: 2 },
      { radius: 2, cut: 3, tone: 2 },
      { radius: 1, cut: 2, tone: 2 },
    ],
  },
];

/**
 * Tinte piatte del toggle "colora per bioma" della scena di debug. Servono solo
 * a leggere le fasce a colpo d'occhio, non a fare bella figura.
 */
export const BIOME_DEBUG_IDS: readonly number[] = [
  PALETTE_SLOTS.glassDeep, //     ocean  — blu pieno
  PALETTE_SLOTS.metalBrass, //    beach  — giallo
  PALETTE_SLOTS.grassPale, //     plain  — verde chiaro
  PALETTE_SLOTS.grassDark, //     forest — verde scuro
  PALETTE_SLOTS.metalRust, //     hill   — arancio
  PALETTE_SLOTS.concretePale, //  rock   — grigio chiaro
];
