# Changelog

Cosa è cambiato, dal più recente. Il *perché* delle scelte sta in
[README.md](README.md) e in [src/sim/README.md](src/sim/README.md); *dove sta
cosa* in [PROJECT_INDEX.md](PROJECT_INDEX.md); dove va il progetto in
[ROADMAP.md](ROADMAP.md).

Il progetto non è ancora versionato: ogni voce è un incremento, identificato dal
commit che lo chiude. Le voci descrivono il contenuto effettivo, che non sempre
coincide con il messaggio di commit.

---

## In corso — L'isola prende una forma: lobi, colline e laghi

L'isola era **una cupola**, e non per caso: un rumore isotropo moltiplicato per
una maschera radiale non può dare altro. Le fasce di bioma ne uscivano come
cerchi concentrici — il bersaglio che il commento di `warpAmount` dichiara da
sempre di voler evitare — con una vetta sola, sempre al centro, dentro una costa
quasi circolare. La differenza fra due seed era dove cadevano le creste, non che
isola fossero.

- **La sagoma è dichiarata, il rumore fa la grana.** `terrain/landform.ts`
  compone l'isola da elementi con un nome: due o tre **lobi** che allungano la
  costa in poche direzioni, due o quattro **rilievi** che spostano le vette fuori
  dal centro, una **conca** che apre uno specchio d'acqua interno. Puro come la
  rete stradale, funzione di `(seed, shape)` e nient'altro.
- **Nessun elemento dichiara un'altezza: dichiara un raggio.** L'altezza gliela
  detta `capForRadius` dal budget di pendenza, perché una cupola di ampiezza `a`
  e raggio `R` ha pendenza massima `π/2 · a / R` e il margine di Lipschitz è
  l'unica cosa che tiene il terreno a celle senza dirupi. È la stessa regola che
  `maxReliefSlope` applica all'isola intera, letta un elemento per volta — ed è
  anche perché una penisola è bassa e larga invece che una montagna in miniatura.
- **Il budget è stato pagato, non sforato.** Le ottave sono passate da quattro a
  tre: in un fbm normalizzato con `lacunarity 2` e `persistence 0.5` ogni ottava
  pesa sul gradiente lo stesso, quindi la quarta si prendeva **un quarto** del
  margine per il sei per cento dell'ampiezza — tre voxel di increspatura su una
  lunghezza d'onda di quarantotto, che la quantizzazione a celle cancella
  comunque. Quel quarto adesso fa una collina. Misurato su otto seed, il
  dislivello peggiore fra colonne adiacenti è passato da **0,654 a 0,669**: la
  soglia del test resta 0,8, e il numero più alto è ora la sponda di un lago —
  l'unico posto in cui il terreno si avvicina di proposito al tetto.
- **Una seconda ottava di deformazione fa le insenature.** La prima è più lenta
  dell'isola e da sola sposta l'ellisse da un lato; questa è quattro volte più
  rapida e vale un terzo, e aggiunge alla riva anse e capi alla scala di un
  quartiere. Il tetto duro di ~0,26 vale ora sulla somma dei due termini.
- **Un lago sta in quota, e ha una quota d'acqua propria.** È la cosa che
  l'acqua non sapeva fare: si scriveva fino a `TERRAIN.seaLevel` e basta.
  `ColumnBlock.waterTop` porta adesso la quota dello specchio **per colonna**, e
  `classifyBiome` chiama `ocean` ciò che sta sotto il proprio specchio invece di
  ciò che sta sotto il mare. Chi scrive la colonna non sa cosa sia un lago: legge
  una quota e ci riempie fino, come faceva con il livello del mare.
- **A livello del mare un lago non esisteva.** Il fondo di uno specchio sta sotto
  il pelo dell'acqua, e su un'isola a cupola la sola terra abbastanza bassa da
  ospitarne uno è la striscia di riva: misurato su otto seed, una conca centrata
  lì ha sempre almeno un quarto della corona sul mare — quello che si apre è una
  baia. Sopra il livello del mare il problema sparisce, perché la terra intorno è
  più alta ovunque per costruzione.
- **La conca si costruisce il proprio bordo.** Non scava e basta: impone un
  profilo — fondo piatto, sponda, bordo — e lo raccorda al terreno che trova. È
  quello a rendere il lago chiuso *per costruzione* invece che per fortuna del
  seed. Il raggio è un punto fisso: dipende dal salto da raccordare, che dipende
  dal raggio. Dove non converge il sito è un fianco, e viene scartato — su otto
  seed di prova, sette prendono un lago di circa 1 400 colonne, uno no. I siti
  si cercano nella **metà interna** dell'isola, dove la pendenza radiale di una
  cupola tende a zero: cercando su tutto il disco i seed con un lago erano tre.
- **Un lago non è battigia.** `groundKindOf` lo rifiuta invece di trattarlo come
  fondale: `GRADING.quayLevel` è una quota assoluta tarata sul mare, e sotto la
  riva di un lago in quota quel muro finirebbe dentro la collina. La città gli
  cresce intorno.
- Profondità di due voxel per costruzione, cioè dentro `shallowDepth`: lo
  specchio prende la risposta `WATER_CLASS.shallow` — increspatura fitta, fondale
  che si vede sotto — e non l'onda lunga del mare aperto.

File: `src/world/terrain/landform.ts` (nuovo), `landform.test.ts` (nuovo),
`config.ts`, `heightField.ts`, `biomes.ts`, `waterClass.ts`, `columnBlock.ts`,
`IslandGenerator.ts`, `TerrainMap.ts`, `src/world/grading/grade.ts`,
`src/sim/testTerrain.ts`, più i test toccati. Il worker del terreno passa da
5,77 a 12,96 kB in bundle.

---

## In corso — Sventramento: un landmark si pianta anche nella città costruita

Piantare un catalizzatore dentro l'edificato **riusciva e non si vedeva**: i fondi
si scalavano, il catalizzatore entrava nella simulazione, e la struttura non
nasceva perché il volume era occupato. Nessun record, quindi nessuno stadio,
quindi un monumento invisibile per sempre — e nessun errore da nessuna parte. Era
anche il piazzamento più interessante del gioco, ed era l'unico impossibile: gli
stadi si sbloccano contando gli edifici nel raggio, quindi un monumento in centro
arriverebbe alla forma finale in poche passate. Il modello Anno 1800 che
`landmarks/config.ts` cita da sempre non era mai stato giocabile.

- **Il riquadro pieno apre un cantiere.** Gli edifici che lo occupano vengono
  demoliti a rate e la struttura viene su al posto loro. La demolizione passa
  dalla coda di comparsa che c'era già: uno stamp vuoto come sagoma nuova e il
  volume da togliere come `erase` non scrive niente e cancella tutto, a budget.
  La stessa macchina che fa salire un edificio voxel per voxel lo fa scendere, e
  il cantiere si sgombera al ritmo a cui la città cresce.
- **Si sventra solo il tessuto minuto.** Oltre `BALANCE.gameplay.catalyst.
  clearing.maxLevel` il riquadro rifiuta, e il rifiuto è **del riquadro intero**:
  sgomberare attorno a una torre che resta in piedi darebbe un buco al posto del
  landmark. Il numero è tarato su misura e non a occhio — su una città matura di
  412 edifici, a soglia 4 restano 139 colonne che aprono un cantiere e le torri
  (il 17% alto della scala) sono fuori portata. Trovare la sacca bassa dentro il
  quartiere denso **è** la giocata.
- **Il costo non è in fondi, ed è deliberato.** Con un milione in cassa un prezzo
  non vincola niente. Sventrare toglie edifici alla simulazione, quindi capacità,
  quindi un'occupazione sopra uno, quindi il `crowdingPenalty` che il bilancio
  applicava già. Non c'è una penalità nuova da nessuna parte: il costo del gesto
  è il bilancio che c'era.
- **`src/sim/` impara a togliere.** `removeBuildings` è l'inverso di
  `addBuilding`, e «inverso» è il requisito: toglierne N dà lo stesso campo di non
  averli mai aggiunti, byte per byte, congestione e occupazione comprese. Un test
  verifica l'equivalenza con `rebuild` in entrambi i versi. La simulazione
  continua a non sapere cosa sia un landmark (invariante 7).
- **Un record esce dal registry solo quando i suoi voxel non ci sono più.**
  Toglierlo prima aprirebbe una finestra in cui il suolo legge libero mentre
  l'edificio è ancora lì: un lotto ci nascerebbe dentro e la cancellazione in coda
  gli mangerebbe i voxel. Come effetto collaterale gratuito, la passata di upgrade
  salta i condannati da sola, perché li vede in coda di comparsa.
- **La città in quota non si sventra.** Un altro landmark, una mensola, un nodo di
  percorso o un edificio che ne *porta* uno fermano il riquadro: farli cadere
  farebbe cadere quello che ci sta sopra. Le campate invece cadono, ed è già la
  regola «al suolo vince l'edificio».
- **Il cursore lo dice prima del click, e non rifiuta.** Un riquadro che non regge
  la struttura non impedisce di piazzare il catalizzatore — il campo funziona lo
  stesso, e due catalizzatori vicini che si sovrappongono sono proprio il gesto
  che il gioco chiede. A cambiare è cosa comparirà: «Clears 6 buildings» oppure
  «only the plaza will appear». È quello il difetto muto che questa fase chiude.
- I tre commenti che dicevano *«nessuno demolisce»* sono stati riscritti, e la
  nota della blacklist ha avuto quello che aspettava: `onTick` la svuota con
  `forget` appena un cantiere porta via qualcosa.
