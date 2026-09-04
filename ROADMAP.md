# Roadmap — H10 Voxel City Builder

Le fasi chiuse tengono qui il loro elenco e lasciano il ragionamento a una
scheda per fase in [docs/roadmap/](docs/roadmap/): perché una cosa è stata
fatta così si legge lì, cosa resta da fare si legge qui.

### Visione

Una città-isola automatica, enorme ma leggibile come una miniatura voxel. Il
giocatore non disegna ogni edificio: modifica le condizioni della crescita con
catalizzatori, policy ed espansioni territoriali, poi osserva la città adattarsi.

**L'isola è il punto di partenza, non il formato finale della città.** La
crescita non si esaurisce sul piano: le torri salgono, e in alto si
**richiudono** — mezzanini, ponti, impalcati abitati, parchi in quota,
piattaforme che diventano suolo, arcologie che da sole valgono un quartiere.
Quando il suolo finisce, una città di oggi si allarga; questa deve poter salire e
riconnettersi sopra se stessa. È la differenza fra una skyline — torri alte
vicine, ognuna per sé — e una megastruttura, e non è una rifinitura da fare in
fondo: è la forma che il gioco deve raggiungere.

Due principi guida, e il secondo non è meno vincolante del primo:

1. **Poche decisioni con conseguenze visibili.** Ogni nuova meccanica deve
   cambiare chiaramente forma della città, economia o uso del suolo senza
   compromettere i 60 fps nel browser.
2. **La terza dimensione è una dimensione di crescita, non un attributo degli
   edifici.** Un edificio più alto è un numero più grande; una città
   tridimensionale è un'altra cosa — sopra il primo livello ce n'è un secondo,
   percorribile, abitato e connesso al primo. Finché «dove si costruisce» resta
   una domanda su `(x, y)`, la città può diventare solo più fitta e più alta, mai
   stratificata.

### Stato attuale

- Isola procedurale deterministica, streaming in worker e mappa di edificabilità.
- Motore voxel a chunk con greedy meshing, shader condiviso e temi a palette.
- Rete stradale come funzione pura del seed, opere di terra che costruiscono il
  piano dove il terreno non ce l'ha, isolati terrazzati in cui edifici accostati
  condividono quota e basamento.
- Crescita automatica di edifici residenziali, commerciali, industriali, civici e
  a uso misto fino al livello 12, con tipologie scelte dal luogo e una grammatica
  verticale a fasce, arretramenti, terrazze e cinque coronamenti.
- Gerarchia verticale: una quota ammessa per colonna che decide *fin dove* si
  sale — costa e periferia basse, fascia intermedia, centro denso, più un cono
  verso i poli e pochi picchi eletti — mentre la desiderabilità continua a
  decidere *se*.
- Rete in quota: campate fra due appoggi che non prendono suolo, piazze sul cuore
  degli isolati, e un percorso continuo fra isolati diversi che non passa da terra.
- Otto ruoli di catalizzatore con una struttura voxel propria, che avanza per
  stadi insieme al quartiere che ha generato.
- Risorse, popolazione, soddisfazione, commercio interno ed esterno per
  collegamento, policy, decisioni con mandato permanente e campo di
  desiderabilità per uso.
- Piazzamento dei catalizzatori tramite click, anteprima, vincoli di sito per
  ruolo e messaggi di validazione.
- Acquisto di settori costieri, pausa e velocità della simulazione.
- Cinque viste di ispezione in mano al giocatore per guardare dentro la città.
- Overlay diagnostico e suite di test per motore, terreno, simulazione e crescita.

**E il limite che conta.** Gli edifici salgono, la città no. Tutto ciò che
decide *dove* costruire ragiona su `(x, y)`: una colonna occupata è occupata per
sempre, a qualunque quota, e non esiste ancora niente che stia **sopra**
qualcos'altro. La diagnosi, riga per riga, apre la fase 4.

## Fase 1 — Rendere solido il ciclo di gioco

Obiettivo: una sessione di 20–30 minuti comprensibile, recuperabile e senza
azioni morte.

**Stato implementazione:** completata. Il gate resta da validare con un playtest
di un nuovo giocatore senza console o istruzioni esterne.

- [x] Creare un onboarding giocabile: primo catalizzatore residenziale, poi <!-- size: L -->
  produttivo, infine civico; spiegare perché l’ordine conta.
- [x] Ribilanciare l’avvio affinché una scelta imperfetta rallenti la città senza <!-- size: M -->
  portarla rapidamente a popolazione zero o a uno stato irrecuperabile.
- [x] Mostrare sul cursore costo, raggio, classe e motivo di invalidità prima del click. <!-- size: M -->
- [x] Rendere evidente la zona d’influenza di catalizzatori esistenti e selezionati. <!-- size: M -->
- [x] Impedire acquisti duplicati dello stesso settore e indicare i settori già sbloccati. <!-- size: S -->
- [x] Trasformare l’espansione in nuovo suolo strategicamente utile, non in sola <!-- size: L -->
  superficie oceanica; mantenere continuità e streaming a budget.
- [x] Aggiungere condizioni semplici di successo e crisi per dare una direzione alla partita. <!-- size: M -->

**Gate:** un nuovo giocatore riesce a creare una città autosufficiente senza
console o istruzioni esterne; tutte le azioni hanno feedback immediato e una via
di recupero.

## Fase 2 — Decisioni e identità dei distretti

Obiettivo: città diverse a partire dalla stessa isola.

**Stato implementazione:** completata. Il gate resta da validare con un playtest
comparativo delle strategie porto-industria, mercato-trasporto e parco-università.

- [x] Introdurre catalizzatori con ruolo distinto: porto, mercato, fabbrica, <!-- size: L -->
  trasporto, parco, università e monumento.
- [x] Dare a ogni policy un vantaggio, un costo continuativo e una conseguenza <!-- size: L -->
  spaziale osservabile; aggiungere incompatibilità fra alcune policy.
- [x] Creare distretti emergenti da sovrapposizione dei campi, senza zoning manuale <!-- size: L -->
  cella per cella.
- [x] Collegare livelli e forma degli edifici a densità, ricchezza, accessibilità e <!-- size: M -->
  soddisfazione locale.
- [x] Aggiungere decisioni periodiche brevi con due o tre alternative e risultati <!-- size: M -->
  deterministici derivati dallo stato della città.
- [x] Introdurre commercio esterno minimale per cibo, materiali e fondi, con il porto <!-- size: M -->
  come primo collegamento dell’isola al mondo.

**Gate:** almeno tre strategie valide producono skyline, bilanci e rischi
riconoscibilmente diversi.

### Fase 2.1 — Vincoli di sito dei catalizzatori

Obiettivo: far dipendere il luogo ammesso per un catalizzatore dal ruolo che ha,
e aggiungere la connessione aerea come alternativa non costiera al porto.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-2.1.md](docs/roadmap/fase-2.1.md).*

- [x] Dare a `CatalystDefinition` un vincolo di sito esplicito e valutarlo in <!-- size: M -->
  `catalystFailure`, al posto dell'unico bit di edificabilità valido per tutti.
- [x] Ammettere la battigia ai ruoli costieri riusando le opere della 4.2, senza <!-- size: M -->
  rendere `beach` edificabile per la crescita automatica: è il vincolo del ruolo
  a cambiare, non la tabella dei biomi.
- [x] Introdurre il vincolo opposto — superficie ampia e piana — valutando la <!-- size: M -->
  pendenza su un intorno dell'impronta e non sulla singola colonna.
- [x] Aggiungere l'aeroporto come secondo ruolo di `connections`, con un effetto <!-- size: L -->
  distinto da quello del porto: collegamento che non chiede la costa, influenza
  su commerciale e civico, penalità sul residenziale più pesante di quella della
  fabbrica.
- [x] Distinguere il commercio esterno per collegamento, invece dell'attuale <!-- size: M -->
  `connected` binario che qualunque porto accende da qualunque punto.
- [x] Portare i nuovi motivi di rifiuto sul cursore con lo stesso trattamento <!-- size: S -->
  degli altri, così che il vincolo si legga prima del click e non dopo.

### Fase 2.2 — Le decisioni lasciano un segno

Obiettivo: rendere visibile nella struttura della città quale alternativa il
giocatore ha scelto.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-2.2.md](docs/roadmap/fase-2.2.md).*

- [x] Dare a ogni alternativa un **mandato**: un vettore spaziale della stessa <!-- size: L -->
  forma di `spatialPolicy`, che entra in `urbanProfileAt` e piega forma e
  tipologia della crescita successiva.
- [x] Rendere i mandati permanenti ma **esclusivi per famiglia** — un solo slot <!-- size: M -->
  per approvvigionamento, spazio pubblico e investimento — invece di farli
  scadere a tick.
- [x] Concedere a tre alternative un'**opera** costruita subito: un catalizzatore <!-- size: M -->
  a forza e raggio ridotti, posato sul miglior sito che la città offre.
- [x] Aggiungere quattro tipologie che **solo** un mandato concede, così due <!-- size: M -->
  partite divergono nel volume e non solo nei numeri dell'HUD.
- [x] Dire nel modale quale segno lascia ogni alternativa, come già fanno le <!-- size: S -->
  policy.

## Fase 3 — Usi urbani e tipologie ibride

Obiettivo: ampliare la varietà economica e architettonica senza introdurre
zoning manuale; il giocatore continua a orientare una crescita automatica
attraverso catalizzatori con effetti locali leggibili.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-3.md](docs/roadmap/fase-3.md).*

- [x] Separare uso urbano, catalizzatore e forma architettonica: gli usi fondamentali <!-- size: L -->
  diventano residenziale, commerciale, industriale e civico, mentre uffici,
  turismo, ricerca, logistica e intrattenimento restano specializzazioni.
- [x] Rendere il commerciale una componente autonoma della simulazione, con domanda, <!-- size: XL -->
  desiderabilità, occupazione, ricavi, capacità e conteggi distinti; rinominare
  la classe produttiva in industriale dove descrive l'uso del suolo.
- [x] Sostituire l'unica classe associata a ciascun catalizzatore con un vettore di <!-- size: L -->
  influenze: mercato, fabbrica, parco, porto, trasporto, università e monumento
  possono favorire più usi e modificare ricchezza, accessibilità, densità,
  soddisfazione e impatto industriale.
- [x] Generare edifici a uso misto quando influenze compatibili superano le soglie <!-- size: L -->
  locali, iniziando da residenziale più commerciale; ogni edificio conserva
  capacità economiche separate per i propri usi senza diventare una nuova zona.
- [x] Scegliere la tipologia edilizia da uso, distretto, densità, ricchezza, terreno e <!-- size: XL -->
  catalizzatori vicini tramite un catalogo data-driven: case-bottega, isolati a
  corte, podi commerciali con abitazioni, loft produttivi, mercati sul porto,
  laboratori universitari, hotel, padiglioni culturali e altre forme speciali.
- [x] Organizzare la toolbar per funzione — crescita, connessioni e identità — e <!-- size: M -->
  mantenere visibili anche i catalizzatori bloccati; anteprima e tooltip mostrano
  raggio, usi favoriti o penalizzati e tipologie probabili prima del piazzamento.
- [x] Conservare determinismo, campi densi e costo limitato per colonna; misurare <!-- size: M -->
  memoria e tempo di selezione dei siti dopo l'estensione degli usi.

### Fase 3.1 — Il cibo ha un luogo

Obiettivo: dare al cibo dei produttori che si vedano sulla mappa e che costino
**terra**, così che la crescita della città diventi una pressione alimentare
invece di un numero che sale.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-3.1.md](docs/roadmap/fase-3.1.md).*

- [x] Staccare il cibo dal termine industriale e dargli tre produttori con un <!-- size: L -->
  listino in case sfamate; ridichiarare il pareggio 1:1 come prodotto derivato
  (`FOOD_PER_HOUSE`) invece che come rapporto fra due costanti lontane.
- [x] Contatori paralleli invece di un quinto uso urbano: `CLASS_COUNT` resta 4, <!-- size: M -->
  il contratto 10 resta intatto e il campo di desiderabilità non guadagna un
  quinto piano per chunk.
- [x] Campi: lotti che nascono oltre il bordo dell'edificato, non entrano negli <!-- size: XL -->
  indici di collisione, e si ritirano quando la città li ricopre.
- [x] Solchi in microgeometria: due nuovi tipi di copertura che portano l'asse <!-- size: L -->
  nel marcatore, così un lotto corre tutto in un verso e le colonne contigue si
  saldano in una fila sola.
- [x] Frutteti: stesso lotto, alberi da frutto su reticolo regolare — la <!-- size: M -->
  regolarità contro il jitter del bosco naturale è tutta la leggibilità.
- [x] Torre idroponica: una riga di catalogo con `specialization: 'farming'`, <!-- size: M -->
  fasce luminose come luci di crescita, e un vero scambio fra materiali e cibo.
- [x] HUD: il cibo mostra da dove viene invece di un `±0`; `communityGardens` <!-- size: M -->
  smette di essere decorazione.

## Fase 4 — Forma urbana procedurale

Obiettivo: trasformare la crescita urbana in un processo realmente verticale e
tridimensionale, nel quale edifici, spazi pubblici e mobilità colonizzano quote
diverse e formano una città stratificata, connessa e leggibile.

**Dove siamo.** Dieci sotto-fasi su quattordici sono chiuse, e due delle quattro
della spina dorsale sono arrivate: la 4.5 ha dato al progetto la prima struttura
che non poggia a terra, la 4.6 ha rotto i tetti che tenevano la città a
mezz'aria e le ha dato una gerarchia — le torri del centro arrivano ora a
centocinquanta voxel, sopra il rilievo dell'isola, e attorno resta una corona
bassa. Restano le due che fanno il secondo livello vero e proprio: la 4.9, dove si
costruisce **sopra** la città, e la 4.14, l'arcologia.

La verticale ha smesso di essere solo un numero più grande, ma non è ancora un
luogo dove costruire: `baseZ` viene dal terreno per tutto ciò che non è una
campata. La diagnosi originale, riga per riga, resta utile perché tre dei suoi
quattro punti sono ancora aperti.

1. **Il candidato è un bit per colonna.** `nextBuildSites` accetta una cella se
   è `buildable`, se supera la soglia e se `occupancy[i] === 0`. Una colonna
   costruita smette per sempre di essere proponibile, quale che sia la quota
   libera sopra.
