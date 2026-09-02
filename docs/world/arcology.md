# Arcologie

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **E' la quinta riga della stessa macchina**, dopo `landmark`, `span`, `aerial`
  e `aloft`: un `BuildingRecord` con `arcology` valorizzato eredita occupazione,
  collisione, budget di chunk e comparsa a budget, e a cambiare e' solo quale
  generatore disegna lo stamp. `level` e' lo **stadio**, come per un landmark, e
  il record sta fuori dal `levelHistogram`.
- **Non si posa: nasce da una condizione.** Non c'e' nessuno strumento in
  toolbar e nessuna riga in `src/sim/`. Le leve del giocatore restano quelle che
  ci sono gia' — dove piazza i catalizzatori, quali policy tiene accese — e
  `arcologyReady` legge cio' che ne e' venuto: fascia `core`, isolato che
  contiene l'ingombro, densita' costruita e **crescita effettivamente esaurita
  nei vicini**. Conta chi ha raggiunto la quota ammessa e anche l'ospite reso
  immutabile da un impalcato abitato: in quel caso la citta' in quota ha gia'
  consumato la possibilita' di promuoverlo. Questa e' la mezza riga che rende la
  fase quello che dice di essere: la megastruttura arriva dove la citta' non ha
  piu' niente da diventare, non dove e' semplicemente densa.
- **La condizione si racconta, e non si ricalcola.** `arcologyReady` restituisce
  il **primo** motivo e si ferma: e' cio' che serve a una passata che scarta un
  isolato, e non basta a chi vuole sapere se la citta' ci sta arrivando —
  `notCapped` non distingue «uno su due» da «zero su due», che sono due partite
  diverse. `prospect.ts` raccoglie percio' **tutte** le condizioni mancanti con
  `have`/`need`, leggendo le stesse soglie di `ARCOLOGY`; il driver le misura
  sullo stesso oggetto che sta per passare al predicato — quindi senza una
  scansione in piu' — e le espone su `Builder.stats.arcology`, da cui arrivano al
  coach, al cassetto Citta' e alla scheda dell'isolato. Un test lega la prima
  lacuna al rifiuto nelle due direzioni: due misure per la stessa domanda
  divergono alla prima ritaratura, ed e' gia' successo con i due raggi di
  `isCoastal`.
- **Cosa ferma davvero la condizione, misurato.** Seed 4242, otto catalizzatori
  del listino, 6000 tick: il campo satura a **255** e la soglia effettiva arriva
  a **293** contro i 198 di `BUILDER.upgradeThreshold`, quindi la desiderabilita'
  non e' piu' il tappo. Con il magazzino illimitato le torri raggiungono il
  livello 26 e **un'arcologia nasce**; con l'economia vera si fermano al livello
  **10** e `cappedNeighbours` resta zero. A tenere chiusa la condizione e'
  `upgradeMaterialCost` — `2·(livello−6)²`, da 32 a 578 unita' per singola
  promozione — contro una quota ammessa di 23 nel `core`. E' una taratura fra
  `src/world/buildings/` e `src/sim/`, non un numero di questo dominio: **non si
  abbassa `minCapped` per farla passare.**
- **Gli usi arrivano alla simulazione uno per fascia, su colonne distinte.**
  `record.uses` e' l'elenco di cio' che `addBuilding` ha **accettato**, in ordine
  di stadio: `tally` conta quelle voci invece della `class` del record, ed e'
  cosi' che `countsByClass` resta esattamente uguale a `state.buildingCounts`
  (invariante 7) mentre `src/sim/` continua a non avere una coordinata verticale.
  Un'arcologia e' quindi *un* record e *N* edifici per la simulazione:
  `registry.count` e `state.buildings.length` non coincidono, e la differenza e'
  esattamente la somma degli `uses`.
- **Cresce per delta, non per sagoma cumulativa.** L'inviluppo arriva a 735
  quote e non potrebbe entrare intero in `maxDirtyChunksPerBuilding`: ogni
  stadio accoda il proprio `from = stage`, e `trimStampZ` taglia le quote vuote
  perche' la stima sul riquadro sia onesta. Il tetto di 56 chunk vale per il
  delta non affettato; l'altezza si ottiene aggiungendo stadi, mai allungandone
  uno oltre il proprio budget. Senza il taglio una ricetta legittima verrebbe
  **scartata in silenzio**.
- **Le soglie dipendono dal numero di stadi, non dalla ricetta.** Il corpo parte
  a 50 vicini, sotto la condizione di fondazione, e ogni corona arriva a 93:
  `stageThresholds` interpola gli stadi intermedi su una curva quadratica. Una
  ricetta piu' articolata non diventa per questo meno probabile da completare.
- **Le sagome nuove si sommano alle matrici, non le sostituiscono.** Le otto
  ricette storiche restano in `BASE_ARCOLOGY_RECIPES`; ogni voce di
  `PROFILE_ARCOLOGY_RECIPES` dichiara `variationOf` e cambia il profilo con
  corpi che terminano su quote diverse. Il driver sceglie dall'unione dei due
  cataloghi, mentre test e campionario possono ancora distinguerli.
- **Il vuoto dentro l'ingombro e' un vincolo di ricetta.** `skyWindowOf` e
  `fillRatio` girano su ogni ricetta a ogni stadio: una finestra aperta non si
  richiude piu', e un'arcologia che riempie il proprio ingombro non compila la
  suite.
