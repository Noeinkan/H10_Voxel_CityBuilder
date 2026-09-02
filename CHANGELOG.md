# Changelog

Cosa è cambiato, dal più recente. Il *perché* delle scelte sta in
[README.md](README.md) e in [src/sim/README.md](src/sim/README.md); *dove sta
cosa* in [PROJECT_INDEX.md](PROJECT_INDEX.md); dove va il progetto in
[ROADMAP.md](ROADMAP.md).

Il progetto non è ancora versionato: ogni voce è un incremento, identificato dal
commit che lo chiude. Le voci descrivono il contenuto effettivo, che non sempre
coincide con il messaggio di commit.

Qui stanno **i tredici incrementi più recenti**; i precedenti sono archiviati in
[docs/changelog/](docs/changelog/), e li si trova per titolo da
[docs/changelog/README.md](docs/changelog/README.md). Un frammento di
`docs/pending/` si fonde sempre qui, mai in una scheda d'archivio.

---

## In corso — Revamp dei landmark: piu' ornati, piu' grandi, piu' stadi

- **Teatro, stadio e stazione crescono di sedime su sei stadi.** Il teatro va da
  14x10x14 a 34x22x44, lo stadio da 12x10x5 a 52x40x32 — la ricetta piu' larga
  del catalogo — e la stazione da 16x8x8 a 52x24x46. Lo stadio zero resta
  piccolo come oggi in tutte e tre: la megastruttura arriva quando il quartiere
  attorno c'e' gia'.
- **Le pile del viadotto sono archi, e non e' ornamento.** Una linea lunga
  cinquantadue voxel attraversa due carreggiate: con le pile piene sarebbe un
  muro che taglia il quartiere in due. Lo stesso vale per le quattro porte dello
  stadio, una per asse, e per il portale davanti al portico del teatro. E' la
  primitiva che rende ammissibili gli ingombri nuovi, non quella che li decora.
- **L'anello dello stadio si legge in tre fasce.** Arcata a terra, gradinate
  piene, parapetto traforato: e' il modo in cui un anfiteatro vero da' scala a un
  volume basso e larghissimo, e usa `colonnade` e `tracery` per quello per cui
  esistono — vuoto sotto un pieno, e aria *dentro* il muro.
- **La stazione e' uscita da `logistics.ts`.** Delle quattro forme lineari e'
  l'unica che sospende invece di appoggiare, ed e' diventata la piu' lunga del
  catalogo: lasciarla li' avrebbe portato quel file oltre le mille righe proprio
  mentre molo, traghetto e pista aspettano lo stesso trattamento.
- **Cinque esemplari sui ruoli grossi invece di tre.** Teatro, stadio e stazione
  ne hanno cinque: due teatri sulla stessa isola non devono somigliarsi, e la
  garanzia di leggibilita' resta strutturale — il tronco si disegna sempre, la
  variante si aggiunge sopra.
- **Il tetto di quad non si e' mosso.** Il chunk piu' pieno che il catalogo
  produce misura 8 360 quad su 16 384, lo stesso di prima dei tre revamp: uno
  stadio e' un anello cavo, e la finestra piu' densa resta quella della
  cattedrale. La regola misurata sul prototipo ha retto — cornici sulle sole
  torri, mai sugli scafi lunghi.

## In corso — Orografia con un carattere, e una flora che fa macchia

- **Un'isola ha un carattere, e sono due numeri estratti dal seed.** Fino a qui
  ogni isola aveva lo stesso impasto — stessa miscela di rumore, stessa
  proporzione fra piede e vetta — e a cambiare era soltanto dove cadevano le
  creste: misurate, le vette stavano tutte fra 52 e 69 voxel su un tetto di 80.
  `TERRAIN.crestMix` e `TERRAIN.summitLift` escono ora da un flusso loro e
  dicono *che tipo* di isola e' questa. Su quarantotto seed le vette vanno da 54
  a 75 e la roccia dal 10 al 29 per cento della terra emersa: una e' una collina
  boscosa, l'altra e' alpina.
- **I crinali vengono dal rumore ripiegato, e non costano gradiente.** Il simplex
  e' liscio in ogni direzione e sommato in ottave da' dune; `0,5 - |n|` ha il
  massimo lungo la curva in cui il rumore cambia segno, cioe' su una **linea**, e
  da li' escono crinali continui con i loro contrafforti. Il ripiegamento resta a
  mezza ampiezza apposta: cosi' conserva il modulo del gradiente, mentre la forma
  canonica `1 - 2|n|` lo raddoppia — provata, portava il dislivello peggiore fra
  due colonne da 0,69 a 0,94, fuori dal criterio di continuita' che tiene in
  piedi il terreno a celle. Si paga in altezza, e l'altezza la ridà l'espansione
  della vetta.
- **`summitLift` alza la montagna senza toccare la citta'.** Moltiplica per
  `1 + lift` la sola distanza da `summitKnee`, che a rilievo 76,8 cade dove la
  pianura finisce: costa, pianura e fascia edificabile restano identiche, e il
  fattore di pendenza vale `1 + lift` esatti e solo lassu'. L'intervallo
  attraversa lo zero perche' la varieta' deve venire dalla varianza e non da un
  paesaggio medio piu' alto — un seed puo' anche prendersi un'isola dolce, e la
  compressione non costa pendenza perche' ne toglie.
- **`maxHeight` ha cambiato mestiere.** Valeva il rilievo dell'isola, ed era la
  stessa cosa detta due volte: adesso il rilievo lo detta il raggio via
  `maxReliefSlope`, e il tetto assoluto e' soltanto quello che deve contenere
  l'espansione piu' alta. La disuguaglianza fra le costanti la verifica un test,
  perche' se cade non lancia niente — la cima si appiattisce dentro `cellGrid`, e
  quello e' il difetto piu' difficile da vedere di tutti.
