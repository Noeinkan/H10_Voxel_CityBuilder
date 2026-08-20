# Roadmap — H10 Voxel City Builder

## Visione

Una città-isola automatica, enorme ma leggibile come una miniatura voxel. Il
giocatore non disegna ogni edificio: modifica le condizioni della crescita con
catalizzatori, policy ed espansioni territoriali, poi osserva la città adattarsi.

Il principio guida è **poche decisioni con conseguenze visibili**. Ogni nuova
meccanica deve cambiare chiaramente forma della città, economia o uso del suolo
senza compromettere i 60 fps nel browser.

## Stato attuale — MVP

- Isola procedurale deterministica, streaming in worker e mappa di edificabilità.
- Motore voxel a chunk con greedy meshing, shader condiviso e temi a palette.
- Crescita automatica di edifici residenziali, commerciali, industriali, civici e
  a uso misto fino al livello 6, con tipologie scelte dal luogo.
- Risorse, popolazione, soddisfazione, commercio interno, policy e campo di
  desiderabilità per uso.
- Piazzamento dei catalizzatori tramite click, anteprima e messaggi di validazione.
- Acquisto di settori costieri, pausa e velocità della simulazione.
- Overlay diagnostico e suite di test per motore, terreno, simulazione e crescita.

## Fase 1 — Rendere solido il ciclo di gioco

Obiettivo: una sessione di 20–30 minuti comprensibile, recuperabile e senza
azioni morte.

**Stato implementazione:** completata. Il gate resta da validare con un playtest
di un nuovo giocatore senza console o istruzioni esterne.

- [x] Creare un onboarding giocabile: primo catalizzatore residenziale, poi
  produttivo, infine civico; spiegare perché l’ordine conta.
- [x] Ribilanciare l’avvio affinché una scelta imperfetta rallenti la città senza
  portarla rapidamente a popolazione zero o a uno stato irrecuperabile.
- [x] Mostrare sul cursore costo, raggio, classe e motivo di invalidità prima del click.
- [x] Rendere evidente la zona d’influenza di catalizzatori esistenti e selezionati.
- [x] Impedire acquisti duplicati dello stesso settore e indicare i settori già sbloccati.
- [x] Trasformare l’espansione in nuovo suolo strategicamente utile, non in sola
  superficie oceanica; mantenere continuità e streaming a budget.
- [x] Aggiungere condizioni semplici di successo e crisi per dare una direzione alla partita.

**Gate:** un nuovo giocatore riesce a creare una città autosufficiente senza
console o istruzioni esterne; tutte le azioni hanno feedback immediato e una via
di recupero.

## Fase 2 — Decisioni e identità dei distretti

Obiettivo: città diverse a partire dalla stessa isola.

**Stato implementazione:** completata. Il gate resta da validare con un playtest
comparativo delle strategie porto-industria, mercato-trasporto e parco-università.

- [x] Introdurre catalizzatori con ruolo distinto: porto, mercato, fabbrica,
  trasporto, parco, università e monumento.
- [x] Dare a ogni policy un vantaggio, un costo continuativo e una conseguenza
  spaziale osservabile; aggiungere incompatibilità fra alcune policy.
- [x] Creare distretti emergenti da sovrapposizione dei campi, senza zoning manuale
  cella per cella.
- [x] Collegare livelli e forma degli edifici a densità, ricchezza, accessibilità e
  soddisfazione locale.
- [x] Aggiungere decisioni periodiche brevi con due o tre alternative e risultati
  deterministici derivati dallo stato della città.
- [x] Introdurre commercio esterno minimale per cibo, materiali e fondi, con il porto
  come primo collegamento dell’isola al mondo.

**Gate:** almeno tre strategie valide producono skyline, bilanci e rischi
riconoscibilmente diversi.

## Fase 3 — Usi urbani e tipologie ibride

