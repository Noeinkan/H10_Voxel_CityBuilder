# Terreno

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **Il terreno quantizza, il contenuto no.** `TERRAIN.cellSize` e' il lato del
  cubo di terreno, in voxel: il generatore campiona e arrotonda su quella cella
  — in pianta *e* in quota — mentre edifici e alberi restano a dettaglio di un
  voxel. E' quella differenza a dare la scala all'isola, e senza di essa una
  chioma d'albero e' larga quanto un edificio intero. `cellSize` deve dividere
  `CHUNK`.
- Le quote assolute di `terrain/config.ts` sono multiple di `cellSize`, gli
  strati della colonna sono spessi un numero intero di celle, e i lotti si
  allineano allo stesso passo (`STREETS.align`). Una soglia dispari cade a meta'
  di un cubo, ed e' esattamente il gradino da un voxel che la cella esiste per
  togliere.
- **La verticale e' tarata sull'orizzontale.** Il gradiente del campo vale
  rilievo diviso raggio: raddoppiando il lato dell'isola vanno raddoppiate anche
  le quote assolute e dimezzate le frequenze del rumore, altrimenti esce una
  frittella senza fianchi. La taratura attuale e' per un'isola di lato **512**,
  ed e' quella la dimensione su cui i test la verificano.
- Soglie, frequenze e stratigrafie stanno in `terrain/config.ts`.
- **L'acqua si classifica qui perche' solo qui esiste la profondita'.** Il mesher
  emette del mare la sola faccia superiore, a quota costante e con un unico slot:
  al frammento non arriva nessun segnale, e una pozza e' identica al mare aperto.
  `waterClass.ts` decide bassofondo, canale o mare aperto da `seaLevel - top` e
  dalle sponde, e la classe viaggia nei **tre bit di superficie** del voxel
  d'acqua — un sovraccarico dichiarato di quel campo, non un nono tipo (vedi il
  contratto 5 e `WATER_CLASS` in `visualBlock.ts`). Il sondaggio delle sponde
  interroga il campo di quota, che e' funzione pura del seed: e' cio' che evita
  di classificare la stessa insenatura in due modi ai due lati di un confine.
- Un blocco dipende solo da `(seed, shape, ccx, ccy)`: preserva determinismo,
  indipendenza dall'ordine e continuita' ai confini. Le decorazioni valutano un
  anello di `TREE_DECOR.ring` colonne e scrivono solo la porzione interna, cosi'
  una chioma oltre confine non crea dipendenze d'ordine. La varieta' della
  chioma esce da un PRNG derivato dalla posizione dell'albero, non conservato:
  due blocchi che si dividono lo stesso albero ne ricavano la stessa sequenza.
- Generatore e worker non importano Three.js o `src/engine/`.
- Due tetti duri in `terrain/config.ts`: `warpAmount` piu' `warpDetail` sopra
  ~0,26 attacca terra al bordo della region; alzare `baseFrequency`,
  `maxReliefSlope` o `summitLift` consuma il margine di Lipschitz. **`maxHeight`
  non e' piu' il rilievo**: il rilievo lo detta il raggio, e quel numero e'
  soltanto il tetto che deve contenere l'espansione della vetta piu' alta —
  `heightField.test.ts` verifica la disuguaglianza fra le costanti, perche' se
  cade non lancia niente e la cima si appiattisce dentro `cellGrid`.
  **L'invariante e' in celle e in
  alzate**: due celle adiacenti si posano su scale di `terrace.ts` che stanno
  entrambe entro `TERRACE.maxStep` sotto la quota vera, quindi non differiscono
  di piu' di **un'alzata** anche quando le due scale non sono la stessa, e dentro
  una cella il dislivello e' zero per costruzione. `heightField.test.ts` misura il
  margine sul campo continuo, `terrace.test.ts` la proprieta' della scala,
  `IslandGenerator.test.ts` entrambe sulle quote quantizzate.
- **La montagna la fa la quantizzazione, non il rilievo.** Il campo continuo
  resta dolce — e deve restarci, e' cio' che tiene in piedi tutto il resto —
  mentre `terrace.ts` allarga la **pedata** con la quota: in media due voxel in
  pianura, quattro nella foresta, sei sulla collina, otto sulla roccia. Lo stesso
  fianco di prima produce cosi' un muro di otto voxel invece di quattro gradini
  da due.
