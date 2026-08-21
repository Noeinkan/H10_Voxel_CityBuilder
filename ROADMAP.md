# Roadmap — H10 Voxel City Builder

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

**Dove siamo.** Nove sotto-fasi su quattordici sono chiuse, e due delle quattro
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
look, 4.10 è uno strumento. Nessuna delle due famiglie blocca l'altra, ma se
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

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono allineamento, determinismo e carreggiata sgombra,
non la leggibilità.

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

- [x] Risolvere le pendenze della rete con rampe, scalinate e tratti incassati, <!-- size: L -->
  al posto dell'attuale scarto secco per `tooSteep`.
- [x] Introdurre muri di contenimento e terrapieni dove la quota cambia, così che <!-- size: L -->
  il salto sia costruito e non un gradino di terreno nudo.
- [x] Portare piazze e piattaforme sopraelevate dove il dislivello le giustifica. <!-- size: M -->
- [x] Trattare la costa come fronte edificato: moli, approdi e banchine al posto <!-- size: L -->
  dell'attuale bordo d'acqua.
- [x] Rivedere `maxTerrainStep` e la blacklist dei siti: con le rampe una <!-- size: M -->
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
grammatica non è più **per edificio singolo**: la 4.4 le ha dato un corso di base
condiviso, e sopra di esso l'arretramento cade alla stessa quota su tutta una
fila — ma resta un corso *di base*, e due arretramenti più in alto continuano a
non sapere l'uno dell'altro. Gli accenti luminosi non sanno ancora niente
dell'occupazione: si accendono per livello e non per quanta gente ci abita, che è
la 4.8.

### Fase 4.4 — Isolati terrazzati e cluster verticali

Obiettivo: far crescere gli edifici per aggregazione, non solo per livello.

Dipende da 4.1 — l'isolato è definito dalle strade — e da 4.3, che fornisce la
grammatica per esprimerlo.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono quota e basamento condivisi, la contiguità delle
impronte, i gradoni sul fianco e la rigenerabilità, non la leggibilità di un
distretto denso a distanza di gioco.

- [x] Permettere a edifici adiacenti dello stesso isolato di crescere insieme, <!-- size: XL -->
  condividendo basamento e quota.
- [x] Superare il tetto di impronta 4×4 dove l'aggregazione lo giustifica, <!-- size: L -->
  rivedendo di conseguenza collisione, budget di chunk e cancellazione.
- [x] Far salire i cluster per sovrapposizione e arretramento, mantenendo il <!-- size: L -->
  vincolo di appoggio che oggi tiene in piedi le mensole.
- [x] Conservare la rigenerabilità: un cluster deve poter essere ricostruito dal <!-- size: M -->
  proprio record per essere cancellato, come oggi un edificio singolo.

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
tick non costruisce — `ticksPerBuild` è 2 e `ticksPerUpgrade` 10 — e sono i tick
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

### Fase 4.5 — Rete urbana in quota

Obiettivo: continuare la rete sopra il piano stradale, fino a che il livello alto
sia percorribile quanto quello basso.

Dipende da 4.1 per la topologia e da 4.4 per avere qualcosa da collegare in
quota. **È la prima della spina dorsale**, e non per anzianità: la campata è la
prima struttura del progetto che non poggia a terra, e finché non esiste, «quota»
resta un numero dentro uno stamp invece che un posto dove si arriva.

**Cos'è una campata, detto dal lato del codice.** Un edificio è un
`BuildingRecord` ancorato al terreno; un ponte no — ha due appoggi che non sono
suoi, non occupa il suolo che scavalca, e la sua ragione di esistere è
un'altra struttura. Le due strade sono farne un record con un flag, come la 4.12
ha fatto con i landmark, oppure un dominio a sé. Va tentata prima quella del
record: eredita occupazione, budget di chunk e comparsa a budget senza aggiungere
una passata, e l'unico ramo nuovo è quale generatore disegna lo stamp. Cambia
però un'assunzione che i landmark non toccavano — `baseZ` smette di venire dal
terreno — ed è esattamente l'assunzione che la 4.9 dovrà rompere comunque.

**Il vuoto sotto è il contenuto, non lo sfondo.** Un ponte fra due torri legge
come ponte solo se sotto si vede il salto: è la stessa lezione della finestra di
cielo dell'arcologia (4.14). Da qui due conseguenze di forma — la campata deve
essere **abbastanza larga da essere abitata** e non un filo teso, e la struttura
che la regge (piloni, travature, tiranti, impalcature) va **mostrata** invece che
nascosta. Un impalcato che sembra galleggiare toglie proprio l'informazione per
cui esiste.

**Stato implementazione:** completata. Il gate è verificato dai test — appoggi
reali, suolo libero, continuità fra isolati, nessuna orfana — tranne la
leggibilità alle normali distanze di gioco, che resta da guardare a occhio con le
viste della 4.11.

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

**Vincolo:** nessuna campata senza appoggi reali, e nessun appoggio che sia solo
un numero — se l'edificio che la sostiene cambia livello o sagoma, la campata
segue o sparisce, mai resta a mezz'aria. Il mesher non si tocca (invariante 6):
un ponte è fatto degli stessi voxel di una torre, e se una forma chiede una
passata propria è la forma a essere sbagliata.

**Gate:** ponti e percorsi in quota sono leggibili alle normali distanze di
gioco, poggiano sempre su appoggi reali, esiste almeno un percorso continuo fra
due isolati diversi che non passa dal suolo, e nessuna campata resta orfana
quando l'edificio che la sosteneva cambia livello.

**Come è stato risolto.** Una campata è **un record con un flag**, come il
roadmap chiedeva di tentare per prima cosa: `span` dice quale generatore disegna
lo stamp, `supports` con chi. Da lì eredita collisione, budget di chunk, comparsa
a budget ed esclusione dagli istogrammi senza una passata in più. L'unica cosa
davvero nuova è l'invariante del dominio — **una campata non prende suolo** — e
si è pagata sdoppiando l'indice per colonna del registry: `columns` con tutti i
record, che regge `overlaps`, e `groundColumns` con i soli record che poggiano
davvero, che è quello che legge `isOccupied`. Nessun chiamante è cambiato, e
`isOccupied` è rimasta O(1) senza allocazione. Sotto un ponte la carreggiata si
dipinge ancora, il lotto si costruisce ancora, e se un edificio cresce attraverso
la campata a cedere è la campata.

