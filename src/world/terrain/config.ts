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
  warpAmount: 0.18,
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
  warpDetail: 0.06,
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
  // --- Deformazione della sagoma ------------------------------------------

  /**
   * Le armoniche che deformano il raggio di un rilievo o di una conca.
   *
   * Un'ellisse esatta si riconosce a colpo d'occhio, e su un lago si riconosce
   * anche da lontano: lo specchio e' l'unica superficie dell'isola senza grana
   * ne' terrazzamento, quindi il suo bordo e' l'unica curva che si legga per
   * intero. La deformazione della maschera (`warpAmount`) non lo aiuta — lavora
   * su lunghezze d'onda di seicento voxel, mentre un laghetto ne misura
   * cinquanta.
   *
   * Poche armoniche in funzione dell'angolo bastano: due ondulazioni piu' tre
   * non hanno assi di simmetria, e con la fase estratta dal seme ogni elemento
   * ha la propria sagoma. Non e' rumore, ed e' deliberato: di un rumore il
   * gradiente si sa solo misurandolo, di una somma di armoniche si sa in forma
   * chiusa (`SHAPE_WARP_LIPSCHITZ` in `outline.ts`), e senza quel numero la
   * deformazione spenderebbe di nascosto il margine di Lipschitz.
   *
   * **L'ampiezza si paga in pendenza, non in raggio**, ed e' la deformazione
   * che si spegne sul bordo (`outline.ts`) a renderlo possibile: la sagoma non
   * sporge dal cerchio che dichiara, quindi non chiede al sito una spianata piu'
   * larga. Alzare queste ampiezze alza le sponde dei laghi e i fianchi delle
   * colline, e prima o poi il margine di Lipschitz del campo; non toglie siti.
   */
  shapeWarp: [
    { harmonic: 2, amplitude: 0.12 },
    { harmonic: 3, amplitude: 0.06 },
  ],

  /**
   * Sale della sagoma: la deformazione ha un flusso suo, non quello che sceglie
   * dove stanno gli elementi.
   *
   * Estraendola dallo stesso PRNG, ogni fase consumata slittava tutte le
   * estrazioni successive: ritoccare un'ampiezza qui spostava le colline e
   * cambiava quali siti ospitano un lago, cioe' l'isola intera. Con un flusso
   * per elemento la sagoma resta l'unica cosa che cambia — ed e' anche
   * l'affermazione che si vuole poter fare, «e' la stessa isola di prima, con
   * una forma in pianta diversa».
   */
  shapeWarpSalt: 0x5a_60_ba_5a,

  // --- Lobi della costa ---------------------------------------------------

  /** Quanti lobi si aggiungono all'isola base. */
  lobeCount: [2, 2],

  /** Distanza del centro del lobo dal centro dell'isola, in frazioni di raggio. */
  lobeDistance: [0.42, 0.16],

  /** Raggio del lobo, in frazioni del raggio dell'isola. */
  lobeRadius: [0.34, 0.2],

  /**
   * Frazione del raggio di un lobo che emerge davvero.
   *
   * **Il raggio di un lobo non e' la sua costa**, ed e' l'errore che teneva i
   * lobi invisibili: la caduta a coseno arriva a zero, quindi la terra finisce
   * dove la maschera scende sotto la soglia di emersione, che e' intorno a meta'
   * del raggio nominale. Vincolando `distanza + raggio` si tenevano i lobi cosi'
   * dentro che la loro terra emersa non usciva mai dalla costa dell'isola base:
   * aggiungevano rilievo all'interno e non una penisola.
   */
  lobeEmerged: 0.5,

  /**
   * Quanto lontano puo' arrivare la terra di un lobo, `distanza + emersa`.
   *
   * La costa vera dell'isola base cade intorno a 0,68 del raggio — la' dove la
   * maschera scende sotto la soglia di emersione — quindi un lobo che arriva a
   * 0,86 sporge dalla costa di quasi un quinto del raggio. Il bordo della
   * region resta all'asciutto lo stesso: li' la maschera del lobo vale qualche
   * centesimo, e nemmeno il rumore massimo la porta sopra `seaLevel`.
   */
  lobeReach: 0.86,

  /** Pendenza massima concessa al fianco di un lobo. */
  lobeSlope: 0.45,

  /** Frazione di passo angolare di cui un lobo puo' spostarsi dal suo settore. */
  lobeJitter: 0.55,

  lobeSalt: 0x10b0_5eed,

  // --- Rilievi interni ----------------------------------------------------

  /** Quante cupole spostano le vette fuori dal centro. */
  moundCount: [2, 2],

  moundDistance: [0.16, 0.3],
  moundRadius: [0.24, 0.14],

  /**
   * Pendenza massima concessa al fianco di un rilievo.
   *
   * E' il numero che decide se le colline si vedono: su un'isola di raggio 256
   * e rilievo 76, una cupola larga un quarto sale di una dozzina di voxel —
   * sei celle di terreno sopra cio' che la circonda, quanto basta perche' la
   * fascia di bioma cambi e la vetta non sia piu' una sola.
   *
   * Come `basinSlope`, ha assorbito il costo della deformazione invece di
   * scaricarlo sull'ampiezza: a pendenza ferma le colline sarebbero scese di un
   * quinto, e una collina piu' bassa e' esattamente cio' che questo numero
   * esiste per evitare. Un rilievo paga il tetto in forma chiusa e non il
   * fattore misurato — sale su tutto il raggio, quindi non ha una fascia
   * stretta su cui misurare — e se lo puo' permettere: il fianco di una cupola
   * resta la meta' della sponda di un lago.
   */
  moundSlope: 0.28,

  moundJitter: 0.5,

  moundSalt: 0x4001_dd05,

  // --- Conche dei laghi ---------------------------------------------------

  /** Quanti specchi d'acqua interni si tenta di aprire. */
  basinCount: [1, 1],

  /**
   * Quanti siti si esaminano prima di rinunciare.
   *
   * Sono tanti perche' quello che si cerca e' raro: una spianata larga una
   * cinquantina di colonne su un'isola che e' quasi tutta fianco. Costano poco —
   * cinque campioni del campo ciascuno, e solo i pochi che passano il filtro di
   * pianura arrivano ai conti veri — e si pagano una volta per `HeightField`,
   * non una volta per blocco.
   */
  basinCandidates: 1536,

  /**
   * Pendenza massima del sito e distanza su cui si misura.
   *
   * E' solo un filtro d'ingresso, non il criterio: a decidere davvero e'
   * `fitRadius`, che pero' costa una cinquantina di campioni. Questo ne costa
   * quattro e toglie di mezzo i siti che non hanno speranza.
   */
  basinFlatSlope: 0.2,
  basinFlatSpan: 24,

  /**
   * Fascia radiale in cui si cercano i siti, `[minimo, ampiezza]`.
   *
   * **E' la meta' interna dell'isola, e la ragione e' geometrica.** Una conca
   * chiusa esiste solo dove il terreno e' quasi piano su tutto il suo raggio, e
   * su una cupola la pendenza radiale cresce col raggio: verso il centro tende a
   * zero, sul fianco vale gia' piu' di quanto qualunque raccordo possa
   * assorbire. Cercando su tutto il disco, di otto isole di prova ne prendevano
   * un lago tre; cercando qui, sei. Il lago che ne esce sta in quota, ed e'
   * anche il posto giusto: non toglie alla citta' la pianura costiera.
   */
  basinReach: [0.04, 0.34],

  /**
   * Quota del sito sopra il livello del mare, `[minimo, massimo]`.
   *
   * E' la fascia in cui un lago ha senso. Sotto il minimo il fondo arriverebbe
   * al mare e quello che si apre e' una baia; sopra il massimo si e' in vetta,
   * dove il bordo imposto taglierebbe la cima.
   */
  basinRimAbove: [10, 46],

  /**
   * Quanto il fondo del lago scende sotto il bordo che lo circonda.
   *
   * E' una quota **relativa**, ed e' cio' che libera i laghi dalla riva: un
   * fondo definito rispetto al livello del mare puo' stare solo dove il terreno
   * e' gia' quasi a livello del mare, cioe' in una striscia larga una decina di
   * colonne dove nessuna conca si chiude. Sei voxel — tre celle — sono anche il
   * dislivello che la sponda copre in una trentina di colonne restando sotto
   * `basinSlope`, cioe' un laghetto e non un cratere.
   */
  basinDrop: 6,

  /**
   * Profondita' dell'acqua sopra il fondo.
   *
   * Due voxel, cioe' una cella: e' la profondita' che tiene tutto lo specchio
   * dentro `shallowDepth` e quindi dentro `WATER_CLASS.shallow` — increspatura
   * fitta e fondale che si vede sotto. Un fondo piu' basso darebbe a una pozza
   * di trenta colonne l'onda lunga del mare aperto.
   */
  basinWaterDepth: 2,

  /**
   * Pendenza massima concessa alla sponda.
   *
   * E' l'unico numero di `LANDFORM` piu' alto della pendenza media dell'isola,
   * e deve esserlo: una conca si chiude solo se la sua sponda scende **piu'
   * ripida** del fianco che la ospita, altrimenti il bordo che impone e il
   * terreno che trova non si raccordano e il punto fisso del raggio diverge. Il
   * conto si chiude dove la pendenza locale sta sotto
   * `basinSlope * (1 - basinBank) / (pi/2)`, cioe' intorno a 0,2.
   *
   * E' anche il numero che si avvicina di piu' al tetto di Lipschitz, ed e'
   * l'unico posto in cui succede: la sponda di un lago **e'** una scarpata, e
   * il campo la porta perche' vale meno di una cella su due colonne.
   *
   * **E' salito con la deformazione, e non poteva fare altrimenti.** La sponda
   * deformata scende un decimo piu' ripida di quella nominale, e quel decimo si
   * paga in pendenza oppure in raggio. In raggio non si poteva: la conca
   * nascerebbe piu' larga, e piu' larga vuol dire una spianata che l'isola non
   * ha — misurato sui seed di riferimento, i laghi passano da sette su otto a
   * cinque, e quello del seed 1337 sparisce. In pendenza si', perche' li' il
   * margine c'e': misurato sul campo, il dislivello peggiore fra due colonne
   * resta a 0,70 contro il voxel intero che il terreno a celle non tollera.
   *
   * E' anche il motivo per cui non basta scriverci un numero piu' alto: la
   * sponda vera vale `basinSlope` esatti perche' `planBasins` divide per il
   * fattore misurato della sagoma. Chi alza questo, alza la scarpata.
   */
  basinSlope: 0.72,

  /**
   * Le tre fasce della conca, in frazioni del raggio: fondo piatto fino a
   * `basinPlateau`, sponda fino a `basinBank`, raccordo fino a 1.
   *
   * Il fondo piatto e' la superficie d'acqua: senza, lo specchio si riduce al
   * punto centrale della conca. Le altre due si dividono quello che resta, e la
   * divisione e' un compromesso dichiarato: sponda corta vuol dire conca stretta
   * ma sponda ripida, raccordo corto vuol dire rifiutare i siti in pendenza.
   * A meta' ciascuna il lago si posa dove il terreno sta sotto 0,2 di pendenza,
   * che e' la condizione meno rara delle due.
   */
  basinPlateau: 0.25,
  basinBank: 0.5,

  /** Corone su cui si misura il salto che il raccordo deve assorbire. */
  basinBlendRings: [0.8, 0.95],

  /**
   * Allungamento della conca: quanto il semiasse maggiore supera il minore.
   *
   * E' la meta' della sagoma che le armoniche non sanno dare. Una
   * deformazione angolare fa insenature e promontori ma lascia il lago
   * *centrato*, mentre uno specchio naturale ha quasi sempre una direzione —
   * segue l'avvallamento che lo ospita. L'orientamento e' estratto a parte,
   * altrimenti tutti i laghi dell'isola punterebbero a est.
   *
   * Non costa pendenza: a scendere piu' ripida e' la sponda sul lato **corto**,
   * ed e' il semiasse minore quello che il budget vincola. Costa ingombro, e
   * l'ingombro e' la cosa cara — a differenza delle armoniche, un allungamento
   * porta il bordo della conca piu' in la' davvero, quindi chiede al sito una
   * spianata piu' lunga. Un quinto e' quanto se ne puo' chiedere restando ai
   * sette laghi su otto seed che l'isola tonda gia' dava.
   */
  basinStretch: [1, 0.2],

  /**
   * Raggio massimo di una conca, in frazioni del raggio dell'isola — sul
   * semiasse maggiore, che e' l'ingombro vero.
   *
   * E' salito con l'allungamento e non con le armoniche: il semiasse minore
   * resta quello di prima — `basinSlope` ha assorbito la deformazione — ma
   * quello maggiore lo supera fino a `basinStretch`, e il tetto deve lasciargli
   * posto o le conche allungate verrebbero scartate tutte. La corona resta
   * all'asciutto per la sua ragione di sempre: dove il terreno scende troppo,
   * il salto che il raccordo dovrebbe assorbire cresce con il raggio quanto la
   * fascia che lo assorbe, e `fitRadius` rinuncia.
   */
  basinMaxRadius: 0.38,

  /**
   * Passate del punto fisso che trova il raggio della conca.
   *
   * Poche bastano perche' la successione e' monotona e parte da sotto; chi non
   * ha finito all'ultima sta su un fianco, dove il salto da raccordare cresce
   * col raggio quanto la fascia che dovrebbe assorbirlo, e va scartato invece
   * che allargato.
   */
  basinFitPasses: 4,

  /** Distanza minima fra due conche, in multipli della somma dei raggi. */
  basinSpacing: 1.15,

  /** Sonde per corona di controllo. */
  basinShoreProbes: 12,

  basinSalt: 0x0acc_a1a0,
} as const;