- Nuovi: `clearance.ts` (la regola, pura) e `recordStamp.ts` (la sagoma registrata
  di un edificio, che ora ha due chiamanti invece di una copia dentro l'upgrade).

## In corso — Esemplari, e due dettagli che mancavano a tutti

I landmark erano identici byte per byte: nove ruoli, quattro stadi, quattro
rotazioni, e due porti sulla stessa mappa indistinguibili. Ora ogni ruolo ha tre
esemplari, e il vocabolario con cui si disegnano è uscito dall'angolo retto.

- **Un ruolo ha un tronco e tre esemplari, e l'esemplare non toglie mai niente
  al tronco.** `recipe.parts` si disegna sempre e dice *il ruolo*;
  `variants[n].parts` ci si somma sopra e dice *quale* porto. È quello che
  concilia la varietà con la nota storica di `landmarks/generate.ts` contro il
  PRNG: quella nota temeva che il giocatore dovesse imparare nove sagome
  moltiplicate per i semi, e tenendo il tronco fuori dalla variante la
  leggibilità del ruolo è garantita **per costruzione**, non per disciplina di
  chi compila la tabella. Un test la misura: ogni esemplare contiene il tronco
  per intero.
- **L'esemplare è funzione del seme del record, con un sale proprio.**
  `LANDMARK.variantSalt` esiste per lo stesso motivo di `SKYLINE.peakSalt`:
  `record.seed` è `hashCoords(worldSeed, x, y)`, ed è lo stesso intero da cui il
  verso di ripiego esce con `& 3`. Senza sale, verso ed esemplare cambierebbero
  sempre insieme e la città mostrerebbe una regolarità che nessuno ha scritto.
  Il seme si calcola prima dello stamp e si conserva nel record, perché un
  avanzamento di stadio deve ritrovare l'esemplare già scritto: due esemplari
  diversi non si coprono, e l'invariante «lo stadio nuovo copre il vecchio»
  cadrebbe.
- **Traliccio e falda sono la nona e la decima primitiva, lo smusso è un campo.**
  Una gamba di gru disegnata come prisma pieno legge come un muro stretto: il
  traliccio ha aria dentro, ed è l'aria a dire «struttura». La falda è l'unica
  sommità non piatta del vocabolario — finché non c'era, tutti i ruoli finivano
  su un piano orizzontale a quote diverse. `Part.chamfer` invece non è
  un'undicesima voce ma un modificatore della pianta: scatola smussata è un
  tamburo, scatola cava smussata un anello ottagonale, piramide a gradoni
  smussata una cupola. Tre forme per un campo, ed è l'unico modo che questo
  dominio ha di uscire dall'angolo retto senza imparare a disegnare un cerchio.
  Tutte e tre restano invarianti per rotazione, che è la proprietà che il test
  del catalogo misura su ogni esemplare.
- **I landmark hanno finalmente porte e insegne.** Nessuna ricetta usava
  `SURFACE_KIND.portal` né `luminous`, quindi nove strutture pubbliche
  perdevano montanti, architrave e pensilina — già scritti in
  `microGeometry.ts` — e restavano buie di notte. Non è codice nuovo: è una
  riga di tabella che dichiara il linguaggio giusto sulla colonna giusta.
- **Due voci nuove di microgeometria, e nessuna costa niente dove non serve.**
  Il *finiale* mette collarino e ago sulla sommità di una colonna isolata:
  ciminiere, guglie, gambe di gru e torri di controllo finivano tutte su un
  quadrato piatto largo quanto il fusto. La *fascia di sbalzo* dichiara lo
  spessore all'intradosso di un aggetto — bracci di gru, nastri, viadotti,
  impalcati in quota — e corre lungo il filo, quindi un braccio intero costa un
  prisma per lato. Sul chunk fitto di edifici veri il conto resta **4355 quad**,
  invariato: quella fixture non ha né colonne isolate né sbalzi, ed è
  esattamente il punto — le due voci si pagano solo dove producono qualcosa.
- **`utility` resta fuori da `collectSurfaceCells`, e ora è scritto perché.** È
  la superficie di tutte le carreggiate: un emettitore agganciato lì pagherebbe
  da solo più di tutto il resto del modulo.

## In corso — Moli, traghetti e ponti

Tre cose che l'isola non sapeva fare: ormeggiare, collegare due sponde, e
scavalcare l'acqua. Le prime due sono complete; della terza è pronto il dominio,
non ancora il cablaggio.

- **Il porto ha una darsena, dei pontili e delle barche ormeggiate.** L'acqua è
  scritta *dentro* lo stamp, come lo stagno del parco: le opere di terra portano
  tutta l'impronta alla quota della banchina prima che la ricetta scriva, quindi
  un buco lasciato al terreno sarebbe terra ferma e non mare. È l'unico modo che
  una ricetta ha di tenersi dell'acqua in casa — e quindi di avere una barca
  *dentro* il porto invece che accanto.
- **`PART.hull` è l'ottava primitiva dei landmark, e l'unica senza una pianta
  rettangolare.** Le altre sette sono un prisma con una maschera simmetrica, e
  una barca disegnata come scatola legge come un container. È rastremata ai due
  capi — un traghetto è a doppia estremità davvero — e la rastremazione segue
  l'asse lungo e non `x`: è quello a tenerla invariante per rotazione, che è la
  proprietà che il test del catalogo misura su ogni ricetta.
- **Il traghetto è il nono catalizzatore**, costiero come il porto ma opposto per
  effetto: da un imbarco passano persone, quindi tira su case e negozi invece di
  capannoni. Divide la costa con il porto senza doppiarlo perché collega
  dall'altro lato — il porto apre il commercio *con il mondo*, il traghetto lega
  *due punti dell'isola*, e infatti non è un `TradeLink`.
- **Una linea è una coppia, ed è l'unico ruolo che da solo non chiude la propria
  promessa.** `ferry.ts` accoppia gli imbarchi abbastanza lontani, uno per capo,
  e solo una linea *aperta* contribuisce alla soddisfazione: un molo isolato resta
  un catalizzatore come gli altri, con le sue barche ferme. La coppia si misura
  in distanza e basta, perché in `src/sim/` non c'è niente che sappia dove finisce
  la terra — la geografia la legge `src/world/`, come per il vincolo di sito.
- **`src/world/crossings/` è il viadotto che il commento di `SPANS.maxGap` aveva
  annunciato.** Oltre dodici voxel una campata «non è più una passerella ma un
  viadotto, che ha bisogno di appoggi propri a terra»: l'invariante di questo
  dominio è l'opposto di quello di `spans/` — **un attraversamento prende
  suolo** — ed è la ragione per cui non sono lo stesso file.
- **Un click, non una coppia.** È l'altra differenza di forma: `spans/` esamina
  tutte le coppie e ne accetta poche, qui arriva una colonna sola e la regola
  trova il compagno da sé. Il click sceglie anche il tipo — sopra una torre un
  ponte a quota libera fra due grattacieli, sulla riva un ponte su pile — e il
  motivo di rifiuto che esce è **quello arrivato più avanti** fra tutti i
  tentativi, non l'ultimo, che racconterebbe solo il più disperato.
- **Resta aperto:** il cablaggio dei ponti. Il piano e il generatore sono puri e
  coperti da 22 test in ambiente `node`, ma niente li chiama ancora: servono un
  driver nel `Builder` e un attrezzo nella HUD, e sono esattamente i due file che
  la decomposizione del Builder sta riscrivendo.

## 2026-08-23 — Il Builder diventa una cartella

- **`Builder.ts` passa da 3227 righe a 926**, e nessun comportamento cambia. Non
  era un file grande per caso: sei sottosistemi a tick — nascita, promozione,
  campate, città in quota, landmark, superficie — avevano finito per condividere
  un solo oggetto perché tutti volevano le stesse cinque cose (mondo, terreno,
  strade, registry, coda). Il refactor dà loro quelle cinque cose in un
  `BuildContext` e li separa in un file ciascuno.
- **Le scritture stanno in tre file invece che sparse in sei metodi.** Un voxel di
  edificio arriva nel mondo solo da `growthQueue.ts` (i volumi, a budget), da
  `surfaceQueue.ts` (il suolo pubblico, a budget) o da `siteWorks.buildWorks` (la
  fondazione, subito). L'invariante «nessuno scrive un muro all'infuori di qui»
  vale ora per la cartella ed è **più stretta** di quando valeva per il file,
  perché prima `world.setBlock` compariva in sei punti diversi del `Builder`.
- **Il budget di chunk era già puro e nessuno poteva verificarlo.**
  `dirtyChunkCount` non toccava `this` in una sola riga, ma da metodo privato
  l'unico modo di provarlo era far crescere una città intera. Ora è
  `chunkBudget.ts` con dieci test propri, fra cui quello che conta davvero: il
  tetto si misura sul **ritaglio** e non sull'ingombro intero, che è la proprietà
  per cui i ritagli esistono.
- **Le due domande della gerarchia verticale stavano in un metodo solo, usato da
  due passate.** `allowedLevel` e `riseOf` vivono in `hierarchy.ts` perché li
  chiamano sia la nascita sia la promozione: averli in due copie è esattamente il
  modo in cui una corona bassa in periferia smette di essere bassa da un lato.
- La rete in quota dipende dalle campate e non viceversa: `aerialDriver` chiede a
  `spanDriver` di far cadere ciò che sta nel volume di una gamba, e la freccia va
  in un verso solo. Era già così, ma prima era un fatto dell'ordine dei metodi
  dentro una classe, non una dipendenza dichiarata fra due tipi.

---

## 2026-08-23 — La città esce dall'impronta

- **La mensola è la prima cosa che sporge.** La grammatica degli edifici dichiara
  il contrario — «la fascia di base resta il riquadro pieno, quindi nessuna fascia
  può uscire dall'impronta e la collisione fra edifici resta bidimensionale» — e
  l'aggetto rompe proprio quella riga. È legale perché `overlaps` confronta già
  gli intervalli di quota colonna per colonna: chi la scrive **eccettua l'ospite**
  invece di spostarla fuori dal riquadro. È l'assunzione di colonna della fase 4.9
  rotta nel modo più letterale possibile.
- **Un impalcato in quota non prende suolo; lo prende solo la gamba che scende a
  terra.** È l'invariante del dominio nuovo `src/world/aerial/`, complemento
  esatto di quello di `spans/`: sotto una mensola la carreggiata si dipinge ancora
  e i lotti si costruiscono ancora, tranne nelle due colonne di una gamba. È una
  riga di `index()`, dove solo `AERIAL_PART.pier` entra in `groundColumns`.
- **Dove l'ancoraggio non arriva, nasce una gamba**, e non c'è una regola per
  ciascuna forma: `planDeck` misura lo sbalzo di ogni colonna e pianta un appoggio
  dove supera `AERIAL.reach`. Ne segue senza codice in più che una mensola corta
  non ha gambe e una profonda se le conta da sola — «quanto è larga, tanto è
  profonda» è l'unica riga che lega le due cose. Una gamba **si sposta per trovare
  un tetto** prima di piantarsi nel prato, ed è ciò che tiene i cuori d'isolato
  liberi per la piazza della 4.5.
- **Nessuna quota è imposta da fuori, e per questo qui non esiste `align`.** La
  mensola prende la quota dalla sommità di una fascia dell'ospite, la gamba dal
  primo appoggio che trova scendendo. Un lotto in quota eredita la fase
  dall'impalcato che lo ospita, non dal cubo di terreno: è la stessa ragione per
  cui le campate `align` l'avevano già tolto.
- **Sopra una quota si costruisce, e la gerarchia scende con lei.** `decksAt`
  legge dal registry e in quota **il lotto è l'impalcato** — niente `findLot`,
  niente opere di terra, niente fila. `levelsAboveDeck` scala il tetto della 4.6
  con la quota già spesa: una mensola è il modo in cui la gerarchia sale, non il
  modo di aggirarla. `TerrainMap` resta una quota e un bit per colonna.
- **`src/sim/` non guadagna una coordinata verticale**: guadagna un numero di
  quote. Il campo conta quelle spese (`stack`, un byte per colonna) e chiede al
  mondo quante ce ne siano (`headroomAt`), interrogato solo dove `stack > 0` —
  quindi una città tutta al suolo costa esattamente quello che costava.
- **Chi regge qualcosa di abitato non cresce, e solo quello.** La lettura semplice
  — fermare ogni ospite — è misurata e non funziona: la fascia alta della
  gerarchia scendeva da quaranta edifici a diciannove, perché una mensola arriva
  presto e da quel momento la torre non sale più. Una mensola **vuota** cade
  quando l'ospite promuove e la passata dopo la ripropone alla quota nuova, come
  fa una campata che perde l'appoggio; una con una casa sopra no, perché quella
  sarebbe una demolizione.
- **La rete è metà fatta, e il limite è nei test.** Un percorso dritto fra due
  mensole allineate funziona ed è coperto; la piega a zeta è stata **tolta**
  perché i suoi pianerottoli cadevano in punti che il corridoio dritto non misura,
  e su settecentocinquanta coppie di una città cresciuta non ne reggeva nessuno.
  Sulla stessa città i percorsi restano **zero**: le mensole ci sono ma non si
  guardano mai. Chi riprende parta da lì, non dal planner.
- Correzioni a due asserzioni preesistenti che dicevano meno di quanto
  credevano: la rampa saltava le colonne sorvolate da una campata ma non da una
  mensola — stesso invariante, stessa esenzione — e il gate degli appoggi chiedeva
  a una **piazza** i due capi pieni, che è chiederle di essere un ponte largo.

## 2026-08-23 — I raggi X guardano una cosa, non una zona

- **La finestra diventa il soggetto.** Era un riquadro di **mondo** di 64 colonne
  centrato sul cursore, e a schermo leggeva come «una specie di trasparenza
  quadrata che non si capisce cosa sia»: troppo largo per essere una lente,
  troppo stretto per contenere un occlusore vero, e uguale per una casa e per una
  torre. Al suo posto c'è un test raggio/volume: continuando il raggio di vista
  dal frammento in avanti, se incontra il volume che si sta guardando allora il
  frammento lo *copre*. La finestra è così la sagoma del soggetto per
  costruzione, a ogni zoom e da ogni angolo — non c'è più niente da avvisare
  nella riga della vista, e infatti «la finestra è larga 64 caselle, quindi
  avvicinati» è sparita.
- **Il suolo smette di bucarsi.** Il terreno davanti al soggetto lo copre come lo
  copre un muro, ma dietro a un muro c'è la città e dietro al terreno non c'è
  niente: la vista si apriva su una macchia di cielo in mezzo all'isolato, ed era
  il difetto che si vedeva peggio di tutti. Con la lente viaggia ora un
  **pavimento** — la base del soggetto — sotto cui non si vela mai.
- **Puntare una torre punta la torre.** `pickSurfaceCell` interseca la heightmap,
  che non conosce gli edifici: il raggio attraversava un grattacielo come se
  fosse vetro e si fermava sulla terra dietro, a tante colonne quanto la torre è
  alta. Le viste ci si agganciavano, quindi la lente si apriva su un altro
  isolato. `pickSolidCell` si ferma anche su ciò che è stato costruito, e chi
  guarda usa quello; chi *piazza* continua a usare la heightmap, perché si
  costruisce sul suolo e fermarsi su un tetto darebbe una colonna inedificabile.
- **Il soggetto non si vela da solo, e non serve un piano per dirlo.** Dall'interno
  del volume il raggio è già cominciato — `enter` negativo — e questo esclude in
  un colpo sia chi sta dentro sia chi sta dietro. La corda del test a lastre va a
  zero sul contorno della sagoma e cresce verso il centro: è già la distanza dal
  bordo che serve alla sfumatura, senza un secondo conto.
- **Densità separata per la lente**, `INSPECT.xrayVeil` a 0,85 contro lo 0,68 del
  velo generico. Sono due geometrie diverse: il velo di Block focus copre tutto
  il contesto e mangiarselo toglierebbe la risposta, mentre la lente apre un buco
  largo quanto un edificio dentro un occlusore che resta intero tutt'attorno. A
  0,68 il muro davanti e il soggetto dietro finivano a metà strada l'uno
  nell'altro e non si leggeva nessuno dei due.
- **Le guide contornano l'edificio** invece del riquadro di 64 colonne: la linea
  dice «questo», non «fin qui arriva il retino». Sul suolo nudo non contorna
  niente — c'è già il mirino, e una seconda linea direbbe la stessa cosa.
- Due uniform nuove (`uInspectLensMin`, `uInspectLensMax`), nessuna
  ricompilazione in più: la variante col `discard` continua a entrare alla prima
  attivazione, e chi non apre mai una vista non paga niente.

## 2026-08-23 — Le torri smettono di essere lastre

- **La sagoma finisce il fiato nel primo quinto, ed è misurato.** Le voci di
  `BAND_OP` spostano il rettangolo di uno o due voxel: con `MAX_FOOTPRINT` a otto
  e `GRAMMAR.minBandSide` a quattro il gioco totale è **due voxel per lato**,
  mentre `LEVEL_CAPS` chiede fino a diciannove fasce. Sul generatore vero: un
  civico da 143 voxel scende a 4×4 alla quota 7 e da lì in su può solo
  *scorrere* — 95% dell'altezza a sagoma costante, trentaquattro a uno; un
  industriale da 106 tiene un unico prisma 7×8 dalla quota 10 alla 93. Il
  commento di `LEVEL_CAPS` dichiarava «venti a uno»: era ottimista.
- **La campata di facciata è il ritmo verticale che la sagoma non può dare.**
  `ClassProfile.bayPeriod` spezza la parete in montanti e aperture, e
  `GRAMMAR.spandrelHeight` tiene sotto di esse il parapetto che separa una
  facciata da un reticolo. Quattro cadenze per quattro usi: montanti radi sul
  residenziale e sul civico (curtain wall), grana fitta sul commerciale in
  mattoni, pannelli larghi e due toni scuri accostati sull'industriale — che non
  sono finestre ma lamiera, ed è quello che un capannone ha al posto delle
  finestre. Una riga di catalogo può sovrascriverla come ogni altra voce del
  profilo, senza plumbing.
- **Conta i montanti e non le aperture**, e la differenza si vede dove conta: un
  fronte da quattro — la larghezza a cui *ogni* torre alta finisce — ha due sole
  colonne fra i cantonali, e un passo contato sulle aperture può non trovarne
  nessuna. Il passo si conta poi **dall'impronta e non dalla fascia**: altrimenti
  un `jog` da un voxel farebbe scorrere di uno tutte le aperture del piano sopra,
  e su venti fasce la parete tornerebbe rumore invece che facciata.
- **È vernice, non geometria**, ed è il contratto che un test tiene fermo: stesso
  volume, stesse superfici, quindi la microgeometria emette esattamente i prismi
  di prima e collisione, budget di chunk e cancellazione non se ne accorgono.
  A pagare è il solo greedy merge — A/B su un chunk di quattro torri vere
  tagliate a metà corpo: **631 → 901 quad base, dettaglio invariato a 1 710**,
  totale +11%. Lontano da `MAX_DETAIL_QUADS_PER_CHUNK` e da
  `MAX_BASE_QUADS_PER_CHUNK`.
- **Un difetto che solo la misura ha rivelato: il civico di livello massimo
  prendeva zero aperture.** Quando l'accento sale a scala di edificio il corpo
  passa a `profile.accent`, che sul civico è lo stesso `glassPale` di `bodyAlt`:
  corpo e cornice cadevano nello stesso slot — e con loro spariva già la riga di
  piano, da prima di questa modifica. Ora l'apertura si inverte e prende il tono
  neutro, che il ciclo ha già in mano come `accentId`. Da 0 a 364 aperture sulla
  classe che sale più in alto, cioè proprio quella che ne aveva più bisogno.

## 2026-08-23 — Il mare di notte, e un orologio che si può fermare

- **Il riflesso dell'acqua è un'ora e non una materia.** Era l'ultima cosa della
  scena rimasta a mezzogiorno: la tinta del tema (`#c7f3ea` sul diorama) veniva
  mescolata sul mare anche a mezzanotte, e su un fondo quasi nero le due sinusoidi
  dell'increspatura smettevano di leggersi come un'onda — diventavano un
  quadrettato chiaro largo quanto l'inquadratura, con un anello di schiuma
  luminoso tutto attorno all'isola. `withHour` ora vira il riflesso verso
  `nightWater` e abbassa l'ampiezza dell'onda: di notte il mare mostra quello che
  riflette, che è poco. Il riflesso del sole non serviva spegnerlo — è
  moltiplicato per un colore che l'ora ha già premoltiplicato per intensità zero.
- **L'orologio si può fermare, dall'HUD.** Tre modi — ciclo, giorno fisso, notte
  fissa — dal bottone accanto a pausa e velocità, dal tasto `L` o da
  `?daylight=night`. Non sono un secondo look: sono le ore vere `DAYLIGHT.dayHour`
  e `nightHour`, quindi luce, cielo, nebbia, ombre ed emissivi restano esattamente
  quelli che il ciclo produrrebbe passando di lì. Tornando al ciclo il sole
  riparte da dov'era, invece di saltare a mezzogiorno.
- **Il tasto sta fuori dal gate del debug**, come `V`: scegliere se guardare la
  propria città di giorno o di notte è gioco, non misura. `H` resta la manopola
  fine dell'harness, un'ora alla volta, e il primo comando di gioco scioglie un
  `?hour=` in coda all'URL — un bottone che non risponde è peggio di un parametro
  perso.
- **`DAY_SECONDS` si trasferisce in `DAYLIGHT.daySeconds`**: il tooltip promette
  al giocatore quanto dura un giro, e due copie del numero vorrebbero dire una
  promessa e una durata diverse.

## 2026-08-23 — La notte smette di essere un retino

- **Nuovo `src/engine/nightWindows.ts`**, quarto modello puro dell'engine accanto
  a luce, atmosfera e ciclo del giorno: il fragment shader ne interpola i numeri
  invece di riscriverli, e `nightWindows.test.ts` più un controllo in
  `VoxelMaterial.test.ts` impediscono alle due copie di divergere.
- **La quota di finestre accese ha un tetto.** Con la sola soglia
  sull'occupazione una città piena accendeva quasi ogni vetro: una facciata
  accesa al novanta per cento non è uno skyline, è un retino, e non si leggeva
  più dove finisse una torre e cominciasse la vicina. Il buio fra le luci è metà
  del disegno. L'occupazione continua a governarle — la città di notte resta una
  lettura dell'economia — ma dentro un intervallo che non satura.
- **Ogni torre ha un carattere.** Un gruppo di colonne dell'ordine dell'impronta
  (`towerCell`, sei voxel) porta la sua quota accesa: accanto a una torre piena
  ne resta una quasi spenta, e il contrasto è quello che prima mancava. Non è
  l'edificio — al frammento non arriva nessun identificatore, e dargliene uno
  costerebbe bit che non ci sono — ma è la scala alla quale due vicini devono
  differire. Una torre larga cade su due gruppi e si accende ad ali diverse.
- **Due modi di accendersi.** Un ufficio accende piani interi, una casa finestre
  sparse: sono le bande orizzontali in mezzo alle macchie. A scegliere è la
  torre e non l'uso, perché la grammatica `habitat` copre residenziale e
  commerciale insieme — limite dichiarato, non svista. Le due soglie si dividono
  la stessa quota, quindi cambia *come* la luce si distribuisce, non quanta.
- **Ambra e bianco freddo invece di un solo pallido**, presi da slot di palette e
  non da costanti: un tema li ritinge insieme al resto della città. Il tono varia
  per finestra, così una torre non è tutta di un colore.
- **Vani scala accesi a ogni piano** (una colonna su venti) e una coda lunga di
  finestre molto più accese delle altre: sono la riga verticale e lo scintillio
  che tengono insieme una facciata altrimenti a macchie.
- **La finestra diventa più alta che larga** e le luci di sommità dei tetti
  (`roofTech`) salgono di notte: sopra il fronte illuminato sono l'unica cosa che
  continua a dire dove finisce una torre e comincia il cielo.
- Nessun voxel viene riscritto, nessun uniform nuovo, nessuna ricompilazione: la
  differenza è tutta dentro il ramo `habitat` del fragment shader.

## 2026-08-22 — Un isolato si può scegliere e girarci attorno (Fase 4.15)

- **Block focus guadagna un secondo tempo.** Puntare un isolato continua a
  velare il fuori al 68%, com'era: risponde a «come si connette». Un **clic** lo
  *sceglie*, e da lì la stessa vista risponde all'altra domanda — «com'è fatto» —
  portando la densità del retino da `veil` a `cut`: fuori dal riquadro non si
  disegna più niente e l'isolato resta un modellino sul suo prisma di terreno.
  Non è un modo nuovo: il ciclo di `V` resta a cinque viste, e la geometria che
  decide cosa sparisce è identica nei due tempi. Cambia un numero.
- **Il riquadro smette di inseguire il cursore.** Era il limite che rendeva la
  vista inutilizzabile per guardare *una* cosa: bastava muovere il mouse per
  perderla. Con un isolato scelto, `applyInspect` non rilegge più il puntatore.
- **La camera impara a orbitare.** `PITCH` era una costante di modulo: diventa
  `REST_PITCH`, il valore *di riposo*, più un campo `pitch` che si muove solo
  dentro lo studio, fra 12° e 82°. Sotto, la correzione azimut→schermo
  (`1 / sin(pitch)`) esplode; sopra, `lookAt` degenera con `up` parallelo alla
  vista. Il trascinamento gira invece di panare, `Q`/`E` diventano passi
  continui, e `F` e il pan da tastiera si spengono — porterebbero il perno fuori
  dal soggetto senza che si veda.
- **Uscendo, la città torna com'era.** `captureState`/`restoreState` rimettono
  yaw, scatto, inclinazione, perno, altezza d'inquadratura e zoom: la camera
  l'aveva mossa lo strumento, non il giocatore. `Esc` molla l'isolato e lascia
  accesa la vista; un secondo `Esc` la spegne. Un clic su un altro isolato cambia
  soggetto senza uscire, e tiene l'angolo — così due isolati si confrontano dallo
  stesso lato.
- **`isCut` e `needsCap` diventano due domande distinte.** `isCut` chiede se si
  sta tagliando, `needsCap` se il taglio lascia una *superficie di sezione* da
  tappare. Coincidono su Levels e Cutaway, che attraversano i volumi, e divergono
  sull'isolato scelto, che toglie per intero ciò che sta fuori e lascia chiusa la
  geometria che resta: lì `DoubleSide` sarebbe solo il doppio dei fragment. È la
  stessa distinzione già in vigore fra `modeCuts` e `modeHasLevel`.
- **Le ombre proiettate restano spente** mentre si studia, perché la regola su
  `isCut` non è cambiata. Il motivo è quello documentato dalla fase 4.11: il
  predicato dell'ispezione vive solo nel materiale di scena e non in quello di
  profondità, quindi il volume nascosto continuerebbe a proiettare ombra sul
  modellino. Portarlo anche nel `depthMaterial` di `SunShadow` resta aperto.
- Il margine d'inquadratura dell'isolato (`INSPECT.studyMargin`) sta in
  `inspect.ts` come ogni altro numero di questo dominio.

## 2026-08-22 — La città di notte come lettura dell'economia (Fase 4.8)

- **Nuovo `src/sim/vitality.ts`**: due frazioni fra zero e uno — case occupate
  (popolazione su capacità) e negozi pieni (l'occupazione del ciclo
  commerciale). È una lettura pura degli stessi conteggi e degli stessi pesi che
  usa il bilancio: chiamarla non cambia niente e costa quattro moltiplicazioni.
  `src/sim/` continua a non sapere che esiste un renderer (contratto 7).
- **Nessun voxel viene riscritto.** Riscrivere le finestre accese vorrebbe dire
  marcare sporchi i chunk della città a ogni tick, cioè rimeshare tutto per
  accendere una luce: la lettura entra come **uniform**, alla cadenza dell'HUD.
- La soglia delle finestre si muove, la variazione per cella no: a cambiare è
  **quante** si accendono, mai quali. Le luci non sfarfallano mentre la
  popolazione cresce.
- Le insegne seguono il commercio, con un minimo al 30%: un accento che sparisce
  del tutto cancella la faccia che rende leggibile il volume, e resterebbe una
  silhouette — cioè il contrario del gate della fase.
- Limite dichiarato: la lettura è per città e per uso, mai per singolo edificio.
  Il fragment non sa a quale edificio appartenga un voxel, e dirglielo
  costerebbe un formato in più; un quartiere vuoto in mezzo a una città piena
  non si spegne da solo. Il salto è materiale da 4.9 in avanti.
- `effectiveCount` diventa pubblico invece di essere copiato: resta l'unico
  punto in cui `buildingCounts` e `mixedCounts` si incontrano.
- File: `src/sim/vitality.ts`, `src/sim/vitality.test.ts`, `src/sim/index.ts`,
  `src/sim/tick.ts`, `src/engine/VoxelMaterial.ts`, `src/main.ts`,
  `PROJECT_INDEX.md`, `ROADMAP.md`.

---

## 2026-08-22 — La luce che esce (Fase 4.8)

- **Un quarto termine nella luce, e non è una luce dinamica.** Quanto una faccia
  sia vicina a una superficie `luminous` o `portal` è un dato geometrico: lo
  cuoce `sweepGlow` nel mesher con sei scansioni lineari sul volume paddato,
  massimo con decadimento separabile sui tre assi. Nessuna pass in più, nessun
  elenco di sorgenti nel fragment, nessuna ricompilazione.
- **I bit c'erano già.** `aShade` ne usava quattro degli otto: il bagliore
  prende i bit 4-5 e nessun attributo di vertice si aggiunge — la stessa mossa
  con cui la 4.7 fece entrare il cielo accanto all'AO. Il campo entra anche
  nella chiave di merge, o il greedy fonderebbe facce che il fragment tratta in
  modo diverso.
- Il `mod` nel vertex shader non è ornamentale: senza, la lettura del cielo
  prenderebbe anche i bit del bagliore e una parete illuminata si crederebbe
  scoperta. C'è un test dal lato del mesher che lo tiene fermo.
- **Corretto guardando lo schermo, due volte.** Con l'alone a dodici voxel ogni
  faccia cadeva nel raggio di qualcosa di acceso e l'edificio diventava ambra
  invece di avere una parete schiarita: sei voxel, cioè due piani. E con lo
  spill a 0,55 la facciata era una lampada: 0,22 lo mette appena sopra
  l'ambiente notturno, che è ciò che si chiede a una luce di rimbalzo.
- **Prezzo misurato**, A/B nello stesso processo sul chunk sci-fi del bench:
  +0,3 ms per chunk (dentro il rumore della macchina) dopo aver tolto la
  moltiplicazione per cella dalle scansioni e il confronto sulla superficie
  estratta dalla scansione di semina. Scritto in modo ovvio costava +1,35 ms.
  I quad totali crescono del 4% per la frammentazione del merge attorno agli
  emettitori — sotto il 10% oltre il quale il piano prevedeva di scendere a un
  bit solo.
- Limite dichiarato: la tinta è del tema e non dell'emettitore. Un'insegna rossa
  e una cyan schiariscono il muro con lo stesso ambra; portare la tinta
  costerebbe bit che non ci sono.
- Chiuso di sponda un difetto della 4.3 che i prop avrebbero amplificato: su un
  voxel d'acqua i tre bit di superficie sono `WATER_CLASS`, e bassofondo e
  canale coincidono con `habitat` e `industrial` — il mare esposto al bordo del
  mondo si sarebbe messo i condizionatori.
- File: `src/engine/mesher/greedyMesher.ts`,
  `src/engine/mesher/greedyMesher.test.ts`, `src/engine/mesher/microGeometry.ts`,
  `src/engine/VoxelMaterial.ts`, `src/engine/themes/theme.ts`, `src/main.ts`,
  `src/engine/AGENTS.md`, `ROADMAP.md`.

---

## 2026-08-22 — Ciclo giorno/notte (Fase 4.8)

- **Nuovo `src/engine/daylight.ts`**, terzo modello puro accanto a `lighting.ts`
  e `atmosphere.ts`: entra un'ora, esce un'atmosfera. Un giorno di gioco dura
  dodici minuti reali; `?hour=` la fissa, `H`/`Shift+H` la scorre,
  `__voxelHour()` la legge, l'overlay la mostra come orologio.
- **L'atmosfera di un tema è quella di mezzogiorno.** Azimut ed elevazione sono
  il picco, i colori sono il look a sole alto: l'ora li piega, non li
  sostituisce. `nightReach` sta sotto 1 apposta — a uno, tutti i temi avrebbero
  la stessa notte e la firma costruita in 4.7 sparirebbe proprio nelle ore in
  cui la 4.8 vuole che la città si legga.
- **La notte non è una soglia sull'ora, è l'altezza del sole.** Il crepuscolo
  esiste per costruzione — dura quanto il sole impiega ad attraversare quei
  gradi — e non ci sono due tabelle che possano divergere.
- **A sole radente una parete illuminata supera il tetto**, che è il caso da cui
  `SunLight.elevation` mette in guardia. Non si corregge: l'alternativa sarebbe
  raddoppiare l'ambiente di cielo, che slava la scena invece di salvarla. Quello
  che il ciclo garantisce, verificato a ogni ora, è che il tetto non diventi mai
  la faccia **più scura**.
- Di notte la pass d'ombra si salta del tutto: un sole sotto l'orizzonte non
  proietta niente, e disegnarla sarebbe una mappa di profondità buttata via a
  ogni frame.
- **Visto a schermo, corretto a schermo**: le nuvole restavano bianche a
  mezzanotte ed erano la cosa più luminosa dell'inquadratura. `cloudTint` e
  `sunGlow` scendono con il cielo.
- `applyTheme` si è divisa: `applyAtmosphere` riscrive i soli uniform dell'ora,
  e non tocca palette né tone mapping — quelli non c'entrano niente con il
  momento della giornata, e ricompilare un programma a ogni scatto d'orologio
  sarebbe lavoro per niente.
- File: `src/engine/daylight.ts`, `src/engine/daylight.test.ts`, `src/main.ts`,
  `src/ui/DebugOverlay.ts`, `src/engine/AGENTS.md`, `PROJECT_INDEX.md`,
  `.claude/skills/debug-harness/SKILL.md`, `ROADMAP.md`.

---

## 2026-08-22 — Il verde sull'edificio (Fase 4.8)

- **Fioriere, rampicanti e chiome**, tutti sugli slot `grass*` che la palette ha
  già: nessuno slot nuovo, nessun tipo di superficie nuovo.
- **Il verde sulle terrazze non costa un prisma in più.** Cassone tecnico e
  fioriera hanno la stessa forma e cambiano solo indice di palette: è la seconda
  metà dello stesso tiro a scegliere quale, e due su tre sono verdi — una
  terrazza è un giardino con qualche cassone, non il contrario.
- **Il tiro di un rampicante non guarda la quota**, ed è quello che lo rende un
  rampicante invece di una macchia: con un tiro per cella la corsa si
  spezzerebbe a ogni voxel e una parete costerebbe un prisma per cubo. Salgono
  solo sulle facce a nord e a est e si fermano a undici voxel — più su sarebbe
  un giardino verticale, che la città non costruisce.
- Antenne e chiome ora chiedono **tetto scoperto tutt'attorno**: sul filo c'è
  già il parapetto, e una cornice larga un voxel non è una copertura su cui
  posare qualcosa. È anche ciò che tiene i prop fuori dai cornicioni sottili.
- Misura sulla fixture `densityChunk`: 3 320 quad di sola struttura → 4 355 con
  prop e verde (+31%), sotto il tetto di 16 384 che **non** si è alzato.
- File: `src/engine/mesher/microGeometry.ts`,
  `src/engine/mesher/microGeometry.test.ts`, `ROADMAP.md`.

---

## 2026-08-22 — Prop appesi alle giunzioni (Fase 4.8)

- **Sei oggetti che la facciata non aveva**: tende sul fronte strada, insegne a
  bandiera, condizionatori sulle pareti cieche, antenne sui coronamenti, cassoni
  sul bordo degli arretramenti, pilastrini agli angoli d'isolato. Stessa
  `emitRuns`, stesso scratch, **stessa draw call**: nessuna geometria separata.
- **L'aggancio è un predicato, il seme sceglie solo quale cella.** Il fronte
  strada è «c'è un ingresso sotto questa faccia» — cioè il `portal` che
  `onPortal` scrive già sul lato verso la carreggiata; l'arretramento è una
  sommità `roofTech` scoperta con ancora volume di fianco; l'angolo è la cella
  che espone due facce ortogonali della *stessa* facciata. Nessuna posizione
  sparsa a caso sulla parete.
- **`emitBox` porta la superficie**, che non è un tipo nuovo ma uno dei sette:
  un'insegna esce `luminous` e si accende passando dal ramo che il fragment ha
  già, un condizionatore resta `utility`. Invarianti 4 e 5 intatte.
- **`MeshJob` porta l'origine del chunk**, unica coordinata di mondo che entra
  nel mesher: serve solo a seminare la scelta. Con coordinate locali due chunk
  adiacenti arrederebbero le stesse celle e la ripetizione ogni trentadue voxel
  si vedrebbe.
- `emitPoints` accanto a `emitRuns`: un condizionatore sta dentro la sua cella e
  non prosegue, quindi far scoprire a `emitRuns` una corsa di lunghezza uno
  costava tre valutazioni in più del predicato per cella.
- **Il tetto di quad non si è alzato.** Sulla fixture `densityChunk`: 3 320 quad
  di sola struttura, 4 000 con i prop (+20%). La voce che pesava era l'unica che
  pesca su tutta la parete invece che su una giunzione — a 0,09 valeva da sola
  più di tutto il dettaglio strutturale del chunk, e sta a 0,012.
- **Il costo per chunk è stato l'architettura, non solo la verifica.** Misurato
  A/B nello stesso processo sul chunk sci-fi del bench, i prop scritti in modo
  ovvio costavano **+2,2 ms**. Sono scesi a **+0,3 ms** con due cambi: le celle
  di facciata si indicizzano per faccia esposta una volta sola — le interne di
  un edificio pieno sono i due terzi e nessun prop potrà mai usarle — e quella
  scansione legge i quattro vicini con gli indici invece che con la tabella
  degli offset. Il chunk sci-fi passa da ~5,3 a ~6,2 ms, sotto gli 8 ms di
  accettazione.
- Le tabelle di misura in `README.md` **vanno rimisurate a mano**.
- File: `src/engine/mesher/microGeometry.ts`,
  `src/engine/mesher/greedyMesher.ts`, `src/engine/mesher/meshTypes.ts`,
  `src/engine/mesher/mesher.worker.ts`, `src/engine/MesherPool.ts`,
  `src/engine/ChunkRenderer.ts`, `src/engine/mesher/microGeometry.test.ts`,
  `PROJECT_INDEX.md`, `ROADMAP.md`.

---

## 2026-08-22 — La scena `diorama` (Fase 4.8)

- **Un edificio solo, per giudicare il dettaglio senza aspettare la città.**
  Nuovo `src/world/scenes/dioramaScene.ts`: un `SceneGenerator` come gli altri
  tre, che compone un soggetto scelto — uso, livello, tipologia, secondo uso —
  su un basamento minimo. `?scene=diorama&class=&level=&typology=&mixed=`.
- **Non ridisegna niente**: usa la stessa `selectTypology` e la stessa
  `generateBuilding` del Builder. Se il diorama e la città mostrassero due
  edifici diversi, il diorama non servirebbe a giudicare la città. Quello che
  non c'è è il contorno — lotto, opere di terra, aggregazione.
- **Il fronte strada è parte del soggetto.** Il basamento porta prato,
  marciapiede e carreggiata dal lato `FACING.east`, che è il verso con cui lo
  stamp viene generato: tende, insegne e portali si agganciano a quel lato, e in
  mezzo al prato non si giudicherebbero.
- Il perno della camera va a metà dell'altezza dell'edificio invece che sul
  pianoro dell'isola: `targetHeight` è letto una volta sola dal costruttore,
  quindi il soggetto si compone **prima** della camera. Senza, `Q`/`E` facevano
  ruotare l'edificio attorno ai propri piedi e la cima usciva di campo.
- Limite dichiarato: senza città intorno non c'è profilo locale, quindi
  `selectTypology` può solo ripiegare sulla riga senza condizioni dell'uso. Le
  forme che un distretto concede si vedono solo con `?typology=<id>`.
- File: `src/world/scenes/dioramaScene.ts`,
  `src/world/scenes/dioramaScene.test.ts`, `src/world/scenes/cityScene.ts`,
  `src/main.ts`, `PROJECT_INDEX.md`, `.claude/skills/debug-harness/SKILL.md`,
  `ROADMAP.md`.

---

## 2026-08-22 — Atmosfera e separazione delle quote (Fase 4.7)

- **La nebbia integra la quota lungo il raggio invece di valutarla sul
  frammento.** Nuovo `src/engine/atmosphere.ts`, modello puro in TS con il suo
  test in `node` accanto a `lighting.ts`: la densità ha profilo esponenziale in
  altezza e ciò che tinge un frammento è l'integrale lungo il segmento camera →
  frammento, in forma chiusa perché la camera è ortografica. È la differenza che
  fa esistere la fase: a **pari profondità di vista**, due volumi sovrapposti a
  schermo ma a quote diverse ora ricevono veli diversi, perché il raggio che
  arriva in cima a una torre ha attraversato aria rarefatta e quello che arriva
  in strada no. Prima la nebbia separava le distanze e basta.
- Il profilo **non è troncato** sotto `heightBase`: sarebbe l'integrale a tratti
  con il suo punto di attraversamento, e con le altezze di scala in uso venti
  cubi sotto la base valgono `exp(0,1)` — un dieci per cento in più sul fondo
  delle valli, che è la direzione giusta.
- `fog.altitudeLift`, nuovo e dichiaratamente non fisico: un velo di quota che
  **non dipende dalla distanza**, e quindi sopravvive allo zoom ravvicinato dove
  l'integrale è quasi zero. Decade quattro volte più in fretta della nebbia,
  altrimenti velerebbe anche i tetti e non separerebbe niente.
- La curva del gradiente di schermo della nebbia era `screenY` lineare e quella
  del cielo `smoothstep`: due implementazioni della stessa mappatura, divergenti
  proprio all'orizzonte dove i due si toccano. Ora è una sola.
- **Visibilità del cielo cotta nel mesher.** Una fetta di soffitto 34×34×16
  (`buildCeilingSlab`) viaggia col job accanto al volume paddato, e una passata
  per piani dà, per ogni cella, la distanza al primo solido sopra. Due bit per
  faccia entrano nella chiave di merge — così coperto e scoperto non si fondono —
  e nei due bit alti del byte per vertice, che da `aAO` diventa `aShade`: nessun
  buffer nuovo, nessuna pass in più, nessuna draw call in più.
  Nel fragment si occlude la sola metà **cielo** dell'ambiente (`skyOcclusion`
  per tema); il rimbalzo resta pieno, ed è ciò che impedisce a un sotto-ponte di
  diventare un buco nero. Vale a ogni ora e a ogni livello di qualità, al
  contrario dell'ombra del sole, che dipende dall'azimut e a
  `?quality=performance` non viene nemmeno calcolata.
