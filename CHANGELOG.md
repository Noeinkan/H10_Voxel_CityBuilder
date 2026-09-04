# Changelog

Cosa è cambiato, dal più recente. Il *perché* delle scelte sta in
[README.md](README.md) e in [src/sim/README.md](src/sim/README.md); *dove sta
cosa* in [PROJECT_INDEX.md](PROJECT_INDEX.md); dove va il progetto in
[ROADMAP.md](ROADMAP.md).

Il progetto non è ancora versionato: ogni voce è un incremento, identificato dal
commit che lo chiude. Le voci descrivono il contenuto effettivo, che non sempre
coincide con il messaggio di commit.

Qui stanno **i tredici incrementi più recenti**; i precedenti sono archiviati in
[docs/changelog/](docs/changelog/), e li si trova per titolo da
[docs/changelog/README.md](docs/changelog/README.md). Un frammento di
`docs/pending/` si fonde sempre qui, mai in una scheda d'archivio.

---

## In corso — La congestione diventa geografia

- **Densificare ha un prezzo spaziale, e nessun veicolo lo trasporta.** La
  distanza dei catalizzatori è geodetica dalla 4.2, quindi mancava una cosa sola
  perché il traffico esistesse come *forma* invece che come simulazione:
  `src/world/congestion.ts` conta il volume costruito per tessera da otto celle
  e `createReachCost` lo somma al costo di attraversamento. Un quartiere che si
  infittisce diventa **lontano**, i campi che lo raggiungevano si accorciano, la
  desiderabilità cala e la crescita si sposta altrove. È il ciclo del traffico di
  Cities Skylines senza un veicolo e senza ricerca di percorso — e non collide
  con `src/world/traffic/`, dove barche e aerei restano pose in funzione del
  tempo.
- **Il termine si somma, e da lì seguono le due cose che tengono in piedi il
  resto.** Nessun costo scende, quindi il pavimento a 1 di `reach.ts` regge da
  solo e la portata non esce mai dal quadrato che il campo ricalcola; e la
  carreggiata resta la via più corta anche dentro l'ingorgo, perché paga lo
  stesso supplemento del tessuto partendo da meno. Caricare la sola carreggiata
  — la lettera del piano — era stato provato e non funziona: il tessuto costa
  1,25, quindi l'influenza avrebbe aggirato l'isolato per un quarto di cella e il
  quartiere denso non sarebbe mai diventato lontano.
- **La misura, su una città cresciuta di 1.200 tick.** Braccio di controllo — il
  carico si calcola e il campo si rifà con la stessa cadenza, ma il costo non lo
  legge — contro braccio ingorgato: il volume costruito nel centro scende da
  22,2k a 14,9k voxel (−33%), il livello medio degli edifici del centro da 1,37 a
  1,16, il volume di tutta la città da 101k a 90k. Gli edifici invece salgono da
  154 a 177: **la città si allarga invece di impilarsi**, che è esattamente il
  prezzo che si voleva mettere. Un catalizzatore di transito piantato a metà
  corsa riporta il carico mediano da 0,32 a 0,10, il livello medio del centro a
  1,57 e il volume a 100k: il quartiere riparte, e si vede in due minuti di
  partita.
- **Il costo vero era l'invalidazione, e infatti costa tutto lei.** Rifare il
  carico dal registry sono 0,19 ms; rifare il campo che ne dipende sono 52 ms
  sulla città del benchmark e 90 su un'isola cresciuta, cioè il doppio di un
  `setPolicyActive`. `GrowthScene.syncCongestion` lo chiama quindi a scaglioni di
  sessantaquattro edifici — lo stesso segnale con cui `syncTraffic` rifà le rotte
  — contando le **promozioni** insieme alle comparse, perché un upgrade non muove
  `registry.count` ma raddoppia il volume sulla stessa impronta.
- **La firma dice «guarda», il carico dice «rifai».** `CongestionMap.rebuild`
  restituisce se il carico si è mosso oltre un centesimo di cella, e solo allora
  il campo si rifà. Su diciannove ruoli quindici non alleggeriscono niente e un
  edificio in periferia non satura nessuna tessera: quei casi costano il quinto
  di millisecondo e si fermano lì. Su 1.200 tick di partita sono quattro
  ricostruzioni in tutto.
- **I catalizzatori entrano senza scaglione.** Sono un gesto del giocatore e sono
  unità, non migliaia: il sollievo di una stazione deve vedersi al click, e
  aspettare altri sessantatré edifici sarebbe la stessa risposta muta che
  l'ingorgo esiste per togliere. Alleggeriscono transito, aeroporto, porto e
  traghetto, più i due capi di ogni funivia — la fune no, perché una linea che
  alleggerisse tutto ciò che scavalca renderebbe scorrevole proprio il centro che
  ha attraversato senza fermarsi.

## In corso — Il suolo pubblico e l'arretramento del tessuto

- **La carreggiata è suolo preso, come un edificio.** `SurfaceQueue.canPaint` si
  rifiutava già di asfaltare una colonna occupata, ma nessuno impediva il gesto
  opposto: la ricerca del lotto chiedeva l'affaccio come *preferenza* e non
  guardava mai se la strada fosse proprio lì sotto. Su un'isola cresciuta —
  256×256, seme 1337, 1200 tick — **499 colonne di carreggiata su 821 finivano
  sotto un edificio**, cioè non venivano mai dipinte: la strada esisteva nei dati
  e non a schermo. È l'intera spiegazione del «non si vedono strade». Adesso
  `LotSearch.columnIsFree` la boccia, e l'affaccio resta quello che era — una
  preferenza sul *dove*, non un divieto sul *sopra*.
- **Una strada che si sposta libera il suolo che teneva.** È il quarto modo, dopo
  il registry, l'impalcato e il terreno, e si è portato il proprio contatore come
  `freedomEpoch` chiedeva: `RoadNetwork.revision` sale a ogni ripianificazione e
  a ogni capillare nuovo. Senza, un isolato dichiarato pieno restava pieno
  rispetto a un tracciato che non passava più di lì.
- **Il tessuto lascia un cortile: `BUILDER.backSetback`.** Due colonne d'aria
  davanti e dietro, **i fianchi no** — ed è quella asimmetria la regola. Due case
  che condividono il muro di fianco fanno un fronte continuo sulla strada, che è
  ciò che `Frontage.snap` cerca apposta; le stesse due case saldate sul retro
  fanno sparire il cortile, e con lui l'unico vuoto da cui la strada dietro si
  vedrebbe. L'orientamento è ciò che dice quali due lati sono la fila e quali la
  profondità, quindi la domanda arriva **dopo** `facingAt`: `placeLot` ha ora una
  terza passata, e ognuna rinuncia a un requisito — affaccio più arretramento,
  poi il solo arretramento, poi niente. Un requisito che non sapesse rinunciare
  fermerebbe la crescita appena l'area satura.
- **Il capillare parte dal portone, non dall'ancora del lotto.** L'ancora sta
  *dentro* l'edificio: le prime colonne del vicolo cadevano sotto la casa che le
  aveva chieste, e lì non si asfalta più. Erano 311 vicoli su 639. Sulla battigia
  si torna all'ancora, e non è un dettaglio: la sonda del tracciato prende come
  piano il pelo dell'acqua, quindi un vicolo che parta dal bassofondo si posa
  alla quota del mare mentre la colonna accanto resta il fondale — un salto da
  sedici voxel fra due colonne contigue di carreggiata, che un test già copriva.
- **Allargarsi è costruire.** `UpgradeDriver.fitsWider` guardava i vicini e non
  la strada: era la porta di servizio da cui un edificio finiva in mezzo alla
  carreggiata che la ricerca del lotto gli aveva vietato. Guarda solo le colonne
  **nuove** — un edificio nato prima del tracciato può averne una sotto di sé, e
  leggergliela come un divieto lo condannerebbe a non promuovere mai.
- **`ROADS.builtCost` da 6 a 12.** Il commento diceva «quanto sei colonne libere»
  e ne valeva tre, perché `landCost` è 2: la deviazione doveva restare sotto le
  tre colonne per convenire, e non conviene quasi mai. Il numero ha senso adesso
  e non prima — su un tessuto saldato non c'era nessun varco da trovare. Misurato
  sulla stessa isola: carreggiata sepolta e tempo di simulazione vanno insieme, a
  sei 42% in 28 s, a dodici 34% in 31 s, a venti 29% in 42 s.
- **Il risultato, sulla stessa isola.** Aria attorno agli edifici dal 42% al 53%
  del perimetro, contatto muro contro muro dal 57% al 39% — e il contatto *in
  profondità*, quello che chiude i cortili, giù del 45%. Colonne di carreggiata
  visibili da 322 a 751.
- **`cityDigest` è stata rigenerata, e le partite salvate non tornano più
  uguali.** Era il caso dichiarato: `findLot` elegge altre colonne, ed è
  esattamente ciò che quell'impronta esiste per rendere visibile. Nello stesso
  intervallo si è mosso anche il repertorio delle tipologie, che la firma legge:
  il valore nuovo tiene dentro tutte e due le cause.

## In corso — Sostegno e feedback nel menu principale

- **Una pillola «Support» e una «Feedback» nel piede del menu principale.** Stanno sotto la firma e non fra le voci: nessuna delle due riguarda la citta' aperta, e chi le cerca le cerca dove c'e' scritto chi l'ha fatta. Il sostegno e' un semplice collegamento a Ko-fi in una scheda nuova — nessun pagamento passa dal gioco.
- **L'etichetta del sostegno non puo' dire «Donate», ed e' un vincolo di piattaforma.** Ko-fi riserva quella parola, e «Donation» e «Charity», alle non profit registrate e verificate, e segnala a posteriori chi le usa senza esserlo. `community.ts` lo scrive accanto alla costante e un test lo tiene vero su etichetta e titolo insieme.
- **La nota di feedback e' una sottoschermata del menu, non una seconda modale.** Il menu ha gia' il suo velo, la sua trappola del `Tab` e il suo `Esc` che torna all'elenco: vestendosi da pannello come «Settings» eredita tutto senza aggiungere un modo. La lista dei comandi raggiungibili dal `Tab` si e' allargata a riquadri di testo, `summary` e collegamenti, che prima nella colonna non esistevano.
- **Il pannello da cui si copia la nota non e' un ripiego.** La consegna e' un `mailto:`, cioe' un passaggio di consegne a un programma che potrebbe non esserci: e' l'unico gesto del gioco il cui fallimento e' invisibile — chi scrive vede un bottone che non ha fatto niente, e noi vediamo un silenzio identico a «nessuno aveva niente da dire». La nota composta resta percio' sempre a schermo accanto all'indirizzo, e l'esito dice «should be opening», mai «sent»: nessuno qui ha visto partire niente.
- **Il contesto allegato dichiara quattro fatti e mostra i valori veri.** Edizione, la partita in una riga con il seed, la finestra e il browser: niente nomi utente, niente percorsi, niente dal `localStorage`. La spunta si toglie, e allora la sezione non si scrive proprio; un test blocca il quinto campo che entrasse senza passare dalla dichiarazione a schermo.

## In corso — Il ritmo: un anno che si vede e si sente

- **La resa ha una stagione, e la stagione è una funzione del tick.**
  `src/sim/seasons.ts` legge `tickCount` e non tiene niente: fase dell'anno,
  stagione e moltiplicatore del raccolto discendono tutti da lì, quindi non c'è
  campo nuovo da salvare né modo che si sfasino fra loro. Un anno dura 3600 tick,
  cioè lo stesso tempo reale di un giro del sole a velocità 1: le due lancette
  non si sincronizzano — l'anno si ferma in pausa, il sole no — ma partono dallo
  stesso passo, ed è quanto basta perché un inverno non cominci e finisca dentro
  la stessa notte.
- **È un seno e non quattro gradini, e le due proprietà che ne discendono sono
  il punto.** La media sull'anno vale esattamente uno, quindi `missingPlotsOf`
  continua a dimensionare la campagna su un numero onesto senza sapere che mese
  sia; e non esiste un tick in cui il raccolto salti, che a schermo si leggerebbe
  come un guasto invece che come una stagione. Il picco sta a metà estate e il
  minimo a metà inverno, con primavera e autunno a valere uno al loro centro.
- **L'ampiezza è tarata contro il piano, non a occhio.** A 0,35 una campagna
  dimensionata come `food.targetCoverage` la vuole attraversa l'inverno con la
  sola scorta accumulata prima: `seasons.test.ts` lo verifica integrando l'anno
  tick per tick, e la scorta tocca il fondo senza andarci sotto. È ciò che rende
  la stagione un ritmo invece che una carestia annuale che nessuna mossa evita.
- **Il fronte dell'emergenza alimentare guarda la campagna, non il mese.**
  `foodCoverage` si misura ora sul raccolto **all'anno medio**: un fronte che
  leggesse la resa di oggi si disarmerebbe e riarmerebbe una volta l'anno senza
  che nessuno avesse fatto niente, e l'allarme sarebbe tornato a essere rumore —
  esattamente ciò contro cui `recoveryCoverage` era stato scritto.
- **E la carestia si dichiara solo se c'è qualcosa da risolvere.** Alla
  condizione dell'emergenza si aggiunge una metà strutturale: `foodDeficitOf`
  positivo, cioè la campagna non basta all'anno medio. Senza, una città appena
  cresciuta oltre i propri campi avrebbe aperto la stessa scelta ogni dicembre, e
  la primavera l'avrebbe chiusa da sola.
- **Il prato ingiallisce e imbianca riusando i sette temi.**
  `src/engine/season.ts` è a `daylight.ts` quello che la stagione è all'ora:
  entra una fase, esce lo stesso tema piegato. Tocca i quattro slot di prato
  della palette e tre cose nell'atmosfera — il rimbalzo dal terreno, che *è* il
  prato visto da sotto, più nebbia e orizzonte. Nessuna geometria: i vertici
  portano l'indice di palette, non il colore. Il verde scritto in un tema è il
  suo verde d'estate, e a metà estate le due funzioni restituiscono il tema per
  identità — così i temi restano sette e non ventotto.
- **Rigoglio, oro e brina sono la stessa fase letta con tre sfasature.** Non tre
  tabelle che possono divergere: l'oro sale mentre il rigoglio scende, ed è ciò
  che rende ottobre diverso sia da settembre sia da novembre senza che nessuno lo
  debba scrivere.