**Il difetto che ha riscritto la regola: gli edifici sono piramidali.** La prima
versione cercava l'appoggio al filo dell'impronta e non ne trovava **mai** — zero
campate su 6 911 coppie. Il profilo di una torre lo dice: 6×6 fino a quattro
voxel sopra la base, 4×4 per i quattro successivi, e da lì in su una guglia. Al
bordo dell'impronta la parete esiste solo dentro la fascia zero, cioè sotto
qualunque franco che una strada possa chiedere. `highestLanding` cerca quindi la
parete **rientrando** verso il centro, e la campata che ne esce è più lunga del
vuoto e sporge sopra le fasce basse dei propri appoggi — che è esattamente come
atterra una passerella vera, sull'arretramento e non sul basamento. Da qui
l'`except` su `overlaps`: toccare ciò a cui si è attaccati non è una collisione.
Il volume dev'essere comunque tutto aria, o cancellare la campata bucherebbe
l'edificio.

**La rete è un albero, e il gate è una conseguenza.** Fra due campate possibili
vince quella che **unisce due componenti separate**; chi chiuderebbe un ciclo non
si costruisce, perché fra due posti già raggiungibili un secondo percorso aggiunge
ingombro e non raggiungibilità. `spans/network.ts` tiene sia la decisione sia la
verifica: se «connesso» fosse definito in due posti, divergerebbero al primo
refactor e il test smetterebbe di misurare la regola. Il grafo si **ricostruisce**
a ogni passata invece di aggiornarsi — un union-find non sa disfare un'unione, e
qui le campate spariscono davvero.

**La piazza è un nodo, non un ponte largo.** Vive sul cuore che la 4.1 aveva
chiuso apposta, ed è retta da tre o più edifici su lati diversi: è quello a farne
uno snodo, perché le campate ci arrivano da direzioni diverse. Anche lei ha dovuto
imparare ad allargarsi fino ai muri veri — il cuore è il vuoto *al suolo*, e in
quota gli edifici che lo delimitano si sono già arretrati.

**Il debito della 4.12, chiuso.** `LANDMARK.maxDirtyChunks: 48` era un tetto
alzato apposta per i moli e le piste, e il suo stesso commento diceva che una
ricetta troppo grossa «andrà spezzata in segmenti — non esentata». Ora `Growing`
porta un'**ancora** invece di un record, `sliceStamps` ritaglia ciò che supera
`BUILDER.segmentSide`, e la coda `pending` ne fa comparire uno per volta per
struttura: accodarli tutti insieme non avrebbe ridotto niente, perché i chunk si
sporcano man mano che le scritture atterrano. Il tetto dei landmark non esiste
più: rispettano quello di ogni altra struttura. Il test che verifica tutte le
ricette su ogni verso e sedici offset — scritto dalla 4.12 — passava con
quarantotto e passa ancora senza, che è la prova che l'eccezione era diventata
inutile invece di essere nascosta.

**Costo e misure.** Su 256×256 colonne, un catalizzatore a raggio 96 e 420 tick,
con 395 edifici e 15 campate: i tick su cui gira `spanPass` (uno su venti) hanno
mediana **3,9 ms**, p95 6,8 ms; tutti gli altri restano a mediana 0,001 ms e p95
2,9 ms. Le piazze valgono circa mezzo millisecondo di quei 3,9; il resto è
l'enumerazione delle coppie. Va detto per intero: **quel tick supera i 3 ms di
`FRAME_BUDGET_MS`**, e sta nell'ordine del massimo che quel ciclo già tocca —
16,8 ms, che è `nextBuildSites` mentre scandisce il campo allocato, preesistente e
di competenza della fase 6. Niente entra nel ciclo di frame: `step` e
`stepSurface` non sono toccati, e il worker del mesher resta 8,64 kB in bundle.
**Le tabelle di misura in `README.md` e `src/sim/README.md` vanno rimisurate a
mano**, e non sono state aggiornate qui.

**Resta aperto.** La rete sta **bassa**, e non per scelta: il franco è due cubi di
terreno sotto le travi perché l'unica fascia larga abbastanza da reggere un
impalcato sta fra il quarto e l'ottavo voxel sopra il suolo. Con un franco più
generoso il pavimento saliva sopra quella fascia e non passava più nessuna coppia
— non ponti più alti, zero ponti. **La 4.6 doveva liberare la quota e non ci è
riuscita**: alzare il tetto verticale ha reso alte le torri del centro, ma la
stessa fase ha anche abbassato la periferia, quindi le coppie di appoggi alti
sono diventate più rare. Misurato sulla città di prova: franco a due cubi undici
campate, a tre o quattro cubi quattro. Il debito passa alla 4.9, dove un
impalcato con appoggi propri non deve aspettare che due torri diventino alte
nello stesso punto. Le piazze sono
poche — una o due per città matura — per la stessa ragione: chiedono un cuore
d'isolato fra sei e sedici colonne con il perimetro costruito su almeno due lati.
I mezzanini esistono nella regola e non compaiono ancora sull'isola di prova:
pretendono due membri della **stessa** fila affacciati su un cortile senza
carreggiata, e la 4.4 accosta i membri di una fila invece di lasciarli affacciati.
Una campata che perde l'appoggio **sparisce e viene riproposta** dalla passata
dopo: è il «segue» del vincolo, ma passa da una cancellazione visibile e non da
uno spostamento. E i cicli non si costruiscono mai, quindi la rete resta un
albero: nessun anello, e da un capo all'altro c'è un percorso solo.

### Fase 4.6 — Gerarchia verticale della città

Obiettivo: una silhouette d'insieme leggibile, non edifici alti sparsi — e la
regola che decide **fin dove una colonna può salire**, che oggi non esiste.

Dipende da 4.3 e 4.4 per le forme locali: la calibrazione globale ha senso solo
quando c'è qualcosa da calibrare. **È la seconda della spina dorsale**, ed è
anche il punto in cui si rompono i tre tetti che fermano la città a mezz'aria:
la ragione per cui questa sotto-fase pesa più di quanto il suo elenco lasciasse
credere.

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

**Stato implementazione:** completata. Il gate è verificato dai test — tre fasce
popolate, nessun livello che raccolga la città intera, nessun edificio alto
scartato in silenzio, e la stessa figura su tre seed — tranne la leggibilità a
UI nascosta, che resta da guardare a occhio.

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