- **Costo misurato, non stimato**: la passata è a costo fisso e non dipende dal
  contenuto. Sulla scena di accettazione il chunk passa da **2,09 a 2,44 ms**,
  sul vuoto da 1,84 a 2,14, su microgeometria da 4,70 a 4,83; rumore e
  scacchiera restano dentro il rumore di misura. La prima versione sondava
  colonna per colonna, con passo di 1156 byte: rifatta per piani, gli array si
  leggono in ordine.
- **La dipendenza fra chunk verso il basso è ora lunga `SKY_PROBE`, non una
  cella.** Una scrittura nei primi sedici piani di un chunk sporca anche quello
  sotto: senza, una campata comparsa dopo il suolo non l'avrebbe mai scurito.
- **L'acqua ha tre risposte invece di una.** Il mesher emette del mare la sola
  faccia superiore, a quota costante e con un unico slot di palette — `waterDeep`
  non è mai visibile — quindi al frammento non arrivava alcun segnale di
  profondità e una pozza aveva lo stesso colore di sedici voxel di mare aperto.
  Nuovo `terrain/waterClass.ts`: la classe si decide dove la profondità esiste
  ancora, cioè alla scrittura, dove vale `seaLevel - top` ed è gratis. Bassofondo
  per profondità, canale se c'è terra a portata su **entrambi** i versi di uno
  stesso asse — una baia con una sponda sola resta mare — mare aperto altrimenti.
  Il sondaggio interroga il campo di quota, che è funzione pura del seed: nessuna
  cucitura al confine fra due chunk.