- **`AtmosphereControl` possiede l'anno accanto all'ora**, con un passo minimo
  proprio: una stagione costa anche trentadue colori riscritti, e a sessanta
  hertz sarebbe la stessa palette per un giallo che non si distingue. Il `look` —
  il tema come si vede adesso — è nuovo e pubblico, perché pioggia e traffico
  leggevano `theme.colors` e avrebbero dipinto la città di un altro mese.
- **`?season=<0..1>` e `__voxelSeason(phase)`**, come `?hour=` fa con l'ora:
  servono a guardare un inverno senza aspettare i quattro minuti che la partita
  ci mette ad arrivarci, e a catturare i sette temi nella stessa stagione. L'hook
  torna anche il moltiplicatore del raccolto, che è il modo di verificare che
  colore e resa stiano nello stesso mese.
- **L'HUD nomina la stagione quando sposta la resa, e tace quando non la
  sposta.** Anche a città sfamata: senza, l'unico modo di accorgersi che la
  dispensa sta calando sarebbe guardarla scendere per un minuto, e una scorta che
  non si vede non è una mossa. Il pannello di ispezione fa la stessa distinzione
  su un isolato — la capacità resta la resa dell'anno medio, il valore corrente
  porta braccia e mese.

## In corso — La torre si può misurare, non solo aspettare

- **`nearestTowerProspect`, il luogo di cui parlare.** La torre idroponica è la
  leva principale del cibo tardivo e l'unica che il giocatore non piazza: nasce
  se un edificio industriale dentro il raggio di una serra supera insieme le due
  soglie di `farming`. `specializationGapsOf` sapeva già dire cosa manca **a un
  luogo**; il pezzo mancante era scegliere il luogo, e sono gli edifici
  industriali, i soli da cui una torre possa nascere.
- **Il tip dice due numeri e un gesto, invece del gesto generico.** «Sovrapponi
  l'anello alla fabbrica» resta vero anche quando l'anello è già sovrapposto, e
  da lì in poi il giocatore aspettava senza sapere se stava aspettando qualcosa
  che sarebbe arrivato. Ora legge «the best block is at 31% density, towers need
  40%», e il gesto lo sceglie la metrica: sotto densità un mercato accanto, sotto
  industria un'altra fabbrica nell'anello.
- **Il silenzio ha due cause e una sola lettura.** `null` sia dove non c'è
  candidato, sia dove un candidato qualifica già — lì la torre arriva alla
  prossima promozione e un consiglio sarebbe rumore. Il gap di **ruolo** invece
  ricade sul messaggio generico, che per quel caso ha già le parole giuste: due
  frasi per lo stesso fatto sarebbero due da tenere allineate.
- **Filtro geometrico prima del profilo.** Chi chiama gira a ogni tick e
  `urbanProfileAt` costa un giro su tutti i catalizzatori. Il cerchio euclideo è
  più largo della portata vera, che segue le strade, ed è ciò che serve a un
  filtro: scarta solo chi è fuori di sicuro, e la verità la dice il profilo.
- **`gapRatio` esportata da `districts.ts` invece di riscritta.** Lì ordina le
  specializzazioni di un luogo, qui i luoghi per la stessa specializzazione: due
  domande sullo stesso metro, e due copie sarebbero divergute alla prima
  ritaratura.
- **Le metriche del profilo stanno in [0, 1], e a schermo vanno in percentuale.**
  Difetto trovato dalla sonda e non dai test: arrotondarle com'erano dava «0 of 0
  density», due zeri al posto di 31% e 40% — una riga peggiore di quella generica
  che sostituiva. Il test ora lega i due numeri a essere numeri e il secondo a
  stare sopra il primo.

## In corso — Il quartiere denso: vetrine e terrazze

- **Il piano terra del commercio e' una vetrina, non un muro con una porta.** `onPortal` apriva **un** modulo d'ingresso al centro del lato principale — la risposta giusta per un portone, sbagliata per un isolato commerciale, che la strada ce l'ha vetrata da un cantonale all'altro. `PaintRequest.shopfront` apre il fronte attivo su tutta la parete su strada della fascia zero, sopra lo zoccolo; il portone resta dov'era e scende fino al marciapiede, che e' l'unica cosa che lo distingue dalla vetrina quando sono lo stesso linguaggio di superficie. La riga la accende il commercio, **anche quando sta sotto qualcos'altro**: un podio commerciale con le case sopra e' la riga piu' comune del catalogo ed e' proprio il caso in cui la strada e' vetrata e i piani alti no.
- **Non e' solo pittura.** `frontage` nel mesher cerca un portale **sotto** una faccia per decidere se quella faccia guarda la via: con la vetrina continua tende, lembi e telai d'ingresso smettono di essere un accento sopra la porta e diventano la pensilina di tutto il fronte, mentre calate e scale esterne si spostano sul retro da sole.
- **Il commercio non produceva una terrazza, ed era una voce mancante nel repertorio.** Arretrava solo con `shrink`, che toglie un passo **per lato**: la pianta si stringe quanto con un `setback`, ma l'anello scoperto che resta e' largo un passo e `terraceMinRing` lo scarta apposta — a distanza di gioco e' un gradino, non un luogo. Misurato su ventiquattro torri di livello dodici: **zero** celle di terrazza contro le 222 del residenziale. Con `setback` in testa a `shrinkOps` e `shrinkBias` da 0,24 a 0,40 sono **442**.
- **Alzare `shrinkBias` sul residenziale non produce piu' terrazze**, ed e' stato misurato prima di non farlo: a 0,46 il conto passa da 222 a 224. Il collo di bottiglia non e' la frequenza del ramo che rimpicciolisce ma `minBandSide`, che il corpo residenziale tocca entro le prime fasce. Il numero resta 0,38 e la nota sta accanto a lui, cosi' il prossimo che ci prova legge la misura invece di rifarla.
- **I tetti abitati sono la regola su residenziale e commercio.** `roofGarden` lo dichiaravano otto righe di catalogo su cinquantatre: da un quartiere denso visto dall'alto usciva una scacchiera di lastre nude con qualche macchia verde. Ora lo dichiarano quasi tutte le righe dei due usi abitati; restano scoperte l'industria, il civico, e le due che un tetto abitabile non ce l'hanno — il magazzino doganale e la gradinata.
- **La piscina sta con il giardino e non con gli impianti.** `microGarden.ts` prende anche le vasche sulle terrazze pavimentate: un serbatoio e un condizionatore dicono che lassu' c'e' una macchina, una vasca dice che lassu' si sta. Lo specchio esce con `WATER_CLASS.canal`, o il fragment gli darebbe la risposta di default — onda lunga e riflesso del sole, cioe' mare aperto — su dieci sedicesimi di lato.

## In corso — Residenza contemporanea

- **Il luogo che il catalogo non nominava: denaro senza folla.** `modernRow`,
  `modernCorner` e `modernCourt` sono le prime righe residenziali con un
  **tetto** di densità invece di un minimo: ricchezza sopra 0.4, densità sotto
  0.45, dal livello in cui la campata compare. La periferia benestante fino a
  ieri cadeva sul ripiego, cioè usciva con la stessa casa a schiera smussata
  della campagna. Volume netto senza smusso, coronamento piatto e campata
  stretta a passo due: il repertorio sposta il corpo invece di rastremarlo, e la
  fila esce sfalsata invece che a piramide. Le quattro verticali e la stecca le
  dichiarano fra le proprie provenienze, così un quartiere che si infittisce
  continua a salire.
- **Tre righe e non una, perché una sola riga è venti case uguali.** Ricchezza,
  densità e livello sono costanti dentro un isolato: una tipologia per quel
  luogo la stampa identica su ogni lotto. Le tre si separano sul **ruolo del
  lotto**, che è l'unico fatto discreto che dentro un isolato cambia — la stessa
  mossa già fatta in alto per le tre verticali, portata alla scala bassa. Il
  fronte porta la schiera con lo sbalzo sopra l'ingresso; l'angolo il volume
  sovrapposto (`stack` in testa, cima a gradoni, interpiano più alto) che chiude
  la testata, e lo prende un livello più tardi, così in un quartiere giovane si
  vedono le teste ancora basse e i fronti già moderni; il cuore la casa larga e
  bassa col tetto piantato, senza sbalzo perché sotto non c'è un marciapiede ma
  il vicino.
- **Due tessuti nuovi per la materia che mancava: il pannello scuro.**
  `panelRender` (intonaco chiaro) e `sandBrick` (mattone sabbia) portano
  entrambi la cornice sul tono più scuro della palette. Gli otto stili
  esistenti accostavano sempre due toni della stessa famiglia sul voxel di
  sommità della fascia, e a distanza di gioco quel marcapiano non si vedeva:
  con lo stacco, la stessa fascia legge come serramento continuo invece che
  come cornicione. È la correzione già fatta una volta su `terraceArcade`,
  portata a scala di quartiere — e serve, perché lo stile si applica **dopo**
  la tipologia e sarebbe altrimenti il quartiere a cancellare la coppia
  chiaro-scuro delle tre righe contemporanee in otto casi su dieci. La forma
  resta comunque loro: dove il tessuto è di mattoni o di pietra, la schiera
  moderna esce di mattoni e continua a leggersi come recente dal volume.

## In corso — Il verso che mancava ai materiali

- **`materialImports`, la quarta modalità commerciale.** Il molo scaricava cibo e
  caricava materiali, e basta: la risorsa che ferma i cantieri era anche l'unica
  senza un canale in entrata. Il conto delle leve non tornava — sette sul cibo
  (serra, porto, aeroporto, priorità commerciale, due carte, un mandato), due e
  mezzo sui materiali, di cui una che compare quando decide la simulazione — e
  `materialFlows.waitingCost` era l'unico posto in cui l'HUD dichiarava un
  problema senza offrire un gesto. Adesso il gesto c'è, e si gira dallo stesso
  pannello delle altre tre.
- **Comprare costa più di rivendere, di proposito.** `importMaterialPrice` (1,6)
  sta sopra il miglior ricavo d'esportazione (1,32, l'aeroporto): il margine
  rende l'acquisto una perdita consapevole e chiude l'arbitraggio che nascerebbe
  alternando le modalità a mano — i due versi si escludono dentro un tick, non
  fra due, ed è un contratto verificato su tutte le modalità.
- **La dispensa ha la precedenza sui fondi del cantiere.** I due canali attingono
  alla stessa cassa e `resolveExternalTrade` serve prima il cibo: una città che
  compra travi mentre smette di mangiare perde gli abitanti che il cantiere
  serviva. A fondi scarsi le travi prendono solo il residuo, e se non ne resta
  il canale non parte affatto.
- **Il bersaglio è `importMaterialTarget` per edificio, non la riserva.** Sei
  contro due: la riserva è il cuscinetto sotto cui non scendere, mentre un
  cantiere di arcologia da solo ne chiede 200. Puntare al cuscinetto avrebbe
  lasciato fermo esattamente il cantiere per cui la modalità esiste.
- **`TradeReport.materialsIn` e `MaterialsReport.imported` sono campi propri**, non
  il segno di `materials` né un `produced` gonfiato. Il primo perché `exported`
  ha già dei lettori che non devono imparare un verso; il secondo perché
  «la città sa farsi le sue travi?» e «se le sta comprando?» sono due domande
  diverse, e sommarle farebbe sembrare sana la città che sta solo spendendo.
  L'HUD mostra `Imports` fra le entrate dei materiali, e il cassetto Città
  scambia l'etichetta della riga invece di tenerne due, una delle quali sempre
  a zero.
- **I salvataggi anteriori tornano coerenti**: `reviveSimState` riempie
  `materialFlows` per spread su `EMPTY_MATERIALS`, come già faceva per `trade`,
  invece di lasciare `undefined` dentro un campo dichiarato obbligatorio.

## In corso — Strade organiche: la verifica sull'isola vera

- **Il tracciato si e' guardato su un'isola generata, non su una fixture piatta.** Una sonda `vite-node` fa crescere una citta' su terreno vero e stampa la rete in ASCII: e' li' che si sono visti i tre difetti che nessun test poteva mostrare, perche' erano tutti proprieta' della *forma*.
- **La diagonale ora costa la sua lunghezza.** Contata quanto un passo in asse — come fa ogni ricerca a otto vicini scritta senza pensarci — la diagonale era la mossa piu' economica del grafo, e ogni cammino la saturava prima di raddrizzarsi: a schermo, righe a quarantacinque gradi lunghe mezza isola. Con `diagonalCost` il costo torna proporzionale alla lunghezza e il minimo diventa una geodetica del campo di costo.
- **Un termine continuo sotto il costo del terreno.** Pendenza piu' un campo di divagazione liscio, in `terrainCost.ts`: i quattro costi a gradini lasciavano migliaia di cammini dello stesso prezzo, e senza una risposta migliore delle altre tanto valeva la piu' dritta. La divagazione resta sotto il salto fra due gradini, cosi' piega il tracciato senza riordinare il terreno.
- **Il capillare e' tornato un passo carraio.** `laneReach` da 96 a 24: una casa isolata si tirava dietro settanta colonne di vicolo, e la somma dei vicoli superava l'intera rete dei poli — con la fascia di fronte strada dilatata su tutta l'isola, il che rendeva la preferenza per l'affaccio incapace di discriminare. Misurato: 1011 colonne di carreggiata contro 531, e il tessuto affacciato torna una misura vera.
- **I viadotti esistono davvero.** Erano zero in ogni misura, comprese quelle su un'isola generata: a `waterCost` 20 nessun braccio di mare valeva un ponte, e l'intero ramo era codice non percorso. Ora una strozzatura si scavalca e una baia larga si costeggia, e `RoadNetwork.test.ts` verifica le due cose su un canale con le rive in pendenza.
- **Il franco di una campata si misura sotto tutto l'impalcato.** Misurandolo sulla sola linea d'asse, le colonne di bordo — che l'allargamento aggiunge — passavano a quattro voxel da uno scoglio invece di sei. Ora il riquadro e' quello vero, ma conta solo cio' che non regge: la terra di fianco e' la riva su cui il ponte atterra, e pretendere il franco anche sopra di lei alzerebbe l'impalcato per scavalcare la propria spalla.

## In corso — Il verde di copertura diventa un luogo

