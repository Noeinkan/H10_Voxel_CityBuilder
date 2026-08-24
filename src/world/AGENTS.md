# Regole per `src/world/`

Storage voxel sparso, scene deterministiche, terreno procedurale, rete stradale
e costruzione degli edifici. Questo modulo non dipende dal renderer.

## Storage e coordinate

- Mondo Z-up; chunk `32x32x32`; coordinate negative valide.
- `blocks` e `data` sono buffer distinti, allocati una volta per chunk.
- `setBlock` sporca il chunk e i vicini di bordo; `setData` mai la geometria.
- **Verso il basso la dipendenza e' lunga `SKY_PROBE`, non una cella.** Il mesher
  guarda quei voxel sopra il proprio tetto per sapere cosa lo copre, quindi una
  scrittura nei primi `SKY_PROBE` piani di un chunk sporca anche quello sotto.
  Senza, una campata comparsa dopo il suolo non lo scurirebbe mai.
- `fillColumn` e' `setBlock` su un tratto verticale, e va usata quando il tratto
  si conosce in anticipo: dentro il chunk resta un indice che avanza, e
  conversioni, pack del byte e marcature si pagano una volta invece che per
  voxel. Il terreno ci scrive cinque milioni di celle come cinque corse per
  colonna. Marca i vicini in verticale in modo piu' largo di `setBlock` — per
  tratto e non per cella — perche' sporcare di piu' costa una mesh e sporcare di
  meno lascia una faccia sbagliata.
- Aggiungere chunk non rialloca o sostituisce buffer esistenti.

## Terreno

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
  ~0,26 attacca terra al bordo della region; alzare `baseFrequency` o
  `maxHeight` consuma il margine di Lipschitz. **L'invariante e' in celle e in
  alzate**: due celle adiacenti cadono su pedate contigue della scala di
  `terrace.ts`, quindi non differiscono di piu' di **un'alzata**, e dentro una
  cella il dislivello e' zero per costruzione. `heightField.test.ts` misura il
  margine sul campo continuo, `terrace.test.ts` la proprieta' della scala,
  `IslandGenerator.test.ts` entrambe sulle quote quantizzate.
- **La montagna la fa la quantizzazione, non il rilievo.** Il campo continuo
  resta dolce — e deve restarci, e' cio' che tiene in piedi tutto il resto —
  mentre `terrace.ts` allarga la **pedata** con la quota: due voxel in pianura,
  quattro nella foresta, sei sulla collina, otto sulla roccia. Lo stesso fianco
  di prima produce cosi' un muro di otto voxel invece di quattro gradini da due.
  Perche' funzioni serve una sola cosa, ed e' dimostrata invece che sperata:
  ogni pedata e' larga almeno `cellSize`, cioe' piu' del dislivello massimo fra
  due celle contigue, quindi due celle non possono scavallare piu' di un'alzata.
  Non c'e' nessun clamp a valle, e non serve.
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
- **Il ciglio non e' una curva di livello**, e senza `TERRACE.jitter` lo sarebbe:
  il campo e' dolce e la scala e' esatta, quindi il gradone cade dove il campo
  attraversa una quota tonda, cioe' su cerchi concentrici. La quota di una cella
  viene percio' scossa da due ottave di rumore prima di posarsi sulla scala.
  L'ampiezza e' una **frazione dell'alzata oltre la cella**, ed e' li' che sta
  l'invariante: in pianura e' zero — la citta' cresce li' e un dirupo in mezzo a
  un isolato sarebbe un dispetto — e sotto la meta' due celle contigue non
  possono ancora scavallare piu' di un'alzata, perche' il loro dislivello piu'
  due ampiezze resta dentro la pedata. Dentro la conca di un lago non si scuote
  niente: una vasca ha il bordo che ha.
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

## Scene

- **Il campionario e' una scena, non un percorso di rendering.** `scenes/swatch*`
  mostra il vocabolario — ogni slot per ogni linguaggio, la stratigrafia di ogni
  bioma, la scala fra cella, albero ed edificio — riusando quello che c'e' gia':
  `STRATA_DEPTH` per gli strati, `writeTree` per gli alberi, `generateBuilding`
  per l'edificio. Non aggiunge geometria, materiali, slot di palette o tipi di
  superficie (invarianti 4 e 5), e se una combinazione si vede male il difetto
  sta altrove. Le sue dimensioni si ricavano dalle tabelle e mai da un letterale:
  uno slot o una specie in piu' allargano la griglia da se'.
- I numeri stanno in `scenes/swatchLayout.ts`, che e' puro e ha tre consumatori —
  il generatore, l'inquadratura di `main.ts` e il referto sotto il cursore.
- **Il provino della matrice e' una massa a gradoni, non un prisma**, e la forma
  e' un requisito del mesher e non un gusto: `emitSoffits`, `emitTerraceBoxes` e
  `emitFinials` chiedono rispettivamente un intradosso con aria sotto, una
  sommita' scoperta con volume di fianco e una cella senza vicini in piano.
  Nessuna delle tre esiste su una scatola, quindi appiattire `CELL_TIERS`
  spegnerebbe tre famiglie di dettaglio senza che niente lo segnali. La sagoma
  e' la stessa in ogni cella: l'unica variabile dev'essere palette x superficie.
- **L'interasse e' governato dall'occlusione, non dallo spazio.** A `REST_PITCH`
  un voxel di quota si proietta in alto il doppio di un voxel di profondita', e
  la fila davanti nasconde `CELL_HEIGHT - cellPitch / 2` di quella dietro: con
  interasse pari all'altezza sparisce meta' di ogni provino. Un test lo fissa.

## Strade ed edifici

- Passi, scostamenti e larghezze della carreggiata stanno in `streets/config.ts`;
  cadenze, tetti e profili visivi in `buildings/config.ts`; gli spessori della
  grammatica — zoccolo, portale, coronamento, dettaglio sul tetto — in
  `buildings/config.ts::GRAMMAR`.
- Assi e lotti si allineano a `STREETS.align`, che e' il cubo di terreno: un
  edificio a meta' cubo si troverebbe sotto l'impronta due quote diverse dove il
  terreno e' piatto, e le opere gli metterebbero sotto un riempimento che nessun
  dislivello vero giustifica.
- La rete stradale e' una funzione pura di `(seed, x, y)`: niente stato, niente
  da salvare, niente da aggiornare quando arriva un catalizzatore.