/**
 * Il gradino con cui il terreno sale, a seconda di quanto e' gia' in alto e di
 * che stratificazione ha la roccia sotto quella cella.
 *
 * **La cella non e' il gradino.** `cellSize` e' la grana in pianta — quanto e'
 * largo un cubo — e fino alla 4.x era anche il passo in quota, cioe' l'unico
 * dislivello che due celle contigue potessero avere. Ne usciva un'isola a curve
 * di livello tutte uguali: leggibile, ma senza montagne, perche' una montagna
 * non e' un pendio con piu' scalini, e' un pendio con scalini **piu' alti**.
 *
 * Il passo cresce percio' con la quota, e cresce con le fasce di bioma: in media
 * due voxel sulla pianura, quattro nella foresta, sei sulla collina, otto sulla
 * roccia. La costa e la pianura restano quelle di prima — `fromHeight` coincide
 * con `beachMaxHeight` — perche' e' li' che la citta' cresce e un dirupo in mezzo
 * a un isolato sarebbe un dispetto, non un paesaggio.
 *
 * **Ma una scala sola da' un muro solo.** Se l'alzata e' funzione della sola
 * quota, tutte le celle della stessa fascia ne condividono una, e siccome due
 * celle contigue cadono su pedate contigue il salto vale *esattamente
 * un'alzata*: ogni parete della fascia esce alta uguale, per tutto il suo
 * sviluppo e su tutta l'isola. Il muro uniforme non era un difetto accanto
 * all'invariante, **era** l'invariante. Le scale sono percio' `beddings`, con
 * alzate diverse alle stesse quote, e un campo in pianta dice quale tocca a ogni
 * cella: due celle contigue su scale diverse cadono su pedate che non si
 * corrispondono, e il salto varia dove varia la stratificazione.
 *
 * **Il campo continuo non si tocca.** Il vincolo di Lipschitz vale ancora: e' la
 * *quantizzazione* a fare il muro, non il rilievo. Ne segue la proprieta' che
 * tiene in piedi tutto il resto, e regge comunque siano scelte le due scale —
 * ogni scala posa su un multiplo di cella entro `maxStep` sotto la quota vera,
 * quindi due celle contigue distano meno di `maxStep` piu' il dislivello del
 * campo (sotto i due voxel, misurato in `heightField.test.ts`), e fra multipli
 * di cella quel totale vale `maxStep` esatti. La dimostrazione per esteso sta in
 * `terrace.ts`. Non c'e' nessun caso in cui il terreno si spezzi piu' di cosi',
 * e non serve un clamp per garantirlo.
 */