- La classe viaggia nei **tre bit di superficie** del voxel d'acqua. È un
  sovraccarico dichiarato di un campo esistente e non un nono tipo di superficie:
  i bit sono tutti impegnati (invarianti 4 e 5), nessuno dei sette linguaggi si
  applica a una lastra d'acqua, e il fragment riconosce l'acqua dalla palette
  prima di leggerli — per lei cortocircuita del tutto lo switch delle facciate.
- Le tre risposte: bassofondo con increspatura fitta e la base che vira alla
  tinta del fondale; canale quasi fermo, che tende all'orizzonte; mare aperto con
  onda lunga a due ottave e **riflesso del sole** — un `reflect` e una `pow`,
  perché la normale è +Z e la vista è una direzione sola. La **schiuma di riva**
  non costa un dato nuovo: sulla faccia superiore l'AO per vertice scende
  esattamente dove una colonna vicina è solida al livello del mare, cioè sul filo
  dell'acqua, e basta leggerla al contrario.
- **I sette temi sono stati ritarati, non scalati.** `fog.heightFalloff` cambia
  significato — ora è l'inverso di un'altezza di scala integrata — e passa da
  0,007-0,011 a 0,004-0,0055, cioè da un gradiente che si esauriva nei primi
  trenta voxel a uno nell'ordine dell'altezza dell'edificato della 4.6; le
  densità salgono in proporzione, perché con l'integrale un raggio che scende da
  sopra raccoglie meno foschia di prima a parità di parametri. Nuovi per tema:
  `skyOcclusion`, `fog.altitudeLift`, e `water.shallowTint`/`calm`/`glitter` sui
  quattro temi che l'acqua ce l'hanno già.
