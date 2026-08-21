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

### Fase 2.1 — Vincoli di sito dei catalizzatori

Obiettivo: far dipendere il luogo ammesso per un catalizzatore dal ruolo che ha,
e aggiungere la connessione aerea come alternativa non costiera al porto.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono le regole e i motivi di rifiuto, non la
leggibilità del cursore mentre lo si muove. Le due sezioni che seguono
descrivono la situazione *prima* del lavoro; cosa è cambiato sta in fondo.

**Perché la fase 2 si riapre.** Il porto è stato chiuso come «primo collegamento
dell'isola al mondo», ma non ha mai avuto una regola sull'acqua:
`catalystFailure` in `src/game/actions.ts` convalida tutti i ruoli con la stessa
riga, `if (!column.buildable)`, e `BUILDABLE_BIOMES` in
`world/terrain/config.ts` esclude `beach`. Le due regole si sommano nel
risultato opposto a quello previsto — il porto si piazza in cima a una collina e
viene rifiutato sulla battigia, che è l'unica fascia dove avrebbe senso. Il
tooltip intanto promette *«concentrates industry and trade on the coast»*, cioè
annuncia un vincolo che il codice non ha, e a `tick.ts` basta che un porto
esista in un punto qualsiasi della mappa perché il commercio esterno si sblocchi.

Non è un difetto isolato: è la stessa asimmetria che la 4.2 ha già risolto per i
lotti. Lì «il terreno non è già piano e asciutto» ha smesso di essere un motivo
di rifiuto, perché la banchina costruisce il piano che manca; i catalizzatori
sono rimasti indietro sul singolo bit `column.buildable`, e continuano a
rifiutare proprio le colonne che il mondo saprebbe già preparare.

**Metà è già arrivata, e da un'altra strada.** Il bit se n'è andato prima del
vincolo di ruolo, perché produceva un rifiuto che nessuno riusciva a leggere:
una mesa piana e larga respinta mentre il prato accanto accettava, per la sola
quota. `catalystFailure` ora chiede a `groundKindOf` e paga il terreno con
`BUILD_WEIGHT` — prato 1, terrapieno 1,4, banchina 1,8, roccia 2,2 — e rifiuta
solo ciò che nessuna opera raddrizza: pareti oltre `maxTerraceSlope` e acqua
oltre `maxQuayDepth`. La battigia è quindi ammessa **a tutti** i ruoli, non ai
soli ruoli costieri: è il prezzo, non il permesso, a distinguerla. Il vincolo di
ruolo resta da fare, e ora è l'unica cosa che manca perché il porto stia sulla
costa. La tabella `BUILDABLE_BIOMES` non è stata toccata: la crescita automatica
sceglie ancora i suoi siti con il bit, quindi il peso non ha spostato l'equilibrio
della città che cresce da sola.

- [x] Dare a `CatalystDefinition` un vincolo di sito esplicito e valutarlo in
  `catalystFailure`, al posto dell'unico bit di edificabilità valido per tutti.
- [x] Ammettere la battigia ai ruoli costieri riusando le opere della 4.2, senza
  rendere `beach` edificabile per la crescita automatica: è il vincolo del ruolo
  a cambiare, non la tabella dei biomi.
- [x] Introdurre il vincolo opposto — superficie ampia e piana — valutando la
  pendenza su un intorno dell'impronta e non sulla singola colonna.
- [x] Aggiungere l'aeroporto come secondo ruolo di `connections`, con un effetto
  distinto da quello del porto: collegamento che non chiede la costa, influenza
  su commerciale e civico, penalità sul residenziale più pesante di quella della
  fabbrica.
- [x] Distinguere il commercio esterno per collegamento, invece dell'attuale
  `connected` binario che qualunque porto accende da qualunque punto.
- [x] Portare i nuovi motivi di rifiuto sul cursore con lo stesso trattamento
  degli altri, così che il vincolo si legga prima del click e non dopo.

**Vincolo:** la simulazione non impara la geografia. Il vincolo di sito vive fra
`src/game/` e `src/world/`, come già il lotto e l'isolato; `src/sim/` continua a
ragionare per cella e a non sapere dove sia la costa (invariante 7). Un ruolo
nuovo tocca `balance.ts`, quindi le tabelle di misura verificate a mano vanno
rimisurate e non aggiornate a occhio.

**Gate:** ogni catalizzatore è rifiutato dove il suo ruolo non ha senso e
accettato dove ce l'ha, con il motivo visibile prima del click; porto e
aeroporto restano due scelte con conseguenze diverse e non due prezzi per lo
stesso sblocco.

**Come è stato risolto.** Il vincolo si è diviso in due metà che non si toccano:
la definizione del catalizzatore porta un'**etichetta** — `'coastal'`, `'open'`,
`'any'` — e non sa cosa significhi, mentre a tradurla sul terreno è il nuovo
dominio `src/world/sites/`. È la stessa mossa della 4.1, dove il candidato ha
smesso di essere un indirizzo ed è diventato un isolato: `src/sim/` dichiara
cosa un ruolo pretende e continua a non sapere dove sia la costa (invariante 7).
Il campo su `CatalystDefinition` è una stringa e non un numero, quindi non tocca
il contratto «i coefficienti stanno solo in `balance.ts`».

`sites/` è un dominio a sé e non un'appendice di `grading/`, perché le due
rispondono a domande diverse: quella lì è «cosa serve costruire perché regga», e
la sua risposta è un prezzo; questa è «questo ruolo ci sta», e la sua risposta è
un no che nessuna opera compra. Tenerle separate è ciò che permette al porto di
pretendere la costa **senza** che la battigia torni vietata agli altri sette
ruoli — che è esattamente l'errore che la 4.2 aveva appena finito di correggere.
`BUILDABLE_BIOMES` non è stata toccata: la crescita automatica sceglie ancora i
suoi siti con il bit, e l'equilibrio della città che cresce da sola non si è
mosso.

