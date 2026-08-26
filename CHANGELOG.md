# Changelog

Cosa è cambiato, dal più recente. Il *perché* delle scelte sta in
[README.md](README.md) e in [src/sim/README.md](src/sim/README.md); *dove sta
cosa* in [PROJECT_INDEX.md](PROJECT_INDEX.md); dove va il progetto in
[ROADMAP.md](ROADMAP.md).

Il progetto non è ancora versionato: ogni voce è un incremento, identificato dal
commit che lo chiude. Le voci descrivono il contenuto effettivo, che non sempre
coincide con il messaggio di commit.

---

## In corso — Landmark nuovi: firma, stadi e microgeometrie

- **Le sei ricette nuove hanno una firma e delle microgeometrie.** Centrali,
  scuola, torre radio, faro, teatro e stadio non sono piu' prismi smussati con
  salti di stadio appena leggibili: la centrale guadagna il capannone a falda e
  le torri a tamburo, la scuola una U vera con il cortile aperto sul retro e la
  falda sulle ali, il faro una torre che si rastrema davvero (6x6 -> 4x4 -> 2x2
  con ballatoi), lo stadio una tribuna a due ordini. `entrance()` e `signBand()`
  aprono ora porta e insegna su tutti e sei (prima solo sul teatro), portando i
  canali `portal` e `luminous` del mesher dove c'erano solo `plain` e `utility`,
  che `collectSurfaceCells` scarta per contratto.

## In corso — Scala degli edifici

- **Il lotto a terra cresce fino alla larghezza dell'isolato.** `findLot` non chiede piu' un'impronta fissa al modulo: passa il lato libero dell'isolato, e oltre `MAX_FOOTPRINT` lo stamp diventa un assemblaggio — sotto-volumi `generateBuilding` su un podio condiviso, fusi in un solo `VoxelStamp`. Nascita, promozione e cancellazione passano dallo stesso dispatcher (`buildStamp`) con lo stesso sale, cosi' la cancellazione rigenera esattamente cio' che e' stato scritto.
- **La camera e l'altezza del mondo seguono la scala verticale.** `worldHeight` non tronca piu' le torri a 64: default e tetto derivano da `maxTowerHeightOf() + TERRAIN.maxHeight`; l'inquadratura della crescita lascia spazio alla torre piu' alta sopra il pianoro dell'isola.

## In corso — Polishing dell'HUD

- **L'HUD si adatta allo schermo invece di spegnere le parole.** L'unità di
  misura non è più il pixel ma `--hud-unit`, che vale 1px su una viewport da 1080
  e scala con la quota fra un pavimento (0.85, sotto cui i corpi di testo non si
  leggono e i bersagli non si colpiscono) e un tetto (1.15, oltre cui la cornice
  mangia la città invece di servirla). Ogni token di spazio, testo, raggio e
  taglia ne è un multiplo, quindi la scala è continua: niente scatti, niente
  soglie, niente sparizioni.
- **Le colonne del dock le decide la quota disponibile.** Dodici catalizzatori su
  tre colonne fanno sette righe, ed erano quelle a chiedere ~975px di rail: più
  di quanti un 1080p ne abbia davvero una volta tolte le barre del browser, ed è
  il motivo per cui quasi tutti vedevano il ramo compatto. Gli stessi quattro
  gruppi (4, 4, 4, 3) su quattro colonne stanno in quattro righe, una per gruppo.
  Le tre colonne restano sopra i 1200px, dove c'è abbondanza vera: sono la
  disposizione bella, non quella normale.
- **Le rinunce cominciano dove prima erano già finite.** Il prezzo e la cifra del
  requisito cedono a 700px di quota, l'etichetta a 600 — prima cedevano a 900 e
  800, cioè su quasi ogni schermo reale. Fra gli 800 e i 600 ora ci si arriva con
  le parole al loro posto.
- **La colonna di ogni tessera è passata dal JS al CSS.** Deve cambiare insieme
  al numero di colonne, e chi decide le colonne è la media query: tenere il
  conteggio in `BuildDock` significava avere due fonti per lo stesso numero, con
  la scheda che si sarebbe disallineata al primo ridimensionamento.

## In corso — Licenza e proprieta' intellettuale

- **`LICENSE` proprietaria in radice.** Il repository e' pubblico ma non e' open
  source, e finora non lo diceva da nessuna parte: senza un file di licenza la
  posizione di default era implicita, quindi illeggibile per chi arriva. Il
  documento nega copia, opere derivate, redistribuzione e uso come materiale di
  addestramento per modelli di IA, concede lettura ed esecuzione locale, e
  chiarisce che le dipendenze di terze parti restano sotto le loro licenze.
  Unico documento del progetto scritto in inglese: e' il testo che deve valere
  davanti a chi arriva da fuori, e il pubblico di un repo su GitHub non e'
  italiano.
- **Rimando dal `README.md` e campi in `package.json`.** Una sezione "Licenza" in
  fondo al README e i campi `author` / `license` nel manifest: la nota deve
  trovarsi dove uno guarda per primo, non solo in un file che va aperto apposta.

## In corso — Polishing dell'HUD

- **Una scala di token al posto dei numeri a mano.** `hud.css` guadagna uno
  strato geometrico accanto a quello cromatico: spaziatura su griglia 4pt, scala
  tipografica a ratio stretto, quattro raggi, una scala di quote. Erano dodici
  padding, dieci raggi e dodici corpi di testo decisi uno per uno; i valori del
  tema restano derivati a runtime da `hudTokens.ts` e non sono stati toccati.
- **I cinque pannelli del bordo destro hanno una larghezza sola.** Dashboard,
  policy, viste, temi, aiuto e scheda di selezione andavano da 300 a 470px, e
  siccome condividono lo stesso bordo destro il bordo *sinistro* saltava a ogni
  cambio di pannello, scoprendo e ricoprendo la città. Adesso è `--panel-w`, e
  una sola riga di media query li stringe tutti insieme.
- **Il requisito non tocca più il bordo della tessera.** Lo spazio che ospita la
  cifra sotto una tessera bloccata è diventato `--tile-foot`, e si spegne insieme
  al testo: le media query sull'altezza stringevano il padding senza sapere che
  ci stava dentro qualcosa.
- **La condizione della città è una targa, non un paragrafo.** Il toast in basso
  a sinistra portava titolo e spiegazione — la stessa coppia che il cassetto
  Città apre in cima alla colonna — e restava aperto per tutta la crisi. Ora
  resta il titolo; il perché sta dove c'è spazio per leggerlo.
- **Museo, cattedrale e deposito avevano la tessera vuota.** `HudIcon` non
  conosceva i tre ruoli aggiunti a `BALANCE`, `PATHS[name]` tornava `undefined` e
  le tessere uscivano senza disegno — con etichetta, prezzo e tasto al loro
  posto, cioè senza sembrare rotte. Aggiunte le tre icone e rimosso il cast in
  `BuildDock` che lo lasciava passare: ora un ruolo senza icona rompe la
  compilazione.
- **Le schede escono dal rail, non dal bottone.** `left: 100%` finisce dove
  finisce il bottone, e il dock è una griglia a tre colonne: la scheda di una
  tessera in prima colonna si apriva sopra le due colonne accanto e sopra le
  righe sotto, coprendo mezza toolbar proprio mentre la si stava leggendo. Ogni
  bottone dichiara ora la sua colonna (`markRowColumns`) e il CSS scavalca quelle
  che restano — con l'effetto che tutte le schede si aprono sulla stessa
  verticale invece di saltare da tessera a tessera. Non è `position: fixed`
  perché `.hud-button:hover` applica un `transform`, e un antenato trasformato
  diventa il containing block anche dei discendenti fissi.
- **Meno cose che si contraddicono.** `--hud-ink-soft`, usata e mai definita, era
  un colore che non smorzava niente; `--dock-tiles` era scritto a ogni corsia del
  dock con un commento che descriveva un `flex-grow` che nessuna regola CSS
  applicava; allarme e avvertimento erano due regole di toast identiche parola
  per parola, e il tooltip del rail era la stessa regola scritta due volte.

## In corso — Sei nuovi landmark, due per categoria

- **Sei nuovi catalizzatori: Power, School, Radio, Lighthouse, Theatre e Stadium.** Ogni gruppo della toolbar passa da quattro a sei ruoli, per un totale di diciotto. Ognuno porta costi, intensita', vettore di influenza, effetti locali e una ricetta con tre esemplari; il faro e' il solo nuovo vincolo di sito (`coastal`). Le sei ricette stanno in `recipes/` (tre file, uno per gruppo) e si uniscono a `LANDMARKS` con uno spread, mentre gli helper condivisi escono da `config.ts` e vanno in `vocab.ts` per non superare la regola delle seicento righe.

## In corso — Le megastrutture nel campionario

- **Le tre arcologie chiudono la galleria dello swatch.** Twin Stem, Branching Core e Sky Weave arrivano da `ARCOLOGY_RECIPES` allo stadio finale, con una fascia di navigazione propria («Arcologie») e la scheda del soggetto: forma, stadio, fasce di uso e fronte. Come per edifici e landmark, ingombro e altezza escono dallo stamp generato — quasi duecento voxel — e la selezione li tratta da soggetti logici come gli altri, riusando la traversata di raggio e il contorno.

## In corso — Galleria completa e selezionabile nel campionario

- **Tutte le tipologie e tutti i landmark stanno nel campionario, selezionabili.** Le due fasce in fondo alla scena swatch derivano dal catalogo vero — ogni riga di `TYPOLOGIES` a livello 6 e ogni landmark allo stadio finale, varianti e forme contestuali incluse — con ingombri e altezze misurati dagli stamp generati, mai copiati a mano. Il vuoto minimo fra i soggetti e' di otto voxel e non appartiene a nessuno. Il pannello guadagna cinque pulsanti di navigazione (Matrice, Scala, Edifici, Landmark, Tutto) e la scheda del soggetto; hover e click risolvono il soggetto con una traversata di raggio sul primo solido visibile, e il contorno riusa `SelectionOutline` con una quota piatta, senza toccare mesh ne' palette.

## In corso — Dodici ruoli, quattro per gruppo

- **Tre nuovi catalizzatori: Depot, Museum e Cathedral.** La crescita guadagna il piazzale merci (`depot`, commercio e industria), l'identita' il museo (ricchezza e soddisfazione) e la cattedrale (soddisfazione pura): ora ogni gruppo ne ha quattro. Ognuno porta costi, intensita', vettore di influenza, effetti locali e una ricetta con tre esemplari. Il deposito apre la specializzazione logistica, il museo il turismo e la cattedrale fa quartiere con il parco (`garden`).

## In corso — Il dock va a tre colonne

- **City, Policies e Views non sbordano piu'.** Le tre porte stavano incolonnate in fondo al dock e finivano oltre il bordo dello schermo; ora stanno in una **riga** sola, accanto alle tre icone, e il dock scende a **tre tessere per riga** — meta' delle righe di prima. Il rail si allarga a tre tessere, e parola e icona delle porte si stringono invece di uscire.

## In corso — Il dock resta a due colonne

- **Niente piu' tessere sovrapposte.** La colonna singola da 96px non bastava piu' ai dati sopra e alle tessere sotto, e stringerle con `flex` le faceva scavalcare il proprio contenuto. Il dock resta **sempre a due colonne** — meta' delle righe, rail largo il doppio — e si accorcia solo con le media query sull'altezza, che tolgono prima il prezzo e poi l'etichetta, mai il bersaglio.

## In corso — Post-processing: raggi del sole, contorno e colore

- **Vignettatura e ritocco di colore dopo il tone mapping.** Un pass finale in sRGB — saturazione, contrasto e vignettatura — rende i colori piu' vivi senza toccare la palette ne' le mesh: i default stanno in `PostProcessing.ts` (`DEFAULT_GRADE`) e un tema li riscrive con `atmosphere.grade`.
- **Raggi del sole in spazio schermo.** Una pass accumula il bagliore verso la posizione del disco solare — la stessa coppia di `SkyBackground`, quindi irradiano dal punto giusto — e si spegne quando il sole e' dietro la camera; `atmosphere.godRays` ne tara la forza.
- **Contorno scuro delle sagome dalla profondita'.** Un Sobel sulla profondita' della scena marca i soli profili: con la camera ortografica dentro l'edificato non c'e' discontinuita' da segnare, quindi restano solo le sagome contro il cielo. Una pass a schermo pieno, spenta nel profilo `performance`; `atmosphere.outline` ne tara la forza.
- **Bordo chiaro delle facce di scorcio nel materiale.** Un fresnel su normale e direzione di sguardo accende i profili dei volumi senza attributi ne' pass nuove: `rimFactor` in `lighting.ts` con la sua meta' GLSL in `voxel.frag.ts`, e `atmosphere.rim` lo regola.
- **Tutto e' gated dalla qualita'.** `RenderQuality` spegne ritocco, raggi e contorno nel profilo `performance` come gia' fa con bloom e tilt; l'overlay e l'hook `__voxelStats` li elencano nella stringa degli effetti.

## In corso — Decisioni meno frequenti e meno ripetitive

- **Le decisioni si aprono quando la citta' cambia, non a orologio.** Una scelta
  contestuale attende un cambiamento reale — una nuova classe di edifici, un
  ordine di grandezza in piu' di abitanti — con un tetto di inattivita'
  (`decisions.maxIdleTicks`) oltre il quale si riapre comunque. L'emergenza
  alimentare resta un guasto e non cambia cadenza.
- **Alternative che rinnovano invece di ripetersi.** Quando il mandato della
  famiglia e' gia' attivo, l'opzione lo rinnova («Renew the festival») e
  «Keep the space open» solleva il mandato solo se c'e' davvero qualcosa da
  sollevare.
- **Testo parametrizzato e a rotazione.** Titoli e messaggi cambiano con i
  numeri vivi della citta' e con la scadenza, senza intaccare il determinismo.
- **Niente piu' modale che blocca.** «Decide later» rimanda la carta per
  `decisions.snoozeTicks`; la scelta resta rispondibile nell'inbox del City
  dashboard, in cima al cassetto della citta'.

## In corso — Correzione del rail sul portatile

- **Il dock non sborda piu' dal bordo inferiore.** `flex: 1 1 auto` e le corsie che si dividono l'altezza in proporzione alle tessere fanno stringere il dock fra i dati sopra e la targa sotto; sotto gli 800px le etichette lasciano la tessera e passano nella scheda al passaggio del mouse, cosi' la colonna resta intera su un portatile.
- **`V` non riapre piu' i popover a caso.** La pastiglia delle risorse, come i bottoni del dock, si sfoca al clic col mouse: il browser non riaccende piu' `:focus-visible` sul primo tasto, e la scomposizione del saldo non riappare sopra l'ultima risorsa toccata.

## In corso — Riprogettazione dell'HUD

- **La dashboard della citta' si separa dal governo.** `PolicyDrawer.ts` — cinque linguette che mescolavano leggere e agire — si spezza in `CityDrawer` (sola lettura: condizione, traguardi, capacita', economia, commercio, scambi, forma, infrastrutture, storia) e `PoliciesDrawer` (policy e rotte commerciali). Il dock guadagna due porte, «City» e «Policies», al posto della sola panoramica.
- **Dati e comandi condividono una sola sidebar a sinistra.** La colonna delle risorse lascia il bordo destro e sale in cima al rail sinistro — risorse, tempo e cielo sopra, il dock dei comandi sotto — cosi' lo stato della citta' sta sopra le sue leve e non occorre un secondo bordo da guardare. Il lato destro resta interamente ai pannelli che si aprono e si chiudono.
- **Il corridoio verticale torna interamente alla citta'.** Toast, carta decisione e aiuto erano centrati e cadevano dove le torri crescono in altezza; ora il toast sta in basso a sinistra accanto al rail, e decisione, aiuto e selezione salgono dal bordo destro.
- **Tempo e cielo sono due gruppi nella colonna dei dati.** Pausa e velocita' stanno sotto «Time», ciclo del giorno e nuvole sotto «Sky», invece di sei bottoni che avvolgevano a caso.
- **La scheda al cursore parla la lingua del tooltip.** Era l'unica superficie chiara fra i due popover scuri: ora e' un popover scuro come la scheda del dock, e i picker di tema e viste guadagnano la croce come gli altri cassetti.

## In corso — La lente dei raggi X trova i landmark sommersi

- **Punta e rivela il landmark piu' vicino.** Il soggetto dei raggi X non e' piu' soltanto l'edificio sotto il cursore: entro `XRAY.landmarkReach` la lente si aggancia al landmark piu' vicino, misurato sull'impronta vera — un molo o una pista si agganciano anche sul fianco lungo — cosi' i monumenti che la crescita ha circondato si trovano puntando nei paraggi invece che al pixel.
- **Il landmark si accende, non si vela soltanto.** Un volume nuovo nelle uniform (`uInspectGlowMin`/`uInspectGlowMax`) porta il landmark esatto nel fragment, che lo tinge di un arancione caldo e lo schiarisce (`XRAY.glow.tint`/`boost`): resta pieno dentro la lente mentre cio' che lo copre si riduce a gabbia. Il predicato legge la **cella** e non la posizione, quindi non tigne il vicino che tocca il landmark sul bordo.
- Senza landmark a portata la lente torna alla domanda di sempre — l'edificio piu' alto sulla colonna — e l'accensione resta spenta.

## In corso — Il config degli edifici diventa una cartella

- **`buildings/config.ts` si spezza in `buildings/config/`, e nessun consumatore cambia riga.** Duemila righe rispondevano a sei domande diverse — quanto in fretta la citta' cresce, di che parole e' fatta una forma, quanta massa da' un livello, che aspetto ha un uso, quale forma prende in un luogo preciso, di che materia e' fatto un quartiere — e chi cercava un numero doveva sapere in che terzo del file guardare. Ora sono sei moduli piu' un `index.ts` che li ri-esporta: i 134 file che importano `buildings/config` risolvono sulla facciata e restano intatti, e un numero nuovo va nel modulo che risponde alla sua domanda invece che in fondo al primo file aperto.
- **Due commenti orfani spariscono, e uno resta ma attaccato a cio' che spiega.** Il JSDoc del bonus di livello sull'angolo documentava un campo di `BLOCK` tolto tempo fa e pendeva prima della parentesi chiusa; la prosa che *racconta* perche' e' stato tolto stava invece staccata sotto la costante, dove niente la legava a `BLOCK`. Ora c'e' solo la seconda, in testa a `BLOCK`. Stessa sorte per il «Tetti per livello» che stava sopra `MAX_FOOTPRINT` e parlava di `LEVEL_CAPS`: e' tornato dove serve, in `config/levels.ts`.
- **Nessun valore e' cambiato.** `typecheck`, `build` e la suite intera danno lo stesso esito prima e dopo, compresi i tre test gia' rossi in partenza (`growthScene`, due in `Builder`).

## In corso — Forme contestuali dei landmark