2. **Il lotto è una colonna libera.** In `Builder`, `isOccupied(cx, cy)` rifiuta
   il lotto senza mai guardare `z`, e `baseZ` viene da `terms.deck`, cioè dal
   piano che `planCluster` e `planGrade` ricavano dal **terreno**. Non esiste un
   percorso che parta da una quota diversa dal suolo.
3. **Il mondo espone una quota sola.** `TerrainMap` tiene una altezza e un bit
   `buildable` per colonna. Finché «edificabile» è un bit per `(x, y)`, un
   secondo livello non è rappresentabile, non solo non scelto.
4. ~~**Il tetto è basso e triplo.**~~ **Chiuso dalla 4.6.** `maxLevel` è 12 con
   `LEVEL_CAPS` fino a diciannove fasce, `upgradeThreshold` si è fermato a 198 —
   la fine dell'alfabeto del campo — e sopra quel punto a decidere è la quota
   ammessa per colonna di `src/world/skyline/`; il tetto di chunk sporchi è
   salito con loro. Restano da rompere i primi tre punti, che sono quelli veri.

**Cosa invece non manca.** `BuildingRegistry.overlaps` considera *non*
sovrapposti due volumi sulla stessa colonna con intervalli di quota disgiunti, e
`topOf` restituisce già la prima cella libera sopra una colonna. Il registro sa
impilare: a non saperlo è chi sceglie dove costruire. È la ragione per cui la
città in quota non è una riscrittura ma quattro decisioni, ed è argomentato per
esteso in 4.9.

**L'ordine di lavoro, da qui in avanti.** Le sotto-fasi non hanno più tutte lo
stesso peso: quattro formano la spina dorsale della verticale e vanno in
quest'ordine, perché ognuna è il presupposto della successiva.

| | Cosa aggiunge | Senza di lei |
| --- | --- | --- |
| ~~**4.5**~~ | ✅ la campata: una struttura che non poggia a terra | non c'è niente che colleghi due quote |
| ~~**4.6**~~ | ✅ la quota ammessa per colonna, e i tre tetti rotti | le torri restano a sessanta voxel e lo skyline è un altopiano |
| **4.9** | il suolo artificiale: si costruisce *sopra* la città | il secondo livello non esiste, esistono solo ponti |
| **4.14** | l'arcologia: un'opera sola che è un quartiere | la città è stratificata ma non ha megastrutture |

Le altre restano dove sono e possono procedere in parallelo: 4.7 e 4.8 sono
look, 4.10 era uno strumento ed è arrivata. Nessuna delle due famiglie blocca l'altra, ma se
c'è da scegliere si sceglie la spina dorsale — è la sola che cambia *cosa* è la
città, invece di come si vede.

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
- **Il tetto verticale è un sistema, non un numero.** `BUILDER.maxLevel` è il
  più visibile dei limiti che fermano la città a mezz'aria, ed è l'unico che da
  solo non sposta niente: sotto ci sono una soglia di upgrade che ha finito lo
  spazio nel campo, un tetto di chunk sporchi tarato sulla torre di oggi, un
  lato minimo di fascia sotto cui la torre diventa un palo, e una distribuzione
  del livello iniziale che se resta corta fa nascere *tutti* in cima. Alzare il
  primo senza gli altri fa sparire in silenzio proprio gli edifici alti. La 4.6
  li ha alzati insieme, e ha lasciato un test che verifica la lunghezza delle
  tabelle indicizzate per livello: al prossimo cambio di scala vale ancora.
- **Ciò che si costruisce si deve poter guardare.** Ogni sotto-fase che
  sovrappone volumi produce struttura che dall'esterno non si vede: la vista che
  la apre è 4.11, e viene prima di quello che deve verificare.

### Fase 4.1 — Scheletro stradale al suolo

Obiettivo: una rete di strade deterministica che esista *prima* degli edifici e
ne orienti la crescita.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.1.md](docs/roadmap/fase-4.1.md).*

- [x] Generare la rete da terreno, costa e catalizzatori: assi principali fra i <!-- size: XL -->
  poli, maglia secondaria negli intervalli, densità che segue il campo di
  desiderabilità.
- [x] Esporre la rete come dato consultabile per colonna — è strada, è fronte, è <!-- size: M -->
  interno isolato — senza scriverla nel layer `data` della simulazione.
- [x] Far dipendere selezione del sito e orientamento dell'impronta dal fronte <!-- size: L -->
  strada, non dalla sola desiderabilità.
- [x] Sostituire i sentieri ad hoc del Builder con il tracciato della rete, <!-- size: M -->
  mantenendo comparsa a budget e costo per frame.
- [x] Chiudere gli isolati: uno spazio interno riconoscibile è ciò che le <!-- size: M -->
  sotto-fasi successive terrazzano e collegano.

### Fase 4.2 — Dislivelli e costa come forma urbana

Obiettivo: far reagire la città al terreno invece di appiattirlo.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.2.md](docs/roadmap/fase-4.2.md).*

- [x] Risolvere le pendenze della rete con rampe, scalinate e tratti incassati, <!-- size: L -->
  al posto dell'attuale scarto secco per `tooSteep`.
- [x] Introdurre muri di contenimento e terrapieni dove la quota cambia, così che <!-- size: L -->
  il salto sia costruito e non un gradino di terreno nudo.
- [x] Portare piazze e piattaforme sopraelevate dove il dislivello le giustifica. <!-- size: M -->
- [x] Trattare la costa come fronte edificato: moli, approdi e banchine al posto <!-- size: L -->
  dell'attuale bordo d'acqua.
- [x] Rivedere `maxTerrainStep` e la blacklist dei siti: con le rampe una <!-- size: M -->
  pendenza smette di essere un rifiuto definitivo.

### Fase 4.3 — Grammatica verticale degli edifici

Obiettivo: ampliare il vocabolario di `generate.ts` senza introdurre modelli
disegnati a mano.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.3.md](docs/roadmap/fase-4.3.md).*

- [x] Aggiungere basamenti abitati, corpi sovrapposti e arretramenti come <!-- size: L -->
  trasformazioni della regola di fascia, non come casi speciali.
- [x] Distinguere torri e coronamenti per uso e livello, oltre agli attuali tre <!-- size: M -->
  interruttori di tipologia.
- [x] Introdurre giardini pensili e terrazze praticabili sulle rientranze che la <!-- size: M -->
  grammatica già produce.
- [x] Dare accenti luminosi specifici per classe e livello, dentro gli slot di <!-- size: M -->
  palette e i tipi di superficie esistenti.
- [x] Estendere il catalogo delle tipologie con le forme che i nuovi interruttori <!-- size: M -->
  rendono possibili, restando righe di tabella: la regola di scelta non si tocca.

### Fase 4.4 — Isolati terrazzati e cluster verticali

Obiettivo: far crescere gli edifici per aggregazione, non solo per livello.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.4.md](docs/roadmap/fase-4.4.md).*

- [x] Permettere a edifici adiacenti dello stesso isolato di crescere insieme, <!-- size: XL -->
  condividendo basamento e quota.
- [x] Superare il tetto di impronta 4×4 dove l'aggregazione lo giustifica, <!-- size: L -->
  rivedendo di conseguenza collisione, budget di chunk e cancellazione.
- [x] Far salire i cluster per sovrapposizione e arretramento, mantenendo il <!-- size: L -->
  vincolo di appoggio che oggi tiene in piedi le mensole.
- [x] Conservare la rigenerabilità: un cluster deve poter essere ricostruito dal <!-- size: M -->
  proprio record per essere cancellato, come oggi un edificio singolo.

### Fase 4.5 — Rete urbana in quota

Obiettivo: continuare la rete sopra il piano stradale, fino a che il livello alto
sia percorribile quanto quello basso.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.5.md](docs/roadmap/fase-4.5.md).*

- [x] Introdurre una struttura che non è un edificio: una campata fra due <!-- size: L -->
  appoggi, senza colonna propria e senza occupazione del suolo.
- [x] Collegare tetti, terrazze condivise e piattaforme con ponti e passerelle <!-- size: L -->
  sospese, scegliendo gli appoggi dalla rete e dal registry.
- [x] Aggiungere mezzanini e collegamenti fra quote dentro l'isolato, dove il <!-- size: M -->
  cluster li rende percorribili.
- [x] Dare alla campata una sezione abitata — carreggiata, parapetti, spessore <!-- size: M -->
  strutturale — e rendere visibile ciò che la sostiene: è l'impalcatura a
  raccontare l'altezza, e senza di essa una passerella legge come un nastro
  incollato al cielo.
- [x] Portare in quota lo **spazio pubblico**, non solo il passaggio: parchi, <!-- size: L -->
  piazze e giardini sull'impalcato, riusando gli slot `grass*` e i tipi di
  superficie esistenti. Un livello alto fatto di soli corridoi è un'infrastruttura;
  con una piazza diventa un pezzo di città.
- [x] Far sì che la rete in quota sia una **rete**: fra due isolati collegati <!-- size: L -->
  deve esistere un percorso continuo, verificabile come proprietà e non giudicato
  a occhio. È la differenza fra ponti sparsi e un secondo piano stradale.
- [x] Spezzare le campate lunghe in segmenti che rispettino il tetto di chunk <!-- size: M -->
  sporchi, e farle comparire a budget come le altre strutture. Vale anche per le
  forme lineari dei landmark, che la 4.12 ha lasciato aperte qui.

### Fase 4.6 — Gerarchia verticale della città

Obiettivo: una silhouette d'insieme leggibile, non edifici alti sparsi — e la
regola che decide **fin dove una colonna può salire**, che oggi non esiste.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.6.md](docs/roadmap/fase-4.6.md).*

- [x] Derivare una stratificazione — costa e periferia basse e porose, fasce <!-- size: L -->
  intermedie terrazzate, centro denso — da distanza dai poli e dal mare.
- [x] Esporre quella stratificazione come **quota ammessa per colonna**, e farla <!-- size: L -->
  entrare in `Builder.upgrade` accanto alla soglia di desiderabilità, non al
  posto suo.
- [x] Alzare `maxLevel` e `LEVEL_CAPS` insieme al tetto di chunk sporchi, con un <!-- size: M -->
  test che verifichi che nessun edificio di livello massimo venga scartato in
  silenzio: è il difetto che si ripresenta a ogni cambio di scala.
- [x] Far emergere lo skyline come eccezione governata, non come somma di upgrade <!-- size: M -->
  indipendenti.
- [x] Preservare una corona naturale attorno all'edificato e transizioni leggibili <!-- size: M -->
  fra le fasce.
- [x] Rimisurare ombra, nebbia di quota e inquadratura iniziale sulla città più <!-- size: M -->
  alta: la camera parte con `targetHeight` a 12 voxel e `frameRegion` riceve uno
  `spanZ`, quindi l'inquadratura d'apertura non è indipendente dall'altezza.
- [x] Verificare che la gerarchia resti visibile su isole di forma diversa, non <!-- size: S -->
  solo sul seed di riferimento.

### Fase 4.7 — Atmosfera e separazione delle quote

Obiettivo: rendere leggibile la profondità verticale con la luce, non con la
geometria.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.7.md](docs/roadmap/fase-4.7.md).*

- [x] Usare nebbia e prospettiva aerea per separare le quote, non solo le <!-- size: M -->
  distanze.
- [x] Dare all'acqua una risposta che distingua bassofondo, canale e mare aperto. <!-- size: M -->
- [x] Rivedere il contributo dell'ambiente sotto ponti, portici e piani coperti, <!-- size: M -->
  dove oggi manca l'occlusione che li racconterebbe.
- [x] Aggiornare i temi esistenti alla nuova gerarchia, restando nel materiale <!-- size: M -->
  condiviso.

### Fase 4.8 — Dettaglio d'artista e vita notturna

Obiettivo: portare il singolo edificio alla densità della voxel art curata —
sporgenze, insegne, verde, finestre accese — restando dentro il materiale
condiviso e il tetto di quad della microgeometria.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.8.md](docs/roadmap/fase-4.8.md).*

- [x] Costruire una libreria di prop sub-voxel — tende, insegne, condizionatori, <!-- size: XL -->
  antenne, cavi, cassoni, fioriere — emessi dalla stessa `emitRuns` degli altri
  dettagli, scelti per uso, livello e faccia.
- [x] Appenderli alle giunzioni che la grammatica già produce — fronte strada, <!-- size: L -->
  arretramenti, coronamenti, angoli d'isolato — invece che a posizioni sparse
  sulla facciata: è l'aggancio a rendere l'oggetto credibile, non la sua forma.
- [x] Portare il verde sull'edificio: fioriere, rampicanti e chiome che riusano <!-- size: M -->
  gli slot `grass*` esistenti e la stessa priorità di troncamento.
- [x] Far uscire la luce: un contributo notturno che schiarisce le superfici <!-- size: L -->
  vicine a una faccia emissiva, ricavato da quello che il mesher già produce,
  senza luci dinamiche, senza una pass in più e senza ricompilare materiali.
- [x] Legare l'accensione allo stato della simulazione: finestre accese in <!-- size: M -->
  proporzione all'occupazione, insegne dove il commercio è attivo, buio dove
  l'edificio è vuoto — la città di notte come lettura dell'economia.
- [x] Aggiungere un ciclo giorno/notte come traiettoria del sole più scambio di <!-- size: M -->
  uniform, con l'ora esposta nell'harness per poter iterare sul look.
- [x] Dare all'harness una scena `diorama`: un edificio solo, girevole e <!-- size: M -->
  inquadrato da vicino, per giudicare il dettaglio senza aspettare che la città
  cresca. Stessa ossatura del campionario della 4.10 — una scena a budget che
  compone soggetti scelti — quindi la seconda costa poco se la prima esiste già.

### Fase 4.9 — Quote abitate e città sospesa

Obiettivo: smettere di costruire *sul* terreno e cominciare a costruire *sopra
la città* — piattaforme abitate, edifici che poggiano su altri edifici, mobilità
in quota e vuoto sotto, nella direzione di Cloudpunk.

È la terza della spina dorsale e la più grossa: dipende da 4.4 per gli isolati
terrazzati, da 4.5 per le campate e da 4.6 per il tetto, e viene dopo di loro
perché è **l'unica sotto-fase che tocca l'assunzione di colonna**. Dopo di lei
resta solo la 4.14, che non aggiunge un meccanismo ma un'opera. Il look al neon
che accompagna queste immagini è 4.7 e 4.8; qui c'è solo la struttura che regge.