Obiettivo: ampliare la varietà economica e architettonica senza introdurre
zoning manuale; il giocatore continua a orientare una crescita automatica
attraverso catalizzatori con effetti locali leggibili.

**Stato implementazione:** completata. Il gate resta da validare con un playtest
che confronti una città mercantile e una industriale a occhio, senza overlay.

- [x] Separare uso urbano, catalizzatore e forma architettonica: gli usi fondamentali
  diventano residenziale, commerciale, industriale e civico, mentre uffici,
  turismo, ricerca, logistica e intrattenimento restano specializzazioni.
- [x] Rendere il commerciale una componente autonoma della simulazione, con domanda,
  desiderabilità, occupazione, ricavi, capacità e conteggi distinti; rinominare
  la classe produttiva in industriale dove descrive l'uso del suolo.
- [x] Sostituire l'unica classe associata a ciascun catalizzatore con un vettore di
  influenze: mercato, fabbrica, parco, porto, trasporto, università e monumento
  possono favorire più usi e modificare ricchezza, accessibilità, densità,
  soddisfazione e impatto industriale.
- [x] Generare edifici a uso misto quando influenze compatibili superano le soglie
  locali, iniziando da residenziale più commerciale; ogni edificio conserva
  capacità economiche separate per i propri usi senza diventare una nuova zona.
- [x] Scegliere la tipologia edilizia da uso, distretto, densità, ricchezza, terreno e
  catalizzatori vicini tramite un catalogo data-driven: case-bottega, isolati a
  corte, podi commerciali con abitazioni, loft produttivi, mercati sul porto,
  laboratori universitari, hotel, padiglioni culturali e altre forme speciali.
- [x] Organizzare la toolbar per funzione — crescita, connessioni e identità — e
  mantenere visibili anche i catalizzatori bloccati; anteprima e tooltip mostrano
  raggio, usi favoriti o penalizzati e tipologie probabili prima del piazzamento.
- [x] Conservare determinismo, campi densi e costo limitato per colonna; misurare
  memoria e tempo di selezione dei siti dopo l'estensione degli usi.

**Gate:** mercato e industria producono cicli economici distinguibili, gli
edifici misti emergono da sovrapposizioni comprensibili e almeno sei tipologie
sono riconoscibili per forma e funzione senza selezionare manualmente una zona.

**Come è stato risolto.** L'uso urbano è un indice denso in `src/sim/classes.ts`
e i quattro usi sono in ordine di contratto; un catalizzatore non ha più una
classe ma un vettore di influenza in `balance.ts`, che può anche essere negativo
— una fabbrica sottrae dal residenziale, e il clamp a zero del campo bastava già
a reggerlo. Il commercio interno vive in `src/sim/commerce.ts` e compete con
l'industria per la stessa forza lavoro e gli stessi materiali: è quella
competizione, non due bilanci separati, a rendere distinguibili i due cicli. La
tipologia è un catalogo di quindici righe in `world/buildings/config.ts` con la
sola regola di scelta in `typology.ts`, e piega la grammatica esistente con tre
interruttori — podio, corte, coronamento piatto — invece di introdurre modelli
disegnati a mano. La selezione dei siti è rimasta al suo costo perché il secondo
uso si cerca solo sui siti che entrano davvero in lista.

## Fase 4 — Forma urbana procedurale

Obiettivo: trasformare la crescita urbana in un processo realmente verticale e
tridimensionale, nel quale edifici, spazi pubblici e mobilità colonizzano quote
diverse e formano una città stratificata, connessa e leggibile.

**Perché è divisa in sotto-fasi.** È l'unica fase che tocca i tre strati
insieme — terreno, mondo voxel e regole di crescita — e in un ordine obbligato:
senza uno scheletro al suolo non esistono isolati da terrazzare, e senza isolati
non c'è niente da collegare in quota. Le sotto-fasi sono quindi tappe con un gate
proprio, non un elenco di desideri: ognuna deve lasciare la città giocabile e
dentro i budget anche se le successive non arrivano mai.