**Come è stato risolto.** La quota ammessa vive in `src/world/skyline/`, che è un
dominio a sé e non un'appendice di `buildings/`, per la stessa ragione per cui
`sites/` non è finito dentro `grading/`: quello lì dice *come è fatto* un
edificio, questo *fin dove* una colonna può salire. Puro e senza stato come la
rete stradale — entrano distanza dai poli, dal mare e dal bordo dell'edificato,
esce un tetto — quindi non si salva, non si invalida quando arriva un
catalizzatore, e si verifica in `node` senza mondo e senza terreno. `src/sim/`
non ha guadagnato una coordinata verticale (invariante 7), e nessun coefficiente
di `balance.ts` è stato toccato.

**Le due domande stanno affiancate, e l'ordine conta.** In `upgradePass` la
gerarchia risponde per prima, perché dice di no più spesso e non costa un profilo
locale; la desiderabilità decide dopo. È la separazione che la fase esisteva per
fare: `DesirabilityField` è un `Uint8Array` clampato a 255 e l'ultima soglia sta
a 198 — 198 è la **fine dell'alfabeto**, non una taratura stretta. `upgradeThreshold`
non è quindi stato allungato: si legge con `upgradeThresholdOf`, che ripete
l'ultima voce, e sopra quel punto a decidere è la fascia.

**Lo skyline è la somma di tre condizioni che raramente coincidono.** Fascia
(`3 / 6 / 9`), più un cono di due livelli verso il polo, più un livello a un
isolato ogni sette eletto da un hash del suo indice: il massimo esce solo dove i
tre si sommano, ed è per questo che i picchi sono pochi **per costruzione** e non
per fortuna. Un test verifica che quella somma valga esattamente
`BUILDER.maxLevel`: se `SKYLINE` concedesse di più, il clamp del Builder
mangerebbe la differenza in silenzio e il livello massimo finirebbe anche a chi
non se l'è guadagnato. La corona attorno all'edificato non è disegnata da
nessuno — cade fuori dalla regola, perché in periferia i vicini costruiti sono
pochi per definizione.

**I tre tetti, rotti insieme, più due che nessuno aveva contato.** `maxLevel` da
6 a 12; `LEVEL_CAPS` da sette a tredici voci, con le prime sette **intatte**,
perché sono la città bassa che già esiste e cambiarle avrebbe rifatto la sagoma
della maggioranza degli edifici per una fase che parla dei pochi alti;
`maxDirtyChunksPerBuilding` da 24 a 40, che è aritmetica — `edgeChunks` aggiunge
una colonna di chunk solo quando l'impronta non ne attraversa già due, quindi le
colonne effettive restano due per asse e il caso peggiore è `2 × 2 × 7 = 28`. I
due non previsti: `GRAMMAR.minBandSide` da 2 a 4, senza il quale una catena di
rientranze riduce a un palo i due terzi superiori di una torre da diciannove
fasce; e `START_LEVEL_CDF`, che era lungo `maxLevel + 1` **per caso** — con
`maxLevel` alzato, `startLevel` leggeva `undefined`, il confronto era falso a
ogni giro e ogni edificio sarebbe nato al livello massimo. Un difetto che non
lancia niente e si vede solo guardando la città; ora un test verifica la
lunghezza di entrambe le tabelle indicizzate per livello.

**La punta è una matita, ed è dichiarato.** Il contratto di proporzione passa da
dieci a uno a diciannove a uno, e il test lo dice invece di tacerlo. Non c'è
un'altra forma disponibile: `MAX_FOOTPRINT` è otto voxel e non può salire senza
allargare `STREETS.pitch`, perché l'isolato più stretto è largo quattordici
colonne — cambiare la scala della maglia stradale è un'altra fase. A dare massa
alle torri, qui e ora, è l'aggregazione della 4.4.

**Costo e misure.** Su isola vera 256×256, un polo a raggio 96, 500 tick, 334
edifici. I tick di upgrade hanno mediana **9,4 ms** e p95 16,7 ms; tutti gli
altri stanno a mediana ~0 e p95 11,4 ms.

| | mediana del tick di upgrade |
| --- | --- |
| con la gerarchia | **9,4 ms** |
| con la gerarchia spenta | 9,5 ms |
| con il tetto riportato a sei | 10,7 ms |

Le tre righe dicono la stessa cosa: **il costo è della passata di upgrade, non di
questa fase**. Quel tick supera i 3 ms di `FRAME_BUDGET_MS` ed è preesistente,
come già lo è `nextBuildSites`; appartiene alla fase 6. Non è un A/B contro il
commit precedente, e di proposito: gli stessi file portano in parallelo un altro
lavoro, e un A/B avrebbe attribuito alla 4.6 anche quello.

Ci è voluto un giro di ottimizzazione per arrivarci: la prima versione portava il
tick di upgrade a 17,2 ms. Le due voci erano `withinRadius(...).length`, che
costruiva un array di qualche centinaio di record per leggerne la lunghezza — da
cui `countWithinRadius` e la scansione condivisa — e `waterDistance`, che
chiedeva `columnAt` e allocava un oggetto per colonna. Nessuna delle due era
microtaratura: insieme valevano metà della passata.

L'ombra **non** è stata ritarata, e il conto dice perché: `SunShadow.fit` adatta
il frustum al raggio dell'AABB visibile, che è la diagonale di una scatola larga
420 voxel e alta 200 invece di 80 — da 601 a 626, cioè il quattro per cento. A
dominare è l'estensione orizzontale, e la densità di texel non si muove.

**Le tabelle di misura in `README.md` e `src/sim/README.md` vanno rimisurate a
mano**, e non sono state aggiornate qui.

**Resta aperto.** Il franco delle campate **non è stato liberato**, ed era il
debito che la 4.5 aveva lasciato proprio qui: misurato, alzarlo da due a tre cubi
di terreno costa i due terzi delle campate (da undici a quattro). La ragione è
che questa stessa fase alza il centro e **abbassa la periferia**, quindi le
coppie di appoggi alti sono diventate più rare e non più comuni; il debito passa
alla 4.9, dove un impalcato con appoggi propri non deve aspettare che due torri
diventino alte nello stesso punto. La città arriva in alto **lentamente**: la
scala di `upgradeThreshold` è ripida e sopra il livello sei a far salire un
edificio è solo la gerarchia — sul seed di prova il primo livello 7 compare
attorno al quattrocentesimo tick, e il primo livello 11 attorno al
seicentesimo. La gerarchia legge il costruito e non l'ha ancora imparato a
dimenticare: se un giorno arriverà la demolizione, la fascia di una colonna dovrà
poter scendere. E l'altezza resta un attributo del singolo record: il secondo
livello percorribile è la 4.9, non questa.

### Fase 4.7 — Atmosfera e separazione delle quote

Obiettivo: rendere leggibile la profondità verticale con la luce, non con la
geometria.

