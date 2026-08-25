# Strade ed edifici

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- Passi, scostamenti e larghezze della carreggiata stanno in `streets/config.ts`;
  cadenze, tetti e profili visivi in `buildings/config/`; gli spessori della
  grammatica — zoccolo, portale, coronamento, dettaglio sul tetto — in
  `buildings/config/grammar.ts::GRAMMAR`.
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
- Il **catalogo delle tipologie** e' una tabella in `buildings/config/typologies.ts`:
  condizioni sul luogo piu' forma. Aggiungere una tipologia e' aggiungere una
  riga — la regola di scelta in `typology.ts` e' generica e non va toccata, e la
  grammatica in `generate.ts` non sa che le tipologie esistono. Ogni uso chiude
  il catalogo con un ripiego senza condizioni, cosi' la scelta non puo' fallire.
- **`accepts` e `typologyGapsOf` sono due letture della stessa regola**, e a
  tenerle insieme non c'e' la disciplina di chi le modifica ma il test di
  equivalenza che percorre tutto il catalogo su una griglia di luoghi. Sono due
  traversate di proposito: `accepts` sta nel percorso caldo — l'intero catalogo,
  per ogni edificio posato — e restituire un vettore li' allocherebbe a ogni
  posa. Se aggiungi un ramo all'una, aggiungilo all'altra; il test lo dira'
  comunque, ed e' il primo posto in cui guardare quando cade.
- **Cio' che il giocatore non puo' fare non si nomina.** `bestProspectOf` scarta
  le righe bloccate sul ruolo di lotto o sull'uso ospitato: sono condizioni vere
  ma non sono gesti, e prometterle manderebbe a cercare una mossa che non
  esiste. E' il difetto opposto a quello che quella funzione corregge.
