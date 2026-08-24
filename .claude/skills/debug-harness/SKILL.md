---
name: debug-harness
description: Parametri URL, hotkey e hook globali dell'harness di debug del voxel city builder. Usala quando devi riprodurre un comportamento a schermo, misurare un budget di frame, leggere un overlay, o quando aggiungi una metrica di debug.
---

# Harness di debug

`?debug=1` accende overlay e hotkey tecniche; `F3` le alterna a runtime. La
radice `/` avvia isola, crescita e Cozy HUD con gli overlay tecnici nascosti.

## Parametri URL

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` apre overlay e hotkey tecniche |
| `scene` | — | Isola una scena `city`, `noise` (caso peggiore), `slab`, `diorama` o `swatch` |
| `class` | `commercial` | Uso del soggetto del diorama: `residential`, `commercial`, `industrial`, `civic` |
| `level` | `6` | Livello del soggetto del diorama, 0…`BUILDER.maxLevel` |
| `typology` | — | `<id>` forza la tipologia del soggetto (`officeTower`, `civicLantern`, …) |
| `mixed` | — | Secondo uso ospitato dal soggetto, per giudicare il podio misto |
| `seed` | `1337` | Seed della generazione |
| `size` | `512` | Lato del mondo in voxel (32…4096) |
| `height` | `64` | Altezza del mondo in voxel (32…256) |
| `terrain` | — | `<seed>` sostituisce la scena urbana con un'isola 256×256 |
| `sim` | — | `1` accende la scena di simulazione (implica l'isola, richiede `debug=1`) |
| `grow` | — | `1` accende la crescita automatica degli edifici |
| `quality` | — | `performance` toglie le pass aggiuntive e dimezza le draw call |
| `theme` | — | `<id>` sceglie il tema; vale **anche senza** `debug`, è un look, non una misura |
| `hour` | — | `<0..24>` fissa l'ora e **ferma** il ciclo giorno/notte; vale anche senza `debug` |
| `daylight` | `cycle` | `day` o `night` fermano l'orologio sull'ora del modo; è la stessa scelta del bottone nell'HUD e vale anche senza `debug` |
| `inspect` | — | `xray`, `slice`, `section`, `block`: apre una vista di ispezione. Vale **anche senza** `debug` — è così che uno strumento di cattura inquadra una sezione senza overlay |
| `slice` | — | `<z>` fissa la quota della fetta; senza, segue il suolo che si sta guardando |

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
basamento continuo, inquadrate tutte insieme perché una scelta di look si fa
affiancando le cose.

- la **matrice** 32 × 8 — uno slot di palette per colonna, un `SURFACE_KIND` per
  riga. La prima colonna è un buco, ed è ciò che l'indice 0 significa: la
  palette vuota non si scrive;
- la **stratigrafia**: un pilastro tagliato per bioma, con gli stessi tre tagli
  del terreno vero, più i tre `WATER_CLASS`;
- la **scala**: il cubo di terreno e la sua scaletta, una specie d'albero per
  riga di `TREE_SHAPES`, e un edificio di riferimento.

Tre cose da sapere prima di stupirsi:

- le righe `plain` e `utility` **non hanno microgeometria**, e non è un difetto:
  la prima non è un linguaggio, e la seconda è metallo strutturale la cui forma
  arriva dalla mesh. Si distinguono per tinta;
- sulle colonne `water` e `waterDeep` i tre bit **non** portano una facciata ma
  `WATER_CLASS`: il fragment riconosce l'acqua dalla palette prima di leggerli
  (contratto 5). L'overlay lo dice sotto il cursore;
- il campionario mostra **quello che esiste**. Se una combinazione si vede male,
  il difetto sta altrove — qui non c'è geometria dedicata da correggere.

Il pannello a destra nomina fascia, riga e colonna sotto il cursore, e tiene in
vista la legenda dell'ordine delle otto righe: in-world non ci sono etichette.
Cambiare tema con `1`..`9` rilegge il campionario **senza rigenerarlo**, ed è il
modo di riconoscere uno slot morto a colpo d'occhio.

```
/?scene=swatch&debug=1
/?scene=swatch&theme=neon&daylight=night     # le righe luminous e portal accese
```

## Tasti

`Q`/`E` ruotano attorno al punto di terra sotto al mouse (sul centro
dell'inquadratura se il cursore è fuori dalla canvas), rotella zoom, drag destro
o `WASD` pan, `F` inquadra tutto, `G` +64 chunk, `R` rebuild totale, `C` azzera
i picchi, `B` colore per bioma, `H`/`Shift+H` sposta l'ora, `1`..`9` sceglie il tema, `T`/`P`/`M` in scena
simulazione. `__simClass(i)` e il tasto `M` ciclano su quattro usi, non tre.
Con un isolato scelto in Block focus il drag **orbita** invece di panare, `Q`/`E`
girano a passi continui e `F` e `WASD` restano fermi: vedi *Viste di ispezione*.

**Fuori dal gate del debug**, perché sono comandi di gioco e non misure: `V`
cicla le viste, `L` cicla i modi del giorno (ciclo, giorno fisso, notte fissa),
`[`/`]` e `PageDown`/`PageUp` muovono la quota della fetta (`Shift` per un piano
intero). Rispondono anche alla radice, senza `?debug=1`.

## Viste di ispezione

Quattro modi, un solo meccanismo: due predicati geometrici e un retino ordinato
con `discard`, governati da tre uniform del materiale unico. La decisione — quale
modo, a che quota, su quale isolato — vive in `src/engine/inspect.ts`, è pura e
si verifica in `node`; nel materiale entrano solo i numeri che ne escono.

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

Solo con `?debug=1`:

- sempre: `__voxelStats()`, `__voxelReset()`, `__voxelExpand()`,
  `__voxelRebuildAll()`, `__voxelTheme(id?)`, `__voxelSun(azimuth?, elevation?)`, `__voxelHour(h?)`,
  `__voxelInspect(mode?, z?)`
- con `scene=swatch`: `__voxelSwatch(x?, y?)` — senza argomenti dice cosa indica
  il cursore, con una colonna interroga il campionario senza toccare il mouse
- con terreno: `__terrainStats()`, `__terrainBiomeView()`, `__terrainExpand()`
- con `sim=1`: `__simStats()`, `__simTick(n)`, `__simSites(n)`, `__simClass(i)`,
  `__simPolicy(id)`

## Regola quando aggiungi una metrica

Gli overlay (`src/ui/`) e gli hook globali leggono **la stessa fonte**. Aggiungi
la metrica una volta sola e falla passare da entrambi: due letture separate
divergono al primo refactor.

I tempi da guardare: `renderMs` e `shadow` sono spesa GPU e restano **fuori** dal
budget di 3 ms di main thread definito in `src/main.ts`.