**Com'è fatta davvero una città a livelli.** Nivalis, in Cloudpunk, non ha
edifici sospesi: ha **cinque piani di città**, e le piattaforme che sembrano
galleggiare poggiano sopra altri edifici. La parte bassa è deliberatamente
strutturale — volumi grossi di cemento, poche finestre — perché è la fondazione
di quello che sta sopra, e le guglie stanno solo negli ultimi livelli. È il
vincolo qui sotto detto dal lato del look, ed è anche un'istruzione per la 4.6:
il basso non va riempito di torri ma di podi, e la gerarchia deve saper dire
«qui bassa e massiccia» con la stessa precisione con cui dice «qui alta».
Una megacittà fatta di torri alte ovunque non legge come alta — legge come
piatta, solo più in su.

**Cosa c'è già e cosa manca davvero.** Il mondo è pronto più di quanto sembri:
`BuildingRegistry.overlaps` considera *non* sovrapposti due volumi sulla stessa
colonna con intervalli di quota disgiunti — è esattamente la condizione che
permette a un edificio di poggiare sul tetto di un altro — e `topOf` esiste già
come punto d'ancoraggio per chi costruisce sopra qualcosa. A fermare tutto è il
piano sopra: `TerrainMap` tiene **una** altezza e **un** bit `buildable` per
colonna, e `nextBuildSites` scarta la colonna che il registry dice occupata.
Finché "edificabile" è un bit per `(x, y)`, un secondo livello non può essere
scelto, per quanto il mondo saprebbe costruirlo.

**La via già battuta.** In 4.1 il candidato ha smesso di essere un indirizzo ed è
diventato un isolato, con `placeLot` a risolvere il lotto: `src/sim/` non ha
dovuto sapere che le strade esistono. Qui serve la stessa mossa in verticale — la
simulazione designa una colonna, il mondo sceglie **la quota** — e la
simulazione continua a non avere una coordinata verticale (invariante 7). È
l'alternativa da preferire a un indice `z` nel campo di desiderabilità, che
moltiplicherebbe per il numero di livelli tutta la memoria densa.

- [x] Introdurre la mensola come suolo artificiale: una struttura con appoggi <!-- size: XL -->
  propri che porta una superficie edificabile a quota, trattata dal registry come
  volume e non come edificio.
- [x] Esporre più di una quota edificabile per colonna senza duplicare la <!-- size: L -->
  `TerrainMap`: il livello si risolve dove si risolve il lotto, non nel campo.
- [x] Restituire alla crescita le colonne già costruite: oggi `occupancy` è un <!-- size: L -->
  bit per cella e chiude la colonna per sempre. Deve tornare candidabile quando
  sopra c'è spazio ammesso, **senza** che `src/sim/` guadagni una coordinata z —
  è il mondo a dire quante quote restano, come già dice dov'è la costa.
- [x] Far crescere edifici sulle mensole e sui nodi, riusando `topOf` e <!-- size: L -->
  l'intervallo di quota che il registry già confronta.
- [x] Prendere la quota ammessa della 4.6 come tetto **anche** in quota: una <!-- size: M -->
  mensola non è il modo di aggirare la gerarchia, è il modo in cui la
  gerarchia sale. Senza questo vincolo il secondo livello diventa la scorciatoia
  che rende inutile il primo.
- [x] Far esistere davvero la rete: i percorsi dritti fra mensole funzionano e <!-- size: L -->
  sono coperti dai test, ma su una città cresciuta ne nascono **zero** — le
  mensole ci sono e non si guardano mai. Il pezzo che manca è la scelta di *dove*
  nasce una mensola, non il planner: se l'aggetto si posasse sul fronte strada,
  due vicini avrebbero atterraggi complanari.
- [x] Riportare la piega: un percorso a zeta esisteva e i suoi pianerottoli <!-- size: M -->
  cadevano in punti che il corridoio dritto non misura. Serve misurare il colmo
  sui riquadri veri dei pezzi, non su quello della corsa.
- [x] Lo strumento del giocatore: `Builder.placeTerrace` c'è già ed è la porta <!-- size: M -->
  del mondo; mancano il costo in `BALANCE`, l'azione in `game/actions.ts`, il
  tool nell'HUD e le etichette di rifiuto.
- [x] Aggiungere mobilità in quota come struttura di scena — monorotaia, <!-- size: L -->
  sopraelevata, ascensori d'isolato — appoggiata alla rete di 4.5 e ai suoi
  appoggi reali.
- [ ] Dare un fondo al vuoto: nuvole, foschia e livelli inferiori intravisti, così <!-- size: M -->
  che una quota alta si legga come alta anche quando il suolo non si vede più.
- [ ] Far dipendere il costo per colonna dai livelli *presenti* e non da un tetto <!-- size: M -->
  teorico: una colonna a un livello solo deve costare quanto costa oggi.

**Vincolo:** l'isola resta il suolo di partenza e non viene sostituita — la
megacittà le cresce sopra, e una partita che non arriva mai in quota deve restare
identica a quella di oggi. Nessuna struttura sospesa senza appoggi reali: vale
anche qui la regola di 4.5, una campata orfana è un bug e non uno stile.

**Gate:** esiste almeno una zona della città in cui si abita sopra la città e ci
si muove fra i livelli; determinismo e budget reggono con due livelli sovrapposti
come con uno, e il suolo originale resta ricostruibile dal seed.

**Come è stato risolto.** Il gate è passato: sulla città di prova si abita sopra
la città **e** ci si muove fra i livelli, verificato da test sulla stessa fixture
cresciuta e non a occhio. Quattro caselle su sei sono chiuse; le due che restano
sono di look e di costo, e non toccano il gate.

**Il verso della scansione, non il planner.** Il planner dei percorsi funzionava
già. A mancare erano i luoghi, e la causa stava in una riga: `faceRuns` cercava
la corsa di parete **dall'alto in giù**, quindi ogni ospite si prendeva la fascia
più alta che reggesse e due vicini di livello diverso finivano a quote
lontanissime. Invertito il verso, la prima corsa utile è la sommità del basamento
— che la 4.4 rende condivisa da tutta la fila — e i vicini diventano complanari
**per costruzione**, senza nessuna griglia imposta da fuori. Alla mensola si è poi
tolto il giro fra le quattro facce: sta sul solo fronte strada, perché è lì che il
corridoio di un percorso corre sopra la carreggiata invece che sopra i corpi degli
edifici.

**Metà della città non arretra affatto.** È il difetto che solo la misura ha
rivelato: impronte piccole e corpi che salgono a prisma dentro il corso di base
condiviso non hanno **nessuna** sommità di fascia nella finestra utile, e
centoquarantasette ospiti su quattrocento non offrivano una sola corsa. Dove non
c'è una fascia da continuare la mensola si attacca ora alla facciata piena, come
un balcone: le mensole di una città matura passano da trentanove a cinquantatré,
e le coppie con gli atterraggi allineati da due a settantacinque.

**Il colmo era un pavimento, e andava fatto tetto.** `crestOf` costringeva ogni
percorso a passare sopra ogni tetto sotto il proprio corridoio: delle
ottantasette coppie che la passata prova davvero, quarantotto morivano lì. Ora la
corsa parte dalla quota dei due capi e si alza di un pianerottolo per volta
finché il luogo la accetta — il colmo resta, come tetto della ricerca. La **piega
a zeta** torna con la correzione che la roadmap chiedeva, `crestOf` sui riquadri
veri dei pezzi invece che sul corridoio della corsa, e i rifiuti per sfalsamento
scendono da duecentoventinove a sei. Nel farlo è emerso un difetto vero: il colmo
poteva cadere **sotto** la quota di partenza, e allora il ciclo non girava
nemmeno una volta.

**La guida: una cosa sola posata in due modi.** `src/world/aerial/guideway.ts` è
il montante d'isolato — una guida verticale che sale da terra fino a un impalcato
abitato, con le capsule ferme che di notte si accendono — e la stessa guida
incassata nel piano dei tratti di percorso è la monorotaia. È «struttura di
scena»: niente si muove, perché questo progetto non ha oggetti animati fuori dai
chunk. Il montante è la sola parte che risponde alla seconda metà del gate, ed è
anche l'unica cosa qui che **sta sul marciapiede**: misurato, sotto una mensola
sul fronte strada c'è o il proprio ospite o l'asfalto, e rifiutare la carreggiata
come fa una gamba lasciava senza via tutti gli impalcati della città.

**Una premessa era falsa, e la misura l'ha detto.** `AERIAL.route.minSeparation`
valeva quattordici perché «sotto quella distanza il collegamento lo fa già la
4.5». Su una città cresciuta **nessuna delle venti campate tocca una mensola** —
`planSpan` cerca due corpi affacciati, e un impalcato non è un corpo — quindi il
vuoto corto non lo colmava nessuno. La soglia scende a sei, con la ragione vera
al posto di quella sbagliata.

**Resta aperto, e va detto senza abbellirlo.** I percorsi nascono, ma sono
**pochi**: su una città matura ne conta uno. Il rifiuto che domina è ora
`blocked`, ed è onesto — un percorso lungo alla quota di un mezzanino, in un
quartiere fitto, attraversa davvero dei corpi, e il tetto di salita di quattro
pianerottoli non basta a scavalcare una torre. La strada per averne di più non è
un'altra taratura ma un pezzo che manca: le mensole di uno stesso fronte sono
contigue e complanari, quindi il mezzanino continuo esiste già come geometria e
non come collegamento dichiarato. Riconoscerlo — un percorso che *attraversa* una
mensola invece di esserne bloccato — è il punto da cui riprendere.

La 4.14 lo ha poi confermato dall'altro lato, e con dei numeri: rifacendo a mano
il giro di `routePass` su **ogni** compagno di un piazzale d'arcologia — non solo
sul migliore — nessuna delle trentaquattro coppie regge, e il colmo dei corridoi
misurati sta fra 161 e 238 quote. Il dettaglio sta in fondo alla 4.14.

### Fase 4.10 — Campionario dei voxel

Obiettivo: poter guardare tutto il vocabolario visuale in una sola inquadratura
— ogni slot di palette per ogni linguaggio di superficie, la stratigrafia di ogni
bioma, e il confronto di scala fra cella di terreno, albero ed edificio.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.10.md](docs/roadmap/fase-4.10.md).*

- [x] Aggiungere una `SceneKind` `swatch` su `?scene=swatch`, generata a passi con <!-- size: M -->
  budget come le altre.
- [x] Disporre la griglia 32 × 8 — uno slot di palette per colonna, un <!-- size: M -->
  `SURFACE_KIND` per riga — con corse abbastanza lunghe e alte perché la
  microgeometria emetta davvero: un `habitat` senza qualche voxel di facciata non
  mostra niente.
- [x] Affiancare una colonna tagliata per bioma con la stratigrafia vera, così che <!-- size: M -->
  l'invariante «ogni strato è alto un numero intero di celle» si veda di taglio
  invece di doverla dedurre dalle soglie.
- [x] Mettere nella stessa inquadratura la fascia di scala: le forme d'albero <!-- size: S -->
  accanto a un edificio di riferimento e a un pezzo di terreno.
- [x] Dare un nome a ciò che si guarda: riga e colonna sotto il cursore <!-- size: S -->
  nell'overlay, perché in-world non ci sono etichette e la sola convenzione
  d'ordine si dimentica.
- [x] Coprirla con un test in ambiente `node` che verifichi la presenza di tutte <!-- size: S -->
  le combinazioni: è il modo per accorgersi che uno slot nuovo non è mai stato
  aggiunto al campionario.

### Fase 4.11 — Vedere dentro la città

Obiettivo: poter guardare **come un pezzo di città è fatto dentro** — quote,
incastri, cosa poggia su cosa — invece di poterne guardare solo la buccia.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.11.md](docs/roadmap/fase-4.11.md).*

- [x] Aggiungere al materiale unico un **velo a retino** governato da uniform: <!-- size: L -->
  un predicato di quota, uno di rettangolo, la forza del retino, e `discard` sul
  pattern ordinato. Nessuna geometria nuova, nessun materiale nuovo, nessuno
  slot di palette e nessun tipo di superficie in più (invarianti 4 e 5).
- [x] **Raggi X**: velare ciò che sta fra la camera e la colonna sotto il <!-- size: M -->
  cursore. In ortografica «davanti» è una disuguaglianza sulla proiezione lungo
  l'asse di vista, non un raycast: si risolve nel fragment senza lavoro sulla
  CPU e senza toccare il ciclo di frame.
- [x] **Fetta a quota**: uno slider e un parametro URL nascondono o velano tutto <!-- size: M -->
  sopra una z, per guardare la città al piano *n* come si fa in Going Medieval e
  in Timberborn. È il modo che risponde a «cosa c'è al livello 3».
- [x] **Sezione verticale**: un piano che taglia lungo un asse della **griglia <!-- size: L -->
  stradale** e non lungo un asse arbitrario, così il taglio cade su una
  carreggiata e mostra il fronte degli isolati invece di affettare i volumi a
  caso. È l'unico modo che ha bisogno del capping da `gl_FrontFacing`.
- [x] **Isolamento dell'isolato**: velare tutto ciò che sta fuori dal rettangolo <!-- size: M -->
  di `streets.blockRect` sotto il cursore. Stesso velo, predicato diverso —
  nessun taglio, nessun capping, e l'isolato resta nel suo contesto invece di
  finire su fondo neutro, che è il punto: la domanda è come si connette, non
  com'è fatto da solo.
- [x] Tenere la **decisione** fuori dal materiale: quale modo è attivo, a che <!-- size: M -->
  quota, su quale isolato è una funzione pura e va testata in ambiente `node`,
  come già `lighting.ts`. Nel materiale entrano solo i numeri che ne escono.
- [x] Dire cosa si sta guardando — modo attivo, quota della fetta, id <!-- size: S -->
  dell'isolato — nell'overlay: in-world non ci sono etichette, ed è la stessa
  richiesta che fa il campionario della 4.10.
- [x] Estendere `VoxelMaterial.test.ts` ai nuovi uniform: è il test che si <!-- size: S -->
  accorge di un uniform dichiarato nel GLSL e mai scritto, o del contrario.