- **I giardini pensili smettono di essere macchie piatte.** `paint.ts` tingeva di verde il cuore di una terrazza e lo lasciava `SURFACE_KIND.plain`; `collectSurfaceCells` scarta il `plain`, quindi nessun emettitore vedeva quelle celle e dall'alto un giardino era una campitura alla stessa quota del tetto. Il nuovo `microGarden.ts` ci posa il suo vocabolario: fioriera di bordo lungo il ciglio dell'aiuola, chiome con fusto, cespugli fra l'una e l'altra.
- **Nessun linguaggio di superficie nuovo e nessuna scansione in piu'** (invarianti 4 e 5). Un giardino si riconosce da cio' che gia' lo descrive — uno slot d'erba, l'aria sopra, e **un costruito sotto**: e' l'ultima condizione a distinguerlo da ogni prateria dell'isola, che e' erba e `plain` esattamente come lui. Le celle le raccoglie `collectSurfaceCells` nel ramo in cui gia' scartava il `plain`, e `SurfaceCells` porta la lista accanto a quelle per superficie.
- **L'albero si aggancia al pieno attorno, non al verde attorno.** Chiedere il verde su tutti e quattro i lati — la regola di `interiorRoof` sul tetto tecnico — dava **zero chiome su ogni tipologia del catalogo**: il giardino di un edificio vero e' quasi sempre l'anello di una rientranza, largo uno o due voxel, e un anello non ha un interno. La chioma vive dentro la propria cella, quindi le serve solo di non stare sul filo del vuoto. Misurato su ventiquattro edifici `gardenHousing`: 488 celle piantate, 59 chiome.
- **Sta prima delle vasche nella sequenza dei prop**, con lo stesso argomento con cui il coronamento sta prima di loro: da una camera isometrica il tetto e' meta' di cio' che si vede, e un giardino piantato lo racconta piu' di un serbatoio.

## In corso — Strade organiche al posto del reticolo

- **Il reticolo quadrato non si dipinge piu', e al suo posto c'e' un tracciato.**
  `streets/` resta il **catasto** — funzione pura di `(seed, x, y)`, invisibile,
  ed e' l'unita' con cui si lottizza — mentre `src/world/roads/` e' la **strada**
  che si vede. Erano lo stesso oggetto, ed e' per questo che a schermo compariva
  una maglia ortogonale: la citta' mostrava il proprio catasto.
- **La forma la decide il rilievo, non un rumore.** `traceRoad` cerca il cammino
  a costo minimo su otto vicini con il dislivello come costo del passo: salire
  costa quattro volte una colonna piana e oltre `maxRise` non si sale affatto,
  quindi fra due punti separati da un pendio il minimo non e' la retta ma la
  diagonale che taglia il pendio — cioe' una curva di livello, e un tornante dove
  il pendio e' troppo ripido per essere tagliato in un colpo.
- **Le strade portano al centro perche' il centro e' la radice.** L'albero cresce
  dal polo piu' forte e ogni altro polo si attacca alla **prima carreggiata che
  incontra**, non al polo piu' vicino: attaccarsi a un polo darebbe raggi che si
  incrociano senza toccarsi, attaccarsi alla rete da' un raccordo che confluisce.
- **Il rango non si dichiara, si misura.** Ogni tratto porta il proprio carico —
  quanti poli ci passano sopra per arrivare al centro — e la larghezza esce da
  li'. Nessuna tabella dice quale sia l'autostrada: e' l'autostrada perche' ci
  passa tutta la citta', e un catalizzatore piantato dall'altra parte dell'isola
  la sposta da solo. Tre ranghi sottili — vicolo da un voxel, strada da due,
  viale da tre — piu' il tronco da sei: il salto e' brusco di proposito, perche'
  una gerarchia che cresce di un voxel per rango non si legge affatto.
- **I viadotti non si progettano, si riconoscono.** Le corse di colonne che non
  reggono una carreggiata appoggiata — una baia, un quartiere fitto — diventano
  campate se sono abbastanza lunghe: spalle a terra, impalcato piano sopra il
  franco, e una pila ogni otto colonne. Sotto la soglia il tratto resta a terra,
  perche' un viadotto da due campate legge come un errore di posa.
- **L'influenza segue le strade che esistono davvero.** `createReachCost` leggeva
  `StreetNetwork.isPavement`, cioe' il catasto: una funzione del solo seed, vera
  su tutto il piano e — da quando l'anello perimetrale non si dipinge — del tutto
  invisibile. La desiderabilita' correva quindi lungo carreggiate fantasma, e la
  citta' si allargava in un disco. Adesso la sorgente e' il tracciato: le stesse
  colonne che si vedono, e nient'altro.
- **Il tessuto cerca il fronte strada, e non e' un rifiuto.** `placeLot` percorre
  il rettangolo due volte: la prima accetta solo gli ancoraggi con un affaccio,
  la seconda non guarda piu' nessuno. Le case si addensano lungo la carreggiata e
  si diradano allontanandosene, senza vuoti netti e senza che una colonna lontana
  diventi inedificabile. La fascia di affaccio e' un indice dilatato una volta
  per rete e non una misura per ancoraggio: misurarla costava sedici milioni di
  letture per lotto, e la batteria del `Builder` passava da 57 a 460 secondi.
- **I capillari sono l'unica parte della rete che cresca con la citta'.** Un
  edificio che nasce oltre `frontageReach` dalla carreggiata si tira dietro un
  vicolo da un voxel fino alla prima strada che incontra, e lo fa nell'istante in
  cui nasce: cosi' il lotto successivo trova gia' un affaccio. Senza, il tracciato
  resterebbe la manciata di tratti fra i catalizzatori e il tessuto non avrebbe su
  cosa affacciarsi.

## In corso — Il record multi-rettangolo: un edificio, due sedimi

- **Cade «un edificio, un rettangolo».** `BuildingRecord.parts` elenca gli
  *altri* sedimi di un record, e `plotOf` li restituisce separati: `index` e
  `unindex` scandiscono quelli invece dell'inviluppo unico. Prendere il riquadro
  che li contiene sarebbe stata una riga in meno e una strada in meno — sotto un
  edificio non ci passerebbe piu' niente. `boundsOf` esiste per chi ha bisogno di
  *un* rettangolo — il conto dei chunk, la tela della sagoma — e non dice cosa il
  record prenota.
- **Il produttore e' la fusione che attraversa la strada**, ed e' il pezzo che
  chiude l'arco cominciato con la campata. Due edifici che si sono trovati con un
  arco hanno gia' la quota comune e la parete d'imposta: la fusione li rende un
  record solo, il lotto del dirimpettaio diventa un sedime del sopravvissuto, e
  il mezzo braccio diventa la campata intera. Il vuoto in mezzo resta vuoto e
  resta suolo pubblico.
- **Senza produttore sarebbe stato codice morto**, ed e' la lezione che
  l'incremento della campata aveva appena insegnato: una regola puo' essere
  giusta e insieme irraggiungibile, e le due cose si distinguono solo facendo
  girare la citta'.
- **I sedimi in piu' non conservano l'edificio che c'era.** Il secondo corpo si
  disegna con un sotto-seme del sopravvissuto, al suo livello e con la sua
  tipologia: e' lui che si e' allungato fin la'. E' anche l'unica lettura che non
  chiede altro stato — un rettangolo basta, e il record non si porta dietro seme,
  livello e stile di un edificio che non esiste piu'.
- **Il rinfianco si specchia quando l'arco non incontra nessuno.** `mate` a zero
  dice che il braccio va a finire su un secondo sedime dello stesso record:
  l'arco e' intero e non piu' mezzo, quindi la spalla si allarga a tutti e due i
  capi. Con un dirimpettaio la seconda meta' la disegna lui, ed e' proprio quel
  raccordo a farne una campata.
- **Il salvataggio non ha una versione nuova**: `parts` e' un elenco di rettangoli
  e viaggia con il record come ogni altro campo, e `recordStamp` sa ridisegnare
  la sagoma intera — che e' l'unica condizione che la cattura pone.

## In corso — La fusione: due edifici diventano uno

- **Quando lo spazio libero finisce, ci si prende il vicino.** La scala
  d'impronta allarga un edificio finche' l'isolato ha prato; da li' in poi la
  promozione poteva solo salire, e nel centro denso — dove il prato non c'e' mai
  — non cambiava piu' niente. La fusione e' il gradino successivo: un edificio
  arrivato al primo scalino d'impronta assorbe un vicino piu' basso e ne prende
  il lotto.
- **Nessuna geometria nuova.** `assembleBuilding` sapeva gia' disegnare *un*
  record come piu' masse su un podio condiviso, con il vuoto in mezzo dipinto a
  terrazza: la citta' ha sempre avuto l'edificio che si separa e si ritrova, e a
  mancare era soltanto l'evento che due lotti diventino quel lotto. Questo
  incremento aggiunge l'evento.
- **Non c'e' una seconda demolizione.** La fusione apre i cantieri di
  `ClearanceSites` — la stessa macchina del monumento che si fa posto, del
  declino e della gomma — e aspetta: a smontare i voxel a budget, a togliere i
  record e a dirlo alla simulazione e' quella. Un cantiere per assorbito, sul suo
  inviluppo: uno solo sul quadrato intero condannerebbe anche il candidato,
  perche' `planClearance` non conosce eccezioni ed e' giusto che non ne conosca.
- **La fusione si compie nella passata, non nel callback del cantiere**, ed e'
  una questione di chi possiede lo stato: il record fuso deve dichiarare alla
  simulazione gli usi ereditati, e `clearance.pass` non e' il posto in cui
  restituire un `SimState`. Il cantiere segnala di aver finito, e la passata
  successiva raccoglie.
- **Un edificio in meno non e' un abitante in meno.** Il sopravvissuto porta in
  `uses` anche l'uso di chi ha assorbito, e `tally` lo conta — la riga che
  esisteva per le fasce di un'arcologia vale ora anche per un record ordinario.
  Senza, fondere due torri avrebbe dimezzato la capacita' di quell'isolato: una
  regressione di bilancio travestita da forma urbana.
- **La soglia e' derivata, non scelta.** `FUSION.minLevel` e' il primo gradino di
  `urbanFootprintStepsOf`: sotto, il lato che la fusione chiederebbe coincide con
  quello che l'edificio ha gia' e la regola direbbe `noRoom` a chiunque. Una
  soglia piu' bassa non sarebbe piu' permissiva, sarebbe una promessa che il
  gradino successivo smentisce.
- **Il tetto e' la scala mega, e nemmeno quello e' un gusto.** Una promozione che
  si allarga compare a ritagli e non ha niente da cancellare; una fusione deve
  cancellare — dove c'era una torre l'assemblaggio ha una corte — quindi si ferma
  dove sagoma e cancellazione stanno ancora insieme nel budget di chunk di una
  struttura. L'isolato intero resta il premio del picco, e ci si arriva
  promuovendo.
- **Non si scavalca un gradino della fila.** Un assemblaggio poggia su un podio
  solo: due lotti a due quote diverse darebbero un podio che ne copre uno e ne
  sotterra l'altro. E' lo stesso rifiuto che `cluster.ts` chiama gradino, letto
  un piano piu' in la'. E chi ha gettato un arco non fonde, per lo stesso motivo
  per cui non si allarga.

## In corso — La campata dell'edificio

- **Un edificio puo' allungarsi fino a toccare il dirimpettaio.** Non e' una
  campata di `spans/` — quella e' un record proprio, dipinto come
  infrastruttura, che *cade* quando i suoi appoggi cambiano sagoma. Questa e'
  massa dei due edifici: stesso record, stessa vernice, stesso livello, e cresce
  con loro. A schermo la differenza si legge senza spiegazioni — un ponte
  attraversa, un arco continua.
- **Nessuno entra nelle colonne dell'altro.** Il vuoto si divide in due e ogni
  edificio si sporge per meta': `overlaps` continua a confrontare due riquadri
  disgiunti e nessun invariante del registry viene toccato. E' la ragione per cui
  l'arco puo' esistere senza il record multi-rettangolo, che resta un'altra cosa.
- **`envelopeOf` conta la crescita per faccia.** Lo sbalzo e il braccio possono
  stare su due facce diverse: sulla stessa vince il maggiore, su facce diverse
  crescono tutti e due, e l'inviluppo resta un rettangolo. La riga «uno sbalzo
  non prende suolo» vale identica per il braccio — il record entra in `columns`
  sull'inviluppo e in `groundColumns` sulla sola impronta, quindi sotto l'arco la
  carreggiata si dipinge ancora.
- **L'arco e' un fatto del vuoto, non della maglia stradale**, e questa e' la
  meta' della regola che ha dovuto cedere alla misura. Il primo taglio chiedeva i
  due fronti opposti (`a.facing` contro `b.facing`): su una citta' cresciuta
  quarantacinque coppie affacciate su quarantanove cadevano li', perche' in
  questo tessuto `facing` e' la strada *piu' vicina* e due corpi che si guardano
  stanno spesso su due assi diversi. Chi apre la coppia guarda il proprio fronte,
  il secondo riceve la faccia opposta per costruzione. Con la regola rilasciata,
  sei coppie su quarantanove diventano un arco.
- **La larghezza la detta la parete, non l'impronta**, ed e' la stessa lezione di
  `highestLanding` per le campate: un corpo e' piramidale, e alla quota di una
  torre il fronte e' largo la meta' del sedime. Si rientra di un voxel per volta
  fino al primo tratto continuo utile, e si scende di fascia finche' il muro c'e'
  — provare solo la quota piu' alta rendeva la campata rara due volte.
- **La quota e' della coppia, non dei due**: `planArch` la sceglie una volta e la
  scrive identica sui due record, quindi una promozione non puo' far scivolare
  mezza campata. Chi ha gettato un arco sale ma **non si allarga**: allargando
  l'impronta la parete d'imposta si sposterebbe e il braccio di fronte punterebbe
  al vuoto. In altezza invece non rinuncia a niente.
- **Il braccio si aggiunge dopo il corpo, mai dentro il generatore.** Entrando in
  `generateBuilding` consumerebbe tiri dei quattro canali, e la stessa coppia
  `(seme, livello)` darebbe due corpi diversi a seconda che l'arco ci sia o no:
  un edificio che getta una campata cambierebbe anche i piani bassi. La sagoma
  senza arco resta esattamente quella di prima, e la citta' gia' costruita non se
  ne accorge.

## In corso — Le viste informative accese davvero

- **Scegliere una vista accendeva la legenda e nient'altro: nessuno chiamava
  `setVisible` sull'overlay.** Il `visible` di `InfoViewOverlay` e' anche il gate
  del budget di costruzione: a false, `update` esce alla prima riga, la heatmap
  non campiona mai e il gruppo resta nascosto. Il metodo esisteva dal primo
  giorno e non aveva un solo chiamante in `src/`. Ora `setInfoView` lo guida
  dalla vista attiva, che e' l'unico posto che sa se c'e' qualcosa da vedere.