- **La famiglia interrata e' la stessa macchina scritta al contrario.**
  `recipe.sunken` la distingue, e la sua presenza *e'* la famiglia — nessuno
  chiede «di che tipo sei», come nessuno lo chiede a un `BuildingRecord` con
  `arcology` valorizzato. Le quote locali restano non negative: `z = 0` e' il
  **fondo del pozzo** e il piano di campagna sta a `sunken.depth`, in cima.
  A cambiare e' dove il driver posa l'ancora — `baseZ = padZ - depth` invece di
  `padZ` — ed e' per questo che non serve una coordinata negativa da nessuna
  parte. Tre misure che contavano dal basso si riferiscono percio' alla cima: la
  radice della connettivita' (`floatingBoxes` radica sul piano di campagna,
  perche' un earthscraper *pende* dal suolo invece di appoggiarcisi), il verso
  degli stadi, e l'opera di terra — che qui **non si getta affatto**, perche' il
  terreno dell'ingombro se ne va e la lastra della piazza prende il suo posto.
- **La condizione e' la cresta contro la spalla, e la fascia da sola non
  bastava.** L'arcologia nasce dove il cono della gerarchia concede tutta
  l'altezza che sa concedere; l'earthscraper sulla spalla, dove il tetto ha gia'
  cominciato a scendere. A distinguerle e' `heightBonusAt` — i livelli concessi
  *oltre* il tetto nudo della fascia — confrontato con `SKYLINE.coneBonus`: sopra
  si sale, sotto si scava. Le due non possono essere vere insieme, ed e' questo
  che tiene torri e crateri su isolati diversi senza che il driver arbitri; la
  gerarchia sceglie la famiglia **prima** della forma, e `arcologyForBlock` pesca
  da un catalogo o dall'altro, mai dall'unione.

  **La prima versione chiedeva `tier !== core`, e non aveva un solo sito.**
  Misurata su una citta' cresciuta (seed 4242, 2000 tick), la fascia non
  distingue niente di utile: quattordici isolati candidati, **quattro `core`,
  zero `middle`, dieci `fringe`**, e il denso e' tutto nei primi quattro. Non e'
  un caso — la crescita segue la desiderabilita', che segue i catalizzatori,
  quindi il tessuto fitto cade dentro la portata di un polo; cio' che resta fuori
  e' rado, e per giunta costiero, cioe' con il contorno bagnato che un pozzo non
  accetta. L'intersezione fra «non e' centro» e «ha i vicini che una
  megastruttura chiede» era vuota. Il bonus di quota lo evita per costruzione,
  perche' misura **dentro** la fascia: sugli stessi quattro isolati da' tre
  creste e una spalla, e la spalla e' anche la piu' profonda (28 quote, contorno
  asciutto). E' il difetto di `isPeakBlock` per la terza volta, e la casella che
  lo tiene chiuso e' «la condizione interrata ha davvero dei siti sull'isola».

  **Il sito puo' rimandare indietro la scelta.** Un isolato di spalla su cui la
  roccia non basta — meno di `MIN_SUNKEN_DEPTH`, o l'acqua troppo vicina — torna
  alla famiglia che sale invece di restare senza megastruttura: la gerarchia
  propone, il terreno dispone.
- **Il vuoto ha un invariante suo, e non e' la finestra di cielo.**
  `skyWindowOf` cerca uno scavalco e pretende con `seeThrough` una linea sgombera
  da un capo all'altro dell'inviluppo; un pozzo e' cieco su quattro fianchi per
  costruzione, quindi quella regola lo dichiarerebbe un cavedio — che e'
  esattamente il caso che `window.ts` esiste per escludere. `shaftOf` misura la
  domanda giusta: un vuoto **dal piano in giu'**, largo `minColumns` sulla
  sezione piu' stretta, profondo `minDepth`, che non tocca il bordo
  dell'inviluppo e da cui almeno una colonna vede il cielo. Le passerelle sulla
  bocca possono attraversarlo; sigillarlo no.
- **Le profondita' sono misurate, e la misura ha smentito il progetto.** Il piano
  di questa famiglia era tarato sul tetto di `TERRAIN.maxHeight`, che allora
  valeva 80, e prevedeva
  quarantaquattro, trentasei e ventiquattro quote. L'isola standard e' molto piu'
  piatta — la maschera radiale schiaccia il rilievo, e su 256x256 la colonna piu'
  alta sta fra 32 e 36 — quindi due ricette su tre non sarebbero **mai** nate,
  in silenzio e con la suite verde. E' lo stesso difetto di `isPeakBlock`, ed e'
  la seconda volta che questo dominio lo incontra: `sunkenSites.test.ts` e'
  l'allarme che resta. Le tre ricette stanno a sedici, ventidue e ventisei, e la
  profondita' persa si riguadagna in pianta — dall'inquadratura d'insieme un
  pozzo si legge per l'area del proprio vuoto, non per quanto scende.
- **Nessun piazzale, e non e' una casella aperta.** La piazza di un earthscraper
  *e'* il piano di campagna: ci si arriva camminando, e un attracco in quota
  sarebbe un capolinea che nessun percorso ha motivo di cercare.
- **I piazzali sono capi di percorso, e hanno tre requisiti misurati.** Devono
  stare entro `maxNodes * stepPerNode` dal piano finito, essere larghi almeno
  `walkWidth` su **tutti e due** gli assi, e non partire a filo di un piano
  solido della struttura — altrimenti la corsia nasce dentro il podio. Ognuno dei
  tre e' stato violato da una versione della ricetta con la suite pura tutta
  verde.