**Una ricerca sola, due raggi.** `Builder.isCoastal` esisteva già, privata, e
faceva la stessa marcia sui quattro assi che serviva al porto: è stata estratta
in `seesWater` e ora ha due chiamanti con due numeri diversi. Non sono lo stesso
numero travestito — `BUILDER.coastalRadius: 14` decide se un mercato *sembra* un
mercato sul porto, ed è generoso per costruzione; `SITE.coastalRadius: 6` decide
se un piazzamento è ammesso, e chiede il fronte mare. Il vincolo opposto riusa
`planGrade` sul quadrato di lato `SITE.openSpan`, con un tetto proprio di quattro
voxel: `GRADING.maxWorksStep` è tarato sulla banchina che scende sul fondale e
qui direbbe di sì a un terreno che nessuno chiamerebbe piano.

**Il commercio ha smesso di essere un interruttore.** `connected` diceva solo
«esiste un porto da qualche parte», quindi il secondo collegamento non avrebbe
aggiunto niente e l'aeroporto sarebbe stato un porto più caro. Ora ogni
collegamento porta la propria capacità e le capacità si sommano: il porto muove
volume, l'aeroporto muove valore — importa cibo in fretta perché non aspetta una
stiva piena, non spedisce materiali sfusi, e su quel poco spunta un prezzo
migliore. Resta uno scambio aggregato O(1) per tick. Nel passaggio è emerso un
difetto vero: l'HUD ricalcolava il flag con `catalyst.kind === 'port'` e ignorava
i catalizzatori senza `kind` — i salvataggi dell'MVP e le fixture di scena — così
che diceva «nessun porto» mentre il commercio girava. Ora tick e HUD chiedono
alla stessa `tradeLinksOf`.

**Costo e misure.** `catalystFailure` gira a ogni `pointermove`, e con
l'aeroporto in mano passa da una a `openSpan²` letture di colonna: sono letture
di `Int16Array` già in memoria, fuori dal ciclo di frame della simulazione, e
solo mentre quello strumento è selezionato. `tradeLinksOf` è lineare nel numero
di catalizzatori, che sono unità. Un ruolo nuovo tocca `balance.ts`: **le tabelle
di misura in `README.md` e `src/sim/README.md` vanno rimisurate a mano**, e non
sono state aggiornate qui.

**Resta aperto.** Il vincolo di sito riguarda solo ciò che il giocatore piazza:
la crescita automatica non ha ruoli e quindi non ha luoghi ammessi. L'aeroporto
non ha un `DistrictId` proprio — entra nei ruoli logistici e si distingue per
influenza, effetti e commercio, non per un quartiere che porta il suo nome.

### Fase 2.2 — Le decisioni lasciano un segno

Obiettivo: rendere visibile nella struttura della città quale alternativa il
giocatore ha scelto.

**Stato implementazione:** completata. Il gate resta da validare con due partite
a confronto sullo stesso seed.

**Perché la fase 2 si riapre di nuovo.** Alle policy la fase 2 aveva chiesto «una
conseguenza spaziale osservabile»; alle decisioni no, e infatti non ce l'avevano.
`resolveDecision` spostava cibo, materiali, fondi e soddisfazione e finiva lì:
scegliere «Community gardens» invece di «Ration supplies» era indistinguibile a
schermo, contro il principio guida di questa roadmap.

- [x] Dare a ogni alternativa un **mandato**: un vettore spaziale della stessa
  forma di `spatialPolicy`, che entra in `urbanProfileAt` e piega forma e
  tipologia della crescita successiva.
- [x] Rendere i mandati permanenti ma **esclusivi per famiglia** — un solo slot
  per approvvigionamento, spazio pubblico e investimento — invece di farli
  scadere a tick.
- [x] Concedere a tre alternative un'**opera** costruita subito: un catalizzatore
  a forza e raggio ridotti, posato sul miglior sito che la città offre.
- [x] Aggiungere quattro tipologie che **solo** un mandato concede, così due
  partite divergono nel volume e non solo nei numeri dell'HUD.
- [x] Dire nel modale quale segno lascia ogni alternativa, come già fanno le
  policy.

**Perché lo slot e non la scadenza.** `urbanProfileAt` è una funzione spaziale e
il `Builder` la chiama a ogni piazzamento e a ogni promozione. Un mandato che
scade le farebbe leggere `tickCount`, e lo stesso stato produrrebbe edifici
diversi a seconda di quando lo si guarda — il contrario del contratto di
determinismo. Con lo slot il tetto è strutturale: tre vettori attivi al massimo,
e la città porta l'ultima scelta di ogni famiglia invece della somma di tutte. Il
modello è il *Book of Laws* di Frostpunk, dove i rami sono permanenti e
mutuamente esclusivi.

**Perché la tipologia e non solo il vettore.** Le fasce sono
`naturalBands + Math.floor(form.density * 2)` e poi vengono clampate ai limiti
del livello: un vettore che sposta la densità di 0,3 vale mezza fascia, che
`Math.floor` mangia. Una riga di catalogo concessa da un mandato cambia invece
podio, corte, coronamento, impronta minima e tutti i colori del profilo, e si
vede a colpo d'occhio.

**Costo e misure.** `urbanProfileAt` guadagna un ciclo su al massimo tre mandati,
sullo stesso percorso dei catalizzatori che già scorre. `tick` non è toccato: i
mandati non entrano in `resolveWeights` e risolvere una decisione non ricostruisce
il campo di desiderabilità. **Le tabelle di misura in `README.md` e
`src/sim/README.md` vanno rimisurate a mano** e non sono state aggiornate qui.

**Resta aperto.** Il mandato agisce solo su ciò che nasce o viene promosso dopo:
il tessuto già costruito non viene ridisegnato, quindi su una città matura la
differenza si accumula invece di comparire subito. L'opera concessa sceglie il
sito da sé — il giocatore non la posa — e se nessun candidato passa la convalida
la decisione resta valida senza opera.

**Gate:** due partite sullo stesso seed che divergono solo nelle decisioni
producono skyline riconoscibilmente diversi.

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
- **Il tetto verticale è un sistema, non un numero.** `BUILDER.maxLevel` è il
  più visibile dei tre limiti che fermano la città a mezz'aria, ed è l'unico che
  da solo non sposta niente: sotto ci sono una soglia di upgrade che ha finito
  lo spazio nel campo e un tetto di chunk sporchi tarato sulla torre di oggi.
  Alzare il primo senza gli altri due fa sparire in silenzio proprio gli edifici
  alti. La diagnosi completa sta in 4.6.