export const TERRACE = {
  /**
   * Sotto questa quota il passo resta la cella: la pianura non si terrazza.
   *
   * E' `beachMaxHeight` e non un numero suo: sopra quella soglia finisce la
   * spiaggia e comincia il rilievo, ed e' esattamente li' che ha senso che il
   * terreno cominci a spezzarsi. E' anche la quota sotto la quale tutte le
   * stratificazioni **coincidono**, quindi la pianura non dipende da quale
   * scala le tocchi.
   */
  fromHeight: 24,

  /**
   * Ogni quanti voxel di quota l'alzata media cresce di una cella.
   *
   * Otto, cioe' la stessa larghezza con cui `TERRAIN` divide roccia, collina e
   * foresta: il passo cambia dove cambia la fascia, e le due letture del rilievo
   * — il colore e la forma — raccontano la stessa storia invece di scavallarsi.
   */
  growth: 8,

  /**
   * Alzata massima, in voxel.
   *
   * Quattro celle. E' il muro piu' alto che l'isola sappia produrre da sola, ed
   * e' dichiarato qui perche' e' anche il numero che le opere di terra devono
   * poter colmare: sta largamente sotto `GRADING.maxWorksStep`, quindi un lotto
   * che nasce a cavallo di un ciglio costruisce il suo terrapieno invece di
   * essere rifiutato. `ROCK.bandHeight` ci e' agganciato: alzarlo allarga anche
   * le bande di grigio, e sono due decisioni diverse.
   */
  maxStep: 8,

  /**
   * Quante scale di quota esistono, cioe' quante stratificazioni diverse la
   * roccia dell'isola sa avere: fine, media, massiccia.
   *
   * **Tre e non di piu', perche' di piu' non ce ne stanno.** Le alzate sono
   * multipli di cella fra `cellSize` e `maxStep`, cioe' quattro valori in tutto,
   * e un ventaglio largo tre ne copre gia' la fascia utile a ogni quota. Una
   * quarta stratificazione dovrebbe ripetere l'alzata di un'altra, e due scale
   * con lo stesso passo sono la stessa scala.
   */
  beddings: 3,

  /**
   * Di quante celle la stratificazione piu' massiccia supera la propria tacca di
   * schedule. La piu' fine sta sotto di altrettanto.
   *
   * **Un intero di celle e non una frazione**, perche' e' cio' che rende
   * l'affermazione verificabile: dove lo schedule dice quattro escono due,
   * quattro o sei, e mai un valore che non sia un multiplo di cella. Uno solo:
   * lo scarto e' quello fra due fasce contigue, quindi il fianco resta quello
   * dichiarato e cambia grana, non identita'.
   */
  spread: 1,

  /**
   * Passo delle due ottave del campo che sceglie la stratificazione, in celle, e
   * quanto pesa la lunga.
   *
   * Due e non una, e fanno due mestieri diversi. La **lunga** da' carattere a un
   * versante intero — questo fianco sale a gradoni larghi, quello accanto a
   * scalini — ed e' la scala a cui una stratificazione si legge come tale. La
   * **corta** spezza il singolo ciglio lungo il suo sviluppo: e' quella che
   * toglie alla parete l'altezza costante, che era la cosa che la faceva
   * sembrare disegnata. Con la sola lunga ogni scarpata resta alta uguale per
   * tutta la sua corsa; con la sola corta il terreno si sgrana e a questa scala
   * si legge come sporcizia invece che come roccia.
   *
   * E' anche cio' che ha sostituito il disturbo di quota che scuoteva la cella
   * prima di posarla: il ciglio di una data quota cade a raggi diversi dove la
   * stratificazione cambia, quindi le curve di livello si spezzano da se'. Un
   * disturbo in quota, oltre a non servire piu', si mangerebbe tutto il margine
   * su cui poggia la dimostrazione del tetto.
   */
  beddingSpan: 20,
  beddingBreak: 5,
  beddingMix: 0.6,

  /**
   * Quanto il campo viene allargato attorno alla meta' prima di scegliere la
   * stratificazione.
   *
   * **Senza, meta' delle scale non verrebbe mai usata.** Il rumore di valore e'
   * una miscela bilineare di quattro angoli, e mescolarne due ottave stringe
   * ancora: misurato sull'isola di riferimento, il campo grezzo sta fra 0,25 e
   * 0,74 per il novanta per cento delle celle, quindi le due stratificazioni
   * centrali si prendevano il 91% dell'isola e le estreme il 9%. Le scale erano
   * quattro sulla carta e due sul terreno, ed e' esattamente la varieta' che si
   * era andati a cercare. Due allarga quell'intervallo su tutto `[0, 1)`; le code
   * che ne escono si appiattiscono sulle estreme, che e' il verso giusto — una
   * stratificazione estrema e' una zona, non un puntino.
   */
  beddingContrast: 2,

  /**
   * Le scale **non portano il seme dell'isola**: sono il repertorio della
   * grammatica del terreno — fine, media, massiccia — uguale ovunque e tabulabile
   * una volta sola. Il seme entra solo da qui, cioe' da quale scala tocchi a
   * quale posto.
   */
  beddingSalt: 0x7e_44_a5_0e,
} as const;