- **La maglia c'e' ovunque, l'asfalto no**, e sono due cose diverse che si
  confondono facilmente: `streetGrid.ts` risponde per qualunque colonna del piano,
  ma a schermo esiste solo cio' che `surfaceQueue` ha dipinto, e si dipinge **per
  isolato** quando qualcosa lo giustifica. Due isolati contigui risultano
  collegati da soli — condividono la carreggiata che li separa, angoli compresi —
  mentre uno nato lontano da tutto sarebbe un rettangolo d'asfalto in mezzo al
  prato. A questo serve `streets/corridor.ts`: un isolato staccato si tira dietro
  la strada che lo attacca alla rete, lungo il percorso a costo minimo fra gli
  incroci della maglia. **Sceglie linee, non le inventa** — ogni tratto corre su
  un asse che il seed dichiara gia' — ed e' per questo che l'invariante qui sopra
  resta intatto: cio' che e' stato dipinto e' stato di chi dipinge, non della
  rete. Il terreno entra come **costo di un tratto** e non come divieto, come la
  disponibilita' entra in `lots.ts` come predicato: e' quello a far girare la
  strada attorno a una darsena invece di farla finire sul fondale, ed e' anche
  cio' che tiene il modulo verificabile in Node senza un'isola.
- Il `Builder` valida terreno e occupazione e costruisce a fasce nel budget;
  la generazione degli stamp resta deterministica.
- **Il `Builder` orchestra, i driver decidono.** Ogni sottosistema a tick ha un
  file proprio — `spanDriver`, `aerialDriver`, `landmarkDriver`, `upgradeDriver` —
  e riceve un `BuildContext` con le cinque cose che servono a tutti: mondo,
  terreno, strade, registry e le due code. `Builder.ts` tiene il ciclo (`onTick`,
  `step`), la nascita di un edificio sul lotto e le statistiche. Una passata nuova
  è un file nuovo più due righe nel costruttore, non un metodo in più su una
  classe che le ha già tutte.
- **Un voxel di edificio entra nel mondo da tre posti e basta**: `growthQueue`
  (i volumi, a budget), `surfaceQueue` (il suolo pubblico, a budget) e
  `siteWorks.buildWorks` (la fondazione, subito). È la forma stretta
  dell'invariante «nessuno scrive un muro all'infuori di qui»: vale per la
  cartella, e dentro la cartella vale per tre file. Se stai per chiamare
  `world.setBlock` da un driver, quasi sempre è il posto sbagliato.
- Ciò che **due** passate usano non sta dentro una delle due: `hierarchy.ts` (fin
  dove si può salire) e `urbanForm.ts` (il profilo locale tradotto in forma) le
  usano nascita e promozione insieme, e in due copie divergerebbero al primo
  ritocco di taratura. `chunkBudget.ts` e `siteWorks.ts` sono puri o quasi, e per
  questo hanno test propri invece di essere verificabili solo facendo crescere una
  città.
- **Le opere di terra si riempiono, non si scavano.** `grading/` decide cosa
  serve costruire perche' una colonna regga un piano — terrapieno, banchina o
  niente — e la quota finita e' sempre il massimo delle colonne, mai la media:
  livellare verso il basso toglierebbe isola, e un voxel tolto non torna. La
  battigia e il fianco in pendenza sono meta' della terra emersa, e senza opere
  la citta' li saltava del tutto.
- **Il terreno si paga, non si vieta.** `groundKindOf` classifica e
  `BUILD_WEIGHT` mette un prezzo; l'unico rifiuto rimasto sulla terra emersa e'
  la pendenza oltre `maxTerraceSlope`. La roccia piana **non** e' un rifiuto: lo
  era per bioma, e produceva l'unico no che dallo schermo non si spiegava — una
  mesa piatta respinta per la sola quota. Il bit `buildable` della `TerrainMap`
  resta, ma lo legge solo la scelta dei siti automatici in `sim/`.
- **Il terreno dice cosa regge, `sites/` dice cosa ci sta.** Sono due domande, e
  tenerle separate e' il motivo per cui il porto puo' pretendere la costa senza
  che la battigia torni vietata a tutti: `groundKindOf` risponde con un prezzo,
  `siteRefusal` con un si'/no che nessuna opera compra. Il vincolo e'
  un'etichetta sulla definizione del catalizzatore — `'coastal'`, `'open'`,
  `'any'` — e `src/sim/` non sa cosa significhi: la geografia la legge qui.
  I numeri stanno in `sites/config.ts`, e non vanno confusi con
  `BUILDER.coastalRadius`, che decide l'aspetto di una tipologia e non
  l'ammissibilita' di un piazzamento.
- Il candidato della simulazione designa **un luogo, non un indirizzo**: se il
  suo isolato e' pieno, `findLot` cerca in quelli attorno. Senza, su un campo
  saturo la crescita si ferma appena si riempie il primo isolato, perche' la
  simulazione ripropone all'infinito le stesse colonne.
- La **grammatica delle fasce e' una tabella**, `BAND_OP`, e il repertorio — quali
  trasformazioni provare e in che ordine — sta in `ClassProfile`, non nel codice
  di `generate.ts`. E' li' e non in `TypologyShape` perche' `typologyProfile`
  fonde gia' profilo dell'uso e profilo della tipologia: una riga di catalogo
  ridefinisce il repertorio senza plumbing. Il basamento non e' un caso speciale
  ma `keep` ripetuto, e il corpo sovrapposto e' `stack`, che si esaurisce da se'
  quando il risultato scenderebbe sotto `MIN_FOOTPRINT` — nessun contatore.
- La **cima e' una riga di catalogo**, non un ramo: `CROWN_KIND` ha cinque voci e
  i quattro ripieghi per uso ne portano una ciascuno, cosi' "coronamenti per uso"
  resta tabellare. Per livello lo fa `minLevel`, che vale anche senza profilo
  locale perche' `demandsPlace` non lo elenca.
- La **terrazza non e' una fascia in piu'**: e' la sommita' di una fascia dove
  quella sopra non arriva, e chiede `roofTech` per avere il parapetto che
  `emitRoofTech` gia' emette — il mesher non si tocca. Vale sul solo corpo: il
  coronamento e' gia' tetto, e pavimentarlo ridipingerebbe la copertura di ogni
  edificio a tetto piatto invece di aggiungere un luogo dove si sta.
- La **campata di facciata e' l'unico ritmo verticale, e sta in `paint` perche' la
  sagoma non ci arriva.** Le voci di `BAND_OP` spostano il rettangolo di uno o due
  voxel: con `MAX_FOOTPRINT` a otto e `GRAMMAR.minBandSide` a quattro il gioco
  totale e' due voxel per lato, e su una torre di livello massimo si esaurisce
  entro il primo quinto — misurato, un civico da 143 voxel scende a 4x4 alla quota
  7 e da li' in su puo' solo *scorrere*. Sopra restano ottanta voxel di parete, e
  a raccontare la scala c'e' solo lei. `ClassProfile.bayPeriod` conta i
  **montanti** e non le aperture, e non e' un dettaglio: un fronte da quattro —
  la larghezza a cui ogni torre alta finisce — ha due sole colonne fra i
  cantonali, e un passo contato sulle aperture puo' non trovarne nessuna.
