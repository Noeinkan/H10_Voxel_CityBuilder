# Fase 4.9 — Quote abitate e città sospesa

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Terza della spina dorsale e la più grossa: dipende da 4.4 per gli isolati
terrazzati, da 4.5 per le campate e da 4.6 per il tetto di quota, e viene dopo di
loro perché è **l'unica sotto-fase che tocca l'assunzione di colonna**. Il look al
neon che accompagna queste immagini è 4.7 e 4.8; qui c'è solo la struttura che
regge.

**Com'è fatta davvero una città a livelli.** Nivalis, in Cloudpunk, non ha
edifici sospesi: ha **cinque piani di città**, e le piattaforme che sembrano
galleggiare poggiano sopra altri edifici. La parte bassa è deliberatamente
strutturale — volumi grossi di cemento, poche finestre — perché è la fondazione
di quello che sta sopra, e le guglie stanno solo negli ultimi livelli. È anche
un'istruzione per la 4.6: il basso non va riempito di torri ma di podi. Una
megacittà fatta di torri alte ovunque non legge come alta — legge come piatta,
solo più in su.

**Cosa c'era già e cosa mancava davvero.** Il mondo era pronto più di quanto
sembrasse: `BuildingRegistry.overlaps` considera *non* sovrapposti due volumi
sulla stessa colonna con intervalli di quota disgiunti — è esattamente la
condizione che permette a un edificio di poggiare sul tetto di un altro — e
`topOf` esisteva già come punto d'ancoraggio. A fermare tutto era il piano sopra:
`TerrainMap` tiene **una** altezza e **un** bit `buildable` per colonna, e
`nextBuildSites` scartava la colonna che il registry dice occupata.

**La via già battuta.** In 4.1 il candidato ha smesso di essere un indirizzo ed è
diventato un isolato, con `placeLot` a risolvere il lotto: `src/sim/` non ha
dovuto sapere che le strade esistono. Qui serviva la stessa mossa in verticale —
la simulazione designa una colonna, il mondo sceglie **la quota** — e la
simulazione continua a non avere una coordinata verticale (invariante 7).

## Il verso della scansione, non il planner

Il planner dei percorsi funzionava già. A mancare erano i luoghi, e la causa
stava in una riga: `faceRuns` cercava la corsa di parete **dall'alto in giù**,
quindi ogni ospite si prendeva la fascia più alta che reggesse e due vicini di
livello diverso finivano a quote lontanissime. Invertito il verso, la prima corsa
utile è la sommità del basamento — che la 4.4 rende condivisa da tutta la fila — e
i vicini diventano complanari **per costruzione**, senza nessuna griglia imposta
da fuori. Alla mensola si è poi tolto il giro fra le quattro facce: sta sul solo
fronte strada, perché è lì che il corridoio di un percorso corre sopra la
carreggiata invece che sopra i corpi degli edifici.

**Metà della città non arretra affatto.** È il difetto che solo la misura ha
rivelato: impronte piccole e corpi che salgono a prisma dentro il corso di base
condiviso non hanno **nessuna** sommità di fascia nella finestra utile, e
centoquarantasette ospiti su quattrocento non offrivano una sola corsa. Dove non
c'è una fascia da continuare la mensola si attacca ora alla facciata piena, come
un balcone: le mensole di una città matura passano da trentanove a cinquantatré,
e le coppie con gli atterraggi allineati da due a settantacinque.

**Il colmo era un pavimento, e andava fatto tetto.** `crestOf` costringeva ogni
percorso a passare sopra ogni tetto sotto il proprio corridoio: delle ottantasette
coppie che la passata prova davvero, quarantotto morivano lì. La corsa parte ora
dalla quota dei due capi e si alza di un pianerottolo per volta finché il luogo la
accetta — il colmo resta, come tetto della ricerca. La **piega a zeta** torna con
`crestOf` sui riquadri veri dei pezzi invece che sul corridoio della corsa, e i
rifiuti per sfalsamento scendono da duecentoventinove a sei.