- **Ciò che si costruisce si deve poter guardare.** Ogni sotto-fase che
  sovrappone volumi produce struttura che dall'esterno non si vede: la vista che
  la apre è 4.11, e viene prima di quello che deve verificare.

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

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono le opere, il vincolo di riempimento e la
continuità delle rampe, non la leggibilità.

- [x] Risolvere le pendenze della rete con rampe, scalinate e tratti incassati,
  al posto dell'attuale scarto secco per `tooSteep`.
- [x] Introdurre muri di contenimento e terrapieni dove la quota cambia, così che
  il salto sia costruito e non un gradino di terreno nudo.
- [x] Portare piazze e piattaforme sopraelevate dove il dislivello le giustifica.
- [x] Trattare la costa come fronte edificato: moli, approdi e banchine al posto
  dell'attuale bordo d'acqua.
- [x] Rivedere `maxTerrainStep` e la blacklist dei siti: con le rampe una
  pendenza smette di essere un rifiuto definitivo.

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

### Fase 4.3 — Grammatica verticale degli edifici

Obiettivo: ampliare il vocabolario di `generate.ts` senza introdurre modelli
disegnati a mano.

Indipendente da 4.1 e 4.2: è lavoro sullo stamp, verificabile in Node senza
mondo e senza terreno. Può procedere in parallelo.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono determinismo, cime distinguibili, terrazze e
soglie luminose, non la leggibilità a distanza di gioco.

- [x] Aggiungere basamenti abitati, corpi sovrapposti e arretramenti come
  trasformazioni della regola di fascia, non come casi speciali.
- [x] Distinguere torri e coronamenti per uso e livello, oltre agli attuali tre
  interruttori di tipologia.
- [x] Introdurre giardini pensili e terrazze praticabili sulle rientranze che la
  grammatica già produce.
- [x] Dare accenti luminosi specifici per classe e livello, dentro gli slot di
  palette e i tipi di superficie esistenti.
- [x] Estendere il catalogo delle tipologie con le forme che i nuovi interruttori
  rendono possibili, restando righe di tabella: la regola di scelta non si tocca.

**Gate:** a parità di seed le silhouette restano deterministiche e distinguibili
per uso; nessuno slot di palette e nessun tipo di superficie in più.

**Come è stato risolto.** Le trasformazioni sono diventate una **tabella**,
`BAND_OP`, e quali voci un edificio prova — e in che ordine — arriva dal profilo,
non dal codice. È la mossa che ha tolto di mezzo l'ultimo caso speciale rimasto
nella grammatica: il basamento non è più un ramo del ciclo delle fasce ma `keep`
ripetuto, e l'arretramento netto sopra di esso è `shrink`, cioè due voci della
stessa tabella da cui pesca tutto il resto. Il repertorio vive in `ClassProfile`
e non in `TypologyShape`, e non è un dettaglio: `typologyProfile` fonde già
profilo dell'uso e profilo della tipologia, quindi una riga di catalogo può
ridefinire il repertorio **senza una riga di plumbing in più**.

Le due operazioni nuove sono `setback` — due voxel su un lato, cioè un cubo di
terreno, la più piccola rientranza in cui ci si sta — e `stack`, che rientra di
due per lato e ricentra. Il corpo sovrapposto non ha un contatore che lo limiti a
una volta: `stack` si rifiuta di produrre un risultato sotto `MIN_FOOTPRINT`,
quindi su una torre da otto scatta una volta sola e poi la geometria lo esaurisce
da sé. Nessuna delle due può sfuggire a `supported`, perché entrambe restano
dentro il rettangolo precedente.

**Il coronamento era un booleano e dava due sole cime a tutta la città.** Ora è
`CROWN_KIND` con cinque voci — `taper`, `flat`, `stepped`, `ridge`, `lantern` —
e `paint` ha smesso di riconoscere il coronamento per posizione: `crownStart` ha
sostituito `rects.length - 2`, che assumeva esattamente una fascia e impediva un
cappello a gradoni. La distinzione **per uso** non è un ramo nel generatore: sono
i quattro ripieghi del catalogo, uno per uso, a portarsi la propria cima. Quella
**per livello** è `minLevel` sulle righe nuove, criterio che `accepts` già
valutava — e che funziona anche senza profilo locale, perché `demandsPlace` non
lo elenca.

**La terrazza non è una fascia in più.** È la sommità di una fascia dove quella
sopra non arriva: un anello che la grammatica produce da sempre e che finora
restava verniciato come una parete. Chiedere `roofTech` per quell'anello gli fa
arrivare il parapetto da `emitRoofTech`, che già emette dove un tetto confina con
l'aria — la terrazza si arreda **senza toccare il mesher** e senza un tipo di
superficie nuovo. Vale sul solo corpo: il coronamento è già tetto, e trattarne la
sommità come una rientranza avrebbe pavimentato la copertura di ogni edificio a
tetto piatto, che non è una terrazza ma il tetto di prima ridipinto.

**Due difetti che solo i test hanno rivelato.** Il primo era preesistente e la
4.3 lo ha reso visibile: una catena di rientranze portava la cima a **un voxel**,
e sopra un voxel tutti i coronamenti si assomigliano. Ora `GRAMMAR.minBandSide`
è un pavimento nello stesso filtro che già scartava le candidate fuori riquadro —
il coronamento può assottigliarsi oltre, perché è il suo mestiere, il corpo no.
Il secondo era il commento che spiega il bagliore nello shader: `VoxelMaterial`
compone il fragment shader in un template literal, e un backtick dentro un
commento GLSL rompe il bundle e non il rendering.

**Costo, misurato.** A/B vero sullo stesso script — sedici edifici veri di
livello 4, quattro usi, impacchettati in un chunk — con l'albero di lavoro e con
lo stesso albero senza le modifiche di questa fase:

| | quad base | quad di dettaglio | totale |
| --- | --- | --- | --- |
| prima della 4.3 | 2 156 | **6 810** | 8 966 |
| con la 4.3 | 1 805 | **5 015** | 6 820 |