- **Non ricompila niente e non aggiunge draw call**: tutto è uniform, e il test
  che confronta i sorgenti stringa per stringa attraverso un cambio di tema resta
  verde senza modifiche.
- Le tabelle di misura in `README.md` e `src/sim/README.md` **non** sono state
  toccate: sono verificate a mano su questa macchina.

## 2026-08-21 — Gerarchia verticale della città (Fase 4.6)

- **Nuovo dominio** `src/world/skyline/`: `config.ts`, `tiers.ts` e il loro test.
  Risponde a una domanda che prima non esisteva — **fin dove una colonna può
  salire** — a partire da distanza dai poli, dal mare e dal bordo dell'edificato.
  Puro come `sites/` e `grading/`: quello che serve del luogo entra come numero,
  quindi il dominio si verifica in `node` senza mondo e senza terreno.
- **La desiderabilità dice *se*, la gerarchia dice *fin dove*.** Le due
  condizioni stanno affiancate in `Builder.upgradePass`, non una al posto
  dell'altra. Il campo è un `Uint8Array` che satura a 255 e l'ultima soglia sta a
  198: oltre quel punto non *distingue* più due colonne del centro, e alzare il
  tetto senza la gerarchia avrebbe dato un altopiano più alto invece di uno
  skyline. `upgradeThreshold` resta perciò lungo sette voci e si legge con
  `upgradeThresholdOf`, che ripete l'ultima.
- Tre fasce — costa e periferia, intermedia, centro — più un **cono** verso il
  polo e un **livello in più a un isolato ogni sette**, eletto da un hash del suo
  indice. Il livello massimo esce solo dalla somma dei tre, quindi i picchi sono
  rari per costruzione e non per fortuna; un test verifica che quella somma
  coincida esattamente con `BUILDER.maxLevel`.
- **I tre tetti, rotti insieme.** `maxLevel` da 6 a **12**, `LEVEL_CAPS` da 7 a
  13 voci (fino a diciannove fasce), `maxDirtyChunksPerBuilding` da 24 a **40** —
  aritmetica sul caso peggiore, `2 × 2 × 7`, non margine — e `GRAMMAR.minBandSide`
  da 2 a **4**, senza il quale una catena di rientranze riduceva a un palo i due
  terzi superiori della torre. Un civico di livello massimo passa da ~70 a **152
  voxel**, cioè sopra `TERRAIN.maxHeight`.
- **Un difetto latente, corretto prima che mordesse**: `startLevel` scorreva
  `START_LEVEL_CDF` fino a `maxLevel` invece che fino alla lunghezza dell'elenco.
  Erano lo stesso numero per caso; alzando `maxLevel` il confronto diventava
  `roll < undefined`, falso a ogni giro, e **ogni edificio sarebbe nato al livello
  massimo**. Ora l'elenco ha una voce per livello e un test verifica la lunghezza
  di entrambe le tabelle indicizzate per livello.
- Il contratto di proporzione **è cambiato e non allentato**: la punta passa da
  dieci a uno a diciannove a uno. A otto voxel di lato non c'è altra forma
  possibile, e `MAX_FOOTPRINT` non può salire senza allargare `STREETS.pitch` —
  l'isolato più stretto è largo quattordici colonne. Il test lo dice invece di
  tacerlo.
- Ritarati sulla città alta: `targetHeight` della camera da 12 a 24 (stava
  **sotto** il livello del mare), lo `spanZ` dell'inquadratura d'apertura da 240 a
  320, e la nebbia di quota di **tutti e sette i temi** — `heightFalloff` è
  l'inverso di un'altezza, e a 0,025 spendeva tutta la prospettiva aerea nel primo
  quinto dell'edificato.
- `BuildingRegistry.countWithinRadius` accanto a `withinRadius`, con la scansione
  condivisa: costruire l'array per leggerne la lunghezza era, misurato, **metà del
  costo della passata di upgrade**. Con quello e con `waterDistance` senza
  allocazioni la gerarchia è tornata gratis.
- Misura, su isola vera 256×256, un polo a raggio 96, 500 tick e 334 edifici: i
  tick di upgrade hanno mediana **9,4 ms**, la stessa che si misura con la
  gerarchia spenta (9,5 ms) e con il tetto riportato a sei (10,7 ms) — **il costo
  è della passata, non di questa fase**, e supera i 3 ms di budget come già fa
  `nextBuildSites`. Le tabelle di misura in `README.md` e `src/sim/README.md`
  restano da rimisurare a mano.
- **Il franco delle campate resta a due cubi.** La 4.5 lo aveva rimandato qui;
  misurato, alzarlo costa i due terzi delle campate (11 → 4), perché la stessa
  fase che alza il centro **abbassa la periferia**. Il debito passa alla 4.9.