Nessuna dipendenza: vive interamente in `src/engine/` e può essere fatta in
qualsiasi momento.

- [ ] Usare nebbia e prospettiva aerea per separare le quote, non solo le <!-- size: M -->
  distanze.
- [ ] Dare all'acqua una risposta che distingua bassofondo, canale e mare aperto. <!-- size: M -->
- [ ] Rivedere il contributo dell'ambiente sotto ponti, portici e piani coperti, <!-- size: M -->
  dove oggi manca l'occlusione che li racconterebbe.
- [ ] Aggiornare i temi esistenti alla nuova gerarchia, restando nel materiale <!-- size: M -->
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

- [ ] Costruire una libreria di prop sub-voxel — tende, insegne, condizionatori, <!-- size: XL -->
  antenne, cavi, cassoni, fioriere — emessi dalla stessa `emitRuns` degli altri
  dettagli, scelti per uso, livello e faccia.
- [ ] Appenderli alle giunzioni che la grammatica già produce — fronte strada, <!-- size: L -->
  arretramenti, coronamenti, angoli d'isolato — invece che a posizioni sparse
  sulla facciata: è l'aggancio a rendere l'oggetto credibile, non la sua forma.
- [ ] Portare il verde sull'edificio: fioriere, rampicanti e chiome che riusano <!-- size: M -->
  gli slot `grass*` esistenti e la stessa priorità di troncamento.
- [ ] Far uscire la luce: un contributo notturno che schiarisce le superfici <!-- size: L -->
  vicine a una faccia emissiva, ricavato da quello che il mesher già produce,
  senza luci dinamiche, senza una pass in più e senza ricompilare materiali.
- [ ] Legare l'accensione allo stato della simulazione: finestre accese in <!-- size: M -->
  proporzione all'occupazione, insegne dove il commercio è attivo, buio dove
  l'edificio è vuoto — la città di notte come lettura dell'economia.
- [ ] Aggiungere un ciclo giorno/notte come traiettoria del sole più scambio di <!-- size: M -->
  uniform, con l'ora esposta nell'harness per poter iterare sul look.
- [ ] Dare all'harness una scena `diorama`: un edificio solo, girevole e <!-- size: M -->
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

- [ ] Introdurre la piattaforma come suolo artificiale: una struttura con appoggi <!-- size: XL -->
  propri che porta una superficie edificabile a quota, trattata dal registry come
  volume e non come edificio.
- [ ] Esporre più di una quota edificabile per colonna senza duplicare la <!-- size: L -->
  `TerrainMap`: il livello si risolve dove si risolve il lotto, non nel campo.
- [ ] Restituire alla crescita le colonne già costruite: oggi `occupancy` è un <!-- size: L -->
  bit per cella e chiude la colonna per sempre. Deve tornare candidabile quando
  sopra c'è spazio ammesso, **senza** che `src/sim/` guadagni una coordinata z —
  è il mondo a dire quante quote restano, come già dice dov'è la costa.
- [ ] Far crescere edifici sulle piattaforme e sui tetti condivisi dei cluster, <!-- size: L -->
  riusando `topOf` e l'intervallo di quota che il registry già confronta.
- [ ] Prendere la quota ammessa della 4.6 come tetto **anche** in quota: una <!-- size: M -->
  piattaforma non è il modo di aggirare la gerarchia, è il modo in cui la
  gerarchia sale. Senza questo vincolo il secondo livello diventa la scorciatoia
  che rende inutile il primo.
- [ ] Aggiungere mobilità in quota come struttura di scena — monorotaia, <!-- size: L -->
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

### Fase 4.10 — Campionario dei voxel

Obiettivo: poter guardare tutto il vocabolario visuale in una sola inquadratura
— ogni slot di palette per ogni linguaggio di superficie, la stratigrafia di ogni
bioma, e il confronto di scala fra cella di terreno, albero ed edificio.

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

- [ ] Aggiungere una `SceneKind` `swatch` su `?scene=swatch`, generata a passi con <!-- size: M -->
  budget come le altre.
- [ ] Disporre la griglia 32 × 8 — uno slot di palette per colonna, un <!-- size: M -->
  `SURFACE_KIND` per riga — con corse abbastanza lunghe e alte perché la
  microgeometria emetta davvero: un `habitat` senza qualche voxel di facciata non
  mostra niente.
- [ ] Affiancare una colonna tagliata per bioma con la stratigrafia vera, così che <!-- size: M -->
  l'invariante «ogni strato è alto un numero intero di celle» si veda di taglio
  invece di doverla dedurre dalle soglie.
- [ ] Mettere nella stessa inquadratura la fascia di scala: le forme d'albero <!-- size: S -->
  accanto a un edificio di riferimento e a un pezzo di terreno.
- [ ] Dare un nome a ciò che si guarda: riga e colonna sotto il cursore <!-- size: S -->
  nell'overlay, perché in-world non ci sono etichette e la sola convenzione
  d'ordine si dimentica.
- [ ] Coprirla con un test in ambiente `node` che verifichi la presenza di tutte <!-- size: S -->
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

**Stato implementazione:** completata. Il gate è stato verificato a schermo su
una città di ~490 edifici, seed 1337: le quattro viste sono in fondo alla
sezione, insieme a cosa il lavoro ha fatto emergere.

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

**Vincolo:** è uno strumento dell'harness, non una modalità di gioco. Sta
accanto a `F3` e al tasto `B` con il suo parametro URL; se un giorno diventerà
un'azione del giocatore, a darle icona, stato e comportamento sui sette temi
sarà la fase 7. Il mesher non si tocca (invariante 6): una vista che chiedesse
di rimeshare per essere disegnata sarebbe la vista sbagliata.

> **Questo vincolo è caduto con la fase 4.13**, e vale la pena dire perché si
> era sbagliato: guardare dentro la propria città non è una verifica tecnica, è
> il modo in cui una città densa si gode. Il giorno dopo averle viste
> funzionare, le viste erano già una funzione di gioco chiusa dietro `?debug=1`.
> Il resto della sezione resta com'era scritto: è il registro di cosa è successo
> allora, non una descrizione dello stato attuale.

**Gate:** su una città matura si legge come un isolato si incastra su più quote —
velato, a fette e in sezione — senza console, senza rigenerare la scena, e senza
che il frame esca dal budget mentre una vista è attiva.