- **Anche accesa, «Materials» restava vuota: la decimazione pungeva l'angolo
  della cella.** La heatmap tiene i quad sotto trentamila, che su un'isola
  512x512 vuol dire un passo di tre; un valore che vive su colonne esatte — una
  fabbrica, un lotto — sparisce otto volte su nove. Su una citta' con cinque
  industrie la vista era vuota per costruzione. `InfoViewSpec` dichiara ora
  `sparse`, e chi lo e' viene cercato su tutta l'impronta: il massimo se
  continuo, la prima categoria reale se categorico. Misurato su cinque colonne
  industriali sparse, da zero quad a cinque; su 478 case, tutte e 478.
  Non era derivabile dai campi che c'erano: `districts` e `food` sono entrambe
  categoriche e normalizzate, ma la prima e' un campo e la seconda no.
- **Il frame che chiudeva la costruzione stava a 6,9 ms, e nessuno l'aveva mai
  visto perche' non ci arrivava.** Non era la geometria — quella e' a budget —
  ma `Float32BufferAttribute` su tre `number[]` da oltre un milione di elementi
  boxati. Il conto dei quad si sa appena il campionamento finisce, quindi i
  buffer si allocano esatti una volta e l'attributo li adotta con
  `BufferAttribute` su una `subarray`, senza copiarli. Frame peggiore
  dell'apertura: 6,88 ms -> 1,51 ms sulla vista dei servizi, 3,70 -> 2,55 su
  quella dei distretti, con gli stessi quad al termine (27.346 e 13.952).

## In corso — I tratti sul record, dal lato di chi clicca

- **Gli ultimi punti che leggevano i marker a mano erano nella scheda, non nei
  driver.** La migrazione si era fermata a `world/buildings/` e a
  `save/capture.ts`; restavano `selection.ts`, `growthScene.ts`,
  `SelectionPanelModel.ts`, `selectionVerdict.ts` e il `facadeHostAt` di
  `main.ts` — cioè tutto il lato che risponde a un click. Adesso passano da
  `structureKindOf`, `traitsOf` e `isGroundStructure` come gli altri: sei tipi
  scritti a mano in cinque file in meno.
- **Una colonna nuova, `hasUrbanUse`, perché le tre domande sul «conta come
  edificio» non sono la stessa.** `capturedAsBuilding` chiede cosa il
  salvataggio sa scrivere come riga sola e dice di no all'arcologia;
  `BuildingRegistry.tally` conta cosa la simulazione registra e dice di no alla
  torre di funivia; la scheda e l'aggregato dell'isolato dicono di sì a
  entrambe, perché leggono la `class` che il record porta comunque. Fonderle in
  una colonna avrebbe cambiato tre comportamenti per fare ordine in uno.
- **`tally` è uno `switch` esaustivo, e per averlo ha dovuto chiederlo.** Una
  catena di sei `if` sui marker era il punto più denso rimasto in
  `BuildingRegistry`; tradotta in `switch`, però, un tipo nuovo ci sarebbe
  scivolato fuori in silenzio, perché la funzione non restituisce niente e
  `noImplicitReturns` non la guarda. Il ramo `default` che asserisce `never` è
  la stessa rete che `clearanceKindOf` ha gratis.
- **Tre dispatch hanno smesso di essere catene di `if`.** Le quattro voci
  dell'isolato (`blockRoleOf`), il verdetto di crescita e l'intestazione della
  scheda scelgono *cosa fare* e non rispondono sì o no: sono `switch` sui sette
  tipi, non colonne della tabella. L'intestazione del monumento è uscita in
  `landmarkHead` per stare dentro un ramo.
- **Le caselle strane restano strane, e adesso sono due.** La torre di una
  funivia promuove come un edificio civico (`promotes`) e porta un uso urbano
  (`hasUrbanUse`) perché nessuno dei sei punti l'ha mai esclusa. Sono le due
  metà della stessa decisione, e il giorno che si corregge cadono insieme.

## In corso — Il fronte del declino si può spegnere

- **La banda fra le due soglie rientra invece di restare ferma.** `decayPressure`
  saliva sotto `decay.strainCoverage` e scendeva sopra `decay.recoveryCoverage`,
  ma fra le due non si muoveva: un accumulatore che non perde mai è un fermo, non
  un fronte. Una città risalita al 105% restava armata per sempre — `buildPass`
  non fondava più niente — e l'unica uscita, il 110%, non era scritta da nessuna
  parte. Adesso la banda restituisce con lo stesso passo con cui ha preso
  (`decay.pressureEase`), e posare il servizio che porta oltre il rientro resta
  tre volte più rapido: il gesto che risolve si distingue da quello che tiene
  soltanto la linea.
- **L'isteresi si sposta dall'ingresso all'uscita, in `decay.pressureCeiling`.**
  Far perdere la banda da sola avrebbe riaperto il difetto che la banda difendeva:
  un allarme che si spegne al primo tick sopra soglia si riaccende al tick dopo.
  La pressione ora sale **oltre** il punto in cui il fronte si arma, fino a due, e
  quell'eccesso è il debito da restituire prima che l'allarme si spenga — la forma
  di un trigger di Schmitt, due livelli sull'uscita invece di una zona morta
  sull'ingresso. Una città trascurata a lungo satura, e ci mette a rientrare gli
  stessi tre minuti che ci ha messo ad armarsi.
- **`isDistressPossible` separa le due conseguenze che l'avviso confondeva.** Un
  fronte armato ferma sempre la crescita, ma porta via edifici solo quando la
  quota cittadina scende sotto `decay.distressCoverage`, cioè sotto il 40% di
  copertura: è aritmetica del pavimento, non taratura. «Blocks are emptying» detto
  a una città al 105% raccontava una perdita che non stava avvenendo, accanto a un
  numero che smentiva la frase.
- **I consigli dicono quanto serve, non solo quanto c'è.** Sopra il 40% la crisi
  è `growth-halted` e nomina il bersaglio («services at 105%, need 110%»);
  `services-falling-behind` smette di dire «and falling» a una città che sta
  guarendo e le lascia `services-recovering`, in coda ai colli di bottiglia perché
  una notizia buona non deve scavalcare un problema vero sulla riga sola della
  targa.

## In corso — I pannelli informativi diventano grafici

- **La scheda di selezione si apre su un verdetto, non su un elenco.** Ventidue righe `etichetta: valore` tutte con lo stesso peso, e ogni valore una frase intera, chiedevano di finire la riga per sapere se un edificio andasse bene. Ora in cima c'è la risposta corta con un tono — «Cannot grow», «Needs desirability», «Ready to grow» — la barra della soglia con le sue fonti, e i ruoli da piazzare attorno; le misure di ogni sezione sono barre, e la carta d'identità sta ripiegata dietro «Details». La prosa non sparisce: è il `title` della barra che commentava.
- **`siteAdvice` risponde a «cosa piazzo qui attorno», che la scheda non aveva mai risposto.** Diceva quanto mancava e da chi veniva ciò che c'era, e lì si fermava: restavano un numero e diciannove tessere, e l'unico modo di scegliere era spendere. Nessuno stato nuovo — la resa al centro è `strength × influence[cls]`, la stessa aritmetica che un landmark già posato mostra — più il filtro di sito, perché consigliare un porto all'interno manderebbe a spendere per un rifiuto.
- **La domanda della colonna è quattro barre contro le soglie di sito.** La riga `Demand: Housing 180 · Commerce 90 · …` era la più densa della scheda e l'unica che pretendeva quattro soglie a memoria per essere letta; resta fra i dettagli per chi confronta due colonne.
- **Il cassetto Città guadagna «What the city needs», in cima ai traguardi.** Capacità ed economia erano otto riquadri di testo con la stessa aria, e «73% fed» accanto a «4 hosted uses» chiedeva di sapere in anticipo quale fosse un'emergenza. Sette barre in ordine di gravità — cibo, organico, case, umore, i due saldi, uso misto — con gli stessi nodi della scheda, perché due vocabolari grafici divergono.
- **La scheda si è divisa in cinque file.** Era 958 righe prima di guadagnare tutto questo: le tabelle dei nomi sono uscite in `selectionLabels.ts`, le barre in `selectionMeters.ts`, il verdetto in `selectionVerdict.ts`, il vocabolario condiviso in `meters.ts` e `meterBits.ts`.

## In corso — Chi regge cresce, se la parete regge ancora

- **La promozione non e' piu' vietata a chi porta qualcosa: e' verificata.**
  `blocksUpgrade` fermava per sempre l'ospite di un impalcato abitato, di un
  tratto di percorso o di una delle tre forme di facciata — Skyport, Sky Park,
  Sky Transit — e bastava un solo scalo per congelare la torre migliore
  dell'isolato. La regola era piu' severa della geometria: i quattro canali
  casuali di `generate.ts` non dipendono dal livello, quindi a parita' di
  tipologia e impronta i piani bassi sono identici a ogni livello e il muro a cui
  l'impalcato e' appeso e' quasi sempre ancora li'. Adesso la domanda e'
  geometrica e la pone `holdFits` sulla sagoma nuova, dentro `upgrade()` dove
  quella sagoma esiste: costa un `buildStamp` speso per un rifiuto, e lo spende
  soltanto chi porta qualcosa.
- **Chi ci sta ancora resta dov'e', e conta piu' del resto.** `releaseDecks`
  faceva cadere ogni mensola vuota a ogni promozione dell'ospite; con gli ospiti
  che adesso crescono, quella regola avrebbe reso la citta' in quota inabitabile
  — nessun impalcato sarebbe vissuto abbastanza per meritarsi un lotto sopra o un
  montante che lo raggiungesse. `AerialDriver.reseat` fa cadere soltanto cio' che
  la sagoma nuova non regge piu', e rifiuta la promozione quando a non starci e'
  qualcosa che non puo' cadere. Tutta la convalida prima di qualunque scrittura,
  come per un percorso.
- **La parete si misura per differenza, non con una soglia.** Quanto muro
  servisse lo ha deciso chi ha appeso l'impalcato — una mensola prende tutta la
  corsa, una piattaforma di facciata si centra sull'intera facciata e ne lascia
  libero qualche capo — quindi `holdFits` chiede soltanto che nessuna colonna di
  muro presente prima sia sparita. Nessun numero nuovo da tarare.

## In corso — La citta' si puo' perdere

- **Il declino ha un luogo.** Fino a qui la citta' poteva solo crescere:
  `removeBuildings` esisteva ed era verificato inverso esatto di `addBuilding`,
  ma aveva un solo chiamante — il cantiere che sventra per un landmark — e la
  parola «abbandono» non compariva da nessuna parte. Adesso un edificio che sta
  in un posto che non lo regge piu' se ne va, e si vede quale.
- **La copertura ha due meta', ed e' il modello di Cities Skylines.** Una quota
  **cittadina**, uguale ovunque, che fa da pavimento e viene dai servizi posati
  piu' dagli edifici civici cresciuti attorno; e una quota **locale**, letta dal
  piano civico del campo — quindi con decadimento geodetico, lungo le strade,
  come le vie pubbliche di Anno. Nessuna delle due basta da sola: il pavimento
  tiene la citta' in piedi mentre nessuno guarda, a chiudere il divario e' solo
  chi posa un servizio. E' anche il motivo per cui qui la spirale di SimCity 4
  non puo' accadere.
- **Il servizio posato pesa otto volte l'edificio civico cresciuto, e non e' una
  taratura a occhio: e' misurato.** Sotto un catalizzatore residenziale forte gli
  edifici civici **non nascono affatto** — `nextBuildSites` da' la cella all'uso
  che ci prende il punteggio piu' alto, e il residenziale satura per primo — per
  cui una copertura che dipendesse solo da loro varrebbe zero in ogni partita. Il
  peso di ciascun catalizzatore esce dalla riga `influence` con cui il campo
  dipinge gia': un parco vale uno, un mercato un settimo, una centrale zero, e
  non c'e' una seconda tabella che possa divergere dalla prima.
- **Nessun campo nuovo per cella, nessun piano nuovo nel campo.** La quota
  cittadina e' un numero solo per tutta la mappa, la quota locale e'
  `values[civic]` che c'era gia'. Il contratto dei quattro usi resta intatto, e
  la memoria per colonna non cambia di un byte.
- **`nextDecaySites` cammina a cursore e non scandisce il campo.** E' lo
  speculare di `UpgradeDriver`, non di `nextBuildSites`: fondare deve cercare
  celle vuote e paga sedici millisecondi per farlo, mentre gli edifici sono gia'
  un elenco. Il costo di una passata di declino non cresce con la citta'.
- **Il fronte e' un numero, perche' il declino dev'essere lento.**
  `decayPressure` sale sotto `decay.strainCoverage` e scende sopra
  `decay.recoveryCoverage`, e fra le due non si muove: tre minuti di scoperto
  continuo prima che si armi, e un rientro tre volte piu' rapido. Sta
  nello stato — caricare una partita in crisi e ritrovarla serena sarebbe la
  bugia che l'emergenza alimentare gia' non racconta — e non fa salire la
  versione del salvataggio, perche' ha un default.
- **Una citta' in affanno smette di fondare prima di cominciare a perdere.** E'
  una riga in `buildPass`, e senza di lei l'abbandono sarebbe churn: togliere un
  edificio *alza* la desiderabilita' dei vicini di otto punti, perche' con lui se
  ne va la sua congestione, quindi la colonna appena liberata sarebbe la prima
  candidata dell'infornata dopo.
- **L'abbandono passa dal cantiere di sgombero, non da un percorso suo.**
  `ClearanceSites` accodava gia' sagoma vuota e sagoma da cancellare, smontava a
  budget di voxel per frame e chiudeva con `clearVolume`, `registry.remove` e
  `removeBuildings`. Un secondo percorso di rimozione sarebbe divergente dal
  primo al primo caso limite, e li' i casi limite — una campata che poggiava, due
  cantieri sovrapposti — sono la parte difficile.
- **Un monumento sopravvive al quartiere che gli muore intorno.** La regola
  `gameplay.abandonment.clearing` e' la piu' timida delle tre: la gomma porta via
  tutto perche' e' un gesto, qui non sceglie nessuno, e far sparire un
  catalizzatore toglierebbe al giocatore la leva proprio quando gli serve.
- **Due voci nuove e una vista.** Un collo di bottiglia mentre il fronte si
  carica — l'avviso prima della perdita — e una crisi quando e' armato, con la
  copertura misurata nel titolo e il gesto accanto. La vista informativa
  `Services` mostra dov'e' il buco: e' continua, gia' normalizzata, e la chiave
  della heatmap porta la quota cittadina arrotondata al centesimo perche' non si
  rifaccia sessanta volte al secondo.

## In corso — La funivia ha la precedenza sul tessuto urbano