## 2026-08-21 — Rete urbana in quota (Fase 4.5)

- **Nuovo dominio** `src/world/spans/`: `config.ts`, `spanPlan.ts`,
  `plazaPlan.ts`, `generate.ts`, `network.ts` e i loro test. La prima struttura
  del progetto che **non poggia a terra**. Puro come `grading/` e `sites/`: ciò
  che serve del luogo entra come predicato, quindi il gate della fase si verifica
  in ambiente `node` senza mondo.
- Una campata è **un record con un flag**, sulla strada della 4.12: `span` dice
  quale generatore la disegna, `supports` con chi. L'unica cosa nuova è che **non
  prende suolo** — il registry sdoppia l'indice per colonna, `columns` per
  `overlaps` e `groundColumns` per `isOccupied`, e sotto un ponte restano la
  carreggiata e il lotto. Al suolo vince l'edificio: una campata attraversata da
  una costruzione nuova cade.
- **Atterra dove il corpo c'è, non al filo dell'impronta.** Gli edifici sono
  piramidali e la parete al bordo esiste solo nella fascia zero: cercare
  l'appoggio lì dava zero campate su 6 911 coppie. Ora la ricerca rientra verso
  il centro, e la campata sporge sopra le fasce basse dei propri appoggi — da cui
  l'`except` di `overlaps`.
- **La rete è un albero**: vince la campata che unisce due componenti separate, e
  i cicli non si costruiscono. Il gate — un percorso continuo fra due isolati che
  non passa dal suolo — diventa una conseguenza della regola, e `network.ts` tiene
  insieme la decisione e la sua verifica.
- Sezione in tre righe — travi, carreggiata, parapetto — con la mensola piena
  alle testate: ciò che regge si vede. Il parapetto arriva da `emitRoofTech` come
  per le terrazze della 4.3, quindi **il mesher non è stato toccato** e non c'è
  nessuno slot di palette né tipo di superficie in più.
- **Piazze in quota** sul cuore che la 4.1 aveva chiuso apposta, rette da tre o
  più edifici su lati diversi, con il verde al centro sugli slot `grass*`.
- **Chiuso il debito della 4.12**: `Growing` porta un'ancora invece di un record,
  `sliceStamps` ritaglia gli stamp grandi e la coda `pending` ne fa comparire uno
  per volta per struttura. `LANDMARK.maxDirtyChunks` sparisce — moli e piste
  rispettano il tetto di ogni altra struttura.
- Misura: i tick con `spanPass` (uno su venti) hanno mediana **3,9 ms** e p95
  6,8 ms; gli altri restano a 0,001 ms di mediana. Il tick di passata **supera i
  3 ms** di budget e va detto. Le tabelle di misura in `README.md` e
  `src/sim/README.md` restano da rimisurare a mano.

## 2026-08-21 — Una vista si può chiudere (Fase 4.13)

Le guide dicevano *dove* è puntata la lente. Restava aperto il resto: entrati in
una vista, il picker si chiude e il toast si spegne dopo due secondi, e da lì in
poi non c'era **nessuna superficie** che dicesse cosa si stava guardando, quali
tasti valessero lì dentro e — soprattutto — come tornare indietro. Uscire si
poteva già: `V` fino a completare il giro delle cinque viste, oppure riaprire il
picker e scegliere Normal. Nessuna delle due era scritta da qualche parte, e la
prima chiede di attraversare tre viste che non si volevano vedere.

- **Nuova targa in alto a sinistra** (`ViewBarModel` in `ViewMenuModel.ts`, dipinta
  da `GameHud`). Resta a schermo finché una vista è accesa e risponde alle tre
  domande che sopravvivono al gesto che l'ha aperta: nome della vista, gesto che
  la punta, tasti che valgono **in questa vista**. Due bottoni: *Change view*
  riapre il picker, *Exit view* riporta la città intera.
- **I tasti sono contestuali.** `[` e `]` compaiono solo in Levels, `Q`/`E` solo
  in Cutaway: elencarli sempre riporterebbe il difetto della card d'aiuto, che
  pubblicizzava `[` come scorciatoia globale dove non muoveva niente. X-ray e
  Block focus non ne hanno, e il vuoto è un fatto — si guidano col cursore.
- **`Escape` esce dalla vista**, per ultimo. Era una decisione esplicita che non
  lo facesse — «una vista non è un pannello aperto sopra il gioco» — e regge solo
  finché esiste un'altra uscita ovvia, che non esisteva. Resta dopo lo strumento
  perché con un catalizzatore in mano il toast promette già "Esc to cancel", e
  dopo i pannelli: il primo colpo toglie ciò che copre, il secondo ciò che
  nasconde.
- La card d'aiuto e la riga di `Esc` dicono la stessa cosa; il pannello di debug
  delle viste scende sotto la targa, che occupava lo stesso angolo.

## 2026-08-21 — Le viste dicono dove sono puntate (Fase 4.11 / 4.13)

Il motore della 4.11 c'era per intero e apriva davvero la città; quello che non
c'era è **la spiegazione a schermo di cosa stesse facendo**. Tre viste su quattro
si agganciano alla colonna sotto il cursore e nessuna lo diceva: si sceglieva una
vista, compariva un riquadro retinato con il bordo netto da qualche parte, e non
c'era modo di collegare le due cose. Nessuna uniform nuova, nessun modo nuovo,
nessuna ricompilazione in più.

- **Nuovo**: `src/engine/InspectGuides.ts`. Le linee che dicono dove è puntata la
  lente — contorno del riquadro, carreggiata su cui cade la sezione, mirino con
  asta sulla colonna a fuoco. Vive accanto a `InfluenceOverlay` e ne segue le
  regole: fuori dalla profondità, buffer di dimensione fissa riscritti in posto,
  nessuna geometria voxel. Il rettangolo che disegna **è** quello delle uniform
  già composte e non un secondo calcolo, quindi contorno e retino non possono
  divergere.
- **Il bordo del riquadro sfuma** (`INSPECT.feather`). Il predicato era un
  gradino: il retino cominciava su una riga di voxel allineata agli assi, e a
  schermo quel bordo leggeva come un artefatto invece che come una lente. La
  rampa è una moltiplicazione sulla densità che c'era già — niente colore nei
  vertici, niente mesher — ed è inerte dove il rettangolo è aperto, quindi la
  fetta e la sezione restano il taglio netto di prima.
- **`modeHasLevel` separa due domande che erano una sola.** `modeCuts` diceva sia
  «taglia?» sia «ha una quota?», e le due divergono su Cutaway: la sezione taglia
  ma non guarda `sliceZ`, quindi la barra dei livelli compariva anche lì e si
  trascinava a vuoto. `modeCuts` resta la regola che chiude un taglio quando si
  prende uno strumento.
- **`[` e `]` valgono solo dentro Levels.** Fuori non muovevano niente di
  visibile e intanto **armavano** la quota, così che una fetta aperta dopo
  partisse da un numero assoluto invece che dal suolo davanti — talvolta dentro
  la collina. Adesso da un'altra vista aprono Levels e basta: il primo colpo
  mostra il piano, il secondo lo muove. Per lo stesso motivo il ri-armo scatta
  uscendo da Levels e non solo tornando alla città intera.
- **Ogni vista dice come si punta**, non solo cosa mostra: `ViewOption.gesture`,
  reso nel picker, nel toast di `V` e nella card di aiuto. Ci finisce anche il
  fatto che la finestra dei raggi X è larga `xraySpan` colonne di *mondo* — a
  inquadratura larga sembra non fare niente, e non è un numero da alzare.
- **La card di aiuto nomina le quattro viste** e il pulsante *Views*, invece
  della sola riga «V · Look inside the city». Le righe sono derivate da
  `ViewMenuModel`, non riscritte: due elenchi paralleli divergono al primo
  cambio.

## 2026-08-21 — Isolati terrazzati e cluster verticali (Fase 4.4)

- **Un cluster è due numeri su un record, non un'entità.** Gli edifici adiacenti
  dello stesso fronte condividono la quota — che era già `baseZ` — e l'altezza
  del corso di base, che è `baseBand`; `cluster` dice solo con chi. Non esiste
  nessuna struttura che sopravviva ai membri, quindi collisione, budget di chunk
  e cancellazione restano quelli di un edificio solo, e `src/sim/` continua a
  contare un edificio per record senza sapere che gli isolati esistono.
- **Nuovo**: `src/world/buildings/cluster.ts` (+ test). Puro come `grading/` e
  `sites/`: entrano un `GradePlan` e i termini dei vicini, esce una terna. Un
  lotto entra in fila solo se non deve *scendere* per allinearsi — «si riempie,
  non si scava» vale anche qui — e se il riempimento resta dentro
  `CLUSTER.maxJoinFill`. Chi non entra apre una fila propria: il rifiuto è il
  gradino, ed è così che su un fianco l'isolato terrazzato esce dalla regola
  invece di essere disegnato.
- **Il corso di base è un campo, non un ramo.** `generateBuilding` guadagna
  `baseBandHeight`, che sostituisce l'altezza della sola fascia zero **dopo** il
  tiro: la sequenza del PRNG resta quella, quindi entrare in una fila cambia la
  quota di un edificio e non la sua sagoma. Sopra lo zoccolo condiviso
  l'arretramento che `forcedOp` già produceva cade alla stessa altezza su tutta
  la fila — cornice terrazzata continua senza una voce nuova nella grammatica,
  senza toccare `supported` e senza toccare il mesher.
- **La contiguità diventa deliberata.** L'impronta si accosta al vicino lungo il
  fronte con la stessa logica con cui già si accostava alla carreggiata, entro il
  riquadro dell'isolato: fra due case in fila un solco da un voxel legge come
  crepa, non come separazione. A superare il tetto d'impronta è quindi la massa,
  mentre ogni record resta sotto `MAX_FOOTPRINT`.
- **Il basamento si guadagna, la quota no.** La fila condivide sempre il piano;
  il corso di base compare solo sopra `CLUSTER.minDensity`. La soglia è misurata:
  un catalizzatore solo porta la densità locale a 0,30 e non oltre, tre campi
  sovrapposti a 0,37 di mediana — a 0,35 lo zoccolo è il linguaggio di un centro
  vero e non di una casa sparsa.
- `BuilderStats.clustered` conta gli edifici che stanno in fila, e l'overlay
  tecnico lo mostra accanto a `rejected`: è il numero con cui si verifica il gate
  senza guardare a occhio.
- Misura su 256×256, quattro catalizzatori a raggio 60, 300 tick: `onTick` ha
  mediana **0,022–0,025 ms** e p95 **3,0–3,5 ms**, con 372 edifici di cui **344
  in fila**. La sola spesa aggiunta è la seconda generazione dello stamp dove la
  fila ha un basamento — 27 µs per chiamata, ~0,08 ms su un tick di infornata — e
  niente entra nel ciclo di frame. Le tabelle di misura in `README.md` e
  `src/sim/README.md` restano da rimisurare a mano.

## 2026-08-21 — Le viste diventano un gesto di gioco (Fase 4.13)

- **Il vincolo rovesciato.** La 4.11 aveva costruito il motore delle quattro
  viste e l'aveva chiuso dietro `?debug=1`, scrivendo nella roadmap che era «uno
  strumento dell'harness, non una modalità di gioco». Era la scelta sbagliata:
  guardare dentro la propria città non è una verifica tecnica, è il modo in cui
  una città densa si gode. Il motore non è stato riscritto — nessuna uniform
  nuova, nessun modo nuovo, nessuna ricompilazione in più.
- **Il comando.** Pulsante *Views* nel dock, fra Policies e il tema: da lì in poi
  i bottoni non cambiano la città, cambiano come la si guarda. Il picker elenca
  le cinque viste con la riga che dice **cosa si va a vedere**; `V` le cicla
  senza `?debug=1` e lo annuncia con un toast che si spegne da solo, perché è
  l'unico percorso cieco. `[`/`]` e `PageDown`/`PageUp` muovono la quota, con
  `Shift` per un piano intero.
- **La barra dei livelli**, sul bordo sinistro, compare solo dove c'è una quota da
  muovere. Sta fuori dal picker e non dentro: cercare il piano giusto è un gesto
  continuo, e un pannello aperto coprirebbe quello che si sta cercando di
  leggere.
