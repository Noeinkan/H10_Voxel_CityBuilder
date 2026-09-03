# Fase 4.10 — Campionario dei voxel

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Nessuna dipendenza. Non è nella spina dorsale ma la accompagna: è l'altro
strumento della coppia aperta dalla 4.11 — questo guarda il vocabolario, quella
guarda la città costruita — e le sotto-fasi verticali ne portano di forme nuove
da giudicare. Serve inoltre già adesso alla scala a celle del terreno. Vive in
`src/world/scenes/`, quindi non tocca né la crescita né la simulazione.

**Perché serve.** Oggi le uniche scene sono `city`, `noise` e `slab`, nate per
misurare il mesher: l'unico modo di vedere uno slot di palette o un linguaggio di
superficie è trovarlo per caso dentro un edificio generato, e l'unico modo di
giudicare la scala relativa di una chioma è aspettare che l'isola ne produca una
accanto a un edificio. Una scelta di look si fa affiancando le cose, e non c'è un
posto dove affiancarle.

**Stato implementazione:** completata. Il gate resta da validare a schermo: i
test coprono la presenza di ogni combinazione, gli strati, la scala e
l'estensione dichiarata, non la leggibilità della griglia in una inquadratura né
il riconoscimento di uno slot morto a colpo d'occhio.


**Vincolo:** è una scena come le altre, non un percorso di rendering dedicato.
Nessuna geometria speciale, nessun materiale, nessuno slot di palette e nessun
tipo di superficie in più: il campionario mostra quello che esiste, e se una
combinazione si vede male il difetto sta altrove.

**Gate:** da `?scene=swatch` si leggono in una sola inquadratura tutte le
combinazioni palette × superficie, gli strati di ogni bioma e il rapporto di
scala fra cella, albero ed edificio; passare da un tema all'altro rilegge il
campionario senza rigenerare la scena, e un tema con uno slot morto si riconosce
a colpo d'occhio.