- **Una piazzola sgombera il lungomare invece di rifiutare la linea.** Le due
  rive che si guardano sono anche le prime che la città costruisce, quindi
  pretendere cinque colonne vergini rifiutava la funivia proprio dove serviva:
  su una riva costruita fino in fondo il click non produceva niente, e su una
  costruita a metà spingeva la stazione un isolato dentro. `RopewayProbe` ha
  ora `clearable` accanto a `free`, e `seekPad` fa **due passate**: la prima
  cerca la piazzola vergine e arretra come sempre — se un posto libero c'è
  entro `maxSetback` vince lui, e non cade niente —, la seconda riparte dalla
  riva accettando di demolire. Il cantiere è quello di `clearanceSite.ts`, lo
  stesso dei monumenti e delle arcologie, con la sua regola in
  `BALANCE.gameplay.ropeway.clearing`: tetto aperto, `clearsLandmarks` spento.
  Un monumento non cade sotto una stazione, e nemmeno un'altra funivia — la
  fune non è un record, quindi abbattere una torre lascerebbe un cavo appeso al
  nulla.
- **La torre poggia sul terreno, non sui tetti che sta demolendo.** Il piano
  legge ora `ground` oltre a `top`: dentro un'impronta che il cantiere sgombera
  la quota di appoggio e il franco della fune si misurano sul terreno nudo.
  Con il solo `top` una piazzola interamente coperta dal costruito avrebbe
  piantato la stazione sui tetti, e la fune sarebbe salita a scavalcare una
  torre che stava cadendo — un `tooTall` proprio dove la città è alta.
- **`placeRopeway` risponde con tre casi invece di un booleano.** `'raised'` è
  la linea che c'è, `'clearing'` quella decisa e prenotata mentre il lungomare
  cade, `null` il posto che non ne regge nessuna. Dire «Ropeway open» mentre
  due isolati stanno ancora sparendo manderebbe il giocatore a cercare due
  torri che non esistono; l'HUD ha ora il suo secondo messaggio. Entrambi i
  riquadri si prenotano all'apertura, anche quello già sgombero: la città
  continua a crescere mentre il cantiere demolisce, e una linea con una torre
  sola non è una linea.
- **Fra due linee valide vince prima quella che non demolisce, poi la più
  corta.** Con quattro direzioni da provare, preferire sempre la più corta
  avrebbe fatto pagare al giocatore con due case un accorciamento che non ha
  chiesto: la precedenza sul tessuto urbano è il permesso di passare dove
  altrimenti non si passa, non un invito a demolire.

## In corso — Le torri mature smettono di essere tutte uguali

- **Alla soglia di skyline il dettaglio sul tetto c'è davvero.** `generate.ts`
  dichiarava da sempre che oltre `VISUAL_LEVELS.skyline` il pennone c'è
  «sempre», ma lo condizionava a `crown.roofProp`, che quattro cime su cinque
  negano: `stepped` è la cima del commercio e `flat` quella dell'industria,
  cioè le classi più numerose di una città matura. Il risultato era che
  `SKYLINE_PROP_HEIGHT` non si vedeva proprio dove serviva, e decine di torri
  finivano con lo stesso taglio netto. Ora sotto la soglia decide ancora la
  cima — è lì che «tetto piano» significa capannone — e sopra decide il
  livello. Un `productionLoft` al massimo guadagna il suo prisma di lamiera,
  un `terraceArcade` il suo pennone d'ottone.