- **Il fuoco si aggancia.** Era il difetto che rendeva le viste inusabili da
  giocatore: seguendo il cursore un frame alla volta, bastava portare il mouse
  sul dock — o vedersi aprire una carta evento — per far saltare la vista a metà
  città. Ora le viste seguono il cursore finché è sulla canvas e **tengono
  l'ultima colonna** quando esce. Il ripiego sul centro dell'inquadratura resta,
  ma solo quando non c'è ancora niente di agganciato: serve a `?inspect=` da URL.
  Cambiare vista libera l'aggancio, o rientrando ci si ritroverebbe puntati
  sull'isolato di dieci minuti prima.
- **Prendere uno strumento chiude un taglio.** Con Levels o Cutaway attivi il
  terreno vero sotto il cursore è nascosto e si piazzerebbe alla cieca. Le viste
  a velo sopravvivono, perché lì il suolo si legge ancora sotto il retino. Il
  motivo si legge **accanto** all'istruzione dello strumento e non al suo posto:
  un toast normale avrebbe coperto "click the island to place it", che è proprio
  ciò che serve dopo aver scelto un catalizzatore.
- **La quota si ri-arma** tornando alla città intera: una fetta riaperta riparte
  dal suolo che si sta guardando invece che da una quota scelta mezz'ora prima,
  che nel frattempo può essere finita sottoterra. Solo `?slice=` resta fisso.
- Nomi tecnici e etichette restano due cose distinte: `off`/`xray`/`slice`/
  `section`/`block` sono identificatori — parametro URL e referto tecnico — e
  *Normal*, *X-ray*, *Levels*, *Cutaway*, *Block focus* sono ciò che si legge in
  un dock. Le etichette vivono in `src/ui/ViewMenuModel.ts`, puro e testato in
  `node` come `GameHudModel.ts`.
- `modeCuts(mode)` in `inspect.ts` affianca `isCut(uniforms)`: stessa domanda un
  passo prima, per chi deve decidere senza uno stato completo. Un test le tiene
  d'accordo su tutti e cinque i modi — divergerebbero in silenzio, e la barra dei
  livelli comparirebbe dove non c'è quota da muovere.
