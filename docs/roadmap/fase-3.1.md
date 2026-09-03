# Fase 3.1 — Il cibo ha un luogo

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

**Stato implementazione:** completata. Il gate resta da validare a schermo: i
test coprono le regole — il verso dei solchi, il ritiro di un lotto, la
raggiungibilità della torre — non la leggibilità della campagna mentre la si
sorvola.

**Perché la fase 3 si riapre.** La fase 3 ha separato uso urbano, catalizzatore e
tipologia, ma il cibo è rimasto un termine dell'industria:

```ts
const foodProduced = industrial * BALANCE.food.perProduction * staffing;
const materialsProduced = industrial * weights.productionYield * staffing;
```

La stessa fabbrica produceva cibo e materiali dallo stesso organico. Ne
seguivano tre difetti, e il terzo è quello che conta: non si poteva **indicare**
da dove viene il cibo; non esisteva competizione per il suolo, perché la capacità
alimentare cresceva con la densità invece che contro; e l'unico modo di restare
senza cibo era non costruire abbastanza industria — mai «non c'è più terra».
L'unica cosa agricola del gioco, il mandato `communityGardens`, era decorazione
più un regalo una tantum.


**Gate:** si può indicare a schermo da dove viene il cibo; una città che si
allarga sui propri campi vede la dispensa stringersi senza che nulla di scritto
glielo dica; e quando il suolo finisce la risposta è salire.

**Come è stato risolto.** Il listino di `BALANCE.farms` è in edifici residenziali
sfamati — un campo due, un frutteto uno, una torre sei — e il cibo per tick lo fa
`FOOD_PER_HOUSE`, che è `residentialCapacity * food.perResident`: cambiare la
capacità di una casa muove il listino da solo, e il pareggio non si rompe più per
distrazione. I campi non sono record del `BuildingRegistry` ma di un registro
loro, perché non appartengono a nessuno dei due indici di collisione — in uno
impedirebbero di costruirci sopra, nell'altro perfino di passarci una strada.
Entrano nel mondo dalla coda della superficie e non da uno stamp, perché un
marcatore di copertura *è* palette 0 e uno stamp non sa esprimerlo. Il terreno
non si ridipinge: a leggere come campo è la regolarità dei solchi, non il colore
del suolo — misurato a 5120 quad per chunk arato contro un tetto di 16384.

Il frutteto è invece volume, quindi passa dalla coda della crescita come un
edificio, e ne eredita budget e cancellazione senza aggiungere un quarto posto da
cui i voxel entrano nel mondo. Il disegno di un albero è rimasto scritto una
volta sola: `drawTree` è il corpo di `writeTree` senza la destinazione. La specie
da frutto non compare in `FLORA` — non nasce da sola — ed è per questo che può
avere una sagoma potata; a dire «coltivato» è il reticolo contro il jitter del
bosco vero.

La torre idroponica è **una riga di catalogo** e nient'altro: l'accento verde a
livello alto esce `luminous` dalla grammatica che c'era già, quindi le fasce di
coltura si accendono di notte senza un materiale, uno slot o un emettitore in
più. A dire alla simulazione che è una torre è la **tipologia costruita** e non la
specializzazione del luogo: in un distretto che esprime `farming` un edificio
sotto `minLevel` prende comunque una forma normale, e contarlo come torre lo
farebbe produrre cibo senza esserlo.

L'HUD legge un referto del tick (`state.harvest`) invece di rifare il conto:
duplicare il listino nell'interfaccia sarebbe il modo sicuro di far divergere le
righe dal numero che le sta sopra. E `communityGardens` ha smesso di essere
decorazione — abbassa la soglia di ciò che diventa frutteto, quindi il mandato si
vede nella campagna oltre che negli isolati.
