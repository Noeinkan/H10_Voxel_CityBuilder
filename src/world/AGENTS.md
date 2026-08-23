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
  `maxHeight` consuma il margine di Lipschitz. **L'invariante e' in celle**: due
  celle adiacenti non differiscono di piu' di una cella, cioe' `cellSize` voxel,
  e dentro una cella il dislivello e' zero per costruzione.
  `heightField.test.ts` misura il margine sul campo continuo,
  `IslandGenerator.test.ts` lo verifica sulle quote quantizzate.
- **La sagoma e' dichiarata, il rumore fa la grana.** `terrain/landform.ts`
  compone l'isola da elementi con un nome — lobi che allungano la costa, rilievi
  che spostano le vette dal centro, conche che aprono un lago — perche' rumore
  isotropo per maschera radiale da' una cupola, e le fasce di bioma le vengono
  fuori a cerchi concentrici per costruzione. Tutto e' funzione pura di
  `(seed, shape)` e **ignora le `extensions`**: un settore costiero comprato a
  partita in corso non deve spostare niente altrove, o le colonne gia' generate
  non si raccorderebbero piu' con quelle nuove.
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
- Il **catalogo delle tipologie** e' una tabella in `buildings/config.ts`:
  condizioni sul luogo piu' forma. Aggiungere una tipologia e' aggiungere una
  riga — la regola di scelta in `typology.ts` e' generica e non va toccata, e la
  grammatica in `generate.ts` non sa che le tipologie esistono. Ogni uso chiude
  il catalogo con un ripiego senza condizioni, cosi' la scelta non puo' fallire.

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
- **La rete e' meta' fatta, e il limite e' scritto nei test.** Un percorso dritto
  fra due mensole allineate funziona; la piega a zeta e' stata **tolta** perche' i
  suoi pianerottoli cadevano in punti che il corridoio dritto non misura, e su
  settecentocinquanta coppie di una citta' cresciuta non ne reggeva nessuno. Su
  quella stessa citta' i percorsi restano **zero**: le mensole ci sono ma non si
  guardano mai. Chi riprende da qui parta da li', non dal planner.

## Verifica

- Esegui `npm run typecheck` e `npm test`.
- Per streaming/generazione esegui anche `npm run build` e verifica i budget con
  `?debug=1&terrain=1337`; non aggiornare misure per stima.
