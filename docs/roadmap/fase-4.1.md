# Fase 4.1 — Scheletro stradale al suolo

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono allineamento, determinismo e carreggiata sgombra,
non la leggibilità.


**Gate:** gli edifici si allineano a strade leggibili senza sovrapposizioni né
lotti irraggiungibili; la rete è identica a parità di seed e non aggiunge lavoro
non budgetato al ciclo di frame.

**Come è stato risolto.** La rete vive in `src/world/streets/` ed è una
**funzione pura di `(seed, x, y)`**: non ha stato, non si salva, non si aggiorna
quando arriva un catalizzatore, e interrogarla non costa memoria. È una griglia
a passo variabile — lo scostamento di ogni asse è un hash del suo indice, non
una passeggiata cumulativa, così l'asse millesimo si calcola senza conoscere i
primi novecentonovantanove. Un tracciato vero (L-system, minimi percorsi fra
poli) sarebbe dipeso dall'ordine di crescita e avrebbe richiesto proprio le
strutture che la fase 5 dovrà poi serializzare.

Il candidato della simulazione **designa un isolato, non un indirizzo**:
`placeLot` lo risolve nel lotto libero più vicino sul perimetro di
quell'isolato. Era la scelta obbligata — due terzi dei candidati cadono nel
cuore degli isolati, e scartarli avrebbe fermato la crescita invece di
allinearla. `src/sim/` non è stato toccato: continua a ragionare per cella e non
sa che le strade esistono, coerentemente con l'invariante 7. L'orientamento
riusa `accentFace`, quindi accento e portale guardano la carreggiata **senza un
attributo di vertice in più**; il tiro del PRNG si consuma comunque, così dare
una strada a un lotto ne cambia il verso e non la sagoma.

Due cose che il lavoro ha fatto emergere, entrambe corrette e coperte da test:
l'`upgrade` allargava l'impronta senza conoscere l'isolato e spingeva gli
edifici dentro la carreggiata — ora il lato è limitato dalla stanza residua, e
un lotto già accostato al fronte cresce solo in altezza, che è anche il motivo
per cui gli angoli diventano le torri dell'isolato. E lo scorrimento che accosta
l'impronta al fronte non deve valere per `materialize`, o una partita salvata
tornerebbe con gli edifici spostati.

**Costo.** `onTick` nel caso peggiore sintetico (256×256 colonne tutte
edificabili, quattro catalizzatori a raggio 60) misura **8,8 ms**, contro gli
**8,5 ms** della stessa misura prima di questa fase — a parità di costo la
città cresce a più del doppio della velocità. Di quegli 8,8 ms, **5,7 sono
`nextBuildSites`**, che scandisce l'intero campo allocato ed era già così: è
il vero sforamento del budget, è preesistente, e va affrontato nella fase 6, non
qui. La ricerca del lotto costa ~3,1 ms e ci è arrivata togliendo due
allocazioni per colonna dal percorso caldo (`columnAt` costruiva un oggetto,
`registry.at` un array); da lì il nuovo `isOccupied`. Le carreggiate passano
dalla coda di superficie esistente, quindi non aggiungono lavoro non budgetato
al frame. I due worker in bundle restano 5,77 kB e 8,64 kB: la rete non li tocca.

**Resta aperto.** Gli assi principali sono periodici, non tracciati fra i poli:
la gerarchia esce dalla griglia e i catalizzatori la influenzano solo di riflesso
— le strade compaiono dove la città cresce, e la città cresce dove il campo è
alto. Legare l'asse principale al polo richiede un tracciato con stato, e ha
senso affrontarlo insieme alle rampe della 4.2, quando la rete dovrà comunque
smettere di essere puramente periodica per aggirare i dislivelli.
