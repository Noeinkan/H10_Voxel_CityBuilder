## indice — `src/game/` — ciclo di gioco

| [save/format.ts](src/game/save/format.ts) | Il formato di salvataggio versionato e la sua lettura difensiva: un file piu' nuovo si rifiuta, un campo mancante prende il proprio default come in `reviveSimState`, record e settori malformati cadono invece di aprirsi a meta' | `readSave`, `SAVE_VERSION`, `SaveGame`, `SaveScene` |
| [save/capture.ts](src/game/save/capture.ts) | Da partita in corso a file: pota cio' che nessun generatore sa ridisegnare da un record (campate, impalcati, funivie) e transitivamente chi ci poggiava sopra, togliendo gli stessi edifici dalla simulazione su una copia staccata | `captureSave`, `CaptureInput` |
| [save/storage.ts](src/game/save/storage.ts) | Slot su uno storage iniettabile: autosave, tre slot a mano, lo slot di passaggio che il prossimo avvio consuma, export e import JSON. Nessuna eccezione verso l'alto — quota piena e storage bloccato sono esiti | `browserStorage`, `readSlot`, `writeSlot`, `takeSlot`, `deleteSlot`, `listSlots`, `exportText`, `importText`, `AUTO_SLOT`, `MANUAL_SLOTS`, `PENDING_SLOT`, `SaveStorage`, `SlotInfo`, `WriteResult` |

## indice — `src/ui/` — HUD e overlay di debug

| [SaveDrawer.ts](src/ui/SaveDrawer.ts) | Il cassetto dei salvataggi: autosave in sola lettura, tre slot a mano, export e import di un file. Non conosce lo storage ne' la partita — riceve l'elenco e restituisce gesti | `SaveDrawer`, `SaveDrawerHandlers` |

## changelog — La partita si salva e si riapre

- **Un formato versionato, e cio' che non ci entra.** `src/game/save/` porta
  seed, stato della simulazione e record del registro in un file JSON. Non ci
  entrano terreno, rete stradale e campo di desiderabilità: sono funzioni pure
  del seed e dello stato, e il caricamento li rifà identici invece di leggerli.
  I settori costieri viaggiano come identificatori **in ordine di acquisto**, che
  è l'ordine in cui la costa va rigenerata: ogni acquisto estende la sagoma su
  cui il successivo viene generato, e rifarli insieme darebbe un'altra riva.
- **Autosave ogni venti secondi, tre slot a mano, export e import.** Il gioco
  riscrive da solo lo slot automatico e all'uscita della scheda (`pagehide` e
  `visibilitychange`, non `beforeunload`, che su mobile non scatta). Ricaricare
  riapre la partita: il seed del salvataggio vince, a meno che l'URL non ne
  chieda esplicitamente un altro — chiederne uno diverso significa volere
  quell'altro mondo, e caricarci sopra una città costruita altrove darebbe
  edifici sospesi sul mare.
- **Caricare passa da un ricaricamento, ed è deliberato.** Il seed decide
  l'isola, l'isola arriva da un worker a blocchi, e camera, overlay e streamer si
  costruiscono su quella: rifare tutto a caldo vorrebbe dire un secondo percorso
  di costruzione del mondo, con i suoi modi di divergere, accanto a uno che già
  parte da zero a ogni avvio. Lo slot di passaggio è come la scelta arriva
  dall'altra parte del ricaricamento.
- **`registry.restore` guadagna un secondo chiamante e la riga che gli mancava.**
  Reinserire un record conservandone l'id serviva all'annullamento della gomma;
  ora serve anche al caricamento, che parte da un registro vuoto — quindi
  `nextId` sale oltre l'id reinserito, o la città costruita dopo prenderebbe
  l'identità di un edificio caricato. `Builder.restore` adotta in ordine di id e
  ridisegna con `recordStamp`, che impara a rigenerare anche un'arcologia.
- **Un edificio in quota dichiara su cosa poggia.** Il legame esisteva in un
  verso solo: l'impalcato sapeva di essere abitato, l'ospite non sapeva su cosa
  stesse. Ora il record porta `supports` anche quando è una casa su una mensola —
  il pannello di selezione lo mostra, e il salvataggio ci si appoggia per non
  scrivere un volume sospeso senza ciò che lo tiene su.