- Il **passo della campata si conta dall'impronta, non dalla fascia.** Contandolo
  dalla fascia, un `jog` da un voxel farebbe scorrere di uno tutte le aperture del
  piano sopra e una torre di venti fasce tornerebbe rumore. Il cantonale resta
  sempre pieno — e' dove due fronti si incontrano ed e' dove `emitCornerPosts`
  appoggia il pilastrino. **La campata e' vernice**: stesso volume, stesse
  superfici, quindi la microgeometria emette esattamente i prismi di prima e
  collisione, budget di chunk e cancellazione non se ne accorgono. Costa solo
  greedy merge — su un chunk di quattro torri vere, 631 -> 901 quad base e
  dettaglio invariato a 1 710.
- **Un cluster e' due numeri su un record, non un'entita'.** Gli edifici
  adiacenti dello stesso fronte condividono la quota — che e' gia' `baseZ` — e
  l'altezza del corso di base, che e' `baseBand`; da li' `cluster` dice solo con
  chi. Non c'e' una struttura che sopravviva ai membri, quindi la collisione, il
  budget di chunk e la cancellazione restano per record e la simulazione continua
  a contare un edificio per record (invariante 7). Il basamento condiviso sta
  **dentro** lo stamp di ciascun membro: e' quello che tiene in piedi la
  rigenerabilita', perche' l'upgrade deve poter ricostruire la sagoma vecchia dal
  solo record per cancellarla.
- **Il rifiuto di una fila e' il gradino, non un fallimento.** `cluster.ts` e'
  puro come `grading/` e `sites/`: entrano un `GradePlan` e i termini dei vicini,
  esce una terna. Un lotto entra solo se non deve *scendere* per allinearsi —
  vale anche qui "si riempie, non si scava" — e se il riempimento resta dentro
  `CLUSTER.maxJoinFill`. Chi non entra apre una fila propria alla propria quota,
  ed e' cosi' che su un fianco l'isolato terrazzato esce dalla regola invece di
  essere disegnato. `GRADING.maxWorksStep` non andrebbe bene al posto di
  `maxJoinFill`: e' tarato sulla banchina che scende sul fondale, e metterebbe
  nella stessa fila due lotti separati da mezzo versante.
- **Una banchina e' il bordo costruito della terra, non un'isola artificiale.**
  `GRADING.maxQuayDepth` dice fin dove il fondale regge un muro, e su un
  bassofondo dolce dice di si' per una quindicina di colonne al largo: il
  vincolo di *forma* e' `GRADING.quayReach`, che il Builder applica sia alla
  carreggiata di un isolato costiero sia ai lotti. Senza, l'anello di strada di
  un isolato sul mare si costruiva tutto, e a schermo era una piattaforma
  rettangolare in mezzo all'acqua. A spingersi piu' al largo e' solo un molo,
  che ha una ricetta e quindi un limite proprio.
- Un **landmark e' un edificio con un altro generatore.** Vive in
  `landmarks/`, entra nel registry come `BuildingRecord` con `landmark`
  valorizzato, e da li' eredita occupazione, collisione, budget di chunk,
  comparsa a budget e avanzamento: l'unico ramo nuovo nel Builder e' quale
  generatore disegna lo stamp. `level` e' lo stadio, e i record con `landmark`
  restano fuori dagli istogrammi — la simulazione non li ha mai contati come
  edifici.
- Lo **stadio di un landmark e' cio' che la citta' gli ha costruito intorno**:
  il numero di record entro il raggio del catalizzatore, non la desiderabilita'.
  Un catalizzatore siede al centro della propria influenza, quindi il campo li'
  e' quasi sempre saturo e un landmark che lo leggesse salterebbe tutti gli
  stadi al primo tick. Non c'e' stato da tenere: lo stadio e' una funzione pura
  del contenuto del registry, e **non scende** quando uno sventramento porta via
  degli edifici.
- Un **landmark sventra per farsi posto**, e l'unica demolizione del progetto e'
  questa: non c'e' un bulldozer e non si demolisce fuori dal riquadro di una
  ricetta. La regola sta in `buildings/clearance.ts` ed e' pura; il cantiere in
  `landmarkDriver`. Tre cose da non rompere: si abbatte solo fino a
  `BALANCE.gameplay.catalyst.clearing.maxLevel` e il rifiuto e' **del riquadro
  intero**; la citta' in quota — un altro landmark, una mensola, un nodo, o
  l'edificio che li porta — ferma tutto, mentre le campate cadono; un record esce
  dal registry **solo** quando i suoi voxel non ci sono piu', o un lotto nasce
  dentro il volume che si sta cancellando.
- **Un riquadro che non regge la struttura non e' un rifiuto del piazzamento.**
  Il catalizzatore si piazza e il suo campo funziona lo stesso — due
  catalizzatori vicini che si sovrappongono sono il gesto che il gioco chiede —
  e la struttura ripiega sulla piazzola come per i ruoli senza ricetta. A dirlo
  prima del click e' il cursore, via `GrowthScene.catalystSite`.
- Le **ricette dei landmark sono dati**, non codice: `landmarks/parts.ts` ha
  dieci primitive piu' lo smusso — un campo, `Part.chamfer`, che taglia gli
  angoli della pianta di quasi tutte — e `landmarks/config.ts` le compone. Gli
  stadi sono **cumulativi dentro un ingombro che non cambia mai** — riservato per
  intero al piazzamento — quindi uno stadio non puo' restare bloccato da un
  edificio spuntato accanto, e la sagoma precedente non ha mai niente da
  cancellare. Aggiungere un ruolo e' aggiungere una riga; un ruolo senza riga
  ottiene la piazzola di ripiego e resta giocabile.
- Un ruolo ha **un tronco e piu' esemplari**, e l'esemplare non puo' togliere
  niente al tronco. `recipe.parts` si disegna sempre e dice *il ruolo*;
  `recipe.variants[n].parts` ci si somma sopra e dice *quale* porto. E' quello
  che concilia la varieta' con la nota storica di `landmarks/generate.ts` contro
  il PRNG: la leggibilita' del ruolo e' garantita per costruzione, non per
  disciplina di chi compila la tabella, e chi scrive un esemplare non puo'
  romperla nemmeno volendo. Ne segue la regola pratica: **una variante occupa
  spazio libero**, non ridisegna il tronco — chiedere lo smusso su un volume che
  il tronco ha gia' scritto pieno non toglie quei voxel.
- L'**esemplare e' funzione del seme del record**, con `LANDMARK.variantSalt` a
  separarlo dal verso. Senza sale sarebbero la stessa domanda: `record.seed` e'
  `hashCoords(worldSeed, x, y)`, ed e' lo stesso intero da cui il verso di
  ripiego esce con `& 3`. Il seme si calcola **prima** dello stamp e si conserva
  nel record, perche' un avanzamento di stadio deve ritrovare l'esemplare gia'
  scritto: due esemplari diversi non si coprono, e l'invariante «lo stadio nuovo
  copre il vecchio» cadrebbe.
