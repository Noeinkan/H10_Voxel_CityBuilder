# Fase 4.2 — Dislivelli e costa come forma urbana

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Dipende da 4.1: è la rete a incontrare per prima le pendenze, e una strada che
attraversa un dislivello o si ferma o lo risolve.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono le opere, il vincolo di riempimento e la
continuità delle rampe, non la leggibilità.


**Vincolo:** la fondazione continua a riempire, mai a scavare. Un muro di
contenimento aggiunge volume, non toglie isola.

**Gate:** su un'isola con rilievo marcato pendenze e linea di costa risultano
progettate; nessun sito viene più perso per una pendenza che una rampa
risolverebbe.

**La premessa della fase era in parte sbagliata, e vale la pena scriverlo.**
Misurando l'isola prima di toccarla — seed 1337, 256×256 — il dislivello fra due
colonne adiacenti risulta **sempre 0 o 1, mai di più**: è il vincolo di Lipschitz
che la taratura del rumore garantisce, e significa che *sull'isola non esistono
strapiombi*. Di conseguenza `tooSteep` non è mai scattato una volta — il
dislivello massimo sotto un'impronta 4×4 edificabile è 2, contro i 3 che quel
tetto ammetteva — e non c'erano tratti da incassare né gradini da scalinare.
Rampe e scalinate progettate contro quel nemico sarebbero state codice morto.

Il rifiuto che costava davvero era un altro, e molto più grande: delle 20 721
colonne di terra emersa **solo 10 489 erano `buildable`**, cioè la metà esatta.
Le altre erano 5 388 colonne di battigia rifiutate dal bioma — l'intero anello
costiero — e 2 994 rifiutate per una pendenza fra 0,34 e 0,52, che è un fianco
dolce, non una parete. La fase è stata reindirizzata su quelle.

**Come è stato risolto.** La domanda è cambiata da "questa colonna è già piana?"
a "**cosa serve costruire perché lo diventi?**". La risposta vive in
`src/world/grading/`, è pura, e ha tre valori: niente, un terrapieno con il suo
muro di contenimento, una banchina che porta il piano sopra la battigia. La
quota finita è sempre il **massimo** delle colonne toccate, mai la media: è la
forma che prende il vincolo "si riempie, non si scava", e un test la verifica su
tutta la mappa dopo una crescita vera, colonna per colonna.

Le quattro cose che dovevano salire — la fondazione di un lotto, la carreggiata
che lo raggiunge, il molo, la piazza di un catalizzatore — sono diventate **la
stessa operazione con quote diverse** invece di quattro sottosistemi: la coda di
superficie, che prima portava solo un colore, ora porta anche una quota di
progetto e il muro che la regge. La rampa è la relazione 1-Lipschitz di
`rampField`: due passate lineari che alzano il campo di quote finché nessuna
colonna di carreggiata dista più di un voxel dalla vicina.

`maxTerrainStep` non è stato rivisto ma **rimosso**: diceva "quanto dislivello
sopporto prima di rinunciare", e la domanda ora è "quanto muro sono disposto a
costruire". Al suo posto `GRADING.maxWorksStep`, tarato sul caso peggiore vero,
che è la banchina che scende sul fondale e non il terrapieno. I motivi di
rifiuto scendono da cinque a quattro: `notBuildable` e `belowSea` dicevano
entrambi "il terreno non è già piano e asciutto", che ha smesso di essere un
motivo.

**Un difetto della 4.1 che solo l'isola vera ha rivelato.** Con la crescita
misurata su terreno reale invece che sulla fixture piana, la città si fermava a
**quattordici edifici** e non cresceva più. La causa: `nextBuildSites` ordina i
candidati per punteggio e, su un campo saturo — dove interi quartieri toccano il
massimo — a decidere resta il criterio di parità, cioè `x` e poi `y`. La
simulazione riproponeva quindi all'infinito lo stesso pugno di colonne
nell'angolo minimo dell'area satura; appena il loro isolato si riempiva, ogni
infornata successiva ricadeva su un isolato già dichiarato pieno. La colonna
proposta designa ora **un luogo, non un isolato**: se il suo è pieno, `findLot`
cerca in quelli attorno fino a `blockSearchRadius`. Stessa isola, stessi tick:
da 14 a 276 edifici.

**Costo.** Misurato con un A/B vero: un worktree sul commit precedente
(`62798d5`, strade senza opere) e l'albero di lavoro, stesso script e stessa
macchina, esecuzioni alternate per annullare la deriva. 256×256 colonne tutte
edificabili, quattro catalizzatori a raggio 60, 300 tick.

| | mediana per tick | p95 | edifici |
| --- | --- | --- | --- |
| prima della 4.2 | 2,31 / 2,50 / 2,71 ms | 4,92 / 5,22 / 5,47 ms | **152** |
| con la 4.2 | 2,51 / 2,69 / 2,94 ms | 3,74 / 4,92 / 5,98 ms | **450** |

Gli intervalli si sovrappongono: **il costo per tick è indistinguibile dal
rumore**, mentre gli edifici sono tre volte tanti — e quel conteggio è
deterministico, non una misura. Non perché le opere siano gratis, ma perché la
correzione di `findLot` ha tolto il tappo che fermava la crescita, e il lavoro
in più si distribuisce su un risultato tre volte più grande.

La mediana sta dentro i 3 ms di `FRAME_BUDGET_MS`; il p95 no, e i tick cari
restano quelli in cui `nextBuildSites` scandisce l'intero campo allocato — è
preesistente, è il vero sforamento del budget, e appartiene alla fase 6. Il
massimo su singolo frame non è riportato di proposito: su questa macchina, con
un'altra sessione che compilava in parallelo, oscillava fra 8 e 32 ms su
entrambi i lati dell'A/B e non misurava il codice.

Il budget di superficie conta ora **voxel e non celle**, perché una cella di
molo può costarne sei e contarla per una lascerebbe passare sei volte il lavoro
previsto proprio dove il terreno è più mosso.

**Resta aperto.** Gli assi principali continuano a essere periodici e non
tracciati fra i poli: le rampe hanno reso la rete capace di *salire*, non di
*deviare*, e legare un asse a un polo richiede ancora un tracciato con stato.
Il molo si spinge fino a `maxQuayDepth` sotto il livello del mare e non oltre,
quindi non esistono ancora approdi in acqua profonda né strutture su palafitta:
sono volume pieno dal fondale in su, che è la sola forma compatibile con "si
riempie, non si scava". Il piazzamento manuale dei catalizzatori non è più indietro: `catalystFailure`
è passato dal bit `buildable` a `groundKindOf`, quindi giocatore e crescita
automatica rifiutano le stesse colonne. Il vincolo *di ruolo* — il porto sulla
costa, l'aeroporto sul piano — è arrivato con la 2.1, ed è stato una regola in
più e non una regola diversa.