- `InspectOverlay` resta intero come **referto tecnico** (colonna a fuoco, id
  dell'isolato, densità del retino, nota sulle ombre). Le due superfici chiamano
  le stesse `setInspectMode` / `setInspectSliceZ`.
- Verificato a schermo alla radice, senza `?debug=1`, su una città di ~2.000
  residenti: le cinque viste rispondono a `V` e dal picker, `Esc` chiude il
  picker **senza** spegnere la vista, la barra si trascina e risponde ai tasti,
  l'aggancio tiene la colonna `315,233` quando il puntatore esce e riprende a
  seguire quando rientra. Worker del mesher fermo a 8,64 kB.

## 2026-08-21 — L'isola compare in un secondo

- **Il difetto da cui è partita.** Avviando il gioco si restava mezzo minuto
  davanti a un cielo vuoto con "Preparing the city…" e una lingua di terreno. Il
  lavoro vero, misurato, era di **tre decimi di secondo**: il resto era attesa.
  Due cause distinte, entrambe corrette.
- **Il mondo si scrive a corse, non a celle.** Un'isola 512×512 sono 5,4 milioni
  di voxel, e ognuno passava da `setBlock` pagandosi conversione di coordinate,
  confronto sulla cache del chunk, pack del byte e sei controlli di bordo con la
  relativa chiave di stringa — per una colonna di terreno, che è per definizione
  un tratto contiguo dello stesso colore. Nuova `VoxelWorld.fillColumn`: dentro
  il chunk resta un indice che avanza di un piano alla volta, e tutto il resto si
  paga una volta per corsa. Una colonna è **cinque scritture** invece di trenta:
  tre strati di terreno più due d'acqua. Misurato sulla stessa isola nello stesso
  processo, **947 ms → 354 ms**.
- Il taglio degli strati esce da `STRATA_DEPTH`, derivato dagli stessi numeri di
  `TERRAIN` che legge `paletteForDepth`: è la stessa regola letta a tratti invece
  che per voxel, e un test la confronta voxel per voxel sull'isola vera.
- **Il budget di 1,5 ms protegge un frame di gioco, e durante il caricamento non
  c'è gioco da proteggere.** Misurato a quel ritmo, un lavoro da tre decimi di
  secondo costa centinaia di frame — e ogni frame in più è anche una
  rimeshatura in più, perché un chunk scritto a metà viene ricostruito a ogni
  frame che lo lascia incompleto. `main.ts` usa `LOADING_FRAME_BUDGET_MS` (12) e
  `LOADING_GENERATION_BUDGET_MS` (9) finché la prima scena non è a terra: sotto
  il frame a 60 Hz, così l'isola compare scorrendo invece di apparire dopo uno
  schermo bloccato. La finestra si chiude su `generator.done` e non si riapre —
  le espansioni avvengono dentro una città viva e tornano ai 3 ms.
- Misurato in Chromium sulla stessa macchina, dal `load` a `generationDone`:
  **13,7 s → 5,9 s** con rendering software. Su GPU vera il frame costa una
  frazione di quello, e il caricamento è dominato da `workerMs`.
- Tocca `world/VoxelWorld.ts`, `world/chunkCoords.ts` (`CHUNK_AREA`),
  `world/terrain/biomes.ts`, `world/terrain/IslandGenerator.ts` e `main.ts`.

## 2026-08-21 — I catalizzatori diventano strutture (Fase 4.12)

- **Il difetto da cui è partita.** Il porto non esisteva: quello che si vedeva
  sull'acqua era la **carreggiata dell'isolato costiero**. `groundKindOf`
  classifica `shore` ogni colonna d'acqua entro `maxQuayDepth`, quindi
  `rampAround` portava l'intero anello di strada a `quayLevel` e ne costruiva il
  muro fino al fondale — una piattaforma rettangolare cava in mezzo al mare, che
  nessuno aveva progettato. Tutti e otto i ruoli, intanto, condividevano lo
  stesso rombo di asfalto di raggio quattro e si distinguevano per il colore di
  un voxel.
- **Nuovo**: `GRADING.quayReach` e `isDryLand` in `world/grading/`. Una banchina
  è il bordo costruito della terra: `maxQuayDepth` dice fin dove il fondale
  *regge*, questo dice fin dove ha *senso*. Il Builder lo applica sia all'anello
  di carreggiata sia ai lotti, così non nascono più né strade né edifici su un
  pad isolato al largo. Un test lo verifica sull'isola vera, colonna per colonna.
- **Nuovo dominio**: `src/world/landmarks/` — `parts.ts` (sette primitive:
  `slab`, `shell`, `mast`, `boom`, `colonnade`, `steps`, `deck`), `config.ts`
  (ogni numero e le otto ricette) e `generate.ts` (composizione, rotazione,
  stadio). Le parti sono **dati**, quindi un test ne misura l'ingombro senza
  disegnarle e una ricetta si ruota trasformando numeri.
- **Un landmark è un edificio con un altro generatore.** Entra nel registry come
  `BuildingRecord` con `landmark` valorizzato, e da lì eredita occupazione,
  collisione, budget di chunk, comparsa a budget e avanzamento: l'unico ramo
  nuovo nel Builder è quale generatore disegna lo stamp. Nessuna passata in più,
  nessun secondo indice, nessuno stato nuovo.
- **Lo stadio è ciò che la città ha costruito intorno**, non la desiderabilità:
  il numero di record entro il raggio del catalizzatore. Un catalizzatore siede
  al centro della propria influenza e il campo lì è quasi sempre saturo — un
  landmark che lo leggesse salterebbe tutti gli stadi al primo tick. È il modello
  dei monumenti di Anno 1800, una costruzione a fasi che corona una città *già
  edificata*, detto con il solo dato che il Builder possiede.
- Gli stadi sono **cumulativi dentro un ingombro riservato per intero al
  piazzamento**. Ne seguono due garanzie: un landmark non può restare bloccato a
  metà da un edificio spuntato accanto, e la sagoma dello stadio precedente non
  ha mai niente da cancellare — un test lo verifica come invariante.
- **Ritorno alla simulazione, lieve**: ogni stadio aggiunge
  `BALANCE.gameplay.catalyst.stageBonus` (8) all'intensità del catalizzatore, via
  `setCatalystStrength`, che esisteva già. Su un campo che satura a 255 e basi
  fra 185 e 215 è un margine, non una seconda leva. `src/sim/` continua a non
  sapere che i landmark esistono (invariante 7).
- `BuildingRecord` guadagna `footprintY` opzionale: molo, pista e viadotto sono
  lineari per natura, e schiacciarli in un quadrato li farebbe leggere come
  monconi. Gli edifici restano quadrati per contratto.
- **Due difetti trovati dai test, entrambi reali.** I pilastri di `colonnade`
  contavano il passo da un capo solo, quindi una ricetta non era invariante per
  rotazione dove due parti si sovrappongono. E le prime ricette erano larghe
  sedici voxel — quasi un isolato: seppellivano la sovrapposizione fra due
  catalizzatori, cioè esattamente il punto dove nascono gli usi misti, e a dirlo
  è stato un test di fase 3 già esistente. Ora dodici, una volta e mezza
  l'impronta massima di un edificio.
- 507 test verdi, `npm run build` pulito, i due worker invariati. **Le tabelle di
  misura in `README.md` e `src/sim/README.md` vanno rimisurate a mano**:
  `stageBonus` entra in `balance.ts`.

## 2026-08-21 — Vedere dentro la città (Fase 4.11)

- **Nuovo**: `src/engine/inspect.ts` (+ test) e `src/ui/InspectOverlay.ts`.
  Quattro viste di ispezione dell'harness — `xray`, `slice`, `section`, `block` —
  su `V`, sul parametro `?inspect=` e sul pannello. La decisione (quale modo, a
  che quota, su quale isolato) è una funzione pura verificata in `node`, come
  `lighting.ts`; nel materiale entrano solo i numeri che ne escono.
- Il materiale unico guadagna **due predicati geometrici e una densità**:
  `uInspectPlane`, `uInspectRect`, `uInspectInside`, `uInspectVeil`. Nascosto =
  oltre il semipiano **e** dal lato giusto del rettangolo; l'azione è un retino
  ordinato 4×4 su `gl_FragCoord` con `discard`. Velare e tagliare sono la stessa
  manopola: a densità 1 il retino scarta ogni pixel. `transparent` resta `false`,
  nessun ordinamento, nessuna geometria e nessuno slot di palette in più.
- Il `discard` entra nel sorgente **solo alla prima vista attivata**: una
  ricompilazione per sessione, e chi non usa le viste non paga l'early-Z perso.
  Un taglio porta `side` a `DoubleSide` e si tappa dalle back-face con
  `gl_FrontFacing`, che è anche l'unica ragione per cui non si vede il cielo
  attraverso un volume tagliato — l'interno resta un guscio vuoto, perché il
  mesher non emette facce interne.
- Finché un taglio è attivo le **ombre proiettate si spengono**: la shadow map non
  sa del taglio, e il piano appena scoperto resterebbe all'ombra di quelli che si
  sono nascosti. Sole e ambiente restano, quindi le facce continuano a leggersi.
- **Nuovo**: `nearestLine` in `world/streets/streetGrid.ts` e su `StreetNetwork`.
  È ciò che fa cadere la sezione su una carreggiata invece che su un piano
  arbitrario, e mostra il fronte degli isolati invece di affettare i volumi.
- La colonna a fuoco si risolve **una volta per frame** e non a ogni
  `pointermove`; senza puntatore ripiega sul centro dell'inquadratura, così una
  vista aperta da URL vale qualcosa anche prima che il mouse entri nella canvas.
- Misurato su una città di ~490 edifici: geometria, chunk con mesh e voxel solidi
  **identici** con ogni vista attiva e dopo un cambio di tema; il worker del
  mesher resta 8,64 kB. Le tabelle di misura in `README.md` e `src/sim/README.md`
  non sono toccate: questa fase non entra né nel mesher né nella simulazione.

## 2026-08-21 — Grammatica verticale degli edifici (Fase 4.3)

- Le trasformazioni della regola di fascia diventano una tabella, `BAND_OP`, e il
  repertorio — quali voci provare, in che ordine — vive in `ClassProfile`, quindi
  una riga di catalogo può ridefinirlo senza plumbing. Sparisce l'ultimo caso
  speciale del ciclo delle fasce: il basamento è `keep` ripetuto. Due operazioni
  nuove, `setback` (arretramento da due voxel) e `stack` (corpo sovrapposto, che
  si esaurisce da sé quando il risultato scenderebbe sotto `MIN_FOOTPRINT`).
- Il coronamento passa da booleano a `CROWN_KIND` con cinque cime — `taper`,
  `flat`, `stepped`, `ridge`, `lantern`. `paint` riconosce il coronamento da
  `crownStart` e non più dalla posizione in coda, che ammetteva una sola fascia.
  La distinzione per uso sta nei quattro ripieghi del catalogo, quella per
  livello nel `minLevel` delle righe nuove.
- **Terrazze praticabili e giardini pensili** sulle rientranze che la grammatica
  già produceva: l'anello scoperto passa a `SURFACE_KIND.roofTech` e riceve il
  parapetto da `emitRoofTech` senza che il mesher venga toccato; con
  `roofGarden` il cuore dell'anello prende gli slot `grass*`. Nessuno slot di
  palette e nessun tipo di superficie in più.
- Gli accenti luminosi si accendono per livello (`GRAMMAR.luminousFromLevel`,
  `luminousFullLevel`): niente insegne su una casa appena costruita, una riga per
  piano a metà scala, la lama intera in alto. In `VoxelMaterial.ts` il bagliore
  del ramo `luminous` tinge con lo slot del voxel invece di essere sempre
  `glassPale`, così un'insegna d'ottone non brilla come una spina civica.
- Quattro righe nuove di catalogo — `skyTerraces`, `terraceArcade`,
  `stackedWorks`, `civicLantern` — che usano i tre criteri dichiarati e mai
  usati: `minWealth`, `minSatisfaction`, `minIndustry`. `typology.ts` non è stato
  toccato.
- Corretto un difetto preesistente che la fase ha reso visibile: una catena di
  rientranze portava la cima a un voxel e la torre finiva a punta di spillo.
  `GRAMMAR.minBandSide` è un pavimento nel filtro delle candidate; il coronamento
  può assottigliarsi oltre, il corpo no.
- Misura A/B su un chunk di sedici edifici veri: i quad di dettaglio **calano da
  6 810 a 5 015** (−26%), quindi il margine sotto `MAX_DETAIL_QUADS_PER_CHUNK`
  cresce. Le tabelle di misura in `README.md` e `src/sim/README.md` restano da
  rimisurare a mano.

## 2026-08-20 — `996bc3e` — Calibrazione del terreno, cursore di piazzamento

- **Nuovo**: `src/engine/PlacementCursor.ts` (+ test). Il segnaposto sotto il
  puntatore — base, mirino, onda e fascio — disegnato sempre sopra la scena ed
  escluso dalla pass di profondità, con stato valido/rifiutato distinto.
- Ricalibrati soglie, frequenze e stratigrafia in `world/terrain/config.ts`,
  `biomes.ts`, `decor.ts` e la maschera radiale di `heightField.ts`; il margine
  di Lipschitz resta la rete di sicurezza della calibrazione.
- Ritocchi coordinati a `world/streets/` (config, `lots.ts`, `streetGrid.ts`),
  `world/grading/config.ts`, `world/buildings/` (config e `generate.ts`) e ai
  coefficienti della simulazione.
- `InfluenceOverlay` e `IsoCameraController` allineati al nuovo cursore.
- Entra `shotkit.config.mjs` con gli scatti di riferimento in `.shots/`.

## 2026-08-20 — `c550104` — Opere di terra (Fase 4.2)

- **Nuovo modulo** `src/world/grading/`: `config.ts`, `grade.ts` e il suo test.
  Risponde a «cosa serve *costruire* perché questo pezzo di terreno regga un
  piano» invece che a «questa colonna è già piana?»: classifica la colonna
  (`flat`, `sloped`, `shore`, `rock`, `refused`), la pesa, progetta terrapieno o
  banchina. **Si riempie, non si scava** — un'opera aggiunge volume e non ne
  toglie mai. Recupera circa metà della terra emersa, che prima veniva scartata.
- Il `Builder` passa dal piano di opera prima di scrivere voxel; le azioni di
  gioco usano `BUILD_WEIGHT` per il costo del sito.
- **Nuova skill** `/debug-harness`: parametri URL, hotkey e hook globali escono
  dai file caricati sempre. `AGENTS.md` diventa la fonte unica di comandi,
  convenzioni, contratti, budget e definizione di "finito"; `CLAUDE.md` resta un
  puntatore.

## 2026-08-20 — `62798d5` — Scheletro stradale (Fase 4.1)

- **Nuovo modulo** `src/world/streets/`: `config.ts`, `streetGrid.ts`,
  `lots.ts`, `StreetNetwork.ts` e due test. La rete esiste **prima** degli
  edifici e ne orienta la crescita; è una funzione pura di `(seed, x, y)`,
  quindi non ha stato da salvare né da aggiornare quando arriva un
  catalizzatore. Il ritaglio sulla forma dell'isola avviene a valle.
- Il `Builder` allinea l'edificio al fronte strada, verifica il verso di
  affaccio e l'occupazione dell'isolato prima di piazzare l'impronta.
- `PIANO_GRAFICA.md` rimosso: il suo contenuto è confluito in `ROADMAP.md`.

## 2026-08-20 — `61f3756` — Porta del dev server

- `scripts/free-port.mjs` agganciato a `prestart` e `predev`: libera la porta
  terminando le istanze node rimaste da una sessione precedente.

## 2026-08-20 — `08e7b80` — Ciclo commerciale, tipologie, sole e post-processing

- **Nuovo**: `src/sim/commerce.ts` (+ test). Il ciclo commerciale interno passa
  per tre strozzature indipendenti — banchi, personale, merce — così che la
  città mercantile e quella industriale restino due economie distinguibili.
- **Nuovo**: `src/world/buildings/typology.ts` e il catalogo `TYPOLOGIES` in
  `buildings/config.ts`. La tipologia si sceglie dal luogo, senza numeri sparsi
  nel generatore: stesso luogo, stessa tipologia.
- **Nuovo look**: `engine/lighting.ts` (modello di luce in TS puro, tenuto
  allineato al GLSL da un test), `engine/SunShadow.ts` (shadow map ortografica
  agganciata ai texel) ed `engine/PostProcessing.ts` (bloom, tilt-shift, tone
  mapping in `OutputPass`). Tutti i temi si adeguano.
- Quarto uso urbano nel contratto di `sim/classes.ts`, con `sim/uses.test.ts` a
  presidiarne ordine, influenze e uso misto.

## 2026-08-19 — `f233321` — Microgeometria nel mesher

- **Nuovo**: `engine/mesher/microGeometry.ts` (+ test). Prismi a 1/16 di voxel
  accodati al greedy pass, con facce nascoste eliminate, testate condivise,
  priorità e limite per chunk.

## 2026-08-19 — `16e7073` — Distretti, decisioni, commercio esterno

- **Nuovi** in `src/sim/`: `catalysts.ts` (i sette ruoli con vettore di
  influenza), `districts.ts` (profili locali e specializzazioni da campi
  sovrapposti), `decisions.ts` (scelte periodiche deterministiche) e `trade.ts`
  (import/export sbloccato dal porto).
- **Nuovo**: `world/visualBlock.ts` (+ test) — palette e superficie impacchettate
  nello stesso byte.
- Grammatica di superficie negli edifici, con `buildings/urbanForm.test.ts` a
  verificare che la forma vari in modo deterministico dal profilo locale.

## 2026-08-19 — `d38e7af` — Cozy HUD, qualità adattiva, cielo

- **Nuova interfaccia giocabile**: `ui/GameHud.ts`, `ui/GameHudModel.ts` (view
  model puro, testabile in Node), `ui/hud.css` e `ui/hudIcons.ts` sostituiscono
  `ui/GameToolbar.ts`. Gli overlay tecnici passano dietro a `F3`/`?debug=1`.
- **Nuova qualità adattiva**: `engine/FrameTiming.ts` misura gli intervalli rAF
  (fps, vero uno percento peggiore, p95/p99, jank) ed `engine/RenderQuality.ts`
  ne deriva pixel ratio e profilo di effetti con una sola isteresi — ombre,
  bloom e tilt-shift scendono insieme invece di litigarci. Parametro `?quality=`.
- **Nuovo**: `engine/SkyBackground.ts` — quad in NDC senza profondità, gradiente
  per altezza di schermo (non per elevazione del raggio: la camera è ortografica
  e guarda in basso), disco solare e nuvole a bande. Nuovo tema `diorama`.
- **Nuovi** in `src/game/`: `onboarding.ts` (tutorial derivato dai catalizzatori,
  senza flag nascosti), `cityCondition.ts` (autosufficienza e crisi),
  `sectors.ts` (settori costieri e maschera composta).
- **Nuovo**: `engine/InfluenceOverlay.ts` — cerchi dei catalizzatori e perimetri
  dei settori senza toccare le mesh voxel.

## 2026-08-18 — `1e61a81` — Comandi e modalità di avvio

- **Nuovi**: `game/launchMode.ts` (risoluzione pura della modalità iniziale: la
  radice `/` è l'esperienza completa, gli harness URL restano isolati) e
  `ui/ControlsHint.ts` (onboarding contestuale persistente e pannello di aiuto).

## 2026-08-18 — `c8ee82c` — Azioni di gioco e piazzamento

- **Nuovi**: `game/actions.ts` (azioni economiche atomiche: catalizzatori,
  policy, decisioni, commercio, espansione) e `game/surfacePick.ts` (selezione
  pura della colonna sulla heightmap da un raggio 3D).
- Prima toolbar (`ui/GameToolbar.ts`, poi sostituita dal Cozy HUD) e contratto
  dei pulsanti pointer accettati per il pan della camera.

## 2026-08-18 — `9fc7077` — Edifici procedurali, temi, alberi

- **Nuovo modulo** `src/world/buildings/`: `Builder.ts`, `BuildingRegistry.ts`,
  `generate.ts`, `stamp.ts`, `config.ts` e i loro test. È il ponte tra candidati
  della simulazione e mondo renderizzato.
- **Nuovo modulo** `src/engine/themes/`: sette look intercambiabili. Applicarne
  uno riscrive solo uniform e stato del renderer — nessuna geometria toccata.
- **Nuovi**: `game/loop.ts` (passo fisso con tetto di recupero),
  `game/growthScene.ts` (cablaggio di `grow=1`), `world/terrain/decor.ts`
  (alberi deterministici per cella), `ui/GrowthOverlay.ts`.
- Nascono `AGENTS.md`, i tre `AGENTS.md` di sezione e `docs/PROJECT_MAP.md`.

## 2026-08-18 — `1c9c1a3` — Simulazione a tick

- **Nuovo modulo** `src/sim/`: stato, bilancio del tick, campo di desiderabilità
  chunkato con ricalcolo incrementale, policy, candidati di crescita, barrel
  pubblico e `balance.ts` come unico posto dei coefficienti.
- Contratti presidiati da test fin dal primo giorno: purezza di `tick`, nessuna
  scrittura in `blocks`, serializzazione senza perdita, incrementale ≡
  ricostruzione completa, tick sotto 3 ms.
- Nascono `CLAUDE.md` e `PROJECT_INDEX.md`.

## 2026-08-17 — `6e0a3e0` — Isola procedurale in worker

- **Nuovo modulo** `src/world/terrain/`: 4 ottave di simplex per una maschera
  radiale deformata, biomi da altezza e pendenza, generazione fuori dal main
  thread un blocco di 32×32 colonne per volta, applicazione a budget di frame.
- `TerrainMap` affianca il mondo voxel con una mappa 2D per colonna.

## 2026-08-17 — `544d4b0` — Scaffold del motore voxel

- Storage sparso a chunk (`VoxelWorld`, `Chunk`), greedy mesher puro in worker,
  `ChunkRenderer` con coda a priorità e upload a budget, `VoxelMaterial` unico,
  camera ortografica isometrica, palette a 32 slot, overlay di debug.