- **Una campata non prende suolo.** E' l'invariante di `spans/`, e l'unica cosa
  che il modello dei landmark non sapeva gia' dire. Il registry tiene percio' due
  indici per colonna: `columns` con tutti i record — lo legge `overlaps`, quindi
  niente si costruisce **attraverso** una campata — e `groundColumns` con i soli
  record che poggiano davvero, che e' quello che legge `isOccupied`. Sotto un
  ponte la carreggiata si dipinge ancora e il lotto si costruisce ancora; se un
  edificio cresce attraverso la campata, a cedere e' la campata. Al suolo vince
  chi sul suolo ci sta.
- Una **campata e' un record con un flag**, come un landmark: `span` dice quale
  generatore disegna lo stamp e `supports` con chi. Da li' eredita collisione,
  budget di chunk e comparsa a budget senza una passata in piu', e resta fuori
  dagli istogrammi. L'unica assunzione che rompe e' che `baseZ` venga dal
  terreno — ed e' quella che la 4.9 dovra' rompere comunque.
- Una campata **atterra dove il corpo c'e', non al filo dell'impronta.** Gli
  edifici sono piramidali: la fascia zero riempie il riquadro e da li' in su ogni
  fascia rientra, quindi al bordo dell'impronta la parete esiste solo nei primi
  voxel — sotto qualunque franco. `highestLanding` cerca la parete **rientrando**,
  e la campata che ne esce e' piu' lunga del vuoto e sporge sopra le fasce basse
  dei propri appoggi. Per questo `overlaps` accetta un `except`: toccare cio' a
  cui si e' attaccati non e' una collisione. Il volume dev'essere comunque tutto
  aria, o cancellare la campata bucherebbe l'edificio.
- La **rete in quota e' un albero**, e non per eleganza: fra due campate possibili
  vince quella che unisce due componenti separate, e chi chiuderebbe un ciclo non
  si costruisce. E' cio' che rende il gate — un percorso continuo fra due isolati
  — una conseguenza della regola invece di una speranza. `spans/network.ts` tiene
  sia la decisione sia la verifica, apposta: due definizioni di "connesso"
  divergerebbero al primo refactor.
- **Le strutture grandi si spezzano, non si esentano.** `sliceStamps` ritaglia
  uno stamp piu' largo di `BUILDER.segmentSide`, e la coda `pending` ne fa
  comparire **uno per volta per struttura**: accodarli tutti insieme sporcherebbe
  comunque tutti i loro chunk nello stesso frame. Da qui `LANDMARK.maxDirtyChunks`
  non esiste piu' — i moli e le piste rispettano il tetto di ogni altra struttura
  invece di averne uno proprio.
- **La desiderabilita' dice *se*, la gerarchia dice *fin dove*.** Sono due
  domande e quindi due dati: `src/sim/` decide se una colonna merita di crescere,
  `skyline/` fin dove puo' salire — da distanza dai poli, dal mare e dal bordo
  dell'edificato. La ragione e' misurabile: il campo e' un `Uint8Array` che satura
  a 255 e l'ultima soglia di upgrade sta a 198, quindi sopra quel punto non
  *distingue* piu' due colonne del centro. Alzare `BUILDER.maxLevel` senza la
  gerarchia non da' uno skyline ma un altopiano piu' alto. `upgradeThreshold`
  resta percio' corto e si legge con `upgradeThresholdOf`, mai per indice.
- **Il tetto verticale e' un sistema, non un numero.** `maxLevel` va alzato
  insieme a `LEVEL_CAPS`, a `START_LEVEL_CDF` (una voce per livello: piu' corta,
  `startLevel` legge `undefined` e fa nascere *tutti* al livello massimo), a
  `maxDirtyChunksPerBuilding` — che si calcola, `2 x 2 x` piani di chunk, e non si
  stima — e a `GRAMMAR.minBandSide`, senza il quale la torre si assottiglia a un
  palo entro il primo terzo. Un test verifica che le tabelle indicizzate per
  livello siano lunghe `maxLevel + 1`: e' il difetto che si ripresenta a ogni
  cambio di scala, e non lancia niente.
- **Lo skyline e' un'eccezione governata.** Il livello massimo esce solo dalla
  somma di fascia, cono verso il polo ed elezione dell'isolato, e i tre coincidono
  di rado: i picchi sono pochi per costruzione. La proporzione della punta —
  diciannove a uno — e' dichiarata e non tollerata: `MAX_FOOTPRINT` non puo'
  salire senza allargare `STREETS.pitch`, perche' l'isolato piu' stretto e' largo
  quattordici colonne.
- **L'angolo dell'isolato cambia forma, non quota.** `blockForm.ts` dichiara il
  ruolo di un lotto — angolo, fronte, cuore — e `lotRole` e' un criterio di
  catalogo come gli altri: un campo, una riga in `accepts`, zero rami. **Non entra
  in `demandsPlace`**, perche' quello parla del profilo della simulazione mentre
  la maglia stradale c'e' sempre. Un bonus di **livello** sull'angolo e' stato
  provato e tolto: spegneva i montanti della citta' in quota, perche' chi ospita
  un impalcato smette di promuovere e cambiare il livello di nascita degli angoli
  cambia chi puo' fare da ospite. Per la stessa ragione il **cuore dell'isolato si
  lascia stare**: `aerial/` lo tiene libero apposta.
- **Uno sbalzo non prende suolo.** E' il terzo invariante della stessa famiglia,
  dopo quello di `spans/` e quello di `aerial/`, e sostituisce la riga che la
  grammatica dichiarava: non piu' «nessuna fascia esce dall'impronta» ma **nessuna
  fascia esce dall'inviluppo, e l'inviluppo non prende suolo**. Il record entra in
  `columns` sull'inviluppo — niente si costruisce *attraverso* uno sbalzo — e in
  `groundColumns` sulla sola impronta, quindi sotto ci passa ancora la carreggiata
  e accanto nasce ancora un lotto. `envelopeOf` e' l'unico posto in cui i due
  riquadri si distinguono; `index` li scrive con **un ciclo solo e un test
  dentro**, perche' due cicli divergerebbero al primo ritocco.
- Lo sbalzo va **verso `facing` e da nessun'altra parte**, e un edificio senza
  fronte strada non ne ha uno. Non e' prudenza: un inviluppo simmetrico farebbe
  collidere due membri di una stessa fila, e l'aggregazione in isolati cadrebbe.
  A vietare a un `jog` di sporgere dalla parte del vicino non c'e' un controllo:
  c'e' **dove l'impronta siede dentro l'inviluppo**, che e' una posizione.
  `overhangFor` e `groundSideOf` sono la stessa aritmetica letta nei due versi, e
  stanno in un posto solo perche' nascita, promozione e cancellazione devono
  ricavarne lo stesso numero.