- **Una scala sola da' un muro solo, ed e' un teorema e non una taratura.** Se
  l'alzata e' funzione della sola quota, tutte le celle di una fascia ne
  condividono una; e siccome due celle contigue cadono su pedate contigue, il
  salto vale *esattamente un'alzata*. Ogni parete della fascia esce percio' alta
  uguale — per tutto il suo sviluppo e su tutta l'isola — e nessun disturbo in
  pianta puo' cambiarlo, perche' spostare il ciglio non ne cambia il salto. Le
  scale sono percio' `TERRACE.beddings`, tre: roccia fine, media e massiccia, un
  grado di `cellSize` l'una dall'altra. Lo scarto e' **sistematico e non
  estratto**, ed e' la differenza che conta: due scale che pescano dallo stesso
  ventaglio si ritrovano di continuo sulla stessa pedata e da li' in poi sono la
  stessa scala — misurate, tre su quattro condividevano ogni base fino a quota
  66. Una stratificazione che sale sempre a passo suo diverge e resta divergente,
  ed e' anche cio' che una stratificazione **e'**: uno spessore di strato
  caratteristico, non una sequenza di spessori casuali.
- **Il tetto del dirupo e' dimostrato, e la dimostrazione e' piu' forte di quella
  che bastava a una scala sola.** Ogni scala posa su un multiplo di `cellSize` che
  sta a meno di `maxStep` sotto la quota vera, quindi due celle contigue distano
  meno di `maxStep` piu' il loro dislivello di campo (sotto i due voxel): fra
  multipli di cella quel totale vale `maxStep` esatti, **comunque siano scelte le
  due scale**. L'unica premessa e' che il dislivello resti sotto `cellSize`, che
  e' la stessa di prima. Non c'e' nessun clamp a valle, e non serve.
- **Dentro la conca di un lago la scala resta fine.** `HeightField.inBasinAt`
  spegne il terrazzamento sull'ellisse d'influenza: fondo, sponda e pelo stanno
  dentro sei voxel (`basinDrop`), e un'alzata da otto se li porterebbe via —
  la sponda scenderebbe sotto il proprio pelo e il lago colerebbe a valle.
  E' anche il verso giusto: una conca e' una vasca liscia, non una cava.
- **Sul ciglio affiora la roccia, ed e' la sola cosa che il ciglio cambia.** Una
  cella che sovrasta un salto di piu' di un cubo prende `BIOME.rock` — quindi
  smette di essere edificabile, perche' la roccia non e' un bioma edificabile —
  ma la **flora si decide sul bioma di sotto**, quello del reticolo. Non e' una
  svista: il ciglio esiste solo dove il margine del reticolo basta a calcolarlo,
  mentre la classificazione esiste ovunque, e un albero deve valere lo stesso da
  qualunque blocco lo si guardi.
- **Una sporgenza non e' una colonna.** E' la prima cosa del terreno con
  dell'aria sotto, quindi non e' rappresentabile come quota e sta fuori dalla
  `TerrainMap` — nel mondo voxel e nel blocco come record, esattamente come un
  albero. Ne segue che nessuno ci costruisce sopra e che il picking non la vede:
  ci si passa sotto. Il salto minimo che ne regge una non e' un numero di
  `config.ts` ma `LEDGE_MIN_DROP`, dedotto da cio' che deve starci — aria,
  lastra, e la cella di parete che le resta in testa.
- **Chi raccoglie record deve ritagliarli al blocco, non solo scriverli.** Un
  albero o una sporgenza nati nell'anello possono cadere **tutti** oltre la
  cucitura: tenerne il record alza `maxHeight` e fa allocare un chunk che quel
  blocco non riempira' mai. Il difetto si vede solo da un test —
  «non alloca chunk verticali che resterebbero vuoti» — e non lancia niente.
  Per un albero il ritaglio e' `treeTopIn`, e **non e' un riquadro**: il livello
  di chioma piu' largo non e' quello piu' alto — una palma ha le fronde a raggio
  quattro e la punta a raggio due — quindi un albero che sfiora il blocco con la
  sola base ci scrive fin dove arriva la base. La quota si ottiene ridisegnando
  l'albero verso un sink che conta: le estrazioni di pendenza e di erosione
  vengono dalla posizione, non da chi chiama, quindi il conto e' quello vero e
  non un maggiorante. Un blocco ha una decina di alberi: il disegno in piu' non
  si sente.
- **La copertura del terreno e' un byte per colonna, non un oggetto.** Erbette,
  fiori e sassi si decidono con un hash (`unitAt`, che non alloca la chiusura di
  `mulberry32`) e si scrivono dentro il ciclo che riempie la colonna: non hanno
  un ingombro, non possono collidere, e a duecentosessantamila colonne per isola
  un PRNG per colonna si sentirebbe. Un albero, che ha tutte e tre le cose, resta
  un record.