- **La frequenza di base e' scesa a 1/440 per comprare il margine speso.** Il
  gradiente del fbm e' proporzionale alla frequenza: allungare la lunghezza
  d'onda di un settimo restituisce un settimo del budget di Lipschitz, e quel
  settimo fa la differenza fra un'isola dolce e una alpina invece di increspare
  un versante. Misurato su quarantotto seed, il dislivello peggiore fra due
  colonne e' **sceso** da 0,79 a 0,76 nonostante l'espansione della vetta.
- **Quattro specie nuove, e una di loro sta sulla spiaggia.** Betulla — l'unica
  che si distingue per il **tronco** invece che per la sagoma, ed e' l'unica
  differenza di specie che si legge dentro un bosco fitto, dove le chiome si
  toccano e la silhouette sparisce —, palma, cipresso e albero morto. La spiaggia
  ha smesso di essere spoglia: un albero non toglie edificabilita' a nessuno, e
  la frangia costiera e' l'unica fascia dell'isola che si vede da ogni
  inquadratura. `TreeShape.bark` e' il campo che rende possibile la prima.
- **Il bosco cresce a macchie, non a sale e pepe.** Due alberi su tre prendono la
  specie del proprio boschetto — un riquadro di sei celle, con una specie estratta
  dagli stessi pesi del bioma — e il terzo resta il suo, che e' cio' che sfuma il
  bordo fra due macchie invece di lasciarlo rettilineo. Non aggiunge specie dove
  non crescerebbero: ne cambia solo la disposizione.
- **`treeTopIn`: il ritaglio di un albero non e' un riquadro.** Il livello di
  chioma piu' largo non e' quello piu' alto — una palma ha le fronde a raggio
  quattro e la punta a raggio due — quindi un albero che sfiora il blocco con la
  sola base ci scrive fin dove arriva la base, e il chunk allocato per la punta
  restava vuoto. La quota si ottiene ridisegnando l'albero verso un sink che
  conta: le estrazioni di pendenza e di erosione vengono dalla posizione e non da
  chi chiama, quindi il conto e' quello vero e non un maggiorante.

## In corso — Revamp dei landmark: piu' ornati, piu' grandi, piu' stadi

- **Cinque primitive ornate e un modificatore.** `arch`, `dome`, `buttress`,
  `spire` e `tracery` portano il vocabolario da dieci a quindici voci, e
  `Part.cornice` aggiunge le fasce marcapiano come campo invece che come
  sedicesima voce — la stessa mossa dello smusso. Ognuna dipende dalla posizione
  solo attraverso una funzione simmetrica, che e' cio' che le tiene invarianti
  alla rotazione: `orientPart` ruota una parte scambiando i lati senza
  ridisegnarla.
- **Il portale e' il permesso, non l'ornamento.** Sopra i ventotto voxel una
  struttura sta a cavallo di una carreggiata — il passo della maglia stradale e'
  venti — e `arch` e' cio' che sotto lascia un passaggio invece di un muro. E'
  la primitiva che rende ammissibili gli ingombri nuovi.
- **`config.ts` si e' spezzato prima di crescere.** Le dodici ricette storiche
  sono passate in `recipes/`, raggruppate per mestiere, a parita' di voxel: il
  file era a 2 146 righe e il revamp lo avrebbe raddoppiato.
- **Cattedrale e monumento crescono di sedime su sei stadi.** La cattedrale va
  da 14x10x28 a 44x28x80, il monumento da 12x12x26 a 32x32x130. Lo stadio zero
  resta piccolo come oggi — e' cio' che protegge la sovrapposizione fra due
  catalizzatori, dove nascono gli usi misti — e la megastruttura arriva quando
  il quartiere attorno c'e' gia'.
- **Dove sta l'ornamento l'ha deciso la misura.** Cornici su tutti gli scafi e
  contrafforti con il linguaggio civico portavano il chunk piu' pieno a
  **16 380 quad di dettaglio contro un tetto di 16 384**. Le cornici stanno ora
  sulle sole torri — il perimetro e' il moltiplicatore: ventiquattro celle su
  una torre 7x7, sessantotto su una navata lunga ventotto — e i contrafforti
  sono `plain`, che e' anche cio' che sono in una cattedrale vera. Il catalogo
  intero misura 8 360, sotto perfino l'isolato fitto di citta' ordinaria.
- **Le due reti scorrono il catalogo, non una ricetta scelta a mano.**
  `fitsChunkBudget` si prova su ogni ricetta, ogni verso e ogni scostamento di
  cucitura; `landmarkChunk` in `microGeometry.test.ts` ritaglia la finestra piu'
  piena fra tutte le sagome vere. Nominare la ricetta piu' grossa di oggi vuol
  dire smettere di misurare il caso peggiore il giorno in cui qualcun altro la
  supera.

## In corso — Ricerca del lotto e fronte strada fuori dal Builder

- **`Builder.ts` scende da 1544 a 1148 righe.** La ricerca del lotto — memo
  d'infornata, rettangoli esauriti, siti bocciati, scelta dell'impalcato — vive
  in `lotSearch.ts`, e l'aggregazione sul fronte strada in `frontage.ts`. Il
  `Builder` resta quello che la documentazione dichiarava: il ciclo, la nascita
  di un edificio sul lotto e le statistiche. Nessun cambio di comportamento: i
  metodi sono gli stessi, con le stesse dipendenze prese dal `BuildContext`.
- **La citta' in quota entra nella ricerca da due sole domande.** `LotSearch`
  riceve un `DeckProbe` — `hasDeck` e `decksOpened` — invece dell'`AerialDriver`
  intero: la freccia fra i due resta in un verso solo e dichiarata nel tipo.