- Lo **sbalzo si decide alla nascita e non si rinegozia**, come la fila e il corso
  di base: un edificio che mettesse fuori un balcone promuovendo dovrebbe
  riverificare l'inviluppo, e fallendo cambierebbe sagoma sotto a chi ci si e'
  appoggiato. Al piazzamento invece **si negozia**: se a bloccare e' la sola
  striscia sopra il marciapiede, l'edificio ci rinuncia e sale diritto invece di
  perdere il lotto. Regge perche' `overhang` allarga il solo *filtro* di
  `nextRect` — le candidate si costruiscono tutte comunque — quindi lo stesso seme
  consuma gli stessi tiri e la sagoma senza sbalzo e' esattamente quella di prima.
- Lo **smusso e' un modificatore di pianta, non una primitiva**, e vive in
  `src/world/planMask.ts` perche' lo usano edifici e landmark insieme. Si limita
  **per fascia** e non per edificio: il taglio di Manhattan toglie `chamfer` a
  ciascuno dei due assi, quindi su un lato da quattro uno smusso da due lascia in
  piedi un palo da due — e una torre scende a `minBandSide` entro il primo quinto,
  quindi non e' un caso raro.
- Lo **stile e' del quartiere, la tipologia dell'edificio**, e sono due
  dimensioni ortogonali. `STYLES` ridipinge quattro slot di **tessuto** — corpo,
  cornice, zoccolo, coronamento — e la stessa riga vale per qualunque uso;
  `accent`, `terrace`, `garden` e `roofProp` restano alla tipologia, perche' il
  tessuto dice *dove* si e' e l'accento *cosa si fa*. Lo stile si applica **dopo**
  la tipologia: prima, ogni riga di catalogo che dichiara un colore — quasi tutte
  — cancellerebbe il quartiere.
- Lo **stile e' una funzione pura di `(seed, quartiere)`**, come la maglia
  stradale: niente stato, niente da salvare, e coerenza d'isolato per costruzione
  invece che per disciplina. **Non e' agganciato al distretto**, e non per gusto:
  `districtOf` risponde `outskirts` finche' due ruoli non si sovrappongono — cioe'
  quasi ovunque — e soprattutto il distretto **cambia mentre la citta' cresce**,
  quindi la sagoma da cancellare cambierebbe sotto i piedi di chi la cancella.
  Per la stessa ragione `record.style` viaggia col record accanto a `typology`.
- Uno **stile e' una materia, non una tinta.** I 32 slot sono famiglie di
  materiale e il colore lo scrive il tema, che e' globale: un isolato rosa
  accanto a uno azzurro vorrebbe slot nuovi (invariante 4). Un isolato di mattoni
  accanto a uno di vetro no, e a distanza di gioco dice la stessa cosa in tutti e
  sette i temi.
- Il **catalogo delle tipologie** e' una tabella in `buildings/config.ts`:
  condizioni sul luogo piu' forma. Aggiungere una tipologia e' aggiungere una
  riga — la regola di scelta in `typology.ts` e' generica e non va toccata, e la
  grammatica in `generate.ts` non sa che le tipologie esistono. Ogni uso chiude
  il catalogo con un ripiego senza condizioni, cosi' la scelta non puo' fallire.

## La campagna

- **Un lotto agricolo non e' un ostacolo, e non sta in nessuno dei due indici del
  registry.** E' la differenza con landmark, campate e citta' in quota, che sono
  «un record con un flag» dentro il `BuildingRegistry`: quelli scelgono *quale*
  dei due indici li tiene — `columns` per chi non si puo' attraversare,
  `groundColumns` per chi prende suolo — mentre un campo non appartiene a
  nessuno dei due. In `columns` impedirebbe di costruirci sopra, in
  `groundColumns` impedirebbe perfino di passarci una strada, e la meccanica di
  questa fase e' esattamente che **la citta' si mangia i propri campi**. I lotti
  hanno percio' un registro loro, `farms/FarmRegistry.ts`, che risponde a una
  domanda sola: qui si e' gia' piantato? Aggiungere un quinto tipo di record con
  regole d'indice tutte sue a un file di settecento righe sarebbe costato di piu'
  e avrebbe indebolito un invariante che ne regge quattro.
- **Chi cede e' sempre il campo.** Al suolo vince chi sul suolo ci sta — la
  stessa riga che vale per le campate — quindi il `farmDriver` non difende
  niente: rilegge le proprie colonne, e quando `FARMS.minFreeShare` non e' piu'
  rispettata ritira il lotto. Non c'e' una demolizione nuova, e non deve
  essercene una: `clearance.ts` resta l'unica del progetto.
- **Un campo entra nel mondo dalla coda della superficie, non da uno stamp.** Non
  e' una scelta di comodo ma di formato: uno stamp porta indici di palette e
  `STAMP_EMPTY` vale 0, mentre un marcatore di copertura **e'** palette 0 —
  inesprimibile in quel linguaggio. La coda del suolo invece dipinge colonne, che
  e' cio' che fa un campo, e ci porta in dote la priorita': `FARM_PAINT_PRIORITY`
  vale 0, sotto la carreggiata secondaria, quindi una strada che ripassa su un
  lotto vince sempre. In `SurfacePaint`, `palette` a **0** significa «lascia il
  suolo dov'e'», e `cover` a **0** significa «togli il marcatore» — non «non
  toccare», che si dice con `undefined`.
- **Il terreno di un campo non si ridipinge.** Non esiste uno slot di terra arata
  e non se ne aggiunge uno (invarianti 4 e 5): a leggere come campo, a distanza
  isometrica, e' la **regolarita' dei solchi** e non il colore del suolo. E' lo
  stesso argomento della roccia — a dare varieta' e' il ciglio, non la tinta.
- **L'asse del solco sta nel marcatore, non in un hash.** Le altre coperture
  prendono una delle quattro giravolte dalla posizione della colonna, che per un
  ciuffo e' giusto — un prato tutto nello stesso verso e' carta da parati — e per
  un campo e' rovinoso: solchi orientati a caso non sono un campo, sono rumore
  verde. `COVER.cropX` e `COVER.cropY` portano quindi il verso, e il mesher
  continua a non sapere che i lotti esistono. Il solco e' anche l'unica forma di
  copertura che **attraversa** la propria cella da bordo a bordo, o due colonne
  contigue non si salderebbero in una fila sola.
- Il costo e' misurato e non stimato: un chunk arato per intero fa **5120 quad**
  di dettaglio contro un tetto di 16384, ed e' `FARMS.rowPitch` a tenerlo li'.
  Dimezzare il passo raddoppia il conto.
- **Un frutteto passa dalla coda della crescita, un campo da quella del suolo**,
  e non e' un'incoerenza: sono due cose diverse. Un campo e' superficie, un
  frutteto e' un migliaio di voxel di volume, e consegnandolo come stamp eredita
  budget, affettamento e cancellazione che la coda ha gia' — invece di aggiungere
  un quarto posto da cui i voxel entrano nel mondo. Il ritiro e' la stessa strada
  di un upgrade: uno stamp vuoto con il volume vecchio come `erase`.
