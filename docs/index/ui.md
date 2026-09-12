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
| [cityClock.ts](src/ui/cityClock.ts) | L'ora della città in una riga: anno e stagione dal tick, ora dal sole, passo di un quarto d'ora perché a sei minuti per giorno i minuti sfarfallerebbero. Dice «Year» e la stagione, non «Day», perché qui è la **stagione** a durare un giro del sole | `cityYear`, `clockTime`, `cityClock` |
| [CityDrawer.ts](src/ui/CityDrawer.ts) | Dashboard di sola lettura: condizione, bisogni della città come barre, traguardi, commercio, scambi, forma, infrastrutture e storia in una colonna, senza interruttori |
| [CityOverviewModel.ts](src/ui/CityOverviewModel.ts) | Modello puro della panoramica cittadina: obiettivi di autosufficienza, i sette bisogni come misure con tono e barra, forma urbana, infrastrutture, scambi, mandati e decisioni recenti |
| [community.css](src/ui/community.css) | Il vestito delle due porte verso chi fa il gioco: le pillole del piede — l'ambra piena del sostegno, unica cosa calda in una pagina di cielo — e il pannello del feedback, che riusa i mattoni di `titleScreen.css` invece di rifarli |
| [community.ts](src/ui/community.ts) | Sostegno e feedback in TypeScript puro: la pagina Ko-fi con l'etichetta che non puo' dire «Donate», l'unica casella di posta, le cinque categorie con traccia e segnaposto, validazione con motivo, composizione a sezioni fisse e `mailto:` con l'avviso di troncamento | `SUPPORT_URL`, `SUPPORT_LABEL`, `SUPPORT_TITLE`, `FEEDBACK_TO`, `FEEDBACK_CATEGORIES`, `validateFeedback`, `composeFeedback`, `mailtoUrl`, `mailtoTooLong`, `handoffNote`, `contextLines`, `feedbackCategory` |
| [daylightControl.ts](src/ui/daylightControl.ts) | Come si chiama il cielo — Auto, Day, Night — in un posto solo. Estratto da `GameHudControlsModel.ts`, che tira dentro `src/sim`: il titolo non deve caricare la simulazione per scrivere «Auto» | `daylightControl`, `HudDaylight` |
| [decisionInbox.ts](src/ui/decisionInbox.ts) | La decisione in attesa disegnata una volta sola per la carta modale e per i due cassetti: alternative, segno, conto alla rovescia e cosa scatta se nessuno risponde |
| [drawerBits.ts](src/ui/drawerBits.ts) | Mattoni condivisi dei cassetti di destra: intestazione con croce, righe dei fatti e barre dei traguardi |
| [FeedbackPane.ts](src/ui/FeedbackPane.ts) | La sottoschermata da cui si manda una nota: fisarmonica delle categorie con un solo riquadro condiviso, indirizzo di risposta facoltativo, contesto allegato con i valori veri in chiaro, e il pannello da cui si copia — sempre a schermo, perche' un `mailto:` che non parte non lo dice a nessuno | `FeedbackPane`, `FeedbackPaneHandlers` |
| [GameHudControlsModel.ts](src/ui/GameHudControlsModel.ts) | Tipi e testo puro dei controlli dell'HUD: strumento selezionato e ciclo giorno/notte |
| [GameHudEconomyModel.ts](src/ui/GameHudEconomyModel.ts) | Lettura economica pura dell'HUD: risorse, rendiconti, riserve, ciclo commerciale e la riga «perche'» di ogni risorsa | `buildHudResources`, `fundsHint`, `foodHint`, `materialsHint`, `populationHint`, `satisfactionHint`, `HudResource` |
| [GameHudNeedsModel.ts](src/ui/GameHudNeedsModel.ts) | Il traguardo di autosufficienza come blocco compatto della barra: residenti e classi vs `BALANCE.gameplay.success`, prossimo passo del coach | `buildHudNeeds`, `HudNeeds` |
| [hud.css](src/ui/hud.css) | Token, elevazione a tre livelli, cornice, tessere del dock, stati accessibili e layout responsivo Cozy City |
| [hudIcons.ts](src/ui/hudIcons.ts) | Icone SVG interne, senza dipendenze o richieste di rete |
| [hudPanels.css](src/ui/hudPanels.css) | Layout e stati dei pannelli informativi, della selezione e dei picker, separati dal chrome del mondo; in coda il vocabolario grafico condiviso — quattro toni, barre, composizione per uso, carta del consiglio |
| [hudTip.ts](src/ui/hudTip.ts) | La scheda che si apre da un'azione del dock: modello puro — nome, prezzo, cosa fa, righe etichettate, gesto o blocco — e il suo disegno in soli `<span>`, perché sta dentro un `<button>` |
| [hudWidgets.ts](src/ui/hudWidgets.ts) | Fabbriche DOM e attivazione accessibile: le azioni bloccate restano raggiungibili per leggere requisito e avanzamento. È anche l'unico punto da cui passa ogni bottone dell'HUD, quindi è qui che vive il suono del clic — e il blat di rifiuto su ciò che è ancora bloccato |
| [hudTokens.ts](src/ui/hudTokens.ts) | I `--hud-*` derivati dal tema attivo: pannello chiaro o scuro dalla luminanza dell'aria, tinta verso il mondo e contrasto AA garantito |
| [GameHud.ts](src/ui/GameHud.ts) | Composizione dell'HUD: pannelli, decisioni, temi, targa della vista, picker delle viste informative, cassetto dei salvataggi, catena di Escape e feedback contestuale | `GameHud`, `GameHudHandlers` |
| [InfoViewLegend.ts](src/ui/InfoViewLegend.ts) | La legenda della vista informativa attiva: nome, descrizione e categorie, lette dallo stesso catalogo dell'overlay | `InfoViewLegend` |
| [MainMenu.ts](src/ui/MainMenu.ts) | La modale, vestita come il titolo: velo che si prende i clic diretti alla canvas e sfoca la citta' sotto, colonna centrata con marchio, Resume in cima che porta il riassunto della partita, quattro voci con la riga di dettaglio, sottoschermate che sostituiscono l'elenco. `Esc` torna all'elenco prima di chiudere; trappola del `Tab` e ripristino del fuoco. Non conosce storage, simulazione ne' engine | `MainMenu`, `MainMenuHandlers` |
| [MainMenuModel.ts](src/ui/MainMenuModel.ts) | Il menu principale in TypeScript puro, testato in `node`: le quattro sezioni con titolo e sottotitolo, il nome e il riassunto di uno slot, la riga della partita in corso e quella di identita' | `MAIN_MENU_ENTRIES`, `menuEntry`, `slotLabel`, `slotSummary`, `gameSummary`, `EMPTY_SLOT_SUMMARY`, `ABOUT_LINE`, `MainMenuSection`, `MainMenuEntry` |
| [MainMenuNewGame.ts](src/ui/MainMenuNewGame.ts) | La sezione della partita nuova: campo del seed validato dal vivo, sorteggio chiesto alla radice, conferma in due passi perche' l'autosalvataggio viene sostituito. Vestita da `titleScreen.css` come il resto del menu | `MainMenuNewGame`, `NewGameHandlers` |
| [MainMenuSaves.ts](src/ui/MainMenuSaves.ts) | La sezione salvataggi: autosave in sola lettura, tre slot a mano, export e import di un file. Riceve l'elenco gia' letto e restituisce gesti | `MainMenuSaves`, `SaveSectionHandlers` |
| [MainMenuSettings.ts](src/ui/MainMenuSettings.ts) | La sezione impostazioni: i sette temi, i tre modi della luce e le nuvole, piu' la porta verso il campionario. Le etichette della luce vengono da `daylightControl`, non riscritte | `MainMenuSettings`, `SettingsHandlers` |
| [meterBits.ts](src/ui/meterBits.ts) | Il disegno delle misure, gemello di `drawerBits.ts`: verdetto con tono, barre con etichetta e valore, barra composta con le sue voci, composizione per uso, carta dei ruoli da piazzare |
| [meters.ts](src/ui/meters.ts) | Vocabolario grafico puro condiviso da scheda e cassetto: i quattro toni, `Meter` con quota e suggerimento, `Contribution`, `Breakdown` sul massimo assoluto, `Verdict`, e i formattatori di numero |
| [src/ui/PerfOverlay.ts](src/ui/PerfOverlay.ts) | Pannello delle prestazioni acceso da `?perf=1`: fps, durata del frame, fetta di remesh, chunk rimeshati e livello di qualita'. Legge la stessa fonte del riepilogo console. |
| [PoliciesDrawer.ts](src/ui/PoliciesDrawer.ts) | Il cassetto di governo: policy e rotte commerciali, le due cose che si toccano, separate dalla lettura |
| [ResourceBar.ts](src/ui/ResourceBar.ts) | I dati in cima al rail sinistro: cinque risorse con freccia di tendenza, sparkline e riga di causa sempre visibili, popover del bilancio, blocco City needs, poi i gruppi Time — con l'ora della città sotto i bottoni — e Sky, che chiude con nuvole e suono | `ResourceBar` |
| [BuildDock.ts](src/ui/BuildDock.ts) | Il rail di sinistra: le corsie etichettate incolonnate — catalizzatori, Reach, Clear (la gomma) e le porte —, tessere icona-sopra-etichetta con badge di tasto, una colonna sopra i 900px di finestra e due sotto, selezione per indice. Le porte includono la tessera Data, che apre il picker delle viste informative; fra le icone c'e' quella dei salvataggi | `DockPanel` |
| [ResourceTrend.ts](src/ui/ResourceTrend.ts) | La finestra dei tick recenti per risorsa: direzione, magnitudine, serie per la sparkline e il ritmo per tick su cui si prevede. Campionamento ancorato al tick, e `rate` divide per i tick trascorsi e non per i campioni |
| [GameHudModel.ts](src/ui/GameHudModel.ts) | Composizione del modello HUD: panoramica cittadina, azioni, policy, risorse e disponibilita' |
| [ControlsHint.ts](src/ui/ControlsHint.ts) | Onboarding contestuale persistente e pannello di aiuto: comandi della camera, viste e i tre gesti della gomma con il senso dei suoi colori |
| [DebugOverlay.ts](src/ui/DebugOverlay.ts) | fps, draw call, triangoli, code, tempi di mesher e main thread |
| [GrowthOverlay.ts](src/ui/GrowthOverlay.ts) | Conteggi, livelli, coda e scarti della crescita automatica |
| [seasonControl.ts](src/ui/seasonControl.ts) | Come si chiama la stagione — Spring, Summer, Autumn, Winter — in un posto solo, gemello di `daylightControl`. Il testo dice cosa fa il **raccolto**, che è l'unica metà della stagione che non si legge guardando la città | `seasonControl`, `HudSeason` |
| [segmented.ts](src/ui/segmented.ts) | Una scelta fra N come una pista sola con una pastiglia che ci scorre dentro, al posto di N bottoni bordati. Tiene solo il meccanismo — conta le celle, legge quale è accesa, sposta la pastiglia — e il nome della classe arriva da fuori, perché l'HUD e le due schermate vestite da `titleScreen.css` non condividono i colori | `segmentedRow`, `paintSegmented`, `segmentedCells`, `pickedIndex` |
| [selectionLabels.ts](src/ui/selectionLabels.ts) | I nomi che la scheda dà alle enumerazioni del mondo — suolo, ruolo stradale, fascia di skyline, campate, parti in quota, specchi d'acqua — e i formattatori di riga |
| [selectionMeters.ts](src/ui/selectionMeters.ts) | Le barre della scheda: usi di un edificio con l'organico che li limita, bilancio di un isolato, composizione per uso, domanda della colonna contro le soglie di sito |
| [selectionVerdict.ts](src/ui/selectionVerdict.ts) | Verdetto, barra composta e consiglio per il punto scelto: edificio, landmark, campata, parte in quota e terreno nudo, ognuno con la propria risposta corta |
| [siteAdvice.ts](src/ui/siteAdvice.ts) | Quale catalizzatore piazzare qui attorno: resa sull'uso in difetto (`strength × influence`), filtro di sito su costa e pianoro, ordinamento totale e i tre migliori |
| [SwatchOverlayModel.ts](src/ui/SwatchOverlayModel.ts) | Modello puro della scheda del campionario: fascia, titolo, genere, righe del soggetto con ingombro e altezza, scelta persistente, referto del voxel e istruzioni d'uso |
| [TerrainOverlay.ts](src/ui/TerrainOverlay.ts) | Progresso della generazione, istogramma dei biomi, colonne edificabili |
| [SimOverlay.ts](src/ui/SimOverlay.ts) | Stock e delta per tick, heatmap 2D del campo, primi dieci candidati, pulsanti delle policy |
| [InspectOverlay.ts](src/ui/InspectOverlay.ts) | Referto tecnico delle viste: modi, slider della quota, colonna a fuoco e id dell'isolato |
| [SwatchOverlay.ts](src/ui/SwatchOverlay.ts) | Vista del pannello del campionario: pulsanti delle fasce e scheda del soggetto in righe etichetta/valore, senza testo preformattato |
| [titleBits.ts](src/ui/titleBits.ts) | I mattoni condivisi dalle due superfici vestite da `titleScreen.css` — titolo, marchio e menu di pausa: titoletto di gruppo, riga di nota, bottone piccolo, corpo di sezione, fila di gesti. Non conosce i token di `hud.css` | `titleGroup`, `titleNote`, `titleSmall`, `titleSection`, `titleRow` |
| [TitleHelp.ts](src/ui/TitleHelp.ts) | I comandi sul titolo, disegnati con lo stile del titolo: le tre tabelle restano quelle di `ControlsHint.ts`, perche' riusare `helpSections()` vorrebbe dire caricare `hud.css` davanti alla scelta | `titleHelpPane` |
| [titleScreen.css](src/ui/titleScreen.css) | Il vestito del titolo **e** del menu di pausa, indipendente da `hud.css`: cielo e bianco scritti a mano, perche' questo foglio si carica prima del bundle del mondo. Il cielo e' un modificatore (`--sky`), la colonna in partita un altro (`--pause`) | — |
| [TitleScreen.ts](src/ui/TitleScreen.ts) | La porta d'ingresso in DOM puro: elenco di tre voci, sottoschermate del seed e dei salvataggi, stato d'attesa e dissolvenza. Non conosce engine ne' HUD, e il suo foglio di stile e' suo | `TitleScreen`, `TitleScreenHandlers`, `TitleScreenView` |
| [TitleScreenModel.ts](src/ui/TitleScreenModel.ts) | Il titolo in TypeScript puro, testato in `node`: quali voci compaiono e quale e' quella grande, il conto delle citta' salvate, la lettura del seed digitato e l'avvertimento dell'isola nuova | `TITLE_NAME`, `TITLE_TAGLINE`, `TITLE_LOADING`, `titleButtons`, `savedDetail`, `seedNote`, `newIslandWarning`, `TitleAction`, `TitlePane`, `TitleButton`, `SeedNote` |
| [TitleSettings.ts](src/ui/TitleSettings.ts) | Le impostazioni sul titolo: tema, cielo, nuvole e stagione di nascita, scelti prima che il mondo nasca. Non tocca l'engine — cio' che si sceglie finisce nei parametri d'indirizzo che la radice legge all'avvio | `TitleSettings` |
| [ViewMenuModel.ts](src/ui/ViewMenuModel.ts) | Il menu delle viste dal lato del giocatore, puro: etichette, gesti, targa della vista attiva con i suoi tasti, gesti e tasti dell'isolato **scelto**, barra dei livelli, regola dello strumento |
| [SelectionPanel.ts](src/ui/SelectionPanel.ts) | La scheda di selezione: verdetto, barra della soglia e consigli in cima, poi le quattro unità con le loro misure e la carta d'identità ripiegata dietro «Details» |
| [src/ui/SelectionPanelModel.ts](src/ui/SelectionPanelModel.ts) | Scheda di selezione: sezioni impilate e carta di crescita, modello puro. La carta di un edificio sotto soglia scompone la desiderabilità nelle sue fonti con segno e congestione; un landmark mostra il vettore d'influenza per uso e cosa compra lo stadio successivo |
| [prospects.ts](src/ui/prospects.ts) | La lingua di cosa un luogo **non** è ancora: le due righe che nominano il quartiere che potrebbe diventare e la forma che ci crescerebbe, più la riga di tooltip di ciò che un ruolo sblocca |