## In corso — L'indice si spezza per area e il changelog si archivia

- **`PROJECT_INDEX.md` diventa una radice sottile piu' sei schede.** Restavano
  trentamila token in un file solo, e un agente che lo apriva per una riga li
  pagava tutti. La radice — dipendenze, file di radice, documentazione,
  instradamento — sta in tremila token; le righe di `src/` stanno in
  `docs/index/`: `world`, `structures`, `mobility`, `engine`, `sim-game`, `ui`,
  fra i tre e i sette mila token l'una. Chi cerca un nome non apre niente:
  `npm run locate` legge radice e schede insieme e dice da quale scheda viene
  ogni riga.
- **`docs:merge` instrada da solo.** Un frammento continua a dichiarare la
  sezione, non il file: la fusione la cerca in tutte le schede, scrive soltanto
  quella che l'ha e lo dice. Riconosce anche le sottosezioni `###` — prima un
  frammento per `src/engine/mesher/` falliva, perche' la ricerca guardava solo i
  titoli di secondo livello.
- **Il changelog tiene in radice i tredici incrementi piu' recenti.** Gli altri
  centottantotto sono in `docs/changelog/`, in sette schede tagliate a 55.000
  caratteri — un incremento archiviato non cambia mai scheda, e cresce solo
  l'ultima. `docs/changelog/README.md` elenca tutti i titoli con la scheda di
  ciascuno: e' da li' che si cerca, non aprendo le schede. Da 100.000 token a
  8.000 in radice.
- **`scripts/docs-merge.mjs` si puo' importare, e ha dei test.** Eseguiva
  `main()` al caricamento, quindi non era interrogabile da fuori: ora la
  chiamata sta dietro la stessa guardia di `project-locate.mjs`, e
  `npm run test:docs` verifica ordine alfabetico, sostituzione senza duplicati,
  sottosezioni, sezione inesistente e le due strade del changelog.

## In corso — La famiglia interrata prende la scala che le manca

- **La famiglia era tarata su un'isola che il gioco non genera, ed è questa la
  correzione.** Le misure che avevano fissato profondità e ingombro giravano su
  una region da **256** — la fixture dei test — mentre `TERRAIN_SIZE` in
  `main.ts` vale **512**; e il rilievo non è indipendente dal lato, perché
  `TERRAIN.maxReliefSlope` lo limita a `0,3 · raggio`. L'isola dei test ha quindi
  metà del rilievo di quella vera: picco 32–36 contro **52–60**. Rimisurato con
  `surveySunkenSite` su tre seed della region vera, le finestre asciutte sono
  ~800 a 48×48, ~610 a 64×64, ~270 a 96×96 e 50–95 a 128×128, con profondità
  mediana 40–56 quote invece di 20.
- **Le tre ricette raddoppiano lo scavo e crescono da tre a nove volte in
  pianta.** `sunkenCourt` passa da 20×20×16 a **64×64×32**, `invertedPyramid` da
  20×20×22 a **96×96×40**, `craterRing` da 48×20×26 a **128×64×46** — l'impronta
  più larga del catalogo, il doppio del `quadCluster` che è la torre più grande
  che l'isola sappia produrre. `SUNKEN.maxDepth` sale da 28 a 48, che è il minimo
  dei tre seed misurati e non il massimo: l'unico numero che vale su ogni isola.
  Misurati sull'isola vera, i siti restano abbondanti — 584–640 per la corte,
  256–290 per la piramide, 159–243 per il cratere.
- **Terrazze e pozzi crescono con l'impronta, non solo l'inviluppo.** Lo spessore
  degli anelli passa da 2–4 a 6–12 voxel — su una bocca da novantasei una fascia
  abitata spessa quattro sarebbe un filo di balcone attorno a un buco — e la
  sezione più stretta della piramide va da sedici colonne, cioè il minimo esatto
  di `SUNKEN.shaft`, a duecentoventicinque. Il riempimento resta fra `minFill` e
  `maxFill`.
- **Il fondo del pozzo sale di uno stadio, e non è composizione.** Uno stadio si
  accoda come delta e `dirtyChunkCount` conta i piani di chunk che attraversa:
  con la lastra del fondo insieme alle passerelle in cima, l'ultimo stadio andava
  da `z = 0` a `z = 45` e sforava `maxDirtyChunksPerBuilding` — cioè non sarebbe
  stato scritto affatto, in silenzio. È anche il motivo per cui il cratere è
  128×64 e non 128×96: il tetto che morde per primo è il budget di chunk, non il
  terreno.
- **Le fixture seguono il mondo vero.** `sunkenSites.test.ts` misura ora la region
  da 512 e interroga le ricette invece di una `SPAN` scritta a mano; la fixture
  di `arcologyDriver.test.ts` genera l'isola del gioco e pianta i poli sul
  pianoro misurato invece che sul centro della region, che sull'isola vera è la
  vetta (387 colonne edificabili contro 695, e una città che non matura);
  quella di `restore.test.ts` ricava l'altezza del terreno dalla profondità della
  ricetta invece di fissarla a ventiquattro. Una misura presa su una fixture più
  piatta del mondo è lo stesso difetto di una taratura mai misurata, con il segno
  opposto.

## In corso — Il Project Index smette di indicizzare i test

- **Via dall'indice le 175 righe di `*.test.ts` e `*.bench.ts`.** Erano un quarto
  del file — la sezione «Test e bench» da sola ne teneva 143 — e rispondevano a
  «cosa verifica questo test», che non è la domanda dell'indice: il file di test
  sta accanto a quello che copre, e `test:related` lo trova dal grafo degli
  import. `PROJECT_INDEX.md` scende da 144.003 a 107.750 caratteri, da circa
  quarantamila token a trentamila, senza perdere una sola riga di codice di
  produzione. Toglie anche una fusione per ogni test aggiunto: erano 34 i file
  già non indicizzati, quasi tutti test, segno che la regola non reggeva.