- Il lotto agricolo non ha un `BuildingRecord`, quindi non ha nemmeno un `id`: nella
  coda della crescita prende un **identificatore negativo**, derivato dalla propria
  posizione. E' uno spazio che il contatore del registry non raggiunge mai, e
  serve solo a distinguere due frutteti fra loro.
- **La specie da frutto non compare in `FLORA`**, ed e' cio' che le permette una
  sagoma che in natura non si spiegherebbe: bassa, tonda, larga uguale — potata.
  A dire «coltivato» e' la **regolarita' del reticolo** contro il jitter del bosco
  vero, non la specie. Il passo del reticolo e' dedotto dal raggio della chioma e
  non e' calibrazione: cambiare il profilo della specie senza cambiare il passo fa
  toccare le chiome.
- Il disegno di un albero sta **una volta sola** in `terrain/decor.ts`: `drawTree`
  e' il corpo senza destinazione, `writeTree` lo manda nel mondo e il frutteto in
  uno stamp. Ritaglio, controllo dell'aria e conteggio appartengono a chi scrive,
  non a come e' fatto un albero.

## La citta' in quota

- **Un impalcato in quota non prende suolo; lo prende solo la gamba che scende a
  terra.** E' l'invariante di `aerial/`, complemento esatto di quello di `spans/`.
  Sotto una mensola la carreggiata si dipinge ancora e i lotti si costruiscono
  ancora: e' una riga di `index()`, dove solo `AERIAL_PART.pier` entra in
  `groundColumns`.
- **La mensola e' la prima cosa che esce dall'impronta.** La grammatica degli
  edifici dichiara il contrario — «nessuna fascia puo' uscire dall'impronta e la
  collisione fra edifici resta bidimensionale» — e l'aggetto rompe proprio quella
  riga. E' legale perche' `overlaps` confronta gia' gli intervalli di quota
  colonna per colonna; e' per questo che chi lo scrive **eccettua l'ospite** dalla
  collisione, invece di spostare la mensola fuori dal riquadro.
- **Nessuna quota e' imposta da fuori, e per questo qui non esiste `align`.** La
  mensola prende la quota dalla sommita' di una fascia dell'ospite, la gamba dal
  primo appoggio che trova scendendo. Un lotto in quota eredita la fase
  dall'impalcato che lo ospita, non dal cubo di terreno — la stessa ragione per
  cui le campate `align` l'hanno gia' tolto.
- **Dove l'ancoraggio non arriva, nasce una gamba**, e non c'e' una regola per
  ciascuna forma: `planDeck` misura lo sbalzo di ogni colonna e pianta un appoggio
  dove supera `AERIAL.reach`. Ne segue senza codice in piu' che una mensola corta
  non ha gambe e una profonda se le conta da sola. Una gamba **si sposta per
  trovare un tetto** prima di piantarsi nel prato: e' cio' che tiene i cuori
  d'isolato liberi per la piazza della 4.5.
- **Chi regge non cresce.** Il guinzaglio di un impalcato tira al contrario di
  quello di una campata: `upgradePass` salta chi porta. Ospitare e' quindi una
  rinuncia, e la soglia che la governa e' `AERIAL.minHostLevel` — dove sta anche
  la misura per cui la regola piu' ovvia («aspetta che abbia finito di crescere»)
  non funziona su una citta' che cresce.
- **Il livello si risolve dove si risolve il lotto.** `TerrainMap` resta una
  quota e un bit per colonna; `decksAt` legge dal registry, e in quota **il lotto
  e' l'impalcato** — niente `findLot`, niente opere di terra, niente fila.
  `src/sim/` non guadagna una coordinata verticale: conta le quote spese
  (`stack`) e chiede al mondo quante ce ne sono (`headroomAt`).
- **La mensola nasce sulla prima fascia utile del fronte strada, e il verso della
  scansione e' la regola.** `faceRuns` cerca dal basso in su: la prima corsa e' la
  sommita' del basamento, che la 4.4 rende condivisa da tutta la fila, quindi due
  vicini sono complanari **per costruzione** — senza `align` e senza una griglia
  imposta da fuori. Cercando dall'alto ogni ospite si prendeva la propria fascia
  piu' alta, e la rete non esisteva. Il fronte strada e' l'altra meta': li' il
  corridoio di un percorso corre sopra la carreggiata invece che sopra i corpi.
- **Dove non c'e' una fascia da continuare, la mensola e' un balcone.** Meta'
  della citta' sale a prisma dentro il corso di base condiviso e non arretra
  affatto: centoquarantasette ospiti su quattrocento non avevano una sola corsa
  utile. Il ripiego su facciata piena e' cio' che rende le mensole abbastanza
  fitte da guardarsi.
- **Il balcone su facciata piena non parte da `minRise`, e non e' la stessa regola
  della riga sopra.** Dove una fascia rientra la quota e' un fatto dell'ospite, e
  la scansione dal basso e' quella che rende complanari due vicini; dove la
  facciata e' piena non c'e' nessuna fascia da rispettare, e prendere comunque la
  quota piu' bassa attaccava il balcone a tre cubi dal marciapiede — su una torre
  di trenta cubi una pensilina, non un piano in facciata. Il ripiego parte allora
  da `AERIAL.terrace.facadeRise` dell'altezza dell'ospite, e le quote successive
  si **distribuiscono** sul fronte invece di impilarsi: le tre mensole di un
  ospite stavano tutte dentro nove voxel.
- **La forma di una mensola sta in `terraceForm.ts`, ed e' pura.** Erano tutte lo
  stesso quadrato, e non per caso: `overhangOf` legava lo sporto alla lunghezza
  della corsa, e dentro i due estremi quella riga e' l'identita'. Resta come
  misura di riferimento; il riquadro ora si dispone dentro la corsa in una di
  quattro forme — balcone, loggia, ala, sperone — scelta da un hash di ospite,
  faccia e quota. Puo' scorrere lungo la corsa ma **non uscirne**: oltre i capi non
  c'e' piu' parete a cui appendersi. Ne segue anche la varieta' delle gambe, che
  nessuno decide: `planDeck` le pianta dove lo sbalzo supera `reach`.
- **La mensola e' l'unica forma in quota con una sezione asimmetrica, e la ragione
  e' che ha un davanti.** Un tratto e un nodo stanno appesi ai propri capi e non
  hanno un verso rispetto a cui calare; una mensola esce da una parete, e da
  quella parete alla punta la travatura cala — tre voxel dove scarica, uno
  all'estremo — con i due angoli esterni smussati. `generateDeck` sceglie fra le
  due sezioni guardando `plan.anchors`, che il piano si porta dietro apposta. Il
  parapetto segue la sagoma smussata e non il riquadro, e il mesher non si tocca:
  `emitRoofTech` emette gia' solo dove un tetto tecnico confina con l'aria.
- **Chi si appende a una mensola la inchioda, non solo chi ci abita.** Un tratto
  di percorso puo' avere per capo — o per appoggio di una gamba — una mensola, e
  `releaseDecks` la faceva cadere lo stesso quando l'ospite promuoveva: il tratto
  restava con un `supports` che non risolve piu'. La domanda giusta e'
  `registry.carries`, cioe' lo stesso guinzaglio che un edificio si sente tirare
  prima di promuovere, posto un piano piu' in alto.