- **La pietra ha di nuovo tre toni invece di due.** `terraceArcade` — la
  tipologia terminale del commercio, cioè la più numerosa — accostava `stone`
  (#e8d9a8) e `stoneWarm` (#d0b878) come corpo e cornice: un sesto di
  luminanza sullo stesso tono caldo, che a distanza isometrica cancella
  marcapiano e campate e lascia una colonna piena. La cornice scende a
  `stoneDark` e lo zoccolo a `stoneDeep`. La stessa coppia piatta stava in
  `stoneCourt`, e siccome lo stile si applica **dopo** la tipologia era quella
  riga a rimetterla su ogni quartiere di pietra: le due dovevano cambiare
  insieme o non cambiava niente.

## In corso — La dieta del contesto: la roadmap si legge a domanda

- **`ROADMAP.md` da 181 a 86 kB, e la dashboard non se ne accorge.** Il file
  singolo piu' caro della repo era per nove decimi prosa: 191 righe di attivita'
  pesavano 18 kB su 181. Le venti fasi **chiuse** lasciano in radice
  intestazione, obiettivo, elenco e un rimando; obiettivo esteso, vincoli, gate,
  «come e' stato risolto» e riferimenti passano a una scheda per fase in
  [docs/roadmap/](../docs/roadmap/). Le fasi ancora aperte restano intere dove
  sono: quella prosa e' materiale di lavoro, non storia.
- **Le attivita' non si spostano, ed e' il vincolo che ha deciso la forma.**
  repo-radar legge **solo** il file di radice e riconosce un task dal suo testo:
  portarne 166 in una scheda avrebbe fatto dire alla dashboard che il progetto e'
  al 20% invece che all'87%, e avrebbe perso il cycle time di ognuno. Con i
  checkbox fermi in radice l'anteprima e' identica riga per riga — 191 task,
  `pctByCount` 86,9%, `pctByWeight` 84,9% — e `verify.mjs` conferma zero sezioni
  e zero righe perse.
- **Una scheda solo dove c'e' qualcosa da spostare.** Sotto i mille caratteri di
  prosa la sezione e' gia' quasi soltanto il suo elenco, e una scheda costerebbe
  in rimandi quanto il testo che sposta: cinque fasi restano quindi intere in
  radice pur essendo chiuse.
- **`src/main.ts`: due blocchi fuori, e la ragione per cui gli altri no.** Le
  etichette del cursore erano funzioni pure in mezzo al cablaggio e ora stanno in
  `src/shell/actionLabels.ts` — con la tabella dei rifiuti a livello di modulo
  invece che ricostruita a ogni movimento del puntatore, che e' un percorso
  caldo. Il salvataggio possedeva tre variabili che nessun altro toccava, e in
  `src/shell/saveSlots.ts` diventa un oggetto che se le tiene; scena e HUD
  arrivano come funzioni, perche' nascono dopo. Il resto del file non e' stato
  toccato di proposito: e' una chiusura sola su quarantasette variabili mutabili
  condivise, e spostarne un pezzo vuol dire **decidere di chi e' quello stato** —
  un incremento di progettazione, non una potatura, per giunta su codice che
  nessun test copre.

## In corso — Il menu di pausa si veste come il titolo

- **La stessa colonna, sopra la citta' sfocata.** Il menu `Esc` era un pannello largo a due colonne con la navigazione a sinistra; adesso e' la colonna del titolo — marchio, bottoni grandi con la riga che dice cosa succede premendoli, sottoschermate che sostituiscono l'elenco — perche' le due superfici pongono la stessa domanda e due disegni diversi si imparano due volte. Cambia solo il fondo: al posto del cielo c'e' la citta' vera, sfocata dal velo, perche' non si e' usciti dal gioco, si e' messo in pausa.
- **`titleScreen.css` veste due superfici.** Il cielo animato e la linea d'orizzonte sono passati in `.title-screen--sky`, cosi' che `.title-inner` galleggi anche su un velo; la colonna in partita e' `.title-inner--pause`, piu' larga e con lo scorrimento suo. Le regole del vecchio pannello — `.save-slot`, `.save-button`, `.menu-field`, la navigazione e il piede — sono uscite da `hudPanels.css`.
- **Il velo sfoca invece di coprire.** `backdrop-filter` era escluso dal costo GPU per frame; sotto il menu quel costo non esiste, perche' `main.ts` passa `dt = 0` finche' e' aperto. Lo scrim scende al 42% dove la sfocatura c'e', e resta pieno dove non c'e'.
- **`Esc` dentro il menu torna all'elenco.** Da una sottoschermata si va indietro, non fuori: chiudere tutto al primo colpo costringeva a riaprire il menu per correggere un tema scelto male. Il secondo colpo chiude.
- **L'elenco degli slot si rilegge aprendo, non entrando nella sezione.** Adesso la riga sotto «Saves» conta le citta' salvate e quella sotto «Resume» dice cosa si sta per lasciare: nessuna delle due puo' aspettare un clic. Resta una lettura sola per apertura, come prima.

## In corso — Skyline notturno invece di retino

- **La torre non e' piu' accesa allo stesso modo per tutta la sua altezza.**
  `NIGHT_WINDOWS.storey` divide la facciata in blocchi di quattro piani: uno su
  tre resta spento del tutto, gli altri sono smorzati fra il 45 e il 100 per
  cento. Un edificio si svuota per piani contigui, non a finestre sparse lungo
  l'altezza, e da lontano quella e' la prima cosa che si vede — la massa scura
  fra due fasce accese e' piu' estesa delle fasce. Il fattore sta fra 0 e 1,
  quindi le invarianti gia' scritte sulla quota della torre restano valide
  blocco per blocco senza riverificarle.
- **Ritarati i numeri che la grana verticale ha spostato.** `peakShare` sale da
  0.38 a 0.46 perche' adesso e' la punta di un blocco e non della facciata
  intera; `towerBias.low` scende da 0.3 a 0.12 perche' una torre quasi spenta e'
  un elemento del disegno e non un difetto. In media la citta' piena accende una
  quota di 0.20 invece di 0.38: circa la meta' delle finestre di prima, e piu'
  forti — `gain.night` passa da 1.5 a 1.7.
- **Le colonne di servizio non sono piu' la firma dello skyline.** Alla forza di
  una finestra, il vano scala acceso a ogni piano ripeteva la stessa riga
  verticale continua su ogni torre della citta'. Ora vale `coreDim` 0.4, ed e'
  l'economia a dire quante colonne, come per tutto il resto.
- **Bianco d'ufficio piu' bianco, ambra di casa piu' ambra.** Il freddo tira al
  vetro per il 22 per cento invece che per il 35 — un ciano ripetuto su mezza
  citta' legge come tinta del materiale, non come lampada — una minoranza di
  finestre calde arriva fino all'oro, e il carattere cromatico e' anche della
  torre e non solo della finestra, cosi' due palazzi affiancati non hanno lo
  stesso bianco. `officeShare` scende da 0.42 a 0.36: la luce di un ufficio e'
  compatta e la stessa quantita' concentrata pesa piu' di quanta ne sia sparsa.

## In corso — Il landmark resta in mano

- **Posare un landmark non riconsegna lo strumento.** Il catalizzatore scelto dal
  dock resta selezionato dopo un piazzamento riuscito, come già facevano la
  mensola e la gomma: chi ne posa uno quasi mai ne posa uno solo, e tornare a
  ripescare la stessa tessera dopo ogni colpo era un giro in più a ogni landmark.
  A posarlo resta `Esc`, che è quanto il toast prometteva già da prima
  («Esc to cancel»). La funivia e il settore costiero continuano a cadere dopo
  l'uso: costano quanto una scelta di partita, e un click di troppo ne
  tirerebbe una seconda.

## In corso — I tratti sul record

- **Un solo lettore dei campi marker.** `structureKind.ts` risponde alla domanda
  «che tipo di struttura è questo record?», che era scritta a mano una sessantina
  di volte in diciannove file, ognuna con il proprio sottoinsieme di
  `landmark / span / aerial / arcology / ropeway / aloft`. I sette tipi — l'ottavo
  non c'è: un monumento sul tetto è un tipo suo, non un landmark con un campo in
  più — hanno una riga in `STRUCTURE_TRAITS`, e una struttura nuova va decisa lì
  invece che cercata in giro.
- **Tabella per le domande da sì o no, `switch` esaustivo per le scelte.**
  `promotes`, `hostsSpan`, `hostsAerial`, `hostsCrossing`, `groundStructure`,
  `rebuildableFromRecord` e `capturedAsBuilding` sono colonne; la traduzione ai
  quattro casi dello sventramento è uno `switch` in `clearanceSite.ts`. In tutti
  e due i casi è il compilatore a fermare chi aggiunge un tipo senza decidere,
  invece della disciplina di chi ricorda i diciannove file.
- **Le caselle riproducono il comportamento di prima, comprese quelle strane.**
  Una torre di funivia promuove come un edificio civico e può reggere una
  campata, perché nessuna delle due regole l'ha mai esclusa; una campata si
  appoggia alla città in quota per lo stesso motivo. Sono rimaste come stavano,
  con il commento che dice da dove vengono: ora si vedono, e correggerle è un
  incremento suo.
- **La quaterna di piazzamento detta una volta.** `placeStructure.ts` raccoglie
  ciò che i driver ripetevano con quattro nomi diversi: misurare i chunk che si
  sporcherebbero, chiedere al registry se il posto è libero, scrivere il record,
  accodare i voxel. `structureFits` e `writeStructure` restano separate perché la
  funivia ne ha bisogno: due torri si verificano entrambe **prima** che ne sia
  scritta una, e verificare-e-scrivere due volte non è la stessa cosa. `class`,
  `level` e `seed` hanno un default, che era identico in tutti e quattro i punti.
- **La sagoma si genera solo dopo le verifiche.** Il segmento porta una funzione
  e non uno stamp già fatto: i driver la costruivano dopo aver superato budget e
  collisione, e uno stamp pronto avrebbe fatto pagare una generazione a ogni
  struttura rifiutata.
- **Le letture sul mondo hanno un nome solo.** `worldProbe.ts` tiene `heightAt`,
  `topAt`, `isDryLand`, `isAboveSea`, `isFirm`, `isFree`, `isPavement` e
  `isSolid`; le sonde di dominio — `RopewayProbe`, `SpanProbe`, `CrossingProbe` —
  restano dove sono, perché sono ciò che tiene le regole pure e testabili senza
  un registry, e i driver le compongono da lì. Le due domande sulla terra restano
  due: la funivia vuole terra asciutta, il ponte fra settori solo che non sia
  oceano, e non lo hanno mai chiesto nello stesso modo.
- **Fuori restano i tre driver grandi.** Landmark, arcologie e città in quota
  hanno varianti di piazzamento proprie — opere di terra, pozzi, gambe contate a
  parte — e farceli entrare vorrebbe dire riportare le loro eccezioni dentro il
  protocollo.

## In corso — Revamp dei landmark: piu' ornati, piu' grandi, piu' stadi

- **Teatro, stadio e stazione crescono di sedime su sei stadi.** Il teatro va da
  14x10x14 a 34x22x44, lo stadio da 12x10x5 a 52x40x32 — la ricetta piu' larga
  del catalogo — e la stazione da 16x8x8 a 52x24x46. Lo stadio zero resta
  piccolo come oggi in tutte e tre: la megastruttura arriva quando il quartiere
  attorno c'e' gia'.
- **Le pile del viadotto sono archi, e non e' ornamento.** Una linea lunga
  cinquantadue voxel attraversa due carreggiate: con le pile piene sarebbe un
  muro che taglia il quartiere in due. Lo stesso vale per le quattro porte dello
  stadio, una per asse, e per il portale davanti al portico del teatro. E' la
  primitiva che rende ammissibili gli ingombri nuovi, non quella che li decora.
- **L'anello dello stadio si legge in tre fasce.** Arcata a terra, gradinate
  piene, parapetto traforato: e' il modo in cui un anfiteatro vero da' scala a un
  volume basso e larghissimo, e usa `colonnade` e `tracery` per quello per cui
  esistono — vuoto sotto un pieno, e aria *dentro* il muro.
- **La stazione e' uscita da `logistics.ts`.** Delle quattro forme lineari e'
  l'unica che sospende invece di appoggiare, ed e' diventata la piu' lunga del
  catalogo: lasciarla li' avrebbe portato quel file oltre le mille righe proprio
  mentre molo, traghetto e pista aspettano lo stesso trattamento.
- **Cinque esemplari sui ruoli grossi invece di tre.** Teatro, stadio e stazione
  ne hanno cinque: due teatri sulla stessa isola non devono somigliarsi, e la
  garanzia di leggibilita' resta strutturale — il tronco si disegna sempre, la
  variante si aggiunge sopra.
- **Il tetto di quad non si e' mosso.** Il chunk piu' pieno che il catalogo
  produce misura 8 360 quad su 16 384, lo stesso di prima dei tre revamp: uno
  stadio e' un anello cavo, e la finestra piu' densa resta quella della
  cattedrale. La regola misurata sul prototipo ha retto — cornici sulle sole
  torri, mai sugli scafi lunghi.

## In corso — Orografia con un carattere, e una flora che fa macchia

- **Un'isola ha un carattere, e sono due numeri estratti dal seed.** Fino a qui
  ogni isola aveva lo stesso impasto — stessa miscela di rumore, stessa
  proporzione fra piede e vetta — e a cambiare era soltanto dove cadevano le
  creste: misurate, le vette stavano tutte fra 52 e 69 voxel su un tetto di 80.
  `TERRAIN.crestMix` e `TERRAIN.summitLift` escono ora da un flusso loro e
  dicono *che tipo* di isola e' questa. Su quarantotto seed le vette vanno da 54
  a 75 e la roccia dal 10 al 29 per cento della terra emersa: una e' una collina
  boscosa, l'altra e' alpina.
- **I crinali vengono dal rumore ripiegato, e non costano gradiente.** Il simplex
  e' liscio in ogni direzione e sommato in ottave da' dune; `0,5 - |n|` ha il
  massimo lungo la curva in cui il rumore cambia segno, cioe' su una **linea**, e
  da li' escono crinali continui con i loro contrafforti. Il ripiegamento resta a
  mezza ampiezza apposta: cosi' conserva il modulo del gradiente, mentre la forma
  canonica `1 - 2|n|` lo raddoppia — provata, portava il dislivello peggiore fra
  due colonne da 0,69 a 0,94, fuori dal criterio di continuita' che tiene in
  piedi il terreno a celle. Si paga in altezza, e l'altezza la ridà l'espansione
  della vetta.
- **`summitLift` alza la montagna senza toccare la citta'.** Moltiplica per
  `1 + lift` la sola distanza da `summitKnee`, che a rilievo 76,8 cade dove la
  pianura finisce: costa, pianura e fascia edificabile restano identiche, e il
  fattore di pendenza vale `1 + lift` esatti e solo lassu'. L'intervallo
  attraversa lo zero perche' la varieta' deve venire dalla varianza e non da un
  paesaggio medio piu' alto — un seed puo' anche prendersi un'isola dolce, e la
  compressione non costa pendenza perche' ne toglie.
- **`maxHeight` ha cambiato mestiere.** Valeva il rilievo dell'isola, ed era la
  stessa cosa detta due volte: adesso il rilievo lo detta il raggio via
  `maxReliefSlope`, e il tetto assoluto e' soltanto quello che deve contenere
  l'espansione piu' alta. La disuguaglianza fra le costanti la verifica un test,
  perche' se cade non lancia niente — la cima si appiattisce dentro `cellGrid`, e
  quello e' il difetto piu' difficile da vedere di tutti.
- **La frequenza di base e' scesa a 1/440 per comprare il margine speso.** Il
  gradiente del fbm e' proporzionale alla frequenza: allungare la lunghezza
  d'onda di un settimo restituisce un settimo del budget di Lipschitz, e quel
  settimo fa la differenza fra un'isola dolce e una alpina invece di increspare
  un versante. Misurato su quarantotto seed, il dislivello peggiore fra due
  colonne e' **sceso** da 0,79 a 0,76 nonostante l'espansione della vetta.
- **Quattro specie nuove, e una di loro sta sulla spiaggia.** Betulla — l'unica
  che si distingue per il **tronco** invece che per la sagoma, ed e' l'unica
  differenza di specie che si legge dentro un bosco fitto, dove le chiome si
  toccano e la silhouette sparisce —, palma, cipresso e albero morto. La spiaggia
  ha smesso di essere spoglia: un albero non toglie edificabilita' a nessuno, e
  la frangia costiera e' l'unica fascia dell'isola che si vede da ogni
  inquadratura. `TreeShape.bark` e' il campo che rende possibile la prima.
- **Il bosco cresce a macchie, non a sale e pepe.** Due alberi su tre prendono la
  specie del proprio boschetto — un riquadro di sei celle, con una specie estratta
  dagli stessi pesi del bioma — e il terzo resta il suo, che e' cio' che sfuma il
  bordo fra due macchie invece di lasciarlo rettilineo. Non aggiunge specie dove
  non crescerebbero: ne cambia solo la disposizione.
- **`treeTopIn`: il ritaglio di un albero non e' un riquadro.** Il livello di
  chioma piu' largo non e' quello piu' alto — una palma ha le fronde a raggio
  quattro e la punta a raggio due — quindi un albero che sfiora il blocco con la
  sola base ci scrive fin dove arriva la base, e il chunk allocato per la punta
  restava vuoto. La quota si ottiene ridisegnando l'albero verso un sink che
  conta: le estrazioni di pendenza e di erosione vengono dalla posizione e non da
  chi chiama, quindi il conto e' quello vero e non un maggiorante.

## In corso — Revamp dei landmark: piu' ornati, piu' grandi, piu' stadi

- **Cinque primitive ornate e un modificatore.** `arch`, `dome`, `buttress`,
  `spire` e `tracery` portano il vocabolario da dieci a quindici voci, e
  `Part.cornice` aggiunge le fasce marcapiano come campo invece che come
  sedicesima voce — la stessa mossa dello smusso. Ognuna dipende dalla posizione
  solo attraverso una funzione simmetrica, che e' cio' che le tiene invarianti
  alla rotazione: `orientPart` ruota una parte scambiando i lati senza
  ridisegnarla.
- **Il portale e' il permesso, non l'ornamento.** Sopra i ventotto voxel una
  struttura sta a cavallo di una carreggiata — il passo della maglia stradale e'
  venti — e `arch` e' cio' che sotto lascia un passaggio invece di un muro. E'
  la primitiva che rende ammissibili gli ingombri nuovi.
- **`config.ts` si e' spezzato prima di crescere.** Le dodici ricette storiche
  sono passate in `recipes/`, raggruppate per mestiere, a parita' di voxel: il
  file era a 2 146 righe e il revamp lo avrebbe raddoppiato.
- **Cattedrale e monumento crescono di sedime su sei stadi.** La cattedrale va
  da 14x10x28 a 44x28x80, il monumento da 12x12x26 a 32x32x130. Lo stadio zero
  resta piccolo come oggi — e' cio' che protegge la sovrapposizione fra due
  catalizzatori, dove nascono gli usi misti — e la megastruttura arriva quando
  il quartiere attorno c'e' gia'.
- **Dove sta l'ornamento l'ha deciso la misura.** Cornici su tutti gli scafi e
  contrafforti con il linguaggio civico portavano il chunk piu' pieno a
  **16 380 quad di dettaglio contro un tetto di 16 384**. Le cornici stanno ora
  sulle sole torri — il perimetro e' il moltiplicatore: ventiquattro celle su
  una torre 7x7, sessantotto su una navata lunga ventotto — e i contrafforti
  sono `plain`, che e' anche cio' che sono in una cattedrale vera. Il catalogo
  intero misura 8 360, sotto perfino l'isolato fitto di citta' ordinaria.
- **Le due reti scorrono il catalogo, non una ricetta scelta a mano.**
  `fitsChunkBudget` si prova su ogni ricetta, ogni verso e ogni scostamento di
  cucitura; `landmarkChunk` in `microGeometry.test.ts` ritaglia la finestra piu'
  piena fra tutte le sagome vere. Nominare la ricetta piu' grossa di oggi vuol
  dire smettere di misurare il caso peggiore il giorno in cui qualcun altro la
  supera.

## In corso — Ricerca del lotto e fronte strada fuori dal Builder

- **`Builder.ts` scende da 1544 a 1148 righe.** La ricerca del lotto — memo
  d'infornata, rettangoli esauriti, siti bocciati, scelta dell'impalcato — vive
  in `lotSearch.ts`, e l'aggregazione sul fronte strada in `frontage.ts`. Il
  `Builder` resta quello che la documentazione dichiarava: il ciclo, la nascita
  di un edificio sul lotto e le statistiche. Nessun cambio di comportamento: i
  metodi sono gli stessi, con le stesse dipendenze prese dal `BuildContext`.
- **La citta' in quota entra nella ricerca da due sole domande.** `LotSearch`
  riceve un `DeckProbe` — `hasDeck` e `decksOpened` — invece dell'`AerialDriver`
  intero: la freccia fra i due resta in un verso solo e dichiarata nel tipo.

## In corso — L'indice si spezza per area e il changelog si archivia

- **`PROJECT_INDEX.md` diventa una radice sottile piu' sei schede.** Restavano
  trentamila token in un file solo, e un agente che lo apriva per una riga li
  pagava tutti. La radice — dipendenze, file di radice, documentazione,
  instradamento — sta in tremila token; le righe di `src/` stanno in
  `docs/index/`: `world`, `structures`, `mobility`, `engine`, `sim-game`, `ui`,
  fra i tre e i sette mila token l'una. Chi cerca un nome non apre niente:
  `npm run locate` legge radice e schede insieme e dice da quale scheda viene
  ogni riga.
- **`docs:merge` instrada da solo.** Un frammento continua a dichiarare la
  sezione, non il file: la fusione la cerca in tutte le schede, scrive soltanto
  quella che l'ha e lo dice. Riconosce anche le sottosezioni `###` — prima un
  frammento per `src/engine/mesher/` falliva, perche' la ricerca guardava solo i
  titoli di secondo livello.
- **Il changelog tiene in radice i tredici incrementi piu' recenti.** Gli altri
  centottantotto sono in `docs/changelog/`, in sette schede tagliate a 55.000
  caratteri — un incremento archiviato non cambia mai scheda, e cresce solo
  l'ultima. `docs/changelog/README.md` elenca tutti i titoli con la scheda di
  ciascuno: e' da li' che si cerca, non aprendo le schede. Da 100.000 token a
  8.000 in radice.
- **`scripts/docs-merge.mjs` si puo' importare, e ha dei test.** Eseguiva
  `main()` al caricamento, quindi non era interrogabile da fuori: ora la
  chiamata sta dietro la stessa guardia di `project-locate.mjs`, e
  `npm run test:docs` verifica ordine alfabetico, sostituzione senza duplicati,
  sottosezioni, sezione inesistente e le due strade del changelog.

## In corso — La famiglia interrata prende la scala che le manca

- **La famiglia era tarata su un'isola che il gioco non genera, ed è questa la
  correzione.** Le misure che avevano fissato profondità e ingombro giravano su
  una region da **256** — la fixture dei test — mentre `TERRAIN_SIZE` in
  `main.ts` vale **512**; e il rilievo non è indipendente dal lato, perché
  `TERRAIN.maxReliefSlope` lo limita a `0,3 · raggio`. L'isola dei test ha quindi
  metà del rilievo di quella vera: picco 32–36 contro **52–60**. Rimisurato con
  `surveySunkenSite` su tre seed della region vera, le finestre asciutte sono
  ~800 a 48×48, ~610 a 64×64, ~270 a 96×96 e 50–95 a 128×128, con profondità
  mediana 40–56 quote invece di 20.
- **Le tre ricette raddoppiano lo scavo e crescono da tre a nove volte in
  pianta.** `sunkenCourt` passa da 20×20×16 a **64×64×32**, `invertedPyramid` da
  20×20×22 a **96×96×40**, `craterRing` da 48×20×26 a **128×64×46** — l'impronta
  più larga del catalogo, il doppio del `quadCluster` che è la torre più grande
  che l'isola sappia produrre. `SUNKEN.maxDepth` sale da 28 a 48, che è il minimo
  dei tre seed misurati e non il massimo: l'unico numero che vale su ogni isola.
  Misurati sull'isola vera, i siti restano abbondanti — 584–640 per la corte,
  256–290 per la piramide, 159–243 per il cratere.
- **Terrazze e pozzi crescono con l'impronta, non solo l'inviluppo.** Lo spessore
  degli anelli passa da 2–4 a 6–12 voxel — su una bocca da novantasei una fascia
  abitata spessa quattro sarebbe un filo di balcone attorno a un buco — e la
  sezione più stretta della piramide va da sedici colonne, cioè il minimo esatto
  di `SUNKEN.shaft`, a duecentoventicinque. Il riempimento resta fra `minFill` e
  `maxFill`.
- **Il fondo del pozzo sale di uno stadio, e non è composizione.** Uno stadio si
  accoda come delta e `dirtyChunkCount` conta i piani di chunk che attraversa:
  con la lastra del fondo insieme alle passerelle in cima, l'ultimo stadio andava
  da `z = 0` a `z = 45` e sforava `maxDirtyChunksPerBuilding` — cioè non sarebbe
  stato scritto affatto, in silenzio. È anche il motivo per cui il cratere è
  128×64 e non 128×96: il tetto che morde per primo è il budget di chunk, non il
  terreno.
- **Le fixture seguono il mondo vero.** `sunkenSites.test.ts` misura ora la region
  da 512 e interroga le ricette invece di una `SPAN` scritta a mano; la fixture
  di `arcologyDriver.test.ts` genera l'isola del gioco e pianta i poli sul
  pianoro misurato invece che sul centro della region, che sull'isola vera è la
  vetta (387 colonne edificabili contro 695, e una città che non matura);
  quella di `restore.test.ts` ricava l'altezza del terreno dalla profondità della
  ricetta invece di fissarla a ventiquattro. Una misura presa su una fixture più
  piatta del mondo è lo stesso difetto di una taratura mai misurata, con il segno
  opposto.

## In corso — Il Project Index smette di indicizzare i test

- **Via dall'indice le 175 righe di `*.test.ts` e `*.bench.ts`.** Erano un quarto
  del file — la sezione «Test e bench» da sola ne teneva 143 — e rispondevano a
  «cosa verifica questo test», che non è la domanda dell'indice: il file di test
  sta accanto a quello che copre, e `test:related` lo trova dal grafo degli
  import. `PROJECT_INDEX.md` scende da 144.003 a 107.750 caratteri, da circa
  quarantamila token a trentamila, senza perdere una sola riga di codice di
  produzione. Toglie anche una fusione per ogni test aggiunto: erano 34 i file
  già non indicizzati, quasi tutti test, segno che la regola non reggeva.
- **L'intestazione dell'indice dice come si interroga.** `npm run locate` prima,
  e il conto dei file rifatto sul working tree: la riga precedente dichiarava 107
  file di test e 1142 test, quando i file di test sono 189.
- **`CLAUDE.md` non promette più che `AGENTS.md` sia caricato.** Non lo è, e le
  regole che costano di più se restano fuori — mai la suite intera di propria
  iniziativa, `locate` prima di esplorare, italiano nella prosa — adesso stanno
  per esteso nel solo file che arriva sempre in contesto.

## In corso — Le opere di terra prendono il pendio

- **`maxTerraceSlope` sale al doppio di `buildableMaxSlope`.** Valeva `0.46`,
  appena un terzo sopra la pendenza edificabile, e su terra emersa rifiutava dal
  3% al 9% delle colonne a seconda del seed — concentrato sul raccordo fra
  pianoro e pianura, cioe' dove il giocatore clicca. Il cartellino «No earthwork
  holds here» compariva su fianchi che un terrapieno regge benissimo. Ora la
  soglia e' `TERRAIN.buildableMaxSlope * 2` (`0.68`): misurato sugli stessi tre
  seed, il rifiuto su terra emersa scende sotto lo 0,1%, e cio' che resta e' la
  parete vera — il campo continuo non passa `0.72` nemmeno sul fianco piu'
  ripido. Il tetto strutturale non cambia e non e' mai stato lui a decidere:
  sotto un'impronta da sei celle il muro piu' alto che questo terreno sappia
  produrre e' di dieci voxel, meno della meta' di `maxWorksStep`.
- **Le scarpate delle fixture si dichiarano rispetto alla soglia.** La riva del
  lago in `actions.test.ts` era scritta `0.6`: diceva «ripida» solo finche' la
  soglia valeva `0.46`, e la ritaratura l'avrebbe trasformata in silenzio in un
  pendio qualunque, svuotando la deroga della marina invece di verificarla.

## In corso — Impostazioni e comandi sul titolo

- **Settings e Help tornano, ma prima del mondo.** La schermata del titolo passa
  da tre voci a cinque: tema, cielo e nuvole si scelgono **prima** che l'isola
  nasca, e i comandi si leggono prima di aver sbagliato il primo gesto. Nessuna
  delle due tocca l'engine — la scelta finisce in `?theme=`, `?daylight=` e
  `?clouds=`, i tre parametri che la radice legge da sempre all'avvio, quindi il
  mondo nasce gia' con il cielo giusto invece di cambiarlo al primo frame.
- **`THEMES` non importa piu' Three.** I colori grezzi si spostano in
  `paletteHex.ts`: `palette.ts` importava Three per convertirli in spazio
  lineare, e chi voleva solo leggere un colore si tirava dietro il renderer.
  Stessa ragione per `daylightControl`, estratto in un file suo perche' viveva
  accanto ai nomi delle classi di edificio e trascinava `src/sim`. Il chunk
  d'ingresso resta a 42 kB, e prima della scelta non arriva ne' Three, ne' la
  simulazione, ne' i worker.
- **Il look viaggia con l'indirizzo, come il seed.** `rememberLook` lo riscrive
  quando cambia in partita — dal menu, da `L`, da `C`, da Shift+cifra — cosi' al
  ricaricamento il titolo mostra il cielo con cui si stava giocando invece di
  quello di tre partite fa. `themeSwatches` diventa l'unica derivazione delle
  pastiglie di un tema: la leggono il menu di pausa e il titolo.
- **Il cielo del titolo respira.** Quattro strati di gradiente scorrono su un
  ciclo di due minuti, tutti dentro il blu e il bianco: nessuno cambia tinta, ma
  la loro somma si'. La deriva e' lenta di proposito — se la si vede muovere,
  distrae da cio' che c'e' da scegliere — e si ferma con
  `prefers-reduced-motion`.

## In corso — La firma del gioco

- **Firma lo studio, non la persona.** `ABOUT_LINE` — l'unica riga del gioco che
  nomina qualcuno, e la leggono tutti quelli che aprono la pagina — dice ora
  `© 2026 Noein Solutions`. Stessa sostituzione in `LICENSE`, `README.md`,
  `PRODUCT.md` e nel campo `author` di `package.json`: il nome proprio
  dell'autore non ha ragione di stare su una superficie pubblica.
- **La selezione smette di sembrare un rettangolo di debug.** Il riquadro
  magenta a tinta unita era piatto per costruzione: opacita' costante da bordo a
  bordo e spigoli netti non leggono come luce, leggono come nastro appoggiato sui
  tetti — e il problema non era il colore, era il profilo. Ora ogni parte della
  figura e' la stessa fascia dipinta da uno shader suo: un filo stretto quasi
  bianco che dice dove passa il bordo, un alone largo nel magenta a caduta
  cubica, e un filo scuro all'estremita' esterna che e' l'unica cosa che tiene il
  contorno leggibile sull'erba chiara. Il nucleo esce sopra 1 e finisce nel
  bloom, quindi l'alone morbido non costa un pass in piu'.
- **Squadre fuori dall'impronta, e una cometa al posto del lampeggio.** Quattro
  squadre scostate in fuori inquadrano la cosa scelta invece di raddoppiare
  l'opacita' della fascia, e sono l'unica parte ferma della figura: quando
  l'occhio ci torna trova un ancoraggio. Il battito d'opacita' e' diventato una
  cometa che percorre il perimetro — nel percorrerlo lo descrive, che e' piu' di
  quanto un lampeggio abbia mai detto — e sui montanti sale, cosi' l'altezza si
  racconta da sola. Non c'e' piu' nessuna `Line` nel contorno: in WebGL una linea
  e' larga un pixel e non ha profilo, quindi non puo' essere ne' luce ne' ombra.

## In corso — La citta' si guarda da terra

- **Il mouse gira la testa senza premere niente.** Tenere premuto per guardarsi
  attorno e' il gesto di chi rigira un modellino, non di chi sta in piedi in una
  strada, ed e' anche il motivo per cui la parentela con `CameraInput` — che
  dichiarando `orbitMode` regalava il drag-per-guardare — non aveva piu' niente
  da dare: cambiato il gesto, e' cambiato l'oggetto. Il muoversi-e-basta ha pero'
  un prezzo che una pagina web non puo' ignorare, il puntatore che arriva al
  bordo dello schermo e la rotazione che si ferma a meta' giro; la risposta e' il
  **pointer lock**, che e' anche l'unica che fa sparire il cursore. Il lock si
  chiede dentro il clic che posa l'occhio, perche' e' li' che c'e' il gesto
  dell'utente che il browser pretende.
- **Perdere il puntatore non fa uscire dalla vista.** `Esc` lo rilascia — lo fa il
  browser, e non c'e' modo di intercettarlo prima — e cosi' un cambio di finestra.
  Uscire li' vorrebbe dire buttare fuori chi ha solo alt-tabbato: la vista resta,
  la testa si ferma, e un clic riprende. E' anche il secondo gradino della catena
  di `Esc` che il gioco usa gia' altrove, dove il primo molla qualcosa e il
  secondo chiude.
- **Non si seleziona e non si costruisce.** Le viste d'ispezione, il piazzamento
  degli strumenti, il clic che apre la scheda di un edificio: tutti spenti finche'
  si guarda da terra. Non e' prudenza — sotto lock il puntatore non ha nemmeno una
  posizione da cui scegliere qualcosa, e senza le guardie il clic che serve a
  riprendere lo sguardo aprirebbe la scheda di un edificio a caso.
- **L'interfaccia si toglie di mezzo.** A terra non c'e' niente da comandare, e
  ogni pannello a schermo e' una cosa che non risponde. Resta una targa sola, che
  dice come si esce: un'uscita che non si vede, da una vista che non ha nemmeno un
  cursore, e' una trappola. Si spegne con una classe e non con `hidden` sulla
  sezione, cosi' cassetti aperti e strumento in mano si ritrovano com'erano al
  ritorno invece di essere un secondo stato da tenere allineato al primo.
- **Il verso verticale e' l'opposto dell'orbita.** `CameraInput` passa il
  verticale con il segno dei pixel perche' girando attorno a un soggetto si tira
  il soggetto: verso il basso vuol dire salirgli sopra. Una testa non gira attorno
  a niente, e la stessa regola diventa il contrario di quello che la mano si
  aspetta. Mouse in basso, si guarda in basso.

## In corso — La schermata del titolo, e il mondo che nasce dopo la scelta

- **L'isola non si genera piu' dietro il menu.** `index.html` monta ora
  `src/boot.ts`, che e' l'unico modulo dell'ingresso: `main.ts` costruisce un
  mondo al solo essere importato — renderer, worker, prima passata del
  generatore — e finche' era lui l'entry point del bundle l'isola cresceva
  mentre il giocatore stava ancora scegliendo. L'import e' diventato dinamico e
  sta dentro il gesto che dice «vai»: prima della scelta la pagina non chiede
  ne' Three, ne' i worker, ne' il chunk del gioco (13 kB contro 1,26 MB).
- **Una pagina sola, tre voci.** `TitleScreen.ts` sostituisce il menu
  d'ingresso a due colonne: titolo, Continue con dentro quando e quanto grande
  era la citta', l'isola nuova con il suo seed e l'elenco dei salvataggi.
  Le sottoschermate sostituiscono l'elenco invece di aprirsi accanto, cosi' non
  c'e' mai piu' di una domanda aperta per volta.
- **Il velo se ne va sul segnale del mondo, non sul primo frame.**
  `signalWorldReady` parte dove si chiude la finestra di caricamento — l'unico
  istante in cui «il mondo c'e'» e' vero — e l'attesa ha un tetto di dodici
  secondi perche' un segnale che non arriva non lasci una pagina morta.
- **Il menu di pausa torna a essere solo quello.** Spariscono `openMenuAtStart`,
  il bottone Continue e il ramo `resumable` di `MainMenu`: sotto quel velo c'e'
  sempre una partita viva, e riaprire l'autosalvataggio sta fra gli slot con il
  suo bottone Load. Il tiro del seed si sposta in `launchMode.ts` (`rollSeed`),
  che e' l'unico posto importabile senza costruire un mondo.

## In corso — Prestazioni: il tick dentro il frame

- **Il memo dei lotti (fase 1.1).** `findLot` girava fino a ventisette volte per
  infornata sullo stesso rettangolo di venticinque isolati, e in un nucleo saturo
  lo percorreva tutto ogni volta. `LotMemo` tiene, per la sola durata di
  `buildPass`, le colonne gia' bocciate. Misurato su isola vera (seme
  `2555647721`, 351 edifici, ultime quaranta infornate): mediana da **5.481 ms a
  140 ms**, caso peggiore da **10.185 ms a 200 ms**. La citta' generata e'
  identica, e adesso c'e' un test che lo dice.