- **L'intestazione dell'indice dice come si interroga.** `npm run locate` prima,
  e il conto dei file rifatto sul working tree: la riga precedente dichiarava 107
  file di test e 1142 test, quando i file di test sono 189.
- **`CLAUDE.md` non promette più che `AGENTS.md` sia caricato.** Non lo è, e le
  regole che costano di più se restano fuori — mai la suite intera di propria
  iniziativa, `locate` prima di esplorare, italiano nella prosa — adesso stanno
  per esteso nel solo file che arriva sempre in contesto.

## In corso — Le opere di terra prendono il pendio

- **`maxTerraceSlope` sale al doppio di `buildableMaxSlope`.** Valeva `0.46`,
  appena un terzo sopra la pendenza edificabile, e su terra emersa rifiutava dal
  3% al 9% delle colonne a seconda del seed — concentrato sul raccordo fra
  pianoro e pianura, cioe' dove il giocatore clicca. Il cartellino «No earthwork
  holds here» compariva su fianchi che un terrapieno regge benissimo. Ora la
  soglia e' `TERRAIN.buildableMaxSlope * 2` (`0.68`): misurato sugli stessi tre
  seed, il rifiuto su terra emersa scende sotto lo 0,1%, e cio' che resta e' la
  parete vera — il campo continuo non passa `0.72` nemmeno sul fianco piu'
  ripido. Il tetto strutturale non cambia e non e' mai stato lui a decidere:
  sotto un'impronta da sei celle il muro piu' alto che questo terreno sappia
  produrre e' di dieci voxel, meno della meta' di `maxWorksStep`.
- **Le scarpate delle fixture si dichiarano rispetto alla soglia.** La riva del
  lago in `actions.test.ts` era scritta `0.6`: diceva «ripida» solo finche' la
  soglia valeva `0.46`, e la ritaratura l'avrebbe trasformata in silenzio in un
  pendio qualunque, svuotando la deroga della marina invece di verificarla.

## In corso — Impostazioni e comandi sul titolo

- **Settings e Help tornano, ma prima del mondo.** La schermata del titolo passa
  da tre voci a cinque: tema, cielo e nuvole si scelgono **prima** che l'isola
  nasca, e i comandi si leggono prima di aver sbagliato il primo gesto. Nessuna
  delle due tocca l'engine — la scelta finisce in `?theme=`, `?daylight=` e
  `?clouds=`, i tre parametri che la radice legge da sempre all'avvio, quindi il
  mondo nasce gia' con il cielo giusto invece di cambiarlo al primo frame.
- **`THEMES` non importa piu' Three.** I colori grezzi si spostano in
  `paletteHex.ts`: `palette.ts` importava Three per convertirli in spazio
  lineare, e chi voleva solo leggere un colore si tirava dietro il renderer.
  Stessa ragione per `daylightControl`, estratto in un file suo perche' viveva
  accanto ai nomi delle classi di edificio e trascinava `src/sim`. Il chunk
  d'ingresso resta a 42 kB, e prima della scelta non arriva ne' Three, ne' la
  simulazione, ne' i worker.
- **Il look viaggia con l'indirizzo, come il seed.** `rememberLook` lo riscrive
  quando cambia in partita — dal menu, da `L`, da `C`, da Shift+cifra — cosi' al
  ricaricamento il titolo mostra il cielo con cui si stava giocando invece di
  quello di tre partite fa. `themeSwatches` diventa l'unica derivazione delle
  pastiglie di un tema: la leggono il menu di pausa e il titolo.
- **Il cielo del titolo respira.** Quattro strati di gradiente scorrono su un
  ciclo di due minuti, tutti dentro il blu e il bianco: nessuno cambia tinta, ma
  la loro somma si'. La deriva e' lenta di proposito — se la si vede muovere,
  distrae da cio' che c'e' da scegliere — e si ferma con
  `prefers-reduced-motion`.

## In corso — La firma del gioco

- **Firma lo studio, non la persona.** `ABOUT_LINE` — l'unica riga del gioco che
  nomina qualcuno, e la leggono tutti quelli che aprono la pagina — dice ora
  `© 2026 Noein Solutions`. Stessa sostituzione in `LICENSE`, `README.md`,
  `PRODUCT.md` e nel campo `author` di `package.json`: il nome proprio
  dell'autore non ha ragione di stare su una superficie pubblica.
- **La selezione smette di sembrare un rettangolo di debug.** Il riquadro
  magenta a tinta unita era piatto per costruzione: opacita' costante da bordo a
  bordo e spigoli netti non leggono come luce, leggono come nastro appoggiato sui
  tetti — e il problema non era il colore, era il profilo. Ora ogni parte della
  figura e' la stessa fascia dipinta da uno shader suo: un filo stretto quasi
  bianco che dice dove passa il bordo, un alone largo nel magenta a caduta
  cubica, e un filo scuro all'estremita' esterna che e' l'unica cosa che tiene il
  contorno leggibile sull'erba chiara. Il nucleo esce sopra 1 e finisce nel
  bloom, quindi l'alone morbido non costa un pass in piu'.
- **Squadre fuori dall'impronta, e una cometa al posto del lampeggio.** Quattro
  squadre scostate in fuori inquadrano la cosa scelta invece di raddoppiare
  l'opacita' della fascia, e sono l'unica parte ferma della figura: quando
  l'occhio ci torna trova un ancoraggio. Il battito d'opacita' e' diventato una
  cometa che percorre il perimetro — nel percorrerlo lo descrive, che e' piu' di
  quanto un lampeggio abbia mai detto — e sui montanti sale, cosi' l'altezza si
  racconta da sola. Non c'e' piu' nessuna `Line` nel contorno: in WebGL una linea
  e' larga un pixel e non ha profilo, quindi non puo' essere ne' luce ne' ombra.