**Come è stato risolto.** Nel materiale non è entrato il concetto di «modo».
Sono entrati **due predicati geometrici e una sola azione**: un semipiano, un
rettangolo con la propria polarità, e la densità di un retino ordinato su
`gl_FragCoord` con `discard`. I quattro modi sono quattro riempimenti diversi di
quelle uniform, e vivono in `src/engine/inspect.ts` — puro, senza Three e senza
DOM, verificato in `node` come `lighting.ts`. È la stessa separazione della 2.1
fra etichetta e terreno: la vista dichiara cosa vuole nascondere, il materiale
sa solo nasconderlo.

**Velare e tagliare sono la stessa manopola.** A densità 1 il retino scarta ogni
pixel, cioè taglia; sotto, lascia passare il tessuto dietro. Non servono due
percorsi, e `transparent` resta `false` perché il retino non è alpha blending —
niente ordinamento, niente da ripensare quando arriveranno le campate della 4.5.
Solo il taglio chiede il tappo, e il tappo è `DoubleSide` più `gl_FrontFacing`
sulla stessa geometria: la sezione verticale, misurata a schermo, non lascia
vedere il cielo attraverso un volume tagliato. Quello che si vede dentro è un
**guscio vuoto**, e non è un difetto: il mesher non emette facce interne, e i
riferimenti citati qui sotto hanno esattamente lo stesso aspetto.

**Il `discard` non lo paga chi non lo usa.** Un `discard` raggiungibile nel
sorgente può costare l'early-Z su tutta la scena, e queste sono viste
dell'harness. Il blocco entra nel fragment **alla prima attivazione**: una
ricompilazione per sessione, mai spontanea, e da lì in poi spegnere una vista
significa riscrivere il payload neutro. L'invariante che conta — cambiare tema
non ricompila niente — è sorvegliato dal test che già c'era, esteso a entrambe
le varianti del sorgente.