- **Perche' non serve invalidarlo.** I tre modi in cui una colonna bocciata torna
  libera — un cantiere che chiude, una prenotazione che cade, un impalcato che
  nasce — accadono tutti fuori da `buildPass`. Il memo nasce e muore prima, ed e'
  la ragione per cui e' esatto invece che approssimato.
- **`placeLot` resta puro.** La memoria entra come due funzioni (`exhausted`,
  `onExhausted`), come gia' la disponibilita' entrava come predicato: il modulo
  non sa quando una memoria scade, e non deve saperlo. La ricerca lungo il bordo
  non dichiara mai un lato esaurito, perche' salta di `align` in `align` invece di
  percorrere la superficie.
- **L'impronta digitale della citta'.** Sorella di quella della grammatica un
  piano piu' su: `generateDigest` fissa la sagoma di un edificio a parita' di
  seme, `cityDigest` fissa quali edifici nascono e dove. Serve a rendere un numero
  la promessa «non cambia la citta' generata», che ogni intervento su `findLot`
  fa e nessuno finora poteva verificare.
- **Il memo degli isolati sopravvive all'infornata (fase 1.2).** Il rettangolo
  esaurito — «per questo isolato d'origine e questo lato non c'e' posto da
  nessuna parte» — c'era gia' dalla 1.1, ma veniva buttato via a ogni infornata
  insieme alle colonne bocciate. E' un fatto che vale piu' a lungo: `placeLot`
  percorre tutto il rettangolo e il candidato ne cambia soltanto l'ordine. E'
  uscito da `LotMemo` ed e' diventato `BlockMemo`, che dura finche' il mondo non
  libera del suolo. Misurato A/B nello stesso processo su isola vera (seme
  `2555647721`, 351 edifici, 300 infornate, quattro esecuzioni alternate): nelle
  quaranta infornate a saturazione la mediana della passata scende **da 145 a
  9,1 ms** e il caso peggiore **da 210 a 14,3 ms**; le colonne lette per ricerca
  passano da 7.099 a 2.202. La citta' generata e' identica, e `cityDigest` non
  si e' mosso.