I quad di dettaglio **calano del 26%**, contro il rischio opposto che la fase
portava: il margine sotto `MAX_DETAIL_QUADS_PER_CHUNK` cresce invece di
consumarsi. Non è fortuna in due parti. La soglia luminosa toglie l'accento agli
edifici bassi, che sono la maggioranza, e ogni faccia spenta è una corsa di
`emitLuminous` in meno; e la terrazza è quasi neutra per costruzione, perché le
celle che passano a `roofTech` sono le stesse che prima ricevevano una mensola da
`emitHabitat` — una corsa al posto di una corsa. `generateBuilding` resta fuori
dal ciclo di frame: gira al piazzamento e all'upgrade. **Le tabelle di misura in
`README.md` e `src/sim/README.md` vanno rimisurate a mano**, e non sono state
aggiornate qui.

**Resta aperto.** Tutte le silhouette sono cambiate, ed è previsto: aggiungere
una voce al repertorio cambia il passo del PRNG per ogni edificio. Non c'è
persistenza da invalidare — la fase 5 non è iniziata — e il `Builder` rigenera lo
stamp da cancellare dal *record*, quindi entro una sessione la coerenza regge. La
grammatica resta **per edificio singolo**: un arretramento non sa che l'edificio
accanto ne ha uno alla stessa quota, e allineare le terrazze dentro un isolato è
esattamente il lavoro della 4.4. Gli accenti luminosi non sanno ancora niente
dell'occupazione: si accendono per livello e non per quanta gente ci abita, che è
la 4.8.

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

Obiettivo: una silhouette d'insieme leggibile, non edifici alti sparsi — e la
regola che decide **fin dove una colonna può salire**, che oggi non esiste.

Dipende da 4.3 e 4.4 per le forme locali: la calibrazione globale ha senso solo
quando c'è qualcosa da calibrare. È però anche il punto in cui si rompono i tre
tetti che fermano la città a mezz'aria, ed è la ragione per cui questa
sotto-fase pesa più di quanto il suo elenco lasciasse credere.

**I tre tetti, in ordine di quanto ingannano.**

1. **`BUILDER.maxLevel: 6`**, con `LEVEL_CAPS` fermo a otto fasce: una torre
   arriva a una sessantina di voxel. È l'unico che si vede e l'unico che si alza
   cambiando un numero — ed è per questo che è una trappola.
2. **`upgradeThreshold` finisce a 198 su un campo che satura a 255.**
   `DesirabilityField` è un `Uint8Array` clampato in `0..255`; con
   `localUpgrade.maxDiscount` a 38 lo spazio residuo vale sì e no un livello.
   Non è una taratura stretta: è la fine dell'alfabeto. Oltre quel punto la
   desiderabilità non *distingue* più due colonne del centro, e alzare
   `maxLevel` non darebbe uno skyline ma l'altopiano che il commento di
   `START_LEVEL_CDF` dichiara di voler evitare — tutto il nucleo saturo che sale
   insieme, che a colpo d'occhio non si legge come una città.
3. **`maxDirtyChunksPerBuilding: 24`** è tarato sulla torre di livello 6, e il
   suo stesso commento racconta cosa è già successo una volta quando l'impronta
   è raddoppiata: sono spariti esattamente gli edifici alti, «senza che niente
   lo dicesse», perché sforare non è un errore e viene scartato in silenzio. Un
   edificio tre volte più alto attraversa tre volte i piani di chunk.

Sotto ce ne sono altri tre che non fermano la crescita ma la fanno leggere male,
e vanno rimisurati insieme: il terreno ha `TERRAIN.maxHeight: 80` con
`seaLevel: 16`, quindi il rilievo è tarato per stare sotto la città e non
accanto; `SunShadow.fit` adatta il frustum al raggio dell'AABB **visibile**,
perciò salire allarga il volume illuminato e abbassa la densità di texel
dell'ombra a parità di `SHADOW_SIZE`; la nebbia di quota ha `heightBase` fra 6 e
12 e `heightFalloff` intorno a 0,02, cioè è tarata su una città alta trenta
voxel e a quota cento ha già finito di decadere.

**La regola.** L'altezza smette di essere una funzione della sola desiderabilità
e diventa una **quota ammessa per colonna**, derivata da distanza dai poli, dal
mare e dal bordo dell'edificato. La desiderabilità continua a decidere *se* un
edificio promuove; la gerarchia decide *fin dove*. Sono due domande diverse, e
per questo due dati diversi — è la stessa separazione che la 4.2 ha fatto fra
«cosa regge il terreno» e la 2.1 fra «dove ha senso questo ruolo», ed è ciò che
permette di alzare il tetto senza spostare un coefficiente di `balance.ts`.

- [ ] Derivare una stratificazione — costa e periferia basse e porose, fasce
  intermedie terrazzate, centro denso — da distanza dai poli e dal mare.
- [ ] Esporre quella stratificazione come **quota ammessa per colonna**, e farla
  entrare in `Builder.upgrade` accanto alla soglia di desiderabilità, non al
  posto suo.
- [ ] Alzare `maxLevel` e `LEVEL_CAPS` insieme al tetto di chunk sporchi, con un
  test che verifichi che nessun edificio di livello massimo venga scartato in
  silenzio: è il difetto che si ripresenta a ogni cambio di scala.
- [ ] Far emergere lo skyline come eccezione governata, non come somma di upgrade
  indipendenti.
- [ ] Preservare una corona naturale attorno all'edificato e transizioni leggibili
  fra le fasce.
- [ ] Rimisurare ombra, nebbia di quota e inquadratura iniziale sulla città più
  alta: la camera parte con `targetHeight` a 12 voxel e `frameRegion` riceve uno
  `spanZ`, quindi l'inquadratura d'apertura non è indipendente dall'altezza.
- [ ] Verificare che la gerarchia resti visibile su isole di forma diversa, non
  solo sul seed di riferimento.

**Vincolo:** la simulazione non impara la verticale (invariante 7). La quota
ammessa è un dato del mondo — sta dove stanno strade, opere e vincoli di sito —
e `src/sim/` continua a non avere una coordinata z. Un indice `z` nel campo di
desiderabilità moltiplicherebbe per il numero di livelli tutta la memoria densa:
è l'alternativa da non prendere, e la 4.9 lo dice già per il suo motivo.

**Gate:** da inquadratura d'insieme si riconoscono almeno tre fasce di altezza e
il centro, senza overlay; alzare il livello massimo non fa sparire nessun
edificio e non produce un altopiano.