## In corso — La citta' si guarda da terra

- **Il mouse gira la testa senza premere niente.** Tenere premuto per guardarsi
  attorno e' il gesto di chi rigira un modellino, non di chi sta in piedi in una
  strada, ed e' anche il motivo per cui la parentela con `CameraInput` — che
  dichiarando `orbitMode` regalava il drag-per-guardare — non aveva piu' niente
  da dare: cambiato il gesto, e' cambiato l'oggetto. Il muoversi-e-basta ha pero'
  un prezzo che una pagina web non puo' ignorare, il puntatore che arriva al
  bordo dello schermo e la rotazione che si ferma a meta' giro; la risposta e' il
  **pointer lock**, che e' anche l'unica che fa sparire il cursore. Il lock si
  chiede dentro il clic che posa l'occhio, perche' e' li' che c'e' il gesto
  dell'utente che il browser pretende.
- **Perdere il puntatore non fa uscire dalla vista.** `Esc` lo rilascia — lo fa il
  browser, e non c'e' modo di intercettarlo prima — e cosi' un cambio di finestra.
  Uscire li' vorrebbe dire buttare fuori chi ha solo alt-tabbato: la vista resta,
  la testa si ferma, e un clic riprende. E' anche il secondo gradino della catena
  di `Esc` che il gioco usa gia' altrove, dove il primo molla qualcosa e il
  secondo chiude.
- **Non si seleziona e non si costruisce.** Le viste d'ispezione, il piazzamento
  degli strumenti, il clic che apre la scheda di un edificio: tutti spenti finche'
  si guarda da terra. Non e' prudenza — sotto lock il puntatore non ha nemmeno una
  posizione da cui scegliere qualcosa, e senza le guardie il clic che serve a
  riprendere lo sguardo aprirebbe la scheda di un edificio a caso.
- **L'interfaccia si toglie di mezzo.** A terra non c'e' niente da comandare, e
  ogni pannello a schermo e' una cosa che non risponde. Resta una targa sola, che
  dice come si esce: un'uscita che non si vede, da una vista che non ha nemmeno un
  cursore, e' una trappola. Si spegne con una classe e non con `hidden` sulla
  sezione, cosi' cassetti aperti e strumento in mano si ritrovano com'erano al
  ritorno invece di essere un secondo stato da tenere allineato al primo.
- **Il verso verticale e' l'opposto dell'orbita.** `CameraInput` passa il
  verticale con il segno dei pixel perche' girando attorno a un soggetto si tira
  il soggetto: verso il basso vuol dire salirgli sopra. Una testa non gira attorno
  a niente, e la stessa regola diventa il contrario di quello che la mano si
  aspetta. Mouse in basso, si guarda in basso.

## In corso — La schermata del titolo, e il mondo che nasce dopo la scelta

- **L'isola non si genera piu' dietro il menu.** `index.html` monta ora
  `src/boot.ts`, che e' l'unico modulo dell'ingresso: `main.ts` costruisce un
  mondo al solo essere importato — renderer, worker, prima passata del
  generatore — e finche' era lui l'entry point del bundle l'isola cresceva
  mentre il giocatore stava ancora scegliendo. L'import e' diventato dinamico e
  sta dentro il gesto che dice «vai»: prima della scelta la pagina non chiede
  ne' Three, ne' i worker, ne' il chunk del gioco (13 kB contro 1,26 MB).
- **Una pagina sola, tre voci.** `TitleScreen.ts` sostituisce il menu
  d'ingresso a due colonne: titolo, Continue con dentro quando e quanto grande
  era la citta', l'isola nuova con il suo seed e l'elenco dei salvataggi.
  Le sottoschermate sostituiscono l'elenco invece di aprirsi accanto, cosi' non
  c'e' mai piu' di una domanda aperta per volta.
- **Il velo se ne va sul segnale del mondo, non sul primo frame.**
  `signalWorldReady` parte dove si chiude la finestra di caricamento — l'unico
  istante in cui «il mondo c'e'» e' vero — e l'attesa ha un tetto di dodici
  secondi perche' un segnale che non arriva non lasci una pagina morta.
- **Il menu di pausa torna a essere solo quello.** Spariscono `openMenuAtStart`,
  il bottone Continue e il ramo `resumable` di `MainMenu`: sotto quel velo c'e'
  sempre una partita viva, e riaprire l'autosalvataggio sta fra gli slot con il
  suo bottone Load. Il tiro del seed si sposta in `launchMode.ts` (`rollSeed`),
  che e' l'unico posto importabile senza costruire un mondo.

## In corso — Prestazioni: il tick dentro il frame

- **Il memo dei lotti (fase 1.1).** `findLot` girava fino a ventisette volte per
  infornata sullo stesso rettangolo di venticinque isolati, e in un nucleo saturo
  lo percorreva tutto ogni volta. `LotMemo` tiene, per la sola durata di
  `buildPass`, le colonne gia' bocciate. Misurato su isola vera (seme
  `2555647721`, 351 edifici, ultime quaranta infornate): mediana da **5.481 ms a
  140 ms**, caso peggiore da **10.185 ms a 200 ms**. La citta' generata e'
  identica, e adesso c'e' un test che lo dice.
- **Perche' non serve invalidarlo.** I tre modi in cui una colonna bocciata torna
  libera — un cantiere che chiude, una prenotazione che cade, un impalcato che
  nasce — accadono tutti fuori da `buildPass`. Il memo nasce e muore prima, ed e'
  la ragione per cui e' esatto invece che approssimato.