- **La cella di copertura non e' un cubo: e' un marcatore.** `setCoverMark`
  scrive un byte con palette 0, che `packVisualBlock` non produce mai; il mesher
  lo toglie dal volume prima del greedy pass e ci disegna lame, steli e sassi in
  prismi da 1/16 (`engine/mesher/coverDetail.ts`). Due conseguenze da non
  perdere: la tinta **non** viaggia nel marcatore — la ricava
  `coverToneOn(palette del terreno sotto, tipo)`, quindi due biomi non possono
  condividere la palette di superficie — e per `getBlock` un'erbetta non c'e',
  perche' `blockPalette` di un marcatore vale 0. E' il verso giusto: la copertura
  e' decorazione, non un ostacolo per chi cerca dove costruire.
- **La sagoma e' dichiarata, il rumore fa la grana.** `terrain/landform.ts`
  compone l'isola da elementi con un nome — lobi che allungano la costa, rilievi
  che spostano le vette dal centro, conche che aprono un lago — perche' rumore
  isotropo per maschera radiale da' una cupola, e le fasce di bioma le vengono
  fuori a cerchi concentrici per costruzione. Tutto e' funzione pura di
  `(seed, shape)` e **ignora le `extensions`**: un settore costiero comprato a
  partita in corso non deve spostare niente altrove, o le colonne gia' generate
  non si raccorderebbero piu' con quelle nuove.
- **Un'isola ha un carattere, e sono due numeri estratti dal seed.**
  `crestMix` dice quanto rumore **a creste** entra nella miscela — `0,5 - |n|`,
  il simplex ripiegato sullo zero, che ha il massimo lungo una *linea* e non in
  un punto: da li' escono i crinali con i loro contrafforti, cioe' l'unica
  struttura allungata che un rumore isotropo non sa dare. Il ripiegamento resta a
  **mezza ampiezza** apposta: cosi' conserva il modulo del gradiente e non costa
  niente al budget di Lipschitz, mentre la forma canonica `1 - 2|n|` lo
  raddoppierebbe (misurato: dislivello peggiore da 0,69 a 0,94, cioe' fuori
  criterio). Si paga in altezza, e l'altezza la ridà `summitLift`, che moltiplica
  per `1 + lift` la sola distanza dal ginocchio `summitKnee`: sotto — costa,
  pianura, fascia edificabile — non cambia niente, sopra la vetta sale o si
  arrotonda. L'intervallo attraversa lo zero perche' la varieta' deve venire
  dalla **varianza** e non da un paesaggio medio piu' alto; misurato su
  quarantotto seed, le vette vanno da 54 a 75 voxel e la roccia dal 10 al 29 per
  cento della terra emersa.
- **La forma in pianta di un elemento sta in `terrain/outline.ts`, e si spegne
  sul bordo.** Rilievi e conche sono ellissi orientate con il raggio deformato da
  poche armoniche: senza, il bordo di un lago e' una circonferenza esatta, e lo
  specchio e' l'unica superficie dell'isola senza grana ne' terrazzamento, cioe'
  l'unica curva che si legga per intero. La deformazione vale piena al centro e
  **nulla sul bordo**, dove la sagoma torna il cerchio del raggio che dichiara:
  chi cerca un sito a una conca sonda il terreno lungo quel bordo, e una sagoma
  che sporgesse pagherebbe la propria forma in terra piana — la risorsa rara su
  un'isola quasi tutta in pendenza, misurata in due laghi persi su otto seed.
  Cosi' si paga tutta in pendenza, e chi la usa divide per `warpLipschitz` la
  pendenza che dichiara: la sponda di un lago vale ancora `basinSlope` esatti.
  La sagoma ha un **flusso di PRNG suo** (`shapeWarpSalt`), o ritoccare
  un'ampiezza sposterebbe le colline invece di cambiare solo la forma.
- **La roccia e' l'unico bioma con piu' di una tinta**, e per una ragione di
  scala: sopra la collina l'alzata vale otto voxel, quindi di una cella si vede
  piu' parete che pianta, e un grigio solo e' una campitura alta quattro cubi. Lo
  strato vale un **gradone** — a meta' parete racconterebbe una quota che li' non
  c'e' — e il sottosuolo prende il grigio successivo della rampa, cosi' il bordo
  chiaro che dichiara la fine del gradone resta su ogni strato. **In pianta non
  varia, ed e' deliberato**: due grigi affiancati alla stessa quota
  significherebbero due strati alla stessa quota. Provato e buttato due volte —
  chiazze da un hash, poi vene di rumore — perche' il colore che non racconta
  niente si vede che non racconta niente; a dare varieta' e' il ciglio, non la
  tinta. La lettura e' una sola, `paletteAt`, e la usano il generatore, le opere
  di terra e la vista per bioma.
