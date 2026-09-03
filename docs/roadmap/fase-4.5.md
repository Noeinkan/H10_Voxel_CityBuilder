# Fase 4.5 — Rete urbana in quota

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Dipende da 4.1 per la topologia e da 4.4 per avere qualcosa da collegare in
quota. **È la prima della spina dorsale**, e non per anzianità: la campata è la
prima struttura del progetto che non poggia a terra, e finché non esiste, «quota»
resta un numero dentro uno stamp invece che un posto dove si arriva.

**Cos'è una campata, detto dal lato del codice.** Un edificio è un
`BuildingRecord` ancorato al terreno; un ponte no — ha due appoggi che non sono
suoi, non occupa il suolo che scavalca, e la sua ragione di esistere è
un'altra struttura. Le due strade sono farne un record con un flag, come la 4.12
ha fatto con i landmark, oppure un dominio a sé. Va tentata prima quella del
record: eredita occupazione, budget di chunk e comparsa a budget senza aggiungere
una passata, e l'unico ramo nuovo è quale generatore disegna lo stamp. Cambia
però un'assunzione che i landmark non toccavano — `baseZ` smette di venire dal
terreno — ed è esattamente l'assunzione che la 4.9 dovrà rompere comunque.

**Il vuoto sotto è il contenuto, non lo sfondo.** Un ponte fra due torri legge
come ponte solo se sotto si vede il salto: è la stessa lezione della finestra di
cielo dell'arcologia (4.14). Da qui due conseguenze di forma — la campata deve
essere **abbastanza larga da essere abitata** e non un filo teso, e la struttura
che la regge (piloni, travature, tiranti, impalcature) va **mostrata** invece che
nascosta. Un impalcato che sembra galleggiare toglie proprio l'informazione per
cui esiste.

**Stato implementazione:** completata. Il gate è verificato dai test — appoggi
reali, suolo libero, continuità fra isolati, nessuna orfana — tranne la
leggibilità alle normali distanze di gioco, che resta da guardare a occhio con le
viste della 4.11.


**Vincolo:** nessuna campata senza appoggi reali, e nessun appoggio che sia solo
un numero — se l'edificio che la sostiene cambia livello o sagoma, la campata
segue o sparisce, mai resta a mezz'aria. Il mesher non si tocca (invariante 6):
un ponte è fatto degli stessi voxel di una torre, e se una forma chiede una
passata propria è la forma a essere sbagliata.

**Gate:** ponti e percorsi in quota sono leggibili alle normali distanze di
gioco, poggiano sempre su appoggi reali, esiste almeno un percorso continuo fra
due isolati diversi che non passa dal suolo, e nessuna campata resta orfana
quando l'edificio che la sosteneva cambia livello.

**Come è stato risolto.** Una campata è **un record con un flag**, come il
roadmap chiedeva di tentare per prima cosa: `span` dice quale generatore disegna
lo stamp, `supports` con chi. Da lì eredita collisione, budget di chunk, comparsa
a budget ed esclusione dagli istogrammi senza una passata in più. L'unica cosa
davvero nuova è l'invariante del dominio — **una campata non prende suolo** — e
si è pagata sdoppiando l'indice per colonna del registry: `columns` con tutti i
record, che regge `overlaps`, e `groundColumns` con i soli record che poggiano
davvero, che è quello che legge `isOccupied`. Nessun chiamante è cambiato, e
`isOccupied` è rimasta O(1) senza allocazione. Sotto un ponte la carreggiata si
dipinge ancora, il lotto si costruisce ancora, e se un edificio cresce attraverso
la campata a cedere è la campata.

**Il difetto che ha riscritto la regola: gli edifici sono piramidali.** La prima
versione cercava l'appoggio al filo dell'impronta e non ne trovava **mai** — zero
campate su 6 911 coppie. Il profilo di una torre lo dice: 6×6 fino a quattro
voxel sopra la base, 4×4 per i quattro successivi, e da lì in su una guglia. Al
bordo dell'impronta la parete esiste solo dentro la fascia zero, cioè sotto
qualunque franco che una strada possa chiedere. `highestLanding` cerca quindi la
parete **rientrando** verso il centro, e la campata che ne esce è più lunga del
vuoto e sporge sopra le fasce basse dei propri appoggi — che è esattamente come
atterra una passerella vera, sull'arretramento e non sul basamento. Da qui
l'`except` su `overlaps`: toccare ciò a cui si è attaccati non è una collisione.
Il volume dev'essere comunque tutto aria, o cancellare la campata bucherebbe
l'edificio.