## `src/audio/` — il suono della città

Sintesi in WebAudio, nessun file audio nel repo: ogni suono è un pugno di
oscillatori con la sua inviluppante, e cambiarlo è cambiare una cifra. Sta
accanto a `src/ui/` perché è presentazione come i pannelli — il `SoundBoard` è
l'unico pezzo che tocchi il browser, tutto il resto gira in `node`.

| File | Ruolo |
| --- | --- |
| [cityCues.ts](src/audio/cityCues.ts) | Cosa suona la città che cambia da sola: legge il salto fra due letture di `buildings` e `milestone` e ne deduce posa, demolizione o soglia. Puro, così la simulazione non deve conoscere l'audio | `CityCueWatcher`, `CityPulse` |
| [cues.ts](src/audio/cues.ts) | Il catalogo dei cinque suoni scritto in numeri invece che in file audio: forme d'onda, inviluppanti e soglia anti-raffica. Per il rumore bianco `from`/`to` non sono un'altezza ma il taglio del passa-basso, che è ciò che distingue i detriti dal tonfo | `CUES`, `CUE_IDS`, `CueId`, `AudioCue`, `CueVoice`, `CueTone`, `cueLength`, `voiceAttack` |
| [preference.ts](src/audio/preference.ts) | Se il suono è acceso, in `localStorage` e non nell'indirizzo: il muto è di chi sta davanti al computer, e un link copiato non deve zittire chi lo riceve | `readSoundPreference`, `writeSoundPreference`, `browserSoundStorage`, `SOUND_STORAGE_KEY`, `SoundStorage` |
| [sound.ts](src/audio/sound.ts) | Il punto unico da cui l'interfaccia chiede un suono: `no-op` finché la radice non installa la board, e importato solo per tipo, così `src/ui/` non si tira dentro il grafo audio | `playCue`, `installSoundBoard`, `soundBoard` |
| [SoundBoard.ts](src/audio/SoundBoard.ts) | Chi trasforma un cue in aria mossa: contesto audio creato al primo suono davvero emesso — prima il browser lo rifiuta — muto che abbassa il volume generale invece di limitarsi a non schedulare, e fabbrica di contesti iniettabile perché i test girano in `node` | `SoundBoard`, `SoundBoardOptions` |

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
| `season` | — | `<0..1>` inchioda la fase dell'anno e la sottrae alla simulazione: è un attrezzo di cattura, l'anno non cammina più |
| `calendar` | `summer` | `spring`, `summer`, `autumn` o `winter`: in che stagione **nasce** l'isola. Sposta il punto di partenza di un anno che poi gira come sempre — non è `season`, che invece lo ferma |
| `inspect` | — | `xray`, `slice`, `section` o `block` aprono una vista di ispezione; vale **anche senza** `debug` |
| `slice` | — | `<z>` fissa la quota della fetta; senza, segue il suolo che si sta guardando |