- **`placeLot` resta puro.** La memoria entra come due funzioni (`exhausted`,
  `onExhausted`), come gia' la disponibilita' entrava come predicato: il modulo
  non sa quando una memoria scade, e non deve saperlo. La ricerca lungo il bordo
  non dichiara mai un lato esaurito, perche' salta di `align` in `align` invece di
  percorrere la superficie.
- **L'impronta digitale della citta'.** Sorella di quella della grammatica un
  piano piu' su: `generateDigest` fissa la sagoma di un edificio a parita' di
  seme, `cityDigest` fissa quali edifici nascono e dove. Serve a rendere un numero
  la promessa «non cambia la citta' generata», che ogni intervento su `findLot`
  fa e nessuno finora poteva verificare.
- **Il memo degli isolati sopravvive all'infornata (fase 1.2).** Il rettangolo
  esaurito — «per questo isolato d'origine e questo lato non c'e' posto da
  nessuna parte» — c'era gia' dalla 1.1, ma veniva buttato via a ogni infornata
  insieme alle colonne bocciate. E' un fatto che vale piu' a lungo: `placeLot`
  percorre tutto il rettangolo e il candidato ne cambia soltanto l'ordine. E'
  uscito da `LotMemo` ed e' diventato `BlockMemo`, che dura finche' il mondo non
  libera del suolo. Misurato A/B nello stesso processo su isola vera (seme
  `2555647721`, 351 edifici, 300 infornate, quattro esecuzioni alternate): nelle
  quaranta infornate a saturazione la mediana della passata scende **da 145 a
  9,1 ms** e il caso peggiore **da 210 a 14,3 ms**; le colonne lette per ricerca
  passano da 7.099 a 2.202. La citta' generata e' identica, e `cityDigest` non
  si e' mosso.
