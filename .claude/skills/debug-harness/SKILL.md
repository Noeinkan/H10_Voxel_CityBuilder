---
name: debug-harness
description: Parametri URL, hotkey e hook globali dell'harness di debug del voxel city builder. Usala quando devi riprodurre un comportamento a schermo, misurare un budget di frame, leggere un overlay, o quando aggiungi una metrica di debug.
---

# Harness di debug

`?debug=1` accende overlay e hotkey tecniche; `F3` le alterna a runtime. La
radice `/` avvia isola, crescita e Cozy HUD con gli overlay tecnici nascosti.
`?perf=1` misura la partita vera: pannello in alto a destra e un riepilogo in
console ogni 5 secondi, senza aprire il gate del debug.

## Parametri URL

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` apre overlay e hotkey tecniche |
| `perf` | — | `1` accende il pannello delle prestazioni (fps, frame ms, remesh ms/frame, chunk rimeshati, livello di qualita') e il riepilogo da console ogni 5 s. Vale **anche senza** `debug`: misura la radice, non un harness. Registra anche `__voxelStats()`. `F3` non lo tocca, `F2` lo alterna ricaricando la stessa partita |
| `scene` | — | Isola una scena `city`, `noise` (caso peggiore), `slab`, `diorama` o `swatch` |
| `class` | `commercial` | Uso del soggetto del diorama: `residential`, `commercial`, `industrial`, `civic` |
| `level` | `6` | Livello del soggetto del diorama, 0…`BUILDER.maxLevel` |
| `typology` | — | `<id>` forza la tipologia del soggetto (`officeTower`, `civicLantern`, …) |
| `mixed` | — | Secondo uso ospitato dal soggetto, per giudicare il podio misto |
| `seed` | casuale | Seed della generazione. Senza parametro ne viene sorteggiato uno nuovo a ogni partita e **riscritto nella barra degli indirizzi**: ricaricare riporta lo stesso mondo, e dichiararlo a mano lo rivede sempre |
| `size` | `512` | Lato del mondo in voxel (32…4096) |
| `height` | `64` | Altezza del mondo in voxel (32…256) |
| `terrain` | — | `<seed>` sostituisce la scena urbana con un'isola 256×256 |
| `sim` | — | `1` accende la scena di simulazione (implica l'isola, richiede `debug=1`) |
| `grow` | — | `1` accende la crescita automatica degli edifici |
| `quality` | — | `high`, `balanced` o `performance` fissano il profilo; `auto` abbassa il pixel ratio e, quando e' gia' al minimo (display DPR 1), scende anche la scala degli effetti con la stessa isteresi |
| `theme` | — | `<id>` sceglie il tema; vale **anche senza** `debug`, è un look, non una misura |
| `hour` | — | `<0..24>` fissa l'ora e **ferma** il ciclo giorno/notte; vale anche senza `debug` |
| `daylight` | `cycle` | `day` o `night` fermano l'orologio sull'ora del modo; è la stessa scelta del bottone nell'HUD e vale anche senza `debug` |
| `inspect` | — | `xray`, `slice`, `section`, `block`: apre una vista di ispezione. Vale **anche senza** `debug` — è così che uno strumento di cattura inquadra una sezione senza overlay |
| `slice` | — | `<z>` fissa la quota della fetta; senza, segue il suolo che si sta guardando |
| `intro` | `1` | `0` toglie la caduta d'ingresso: la prima isola compare senza scendere dal cielo. Vale **anche senza** `debug`, serve a confrontare e a catturare uno scatto pulito |
| `play` | — | `1` salta il **menu d'ingresso** e riapre l'autosalvataggio: è il permesso di entrare dritti in partita. Si consuma all'avvio — `main.ts` lo toglie dalla barra degli indirizzi — quindi vale per quel caricamento soltanto. Lo mettono da soli `newGameUrl` e `perfToggleUrl`; **chi automatizza il browser lo vuole quasi sempre** |

## Ciclo giorno/notte

L'ora avanza da sola: un giorno di gioco dura **dodici minuti reali**, e parte
dalle 13, l'ora con cui i temi sono stati disegnati. `H` la sposta di un'ora
avanti, `Shift+H` indietro; `?hour=21.5` la fissa e ferma il ciclo.

**L'orologio si può anche fermare, ed è una funzione di gioco.** Tre modi —
`cycle`, `day`, `night` — dal bottone accanto alla velocità nell'HUD, dal tasto
`L` (fuori dal gate del debug, come `V`) o da `?daylight=night`. I due modi fissi
non sono un secondo look: sono le ore vere `DAYLIGHT.dayHour` e `nightHour`, e
tutto quello che l'ora produce vale identico. Tornando al ciclo il sole riparte
da dov'era. Il primo comando di gioco **scioglie** un `?hour=` in coda all'URL:
un bottone che non risponde è peggio di un parametro perso.

Il tema resta la firma e l'ora la modula: `neon` a mezzogiorno resta `neon`.
Quello che l'ora cambia sono luce, cielo, nebbia, ombra, emissivi e il riflesso
dell'acqua — mai palette, materia o tone mapping, quindi **non ricompila niente
e non tocca una geometria**. Il modello è puro e vive in
`src/engine/daylight.ts`.

Tre cose da sapere:

- **l'acqua è l'unica materia che l'ora tocca**, e non è un capriccio: il mare
  ha il colore di ciò che riflette. Con la tinta di mezzogiorno accesa su un
  fondo notturno l'increspatura smetteva di leggersi come un'onda e diventava un
  quadrettato chiaro largo quanto l'inquadratura;

- a sole radente **una parete illuminata supera il tetto**, che è il caso da cui
  `SunLight.elevation` mette in guardia. Non è un difetto: è un'ora del giorno.
  Quello che il ciclo garantisce è che il tetto non sia mai la faccia più scura;
- `__voxelSun(azimuth, elevation)` continua a esistere ed è un'altra cosa: scrive
  una posizione e basta, per autorare un tema. L'orologio la sovrascrive al
  prossimo scatto.

`__voxelHour()` legge tutto e scrive di entrambi i lati: un numero è un'ora
(`__voxelHour(21.5)`), una stringa è un modo (`__voxelHour('night')`). Riporta
`hour`, `mode`, `pinned` e la fase del giorno.

## La scena `diorama`

`?scene=diorama` compone **un edificio solo** su un basamento con la strada dal
lato del fronte, inquadrato da vicino e con il perno di rotazione a metà della
sua altezza: `Q`/`E` lo girano senza farlo uscire di campo. Serve a giudicare il
dettaglio senza aspettare che la città cresca.

Due cose da sapere prima di stupirsi:

- `?scene=diorama` e `?theme=diorama` sono **cose diverse**: il primo è il
  soggetto, il secondo è il look (modellino caldo con ombre fredde). Si possono
  usare insieme;
- senza città intorno non c'è profilo locale, quindi `selectTypology` può solo
  ripiegare sulla riga senza condizioni dell'uso — `retailRow` per il
  commerciale, `terracedHousing` per il residenziale. Le forme che un distretto
  concede si vedono **solo** passando `?typology=<id>`.

```
/?scene=diorama&debug=1                      # commerciale livello 6
/?scene=diorama&typology=officeTower&level=9
/?scene=diorama&class=civic&typology=civicLantern
```

## La scena `swatch`

`?scene=swatch` compone **il vocabolario**, non un soggetto: tre fasce su un
basamento, inquadrate tutte insieme perché una scelta di look si fa affiancando
le cose. Il basamento è largo quanto la fascia che regge, così il suo profilo a
gradini dichiara le tre fasce senza etichette.

- la **matrice** 32 × 8 — uno slot di palette per colonna, un `SURFACE_KIND` per
  riga. La prima colonna è un buco, ed è ciò che l'indice 0 significa: la
  palette vuota non si scrive;
- la **stratigrafia**: un pilastro tagliato per bioma, con gli stessi tre tagli
  del terreno vero, più i tre `WATER_CLASS`;
- la **scala**: il cubo di terreno e la sua scaletta, una specie d'albero per
  riga di `TREE_SHAPES`, e un edificio di riferimento.

**Il provino non è un cubo, ed è la parte che conta.** Ogni cella della matrice è
la stessa massa articolata, definita in `CELL_PARTS`: podio smussato, sbalzo a
filo, quattro lame di corona attorno a un cortile, quattro pinnacoli isolati agli
angoli. Non è decorazione — è ciò che fa scattare gli emettitori:

| pezzo | cosa accende |
| --- | --- |
| sbalzo sopra il podio | `emitSoffits`: intradosso con aria sotto |
| bordo attorno alla corona | `emitTerraceBoxes`: sommità scoperta con volume di fianco |
| pinnacoli d'angolo | `emitFinials`: nessun vicino in piano, **a tutte le quote** |
| cortile 5×5 | `emitRoofMasts`, `emitRoofCrowns`, `emitPergolas`: sommità con **quattro** vicini scoperti |

L'ultima riga è quella che mancava: fino alla sagoma a gradoni il tetto più largo
era un anello di spessore uno, e chiome e pergole erano **zero** su tutte e 248
le celle senza che niente lo segnalasse. Il cortile è lì per questo.

Misurato con `scenes/swatchProbe.ts`, prismi di sola microgeometria per provino,
gradoni → sagoma attuale: `habitat` 47 → 119, `industrial` 70 → 170, `civic`
68 → 178, `luminous` 64 → 176, `portal` 60 → 180, `roofTech` 21 → 61. Con gli
scavi sommati — che è quel che il referto mostra — si arriva rispettivamente a
137, 204, 212, 304, 308 e 77, e il chunk più carico fa **10 629 quad** di
dettaglio contro i 16 384 del tetto. Chi arricchisce ancora rimisuri: un test
tiene sia il pavimento per linguaggio sia il tetto per chunk.

La sagoma è identica in tutte le celle perché l'unica variabile dev'essere
palette × superficie, ed è **invariante per rotazione di 90 gradi**: a un quarto
di giro si vedono gli stessi sbalzi, o metà campionario andrebbe letta orbitando.

L'interasse segue la stessa logica: a `REST_PITCH` un voxel di quota si proietta
in alto il doppio di un voxel di profondità, quindi la fila davanti nasconde
`CELL_HEIGHT - cellPitch / 2` di quella dietro. Con interasse pari all'altezza
spariva metà di ogni provino e la griglia si leggeva come una massa unica.

Tre cose da sapere prima di stupirsi:

- le righe `plain` e `utility` **non hanno microgeometria**, e non è un difetto:
  la prima non è un linguaggio, e la seconda è metallo strutturale la cui forma
  arriva dalla mesh. Si distinguono per tinta;
- tende e insegne (`emitAwnings`, `emitSigns`) non compaiono **da nessuna
  parte**: chiedono un `portal` sotto la stessa faccia, e un provino di una
  superficie sola non può averlo. Quelle si giudicano in `?scene=diorama`;
- sulle colonne `water` e `waterDeep` i tre bit **non** portano una facciata ma
  `WATER_CLASS`: il fragment riconosce l'acqua dalla palette prima di leggerli
  (contratto 5). L'overlay lo dice sotto il cursore;
- il campionario mostra **quello che esiste**. Se una combinazione si vede male,
  il difetto sta altrove — qui non c'è geometria dedicata da correggere.

Il pannello a destra nomina fascia, riga e colonna sotto il cursore, ne dà i
**prismi e i quad di dettaglio**, e tiene in vista la legenda dell'ordine delle
otto righe: in-world non ci sono etichette. La riga `dettaglio` è quella che a
occhio non si può ricavare — una famiglia di emettitori spenta non lascia niente
da guardare — e la rimisura `scenes/swatchProbe.ts` con gli emettitori veri, non
una tabella scritta a mano. Sul provino **isolato**: dove una cella scavalca un
confine di chunk il conto vero si divide in due, e può differire di qualche
prisma per le testate.
**Nasce aperto anche senza `?debug=1`** e `F3` non lo spegne: è la legenda dello
strumento, non una metrica. Per uno scatto pulito si chiude il suo `<details>`.
Cambiare tema con `1`..`9` rilegge il campionario **senza rigenerarlo**, ed è il
modo di riconoscere uno slot morto a colpo d'occhio. Qui le cifre restano nude
(niente `Shift`): nel campionario non c'è dock a cui darle, e cambiare tema è
esattamente lo strumento di lavoro.

**Si apre anche dal gioco**, con il bottone a griglia del dock accanto al tema:
`swatchUrl` (in `src/game/launchMode.ts`, testata in `node`) compone l'indirizzo
con il tema e l'ora in vigore e lo apre in una **scheda nuova**, così la partita
resta viva in quella di sotto. L'ora nel link ferma l'orologio.

```
/?scene=swatch&debug=1
/?scene=swatch&theme=neon&daylight=night     # le righe luminous e portal accese
/?scene=swatch&theme=neon&hour=21.50         # quello che compone il bottone del dock
```

## Tasti

`Q`/`E` ruotano attorno al punto di terra sotto al mouse (sul centro
dell'inquadratura se il cursore è fuori dalla canvas), rotella zoom, drag
sinistro o destro o `WASD` pan, **drag centrale orbita** anche sulla città —
yaw continuo e inclinazione fra 12° e 82°, che restano dove li si lascia. Da un
angolo libero `Q`/`E` riagganciano la griglia degli scatti tenendo
l'inclinazione, e `F` inquadra tutto **e** rimette l'assetto isometrico.
`G` +64 chunk, `R` rebuild totale, `C` azzera
i picchi, `B` colore per bioma, `H`/`Shift+H` sposta l'ora, `T`/`P`/`M` in scena
simulazione. `__simClass(i)` e il tasto `M` ciclano su quattro usi, non tre.
Con un isolato scelto in Block focus il drag **orbita** invece di panare, `Q`/`E`
girano a passi continui e `F` e `WASD` restano fermi: vedi *Viste di ispezione*.

**Fuori dal gate del debug**, perché sono comandi di gioco e non misure: `V`
cicla le viste, `L` cicla i modi del giorno (ciclo, giorno fisso, notte fissa),
`1`..`9` scelgono lo **strumento** n-esimo del dock, `Shift`+`1`..`9` scelgono il
**tema**, `[`/`]` e `PageDown`/`PageUp` muovono la quota della fetta (`Shift` per
un piano intero). Rispondono anche alla radice, senza `?debug=1`.

## Il menu d'ingresso

**La partita non riparte da sola.** Ogni caricamento della radice si apre sul
menu principale, sopra un'isola nuova che intanto nasce dietro il velo: `npm
start` è un inizio, non il ritorno alla città di ieri. Il bottone grande dice
*Play* e apre quell'isola; *Continue* — che compare solo qui, e solo se c'è
qualcosa da riprendere — riapre l'autosalvataggio, con dentro scritto quando è
stato lasciato e quanto era grande.

L'autosalvataggio quindi **non si legge più all'avvio**: lo si apre da lì, e
passa dallo slot di transito come qualunque altro caricamento. Il seed continua
a essere riscritto nella barra degli indirizzi, ma non è più ciò che decide se
il menu compaia: quello lo scrive `main.ts` a ogni avvio, e legarci la decisione
avrebbe mostrato il menu solo la primissima volta.

`?play=1` è l'unica scorciatoia, e vale per un caricamento solo: entra dritto in
partita e riapre l'autosalvataggio. Se lo mettono da soli `newGameUrl` e
`perfToggleUrl` è per la stessa ragione — sono ricaricamenti che il gioco fa
dopo una scelta appena presa, e rimostrare il menu sopra il risultato sarebbe
chiedere due volte la stessa cosa. La regola sta in `opensEntryMenu`
(`src/game/launchMode.ts`), pura e testata in `node`.

`Esc` è una catena sola, e adesso finisce **aprendo** invece di non fare niente:
posa lo strumento, chiude i pannelli, chiude la scheda di selezione, molla
l'isolato, spegne la vista, e a mani vuote apre il **menu principale**. Il menu
è una modale con un velo sopra tutto (`--z-menu`), e finché è aperto la
simulazione riceve `dt = 0`: nessun tick passa, nessun autosalvataggio scatta, e
il resto del router dei tasti si ferma. Non è la pausa del giocatore — quella
finisce nel salvataggio, questa no. **Chi automatizza il browser deve saperlo**:
un `Esc` di parcheggio a mani vuote lascia la città ferma finché il menu non
viene richiuso (vedi `parkPointer` in `shotkit.config.mjs`).

`F2` accende e spegne la misura: **ricarica** la stessa partita aggiungendo o
togliendo `?perf=1`, invece di far comporre l'indirizzo a mano
(`perfToggleUrl` in `src/game/launchMode.ts`). Ricaricare è il punto e non un
effetto collaterale: pannello e referto devono misurare una partita nata
misurata, non una in cui la misura si è innestata a metà. Il seed viaggia
nell'URL e l'autosalvataggio scatta su `pagehide`, quindi si torna sulla stessa
isola con sopra la stessa città.

Le cifre nude sono passate dai temi agli strumenti con la fase 7.4, e la ragione
è la stessa che le aveva tolte dal gate del debug: il dock è la prima superficie
che un giocatore nuovo guarda per sapere cosa può costruire, e ogni tessera porta
il proprio numero stampato in un angolo. Un `n` che non corrisponde a nessuna
tessera disponibile **non viene ingoiato** e prosegue verso gli altri handler.
Nel campionario le cifre nude restano sui temi, perché lì non c'è dock e
cambiare tema **è** lo strumento.

## La caduta d'ingresso

La **prima** isola non compare, atterra: ogni chunk nasce **fuori dal bordo alto
dello schermo** e ci scende nell'istante in cui la sua geometria è pronta, con
una pioggia di cubetti a fare da polvere davanti a lui. La quota di partenza non
è una costante — la ricava `fallHeightFor` dall'altezza visibile e
dall'inclinazione, perché quanto sia lontano il bordo dipende dallo zoom.

La finestra vale **solo per la prima scena** e non si riapre, quindi le
espansioni costiere non cadono. Non si chiude però su `generator.done`: lì
restano in coda centinaia di chunk da meshare, e comparirebbero di colpo. Si
chiude quando non c'è più niente da meshare.

L'unità che cade è il **chunk** e non il voxel, ed è una conseguenza del greedy
mesher, non una scelta di gusto: il perché sta in
[src/engine/AGENTS.md](../../../src/engine/AGENTS.md). I cubetti veri sono
un'altra cosa e stanno sopra la scena, come i mezzi.

`__voxelDrop()` rimanda in cielo tutto quello che c'è già, così i numeri di
`introDrop.ts` e `dropRain.ts` si tarano senza ricaricare la pagina; l'overlay
conta i chunk `falling` accanto a quelli visibili, e `__voxelStats()` legge lo
stesso campo. `?intro=0` toglie l'effetto.

## Viste di ispezione

Quattro modi, un solo meccanismo: tre predicati geometrici e una rigatura con
`discard`, governati da sei uniform del materiale unico. La decisione — quale
modo, a che quota, su quale isolato — vive in `src/engine/inspect.ts`, è pura e
si verifica in `node`; i numeri della lente dei raggi X stanno in
`src/engine/xray.ts`. Nel materiale entrano solo i numeri che ne escono.

Velare non è però un solo `discard`: quello che resta di un occlusore si
scioglie nella tinta della prospettiva aerea e perde finestre e insegne, e sul
filo del voxel la rigatura cede, così il muro davanti diventa una **gabbia di
vetro** invece di un pulviscolo. La densità cresce avvicinandosi alla camera, ed
è ciò che permette di vedere più di una parete alla volta.

**Sono una funzione di gioco, non dell'harness** (fase 4.12): il pulsante *Views*
sta nel dock, le etichette che il giocatore legge vivono in
`src/ui/ViewMenuModel.ts`, e `InspectOverlay` resta come **referto tecnico** —
colonna a fuoco, id dell'isolato, densità del retino, nota sulle ombre. Le due
superfici chiamano le stesse `setInspectMode` / `setInspectSliceZ`: è la regola
di questa cartella, due letture separate divergono al primo refactor.

**Block focus ha due tempi.** Puntando un isolato lo si vela; **cliccandolo** lo
si *sceglie*, e allora la stessa vista taglia: fuori dal riquadro non resta
niente, la camera inquadra l'isolato e il trascinamento **gira attorno a lui**
invece di panare — inclinazione libera fra 12° e 82°, `Q`/`E` a passi continui,
`F` e il pan da tastiera sospesi. `Esc` molla l'isolato e lascia accesa la vista,
un secondo `Esc` la spegne; un clic su un altro isolato cambia soggetto tenendo
l'angolo. Uscendo, l'inquadratura di partenza viene rimessa identica. Il referto
tecnico e `__voxelInspect()` riportano entrambi `locked`.

Velare e tagliare sono la stessa manopola: a densità 1 il retino scarta ogni
pixel. Tre cose da sapere prima di stupirsi:

- un taglio mostra un **guscio vuoto**, perché il mesher non emette facce
  interne. Il tappo dalle back-face garantisce che non si veda mai il cielo
  attraverso un volume tagliato, non che il volume sia pieno;
- finché un taglio è attivo le **ombre proiettate si spengono**, o il piano
  appena scoperto resterebbe all'ombra di quelli che si sono nascosti;
- il `discard` entra nel sorgente del fragment **solo alla prima attivazione**:
  una ricompilazione per sessione, e chi non usa le viste non la paga.

## Hook globali

Solo con `?debug=1` (piu' `__voxelStats()`, che si registra anche con `?perf=1`):

- sempre: `__voxelStats()`, `__voxelReset()`, `__voxelExpand()`,
  `__voxelRebuildAll()`, `__voxelTheme(id?)`, `__voxelSun(azimuth?, elevation?)`, `__voxelHour(h?)`,
  `__voxelInspect(mode?, z?)`, `__voxelDrop()`
- con `scene=swatch`: `__voxelSwatch(x?, y?)` — senza argomenti dice cosa indica
  il cursore, con una colonna interroga il campionario senza toccare il mouse.
  Restituisce `{ extent, cell, detail }`, e `detail` è il conteggio dei prismi:
  è il modo di leggere tutte e otto le righe senza inseguire il cursore
- con terreno: `__terrainStats()`, `__terrainBiomeView()`, `__terrainExpand()`
- con `sim=1`: `__simStats()`, `__simTick(n)`, `__simSites(n)`, `__simClass(i)`,
  `__simPolicy(id)`

## Regola quando aggiungi una metrica

Gli overlay (`src/ui/`) e gli hook globali leggono **la stessa fonte**. Aggiungi
la metrica una volta sola e falla passare da entrambi: due letture separate
divergono al primo refactor.

I tempi da guardare: `renderMs` e `shadow` sono spesa GPU e restano **fuori** dal
budget di 3 ms di main thread definito in `src/main.ts`.
