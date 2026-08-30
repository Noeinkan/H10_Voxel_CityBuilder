# Indice — HUD, overlay e parametri

Pannelli in DOM e canvas puri, modelli testabili in node, e i parametri d’indirizzo dell’harness.

Una scheda del [Project Index](../../PROJECT_INDEX.md): qui c’e’ solo *dove sta cosa*.
Il modo economico di leggerla e’ `npm run locate -- <termine>`, che cerca su tutte le
schede insieme e restituisce le sole righe che servono. I percorsi delle righe
sono relativi alla radice del repository, non a questa cartella.


## `src/ui/` — HUD e overlay di debug

Canvas e DOM puri, nessuna dipendenza da Three.js. Il Cozy HUD è l'interfaccia
giocabile; gli overlay tecnici si alternano con `F3` o partono aperti con
`?debug=1`.

| File | Ruolo |
| --- | --- |
| [CityDrawer.ts](src/ui/CityDrawer.ts) | Dashboard di sola lettura: condizione, traguardi, capacita', economia, commercio, scambi, forma, infrastrutture e storia in una colonna, senza interruttori |
| [CityOverviewModel.ts](src/ui/CityOverviewModel.ts) | Modello puro della panoramica cittadina: obiettivi di autosufficienza, capacita', organico, bilanci, forma urbana, infrastrutture, scambi, mandati e decisioni recenti |
| [daylightControl.ts](src/ui/daylightControl.ts) | Come si chiama il cielo — Auto, Day, Night — in un posto solo. Estratto da `GameHudControlsModel.ts`, che tira dentro `src/sim`: il titolo non deve caricare la simulazione per scrivere «Auto» | `daylightControl`, `HudDaylight` |
| [drawerBits.ts](src/ui/drawerBits.ts) | Mattoni condivisi dei cassetti di destra: intestazione con croce, righe dei fatti e barre dei traguardi |
| [GameHudControlsModel.ts](src/ui/GameHudControlsModel.ts) | Tipi e testo puro dei controlli dell'HUD: strumento selezionato e ciclo giorno/notte |
| [GameHudEconomyModel.ts](src/ui/GameHudEconomyModel.ts) | Lettura economica pura dell'HUD: risorse, rendiconti, riserve, ciclo commerciale e la riga «perche'» di ogni risorsa | `buildHudResources`, `fundsHint`, `foodHint`, `materialsHint`, `populationHint`, `satisfactionHint`, `HudResource` |
| [GameHudNeedsModel.ts](src/ui/GameHudNeedsModel.ts) | Il traguardo di autosufficienza come blocco compatto della barra: residenti e classi vs `BALANCE.gameplay.success`, prossimo passo del coach | `buildHudNeeds`, `HudNeeds` |
| [hud.css](src/ui/hud.css) | Token, elevazione a tre livelli, cornice, tessere del dock, stati accessibili e layout responsivo Cozy City |
| [hudIcons.ts](src/ui/hudIcons.ts) | Icone SVG interne, senza dipendenze o richieste di rete |
| [hudPanels.css](src/ui/hudPanels.css) | Layout e stati dei pannelli informativi, della selezione e dei picker, separati dal chrome del mondo |
| [hudTip.ts](src/ui/hudTip.ts) | La scheda che si apre da un'azione del dock: modello puro — nome, prezzo, cosa fa, righe etichettate, gesto o blocco — e il suo disegno in soli `<span>`, perché sta dentro un `<button>` |
| [hudWidgets.ts](src/ui/hudWidgets.ts) | Fabbriche DOM e attivazione accessibile: le azioni bloccate restano raggiungibili per leggere requisito e avanzamento |
| [hudTokens.ts](src/ui/hudTokens.ts) | I `--hud-*` derivati dal tema attivo: pannello chiaro o scuro dalla luminanza dell'aria, tinta verso il mondo e contrasto AA garantito |
| [GameHud.ts](src/ui/GameHud.ts) | Composizione dell'HUD: pannelli, decisioni, temi, targa della vista, picker delle viste informative, cassetto dei salvataggi, catena di Escape e feedback contestuale | `GameHud`, `GameHudHandlers` |
| [InfoViewLegend.ts](src/ui/InfoViewLegend.ts) | La legenda della vista informativa attiva: nome, descrizione e categorie, lette dallo stesso catalogo dell'overlay | `InfoViewLegend` |
| [MainMenu.ts](src/ui/MainMenu.ts) | La modale: velo che si prende i clic diretti alla canvas, pannello centrato, colonna delle voci con Play/Resume in cima e Continue sotto — l'autosalvataggio con dentro quando e' stato lasciato — piede con riepilogo e identita', trappola del `Tab` e ripristino del fuoco. Non conosce storage, simulazione ne' engine | `MainMenu`, `MainMenuHandlers` |
| [MainMenuModel.ts](src/ui/MainMenuModel.ts) | Il menu principale in TypeScript puro, testato in `node`: le quattro sezioni con titolo e sottotitolo, il nome e il riassunto di uno slot, la riga della partita in corso e quella di identita' | `MAIN_MENU_ENTRIES`, `menuEntry`, `slotLabel`, `slotSummary`, `gameSummary`, `EMPTY_SLOT_SUMMARY`, `ABOUT_LINE`, `MainMenuSection`, `MainMenuEntry` |
| [MainMenuNewGame.ts](src/ui/MainMenuNewGame.ts) | La sezione della partita nuova: campo del seed validato dal vivo, sorteggio chiesto alla radice, conferma in due passi perche' l'autosalvataggio viene sostituito | `MainMenuNewGame`, `NewGameHandlers` |
| [MainMenuSaves.ts](src/ui/MainMenuSaves.ts) | La sezione salvataggi: autosave in sola lettura, tre slot a mano, export e import di un file. Riceve l'elenco gia' letto e restituisce gesti | `MainMenuSaves`, `SaveSectionHandlers` |
| [MainMenuSettings.ts](src/ui/MainMenuSettings.ts) | La sezione impostazioni: i sette temi, i tre modi della luce e le nuvole, piu' la porta verso il campionario. Le etichette della luce vengono da `daylightControl`, non riscritte | `MainMenuSettings`, `SettingsHandlers` |
| [src/ui/PerfOverlay.ts](src/ui/PerfOverlay.ts) | Pannello delle prestazioni acceso da `?perf=1`: fps, durata del frame, fetta di remesh, chunk rimeshati e livello di qualita'. Legge la stessa fonte del riepilogo console. |
| [PoliciesDrawer.ts](src/ui/PoliciesDrawer.ts) | Il cassetto di governo: policy e rotte commerciali, le due cose che si toccano, separate dalla lettura |
| [ResourceBar.ts](src/ui/ResourceBar.ts) | I dati in cima al rail sinistro: cinque risorse con freccia di tendenza, sparkline e riga di causa sempre visibili, popover del bilancio, blocco City needs, poi i gruppi Time e Sky | `ResourceBar` |
| [BuildDock.ts](src/ui/BuildDock.ts) | Il rail di sinistra: le corsie etichettate incolonnate — catalizzatori, Reach, Clear (la gomma) e le porte —, tessere icona-sopra-etichetta con badge di tasto, una colonna sopra i 900px di finestra e due sotto, selezione per indice. Le porte includono la tessera Data, che apre il picker delle viste informative; fra le icone c'e' quella dei salvataggi | `DockPanel` |
| [ResourceTrend.ts](src/ui/ResourceTrend.ts) | La finestra dei tick recenti per risorsa: direzione, magnitudine, serie per la sparkline e il ritmo per tick su cui si prevede. Campionamento ancorato al tick, e `rate` divide per i tick trascorsi e non per i campioni |
| [GameHudModel.ts](src/ui/GameHudModel.ts) | Composizione del modello HUD: panoramica cittadina, azioni, policy, risorse e disponibilita' |
| [ControlsHint.ts](src/ui/ControlsHint.ts) | Onboarding contestuale persistente e pannello di aiuto: comandi della camera, viste e i tre gesti della gomma con il senso dei suoi colori |
| [DebugOverlay.ts](src/ui/DebugOverlay.ts) | fps, draw call, triangoli, code, tempi di mesher e main thread |
| [GrowthOverlay.ts](src/ui/GrowthOverlay.ts) | Conteggi, livelli, coda e scarti della crescita automatica |
| [SwatchOverlayModel.ts](src/ui/SwatchOverlayModel.ts) | Modello puro della scheda del campionario: fascia, titolo, genere, righe del soggetto con ingombro e altezza, scelta persistente, referto del voxel e istruzioni d'uso |
| [TerrainOverlay.ts](src/ui/TerrainOverlay.ts) | Progresso della generazione, istogramma dei biomi, colonne edificabili |
| [SimOverlay.ts](src/ui/SimOverlay.ts) | Stock e delta per tick, heatmap 2D del campo, primi dieci candidati, pulsanti delle policy |
| [InspectOverlay.ts](src/ui/InspectOverlay.ts) | Referto tecnico delle viste: modi, slider della quota, colonna a fuoco e id dell'isolato |
| [SwatchOverlay.ts](src/ui/SwatchOverlay.ts) | Vista del pannello del campionario: pulsanti delle fasce e scheda del soggetto in righe etichetta/valore, senza testo preformattato |
| [TitleHelp.ts](src/ui/TitleHelp.ts) | I comandi sul titolo, disegnati con lo stile del titolo: le tre tabelle restano quelle di `ControlsHint.ts`, perche' riusare `helpSections()` vorrebbe dire caricare `hud.css` davanti alla scelta | `titleHelpPane` |
| [titleScreen.css](src/ui/titleScreen.css) | Il vestito del titolo, indipendente da `hud.css`: cielo e bianco scritti a mano, perche' questo foglio si carica prima del bundle del mondo | — |
| [TitleScreen.ts](src/ui/TitleScreen.ts) | La porta d'ingresso in DOM puro: elenco di tre voci, sottoschermate del seed e dei salvataggi, stato d'attesa e dissolvenza. Non conosce engine ne' HUD, e il suo foglio di stile e' suo | `TitleScreen`, `TitleScreenHandlers`, `TitleScreenView` |
| [TitleScreenModel.ts](src/ui/TitleScreenModel.ts) | Il titolo in TypeScript puro, testato in `node`: quali voci compaiono e quale e' quella grande, il conto delle citta' salvate, la lettura del seed digitato e l'avvertimento dell'isola nuova | `TITLE_NAME`, `TITLE_TAGLINE`, `TITLE_LOADING`, `titleButtons`, `savedDetail`, `seedNote`, `newIslandWarning`, `TitleAction`, `TitlePane`, `TitleButton`, `SeedNote` |
| [TitleSettings.ts](src/ui/TitleSettings.ts) | Le impostazioni sul titolo: tema, cielo e nuvole scelti prima che il mondo nasca. Non tocca l'engine — cio' che si sceglie finisce nei parametri d'indirizzo che la radice legge all'avvio | `TitleSettings` |
| [ViewMenuModel.ts](src/ui/ViewMenuModel.ts) | Il menu delle viste dal lato del giocatore, puro: etichette, gesti, targa della vista attiva con i suoi tasti, gesti e tasti dell'isolato **scelto**, barra dei livelli, regola dello strumento |
| [SelectionPanel.ts](src/ui/SelectionPanel.ts) | La scheda di selezione dell'isolato: una sola unità, senza linguette per struttura, colonna o voxel, con righe e gesto di isolamento |
| [src/ui/SelectionPanelModel.ts](src/ui/SelectionPanelModel.ts) | Scheda di selezione: sezioni impilate e carta di crescita, modello puro. La carta di un edificio sotto soglia scompone la desiderabilità nelle sue fonti con segno e congestione; un landmark mostra il vettore d'influenza per uso e cosa compra lo stadio successivo |
| [prospects.ts](src/ui/prospects.ts) | La lingua di cosa un luogo **non** è ancora: le due righe che nominano il quartiere che potrebbe diventare e la forma che ci crescerebbe, più la riga di tooltip di ciò che un ruolo sblocca |

