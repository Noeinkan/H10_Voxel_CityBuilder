# Fase 4.4 — Isolati terrazzati e cluster verticali

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Dipende da 4.1 — l'isolato è definito dalle strade — e da 4.3, che fornisce la
grammatica per esprimerlo.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono quota e basamento condivisi, la contiguità delle
impronte, i gradoni sul fianco e la rigenerabilità, non la leggibilità di un
distretto denso a distanza di gioco.


**Vincolo:** un cluster resta un insieme di record, non un nuovo tipo di zona. La
simulazione continua a contare gli edifici come li conta oggi.

**Gate:** i distretti densi si leggono come isolati continui e terrazzati invece
che come volumi isolati vicini; il costo della crescita resta indipendente dal
numero totale di edifici.

**Come è stato risolto.** Un cluster è **due numeri su un record**, e non
un'entità: `baseZ` era già la quota del piano, quindi ai record servivano solo
`cluster` — con chi — e `baseBand`, l'altezza del corso di base condiviso. Da lì
segue tutto il resto senza una riga di plumbing: collisione, budget di chunk e
cancellazione restano quelli di un edificio solo, perché il basamento condiviso
sta **dentro** lo stamp di ciascun membro invece che in una struttura che gli
sopravvive. È la stessa mossa della 2.1 e della 4.2 — la regola vive in un
dominio puro, `buildings/cluster.ts`, dove entrano un `GradePlan` e i termini dei
vicini ed esce una terna; `src/sim/` continua a contare un edificio per record e
a non sapere che gli isolati esistono (invariante 7).

**Il rifiuto è il gradino, non un fallimento.** Un lotto entra in una fila solo
se non deve *scendere* per allinearsi — vale anche qui «si riempie, non si
scava» — e se il riempimento resta dentro `CLUSTER.maxJoinFill`. Chi non entra
apre una fila propria alla propria quota, ed è così che su un fianco l'isolato
terrazzato esce dalla regola invece di essere disegnato da qualcuno.
`GRADING.maxWorksStep` non poteva fare quel lavoro: è tarato sulla banchina che
scende sul fondale, e con ventiquattro voxel avrebbe messo nella stessa fila due
lotti separati da mezzo versante — un muro, non un isolato.

**A superare il tetto d'impronta è la massa, non il record.** «4×4» erano quattro
cubi di terreno, cioè l'attuale `MAX_FOOTPRINT` di otto voxel; a scavalcarlo è la
fila contigua, mentre ogni record resta sotto. Alzare il tetto del singolo record
era l'alternativa da non prendere: è lo stesso cambio di scala che il commento di
`maxDirtyChunksPerBuilding` racconta essere già andato storto una volta, facendo
sparire in silenzio proprio gli edifici alti. Quello che si è dovuto rivedere è
altro — la contiguità è diventata deliberata (l'impronta si accosta al vicino
lungo il fronte, come già si accostava alla carreggiata), e il riempimento che un
membro paga per allinearsi ha un tetto proprio, che è ciò che tiene la fila
dentro il budget di chunk.

**Il corso di base è un campo, non un ramo.** `generateBuilding` guadagna
`baseBandHeight`, che sostituisce l'altezza della **sola** fascia zero — dopo il
tiro, che si consuma comunque. La sequenza del PRNG resta quella, quindi entrare
in una fila cambia la quota di un edificio e non la sua sagoma: è la stessa
regola del verso d'accento della 4.1. Sopra lo zoccolo condiviso l'arretramento
che `forcedOp` già produceva cade alla stessa altezza su tutta la fila, e da lì
viene la cornice terrazzata continua — senza una voce nuova nella grammatica,
senza toccare `supported` e senza toccare il mesher (invariante 6).

**Il basamento si guadagna, la quota no.** La fila condivide sempre il piano —
due edifici accostati a quote diverse leggono come un errore a qualunque densità
— mentre il corso di base compare solo sopra `CLUSTER.minDensity`. La soglia è
misurata e non stimata: un catalizzatore solo, anche a forza massima, porta la
densità locale a **0,30** e non oltre, mentre tre campi sovrapposti la portano a
**0,37** di mediana. A 0,35 lo zoccolo è quindi il linguaggio di un centro vero e
non di una casa sparsa, e resta coerente con le soglie che il catalogo delle
tipologie già usa (`courtyardBlock` 0,3, `commercialPodium` 0,4).

**Costo, misurato.** Su 256×256 colonne, quattro catalizzatori a raggio 60 e 300
tick: `onTick` ha mediana **0,022–0,025 ms** e p95 **3,0–3,5 ms**, con 372
edifici di cui **344 in fila**. La mediana è bassa perché la maggior parte dei
tick non costruisce — `ticksPerBuild` era 2 alla misura e `ticksPerUpgrade` 10 — e sono i tick
di infornata a stare nel p95. La sola spesa che la fase aggiunge al piazzamento è
la seconda generazione dello stamp dove la fila ha un basamento: `generateBuilding`
costa **27 µs** per chiamata e il campo in più non la cambia (27,1 contro 27,7 µs
su ventimila chiamate), quindi al massimo ~0,08 ms su un tick di infornata da
tre siti. Nulla entra nel ciclo di frame: `step` e `stepSurface` non sono
toccati. **Non è un A/B contro il commit precedente**, e di proposito: gli stessi
file portano in parallelo il lavoro sui landmark, e un A/B avrebbe attribuito
alla 4.4 anche quello. **Le tabelle di misura in `README.md` e
`src/sim/README.md` vanno rimisurate a mano**, e non sono state aggiornate qui.

**Resta aperto.** Il basamento condivide **geometria e quota, non colore**: ogni
membro porta la propria palette, e una fila di usi diversi legge come un isolato
di unità diverse su un unico zoccolo — che è una scelta, ma è una scelta. Un
membro non sporge mai sul tetto del vicino: la fascia resta dentro l'impronta del
proprio record, e costruire *sopra* un altro edificio è 4.5 per le campate e 4.9
per il resto. L'aggregazione agisce solo su ciò che nasce dopo, quindi su una
città già matura la differenza si accumula invece di comparire. Due membri
accostati murano ciascuno il proprio lato della fondazione condivisa: sono facce
che il greedy meshing non emette, quindi non si vedono e non costano quad, ma
sono voxel scritti due volte. E i landmark restano fuori dalle file — hanno un
altro generatore e crescono di stadio, e adottarne la quota darebbe a un isolato
il piano di un molo.