- **Il colmo di un percorso e' un tetto, non un pavimento.** La corsa parte dalla
  quota dei due capi e si alza di un pianerottolo per volta finche' il luogo la
  accetta; `crestOf` dice solo fin dove ha senso salire, e si misura sui
  **riquadri veri dei pezzi** — e' quello che ha reso possibile la piega a zeta,
  il cui tratto di traverso sta fuori dal corridoio della corsa.
- **La guida e' una cosa sola posata in due modi.** In verticale e' il montante
  d'isolato (`AERIAL_PART.lift`), che sale da terra a un impalcato **abitato** ed
  e' la sola risposta al «ci si muove fra i livelli» del gate; in orizzontale e'
  un file di rotaia incassato nel piano di un tratto di percorso, che non e' ne'
  un record ne' un voxel in piu'. Niente si muove: le capsule sono voxel fermi.
- **Il montante sta sul marciapiede, una gamba no.** Non e' una concessione ma
  l'unico posto disponibile: sotto una mensola sul fronte strada c'e' o il
  proprio ospite o l'asfalto. E' il terzo parametro di `surveyFooting`.

## Opere di terra e acqua

- **L'opera si getta sotto cio' che la struttura occupa, non sotto il riquadro.**
  `buildWorks` e `surveyGrade` accettano una maschera per colonna
  (`stampFootprint` fino a `LANDMARK.groundBand`). Senza di lei il riquadro di un
  porto — per meta' specchio d'acqua — finiva tutto alla quota della banchina, e
  quello che si vedeva era una piattaforma rettangolare in mezzo al golfo con
  dentro una pozza piu' alta del mare che la circondava. **La darsena e' il mare
  che c'era**: la ricetta la ottiene non disegnando niente.
- `LANDMARK.groundBand` separa cio' che **poggia** da cio' che **sporge**: il
  braccio di una gru passa sopra il bacino a tredici voxel d'altezza, e contarlo
  vorrebbe dire riempire di terra l'acqua che sorvola. Chi scrive una ricetta
  costiera deve quindi tenere sotto quella quota solo cio' che vuole veder
  diventare terra ferma.
- Il **grembiule si ferma sulla battigia**: il suolo pubblico e' suolo, e
  prolungarlo sul bassofondo — che `canPaint` ammette, perche' una banchina ci si
  costruisce — dipingeva un anello di asfalto sul fondale attorno a ogni porto,
  visibile in trasparenza sotto il pelo dell'acqua.
- **La bonifica del decoro non tocca l'acqua, ed era lei a scavarla.**
  `clearDecorColumn` sale di `BUILDER.decorClearanceHeight` — venti voxel, la
  conifera piu' alta — a partire dalla quota del terreno; su una colonna
  sommersa quella quota e' il **fondale**, quindi cancellava tutta l'acqua sopra
  di esso. Il difetto e' vissuto a lungo senza test perche' l'opera di terra
  riempiva subito dopo le stesse colonne. A dire «sommersa» e' il **bioma**
  (`isDryLand`) e non il confronto fra quota e specchio: e' la stessa ragione per
  cui quella funzione esiste.

## Landmark su un tetto

- **La presenza di un edificio sotto la colonna sceglie la ricetta.** L'aeroporto
  e' l'unico ruolo con due forme — il campo di volo e lo scalo in quota,
  `SKYPORT` — e non ha un secondo strumento: puntare un grattacielo *e'* la
  richiesta di uno scalo sul tetto, puntare il prato accanto quella di una pista.
  E' l'unica scelta di forma di questo dominio che dipende dal luogo invece che
  dal seme, e non poteva essere un esemplare: un campo di volo largo ventisei
  colonne non sta su nessun tetto, perche' `MAX_FOOTPRINT` e' otto.
- Un landmark in quota e' un record con `aloft`, la quarta riga della stessa
  macchina di `landmark`, `span` e `aerial`. Non prende le colonne di suolo —
  sotto ci passa ancora la carreggiata — e mette il proprio ospite fra quelli che
  **non promuovono**: chi regge non cresce, come per una mensola.
- Non ha ne' opera di terra ne' grembiule, e le due assenze sono la stessa cosa
  detta due volte: **qui sotto non c'e' terreno**.

## Arcologie

- **E' la quinta riga della stessa macchina**, dopo `landmark`, `span`, `aerial`
  e `aloft`: un `BuildingRecord` con `arcology` valorizzato eredita occupazione,
  collisione, budget di chunk e comparsa a budget, e a cambiare e' solo quale
  generatore disegna lo stamp. `level` e' lo **stadio**, come per un landmark, e
  il record sta fuori dal `levelHistogram`.
- **Non si posa: nasce da una condizione.** Non c'e' nessuno strumento in
  toolbar e nessuna riga in `src/sim/`. Le leve del giocatore restano quelle che
  ci sono gia' — dove piazza i catalizzatori, quali policy tiene accese — e
  `arcologyReady` legge cio' che ne e' venuto: fascia `core`, isolato che
  contiene l'ingombro, densita' costruita e **quota ammessa gia' satura nei
  vicini**. Quest'ultima e' la mezza riga che rende la fase quello che dice di
  essere: la megastruttura arriva dove la citta' non ha piu' niente da diventare,
  non dove e' semplicemente densa.
- **Gli usi arrivano alla simulazione uno per fascia, su colonne distinte.**
  `record.uses` e' l'elenco di cio' che `addBuilding` ha **accettato**, in ordine
  di stadio: `tally` conta quelle voci invece della `class` del record, ed e'
  cosi' che `countsByClass` resta esattamente uguale a `state.buildingCounts`
  (invariante 7) mentre `src/sim/` continua a non avere una coordinata verticale.
  Un'arcologia e' quindi *un* record e *N* edifici per la simulazione:
  `registry.count` e `state.buildings.length` non coincidono, e la differenza e'
  esattamente la somma degli `uses`.
- **Cresce per delta, non per sagoma cumulativa.** L'inviluppo e' alto quasi
  duecento quote e non entra in `maxDirtyChunksPerBuilding` nemmeno da lontano:
  ogni stadio accoda il proprio `from = stage`, e `trimStampZ` taglia le quote
  vuote perche' la stima sul riquadro sia onesta. Senza il taglio una ricetta
  legittima verrebbe **scartata in silenzio**.
- **Il vuoto dentro l'ingombro e' un vincolo di ricetta.** `skyWindowOf` e
  `fillRatio` girano su ogni ricetta a ogni stadio: una finestra aperta non si
  richiude piu', e un'arcologia che riempie il proprio ingombro non compila la
  suite.
