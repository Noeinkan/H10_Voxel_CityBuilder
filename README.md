# H10 Voxel City Builder — motore

Motore di rendering voxel a chunk per una città isometrica: storage sparso,
greedy meshing in worker, un solo materiale a palette, camera ortografica
isometrica, simulazione e crescita automatica degli edifici.

La sessione giocabile guida i primi tre catalizzatori nell’ordine economico,
mostra costi, raggi e invalidità direttamente sul cursore, segnala crisi e
autosufficienza e permette di acquistare settori costieri unici con nuovo suolo
edificabile generato a budget.

```bash
npm install
npm start            # poi apri http://localhost:8020/
npm test             # 181 test unitari e di integrazione
npm run bench        # costo del mesher per chunk
npm run typecheck
npm run build
```

## Convenzioni

Mondo **Z-up**: `x` = est, `y` = nord, `z` = altezza. Il piano di terra è `(x, y)`.
Un voxel = una cella edificabile. `512×512×64` significa quindi una griglia di
chunk `16×16×2`, con chiave `"cx,cy,cz"`.

Le coordinate negative sono valide: il mondo non ha limiti prefissati e cresce
aggiungendo chunk alla mappa sparsa.

## Struttura

| Percorso | Ruolo |
| --- | --- |
| [src/world/VoxelWorld.ts](src/world/VoxelWorld.ts) | API pubblica: `setBlock`, `getBlock`, `setData`, `getData`, `ensureChunk`, `flush` |
| [src/world/Chunk.ts](src/world/Chunk.ts) | `blocks` e `data`, due `Uint8Array(32768)` allocati una volta sola |
| [src/world/visualBlock.ts](src/world/visualBlock.ts) | Packing del byte visuale: 5 bit di palette e 3 bit di grammatica sci-fi |
| [src/world/scenes/cityScene.ts](src/world/scenes/cityScene.ts) | Scene deterministiche a passi con budget |
| [src/engine/mesher/greedyMesher.ts](src/engine/mesher/greedyMesher.ts) | Greedy meshing puro, zero import da Three |
| [src/engine/mesher/buildPaddedVolume.ts](src/engine/mesher/buildPaddedVolume.ts) | Chunk + tutti i 26 vicini immediati → volume 34³ |
| [src/engine/ChunkRenderer.ts](src/engine/ChunkRenderer.ts) | Una geometria per chunk, coda a priorità, culling, upload a budget |
| [src/engine/VoxelMaterial.ts](src/engine/VoxelMaterial.ts) | Unico `ShaderMaterial`, pannelli sci-fi world-space, emissione, AO e nebbia |
| [src/engine/inspect.ts](src/engine/inspect.ts) | Viste di ispezione in TS puro: velo a retino, fetta a quota, sezione, isolato |
| [src/engine/themes/](src/engine/themes/) | I temi grafici: 32 colori più l'atmosfera, applicati senza rimeshare |
| [src/engine/IsoCameraController.ts](src/engine/IsoCameraController.ts) | Ortografica isometrica: scatti di 90°, zoom, pan vincolato |
| [src/engine/InfluenceOverlay.ts](src/engine/InfluenceOverlay.ts) | Raggi dei catalizzatori e perimetri dei settori sbloccati |
| [src/engine/InspectGuides.ts](src/engine/InspectGuides.ts) | Le linee che dicono dove è puntata una vista: riquadro, sezione, colonna a fuoco |
| [src/engine/PlacementCursor.ts](src/engine/PlacementCursor.ts) | Segnaposto del piazzamento: leggibile a distanza e mai coperto dal rilievo |
| [src/ui/GameHud.ts](src/ui/GameHud.ts) | HUD Cozy City: risorse, costruzione, policy, tempo e feedback |
| [src/ui/ControlsHint.ts](src/ui/ControlsHint.ts) | Aiuto contestuale del primo avvio, riapribile con `?` |
| [src/ui/DebugOverlay.ts](src/ui/DebugOverlay.ts) | Overlay delle misure, attivo con `F3` o `?debug=1` |
| [src/ui/GrowthOverlay.ts](src/ui/GrowthOverlay.ts) | Overlay dedicato a `?debug=1&grow=1` |
| [src/ui/InspectOverlay.ts](src/ui/InspectOverlay.ts) | Referto tecnico delle viste: colonna a fuoco, isolato, densità del retino |
| [src/ui/ViewMenuModel.ts](src/ui/ViewMenuModel.ts) | Il menu delle viste come lo vede il giocatore: etichette, targa della vista attiva, barra dei livelli, regola dello strumento |
| [src/world/terrain/](src/world/terrain/) | Generatore di isole procedurali (vedi sotto) |
| [src/sim/](src/sim/) | Simulazione a tick: risorse, campo di desiderabilità, decisioni (vedi sotto) |