- **Il ruolo e la forma fisica sono ora due campi distinti.** `BuildingRecord.landmark` resta il catalizzatore (il ruolo di simulazione), mentre il nuovo `landmarkForm` conserva quale ricetta disegna lo stamp; `aloft` resta come flag meccanico denormalizzato («non prende suolo / l'ospite non cresce») derivato dalla forma. Avanzamento, selezione e rigenerazione ritrovano cosi' sempre la stessa ricetta, e il ruolo non decide piu' da solo che struttura compare.
- **Le forme contestuali generalizzano `SKYPORT`.** Al posto della sola mappa `ALOFT`, `FORMS` elenca per chiave `LandmarkFormId` le seconde strutture di un ruolo: tre di facciata (`skyport`, `sky-park`, `sky-transit`) e tre d'acqua per il porto (`port-bulk`, `port-shipyard`, `port-passenger`). `landmarkOf(kind, form?)` legge da `FORMS` quando la forma c'e', altrimenti ripiega sulla ricetta a terra.
- **Il porto promuove le sue tre varianti a forme scelte dal luogo.** La classe dell'acqua davanti al molo (`classifyWater`) decide il mestiere: `open` diventa bulk, `canal` diventa shipyard, `shallow` diventa passenger. Niente nuova geometria — banchina, gru e magazzini restano quelli — cambia solo cosa ci si scarica, e a deciderlo e' la profondita' e l'esposizione dell'acqua invece del seme.
- **Il selettore prova facciata, poi acqua, poi terra.** `LandmarkDriver.place` interroga prima il sito in quota, poi il nuovo sito costiero, poi la fondazione a terra; il rifiuto del porto distingue «niente acqua» da «acqua del tipo sbagliato». I consumatori (`SelectionPanelModel`, `growthScene`, `swatchCatalog`, `routes`) leggono `landmarkForm` invece di `aloft`.

## In corso — Arcologie: gli stadi leggono il conteggio congelato

- **Il podio non perde più i vicini che l'hanno reso possibile.** `climb` ricalcolava `countWithinRadius` dopo lo sventramento dell'isolato, che toglie dal raggio proprio gli edifici che avevano fatto superare `minBuilt`: un'arcologia fondata a sessantaquattro si fermava sotto la corona. Il conteggio si legge ora una volta sola, in `found`, prima dello sventramento, e viaggia su `foundedNeighbours` fino alla progressione degli stadi — la stessa misura decide fondazione e stadi, sullo stesso istante.
- **Le soglie sono riallineate alla scala congelata.** Le `stages` delle tre ricette erano tarate sul conteggio post-sventramento (minBuilt 64 contro un conto di periferia a 54); sulla scala pre-sventramento stanno una decina di edifici più in alto, da cui il +10 su tutta la scala. Il tetto della corona resta da riconfermare a runtime con `?debug=1`, perché il conto del centro denso pre-sventramento è una stima e non una misura.

## In corso — Selezione esplorabile e contorno vivo

- **Le quattro unita' della selezione sono ora raggiungibili.** La scheda di selezione ha una linguetta per struttura, isolato, colonna e voxel: prima mostrava soltanto la sezione di default e le altre restavano invisibili. Le linguette seguono il pattern ARIA del drawer (frecce, Home/End), stanno nel modello come copia in inglese provata dai test, e spostano il contorno in-world sull'unita' scelta.
- **Il contorno di selezione non e' piu' una fascia ferma.** L'isolato riceve un riempimento semitrasparente che segue il terreno, angoli a L che inquadrano il riquadro, e un respiro lento di opacita' che tiene viva la selezione senza distrarre. Nessuna mesh voxel viene toccata: resta un overlay sopra la scena, e la forma si ricostruisce solo quando il riquadro cambia.

## In corso — La citta' leggibile

- **Un centro informativo unico.** Il bottone `City` apre una panoramica degli obiettivi e delle informazioni globali che prima vivevano solo nello stato: capacita' abitativa, organico, copertura alimentare, bilanci, tipologie, livelli, infrastrutture e progresso verso l'autosufficienza.
- **Scambi e decisioni verificabili.** Il drawer mostra il referto dell'ultimo tick commerciale, i collegamenti attivi, i mandati permanenti e le decisioni recenti invece di lasciare visibili soltanto i comandi che li modificano.
- **Blocchi spiegabili anche da tastiera.** Le azioni non ancora disponibili usano `aria-disabled`: non si attivano, ma restano nel percorso del focus e aprono la scheda con requisito e avanzamento.
- **La panoramica della citta' non e' piu' un unico foglio da scorrere.** Le cinque sezioni del tab City sono diventate righe comprimibili che si aprono una alla volta, cosi' il corpo scorre solo quando serve e il punto letto non salta. Il drawer intero si riduce poi a una maniglia sul bordo destro che conserva il solo titolo, senza confonderlo con chiuso: il bottone di minimizza resta accanto alla croce e la maniglia riapre con un clic.

## In corso — Skyport di facciata

- **Lo Skyport si appende agli edifici come una terrazza.** Puntando con l'aeroporto una torre di livello 7 o superiore e larga almeno otto voxel, il mirino si orienta sulla sua facciata e lo scalo nasce interamente fuori dall'impronta, alla quota letta dalla parete; gli sporti profondi ricevono i piloni calcolati dalla stessa regola della citta' in quota. Dirigibili, eVTOL e mongolfiere restano collegati al catalizzatore piantato dentro l'ospite.

## In corso — Regole world a contesto locale

- **Il contesto segue il dominio.** `src/world/AGENTS.md` conserva soltanto i contratti comuni e instrada verso `AGENTS.md` locali; le spiegazioni estese restano integralmente in `docs/world/`, cosi' terreno, edifici, traffico e gli altri sottodomini caricano solo i riferimenti pertinenti.

## In corso — L'economia del cibo torna risolvibile, e il gioco lo dice

- **`plotsPerPass` era metà di ciò che la sua derivazione diceva.** Scritto a mano in `FARMS` valeva `6`, mentre il conto nel commento accanto — `sitesPerBuild / ticksPerBuild` edifici per tick, tutti residenziali, un campo ogni due case, più il margine di `food.targetCoverage` — ne dava `12`. Sotto il tetto giusto l'offerta agricola tornava una costante contro una domanda che cresce con la città. Misurato su terreno pianeggiante, 1394 tick di fame contro 212. Adesso è un prodotto, `PLOTS_PER_PASS` in `farmDriver.ts`, dove i vocabolari di `BUILDER` e di `BALANCE` già si toccano, ed è legato da un test.
- **Un campo con un masso in mezzo è ancora un campo.** `planPlot` rifiutava il quadrato intero alla prima colonna sterile o ripida: su una costa frastagliata quella regola non scarta i posti sbagliati, scarta quelli *quasi* giusti. L'isola tarata ha 31.900 colonne coltivabili — terra per 443 case — e i quadrati interamente puliti ne sfamavano 214. Con `FARMS.minArableShare` a nove decimi passano da 107 a 144 e le case sfamate da 214 a 288, senza costo a schermo: il solco è invisibile proprio sui biomi tollerati. L'occupazione resta invece assoluta.
- **La soglia che apre la via verticale stava sopra il proprio soffitto.** `farming.density` valeva `0.52`, ma i ruoli che portano industria arrivano al massimo a `0.444` — mercato e fabbrica sulla stessa colonna, misurato — quindi nessuna città di soli ruoli di crescita poteva esprimere `farming`. A `0.40` la fascia esiste ed è stretta: con un Transit accanto alla fabbrica le torri idroponiche passano da 49 a 69 e i tick affamati da 1497 a 707 su 3000.
- **Correzione a margine.** `orchardTrees` poteva piantare un albero fuori dal proprio lotto: il margine di mezza chioma era imposto sul bordo vicino e non su quello lontano, dove il jitter poteva scavalcarlo. A lato dodici non si vedeva per aritmetica, ma era vero lo stesso.
- **La voce che guida il giocatore adesso nomina un gesto.** Diceva *«Add production near a residential area»* a una città affamata, e quel gesto non produce cibo. I consigli vivono in [src/game/tips.ts](src/game/tips.ts) — crisi, colli di bottiglia che nessuna barra mostra (l'organico condiviso, gli scaffali vuoti, la campagna rimasta indietro), opportunità e meccaniche non dette — e `cityCondition` sceglie di cosa si parla. La riga ha una permanenza minima di otto secondi, tenuta da `GrowthScene`: le condizioni si valutano dieci volte al secondo su segnali che oscillano, e senza sfarfallava fra due consigli ogni secondo e mezzo. Le crisi interrompono comunque, in entrata e in uscita.

## In corso — Arcologie raggiungibili e ramificate

- **Tre megastrutture invece di una sola irraggiungibile.** Branching Core divide un nucleo in quattro bracci e Sky Weave incrocia tre steli su quote diverse; entrambe entrano negli isolati giocabili da quattordici colonne, mentre Twin Stem resta sugli isolati larghi. La scelta e' deterministica per isolato e la maturita' viene verificata con forza e portata reali del mercato, cosi' la fase non resta verde soltanto nella fixture privilegiata.

## In corso — Ponti automatici fra isole

- **Lo skyline secondario apre il collegamento.** Un settore acquistato che sviluppa una torre abbastanza alta cerca una torre affacciata nella citta' primaria e genera automaticamente un ponte in quota soltanto sopra un canale d'acqua reale; la struttura compare a segmenti nel budget, non prende suolo e cade se cambia uno dei due appoggi.
- **Collegarsi conviene.** Ogni ponte vivo aggiunge otto punti al bersaglio della soddisfazione, con tetto difensivo e compatibilita' per i salvataggi precedenti, quindi il nuovo quartiere riceve un vantaggio misurabile sulla crescita della popolazione.

## In corso — Scalo in quota riconoscibile

- **Lo Skyport si scopre dal dock.** La scheda dell'Aeroporto ora spiega che un click su un tetto 8×8 di livello 7 o superiore costruisce lo scalo per dirigibili, eVTOL e mongolfiere, invece di mostrare soltanto il requisito della radura per la pista a terra.

## In corso — Impalcati sottili e idroponica leggibile

- Mensole e passerelle sono ora lastre da un solo voxel: gambe, teste dei nodi e microgeometria raccontano il carico senza un bordo pieno alto tre voxel.
- `roofGarden` dipinge anche la copertura vera, non soltanto le rientranze del corpo. Le torri idroponiche uniscono così le fasce verdi illuminate della facciata a una vasca visibile dall'alto nella vista isometrica della città.

## In corso — Selezione e influenza dei landmark

- **I landmark si possono studiare direttamente.** Un click su un landmark apre la sua scheda invece dell'isolato, evidenzia l'ingombro e mostra sul terreno il campo geodetico completo con gradiente e isolinee; la scheda dichiara inoltre portata, intensita', usi favoriti e usi penalizzati del catalizzatore reale associato.

## In corso — L'economia del cibo torna risolvibile

- **`plotsPerPass` era metà di ciò che la sua derivazione diceva.** Scritto a mano in `FARMS` valeva `6`, mentre il conto nel commento accanto — `sitesPerBuild / ticksPerBuild` edifici per tick, tutti residenziali, un campo ogni due case, più il margine di `food.targetCoverage` — ne dava `12`. Sotto il tetto giusto l'offerta agricola tornava una costante contro una domanda che cresce con la città. Misurato su terreno pianeggiante, 1394 tick di fame contro 212. Adesso è un prodotto, `PLOTS_PER_PASS` in `farmDriver.ts`, dove i vocabolari di `BUILDER` e di `BALANCE` già si toccano, ed è legato da un test.
- **Un campo con un masso in mezzo è ancora un campo.** `planPlot` rifiutava il quadrato intero alla prima colonna sterile o ripida: su una costa frastagliata quella regola non scarta i posti sbagliati, scarta quelli *quasi* giusti. L'isola tarata ha 31.900 colonne coltivabili — terra per 443 case — e i quadrati interamente puliti ne sfamavano 214. Con `FARMS.minArableShare` a nove decimi passano da 107 a 144 e le case sfamate da 214 a 288, senza costo a schermo: il solco è invisibile proprio sui biomi tollerati. L'occupazione resta invece assoluta.
- **La via verticale al cibo era dichiarata e chiusa nei numeri.** La soglia `farming.density` valeva `0.52`, ma i ruoli che portano industria arrivano al massimo a `0.444` — mercato e fabbrica sulla stessa colonna, misurato: era irraggiungibile per costruzione. E `hydroponicTower.minLevel` chiedeva il livello 5, dove su 225 edifici industriali il più alto raggiunto era 4. Con `0.40` e livello `3` le torri nascono dove il quartiere è davvero denso e industriale.
- **Effetto misurato**, isola vera, stessa base, tutorial mercato/fabbrica/parco: la quota di domanda alimentare servita passa da `0.60` a `0.84`; aggiungendo un Transit sulla fabbrica passa da `0.71` a `1.00`, con 85 torri idroponiche contro 23 e i tick affamati da 2877 a 770 su 3000.
- **Correzione a margine.** `orchardTrees` poteva piantare un albero fuori dal proprio lotto: il margine di mezza chioma era imposto sul bordo vicino e non su quello lontano, dove il jitter poteva scavalcarlo. A lato dodici non si vedeva per aritmetica, ma era vero lo stesso.

## In corso — Puntatore dei componenti da facciata

- `PlacementCursor` riceve ora il piano di appoggio del componente: resta orizzontale su suolo e tetti e ruota di 90 gradi sulle quattro facciate verticali.
- La terrazza passa al puntatore la faccia stradale dell'edificio ospite, cosi' mirino, onda e fascio anticipano l'assetto del piazzamento invece di restare stesi sul tetto.

## In corso — Economia verso le nuvole

- **I materiali ora costruiscono davvero la verticale.** L'industria alimenta una riserva protetta da negozi ed export; grattacieli, terrazze, funivie e arcologie la consumano, mentre i livelli aumentano capacità e resa in modo controllato.
- **Il saldo è spiegabile.** Il popover dei materiali separa produzione, manutenzione, negozi, export e cantieri e indica quanto manca al prossimo cantiere bloccato.

## In corso — Il tetto della campagna copre di nuovo il costruttore

- **`plotsPerPass` era metà di ciò che la sua derivazione diceva.** Scritto a mano in `FARMS` valeva `6`, mentre il conto nel commento accanto — `sitesPerBuild / ticksPerBuild` edifici per tick, tutti residenziali, un campo ogni due case, più il margine di `food.targetCoverage` — ne dava `12`. Sotto il tetto giusto l'offerta agricola tornava una costante contro una domanda che cresce con la città: per tutta la crescita la città mangiava i due terzi di ciò che le serviva con la dispensa a zero. Misurato su terreno pianeggiante, 1394 tick di fame contro 212.
- **Adesso è un prodotto, non un letterale.** Il tetto vive in `PLOTS_PER_PASS` dentro `farmDriver.ts`, dove i vocabolari di `BUILDER` e di `BALANCE` già si toccano, ed è legato da un test: cambiare la cadenza del costruttore o quanto un campo sfama muove il tetto da solo invece di farlo mentire.

## In corso — Sostegni aerei più sottili

- **Gambe proporzionate al carico.** Terrazze e impalcati ordinari mostrano ora fusti sottili con piede e capitello di microgeometria, a volte aperto a Y; grandi aggetti e nodi con forti salti conservano piloni voxel pieni, senza cambiare occupazione o collisioni.

## In corso — Landmark leggibili in montagna

- **Un landmark non diventa piu' una guglia di fondazione sul versante.** Il terrapieno puo' scavalcare un solo ciglio naturale; oltre, cursore e click rifiutano il sito invece di unire piu' terrazze con pareti alte mezzo fianco. Le banchine conservano il proprio tetto piu' ampio verso il fondale.

## In corso — Selezione per isolato e produttività

- **Il click sceglie sempre l'isolato.** La scheda non offre più le linguette Structure, Column e Voxel e il contorno richiesto al renderer è sempre quello del blocco stradale.
- **Il rendimento è leggibile dove si decide.** La scheda dell'isolato mostra capacità abitativa e commerciale, materiali e cibo per tick, costo civico e quota di organico; l'aggregato segue policy, usi misti, arcologie e la conversione delle torri idroponiche da materiali a cibo.

## In corso — Riserva dei materiali

- **La produzione torna visibile nel magazzino.** Il commercio interno usa soltanto i materiali sopra la riserva per edificio, come gia' faceva l'export: una citta' con domanda pari alla produzione non resta piu' bloccata a stock e delta zero mentre le fabbriche lavorano.

## In corso — Nodi in quota alleggeriti

- **Il salto non e' piu' un blocco pieno.** Nei nodi fra percorsi a quote diverse l'altezza supplementare prolunga soltanto le teste delle gambe; il piano costruibile e la sua travatura restano invariati, senza trasformare un pianerottolo da 6 x 6 in un prisma pieno alto fino a dieci voxel.

## In corso — L'economia alimentare smette di essere una costante

- **La portata del collegamento esterno segue la taglia della città.**
  `trade.importFoodPerTick` era una quantità assoluta contro una domanda che vale
  `pop × food.perResident`: un porto copriva il **667%** della spesa a 240
  abitanti e il **4,9%** a 3268. Diventa `trade.importFoodShare`, una quota, con
  `foodImportShareOf` come unica aritmetica per i suoi due lettori. Resta un
  supplemento: porto e aeroporto insieme, con la priorità sul cibo, arrivano al
  55% e non oltre.
- **La campagna si dimensiona sull'organico che la città ha davvero.** Il driver
  chiedeva quanti lotti mancassero *a organico pieno*, cioè stimava il raccolto su
  un'aritmetica diversa da quella con cui `tick` lo calcola: una città a 0,8 di
  organico ne raccoglieva 0,8 credendosi in pareggio. `staffing` entra nello stato
  accanto a `commerce`, `flows` e `harvest` — era già calcolato e buttato via — e
  `missingPlotsFor` lo legge da sé, così attraversa il confine solo la risposta.
  Misurati su 9000 tick, città di 3264 abitanti con le braccia contese: quota di
  domanda servita da **0,80 a 1,00**, tick con la città affamata da **6478 a 926**.
- **Il pareggio secco teneva la dispensa a zero per costruzione.** È la FOOD 0
  che si leggeva nella HUD di una città sana: il raccolto pareggiava il pasto e
  non avanzava niente, quindi ogni oscillazione era una carestia. Nuovo
  `food.targetCoverage`, che sta sopra `decisions.recoveryCoverage` per contratto —
  sotto, piantare non riarmerebbe mai il fronte dell'emergenza. Il prezzo sono 38
  campi in più e il 7% di materiali in meno: il bacino di braccia è uno solo.
- **L'emergenza alimentare riconosce il porto.** Il fronte si riarmava solo sul
  raccolto, quindi una città nutrita dal commercio non sarebbe rientrata mai e il
  giorno in cui i fondi fossero finiti l'allarme non sarebbe tornato a suonare. Si
  somma la **portata** e non quanto è passato davvero, che dipende da quanto c'è in
  dispensa e che una dotazione falserebbe.
- **La dotazione dell'emergenza si conta in tempo.** `decisions.reliefTicks`
  sostituisce `foodGrant × scale` per le tre alternative: cento tick di consumo,
  misurati a schermo, erano **dieci secondi**, e in dieci secondi non si pianta
  niente. Seicento sono due terzi di `intervalTicks`, cioè il tempo di reagire
  prima della decisione successiva. Sparisce anche l'arrotondamento a edifici
  interi, che a popolazioni piccole rendeva il regalo a scatti.
- **Il frutteto non è più un declassamento su tutti gli assi.** Rendeva 0,4 di
  cibo per braccio contro gli 0,6 del campo, oltre a metà raccolto per lotto:
  `communityGardens`, che spinge verso il frutteto, peggiorava il raccolto due
  volte. Con due braccia invece di tre resta un solo costo, ed è quello giusto —
  il doppio della **terra**, che è anche ciò che il mandato promette di sé.
- **Anche la fiera del cibo paga in proporzione alla città.** Ultimo numero
  alimentare rimasto piatto: a costo fisso era soddisfazione gratis appena la
  città cresceva, cioè non era più una scelta fra tre alternative.
- **La HUD nomina chi consuma.** La riga `Eaten` del tooltip del cibo diceva il
  gesto e non chi lo compie; diventa `Residents`. Resta una riga sola perché il
  cibo ha un solo consumatore — gli abitanti — e non si scompone per edificio.

## In corso — I poli lontani crescono, e il cursore dice la verita' in montagna

- **Ogni catalizzatore ha il suo turno di crescere.** `nextBuildSites` ordina i
  candidati per desiderabilita' **assoluta** e ne restituisce i primi venti su
  tutta la mappa: bastava un nucleo maturo — due o tre campi sovrapposti tengono
  migliaia di celle libere sopra duecentoquaranta — perche' ogni catalizzatore
  piantato lontano restasse senza una casa **per sempre**. Non lentezza: zero.
  Misurato su una citta' di seicento edifici, un mercato accostato all'edificato
  ne portava centosettantanove in centoventi secondi di gioco e lo stesso mercato
  piazzato lontano zero; su un isolotto staccato, zero prima e duecentonovantadue
  dopo. `poleRectAt` da' un turno a testa e `BuildSiteQuery.within` ritaglia la
  classifica su quel polo, dove il confronto fra celle torna a essere fra pari;
  cio' che il turno non spende lo spende la classifica di sempre, quindi il ritmo
  complessivo resta quello tarato su `ticksPerBuild`.
- **Un landmark che non puo' comparire lo dice prima del click.** Su un fianco di
  montagna nessuna opera regge il riquadro di una ricetta, quindi la struttura non
  compariva; la piazzola di ripiego nemmeno, perche' `canPaint` scarta le colonne
  in parete. Il catalizzatore si pagava, il campo funzionava, e sul terreno non si
  vedeva niente — mentre il cursore aveva appena scritto «Valid position». Il
  preventivo ora chiede al terreno la stessa cosa che gli chiede il click
  (`footingAt`, una sola funzione per tutti e tre i chiamanti) e il rifiuto
  `no-footing` compare sul cursore. Il cantiere non si apre piu' per una struttura
  che non puo' comparire: sgomberare e' definitivo, la struttura no.
- **Le sinergie fra ruoli si leggono prima di comprarli.** Le coppie che fanno un
  quartiere erano una catena di `if` dentro `districtOf` e non comparivano da
  nessuna parte: erano l'unica sinergia del gioco e si scoprivano piazzando
  catalizzatori a duecento fondi l'uno. Da tabella, la stessa regola risponde
  anche alla domanda inversa — `districtPairingsOf` — e la scheda del dock guadagna
  la riga «Pairs with», messa **prima** di «Only here» perche' l'ordine e' la
  catena: due campi sovrapposti fanno un quartiere, e il quartiere apre le forme.
- **Cosa il ruolo consegna alla citta'.** Fra lo strumento in mano e la barra
  delle risorse non c'era niente: un mercato non porta fondi, porta i negozi che
  li portano. La riga «Yields» nomina le risorse dei due usi piu' favoriti, e il
  cibo compare sotto il residenziale invece che come voce sua — non lo produce
  nessun uso urbano, lo consumano gli abitanti, e i campi arrivano da soli quando
  il conto non torna.

## In corso — Mezzi dentro il paesaggio

- **I mezzi passano per un materiale di scena invece che per i colori nei
  vertici.** Erano `MeshBasicMaterial` con la tinta di palette gia' moltiplicata
  per l'ombra della faccia, riscritta alla cadenza dell'HUD: funzionava, e si
  vedeva — una nave in fondo alla rada restava satura mentre la costa dietro si
  scioglieva nella nebbia, quindi non stava *nel* paesaggio, ci stava sopra come
  una figurina. Ora c'e' un programma proprio che prende **in prestito gli
  uniform del voxel** — gli stessi oggetti, non delle copie — quindi stesso sole,
  stessa ombra proiettata, stessa prospettiva aerea, stesso banco di nuvole, per
  costruzione e non per allineamento manuale.
- **Il GLSL condiviso vive in `shaders/scene.glsl.ts`, in tre blocchi.** Nebbia,
  luce e ombra erano scritte dentro `voxel.frag.ts` perche' li' c'era l'unico
  programma che le usasse; con tre materiali di scena una seconda copia sarebbe
  una copia che diverge. I blocchi sono tre e non uno perche' un uniform
  dichiarato e mai letto e' codice morto che sembra vivo: la schiuma non ha una
  normale da cui campionare un'ombra, e non deve dichiarare la shadow map.
- **Le sagome guadagnano fasciame, grana e finestrini accesi.** Il reticolo di
  lamiera al passo del voxel e la variazione per cella si leggono nel **sistema
  del mezzo** e non del mondo: agganciate alle coordinate mondo, scorrerebbero
  sotto lo scafo mentre naviga. Di notte le fasce vetrate si accendono a
  finestrino, come le facciate della citta'.
- **I fanali sono dichiarati, non dedotti.** `HullBlock.lamp` viene dalla
  scatola: `lightPalette` veste anche le pinne di un dirigibile, e dedurre
  l'emissione dalla tinta le accenderebbe come due tubi al neon.
- **Gli scafi lasciano una scia.** `world/traffic/wake.ts` e' il pennacchio letto
  in orizzontale — la stessa posa letta nel passato, piu' un'apertura laterale
  lineare — quindi in pausa si ferma, a 4x si allunga con la nave e due partite
  identiche lasciano gli stessi segni. Serviva a una cosa sola: uno scafo che
  scivola su un mare intatto e' una figurina appoggiata sopra, e nessun dettaglio
  di sagoma corregge quella lettura. Una barca all'ormeggio non lascia niente.

## In corso — Varieta' delle sagome

- **Il repertorio delle fasce si pesca, non si prende in testa.** `nextRect`
  provava le trasformazioni nell'ordine del profilo e teneva la prima che
  reggeva: le voci dietro comparivano solo dove la testa non stava in piedi,
  cioe' in cima alle torri e da nessun'altra parte. Misurato su quattrocento
  semi, un `officeTower` di livello sei usciva con la **stessa identica sagoma
  nel 96% dei casi** (sette sagome distinte in tutto). Ora il seme pesca il punto
  di partenza con il minimo di due tiri — una triangolare, quindi la testa resta
  la piu' probabile e «questo uso arretra profondo quando puo'» continua a essere
  vero. Stesso campione: 38% e settantasei sagome. I tiri sono **sempre due**,
  anche con un repertorio da una voce sola, o la sequenza del PRNG dipenderebbe
  dall'esito e `recordStamp` non ritroverebbe i voxel da cancellare.
- **La terrazza si misura sulla striscia scoperta, non sul lato della fascia.**
  `GRAMMAR.terraceMinSide` valeva tre e chiedeva `rect.w >= 3`, ma nessuna fascia
  di corpo scende sotto `minBandSide`, che vale quattro: la soglia non poteva
  mordere. Ogni scarto — anche un `jog` da un voxel — usciva pavimentato e con il
  parapetto di `emitRoofTech`, e meta' delle transizioni di fascia lasciava
  proprio un anello da un voxel. E' il motivo per cui a schermo la terrazza non
  era un luogo ma una cornice, ripetuta su ogni piano di ogni edificio della
  citta'. Ora la soglia e' `GRAMMAR.terraceMinRing` e misura l'anello: sul
  ripiego residenziale i voxel di pavimentazione passano dal 4,1% allo 0,7% del
  volume, e la terrazza torna a dire che li' ci si sta.
- **`roundTower` non era mai comparsa.** `selectTypology` tiene la prima riga a
  parita' di priorita', e il tamburo stava **dopo** `skyTerraces`, che pretende
  la stessa ricchezza con un livello in meno: ogni luogo che accettava il tamburo
  accettava anche il gradone, e vinceva il gradone. Non falliva niente — la riga
  c'era nel catalogo e a schermo non e' mai esistita. Spostata dove il suo stesso
  commento la dichiarava; un test di catalogo ora rifiuta qualunque riga dominata
  da una che la precede, che e' il difetto che non lancia niente.
- **Le impronte digitali della grammatica sono rigenerate.** I due tiri in piu'
  per fascia spostano tutta la sequenza: ogni sagoma e' cambiata, ed era il senso
  del cambiamento. Una citta' gia' in memoria va considerata persa.

## In corso — La scheda del dock, e un rail largo la metà

- **Il tooltip di un'azione diventa una scheda.** Era una stringa in un `::after`,
  e con una stringa sola tutte le voci pesano uguale: il nome dello strumento non
  c'era, il prezzo nemmeno, e la frase che spiega *cosa fa* spariva appena il
  bottone si bloccava — al suo posto restava «Not enough funds.» e nient'altro,
  cioè proprio niente per chi stava decidendo se valesse la pena risparmiare.
  `hudTip.ts` porta un modello puro — intestazione con nome e prezzo, la frase in
  chiaro, le righe etichettate del comportamento, il gesto o il blocco in fondo —
  e `paintAction` lo disegna come elemento, rifacendolo solo quando cambia.
- **I numeri nudi diventano leggibili.** «Radius 52» chiedeva di sapere già cosa
  sia grande in questa città: adesso è `Long · 52 tiles`, con la banda derivata
  dal catalogo e non da soglie scritte a mano. Gli usi favoriti sono quattro in
  tutto e vengono nominati tutti — l'elenco si accorciava a tre e chiudeva con
  «+1 more», un'ellissi più lunga del nome che nascondeva. La riga degli sblocchi
  perde la freccia: `Hydroponic tower in farming districts` invece di
  `farming districts → Hydroponic tower`, cioè prima la cosa promessa e poi la
  condizione.
- **`reason` dice solo lo stato.** La descrizione del ruolo vive in
  `description` e la scheda la mostra sempre; il motivo resta il gesto («Click a
  spot on the island to place it.») o ciò che sta fermando il bottone.
- **Il rail passa a una colonna sopra i 900px di finestra.** Due colonne di
  tessere erano 158px di chrome su un bordo dove la città vorrebbe esserci, e
  sotto l'ultimo bottone restavano duecento pixel vuoti: la toolbar era larga per
  non essere alta, su uno schermo che l'altezza ce l'aveva. In colonna singola
  scende a ~96px e le tessere si dividono l'altezza che avanza — ogni corsia
  cresce in proporzione a quante ne ha (`--dock-tiles`), quindi restano tutte
  della stessa misura e il dock si stringe da solo quando la targa della vista
  compare in fondo al rail. Sotto quella soglia resta il layout a due colonne.
- **Il traghetto ha un'icona.** `PATHS` non conosceva `ferry`, e quella tessera
  usciva vuota da quando il ruolo esiste: uno scafo con la cabina e l'onda, che
  si distingue dall'ancora del porto con cui divide la costa.

## In corso — L'emergenza alimentare smette di suonare a vuoto

- **La carestia si legge dai pasti, non dalla dispensa.** «Supplies under
  pressure» si apriva quando lo stock di cibo scendeva sotto
  `trade.foodReservePerResident`, cioè quando in magazzino non c'erano trenta
  tick di scorta. Ma chi pianta i lotti punta al **pareggio** — `missingPlotsOf`
  copre il deficit e nient'altro — quindi una città perfettamente sfamata tiene
  lo stock intorno a zero per costruzione: i due bersagli erano incompatibili e
  la condizione restava vera per sempre. Misurato su una città da 3268 abitanti
  in pareggio esatto: **9000 tick su 9000** con la condizione vera, cioè
  l'emergenza riproposta a ogni scadenza per il resto della partita, e le altre
  due famiglie mai raggiungibili perché il ramo del cibo esce per primo. Ora la
  soglia è su `fedShareOf` — la funzione che esiste apposta per distinguere la
  carestia dal pareggio — e in quello scenario l'emergenza non si apre più.

- **Un allarme che si riarmava sulla propria risposta.** Non bastava la soglia
  giusta: con il rientro misurato sui pasti, la dotazione appena concessa
  sfamava la città per un centinaio di tick, il fronte si ricaricava su *quel*
  pasto e la carestia tornava puntuale appena il regalo finiva — dieci aperture
  in novemila tick, esattamente quante prima. Il rientro ora si misura sul
  **raccolto** (`decisions.recoveryCoverage`), che una dotazione non tocca:
  rientra solo chi ha piantato campi o convertito industria in torri. Una
  carestia strutturale viene chiesta una volta sola — da dieci aperture a una — e
  che sia in corso continua a dirlo la HUD.

- **`supplyArmed`, il fronte che alla scelta mancava.** `nextDecisionTick` è un
  intervallo, non una memoria: da solo riapre l'emergenza a ogni scadenza finché
  la condizione è vera. Risolvere un'emergenza ora la disarma e a ricaricarla è
  `tick`, che è l'unico a sapere quanto la città ha raccolto davvero. Sopravvive
  al giro in JSON; un salvataggio che non lo porta torna armato.

- **Le dotazioni d'emergenza seguono la taglia della città.** `foodGrant` vale
  cento tick di consumo di un edificio residenziale pieno, ma solo *Buy food
  supplies* lo scalava con la popolazione: *Ration supplies* e *Community
  gardens* davano 120 unità fisse, che a 3268 abitanti sono 0,7 tick di consumo
  — meno di un secondo. Due alternative su tre erano gesti simbolici e il
  catalogo non lo lasciava vedere. Ora scalano tutte e tre, costo dei giardini
  compreso, e un test lega l'invariante: la dotazione copre cento tick a ogni
  taglia.

- **`DecisionStateView` dichiara solo ciò che guarda.** Portava `food`,
  `materials` e `funds`: il primo era la condizione sostituita, gli altri due non
  li leggeva nessuno. È la vista in cui si va a cercare *su cosa* si decide.

## In corso — L'influenza prende la forma del luogo

- **I raggi dei ruoli tarati sul cammino, non sulla linea d'aria.** Da quando la
  portata e' geodetica un passo fuori strada costa `BALANCE.reach.land`, quindi
  un raggio `r` arrivava a `r / land` celle nel tessuto: la citta' lontano dalle
  strade copriva un quinto in meno di prima senza che nessuno l'avesse deciso. I
  nove raggi sono stati alzati di un quarto — l'inverso esatto di `land = 1.25`
  — che e' una conversione di unita' e non un bilanciamento. Lungo la
  pavimentazione invece il budget si spende a costo pieno e quel quarto resta
  tutto: e' li' che la meccanica guadagna, ed e' la differenza fra un mercato
  sull'arteria e uno in mezzo agli isolati.
- **Il cursore mostra il campo, non piu' solo il suo bordo.** Un perimetro dice
  dove l'influenza finisce e tace su tutto il resto, mentre cio' che decide dove
  conviene posare un catalizzatore e' *quanto* pesa dove arriva. Sotto al
  contorno c'e' ora una velatura la cui opacita' segue `falloff` cella per cella
  — l'alpha *e'* il contributo che la simulazione sommera' — e sopra tre
  isolinee ai quarti di portata, che danno la misura come le curve di livello di
  una carta. La fascia piena di larghezza fissa che stava al bordo non serve
  piu': il gradiente non sfuma mai a zero, quindi il bordo resta leggibile anche
  sul terreno chiaro, che era la ragione per cui la fascia esisteva.
- **La geometria del cursore si ricostruisce per cella attraversata, non per
  pixel.** Il puntatore manda eventi molto piu' fitti delle celle che tocca, e
  la portata era gia' memorizzata: adesso lo e' anche il disegno, che altrimenti
  ricostruirebbe qualche decina di migliaia di triangoli a ogni movimento del
  mouse. Le isolinee interne costano una frazione del quadrato perche' la
  geodetica non scende mai sotto la Chebyshev — oltre `level` celle in linea
  d'aria non c'e' niente da guardare.
- **Il cartellino dice quanto terreno il sito tocca davvero.** `reach 55 · 3.140
  cells (38% blocked)`: il raggio nominale da solo non distingue piu' due siti a
  dieci celle di distanza, di cui uno guarda l'entroterra e l'altro il mare. Il
  confronto e' con un entroterra piatto e libero — `radius / land`, non il raggio
  pieno — perche' misurare contro il raggio darebbe a ogni posto dell'isola la
  stessa bocciatura. La percentuale compare solo dove il sito e' tagliato.

## In corso — Verifica proporzionata alla modifica

- **`test:changed` e `test:related`.** La suite intera girava dopo ogni
  modifica, anche di una riga. Ora il cerchio stretto risale il grafo degli
  import e fa girare solo i test che toccano davvero cio' che hai cambiato; la
  suite intera resta il passo di consegna, non l'abitudine.
- **Reporter `dot` su `npm test`.** Un file di test per riga erano 134 righe di
  output a ogni run, quasi tutte per dire che andava bene. I fallimenti si
  vedono per esteso come prima.

## In corso — HUD ai lati: il corridoio verticale torna alla citta'

- **Comandi a sinistra, stato a destra, centro libero da bordo a bordo.** La barra risorse in alto e il dock in basso costavano ~190px su 1080 — il 18% dell'altezza — proprio nelle due bande dove in isometrica finiscono la cima delle torri e il piede dell'isola, cioe' esattamente cio' che una citta' che cresce in verticale chiede di guardare. Le quattro corsie del dock si incolonnano su una griglia di due tessere; le cinque risorse diventano una colonna sul bordo destro.
- **Due misure pubblicate invece di numeri ripetuti.** `--game-hud-rail-left` e `--game-hud-top` li riscrive un `ResizeObserver` sul rail e sulla colonna: la barra dei livelli, la scheda di selezione e i pannelli di debug si spostano da soli quando cambia il numero di tessere, invece di portarsi dietro una costante che diverge alla prima aggiunta.
- **La targa della vista entra nel rail.** Stava dove ora comincia il dock; adesso i due sono nello stesso contenitore in colonna — il dock in cima, la targa appoggiata al fondo — e non esiste altezza di finestra in cui si coprano.
- **La bolla del tooltip esce verso il centro.** Su un rail appoggiato al bordo, una bolla centrata sopra una tessera perderebbe un centinaio di pixel fuori dallo schermo: dal dock si apre a destra, dalla colonna risorse a sinistra. Per la stessa ragione il dock **non** ha `overflow`, che ritaglierebbe la bolla a ogni passaggio: a tenerlo dentro lo schermo ci pensano due media query sull'**altezza**, che e' l'asse su cui un rail finisce lo spazio.
- **Il rail si prende il puntatore su tutta la superficie.** Da barra orizzontale in fondo a colonna alta quanto lo schermo, i suoi margini sono diventati un bersaglio grande, e un clic caduto li' piazzava un catalizzatore nella citta' che ci sta dietro.

## In corso — La campagna segue la fame

- **Il deficit alimentare attraversa il confine come quantità, non come sì/no.**
  `foodDeficitOf` diceva già quanti pasti mancano e `FarmDriver` lo riduceva a un
  booleano: piantava due lotti ogni duecento tick che ne mancassero due o
  duecento. La domanda però cresce con la città — un campo ogni due residenziali,
  fino a cento edifici ogni duecento tick — mentre l'offerta restava una costante
  di `farms/config.ts`, e le due divergevano dal primo isolato. Misurato su
  quattromila tick: a 5110 abitanti la città raccoglieva 86 razioni contro le 255
  che le servivano, e la forbice si allargava. Ora `missingPlotsOf` dice quanti
  campi mancano, `plotsPerPass` è il tetto di una passata invece del ritmo, e la
  cadenza scende a quattro secondi — che non si vedono, perché a città sfamata la
  passata non pianta niente.

- **La spirale dei lotti è centrata sull'isola e non sull'origine del mondo.**
  L'isola sta in `[0, 512]` e il suo centro è `(256, 256)`; la ricerca partiva da
  `(0, 0)`, cioè da un angolo di oceano. Dei 2025 candidati ne cadevano sulla
  mappa 529, tutti nel quadrante sud-ovest: una città cresciuta a nord-est non
  vedeva nascere un campo nemmeno affamata. Non si vedeva nei test perché
  `testTerrain` genera a partire dal chunk `(0, 0)` — la fixture metteva il
  terreno esattamente dove la spirale guardava — e il centro si legge ora da
  `TerrainMap.shape`, che fuori dalle fixture c'è sempre.

- **Un frutteto non pianta più alberi sulla carreggiata.** Un solco lo diceva già
  da sé — porta la priorità più bassa della coda del suolo e la strada vince —
  ma gli alberi sono volume e passavano da un'altra porta: `orchardStamp` riceve
  la rete stradale e scarta l'albero il cui ingombro copre un asse. Piantare e
  cancellare la ricevono entrambi, o l'impronta da spegnere non sarebbe più
  quella scritta.

- **Una carestia stabile non si legge più come un pareggio.** Ogni consumo è un
  `min(domanda, disponibile)`, quindi uno stock esaurito si ferma a zero e il
  delta vale *esattamente* zero: `isSelfSufficient` e l'allarme «Food shortage»
  chiedevano il segno del delta e leggevano una città che mangiava un terzo di
  ciò che le serviva come una in equilibrio — l'obiettivo scorreva e l'allarme
  non compariva mai. Ora chiedono a `fedShareOf`, che è il `fed` del tick riletto
  dal referto. Materiali e fondi hanno lo stesso punto cieco e restano sul delta:
  chiuderlo chiede il loro equivalente di `fed`, che oggi il referto non porta.

## In corso — La nave da carico non apparteneva alla città

A distanza isometrica la nave era l'unico oggetto in scena con tre famiglie di
palette sature addosso contemporaneamente: verde dell'erba, azzurro dei vetri e
ruggine sui container, sopra uno scafo bruno. Un edificio a dieci voxel di
distanza ne porta **una**, su una massa neutra — la nave faceva l'opposto, e
proprio sulla superficie più estesa che di lei si vede.

- **I container stanno nell'accento caldo del tema, più una neutra.**
  `cratePalettes` passa da `[metalRust, glassDeep, grassDark]` a `[brickDark,
  metalRust, concreteLight]`: due tinte della stessa famiglia calda e un grigio
  chiaro. Il carico è una massa, non un accento, e segue quindi la regola con
  cui la città fa le masse. Effetto collaterale voluto: i container ora
  cambiano con la palette — magenta al neon, bruciato nell'industriale — invece
  di restare tre tinte fisse, e l'azzurro sulla nave torna a essere solo un
  vetro.
- **Lo scafo della nave da carico esce dai metalli scuri.** `metalDark` è un
  bruno caldo in tutti e sette i temi, mentre la fascia di galleggiamento è
  `asphaltShadow`, che è fredda: la riga si leggeva come un nastro azzurro
  incollato al fianco invece che come l'ombra dell'immersione. Con lo scafo su
  `concrete` le due tinte tornano nella stessa famiglia, ed è quello che la
  fascia deve essere — lo scafo in ombra.

## In corso — HUD: tooltip che si chiudono e pannello di governo a linguette

- **La bolla del tooltip non resta piu' aperta per sempre.** Un clic col mouse lasciava il fuoco sulla tessera del dock, e il browser riaccende `:focus-visible` sull'elemento a fuoco al primo tasto che arriva: in un gioco dove ogni tasto e' una scorciatoia sul mondo bastava scegliere uno strumento e muovere la camera. Ora il clic col mouse rilascia il fuoco (`detail > 0`, cosi' Enter e Spazio continuano a lasciarlo dov'e'), il che toglie di mezzo anche lo Spazio che ricliccava l'ultimo bottone.
- **Il tooltip e' un blocco di righe, non un periodo unico.** Le voci erano incollate da `·` in un testo centrato dove il motivo, il vincolo e i due elenchi pesavano uguale; `May build` del monumento arrivava a diciassette nomi. Adesso una voce per riga, portata/favoriti/penalizzati insieme perche' sono la stessa domanda, ed elenchi che dopo tre nomi si contano (`+14 more`). La stessa regola vale per la scheda al cursore. Sparisce il `title` nativo, che raddoppiava lo stesso testo in una seconda bolla.
- **Il pannello delle politiche si apre su tre linguette e non scorre piu' tutto insieme.** Intestazione e linguette stanno ferme — la croce per chiudere usciva dallo schermo appena si scendeva —, e politiche, commercio e commercio esterno non si sommano piu' in altezza. Sulla scheda di una policy resta la frase che dice *cosa fa*; *dove agisce* passa al `title`, e la riga dei numeri distingue la spesa una tantum dal mantenimento, o dice cosa manca invece del listino che non si puo' pagare.

## In corso — Un edificio ora si posa, prima compariva

`BUILDER.voxelsPerFrame` scende da **96 a 24**. Il budget era stato alzato
insieme alla scala del voxel per tenere fermo *quanto costa* un edificio, e
l'altra metà della stessa frase — «quanto ci mette a comparire» — era rimasta
senza nessuno che la guardasse.

- **Il pop, misurato.** Contati sugli stamp veri, un edificio di livello zero
  sta fra i 290 e i 330 voxel solidi, ed è il 78% di quelli che nascono
  (`START_LEVEL_CDF`). A novantasei cubi per frame erano **tre frame, cinquanta
  millisecondi**: la casa non saliva, appariva già fatta. A ventiquattro impiega
  circa un quinto di secondo, e una torre di livello massimo fra i due e i tre —
  la durata torna proporzionata al volume invece di essere la stessa per tutti.
- **Non è una manopola di prestazioni.** Il tetto di lavoro per frame resta
  `maxGrowing * voxelsPerFrame` e la meshatura a valle ha già un budget in
  millisecondi suo (`ChunkRenderer.update`): abbassare questo numero non compra
  frame rate, allunga il gesto. Quello che costa davvero è il rimeshing — un
  volume spalmato su quattro volte i frame sporca i propri chunk quattro volte
  più spesso — ed è il motivo per cui il numero si ferma qui invece di scendere
  a dieci, dove un capannone di livello massimo terrebbe occupato per sette
  secondi uno dei dodici posti di `maxGrowing` e a rallentare sarebbe la passata
  di upgrade.
- **Il ritmo della città non si muove.** `ticksPerBuild` resta a 6: nascono
  sempre cinque edifici al secondo, e con dodici posti in coda la capacità di
  smaltimento resta abbondantemente sopra quella soglia. A cambiare è solo cosa
  si vede succedere su ciascuno.

## In corso — La microgeometria sapeva solo aggiungere

Ogni emettitore di `microGeometry.ts` appoggiava il suo prisma **fuori** dal
piano della faccia: `facadeBox` metteva il box in `[plane, plane + depth]`, i
dettagli di tetto partivano da `(z + 1) * U`, e la faccia base del greedy pass
restava sempre dov'era. A schermo il risultato era un vocabolario dimezzato —
montanti, parapetti, cornici e tende tutti appiccicati a pareti perfettamente
piatte — perché la soglia, la vetrata a filo interno, la loggia sotto lo sbalzo e
la nicchia si leggono per l'**ombra di un rientro**, e con le sole sporgenze non
si possono dire.

- **La maschera degli scavi, e il punto in cui si innesta.** `greedyMesher.ts` ha
  un solo posto in tutto il progetto in cui si decide se una faccia esiste: il
  mask loop. `carvePlan.ts` gira **prima** del greedy pass e vi scrive un byte per
  cella — ricetta nei bit alti, faccia nei bassi — che quel ciclo consulta con una
  lettura e due confronti. Sopprimere significa `mask[n] = 0`, che è il valore che
  il merge non fonde con niente: non c'è un campo nuovo da far entrare in
  `packFace`.
- **Scavare non tocca il volume, ed è la differenza con `liftGroundCover`.** La
  cella resta piena, quindi cielo, bagliore e AO dei vicini raccontano ancora la
  stessa parete. Una nicchia non deve scurire il muro a due metri.
- **Una faccia soppressa va sempre pagata.** È l'invariante più forte del lavoro:
  un dettaglio additivo troncato lascia un edificio più spoglio, uno riduttivo
  troncato lascia un edificio **bucato**. `planCarves` si limita a
  `MAX_CARVE_QUADS_PER_CHUNK` e scarta scavi interi, mai a metà;
  `appendCarveDetail` scrive per primo fra i dettagli, quindi la riserva c'è
  tutta.
- **Sette ricette, tutte agganciate alla sola geometria** — nessuna modifica a
  `src/world/`, `SurfaceKind` resta a sette linguaggi, nessuno slot nuovo: soglia
  d'ingresso, vetrata a filo interno, loggia sotto uno sbalzo, nicchia, vano
  scala, vassoio di terrazza e mezzanino. Il fondo di una soglia esce `portal` e
  quello di una vetrata `luminous`, quindi di notte l'ingresso e la finestra si
  accendono **dal fondo del vano** invece che dal filo del muro.
- **Il riduttivo si compone con l'additivo invece di affiancarlo.** I montanti di
  `emitPortals` girano attorno alla bocca di una soglia vera; la cornice di
  `emitLuminous` diventa la strombatura di una vetrata arretrata; la rampa di
  `microStreet` entra nel suo vano e non tira più il proprio dado — legge la
  maschera, ed è così che vano e scala restano allineati per costruzione.
  `facadeBox` ha guadagnato un `inset` e i prop di tetto un `roofBase`. Il
  parapetto è l'unica cosa che **non** scende con il vassoio, ed è il punto.
- **Il vano si disegna sul perimetro, non sulle celle**, e la prima stesura lo
  sbagliava. Fondo, davanzale, architrave e due stipiti: una fascia luminosa alta
  ventisei celle costa cinque quad invece di centotrenta, e due celle adiacenti
  non producono più due spalle coincidenti in mezzo alla superficie.
- **L'AO è metà del disegno.** `writeDetailBox` dava a ogni prisma il corner del
  tutto libero, che dentro un incavo significa «niente mi occlude»: gli stipiti
  scendono a 2 e il fondo a 1, ed è quella differenza — non la profondità, che a
  1/16 è minuscola — a far leggere il vano da lontano.
- **Costo, misurato.** Geometria: il dettaglio del chunk fitto passa da 6 055 a
  7 739 quad, e il tetto di 16 384 non si è mosso. Tempo, sul bench `edifici
  sci-fi` con lo scavo spento e acceso nella stessa finestra: **9,6 ms contro
  11,6**, cioè +2,0 ms. La prima stesura ne costava +9,5, e le due cose che
  l'hanno divisa per cinque valgono per chiunque aggiunga una ricetta — il piano
  riceve le liste di `collectSurfaceCells` invece di scandire il volume (quella
  scansione è stata **spostata** sopra il greedy pass, non aggiunta), e il disegno
  scorre il secchiello del proprio marchio invece della lista intera.

## In corso — Il campionario mostrava meno vocabolario di quello che esiste

Le 248 celle della matrice erano la stessa massa a quattro gradoni centrati — la
sagoma **minima** che fa scattare `emitSoffits`, `emitTerraceBoxes` e
`emitFinials`. Minima era il problema: a schermo 248 torte nuziali quasi
identiche, e la differenza fra `habitat`, `industrial`, `civic`, `luminous` e
`roofTech` non si leggeva a colpo d'occhio. Peggio, tre emettitori restavano
spenti del tutto senza che niente lo segnalasse.

- **`CELL_PARTS`: il provino è una massa articolata, e il cortile è la parte che
  mancava.** Podio smussato, sbalzo a filo, quattro lame di corona attorno a un
  cortile 5×5, quattro pinnacoli isolati agli angoli. Il cortile lascia scoperte
  33 celle della sommità dello sbalzo, e 13 hanno **tutti e quattro** i vicini
  scoperti: è la condizione di `interiorRoof`, e finché il tetto più largo era un
  anello di spessore uno `emitRoofMasts`, `emitRoofCrowns` e `emitPergolas` non
  potevano scattare. Misurato: chiome e pergole erano **zero** su tutte e 248 le
  celle. Lo `notch` sulla corona toglie all'anello proprio le celle che
  toccherebbero i pinnacoli, ed è quello a renderli colonne isolate per tutta la
  loro altezza invece che solo in punta — quattro finiali per cella contro uno.
- **La simmetria è C4, non «ogni gradone è centrato».** La ragione non cambia —
  la sagoma dev'essere la stessa da qualunque azimut, o a un quarto di giro metà
  campionario andrebbe letta orbitando — ma la vecchia formulazione valeva solo
  finché i pezzi erano quadrati pieni. Il test ora verifica l'invarianza per
  rotazione di 90° della pianta vera, cortili e pinnacoli compresi: è la stessa
  regola, controllata dove prima si controllava una sua conseguenza.
- **La sagoma sta in un posto solo, `cellSolidAt`**, e la leggono in tre — il
  generatore che la scrive, la sonda che ne conta i prismi, il test che confronta
  il mondo con lei. La pila sequenziale di gradoni non bastava più: corona e
  pinnacoli sono lo **stesso piano**, e due pezzi alla stessa quota una pila non
  sa dirli.
- **`swatchProbe.ts`: quanto dettaglio emette una cella non si stima, si
  rimisura.** Passa gli emettitori veri con un writer che conta al posto di
  scrivere, quindi nessuna tabella scritta a mano può restare indietro. Lo
  consumano il referto sotto il cursore (riga `dettaglio`, e `__voxelSwatch()`
  la restituisce) e due controlli nuovi: un **pavimento** di prismi per
  linguaggio — così una famiglia spenta cade lì invece di non lasciare traccia,
  che è esattamente il difetto appena chiuso — e il **tetto** di
  `MAX_DETAIL_QUADS_PER_CHUNK` sul chunk più carico.
- **Impronta da 5 a 7, interasse invariato.** Il vincolo è
  `cellPitch > CELL_FOOTPRINT`, e 10 > 7 regge: `sizeX` passa da 321 a 323, cioè
  l'inquadratura non cambia. Sopra `CELL_LEDGE` — la sommità dello sbalzo — deve
  restare tutto visibile senza ruotare la camera, e con interasse 10 questo tiene
  l'altezza a 9 livelli: è il conto dell'occlusione, non una scelta di gusto.
- **Misurato, prismi di sola microgeometria per provino**, gradoni → sagoma
  attuale: `habitat` 47 → 119, `industrial` 70 → 170, `civic` 68 → 178,
  `luminous` 64 → 176, `portal` 60 → 180, `roofTech` 21 → 61. `plain` e `utility`
  restano a zero, come devono. Con gli scavi sommati — quel che il referto mostra
  — 137, 204, 212, 304, 308 e 77, e il chunk più carico fa **10 629 quad** di
  dettaglio contro i 16 384 del tetto: era metà prima che le due cose si
  sommassero, quindi chi arricchisce ancora rimisuri invece di fidarsi.

## In corso — L'indice e il changelog non si scrivono più a mano

Con più agenti in parallelo, `PROJECT_INDEX.md` e `CHANGELOG.md` erano quasi un
terzo dei rifiuti del semaforo: li aggiorna chiunque, e sempre nello stesso
istante — a fine turno, quando l'incremento vuole atterrare.

- **Un frammento per agente, in `docs/pending/`.** Ci si scrive la riga d'indice
  e la voce di changelog; `npm run docs:merge` le mette al posto giusto — riga
  in ordine alfabetico nella sezione della sua cartella, voce in coda
  all'incremento in corso o in una sezione nuova se il titolo è diverso.
- **Il blocco sparisce invece di spostarsi.** Il frammento è l'artefatto
  durevole e la fusione è ritentabile da chiunque: se l'indice è occupato,
  l'agente consegna lo stesso e il frammento resta lì per il prossimo che passa.
  La fusione prende un lucchetto suo (`mkdir`, come il semaforo) perché due
  merge insieme si sovrascriverebbero.
- **La regola delle ~600 righe conserva il numero e corregge il motivo.** Il
  lock non si tiene "fino a fine turno": da quando qualcuno lo aspetta scade in
  90 secondi di fermo. Ma chi continua a scrivere lo rinnova, quindi il possesso
  dura quanto il lavoro — ed è per questo che un file grande resta un punto di
  serializzazione.

## In corso — Il gioco si spiega all'indietro

Il gioco si spiegava **in avanti** e il giocatore lo leggeva **all'indietro**.
Ogni superficie rispondeva a «cos'è questa cosa» — descrizione del catalizzatore,
raggio, usi favoriti; nessuna a «cosa devo fare per ottenerla». In mezzo c'erano
diciotto soglie che non comparivano da nessuna parte, nemmeno in debug.

Il difetto era già dichiarato per iscritto in `typology.ts`, sul tooltip che
elenca cosa un ruolo può far nascere: *«un'approssimazione onesta: elenca le
tipologie degli usi che il ruolo favorisce, non quelle che le soglie locali
confermeranno»*. Onesta nell'intento, ma il giocatore la leggeva come una
promessa.

- **Ogni regola che rifiuta sa dire perché.** `specializationGapsOf`
  (`src/sim/districts.ts`) e `typologyGapsOf` (`src/world/buildings/typology.ts`)
  leggono all'indietro le due regole che decidono cosa nasce dove. La prima si
  **deriva** dalla tabella in `balance.ts` — le chiavi delle soglie *sono* i campi
  del profilo — quindi una soglia aggiunta lì compare nel referto da sola.
- **La scheda di selezione risponde alla domanda che nessuno reggeva.** Due righe
  nella sezione della colonna, subito sotto «District now»: quale quartiere questo
  luogo potrebbe diventare e cosa lo trattiene, quale forma ci crescerebbe e cosa
  le manca. Le due righe sono **accoppiate**: se la forma pretende un quartiere,
  è quello che la riga sopra spiega. Scollegate avrebbero occupato lo stesso
  spazio senza comporre una catena, che è la sola cosa per cui la scheda vale.
- **Il requisito riportato è quello vincolante**, non il primo — la stessa scelta
  che il dock fa dalla 7.4 — e un **ruolo mancante batte ogni soglia**: senza una
  fabbrica in raggio, aspettare che la densità salga non serve a niente.
- **La tessera dice cosa un ruolo sblocca invece di promettere.** Le tipologie
  dietro una specializzazione escono da `May build` e rientrano in `Unlocks` con
  la loro condizione (`farming districts → Hydroponic tower`), da `unlocksFor` in
  `src/world/buildings/unlocks.ts` — derivata dai due cataloghi, non una terza
  tabella. Cursore e dock leggono la stessa riga.
- **`accepts` non è stata riscritta**: sta nel percorso caldo e resta il booleano
  senza allocazioni. Le due traversate le tiene insieme un test di equivalenza su
  tutto il catalogo per una griglia di luoghi — che al primo giro ha trovato due
  difetti veri, un campionatore degenere (i bit bassi di un LCG) e un ramo di
  `accepts` che nessuna riga del catalogo usa.

## In corso — Il porto ha le barche, e gli aerei non passano più dentro le torri

Tre difetti che si vedevano solo a schermo, e due dei tre si vedevano come
un'**assenza** — la cosa che nessun test verde sa raccontare.

- **Il porto non aveva barche, e la colpa era di un fuori-di-uno.** Il vincolo di
  sito ammette il click fino a `SITE.coastalRadius` colonne dall'acqua; gli
  ormeggi del porto stanno quattro e cinque colonne *oltre* il click; e
  `sightWater` si fermava alla prima colonna con la cima `<= seaLevel`, cioè
  sull'orlo **asciutto** della spiaggia — `IslandGenerator` scrive l'acqua solo
  dove la cima sta *sotto* il pelo. Su un'isola a quote quantizzate quell'orlo non
  è una riga ma una fascia di bassofondo larga dieci-quattordici colonne: misurato
  su sedici piazzamenti del seed 4242, **tre porti su sedici** avevano una barca e
  sei non avevano niente in acqua.
- **La ricetta dichiara ora la propria linea d'acqua** (`LandmarkRecipe.waterline`:
  12 per il porto, 8 per il ferry) e `landmarkDriver` fa **scorrere la struttura
  lungo il proprio fronte** finché quella colonna cade sull'acqua vera. Il
  catalizzatore resta dove il dito l'ha messo — è lui a portare l'influenza — e la
  banchina va a incontrare il mare. Lo scorrimento è solo in avanti e limitato
  dall'ancora della ricetta: oltre, la colonna cliccata uscirebbe dall'ingombro e
  `catalystIn` non ritroverebbe più il catalizzatore, cioè un monumento fermo allo
  stadio zero per sempre. Stessa misura, dopo: **sedici porti su sedici** con la
  barca da lavoro in acqua, quindici con la nave in banchina, dodici con la nave
  che parte davvero.