### Fase 4.12 — I catalizzatori diventano strutture

Obiettivo: dare a ognuno degli otto ruoli una struttura voxel propria, che
**cresce per stadi insieme al quartiere che ha generato**.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.12.md](docs/roadmap/fase-4.12.md).*

- [x] Fermare la banchina al bordo costruito della terra (`GRADING.quayReach`): <!-- size: S -->
  `maxQuayDepth` dice fin dove il fondale regge, non fin dove ha senso arrivare.
- [x] Dare a ogni ruolo una ricetta di parti, come tabella e non come generatore, <!-- size: XL -->
  con una firma verticale che la distingua in isometrica.
- [x] Far crescere la struttura per stadi su ciò che la città ha **costruito** <!-- size: L -->
  intorno, non sulla desiderabilità.
- [x] Restituire alla simulazione un effetto lieve, da una porta che esiste già. <!-- size: S -->
- [x] Ammettere impronte rettangolari, per le forme lineari per natura. <!-- size: M -->

### Fase 4.13 — Le viste diventano un gesto di gioco

Obiettivo: mettere le quattro viste della 4.11 **in mano al giocatore**, invece
di lasciarle dietro `?debug=1`.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.13.md](docs/roadmap/fase-4.13.md).*

- [x] Un comando nel dock — pulsante *Views* fra Policies e il tema — con un
  picker che elenca le cinque viste e, per ognuna, **cosa si va a vedere**: chi
  lo apre sta cercando una risposta sulla propria città, non una descrizione del
  retino.
- [x] Tasti fuori dal gate del debug: `V` cicla, `[`/`]` e `PageDown`/`PageUp`
  muovono la quota (`Shift` per un piano). Il toast di `V` si spegne da solo,
  perché è l'unico percorso cieco — chi sceglie dal picker ha il pannello aperto
  davanti.
- [x] Barra dei livelli sul bordo sinistro, visibile **solo** dove c'è una quota
  da muovere. Fuori dal picker: cercare il piano è un gesto continuo, e un
  pannello aperto coprirebbe ciò che si sta leggendo.
- [x] Etichette di gioco separate dai nomi tecnici. `off`/`xray`/`slice`/
  `section`/`block` restano identificatori — parametro URL e referto tecnico —
  e vivono nel motore; *Normal*, *X-ray*, *Levels*, *Cutaway*, *Block focus*
  vivono in `src/ui/ViewMenuModel.ts`, puro e testato in `node`.
- [x] Le viste finiscono nella card di aiuto, che è dove il giocatore scopre che
  esistono.

### Fase 4.14 — Arcologie e megastrutture

Obiettivo: l'opera sola che vale un quartiere — usi diversi su quote diverse
dentro un'unica struttura, che cresce per stadi e diventa l'ancora verticale
dello skyline.

Dipende da 4.5 per le campate, da 4.6 per il tetto verticale e da 4.9 per il
suolo artificiale. È l'ultima della spina dorsale perché non aggiunge un
meccanismo: usa i tre che quelle costruiscono. Un'arcologia in una città che non
sa ancora impilare sarebbe soltanto un edificio molto alto, cioè esattamente la
cosa che questa fase esiste per non fare.

**Perché non è «un edificio più grande».** Un edificio qui è un
`BuildingRecord`: un uso, un livello, un'impronta rettangolare, uno stamp
rigenerabile. L'arcologia rompe tre di queste quattro cose. Porta più usi
insieme e distribuiti in verticale — podio produttivo, mezzanino commerciale,
corpi abitati, corona civica — non ha un livello ma degli **stadi**, e la sua
pianta non è un rettangolo ma steli e impalcati con dei vuoti in mezzo. La
macchina che le somiglia non è quella degli edifici: è quella dei **landmark**
della 4.12 — ricetta di parti invece di grammatica di fasce, ingombro riservato
per intero al piazzamento, avanzamento su ciò che la città ha davvero costruito
intorno. È la strada da prendere, e non un secondo Builder.

**Il vuoto dentro l'ingombro è il tratto distintivo.** Il volume che legge come
megastruttura non è il più alto: è quello che **scavalca il vuoto**. Due steli e
un impalcato abitato che li unisce a mezz'altezza ritagliano una finestra di
cielo dentro il costruito, e quella finestra è ciò che dice la scala — senza, una
torre grossa è solo grossa. Vale come vincolo di ricetta e non come nota di
gusto: un'arcologia che riempie il proprio ingombro ha sbagliato ricetta.

**Stato implementazione:** cinque caselle su sei. Il dominio esiste in
`src/world/arcology/` (ricetta, condizione, finestra di cielo, generatore) e il
driver in `src/world/buildings/arcologyDriver.ts`; su una città cresciuta ne
nascono due, quella del centro denso arriva all'ultimo stadio con quattro usi su
quattro quote. **Resta aperto l'innesto nella rete in quota**: la struttura offre
i propri attracchi ma nessun percorso ci si attacca ancora — dettaglio più sotto.

- [x] Dare all'arcologia una ricetta di parti come i landmark — steli, impalcati <!-- size: XL -->
  abitati, corone, vuoti passanti — con l'ingombro riservato e gli stadi
  cumulativi che la 4.12 ha già.
- [x] Ammettere più usi dentro la stessa struttura, per fascia di quota, senza <!-- size: L -->
  che diventi una zona: la simulazione continua a contare capacità e occupazione
  come le conta oggi (invariante 7, e lo stesso vincolo che regge i cluster
  della 4.4).
- [x] Farla nascere da una condizione della città — densità, quota ammessa già <!-- size: L -->
  satura, un mandato della 2.2 — e non da un nono bottone in toolbar: il
  giocatore modifica le condizioni della crescita, non posa la megastruttura.
- [ ] Innestarla nella rete in quota della 4.5: un'arcologia che non si <!-- size: M -->
  raggiunge dagli impalcati è un monumento, non un pezzo di città.
- [x] Farne il vertice della gerarchia della 4.6 — l'eccezione governata, una o <!-- size: M -->
  due per isola — invece di una riga di catalogo che la tipologia può pescare
  ovunque.
- [x] Tenerla dentro i budget: attraversa decine di chunk, quindi cresce a <!-- size: L -->
  segmenti come le campate e uno stadio per volta, mai in un frame solo.

**Come è stato risolto, e cosa la misura ha smentito.**

L'arcologia è la **quinta riga della stessa macchina** di `landmark`, `span`,
`aerial` e `aloft`: un `BuildingRecord` con `arcology` valorizzato eredita
occupazione, collisione, budget di chunk e comparsa a budget, e a cambiare è solo
quale generatore disegna lo stamp. Il nucleo ricetta→stamp dei landmark è stato
**estratto** (`PartsRecipe`, `generateFromRecipe`) invece che copiato, e con lui
il cantiere di sventramento, che ora vive in `clearanceSite.ts` e serve due
domìni. Gli usi arrivano a `src/sim/` **uno per fascia su colonne distinte**:
`record.uses` è l'elenco di ciò che `addBuilding` ha accettato, `tally` conta
quelle voci, e `countsByClass` resta esattamente uguale a `state.buildingCounts`
senza che la simulazione impari una coordinata verticale.

Tre cose le ha decise la misura contro il progetto:

1. **`isPeakBlock` non entra nella condizione.** Sembrava ovvio chiedere che la
   megastruttura stesse su uno degli isolati che la 4.6 elegge a picco, e con
   quella riga in più non ne nasceva **nessuna** su nessun seed: due terzi degli
   isolati eletti sono più stretti dell'ingombro, il centro è piccolo, e
   l'intersezione dei tre insiemi era vuota. Tolta la riga, la prima arriva a
   ottocento tick. `isPeakBlock` è un tiro ogni sette isolati su tutta la mappa,
   tarato perché le guglie non diventino un bosco, e non ha niente da dire su una
   struttura che esiste in due esemplari contati: la governance dell'eccezione è
   `maxPerIsland`, che è un numero esatto invece di una probabilità.
2. **Il modello di stadio dei landmark non si trasferisce.** Un landmark nasce
   presto e il quartiere gli cresce intorno; un'arcologia nasce quando la città
   ha *già smesso* di crescere, ed è la sua condizione a chiederlo. Dopo la
   fondazione il conto dei vicini non sale quasi più — novantotto nel centro
   denso, cinquantaquattro in periferia — e le soglie scritte a occhio non le
   raggiungeva nessuno. Non è il tempo a far salire gli stadi, è il **luogo**:
   dove il centro era pieno la struttura si completa, dove lo era meno resta un
   podio con gli steli.
3. **Un attracco in quota ha tre requisiti, e nessuno si vedeva dai test puri.**
   Deve stare entro `maxNodes * stepPerNode` dal piano finito; deve essere largo
   almeno `walkWidth` su *tutti e due* gli assi, perché `planBetween` rifiuta con
   `noLanding` un fronte più stretto di una passerella su quell'asse; e non deve
   partire a filo di un piano solido della struttura, o la corsia nasce dentro il
   podio. La ricetta li ha violati uno per volta con la suite verde.

**Perché la quarta casella è ancora aperta.** I piazzali ci sono, sono record
`AERIAL_PART.node` indicizzati in `registry.decks`, stanno alla quota giusta e
sono larghi abbastanza; `routePass` li esamina e prova i compagni. Su una città
cresciuta nessuna coppia regge: le migliori muoiono su `blocked` — la corsia
attraversa colonne dell'ingombro dell'arcologia, che il registry tiene occupate a
**ogni** quota, quindi un piazzale rientrato dal filo non ha una via d'uscita su
quell'asse — e le altre su `tooSteep`, perché i compagni disponibili sono in
diagonale e la forma a zeta consuma il budget di pianerottoli. È una misura, non
una supposizione, e la correzione tocca la geometria della ricetta (piazzali a
filo su più fronti, con gli steli spostati per liberare gli angoli del podio) o
`routePlan`. Fino ad allora l'arcologia è raggiungibile solo dalla propria scala
interna, cioè è ancora un monumento.

**La correzione ipotizzata qui sopra è stata misurata, e non funziona.** Stessa
fixture — seed 4242, cinque poli, 2000 tick, un'arcologia `terracedTwin` a
94,332 con i due piazzali a quota 40 — sonda che rifà a mano il giro di
`routePass` su ogni compagno invece che sul solo migliore. Il piazzale a ovest ha
**zero** compagni ammissibili, quello a est ne ha trentaquattro e nessuno regge
(27 `tooSteep`, 6 `blocked`, 1 `onStreet`).

1. **Non è la geometria della ricetta.** Sessantaquattro varianti di piazzale —
   quattro fronti, larghezze da 6 a 20, quote locali da 23 a 90 — per quattro
   sporgenze fuori dall'ingombro (0, 4, 8, 12 voxel): **zero percorsi**, in tutte
   e duecentocinquantasei le combinazioni. Piazzali a filo su più fronti e steli
   spostati non avrebbero cambiato niente.
2. **Non sono le manopole del planner.** `stepPerNode` da 8 a 24, `maxWidth` da 8
   a 20, `maxNodes` da 4 a 8, in tutte le combinazioni: zero percorsi. Il
   `tooSteep` si converte in `blocked`, e si ferma lì.
3. **Il muro vero è in due pezzi, e il secondo non ha una taratura.** Su quasi
   ogni coppia il fronte comune è **negativo** — i due capi sono sfalsati di
   lato — quindi si finisce sempre sulla zeta, che assorbe un solo pianerottolo
   per capo (8 quote) mentre gli impalcati di una città matura stanno fra 29 e
   192. Le poche coppie che passano l'altezza muoiono su `blocked`: il colmo del
   corridoio misurato sta fra 161 e 238 quote, cioè la corsia attraversa le torri
   del centro, e quattro pianerottoli non le scavalcano. Non è un caso
   dell'arcologia: su **tutta** la città cresciuta, con 156 impalcati, i percorsi
   sono **uno**.
4. **La campata non è la strada alternativa, e per due ragioni distinte.**
   `planSpan` rifiuta **tutti e ventidue** i vicini dell'arcologia con `level`,
   perché su un `BuildingRecord` il campo `level` significa due cose e
   `SPANS.rules[*].minLevel` legge come livello di crescita quello che per una
   megastruttura è uno **stadio**: un inviluppo di trecentoventi quote allo
   stadio zero risulta la casupola che quel prefiltro esiste per escludere. È lo
   stesso rifiuto che tiene fuori ogni impalcato — livello 0 per costruzione — ed
   è quindi la ragione vera per cui «nessuna delle venti campate tocca una
   mensola», che la 4.9 attribuiva alla forma di `planSpan`. Neutralizzato il
   prefiltro a mano, però, i vicini arrivano al vaglio geometrico e muoiono su
   `groundTaken` e `notFacing`: una campata **non scavalca un edificio per
   progetto**, e l'anello sventrato attorno alla megastruttura mette i vicini
   oltre `maxGap`. Portare `maxGap` a 20, 28 e 36 non produce una sola campata.

**Dove va spostata la casella.** Non è lavoro di questa sotto-fase: l'arcologia è
il caso più visibile di una rete che non si forma. Su tutta la città cresciuta —
centocinquantasei impalcati — i percorsi sono **uno**, e le componenti del grafo
sono **ottantasei**, la più larga da sei record.

**Seconda campagna di misura, e ha smentito anche le proprie ipotesi.** Rifacendo
`planRoute` su millequattrocentotrentotto coppie di impalcati — le dieci più
vicine per ciascuno, non il solo compagno che la passata sceglie — passa **una
coppia**. Il profilo dei rifiuti dice dove muoiono, e ogni riga qui sotto è una
manopola girata e rimisurata:

| Rifiuto | Coppie | Cosa significa |
| --- | --- | --- |
| `noLanding` | 722 | un capo è più stretto di `walkWidth` sull'asse d'uscita |
| `badSeparation` | 288 | i due capi sono più vicini di `minSeparation` |
| `tooSteep` | 221 | la zeta assorbe un pianerottolo per capo, otto quote |
| `blocked` | 112 | il corridoio attraversa dei corpi |

Quattro tentativi di sbloccarla, tutti misurati e tutti ripristinati:

1. **Il compagno scelto davanti invece che vicino.** `routePartner` prendeva il
   più vicino, quasi sempre in diagonale, e la diagonale obbliga alla zeta.
   Preferire chi ha un fronte comune largo quanto la passerella — cioè chi
   ammette il tratto dritto, l'unica forma che sa salire — non cambia niente:
   su ottantasei coppie proposte, **due** hanno quel fronte. Non c'è niente da
   preferire.
2. **La salita della zeta.** `stepPerNode` da 8 a 24 e `maxNodes` da 4 a 8:
   `tooSteep` scende da 221 a 121 e `blocked` sale da 112 a 206. Le coppie che
   passano restano tre su millequattrocento.
3. **La mensola profonda quanto la passerella.** `AERIAL.terrace.minOverhang` da
   3 a 4, cioè togliere alla radice i 722 `noLanding`. Cambia la città intera —
   record da 390 a 334, campate da 13 a **6** — e i percorsi restano **due**.
4. **La contiguità dichiarata**, che era l'ipotesi della 4.9: «le mensole di uno
   stesso fronte sono contigue e complanari, quindi il mezzanino continuo esiste
   già come geometria». Misurato su tutte le coppie di impalcati: quelle che si
   toccano **e** stanno sullo stesso piano calpestabile sono **zero**. La
   premessa è falsa, e con lei la correzione che ne discendeva.

**Cosa resta vero, e non è una taratura.** `planRoute` costruisce tre polilinee
fisse fra due capi scelti per vicinanza, e in un centro cresciuto quasi nessuna
coppia di impalcati soddisfa insieme le tre condizioni che una polilinea chiede:
allineati entro otto di lato, entro un pianerottolo di quota, con il corridoio
sgombro. Il rifiuto dominante si sposta da una manopola all'altra e il totale
resta zero, che è la firma di un problema di **forma** e non di soglia. Chiuderlo
vuol dire una di queste tre, e sono decisioni di progetto:

- dare ai percorsi una ricerca vera invece delle tre forme (il progetto la
  esclude per scelta: «questo progetto non ha un pathfinding e qui non serve»);
- far nascere le mensole in **coppie affacciate** invece che una per ospite —
  cioè decidere il capolinea prima dell'aggetto, che è il rovescio di come
  `terracePass` lavora oggi;
- dare all'arcologia un collegamento suo, come già si dà il cantiere, i piazzali
  e la cornice: una campata di scala mega, che a differenza di quella ordinaria
  scavalca il costruito invece di pretendere il suolo libero (`groundTaken` è il
  rifiuto che nega le sole quattro coppie geometricamente plausibili).

Nel frattempo resta un difetto vero e indipendente, misurato qui e non
corretto: `SPANS.rules[*].minLevel` legge come livello di crescita quello che per
un'arcologia è uno **stadio** e per un impalcato non è niente, quindi squalifica
come «casupola» un inviluppo di trecentoventi quote. Correggerlo da solo porta le
campate da 14 a 13 e non ne fa atterrare nessuna su un impalcato: va fatto
insieme al pezzo che lo rende visibile, non prima.

**Vincolo:** valgono i vincoli trasversali della fase, e in particolare i tre che
qui si è più tentati di negoziare — nessun tipo di superficie in più (invariante
5), nessun colore nei vertici (invariante 4), mesher intoccato (invariante 6).
Un'arcologia è fatta degli stessi otto linguaggi di superficie e degli stessi 32
slot di palette di una casa: a distinguerla è la massa, non un materiale che
nessun altro ha.

**Gate:** sull'isola esiste almeno una struttura che contiene usi diversi su
quote diverse, la si raggiunge dalla rete in quota senza toccare terra, e da
inquadratura d'insieme la città si legge come stratificata — un livello sopra
l'altro con il vuoto in mezzo — invece che come un tappeto di torri.

**Riferimenti.**