**Vincoli trasversali.** Valgono per tutte le sotto-fasi, e non si negoziano in
cambio di una forma più bella:

- **Gli otto tipi di superficie sono esauriti.** Ponti, terrazze e giardini
  pensili riusano i `SURFACE_KIND` esistenti; prendersi un nono tipo significa
  togliere un bit alla palette (invariante 5).
- **Il colore resta nell'uniform.** Nessun elemento nuovo — impalcati, parapetti,
  muri di contenimento — può portare RGB nei vertici (invariante 4).
- **Il mesher non si tocca.** Ponti e passerelle sono voxel come tutto il resto:
  se una forma chiede una modifica al mesher, è la forma a essere sbagliata
  (invariante 6).
- **Il tetto di chunk sporchi è per struttura, non per fase.** Una passerella
  lunga attraversa più chunk di una torre: va spezzata in segmenti che rispettano
  `maxDirtyChunksPerBuilding`, non esentata.
- **Determinismo.** Strade, rampe e collegamenti sono funzione di seed, terreno e
  stato della simulazione. Nessun `Math.random()`, nessuna dipendenza dall'ordine
  di visita.
- **Costo per frame, non per città.** Ogni struttura nuova entra a passi nei
  budget esistenti, come già fanno la crescita degli edifici e la superficie
  urbana.

### Fase 4.1 — Scheletro stradale al suolo

Obiettivo: una rete di strade deterministica che esista *prima* degli edifici e
ne orienti la crescita.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono allineamento, determinismo e carreggiata sgombra,
non la leggibilità.

- [x] Generare la rete da terreno, costa e catalizzatori: assi principali fra i
  poli, maglia secondaria negli intervalli, densità che segue il campo di
  desiderabilità.
- [x] Esporre la rete come dato consultabile per colonna — è strada, è fronte, è
  interno isolato — senza scriverla nel layer `data` della simulazione.
- [x] Far dipendere selezione del sito e orientamento dell'impronta dal fronte
  strada, non dalla sola desiderabilità.
- [x] Sostituire i sentieri ad hoc del Builder con il tracciato della rete,
  mantenendo comparsa a budget e costo per frame.
- [x] Chiudere gli isolati: uno spazio interno riconoscibile è ciò che le
  sotto-fasi successive terrazzano e collegano.

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

### Fase 4.2 — Dislivelli e costa come forma urbana

Obiettivo: far reagire la città al terreno invece di appiattirlo.

Dipende da 4.1: è la rete a incontrare per prima le pendenze, e una strada che
attraversa un dislivello o si ferma o lo risolve.

- [ ] Risolvere le pendenze della rete con rampe, scalinate e tratti incassati,
  al posto dell'attuale scarto secco per `tooSteep`.
- [ ] Introdurre muri di contenimento e terrapieni dove la quota cambia, così che
  il salto sia costruito e non un gradino di terreno nudo.
- [ ] Portare piazze e piattaforme sopraelevate dove il dislivello le giustifica.
- [ ] Trattare la costa come fronte edificato: moli, approdi e banchine al posto
  dell'attuale bordo d'acqua.
- [ ] Rivedere `maxTerrainStep` e la blacklist dei siti: con le rampe una
  pendenza smette di essere un rifiuto definitivo.

**Vincolo:** la fondazione continua a riempire, mai a scavare. Un muro di
contenimento aggiunge volume, non toglie isola.

**Gate:** su un'isola con rilievo marcato pendenze e linea di costa risultano
progettate; nessun sito viene più perso per una pendenza che una rampa
risolverebbe.

### Fase 4.3 — Grammatica verticale degli edifici

Obiettivo: ampliare il vocabolario di `generate.ts` senza introdurre modelli
disegnati a mano.

Indipendente da 4.1 e 4.2: è lavoro sullo stamp, verificabile in Node senza
mondo e senza terreno. Può procedere in parallelo.