**Riferimento.** La progressione dei city builder classici lega l'altezza a uno
stato globale della città — densità alta che pretende popolazione regionale,
valore del suolo e trasporto, e la regola «non si costruisce in alto finché si
può costruire in larghezza» — ed è documentata per
[SimCity 4](https://simcity.fandom.com/wiki/Density). Qui la scarsità di suolo
non diventa una meccanica: è la controprova che il tetto verticale va derivato
da uno stato d'insieme, e non dalla singola cella.

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

### Fase 4.8 — Dettaglio d'artista e vita notturna

Obiettivo: portare il singolo edificio alla densità della voxel art curata —
sporgenze, insegne, verde, finestre accese — restando dentro il materiale
condiviso e il tetto di quad della microgeometria.

Dipende da 4.3 per gli agganci: un dettaglio si appende a una rientranza, a un
coronamento o a un fronte, e finché la grammatica non li produce non c'è dove
metterlo. La parte di luce è indipendente, vive in `src/engine/` e può procedere
in parallelo.

**Perché non è già coperta da 4.3 e 4.7.** La microgeometria in
`src/engine/mesher/microGeometry.ts` e i sette linguaggi di superficie oltre a
`plain` in `VoxelMaterial.ts` fanno già la *facciata*: pannelli, portali, fasce
luminose, sfiati, circuiti di tetto. Quello che manca è l'**oggetto** — la tenda,
il condizionatore, l'insegna a bandiera, la pianta sul balcone — e la luce che
*esce* dall'edificio: oggi `emission` illumina il proprio pixel e alimenta il
bloom, non schiarisce il muro di fronte. Nebbia, acqua e prospettiva aerea
restano invece competenza della 4.7.

- [ ] Costruire una libreria di prop sub-voxel — tende, insegne, condizionatori,
  antenne, cavi, cassoni, fioriere — emessi dalla stessa `emitRuns` degli altri
  dettagli, scelti per uso, livello e faccia.
- [ ] Appenderli alle giunzioni che la grammatica già produce — fronte strada,
  arretramenti, coronamenti, angoli d'isolato — invece che a posizioni sparse
  sulla facciata: è l'aggancio a rendere l'oggetto credibile, non la sua forma.
- [ ] Portare il verde sull'edificio: fioriere, rampicanti e chiome che riusano
  gli slot `grass*` esistenti e la stessa priorità di troncamento.
- [ ] Far uscire la luce: un contributo notturno che schiarisce le superfici
  vicine a una faccia emissiva, ricavato da quello che il mesher già produce,
  senza luci dinamiche, senza una pass in più e senza ricompilare materiali.
- [ ] Legare l'accensione allo stato della simulazione: finestre accese in
  proporzione all'occupazione, insegne dove il commercio è attivo, buio dove
  l'edificio è vuoto — la città di notte come lettura dell'economia.
- [ ] Aggiungere un ciclo giorno/notte come traiettoria del sole più scambio di
  uniform, con l'ora esposta nell'harness per poter iterare sul look.
- [ ] Dare all'harness una scena `diorama`: un edificio solo, girevole e
  inquadrato da vicino, per giudicare il dettaglio senza aspettare che la città
  cresca. Stessa ossatura del campionario della 4.10 — una scena a budget che
  compone soggetti scelti — quindi la seconda costa poco se la prima esiste già.

**Vincolo:** il tetto di quad della microgeometria non si alza per fare posto ai
prop. Un prop entra togliendo densità altrove o fondendo meglio le corse, e la
priorità di troncamento resta quella che c'è — a cadere sono le ultime voci,
mai una classe a caso. Nessun tipo di superficie e nessuno slot di palette in
più (invarianti 4 e 5): un'insegna è un prisma con una palette esistente e il
linguaggio `luminous`, non un materiale nuovo.

**Gate:** un edificio inquadrato da vicino regge lo sguardo senza mostrare
facciate piatte ripetute; di notte la città si legge per luci accese e non per
sola silhouette; il costo per chunk edificato resta dentro il tetto misurato
oggi e le draw call non crescono.

### Fase 4.9 — Quote abitate e città sospesa

Obiettivo: smettere di costruire *sul* terreno e cominciare a costruire *sopra
la città* — piattaforme abitate, edifici che poggiano su altri edifici, mobilità
in quota e vuoto sotto, nella direzione di Cloudpunk.

È il punto d'arrivo della fase, non un'aggiunta a margine: dipende da 4.4 per gli
isolati terrazzati e da 4.5 per le campate, e va per ultima perché è **l'unica
sotto-fase che tocca l'assunzione di colonna**. Il look al neon che
accompagna queste immagini è 4.7 e 4.8; qui c'è solo la struttura che regge.

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

- [ ] Introdurre la piattaforma come suolo artificiale: una struttura con appoggi
  propri che porta una superficie edificabile a quota, trattata dal registry come
  volume e non come edificio.
- [ ] Esporre più di una quota edificabile per colonna senza duplicare la
  `TerrainMap`: il livello si risolve dove si risolve il lotto, non nel campo.
- [ ] Far crescere edifici sulle piattaforme e sui tetti condivisi dei cluster,
  riusando `topOf` e l'intervallo di quota che il registry già confronta.
- [ ] Prendere la quota ammessa della 4.6 come tetto **anche** in quota: una
  piattaforma non è il modo di aggirare la gerarchia, è il modo in cui la
  gerarchia sale. Senza questo vincolo il secondo livello diventa la scorciatoia
  che rende inutile il primo.
- [ ] Aggiungere mobilità in quota come struttura di scena — monorotaia,
  sopraelevata, ascensori d'isolato — appoggiata alla rete di 4.5 e ai suoi
  appoggi reali.
- [ ] Dare un fondo al vuoto: nuvole, foschia e livelli inferiori intravisti, così
  che una quota alta si legga come alta anche quando il suolo non si vede più.
- [ ] Far dipendere il costo per colonna dai livelli *presenti* e non da un tetto
  teorico: una colonna a un livello solo deve costare quanto costa oggi.

**Vincolo:** l'isola resta il suolo di partenza e non viene sostituita — la
megacittà le cresce sopra, e una partita che non arriva mai in quota deve restare
identica a quella di oggi. Nessuna struttura sospesa senza appoggi reali: vale
anche qui la regola di 4.5, una campata orfana è un bug e non uno stile.

**Gate:** esiste almeno una zona della città in cui si abita sopra la città e ci
si muove fra i livelli; determinismo e budget reggono con due livelli sovrapposti
come con uno, e il suolo originale resta ricostruibile dal seed.

### Fase 4.10 — Campionario dei voxel

Obiettivo: poter guardare tutto il vocabolario visuale in una sola inquadratura
— ogni slot di palette per ogni linguaggio di superficie, la stratigrafia di ogni
bioma, e il confronto di scala fra cella di terreno, albero ed edificio.

Nessuna dipendenza, e insieme alla 4.11 conviene farla **per prima** fra le
sottofasi rimaste: sono i due strumenti con cui si giudicano tutte le altre —
questo guarda il vocabolario, quella guarda la città costruita. Serve inoltre
già adesso alla scala a celle del terreno. Vive in `src/world/scenes/`, quindi
non tocca né la crescita né la simulazione.

**Perché serve.** Oggi le uniche scene sono `city`, `noise` e `slab`, nate per
misurare il mesher: l'unico modo di vedere uno slot di palette o un linguaggio di
superficie è trovarlo per caso dentro un edificio generato, e l'unico modo di
giudicare la scala relativa di una chioma è aspettare che l'isola ne produca una
accanto a un edificio. Una scelta di look si fa affiancando le cose, e non c'è un
posto dove affiancarle.

- [ ] Aggiungere una `SceneKind` `swatch` su `?scene=swatch`, generata a passi con
  budget come le altre.
- [ ] Disporre la griglia 32 × 8 — uno slot di palette per colonna, un
  `SURFACE_KIND` per riga — con corse abbastanza lunghe e alte perché la
  microgeometria emetta davvero: un `habitat` senza qualche voxel di facciata non
  mostra niente.
- [ ] Affiancare una colonna tagliata per bioma con la stratigrafia vera, così che
  l'invariante «ogni strato è alto un numero intero di celle» si veda di taglio
  invece di doverla dedurre dalle soglie.
- [ ] Mettere nella stessa inquadratura la fascia di scala: le forme d'albero
  accanto a un edificio di riferimento e a un pezzo di terreno.
- [ ] Dare un nome a ciò che si guarda: riga e colonna sotto il cursore
  nell'overlay, perché in-world non ci sono etichette e la sola convenzione
  d'ordine si dimentica.
- [ ] Coprirla con un test in ambiente `node` che verifichi la presenza di tutte
  le combinazioni: è il modo per accorgersi che uno slot nuovo non è mai stato
  aggiunto al campionario.

**Vincolo:** è una scena come le altre, non un percorso di rendering dedicato.
Nessuna geometria speciale, nessun materiale, nessuno slot di palette e nessun
tipo di superficie in più: il campionario mostra quello che esiste, e se una
combinazione si vede male il difetto sta altrove.

**Gate:** da `?scene=swatch` si leggono in una sola inquadratura tutte le
combinazioni palette × superficie, gli strati di ogni bioma e il rapporto di
scala fra cella, albero ed edificio; passare da un tema all'altro rilegge il
campionario senza rigenerare la scena, e un tema con uno slot morto si riconosce
a colpo d'occhio.

### Fase 4.11 — Vedere dentro la città

Obiettivo: poter guardare **come un pezzo di città è fatto dentro** — quote,
incastri, cosa poggia su cosa — invece di poterne guardare solo la buccia.

Nessuna dipendenza. Vive in `src/engine/` e nell'harness, non tocca né la
crescita né la simulazione, e va **prima** delle sotto-fasi che sovrappongono
volumi: 4.4, 4.5 e 4.9 costruiscono esattamente ciò che oggi non si potrebbe
verificare a occhio.

**Perché adesso.** La città è già abbastanza densa da essere opaca. Da
inquadratura di gioco un isolato interno è un volume dietro altri volumi, e
l'unico modo di controllare che due edifici si incastrino come previsto è
aspettare che ne cresca uno in periferia, dove non c'è niente davanti. Gli
strumenti che esistono guardano altro — `BiomeView` ricolora le colonne,
`InfluenceOverlay` disegna cerchi sopra la scena, `SimOverlay` mostra il campo in
2D — e nessuno risponde alla domanda «cosa c'è dietro questa facciata».

**Il difetto strutturale, che decide l'ordine dei lavori.** Il greedy meshing
emette solo le facce a contatto con l'aria: **dentro un edificio non c'è
geometria**, e il materiale unico è `FrontSide` con `transparent: false`. Ne
segue che un piano di taglio, da solo, non apre un edificio — lo attraversa.
Dove le facce vicine spariscono si vede il *retro* di quelle lontane, che è
back-face e viene scartato: cioè si vede il cielo. È il problema che i thread di
three.js chiamano *closing up clipped planes*, e va risolto o aggirato, mai
ignorato.

Da lì le due famiglie, e il loro ordine:

- **Velare**, che non toglie niente. Un retino ordinato su `gl_FragCoord` con
  `discard` rende poroso l'occlusore senza aprirlo: si legge la sagoma davanti
  *e* il tessuto dietro. Costa due uniform sul materiale che c'è già, non chiede
  ordinamento perché non è alpha blending, e `transparent` resta `false`.
- **Tagliare**, che va tappato. La faccia di sezione si dipinge dalle back-face
  della stessa geometria — gli stamp sono volumi pieni, quindi il guscio è
  chiuso e le back-face ci sono — leggendo `gl_FrontFacing` nel fragment. Chiede
  però `DoubleSide`, che in three.js entra nella chiave di programma e non è
  solo stato del renderer: entrare in sezione compila una variante, **una
  volta**. Accettabile per uno strumento su hotkey, e l'invariante che conta —
  cambiare tema non ricompila niente — resta intatto.

Il velo viene per primo perché copre tre modi su quattro e non ha capping da
risolvere. Un effetto collaterale gradito: dove la tipologia ha una corte, la
sezione mostra un vuoto vero e non un pieno tagliato.

- [ ] Aggiungere al materiale unico un **velo a retino** governato da uniform:
  un predicato di quota, uno di rettangolo, la forza del retino, e `discard` sul
  pattern ordinato. Nessuna geometria nuova, nessun materiale nuovo, nessuno
  slot di palette e nessun tipo di superficie in più (invarianti 4 e 5).
- [ ] **Raggi X**: velare ciò che sta fra la camera e la colonna sotto il
  cursore. In ortografica «davanti» è una disuguaglianza sulla proiezione lungo
  l'asse di vista, non un raycast: si risolve nel fragment senza lavoro sulla
  CPU e senza toccare il ciclo di frame.
- [ ] **Fetta a quota**: uno slider e un parametro URL nascondono o velano tutto
  sopra una z, per guardare la città al piano *n* come si fa in Going Medieval e
  in Timberborn. È il modo che risponde a «cosa c'è al livello 3».
- [ ] **Sezione verticale**: un piano che taglia lungo un asse della **griglia
  stradale** e non lungo un asse arbitrario, così il taglio cade su una
  carreggiata e mostra il fronte degli isolati invece di affettare i volumi a
  caso. È l'unico modo che ha bisogno del capping da `gl_FrontFacing`.
- [ ] **Isolamento dell'isolato**: velare tutto ciò che sta fuori dal rettangolo
  di `streets.blockRect` sotto il cursore. Stesso velo, predicato diverso —
  nessun taglio, nessun capping, e l'isolato resta nel suo contesto invece di
  finire su fondo neutro, che è il punto: la domanda è come si connette, non
  com'è fatto da solo.
- [ ] Tenere la **decisione** fuori dal materiale: quale modo è attivo, a che
  quota, su quale isolato è una funzione pura e va testata in ambiente `node`,
  come già `lighting.ts`. Nel materiale entrano solo i numeri che ne escono.
- [ ] Dire cosa si sta guardando — modo attivo, quota della fetta, id
  dell'isolato — nell'overlay: in-world non ci sono etichette, ed è la stessa
  richiesta che fa il campionario della 4.10.
- [ ] Estendere `VoxelMaterial.test.ts` ai nuovi uniform: è il test che si
  accorge di un uniform dichiarato nel GLSL e mai scritto, o del contrario.

**Vincolo:** è uno strumento dell'harness, non una modalità di gioco. Sta
accanto a `F3` e al tasto `B` con il suo parametro URL; se un giorno diventerà
un'azione del giocatore, a darle icona, stato e comportamento sui sette temi
sarà la fase 7. Il mesher non si tocca (invariante 6): una vista che chiedesse
di rimeshare per essere disegnata sarebbe la vista sbagliata.

**Gate:** su una città matura si legge come un isolato si incastra su più quote —
velato, a fette e in sezione — senza console, senza rigenerare la scena, e senza
che il frame esca dal budget mentre una vista è attiva.

**Riferimenti.**

- [Going Medieval — view between layers/floors](https://steamcommunity.com/app/1029780/discussions/0/4361250086034818336/)
  e la [guida al costruito verticale di Timberborn](https://timberborn.org/articles/vertical-building-stacking-guide):
  la fetta a quota vista dal lato di chi la usa, difetti compresi.
- [Isometric visibility problem](https://www.gamedev.net/forums/topic/664146-isometric-visibility-problem/)
  e [Reducing occlusions in oblique views](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8253736):
  la tassonomia completa — velare, ritagliare, mostrare silhouette, spostare la
  camera — e il motivo per cui velare è l'opzione che perde meno informazione.
- [Clipping planes on ShaderMaterial](https://discourse.threejs.org/t/clipping-planes-on-shadermaterial/10155)
  e [Closing up clipped planes using shaders](https://discourse.threejs.org/t/closing-up-clipped-planes-using-shaders/18030):
  perché un `ShaderMaterial` non eredita il clipping gratis, e come si tappa il
  taglio.
- [Camera Tool in Cities: Skylines II](https://steamcommunity.com/app/949230/discussions/0/3937895474112407245/):
  la strada opposta — entrare fisicamente negli edifici invece di renderli
  porosi. Non è la nostra, perché la camera qui è ortografica e vincolata, ma
  spiega cosa i giocatori cercano quando la città diventa opaca.

**Gate della fase 4:** con la UI nascosta, la città comunica crescita verticale,
connessioni fra livelli e struttura economica attraverso volumi e silhouette;
ponti, terrazze e percorsi in quota restano leggibili alle normali distanze di
gioco, e il singolo edificio regge anche l'inquadratura ravvicinata.

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

## Fase 7 — Linguaggio visivo dell'interfaccia

Obiettivo: portare l'HUD dal livello di wireframe funzionante a quello di
interfaccia di gioco. La struttura attuale è giusta — barra risorse in alto,
dock degli strumenti in basso, drawer a destra, tutto guidato da un modello puro
in `GameHudModel.ts` — ma la *pelle* è generica: rettangoli arrotondati color
crema, un'unica ombra, icone a tratto sottile tutte dello stesso peso e dello
stesso colore. Il risultato è che l'HUD sembra appoggiato sopra il gioco invece
di appartenergli.

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
sono SVG inline e `border-image`, non un UI kit; `GameHudModel.ts` resta puro e
testabile in `node`; il repaint dell'HUD resta fuori dal percorso caldo del
frame; `prefers-reduced-motion` continua a spegnere tutto il movimento.

### Fase 7.1 — Materiale dei pannelli e temi

- [ ] Sostituire `--hud-shadow` con una scala di elevazione a tre livelli (dock,
  drawer, modale) e aggiungere a `.hud-surface` bordo interno chiaro, gradiente
  verticale e ombra di contatto: un pannello deve leggersi come un oggetto
  appoggiato, non come un rettangolo trasparente.
- [ ] Introdurre una cornice 9-slice via `border-image` con sorgente SVG in
  `data:` URI, così i pannelli scalano senza deformare gli angoli e senza asset
  binari nel bundle.
- [ ] Far derivare i token di `hud.css` dal tema attivo: `applyTheme` scrive
  `--hud-*` su `document.documentElement` a partire dalla palette del tema, e
  l'HUD cambia con il mondo invece di restare crema sotto un cielo al neon.

**Gate:** cambiando tema, HUD e scena restano riconoscibilmente lo stesso gioco;
nessun pannello perde contrasto AA sui sette temi.

### Fase 7.2 — Iconografia

- [ ] Ridisegnare `hudIcons.ts` su due pesi (filled per le risorse, stroke per le
  azioni) con sagoma leggibile a 18px, non pittogrammi generici a tratto unico.
- [ ] Dare a ogni risorsa un'identità cromatica stabile — denaro oro, cibo verde,
  materiali argilla, residenti blu, soddisfazione corallo — riusata ovunque quella
  risorsa compaia: barra, costi dei bottoni, toast, cursor card.
- [ ] Per i catalizzatori usare miniature isometriche voxel al posto dei
  pittogrammi lineari: è il gancio più diretto fra toolbar e mondo, e riusa la
  palette già in `palette.json`.

**Gate:** a etichette nascoste, un giocatore riconosce le cinque risorse e i
sette catalizzatori dalla sola icona.

### Fase 7.3 — Indicatori

- [ ] Sostituire il `delta` testuale con un indicatore di tendenza: freccia
  direzionale, magnitudine e sparkline breve sulla finestra dei tick recenti.
  Niente `±0` a schermo quando non succede niente.
- [ ] Dove esiste un tetto (scorte di cibo contro consumo, banchi occupati),
  mostrarlo come anello o barra di riempimento invece che come numero nudo.
- [ ] Numeri tabulari e conteggio animato sulle variazioni; stato di crisi con
  pulsazione e colore, non solo con testo rosso.
- [ ] Su hover, popover con la scomposizione entrate/uscite della risorsa: la
  domanda "perché sto perdendo denaro" oggi non ha risposta nell'HUD.

**Gate:** dallo sguardo alla barra si capisce in che direzione sta andando la
città senza aprire nessun pannello.

### Fase 7.4 — Strumenti

- [ ] Separare `locked` da `disabled`: il bottone bloccato mostra il requisito
  mancante come riempimento progressivo (denaro accumulato sul costo, popolazione
  sulla soglia) invece di sbiadire. Bloccato deve leggersi come "manca poco".
- [ ] Tile icona-sopra-etichetta di dimensione uniforme, badge del tasto numerico
  1..9, badge di costo con l'icona della risorsa di 7.2.
- [ ] Stato selezionato forte (non solo inversione di colore): cornice, sollevamento
  e anteprima del raggio in-world coerente col colore dello strumento.
- [ ] I separatori di gruppo diventano guide etichettate continue, così crescita,
  connessioni e identità si leggono come tre corsie e non come otto bottoni.

**Gate:** un giocatore nuovo, guardando solo il dock, sa cosa può costruire ora,
cosa gli manca per il resto e quale strumento ha in mano.

### Fase 7.5 — Movimento e feedback

- [ ] Micro-interazioni di pressione, spesa (il costo vola dal bottone alla barra)
  e sblocco; stack di toast invece di uno solo che si sovrascrive.
- [ ] Feedback di piazzamento in-world — anello di selezione e impronta sul
  terreno — invece della sola cursor card.
- [ ] Tutto sotto `prefers-reduced-motion` e sotto il budget: le animazioni sono
  CSS/`transform`, mai lavoro per frame in JS.

**Gate:** ogni azione ha una conseguenza visibile entro 150 ms e nessuna
animazione compare nel profilo del frame.

### Riferimenti

- [Game UI Database — Anno 1800](https://www.gameuidatabase.com/gameData.php?id=1118) e
  [Cities: Skylines](https://www.gameuidatabase.com/gameData.php?id=526): cataloghi di schermate reali per barra risorse e build menu.
- [Interface In Game — Cities: Skylines](https://interfaceingame.com/games/cities-skylines/): la stessa UI vista in movimento.
- [80.lv — How Dorfromantik Expands Its Cozy World Through Minimalist Design](https://80.lv/articles/how-dorfromantik-expands-its-cozy-world-through-minimalist-design): silhouette leggibili e coesione visiva, il registro più vicino al nostro.
- [Unity — How Timberborn's complex runtime UI was built](https://unity.com/case-study/timberborn): come si tiene insieme un HUD di city builder che cresce.
- [Isometric City Builder Art: Modular Buildings, Layout & Lighting](https://sunstrikestudios.com/en/blog/isometric-city-builder-art/): l'UI condivide il linguaggio di forma del mondo.
- [9-Slice Scaling Explained](https://generalistprogrammer.com/tutorials/nine-slice-scaling-explained) e [MDN `border-image`](https://developer.mozilla.org/en-US/docs/Web/CSS/border-image): la tecnica di 7.1.
- [The Art of Designing Intuitive User Interfaces in Cozy Games](https://sdlccorp.com/post/the-art-of-designing-intuitive-user-interfaces-in-cozy-games/): iconografia al posto del testo.

## Prossimo milestone consigliato — Alpha 0.2

1. [x] Tutorial iniziale e feedback del raggio dei catalizzatori.
2. [x] Bilanciamento recuperabile di popolazione, cibo e produzione.
3. [x] Settori costieri unici che aggiungono terreno realmente edificabile.
4. [x] Costi continuativi e conseguenze visibili per le sei policy esistenti.
5. [x] Commerciale autonomo e primo edificio residenziale-commerciale a uso misto.
6. [x] Primo sistema di strade procedurali usato come scheletro della crescita (fase 4.1).
7. [ ] Salvataggio locale minimo del ciclo completo.
8. [ ] Playtest di 30 minuti con budget e criteri automatici registrati.
9. [ ] Passata visiva su indicatori e strumenti: fasi 7.1, 7.3 e 7.4 (il resto
   della fase 7 puo' seguire, ma barra risorse e dock vanno sistemati prima del playtest,
   altrimenti si misura la confusione della UI invece del bilanciamento).
10. [ ] Viste di ispezione dell'harness: fase 4.11, e con lei il campionario
   della 4.10. Non sono contenuto della milestone e non entrano nel gate: sono
   gli strumenti senza i quali tutto il resto della fase 4 si giudica a occhio
   nudo su una città che ormai è opaca.

Alpha 0.2 è completa quando una partita ha apertura, sviluppo ed espansione
leggibili, due strategie sostenibili e un salvataggio ripristinabile, con una
barra risorse e un dock che si leggono a colpo d’occhio, senza regressioni
rispetto ai contratti e ai budget dell’MVP.