/**
 * I grigi della roccia: uno strato per gradone.
 *
 * **La roccia e' l'unico bioma che si guarda di taglio prima che dall'alto.**
 * Sopra la fascia della collina l'alzata vale otto voxel, quindi di una cella si
 * vede piu' parete che pianta, e una parete di un grigio solo e' una campitura
 * alta quattro cubi — lo stesso difetto che le erbette tolgono al prato, alla
 * scala della montagna.
 *
 * **Il passo e' l'alzata, non un numero suo.** Uno strato e' orizzontale e si
 * vede dove il terreno lo taglia; il terreno lo taglia dove si terrazza, quindi
 * il disegno del colore e quello dei gradoni sono la stessa cosa. Una banda che
 * non coincidesse con il gradino cadrebbe a meta' parete, e il taglio
 * orizzontale in mezzo al muro racconterebbe una quota che li' non c'e'.
 *
 * **Non c'e' variazione in pianta, ed e' deliberato.** Il primo tentativo
 * spezzava la banda con delle vene di rumore: due grigi affiancati sulla stessa
 * quota non raccontano niente, perche' su una roccia significherebbero due
 * strati diversi. Un pianoro e' di un grigio solo perche' *lo e'*; a dargli
 * varieta' ci sono i sassi della copertura e `TERRACE.jitter`, che rompe la
 * regolarita' del ciglio invece di quella del colore.
 */