- **`sightWater` distingue ora la battigia dall'acqua a galla** (`afloat`), e le
  due risposte restano due: chi chiede «è un posto sul mare?» vuole l'orlo bagnato
  dentro — quello *è* un sito costiero — e chi ci deve posare uno scafo lo vuole
  fuori. Fondere le due, provato, sposta la gerarchia verticale su tutto il fronte
  costiero e cambia dove la città cresce. Il raggio della ricerca a galla è suo
  (`SITE.shoreReach`, 14).
- **Gli aerei volavano dentro i grattacieli.** `TRAFFIC.planeCruise` a
  quarantaquattro voxel bastava quando gli edifici erano bassi; con
  `BUILDER.maxLevel` a dodici una torre supera i centoquaranta, e un semilato di
  circuito da ottantaquattro la centra in pieno. La quota dichiarata diventa il
  **minimo**: il nuovo `skyRoutes.ts` sonda il profilo sotto la propria spezzata —
  per segmenti e non per vertici, o due vertici lontani ottantaquattro voxel
  saltano qualunque torre ci sia in mezzo — e la crociera è il massimo fra quota
  dichiarata e cima sorvolata più `planeClearance`. Le quote intermedie sono
  frazioni della salita e non voxel, così decollo e finale salgono con lei. Vale
  anche per l'orbita del dirigibile, con un franco più stretto (`aloftClearance`):
  un dirigibile appartiene al tetto che lo tiene.
- **Il profilo arriva come predicato** (`CeilingProbe`), esattamente come già
  l'acqua: `world/traffic/` non ha un registry e non deve averne uno. A fornirlo è
  `GrowthScene`, che somma `registry.supportAt` e il terreno — un circuito che
  scavalcasse le torri e non la collina dietro sarebbe lo stesso difetto guardato
  dall'altra parte — e che ora **rifà le rotte anche a scaglioni di sessantaquattro
  edifici**: senza quel segnale, un circuito calcolato in mezzo ai campi resterebbe
  alla propria quota mentre attorno cresce il centro.