## Contratti che il resto del progetto può dare per assodati

- **Il renderer legge solo `blocks`.** Nessun file di `src/engine/` tocca `data`.
- **`setData` non marca sporco nulla**: scrivere sul layer di simulazione non
  provoca mai un rebuild di mesh. Solo `setBlock` invalida la geometria.
- **Aggiungere chunk non rialloca quelli esistenti**: gli `Uint8Array` nascono
  nel costruttore di `Chunk` e non vengono mai sostituiti.
- **Il colore vive solo nell'uniform.** I vertici portano l'indice di palette
  (`aPalette`), la grammatica (`aSurface`) e la direzione (`aFace`), mai un RGB. `aAO` e'
  geometria (0..3), non un colore: cambia la luce degli angoli senza invalidare
  i temi.
- **Il mesher non conosce Three.js.** Nel bundle di produzione il worker pesa
  8,64 kB proprio perché non se lo trascina dietro.

## Parametri URL

La radice `/` avvia l'esperienza completa: isola, crescita e HUD giocabile. Gli
strumenti tecnici partono nascosti e si aprono con `F3`; i parametri seguenti
permettono di isolare le scene di verifica.

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` apre subito overlay e hotkey tecniche; `F3` li alterna a runtime |
| `scene` | — | Isola una scena `city`, `noise` (caso peggiore) o `slab` |
| `seed` | `1337` | Seed della generazione |
| `size` | `512` | Lato del mondo in voxel |
| `height` | `64` | Altezza del mondo in voxel |
| `terrain` | — | `<seed>` sostituisce la scena urbana con un'isola 512×512 |
| `sim` | — | `1` accende la scena di simulazione (implica l'isola) |
| `theme` | `natural` | `natural`, `pastel`, `neon`, `industrial`, `scifi`, `enchanted`, `diorama` |
| `grow` | `1` alla radice | `1` avvia esplicitamente l'MVP giocabile |
| `inspect` | — | `xray`, `slice`, `section`, `block`: apre una vista, anche senza `debug` |
| `slice` | — | Quota della fetta; senza, segue il suolo che si sta guardando |

Tasti: `Q`/`E` ruota di 90° attorno al punto di terra sotto al mouse, rotella
zoom, drag destro o `WASD` pan, `F` inquadra tutto, `V` cicla le viste,
`[`/`]` (o `PageDown`/`PageUp`) muovono la quota della fetta — `Shift` per un
piano intero — `Esc` annulla lo strumento e `F3` alterna il pannello tecnico.
Con il debug visibile, `G` aggiunge 64 chunk, `R` fa il rebuild, `C` azzera i
picchi, `B` colora le colonne per bioma (solo in scena terreno). In scena
simulazione: `T` un tick, `P` avvia o ferma il passo automatico, `M` cicla l'uso
mostrato.

## Guardare dentro la città

Una città matura è opaca: da inquadratura di gioco un isolato interno è un volume
dietro altri volumi. Quattro viste la aprono, e sono **comandi di gioco**, non
strumenti dell'harness: stanno nel dock sotto il pulsante *Views*, rispondono a
`V` senza `?debug=1`, e la barra dei livelli compare sul bordo sinistro quando la
vista taglia. Sono tutte lo stesso meccanismo — due predicati geometrici e un
retino ordinato su `gl_FragCoord` con `discard`, governati da tre uniform del
materiale unico. Nessuna geometria nuova, nessun rimesh, nessuno slot di palette
in più.

| Vista | `?inspect=` | Cosa apre |
| --- | --- | --- |
| **X-ray** | `xray` | Vela ciò che sta fra la camera e la colonna a fuoco, dentro una finestra di `INSPECT.xraySpan` colonne attorno a lei: si legge la sagoma davanti *e* il tessuto dietro. Essendo una finestra di **mondo**, si legge da vicino |
| **Levels** | `slice` | Taglia sopra una quota — la città al piano *n*, come in Going Medieval e Timberborn |
| **Cutaway** | `section` | Taglia lungo un asse della griglia stradale, dal lato della camera: il piano cade su una carreggiata e mostra il fronte degli isolati |
| **Block focus** | `block` | Vela tutto fuori dall'isolato sotto il cursore, che resta così nel suo contesto invece di finire su fondo neutro |

Il fuoco **si aggancia**: le viste seguono la colonna sotto il cursore finché il
cursore è sulla canvas, e quando esce — per raggiungere il dock, o perché si è
aperta una carta evento — tengono l'ultima invece di saltare. Prendere in mano
uno strumento chiude una vista che taglia, perché sotto un taglio si
piazzerebbe alla cieca; le viste a velo sopravvivono, dato che lì il suolo si
legge ancora.

Velare e tagliare sono la stessa manopola: a densità 1 il retino scarta ogni
pixel. Un taglio ha bisogno delle back-face per tapparsi — `DoubleSide` e
`gl_FrontFacing` — e mostra un guscio vuoto, perché il mesher non emette facce
interne. Finché un taglio è attivo le ombre proiettate si spengono: il piano
appena scoperto resterebbe altrimenti all'ombra dei piani che si sono nascosti.

Alla radice, oppure con `?grow=1`, il Cozy HUD mostra risorse e variazioni in alto,
azioni di costruzione in basso e policy in un drawer laterale. Il dock è diviso
per funzione — crescita, connessioni, identità — e i catalizzatori ancora fuori
portata restano visibili invece di sparire: sapere che il porto esiste e quanto
costa è ciò che fa pianificare. Tooltip e scheda al cursore dicono raggio, usi
favoriti, usi penalizzati e tipologie che quel ruolo può far comparire, prima del
click. Selezione, errori e istruzioni di piazzamento compaiono come feedback
contestuale sopra il dock.
Il pulsante con la tavolozza apre un selettore compatto per cambiare tema a caldo
senza passare dall'overlay di debug.

Gli edifici condividono una grammatica futuristica indipendente dal tema:
habitat modulari, megastrutture industriali e landmark civici assegnano ai voxel
tipi di superficie deterministici. Il mesher li propaga come `aSurface`; lo
shader proietta pannelli, vetri, portali e circuiti sulle coordinate della faccia,
quindi il disegno continua attraverso voxel e quad greedy senza nuove draw call.

## Misure

> ⚠️ **Da rimisurare.** Il passaggio al terreno a celle (`TERRAIN.cellSize`) e
> alla scala di contenuto raddoppiata ha cambiato il percorso caldo: l'isola è
> passata da 256 a 512 di lato, un edificio è fatto di circa otto volte i voxel
> di prima e ce ne stanno circa un quarto per unità d'area, e le celle piatte si
> fondono nel greedy mesher molto meglio delle colonne a quota libera. La somma
> di questi effetti non è deducibile: i numeri qui sotto sono quelli *prima* del
> cambio e vanno rifatti a mano su questa macchina prima di essere citati.

Verificate su questa macchina (Windows 11, Edge headless su renderer software —
una GPU vera darà numeri migliori, non peggiori), scena `city` a 1600×900.

**Regime, 512×512×64 al 19,9 percento di riempimento** (3 344 416 voxel pieni):

| Metrica | Valore | Criterio |
| --- | --- | --- |
| draw call | **376** | < 400 ✅ |
| triangoli | 87 756 | — |
| geometrie | 2,84 MB | — |
| chunk | 448 allocati, 376 visibili | — |
| main thread, picco | **0,60 ms** | < 4 ms ✅ |
| fps | 350 (1% low 204) | ≥ 60 ✅ |

**Crescita a runtime** (`G`, da 448 a 512 chunk):

| Metrica | Valore | Criterio |
| --- | --- | --- |
| fps minimo durante | **138,9** | ≥ 50 ✅ |
| main thread, picco | 3,5 ms | < 4 ms ✅ |
| assestamento | 717 ms | — |
| draw call dopo | 403 | inquadratura più larga |

**Rebuild totale dei 512 chunk** (`R`):

| Metrica | Valore | Criterio |
| --- | --- | --- |
| mesher, media per chunk | **1,28 ms** | < 8 ms ✅ |
| mesher, massimo per chunk | **5,20 ms** | < 8 ms ✅ |
| main thread, picco | 4,0 ms | al limite |
| totale | 2,1 s per 512 chunk | — |

**Bench del mesher dopo AO** (`npm run bench`, media per chunk):

| Caso | Media |
| --- | --- |
| vuoto | 1,75 ms |
| edifici (scena di accettazione) | **1,76 ms** |
| chunk pieno | 1,68 ms |
| rumore al 20 percento | 5,64 ms |
| scacchiera (caso peggiore assoluto) | 18,06 ms |

Questi valori sono una misura reale della macchina corrente, non una stima. Il
costo dell'AO dipende dalla forma: aggiunge campioni alle facce emesse e spezza
il merge dove gli angoli differiscono; confronti fra run diverse restano
indicativi per la variabilita' del runner e del benchmark.

**Palette a caldo**: cambiando un colore in
[src/engine/palette.json](src/engine/palette.json) l'HMR riscrive l'uniform e la
scena cambia colore con **zero job di meshing** e le stesse 504 geometrie. Anche
un reload completo funziona, perché i colori non sono mai dentro le mesh.

**Temi**: la stessa proprietà regge un intero cambio di look. Un tema in
[src/engine/themes/](src/engine/themes/) è 32 colori più l'atmosfera — fondo,
nebbia, luce per orientamento di faccia, tone mapping — e applicarlo riscrive
solo uniform e stato del renderer. Con `?debug=1` i tasti `1`..`9` lo cambiano a
caldo: quad e byte di geometria nell'overlay non si muovono di un'unità.
`?theme=<id>` vale anche senza `debug`. Disponibili: `natural`, `pastel`,
`neon`, `industrial`, `scifi`, `enchanted`.

### Due cose da sapere sui numeri

**Il riempimento va strutturato.** Il 20 percento richiesto è raggiungibile a 60
fps solo perché gli edifici sono box solidi, che il greedy meshing fonde in pochi
quad. Con riempimento casuale uniforme al 20 percento (`?scene=noise`) ogni voxel
espone quasi tutte le sue facce: è il caso peggiore teorico dell'algoritmo, il
bench lo misura a 9,6 ms per chunk contro 2,2, e non farà 60 fps su nessuna GPU
integrata. Resta disponibile come misura del tetto di throughput, non come
criterio.

**Le draw call seguono l'inquadratura.** I 376 sotto soglia valgono per
l'inquadratura da gioco (metà lato del mondo), che è quella di partenza.
Premendo `F` si inquadra tutta la città e il frustum contiene tutti i suoi ~450
chunk: sopra le 400, per costruzione, dato che la specifica fissa chunk da 32³ e
una draw call per chunk.

## Come rifare la verifica

```bash
npm start
# apri http://localhost:8020/ e leggi l'overlay:
#  - attendi che "coda" arrivi a 0 + 0, poi premi C per azzerare i picchi
#  - "draw call" e "main ... max" sono i due numeri dei criteri
#  - premi G e guarda fps e main durante l'aggiunta dei 64 chunk
#  - premi R per il rebuild totale e leggi "mesher max"
#  - cambia un colore in src/engine/palette.json e salva
#  - premi 1..9 per cambiare tema: "quad" e "geometrie" non devono muoversi
```

Con `?debug=1` sono esposti anche `__voxelStats()`, `__voxelReset()`,
`__voxelExpand()`, `__voxelRebuildAll()`, `__voxelTheme(id?)` e
`__voxelInspect(mode?, z?)` sull'oggetto globale, per misurare dalla console o da
uno strumento headless.

## Terreno procedurale

`src/world/terrain/` genera un'isola deterministica da un seed, la scrive nel
`VoxelWorld` con la sola API pubblica (`setBlock`, `ensureChunk`) e produce in
parallelo una mappa 2D per colonna che dice dove si può costruire.

```ts
const { map, buildableColumns } = generateIsland(world, 1337, {
  minX: 0, minY: 0, sizeX: 256, sizeY: 256,
});
map.columnAt(120, 96); // { height, biome, slope, buildable }
```

| Percorso | Ruolo |
| --- | --- |
| [config.ts](src/world/terrain/config.ts) | **Ogni** soglia, frequenza e ampiezza. Niente numeri altrove |
| [heightField.ts](src/world/terrain/heightField.ts) | 4 ottave di simplex × maschera radiale deformata |
| [biomes.ts](src/world/terrain/biomes.ts) | Classificazione da altezza e pendenza, edificabilità, stratigrafia |
| [IslandGenerator.ts](src/world/terrain/IslandGenerator.ts) | `generateIsland`, `expandIsland`, scrittura dei voxel |
| [TerrainMap.ts](src/world/terrain/TerrainMap.ts) | Mappa sparsa per colonna, chunkata 32×32 come il mondo |
| [terrain.worker.ts](src/world/terrain/terrain.worker.ts) | Generazione fuori dal main thread, un blocco per volta |
| [TerrainStreamer.ts](src/world/terrain/TerrainStreamer.ts) | Riceve i blocchi e li applica a budget di frame |
| [decor.ts](src/world/terrain/decor.ts) | Alberi voxel deterministici, candidati per cella e scrittura ritagliata al blocco |

Gli alberi usano una griglia di celle 6×6 con un jitter interno 2×2. Ogni blocco
valuta anche l'anello di due colonne attorno al proprio rettangolo e scrive solo
i voxel che gli appartengono: una chioma che attraversa un confine non dipende
mai dall'ordine con cui arrivano i blocchi. Non crescono su oceano, spiaggia o
roccia; `plain`, `forest` e `hill` hanno densità diverse in `config.ts`.

La forma è una tabella, `TREE_SHAPES` in `config.ts`: una specie è un tronco più
una pila di dischi, ognuno con raggio, smusso degli angoli e tinta. Sono fra 56 e
83 voxel per albero — la conifera a gradoni alterna dischi larghi e stretti, la
latifoglia chiude una chioma tonda, l'autunnale la stessa in tinte calde — e la
chioma si schiarisce salendo, che è gratis perché il colore vive nell'uniform.
Aggiungere una specie è aggiungere una riga: il raggio d'ingombro si deduce dal
profilo, quindi l'anello valutato dai blocchi resta coerente da solo. Il tetto è
`2 · ring + jitterSize ≤ cellSize`, cioè la chioma più larga sta dentro la sua
cella comunque cada il jitter.

### Contratti

- **Il generatore non conosce il rendering.** Nessun import di Three.js: nel
  bundle di produzione `terrain.worker` pesa 4,1 kB, palette e simplex inclusi.
- **`data` resta della simulazione.** La `TerrainMap` vive del tutto a parte e
  non tocca il secondo layer del `Chunk`.
- **La palette non è cambiata.** Restano 32 slot esatti, fissati dall'uniform
  `vec3[32]`: il terreno riusa gli indici esistenti, mappati in `BIOME_STRATA`.
- **Il contenuto di un blocco è funzione di `(seed, shape, ccx, ccy)`**, di
  nient'altro. Da qui il determinismo, l'indipendenza dall'ordine e la
  continuità al confine: non c'è cucitura da fare perché non c'è stato da cucire.
- **`expandIsland` eredita la maschera dalla mappa**, quindi il rettangolo nuovo
  continua la stessa costa invece di aprire una seconda isola. Senza mappa e
  senza `shape` esplicita si comporta come `generateIsland`.

### Grana: il terreno è fatto di cubi più grossi

Il terreno campiona e quantizza su una cella di `TERRAIN.cellSize` voxel per
lato — in pianta **e** in quota — mentre edifici e alberi restano a dettaglio di
un voxel. È l'unica cosa che dà la scala all'isola: con tutto sullo stesso passo
una chioma d'albero era larga quanto un edificio intero, e non si capiva se una
casa fosse una casa o un cespuglio.

Dentro una cella quota, bioma, pendenza ed edificabilità sono uguali per
costruzione. `ColumnBlock` resta però indicizzato **per colonna**: i valori si
replicano invece di accorciare gli array, così nessun consumatore a valle
— edificabilità, `TerrainMap`, opere di terra, picking, overlay — sa che la
grana è cambiata.

### Calibrazione

Il criterio "due celle adiacenti non differiscono di più di una cella" è un
vincolo di Lipschitz sul campo continuo, non una proprietà delle cuciture: se il
campo lo rispetta ovunque lo rispetta anche al confine. Le frequenze in
`config.ts` sono scelte perché il dislivello massimo misurato resti **sotto 0,8**
su otto seed — margine voluto, così ritoccare il rilievo non fa cadere il
criterio. `heightField.test.ts` è la rete di sicurezza.

**La verticale è tarata sull'orizzontale.** Il gradiente del campo vale rilievo
diviso raggio: un'isola larga il doppio con lo stesso rilievo è la stessa
montagna spalmata su due volte lo spazio — una frittella senza fianchi. La
taratura attuale vale per un'isola di lato **512**; cambiarlo significa muovere
insieme le quote assolute e le frequenze del rumore, non solo `TERRAIN_SIZE`.

Due tetti duri stanno nello stesso file: `warpAmount` sopra ~0,26 attaccherebbe
terra al bordo della region, e alzare `baseFrequency` o `maxHeight` consuma il
margine di Lipschitz.

### Misure

> ⚠️ **Da rimisurare**, per le stesse ragioni della tabella principale: questi
> numeri sono di un'isola 256×256 a grana fine, che non è più la scena che il
> progetto genera. La riga del picco durante lo streaming ha anche cambiato
> criterio: finché la prima scena non è a terra il budget è
> `LOADING_FRAME_BUDGET_MS` e non i 4 ms di regime — vedi
> [AGENTS.md](AGENTS.md), *Budget e pattern da evitare*.

Isola 256×256, `?debug=1&terrain=1337`, stessa macchina e stesso renderer
software delle misure sopra.

| Metrica | Valore | Criterio |
| --- | --- | --- |
| generazione nel worker | **20–41 ms** | < 800 ms ✅ |
| main thread, picco durante lo streaming | **2,8 ms** | < 4 ms ✅ |
| main thread, a regime | 0,30 ms | — |
| scrittura voxel, totale su main | 21–41 ms | — |
| ricolore per bioma, picco su main | 2,3 ms | < 4 ms ✅ |
| draw call | 64 | — |
| voxel pieni | 675k–695k | — |
| colonne edificabili | 8,0k–12,9k su 65,5k | — |

Il meshing parte prima che l'isola sia completa: campionando un frame alla volta
durante lo startup si vedono 32 chunk già meshati con 18 blocchi ancora in coda.

Con `?debug=1&terrain=<seed>` sono esposti anche `__terrainStats()`,
`__terrainBiomeView()` e `__terrainExpand()` sull'oggetto globale.

## Simulazione

`src/sim/` tiene risorse e popolazione, calcola un campo di desiderabilità per
cella e per **uso urbano**, e dice dove crescerebbe il prossimo edificio e con
quali usi. Il `Builder`, esterno alla simulazione, trasforma quelle decisioni in
edifici voxel a fasce e registra il risultato nello stato. Dettagli, contratti e
misure in [src/sim/README.md](src/sim/README.md).

La fase 2 aggiunge sette ruoli di catalizzatore, distretti emergenti dai campi
sovrapposti, policy con costi ricorrenti e incompatibilità, forme edilizie
guidate dal profilo locale, decisioni periodiche e commercio esterno via porto.

La fase 3 separa tre cose che prima erano una sola: l'**uso urbano** (cosa si fa
in quella colonna: residenziale, commerciale, industriale, civico), il
**catalizzatore** (cosa il giocatore ha piazzato, che ora influenza più usi
insieme e può anche penalizzarne uno) e la **tipologia** (che forma prende
l'edificio che ne nasce). Da qui il commercio interno come seconda catena
economica, gli edifici a uso misto e un catalogo di tipologie scelte dal luogo.

```ts
let state = createSimState();
state = addCatalyst(state, {
  x: 96, y: 96, kind: 'market',
  class: BUILDING_CLASS.residential, strength: 220, radius: 24,
});
state = tick(state, terrainMap);        // puro: nuovo stato, input intatto
nextBuildSites(state, terrainMap, 10);  // [{ x, y, class, mixed, score }, …]
```

### Contratti

- **Non importa Three.js e non importa niente da `src/engine/`.** Gira in Node:
  i test non hanno bisogno di un DOM, di una GPU o di un browser.
- **`tick` è puro** — nessuna mutazione dell'input, nessun `Date.now()`, nessun
  `Math.random()` — **e non tocca il campo di desiderabilità.** Il costo di un
  tick non dipende quindi dall'estensione della mappa.
- **Il campo si ricalcola solo dove cambia.** Un catalizzatore tocca il quadrato
  di Chebyshev del suo raggio (raggio 20 → 1681 celle), un edificio nuovo il
  quadrato del raggio breve. Non esiste una passata sull'intera mappa.
- **`blocks` non viene mai toccato.** L'unica scrittura verso il mondo va in
  `VoxelWorld.data`, che per contratto non marca sporco niente.
- **`balance.ts` è l'unico file con dei numeri.** Le policy sono moltiplicatori
  sui pesi e vivono nello stato, non nel file di bilanciamento.

### Misure

`npm run bench`, isola 256×256 con 50 catalizzatori e 400 edifici, Node 22.

| Operazione | Media | Criterio |
| --- | --- | --- |
| **tick** | **0,0010 ms** | < 3 ms ✅ |
| modifica di un catalizzatore di raggio 20 (1681 celle) | 0,22 ms | — |
| `setPolicyActive` su un peso di desiderabilità | 6,4 ms | azione del giocatore |
| `nextBuildSites`, primi 10 su tutto il campo | 4,0 ms | azione del giocatore |

Tutte e quattro le righe sono state rimisurate dopo l'estensione a quattro usi, e
sono salite di circa due volte e mezza rispetto alla prima stesura — `tick`
compreso, che con quattro usi legge un contatore in più e poco altro: nel mezzo è
cambiata anche la macchina. Il confronto che regge è quello relativo al tick, e
lì entrambe le operazioni di campo sono *scese*. La nota in
[src/sim/README.md](src/sim/README.md#misure) riporta i numeri per intero.

Con `?debug=1&sim=1` la scena genera l'isola, piazza i catalizzatori da script e
materializza un nucleo di 30 edifici voxel; l'overlay mostra stock e delta per
tick, il ciclo del commercio interno, i conteggi per uso primario e secondario,
lo stato del builder, la heatmap del campo per uso e i prossimi dieci candidati.

## Microgeometria sci-fi

Il mesher usa coordinate intere firmate in unita' di `1/16` di voxel. I dettagli
architettonici — portali, parapetti, cornici luminose, mensole, nervature e lame
— vengono accodati alla geometria greedy dello stesso chunk: nessuna draw call in
piu', nessuna geometria separata, continuita' letta dal volume paddato. In
`?debug=1` la riga `detail` dell'overlay separa questi quad dal totale.

Un dettaglio non e' mai un prisma per voxel, ma un prisma per **corsa** di voxel
contigui che chiedono lo stesso dettaglio: le facce interne alla corsa non
sarebbero comunque visibili, quindi fondere non cambia un pixel e vale circa un
fattore tre sui chunk edificati.

**Quanto costa in geometria.** Il vocabolario e' denso, e il conto e' esatto e
deterministico — non e' una misura di tempo:

| Scena | Riempimento | Quad base | Quad di dettaglio | Totale |
| --- | --- | --- | --- | --- |
| isolato fitto, 42 edifici in un chunk | 10,4% | 3 021 | 13 890 | +460% |
| isolato rado, edifici distanziati | 3,0% | 861 | 3 985 | +463% |

Il rapporto non dipende dalla densita': e' una proprieta' delle regole, non della
scena. Il tetto di `MAX_DETAIL_QUADS_PER_CHUNK` sta a 16 384 apposta per restare
**sopra** il caso denso e non troncare mai per davvero: troncare significa
fermarsi per priorita', cioe' far sparire industrial e civic a meta' chunk. Il
tetto serve solo a limitare la patologia — voxel isolati a scacchiera, dove
nessuna corsa fonde.

**Quanto costa in tempo.** Il meshing di un chunk edificato rallenta in modo
misurabile: circa **+45%** su un chunk rado e **+140%** su quello fitto, in un
A/B sulla stessa macchina e nella stessa run. Le tabelle di misura qui sopra sono
verificate a mano e **non** tengono ancora conto della microgeometria: vanno
rifatte sulla scena vera prima di considerarle valide.

## Fuori scope in questo prompt

Strade, pathfinding, salvataggio su disco, audio, cittadini simulati
individualmente, fiumi, grotte, vegetazione, supporto mobile.