**Due cose le ha trovate solo lo schermo.** La prima: il semipiano dei raggi X,
da solo, non apre una finestra — **dissolve mezza città**, perché in ortografica
tutto ciò che sta davanti alla colonna è metà dell'inquadratura. Il rettangolo,
che serviva all'isolato, è diventato il secondo predicato di tutti: i due si
intersecano, e la polarità decide se a nascondersi è il dentro (la finestra dei
raggi X) o il fuori (l'isolato). La seconda: la fetta a una quota assoluta
partiva **dentro la collina** — il nucleo della città sta a una quarantina di
voxel sul mare — e il primo colpo d'occhio era l'interno della terra. Finché la
quota non viene scelta, la fetta segue il suolo che si sta guardando; al primo
tasto o al primo trascinamento diventa assoluta.

**Le ombre.** La shadow map non sa del taglio, quindi il piano appena scoperto
resterebbe all'ombra dei piani che si sono nascosti — ed è proprio la lettura che
la fetta esiste per dare. Finché un taglio è attivo le ombre proiettate si
spengono; sole e ambiente restano, quindi le facce continuano a distinguersi e il
risultato legge come un disegno tecnico invece che come una scena piatta.

**Costo e misure.** La colonna a fuoco si risolve **una volta per frame** e non a
ogni `pointermove`: il costo non dipende da quanto si muove il mouse, e la vista
segue anche la rotazione della camera. Su una città di ~490 edifici, `mainMs`
resta sotto il millisecondo con ogni modo attivo, dentro `FRAME_BUDGET_MS`.
Geometria, chunk con mesh e voxel solidi sono **identici bit a bit** con ogni
vista accesa e dopo un cambio di tema: il mesher non è stato toccato (invariante
6) e il suo worker resta 8,64 kB. Le draw call in un modo che taglia scendono da
398 a 116, ma non è merito del taglio: è la pass d'ombra che non gira. Nessuna
tabella di misura di `README.md` o `src/sim/README.md` è stata aggiornata, perché
questa fase non entra né nel mesher né nella simulazione.

**Resta aperto.** Il volume nascosto **continua a proiettare ombra**: nel taglio
si spengono tutte, che è la risposta a costo zero; far sì che solo il volume
nascosto smetta di proiettare vuole lo stesso predicato nel materiale di
profondità di `SunShadow`, cioè un secondo shader da tenere allineato a mano. Il
velo non distingue terreno da edificio — il mesher non porta quell'informazione,
e chiedergliela sarebbe la vista sbagliata — quindi i raggi X aprono anche il
suolo davanti alla colonna. E le viste restano dell'harness: niente icona, niente
stato sui sette temi, niente comportamento da giocatore. Se un giorno
l'ispezione diventerà un'azione del gioco, sarà la fase 7 a darle una pelle.

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

### Fase 4.12 — I catalizzatori diventano strutture

Obiettivo: dare a ognuno degli otto ruoli una struttura voxel propria, che
**cresce per stadi insieme al quartiere che ha generato**.

Nessuna dipendenza forte. Vive in `src/world/` e riusa la macchina di crescita
degli edifici invece di aggiungerne una.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono ingombri, determinismo, stadi cumulativi,
invarianza per rotazione e budget di chunk, non la leggibilità a distanza di
gioco.

**Perché la fase si è aperta.** Un giocatore ha guardato il porto e ha detto che
faceva schifo, e aveva ragione due volte. Primo: **il porto non esisteva**.
Quello che si vedeva sull'acqua era la carreggiata dell'isolato costiero —
`groundKindOf` chiama `shore` ogni colonna d'acqua entro `maxQuayDepth`, quindi
`rampAround` portava l'intero anello di strada a `quayLevel` e ne costruiva il
muro fino al fondale. Secondo: tutti e otto i ruoli condividevano lo stesso rombo
di asfalto di raggio quattro, e si distinguevano per il colore di **un voxel** al
centro. La fase 3 aveva chiuso «catalizzatori con ruolo distinto» sul piano della
simulazione e mai su quello della forma.

- [x] Fermare la banchina al bordo costruito della terra (`GRADING.quayReach`): <!-- size: S -->
  `maxQuayDepth` dice fin dove il fondale regge, non fin dove ha senso arrivare.
- [x] Dare a ogni ruolo una ricetta di parti, come tabella e non come generatore, <!-- size: XL -->
  con una firma verticale che la distingua in isometrica.
- [x] Far crescere la struttura per stadi su ciò che la città ha **costruito** <!-- size: L -->
  intorno, non sulla desiderabilità.
- [x] Restituire alla simulazione un effetto lieve, da una porta che esiste già. <!-- size: S -->
- [x] Ammettere impronte rettangolari, per le forme lineari per natura. <!-- size: M -->

**Vincolo:** un landmark non è un tipo nuovo di cosa. È un `BuildingRecord` con
un campo in più, e tutto ciò che lo governa — occupazione, collisione, budget di
chunk, comparsa a budget, avanzamento — è la macchina degli edifici. Se una forma
chiede una passata propria, è la forma a essere sbagliata.

**Gate:** i sette ruoli si riconoscono dalla sagoma senza overlay e senza
tooltip; il porto legge come porto e non come piattaforma; la crescita resta
dentro i budget con più landmark in comparsa insieme.

**Come è stato risolto.** L'idea portante è che **la macchina esisteva già**.
`upgradePass` percorre i record a cursore, verifica un tetto, rigenera vecchia e
nuova sagoma, sostituisce il record e accoda la comparsa a budget; `upgrade`
limita l'allargamento con `blockRoom`, `fitsWider`, `dirtyChunkCount` e
`surveyGrade`. Un landmark è quindi un record con `landmark: CatalystId`, e
l'unico ramo nuovo in tutto il Builder è quale generatore disegna lo stamp.
Nessuna passata in più, nessun secondo indice, nessuno stato nuovo.

**Cosa fa avanzare uno stadio, e perché non la desiderabilità.** Un catalizzatore
siede al centro della propria influenza: il campo lì è quasi sempre saturo,
quindi un landmark che leggesse `field.valueAt` salterebbe tutti gli stadi al
primo tick. Lo stadio conta invece i record entro il raggio del catalizzatore —
ciò che la città ha davvero costruito. È il modello dei
[monumenti di Anno 1800](https://anno1800.fandom.com/wiki/Monuments), una
costruzione a fasi che corona una città *già edificata*
([devblog](https://www.anno-union.com/devblog-welcome-to-the-world-fair/)), detto
con il solo dato che il Builder possiede. Non serve stato: è una funzione pura
del contenuto del registry, ed è monotona perché nessuno demolisce.

**Gli stadi sono cumulativi dentro un ingombro che non cambia mai**, riservato
per intero al piazzamento. Due garanzie invece di due controlli: un landmark non
può restare bloccato a metà perché nel frattempo è cresciuto un edificio accanto,
e la sagoma dello stadio precedente non ha mai niente da cancellare.

**Due difetti trovati dai test.** I pilastri di `colonnade` contavano il passo da
un capo solo, quindi su un lato non multiplo del passo la ricetta smetteva di
essere invariante per rotazione — e si vedeva come un conto di voxel diverso a
seconda del verso, dove due parti si sovrappongono. E le prime ricette erano
larghe sedici voxel, quasi un isolato: seppellivano la sovrapposizione fra due
catalizzatori, cioè esattamente il punto dove nascono gli usi misti. A dirlo è
stato un test di fase 3 già in suite, che è il modo migliore in cui poteva
saltare fuori.

**Costo e misure.** `generateLandmark` gira al piazzamento e a ogni avanzamento
di stadio, cioè unità di volte per partita, e `landmarkPass` scorre i soli record
con `landmark` una volta ogni `ticksPerUpgrade`. `stageBonus` entra in
`balance.ts`: **le tabelle di misura in `README.md` e `src/sim/README.md` vanno
rimisurate a mano**, e non sono state aggiornate qui.

**Resta aperto.** Le forme lineari sono limitate da `LANDMARK.maxDirtyChunks` e
non ancora spezzate in segmenti: una pista davvero lunga — o un viadotto che
attraversi mezzo isolato — chiede la segmentazione della 4.5, e va fatta lì.
Il landmark non partecipa ancora alla città in quota: il suo impalcato è un
volume del registry come gli altri, quindi la 4.9 potrebbe già costruirci sopra,
ma nessuno gliel'ha ancora chiesto. E la ricetta non varia con il seme: la forma
è una funzione di `(ruolo, stadio, verso)`, scelta perché il giocatore deve
riconoscere il ruolo dalla sagoma e non imparare otto sagome moltiplicate per i
semi — se un giorno si vorrà varietà, andrà aggiunta senza toccare quel patto.

### Fase 4.13 — Le viste diventano un gesto di gioco

Obiettivo: mettere le quattro viste della 4.11 **in mano al giocatore**, invece
di lasciarle dietro `?debug=1`.

Dipende dalla 4.11, di cui non riscrive niente. Vive in `src/ui/` e in
`src/main.ts`.

**Stato implementazione:** completata. Verificata a schermo alla radice, senza
`?debug=1`, su una città di ~2.000 residenti.

**Perché il vincolo della 4.11 era sbagliato.** Lo diceva la 4.11 stessa: «se un
giorno diventerà un'azione del giocatore, sarà la fase 7 a darle una pelle». Quel
giorno è stato il giorno dopo. Guardare dentro la propria città non è una
verifica tecnica — è **il modo in cui una città densa si gode**, ed è la risposta
alla stessa domanda che aveva aperto la 4.11, posta però da chi ci gioca invece
che da chi la costruisce. Il motore non aveva bisogno di niente: mancavano il
comando e tre regole.

Le tre regole, che sono il contenuto vero della fase:

- **Il fuoco si aggancia.** Seguendo il cursore un frame alla volta, bastava
  portare il mouse sul dock — o vedersi aprire una carta evento — per far saltare
  la vista a metà città. È il difetto che rendeva le viste inusabili da
  giocatore, e non si vedeva finché le si guidava da console.
- **Prendere uno strumento chiude un taglio.** Sotto Levels o Cutaway il terreno
  vero è nascosto: si piazzerebbe alla cieca. Le viste a velo sopravvivono,
  perché lì il suolo si legge ancora sotto il retino.
- **La quota si ri-arma** tornando alla città intera, o una fetta riaperta
  ripartirebbe da una quota scelta mezz'ora prima, nel frattempo finita
  sottoterra.

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

**Vincolo:** il motore della 4.11 non si tocca — nessuna uniform nuova, nessun
modo nuovo, nessuna ricompilazione in più. La variante col `discard` continua a
entrare alla prima attivazione: chi non apre mai una vista non la paga, e resta
la scelta giusta anche ora che è una funzione di gioco. La vista è una **lente
sul rendering, non uno stato della città**: `src/sim/` e `src/game/` non sanno
che esiste, non si salva, e al ricaricamento si riparte da Normal.

**Gate:** un giocatore che non ha mai aperto la console scende di un piano nella
propria città, taglia su una strada e isola un quartiere senza uscire dal gioco,
e senza che una vista attiva gli faccia perdere il punto che stava guardando.

**Cosa ha trovato lo schermo.** Che i raggi X hanno una finestra di
`INSPECT.xraySpan` colonne di **mondo**: a tutta inquadratura sono una trentina
di pixel, e la vista sembra non fare niente. Da vicino — dove serve — apre
esattamente ciò che sta davanti. Non è un difetto da correggere con un numero più
grande: un raggio X che scala con lo zoom dissolverebbe mezza città appena ci si
allontana, che è il difetto che la 4.11 aveva già trovato e chiuso. Va detto
nella riga della vista, non allargato.

**Cosa ha trovato il giocatore, il giorno dopo.** Che una vista che non dice dove
è puntata non è una vista, è un difetto di rendering. Il comando c'era, il motore
funzionava, e da fuori si vedeva «una specie di trasparenza ad area quadrata che
non si capisce cosa sia» — parole di chi ci giocava. Le tre cause, tutte fuori
dal motore:

- **Il fuoco era invisibile.** Tre viste su quattro si agganciano alla colonna
  sotto il cursore e nulla a schermo lo diceva: gli unici numeri che lo
  raccontavano stavano in `InspectOverlay`, dietro `F3`. Ci vogliono delle
  **guide** — `src/engine/InspectGuides.ts`, contorno del riquadro, carreggiata
  della sezione, mirino sulla colonna — disegnate dalle uniform già composte, così
  che la linea non possa divergere dal retino.
- **Il bordo era un gradino.** Il predicato del rettangolo cominciava su una riga
  di voxel allineata agli assi, e quel confine netto legge come un artefatto.
  `INSPECT.feather` lo sfuma moltiplicando la densità che c'era già: nessun
  colore nei vertici, nessun mesher, e inerte dove il rettangolo è aperto.
- **Le righe dicevano il risultato e mai il gesto.** «See through whatever stands
  in front of what you are looking at» non dice *muovi il mouse sopra*. Da qui
  `ViewOption.gesture`, che entra nel picker, nel toast di `V` e nella card di
  aiuto — dove la 4.13 aveva lasciato la sola riga «V · Look inside the city»,
  che non nomina nessuna delle quattro viste. Ci finisce anche la larghezza della
  finestra dei raggi X, che la riga sopra prometteva di dire e non diceva.

E due difetti veri, non solo di leggibilità: la **barra dei livelli compariva in
Cutaway**, dove `sliceZ` non entra nelle uniform, quindi si trascinava a vuoto —
`modeCuts` rispondeva a due domande diverse, e ora `modeHasLevel` risponde alla
seconda; e **`[`/`]` funzionavano in ogni modo**, senza effetto visibile ma
*armando* la quota, così che una fetta aperta dopo ripartisse da un numero
assoluto invece che dal suolo davanti. Fuori da Levels adesso aprono Levels, e il
ri-armo scatta uscendo da Levels e non solo tornando alla città intera.

**Cosa ha trovato il giocatore, il giorno dopo ancora.** Che le guide dicevano
*dove* è puntata la lente, e niente altro: «non c'è una maniera ovvia per uscire
da questa view e ritornare al gioco normale». Aveva ragione, e il difetto non era
il rendering ma la durata delle superfici. Il picker si chiude appena si sceglie,
il toast dura due secondi, la card di aiuto va aperta: **tutto ciò che spiega una
vista muore prima della vista stessa**, e resta una città retinata senza nome,
senza tasti e senza uscita.

Da qui la **targa** (`ViewBarModel`), l'unica superficie che sopravvive al gesto
che l'ha aperta: nome, gesto, i tasti che valgono *lì dentro* e due bottoni —
cambiare vista, uscirne. E `Escape` che finalmente esce, dopo i pannelli e dopo
lo strumento. Che non lo facesse era scritto e argomentato in
`resolveEscapeTarget` — una vista non è un pannello aperto sopra il gioco — ma
l'argomento vale solo finché esiste un'altra via d'uscita ovvia: c'erano `V`
premuto cinque volte e il picker, e nessuna delle due era scritta da nessuna
parte. Un tasto di annullamento che si rifiuta di annullare l'unica cosa
evidentemente in corso non protegge niente.

**Resta aperto.** Le ombre nel taglio si spengono ancora tutte, e ora che è una
vista di gioco l'appiattimento si nota di più: la risposta giusta resta il
predicato nel materiale di profondità di `SunShadow`, cioè un secondo shader da
tenere allineato a mano. Nessuna icona ridisegnata e nessuno stato sui sette
temi: quella è la fase 7, e l'icona aggiunta qui è una sagoma coerente, non un
progetto grafico.

E soprattutto: **il velo continua a non distinguere terreno da edificio.** I
raggi X aprono anche il suolo davanti alla colonna, e siccome il mesher non
emette facce interne, dentro la finestra si legge un guscio vuoto sopra un buco
nel terreno. Le guide dicono adesso *dove* si sta guardando, il che rende la
vista usabile, ma non tolgono il buco. Tenere il suolo più pieno degli edifici
vuole un'informazione che il mesher non porta — e chiedergliela sarebbe la vista
sbagliata (invariante 6): la strada praticabile è un secondo predicato di quota,
e va decisa prima di scriverla.

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

- [ ] Dare all'arcologia una ricetta di parti come i landmark — steli, impalcati <!-- size: XL -->
  abitati, corone, vuoti passanti — con l'ingombro riservato e gli stadi
  cumulativi che la 4.12 ha già.
- [ ] Ammettere più usi dentro la stessa struttura, per fascia di quota, senza <!-- size: L -->
  che diventi una zona: la simulazione continua a contare capacità e occupazione
  come le conta oggi (invariante 7, e lo stesso vincolo che regge i cluster
  della 4.4).
- [ ] Farla nascere da una condizione della città — densità, quota ammessa già <!-- size: L -->
  satura, un mandato della 2.2 — e non da un nono bottone in toolbar: il
  giocatore modifica le condizioni della crescita, non posa la megastruttura.
- [ ] Innestarla nella rete in quota della 4.5: un'arcologia che non si <!-- size: M -->
  raggiunge dagli impalcati è un monumento, non un pezzo di città.
- [ ] Farne il vertice della gerarchia della 4.6 — l'eccezione governata, una o <!-- size: M -->
  due per isola — invece di una riga di catalogo che la tipologia può pescare
  ovunque.
- [ ] Tenerla dentro i budget: attraversa decine di chunk, quindi cresce a <!-- size: L -->
  segmenti come le campate e uno stadio per volta, mai in un frame solo.

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

**Gate della fase 4:** con la UI nascosta, la città comunica crescita verticale,
connessioni fra livelli e struttura economica attraverso volumi e silhouette;
ponti, terrazze e percorsi in quota restano leggibili alle normali distanze di
gioco, il singolo edificio regge anche l'inquadratura ravvicinata, e almeno una
parte della città sta **sopra** un'altra parte — dalla stessa inquadratura si
contano due livelli abitati e il vuoto che li separa.

## Fase 5 — Persistenza e prodotto browser

Obiettivo: trasformare la demo in un gioco riprendibile e distribuibile.

- [ ] Salvare seed, simulazione, catalizzatori, policy, settori e registro edifici in <!-- size: XL -->
  un formato versionato; ricostruire terreno e campo invece di serializzare buffer derivati.
- [ ] Aggiungere autosave locale, slot manuali, esportazione e importazione JSON. <!-- size: L -->
- [ ] Separare UI di gioco e diagnostica; rendere accessibili controlli, colori e testi. <!-- size: L -->
- [ ] Adattare layout e input a schermi più piccoli, mantenendo desktop come target principale. <!-- size: M -->
- [ ] Aggiungere menu iniziale, scelta del seed, difficoltà e riepilogo della partita. <!-- size: M -->
- [ ] Preparare deploy statico, telemetria opt-in degli errori e gestione delle versioni dei salvataggi. <!-- size: M -->

**Gate:** ricaricare o aggiornare il browser non perde la partita e una build
statica può essere pubblicata senza strumenti di sviluppo.

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

- [ ] Sostituire `--hud-shadow` con una scala di elevazione a tre livelli (dock, <!-- size: M -->
  drawer, modale) e aggiungere a `.hud-surface` bordo interno chiaro, gradiente
  verticale e ombra di contatto: un pannello deve leggersi come un oggetto
  appoggiato, non come un rettangolo trasparente.
- [ ] Introdurre una cornice 9-slice via `border-image` con sorgente SVG in <!-- size: M -->
  `data:` URI, così i pannelli scalano senza deformare gli angoli e senza asset
  binari nel bundle.
- [ ] Far derivare i token di `hud.css` dal tema attivo: `applyTheme` scrive <!-- size: L -->
  `--hud-*` su `document.documentElement` a partire dalla palette del tema, e
  l'HUD cambia con il mondo invece di restare crema sotto un cielo al neon.

**Gate:** cambiando tema, HUD e scena restano riconoscibilmente lo stesso gioco;
nessun pannello perde contrasto AA sui sette temi.

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

- [ ] Sostituire il `delta` testuale con un indicatore di tendenza: freccia <!-- size: M -->
  direzionale, magnitudine e sparkline breve sulla finestra dei tick recenti.
  Niente `±0` a schermo quando non succede niente.
- [ ] Dove esiste un tetto (scorte di cibo contro consumo, banchi occupati), <!-- size: M -->
  mostrarlo come anello o barra di riempimento invece che come numero nudo.
- [ ] Numeri tabulari e conteggio animato sulle variazioni; stato di crisi con <!-- size: S -->
  pulsazione e colore, non solo con testo rosso.
- [ ] Su hover, popover con la scomposizione entrate/uscite della risorsa: la <!-- size: M -->
  domanda "perché sto perdendo denaro" oggi non ha risposta nell'HUD.

**Gate:** dallo sguardo alla barra si capisce in che direzione sta andando la
città senza aprire nessun pannello.

### Fase 7.4 — Strumenti

- [ ] Separare `locked` da `disabled`: il bottone bloccato mostra il requisito <!-- size: M -->
  mancante come riempimento progressivo (denaro accumulato sul costo, popolazione
  sulla soglia) invece di sbiadire. Bloccato deve leggersi come "manca poco".
- [ ] Tile icona-sopra-etichetta di dimensione uniforme, badge del tasto numerico <!-- size: M -->
  1..9, badge di costo con l'icona della risorsa di 7.2.
- [ ] Stato selezionato forte (non solo inversione di colore): cornice, sollevamento <!-- size: M -->
  e anteprima del raggio in-world coerente col colore dello strumento.
- [ ] I separatori di gruppo diventano guide etichettate continue, così crescita, <!-- size: S -->
  connessioni e identità si leggono come tre corsie e non come otto bottoni.

**Gate:** un giocatore nuovo, guardando solo il dock, sa cosa può costruire ora,
cosa gli manca per il resto e quale strumento ha in mano.

### Fase 7.5 — Movimento e feedback

- [ ] Micro-interazioni di pressione, spesa (il costo vola dal bottone alla barra) <!-- size: M -->
  e sblocco; stack di toast invece di uno solo che si sovrascrive.
- [ ] Feedback di piazzamento in-world — anello di selezione e impronta sul <!-- size: M -->
  terreno — invece della sola cursor card.
- [ ] Tutto sotto `prefers-reduced-motion` e sotto il budget: le animazioni sono <!-- size: S -->
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

- [x] Tutorial iniziale e feedback del raggio dei catalizzatori. <!-- size: M -->
- [x] Bilanciamento recuperabile di popolazione, cibo e produzione. <!-- size: M -->
- [x] Settori costieri unici che aggiungono terreno realmente edificabile. <!-- size: M -->
- [x] Costi continuativi e conseguenze visibili per le sei policy esistenti. <!-- size: M -->
- [x] Commerciale autonomo e primo edificio residenziale-commerciale a uso misto. <!-- size: L -->
- [x] Primo sistema di strade procedurali usato come scheletro della crescita (fase 4.1). <!-- size: XL -->
- [ ] Salvataggio locale minimo del ciclo completo. <!-- size: L -->
- [ ] Playtest di 30 minuti con budget e criteri automatici registrati. <!-- size: M -->
- [ ] Passata visiva su indicatori e strumenti: fasi 7.1, 7.3 e 7.4 (il resto <!-- size: L -->
  della fase 7 puo' seguire, ma barra risorse e dock vanno sistemati prima del playtest,
  altrimenti si misura la confusione della UI invece del bilanciamento).
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
vincolo tecnico. Una cosa però lo è: la fase 5 serializza il **registro degli
edifici**, e la 4.9 gli aggiunge piattaforme e quote. Salvare prima significa
versionare il formato due volte; salvare dopo significa giocare più a lungo senza
salvataggio. Va deciso, non lasciato all'inerzia.

Alpha 0.3 è completa quando dalla stessa inquadratura si contano due livelli
abitati sovrapposti e si segue un percorso continuo in quota fra due isolati
diversi; quando una partita che non arriva mai in quota resta identica a quella
di oggi; e quando determinismo e budget reggono con due livelli sovrapposti come
con uno.