- **Lo scalo in quota mette in moto tre mestieri invece di uno.** Su otto colonne
  di tetto non ci sta una pista, e il pilone da solo raccontava metà di quello che
  un tetto attrezzato è: `SKYPORT` guadagna la **piazzola dell'eVTOL** sopra
  l'aerostazione e la **cima della mongolfiera** nell'unico angolo libero, più i
  due `BERTH` e le due sagome (`evtol` più largo che lungo con quattro dischi —
  l'opposto esatto dell'aereo, visto da sopra; `balloon` a cinque conci alternati,
  l'unica sagoma che sta quasi tutta *sopra* la propria origine). L'eVTOL fa un
  giro chiuso il cui primo vertice **è** la piazzola, cioè scende davvero; il
  pallone è un pendolo che sale prima di allontanarsi, e si allontana lungo il
  verso del proprio ormeggio — legarlo al vento di `plume`, che è una costante del
  mondo, manderebbe metà dei palloni dentro il proprio scalo su due versi di
  rotazione su quattro.
- **`traffic/routes.ts` si divide in tre** lungo *cosa si lavora separatamente*:
  `routePath.ts` (di cosa è fatta una rotta e i quattro modi di costruirne una),
  `routes.ts` (orchestrazione e ciò che galleggia), `skyRoutes.ts` (ciò che
  scavalca la città). Nessun ciclo: le rotte in quota importano i tipi
  dell'orchestratore come soli tipi, e le primitive dal file che le contiene.
- **Dove si posa una struttura costiera è ora una domanda pura** e vive in
  `landmarkSiting.ts` invece che dentro il driver: verso, ingombro e angolo già
  portato incontro all'acqua. `landmarkDriver.ts` scende da 630 a 558 righe — era
  finito sopra la soglia dei 600 proprio per questa aggiunta — e lo scorrimento si
  verifica al voxel senza far crescere un'isola.
- File: `src/world/traffic/{config,routes,routePath,skyRoutes,routes.test}.ts`,
  `src/world/landmarks/{config,generate.test}.ts`, `src/world/sites/{config,siteRules}.ts`,
  `src/world/buildings/{landmarkDriver,landmarkSiting,landmarkCoast.test}.ts`,
  `src/engine/vehicleHulls.ts`, `src/game/growthScene.ts`, `PROJECT_INDEX.md`,
  `src/world/AGENTS.md`.

---

## In corso — Il ciglio smette di essere alto uguale

Le pareti di roccia erano tutte alte due cubi. Non era una taratura sfortunata:
era il teorema. Con **una** scala di quote l'alzata è funzione della sola quota,
tutte le celle di una fascia ne condividono una, e siccome due celle contigue
cadono su pedate contigue il salto vale *esattamente un'alzata* — un numero solo
per fascia, su tutta l'isola. Nemmeno `TERRACE.jitter` poteva cambiarlo: scuoteva
la quota prima di posarla, quindi spostava il ciglio **in pianta** e mai il suo
salto.

- **Le scale di `terrace.ts` diventano tre** (`TERRACE.beddings`): roccia fine,
  media e massiccia, un `cellSize` l'una dall'altra rispetto alla tacca di
  schedule, che ora ha un nome suo (`terraceScheduleAt`). Un campo di rumore a due
  ottave sceglie quale tocca a ogni cella — `beddingSpan` dà carattere a un
  versante intero, `beddingBreak` spezza la singola scarpata lungo la sua corsa —
  e siccome le pedate di due scale cadono a quote diverse, il salto varia dove
  varia la stratificazione. Sull'isola di riferimento i cigli passano da un
  valore per fascia a 4, 6 e 8 voxel mescolati alle stesse quote.
- **Lo scarto è sistematico e non estratto**, ed è la parte che è costata due
  tentativi. Un'alzata tirata a sorte per ogni pedata sembrava dare più varietà e
  ne dava meno: due scale che pescano dallo stesso ventaglio si ritrovano di
  continuo sulla stessa pedata e da lì in poi *sono* la stessa scala — misurate,
  tre su quattro condividevano ogni base fino a quota 66. Una stratificazione che
  sale sempre a passo suo diverge e resta divergente, ed è anche ciò che una
  stratificazione è: uno spessore di strato caratteristico.
- **Il campo va allargato prima di quantizzarlo** (`beddingContrast`), o metà
  delle scale non verrebbe mai usata: il rumore di valore è una miscela
  bilineare, e mescolarne due ottave stringe ancora. Le due stratificazioni
  centrali si prendevano il 91% dell'isola e le estreme il 9%.
- **Il tetto del dirupo resta `TERRACE.maxStep`, e la dimostrazione è più forte
  di prima.** Ogni scala posa su un multiplo di cella entro `maxStep` sotto la
  quota vera, quindi due celle contigue distano meno di `maxStep` più il loro
  dislivello di campo: fra multipli di cella quel totale vale `maxStep` esatti,
  comunque siano scelte le due scale. Non dipende più da un margine stretto fra
  ampiezza del disturbo e pedata — le soglie di `IslandGenerator.test.ts` sono
  passate senza essere toccate.
- **`TERRACE.jitter` e le sue quattro costanti spariscono.** Il campo di
  stratificazione fa da solo il suo mestiere — il ciglio di una data quota cade a
  raggi diversi dove la stratificazione cambia, quindi le curve di livello si
  spezzano — e in più varia il salto. Un meccanismo al posto di due; e un
  disturbo in quota si mangerebbe tutto il margine su cui poggia la
  dimostrazione del tetto.
- **La pianura è rimasta quella di prima, voxel per voxel.** Sotto
  `TERRACE.fromHeight` tutte le stratificazioni coincidono: la città cresce lì, e
  un dirupo in mezzo a un isolato sarebbe un dispetto. L'edificabile misurato
  sull'isola di riferimento non cala.

File: `src/world/terrain/terrace.ts`, `src/world/terrain/config.ts`, più
`terrace.test.ts` (riscritto: la nuova invariante su qualunque coppia di scale, e
il ciglio che a parità di quota non ha una sola altezza) e `IslandGenerator.test.ts`.

---

## In corso — L'isola si monta dal cielo

Il primo caricamento era qualche secondo in cui l'isola **spuntava** a fasce:
niente da guardare mentre lo streaming lavorava. Ora i pezzi entrano da fuori
schermo e atterrano al loro posto, con una pioggia di cubetti davanti a loro.

- **A cadere è il chunk, non il voxel, ed è una conseguenza del greedy mesher.**
  A valle del meshing il cubo singolo non esiste più: una distesa di celle
  identiche è un quad solo, quindi un dislivello calcolato per vertice
  *stirerebbe* quel quad invece di farlo scendere. Il chunk è invece l'unità
  rigida che il renderer ha già in mano — una mesh, una matrice — e muoverne
  l'origine porta giù tutto il pezzo. **Nessun attributo di vertice nuovo,
  nessun uniform, nessuna ricompilazione**: i contratti 1–6 restano intatti.
- **L'ombra segue da sola.** Il materiale di profondità ripete la stessa
  trasformazione di vertice di quello di scena, quindi un chunk in aria proietta
  da dove sta senza una seconda copia da tenere allineata. È l'argomento che ha
  deciso la mossa contro un dislivello negli shader, dove le copie sarebbero
  state due. Un chunk in volo resta però **fuori** dal volume su cui si adatta la
  shadow map: allargarne il frustum di centinaia di voxel darebbe texel giganti
  su tutto quello che nel frattempo è già atterrato.
- **La quota di partenza non è una costante in voxel**, ed è il primo errore che
  abbiamo fatto: quarantotto voxel su un'isola larga cinquecento sono un
  saltello, non una caduta dal cielo. «Dal cielo» vuol dire **da fuori schermo**,
  e quanto sia lontano il bordo alto dipende da zoom e inclinazione — un
  dislivello `h` sposta un punto verso l'alto dello schermo di `h · cos(pitch)`,
  esattamente, perché la camera è ortografica. `fallHeightFor` legge l'altezza
  visibile dal frustum e ne chiede una intera, non mezza: chi riposa in fondo
  allo schermo deve partire comunque da sopra il bordo.
- **La finestra non si chiude su `generator.done`**, ed è il secondo errore che
  abbiamo fatto: quando l'ultimo blocco è scritto restano in coda centinaia di
  chunk da meshare, e disarmando lì comparivano di colpo — cioè proprio il pop
  che la caduta esiste per togliere. Si chiude quando non c'è più niente da
  meshare (`chunkRenderer.isIdle`), e l'effetto finisce quando anche l'ultimo
  pezzo è atterrato.
- **Il tempo è quello dello streaming, non un orologio a parte.** Un chunk parte
  nell'istante in cui la sua geometria è pronta, quindi l'isola compare con lo
  stesso ritmo di prima più la durata di un'ultima caduta. Il ritardo porta un
  jitter per chunk — senza, i pezzi consegnati insieme atterravano in lockstep e
  la caduta si leggeva come una tapparella — e un termine per piano di chunk,
  così il mondo si impila dal basso. Una geometria che arriva a chunk già partito
  eredita la posizione corrente: un chunk scritto a metà viene rimeshato, e
  ricominciare la caduta lo farebbe risalire.
- **I cubetti veri sono l'altra metà**, e stanno sopra la scena come tutto ciò
  che si muove: `dropRain.ts` decide dove, `DropRainView.ts` disegna in una mesh
  sola con i buffer riscritti per frame e il `drawRange` a tagliare la coda —
  l'idioma del pennacchio. Dove atterra un cubetto lo dice una sonda passata dal
  chiamante, quindi il modulo non conosce né il mondo né Three e si verifica in
  `node`. Sotto pressione la semina si assottiglia invece di interrompersi.
- La finestra vale **solo per la prima scena**: le espansioni costiere avvengono
  dentro una città viva, dove un pezzo di costa che cade dal cielo sarebbe un
  evento e non un caricamento.
- Numeri in `src/engine/introDrop.ts` e `src/engine/dropRain.ts`, uno per
  dominio. `?intro=0` toglie l'effetto, `__voxelDrop()` lo rigioca senza
  ricaricare, e l'overlay conta i chunk `falling` accanto a quelli visibili.

## In corso — L'influenza prende la forma del luogo

L'area di influenza di un catalizzatore non era un cerchio: era un **quadrato**.
Il campo misurava in distanza di Chebyshev, l'overlay disegnava un cerchio
euclideo, e sulla diagonale l'influenza vera arrivava il 41% oltre la linea
promessa. Nel frattempo un cerchio di fabbrica attraversava trenta celle di mare
e scavalcava un dirupo come se non ci fossero.

- **La distanza è geodetica.** L'influenza si propaga sulle celle percorribili
  invece che in linea retta: l'acqua la ferma, un dirupo la rallenta, una strada
  la porta più lontano. Dijkstra a 8 vicini con coda a secchielli, tagliato al
  raggio, in `src/sim/reach.ts`. I costi stanno in `BALANCE.reach` e a leggerli
  è `src/world/reachCost.ts`, l'unico posto da cui terreno e strade si vedono
  insieme; la simulazione riceve una funzione, non il mondo — com'è già per
  `waterDistance` e `headroomAt`.
- **Con costo uniforme è esattamente la Chebyshev di prima**, cella per cella:
  un passo diagonale copre 1 su entrambi gli assi allo stesso prezzo. È una
  generalizzazione stretta, non una sostituzione, ed è la ragione per cui i test
  scritti sulla forma vecchia sono rimasti verdi senza toccarli.
- **Il costo di un passo non scende mai sotto 1**, e non è una taratura: sotto,
  la portata uscirebbe dal quadrato che il campo ricalcola e cadrebbe
  l'equivalenza fra percorso incrementale e `rebuild`. Una strada perciò non
  costa *meno* — a costare di più è tutto il resto.
- **La curva di decadimento era scritta in tre posti** — il campo, i distretti,
  e `poleReach`, che decide **l'altezza degli edifici**. Due dei tre avevano già
  un commento che dichiarava di temere il disallineamento. Ora è una sola,
  `falloff` in `reach.ts`, e il centro della città non può più cadere in tre
  punti diversi.
- **L'overlay traccia il contorno vero**, con marching squares sugli stessi dati
  che il campo usa: segmenti sciolti e non un anello, perché un canale può
  tagliare la forma in due. La fascia è spessa in distanza geodetica, quindi
  segue il bordo ovunque vada senza giunti da cucire.
- Il campo resta un indice derivato, ma adesso dipende anche dal terreno:
  `reviveSimState` riprende il costo come secondo argomento, e `rebuildField`
  azzera le portate — serve dopo che l'isola si è allargata sotto.

Restano da rimisurare le righe di `npm run bench` che toccano il campo: il
Dijkstra si paga una volta per piazzamento, non a ogni ricalcolo, ma il numero
va preso e non stimato.

## In corso — L'arcologia: un'opera sola che vale un quartiere

Fase 4.14, l'ultima della spina dorsale della fase 4. Non costruisce nessun
meccanismo nuovo: compone i tre che 4.5, 4.6 e 4.9 avevano già chiuso. Il
problema che risolve è che una città matura è un tappeto di torri — quando la
quota ammessa satura, un isolato del centro non ha più niente da diventare.

- **È la quinta riga della stessa macchina**, non un secondo Builder. Un
  `BuildingRecord` con `arcology` valorizzato eredita occupazione, collisione,
  budget di chunk e comparsa a budget da chi c'era già; a cambiare è solo quale
  generatore disegna lo stamp. Il nucleo ricetta→stamp dei landmark è stato
  **estratto** invece che copiato — `PartsRecipe`, `generateFromRecipe` — e con
  lui il cantiere di sventramento, che ora vive in `clearanceSite.ts` e serve
  due domìni: `landmarkDriver.ts` si è accorciato di un terzo.
- **Non si posa.** Nessuno strumento in toolbar, nessun costo in `BALANCE`,
  nessuna riga nuova in `src/sim/`. `arcologyReady` legge lo stato della città —
  fascia `core`, isolato che contiene l'ingombro, densità costruita, e **quota
  ammessa già satura nei vicini** — e le leve del giocatore restano quelle di
  prima. L'ultima condizione è quella che conta: la megastruttura arriva dove la
  città non ha più niente da diventare, non dove è semplicemente densa.
- **Usi diversi su quote diverse, senza insegnare la verticale alla
  simulazione.** La ricetta dichiara una fascia per stadio — podio produttivo,
  mezzanino commerciale, corpi abitati, corona civica — ognuna con la propria
  colonna d'ancoraggio dentro l'ingombro. Il driver chiama `addBuilding` una
  volta per fascia nuova, `record.uses` registra ciò che è stato **accettato**, e
  `tally` conta quelle voci: `countsByClass` resta esattamente uguale a
  `state.buildingCounts` (invariante 7). Un'arcologia è un record e quattro
  edifici per la simulazione, e la differenza fra i due conti è la somma di
  `uses`.
- **Il vuoto dentro l'ingombro è un vincolo verificato.** Il volume che legge
  come megastruttura non è il più alto: è quello che scavalca il vuoto.
  `skyWindowOf` cerca una fascia di quote vuota, flangiata dal costruito e
  passante su un asse per almeno dodici quote consecutive; un test lo chiede a
  ogni ricetta a **ogni** stadio, perché uno stadio successivo può benissimo
  tappare il vuoto che quello prima aveva aperto. Il predicato ha sbagliato due
  volte prima di funzionare — trovava il cavedio dentro uno stelo — e la
  regressione è a test.
- **Cresce per delta.** L'inviluppo è alto centonovantadue quote e non entra in
  `maxDirtyChunksPerBuilding` nemmeno da lontano: ogni stadio accoda il proprio
  `from = stage`, e `trimStampZ` taglia le quote vuote perché la stima sul
  riquadro sia onesta. Senza il taglio una ricetta legittima sarebbe stata
  scartata **in silenzio**, che è il difetto raccontato dal commento di quel
  budget.

Tre cose le ha decise la misura, non il progetto, e sono a commento nei file:

- `isPeakBlock` era nella condizione ed è stato tolto. Con quella riga non
  nasceva **nessuna** arcologia su nessun seed: due terzi degli isolati eletti
  sono più stretti dell'ingombro, il centro è piccolo, e l'intersezione dei tre
  insiemi era vuota. È un tiro ogni sette isolati su tutta la mappa, tarato
  perché le guglie non diventino un bosco, e non ha niente da dire su una
  struttura che esiste in due esemplari contati. La governance dell'eccezione è
  `maxPerIsland`, che è un numero esatto invece di una probabilità.
- Le soglie di stadio erano scritte sul modello dei landmark e nessuna arcologia
  le raggiungeva. Un landmark nasce presto e il quartiere gli cresce intorno; una
  megastruttura nasce quando la città ha **già smesso** di crescere, e il conto
  dei vicini dopo la fondazione non sale quasi più — novantotto nel centro denso,
  cinquantaquattro in periferia. Non è il tempo a far salire gli stadi, è il
  **luogo**.
- I piazzali in quota sono stati riscritti tre volte. Il primo stava a settanta
  voxel dal piano finito e un percorso ne assorbe trentadue; il secondo era
  profondo tre e `planBetween` rifiuta con `noLanding` un fronte più stretto di
  una passerella *su quell'asse*; il terzo era a filo del tetto del podio, e la
  corsia partiva dentro il podio. Ognuno dei tre era rotto con la suite pura
  tutta verde.

**Quello che non è chiuso.** L'innesto nella rete in quota (casella 4) è a metà:
la struttura offre i propri attracchi — alla quota giusta, larghi quanto una
passerella su tutti e due gli assi, rialzati sul tetto del podio, indicizzati in
`registry.decks` — ma su una città cresciuta nessun percorso ci si attacca
ancora. Le coppie migliori muoiono su `blocked` (la corsia attraversa colonne
del proprio ingombro, che il registry tiene occupate a **ogni** quota) e su
`tooSteep` (i compagni sono in diagonale, e la forma a zeta consuma il budget di
pianerottoli). È misurato, non supposto; la correzione tocca la geometria della
ricetta o `routePlan`, e non è in questo incremento.

## In corso — L'HUD entra nel mondo: materiale, indicatori, strumenti

Fase 7.1, 7.3 e 7.4 — il sottoinsieme che Alpha 0.2 chiede **prima** del
playtest, «altrimenti si misura la confusione della UI invece del bilanciamento».
La struttura era già giusta; era la pelle a essere generica.

- **L'HUD segue il tema, e il contrasto non è una speranza.** `hudTokens.ts`
  deriva i `--hud-*` dall'atmosfera: sotto una certa luminanza dell'aria il
  pannello diventa **scuro** — neon e sci-fi lo sono — poi si tinge verso il
  colore dell'aria e ogni colore che porta testo viene allontanato dalla
  superficie finché non regge AA. È questo pavimento a rendere possibile una
  derivazione *piena* invece che decorativa: il tema può spostare la tinta quanto
  vuole senza poter rendere illeggibile una riga. Il gate è un test sui sette
  temi, non un'occhiata a quello aperto.
- **La cornice 9-slice non c'è, e la ragione è la derivazione stessa.** Un
  `data:` URI non legge le custom property, quindi una cornice SVG resterebbe
  ferma sul tema in cui è stata disegnata; per non stonare dovrebbe essere
  trasparente, ma `border-image` ignora `border-radius` e sotto una cornice
  trasparente si vedrebbero gli angoli **quadrati** del gradiente. Tre anelli in
  `box-shadow` fanno lo stesso lavoro, seguono il raggio e seguono i token.
  L'elevazione invece c'è ed è a tre livelli, ognuno due ombre: una corta di
  contatto e una lunga d'ambiente.
- **`locked` ha smesso di somigliare a `disabled`.** Un blocco per risorse si
  **riempie** — il rapporto fra ciò che si ha e ciò che serve, con il requisito
  *vincolante* e non il primo: chi ha i fondi ma non gli abitanti vede gli
  abitanti. Un blocco che invece non si scioglie aspettando — l'ordine del
  tutorial — resta sbiadito, perché riempirlo allo 0% direbbe «manca tutto»
  quando la verità è «prima fai un'altra cosa».
- **`±0` non compare più**, e al suo posto c'è dove si sta andando: freccia con
  la magnitudine nell'opacità, sparkline sulla finestra dei tick recenti, anello
  dove un tetto esiste davvero — cibo contro la soglia della carestia,
  soddisfazione che è già una quota. Denaro e materiali non hanno un massimo e
  non fingono di averlo.
- **«Perché sto perdendo denaro» ha una risposta.** I sei numeri esistevano già
  dentro `tick.ts`: venivano calcolati, usati per il saldo e buttati via una riga
  dopo. Ora escono come `FundsReport` — stessa natura di `commerce`, derivato e
  non accumulato — e un test verifica su quaranta tick che la somma delle voci
  sia esattamente il `funds.delta` scritto due centimetri più su.
- **I tasti `1`..`9` sono passati agli strumenti; i temi a `Shift`+`1`..`9`.** La
  ragione che teneva le cifre nude sui temi — «il dock è aperto a chiunque,
  quella scorciatoia non può stare dietro `?debug=1`» — è esattamente quella che
  ora le sposta: il dock è la prima superficie che un giocatore nuovo guarda. Nel
  campionario resta com'era, perché lì non c'è dock.
- **`GameHud.ts` è stato spezzato prima di crescere**, non dopo: da 1108 a ~930
  righe, con `ResourceBar.ts` e `BuildDock.ts` che prendono le due superfici su
  cui la fase atterra. È la regola dei budget di `AGENTS.md` applicata nel verso
  giusto — si estrae *prima* di aggiungere.

Verificato a schermo oltre che in `node`: sui sette temi il contrasto misurato
dal browser sta fra 4.57 e 15.63, e la barra è stata guardata con una città viva
— anelli parziali, sparkline che si muovono, popover che nomina tasse e negozi.
Due difetti sono usciti solo da lì: la pastiglia della risorsa non riprendeva il
puntatore (`.game-hud` non lo passa, e il popover non si sarebbe mai aperto), e
il requisito per esteso finiva **sopra** il costo su una tessera da 62px.

## In corso — Il cibo ha un luogo (fase 3.1)

Il cibo era l'unica risorsa senza un posto sulla mappa: usciva dal termine
industriale, quindi la stessa fabbrica produceva cibo e materiali dallo stesso
organico. Non si poteva indicare da dove venisse, e soprattutto la capacità
alimentare cresceva **con** la densità invece che contro — l'unico modo di
restare senza cibo era non costruire abbastanza industria, mai «non c'è più
terra».

- **`foodProduced` non legge più `industrial`.** Tre produttori con un costo in
  terra — campi, frutteti, torri idroponiche — dichiarati dal mondo con `addFarm`
  e contati in `SimState.farmCounts`. La fabbrica fa solo materiali.
- **Contatori paralleli, non un quinto uso urbano.** `CLASS_COUNT` resta 4, il
  contratto 10 resta intatto e il campo di desiderabilità non guadagna un quinto
  `Uint8Array` per chunk: `uses.test.ts` e `simPerf.test.ts` passano invariati, ed
  è quella la prova. Un produttore di cibo compete per la **terra**, non per
  l'attrattività di una colonna.
- **Il pareggio 1:1 è diventato un prodotto.** Era `food.perProduction /
  food.perResident = 24 = residentialCapacity`: vero, documentato in tre posti, e
  difeso da niente. Ora il listino di `BALANCE.farms` è in **case sfamate** — un
  campo due, un frutteto una, una torre sei — e il cibo per tick lo fa
  `FOOD_PER_HOUSE`, derivato. Cambiare la capacità di una casa muove il listino da
  solo.
- **Una torre è industria convertita.** Un edificio con `specialization:
  'farming'` conta in `buildingCounts[industrial]` per il suolo e in
  `farmCounts[tower]` per il raccolto, e `tick` lo toglie dall'industria che fa
  materiali: convertire costa, ed è il punto.
- **I campi non sono record del registry.** Non appartengono a nessuno dei due
  indici di collisione — in `columns` impedirebbero di costruirci sopra, in
  `groundColumns` perfino di passarci una strada — e la meccanica è esattamente
  che la città si mangia i propri campi. Hanno un registro loro in
  `src/world/farms/`, e il driver ritira il lotto quando `minFreeShare` non regge
  più. Nessuna demolizione nuova: `clearance.ts` resta l'unica del progetto.
- **Un campo entra dalla coda della superficie, non da uno stamp.** È una
  questione di formato: uno stamp porta indici di palette e `STAMP_EMPTY` vale 0,
  mentre un marcatore di copertura **è** palette 0. `SurfacePaint` guadagna
  `cover`, e `palette: 0` significa «lascia il suolo dov'è».
- **Il terreno non si ridipinge, e l'asse del solco sta nel marcatore.**
  `COVER.cropX` / `cropY` usano due dei cinque valori liberi del marcatore: le
  altre coperture prendono la giravolta da un hash della colonna, che per un
  ciuffo è giusto e per un campo sarebbe rumore verde. Il solco è anche l'unica
  forma che attraversa la propria cella da bordo a bordo, così colonne contigue si
  saldano in una fila sola. Misurato: **5120 quad** di dettaglio per un chunk
  arato per intero, contro un tetto di 16384.
- **Un frutteto è volume, quindi passa dalla coda della crescita.** Consegna uno
  stamp e ne eredita budget, affettamento e cancellazione, invece di aggiungere un
  quarto posto da cui i voxel entrano nel mondo; il ritiro è uno stamp vuoto con
  il volume vecchio come `erase`, la stessa strada di un upgrade. Il disegno di un
  albero è rimasto scritto una volta sola: `drawTree` è il corpo di `writeTree`
  senza la destinazione, e `writeTree` ora lo chiama.
- **La specie da frutto non compare in `FLORA`**: non nasce da sola, la pianta
  qualcuno, ed è per questo che può avere una sagoma potata — bassa, tonda, larga
  uguale. A dire «coltivato» è la regolarità del reticolo contro il jitter del
  bosco vero, non la specie.
- **La torre idroponica è una riga di catalogo.** L'accento verde a livello alto
  esce `luminous` dalla grammatica esistente, quindi le fasce di coltura si
  accendono di notte senza un materiale, uno slot o un emettitore in più. A dire
  alla simulazione che è una torre è la **tipologia costruita**, non la
  specializzazione del luogo: sotto `minLevel` lì cresce una fabbrica normale, e
  contarla come torre la farebbe produrre cibo senza esserlo.
- **L'HUD dice da dove viene il cibo**, leggendo un referto del tick
  (`state.harvest`) invece di rifare il conto — la stessa regola già scritta su
  `HudResource.breakdown`, e il posto dove duplicare il listino sarebbe stato più
  facile. Il numero dei lotti vivi passa sia dall'overlay sia da `__simStats`.
- **`communityGardens` ha smesso di essere decorazione**: abbassa la soglia di ciò
  che diventa frutteto, quindi il mandato si vede nella campagna oltre che negli
  isolati.
- `ALL_SPECIALIZATIONS` è derivato dalla tabella dei ruoli invece che riscritto:
  il test di copertura del catalogo delle tipologie cadeva per l'aggiunta di
  `farming`, cioè per il motivo sbagliato.

## In corso — Il campionario mostrava meno vocabolario di quello che c'è

Guardando `?scene=swatch` a schermo saltavano fuori due cose: i provini erano
troppo vicini, e sembravano cubi con quasi nessuna varietà geometrica. La
seconda non era un'impressione, ed era il difetto più grave possibile per uno
strumento che esiste per giudicare il vocabolario.

- **Tre famiglie di microgeometria non potevano scattare affatto.** Misurando
  `appendMicroGeometry` su un provino solo si è visto che su un prisma isolato
  con la sommità piatta non esiste nessuna delle condizioni che chiedono
  `emitSoffits` (un intradosso con aria sotto), `emitTerraceBoxes` (una sommità
  scoperta con ancora volume di fianco) e `emitFinials` (una cella senza vicini
  in piano). Il campionario mostrava quindi **un vocabolario più povero di
  quello vero**.
- **`CELL_TIERS`: il provino è una massa a quattro gradoni**, non un prisma —
  podio rientrato, sbalzo a filo, arretramento, guglia isolata. È la sagoma
  minima che produce tutte e tre le condizioni, e in più ogni gradone spezza le
  corse verticali, così montanti, traversi, architravi, mensole e parapetti si
  moltiplicano invece di comparire una volta sola in cima. Misurato: da 21 a 55
  prismi di dettaglio per `habitat`, da 25 a 77 per `civic`, da 16 a 64 per
  `luminous`, da 4 a 22 per `roofTech`. La sagoma è **identica in tutte le
  celle**: se variasse anche la forma, l'unica variabile smetterebbe di essere
  palette × superficie e due celle vicine non sarebbero più confrontabili.
- **L'interasse non era spaziatura, era occlusione.** A `REST_PITCH` un voxel di
  quota si proietta in alto esattamente il doppio di un voxel di profondità,
  quindi la fila davanti nasconde `CELL_HEIGHT - cellPitch / 2` di quella
  dietro: a sei e sei spariva **metà** di ogni provino, ed è così che una griglia
  di prismi distinti si legge come una massa unica. A dieci contro sette resta
  nascosto il podio e nient'altro. Un test tiene insieme i due numeri, così non
  si può ritoccarne uno solo.
- **Il basamento è largo quanto la fascia che regge.** Con la matrice larga il
  triplo delle altre due fasce, un basamento rettangolare lasciava due terzi di
  grigio vuoto in un angolo. Il profilo a gradini dichiara le tre fasce da sé, ed
  è l'unica etichetta possibile in una scena senza scritte; stratigrafia e scala
  stanno centrate sotto la matrice.
- **Il piano del cursore è sceso a metà provino.** In isometrica un voxel di
  quota vale un voxel su ciascun asse di terra: tenerlo sulla sommità, ora che i
  provini sono più alti, avrebbe spostato il referto di una casella intera.

Verificato a schermo in `natural` e in `neon`+`night`, 1920 × 980: 82 560 celle
in 49 chunk, `main` sotto il millisecondo, nessun errore di pagina. Il chunk
peggiore porta nove provini, cioè meno di 4 200 quad di dettaglio contro i
16 384 di `MAX_DETAIL_QUADS_PER_CHUNK`.

Non ci sono nuovi slot di palette né nuovi tipi di superficie: vale ancora il
vincolo della 4.10 — il campionario mostra quello che esiste. Tende e insegne
restano invisibili qui **per costruzione**, perché chiedono un `portal` sotto la
stessa faccia e un provino di una superficie sola non può averlo senza mentire
sulla riga a cui appartiene: quelle si giudicano in `?scene=diorama`.

File: `src/world/scenes/swatchLayout.ts`, `src/world/scenes/swatchScene.ts`,
`src/world/scenes/swatchScene.test.ts`, `src/main.ts`;
`.claude/skills/debug-harness/SKILL.md`, `src/world/AGENTS.md`, `ROADMAP.md`,
`PROJECT_INDEX.md`.

## In corso — La mensola smette di essere un quadrato appeso al marciapiede

Tre difetti che si vedevano tutti insieme guardando una città cresciuta, e che
avevano tre cause diverse.

- **Le mensole stavano per terra.** `faceRuns` cerca dal basso in su, ed è la
  regola che fa esistere la rete: la prima corsa è la sommità del basamento, che
  la 4.4 rende condivisa da tutta la fila. Ma metà della città sale a prisma e non
  arretra mai, e lì non c'è nessuna fascia da continuare: il ripiego su facciata
  piena prendeva comunque la quota più bassa possibile, cioè `minRise` — tre cubi
  sopra la strada. Su una torre di trenta cubi quella non è una mensola in
  facciata, è una pensilina. Ora il ripiego parte da `facadeRise` dell'altezza
  dell'ospite; dove una fascia c'è davvero non cambia niente.
- **E stavano tutte insieme.** Le quote successive si prendevano a passo di
  `DECK_HEIGHT`: le tre mensole di un ospite entravano in nove voxel, una pila
  invece di una facciata abitata. Su facciata piena ogni quota vale l'altra, e ora
  si distribuiscono sul fronte.
- **Erano tutte quadrate**, e non per caso: `overhangOf` legava lo sporto alla
  lunghezza della corsa, e dentro i due estremi quella riga è l'identità — con
  `MAX_FOOTPRINT` a otto, *ogni* corsa usciva `run × run`. La regola resta come
  misura di riferimento; il riquadro ora si dispone dentro la corsa in una di
  quattro forme — balcone, loggia, ala, sperone — scelta da un hash di ospite,
  faccia e quota. Ne segue anche la varietà delle gambe: un balcone sottile non ne
  ha, uno sperone se le conta da solo.
- **Ed erano spesse uguale dappertutto.** Travatura da due voxel su tutto il
  perimetro: da fuori una lastra alta tre voxel, cioè un piano di edificio appeso
  al muro. `terraceForm.ts` — puro, come le altre regole del dominio — dà alla sola
  mensola una sezione a cuneo: la trave bassa accompagna l'attacco per
  `taperReach` voxel, la trave alta prende il filo ma non la punta, che resta la
  lastra da un voxel con cui una mensola deve finire. I due angoli lontani dalla
  parete sono smussati, e il parapetto segue la diagonale invece di interrompersi
  perché `emitRoofTech` guarda il filo, non il riquadro. Tratti di percorso e nodi
  restano simmetrici: non hanno un davanti rispetto a cui calare.
- **Un guinzaglio che mancava, trovato dal test della rete.** Un tratto di
  percorso può avere per capo — o per appoggio di una gamba — una mensola, e
  quella mensola restava sganciabile: l'ospite promuoveva, `releaseDecks` la
  faceva cadere, e il tratto restava con un `supports` che non risolve più, cioè
  una passerella che finisce nel vuoto. `buildRoute` lo dichiarava già («i due
  capi reggono il percorso, e il percorso li immobilizza») senza che nessuno lo
  imponesse; ora lo impone `registry.carries`, che è la stessa domanda che un
  edificio si fa prima di promuovere, posta un piano più in alto.

## In corso — Il raccordo: niente resta staccato dalla rete

La maglia stradale copre il piano intero, ma a schermo esisteva solo dove
qualcuno l'aveva dipinta, e chi dipinge lo faceva per il proprio isolato e basta.
Due isolati contigui si trovavano collegati senza che nessuno se ne occupasse —
condividono la carreggiata che li separa — mentre un porto piantato sulla costa
restava un rettangolo di banchina in mezzo alla spiaggia, con la città
cinquecento colonne più in là e prato in mezzo. Alla domanda «da qui a lì come ci
si arriva» non rispondeva niente, in nessun punto del progetto.

- **Il modello è quello di Frostpunk 2**: un insediamento nuovo non resta
  scollegato, e la strada che lo attacca alla rete la traccia il gioco lungo il
  percorso più economico. Qui il distretto è l'isolato, «la rete» è l'insieme
  degli isolati già dipinti, e il percorso lo sceglie una ricerca a costo minimo.
- **Sceglie linee, non le inventa.** `src/world/streets/corridor.ts` cammina sugli
  incroci della maglia e ogni tratto corre su un asse che il seed dichiara già:
  decide *quali* linee mostrare, non dove passano. L'invariante regge intatto — la
  geometria della rete resta una funzione pura di `(seed, x, y)`, e ciò che è
  stato dipinto resta stato di chi dipinge, come già era.
- **Il terreno entra come costo e non come divieto**, la stessa scelta di
  `accepts` in `lots.ts`: dentro il modulo non c'è né `TerrainMap` né mondo. Ed è
  ciò che fa curvare la strada. Una L fra due punti separati da una darsena
  finirebbe per metà sull'acqua; la ricerca gira attorno alla baia e ci arriva da
  terra. Sono le otto candidate a L a fallire tutte insieme proprio nel caso che
  il modulo esiste per risolvere: nessuna ha il grado di libertà per scansare un
  ostacolo.
- **Non fa niente quasi sempre, ed è il punto.** Un isolato che confina con uno
  già dipinto — anche solo per un angolo — è già collegato, e le otto letture che
  lo verificano sono il prezzo per riconoscere i pochi casi in cui un raccordo
  serve davvero. La ricerca gira su un isolato staccato, cioè una manciata di
  volte per partita.
- **Un passo per metà in acqua non è una strada mezza costruita**: è un pugno di
  colonne staccate, che legge come un errore invece che come un'assenza.
  `STREETS.linkMinPaved` lo dichiara impraticabile, e se non c'è alternativa il
  raccordo non nasce — un lembo di terra oltre un braccio di mare si collega con
  un ponte o con una funivia, non con una carreggiata sul fondale.
- **Il gate è una proprietà, non un giudizio a occhio**, come già lo è la
  continuità della rete in quota: fra i due isolati si cammina sull'asfalto senza
  staccare i piedi, e `surfaceQueue.test.ts` porta anche il controllo negativo —
  senza raccordo il cammino non arriva — perché un test che passa comunque non
  misura niente.
- **Verificato su un'isola vera, e la prima taratura era sbagliata.** Su un'isola
  generata di lato 256 con centosettantotto edifici: i siti di porto veri stanno
  tutti entro **cinque isolati** dalla rete già dipinta, e quello più lontano si
  collega con due tratti, **73 colonne** di carreggiata e **sei frame** di posa;
  dopo il piazzamento le 10 472 colonne di asfalto dell'isola sono **una sola
  componente connessa**. `STREETS.linkReach` era stato scelto a ragionamento —
  dieci isolati, «oltre non è lontano, è altrove» — ed è salito a quarantotto:
  non perché servisse ai casi veri, ma perché sarebbe stato un secondo gate
  silenzioso accanto a quello vero su un'isola alla dimensione di taratura (512).
  Il sito più remoto resta scollegato a qualunque portata, e per la ragione
  giusta: fra lui e la città ci sono 75 colonne rifiutate contro 54 buone.
- `enqueueBlockStreets` si è spezzato in due: `enqueuePavement` fa la rampa e il
  colore per ruolo su un insieme qualunque di colonne di strada, e non ha mai
  avuto niente a che vedere con la forma dell'insieme. La rampa si calcola **per
  tratto** e non sul percorso intero: il riquadro di una L fra due capi lontani
  sarebbe il rettangolo che li contiene, decine di migliaia di celle per
  dipingerne qualche centinaio.

## In corso — La funivia: una traversata che non prende suolo

Il commento di `CROSSINGS.maxLength` diceva già cosa sta oltre i novantasei
voxel: «la distanza oltre la quale un ponte smette di essere una scelta e diventa
il modo per annullare la geografia. Uno stretto più largo di così vuole un
traghetto». Il traghetto però è un catalizzatore — lo si piazza dove il *ruolo*
ha senso, non dove serve attraversare — e fra due rive che si guardano non c'era
ancora niente che il giocatore potesse **tirare**.

- **L'invariante è l'opposto esatto di quello degli attraversamenti.** Lì «un
  attraversamento prende suolo», con le pile che scendono nel fondale; in
  `src/world/ropeway/` **una campata di fune non prende niente**: a terra ci sono
  solo le due torri, e fra loro non c'è impalcato, non c'è carreggiata e non c'è
  pila. È quello a permettere a `ROPEWAY.maxLength` di valere il doppio: senza un
  impalcato da reggere il limite non è più strutturale ma di gioco.
- **La fune non è materia**, e vale per lei la regola di `traffic/` invece di
  quella delle strutture. È spessa meno di un voxel: scriverla a cubi lungo
  centonovanta colonne darebbe una scaletta al posto di un cavo, con la pancia —
  l'unica cosa che la distingua da un tirante — ridotta a una gradinata. La
  calcola il piano come spezzata e la disegna `engine/RopewayView.ts`, che è la
  prima vista fuori dal volume voxel a occuparsi di qualcosa che **sta fermo**:
  finora ci finiva ciò che si muove, ora anche ciò che è troppo sottile.
- **Due torri e nessun pilone, e non è una tabella lasciata a metà.** Fra le due
  rive non c'è niente su cui piantare un appoggio, e sull'avvicinamento non c'è
  spazio — la stazione arretra proprio perché lì la città è costruita. Una
  traversata ha due torri, come le ha una funivia vera; il pilone intermedio è
  roba da linea di montagna, e sarà la seconda voce di `ROPEWAY_PART`.
- **La stazione arretra invece di rifiutare.** Il lungomare di una città
  cresciuta è costruito: pretendere la piazzola sulla battigia avrebbe rifiutato
  la funivia proprio dove la città c'è. Si cammina all'indietro fino a
  `maxSetback` e si prende la prima buona, che è anche la più vicina all'acqua.
- **Il franco si misura sulla prima quota libera, non sul terreno**, così la
  linea scavalca un tetto come scavalca una collina. E la freccia entra *dentro*
  il massimo invece di essere sommata alla fine: sommarla dopo alzerebbe anche le
  torri, dove la fune non pende affatto.
- **Le cabine sono due, sfasate di mezzo periodo.** Una sola sarebbe una navetta;
  ciò che dice «servizio» è vederne una partire mentre l'altra arriva, e costa
  zero perché la fase è già un campo della rotta. La corsa è la stessa `shuttle`
  dei traghetti, esportata invece che riscritta.
- **Un solo numero è condiviso fra i due domini**, ed è sorvegliato da un test:
  `ROPEWAY.cabinDrop` deve valere `TRAFFIC.hull.gondola.height +
  TRAFFIC.gondolaHanger`. Se divergessero, la cabina passerebbe più in basso di
  quanto la fune è stata alzata per farla passare — e non lo direbbe nessun tipo.
- **Il limite noto:** un edificio che cresce *dopo*, sotto la corsa, non alza la
  fune. È il prezzo di una linea che non ha una colonna a registro fra i due
  capi, ed è un difetto visibile e onesto.
- Lo strumento è nell'HUD accanto a espansione e mensola, ed è deliberato: sono
  le tre risposte a un suolo che finisce — comprarne altro, salire sopra quello
  che c'è, o andare a prendere quello dall'altra parte dell'acqua. Costa 620 e
  chiede 48 residenti, più di ogni altra cosa che si posi a mano, perché annulla
  un pezzo di geografia.

## In corso — I mezzi smettono di essere mattoni, e le navi vengono da fuori

Barche e aerei erano tre o quattro scatole a testa: un aereo era una croce, una
barca un parallelepipedo con sopra un cubo. A distanza isometrica quella è
esattamente la forma che non si legge — e stonava con la città accanto, dove
`mesher/microGeometry.ts` mette montanti, cornici e parapetti sotto il voxel.

- **La cura è la stessa degli edifici, non un modello nuovo.** Restano scatole,
  ma più piccole del voxel e messe dove la forma cambia: scafi rastremati in tre
  conci invece che tronchi netti, una fascia di galleggiamento spessa tre decimi
  che dà allo scafo un bordo inferiore, parapetti di due decimi lungo il ponte,
  fasce di finestrini che sporgono di tre centesimi così girano su tutti e due i
  fianchi con una scatola sola. L'aereo prende un'ala a freccia in quattro
  pannelli per lato — è quella che, vista dall'alto, distingue un aereo da una
  croce — più gondole dei motori, alette d'estremità e una deriva in tinta.
- **`engine/vehicleHulls.ts` è un file nuovo, e non importa Three.** La vista sa
  cucire scatole e colorarle; *quali* scatole è un'altra responsabilità, e
  tenendola fuori si verifica in `node`. È così che un test può dire che il
  fumaiolo disegnato chiude **esattamente** sulla bocca da cui esce il fumo.
- **Il fumo è la stessa posa letta nel passato.** Uno sbuffo non è una particella
  con una velocità da integrare: è dov'era la nave `age` secondi fa — che
  `poseAt` sa già rispondere — più una salita e una deriva lineari. Ne discende
  gratis tutto ciò che discende dalle pose: in pausa il fumo si ferma, a 4x
  accelera, due partite identiche fanno lo stesso fumo negli stessi punti, e un
  frame perso non lascia un buco nella scia. Ed è anche il motivo per cui la scia
  è *giusta* invece che verosimile: uno sbuffo resta dove la nave l'ha lasciato
  perché lì la nave c'era davvero.
- **Una voce sola per due lettori.** `TRAFFIC.funnel` dice dove sta la bocca:
  `vehicleHulls.ts` ci disegna il fumaiolo, `plume.ts` ci fa nascere gli sbuffi.
  Due misure separate si sarebbero scoperte divergenti da uno screenshot, con il
  pennacchio sospeso mezzo voxel sopra il cappello.
- **Il pennacchio è l'unica geometria che si riscrive per frame**, e una mesh
  sola per tutta la città: posizioni e colori **RGBA** in due buffer dinamici,
  `drawRange` a tagliare la coda. La quarta componente del colore è l'alfa, ed è
  la sola ragione per cui il fumo non ha bisogno di un materiale per sbuffo —
  cioè di una draw call ogni volta che un traghetto respira.
- **Una nave da carico adesso se ne va davvero.** Il capo lontano della sua rotta
  non è più «centoventi voxel al largo» ma il **bordo del mondo** — fin dove il
  mare generato arriva — e lì la nave sparisce per il tempo della sosta, poi
  ricompare da quel punto. Il porto promette commercio *con il mondo*, e una nave
  che inverte la marcia in mezzo al mare in piena vista dice l'esatto contrario:
  che un fuori non c'è, e che quella è una navetta fra il molo e un punto d'acqua
  qualsiasi.
- **«Non c'è» è diventato esprimibile, e costa `null`.** `poseAt` restituisce
  `VehiclePose | null` e `posesAt` lascia fuori dall'elenco chi è via: la vista
  non ha imparato niente — le arriva un mezzo in meno, e il pool nasconde la mesh
  in eccesso come faceva già. Il momento in cui un mezzo è fuori non è un secondo
  meccanismo: è il **terzo tratto** del pendolo, quello che `shuttleAt` scriveva
  già, marcato `away`. Una copia separata di «dove finisce l'andata» sarebbe
  divergente alla prima modifica, e a divergere sarebbe l'istante in cui una nave
  sparisce.
- **Il fumo segue la stessa regola, e gratis.** Uno sbuffo emesso mentre la nave
  era fuori non esiste; quelli lasciati *prima* di sparire restano a salire e
  diradarsi sul bordo, che è esattamente ciò che lascia una nave partita.
- **La tavolozza dei mezzi cresce di cinque voci**, tutte in `traffic/config.ts`
  come impone la regola del dominio: sovrastruttura, calpestio, fascia di
  galleggiamento, ferramenta e le tinte dei container. Sono quelle che separano
  lo scafo da ciò che ci sta sopra: con una tinta sola una barca torna a leggersi
  come un blocco, che è il difetto da cui nasce tutto questo incremento.

## In corso — Il retro di un edificio smette di essere pulito come il fronte

Tende, insegne, condizionatori e rampicanti vestivano il **fronte**. Il retro —
dove in una città fitta stanno le calate, le scale e le pergole — era una parete
liscia, e a distanza ravvicinata era la faccia che diceva "modello" invece di
"edificio".

- **`microStreet.ts` è un modulo suo**, e non tre funzioni in più in
  `microGeometry.ts`, che è già oltre il budget di righe della cartella. È la
  regola a monte del progetto: per una responsabilità nuova un file nuovo. E la
  responsabilità si nomina in una riga — ciò che un edificio mostra dove **non**
  si affaccia sulla strada.
- **L'aggancio è `frontage`, e non è un ripiego.** Dice se sotto una faccia c'è un
  ingresso, cioè se quella faccia guarda la via: tende, insegne e portali stanno
  lì, le tubazioni no. Su un fronte pulito una calata di scarico legge come
  sciatteria; sul retro è ciò che rende un isolato fitto credibile.
- **Tre voci, in ordine di costo crescente**: le calate sono **una corsa per
  colonna** — il tiro si semina sulla colonna e non sulla cella, quindi `emitRuns`
  fonde l'intera calata in un box solo; le pergole sono due prismi per cella; le
  scale sono l'emettitore più caro del progetto, e la loro forma lo impone — una
  pedata sale con la cella, quindi non è una corsa e serve un prisma per gradino.
  Se il tetto arriva a metà gruppo, a mancare è la cosa più cara.
- **La pergola è la cima che il coronamento non poteva essere.** Una voce
  `CROWN_KIND` con montanti e architrave era stata pensata e non funzionava:
  `crownBands` restituisce rettangoli pieni, e il vuoto avrebbe voluto un
  interruttore in `paint` per una cosa che il mesher sa già fare a 1/16 di voxel
  invece che a uno.
- **Un aggancio di tetto parte da `(z + 1) * U`, uno di facciata no**, ed è la
  trappola in cui questo gruppo è già caduto: `openRoof` risponde sul voxel
  **solido**, non sull'aria sopra, quindi la pergola stesa da `z * U` viveva
  dentro il pieno — emessa, contata nel budget e invisibile. `facadeBox` prende
  una profondità e sporge dal piano da sé, e la somiglianza fra i due casi è ciò
  che rende l'errore facile. Il test la misura sulla **quota più bassa dei prismi
  di legno** contro la sommità del voxel di tetto: un conto di prismi non poteva
  segnalarla, perché c'erano tutti.
- **Nessun linguaggio di superficie nuovo e nessuno slot nuovo** (invarianti 4 e
  5): ogni aggancio nasce da superfici già esistenti più il vicinato.
- **Costo, misurato.** In geometria, sulla fixture fitta: da **4 355 a 6 055 quad**
  di dettaglio, +1 700 e +39%, cioè il 37% del tetto di 16 384. In tempo, sul
  bench del mesher: 8,9 ms senza e 8,5 ms con — **dentro il rumore**, perché i tre
  predicati cadono subito su tutto ciò che non è una facciata d'uso esposta.
- **Il test misura il gruppo da solo**, con un writer che conta, e non passando da
  `greedyMesh`: un ingresso porta con sé montanti, architrave e pensilina, quindi
  una torre con le porte ha più dettaglio *in totale* proprio mentre ne ha **meno**
  sul retro. E la regola si legge sulla **quota più bassa toccata**, non sul conto
  dei prismi: una calata più corta resta un prisma, ed è la sua base a doversi
  alzare.

---

## In corso — L'angolo dell'isolato smette di essere un caso

Le torri d'angolo esistevano già, ma **per conseguenza e non per scelta**:
`blockRoom` lascia allargarsi solo chi tocca due lati del riquadro, quindi i lotti
d'angolo finivano per essere gli unici capaci di crescere in pianta. Finché la
regola restava implicita non si poteva né rafforzare né tarare.

- **`blockForm.ts` la dichiara**, e con lei `LOT_ROLE`: angolo, fronte, cuore. È
  puro come `cluster.ts` — entrano un riquadro e un quadrato, esce un ruolo — e
  vive fuori dalle passate perché lo leggono in due, la nascita per scegliere la
  tipologia e la promozione per decidere se allargare. `blockRoom` esce da
  `upgradeDriver`, dove era un metodo privato, per la stessa ragione.
- **`lotRole` è un criterio di catalogo come gli altri**: un campo in
  `TypologyRequirement`, una riga in `accepts`, zero rami. Non entra in
  `demandsPlace` e non deve — quello parla del profilo della simulazione, che può
  mancare, mentre la maglia stradale c'è sempre. Chi chiede una forma senza un
  posto non lo passa, e le righe che lo dichiarano restano fuori per confronto
  diretto.
- **`cornerTower` è la riga che ne esce**: lanterna, smusso da uno e coronamento
  d'oro, alla stessa priorità di `commercialPodium` ma **prima di lui nel
  catalogo** — che è come si dice «più specifico» a parità di peso. Misurato: 39
  edifici su 270 in una città di prova, cioè gli angoli e non un lato intero.
- **Il ruolo si ripassa anche in promozione**, o un angolo smetterebbe di essere
  un angolo: la torre perderebbe lanterna e smusso al primo livello in più, che è
  l'opposto di quel che deve succedere crescendo.
- **L'angolo cambia forma, non altezza, e la differenza è misurata.** La versione
  con un bonus di livello sull'angolo è esistita ed è stata tolta: un livello in
  più sui quattro angoli di ogni isolato **spegneva i montanti della città in
  quota**, e il gate della 4.9 — «ci si muove fra i livelli» — scendeva a zero. Il
  meccanismo è quello dichiarato in `aerial/`: chi ospita un impalcato smette di
  promuovere, quindi spostare in alto il livello di nascita degli angoli cambia
  chi può fare da ospite, e la rete verticale resta senza appigli.
- **Il cuore dell'isolato è stato lasciato stare**, ed è l'altra cosa che la fase
  ha imparato invece di imporre. Una riga che desse ai lotti interni una forma
  propria è stata scritta e tolta: riempie i cuori d'isolato, che `aerial/` tiene
  liberi apposta — «una gamba si sposta per trovare un tetto prima di piantarsi
  nel prato» — e il gate della città in quota cadeva con lo stesso sintomo del
  bonus d'angolo.
- **Un difetto vero, trovato e corretto**: `fitsWider` cercava i vicini
  sull'impronta e non sull'inviluppo. L'aggetto non si allarga mai, ma se il
  nucleo cresce di due la striscia **trasla** di due, e finiva su colonne che
  nessuno aveva guardato.
- **Un difetto vero, trovato e lasciato**: la passata di promozione controlla il
  budget di chunk e le campate, ma non interroga `overlaps` per il volume nuovo —
  quindi una torre a terra può crescere fin dentro un edificio nato su un
  impalcato in quota. È preesistente, non lo introduce lo sbalzo, e correggerlo
  significherebbe fermare la crescita verticale sotto ogni impalcato: è una
  decisione di gioco, non un ritocco. Il test dello sbalzo lo scansa in modo
  esplicito invece che per caso.

---

## In corso — Il corpo esce dall'impronta, e non prende suolo

`generate.ts` dichiarava che «nessuna fascia può uscire dall'impronta, e la
collisione fra edifici resta bidimensionale». Era vero, ed era anche il motivo
per cui questa città non poteva avere la sezione che ogni via fitta ha davvero:
un piano che sporge sulla strada.

- **L'invariante non è stato aggirato, è stato sostituito.** Al posto di «nessuna
  fascia esce dall'impronta» ce ne sono due, e vanno tenuti insieme: *nessuna
  fascia esce dall'**inviluppo***, e *l'inviluppo **non prende suolo***. Il
  secondo è il gemello esatto dei due che questa cartella aveva già — una campata
  non prende suolo da nessuna parte, un impalcato lo prende solo con la gamba — e
  si legge dagli stessi due indici del registry: `columns` prende l'inviluppo,
  quindi niente si costruisce *attraverso* uno sbalzo; `groundColumns` prende la
  sola impronta, quindi sotto la carreggiata si dipinge ancora e accanto nasce
  ancora un lotto.
- **Si sporge solo verso la strada, e non è una comodità.** Verso il cuore
  dell'isolato c'è il vicino, e due inviluppi che si toccano sono voxel
  sovrascritti. Un inviluppo *simmetrico* — che sarebbe stato più semplice da
  scrivere — farebbe collidere due membri di una stessa fila, e con loro cadrebbe
  l'aggregazione in isolati, cioè il modo in cui questa città fa i fronti
  continui. Un edificio senza fronte strada non sporge affatto: non c'è una via
  su cui farlo, e il verso arriverebbe dal tiro d'accento — cioè da un numero che
  chi ricostruisce l'inviluppo dal record non può ritrovare.
- **Il verso non lo sa nessuna voce del repertorio.** `BAND_OP.jut` allarga di due
  verso `facing`; tutto il resto continua a non sapere che lo sbalzo esista. A
  impedire a un `jog` di sporgere dalla parte sbagliata non c'è una riga di
  codice: c'è **dove l'impronta siede dentro l'inviluppo**, che è una posizione e
  non un controllo.
- **`jut` allarga invece di spostare**, e la differenza si vede da dietro:
  spostando, il retro rientrerebbe di due e resterebbe un intaglio sul cortile.
- **Sotto sei voxel non sporge niente** (`GRAMMAR.overhangFromZ`): uno sbalzo a un
  voxel da terra non è uno sbalzo, è un ingombro sul marciapiede. Sei sono tre
  cubi di terreno — ci si passa sotto — ed è anche la quota a cui il basamento
  condiviso di una fila ha finito di salire.
- **Il ripiego: lo sbalzo si negozia prima di rinunciare al posto.** Se a bloccare
  è la sola striscia sopra il marciapiede, l'edificio ci rinuncia e sale diritto
  invece di perdere un lotto buono per dell'aria. Funziona perché `over` allarga
  il solo *filtro* di `nextRect` e le candidate si costruiscono tutte comunque:
  lo stesso seme consuma gli stessi tiri, quindi la sagoma che ne esce è
  **esattamente** quella che sarebbe uscita se la tipologia non avesse mai chiesto
  uno sbalzo — impronta compresa, che è tirata molto prima.
- **`maxDirtyChunksPerBuilding` resta 40, e il conto è rifatto invece che
  ricordato.** Un tratto lungo `E` copre al massimo due colonne di chunk finché
  `E ≤ CHUNK − 1`, e `edgeChunks` non ne aggiunge una terza quando ne attraversa
  già due: con `MAX_FOOTPRINT + maxOverhang = 10` il fattore orizzontale resta due
  per asse, esattamente com'era con otto. Il test lo verifica su tutte e trentadue
  le fasi di cucitura, non su una.
- **Un difetto latente svegliato e chiuso.** `clearObsoleteVoxelBatch` confrontava
  gli indici locali della sagoma vecchia con quelli della nuova **senza passare
  dalle ancore**: reggeva solo perché ogni stamp di edificio era ancorato in
  `(0,0,0)`, e ha smesso di esserlo appena uno sbalzo ha potuto spostare l'ancora
  di due colonne. Con due ancore diverse cancellava i voxel sbagliati, in
  silenzio.
- **`sliceStamps` non vede mai uno stamp ancorato**, e ora è dimostrato invece che
  sperato: `cutout` azzera l'ancora, quindi su uno sbalzo darebbe pezzi ancorati
  male — non capita perché l'inviluppo massimo è dieci contro un `segmentSide` di
  sedici, e c'è un test che lo dice al posto di un commento che il prossimo cambio
  di scala non leggerebbe.
- **Tre righe di catalogo lo usano**: `stackedTenement` (densità senza ricchezza —
  si guadagna spazio sporgendo, non comprando il lotto accanto) e `arcadeRow`
  (portico sotto, piani che sporgono sopra: la stessa strada guadagnata due volte).


## In corso — La pianta esce dall'angolo retto, e il piano terra si apre

Tre forme che la città sapeva disegnare **solo su un monumento**: l'angolo
tagliato, il vuoto sotto il pieno e la falda. La grammatica delle fasce muove un
rettangolo, quindi non poteva produrre nessuna delle tre.

- **`planMask.ts` sale alla radice di `src/world/`.** `inPlan` e `onPlanEdge`
  vivevano in `landmarks/parts.ts` e ora li usano due domini: è la regola «ciò che
  due domini usano non sta dentro uno dei due», la stessa che ha prodotto
  `hierarchy.ts` e `urbanForm.ts`. In due copie disegnerebbero due ottagoni
  diversi al primo ritocco.
- **`TypologyShape.chamfer` porta il tamburo agli edifici.** È lo stesso campo di
  `Part.chamfer` e lo stesso predicato: un edificio smussato di uno è un ottagono,
  di due un tamburo. Non è una fascia in più e non cambia l'impronta — stesso
  riquadro, stessa altezza, stesse fasce — quindi collisione, budget di chunk e
  cancellazione non se ne accorgono. L'unico che se ne accorge, e nel verso
  giusto, è `stampFootprint`: l'opera di terra smette di riempire l'angolo tagliato.
- **Lo smusso si limita alla fascia, non all'edificio, e senza quel tetto era un
  difetto.** Il taglio di Manhattan toglie `chamfer` a *ciascuno* dei due assi:
  su un lato da quattro uno smusso da due lascia in piedi il solo quadrato
  centrale da due — un palo dentro il riquadro, non un ottagono. E una torre
  scende a `minBandSide` entro il primo quinto, quindi il caso non era raro, era
  *ogni* torre. Misurato dal test che lo guarda: una fascia da dodici colonne
  scendeva a due.
- **`TypologyShape.arcade` è l'unica cosa del repertorio che fa vuoto sotto un
  pieno.** Le fasce sanno rientrare, sporgere e sovrapporsi, ma quello che
  producono è sempre un solido appoggiato. I pilastri seguono `bayPeriod` e si
  contano dall'estremo più vicino, non da un capo: contati da un capo, un fronte
  che non è multiplo del passo si ritrova il pilastro su un angolo e l'architrave
  nudo sull'altro, e i quattro versi d'accento darebbero quattro portici diversi.
- **Quattro voci nuove in tabella, zero rami nuovi.** `BAND_OP.shear` è `jog` a
  scala leggibile — un voxel su una torre da venti fasce è mezzo cubo di terreno e
  legge come bordo storto, due è il cubo intero; `BAND_OP.corner` è l'unica voce
  che cambia proporzione senza cambiare massa, e senza il ricentro due di fila
  porterebbero il corpo fuori dall'impronta invece di girarlo. `CROWN_KIND.gable`
  è l'unica cima che finisce su una **linea** invece che su un piano.
- **Quattro righe di catalogo le usano**, o sarebbero macchine spente:
  `roundTower` (il tamburo), `stackedTenement` (le pile sfalsate, densità senza
  ricchezza), `arcadeRow` (il portico) e `marketHall` (la falda dove il commercio
  è rado).
- **Le sessanta digest non si sono mosse**: i tre interruttori sono opt-in da
  catalogo, e una città che non li chiede è identica a prima.

---

## In corso — Un quartiere è fatto di una materia sua

Due edifici uguali ai due capi dell'isola erano dello stesso colore, e due case
adiacenti di usi diversi erano di due colori diversi: l'esatto contrario di come
si legge una città. Il colore dipendeva dall'uso e dalla tipologia, e niente
diceva *dove* un edificio si trovasse.

- **Lo stile è una seconda dimensione, ortogonale all'uso.** `STYLES` in
  `buildings/config.ts` ha otto righe che ridipingono quattro slot — corpo,
  cornice, zoccolo, coronamento — e la stessa riga vale per una casa, una bottega
  e un capannone. La regola sta in `buildings/style.ts`, il catalogo in
  `config.ts`: è lo stesso patto di `TYPOLOGIES` e `selectTypology`, e aggiungere
  uno stile resta una riga di tabella.
- **Non è una tinta, ed è la cosa da sapere prima di guardare lo schermo.** I 32
  slot sono famiglie di *materia* e il loro colore lo scrive il tema, che è
  globale: un isolato non può essere rosa e quello accanto azzurro senza slot
  nuovi, cioè senza rompere l'invariante 4. Può essere di mattoni contro uno di
  vetro, che a distanza di gioco si legge lo stesso e vale in tutti e sette i
  temi invece che in uno.
- **È una funzione pura di `(seed, quartiere)`, e non c'è niente da salvare.**
  Come la maglia stradale, e per la stessa ragione. Ne segue la coerenza
  d'isolato **per costruzione** — due edifici dello stesso quartiere non possono
  uscire di materia diversa perché nessuno se lo deve ricordare — invece che per
  disciplina di chi costruisce.
- **Il quartiere è largo due isolati, e a uno la città era coriandoli.** Uno
  stile per isolato sembra la scelta ovvia e produce mattone accanto a vetro
  accanto a ruggine su tutta l'isola: a distanza non si legge come quartiere ma
  come rumore. A due, il cambio di tessuto cade su una strada invece che su ogni
  angolo.
- **Non è agganciato al distretto, e la ragione è misurata.** `districtOf`
  risponde `outskirts` finché due ruoli di catalizzatore non si sovrappongono
  sulla stessa colonna — cioè quasi ovunque — quindi il tessuto sarebbe rimasto
  spento sulla maggioranza del costruito. E il distretto **cambia quando la città
  cresce**: la sagoma da cancellare cambierebbe sotto i piedi di chi la deve
  cancellare, che è il difetto esatto per cui `recordStamp` esiste.
- **L'accento resta alla tipologia**, e non per prudenza: il tessuto è del
  quartiere, l'accento è di ciò che quell'edificio fa. Un mercato del porto
  dentro un isolato imbiancato esce con le pareti chiare e le insegne d'ottone.
  Ciò che distingue le funzioni sopravvive comunque anche altrove — `classSurface`
  dà a ogni uso il proprio linguaggio di superficie, quindi un capannone
  imbiancato tiene le nervature di lamiera.
- **`record.style` viaggia con il record**, quarto campo dopo `typology`,
  `facing` e `baseBand` e per la stessa ragione: è metà di ciò che serve a
  rigenerare la sagoma per cancellarla. Un record scritto prima che gli stili
  esistessero ripiega sul tessuto neutro e si rigenera identico a com'era.

---

## In corso — Il generatore di edifici si spezza, e la sua sagoma si fissa

Preparazione, non funzionalità: `generate.ts` era a 849 righe e le prossime fasi
— smusso, arcata, aggetto, stile d'isolato — ci finivano tutte dentro. Nessun
comportamento cambia, e stavolta è **dimostrato** invece che dichiarato.

- **`generate.ts` passa da 849 righe a 267**, e i quattro moduli che ne escono
  sono la divisione che `src/world/AGENTS.md` già descriveva a parole: l'algebra
  dei rettangoli in `bandRect.ts`, l'interprete del repertorio in `bandOps.ts`,
  la chiusura della silhouette in `crowns.ts`, la vernice in `paint.ts`. La linea
  di taglio è *lungo cosa si lavora separatamente* — cambiare una cima e cambiare
  il ritmo di una facciata sono due lavori, e finché stavano in un file solo
  toccarne uno prendeva in ostaggio l'altro.
- **`generateDigest.test.ts` fissa le impronte digitali della grammatica**, ed è
  la parte che valeva più dello split. La suite verificava che due chiamate
  uguali dessero lo stesso stamp e che ogni stamp rispettasse i vincoli del
  livello: entrambe sopravvivono benissimo a una grammatica cambiata per sbaglio.
  Quello che nessun test copriva è lo spostamento di codice che consuma un tiro
  in più, o nello stesso ordine ma in un punto diverso — la città resta legale,
  resta deterministica, e non è più quella di ieri. Con `recordStamp` che
  rigenera la sagoma per cancellarla, quel giorno gli edifici già costruiti
  smettono di poter essere cancellati. Sessanta digest FNV su quattro usi, cinque
  livelli e tre semi, **calcolate prima di muovere una riga**.
- **Le sessanta digest non si sono mosse**, e con loro i 153 test di
  `src/world/buildings/`. È la definizione operativa di «nessun comportamento
  cambia».

---

## In corso — Il lago smette di essere un cerchio, il gradone una curva di livello

Due difetti che si vedevano dalla stessa inquadratura, e con la stessa causa: la
sagoma degli elementi del terreno era un'ellisse, e la tinta di un bioma un
numero. A schermo diventavano un laghetto perfettamente circolare in cima alla
montagna e quattro gradoni tutti della stessa campitura.

- **La forma in pianta si stacca in `src/world/terrain/outline.ts`.** Rilievi e
  conche non sono piu' ellissi allineate agli assi ma ellissi **orientate** con
  il raggio deformato da due armoniche di fase propria. Sul terreno la
  differenza si nota appena — quantizzazione, cigli e alberi rompono il contorno
  da soli — ma lo specchio d'acqua e' l'unica superficie senza grana ne'
  terrazzamento, quindi il suo bordo e' l'unica curva che si legga per intero.
- **La deformazione si spegne verso il bordo, ed e' l'unica cosa che la rende
  sostenibile.** Chi cerca un sito a una conca sonda il terreno lungo il bordo
  della sagoma: una che sporgesse chiederebbe una spianata piu' larga di quella
  che il raggio annuncia, cioe' pagherebbe in **terra piana**, che su un'isola
  quasi tutta in pendenza e' la risorsa rara — misurato, i laghi scendevano da
  sette isole su otto a cinque, e il seed di riferimento restava senza. Spenta
  sul bordo, la sagoma resta dentro il cerchio che dichiara, la ricerca del sito
  e' quella di sempre, e il costo si paga tutto in pendenza, dove il margine
  c'e': `basinSlope` sale a 0,72 e `moundSlope` a 0,28, e il dislivello peggiore
  fra due colonne misurato sul campo resta a 0,70 contro il voxel intero che il
  terreno a celle non tollera.
- **Il fattore si misura, non si stima.** `warpLipschitz` dice quanto una
  deformazione moltiplica il gradiente **sulla fascia di raggi in cui il profilo
  scende davvero**; chi la usa divide per quel numero la pendenza che dichiara,
  quindi la sponda di un lago vale ancora `basinSlope` esatti. Il tetto in forma
  chiusa resta come limite del modulo, e i test verificano che il misurato non lo
  superi mai.
- **La sagoma ha un flusso di PRNG suo** (`shapeWarpSalt`), separato da quello
  che sceglie dove gli elementi stanno. Con un flusso solo, ogni fase estratta
  slittava tutte le estrazioni successive: ritoccare un'ampiezza spostava le
  colline e cambiava quali siti ospitano un lago, cioe' rifaceva l'isola invece
  della sola forma in pianta.
- **La roccia prende uno strato di grigio per gradone** (`rockTone.ts`): e' il
  solo bioma che si guarda **di taglio**, e sopra la collina l'alzata vale otto
  voxel, quindi di una cella si vede piu' parete che pianta. Il passo dello
  strato e' l'alzata e non un numero suo — uno strato a meta' parete
  racconterebbe una quota che li' non c'e' — e il sottosuolo prende sempre il
  grigio successivo, cosi' il bordo chiaro che dice dove finisce un gradone non
  sparisce su nessuno strato.
- **La tinta viene dalla quota e da nient'altro**, e ci sono voluti due
  tentativi sbagliati per arrivarci: chiazze da un hash — quadrati con i bordi
  sugli assi, una trapunta — e poi vene di rumore interpolato, che i quadrati li
  toglievano ma restavano colore senza significato. Su una roccia due grigi
  affiancati alla stessa quota vorrebbero dire due strati alla stessa quota. Uno
  strato e' orizzontale, si vede dove il terreno lo taglia, e il terreno lo
  taglia dove si terrazza: il disegno del colore e quello dei gradoni sono la
  stessa cosa, ed e' per quello che si legge. Un pianoro e' di un grigio solo
  perche' lo e'.
- **Il gradone smette di essere una curva di livello** (`TERRACE.jitter`). Il
  campo e' dolce e la scala e' esatta, quindi il ciglio cadeva dove il campo
  attraversa una quota tonda: su una cupola sono cerchi concentrici, e a schermo
  si leggevano come scalini tirati col compasso. La quota di ogni cella viene ora
  scossa da due ottave di rumore prima di posarsi — una lunga che fa serpeggiare
  il ciglio, una corta che ne sbreccia il filo — e lo stesso gradone diventa una
  scarpata. **L'ampiezza e' una frazione dell'alzata oltre la cella**, ed e' li'
  che sta l'invariante: in pianura vale zero — dove cresce la citta' il terreno
  resta quello di prima — e piu' su resta sotto la meta', quindi due celle
  contigue non possono ancora scavallare piu' di un'alzata. Mezzo voxel di quota
  su un fianco dolce vale due colonne e mezzo di scostamento in pianta: il
  disturbo si vede percio' tanto piu' quanto il pendio e' gentile, cioe'
  esattamente dove i gradoni sembravano risaie.
- **Un albero scrive solo dove c'e' aria.** Una chioma nata su una cella bassa
  poteva mangiare la parete della cella accanto, e da quando il ciglio serpeggia
  succedeva spesso: adesso la roccia la ritaglia, come le succede in natura.
- `paletteAt` e' la lettura unica di quella tinta: la usano il generatore, il
  riempimento di un'opera di terra e il ripristino della vista per bioma, che
  altrimenti spianava i grigi di mezza montagna a ogni giro di `B`.
- Verificato a schermo su `?debug=1&terrain=1337` oltre che nei test.

## In corso — I raggi X lasciano vedere davvero attraverso

La vista c'era ma non serviva a niente: si accendeva, e i muri davanti al
soggetto restavano lì. Il difetto non era nella geometria — la lente era già la
sagoma esatta di ciò che si sta guardando — ma in **cosa il velo faceva a un
frammento**, che era una cosa sola: `discard` su un retino di Bayer a densità
fissa. Tre conseguenze, e tutte e tre si vedevano.

- **Con una soglia ordinata i pixel superstiti sono sempre gli stessi.** Non è un
  tiro di dado, è un insieme di soglie: il muro davanti e quello dietro
  sopravvivevano *sugli stessi pixel*, e il primo copriva il secondo per intero.
  Cinque pareti velate in fila si vedevano come una sola, cioè non si vedeva
  attraverso niente. È l'artefatto noto della screen-door transparency, e la cura
  nota è far variare la soglia con la profondità: ora la densità cresce
  avvicinandosi alla camera (`XRAY.deep`), quindi chi sta dietro sopravvive su un
  insieme più largo e spunta fra le righe di chi sta davanti.
- **Ciò che sopravviveva restava muro a piena luce**, con le sue finestre e le
  sue insegne. A bassa copertura quei pixel non leggevano come vetro ma come
  sporco sopra al soggetto. Adesso un frammento velato perde il linguaggio di
  facciata e si scioglie nella tinta della **prospettiva aerea** — la stessa a
  cui tende la distanza, quindi segue tema e ora senza portarsi dietro un colore
  proprio — in proporzione a quanto gli è stato tolto.
- **Il Bayer sparpaglia.** Il retino è diventato una **rigatura** diagonale in
  pixel di schermo: a parità di copertura i superstiti stanno in fila e leggono
  come una campitura di disegno tecnico invece che come polvere. La densità ne
  cambia lo spessore e non il passo, quindi può variare con continuità senza che
  il disegno cambi trama sotto gli occhi.

Sul **filo del voxel** la rigatura cede (`XRAY.lattice`): la faccia si apre ma lo
spigolo resta, e l'occlusore si riduce a una gabbia di vetro invece di
sbriciolarsi. È ciò che tiene leggibile la sagoma di quello che si sta
attraversando — si continua a vedere *che c'è una torre davanti*.

La proporzionalità dello scioglimento separa da sola le due famiglie senza un
secondo numero da tenere d'accordo con il primo: nei raggi X la densità è alta e
l'occlusore se ne va, in Block focus è bassa e il contesto resta leggibile — lì
la sagoma velata **è** la risposta, e sbiancarla vorrebbe dire toglierla.

- I numeri della lente si staccano in `src/engine/xray.ts`, con `lensHit` che
  ora riporta anche la distanza dal soggetto e non solo la corda: `inspect.ts`
  era oltre il budget di righe e teneva insieme due lavori con due cadenze
  diverse — quali viste esistono, e come si guarda dentro un muro.
- Verificato a schermo su città cresciuta, non solo nei test: la lente tocca la
  sola colonna di occlusori del soggetto e lascia intatto il resto della città,
  fetta, sezione e Block focus restano quelle di prima.

## In corso — Le erbette smettono di essere coriandoli

Sul prato c'erano dei dadi. La copertura del terreno nasceva come **un voxel
pieno** appoggiato sulla superficie, grande un quarto della faccia di un cubo di
terreno: alla distanza isometrica non si legge come un ciuffo d'erba, si legge
come un cubetto colorato, e l'unico modo che c'era di farne un prato era
metterne tanti — cioè peggiorare le due cose insieme.

- **La cella di copertura non è più un cubo, è un marcatore.** Il mondo continua
  a decidere se e cosa cresce su una colonna, esattamente come prima; quello che
  scrive è `setCoverMark`, un byte con **palette 0** — un valore che
  `packVisualBlock` non produce mai, perché per lui palette 0 è il vuoto. Non è
  un nono tipo di superficie né un trentatreesimo slot: è spazio libero per
  davvero, ed è il secondo sovraccarico dichiarato di quel byte dopo
  `WATER_CLASS`.
- **Il mesher toglie la cella e ci disegna dentro** (`engine/mesher/coverDetail.ts`).
  Un ciuffo sono tre lame sfalsate di altezza diversa, un fiore uno stelo verde
  con la corolla del bioma, un sasso una lastra bassa e larga: prismi da 1/16
  nella stessa mesh del greedy pass, nessuna draw call in più. Quattro giravolte
  da un hash delle coordinate di mondo, o un prato intero mostrerebbe la stessa
  lama nella stessa direzione — che è il difetto del cubo, solo più piccolo.
- **Toglierla è metà del guadagno.** Un cubo di copertura buca il piano superiore
  del terreno e ogni buco spezza le corse del merge greedy; adesso il piano si
  ricuce. Con lui se n'è andata anche l'AO che proiettava attorno a sé, che era
  l'ombra di un dado.
- **La tinta non viaggia nel marcatore.** La prende dalla palette del terreno su
  cui poggia, via una tabella *derivata* da `GROUND_COVER` e `BIOME_STRATA`: il
  bioma non arriva fino al mesher e non deve: nel volume c'è già, è la palette di
  superficie. Ne segue un invariante nuovo e testato — due biomi non possono
  condividere quella palette — e un comportamento che prima non c'era: un
  marcatore sopravvissuto a una strada che gli ha ripavimentato la colonna sotto
  **sparisce**, invece di mettersi un ciuffo d'erba sull'asfalto.
- **Le densità sono scese di circa il quaranta per cento**, e tornano a dire
  quanto è fitto il prato invece di supplire alla forma che mancava.
- **Per `getBlock` un'erbetta non c'è più**, perché `blockPalette` di un
  marcatore vale 0. È il verso giusto: la copertura è decorazione, non un
  ostacolo per chi cerca dove costruire.

File toccati: `src/engine/mesher/coverDetail.ts` e `coverDetail.test.ts` (nuovi),
`src/engine/mesher/greedyMesher.ts`, `src/world/visualBlock.ts`,
`src/world/VoxelWorld.ts`, `src/world/terrain/{groundcover,config,IslandGenerator}.ts`,
i test di `visualBlock` e `groundcover`, più `AGENTS.md`, `src/world/AGENTS.md`,
`src/engine/AGENTS.md` e `PROJECT_INDEX.md`.

---

## In corso — Il mare torna nei porti, e qualcosa ci naviga

Quattro difetti che si vedevano prima di qualunque tooltip: il porto e il
traghetto costruivano una piattaforma rettangolare in mezzo al golfo con dentro
una pozza d'acqua **piu' alta del mare** che la circondava; il traghetto non
aveva niente che attraversasse; l'aeroporto era una striscia d'asfalto in un
angolo del proprio riquadro; e un settore costiero comprato restava terra vuota
per sempre mentre il messaggio prometteva il contrario.

- **La bonifica del decoro non scava piu' il mare, ed era lei a scavarlo.** La
  passata che toglie tronchi e chiome parte dalla quota del terreno e sale di
  venti voxel — la conifera piu' alta — ma su una colonna sommersa quella quota
  e' il **fondale**: attorno a ogni porto, a ogni molo e a ogni lotto sulla
  battigia restava un rettangolo di mare cancellato fino in fondo. Non lo diceva
  nessun test perche' l'opera di terra riempiva subito dopo le stesse colonne, e
  il buco spariva sotto la banchina. Ora `clearDecorColumn` si ferma dove il
  bioma dice acqua: sott'acqua non cresce niente da togliere.
- **L'opera di terra ha una maschera.** `buildWorks` e `surveyGrade` accettano
  le colonne su cui la struttura poggia davvero (`stampFootprint` fino a
  `LANDMARK.groundBand`) invece dell'ingombro intero. **La darsena e' il mare che
  c'era**: la ricetta la ottiene non disegnando niente. Ne segue anche che un
  molo puo' uscire accanto ad acqua fonda che il riquadro intero rifiutava, e che
  il muro di banchina corre sul bordo della maschera — cioe' attorno al bacino —
  invece che sul perimetro del rettangolo.
- **`groundBand` separa cio' che poggia da cio' che sporge.** Il braccio di una
  gru passa sopra l'acqua a tredici voxel: contarlo vorrebbe dire riempire di
  terra il bacino che sorvola. Il grembiule, per la stessa ragione, si ferma
  sulla battigia invece di dipingere un anello di asfalto sul fondale.
- **Porto e traghetto ridisegnati in pianta.** Il porto e' una banchina con due
  bracci che chiudono un bacino; il traghetto un piazzale e un molo stretto con
  due accosti veri. Le barche disegnate *dentro* lo stamp sono sparite: erano
  ferme per costruzione e — visto che uno stamp non sa scrivere sotto il proprio
  piano finito — sospese sei voxel sopra il pelo dell'acqua.
- **`src/world/traffic/`: cio' che si muove.** Barche all'ormeggio, traghetti di
  linea, navi da carico, aerei in circuito e dirigibili al pilone. Il traffico
  **non e' materia** — un voxel riscritto a ogni frame rimesherebbe mezza isola —
  quindi qui si calcola *dove sta* un mezzo e a disegnarlo e' `TrafficView`, con
  mesh proprie fuori dal volume. La posa e' una **funzione del tempo**: due
  partite identiche mostrano le stesse barche negli stessi punti, e la velocita'
  di gioco moltiplica un orologio invece di ritarare delle accelerazioni.
- **La rotta di mare aggira la terra.** Due punti di costa vicini hanno quasi
  sempre un pezzo d'isola in mezzo — e' proprio la forma che rende utile un
  traghetto — quindi `planSeaLane` cerca in ampiezza su una griglia grossa e poi
  tira la corda. Dove acqua non ce n'e', la linea resta **senza barca** invece di
  farne passare una dentro la collina.
- **Gli ormeggi li dichiara la ricetta.** Sono coordinate della forma: il bordo
  di una darsena che `landmarks/config.ts` disegna. Un test verifica che un
  ormeggio da barca non cada su una colonna che l'opera di terra riempie — su
  **ogni** esemplare, perche' e' il seme a sceglierlo.
- **L'aeroporto e' un campo di volo.** Pista per tutta la lunghezza
  dell'ingombro, soglie e mezzeria, raccordo che la lega al piazzale, hangar in
  fondo e il campo erboso spianato che da sopra dice «aeroporto» prima di
  qualunque dettaglio. Gli aerei ci rullano, decollano e rientrano sul circuito.
- **L'aeroporto sa posarsi su un grattacielo.** `SKYPORT` e' la seconda forma
  dello stesso ruolo — un impalcato d'attracco con due piloni — e a sceglierla e'
  il **luogo**: sotto la colonna c'e' un tetto, quindi non si costruisce una
  pista ma un ormeggio, e ci stanno dei dirigibili. Un solo strumento, nessuna
  scelta in piu' da fare. L'ospite deve essere alto almeno
  `LANDMARK.aloftMinLevel` e da quel momento **smette di promuovere**: chi regge
  non cresce, come per una mensola.
- **Un settore comprato arriva con il proprio nucleo.** La citta' nasce dove il
  campo di desiderabilita' esiste, e il campo esiste solo dove un catalizzatore
  l'ha acceso: senza, i cinquecento fondi compravano terra su cui non compariva
  mai niente. Il borgo che arriva con il settore e' quella promessa mantenuta al
  minimo — abbastanza da far attecchire le prime case, non abbastanza da decidere
  cosa diventera' il settore.

File toccati: `src/world/traffic/` (nuovo: `config`, `seaLane`, `routes`,
`poses`, piu' due file di test), `src/engine/TrafficView.ts` (nuovo),
`src/world/landmarks/{config,generate}.ts`,
`src/world/buildings/{stamp,siteWorks,surfaceQueue,landmarkDriver,BuildingRegistry,Builder}.ts`,
`src/world/buildings/siteWorks.test.ts` (nuovo), `src/game/{actions,growthScene}.ts`,
`src/sim/balance.ts`, `src/main.ts`, piu' `PROJECT_INDEX.md`, `src/world/AGENTS.md`
e `src/engine/AGENTS.md`.

---

## In corso — Il campionario dei voxel entra nel gioco

La 4.10 era pronta da un pezzo, ma si raggiungeva solo scrivendo `?scene=swatch`
nella barra dell'indirizzo: chi gioca non l'ha mai vista, e chi la conosceva
doveva ricordarsi il parametro.

- **Un bottone nel dock, subito dopo il tema**, apre il campionario **in una
  scheda nuova**. Sta lì e non accanto alle viste perché risponde a un'altra
  domanda — quelle guardano dentro la città, questo guarda di cosa è fatta — e
  chi ha appena cambiato tema è esattamente chi si chiede come suonino i
  trentadue slot. La scheda è nuova perché il campionario è una **scena**:
  ricaricarla al posto della città vorrebbe dire buttare la partita, che non ha
  salvataggio.
- **Il link porta con sé il look che si sta guardando** — tema e ora — perché il
  campionario esiste per confrontare: aprirlo a mezzogiorno mentre la città è al
  neon di notte mostrerebbe un vocabolario diverso da quello che ha fatto nascere
  la domanda. L'ora **ferma** l'orologio: un campione che cambia luce da solo
  mentre lo si giudica non è un campione. `swatchUrl` sta accanto a
  `resolveLaunchMode` perché è la stessa corrispondenza letta al contrario, ed è
  testata in `node` — compreso che il link apra un harness e non una seconda
  partita.
- **Il referto del campionario non è più un overlay tecnico.** È la legenda dello
  strumento — in-world non ci sono etichette — quindi nasce aperto anche senza
  `?debug=1`, e `F3` non lo spegne più. Senza questo, il bottone avrebbe portato
  chi gioca davanti a duecentocinquanta prismi anonimi.
- **`1`..`9` escono dal gate del debug**, come `V` e `L` prima di loro, e la loro
  era l'incoerenza più vecchia: il tema si sceglie già da un bottone del dock
  aperto a chiunque, mentre la scorciatoia per la stessa cosa stava dietro
  `?debug=1`. Nel campionario è anche di più — cambiare tema **è** lo strumento,
  ed è così che si riconosce uno slot morto a colpo d'occhio, che è metà del gate
  della 4.10.

## In corso — Un click sulla città apre una scheda

Cliccare la città non selezionava niente. Tutto quello che il progetto già *sa* di
un punto — bioma, opera di terra necessaria, fascia di skyline e tetto verticale,
desiderabilità per i quattro usi, tipologia dell'edificio, quartiere, chi regge
cosa — era raggiungibile solo dagli overlay tecnici dietro `F3`.

- **Una pila, non quattro modalità.** Un click risolve insieme struttura,
  isolato, colonna e voxel: sono la stessa domanda a quattro ingrandimenti, e
  farli scegliere prima al giocatore vorrebbe dire chiedergli di sapere già la
  risposta. Il pannello li mostra come quattro linguette, aperto sulla più
  specifica che esiste, e la linguetta aperta comanda il contorno azzurro nel
  mondo — è così che tutte e quattro le unità diventano selezionabili con un
  gesto solo.
- **Un record non è sempre un edificio.** `BuildingRecord` porta un `class` anche
  quando è un ponte o una mensola, e landmark, campate e parti in quota non
  entrano nei conteggi del registry: `SelectionPanelModel` si dirama su
  `landmark` → `span` → `aerial` → edificio, così un molo mostra uno **stadio** e
  mai un livello, e un viadotto non dice «Housing».
- **Il quartiere del record e quello di adesso sono due righe distinte.** Il
  primo è congelato alla nascita per poter rigenerare la sagoma, il secondo lo dà
  `urbanProfileAt`: confonderli sarebbe un bug, e il valore della scheda sta nel
  poterli confrontare.
- **Il record giusto lo sceglie la quota.** L'occupazione è tridimensionale, e su
  una colonna possono esserci una casa, una mensola e un ponte: cliccare il ponte
  deve dare il ponte. La quota frazionaria che `pickSolidCell` restituisce già
  diventa il voxel colpito, con il clamp che evita di prendere l'aria sopra il
  tetto invece del tetto.
- Il click si risolve su `pointerup` con una soglia di sei pixel e la guardia
  esplicita sullo strumento in mano: `isPanButton` accetta anche il tasto
  sinistro e `camera.attach` è il primo listener registrato, quindi ogni click
  **è già** l'inizio di un pan. `Escape` chiude la scheda dopo lo strumento e
  prima del soggetto di studio, dentro l'unica catena che c'è.
- Il pannello sta sul bordo destro ancorato in alto e si ferma dove i drawer
  cominciano, quindi le due superfici non si coprono mai senza doversi conoscere.
  Si aggiorna a 150 ms come il resto dell'HUD.
- **Il contorno in-world costruisce una geometria nuova a ogni cambio.** Il costo
  non c'è: la selezione cambia a un clic, non a ogni frame. La prima stesura
  motivava la scelta dicendo che alzare `needsUpdate` su un buffer preallocato
  non arriva alla GPU — **non è vero**, e `TrafficView` scrive in
  `attribute.array` senza ricostruire niente. La causa degli overlay invisibili
  era `Float32BufferAttribute`, che dell'array passato fa una **copia**
  (`new Float32Array(array)`): presa a buffer ancora vuoto, tutte le scritture
  successive finivano in un array che nessuno carica, e la linea restava
  `visible` con ogni vertice sull'origine. `InfluenceOverlay` e `plain` si
  salvavano perché prendono la copia **tardi**, a posizioni già scritte.
- Per la stessa ragione il contorno è una **fascia piena** e non solo una linea:
  una linea da un pixel si perde sul terreno chiaro e in WebGL la larghezza non è
  regolabile, che è già il motivo per cui il raggio d'influenza affianca al
  proprio cerchio una fascia.

**Chiuso.** Le guide di ispezione (`InspectGuides`) non si vedevano già a
`b13b045` — riquadro, carreggiata della sezione e mirino sulla colonna a fuoco in
scena e invisibili — per la copia descritta sopra. Correzione di una parola:
`BufferAttribute` invece di `Float32BufferAttribute`, che tiene l'array per
riferimento. Il disegno a buffer preallocato resta, ed è quello che qui conta:
le guide inseguono il cursore, quindi ricostruire quattro geometrie sarebbe stato
un costo a ogni frame, non a ogni clic.
- File nuovi: `src/game/selection.ts`, `src/ui/SelectionPanelModel.ts`,
  `src/ui/SelectionPanel.ts`, `src/engine/SelectionOutline.ts` più i due test
  puri. Toccati: `src/main.ts`, `src/ui/GameHud.ts`, `src/ui/GameHudModel.ts`,
  `src/ui/ControlsHint.ts`, `src/ui/hud.css`.

## In corso — La quota di Levels si arma, non insegue

Aprendo Levels bastava **muovere il mouse** perché la città si aprisse e si
richiudesse da sola: la quota della fetta veniva riscritta a ogni frame dal suolo
sotto il cursore. Poi, appena il puntatore usciva dall'isola, si inchiodava e non
rispondeva più — da fuori sembrava un comando rotto.

- **Il valore iniziale è un'*armatura*, non un inseguimento.** Partire dal suolo
  che si sta guardando resta giusto — una quota assoluta cadrebbe dentro la
  collina, perché la città sta a quaranta voxel sul mare — ma è una cosa che si fa
  **una volta**, all'apertura. `InspectView.apply` chiude ora `sliceChosen` nello
  stesso passo in cui scrive la quota.
- Le due metà del difetto avevano la stessa causa. Il tremolio si vedeva subito;
  il blocco no, ed era il più insidioso: fuori dall'isola `pointedCellAt` non
  risponde e `focusColumn` ripiega sul centro dell'inquadratura, che non cambia
  mai. Muovere la quota torna a essere un **gesto** — la barra e `[`/`]` — e i
  gesti sono le uniche cose che la muovono.
- `InspectView.test.ts`: la vista non importa Three né tocca il DOM, quindi si
  verifica in node come `inspect.ts`. Sette casi, fra cui i due che riproducono
  esattamente il difetto.

## In corso — Girare attorno alla città, non solo attorno a un isolato

L'orbita c'era già, ma la accendeva **uno strumento**: per guardare la propria
città da un altro angolo bisognava aprire Block focus e isolarne un pezzo, cioè
tagliare via tutto il resto. La vista generale aveva un'inclinazione sola e
quattro yaw, e nessun modo di chiedere «da qui».

- **Il drag centrale orbita, ovunque.** Yaw continuo e inclinazione fra 12° e
  82°, gli stessi limiti dello studio e per le stesse ragioni geometriche. Il
  perno è il centro dell'inquadratura, quindi girare non sposta: la cosa che si
  stava guardando resta dov'era. Il tasto è il centrale perché è l'unico dei tre
  che non serviva già a qualcos'altro — il sinistro piazza e sceglie un isolato,
  il destro è l'unico pan col mouse quando si ha uno strumento in mano.
- **L'angolo resta dove lo si lascia**, altrimenti sarebbe una sbirciata e non
  un punto di vista: pan, zoom e `Q`/`E` lo conservano, e ci si costruisce da lì.
- **`Q`/`E` riagganciano la griglia invece di contare gli scatti.** Lo scatto di
  partenza si ricava ora dallo yaw **vero**: con il contatore di prima, da 145°
  premere `E` puntava 135° e la città partiva all'indietro. Ricavandolo, il
  bersaglio è sempre entro tre quarti d'angolo retto e la via breve è garantita
  per costruzione — la normalizzazione a ±180° è sparita con lui, e `yawStep` con
  entrambi: era stato ridondante dal momento in cui lo yaw poteva essere libero.
- **`F` è la via di ritorno**: inquadra tutto **e** rimette l'assetto isometrico.
  Sono la stessa domanda, e senza un gesto che la faccia la griglia si sarebbe
  ritrovata solo ricaricando la pagina.
- **`CameraInput.ts`, la mappa dei gesti.** `IsoCameraController` era a 682 righe
  contro le ~600 del budget, ed è dove tre sessioni in parallelo si sono
  incontrate: la cucitura è passata fra *quale gesto chiede cosa* e *come la
  camera si muove*, che cambiano con frequenze molto diverse. Il controller
  scende a 568 righe e i gesti si provano senza costruire una camera.
- Il tasto centrale apre l'**autoscroll di Chrome**, e lo apre da `mousedown`: il
  `preventDefault` sul pointer non basta, e senza la guardia esplicita chi orbita
  si ritrova la rosetta di scorrimento in mezzo allo schermo.

## In corso — La città sospesa si collega, e ci si arriva (fase 4.9)

La 4.9 era passata a metà: nascevano le mensole e sopra ci si costruiva, ma i
percorsi restavano **zero** e non esisteva una sola via fra il suolo e la quota.
Si abitava sopra la città senza poterci arrivare.

- **Il verso della scansione, non il planner.** `faceRuns` cercava la corsa di
  parete dall'alto in giù, quindi ogni ospite si prendeva la propria fascia più
  alta e due vicini di livello diverso finivano a quote lontanissime. Invertito,
  la prima corsa utile è la sommità del basamento — che la 4.4 rende condivisa da
  tutta la fila — e i vicini sono complanari **per costruzione**, senza nessuna
  griglia imposta da fuori. La mensola sta ora sul **solo fronte strada**: è lì
  che il corridoio di un percorso corre sopra la carreggiata invece che sopra i
  corpi degli edifici.
- **Dove non c'è una fascia da continuare, la mensola è un balcone.** Metà della
  città sale a prisma e non arretra affatto: 147 ospiti su 400 non avevano una
  sola corsa utile. Con il ripiego su facciata piena le mensole di una città
  matura passano da **39 a 53**, e le coppie con gli atterraggi allineati da 2 a
  75.
- **Il colmo era un pavimento, ed è diventato un tetto.** `crestOf` costringeva
  ogni percorso a passare sopra ogni tetto sotto il proprio corridoio: 48 coppie
  su 87 morivano lì. La corsa parte ora dalla quota dei due capi e si alza di un
  pianerottolo per volta finché il luogo la accetta.
- **La piega a zeta torna**, con la correzione che la roadmap chiedeva: il colmo
  si misura sui **riquadri veri dei pezzi** e non sul corridoio della corsa,
  perché il tratto di traverso e i due angoli stanno fuori da quel corridoio. I
  rifiuti per sfalsamento scendono da **229 a 6**. Nel farlo è emerso un difetto
  vero: il colmo poteva cadere *sotto* la quota di partenza, e allora il ciclo
  non girava nemmeno una volta.
- **La guida: una cosa sola posata in due modi.** `aerial/guideway.ts` è il
  montante d'isolato — una guida verticale da terra a un impalcato abitato, con
  le capsule ferme che di notte si accendono — e la stessa guida incassata nel
  piano dei tratti di percorso è la monorotaia. È struttura di scena: niente si
  muove, perché non ci sono oggetti animati fuori dai chunk. Il montante **sta
  sul marciapiede**, e non è una concessione: sotto una mensola sul fronte strada
  c'è o il proprio ospite o l'asfalto.
- **La mensola in mano al giocatore**: costo in `BALANCE.gameplay.terrace`,
  azione in `game/actions.ts`, bottone nella toolbar accanto all'espansione — sono
  la stessa domanda posta nei due versi — e tre motivi di rifiuto distinti, perché
  chiedono tre gesti diversi.
- **Il mirino stava mezzo schermo sotto il mouse.** `pickSolidCell` si fermava già
  sulla torre giusta ma restituiva la sola quota del **terreno**, e il segnaposto
  si disegnava lì: in isometrica la z è tutta verticale sullo schermo, quindi sotto
  una torre alta il mirino finiva centinaia di pixel più in basso, in mezzo agli
  edifici davanti, e sembrava puntare un altro isolato. Posare una mensola era un
  gioco di tentativi. La cella porta ora anche `hitZ`, la quota a cui il raggio ha
  davvero incontrato il solido — tetto o facciata — ed è quella che lo strumento
  mensola usa per il mirino. La colonna resta quella del suolo: sono due domande
  diverse e restano due campi.
- **Una premessa era falsa.** `AERIAL.route.minSeparation` valeva 14 perché «sotto
  quella distanza ci pensa già la 4.5». Misurato: **nessuna delle 20 campate di
  una città cresciuta tocca una mensola**, perché `planSpan` cerca due corpi
  affacciati e un impalcato non è un corpo. La soglia scende a 6, con la ragione
  vera al posto di quella sbagliata.

`routePlan.ts` si è spezzato in due prima di crescere: le **forme** restano lì, la
meccanica dei pezzi va in `routeDrafts.ts`.

**Resta aperto, e va detto:** i percorsi nascono ma sono pochi — su una città
matura ne conta uno. Il rifiuto che domina è ora `blocked`, ed è onesto: un
percorso lungo alla quota di un mezzanino attraversa davvero dei corpi. Le
mensole di uno stesso fronte sono però contigue e complanari, quindi il mezzanino
continuo **esiste già come geometria** e non come collegamento dichiarato:
riconoscerlo è il punto da cui riprendere. Restano fuori dalla 4.9 le due caselle
di look e di costo. **Le tabelle di misura in `README.md` e `src/sim/README.md`
vanno rimisurate a mano** e non sono state aggiornate qui.

## In corso — La montagna, la flora e le erbette

L'isola saliva sempre allo stesso modo: un cubo per volta. Il terreno si posava
sul multiplo di `cellSize` sotto di sé, quindi due celle contigue non potevano
differire di più di due voxel, e ne usciva un rilievo a curve di livello tutte
identiche — leggibile, ma senza montagne. Una montagna non è un pendio con più
scalini, è un pendio con scalini **più alti**.

- **La pedata cresce con la quota.** `terrain/terrace.ts` è una scala monotona:
  due voxel in pianura, quattro nella foresta, sei sulla collina, otto sulla
  roccia — il passo cambia dove `TERRAIN` cambia fascia di bioma. Il campo
  continuo **non è stato toccato**: a fare il muro è la quantizzazione, e il
  vincolo di Lipschitz che regge tutto il resto vale immutato.
- **Il tetto del dirupo è dimostrato, non sperato.** Ogni pedata è larga almeno
  quanto il dislivello massimo fra due celle contigue, quindi due celle cadono su
  pedate contigue e il salto peggiore possibile è **un'alzata**. Nessun clamp a
  valle, e nessun seed sfortunato che possa produrre di più. `terrace.test.ts` lo
  verifica sulla scala, `IslandGenerator.test.ts` sull'isola.
- **La pianura è rimasta quella di prima.** Il terrazzamento comincia a
  `beachMaxHeight`: sotto, il gradino è ancora il cubo di sempre, ed è la ragione
  per cui la città non si accorge di niente. Sopra, il ciglio si paga come
  qualunque dislivello — `GRADING.maxWorksStep` vale 24, tre volte l'alzata
  massima, quindi un lotto a cavallo di un gradone costruisce il suo terrapieno
  invece di essere rifiutato.
- **Dentro una conca la scala resta fine.** Fondo, sponda e pelo di un lago
  stanno dentro sei voxel: un'alzata da otto se li mangerebbe, la sponda
  scenderebbe sotto il proprio pelo e il lago colerebbe a valle.
  `HeightField.inBasinAt` spegne il terrazzamento sull'ellisse d'influenza.
- **Sul ciglio affiora la roccia.** Una cella che sovrasta un salto di più di un
  cubo diventa `rock`, e quindi smette di essere edificabile. La flora però si
  decide sul bioma **di sotto**: il ciglio esiste solo dove il margine del
  reticolo basta a calcolarlo, un albero deve valere lo stesso da qualunque
  blocco lo si guardi.
- **Le sporgenze: la prima cosa del terreno che non è una colonna.**
  `terrain/ledges.ts` appende al ciglio una lastra di roccia con aria sotto,
  quindi non rappresentabile come quota — vive fuori dalla `TerrainMap`, nel
  mondo voxel e nel blocco come record, esattamente come un albero. Che «abbia
  senso» è un vincolo verificato: si aggancia alla parete per un lato intero,
  lascia sotto di sé una cella d'aria e sopra di sé una cella di parete, e si
  assottiglia allontanandosi da ciò che la regge. Il salto minimo non è
  dichiarato, è la somma di quelle tre cose.
- **Un catalogo della flora, e sei specie invece di tre.** `terrain/flora.ts`:
  abete d'alta quota stretto e alto, cespuglio da cinque voxel, macchia
  schiacciata sopra il limite del bosco. Ogni bioma ha una lista pesata, quindi
  la fascia si legge anche dalla *forma* di ciò che ci cresce e non solo dalla
  densità. La roccia non è più nuda: era spoglia da quando era anche l'unico
  terreno vietato alla città.
- **Le erbette sono un byte per colonna.** Un voxel più chiaro sopra la
  superficie — un quarto della faccia di un cubo, che è la scala che al terreno
  mancava del tutto fra il prato e l'albero più piccolo. Niente record e niente
  PRNG: la copertura non ha un ingombro e non può collidere, quindi basta un hash
  (`unitAt`, che non alloca la chiusura di `mulberry32`). Fiori in pianura,
  sassi in quota, conchiglie sulla riva.
- **Un reticolo di celle con due celle di margine.** `terrain/cellGrid.ts`: per
  dire se una cella è un ciglio servono le quattro intorno, e quelle di bordo
  stanno fuori dal blocco. Il margine copre anche l'anello decorativo, quindi gli
  alberi hanno smesso di ricampionare il campo per conto proprio.
- **Un difetto che solo il test ha rivelato.** Un cespuglio di raggio due nato a
  quattro colonne dal bordo non tocca il blocco, ma il suo record ne alzava
  comunque `maxHeight`: un chunk allocato per una chioma che quel blocco non
  scrive mai. Vale identico per una sporgenza ancorata al margine — entrambe si
  ritagliano ora prima di finire nel blocco.

File: `src/world/terrain/terrace.ts`, `src/world/terrain/cellGrid.ts`,
`src/world/terrain/flora.ts`, `src/world/terrain/groundcover.ts`,
`src/world/terrain/ledges.ts`, `src/world/terrain/config.ts`,
`src/world/terrain/IslandGenerator.ts`, `src/world/terrain/heightField.ts`,
`src/world/terrain/columnBlock.ts`, `src/world/terrain/decor.ts`,
`src/world/terrain/TerrainStreamer.ts`, `src/world/rng.ts`,
`src/sim/testTerrain.ts`, più i test di terrazzamento, copertura e sporgenze.

---

## In corso — Il campionario dei voxel (fase 4.10)

Le scene erano quattro e nessuna guardava il **vocabolario**: `city`, `noise` e
`slab` misurano il mesher, `diorama` guarda un edificio. L'unico modo di vedere
uno slot di palette o un linguaggio di superficie era trovarlo per caso dentro un
edificio generato, e l'unico modo di giudicare la scala di una chioma era
aspettare che l'isola ne producesse una accanto a un edificio. Una scelta di look
si fa affiancando le cose, e non c'era un posto dove affiancarle.

- **`?scene=swatch`, tre fasce su un basamento continuo.** La matrice 32 × 8 —
  uno slot di palette per colonna, un `SURFACE_KIND` per riga — la stratigrafia
  di ogni bioma tagliata di fianco più i tre `WATER_CLASS`, e la fascia di scala
  fra cubo di terreno, alberi ed edificio di riferimento. È una scena come le
  altre, deterministica e a passi con budget: nessuna geometria dedicata, nessuno
  slot di palette e nessun tipo di superficie in più.
- **Due metà che non si toccano.** `scenes/swatchLayout.ts` dice dove sta cosa ed
  è puro; `scenes/swatchScene.ts` scrive e basta. La geometria ha tre consumatori
  — generatore, inquadratura, referto sotto il cursore — e due letture della
  stessa griglia divergerebbero al primo ritocco.
- **Le dimensioni si ricavano dalle tabelle.** Colonne da `PALETTE_SIZE`, righe da
  `SURFACE_KIND`, alberi da `TREE_SHAPES`, pilastri dai biomi: uno slot o una
  specie in più allargano il campionario da sé invece di restarne fuori. È la
  forma forte di «accorgersi che uno slot nuovo non è mai stato aggiunto» — non
  può succedere.
- **La cella non è un cubo, e il perché è nel mesher.** Lato quattro e altezza sei
  sono il minimo che soddisfa insieme tutti gli emettitori di `microGeometry.ts`.
  Sotto quei numeri qualche riga smetterebbe di mostrare qualcosa senza che
  niente segnali il perché.
- **L'acqua era l'unico pezzo di vocabolario invisibile.** Sulle colonne `water` e
  `waterDeep` il fragment riconosce l'acqua dalla palette prima di leggere i tre
  bit, quindi lì `WATER_CLASS` prende il posto del linguaggio di facciata: i tre
  pilastri d'acqua sono il solo posto in cui un tema con uno specchio morto si
  riconosce, e il referto lo dice sotto il cursore.
- **La colonna zero resta un buco.** `packVisualBlock` restituisce zero per
  palette zero: non c'è niente da scrivere, ed è esattamente ciò che l'indice zero
  significa. Le combinazioni vere sono trentuno per otto.
- **Nomi derivati, non una seconda tabella.** `PALETTE_SLOT_NAMES` e
  `SURFACE_KIND_NAMES` si ricavano dalle rispettive tabelle: un elenco scritto a
  mano divergerebbe alla prima aggiunta, e il campionario mostrerebbe una colonna
  con il nome di quella accanto.
- **Un difetto che solo il test ha rivelato.** «Non scrivere fuori dall'estensione
  dichiarata» sembrava un confronto con `world.bounds`, e non lo è: l'AABB del
  mondo è granulare al chunk e avrebbe accettato in silenzio una scrittura trenta
  colonne oltre il bordo. Il test conta i voxel dentro l'estensione e li confronta
  con il totale.

File: `src/world/scenes/swatchLayout.ts`, `src/world/scenes/swatchScene.ts`,
`src/world/scenes/swatchScene.test.ts`, `src/ui/SwatchOverlay.ts` (nuovi);
`src/world/scenes/cityScene.ts`, `src/world/visualBlock.ts`,
`src/engine/paletteSlots.ts`, `src/engine/palette.test.ts`, `src/main.ts`.

## In corso — L'isola prende una forma: lobi, colline e laghi

L'isola era **una cupola**, e non per caso: un rumore isotropo moltiplicato per
una maschera radiale non può dare altro. Le fasce di bioma ne uscivano come
cerchi concentrici — il bersaglio che il commento di `warpAmount` dichiara da
sempre di voler evitare — con una vetta sola, sempre al centro, dentro una costa
quasi circolare. La differenza fra due seed era dove cadevano le creste, non che
isola fossero.

- **La sagoma è dichiarata, il rumore fa la grana.** `terrain/landform.ts`
  compone l'isola da elementi con un nome: due o tre **lobi** che allungano la
  costa in poche direzioni, due o quattro **rilievi** che spostano le vette fuori
  dal centro, una **conca** che apre uno specchio d'acqua interno. Puro come la
  rete stradale, funzione di `(seed, shape)` e nient'altro.
- **Nessun elemento dichiara un'altezza: dichiara un raggio.** L'altezza gliela
  detta `capForRadius` dal budget di pendenza, perché una cupola di ampiezza `a`
  e raggio `R` ha pendenza massima `π/2 · a / R` e il margine di Lipschitz è
  l'unica cosa che tiene il terreno a celle senza dirupi. È la stessa regola che
  `maxReliefSlope` applica all'isola intera, letta un elemento per volta — ed è
  anche perché una penisola è bassa e larga invece che una montagna in miniatura.
- **Il budget è stato pagato, non sforato.** Le ottave sono passate da quattro a
  tre: in un fbm normalizzato con `lacunarity 2` e `persistence 0.5` ogni ottava
  pesa sul gradiente lo stesso, quindi la quarta si prendeva **un quarto** del
  margine per il sei per cento dell'ampiezza — tre voxel di increspatura su una
  lunghezza d'onda di quarantotto, che la quantizzazione a celle cancella
  comunque. Quel quarto adesso fa una collina. Misurato su otto seed, il
  dislivello peggiore fra colonne adiacenti è passato da **0,654 a 0,669**: la
  soglia del test resta 0,8, e il numero più alto è ora la sponda di un lago —
  l'unico posto in cui il terreno si avvicina di proposito al tetto.
- **Una seconda ottava di deformazione fa le insenature.** La prima è più lenta
  dell'isola e da sola sposta l'ellisse da un lato; questa è quattro volte più
  rapida e vale un terzo, e aggiunge alla riva anse e capi alla scala di un
  quartiere. Il tetto duro di ~0,26 vale ora sulla somma dei due termini.
- **Un lago sta in quota, e ha una quota d'acqua propria.** È la cosa che
  l'acqua non sapeva fare: si scriveva fino a `TERRAIN.seaLevel` e basta.
  `ColumnBlock.waterTop` porta adesso la quota dello specchio **per colonna**, e
  `classifyBiome` chiama `ocean` ciò che sta sotto il proprio specchio invece di
  ciò che sta sotto il mare. Chi scrive la colonna non sa cosa sia un lago: legge
  una quota e ci riempie fino, come faceva con il livello del mare.
- **A livello del mare un lago non esisteva.** Il fondo di uno specchio sta sotto
  il pelo dell'acqua, e su un'isola a cupola la sola terra abbastanza bassa da
  ospitarne uno è la striscia di riva: misurato su otto seed, una conca centrata
  lì ha sempre almeno un quarto della corona sul mare — quello che si apre è una
  baia. Sopra il livello del mare il problema sparisce, perché la terra intorno è
  più alta ovunque per costruzione.
- **La conca si costruisce il proprio bordo.** Non scava e basta: impone un
  profilo — fondo piatto, sponda, bordo — e lo raccorda al terreno che trova. È
  quello a rendere il lago chiuso *per costruzione* invece che per fortuna del
  seed. Il raggio è un punto fisso: dipende dal salto da raccordare, che dipende
  dal raggio. Dove non converge il sito è un fianco, e viene scartato — su otto
  seed di prova, sette prendono un lago di circa 1 400 colonne, uno no. I siti
  si cercano nella **metà interna** dell'isola, dove la pendenza radiale di una
  cupola tende a zero: cercando su tutto il disco i seed con un lago erano tre.
- **Un lago non è battigia.** `groundKindOf` lo rifiuta invece di trattarlo come
  fondale: `GRADING.quayLevel` è una quota assoluta tarata sul mare, e sotto la
  riva di un lago in quota quel muro finirebbe dentro la collina. La città gli
  cresce intorno.
- Profondità di due voxel per costruzione, cioè dentro `shallowDepth`: lo
  specchio prende la risposta `WATER_CLASS.shallow` — increspatura fitta, fondale
  che si vede sotto — e non l'onda lunga del mare aperto.

File: `src/world/terrain/landform.ts` (nuovo), `landform.test.ts` (nuovo),
`config.ts`, `heightField.ts`, `biomes.ts`, `waterClass.ts`, `columnBlock.ts`,
`IslandGenerator.ts`, `TerrainMap.ts`, `src/world/grading/grade.ts`,
`src/sim/testTerrain.ts`, più i test toccati. Il worker del terreno passa da
5,77 a 12,96 kB in bundle.

---

## In corso — Sventramento: un landmark si pianta anche nella città costruita

Piantare un catalizzatore dentro l'edificato **riusciva e non si vedeva**: i fondi
si scalavano, il catalizzatore entrava nella simulazione, e la struttura non
nasceva perché il volume era occupato. Nessun record, quindi nessuno stadio,
quindi un monumento invisibile per sempre — e nessun errore da nessuna parte. Era
anche il piazzamento più interessante del gioco, ed era l'unico impossibile: gli
stadi si sbloccano contando gli edifici nel raggio, quindi un monumento in centro
arriverebbe alla forma finale in poche passate. Il modello Anno 1800 che
`landmarks/config.ts` cita da sempre non era mai stato giocabile.

- **Il riquadro pieno apre un cantiere.** Gli edifici che lo occupano vengono
  demoliti a rate e la struttura viene su al posto loro. La demolizione passa
  dalla coda di comparsa che c'era già: uno stamp vuoto come sagoma nuova e il
  volume da togliere come `erase` non scrive niente e cancella tutto, a budget.
  La stessa macchina che fa salire un edificio voxel per voxel lo fa scendere, e
  il cantiere si sgombera al ritmo a cui la città cresce.
- **Si sventra solo il tessuto minuto.** Oltre `BALANCE.gameplay.catalyst.
  clearing.maxLevel` il riquadro rifiuta, e il rifiuto è **del riquadro intero**:
  sgomberare attorno a una torre che resta in piedi darebbe un buco al posto del
  landmark. Il numero è tarato su misura e non a occhio — su una città matura di
  412 edifici, a soglia 4 restano 139 colonne che aprono un cantiere e le torri
  (il 17% alto della scala) sono fuori portata. Trovare la sacca bassa dentro il
  quartiere denso **è** la giocata.
- **Il costo non è in fondi, ed è deliberato.** Con un milione in cassa un prezzo
  non vincola niente. Sventrare toglie edifici alla simulazione, quindi capacità,
  quindi un'occupazione sopra uno, quindi il `crowdingPenalty` che il bilancio
  applicava già. Non c'è una penalità nuova da nessuna parte: il costo del gesto
  è il bilancio che c'era.
- **`src/sim/` impara a togliere.** `removeBuildings` è l'inverso di
  `addBuilding`, e «inverso» è il requisito: toglierne N dà lo stesso campo di non
  averli mai aggiunti, byte per byte, congestione e occupazione comprese. Un test
  verifica l'equivalenza con `rebuild` in entrambi i versi. La simulazione
  continua a non sapere cosa sia un landmark (invariante 7).
- **Un record esce dal registry solo quando i suoi voxel non ci sono più.**
  Toglierlo prima aprirebbe una finestra in cui il suolo legge libero mentre
  l'edificio è ancora lì: un lotto ci nascerebbe dentro e la cancellazione in coda
  gli mangerebbe i voxel. Come effetto collaterale gratuito, la passata di upgrade
  salta i condannati da sola, perché li vede in coda di comparsa.
- **La città in quota non si sventra.** Un altro landmark, una mensola, un nodo di
  percorso o un edificio che ne *porta* uno fermano il riquadro: farli cadere
  farebbe cadere quello che ci sta sopra. Le campate invece cadono, ed è già la
  regola «al suolo vince l'edificio».
- **Il cursore lo dice prima del click, e non rifiuta.** Un riquadro che non regge
  la struttura non impedisce di piazzare il catalizzatore — il campo funziona lo
  stesso, e due catalizzatori vicini che si sovrappongono sono proprio il gesto
  che il gioco chiede. A cambiare è cosa comparirà: «Clears 6 buildings» oppure
  «only the plaza will appear». È quello il difetto muto che questa fase chiude.
- I tre commenti che dicevano *«nessuno demolisce»* sono stati riscritti, e la
  nota della blacklist ha avuto quello che aspettava: `onTick` la svuota con
  `forget` appena un cantiere porta via qualcosa.
- Nuovi: `clearance.ts` (la regola, pura) e `recordStamp.ts` (la sagoma registrata
  di un edificio, che ora ha due chiamanti invece di una copia dentro l'upgrade).

## In corso — Esemplari, e due dettagli che mancavano a tutti

I landmark erano identici byte per byte: nove ruoli, quattro stadi, quattro
rotazioni, e due porti sulla stessa mappa indistinguibili. Ora ogni ruolo ha tre
esemplari, e il vocabolario con cui si disegnano è uscito dall'angolo retto.

- **Un ruolo ha un tronco e tre esemplari, e l'esemplare non toglie mai niente
  al tronco.** `recipe.parts` si disegna sempre e dice *il ruolo*;
  `variants[n].parts` ci si somma sopra e dice *quale* porto. È quello che
  concilia la varietà con la nota storica di `landmarks/generate.ts` contro il
  PRNG: quella nota temeva che il giocatore dovesse imparare nove sagome
  moltiplicate per i semi, e tenendo il tronco fuori dalla variante la
  leggibilità del ruolo è garantita **per costruzione**, non per disciplina di
  chi compila la tabella. Un test la misura: ogni esemplare contiene il tronco
  per intero.
- **L'esemplare è funzione del seme del record, con un sale proprio.**
  `LANDMARK.variantSalt` esiste per lo stesso motivo di `SKYLINE.peakSalt`:
  `record.seed` è `hashCoords(worldSeed, x, y)`, ed è lo stesso intero da cui il
  verso di ripiego esce con `& 3`. Senza sale, verso ed esemplare cambierebbero
  sempre insieme e la città mostrerebbe una regolarità che nessuno ha scritto.
  Il seme si calcola prima dello stamp e si conserva nel record, perché un
  avanzamento di stadio deve ritrovare l'esemplare già scritto: due esemplari
  diversi non si coprono, e l'invariante «lo stadio nuovo copre il vecchio»
  cadrebbe.
- **Traliccio e falda sono la nona e la decima primitiva, lo smusso è un campo.**
  Una gamba di gru disegnata come prisma pieno legge come un muro stretto: il
  traliccio ha aria dentro, ed è l'aria a dire «struttura». La falda è l'unica
  sommità non piatta del vocabolario — finché non c'era, tutti i ruoli finivano
  su un piano orizzontale a quote diverse. `Part.chamfer` invece non è
  un'undicesima voce ma un modificatore della pianta: scatola smussata è un
  tamburo, scatola cava smussata un anello ottagonale, piramide a gradoni
  smussata una cupola. Tre forme per un campo, ed è l'unico modo che questo
  dominio ha di uscire dall'angolo retto senza imparare a disegnare un cerchio.
  Tutte e tre restano invarianti per rotazione, che è la proprietà che il test
  del catalogo misura su ogni esemplare.
- **I landmark hanno finalmente porte e insegne.** Nessuna ricetta usava
  `SURFACE_KIND.portal` né `luminous`, quindi nove strutture pubbliche
  perdevano montanti, architrave e pensilina — già scritti in
  `microGeometry.ts` — e restavano buie di notte. Non è codice nuovo: è una
  riga di tabella che dichiara il linguaggio giusto sulla colonna giusta.
- **Due voci nuove di microgeometria, e nessuna costa niente dove non serve.**
  Il *finiale* mette collarino e ago sulla sommità di una colonna isolata:
  ciminiere, guglie, gambe di gru e torri di controllo finivano tutte su un
  quadrato piatto largo quanto il fusto. La *fascia di sbalzo* dichiara lo
  spessore all'intradosso di un aggetto — bracci di gru, nastri, viadotti,
  impalcati in quota — e corre lungo il filo, quindi un braccio intero costa un
  prisma per lato. Sul chunk fitto di edifici veri il conto resta **4355 quad**,
  invariato: quella fixture non ha né colonne isolate né sbalzi, ed è
  esattamente il punto — le due voci si pagano solo dove producono qualcosa.
- **`utility` resta fuori da `collectSurfaceCells`, e ora è scritto perché.** È
  la superficie di tutte le carreggiate: un emettitore agganciato lì pagherebbe
  da solo più di tutto il resto del modulo.

## In corso — Moli, traghetti e ponti

Tre cose che l'isola non sapeva fare: ormeggiare, collegare due sponde, e
scavalcare l'acqua. Le prime due sono complete; della terza è pronto il dominio,
non ancora il cablaggio.

- **Il porto ha una darsena, dei pontili e delle barche ormeggiate.** L'acqua è
  scritta *dentro* lo stamp, come lo stagno del parco: le opere di terra portano
  tutta l'impronta alla quota della banchina prima che la ricetta scriva, quindi
  un buco lasciato al terreno sarebbe terra ferma e non mare. È l'unico modo che
  una ricetta ha di tenersi dell'acqua in casa — e quindi di avere una barca
  *dentro* il porto invece che accanto.
- **`PART.hull` è l'ottava primitiva dei landmark, e l'unica senza una pianta
  rettangolare.** Le altre sette sono un prisma con una maschera simmetrica, e
  una barca disegnata come scatola legge come un container. È rastremata ai due
  capi — un traghetto è a doppia estremità davvero — e la rastremazione segue
  l'asse lungo e non `x`: è quello a tenerla invariante per rotazione, che è la
  proprietà che il test del catalogo misura su ogni ricetta.
- **Il traghetto è il nono catalizzatore**, costiero come il porto ma opposto per
  effetto: da un imbarco passano persone, quindi tira su case e negozi invece di
  capannoni. Divide la costa con il porto senza doppiarlo perché collega
  dall'altro lato — il porto apre il commercio *con il mondo*, il traghetto lega
  *due punti dell'isola*, e infatti non è un `TradeLink`.
- **Una linea è una coppia, ed è l'unico ruolo che da solo non chiude la propria
  promessa.** `ferry.ts` accoppia gli imbarchi abbastanza lontani, uno per capo,
  e solo una linea *aperta* contribuisce alla soddisfazione: un molo isolato resta
  un catalizzatore come gli altri, con le sue barche ferme. La coppia si misura
  in distanza e basta, perché in `src/sim/` non c'è niente che sappia dove finisce
  la terra — la geografia la legge `src/world/`, come per il vincolo di sito.
- **`src/world/crossings/` è il viadotto che il commento di `SPANS.maxGap` aveva
  annunciato.** Oltre dodici voxel una campata «non è più una passerella ma un
  viadotto, che ha bisogno di appoggi propri a terra»: l'invariante di questo
  dominio è l'opposto di quello di `spans/` — **un attraversamento prende
  suolo** — ed è la ragione per cui non sono lo stesso file.
- **Un click, non una coppia.** È l'altra differenza di forma: `spans/` esamina
  tutte le coppie e ne accetta poche, qui arriva una colonna sola e la regola
  trova il compagno da sé. Il click sceglie anche il tipo — sopra una torre un
  ponte a quota libera fra due grattacieli, sulla riva un ponte su pile — e il
  motivo di rifiuto che esce è **quello arrivato più avanti** fra tutti i
  tentativi, non l'ultimo, che racconterebbe solo il più disperato.
- **Resta aperto:** il cablaggio dei ponti. Il piano e il generatore sono puri e
  coperti da 22 test in ambiente `node`, ma niente li chiama ancora: servono un
  driver nel `Builder` e un attrezzo nella HUD, e sono esattamente i due file che
  la decomposizione del Builder sta riscrivendo.

## 2026-08-23 — Il Builder diventa una cartella

- **`Builder.ts` passa da 3227 righe a 926**, e nessun comportamento cambia. Non
  era un file grande per caso: sei sottosistemi a tick — nascita, promozione,
  campate, città in quota, landmark, superficie — avevano finito per condividere
  un solo oggetto perché tutti volevano le stesse cinque cose (mondo, terreno,
  strade, registry, coda). Il refactor dà loro quelle cinque cose in un
  `BuildContext` e li separa in un file ciascuno.
- **Le scritture stanno in tre file invece che sparse in sei metodi.** Un voxel di
  edificio arriva nel mondo solo da `growthQueue.ts` (i volumi, a budget), da
  `surfaceQueue.ts` (il suolo pubblico, a budget) o da `siteWorks.buildWorks` (la
  fondazione, subito). L'invariante «nessuno scrive un muro all'infuori di qui»
  vale ora per la cartella ed è **più stretta** di quando valeva per il file,
  perché prima `world.setBlock` compariva in sei punti diversi del `Builder`.
- **Il budget di chunk era già puro e nessuno poteva verificarlo.**
  `dirtyChunkCount` non toccava `this` in una sola riga, ma da metodo privato
  l'unico modo di provarlo era far crescere una città intera. Ora è
  `chunkBudget.ts` con dieci test propri, fra cui quello che conta davvero: il
  tetto si misura sul **ritaglio** e non sull'ingombro intero, che è la proprietà
  per cui i ritagli esistono.
- **Le due domande della gerarchia verticale stavano in un metodo solo, usato da
  due passate.** `allowedLevel` e `riseOf` vivono in `hierarchy.ts` perché li
  chiamano sia la nascita sia la promozione: averli in due copie è esattamente il
  modo in cui una corona bassa in periferia smette di essere bassa da un lato.
- La rete in quota dipende dalle campate e non viceversa: `aerialDriver` chiede a
  `spanDriver` di far cadere ciò che sta nel volume di una gamba, e la freccia va
  in un verso solo. Era già così, ma prima era un fatto dell'ordine dei metodi
  dentro una classe, non una dipendenza dichiarata fra due tipi.

---

## 2026-08-23 — La città esce dall'impronta

- **La mensola è la prima cosa che sporge.** La grammatica degli edifici dichiara
  il contrario — «la fascia di base resta il riquadro pieno, quindi nessuna fascia
  può uscire dall'impronta e la collisione fra edifici resta bidimensionale» — e
  l'aggetto rompe proprio quella riga. È legale perché `overlaps` confronta già
  gli intervalli di quota colonna per colonna: chi la scrive **eccettua l'ospite**
  invece di spostarla fuori dal riquadro. È l'assunzione di colonna della fase 4.9
  rotta nel modo più letterale possibile.
- **Un impalcato in quota non prende suolo; lo prende solo la gamba che scende a
  terra.** È l'invariante del dominio nuovo `src/world/aerial/`, complemento
  esatto di quello di `spans/`: sotto una mensola la carreggiata si dipinge ancora
  e i lotti si costruiscono ancora, tranne nelle due colonne di una gamba. È una
  riga di `index()`, dove solo `AERIAL_PART.pier` entra in `groundColumns`.
- **Dove l'ancoraggio non arriva, nasce una gamba**, e non c'è una regola per
  ciascuna forma: `planDeck` misura lo sbalzo di ogni colonna e pianta un appoggio
  dove supera `AERIAL.reach`. Ne segue senza codice in più che una mensola corta
  non ha gambe e una profonda se le conta da sola — «quanto è larga, tanto è
  profonda» è l'unica riga che lega le due cose. Una gamba **si sposta per trovare
  un tetto** prima di piantarsi nel prato, ed è ciò che tiene i cuori d'isolato
  liberi per la piazza della 4.5.
- **Nessuna quota è imposta da fuori, e per questo qui non esiste `align`.** La
  mensola prende la quota dalla sommità di una fascia dell'ospite, la gamba dal
  primo appoggio che trova scendendo. Un lotto in quota eredita la fase
  dall'impalcato che lo ospita, non dal cubo di terreno: è la stessa ragione per
  cui le campate `align` l'avevano già tolto.
- **Sopra una quota si costruisce, e la gerarchia scende con lei.** `decksAt`
  legge dal registry e in quota **il lotto è l'impalcato** — niente `findLot`,
  niente opere di terra, niente fila. `levelsAboveDeck` scala il tetto della 4.6
  con la quota già spesa: una mensola è il modo in cui la gerarchia sale, non il
  modo di aggirarla. `TerrainMap` resta una quota e un bit per colonna.
- **`src/sim/` non guadagna una coordinata verticale**: guadagna un numero di
  quote. Il campo conta quelle spese (`stack`, un byte per colonna) e chiede al
  mondo quante ce ne siano (`headroomAt`), interrogato solo dove `stack > 0` —
  quindi una città tutta al suolo costa esattamente quello che costava.
- **Chi regge qualcosa di abitato non cresce, e solo quello.** La lettura semplice
  — fermare ogni ospite — è misurata e non funziona: la fascia alta della
  gerarchia scendeva da quaranta edifici a diciannove, perché una mensola arriva
  presto e da quel momento la torre non sale più. Una mensola **vuota** cade
  quando l'ospite promuove e la passata dopo la ripropone alla quota nuova, come
  fa una campata che perde l'appoggio; una con una casa sopra no, perché quella
  sarebbe una demolizione.
- **La rete è metà fatta, e il limite è nei test.** Un percorso dritto fra due
  mensole allineate funziona ed è coperto; la piega a zeta è stata **tolta**
  perché i suoi pianerottoli cadevano in punti che il corridoio dritto non misura,
  e su settecentocinquanta coppie di una città cresciuta non ne reggeva nessuno.
  Sulla stessa città i percorsi restano **zero**: le mensole ci sono ma non si
  guardano mai. Chi riprende parta da lì, non dal planner.
- Correzioni a due asserzioni preesistenti che dicevano meno di quanto
  credevano: la rampa saltava le colonne sorvolate da una campata ma non da una
  mensola — stesso invariante, stessa esenzione — e il gate degli appoggi chiedeva
  a una **piazza** i due capi pieni, che è chiederle di essere un ponte largo.

## 2026-08-23 — I raggi X guardano una cosa, non una zona

- **La finestra diventa il soggetto.** Era un riquadro di **mondo** di 64 colonne
  centrato sul cursore, e a schermo leggeva come «una specie di trasparenza
  quadrata che non si capisce cosa sia»: troppo largo per essere una lente,
  troppo stretto per contenere un occlusore vero, e uguale per una casa e per una
  torre. Al suo posto c'è un test raggio/volume: continuando il raggio di vista
  dal frammento in avanti, se incontra il volume che si sta guardando allora il
  frammento lo *copre*. La finestra è così la sagoma del soggetto per
  costruzione, a ogni zoom e da ogni angolo — non c'è più niente da avvisare
  nella riga della vista, e infatti «la finestra è larga 64 caselle, quindi
  avvicinati» è sparita.
- **Il suolo smette di bucarsi.** Il terreno davanti al soggetto lo copre come lo
  copre un muro, ma dietro a un muro c'è la città e dietro al terreno non c'è
  niente: la vista si apriva su una macchia di cielo in mezzo all'isolato, ed era
  il difetto che si vedeva peggio di tutti. Con la lente viaggia ora un
  **pavimento** — la base del soggetto — sotto cui non si vela mai.
- **Puntare una torre punta la torre.** `pickSurfaceCell` interseca la heightmap,
  che non conosce gli edifici: il raggio attraversava un grattacielo come se
  fosse vetro e si fermava sulla terra dietro, a tante colonne quanto la torre è
  alta. Le viste ci si agganciavano, quindi la lente si apriva su un altro
  isolato. `pickSolidCell` si ferma anche su ciò che è stato costruito, e chi
  guarda usa quello; chi *piazza* continua a usare la heightmap, perché si
  costruisce sul suolo e fermarsi su un tetto darebbe una colonna inedificabile.
- **Il soggetto non si vela da solo, e non serve un piano per dirlo.** Dall'interno
  del volume il raggio è già cominciato — `enter` negativo — e questo esclude in
  un colpo sia chi sta dentro sia chi sta dietro. La corda del test a lastre va a
  zero sul contorno della sagoma e cresce verso il centro: è già la distanza dal
  bordo che serve alla sfumatura, senza un secondo conto.
- **Densità separata per la lente**, `INSPECT.xrayVeil` a 0,85 contro lo 0,68 del
  velo generico. Sono due geometrie diverse: il velo di Block focus copre tutto
  il contesto e mangiarselo toglierebbe la risposta, mentre la lente apre un buco
  largo quanto un edificio dentro un occlusore che resta intero tutt'attorno. A
  0,68 il muro davanti e il soggetto dietro finivano a metà strada l'uno
  nell'altro e non si leggeva nessuno dei due.
- **Le guide contornano l'edificio** invece del riquadro di 64 colonne: la linea
  dice «questo», non «fin qui arriva il retino». Sul suolo nudo non contorna
  niente — c'è già il mirino, e una seconda linea direbbe la stessa cosa.
- Due uniform nuove (`uInspectLensMin`, `uInspectLensMax`), nessuna
  ricompilazione in più: la variante col `discard` continua a entrare alla prima
  attivazione, e chi non apre mai una vista non paga niente.

## 2026-08-23 — Le torri smettono di essere lastre

- **La sagoma finisce il fiato nel primo quinto, ed è misurato.** Le voci di
  `BAND_OP` spostano il rettangolo di uno o due voxel: con `MAX_FOOTPRINT` a otto
  e `GRAMMAR.minBandSide` a quattro il gioco totale è **due voxel per lato**,
  mentre `LEVEL_CAPS` chiede fino a diciannove fasce. Sul generatore vero: un
  civico da 143 voxel scende a 4×4 alla quota 7 e da lì in su può solo
  *scorrere* — 95% dell'altezza a sagoma costante, trentaquattro a uno; un
  industriale da 106 tiene un unico prisma 7×8 dalla quota 10 alla 93. Il
  commento di `LEVEL_CAPS` dichiarava «venti a uno»: era ottimista.
- **La campata di facciata è il ritmo verticale che la sagoma non può dare.**
  `ClassProfile.bayPeriod` spezza la parete in montanti e aperture, e
  `GRAMMAR.spandrelHeight` tiene sotto di esse il parapetto che separa una
  facciata da un reticolo. Quattro cadenze per quattro usi: montanti radi sul
  residenziale e sul civico (curtain wall), grana fitta sul commerciale in
  mattoni, pannelli larghi e due toni scuri accostati sull'industriale — che non
  sono finestre ma lamiera, ed è quello che un capannone ha al posto delle
  finestre. Una riga di catalogo può sovrascriverla come ogni altra voce del
  profilo, senza plumbing.
- **Conta i montanti e non le aperture**, e la differenza si vede dove conta: un
  fronte da quattro — la larghezza a cui *ogni* torre alta finisce — ha due sole
  colonne fra i cantonali, e un passo contato sulle aperture può non trovarne
  nessuna. Il passo si conta poi **dall'impronta e non dalla fascia**: altrimenti
  un `jog` da un voxel farebbe scorrere di uno tutte le aperture del piano sopra,
  e su venti fasce la parete tornerebbe rumore invece che facciata.
- **È vernice, non geometria**, ed è il contratto che un test tiene fermo: stesso
  volume, stesse superfici, quindi la microgeometria emette esattamente i prismi
  di prima e collisione, budget di chunk e cancellazione non se ne accorgono.
  A pagare è il solo greedy merge — A/B su un chunk di quattro torri vere
  tagliate a metà corpo: **631 → 901 quad base, dettaglio invariato a 1 710**,
  totale +11%. Lontano da `MAX_DETAIL_QUADS_PER_CHUNK` e da
  `MAX_BASE_QUADS_PER_CHUNK`.
- **Un difetto che solo la misura ha rivelato: il civico di livello massimo
  prendeva zero aperture.** Quando l'accento sale a scala di edificio il corpo
  passa a `profile.accent`, che sul civico è lo stesso `glassPale` di `bodyAlt`:
  corpo e cornice cadevano nello stesso slot — e con loro spariva già la riga di
  piano, da prima di questa modifica. Ora l'apertura si inverte e prende il tono
  neutro, che il ciclo ha già in mano come `accentId`. Da 0 a 364 aperture sulla
  classe che sale più in alto, cioè proprio quella che ne aveva più bisogno.

## 2026-08-23 — Il mare di notte, e un orologio che si può fermare

- **Il riflesso dell'acqua è un'ora e non una materia.** Era l'ultima cosa della
  scena rimasta a mezzogiorno: la tinta del tema (`#c7f3ea` sul diorama) veniva
  mescolata sul mare anche a mezzanotte, e su un fondo quasi nero le due sinusoidi
  dell'increspatura smettevano di leggersi come un'onda — diventavano un
  quadrettato chiaro largo quanto l'inquadratura, con un anello di schiuma
  luminoso tutto attorno all'isola. `withHour` ora vira il riflesso verso
  `nightWater` e abbassa l'ampiezza dell'onda: di notte il mare mostra quello che
  riflette, che è poco. Il riflesso del sole non serviva spegnerlo — è
  moltiplicato per un colore che l'ora ha già premoltiplicato per intensità zero.
- **L'orologio si può fermare, dall'HUD.** Tre modi — ciclo, giorno fisso, notte
  fissa — dal bottone accanto a pausa e velocità, dal tasto `L` o da
  `?daylight=night`. Non sono un secondo look: sono le ore vere `DAYLIGHT.dayHour`
  e `nightHour`, quindi luce, cielo, nebbia, ombre ed emissivi restano esattamente
  quelli che il ciclo produrrebbe passando di lì. Tornando al ciclo il sole
  riparte da dov'era, invece di saltare a mezzogiorno.
- **Il tasto sta fuori dal gate del debug**, come `V`: scegliere se guardare la
  propria città di giorno o di notte è gioco, non misura. `H` resta la manopola
  fine dell'harness, un'ora alla volta, e il primo comando di gioco scioglie un
  `?hour=` in coda all'URL — un bottone che non risponde è peggio di un parametro
  perso.
- **`DAY_SECONDS` si trasferisce in `DAYLIGHT.daySeconds`**: il tooltip promette
  al giocatore quanto dura un giro, e due copie del numero vorrebbero dire una
  promessa e una durata diverse.

## 2026-08-23 — La notte smette di essere un retino

- **Nuovo `src/engine/nightWindows.ts`**, quarto modello puro dell'engine accanto
  a luce, atmosfera e ciclo del giorno: il fragment shader ne interpola i numeri
  invece di riscriverli, e `nightWindows.test.ts` più un controllo in
  `VoxelMaterial.test.ts` impediscono alle due copie di divergere.
- **La quota di finestre accese ha un tetto.** Con la sola soglia
  sull'occupazione una città piena accendeva quasi ogni vetro: una facciata
  accesa al novanta per cento non è uno skyline, è un retino, e non si leggeva
  più dove finisse una torre e cominciasse la vicina. Il buio fra le luci è metà
  del disegno. L'occupazione continua a governarle — la città di notte resta una
  lettura dell'economia — ma dentro un intervallo che non satura.
- **Ogni torre ha un carattere.** Un gruppo di colonne dell'ordine dell'impronta
  (`towerCell`, sei voxel) porta la sua quota accesa: accanto a una torre piena
  ne resta una quasi spenta, e il contrasto è quello che prima mancava. Non è
  l'edificio — al frammento non arriva nessun identificatore, e dargliene uno
  costerebbe bit che non ci sono — ma è la scala alla quale due vicini devono
  differire. Una torre larga cade su due gruppi e si accende ad ali diverse.
- **Due modi di accendersi.** Un ufficio accende piani interi, una casa finestre
  sparse: sono le bande orizzontali in mezzo alle macchie. A scegliere è la
  torre e non l'uso, perché la grammatica `habitat` copre residenziale e
  commerciale insieme — limite dichiarato, non svista. Le due soglie si dividono
  la stessa quota, quindi cambia *come* la luce si distribuisce, non quanta.
- **Ambra e bianco freddo invece di un solo pallido**, presi da slot di palette e
  non da costanti: un tema li ritinge insieme al resto della città. Il tono varia
  per finestra, così una torre non è tutta di un colore.
- **Vani scala accesi a ogni piano** (una colonna su venti) e una coda lunga di
  finestre molto più accese delle altre: sono la riga verticale e lo scintillio
  che tengono insieme una facciata altrimenti a macchie.
- **La finestra diventa più alta che larga** e le luci di sommità dei tetti
  (`roofTech`) salgono di notte: sopra il fronte illuminato sono l'unica cosa che
  continua a dire dove finisce una torre e comincia il cielo.
- Nessun voxel viene riscritto, nessun uniform nuovo, nessuna ricompilazione: la
  differenza è tutta dentro il ramo `habitat` del fragment shader.

## 2026-08-22 — Un isolato si può scegliere e girarci attorno (Fase 4.15)

- **Block focus guadagna un secondo tempo.** Puntare un isolato continua a
  velare il fuori al 68%, com'era: risponde a «come si connette». Un **clic** lo
  *sceglie*, e da lì la stessa vista risponde all'altra domanda — «com'è fatto» —
  portando la densità del retino da `veil` a `cut`: fuori dal riquadro non si
  disegna più niente e l'isolato resta un modellino sul suo prisma di terreno.
  Non è un modo nuovo: il ciclo di `V` resta a cinque viste, e la geometria che
  decide cosa sparisce è identica nei due tempi. Cambia un numero.
- **Il riquadro smette di inseguire il cursore.** Era il limite che rendeva la
  vista inutilizzabile per guardare *una* cosa: bastava muovere il mouse per
  perderla. Con un isolato scelto, `applyInspect` non rilegge più il puntatore.
- **La camera impara a orbitare.** `PITCH` era una costante di modulo: diventa
  `REST_PITCH`, il valore *di riposo*, più un campo `pitch` che si muove solo
  dentro lo studio, fra 12° e 82°. Sotto, la correzione azimut→schermo
  (`1 / sin(pitch)`) esplode; sopra, `lookAt` degenera con `up` parallelo alla
  vista. Il trascinamento gira invece di panare, `Q`/`E` diventano passi
  continui, e `F` e il pan da tastiera si spengono — porterebbero il perno fuori
  dal soggetto senza che si veda.
- **Uscendo, la città torna com'era.** `captureState`/`restoreState` rimettono
  yaw, scatto, inclinazione, perno, altezza d'inquadratura e zoom: la camera
  l'aveva mossa lo strumento, non il giocatore. `Esc` molla l'isolato e lascia
  accesa la vista; un secondo `Esc` la spegne. Un clic su un altro isolato cambia
  soggetto senza uscire, e tiene l'angolo — così due isolati si confrontano dallo
  stesso lato.
- **`isCut` e `needsCap` diventano due domande distinte.** `isCut` chiede se si
  sta tagliando, `needsCap` se il taglio lascia una *superficie di sezione* da
  tappare. Coincidono su Levels e Cutaway, che attraversano i volumi, e divergono
  sull'isolato scelto, che toglie per intero ciò che sta fuori e lascia chiusa la
  geometria che resta: lì `DoubleSide` sarebbe solo il doppio dei fragment. È la
  stessa distinzione già in vigore fra `modeCuts` e `modeHasLevel`.
- **Le ombre proiettate restano spente** mentre si studia, perché la regola su
  `isCut` non è cambiata. Il motivo è quello documentato dalla fase 4.11: il
  predicato dell'ispezione vive solo nel materiale di scena e non in quello di
  profondità, quindi il volume nascosto continuerebbe a proiettare ombra sul
  modellino. Portarlo anche nel `depthMaterial` di `SunShadow` resta aperto.
- Il margine d'inquadratura dell'isolato (`INSPECT.studyMargin`) sta in
  `inspect.ts` come ogni altro numero di questo dominio.

## 2026-08-22 — La città di notte come lettura dell'economia (Fase 4.8)

- **Nuovo `src/sim/vitality.ts`**: due frazioni fra zero e uno — case occupate
  (popolazione su capacità) e negozi pieni (l'occupazione del ciclo
  commerciale). È una lettura pura degli stessi conteggi e degli stessi pesi che
  usa il bilancio: chiamarla non cambia niente e costa quattro moltiplicazioni.
  `src/sim/` continua a non sapere che esiste un renderer (contratto 7).
- **Nessun voxel viene riscritto.** Riscrivere le finestre accese vorrebbe dire
  marcare sporchi i chunk della città a ogni tick, cioè rimeshare tutto per
  accendere una luce: la lettura entra come **uniform**, alla cadenza dell'HUD.
- La soglia delle finestre si muove, la variazione per cella no: a cambiare è
  **quante** si accendono, mai quali. Le luci non sfarfallano mentre la
  popolazione cresce.
- Le insegne seguono il commercio, con un minimo al 30%: un accento che sparisce
  del tutto cancella la faccia che rende leggibile il volume, e resterebbe una
  silhouette — cioè il contrario del gate della fase.
- Limite dichiarato: la lettura è per città e per uso, mai per singolo edificio.
  Il fragment non sa a quale edificio appartenga un voxel, e dirglielo
  costerebbe un formato in più; un quartiere vuoto in mezzo a una città piena
  non si spegne da solo. Il salto è materiale da 4.9 in avanti.
- `effectiveCount` diventa pubblico invece di essere copiato: resta l'unico
  punto in cui `buildingCounts` e `mixedCounts` si incontrano.
- File: `src/sim/vitality.ts`, `src/sim/vitality.test.ts`, `src/sim/index.ts`,
  `src/sim/tick.ts`, `src/engine/VoxelMaterial.ts`, `src/main.ts`,
  `PROJECT_INDEX.md`, `ROADMAP.md`.

---

## 2026-08-22 — La luce che esce (Fase 4.8)

- **Un quarto termine nella luce, e non è una luce dinamica.** Quanto una faccia
  sia vicina a una superficie `luminous` o `portal` è un dato geometrico: lo
  cuoce `sweepGlow` nel mesher con sei scansioni lineari sul volume paddato,
  massimo con decadimento separabile sui tre assi. Nessuna pass in più, nessun
  elenco di sorgenti nel fragment, nessuna ricompilazione.
- **I bit c'erano già.** `aShade` ne usava quattro degli otto: il bagliore
  prende i bit 4-5 e nessun attributo di vertice si aggiunge — la stessa mossa
  con cui la 4.7 fece entrare il cielo accanto all'AO. Il campo entra anche
  nella chiave di merge, o il greedy fonderebbe facce che il fragment tratta in
  modo diverso.
- Il `mod` nel vertex shader non è ornamentale: senza, la lettura del cielo
  prenderebbe anche i bit del bagliore e una parete illuminata si crederebbe
  scoperta. C'è un test dal lato del mesher che lo tiene fermo.
- **Corretto guardando lo schermo, due volte.** Con l'alone a dodici voxel ogni
  faccia cadeva nel raggio di qualcosa di acceso e l'edificio diventava ambra
  invece di avere una parete schiarita: sei voxel, cioè due piani. E con lo
  spill a 0,55 la facciata era una lampada: 0,22 lo mette appena sopra
  l'ambiente notturno, che è ciò che si chiede a una luce di rimbalzo.
- **Prezzo misurato**, A/B nello stesso processo sul chunk sci-fi del bench:
  +0,3 ms per chunk (dentro il rumore della macchina) dopo aver tolto la
  moltiplicazione per cella dalle scansioni e il confronto sulla superficie
  estratta dalla scansione di semina. Scritto in modo ovvio costava +1,35 ms.
  I quad totali crescono del 4% per la frammentazione del merge attorno agli
  emettitori — sotto il 10% oltre il quale il piano prevedeva di scendere a un
  bit solo.
- Limite dichiarato: la tinta è del tema e non dell'emettitore. Un'insegna rossa
  e una cyan schiariscono il muro con lo stesso ambra; portare la tinta
  costerebbe bit che non ci sono.
- Chiuso di sponda un difetto della 4.3 che i prop avrebbero amplificato: su un
  voxel d'acqua i tre bit di superficie sono `WATER_CLASS`, e bassofondo e
  canale coincidono con `habitat` e `industrial` — il mare esposto al bordo del
  mondo si sarebbe messo i condizionatori.
- File: `src/engine/mesher/greedyMesher.ts`,
  `src/engine/mesher/greedyMesher.test.ts`, `src/engine/mesher/microGeometry.ts`,
  `src/engine/VoxelMaterial.ts`, `src/engine/themes/theme.ts`, `src/main.ts`,
  `src/engine/AGENTS.md`, `ROADMAP.md`.

---

## 2026-08-22 — Ciclo giorno/notte (Fase 4.8)

- **Nuovo `src/engine/daylight.ts`**, terzo modello puro accanto a `lighting.ts`
  e `atmosphere.ts`: entra un'ora, esce un'atmosfera. Un giorno di gioco dura
  dodici minuti reali; `?hour=` la fissa, `H`/`Shift+H` la scorre,
  `__voxelHour()` la legge, l'overlay la mostra come orologio.
- **L'atmosfera di un tema è quella di mezzogiorno.** Azimut ed elevazione sono
  il picco, i colori sono il look a sole alto: l'ora li piega, non li
  sostituisce. `nightReach` sta sotto 1 apposta — a uno, tutti i temi avrebbero
  la stessa notte e la firma costruita in 4.7 sparirebbe proprio nelle ore in
  cui la 4.8 vuole che la città si legga.
- **La notte non è una soglia sull'ora, è l'altezza del sole.** Il crepuscolo
  esiste per costruzione — dura quanto il sole impiega ad attraversare quei
  gradi — e non ci sono due tabelle che possano divergere.
- **A sole radente una parete illuminata supera il tetto**, che è il caso da cui
  `SunLight.elevation` mette in guardia. Non si corregge: l'alternativa sarebbe
  raddoppiare l'ambiente di cielo, che slava la scena invece di salvarla. Quello
  che il ciclo garantisce, verificato a ogni ora, è che il tetto non diventi mai
  la faccia **più scura**.
- Di notte la pass d'ombra si salta del tutto: un sole sotto l'orizzonte non
  proietta niente, e disegnarla sarebbe una mappa di profondità buttata via a
  ogni frame.
- **Visto a schermo, corretto a schermo**: le nuvole restavano bianche a
  mezzanotte ed erano la cosa più luminosa dell'inquadratura. `cloudTint` e
  `sunGlow` scendono con il cielo.
- `applyTheme` si è divisa: `applyAtmosphere` riscrive i soli uniform dell'ora,
  e non tocca palette né tone mapping — quelli non c'entrano niente con il
  momento della giornata, e ricompilare un programma a ogni scatto d'orologio
  sarebbe lavoro per niente.
- File: `src/engine/daylight.ts`, `src/engine/daylight.test.ts`, `src/main.ts`,
  `src/ui/DebugOverlay.ts`, `src/engine/AGENTS.md`, `PROJECT_INDEX.md`,
  `.claude/skills/debug-harness/SKILL.md`, `ROADMAP.md`.

---

## 2026-08-22 — Il verde sull'edificio (Fase 4.8)

- **Fioriere, rampicanti e chiome**, tutti sugli slot `grass*` che la palette ha
  già: nessuno slot nuovo, nessun tipo di superficie nuovo.
- **Il verde sulle terrazze non costa un prisma in più.** Cassone tecnico e
  fioriera hanno la stessa forma e cambiano solo indice di palette: è la seconda
  metà dello stesso tiro a scegliere quale, e due su tre sono verdi — una
  terrazza è un giardino con qualche cassone, non il contrario.
- **Il tiro di un rampicante non guarda la quota**, ed è quello che lo rende un
  rampicante invece di una macchia: con un tiro per cella la corsa si
  spezzerebbe a ogni voxel e una parete costerebbe un prisma per cubo. Salgono
  solo sulle facce a nord e a est e si fermano a undici voxel — più su sarebbe
  un giardino verticale, che la città non costruisce.
- Antenne e chiome ora chiedono **tetto scoperto tutt'attorno**: sul filo c'è
  già il parapetto, e una cornice larga un voxel non è una copertura su cui
  posare qualcosa. È anche ciò che tiene i prop fuori dai cornicioni sottili.
- Misura sulla fixture `densityChunk`: 3 320 quad di sola struttura → 4 355 con
  prop e verde (+31%), sotto il tetto di 16 384 che **non** si è alzato.
- File: `src/engine/mesher/microGeometry.ts`,
  `src/engine/mesher/microGeometry.test.ts`, `ROADMAP.md`.

---

## 2026-08-22 — Prop appesi alle giunzioni (Fase 4.8)

- **Sei oggetti che la facciata non aveva**: tende sul fronte strada, insegne a
  bandiera, condizionatori sulle pareti cieche, antenne sui coronamenti, cassoni
  sul bordo degli arretramenti, pilastrini agli angoli d'isolato. Stessa
  `emitRuns`, stesso scratch, **stessa draw call**: nessuna geometria separata.
- **L'aggancio è un predicato, il seme sceglie solo quale cella.** Il fronte
  strada è «c'è un ingresso sotto questa faccia» — cioè il `portal` che
  `onPortal` scrive già sul lato verso la carreggiata; l'arretramento è una
  sommità `roofTech` scoperta con ancora volume di fianco; l'angolo è la cella
  che espone due facce ortogonali della *stessa* facciata. Nessuna posizione
  sparsa a caso sulla parete.
- **`emitBox` porta la superficie**, che non è un tipo nuovo ma uno dei sette:
  un'insegna esce `luminous` e si accende passando dal ramo che il fragment ha
  già, un condizionatore resta `utility`. Invarianti 4 e 5 intatte.
- **`MeshJob` porta l'origine del chunk**, unica coordinata di mondo che entra
  nel mesher: serve solo a seminare la scelta. Con coordinate locali due chunk
  adiacenti arrederebbero le stesse celle e la ripetizione ogni trentadue voxel
  si vedrebbe.
- `emitPoints` accanto a `emitRuns`: un condizionatore sta dentro la sua cella e
  non prosegue, quindi far scoprire a `emitRuns` una corsa di lunghezza uno
  costava tre valutazioni in più del predicato per cella.
- **Il tetto di quad non si è alzato.** Sulla fixture `densityChunk`: 3 320 quad
  di sola struttura, 4 000 con i prop (+20%). La voce che pesava era l'unica che
  pesca su tutta la parete invece che su una giunzione — a 0,09 valeva da sola
  più di tutto il dettaglio strutturale del chunk, e sta a 0,012.
- **Il costo per chunk è stato l'architettura, non solo la verifica.** Misurato
  A/B nello stesso processo sul chunk sci-fi del bench, i prop scritti in modo
  ovvio costavano **+2,2 ms**. Sono scesi a **+0,3 ms** con due cambi: le celle
  di facciata si indicizzano per faccia esposta una volta sola — le interne di
  un edificio pieno sono i due terzi e nessun prop potrà mai usarle — e quella
  scansione legge i quattro vicini con gli indici invece che con la tabella
  degli offset. Il chunk sci-fi passa da ~5,3 a ~6,2 ms, sotto gli 8 ms di
  accettazione.
- Le tabelle di misura in `README.md` **vanno rimisurate a mano**.
- File: `src/engine/mesher/microGeometry.ts`,
  `src/engine/mesher/greedyMesher.ts`, `src/engine/mesher/meshTypes.ts`,
  `src/engine/mesher/mesher.worker.ts`, `src/engine/MesherPool.ts`,
  `src/engine/ChunkRenderer.ts`, `src/engine/mesher/microGeometry.test.ts`,
  `PROJECT_INDEX.md`, `ROADMAP.md`.

---

## 2026-08-22 — La scena `diorama` (Fase 4.8)

- **Un edificio solo, per giudicare il dettaglio senza aspettare la città.**
  Nuovo `src/world/scenes/dioramaScene.ts`: un `SceneGenerator` come gli altri
  tre, che compone un soggetto scelto — uso, livello, tipologia, secondo uso —
  su un basamento minimo. `?scene=diorama&class=&level=&typology=&mixed=`.
- **Non ridisegna niente**: usa la stessa `selectTypology` e la stessa
  `generateBuilding` del Builder. Se il diorama e la città mostrassero due
  edifici diversi, il diorama non servirebbe a giudicare la città. Quello che
  non c'è è il contorno — lotto, opere di terra, aggregazione.
- **Il fronte strada è parte del soggetto.** Il basamento porta prato,
  marciapiede e carreggiata dal lato `FACING.east`, che è il verso con cui lo
  stamp viene generato: tende, insegne e portali si agganciano a quel lato, e in
  mezzo al prato non si giudicherebbero.
- Il perno della camera va a metà dell'altezza dell'edificio invece che sul
  pianoro dell'isola: `targetHeight` è letto una volta sola dal costruttore,
  quindi il soggetto si compone **prima** della camera. Senza, `Q`/`E` facevano
  ruotare l'edificio attorno ai propri piedi e la cima usciva di campo.
- Limite dichiarato: senza città intorno non c'è profilo locale, quindi
  `selectTypology` può solo ripiegare sulla riga senza condizioni dell'uso. Le
  forme che un distretto concede si vedono solo con `?typology=<id>`.
- File: `src/world/scenes/dioramaScene.ts`,
  `src/world/scenes/dioramaScene.test.ts`, `src/world/scenes/cityScene.ts`,
  `src/main.ts`, `PROJECT_INDEX.md`, `.claude/skills/debug-harness/SKILL.md`,
  `ROADMAP.md`.

---

## 2026-08-22 — Atmosfera e separazione delle quote (Fase 4.7)

- **La nebbia integra la quota lungo il raggio invece di valutarla sul
  frammento.** Nuovo `src/engine/atmosphere.ts`, modello puro in TS con il suo
  test in `node` accanto a `lighting.ts`: la densità ha profilo esponenziale in
  altezza e ciò che tinge un frammento è l'integrale lungo il segmento camera →
  frammento, in forma chiusa perché la camera è ortografica. È la differenza che
  fa esistere la fase: a **pari profondità di vista**, due volumi sovrapposti a
  schermo ma a quote diverse ora ricevono veli diversi, perché il raggio che
  arriva in cima a una torre ha attraversato aria rarefatta e quello che arriva
  in strada no. Prima la nebbia separava le distanze e basta.
- Il profilo **non è troncato** sotto `heightBase`: sarebbe l'integrale a tratti
  con il suo punto di attraversamento, e con le altezze di scala in uso venti
  cubi sotto la base valgono `exp(0,1)` — un dieci per cento in più sul fondo
  delle valli, che è la direzione giusta.
- `fog.altitudeLift`, nuovo e dichiaratamente non fisico: un velo di quota che
  **non dipende dalla distanza**, e quindi sopravvive allo zoom ravvicinato dove
  l'integrale è quasi zero. Decade quattro volte più in fretta della nebbia,
  altrimenti velerebbe anche i tetti e non separerebbe niente.
- La curva del gradiente di schermo della nebbia era `screenY` lineare e quella
  del cielo `smoothstep`: due implementazioni della stessa mappatura, divergenti
  proprio all'orizzonte dove i due si toccano. Ora è una sola.
- **Visibilità del cielo cotta nel mesher.** Una fetta di soffitto 34×34×16
  (`buildCeilingSlab`) viaggia col job accanto al volume paddato, e una passata
  per piani dà, per ogni cella, la distanza al primo solido sopra. Due bit per
  faccia entrano nella chiave di merge — così coperto e scoperto non si fondono —
  e nei due bit alti del byte per vertice, che da `aAO` diventa `aShade`: nessun
  buffer nuovo, nessuna pass in più, nessuna draw call in più.
  Nel fragment si occlude la sola metà **cielo** dell'ambiente (`skyOcclusion`
  per tema); il rimbalzo resta pieno, ed è ciò che impedisce a un sotto-ponte di
  diventare un buco nero. Vale a ogni ora e a ogni livello di qualità, al
  contrario dell'ombra del sole, che dipende dall'azimut e a
  `?quality=performance` non viene nemmeno calcolata.
- **Costo misurato, non stimato**: la passata è a costo fisso e non dipende dal
  contenuto. Sulla scena di accettazione il chunk passa da **2,09 a 2,44 ms**,
  sul vuoto da 1,84 a 2,14, su microgeometria da 4,70 a 4,83; rumore e
  scacchiera restano dentro il rumore di misura. La prima versione sondava
  colonna per colonna, con passo di 1156 byte: rifatta per piani, gli array si
  leggono in ordine.
- **La dipendenza fra chunk verso il basso è ora lunga `SKY_PROBE`, non una
  cella.** Una scrittura nei primi sedici piani di un chunk sporca anche quello
  sotto: senza, una campata comparsa dopo il suolo non l'avrebbe mai scurito.
- **L'acqua ha tre risposte invece di una.** Il mesher emette del mare la sola
  faccia superiore, a quota costante e con un unico slot di palette — `waterDeep`
  non è mai visibile — quindi al frammento non arrivava alcun segnale di
  profondità e una pozza aveva lo stesso colore di sedici voxel di mare aperto.
  Nuovo `terrain/waterClass.ts`: la classe si decide dove la profondità esiste
  ancora, cioè alla scrittura, dove vale `seaLevel - top` ed è gratis. Bassofondo
  per profondità, canale se c'è terra a portata su **entrambi** i versi di uno
  stesso asse — una baia con una sponda sola resta mare — mare aperto altrimenti.
  Il sondaggio interroga il campo di quota, che è funzione pura del seed: nessuna
  cucitura al confine fra due chunk.
- La classe viaggia nei **tre bit di superficie** del voxel d'acqua. È un
  sovraccarico dichiarato di un campo esistente e non un nono tipo di superficie:
  i bit sono tutti impegnati (invarianti 4 e 5), nessuno dei sette linguaggi si
  applica a una lastra d'acqua, e il fragment riconosce l'acqua dalla palette
  prima di leggerli — per lei cortocircuita del tutto lo switch delle facciate.
- Le tre risposte: bassofondo con increspatura fitta e la base che vira alla
  tinta del fondale; canale quasi fermo, che tende all'orizzonte; mare aperto con
  onda lunga a due ottave e **riflesso del sole** — un `reflect` e una `pow`,
  perché la normale è +Z e la vista è una direzione sola. La **schiuma di riva**
  non costa un dato nuovo: sulla faccia superiore l'AO per vertice scende
  esattamente dove una colonna vicina è solida al livello del mare, cioè sul filo
  dell'acqua, e basta leggerla al contrario.
- **I sette temi sono stati ritarati, non scalati.** `fog.heightFalloff` cambia
  significato — ora è l'inverso di un'altezza di scala integrata — e passa da
  0,007-0,011 a 0,004-0,0055, cioè da un gradiente che si esauriva nei primi
  trenta voxel a uno nell'ordine dell'altezza dell'edificato della 4.6; le
  densità salgono in proporzione, perché con l'integrale un raggio che scende da
  sopra raccoglie meno foschia di prima a parità di parametri. Nuovi per tema:
  `skyOcclusion`, `fog.altitudeLift`, e `water.shallowTint`/`calm`/`glitter` sui
  quattro temi che l'acqua ce l'hanno già.
- **Non ricompila niente e non aggiunge draw call**: tutto è uniform, e il test
  che confronta i sorgenti stringa per stringa attraverso un cambio di tema resta
  verde senza modifiche.
- Le tabelle di misura in `README.md` e `src/sim/README.md` **non** sono state
  toccate: sono verificate a mano su questa macchina.

## 2026-08-21 — Gerarchia verticale della città (Fase 4.6)

- **Nuovo dominio** `src/world/skyline/`: `config.ts`, `tiers.ts` e il loro test.
  Risponde a una domanda che prima non esisteva — **fin dove una colonna può
  salire** — a partire da distanza dai poli, dal mare e dal bordo dell'edificato.
  Puro come `sites/` e `grading/`: quello che serve del luogo entra come numero,
  quindi il dominio si verifica in `node` senza mondo e senza terreno.
- **La desiderabilità dice *se*, la gerarchia dice *fin dove*.** Le due
  condizioni stanno affiancate in `Builder.upgradePass`, non una al posto
  dell'altra. Il campo è un `Uint8Array` che satura a 255 e l'ultima soglia sta a
  198: oltre quel punto non *distingue* più due colonne del centro, e alzare il
  tetto senza la gerarchia avrebbe dato un altopiano più alto invece di uno
  skyline. `upgradeThreshold` resta perciò lungo sette voci e si legge con
  `upgradeThresholdOf`, che ripete l'ultima.
- Tre fasce — costa e periferia, intermedia, centro — più un **cono** verso il
  polo e un **livello in più a un isolato ogni sette**, eletto da un hash del suo
  indice. Il livello massimo esce solo dalla somma dei tre, quindi i picchi sono
  rari per costruzione e non per fortuna; un test verifica che quella somma
  coincida esattamente con `BUILDER.maxLevel`.
- **I tre tetti, rotti insieme.** `maxLevel` da 6 a **12**, `LEVEL_CAPS` da 7 a
  13 voci (fino a diciannove fasce), `maxDirtyChunksPerBuilding` da 24 a **40** —
  aritmetica sul caso peggiore, `2 × 2 × 7`, non margine — e `GRAMMAR.minBandSide`
  da 2 a **4**, senza il quale una catena di rientranze riduceva a un palo i due
  terzi superiori della torre. Un civico di livello massimo passa da ~70 a **152
  voxel**, cioè sopra `TERRAIN.maxHeight`.
- **Un difetto latente, corretto prima che mordesse**: `startLevel` scorreva
  `START_LEVEL_CDF` fino a `maxLevel` invece che fino alla lunghezza dell'elenco.
  Erano lo stesso numero per caso; alzando `maxLevel` il confronto diventava
  `roll < undefined`, falso a ogni giro, e **ogni edificio sarebbe nato al livello
  massimo**. Ora l'elenco ha una voce per livello e un test verifica la lunghezza
  di entrambe le tabelle indicizzate per livello.
- Il contratto di proporzione **è cambiato e non allentato**: la punta passa da
  dieci a uno a diciannove a uno. A otto voxel di lato non c'è altra forma
  possibile, e `MAX_FOOTPRINT` non può salire senza allargare `STREETS.pitch` —
  l'isolato più stretto è largo quattordici colonne. Il test lo dice invece di
  tacerlo.
- Ritarati sulla città alta: `targetHeight` della camera da 12 a 24 (stava
  **sotto** il livello del mare), lo `spanZ` dell'inquadratura d'apertura da 240 a
  320, e la nebbia di quota di **tutti e sette i temi** — `heightFalloff` è
  l'inverso di un'altezza, e a 0,025 spendeva tutta la prospettiva aerea nel primo
  quinto dell'edificato.
- `BuildingRegistry.countWithinRadius` accanto a `withinRadius`, con la scansione
  condivisa: costruire l'array per leggerne la lunghezza era, misurato, **metà del
  costo della passata di upgrade**. Con quello e con `waterDistance` senza
  allocazioni la gerarchia è tornata gratis.
- Misura, su isola vera 256×256, un polo a raggio 96, 500 tick e 334 edifici: i
  tick di upgrade hanno mediana **9,4 ms**, la stessa che si misura con la
  gerarchia spenta (9,5 ms) e con il tetto riportato a sei (10,7 ms) — **il costo
  è della passata, non di questa fase**, e supera i 3 ms di budget come già fa
  `nextBuildSites`. Le tabelle di misura in `README.md` e `src/sim/README.md`
  restano da rimisurare a mano.
- **Il franco delle campate resta a due cubi.** La 4.5 lo aveva rimandato qui;
  misurato, alzarlo costa i due terzi delle campate (11 → 4), perché la stessa
  fase che alza il centro **abbassa la periferia**. Il debito passa alla 4.9.

## 2026-08-21 — Rete urbana in quota (Fase 4.5)

- **Nuovo dominio** `src/world/spans/`: `config.ts`, `spanPlan.ts`,
  `plazaPlan.ts`, `generate.ts`, `network.ts` e i loro test. La prima struttura
  del progetto che **non poggia a terra**. Puro come `grading/` e `sites/`: ciò
  che serve del luogo entra come predicato, quindi il gate della fase si verifica
  in ambiente `node` senza mondo.
- Una campata è **un record con un flag**, sulla strada della 4.12: `span` dice
  quale generatore la disegna, `supports` con chi. L'unica cosa nuova è che **non
  prende suolo** — il registry sdoppia l'indice per colonna, `columns` per
  `overlaps` e `groundColumns` per `isOccupied`, e sotto un ponte restano la
  carreggiata e il lotto. Al suolo vince l'edificio: una campata attraversata da
  una costruzione nuova cade.
- **Atterra dove il corpo c'è, non al filo dell'impronta.** Gli edifici sono
  piramidali e la parete al bordo esiste solo nella fascia zero: cercare
  l'appoggio lì dava zero campate su 6 911 coppie. Ora la ricerca rientra verso
  il centro, e la campata sporge sopra le fasce basse dei propri appoggi — da cui
  l'`except` di `overlaps`.
- **La rete è un albero**: vince la campata che unisce due componenti separate, e
  i cicli non si costruiscono. Il gate — un percorso continuo fra due isolati che
  non passa dal suolo — diventa una conseguenza della regola, e `network.ts` tiene
  insieme la decisione e la sua verifica.
- Sezione in tre righe — travi, carreggiata, parapetto — con la mensola piena
  alle testate: ciò che regge si vede. Il parapetto arriva da `emitRoofTech` come
  per le terrazze della 4.3, quindi **il mesher non è stato toccato** e non c'è
  nessuno slot di palette né tipo di superficie in più.
- **Piazze in quota** sul cuore che la 4.1 aveva chiuso apposta, rette da tre o
  più edifici su lati diversi, con il verde al centro sugli slot `grass*`.
- **Chiuso il debito della 4.12**: `Growing` porta un'ancora invece di un record,
  `sliceStamps` ritaglia gli stamp grandi e la coda `pending` ne fa comparire uno
  per volta per struttura. `LANDMARK.maxDirtyChunks` sparisce — moli e piste
  rispettano il tetto di ogni altra struttura.
- Misura: i tick con `spanPass` (uno su venti) hanno mediana **3,9 ms** e p95
  6,8 ms; gli altri restano a 0,001 ms di mediana. Il tick di passata **supera i
  3 ms** di budget e va detto. Le tabelle di misura in `README.md` e
  `src/sim/README.md` restano da rimisurare a mano.

## 2026-08-21 — Una vista si può chiudere (Fase 4.13)

Le guide dicevano *dove* è puntata la lente. Restava aperto il resto: entrati in
una vista, il picker si chiude e il toast si spegne dopo due secondi, e da lì in
poi non c'era **nessuna superficie** che dicesse cosa si stava guardando, quali
tasti valessero lì dentro e — soprattutto — come tornare indietro. Uscire si
poteva già: `V` fino a completare il giro delle cinque viste, oppure riaprire il
picker e scegliere Normal. Nessuna delle due era scritta da qualche parte, e la
prima chiede di attraversare tre viste che non si volevano vedere.

- **Nuova targa in alto a sinistra** (`ViewBarModel` in `ViewMenuModel.ts`, dipinta
  da `GameHud`). Resta a schermo finché una vista è accesa e risponde alle tre
  domande che sopravvivono al gesto che l'ha aperta: nome della vista, gesto che
  la punta, tasti che valgono **in questa vista**. Due bottoni: *Change view*
  riapre il picker, *Exit view* riporta la città intera.
- **I tasti sono contestuali.** `[` e `]` compaiono solo in Levels, `Q`/`E` solo
  in Cutaway: elencarli sempre riporterebbe il difetto della card d'aiuto, che
  pubblicizzava `[` come scorciatoia globale dove non muoveva niente. X-ray e
  Block focus non ne hanno, e il vuoto è un fatto — si guidano col cursore.
- **`Escape` esce dalla vista**, per ultimo. Era una decisione esplicita che non
  lo facesse — «una vista non è un pannello aperto sopra il gioco» — e regge solo
  finché esiste un'altra uscita ovvia, che non esisteva. Resta dopo lo strumento
  perché con un catalizzatore in mano il toast promette già "Esc to cancel", e
  dopo i pannelli: il primo colpo toglie ciò che copre, il secondo ciò che
  nasconde.
- La card d'aiuto e la riga di `Esc` dicono la stessa cosa; il pannello di debug
  delle viste scende sotto la targa, che occupava lo stesso angolo.

## 2026-08-21 — Le viste dicono dove sono puntate (Fase 4.11 / 4.13)

Il motore della 4.11 c'era per intero e apriva davvero la città; quello che non
c'era è **la spiegazione a schermo di cosa stesse facendo**. Tre viste su quattro
si agganciano alla colonna sotto il cursore e nessuna lo diceva: si sceglieva una
vista, compariva un riquadro retinato con il bordo netto da qualche parte, e non
c'era modo di collegare le due cose. Nessuna uniform nuova, nessun modo nuovo,
nessuna ricompilazione in più.

- **Nuovo**: `src/engine/InspectGuides.ts`. Le linee che dicono dove è puntata la
  lente — contorno del riquadro, carreggiata su cui cade la sezione, mirino con
  asta sulla colonna a fuoco. Vive accanto a `InfluenceOverlay` e ne segue le
  regole: fuori dalla profondità, buffer di dimensione fissa riscritti in posto,
  nessuna geometria voxel. Il rettangolo che disegna **è** quello delle uniform
  già composte e non un secondo calcolo, quindi contorno e retino non possono
  divergere.
- **Il bordo del riquadro sfuma** (`INSPECT.feather`). Il predicato era un
  gradino: il retino cominciava su una riga di voxel allineata agli assi, e a
  schermo quel bordo leggeva come un artefatto invece che come una lente. La
  rampa è una moltiplicazione sulla densità che c'era già — niente colore nei
  vertici, niente mesher — ed è inerte dove il rettangolo è aperto, quindi la
  fetta e la sezione restano il taglio netto di prima.
- **`modeHasLevel` separa due domande che erano una sola.** `modeCuts` diceva sia
  «taglia?» sia «ha una quota?», e le due divergono su Cutaway: la sezione taglia
  ma non guarda `sliceZ`, quindi la barra dei livelli compariva anche lì e si
  trascinava a vuoto. `modeCuts` resta la regola che chiude un taglio quando si
  prende uno strumento.
- **`[` e `]` valgono solo dentro Levels.** Fuori non muovevano niente di
  visibile e intanto **armavano** la quota, così che una fetta aperta dopo
  partisse da un numero assoluto invece che dal suolo davanti — talvolta dentro
  la collina. Adesso da un'altra vista aprono Levels e basta: il primo colpo
  mostra il piano, il secondo lo muove. Per lo stesso motivo il ri-armo scatta
  uscendo da Levels e non solo tornando alla città intera.
- **Ogni vista dice come si punta**, non solo cosa mostra: `ViewOption.gesture`,
  reso nel picker, nel toast di `V` e nella card di aiuto. Ci finisce anche il
  fatto che la finestra dei raggi X è larga `xraySpan` colonne di *mondo* — a
  inquadratura larga sembra non fare niente, e non è un numero da alzare.
- **La card di aiuto nomina le quattro viste** e il pulsante *Views*, invece
  della sola riga «V · Look inside the city». Le righe sono derivate da
  `ViewMenuModel`, non riscritte: due elenchi paralleli divergono al primo
  cambio.

## 2026-08-21 — Isolati terrazzati e cluster verticali (Fase 4.4)

- **Un cluster è due numeri su un record, non un'entità.** Gli edifici adiacenti
  dello stesso fronte condividono la quota — che era già `baseZ` — e l'altezza
  del corso di base, che è `baseBand`; `cluster` dice solo con chi. Non esiste
  nessuna struttura che sopravviva ai membri, quindi collisione, budget di chunk
  e cancellazione restano quelli di un edificio solo, e `src/sim/` continua a
  contare un edificio per record senza sapere che gli isolati esistono.
- **Nuovo**: `src/world/buildings/cluster.ts` (+ test). Puro come `grading/` e
  `sites/`: entrano un `GradePlan` e i termini dei vicini, esce una terna. Un
  lotto entra in fila solo se non deve *scendere* per allinearsi — «si riempie,
  non si scava» vale anche qui — e se il riempimento resta dentro
  `CLUSTER.maxJoinFill`. Chi non entra apre una fila propria: il rifiuto è il
  gradino, ed è così che su un fianco l'isolato terrazzato esce dalla regola
  invece di essere disegnato.
- **Il corso di base è un campo, non un ramo.** `generateBuilding` guadagna
  `baseBandHeight`, che sostituisce l'altezza della sola fascia zero **dopo** il
  tiro: la sequenza del PRNG resta quella, quindi entrare in una fila cambia la
  quota di un edificio e non la sua sagoma. Sopra lo zoccolo condiviso
  l'arretramento che `forcedOp` già produceva cade alla stessa altezza su tutta
  la fila — cornice terrazzata continua senza una voce nuova nella grammatica,
  senza toccare `supported` e senza toccare il mesher.
- **La contiguità diventa deliberata.** L'impronta si accosta al vicino lungo il
  fronte con la stessa logica con cui già si accostava alla carreggiata, entro il
  riquadro dell'isolato: fra due case in fila un solco da un voxel legge come
  crepa, non come separazione. A superare il tetto d'impronta è quindi la massa,
  mentre ogni record resta sotto `MAX_FOOTPRINT`.
- **Il basamento si guadagna, la quota no.** La fila condivide sempre il piano;
  il corso di base compare solo sopra `CLUSTER.minDensity`. La soglia è misurata:
  un catalizzatore solo porta la densità locale a 0,30 e non oltre, tre campi
  sovrapposti a 0,37 di mediana — a 0,35 lo zoccolo è il linguaggio di un centro
  vero e non di una casa sparsa.
- `BuilderStats.clustered` conta gli edifici che stanno in fila, e l'overlay
  tecnico lo mostra accanto a `rejected`: è il numero con cui si verifica il gate
  senza guardare a occhio.
- Misura su 256×256, quattro catalizzatori a raggio 60, 300 tick: `onTick` ha
  mediana **0,022–0,025 ms** e p95 **3,0–3,5 ms**, con 372 edifici di cui **344
  in fila**. La sola spesa aggiunta è la seconda generazione dello stamp dove la
  fila ha un basamento — 27 µs per chiamata, ~0,08 ms su un tick di infornata — e
  niente entra nel ciclo di frame. Le tabelle di misura in `README.md` e
  `src/sim/README.md` restano da rimisurare a mano.

## 2026-08-21 — Le viste diventano un gesto di gioco (Fase 4.13)

- **Il vincolo rovesciato.** La 4.11 aveva costruito il motore delle quattro
  viste e l'aveva chiuso dietro `?debug=1`, scrivendo nella roadmap che era «uno
  strumento dell'harness, non una modalità di gioco». Era la scelta sbagliata:
  guardare dentro la propria città non è una verifica tecnica, è il modo in cui
  una città densa si gode. Il motore non è stato riscritto — nessuna uniform
  nuova, nessun modo nuovo, nessuna ricompilazione in più.
- **Il comando.** Pulsante *Views* nel dock, fra Policies e il tema: da lì in poi
  i bottoni non cambiano la città, cambiano come la si guarda. Il picker elenca
  le cinque viste con la riga che dice **cosa si va a vedere**; `V` le cicla
  senza `?debug=1` e lo annuncia con un toast che si spegne da solo, perché è
  l'unico percorso cieco. `[`/`]` e `PageDown`/`PageUp` muovono la quota, con
  `Shift` per un piano intero.
- **La barra dei livelli**, sul bordo sinistro, compare solo dove c'è una quota da
  muovere. Sta fuori dal picker e non dentro: cercare il piano giusto è un gesto
  continuo, e un pannello aperto coprirebbe quello che si sta cercando di
  leggere.
- **Il fuoco si aggancia.** Era il difetto che rendeva le viste inusabili da
  giocatore: seguendo il cursore un frame alla volta, bastava portare il mouse
  sul dock — o vedersi aprire una carta evento — per far saltare la vista a metà
  città. Ora le viste seguono il cursore finché è sulla canvas e **tengono
  l'ultima colonna** quando esce. Il ripiego sul centro dell'inquadratura resta,
  ma solo quando non c'è ancora niente di agganciato: serve a `?inspect=` da URL.
  Cambiare vista libera l'aggancio, o rientrando ci si ritroverebbe puntati
  sull'isolato di dieci minuti prima.
- **Prendere uno strumento chiude un taglio.** Con Levels o Cutaway attivi il
  terreno vero sotto il cursore è nascosto e si piazzerebbe alla cieca. Le viste
  a velo sopravvivono, perché lì il suolo si legge ancora sotto il retino. Il
  motivo si legge **accanto** all'istruzione dello strumento e non al suo posto:
  un toast normale avrebbe coperto "click the island to place it", che è proprio
  ciò che serve dopo aver scelto un catalizzatore.
- **La quota si ri-arma** tornando alla città intera: una fetta riaperta riparte
  dal suolo che si sta guardando invece che da una quota scelta mezz'ora prima,
  che nel frattempo può essere finita sottoterra. Solo `?slice=` resta fisso.
- Nomi tecnici e etichette restano due cose distinte: `off`/`xray`/`slice`/
  `section`/`block` sono identificatori — parametro URL e referto tecnico — e
  *Normal*, *X-ray*, *Levels*, *Cutaway*, *Block focus* sono ciò che si legge in
  un dock. Le etichette vivono in `src/ui/ViewMenuModel.ts`, puro e testato in
  `node` come `GameHudModel.ts`.
- `modeCuts(mode)` in `inspect.ts` affianca `isCut(uniforms)`: stessa domanda un
  passo prima, per chi deve decidere senza uno stato completo. Un test le tiene
  d'accordo su tutti e cinque i modi — divergerebbero in silenzio, e la barra dei
  livelli comparirebbe dove non c'è quota da muovere.
- `InspectOverlay` resta intero come **referto tecnico** (colonna a fuoco, id
  dell'isolato, densità del retino, nota sulle ombre). Le due superfici chiamano
  le stesse `setInspectMode` / `setInspectSliceZ`.
- Verificato a schermo alla radice, senza `?debug=1`, su una città di ~2.000
  residenti: le cinque viste rispondono a `V` e dal picker, `Esc` chiude il
  picker **senza** spegnere la vista, la barra si trascina e risponde ai tasti,
  l'aggancio tiene la colonna `315,233` quando il puntatore esce e riprende a
  seguire quando rientra. Worker del mesher fermo a 8,64 kB.

## 2026-08-21 — L'isola compare in un secondo

- **Il difetto da cui è partita.** Avviando il gioco si restava mezzo minuto
  davanti a un cielo vuoto con "Preparing the city…" e una lingua di terreno. Il
  lavoro vero, misurato, era di **tre decimi di secondo**: il resto era attesa.
  Due cause distinte, entrambe corrette.
- **Il mondo si scrive a corse, non a celle.** Un'isola 512×512 sono 5,4 milioni
  di voxel, e ognuno passava da `setBlock` pagandosi conversione di coordinate,
  confronto sulla cache del chunk, pack del byte e sei controlli di bordo con la
  relativa chiave di stringa — per una colonna di terreno, che è per definizione
  un tratto contiguo dello stesso colore. Nuova `VoxelWorld.fillColumn`: dentro
  il chunk resta un indice che avanza di un piano alla volta, e tutto il resto si
  paga una volta per corsa. Una colonna è **cinque scritture** invece di trenta:
  tre strati di terreno più due d'acqua. Misurato sulla stessa isola nello stesso
  processo, **947 ms → 354 ms**.
- Il taglio degli strati esce da `STRATA_DEPTH`, derivato dagli stessi numeri di
  `TERRAIN` che legge `paletteForDepth`: è la stessa regola letta a tratti invece
  che per voxel, e un test la confronta voxel per voxel sull'isola vera.
- **Il budget di 1,5 ms protegge un frame di gioco, e durante il caricamento non
  c'è gioco da proteggere.** Misurato a quel ritmo, un lavoro da tre decimi di
  secondo costa centinaia di frame — e ogni frame in più è anche una
  rimeshatura in più, perché un chunk scritto a metà viene ricostruito a ogni
  frame che lo lascia incompleto. `main.ts` usa `LOADING_FRAME_BUDGET_MS` (12) e
  `LOADING_GENERATION_BUDGET_MS` (9) finché la prima scena non è a terra: sotto
  il frame a 60 Hz, così l'isola compare scorrendo invece di apparire dopo uno
  schermo bloccato. La finestra si chiude su `generator.done` e non si riapre —
  le espansioni avvengono dentro una città viva e tornano ai 3 ms.
- Misurato in Chromium sulla stessa macchina, dal `load` a `generationDone`:
  **13,7 s → 5,9 s** con rendering software. Su GPU vera il frame costa una
  frazione di quello, e il caricamento è dominato da `workerMs`.
- Tocca `world/VoxelWorld.ts`, `world/chunkCoords.ts` (`CHUNK_AREA`),
  `world/terrain/biomes.ts`, `world/terrain/IslandGenerator.ts` e `main.ts`.

## 2026-08-21 — I catalizzatori diventano strutture (Fase 4.12)

- **Il difetto da cui è partita.** Il porto non esisteva: quello che si vedeva
  sull'acqua era la **carreggiata dell'isolato costiero**. `groundKindOf`
  classifica `shore` ogni colonna d'acqua entro `maxQuayDepth`, quindi
  `rampAround` portava l'intero anello di strada a `quayLevel` e ne costruiva il
  muro fino al fondale — una piattaforma rettangolare cava in mezzo al mare, che
  nessuno aveva progettato. Tutti e otto i ruoli, intanto, condividevano lo
  stesso rombo di asfalto di raggio quattro e si distinguevano per il colore di
  un voxel.
- **Nuovo**: `GRADING.quayReach` e `isDryLand` in `world/grading/`. Una banchina
  è il bordo costruito della terra: `maxQuayDepth` dice fin dove il fondale
  *regge*, questo dice fin dove ha *senso*. Il Builder lo applica sia all'anello
  di carreggiata sia ai lotti, così non nascono più né strade né edifici su un
  pad isolato al largo. Un test lo verifica sull'isola vera, colonna per colonna.
- **Nuovo dominio**: `src/world/landmarks/` — `parts.ts` (sette primitive:
  `slab`, `shell`, `mast`, `boom`, `colonnade`, `steps`, `deck`), `config.ts`
  (ogni numero e le otto ricette) e `generate.ts` (composizione, rotazione,
  stadio). Le parti sono **dati**, quindi un test ne misura l'ingombro senza
  disegnarle e una ricetta si ruota trasformando numeri.
- **Un landmark è un edificio con un altro generatore.** Entra nel registry come
  `BuildingRecord` con `landmark` valorizzato, e da lì eredita occupazione,
  collisione, budget di chunk, comparsa a budget e avanzamento: l'unico ramo
  nuovo nel Builder è quale generatore disegna lo stamp. Nessuna passata in più,
  nessun secondo indice, nessuno stato nuovo.
- **Lo stadio è ciò che la città ha costruito intorno**, non la desiderabilità:
  il numero di record entro il raggio del catalizzatore. Un catalizzatore siede
  al centro della propria influenza e il campo lì è quasi sempre saturo — un
  landmark che lo leggesse salterebbe tutti gli stadi al primo tick. È il modello
  dei monumenti di Anno 1800, una costruzione a fasi che corona una città *già
  edificata*, detto con il solo dato che il Builder possiede.
- Gli stadi sono **cumulativi dentro un ingombro riservato per intero al
  piazzamento**. Ne seguono due garanzie: un landmark non può restare bloccato a
  metà da un edificio spuntato accanto, e la sagoma dello stadio precedente non
  ha mai niente da cancellare — un test lo verifica come invariante.
- **Ritorno alla simulazione, lieve**: ogni stadio aggiunge
  `BALANCE.gameplay.catalyst.stageBonus` (8) all'intensità del catalizzatore, via
  `setCatalystStrength`, che esisteva già. Su un campo che satura a 255 e basi
  fra 185 e 215 è un margine, non una seconda leva. `src/sim/` continua a non
  sapere che i landmark esistono (invariante 7).
- `BuildingRecord` guadagna `footprintY` opzionale: molo, pista e viadotto sono
  lineari per natura, e schiacciarli in un quadrato li farebbe leggere come
  monconi. Gli edifici restano quadrati per contratto.
- **Due difetti trovati dai test, entrambi reali.** I pilastri di `colonnade`
  contavano il passo da un capo solo, quindi una ricetta non era invariante per
  rotazione dove due parti si sovrappongono. E le prime ricette erano larghe
  sedici voxel — quasi un isolato: seppellivano la sovrapposizione fra due
  catalizzatori, cioè esattamente il punto dove nascono gli usi misti, e a dirlo
  è stato un test di fase 3 già esistente. Ora dodici, una volta e mezza
  l'impronta massima di un edificio.
- 507 test verdi, `npm run build` pulito, i due worker invariati. **Le tabelle di
  misura in `README.md` e `src/sim/README.md` vanno rimisurate a mano**:
  `stageBonus` entra in `balance.ts`.

## 2026-08-21 — Vedere dentro la città (Fase 4.11)

- **Nuovo**: `src/engine/inspect.ts` (+ test) e `src/ui/InspectOverlay.ts`.
  Quattro viste di ispezione dell'harness — `xray`, `slice`, `section`, `block` —
  su `V`, sul parametro `?inspect=` e sul pannello. La decisione (quale modo, a
  che quota, su quale isolato) è una funzione pura verificata in `node`, come
  `lighting.ts`; nel materiale entrano solo i numeri che ne escono.
- Il materiale unico guadagna **due predicati geometrici e una densità**:
  `uInspectPlane`, `uInspectRect`, `uInspectInside`, `uInspectVeil`. Nascosto =
  oltre il semipiano **e** dal lato giusto del rettangolo; l'azione è un retino
  ordinato 4×4 su `gl_FragCoord` con `discard`. Velare e tagliare sono la stessa
  manopola: a densità 1 il retino scarta ogni pixel. `transparent` resta `false`,
  nessun ordinamento, nessuna geometria e nessuno slot di palette in più.
- Il `discard` entra nel sorgente **solo alla prima vista attivata**: una
  ricompilazione per sessione, e chi non usa le viste non paga l'early-Z perso.
  Un taglio porta `side` a `DoubleSide` e si tappa dalle back-face con
  `gl_FrontFacing`, che è anche l'unica ragione per cui non si vede il cielo
  attraverso un volume tagliato — l'interno resta un guscio vuoto, perché il
  mesher non emette facce interne.
- Finché un taglio è attivo le **ombre proiettate si spengono**: la shadow map non
  sa del taglio, e il piano appena scoperto resterebbe all'ombra di quelli che si
  sono nascosti. Sole e ambiente restano, quindi le facce continuano a leggersi.
- **Nuovo**: `nearestLine` in `world/streets/streetGrid.ts` e su `StreetNetwork`.
  È ciò che fa cadere la sezione su una carreggiata invece che su un piano
  arbitrario, e mostra il fronte degli isolati invece di affettare i volumi.
- La colonna a fuoco si risolve **una volta per frame** e non a ogni
  `pointermove`; senza puntatore ripiega sul centro dell'inquadratura, così una
  vista aperta da URL vale qualcosa anche prima che il mouse entri nella canvas.
- Misurato su una città di ~490 edifici: geometria, chunk con mesh e voxel solidi
  **identici** con ogni vista attiva e dopo un cambio di tema; il worker del
  mesher resta 8,64 kB. Le tabelle di misura in `README.md` e `src/sim/README.md`
  non sono toccate: questa fase non entra né nel mesher né nella simulazione.

## 2026-08-21 — Grammatica verticale degli edifici (Fase 4.3)

- Le trasformazioni della regola di fascia diventano una tabella, `BAND_OP`, e il
  repertorio — quali voci provare, in che ordine — vive in `ClassProfile`, quindi
  una riga di catalogo può ridefinirlo senza plumbing. Sparisce l'ultimo caso
  speciale del ciclo delle fasce: il basamento è `keep` ripetuto. Due operazioni
  nuove, `setback` (arretramento da due voxel) e `stack` (corpo sovrapposto, che
  si esaurisce da sé quando il risultato scenderebbe sotto `MIN_FOOTPRINT`).
- Il coronamento passa da booleano a `CROWN_KIND` con cinque cime — `taper`,
  `flat`, `stepped`, `ridge`, `lantern`. `paint` riconosce il coronamento da
  `crownStart` e non più dalla posizione in coda, che ammetteva una sola fascia.
  La distinzione per uso sta nei quattro ripieghi del catalogo, quella per
  livello nel `minLevel` delle righe nuove.
- **Terrazze praticabili e giardini pensili** sulle rientranze che la grammatica
  già produceva: l'anello scoperto passa a `SURFACE_KIND.roofTech` e riceve il
  parapetto da `emitRoofTech` senza che il mesher venga toccato; con
  `roofGarden` il cuore dell'anello prende gli slot `grass*`. Nessuno slot di
  palette e nessun tipo di superficie in più.
- Gli accenti luminosi si accendono per livello (`GRAMMAR.luminousFromLevel`,
  `luminousFullLevel`): niente insegne su una casa appena costruita, una riga per
  piano a metà scala, la lama intera in alto. In `VoxelMaterial.ts` il bagliore
  del ramo `luminous` tinge con lo slot del voxel invece di essere sempre
  `glassPale`, così un'insegna d'ottone non brilla come una spina civica.
- Quattro righe nuove di catalogo — `skyTerraces`, `terraceArcade`,
  `stackedWorks`, `civicLantern` — che usano i tre criteri dichiarati e mai
  usati: `minWealth`, `minSatisfaction`, `minIndustry`. `typology.ts` non è stato
  toccato.
- Corretto un difetto preesistente che la fase ha reso visibile: una catena di
  rientranze portava la cima a un voxel e la torre finiva a punta di spillo.
  `GRAMMAR.minBandSide` è un pavimento nel filtro delle candidate; il coronamento
  può assottigliarsi oltre, il corpo no.
- Misura A/B su un chunk di sedici edifici veri: i quad di dettaglio **calano da
  6 810 a 5 015** (−26%), quindi il margine sotto `MAX_DETAIL_QUADS_PER_CHUNK`
  cresce. Le tabelle di misura in `README.md` e `src/sim/README.md` restano da
  rimisurare a mano.

## 2026-08-20 — `996bc3e` — Calibrazione del terreno, cursore di piazzamento

- **Nuovo**: `src/engine/PlacementCursor.ts` (+ test). Il segnaposto sotto il
  puntatore — base, mirino, onda e fascio — disegnato sempre sopra la scena ed
  escluso dalla pass di profondità, con stato valido/rifiutato distinto.
- Ricalibrati soglie, frequenze e stratigrafia in `world/terrain/config.ts`,
  `biomes.ts`, `decor.ts` e la maschera radiale di `heightField.ts`; il margine
  di Lipschitz resta la rete di sicurezza della calibrazione.
- Ritocchi coordinati a `world/streets/` (config, `lots.ts`, `streetGrid.ts`),
  `world/grading/config.ts`, `world/buildings/` (config e `generate.ts`) e ai
  coefficienti della simulazione.
- `InfluenceOverlay` e `IsoCameraController` allineati al nuovo cursore.
- Entra `shotkit.config.mjs` con gli scatti di riferimento in `.shots/`.

## 2026-08-20 — `c550104` — Opere di terra (Fase 4.2)

- **Nuovo modulo** `src/world/grading/`: `config.ts`, `grade.ts` e il suo test.
  Risponde a «cosa serve *costruire* perché questo pezzo di terreno regga un
  piano» invece che a «questa colonna è già piana?»: classifica la colonna
  (`flat`, `sloped`, `shore`, `rock`, `refused`), la pesa, progetta terrapieno o
  banchina. **Si riempie, non si scava** — un'opera aggiunge volume e non ne
  toglie mai. Recupera circa metà della terra emersa, che prima veniva scartata.
- Il `Builder` passa dal piano di opera prima di scrivere voxel; le azioni di
  gioco usano `BUILD_WEIGHT` per il costo del sito.
- **Nuova skill** `/debug-harness`: parametri URL, hotkey e hook globali escono
  dai file caricati sempre. `AGENTS.md` diventa la fonte unica di comandi,
  convenzioni, contratti, budget e definizione di "finito"; `CLAUDE.md` resta un
  puntatore.

## 2026-08-20 — `62798d5` — Scheletro stradale (Fase 4.1)

- **Nuovo modulo** `src/world/streets/`: `config.ts`, `streetGrid.ts`,
  `lots.ts`, `StreetNetwork.ts` e due test. La rete esiste **prima** degli
  edifici e ne orienta la crescita; è una funzione pura di `(seed, x, y)`,
  quindi non ha stato da salvare né da aggiornare quando arriva un
  catalizzatore. Il ritaglio sulla forma dell'isola avviene a valle.
- Il `Builder` allinea l'edificio al fronte strada, verifica il verso di
  affaccio e l'occupazione dell'isolato prima di piazzare l'impronta.
- `PIANO_GRAFICA.md` rimosso: il suo contenuto è confluito in `ROADMAP.md`.

## 2026-08-20 — `61f3756` — Porta del dev server

- `scripts/free-port.mjs` agganciato a `prestart` e `predev`: libera la porta
  terminando le istanze node rimaste da una sessione precedente.

## 2026-08-20 — `08e7b80` — Ciclo commerciale, tipologie, sole e post-processing

- **Nuovo**: `src/sim/commerce.ts` (+ test). Il ciclo commerciale interno passa
  per tre strozzature indipendenti — banchi, personale, merce — così che la
  città mercantile e quella industriale restino due economie distinguibili.
- **Nuovo**: `src/world/buildings/typology.ts` e il catalogo `TYPOLOGIES` in
  `buildings/config.ts`. La tipologia si sceglie dal luogo, senza numeri sparsi
  nel generatore: stesso luogo, stessa tipologia.
- **Nuovo look**: `engine/lighting.ts` (modello di luce in TS puro, tenuto
  allineato al GLSL da un test), `engine/SunShadow.ts` (shadow map ortografica
  agganciata ai texel) ed `engine/PostProcessing.ts` (bloom, tilt-shift, tone
  mapping in `OutputPass`). Tutti i temi si adeguano.
- Quarto uso urbano nel contratto di `sim/classes.ts`, con `sim/uses.test.ts` a
  presidiarne ordine, influenze e uso misto.

## 2026-08-19 — `f233321` — Microgeometria nel mesher

- **Nuovo**: `engine/mesher/microGeometry.ts` (+ test). Prismi a 1/16 di voxel
  accodati al greedy pass, con facce nascoste eliminate, testate condivise,
  priorità e limite per chunk.

## 2026-08-19 — `16e7073` — Distretti, decisioni, commercio esterno

- **Nuovi** in `src/sim/`: `catalysts.ts` (i sette ruoli con vettore di
  influenza), `districts.ts` (profili locali e specializzazioni da campi
  sovrapposti), `decisions.ts` (scelte periodiche deterministiche) e `trade.ts`
  (import/export sbloccato dal porto).
- **Nuovo**: `world/visualBlock.ts` (+ test) — palette e superficie impacchettate
  nello stesso byte.
- Grammatica di superficie negli edifici, con `buildings/urbanForm.test.ts` a
  verificare che la forma vari in modo deterministico dal profilo locale.

## 2026-08-19 — `d38e7af` — Cozy HUD, qualità adattiva, cielo

- **Nuova interfaccia giocabile**: `ui/GameHud.ts`, `ui/GameHudModel.ts` (view
  model puro, testabile in Node), `ui/hud.css` e `ui/hudIcons.ts` sostituiscono
  `ui/GameToolbar.ts`. Gli overlay tecnici passano dietro a `F3`/`?debug=1`.
- **Nuova qualità adattiva**: `engine/FrameTiming.ts` misura gli intervalli rAF
  (fps, vero uno percento peggiore, p95/p99, jank) ed `engine/RenderQuality.ts`
  ne deriva pixel ratio e profilo di effetti con una sola isteresi — ombre,
  bloom e tilt-shift scendono insieme invece di litigarci. Parametro `?quality=`.
- **Nuovo**: `engine/SkyBackground.ts` — quad in NDC senza profondità, gradiente
  per altezza di schermo (non per elevazione del raggio: la camera è ortografica
  e guarda in basso), disco solare e nuvole a bande. Nuovo tema `diorama`.
- **Nuovi** in `src/game/`: `onboarding.ts` (tutorial derivato dai catalizzatori,
  senza flag nascosti), `cityCondition.ts` (autosufficienza e crisi),
  `sectors.ts` (settori costieri e maschera composta).
- **Nuovo**: `engine/InfluenceOverlay.ts` — cerchi dei catalizzatori e perimetri
  dei settori senza toccare le mesh voxel.

## 2026-08-18 — `1e61a81` — Comandi e modalità di avvio

- **Nuovi**: `game/launchMode.ts` (risoluzione pura della modalità iniziale: la
  radice `/` è l'esperienza completa, gli harness URL restano isolati) e
  `ui/ControlsHint.ts` (onboarding contestuale persistente e pannello di aiuto).

## 2026-08-18 — `c8ee82c` — Azioni di gioco e piazzamento

- **Nuovi**: `game/actions.ts` (azioni economiche atomiche: catalizzatori,
  policy, decisioni, commercio, espansione) e `game/surfacePick.ts` (selezione
  pura della colonna sulla heightmap da un raggio 3D).
- Prima toolbar (`ui/GameToolbar.ts`, poi sostituita dal Cozy HUD) e contratto
  dei pulsanti pointer accettati per il pan della camera.

## 2026-08-18 — `9fc7077` — Edifici procedurali, temi, alberi

- **Nuovo modulo** `src/world/buildings/`: `Builder.ts`, `BuildingRegistry.ts`,
  `generate.ts`, `stamp.ts`, `config.ts` e i loro test. È il ponte tra candidati
  della simulazione e mondo renderizzato.
- **Nuovo modulo** `src/engine/themes/`: sette look intercambiabili. Applicarne
  uno riscrive solo uniform e stato del renderer — nessuna geometria toccata.
- **Nuovi**: `game/loop.ts` (passo fisso con tetto di recupero),
  `game/growthScene.ts` (cablaggio di `grow=1`), `world/terrain/decor.ts`
  (alberi deterministici per cella), `ui/GrowthOverlay.ts`.
- Nascono `AGENTS.md`, i tre `AGENTS.md` di sezione e `docs/PROJECT_MAP.md`.

## 2026-08-18 — `1c9c1a3` — Simulazione a tick

- **Nuovo modulo** `src/sim/`: stato, bilancio del tick, campo di desiderabilità
  chunkato con ricalcolo incrementale, policy, candidati di crescita, barrel
  pubblico e `balance.ts` come unico posto dei coefficienti.
- Contratti presidiati da test fin dal primo giorno: purezza di `tick`, nessuna
  scrittura in `blocks`, serializzazione senza perdita, incrementale ≡
  ricostruzione completa, tick sotto 3 ms.
- Nascono `CLAUDE.md` e `PROJECT_INDEX.md`.

## 2026-08-17 — `6e0a3e0` — Isola procedurale in worker

- **Nuovo modulo** `src/world/terrain/`: 4 ottave di simplex per una maschera
  radiale deformata, biomi da altezza e pendenza, generazione fuori dal main
  thread un blocco di 32×32 colonne per volta, applicazione a budget di frame.
- `TerrainMap` affianca il mondo voxel con una mappa 2D per colonna.

## 2026-08-17 — `544d4b0` — Scaffold del motore voxel

- Storage sparso a chunk (`VoxelWorld`, `Chunk`), greedy mesher puro in worker,
  `ChunkRenderer` con coda a priorità e upload a budget, `VoxelMaterial` unico,
  camera ortografica isometrica, palette a 32 slot, overlay di debug.
