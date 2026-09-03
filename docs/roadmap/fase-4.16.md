# Fase 4.16 — Tipologie, stili, sbalzi e dettaglio del retro

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Dipende dalla 4.3 per la grammatica delle fasce, dalla 4.4 per l'aggregazione in
fila e dalla 4.9 per il precedente dell'aggetto. Vive quasi tutta in
`src/world/buildings/`, con una coda in `src/engine/mesher/`.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono determinismo, coerenza d'isolato, invarianti dello
sbalzo e budget, non la leggibilità a distanza di gioco.

**Il vincolo che ha deciso metà della fase.** I 32 slot sono famiglie di
*materia* e il loro colore lo scrive il tema, che è globale: un isolato rosa
accanto a uno azzurro vorrebbe slot nuovi, cioè l'invariante 4. Uno stile può
quindi dire *di che cosa* è fatto un quartiere, non che colore ha — e a distanza
di gioco dice la stessa cosa, in tutti e sette i temi invece che in uno.


**Vincolo:** nessuno slot di palette e nessun tipo di superficie in più
(invarianti 4 e 5); `maxDirtyChunksPerBuilding` si ricalcola e non si stima; le
misure di quad e di tempo si rilevano a mano su questa macchina.

**Gate:** da inquadratura d'insieme due isolati si distinguono per **materia**
prima che per funzione, e la distinzione regge cambiando tema con `1`..`9`; da
vicino un edificio ha almeno un aggetto, un portico o uno smusso che ne rompe il
prisma, e il retro non è più liscio come il fronte.

**Resta aperto.** La passata di promozione non interroga `overlaps` per il volume
nuovo, quindi una torre a terra può crescere fin dentro un edificio nato su un
impalcato in quota. È preesistente e non lo introduce lo sbalzo; correggerlo
significa fermare la crescita verticale sotto ogni impalcato, cioè una decisione
di gioco. Da valutare insieme alla 4.9.

**Gate della fase 4:** con la UI nascosta, la città comunica crescita verticale,
connessioni fra livelli e struttura economica attraverso volumi e silhouette;
ponti, terrazze e percorsi in quota restano leggibili alle normali distanze di
gioco, il singolo edificio regge anche l'inquadratura ravvicinata, e almeno una
parte della città sta **sopra** un'altra parte — dalla stessa inquadratura si
contano due livelli abitati e il vuoto che li separa.