- **I piazzali sono capi di percorso, e hanno tre requisiti misurati.** Devono
  stare entro `maxNodes * stepPerNode` dal piano finito, essere larghi almeno
  `walkWidth` su **tutti e due** gli assi, e non partire a filo di un piano
  solido della struttura — altrimenti la corsia nasce dentro il podio. Ognuno dei
  tre e' stato violato da una versione della ricetta con la suite pura tutta
  verde.

## La funivia

- **Una campata di fune non prende niente**, ed e' l'invariante del dominio:
  l'opposto esatto di quello di `crossings/`, dove «un attraversamento prende
  suolo» con le pile nel fondale. Qui a terra ci sono solo le due torri; fra loro
  non c'e' impalcato, non c'e' carreggiata e non c'e' pila. E' per questo che
  `ROPEWAY.maxLength` vale il doppio di `CROSSINGS.maxLength`: senza un impalcato
  da reggere, il limite non e' piu' strutturale ma di gioco.
- **La fune non e' materia**, e vale per lei la regola di `traffic/` invece di
  quella delle strutture: e' spessa meno di un voxel, e scriverla a cubi lungo
  centonovanta colonne darebbe una scaletta al posto di un cavo — con la pancia,
  che e' l'unica cosa che la distingua da un tirante, ridotta a una gradinata. La
  calcola `ropewayPlan.ts` come spezzata e la disegna `engine/RopewayView.ts`.
  Non ha un record, non occupa colonne e non compare a budget.
- **Due torri e nessun pilone, e non e' una tabella lasciata a meta'.** Fra le
  due rive non c'e' niente su cui piantare un appoggio, e sull'avvicinamento non
  c'e' spazio — la stazione arretra proprio perche' li' la citta' e' costruita.
  Il pilone intermedio e' roba da linea di montagna, e quando servira' sara' la
  seconda voce di `ROPEWAY_PART`.
- **La stazione arretra invece di rifiutare.** Il lungomare di una citta'
  cresciuta e' costruito: pretendere la piazzola sulla battigia rifiuterebbe la
  funivia proprio dove la citta' c'e'. `seekPad` cammina all'indietro fino a
  `maxSetback` e prende la prima buona, che e' anche la piu' vicina all'acqua.
- **Il franco si misura sulla prima quota libera, non sul terreno.** `top` dice
  la sommita' di cio' che c'e' — un prato, un bosco, un tetto — e la freccia
  entra *dentro* il massimo invece di essere sommata alla fine: sommarla dopo
  alzerebbe anche le torri, dove la fune non pende affatto.
- Il **limite noto**: un edificio che cresce *dopo*, sotto la corsa, non alza la
  fune. E' il prezzo di una linea che non ha una colonna a registro fra i due
  capi, ed e' un difetto visibile e onesto — la citta' cresce attorno a una linea
  che il giocatore ha deciso, non attraverso di lei.
- Il **drop della cabina e' l'unico numero condiviso fra due domini**:
  `ROPEWAY.cabinDrop` deve valere `TRAFFIC.hull.gondola.height +
  TRAFFIC.gondolaHanger`, perche' la regola alza la fune di quel tanto e la
  sagoma la disegna scendendo di quel tanto. A tenerli fermi c'e' un test, come
  per la copia TS e quella GLSL del modello di luce.

## Cio' che si muove

- **Il traffico non e' materia.** Barche, navi, aerei e dirigibili di `traffic/`
  non sono voxel e non devono diventarlo: scriverne uno nel `VoxelWorld` e
  riscriverlo al frame dopo marcherebbe sporchi i chunk della costa sessanta
  volte al secondo, cioe' rimeshare mezza isola per far navigare una barca. Qui
  si calcola **dove sta** un mezzo a un certo istante; a disegnarlo e'
  `engine/TrafficView.ts`, con mesh proprie fuori dal volume voxel.
- **La posa e' una funzione del tempo, non un'integrazione.** Non c'e' stato che
  avanza di `dt` in `dt`: una rotta e' una spezzata piu' un periodo, e la
  posizione e' una lettura. Ne discendono tre cose che l'integrazione non
  darebbe gratis — due partite identiche mostrano le stesse barche negli stessi
  punti, un frame perso non sposta niente, e la velocita' di gioco si applica
  moltiplicando un orologio invece che ritarando delle accelerazioni.
- **Le navi vengono da fuori, quindi devono poter non esserci.** Il capo lontano
  di una rotta `offworld` non e' un capolinea, e' il **bordo del mondo**: chi ci
  arriva sparisce — `poseAt` risponde `null`, `posesAt` lo lascia fuori
  dall'elenco — e la sosta del pendolo diventa il tempo che passa fuori. Una nave
  che invertiva la marcia in mezzo al mare in piena vista diceva l'esatto
  contrario di cio' che il porto promette, cioe' che un fuori non c'e'. Chi
  disegna non ha imparato niente: gli arriva un mezzo in meno, e il pool nasconde
  la mesh in eccesso come faceva gia'.
- **Il fumo e' la stessa posa letta nel passato.** Uno sbuffo di `plume.ts` non e'
  una particella con una velocita' da integrare: e' dov'era la nave `age` secondi
  fa — che `poseAt` sa gia' rispondere — piu' una salita e una deriva lineari. Ne
  discende, gratis, tutto quello che discende dalle pose: in pausa il fumo si
  ferma, a 4x accelera, un frame perso non lascia un buco nella scia. E' anche il
  motivo per cui la scia e' *giusta* invece che verosimile — uno sbuffo resta
  dove la nave l'ha lasciato perche' li' la nave c'era davvero. Dove esce lo dice
  `TRAFFIC.funnel`, la stessa voce da cui `engine/vehicleHulls.ts` prende il
  fumaiolo: due misure separate si scoprirebbero divergenti da uno screenshot.
- **Una rotta si ricalcola quando cambia la citta', non quando passa un frame.**
  Cercare una rotta di mare visita qualche migliaio di celle: `GrowthScene` la
  rifa' solo quando cambia il numero di landmark o di catalizzatori.
- **Gli ormeggi li dichiara la ricetta**, non il traffico: sono coordinate della
  forma — il bordo di una darsena che `landmarks/config.ts` disegna — e tenerle
  altrove vorrebbe dire due file da correggere ogni volta che un molo si sposta
  di una colonna, con il difetto visibile solo a schermo. Un test verifica che un
  ormeggio da barca **non** cada su una colonna che l'opera di terra riempie.
- **La rotta di mare aggira la terra.** I due capi di una linea stanno sulla
  costa per definizione, e due punti di costa vicini hanno quasi sempre un pezzo
  d'isola in mezzo: e' proprio la forma che rende utile un traghetto. Dove non
  c'e' acqua fra i due, la linea resta **senza barca** invece di farne passare
  una dentro la collina — un difetto visibile e onesto, non un blocco.

## Verifica

- Esegui `npm run typecheck` e `npm test`.
- Per streaming/generazione esegui anche `npm run build` e verifica i budget con
  `?debug=1&terrain=1337`; non aggiornare misure per stima.