**La rete è un albero, e il gate è una conseguenza.** Fra due campate possibili
vince quella che **unisce due componenti separate**; chi chiuderebbe un ciclo non
si costruisce, perché fra due posti già raggiungibili un secondo percorso aggiunge
ingombro e non raggiungibilità. `spans/network.ts` tiene sia la decisione sia la
verifica: se «connesso» fosse definito in due posti, divergerebbero al primo
refactor e il test smetterebbe di misurare la regola. Il grafo si **ricostruisce**
a ogni passata invece di aggiornarsi — un union-find non sa disfare un'unione, e
qui le campate spariscono davvero.

**La piazza è un nodo, non un ponte largo.** Vive sul cuore che la 4.1 aveva
chiuso apposta, ed è retta da tre o più edifici su lati diversi: è quello a farne
uno snodo, perché le campate ci arrivano da direzioni diverse. Anche lei ha dovuto
imparare ad allargarsi fino ai muri veri — il cuore è il vuoto *al suolo*, e in
quota gli edifici che lo delimitano si sono già arretrati.

**Il debito della 4.12, chiuso.** `LANDMARK.maxDirtyChunks: 48` era un tetto
alzato apposta per i moli e le piste, e il suo stesso commento diceva che una
ricetta troppo grossa «andrà spezzata in segmenti — non esentata». Ora `Growing`
porta un'**ancora** invece di un record, `sliceStamps` ritaglia ciò che supera
`BUILDER.segmentSide`, e la coda `pending` ne fa comparire uno per volta per
struttura: accodarli tutti insieme non avrebbe ridotto niente, perché i chunk si
sporcano man mano che le scritture atterrano. Il tetto dei landmark non esiste
più: rispettano quello di ogni altra struttura. Il test che verifica tutte le
ricette su ogni verso e sedici offset — scritto dalla 4.12 — passava con
quarantotto e passa ancora senza, che è la prova che l'eccezione era diventata
inutile invece di essere nascosta.

**Costo e misure.** Su 256×256 colonne, un catalizzatore a raggio 96 e 420 tick,
con 395 edifici e 15 campate: i tick su cui gira `spanPass` (uno su venti) hanno
mediana **3,9 ms**, p95 6,8 ms; tutti gli altri restano a mediana 0,001 ms e p95
2,9 ms. Le piazze valgono circa mezzo millisecondo di quei 3,9; il resto è
l'enumerazione delle coppie. Va detto per intero: **quel tick supera i 3 ms di
`FRAME_BUDGET_MS`**, e sta nell'ordine del massimo che quel ciclo già tocca —
16,8 ms, che è `nextBuildSites` mentre scandisce il campo allocato, preesistente e
di competenza della fase 6. Niente entra nel ciclo di frame: `step` e
`stepSurface` non sono toccati, e il worker del mesher resta 8,64 kB in bundle.
**Le tabelle di misura in `README.md` e `src/sim/README.md` vanno rimisurate a
mano**, e non sono state aggiornate qui.

**Resta aperto.** La rete sta **bassa**, e non per scelta: il franco è due cubi di
terreno sotto le travi perché l'unica fascia larga abbastanza da reggere un
impalcato sta fra il quarto e l'ottavo voxel sopra il suolo. Con un franco più
generoso il pavimento saliva sopra quella fascia e non passava più nessuna coppia
— non ponti più alti, zero ponti. **La 4.6 doveva liberare la quota e non ci è
riuscita**: alzare il tetto verticale ha reso alte le torri del centro, ma la
stessa fase ha anche abbassato la periferia, quindi le coppie di appoggi alti
sono diventate più rare. Misurato sulla città di prova: franco a due cubi undici
campate, a tre o quattro cubi quattro. Il debito passa alla 4.9, dove un
impalcato con appoggi propri non deve aspettare che due torri diventino alte
nello stesso punto. Le piazze sono
poche — una o due per città matura — per la stessa ragione: chiedono un cuore
d'isolato fra sei e sedici colonne con il perimetro costruito su almeno due lati.
I mezzanini esistono nella regola e non compaiono ancora sull'isola di prova:
pretendono due membri della **stessa** fila affacciati su un cortile senza
carreggiata, e la 4.4 accosta i membri di una fila invece di lasciarli affacciati.
Una campata che perde l'appoggio **sparisce e viene riproposta** dalla passata
dopo: è il «segue» del vincolo, ma passa da una cancellazione visibile e non da
uno spostamento. E i cicli non si costruiscono mai, quindi la rete resta un
albero: nessun anello, e da un capo all'altro c'è un percorso solo.