**La guida: una cosa sola posata in due modi.** `src/world/aerial/guideway.ts` è
il montante d'isolato — una guida verticale che sale da terra fino a un impalcato
abitato, con le capsule ferme che di notte si accendono — e la stessa guida
incassata nel piano dei tratti di percorso è la monorotaia. È «struttura di
scena»: niente si muove, perché questo progetto non ha oggetti animati fuori dai
chunk. Il montante è anche l'unica cosa qui che **sta sul marciapiede**: misurato,
sotto una mensola sul fronte strada c'è o il proprio ospite o l'asfalto.

## Il difetto che teneva il gate rosso, e come si è chiuso

Per parecchio la fase ha avuto quattro caselle spuntate e il gate **rosso**: su
`Builder.test.ts` («la citta in quota») `stacked`, `routes` e `lifts` erano a
zero, e cadeva anche «ospita usi diversi su quote diverse» dell'arcologia. Le
mensole c'erano; a mancare era chi ci saliva e chi ci costruiva sopra.

**La causa era una riga dichiarata e mai scritta.** Il dominio diceva già «in
quota il lotto **è** l'impalcato — niente `findLot`, niente opere di terra,
niente fila», ma il codice sceglieva la quota **dopo** la ricerca del lotto a
terra. Quella ricerca boccia la carreggiata come suolo preso — giustamente, per
un lotto a terra — e così bocciava proprio le mensole del fronte strada, cioè
quelle che la fase ci mette apposta. Misurato su una città di quattrocentoventi
edifici: ottantanove mensole, quarantacinque abbastanza larghe per un edificio, e
**trentanove escluse per la sola strada che avevano sotto**. Ne restavano sei, e
nemmeno quelle venivano mai raggiunte.

Peggio: quando la ricerca a terra *ripiegava* su un impalcato, ci centrava sopra
l'impronta e la vedeva rifiutare dalla collisione con l'ospite — e il rifiuto in
quota non è definitivo di proposito («la colonna resta buona al suolo»), quindi la
stessa colonna tornava a ogni infornata. Con le mensole abitabili quel giro a
vuoto è esploso: **tremilasessantotto rifiuti `occupied` su tremilacentotre**, e
la città da quattrocentoventi edifici a centosessantanove.

Le tre mosse che lo chiudono:

1. **`LotSearch.pickAerialLot`** risolve la quota sulla colonna che la simulazione
   propone, prima della ricerca a terra e solo dove il suolo è già speso — o
   costruito, o carreggiata. La prima domanda è una lettura di `Set`, quindi
   un'isola senza impalcati costa quello che costava.
2. **La ricerca a terra torna a parlare del solo suolo**: la deroga «se sopra
   corre una soletta il lotto esiste ancora» era una lettura giusta nel posto
   sbagliato, e `pickDeck` sparisce con lei.
3. **`deckLot`** trova il quadrato libero dentro il riquadro dell'impalcato. Il
   riquadro non è il lotto: una mensola comincia dalla parete a cui è appesa, e il
   registry occupa l'intero riquadro dell'ospite per tutta la sua altezza. La
   parete resta fuori da sola, senza nessuna regola che sappia cosa sia un ospite.

**E la mensola nasce abbastanza profonda da essere un lotto, o non cambia
niente.** Perché oltre il filo avanzi l'impronta minima di un edificio servono
`minFootprintOf() + maxRecess` voxel di sporto: è aritmetica, non taratura. Ma
sette voxel su una carreggiata secondaria larga due la attraversano tutta, quindi
`AERIAL.terrace.habitableOverhang` **si chiede per primo e si ripiega**: dove non
ci sta, la mensola nasce come è sempre nata. La città non perde una mensola per
guadagnarne una abitabile.

Esito, sulla stessa fixture: quattrocentoventi edifici come prima, `occupied` da
trentadue a venticinque, e `stacked` 3, `lifts` 1, `routes` 2, `piers` 51 dove
erano tutti zero. L'arcologia stratificata passa di conseguenza: cadeva perché la
città non arrivava abbastanza matura.

**Due difetti veri sono usciti lungo la strada**, e non erano di questa fase:
`upgradeDriver` ricostruiva il record senza `supports` — un edificio in quota che
promuoveva diventava un volume sospeso e il suo impalcato tornava libero di
cadere — e `firm` ammetteva la battigia come piede di una gamba, che regge solo
*con* una banchina: le gambe finivano in mare oltre `GRADING.quayReach`. Nessuno
dei due si vedeva finché in quota non ci costruiva nessuno.