- [Arcology](https://en.wikipedia.org/wiki/Arcology): il termine e il programma
  di Soleri, un'unica struttura che assorbe le funzioni di una città. È il nome
  di ciò che questa sotto-fase costruisce.
- [Kowloon Walled City](https://en.wikipedia.org/wiki/Kowloon_Walled_City): la
  megastruttura non progettata, cresciuta per aggregazione finché non è diventata
  un solo edificio abitato. È il modello di come ci si arriva *crescendo*, che è
  il nostro caso e non quello dell'opera disegnata a tavolino.
- [Minneapolis Skyway System](https://en.wikipedia.org/wiki/Minneapolis_Skyway_System):
  la prova che un secondo livello percorribile diventa il piano principale quando
  è continuo, e resta un ornamento finché non lo è.
- Cloudpunk, già citato in 4.9 per lo stesso motivo: cinque piani di città, e la
  parte bassa deliberatamente strutturale perché è la fondazione di quella sopra.

### Fase 4.15 — Un isolato si può scegliere e girarci attorno

Obiettivo: rendere Block focus capace di rispondere alla domanda che non sapeva
ancora affrontare — **com'è fatto** un isolato — senza aggiungere una sesta vista.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.15.md](docs/roadmap/fase-4.15.md).*

- [x] Sotto-stato bloccato di Block focus: `locked` in `InspectState`, densità
  `veil` → `cut`, riquadro congelato. <!-- size: S -->
- [x] Orbita nella camera isometrica: `PITCH` diventa `REST_PITCH` più un campo
  clampato fra 12° e 82°, drag che gira invece di panare, `captureState` e
  `restoreState`. <!-- size: M -->
- [x] `isCut` e `needsCap` separati: solo un taglio che attraversa i volumi
  chiede `DoubleSide` e il tappo. <!-- size: S -->
- [x] `Esc` a due gradini — molla il soggetto, poi spegne la vista — e regola
  dello strumento che sblocca invece di chiudere. <!-- size: S -->
- [x] Targa che cambia gesto e tasti senza cambiare il nome della vista. <!-- size: S -->

### Fase 4.16 — Tipologie, stili, sbalzi e dettaglio del retro

Obiettivo: togliere alla città la ripetizione — due quartieri lontani si
somigliavano, e un edificio era un prisma pulito da ogni lato.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.16.md](docs/roadmap/fase-4.16.md).*

- [x] Spezzare `generate.ts` nei suoi quattro moduli e fissare le impronte <!-- size: M -->
  digitali della grammatica **prima** di muovere una riga.
- [x] Lo stile come seconda dimensione, ortogonale all'uso e funzione pura di <!-- size: L -->
  `(seed, quartiere)`: nessuno stato, coerenza d'isolato per costruzione.
- [x] Smusso e portico come campi di `TypologyShape`; `shear`, `corner` e <!-- size: M -->
  `gable` come voci di tabella, non come rami.
- [x] Sbalzi veri fuori impronta, con l'invariante gemello — **uno sbalzo non <!-- size: XL -->
  prende suolo** — e i due indici del registry a reggerlo.
- [x] Il ruolo del lotto dentro l'isolato come criterio di catalogo, e la torre <!-- size: M -->
  d'angolo come riga invece che come conseguenza non detta.
- [x] Il dettaglio del retro in un modulo suo: calate, scale esterne, pergole. <!-- size: M -->

### Fase 4.17 — Il distretto costiero dei landmark

Obiettivo: dare a marina, porto e traghetto un'**impronta sul circondario** —
non solo la struttura del catalizzatore, ma il mestiere del posto: canali e
insenature scavati nella riva come una darsena londinese, moli guadagnati al
mare, frangiflutti che chiudono lo specchio, e gli edifici di settore che ci
crescono attorno con i loro bonus e malus di sempre.

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-4.17.md](docs/roadmap/fase-4.17.md).*

- [x] L'anello del distretto cresce con lo stadio del landmark e ha un tetto: <!-- size: L -->
  mai più di due isolati, per costruzione.
- [x] Insenature e canali scavati nella riva emersa e allagati al pelo, con le <!-- size: XL -->
  sponde in muratura: la seconda eccezione al «si riempie, non si scava»,
  estesa oltre l'impronta con la stessa coda e lo stesso confine.
- [x] Moli di terra guadagnata al mare e frangiflutti staccati, dove il fondale <!-- size: L -->
  regge il muro di banchina; le colonne d'acqua sono prenotate al registry.
- [x] Sei tipologie di settore gated su ruolo e costa: gli edifici del <!-- size: M -->
  distretto nascono dalla macchina ordinaria e portano congestione e capacità
  come tutti gli altri, a un edificio per infornata.

### Fase 4.18 — L'earthscraper: la megastruttura che scava

Obiettivo: dare alla città il gesto opposto all'arcologia — una megastruttura che
**scende** invece di salire, sul modello dell'*Earthscraper* di BNKR Arquitectura
(Città del Messico, 2009): la piramide invertita sotto lo Zócalo, dove il centro
storico vieta di demolire e di salire e l'unica direzione libera è il basso.

Vive dentro `src/world/arcology/` come seconda famiglia dello stesso catalogo, e
in `src/world/buildings/sunkenDig.ts` per la parte che tocca il mondo.

**Stato implementazione:** la struttura è completa e provata nei suoi test, e la
condizione di piazzamento ha ora dei siti misurati sull'isola vera. Resta un
blocco che **precede** questa sotto-fase e vale per tutte e due le famiglie:
nessuna arcologia viene fondata, quindi nessun cratere si è ancora visto a
schermo.

- [x] Tre ricette interrate — piramide a terrazze, corte bassa, cratere su due <!-- size: XL -->
  isolati — scritte al contrario: `z = 0` è il fondo del pozzo, il piano di
  campagna sta in cima, e a spostare tutto è l'ancora (`baseZ = padZ - depth`).
  Nessuna coordinata negativa da nessuna parte.
- [x] `shaftOf`: l'invariante del vuoto, speculare alla finestra di cielo. Un <!-- size: M -->
  pozzo si guarda *dentro*, una finestra *attraverso*.
- [x] Lo scavo come terza eccezione al «si riempie, non si scava»: stesso <!-- size: L -->
  confine, stessa coda, e l'imbuto scritto come ricetta di parti perché rientri
  scendendo insieme alle terrazze.
- [x] `reopenPit` al caricamento: senza, il file — che non contiene il terreno — <!-- size: M -->
  restituirebbe una struttura murata nella roccia.
- [x] **La condizione di piazzamento**, riscritta dopo la misura: non la fascia <!-- size: L -->
  ma il **bonus di quota** — la torre prende la cresta del cono, il cratere la
  spalla, e un isolato di spalla senza roccia torna alla famiglia che sale. Vedi
  sotto.
- [ ] **Il cratere a schermo.** La condizione ha siti *e* la città ora fonda <!-- size: M -->
  megastrutture, ma quella che nasce è una torre: `ARCOLOGY.minSpacing` è 2 e il
  nucleo di questa isola è largo due isolati per due, quindi la prima struttura —
  che prende la cresta, perché il cursore ci arriva prima — esclude da sola tutti
  gli altri isolati `core`, spalla compresa. Vedi sotto.

**Due misure, e tutte e due hanno smentito il progetto.**

1. **La profondità.** Il piano era tarato su `TERRAIN.maxHeight`, che vale 80, e
   prevedeva ricette da 44, 36 e 24 quote. Misurata su tre seed, l'isola standard
   è molto più piatta — la maschera radiale schiaccia il rilievo, e su 256×256 la
   colonna più alta sta fra 32 e 36 — quindi due ricette su tre non sarebbero
   **mai** nate, in silenzio e con la suite verde. Le tre ricette stanno ora a
   16, 22 e 26 quote: a 24 passa l'83% dei siti asciutti, a 30 **nessun sito del
   seed 4242**. `sunkenSites.test.ts` è l'allarme che resta.
2. **La fascia, e questa era la condizione stessa.** Misurata su una città
   cresciuta (seed 4242, 2000 tick): quattordici isolati candidati, **4 `core`,
   0 `middle`, 10 `fringe`**, e di tutti e quattordici **uno solo** ha i
   sessantaquattro vicini che una megastruttura chiede — un `core`. Non è un
   caso: la crescita segue la desiderabilità, che segue i catalizzatori, quindi
   il tessuto denso cade dentro la portata di un polo (`core`) e ciò che resta
   fuori è rado (`fringe` per densità, non per quota) e per giunta costiero, dove
   un pozzo non si scava perché il contorno asciutto non regge. **`tier !== core`
   era quindi una condizione vuota**, ed è lo stesso difetto di `isPeakBlock`: la
   terza volta che questo dominio lo incontra.

   La condizione è ora `heightBonusAt` contro `SKYLINE.coneBonus` — i livelli
   concessi *oltre* il tetto nudo della fascia — cioè una misura **dentro** la
   fascia invece di un'alternativa a essa. Sugli stessi quattro isolati `core` dà
   **tre creste e una spalla**, e la spalla è anche la più profonda: 28 quote,
   contorno asciutto, il sito migliore dell'isola. Le due famiglie continuano a
   non contendersi un isolato, e in più un isolato di spalla su cui la roccia non
   basta torna alla famiglia che sale invece di restare senza megastruttura.

**Il blocco che sembrava precedere questa sotto-fase, e non c'era.** La misura da
cui era nato — «nessuna arcologia, di nessuna famiglia; `cappedNeighbours` zero
su ogni isolato» — era vera, ma la diagnosi era sbagliata due volte, e rimisurare
l'ha smentita.

Non è `BUILDER.upgradeThreshold` che si ferma a 198: su quella fixture il campo
di desiderabilità ha massimo **174 su tutta l'isola**, e lo stallo non è al
livello 6, è **totale**. Dopo circa ottocento tick il miglior margine di
promozione fra tutti i trecento edifici è **−8, e su un livello 0 → 1** (soglia
50); gli upgrade si fermano a 181 e non ne parte più uno. Zero edifici fermati
dalla gerarchia, trecentoventi dalla soglia. A mangiarsi il campo è la
congestione — `valore = Σ catalizzatori − 8 × edifici entro Chebyshev 8` — cioè
la crescita stessa: duecentodieci di ampiezza al centro del mercato meno
cinquantasei di sette vicini. **Con un polo solo non esiste una colonna
dell'isola dove la somma stia davanti alla congestione che quella crescita
produce**, e senza promozioni nessun vicino raggiunge mai la propria quota
ammessa.

E infatti il meccanismo non aveva niente di rotto. Stessa isola, stesso seed,
cinque poli di crescita sovrapposti — cioè quello che un giocatore mette davvero
in un centro: il campo satura a **255**, gli upgrade sono **millecinquecento**,
gli edifici arrivano al **livello 26**, e a fare da tetto torna la gerarchia, che
è il suo mestiere. La prima arcologia si fonda intorno al **tick 1600** e sventra
undici edifici. `cappedNeighbours` non ha mai rifiutato niente: ogni rifiuto
prima della fondazione è `thin` o `notCore` — «non c'è ancora abbastanza città».

**Era la fixture, non la taratura.** `arcologyDriver.test.ts` cresceva la città
con un mercato solo, quindi le sue quattro caselle rosse dicevano una cosa vera
di quella fixture e falsa del gioco. La fixture usa ora cinque poli e duemila
tick, e il file è verde. `minCapped` non è stato toccato, e non andava toccato.

**Cosa resta aperto, e questa volta è misurato.** Due cose, e nessuna delle due è
una soglia da abbassare:

1. **`ARCOLOGY.minSpacing: 2` ne ammette una sola.** I quattro isolati `core` di
   questa isola sono adiacenti (2,2 / 2,3 / 3,2 / 3,3): fondata la prima —
   `spireRing`, una torre — le altre tre sono a distanza 1 e la spaziatura le
   esclude tutte. La quota dice tre, la geometria dice una. È per questo che il
   cratere non si vede: non perché la spalla non ci sia, ma perché la torre gliela
   porta via.
2. **Un polo largo cancella la spalla.** I landmark del gruppo identità hanno
   raggio 85–92 contro i 45–65 di un seme di crescita — il listino ha poi preso
   un quarto in più su tutti e diciannove i ruoli (106–115 contro 56–81), quindi
   il divario resta e il rilievo qui sotto vale a maggior ragione, ma i numeri
   misurati sono quelli di prima: uno solo al centro tiene
   `poleReach` sopra tre quarti su tutto il nucleo, il cono è pieno ovunque e
   **ogni** isolato `core` diventa cresta. Con una `university` al centro la
   famiglia interrata torna senza siti; con i soli semi di crescita l'isola dà
   tre creste e una spalla — l'isolato 3,3, bonus 1, 65 vicini, 28 quote di
   roccia, contorno asciutto, che è anche il sito migliore dell'isola. La
   condizione per bonus di quota regge, ma dipende da come il giocatore mette i
   poli in un modo che vale la pena dichiarare.
3. **Il magazzino, e non più la desiderabilità, è il tetto vero dell'altezza.**
   Rimisurato con otto poli del listino e 6000 tick, ma **senza** riempire il
   magazzino come fa la fixture: il campo satura lo stesso a 255 e la soglia
   effettiva arriva a 293, quindi la parte qui sopra regge; le torri però si
   fermano al livello **10** invece che al 26, e `cappedNeighbours` torna a zero.
   A fare da tetto è `upgradeMaterialCost` — `2·(livello−6)²`, da 32 a 578 unità
   per singola promozione — contro una quota ammessa di 23 nel `core` e decine di
   torri che competono per lo stesso magazzino. Non cambia la diagnosi di sopra,
   la completa: con il campo saturo l'arcologia arriva, ma quanto ci mette lo
   decide l'industria. La forbice fra ciò che la gerarchia concede e ciò che
   l'economia paga è la taratura che resta, e `minCapped` continua a non essere
   il numero da spostare.

**Vincolo:** valgono i vincoli trasversali della fase 4. In più: lo scavo non
esce mai dall'impronta, viaggia sulla coda di comparsa come le altre due
eccezioni, e non tocca la `TerrainMap` — che continua a dichiarare la quota
naturale, con il disallineamento già noto dei canali del distretto costiero.

**Gate:** sull'isola esiste almeno un cratere abitato che si legge da
inquadratura d'insieme come un pezzo di città che manca, con usi diversi su
quote diverse sotto il piano di campagna; salvare e ricaricare lo restituisce
identico. La seconda metà del gate è verificata; la prima aspetta il
piazzamento.

**Riferimenti.**

- [The Earthscraper](https://www.bunkerarquitectura.com/) di BNKR Arquitectura,
  2009: 775 000 m² e sessantacinque piani sotto lo Zócalo, piramide invertita con
  un vuoto centrale che porta luce e aria a ogni quota e un pavimento di vetro
  che lascia la piazza alle sue manifestazioni. È il progetto che dà il nome alla
  famiglia, e la sua motivazione è la nostra: dove non si può demolire né salire,
  si scende.
- [Underground buildings](https://www.designforminc.com/post/are-underground-buildings-in-our-future):
  la rassegna che il committente ha indicato — stabilità termica, sicurezza, e i
  vincoli veri (umidità, radon, terreni adatti) che qui restano fuori dal modello.

## Fase 5 — Persistenza e prodotto browser

Obiettivo: trasformare la demo in un gioco riprendibile e distribuibile.

**Stato implementazione:** le prime tre voci sono fatte, e con loro il gate. Le
altre tre restano.

- [x] Salvare seed, simulazione, catalizzatori, policy, settori e registro edifici in <!-- size: XL -->
  un formato versionato; ricostruire terreno e campo invece di serializzare buffer derivati.
- [x] Aggiungere autosave locale, slot manuali, esportazione e importazione JSON. <!-- size: L -->
- [x] Menu principale in modale — riprendi, salvataggi, partita nuova con seed, <!-- size: M -->
  impostazioni, aiuto e riepilogo della partita — aperto dal dock, da `Esc` a
  mani vuote e **a ogni avvio**, che ferma la città finché resta a schermo. La
  partita non riparte da sola: si sceglie *Play* su un'isola nuova o *Continue*
  sull'autosalvataggio.
- [ ] Separare UI di gioco e diagnostica; rendere accessibili controlli, colori e testi. <!-- size: L -->
- [ ] Adattare layout e input a schermi più piccoli, mantenendo desktop come target principale. <!-- size: M -->
- [ ] Preparare deploy statico, telemetria opt-in degli errori e gestione delle versioni dei salvataggi. <!-- size: M -->

**Gate:** ricaricare o aggiornare il browser non perde la partita — la si
ritrova sotto *Continue* nel menu d'ingresso invece che riaperta d'ufficio — e
una build statica può essere pubblicata senza strumenti di sviluppo.

**Resta aperto: la difficoltà.** La voce del menu la nominava insieme al seed, e
il seed c'è: si digita, si sorteggia, e la partita nuova riparte su quell'isola.
Una scelta di difficoltà invece non ha niente dietro — nessuna manopola di
`BALANCE` è ancora dichiarata come tale — e un selettore che non cambia niente
sarebbe peggio della sua assenza. Torna quando esiste il parametro, non prima.

**Resta aperto: la rete in quota non torna voxel per voxel.** Campate,
impalcati, gambe, ascensori e stazioni di funivia si cancellano con
`clearVolume` — un parallelepipedo — invece di rigenerare la sagoma, quindi il
loro generatore vuole un piano (`SpanPlan`, `DeckPlan`) che il record non porta.
Restano fuori dal file, e con loro cade chi ci poggiava sopra: la potatura segue
`supports`, perché un edificio senza il suo impalcato resterebbe sospeso in aria.
Dopo il caricamento è la passata della rete in quota a riproporre campate e
mensole sui tetti tornati, che è il mestiere per cui esiste — ma una città molto
intrecciata si riapre più semplice di com'era, e ci rimette qualche minuto a
tornare com'era. Chiuderlo vuol dire un campo nuovo sul record per il legame
gamba-impalcato, e uno `stampOf` per famiglia; il posto è `recordStamp.ts`, che
già lo fa per edifici, landmark e arcologie.

## Fase 6 — Ottimizzazione e scala

Questa fase accompagna tutte le precedenti; nessuna funzionalità supera il gate
se rompe i budget esistenti.

- [ ] Mantenere 60 fps desktop, lavoro non-render sotto 4 ms per frame e crescita a <!-- size: L -->
  costo limitato indipendente dal numero totale di edifici.
- [ ] Aggiungere scenari automatici di soak per città grandi, espansioni consecutive <!-- size: M -->
  e cambi frequenti di policy.
- [ ] Misurare separatamente generazione, applicazione voxel, meshing, upload e UI. <!-- size: M -->
- [ ] Introdurre livelli di dettaglio o batching aggiuntivo solo dopo misure reali, <!-- size: L -->
  preservando palette a uniform e una geometria per chunk finché restano adeguati.
- [ ] Verificare periodicamente GPU integrata, memoria, tempo di startup e dimensione bundle. <!-- size: S -->

## Fase 7 — Linguaggio visivo dell'interfaccia

Obiettivo: portare l'HUD dal livello di wireframe funzionante a quello di
interfaccia di gioco. La struttura attuale è giusta — barra risorse in alto,
dock degli strumenti in basso, drawer a destra, tutto guidato da un modello puro
in `GameHudModel.ts` — ma la *pelle* è generica: rettangoli arrotondati color
crema, un'unica ombra, icone a tratto sottile tutte dello stesso peso e dello
stesso colore. Il risultato è che l'HUD sembra appoggiato sopra il gioco invece
di appartenergli.

**Stato: 7.1, 7.3, 7.4 e 7.6 sono fatte** — il sottoinsieme che Alpha 0.2 chiede
prima del playtest, più la leggibilità delle cause, che non era in programma qui
e ci è finita perché è lo stesso difetto un piano più a fondo: la 7.1–7.5
rendono leggibile lo **stato**, la 7.6 la **causa**. Restano 7.2 (iconografia) e
7.5 (movimento e feedback). Delle tre
rotture qui sotto, la seconda e la terza sono chiuse; la prima lo è per metà —
le cinque risorse ora si distinguono per anello, tendenza e sparkline, ma
l'**icona** è ancora la stessa a tratto unico, ed è appunto 7.2.

Le tre rotture visibili a schermo, in ordine di gravità:

1. **La barra risorse legge come cinque copie della stessa pastiglia.** Denaro,
   residenti, cibo, materiali e soddisfazione hanno la stessa icona a tratto
   `1.8` nello stesso `--hud-sage-dark`: il colpo d'occhio, che è l'unica cosa
   che si guarda mentre si costruisce, non distingue le risorse. E `±0` ripetuto
   cinque volte è rumore, non informazione.
2. **Otto strumenti su nove sono grigi.** `locked` e `disabled` hanno oggi lo
   stesso aspetto, quindi la toolbar comunica "rotto" dove dovrebbe comunicare
   "non ancora": la progressione, che è il motivo per cui i bottoni bloccati
   restano visibili (vedi il commento su `locked` in `GameHudModel.ts`), va persa
   proprio nel momento in cui dovrebbe motivare.
3. **Non c'è materiale.** Un solo livello di elevazione, nessuna cornice, nessun
   bordo interno luminoso, nessuna variazione col tema: i sette temi in
   `src/engine/themes/` cambiano cielo, luce, nebbia e bloom, e l'HUD resta crema
   in tutti e sette. Questa è la singola incoerenza più grande fra UI e mondo.

Il riferimento non è "più decorazione": è il principio che i costruttori di città
leggibili applicano tutti — l'UI condivide il linguaggio di forma del mondo
(silhouette pulite, materiale coerente, icone che si riconoscono dalla sagoma),
e i numeri cedono il posto alle visualizzazioni dove possibile. Le fonti che
hanno guidato questa fase sono in fondo alla sezione.

**Vincoli che restano validi:** niente nuove dipendenze runtime — cornici e icone
sono SVG inline e CSS, non un UI kit; `GameHudModel.ts` resta puro e testabile in
`node`; il repaint dell'HUD resta fuori dal percorso caldo del frame;
`prefers-reduced-motion` continua a spegnere tutto il movimento.

### Fase 7.1 — Materiale dei pannelli e temi

- [x] Sostituire `--hud-shadow` con una scala di elevazione a tre livelli (dock, <!-- size: M -->
  drawer, modale) e aggiungere a `.hud-surface` bordo interno chiaro, gradiente
  verticale e ombra di contatto: un pannello deve leggersi come un oggetto
  appoggiato, non come un rettangolo trasparente.
- [x] Cornice dei due oggetti di chrome — **ad anelli, non a `border-image`**. <!-- size: M -->
  La tecnica 9-slice è incompatibile con la derivazione dei temi qui sotto: un
  `data:` URI non legge le custom property, quindi la cornice dovrebbe essere
  trasparente per non stonare, ma `border-image` ignora `border-radius` e sotto
  una cornice trasparente si vedrebbero gli angoli **quadrati** del gradiente.
  Tre anelli in `box-shadow` danno lo stesso risultato — nessun angolo deformato
  quando il pannello scala, nessun asset binario — e per di più seguono i token.
- [x] Far derivare i token di `hud.css` dal tema attivo: `hudTokens(theme)` in <!-- size: L -->
  `src/ui/hudTokens.ts` sceglie pannello chiaro o scuro dalla luminanza
  dell'aria, tinge verso il colore del mondo e blocca il contrasto AA; `main.ts`
  li calcola e `GameHud.setTheme` li scrive su `document.documentElement`.

**Gate raggiunto:** cambiando tema, HUD e scena restano riconoscibilmente lo
stesso gioco — neon e sci-fi portano un HUD scuro, gli altri cinque uno chiaro, e
le sette superfici sono tutte distinte. Il contrasto è verificato due volte: in
`node` su ogni token di testo (`hudTokens.test.ts`) e nel browser sui valori
davvero dipinti, dove sta fra **4,57 e 15,63**.

### Fase 7.2 — Iconografia

- [ ] Ridisegnare `hudIcons.ts` su due pesi (filled per le risorse, stroke per le <!-- size: L -->
  azioni) con sagoma leggibile a 18px, non pittogrammi generici a tratto unico.
- [ ] Dare a ogni risorsa un'identità cromatica stabile — denaro oro, cibo verde, <!-- size: M -->
  materiali argilla, residenti blu, soddisfazione corallo — riusata ovunque quella
  risorsa compaia: barra, costi dei bottoni, toast, cursor card.
- [ ] Per i catalizzatori usare miniature isometriche voxel al posto dei <!-- size: L -->
  pittogrammi lineari: è il gancio più diretto fra toolbar e mondo, e riusa la
  palette già in `palette.json`.

**Gate:** a etichette nascoste, un giocatore riconosce le cinque risorse e i
sette catalizzatori dalla sola icona.

### Fase 7.3 — Indicatori

- [x] Sostituire il `delta` testuale con un indicatore di tendenza: freccia <!-- size: M -->
  direzionale, magnitudine (nell'opacità, non in una seconda cifra) e sparkline
  sulla finestra dei tick recenti — `src/ui/ResourceTrend.ts`, campionata sul
  `tickCount` perché l'HUD ridipinge più spesso di quanto la simulazione avanzi.
  Niente `±0` a schermo quando non succede niente.
- [x] Dove esiste un tetto, un anello invece del numero nudo: il cibo contro la <!-- size: M -->
  soglia della carestia — **lo stesso numero** che fa scattare il toast di
  penuria, così le due superfici non possono divergere — e la soddisfazione, che
  è già una quota. Denaro e materiali non hanno un massimo e non fingono di
  averlo.
- [x] Numeri tabulari e stato di crisi con pulsazione e colore, non solo con <!-- size: S -->
  testo rosso. La pulsazione è CSS e si spegne sotto `prefers-reduced-motion`.
- [x] Su hover (e col fuoco da tastiera), popover con la scomposizione <!-- size: M -->
  entrate/uscite: i sei numeri esistevano già dentro `tick.ts` e venivano buttati
  via una riga dopo essere serviti al saldo. Ora escono come `FundsReport`
  (`src/sim/flows.ts`), derivato dal tick come `commerce` e non accumulato.

**Gate raggiunto:** dallo sguardo alla barra si capisce in che direzione sta
andando la città. Verificato con una città viva: anelli parziali, sparkline che
si muovono, frecce accese e il popover che nomina tasse e negozi.

### Fase 7.4 — Strumenti

- [x] Separare `locked` da `disabled`: il bottone bloccato mostra il requisito <!-- size: M -->
  mancante come riempimento progressivo invece di sbiadire, e il requisito è
  quello **vincolante** — chi ha i fondi ma non gli abitanti vede gli abitanti.
  Un blocco che non si scioglie aspettando (l'ordine del tutorial) resta invece
  sbiadito: riempirlo allo 0% direbbe «manca tutto» quando la verità è «prima fai
  un'altra cosa».
- [x] Tile icona-sopra-etichetta di dimensione uniforme, badge del tasto numerico <!-- size: M -->
  1..9, badge di costo con l'icona della risorsa. **I tasti `1`..`9` sono passati
  dagli otto temi agli strumenti**, e i temi a `Shift`+`1`..`9`: la ragione che
  teneva le cifre nude sui temi — «il dock è aperto a chiunque, quella
  scorciatoia non può stare dietro `?debug=1`» — è esattamente quella che ora le
  sposta. Nel campionario restano sui temi, perché lì non c'è dock.
- [x] Stato selezionato forte: cornice d'accento, sollevamento e ombra colorata, <!-- size: M -->
  oltre all'inversione. L'anteprima del raggio in-world tiene il colore che ha —
  colorarla per strumento tocca l'engine e resta a 7.5.
- [x] I separatori di gruppo sono diventati guide etichettate continue, e le <!-- size: S -->
  corsie sono quattro: crescita, connessioni, identità e **portata** (espansione,
  mensola, funivia, che prima galleggiavano fuori da ogni gruppo).

**Gate raggiunto:** guardando solo il dock si vede cosa si può costruire ora
(tessera piena), cosa manca per il resto (barra che avanza più le due cifre) e
quale strumento si ha in mano (cornice e sollevamento).

### Fase 7.5 — Movimento e feedback

- [ ] Micro-interazioni di pressione, spesa (il costo vola dal bottone alla barra) <!-- size: M -->
  e sblocco; stack di toast invece di uno solo che si sovrascrive.
- [ ] Feedback di piazzamento in-world — anello di selezione e impronta sul <!-- size: M -->
  terreno — invece della sola cursor card.
- [ ] Tutto sotto `prefers-reduced-motion` e sotto il budget: le animazioni sono <!-- size: S -->
  CSS/`transform`, mai lavoro per frame in JS.

**Gate:** ogni azione ha una conseguenza visibile entro 150 ms e nessuna
animazione compare nel profilo del frame.

### Fase 7.6 — Leggibilità delle cause

*Chiusa. Il ragionamento e l'esito stanno in [docs/roadmap/fase-7.6.md](docs/roadmap/fase-7.6.md).*

- [x] Ogni regola che rifiuta sa dire perché: `specializationGapsOf` derivata da <!-- size: M -->
  `balance.ts`, `typologyGapsOf` speculare a `accepts`. Il dominio dice *cosa
  manca*, `src/ui/prospects.ts` dice *come si chiama*.
- [x] Due righe nella scheda di selezione, **accoppiate**: la forma che potrebbe <!-- size: M -->
  crescere qui, e il quartiere che quella forma pretende. Non due risposte a due
  domande scollegate.
- [x] La tessera del catalizzatore smette di promettere ciò che le soglie non <!-- size: S -->
  confermeranno: le tipologie dietro una specializzazione passano da `May build`
  a `Unlocks`, con la condizione accanto.

### Riferimenti

- [Game UI Database — Anno 1800](https://www.gameuidatabase.com/gameData.php?id=1118) e
  [Cities: Skylines](https://www.gameuidatabase.com/gameData.php?id=526): cataloghi di schermate reali per barra risorse e build menu.
- [Interface In Game — Cities: Skylines](https://interfaceingame.com/games/cities-skylines/): la stessa UI vista in movimento.
- [80.lv — How Dorfromantik Expands Its Cozy World Through Minimalist Design](https://80.lv/articles/how-dorfromantik-expands-its-cozy-world-through-minimalist-design): silhouette leggibili e coesione visiva, il registro più vicino al nostro.
- [Unity — How Timberborn's complex runtime UI was built](https://unity.com/case-study/timberborn): come si tiene insieme un HUD di city builder che cresce.
- [Isometric City Builder Art: Modular Buildings, Layout & Lighting](https://sunstrikestudios.com/en/blog/isometric-city-builder-art/): l'UI condivide il linguaggio di forma del mondo.
- [9-Slice Scaling Explained](https://generalistprogrammer.com/tutorials/nine-slice-scaling-explained) e [MDN `border-image`](https://developer.mozilla.org/en-US/docs/Web/CSS/border-image): la tecnica di 7.1.
- [The Art of Designing Intuitive User Interfaces in Cozy Games](https://sdlccorp.com/post/the-art-of-designing-intuitive-user-interfaces-in-cozy-games/): iconografia al posto del testo.

## Fase 8 — La città si può perdere

Obiettivo: che esista una mossa che **evita una perdita**, e che la perdita si
veda nel punto in cui è avvenuta.

La diagnosi è che la città può solo crescere. La simulazione è profonda — due
catene economiche che si contendono le stesse braccia, cibo che costa terra,
materiali che finanziano l'altezza — ma niente di tutto questo può peggiorare in
un punto che si possa indicare: quando le cose vanno male va male un numero nella
barra in alto, e nessun isolato si spegne. Ne segue il difetto che si sente
giocando: le azioni del giocatore **accelerano**, non **salvano**.

Due tracce dicevano che il buco era esattamente questo. `removeBuildings`
esisteva ed era verificato inverso esatto di `addBuilding`, con **un solo
chiamante** — il cantiere di un landmark che sventra per farsi posto — e la
parola «abbandono» non compariva in nessun file del repository. `cityVitality`
calcolava già lo sfitto, `1 - homes`, e serviva ad **accendere le finestre**: un
numero globale che decora, dove servirebbe un fatto locale che minaccia.

È ortogonale alla spina dorsale verticale: 4.9 e 4.14 restano aperte e nessuna
delle voci qui sotto le tocca o le rimanda.

**Vincoli trasversali**, oltre a quelli della fase 4:

- **`src/sim/` non impara la geografia** (invariante 7). La simulazione propone e
  non demolisce: la porta resta `removeBuildings`, chiamata da fuori.
- **Il campo non guadagna un quinto piano** (contratto 10). `CLASS_COUNT` resta
  4; la copertura si deriva dal piano civico che c'è già.
- **`urbanProfileAt` non legge il tempo.** È una funzione spaziale: se leggesse
  `tickCount`, lo stesso stato produrrebbe edifici diversi a seconda di quando lo
  si guarda. Il fronte del declino entra in `tick`, che il tempo lo legge già.
- **Il pareggio non è il bersaglio.** La 3.1 ha già imparato che puntare al
  pareggio secco lascia una città senza margine: ogni soglia qui sotto sta sopra
  il punto in cui la condizione si spegne, o l'allarme si riarma sulla propria
  risposta.

### Fase 8.1 — Il declino ha un luogo

Obiettivo: un edificio che sta in un posto diventato invivibile se ne va, e si
vede quale.

- [x] `nextDecaySites`, **speculare a `UpgradeDriver` e non a `nextBuildSites`**: <!-- size: L -->
  cammina `state.buildings` a cursore invece di scandire il campo allocato, e il
  costo di una passata non cresce con la città. Vive in `src/sim/decay.ts`, non
  rimuove niente, e non sa dove sia la costa.
- [x] Il **fronte**, `decayPressure`: un numero in `SimState` che sale sotto una <!-- size: M -->
  soglia e scende sopra un'altra, con una banda morta in mezzo. Tre minuti di
  scoperto continuo prima che si armi, e un rientro tre volte più rapido.
- [x] `DecayDriver` in `src/world/buildings/`, che apre un cantiere di sgombero e <!-- size: M -->
  se ne va: a smontare a budget, togliere il record e dirlo alla simulazione è
  `ClearanceSites`, come per il monumento e per la gomma. Un solo edificio per
  passata, e non per risparmiare — un isolato che sparisce tutto insieme non si
  legge come una conseguenza.
- [x] **Una città in affanno smette di fondare prima di cominciare a perdere.** È <!-- size: S -->
  una riga in `buildPass`, ed è il fronte anti-oscillazione: togliere un edificio
  *alza* la desiderabilità dei vicini di otto punti — con lui se ne va la sua
  congestione — quindi senza, la colonna appena liberata sarebbe la prima
  candidata dell'infornata dopo.
- [x] La perdita nell'HUD: una crisi che nomina la copertura misurata e il gesto <!-- size: S -->
  che la risolve, più un collo di bottiglia mentre il fronte si carica — l'avviso
  prima della perdita.

**La scelta di progetto che tiene in piedi il resto: il degrado è una proprietà
del posto, non dell'edificio.** L'alternativa ovvia — un contatore di sofferenza
su ogni `Building` — non fa salire `SAVE_VERSION`, che un default lo copre, ma
costa comunque sei punti di scrittura, una tabella di default e soprattutto
l'invariante «inverso byte per byte» da ri-verificare nei due versi. Chiedendo
invece «chi sta in un posto che non lo regge più» la risposta è derivata dallo
stato a ogni tick, come `flows` e come il referto del raccolto: nessun campo
nuovo e nessun modo che il contatore e la realtà divergano.

**Resta fuori di proposito: la rovina.** Un edificio che si spegne, si annerisce
e resta lì qualche decina di tick prima di sparire è più leggibile di uno che
svanisce, e la grammatica saprebbe già farlo. Ma quello **è** uno stato per
edificio, con tutto il conto scritto sopra: va fatto dopo, sapendolo, e non
infilato qui perché sembra un dettaglio grafico.

**Stato implementazione:** completata. **Il gate resta da validare a schermo:** i
test coprono le regole — che a fronte disarmato non si perda niente, che a fronte
armato stato e registro restino d'accordo, che il catalizzatore sopravviva al
quartiere che gli muore intorno — non se un giocatore *capisca*, guardando, che
cosa ha smesso di fare.

**Gate:** una città lasciata senza servizi perde edifici in un punto che il
giocatore può indicare, e riprendersi è possibile; il campo dopo un abbandono è
identico a quello di una città che quell'edificio non l'aveva mai costruito.

### Fase 8.2 — I servizi devono stare al passo

Obiettivo: che almeno un catalizzatore smetta di essere un bonus e diventi una
manutenzione.

I diciannove ruoli erano tutti facoltativi: aggiungevano desiderabilità, e non
averli significava crescere più piano. Nessuno era necessario, quindi la toolbar
era un menu di acceleratori.

- [x] **La copertura ha due metà**, ed è il modello che Cities Skylines ha <!-- size: L -->
  spedito: una quota **cittadina**, uguale ovunque, che fa da pavimento; e una
  quota **locale**, letta dal piano civico del campo — quindi con decadimento
  geodetico, lungo le strade, come le vie pubbliche di Anno 1800.
- [x] La quota cittadina somma i **servizi posati**, pesati per la loro influenza <!-- size: M -->
  civica, e gli **edifici civici cresciuti** attorno, pesati per la quota di
  manutenzione che i fondi coprono. Otto a uno fra le due, e non a occhio: è
  misurato che sotto un catalizzatore residenziale forte gli edifici civici **non
  nascono affatto** — `nextBuildSites` dà la cella all'uso col punteggio più alto,
  e il residenziale satura per primo — quindi una copertura che dipendesse solo da
  loro varrebbe zero in ogni partita.
- [x] Lo scoperto entra nel declino come unico motivo, e la domanda **cresce con <!-- size: M -->
  la popolazione**: una rete che bastava a duemila abitanti non basta più a
  quattromila senza che nulla si sia rotto.
- [x] Vista informativa `Services`, settima del giro `I`: continua, già <!-- size: M -->
  normalizzata, con la chiave della heatmap che porta la quota cittadina
  arrotondata al centesimo perché non si rifaccia sessanta volte al secondo.

**Perché il pavimento è a metà e non a zero né a uno.** A uno, il civico
automatico curerebbe la città senza che il giocatore tocchi niente, e saremmo
tornati a guardarla crescere. A zero, un quartiere lontano da ogni catalizzatore
cadrebbe a zero e il declino diventerebbe una spirale — il difetto per cui
SimCity 4 è famoso, dove un edificio abbandonato **peggiora** il vicinato. Qui la
spirale non può accadere nemmeno volendola: `removeBuildings` fa `bumpCrowd(-1)`,
quindi un abbandono *restituisce* otto punti di desiderabilità ai vicini.

**Nessuna memoria in più.** La quota cittadina è un numero solo per tutta la
mappa e la quota locale è `values[civic]`, che c'era già: la copertura di una
colonna costa una `valueAt` e due moltiplicazioni, e i byte per colonna restano
sette.

**Stato implementazione:** completata, con la taratura confermata su misura e non
a occhio. Una città con un mercato e nient'altro cade sotto il quinto di
copertura e arretra; con un parco tiene il doppio del tempo; con parco e scuola
cresce fino a novemila abitanti e duecentoquaranta edifici prima che il fronte
cominci a caricarsi — e a quel punto il terzo servizio è la mossa che le serve.
`coverage.cityShare` a metà, `decay.distressCoverage` a un quinto — la stessa
soglia di dilapidazione di SimCity 4 — e le due soglie del fronte a 0,85 e 1,1.

**Gate:** una città che cresce senza che il giocatore aggiunga servizi si ferma e
poi arretra; la stessa città con i servizi al passo continua. Le due partite
partono dallo stesso seed.

### Fase 8.3 — La congestione diventa geografia

Obiettivo: che densificare abbia un prezzo spaziale, senza simulare un veicolo.

[reach.ts](src/sim/reach.ts) calcola già distanze **geodetiche** con costi di
attraversamento per cella, letti da `world/reachCost.ts`, e una strada costa meno
del tessuto. Basta far salire il costo delle celle di carreggiata con la densità
costruita accanto: un quartiere che si infittisce diventa **lontano** da tutto, i
campi che lo raggiungevano si accorciano, la crescita si ferma — finché non
arriva un catalizzatore di trasporto. È il ciclo del traffico di Cities Skylines
senza un veicolo e senza pathfinding, e non collide con `src/world/traffic/`, che
è un'altra cosa: lì barche e aerei sono pose in funzione del tempo.

- [x] Termine di densità costruita in `reachCost`, mantenendo il vincolo che **un <!-- size: L -->
  passo non costa mai meno di 1**: la geodetica resta almeno la Chebyshev e la
  forma non esce dal quadrato che il campo ricalcola. Il carico sta su tessere da
  otto celle in `src/world/congestion.ts` — il costo di un passo si chiede una
  volta per vicino visitato dentro Dijkstra, quindi doveva costare una ricerca in
  una `Map` — e si **somma** al costo del suolo invece di sostituirlo, che è ciò
  che tiene in piedi sia il pavimento a 1 sia il vantaggio relativo della strada.
- [x] Invalidare la cache geodetica **a scaglioni**, non a ogni edificio: il <!-- size: M -->
  precedente è già nel repo — `GrowthScene` rifà le rotte ogni sessantaquattro
  edifici, ed è lo stesso segnale. Le **promozioni** contano insieme alle
  comparse, perché un upgrade non muove `registry.count` ma raddoppia il volume
  sulla stessa impronta: uno scaglione cieco alle promozioni non vedrebbe mai
  densificare, cioè proprio la cosa a cui questa fase dà un prezzo.
- [x] Misurare l'A/B come la 4.2 — **nello stesso processo e a bracci alternati**, <!-- size: M -->
  non su due worktree — perché qui si tocca il percorso caldo del campo. Il
  worktree è stato lasciato per una ragione trovata misurando: su una città
  cresciuta il percorso incrementale e la ricostruzione **non danno lo stesso
  campo** (7.548 celle su 65.536, scarto fino a 64), quindi un braccio senza
  scaglioni avrebbe misurato la congestione e quella deriva insieme. Il controllo
  rende il termine *muto* invece di spegnerlo: il carico si calcola e il campo si
  rifà con la stessa cadenza, e a cambiare è solo ciò che il costo legge.

**Il costo vero è l'invalidazione, non il termine**, e la misura lo conferma:
rifare il carico dal registry sono 0,19 ms, rifare il campo che ne dipende sono
52 ms sulla città del benchmark e 90 su un'isola cresciuta — il doppio di un
`setPolicyActive`. Da qui la seconda metà, che il piano non chiedeva:
`CongestionMap.rebuild` dichiara **se il carico si è mosso davvero**, e solo
allora si paga. Quindici ruoli su diciannove non alleggeriscono niente e un
edificio in periferia non satura nessuna tessera; su 1.200 tick di partita restano
quattro ricostruzioni in tutto.

**Gate: passato, e misurato invece che guardato.** Stesso seme, 1.200 tick,
controllo muto contro braccio ingorgato: il volume costruito nel centro scende da
22,2k a 14,9k voxel (−33%), il livello medio degli edifici del centro da 1,37 a
1,16, il volume di tutta la città da 101k a 90k — mentre gli edifici *salgono* da
154 a 177. La città si allarga invece di impilarsi. Un catalizzatore di transito
piantato a metà corsa riporta il carico mediano da 0,32 a 0,10, il livello medio
del centro a 1,57 e il volume a 100k: il quartiere riparte, e si vede in due
minuti di partita.

**Stato implementazione.** `src/world/congestion.ts` (nuovo) con
`src/world/congestion.test.ts`; `createReachCost` prende un terzo argomento e
`src/world/reachCost.test.ts` prova l'invariante del passo ≥ 1 e il vantaggio
della carreggiata a ogni carico; `BALANCE.reach.congestion` porta grana,
saturazione, supplemento e la tabella del sollievo; `GrowthScene.syncCongestion`
tiene lo scaglione e la ricostruzione; una riga di benchmark in `sim.bench.ts`
misura `rebuildField`, che è il prezzo di uno scaglione.

**Quello che il piano prometteva e non è stato fatto così.** Caricare la sola
carreggiata: il tessuto costa 1,25, quindi l'influenza avrebbe aggirato l'isolato
per un quarto di cella per passo e il quartiere denso non sarebbe mai diventato
lontano. Il supplemento va su suolo e carreggiata insieme, e la strada resta la
via più corta perché parte da meno.

### Fase 8.4 — Il ritmo

Obiettivo: che una scorta abbia senso.

Dalla 3.1 il cibo ha un posto sulla mappa e un listino in case sfamate. Mancava
il motivo per averne più del necessario: `food.targetCoverage` punta a un margine
fisso, e una città in pareggio restava in pareggio per sempre.

- [x] Moltiplicatore stagionale sulla resa dei tre produttori, dentro `tick`. <!-- size: M -->
  Un **seno** e non quattro gradini, in `src/sim/seasons.ts`: la media sull'anno
  vale esattamente uno — quindi `missingPlotsOf` continua a dimensionare la
  campagna senza sapere che mese sia — e non c'è un tick in cui il raccolto
  salti, che a schermo sarebbe un guasto e non una stagione.
- [x] Il fronte dell'emergenza alimentare misura la campagna **all'anno medio**, <!-- size: M -->
  non il raccolto di oggi: la resa scende sotto il pareggio ogni inverno per
  costruzione, e un fronte che la leggesse si disarmerebbe e riarmerebbe una
  volta l'anno senza che nessuno abbia fatto niente. Alla carestia si aggiunge
  una metà strutturale — `foodDeficitOf` positivo — così l'inverno non può
  dichiarare quello che la primavera risolve da sola.
- [x] Stagione visibile nel mondo, riusando i sette temi. `src/engine/season.ts` <!-- size: L -->
  è a `daylight.ts` quello che la stagione è all'ora: entra una fase, esce lo
  stesso tema piegato — quattro slot di prato nella palette, più rimbalzo dal
  terreno, nebbia e orizzonte. Nessuna geometria, e a metà estate le due
  funzioni tornano il tema per identità.

**Il vincolo che non si negozia:** la stagione entra in `tick` e **non** in
`urbanProfileAt` — la stessa ragione per cui i mandati sono slot e non scadenze.

**L'ampiezza è tarata contro il piano, non a occhio.** A 0,35 una campagna
dimensionata come `food.targetCoverage` la vuole attraversa l'inverno con la sola
scorta accumulata prima, e la dispensa tocca il fondo senza andarci sotto:
`seasons.test.ts` lo verifica integrando l'anno tick per tick. È il numero che
separa un ritmo da una carestia annuale che nessuna mossa evita — e il secondo
sarebbe stato il difetto della fase 8 rifatto al contrario.

**Stato implementazione:** completata. **Il gate resta da validare a schermo:** i
test coprono le regole — media annua a uno, fronte che non oscilla, scorta che
regge l'inverno, temi che tornano sé stessi d'estate — non se una partita si
*senta* divisa in un tratto in cui si accumula e uno in cui si consuma.
`?season=<0..1>` e `__voxelSeason(phase)` esistono per guardarla senza aspettare
i quattro minuti dell'anno.

**Gate:** una partita ha un ciclo riconoscibile in cui accumulare e uno in cui
consumare, e la scorta è la differenza fra le due.

### Cosa questa fase non propone, e perché

- **Traffico con agenti.** Contraddice «la rete stradale è una funzione pura del
  seed»: veicoli con una destinazione vogliono stato da serializzare, e la fase 5
  ha appena chiuso il salvataggio proprio non serializzando ciò che sa
  ricostruire. E il p95 del tick è già sopra i 3 ms di `FRAME_BUDGET_MS`.
- **Zoning manuale cella per cella.** È contro la visione, e la fase 2 ha fatto il
  lavoro opposto: i distretti emergono dalla sovrapposizione dei campi.
- **Disastri casuali.** Nessun `Math.random()` globale, e soprattutto un disastro
  che il giocatore non poteva prevedere non insegna niente. Il declino qui è
  sempre la conseguenza leggibile di una copertura che non c'è.

### Riferimenti

- [Cities: Skylines — Services](https://skylines.paradoxwikis.com/Services) e [la discussione che separa raggio e copertura](https://steamcommunity.com/app/255710/discussions/0/1638661595041890888/): la copertura è cittadina, il raggio è un bonus locale.
- [Cities: Skylines II — City Services](https://www.paradoxinteractive.com/games/cities-skylines-ii/features/city-services-districts-policies): lo stesso schema, dichiarato.
- [SimCity 4 — Zots](https://simcity.fandom.com/wiki/Zots) e [Residential dilapidation, why?](https://community.simtropolis.com/forums/topic/757769-residential-dilapidation-why/): l'avviso prima della perdita, e la soglia di dilapidazione a un quinto.
- [Anno 1800 — Public buildings](https://anno1800.fandom.com/wiki/Public_buildings): l'influenza che si propaga lungo le strade, e la qualità della strada che ne cambia la portata.
- [Manor Lords — Approval](https://wiki.hoodedhorse.com/Manor_Lords/Approval): fattori recenti più una memoria che sfuma — il precedente per due soglie invece di una.

## Prossimo milestone consigliato — Alpha 0.2

- [x] Tutorial iniziale e feedback del raggio dei catalizzatori. <!-- size: M -->
- [x] Bilanciamento recuperabile di popolazione, cibo e produzione. <!-- size: M -->
- [x] Settori costieri unici che aggiungono terreno realmente edificabile. <!-- size: M -->
- [x] Costi continuativi e conseguenze visibili per le sei policy esistenti. <!-- size: M -->
- [x] Commerciale autonomo e primo edificio residenziale-commerciale a uso misto. <!-- size: L -->
- [x] Primo sistema di strade procedurali usato come scheletro della crescita (fase 4.1). <!-- size: XL -->
- [x] Salvataggio locale minimo del ciclo completo. <!-- size: L -->
- [ ] Playtest di 30 minuti con budget e criteri automatici registrati. <!-- size: M -->
- [x] Passata visiva su indicatori e strumenti: **fasi 7.1, 7.3 e 7.4 fatte**. <!-- size: L -->
  Barra risorse e dock si leggono a colpo d'occhio, e l'HUD cambia con il tema
  invece di restare crema sotto ogni cielo. Il resto della fase 7 — iconografia
  (7.2) e movimento (7.5) — può seguire senza bloccare il playtest.
- [x] Guardare dentro la città: **fasi 4.11 e 4.13 fatte**. Le quattro viste <!-- size: M -->
  sono passate da strumento dell'harness a comando di gioco — dock, tasti senza
  debug, barra dei livelli — ed è la risposta alla domanda che una città densa
  pone a chi ci gioca, non solo a chi la costruisce.
- [ ] Campionario dei voxel (fase 4.10): l'altro strumento della coppia, che <!-- size: M -->
  guarda il vocabolario invece della città costruita. Non è contenuto della
  milestone e non entra nel gate.

Alpha 0.2 è completa quando una partita ha apertura, sviluppo ed espansione
leggibili, due strategie sostenibili e un salvataggio ripristinabile, con una
barra risorse e un dock che si leggono a colpo d’occhio, senza regressioni
rispetto ai contratti e ai budget dell’MVP.

## Milestone successivo — Alpha 0.3, la città si richiude in alto

È la milestone che porta a schermo la seconda metà della visione, e coincide con
la spina dorsale della fase 4: fino a qui la città si è espansa su `(x, y)`, da
qui comincia a espandersi su se stessa.

- [ ] Rete urbana in quota: campate, mezzanini, impalcati abitati e spazio <!-- size: XL -->
  pubblico sopra il piano stradale (fase 4.5).
- [ ] Gerarchia verticale, e i tre tetti che oggi fermano la città a mezz'aria <!-- size: XL -->
  (fase 4.6).
- [ ] Suolo artificiale: piattaforme, edifici sopra edifici, mobilità fra i <!-- size: XL -->
  livelli (fase 4.9).
- [ ] Almeno un'arcologia sull'isola (fase 4.14). <!-- size: XL -->
- [ ] Campionario dei voxel (fase 4.10), se non è già arrivato prima: è lo <!-- size: M -->
  strumento con cui si giudicano le forme nuove, e qui ne arrivano molte.

**Sull'ordine rispetto ad Alpha 0.2.** Le due milestone non competono per gli
stessi file — la spina dorsale vive in `src/world/`, salvataggio e passata visiva
in `src/game/` e `src/ui/` — quindi l'ordine fra loro è una scelta e non un
vincolo tecnico. Una cosa però lo era: la fase 5 serializza il **registro degli
edifici**, e la 4.9 gli aggiunge piattaforme e quote. Salvare prima significava
versionare il formato due volte; salvare dopo, giocare più a lungo senza
salvataggio. **Deciso dai fatti:** la 4.x si è chiusa per intera prima, quindi il
record aveva già i suoi campi verticali e il formato nasce a versione uno.

Alpha 0.3 è completa quando dalla stessa inquadratura si contano due livelli
abitati sovrapposti e si segue un percorso continuo in quota fra due isolati
diversi; quando una partita che non arriva mai in quota resta identica a quella
di oggi; e quando determinismo e budget reggono con due livelli sovrapposti come
con uno.