- **L'invalidazione e' un'epoca, non tre ganci.** `Builder.freedomEpoch` somma
  tre contatori monotoni, uno per ciascun modo in cui una colonna bocciata torna
  libera: `BuildingRegistry.vacated` (prenotazione rilasciata, record tolto),
  `AerialDriver.decksOpened` (un impalcato che nasce sopra un suolo preso, che
  `lotIsFree` conta come libero) e `TerrainMap.chunkCount` (terra che arriva dove
  non c'era isola). `findLot` la mostra al memo prima di ogni ricerca; se e'
  cambiata il memo cade tutto, perche' inseguire *quale* rettangolo sia cambiato
  costerebbe piu' della passeggiata che risparmia. Ogni contatore sta accanto
  alla domanda che invalida e non nel `Builder`: un quarto modo di liberare suolo
  dovra' portarsi il proprio.
- **Quello che non ha fatto.** Il caso peggiore non e' sceso con la mediana:
  resta una passata da 190–250 ms, ed e' sempre la prima dopo un cambio d'epoca.
  Il costo medio e' abbattuto, quello massimo e' ancora senza tetto — e il tetto
  e' la fase 2 del piano, non un'altra taratura di questo memo.

## In corso — Le arcologie fioriscono

- **Tre tappi impilati, e la quota non era nessuno dei tre.** Misurato su seed
  4242 con cinque poli: la città matura occupa **quattordici isolati**, di cui
  sette `core` e sette `fringe`. La quota ne ammetteva tre e ne nasceva **una**.
  A contarle erano `tier !== core` — che taglia a sette — e soprattutto
  `ARCOLOGY.minSpacing: 2`, che rifiuta due megastrutture su isolati
  **adiacenti**: i sette `core` sono un blocco contiguo, quindi un
  impacchettamento greedy ne fa stare due. Una regola scritta per *distribuire*
  era diventata il tetto più stretto.
- **La fascia esce dalla condizione, la densità resta.** `arcologyReady` non
  chiede più `core`: a dire «qui c'è un quartiere» è `minBuilt`, che è una misura
  del luogo invece di un'etichetta, ed è anche la sola delle tre che non può
  svuotarsi per come il giocatore dispone i poli — il difetto che questo dominio
  aveva già incontrato con `isPeakBlock` e con `tier !== core` per l'earthscraper.
  `minSpacing` scende a 1, `minBuilt` da 64 a 40 — su un raggio di ventiquattro
  colonne il candidato migliore oscillava fra 52 e 61 — e
  `buildingsPerArcology` da 128 a 32, così la quota resta il **traguardo** che la
  voce nomina senza tornare a essere un limite.
- **Le due famiglie non si escludono più: la roccia apre, l'isolato sceglie.**
  Il veto `tooHigh` teneva i crateri sulla spalla del cono e le torri sulla
  cresta. Misurato: cinque poli sovrapposti riempiono il cono su **tutto** il
  nucleo, quindi ogni candidato risultava cresta e la famiglia interrata non ha
  mai avuto un sito in partita — metà del catalogo esisteva solo nei test. Ora la
  domanda è se sotto c'è roccia asciutta abbastanza; dove c'è, a scegliere fra
  salire e scavare è un tiro deterministico sull'indice dell'isolato, con lo
  stesso sale che sceglie già la forma.
- **Esito, misurato sulla stessa isola.** Da **una** arcologia a **quattro**, da
  una forma a **tre** (`doubleBar`, `triSpan`, `invertedPyramid`), e per la prima
  volta un earthscraper accanto alle torri. Il rifiuto che resta è `thin`, cioè
  la densità costruita: la megastruttura arriva dove c'è un quartiere, che è la
  condizione che la fase voleva. `ARCOLOGY_REFUSALS` perde `notCore` e `tooHigh`.

## In corso — La citta' si guarda da terra

- **Una camera all'altezza degli occhi.** `O` arma lo strumento, un clic posa
  l'occhio sul punto puntato, il trascinamento gira la testa e la rotella cambia
  il campo visivo; `Esc` risale e restituisce l'inquadratura identica. L'occhio
  non cammina: e' una vista fissa, e il punto lo si sceglie di nuovo uscendo e
  rientrando. Su un tetto ci si sale — a decidere e' la quota colpita dal raggio,
  non la colonna di terreno — e l'acqua si rifiuta, perche' la heightmap li'
  risponde con il fondale.
- **E' un secondo controller, non un modo del primo.** `IsoCameraController` da'
  la prova di quando una manovra e' tale: «proiezione, zoom, near e far sono lo
  stesso codice». Qui fallisce su ogni riga, e su una in particolare —
  l'inclinazione deve **attraversare lo zero**, che e' esattamente il valore che
  la' e' vietato perche' `1 / sin(pitch)` esplode nel pan sul piano di terra.
  L'input invece si riusa per intero: `CameraInput` sceglie fra girare e panare
  guardando `orbitMode`, e a terra non c'e' un pan da cui distinguere il gesto.
- **La nebbia integra il segmento giusto.** L'integrale era in forma chiusa
  «perche' la camera e' ortografica», ed era la ragione sbagliata: lo e' perche'
  la quota e' lineare lungo il segmento, cosa vera di qualunque raggio dritto.
  Cio' che l'ortografica comprava era descrivere il segmento con **un vettore per
  fotogramma**. Ora il raggio si ricava per frammento da `cameraPosition`, e a
  dire quale dei due casi vale e' `isOrthographic`, un uniform che Three scrive da
  se' a ogni draw: nessuna uniform nuova, nessuna scrittura per frame, e la vista
  isometrica identica per costruzione.
- **Il velo di quota si accende sul cammino.** Non dipende dalla distanza — e' il
  suo scopo — ma quel «non dipende» era scritto per una camera parcheggiata a
  centinaia di unita', dove nessun frammento visibile e' vicino. Con l'occhio
  dentro la citta' dipingeva di lattiginoso il muro a due voxel dal naso. Ora sale
  da zero entro `FOG_LIFT_NEAR`, che sotto ortografica e' un no-op per costruzione.
- **Il cielo ha un orizzonte.** Il gradiente seguiva l'altezza di schermo, ed era
  giusto finche' i raggi erano paralleli: tutti hanno la stessa elevazione, quindi
  un cielo «fisico» avrebbe dato una tinta piatta. Quando convergono segue
  l'elevazione vera. Le due copie della curva — quella del fondo e quella della
  nebbia — sono diventate **una funzione sola** in `skyGradient.glsl.ts`, che e' la
  forma forte della regola che i due file si scambiavano per commento. Con lo
  stesso raggio per pixel il banco di nuvole smette di scorrere piatto e si
  incurva verso l'orizzonte.
- **L'ombra si stringe attorno all'occhio.** La shadow map si adatta all'AABB dei
  chunk visibili, e da terra quell'AABB e' un corridoio lungo quanto l'isola: il
  texel valeva un quarto di voxel. Ora si interseca con una scatola di 96 voxel di
  raggio attorno all'occhio — puo' solo rimpicciolire, quindi i chunk ancora in
  aria durante la caduta d'ingresso restano esclusi come prima — e la pass
  disegna **meno** mesh di quante ne disegnava.
- **La vista ferma vale una resa migliore.** Da terra la camera non si muove: la
  coda di remesh si ordina una volta e poi mai, nessun chunk nuovo entra nel
  frustum, e l'ombra costa meno di prima. Quel margine si spende sopra la densita'
  dello schermo — supersampling, l'unica manopola che tocchi gli spigoli dei
  voxel, e su un display 1x l'unica disponibile perche' li' il tetto normale e'
  gia' raggiunto. Il tetto e' due, e si limita da solo: su un 1x sono quattro
  volte i pixel, su un 2x e' la risoluzione nativa. `RenderQuality` continua a
  sorvegliare i tempi e a scendere se non tengono — il boost sposta il punto di
  partenza dell'isteresi, non la scavalca — e un modo fisso alza la risoluzione
  senza disfare la scala di effetti che il giocatore ha scelto con `?quality=`.
  All'uscita si rimette il livello che la misura aveva raggiunto, non il default.
- **Il contorno si linearizza.** Il Sobel girava sulla profondita' grezza, e
  funzionava perche' in ortografica quella e' gia' lineare. In prospettiva i
  valori si accalcano verso uno: alone nero sul primo metro, niente oltre una
  decina di voxel. Non e' una soglia da ritarare — non ne esiste una che vada bene
  a due metri e a duecento — quindi si inverte la curva del buffer prima del
  filtro. Il tilt-shift invece si spegne: e' una banda di fuoco che dice
  «modellino», ed e' scelta cosi' proprio perche' l'ortografica non ha convergenza.

## In corso — Il campionario non si copre piu'

- **Le fasce si ordinano per quota decrescente, non per lettura.** La camera
  guarda da `(+x, +y)`: lungo +y ci si avvicina, e chi sta davanti copre chi sta
  dietro. Le quindici arcologie — fino a settecentotrentasette voxel —
  seppellivano la matrice e la fascia di scala, che stavano oltre loro. Ora le
  gallerie stanno dietro la base, in y negative e dalla piu' alta alla piu'
  bassa: le megastrutture in fondo, dove salgono nel cielo vuoto.
- **Il conto dell'occlusione sta in `swatchOcclusion.ts`, e prima sbagliava.** La
  formula che viveva nel commento dell'interasse della matrice, `CELL_HEIGHT -
  cellPitch / 2`, confrontava due file alla stessa x invece che sulla stessa
  colonna di pixel: dichiarava quattro voxel nascosti dove ce n'erano sei, e la
  griglia era occlusa oltre il filo dello sbalzo mentre il test diceva di no.
  Il vuoto che serve e' **la quota di chi sta davanti**, non la sua meta';
  `cellPitch` sale percio' da dieci a dodici.
- **Due regole, due assi.** In y il distacco fra due file e' la quota della fila
  davanti; in x il vuoto fra due vicini e' la **profondita'** del soggetto a x
  maggiore, perche' li' l'altezza non entra affatto. E' il motivo per cui
  quindici megastrutture si separano spendendo poche decine di voxel di fila
  invece di centinaia di profondita'.
- **Un ripiano per riga invece di uno per fascia.** Con distacchi larghi come un
  edificio, un basamento continuo sarebbe stato un piazzale grigio: resta il
  principio di sempre — il piano di lettura e' largo quanto cio' che ci sta
  sopra — applicato una riga alla volta.
- **La riserva di pan e' quattro chunk, non un rettangolo pieno.** `growBounds`
  allarga una scatola, quindi l'AABB dipende solo dai chunk estremi: riempire
  l'interno non aggiungeva un voxel di liberta' alla camera e sarebbe costato
  centoventi megabyte di chunk vuoti sul campionario riflusso.
- **Un test nuovo tiene l'invariante**: nessun soggetto ne copre un altro, su
  tutte le coppie, con la sola eccezione dichiarata della matrice — dove sotto
  `CELL_LEDGE` c'e' il podio e non c'e' niente da distinguere.

## In corso — La scala dell'arcologia si vede

- **Da un rifiuto a una misura.** Il driver produceva un enum — `notCapped` — che
  non distingue «uno su due» da «zero su due», cioè due partite diverse. Il nuovo
  `src/world/arcology/prospect.ts` raccoglie *tutte* le condizioni mancanti con
  `have`/`need` leggendo le stesse soglie di `siting.ts`, e un test verifica in
  entrambe le direzioni che la prima lacuna sia esattamente il rifiuto del
  predicato: due misure per la stessa domanda divergerebbero alla prima
  ritaratura, come già successo con i due raggi di `isCoastal`. La raccolta non
  costa una scansione in più — riusa l'oggetto che sta per andare ad
  `arcologyReady`, dove `builtNeighbours` e `cappedNeighbours` sono già misurati.
- **Il consiglio sull'arcologia adesso arriva a schermo.** Stava in fondo
  all'elenco del coach, che ne mostra una riga sola, e `skylineSuggestion` — vera
  per quasi tutta la partita — lo copriva sempre: la meccanica esisteva e non
  aveva voce. Ora precede lo skyline e tace finché il quartiere attorno al
  candidato non c'è, così le lacune lontane restano a chi le dice meglio. Un test
  verifica che possa passare davanti.
- **Il cassetto Città mostra una scala invece di un contatore.** `Arcologies: 0`
  è il valore normale per quasi tutta la partita e da solo non dice niente: al suo
  posto la quota come traguardo con la barra, le lacune riga per riga, e la
  **ricompensa** — quali usi la struttura ospiterà, derivata dal catalogo e non
  scritta a mano. Le parole vivono in `src/ui/prospects.ts` accanto al resto della
  lingua di «cosa manca», perché le stesse righe serviranno alla scheda
  dell'isolato.
- **Misurato, e la diagnosi in ROADMAP 4.18 è vecchia.** Su seed 4242, otto
  catalizzatori del listino e 6000 tick: il campo di desiderabilità **satura a
  255** e la soglia effettiva arriva a 293 contro i 198 di
  `BUILDER.upgradeThreshold`, quindi la desiderabilità **non** è più il tappo che
  la roadmap descriveva. Con il magazzino illimitato le torri arrivano al livello
  26 e **un'arcologia nasce**; con l'economia vera si fermano al **livello 10** e
  `cappedNeighbours` resta 0. Il collo di bottiglia è quindi
  `upgradeMaterialCost` — `2·(livello−6)²`, cioè da 32 a 578 unità per singola
  promozione — contro un tetto di fascia `core` di 23. Il messaggio del coach
  nomina ora quella causa e non più la desiderabilità.

## In corso — La punta delle arcologie

- **`frameRegion` accetta il centro verticale della regione.** Il perno stava sul
  piano di terra a inquadratura qualunque: meta' schermo finiva sotto il
  basamento e la cima usciva di sopra. Sul campionario erano centotrentacinque
  voxel di arcologia fuori campo perfino premendo il pulsante «Arcologies», e la
  fascia arriva a 737 voxel. L'altezza dichiarata era gia' quella giusta:
  mancava il centro su cui appoggiarla.
- **La quota del perno sopravvive al pan.** `clampTarget` riportava la z del
  target a `targetHeight` a ogni spostamento, quindi la prima freccia premuta
  rimetteva l'inquadratura a terra. Adesso il perno ha una quota sua, che
  `frameRegion` e `restoreState` scrivono e il pan rispetta.
- **Doppio clic sul campionario: inquadra il soggetto.** Dal basamento alla
  punta, con il perno a meta' altezza. La fascia intera mette quindici arcologie
  in fila, e avvicinarsi con la rotella tagliava proprio la cima; `Esc` molla la
  scelta e rimette la fascia da cui si era partiti.

---

**Gli incrementi precedenti — 188 — stanno in [docs/changelog/](docs/changelog/)**, in sette
schede da 55.000 caratteri. L’elenco completo dei titoli, con la scheda di ciascuno,
è in [docs/changelog/README.md](docs/changelog/README.md): è da lì che si trova un
incremento, non aprendo le schede a tentoni.