export const ROCK = {
  /**
   * I grigi, dal piu' chiaro al piu' scuro.
   *
   * Sono quelli del gruppo `concrete` piu' il primo degli asfalti: la roccia
   * nuda e il cemento della citta' condividono la rampa da sempre, e questo e'
   * l'unico posto in cui il terreno la percorre invece di prenderne un gradino.
   */
  tones: [
    PALETTE_SLOTS.concretePale,
    PALETTE_SLOTS.concreteLight,
    PALETTE_SLOTS.concrete,
    PALETTE_SLOTS.asphaltDark,
  ] as const,

  /**
   * Quanti grigi fa la superficie. Il sottosuolo prende sempre il successivo,
   * quindi la rampa e' lunga uno in piu': cosi' la fascia di superficie resta
   * il bordo chiaro della parete che la porta, su ogni banda e non solo su una.
   */
  surfaceTones: 3,

  /** Voxel di quota per banda: l'alzata della roccia, cioe' un gradone. */
  bandHeight: TERRACE.maxStep,

} as const;

/**
 * Erbette, fiori e sassi: una cella appoggiata sopra la superficie.
 *
 * **E' l'unica decorazione del terreno che non e' un oggetto.** Un albero ha una
 * cella sua, un'origine e un ingombro da non far collidere; qui non c'e' niente
 * da tenere separato — la copertura si decide per colonna, con un hash e nessun
 * PRNG da far avanzare, e vive interamente dentro la colonna che la porta. Da
 * qui il fatto che viaggia come un byte per colonna nel `ColumnBlock` invece che
 * come un record.
 *
 * Quella cella non e' un cubo: il mondo ci scrive un marcatore, e lame, steli e
 * sassi li disegna il mesher in prismi da 1/16. Qui restano le due sole
 * decisioni che sono del terreno — quanta ne cresce e di che tinta.
 */