## Parametri URL

La radice `/` avvia isola, crescita e Cozy HUD; gli overlay tecnici sono nascosti.
Ogni caricamento si apre sul **menu d'ingresso**, sopra un'isola nuova: la
partita non riparte da sola, si sceglie *Play* o *Continue*.

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` apre overlay e hotkey tecniche; `F3` li alterna a runtime |
| `play` | — | `1` salta il menu d'ingresso e riapre l'autosalvataggio; si consuma all'avvio e vale per quel caricamento soltanto |
| `perf` | — | `1` accende il pannello delle prestazioni e il riepilogo da console ogni 5 s; vale **anche senza** `debug` |
| `scene` | — | Isola una scena `city`, `noise` (caso peggiore), `slab`, `diorama` o `swatch` |
| `class`, `level`, `typology`, `mixed` | `commercial`, `6` | Soggetto della scena `diorama` |
| `seed` | `1337` | Seed della generazione |
| `size` | `512` | Lato del mondo in voxel (32…4096) |
| `height` | `64` | Altezza del mondo in voxel (32…256) |
| `terrain` | — | `<seed>` sostituisce la scena urbana con un'isola 256×256 |
| `sim` | — | `1` accende la scena di simulazione (implica l'isola, richiede `debug=1`) |
| `grow` | — | `1` accende la crescita automatica degli edifici (acceso di default alla radice) |
| `quality` | `auto` | `high`, `balanced` o `performance` fissano pixel ratio ed effetti; `auto` adatta con isteresi |
| `shadows` | — | `0` spegne la pass del sole, qualunque sia la qualita' |
| `theme` | `natural` | `<id>` sceglie il tema; vale **anche senza** `debug` |
| `hour` | — | `<0..24>` fissa l'ora e ferma il ciclo giorno/notte; vale **anche senza** `debug` |
| `daylight` | `cycle` | `day` o `night` fermano l'orologio sull'ora del modo; stessa scelta del bottone nell'HUD, vale **anche senza** `debug` |
| `inspect` | — | `xray`, `slice`, `section` o `block` aprono una vista di ispezione; vale **anche senza** `debug` |
| `slice` | — | `<z>` fissa la quota della fetta; senza, segue il suolo che si sta guardando |