- [ ] Aggiungere basamenti abitati, corpi sovrapposti e arretramenti come
  trasformazioni della regola di fascia, non come casi speciali.
- [ ] Distinguere torri e coronamenti per uso e livello, oltre agli attuali tre
  interruttori di tipologia.
- [ ] Introdurre giardini pensili e terrazze praticabili sulle rientranze che la
  grammatica già produce.
- [ ] Dare accenti luminosi specifici per classe e livello, dentro gli slot di
  palette e i tipi di superficie esistenti.
- [ ] Estendere il catalogo delle tipologie con le forme che i nuovi interruttori
  rendono possibili, restando righe di tabella: la regola di scelta non si tocca.

**Gate:** a parità di seed le silhouette restano deterministiche e distinguibili
per uso; nessuno slot di palette e nessun tipo di superficie in più.

### Fase 4.4 — Isolati terrazzati e cluster verticali

Obiettivo: far crescere gli edifici per aggregazione, non solo per livello.

Dipende da 4.1 — l'isolato è definito dalle strade — e da 4.3, che fornisce la
grammatica per esprimerlo.

- [ ] Permettere a edifici adiacenti dello stesso isolato di crescere insieme,
  condividendo basamento e quota.
- [ ] Superare il tetto di impronta 4×4 dove l'aggregazione lo giustifica,
  rivedendo di conseguenza collisione, budget di chunk e cancellazione.
- [ ] Far salire i cluster per sovrapposizione e arretramento, mantenendo il
  vincolo di appoggio che oggi tiene in piedi le mensole.
- [ ] Conservare la rigenerabilità: un cluster deve poter essere ricostruito dal
  proprio record per essere cancellato, come oggi un edificio singolo.

**Vincolo:** un cluster resta un insieme di record, non un nuovo tipo di zona. La
simulazione continua a contare gli edifici come li conta oggi.

**Gate:** i distretti densi si leggono come isolati continui e terrazzati invece
che come volumi isolati vicini; il costo della crescita resta indipendente dal
numero totale di edifici.

### Fase 4.5 — Rete urbana in quota

Obiettivo: continuare la rete sopra il piano stradale.

Dipende da 4.1 per la topologia e da 4.4 per avere qualcosa da collegare in quota.

- [ ] Introdurre una struttura che non è un edificio: una campata fra due
  appoggi, senza colonna propria e senza occupazione del suolo.
- [ ] Collegare tetti, terrazze condivise e piattaforme con ponti e passerelle
  sospese, scegliendo gli appoggi dalla rete e dal registry.
- [ ] Aggiungere mezzanini e collegamenti fra quote dentro l'isolato, dove il
  cluster li rende percorribili.
- [ ] Spezzare le campate lunghe in segmenti che rispettino il tetto di chunk
  sporchi, e farle comparire a budget come le altre strutture.

**Gate:** ponti e percorsi in quota sono leggibili alle normali distanze di
gioco, poggiano sempre su appoggi reali, e nessuna campata resta orfana quando
l'edificio che la sosteneva cambia livello.

### Fase 4.6 — Gerarchia verticale della città

Obiettivo: una silhouette d'insieme leggibile, non edifici alti sparsi.

Dipende da 4.3 e 4.4: è la calibrazione globale, e ha senso solo quando le forme
locali esistono.

- [ ] Derivare una stratificazione — costa e periferia basse e porose, fasce
  intermedie terrazzate, centro denso — da distanza dai poli e dal mare.
- [ ] Far emergere lo skyline come eccezione governata, non come somma di upgrade
  indipendenti.
- [ ] Preservare una corona naturale attorno all'edificato e transizioni leggibili
  fra le fasce.
- [ ] Verificare che la gerarchia resti visibile su isole di forma diversa, non
  solo sul seed di riferimento.

**Gate:** da inquadratura d'insieme si riconoscono almeno tre fasce di altezza e
il centro, senza overlay.

### Fase 4.7 — Atmosfera e separazione delle quote