export const GROUND_COVER = {
  /**
   * Probabilita' per colonna, in ordine di `BIOME`.
   *
   * **Sono scese di circa il quaranta per cento da quando la copertura ha una
   * forma.** Un cubo pieno grande un quarto della faccia di una cella di terreno
   * non si legge come un ciuffo a nessuna densita': si legge come un coriandolo,
   * e l'unico modo di farne un prato era metterne tanti. Tre lame raccontano
   * l'erba da sole, quindi la densita' e' tornata a fare il suo mestiere — dire
   * quanto e' fitto il prato invece di supplire alla forma che mancava.
   */
  density: [0, 0.012, 0.03, 0.034, 0.03, 0.02] as const,

  /**
   * Quota della copertura fra quelle possibili, per bioma: la seconda voce e' la
   * frazione di copertura che diventa fiore (o sasso, in quota) invece che erba.
   *
   * Sulla spiaggia e sulla roccia l'erba non cresce, e li' la frazione vale 1:
   * tutto quello che compare e' un sasso.
   */
  accentShare: [0, 1, 0.22, 0.12, 0.3, 1] as const,

  /**
   * Tinta dell'erbetta per bioma: sempre un tono piu' chiaro della superficie
   * che la porta, o non si vedrebbe. Ignorata dove `accentShare` vale 1.
   */
  grassTone: [
    0, //                          ocean
    0, //                          beach
    PALETTE_SLOTS.grassPale, //    plain  — su `grass`
    PALETTE_SLOTS.grassLight, //   forest — su `grassDark`
    PALETTE_SLOTS.grassPale, //    hill   — su `grassLight`
    0, //                          rock
  ] as const,

  /** Tinta dell'accento: conchiglia sulla riva, fiore in pianura, sasso in quota. */
  accentTone: [
    0, //                            ocean
    PALETTE_SLOTS.concreteWhite, //  beach
    PALETTE_SLOTS.metalBrass, //     plain
    PALETTE_SLOTS.brickLight, //     forest
    PALETTE_SLOTS.stone, //          hill
    // Il sasso sulla roccia e' il piu' chiaro della palette e non il primo
    // grigio della rampa: da quando la parete percorre `ROCK.tones`, un
    // `concretePale` capitava sulla banda del proprio colore e spariva.
    PALETTE_SLOTS.concreteWhite, //  rock
  ] as const,

  /**
   * Tinta del solco coltivato, per bioma della colonna che lo porta.
   *
   * **Non e' una copertura spontanea e non ha una densita'.** Erba, fiori e sassi
   * escono da un hash per colonna; un solco lo posa un lotto agricolo, che sa
   * dove comincia e dove finisce. Qui c'e' solo la tinta, per la stessa ragione
   * per cui c'e' quella dell'erbetta: la tabella derivata di `groundcover.ts` e'
   * indicizzata dalla **palette del terreno**, cosi' il mesher legge cosa cresce
   * dove senza sapere che esistono i biomi ne' i lotti.
   *
   * L'ottone in pianura non e' un vezzo: e' la stessa tinta del fiore, cioe' il
   * solo tono caldo che la palette concede a un terreno verde, e a distanza
   * isometrica e' quello che legge come grano maturo. Sulla collina il verde
   * chiaro dice invece un raccolto ancora acerbo, che e' come stanno i campi in
   * quota. Spiaggia, roccia e oceano valgono 0: li' non si coltiva, e un lotto
   * non ci arriva perche' `plotPlan` non li ammette.
   */
  cropTone: [
    0, //                            ocean
    0, //                            beach
    PALETTE_SLOTS.metalBrass, //     plain  — su `grass`, grano maturo
    PALETTE_SLOTS.grassLight, //     forest — su `grassDark`
    PALETTE_SLOTS.grassPale, //      hill   — su `grassLight`
    0, //                            rock
  ] as const,

  /** Sale del seme: tiene la copertura scorrelata da alberi e sporgenze. */
  salt: 0x60_c0_4e_11,
} as const;