**Come è stato risolto.** Il campionario si è diviso in due metà come la 4.11:
`scenes/swatchLayout.ts` dice **dove sta cosa** ed è puro, `scenes/swatchScene.ts`
scrive e basta. Non è ordine per estetica — la geometria ha tre consumatori
diversi (il generatore, l'inquadratura di `main.ts`, il referto sotto il cursore)
e due letture della stessa griglia divergerebbero al primo ritocco. È la stessa
separazione di `inspect.ts` rispetto a `InspectView.ts`.

**Le dimensioni si ricavano dalle tabelle, mai da un letterale.** Le colonne sono
`PALETTE_SIZE`, le righe sono quante ne ha `SURFACE_KIND`, gli alberi sono
quanti ne ha `TREE_SHAPES`, i pilastri quanti sono i biomi: uno slot o una specie
in più allargano il campionario da sé, invece di restarne fuori. È la forma
forte della casella «accorgersi che uno slot nuovo non è mai stato aggiunto» —
non può succedere, e il test presidia la scrittura invece della tabella. La
proprietà si è già ripagata: quando il catalogo della flora è cresciuto, la
fascia di scala si è allargata da sola.

**Il provino non è un prisma, ed è un vincolo del mesher e non un gusto.** La
prima versione lo era, e a schermo si vedeva: 248 scatole quasi identiche, con il
dettaglio ridotto a una riga in cima. Misurando `appendMicroGeometry` su un
provino solo si è visto che non era un'impressione — su un prisma isolato con la
sommità piatta tre famiglie di emettitori non scattano **affatto**, perché
nessuna delle loro condizioni geometriche esiste su una scatola: `emitSoffits`
vuole un intradosso con aria sotto, `emitTerraceBoxes` una sommità scoperta che
ha ancora volume di fianco, `emitFinials` una cella senza vicini in piano. Il
campionario mostrava quindi un vocabolario **più povero di quello vero**, che è
il difetto peggiore possibile per uno strumento che esiste per giudicare il
vocabolario.

`CELL_TIERS` porta la sagoma minima che le produce tutte — podio rientrato,
sbalzo a filo, arretramento, guglia isolata — e in più ogni gradone spezza le
corse verticali, così montanti, traversi, architravi, mensole e parapetti si
moltiplicano invece di comparire una volta sola in cima. Misurato: da 21 a 55
prismi di dettaglio per `habitat`, da 25 a 77 per `civic` e `industrial`, da 16 a
64 per `luminous`, da 4 a 22 per `roofTech`. La sagoma è **identica in tutte e
248 le celle**, ed è il punto: se variasse anche la forma, due celle vicine non
sarebbero più confrontabili e l'unica variabile smetterebbe di essere
palette × superficie.

**L'interasse è governato dall'occlusione, e la relazione è esatta.** A
`REST_PITCH`, cioè l'isometrica vera `atan(1/√2)`, un voxel di quota si proietta
in alto per `cos(pitch)` e un voxel di profondità per `sin(pitch)/√2`: il
rapporto è esattamente due, quindi la fila davanti nasconde
`CELL_HEIGHT - cellPitch / 2` di quella dietro. Con interasse pari all'altezza —
sei e sei, la prima versione — spariva **metà** di ogni provino, ed è così che
una griglia di prismi distinti si legge come una massa unica. A dieci contro
sette resta nascosto il podio e nient'altro. Alzarlo ancora costa in fretta,
perché `frameRegion` inquadra sulla diagonale: ogni voxel di interasse si paga
trentuno volte in x e sette in y, e la griglia rimpicciolisce per tutti. Un test
tiene insieme i due numeri, così non si può ritoccarne uno solo.

**Il basamento è largo quanto la fascia che regge.** Da quando l'interasse segue
l'occlusione la matrice è larga il triplo della stratigrafia e della scala: un
basamento rettangolare lasciava due terzi di grigio vuoto in un angolo, che a
schermo si legge come una scena non finita. Il profilo a gradini dichiara le tre
fasce da sé, che è anche l'unica etichetta possibile in una scena senza scritte.

**Due righe restano piatte, e va detto invece che corretto.** `plain` non è un
linguaggio, e `utility` è escluso dalla raccolta del mesher perché è metallo
strutturale la cui forma arriva dalla mesh: sul campionario si distinguono per
tinta e non per rilievo. Vale il vincolo della sotto-fase — se una combinazione
si vede male, il difetto sta altrove.

**La colonna zero è un buco, e non un voxel nero.** `packVisualBlock` restituisce
zero per palette zero: non c'è niente da scrivere, ed è esattamente ciò che
l'indice zero significa. Le combinazioni vere sono trentuno per otto.

**L'acqua era l'unico pezzo di vocabolario che la matrice non poteva mostrare.**
Sulle colonne `water` e `waterDeep` il fragment riconosce l'acqua dalla palette
**prima** di leggere i tre bit, quindi lì il linguaggio di facciata non arriva
mai a esprimersi e quello che si vede è `WATER_CLASS` (contratto 5). Da qui i tre
pilastri d'acqua accanto ai sei biomi: sono il solo posto in cui un tema con uno
specchio morto si riconosce. Il referto sotto il cursore lo dice, perché
altrimenti si attribuirebbe alla superficie quello che sta facendo la palette.

**La stratigrafia non è ridisegnata.** I tagli sono quelli di `writeBlockColumns`
letti da `STRATA_DEPTH`, e gli alberi passano da `writeTree`: se campionario e
isola mostrassero due vocabolari diversi, il campionario non servirebbe a
giudicare l'isola. È la stessa regola del diorama.

**Un difetto che solo il test ha rivelato.** «Non scrivere fuori dall'estensione
dichiarata» sembrava un confronto con `world.bounds`, e non lo è: l'AABB del
mondo è granulare al chunk e avrebbe accettato in silenzio una scrittura trenta
colonne oltre il bordo — proprio quelle che l'inquadratura taglierebbe senza
dirlo. Il test conta i voxel dentro l'estensione e li confronta con il totale,
che è esatto.

**Costo.** 82 560 celle in 49 chunk, contro i milioni di un'isola: la generazione
finisce in pochi passi dentro `GENERATION_BUDGET_MS` e `main` resta sotto un
millisecondo. Il chunk peggiore porta nove provini, cioè meno di 4 200 quad di
dettaglio contro i 16 384 di `MAX_DETAIL_QUADS_PER_CHUNK`: non tronca. Il
campionario non entra nel ciclo di frame di una città e non tocca né mesher né
simulazione, quindi **le tabelle di misura di `README.md` e `src/sim/README.md`
non vanno rimisurate**.

**Resta aperto.** Il campionario mostra il vocabolario, non le regole che lo
compongono: quali superfici una tipologia usi davvero resta una domanda per
`?scene=diorama`. Due prop non possono comparirci **per costruzione**: tende e
insegne chiedono un `portal` sotto la stessa faccia, e un provino di una
superficie sola non può averlo senza mentire sulla riga a cui appartiene. Non ci
sono etichette in-world — il nome di ciò che si guarda vive nell'overlay, e fuori
da `?debug=1` il campionario è muto.