- **Il ciglio non e' una curva di livello, e non e' nemmeno alto uguale**, e senza
  il campo di stratificazione sarebbe tutte e due le cose: il campo di quota e'
  dolce e una scala e' esatta, quindi il gradone cade dove il campo attraversa una
  quota tonda — su una cupola, cerchi concentrici — e vale sempre l'alzata della
  propria fascia. Le pedate di due stratificazioni cadono invece a quote diverse,
  quindi il ciglio di una data quota cade a **raggi** diversi dove la
  stratificazione cambia (la curva si spezza) e il salto assume valori diversi
  lungo lo stesso sviluppo. Un solo meccanismo per due difetti.
- **Il campo che sceglie la stratificazione ha due ottave, e fanno mestieri
  diversi.** `beddingSpan` da' carattere a un versante intero — questo fianco sale
  a gradoni larghi, quello accanto a scalini — ed e' la scala a cui una
  stratificazione si legge come tale; `beddingBreak` spezza la singola scarpata
  lungo la sua corsa, ed e' quella che toglie alla parete l'altezza costante. Con
  la sola lunga ogni scarpata resta alta uguale per tutta la sua corsa; con la
  sola corta il terreno si sgrana e a questa scala si legge come sporcizia.
- **Il campo va allargato prima di quantizzarlo** (`beddingContrast`), o meta'
  delle stratificazioni non verrebbe mai usata: il rumore di valore e' una
  miscela bilineare, e mescolarne due ottave stringe ancora. Misurato, le due
  stratificazioni centrali si prendevano il 91% dell'isola e le estreme il 9% —
  le scale erano quattro dichiarate e due sul terreno, cioe' il difetto che si era
  andati a togliere.
- **Sotto `TERRACE.fromHeight` le stratificazioni coincidono**, ed e' la garanzia
  di edificabilita': la pianura non si terrazza e non dipende da quale scala la
  tocchi. La citta' cresce li', e un dirupo in mezzo a un isolato sarebbe un
  dispetto. Dentro la conca di un lago la scala resta fine per la sua ragione:
  una vasca ha il bordo che ha.
- **La flora sta in `terrain/flora.ts`, e cresce a macchie.** La specie non esce
  da un'estrazione per cella: due alberi su tre prendono quella del proprio
  **boschetto** — un riquadro di `TREE_DECOR.standCells` celle, con una specie
  estratta dagli stessi pesi del bioma — e il terzo resta il suo, che e' cio' che
  sfuma il bordo fra due macchie invece di lasciarlo rettilineo. Senza, sui pesi
  della foresta esce un pixel di conifera, uno di latifoglia e uno di betulla:
  non un bosco misto ma rumore verde. La macchia non aggiunge specie dove non
  crescerebbero, ne cambia solo la disposizione. **La spiaggia non e' piu'
  spoglia**: un albero non toglie edificabilita' a nessuno, e la frangia costiera
  e' l'unica fascia dell'isola che si vede da ogni inquadratura.
- **Un albero scrive solo dove c'e' aria.** Il terreno del blocco e' gia' scritto
  quando parte la decorazione, quindi la chioma nata su una cella bassa viene
  ritagliata dalla parete della cella accanto invece di mangiarla. Vale per il
  blocco che la scrive, e ogni blocco scrive solo il proprio rettangolo dopo le
  proprie colonne: la meta' di chioma oltre la cucitura resta coerente.
- **Nessun elemento della sagoma dichiara un'altezza: dichiara un raggio.**
  L'altezza gliela detta `capForRadius` dal budget di pendenza, perche' una
  cupola di ampiezza `a` e raggio `R` ha pendenza massima `pi/2 * a / R` e il
  margine di Lipschitz e' l'unica cosa che tiene il terreno a celle senza
  dirupi. E' la stessa regola che `maxReliefSlope` applica all'isola intera,
  letta un elemento per volta. Dichiarare un'altezza vuol dire poter scrivere una
  collina che il campo non regge e accorgersene solo quando cade il test.
- **L'acqua non e' piu' un piano solo.** `ColumnBlock.waterTop` porta la quota
  dello specchio per colonna: `TERRAIN.seaLevel` quasi ovunque, quella del lago
  dentro una conca. Il bioma `ocean` dice percio' *sott'acqua* e non *sul mare*,
  e chi confronta una quota con `TERRAIN.seaLevel` per decidere se una colonna e'
  sommersa sta facendo la domanda sbagliata da quando i laghi esistono — la
  risposta e' `map.waterTopAt(x, y)`. Un lago sta **sopra** il livello del mare
  per costruzione: sotto, il fondo di una conca arriverebbe al mare e quel che si
  apre e' una baia.