/**
 * Sporgenze di roccia: una lastra che esce dal ciglio e resta sospesa.
 *
 * **E' la prima cosa del terreno che non e' una colonna.** Tutto il resto
 * dell'isola e' una quota per (x, y) — e' cio' che rende la `TerrainMap` una
 * mappa 2D — mentre una sporgenza ha aria sotto, quindi non e' rappresentabile
 * come altezza. Vive percio' fuori dalla mappa, esattamente come ci vive un
 * albero: nel mondo voxel, e nel blocco come record.
 *
 * **Che abbia senso** e' un vincolo, non un auspicio: la lastra si aggancia alla
 * parete per un lato intero, lascia sotto di se' almeno una cella d'aria e sopra
 * di se' almeno una cella di parete. Il salto minimo che serve e' la somma delle
 * tre, e non e' dichiarato qui: lo deduce `LEDGE_MIN_DROP` in `ledges.ts`, cosi'
 * non c'e' un numero che possa raccontare una storia diversa dalla regola.
 */
export const LEDGE = {
  /**
   * Frazione dei cigli abbastanza alti che ne ricevono una.
   *
   * Sembra alta e non lo e': il salto minimo si raggiunge solo dove l'alzata
   * vale sei o otto voxel, cioe' sopra la fascia della collina, e li' i cigli
   * sono qualche centinaio di celle su un'isola intera. Un terzo di quelli
   * significa una sessantina di sporgenze in tutto, quasi tutte sullo stesso
   * versante — che e' come stanno le cenge vere, a filari interrotti e non
   * sparse a caso.
   */
  density: 0.32,

  /** Spessore della lastra e aria che le resta sotto, in voxel. */
  thickness: 2,
  clearance: 2,

  salt: 0x1e_d6_e5_00,
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
 * Il **catalogo della flora** — profili delle specie e chi cresce dove — sta in
 * `flora.ts`, non qui. E' l'unica deroga alla regola "i numeri del terreno in un
 * file solo", ed e' quella che l'ha resa sostenibile: fra i profili delle specie
 * e le densita' per bioma sono un terzo di questo file, e sono anche l'unica
 * parte che si tocca per ragioni di *aspetto* invece che di calibrazione.
 */

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