## I percorsi esistono, e sono pochi: perché

`routes` è passato da zero a due sulla città di prova, e non è una rete. Il
verdetto, dopo quattro misure indipendenti, è che il corridoio non c'è:

- **Preferire il dirimpettaio al compagno di fianco non cambia una coppia.** Con
  `minSeparation` a sei il compagno più vicino sta già dall'altra parte della
  carreggiata, quindi la distanza dice già quel che direbbe un rango.
- **Abbassare `minSeparation` a due** guadagna un percorso e ne costa sette
  mensole: le passerelle nuove tolgono spazio agli aggetti.
- **Le mensole abitabili si guardano, e sono troppo vicine.** Delle ottantaquattro
  mensole, sessanta hanno una dirimpettaia entro `maxSeparation`; ventisei coppie
  sono **già complanari**, quindi il dislivello non è il problema. Ma trentuno su
  sessanta hanno in mezzo un vuoto di zero-tre voxel, cioè sotto la separazione
  minima: gli aggetti profondi si sono avvicinati fino quasi a toccarsi.
- **E dove il vuoto basta, in mezzo c'è un edificio.** Dei corridoi affacciati che
  passano tutte le soglie ne restano **cinque**, e quattro hanno per primo
  ostacolo un corpo di fabbrica, non una mensola. Questo chiude anche l'ipotesi
  che restava aperta — un percorso che *attraversa* una mensola complanare invece
  di esserne bloccato: non comprerebbe niente.

La forma che resta da provare non è una taratura ma un pezzo che manca: **la
mensola dirimpettaia nasce perché un percorso la vuole**, cioè si decide il
capolinea prima dell'aggetto e si sceglie la profondità in funzione della luce da
attraversare. È la sola che risolva la causa invece di aggirarla.

## Il fondo del vuoto

Lo strato di nuvole c'era già ed è completo — una lastra volumetrica che si
attraversa a fette, con la rigatura dei raggi X a lasciar vedere cosa c'è dietro
— ma sta **dove arrivano le cime**: fra 106 e 133 nei tre temi, mentre le mensole
abitate della città di prova stanno fra 35 e 60. Era un soffitto cinquanta voxel
più su, e da una quota alta guardando in giù non c'era niente: senza niente sotto,
una quota alta non si legge come alta.

Il fondo è **lo stesso banco posato un piano più sotto**: stessa grana, stessa
copertura, stessa tinta, quindi nessun secondo look da tarare su sette temi.
Cambia solo dove sta, e quel dove lo detta il mondo e non il tema —
`BuilderStats.stackedZ` è il piano abitato più basso, e `cloudFloorHeight` mette
la sommità del banco due cubi sotto di lui. A zero è spento, ed è il vincolo della
fase detto in un numero: una partita che in quota non ci arriva mai resta identica
a quella di oggi, e il fragment esce prima del ciclo sulle fette.

**Solo sui frammenti, mai sul fondo procedurale.** Un raggio che non incontra
niente attraverserebbe anche questa lastra e la dipingerebbe sul cielo: il fondo
del vuoto esiste dove c'è un vuoto da riempire, e il vuoto lo fanno i livelli
sotto.

## Cosa resta aperto

**Il salvataggio pota la città in quota, e adesso si sente.** `save/capture.ts`
toglie dal file impalcati, gambe e montanti — nessun generatore li sa ridisegnare
da un record, perché il loro `generateDeck` vuole un `DeckPlan` che il record non
porta — e con loro toglie transitivamente chi ci poggiava sopra. Finché in quota
non abitava nessuno era una potatura di decoro; adesso è la casa del giocatore.
Il prossimo incremento è dare a `recordStamp` le tre forme in quota, il che
significa ricostruire dal solo record l'ancoraggio della mensola e il carico di
una gamba — due cose che oggi vivono solo nel piano.

Da qui viene anche il rosso di `restore.test.ts` («ridisegna gli stessi voxel»),
che dà a `restore` i record grezzi del registry invece di quelli che il
salvataggio scrive davvero: verificato a bracci alternati, cade identico con e
senza le mensole profonde, quindi è anteriore a questo lavoro.