Obiettivo: rendere leggibile la profondità verticale con la luce, non con la
geometria.

Nessuna dipendenza: vive interamente in `src/engine/` e può essere fatta in
qualsiasi momento.

- [ ] Usare nebbia e prospettiva aerea per separare le quote, non solo le
  distanze.
- [ ] Dare all'acqua una risposta che distingua bassofondo, canale e mare aperto.
- [ ] Rivedere il contributo dell'ambiente sotto ponti, portici e piani coperti,
  dove oggi manca l'occlusione che li racconterebbe.
- [ ] Aggiornare i temi esistenti alla nuova gerarchia, restando nel materiale
  condiviso.

**Vincolo:** nessuna texture, nessun PBR, nessun materiale aggiuntivo. Un tema
resta un insieme di uniform, e cambiare tema non deve ricompilare un programma.

**Gate:** a UI nascosta le quote si distinguono anche dove i volumi si
sovrappongono, e le draw call non crescono.

**Gate della fase 4:** con la UI nascosta, la città comunica crescita verticale,
connessioni fra livelli e struttura economica attraverso volumi e silhouette;
ponti, terrazze e percorsi in quota restano leggibili alle normali distanze di
gioco.

## Fase 5 — Persistenza e prodotto browser

Obiettivo: trasformare la demo in un gioco riprendibile e distribuibile.

- [ ] Salvare seed, simulazione, catalizzatori, policy, settori e registro edifici in
  un formato versionato; ricostruire terreno e campo invece di serializzare buffer derivati.
- [ ] Aggiungere autosave locale, slot manuali, esportazione e importazione JSON.
- [ ] Separare UI di gioco e diagnostica; rendere accessibili controlli, colori e testi.
- [ ] Adattare layout e input a schermi più piccoli, mantenendo desktop come target principale.
- [ ] Aggiungere menu iniziale, scelta del seed, difficoltà e riepilogo della partita.
- [ ] Preparare deploy statico, telemetria opt-in degli errori e gestione delle versioni dei salvataggi.

**Gate:** ricaricare o aggiornare il browser non perde la partita e una build
statica può essere pubblicata senza strumenti di sviluppo.

## Fase 6 — Ottimizzazione e scala

Questa fase accompagna tutte le precedenti; nessuna funzionalità supera il gate
se rompe i budget esistenti.

- [ ] Mantenere 60 fps desktop, lavoro non-render sotto 4 ms per frame e crescita a
  costo limitato indipendente dal numero totale di edifici.
- [ ] Aggiungere scenari automatici di soak per città grandi, espansioni consecutive
  e cambi frequenti di policy.
- [ ] Misurare separatamente generazione, applicazione voxel, meshing, upload e UI.
- [ ] Introdurre livelli di dettaglio o batching aggiuntivo solo dopo misure reali,
  preservando palette a uniform e una geometria per chunk finché restano adeguati.
- [ ] Verificare periodicamente GPU integrata, memoria, tempo di startup e dimensione bundle.

## Prossimo milestone consigliato — Alpha 0.2

1. [x] Tutorial iniziale e feedback del raggio dei catalizzatori.
2. [x] Bilanciamento recuperabile di popolazione, cibo e produzione.
3. [x] Settori costieri unici che aggiungono terreno realmente edificabile.
4. [x] Costi continuativi e conseguenze visibili per le sei policy esistenti.
5. [x] Commerciale autonomo e primo edificio residenziale-commerciale a uso misto.
6. [x] Primo sistema di strade procedurali usato come scheletro della crescita (fase 4.1).
7. [ ] Salvataggio locale minimo del ciclo completo.
8. [ ] Playtest di 30 minuti con budget e criteri automatici registrati.

Alpha 0.2 è completa quando una partita ha apertura, sviluppo ed espansione
leggibili, due strategie sostenibili e un salvataggio ripristinabile, senza
regressioni rispetto ai contratti e ai budget dell’MVP.