- **L'invalidazione e' un'epoca, non tre ganci.** `Builder.freedomEpoch` somma
  tre contatori monotoni, uno per ciascun modo in cui una colonna bocciata torna
  libera: `BuildingRegistry.vacated` (prenotazione rilasciata, record tolto),
  `AerialDriver.decksOpened` (un impalcato che nasce sopra un suolo preso, che
  `lotIsFree` conta come libero) e `TerrainMap.chunkCount` (terra che arriva dove
  non c'era isola). `findLot` la mostra al memo prima di ogni ricerca; se e'
  cambiata il memo cade tutto, perche' inseguire *quale* rettangolo sia cambiato
  costerebbe piu' della passeggiata che risparmia. Ogni contatore sta accanto
  alla domanda che invalida e non nel `Builder`: un quarto modo di liberare suolo
  dovra' portarsi il proprio.
- **Quello che non ha fatto.** Il caso peggiore non e' sceso con la mediana:
  resta una passata da 190–250 ms, ed e' sempre la prima dopo un cambio d'epoca.
  Il costo medio e' abbattuto, quello massimo e' ancora senza tetto — e il tetto
  e' la fase 2 del piano, non un'altra taratura di questo memo.

## In corso — Le arcologie fioriscono

- **Tre tappi impilati, e la quota non era nessuno dei tre.** Misurato su seed
  4242 con cinque poli: la città matura occupa **quattordici isolati**, di cui
  sette `core` e sette `fringe`. La quota ne ammetteva tre e ne nasceva **una**.
  A contarle erano `tier !== core` — che taglia a sette — e soprattutto
  `ARCOLOGY.minSpacing: 2`, che rifiuta due megastrutture su isolati
  **adiacenti**: i sette `core` sono un blocco contiguo, quindi un
  impacchettamento greedy ne fa stare due. Una regola scritta per *distribuire*
  era diventata il tetto più stretto.
- **La fascia esce dalla condizione, la densità resta.** `arcologyReady` non
  chiede più `core`: a dire «qui c'è un quartiere» è `minBuilt`, che è una misura
  del luogo invece di un'etichetta, ed è anche la sola delle tre che non può
  svuotarsi per come il giocatore dispone i poli — il difetto che questo dominio
  aveva già incontrato con `isPeakBlock` e con `tier !== core` per l'earthscraper.
  `minSpacing` scende a 1, `minBuilt` da 64 a 40 — su un raggio di ventiquattro
  colonne il candidato migliore oscillava fra 52 e 61 — e
  `buildingsPerArcology` da 128 a 32, così la quota resta il **traguardo** che la
  voce nomina senza tornare a essere un limite.
- **Le due famiglie non si escludono più: la roccia apre, l'isolato sceglie.**
  Il veto `tooHigh` teneva i crateri sulla spalla del cono e le torri sulla
  cresta. Misurato: cinque poli sovrapposti riempiono il cono su **tutto** il
  nucleo, quindi ogni candidato risultava cresta e la famiglia interrata non ha
  mai avuto un sito in partita — metà del catalogo esisteva solo nei test. Ora la
  domanda è se sotto c'è roccia asciutta abbastanza; dove c'è, a scegliere fra
  salire e scavare è un tiro deterministico sull'indice dell'isolato, con lo
  stesso sale che sceglie già la forma.
- **Esito, misurato sulla stessa isola.** Da **una** arcologia a **quattro**, da
  una forma a **tre** (`doubleBar`, `triSpan`, `invertedPyramid`), e per la prima
  volta un earthscraper accanto alle torri. Il rifiuto che resta è `thin`, cioè
  la densità costruita: la megastruttura arriva dove c'è un quartiere, che è la
  condizione che la fase voleva. `ARCOLOGY_REFUSALS` perde `notCore` e `tooHigh`.

## In corso — La citta' si guarda da terra

- **Una camera all'altezza degli occhi.** `O` arma lo strumento, un clic posa
  l'occhio sul punto puntato, il trascinamento gira la testa e la rotella cambia
  il campo visivo; `Esc` risale e restituisce l'inquadratura identica. L'occhio
  non cammina: e' una vista fissa, e il punto lo si sceglie di nuovo uscendo e
  rientrando. Su un tetto ci si sale — a decidere e' la quota colpita dal raggio,
  non la colonna di terreno — e l'acqua si rifiuta, perche' la heightmap li'
  risponde con il fondale.
- **E' un secondo controller, non un modo del primo.** `IsoCameraController` da'
  la prova di quando una manovra e' tale: «proiezione, zoom, near e far sono lo
  stesso codice». Qui fallisce su ogni riga, e su una in particolare —
  l'inclinazione deve **attraversare lo zero**, che e' esattamente il valore che
  la' e' vietato perche' `1 / sin(pitch)` esplode nel pan sul piano di terra.
  L'input invece si riusa per intero: `CameraInput` sceglie fra girare e panare
  guardando `orbitMode`, e a terra non c'e' un pan da cui distinguere il gesto.
- **La nebbia integra il segmento giusto.** L'integrale era in forma chiusa
  «perche' la camera e' ortografica», ed era la ragione sbagliata: lo e' perche'
  la quota e' lineare lungo il segmento, cosa vera di qualunque raggio dritto.
  Cio' che l'ortografica comprava era descrivere il segmento con **un vettore per
  fotogramma**. Ora il raggio si ricava per frammento da `cameraPosition`, e a
  dire quale dei due casi vale e' `isOrthographic`, un uniform che Three scrive da
  se' a ogni draw: nessuna uniform nuova, nessuna scrittura per frame, e la vista
  isometrica identica per costruzione.
- **Il velo di quota si accende sul cammino.** Non dipende dalla distanza — e' il
  suo scopo — ma quel «non dipende» era scritto per una camera parcheggiata a
  centinaia di unita', dove nessun frammento visibile e' vicino. Con l'occhio
  dentro la citta' dipingeva di lattiginoso il muro a due voxel dal naso. Ora sale
  da zero entro `FOG_LIFT_NEAR`, che sotto ortografica e' un no-op per costruzione.
- **Il cielo ha un orizzonte.** Il gradiente seguiva l'altezza di schermo, ed era
  giusto finche' i raggi erano paralleli: tutti hanno la stessa elevazione, quindi
  un cielo «fisico» avrebbe dato una tinta piatta. Quando convergono segue
  l'elevazione vera. Le due copie della curva — quella del fondo e quella della
  nebbia — sono diventate **una funzione sola** in `skyGradient.glsl.ts`, che e' la
  forma forte della regola che i due file si scambiavano per commento. Con lo
  stesso raggio per pixel il banco di nuvole smette di scorrere piatto e si
  incurva verso l'orizzonte.
- **L'ombra si stringe attorno all'occhio.** La shadow map si adatta all'AABB dei
  chunk visibili, e da terra quell'AABB e' un corridoio lungo quanto l'isola: il
  texel valeva un quarto di voxel. Ora si interseca con una scatola di 96 voxel di
  raggio attorno all'occhio — puo' solo rimpicciolire, quindi i chunk ancora in
  aria durante la caduta d'ingresso restano esclusi come prima — e la pass
  disegna **meno** mesh di quante ne disegnava.
- **La vista ferma vale una resa migliore.** Da terra la camera non si muove: la
  coda di remesh si ordina una volta e poi mai, nessun chunk nuovo entra nel
  frustum, e l'ombra costa meno di prima. Quel margine si spende sopra la densita'
  dello schermo — supersampling, l'unica manopola che tocchi gli spigoli dei
  voxel, e su un display 1x l'unica disponibile perche' li' il tetto normale e'
  gia' raggiunto. Il tetto e' due, e si limita da solo: su un 1x sono quattro
  volte i pixel, su un 2x e' la risoluzione nativa. `RenderQuality` continua a
  sorvegliare i tempi e a scendere se non tengono — il boost sposta il punto di
  partenza dell'isteresi, non la scavalca — e un modo fisso alza la risoluzione
  senza disfare la scala di effetti che il giocatore ha scelto con `?quality=`.
  All'uscita si rimette il livello che la misura aveva raggiunto, non il default.
- **Il contorno si linearizza.** Il Sobel girava sulla profondita' grezza, e
  funzionava perche' in ortografica quella e' gia' lineare. In prospettiva i
  valori si accalcano verso uno: alone nero sul primo metro, niente oltre una
  decina di voxel. Non e' una soglia da ritarare — non ne esiste una che vada bene
  a due metri e a duecento — quindi si inverte la curva del buffer prima del
  filtro. Il tilt-shift invece si spegne: e' una banda di fuoco che dice
  «modellino», ed e' scelta cosi' proprio perche' l'ortografica non ha convergenza.

## In corso — Il campionario non si copre piu'

- **Le fasce si ordinano per quota decrescente, non per lettura.** La camera
  guarda da `(+x, +y)`: lungo +y ci si avvicina, e chi sta davanti copre chi sta
  dietro. Le quindici arcologie — fino a settecentotrentasette voxel —
  seppellivano la matrice e la fascia di scala, che stavano oltre loro. Ora le
  gallerie stanno dietro la base, in y negative e dalla piu' alta alla piu'
  bassa: le megastrutture in fondo, dove salgono nel cielo vuoto.
- **Il conto dell'occlusione sta in `swatchOcclusion.ts`, e prima sbagliava.** La
  formula che viveva nel commento dell'interasse della matrice, `CELL_HEIGHT -
  cellPitch / 2`, confrontava due file alla stessa x invece che sulla stessa
  colonna di pixel: dichiarava quattro voxel nascosti dove ce n'erano sei, e la
  griglia era occlusa oltre il filo dello sbalzo mentre il test diceva di no.
  Il vuoto che serve e' **la quota di chi sta davanti**, non la sua meta';
  `cellPitch` sale percio' da dieci a dodici.
- **Due regole, due assi.** In y il distacco fra due file e' la quota della fila
  davanti; in x il vuoto fra due vicini e' la **profondita'** del soggetto a x
  maggiore, perche' li' l'altezza non entra affatto. E' il motivo per cui
  quindici megastrutture si separano spendendo poche decine di voxel di fila
  invece di centinaia di profondita'.
- **Un ripiano per riga invece di uno per fascia.** Con distacchi larghi come un
  edificio, un basamento continuo sarebbe stato un piazzale grigio: resta il
  principio di sempre — il piano di lettura e' largo quanto cio' che ci sta
  sopra — applicato una riga alla volta.
- **La riserva di pan e' quattro chunk, non un rettangolo pieno.** `growBounds`
  allarga una scatola, quindi l'AABB dipende solo dai chunk estremi: riempire
  l'interno non aggiungeva un voxel di liberta' alla camera e sarebbe costato
  centoventi megabyte di chunk vuoti sul campionario riflusso.
- **Un test nuovo tiene l'invariante**: nessun soggetto ne copre un altro, su
  tutte le coppie, con la sola eccezione dichiarata della matrice — dove sotto
  `CELL_LEDGE` c'e' il podio e non c'e' niente da distinguere.

## In corso — La scala dell'arcologia si vede

- **Da un rifiuto a una misura.** Il driver produceva un enum — `notCapped` — che
  non distingue «uno su due» da «zero su due», cioè due partite diverse. Il nuovo
  `src/world/arcology/prospect.ts` raccoglie *tutte* le condizioni mancanti con
  `have`/`need` leggendo le stesse soglie di `siting.ts`, e un test verifica in
  entrambe le direzioni che la prima lacuna sia esattamente il rifiuto del
  predicato: due misure per la stessa domanda divergerebbero alla prima
  ritaratura, come già successo con i due raggi di `isCoastal`. La raccolta non
  costa una scansione in più — riusa l'oggetto che sta per andare ad
  `arcologyReady`, dove `builtNeighbours` e `cappedNeighbours` sono già misurati.
- **Il consiglio sull'arcologia adesso arriva a schermo.** Stava in fondo
  all'elenco del coach, che ne mostra una riga sola, e `skylineSuggestion` — vera
  per quasi tutta la partita — lo copriva sempre: la meccanica esisteva e non
  aveva voce. Ora precede lo skyline e tace finché il quartiere attorno al
  candidato non c'è, così le lacune lontane restano a chi le dice meglio. Un test
  verifica che possa passare davanti.
- **Il cassetto Città mostra una scala invece di un contatore.** `Arcologies: 0`
  è il valore normale per quasi tutta la partita e da solo non dice niente: al suo
  posto la quota come traguardo con la barra, le lacune riga per riga, e la
  **ricompensa** — quali usi la struttura ospiterà, derivata dal catalogo e non
  scritta a mano. Le parole vivono in `src/ui/prospects.ts` accanto al resto della
  lingua di «cosa manca», perché le stesse righe serviranno alla scheda
  dell'isolato.
- **Misurato, e la diagnosi in ROADMAP 4.18 è vecchia.** Su seed 4242, otto
  catalizzatori del listino e 6000 tick: il campo di desiderabilità **satura a
  255** e la soglia effettiva arriva a 293 contro i 198 di
  `BUILDER.upgradeThreshold`, quindi la desiderabilità **non** è più il tappo che
  la roadmap descriveva. Con il magazzino illimitato le torri arrivano al livello
  26 e **un'arcologia nasce**; con l'economia vera si fermano al **livello 10** e
  `cappedNeighbours` resta 0. Il collo di bottiglia è quindi
  `upgradeMaterialCost` — `2·(livello−6)²`, cioè da 32 a 578 unità per singola
  promozione — contro un tetto di fascia `core` di 23. Il messaggio del coach
  nomina ora quella causa e non più la desiderabilità.

## In corso — La punta delle arcologie

- **`frameRegion` accetta il centro verticale della regione.** Il perno stava sul
  piano di terra a inquadratura qualunque: meta' schermo finiva sotto il
  basamento e la cima usciva di sopra. Sul campionario erano centotrentacinque
  voxel di arcologia fuori campo perfino premendo il pulsante «Arcologies», e la
  fascia arriva a 737 voxel. L'altezza dichiarata era gia' quella giusta:
  mancava il centro su cui appoggiarla.
- **La quota del perno sopravvive al pan.** `clampTarget` riportava la z del
  target a `targetHeight` a ogni spostamento, quindi la prima freccia premuta
  rimetteva l'inquadratura a terra. Adesso il perno ha una quota sua, che
  `frameRegion` e `restoreState` scrivono e il pan rispetta.
- **Doppio clic sul campionario: inquadra il soggetto.** Dal basamento alla
  punta, con il perno a meta' altezza. La fascia intera mette quindici arcologie
  in fila, e avvicinarsi con la rotella tagliava proprio la cima; `Esc` molla la
  scelta e rimette la fascia da cui si era partiti.

---

**Gli incrementi precedenti — 188 — stanno in [docs/changelog/](docs/changelog/)**, in sette
schede da 55.000 caratteri. L’elenco completo dei titoli, con la scheda di ciascuno,
è in [docs/changelog/README.md](docs/changelog/README.md): è da lì che si trova un
incremento, non aprendo le schede a tentoni.