- **Quello che il salvataggio non riporta, e perché.** Campate, impalcati,
  gambe, ascensori e stazioni di funivia si cancellano con `clearVolume` invece
  di rigenerare la sagoma, quindi il loro generatore vuole un piano che il record
  non porta: restano fuori dal file, e con loro chi ci poggiava sopra. Dopo il
  caricamento è la passata della rete in quota a riproporli sui tetti tornati.
  Le piazzole di un'arcologia fanno eccezione — si ricavano dalla ricetta e dallo
  stadio, quindi `ArcologyDriver.adopt` le riapre dov'erano.

## indice — `src/world/buildings/` — crescita voxel

| [src/world/buildings/Builder.ts](src/world/buildings/Builder.ts) | Orchestratore urbano: conserva il candidato radiale in uno spazio continuo, porta i candidati costieri alla prima acqua navigabile senza seguire l'isolato teorico e mantiene la gerarchia verticale del nucleo; la gomma (`demolish`, `demolishSurvey`, `demolishPreview`, `undoDemolition`) apre il cantiere sul riquadro trascinato, lo mostra e lo puo' annullare; `restore` rimette in piedi una citta' salvata, adottando i record in ordine di id e ridisegnandoli con `recordStamp` | `Builder`, `BuilderStats`, `REJECT_REASONS` |
| [BuildingRegistry.ts](src/world/buildings/BuildingRegistry.ts) | Indice spaziale e record degli edifici; impronte rettangolari, sbalzi che prenotano aria ma non suolo, landmark contati a parte con la forma fisica su `landmarkForm` e il pelo dell'acqua su `waterZ`. `restore` reinserisce conservando l'id — per l'annullamento della gomma e per il caricamento — e porta `nextId` oltre cio' che ha adottato | `BuildingRegistry`, `BuildingRecord`, `footprintDepth`, `envelopeOf`, `PlanRect` |
| [recordStamp.ts](src/world/buildings/recordStamp.ts) | La sagoma **registrata** di un edificio, di un landmark o di un'arcologia, rigenerata dal record per poterla cancellare o ricaricare | `recordStamp`, `typologyOf` |
| [aerialDriver.ts](src/world/buildings/aerialDriver.ts) | Mensole, percorsi, gambe e le quote su cui si costruisce. Un impalcato vuoto cade, uno abitato no; `adopt` ricostruisce colonne in quota e impalcati abitati da un registry appena caricato | `AerialDriver` |
| [arcologyDriver.ts](src/world/buildings/arcologyDriver.ts) | La megastruttura: condizione sull'isolato, cantiere, costruzione a stadi, piazzali in quota e dichiarazione degli usi alla simulazione; `adopt` riapre le piazzole di un'arcologia caricata, che si ricavano da ricetta e stadio | `ArcologyDriver` |

## indice — `src/ui/` — HUD e overlay di debug

| [GameHud.ts](src/ui/GameHud.ts) | Composizione dell'HUD: pannelli, decisioni, temi, targa della vista, picker delle viste informative, cassetto dei salvataggi, catena di Escape e feedback contestuale | `GameHud`, `GameHudHandlers` |
| [BuildDock.ts](src/ui/BuildDock.ts) | Il rail di sinistra: le corsie etichettate incolonnate — catalizzatori, Reach, Clear (la gomma) e le porte —, tessere icona-sopra-etichetta con badge di tasto, una colonna sopra i 900px di finestra e due sotto, selezione per indice. Le porte includono la tessera Data, che apre il picker delle viste informative; fra le icone c'e' quella dei salvataggi | `DockPanel` |

## indice — `src/game/` — ciclo di gioco

| [growthScene.ts](src/game/growthScene.ts) | Cablaggio esclusivo di `grow=1`: tick, Builder e animazione; espone la gomma (`demolish`, `demolishAt`, `demolishSurvey`, `demolishPreview`, `undoDemolition`) al gioco e le due porte del salvataggio (`toSave`, `restore`). Raccoglie anche la colonna piu' densa per il coach dello skyline | `GrowthScene`, `GrowthStats`, `SectorRegion` |
| [sectors.ts](src/game/sectors.ts) | Identità, region e maschera composta dei settori costieri, dalla cella cliccata o dall'identificatore che un salvataggio si porta dietro | `coastalSectorAt`, `coastalSectorById`, `shapeWithSector` |
