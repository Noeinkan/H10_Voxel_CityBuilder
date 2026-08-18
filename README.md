# H10 Voxel City Builder — motore

Motore di rendering voxel a chunk per una città isometrica: storage sparso,
greedy meshing in worker, un solo materiale a palette, camera ortografica
isometrica, simulazione e crescita automatica degli edifici.

```bash
npm install
npm run dev          # poi apri http://localhost:8010/?debug=1
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
| [src/world/scenes/cityScene.ts](src/world/scenes/cityScene.ts) | Scene deterministiche a passi con budget |
| [src/engine/mesher/greedyMesher.ts](src/engine/mesher/greedyMesher.ts) | Greedy meshing puro, zero import da Three |
| [src/engine/mesher/buildPaddedVolume.ts](src/engine/mesher/buildPaddedVolume.ts) | Chunk + tutti i 26 vicini immediati → volume 34³ |
| [src/engine/ChunkRenderer.ts](src/engine/ChunkRenderer.ts) | Una geometria per chunk, coda a priorità, culling, upload a budget |
| [src/engine/VoxelMaterial.ts](src/engine/VoxelMaterial.ts) | Unico `ShaderMaterial`, palette, luce per faccia, AO per vertice e nebbia |
| [src/engine/themes/](src/engine/themes/) | I temi grafici: 32 colori più l'atmosfera, applicati senza rimeshare |
| [src/engine/IsoCameraController.ts](src/engine/IsoCameraController.ts) | Ortografica isometrica: scatti di 90°, zoom, pan vincolato |
| [src/ui/DebugOverlay.ts](src/ui/DebugOverlay.ts) | Overlay delle misure, attivo con `?debug=1` |
| [src/ui/GrowthOverlay.ts](src/ui/GrowthOverlay.ts) | Overlay dedicato a `?debug=1&grow=1` |
| [src/world/terrain/](src/world/terrain/) | Generatore di isole procedurali (vedi sotto) |
| [src/sim/](src/sim/) | Simulazione a tick: risorse, campo di desiderabilità, decisioni (vedi sotto) |

## Contratti che il resto del progetto può dare per assodati

- **Il renderer legge solo `blocks`.** Nessun file di `src/engine/` tocca `data`.
- **`setData` non marca sporco nulla**: scrivere sul layer di simulazione non
  provoca mai un rebuild di mesh. Solo `setBlock` invalida la geometria.
- **Aggiungere chunk non rialloca quelli esistenti**: gli `Uint8Array` nascono
  nel costruttore di `Chunk` e non vengono mai sostituiti.
- **Il colore vive solo nell'uniform.** I vertici portano l'indice di palette
  (`aPalette`) e la direzione della faccia (`aFace`), mai un RGB. `aAO` e'
  geometria (0..3), non un colore: cambia la luce degli angoli senza invalidare
  i temi.
- **Il mesher non conosce Three.js.** Nel bundle di produzione il worker pesa
  3,49 kB proprio perché non se lo trascina dietro.

## Parametri URL

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` accende overlay e hotkey |
| `scene` | `city` | `city`, `noise` (caso peggiore), `slab` |
| `seed` | `1337` | Seed della generazione |
| `size` | `512` | Lato del mondo in voxel |
| `height` | `64` | Altezza del mondo in voxel |
| `terrain` | — | `<seed>` sostituisce la scena urbana con un'isola 256×256 |
| `sim` | — | `1` accende la scena di simulazione (implica l'isola) |
| `theme` | `natural` | `natural`, `pastel`, `neon`, `industrial`, `scifi`, `enchanted` |
| `grow` | — | `1` avvia l'MVP giocabile; `debug=1` aggiunge l'overlay tecnico |

Tasti: `Q`/`E` ruota di 90°, rotella zoom, drag destro o `WASD` pan, `F` inquadra
tutto, `G` aggiunge 64 chunk a runtime, `R` rebuild totale, `C` azzera i picchi,
`B` colora le colonne per bioma (solo in scena terreno). In scena simulazione:
`T` un tick, `P` avvia o ferma il passo automatico, `M` cicla la classe mostrata.

Con `?grow=1` la toolbar permette di piazzare catalizzatori con un click sul
terreno, acquistare settori costieri, attivare policy e controllare pausa e
velocita'. Le azioni consumano fondi e spiegano quando terreno, popolazione o
distanza minima non ne permettono l'esecuzione.

## Misure

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
npm run dev
# apri http://localhost:8010/?debug=1 e leggi l'overlay:
#  - attendi che "coda" arrivi a 0 + 0, poi premi C per azzerare i picchi
#  - "draw call" e "main ... max" sono i due numeri dei criteri
#  - premi G e guarda fps e main durante l'aggiunta dei 64 chunk
#  - premi R per il rebuild totale e leggi "mesher max"
#  - cambia un colore in src/engine/palette.json e salva
#  - premi 1..9 per cambiare tema: "quad" e "geometrie" non devono muoversi
```

Con `?debug=1` sono esposti anche `__voxelStats()`, `__voxelReset()`,
`__voxelExpand()`, `__voxelRebuildAll()` e `__voxelTheme(id?)` sull'oggetto
globale, per misurare dalla console o da uno strumento headless.

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

### Calibrazione

Il criterio "due colonne adiacenti non differiscono di più di 1 in altezza" è un
vincolo di Lipschitz sul campo continuo, non una proprietà delle cuciture: se il
campo lo rispetta ovunque lo rispetta anche al confine. Le frequenze in
`config.ts` sono scelte perché il dislivello massimo misurato resti **sotto 0,8**
su otto seed — margine voluto, così ritoccare il rilievo non fa cadere il
criterio. `heightField.test.ts` è la rete di sicurezza.

Due tetti duri stanno nello stesso file: `warpAmount` sopra ~0,26 attaccherebbe
terra al bordo della region, e alzare `baseFrequency` o `maxHeight` consuma il
margine di Lipschitz.

### Misure

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
cella e per classe di edificio, e dice dove crescerebbe il prossimo edificio.
Il `Builder`, esterno alla simulazione, trasforma quelle decisioni in edifici
voxel a fasce e registra il risultato nello stato. Dettagli, contratti e misure
in [src/sim/README.md](src/sim/README.md).

```ts
let state = createSimState();
state = addCatalyst(state, { x: 96, y: 96, class: BUILDING_CLASS.residential, strength: 220, radius: 24 });
state = tick(state, terrainMap);        // puro: nuovo stato, input intatto
nextBuildSites(state, terrainMap, 10);  // [{ x, y, class, score }, …]
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
| **tick** | **0,0004 ms** | < 3 ms ✅ |
| modifica di un catalizzatore di raggio 20 (1681 celle) | 0,09 ms | — |
| `setPolicyActive` su un peso di desiderabilità | 3,6 ms | azione del giocatore |
| `nextBuildSites`, primi 10 su tutto il campo | 2,5 ms | azione del giocatore |

Con `?debug=1&sim=1` la scena genera l'isola, piazza i catalizzatori da script e
materializza un nucleo di 24 edifici voxel; l'overlay mostra stock e delta per
tick, stato del builder, heatmap del campo per classe e i prossimi dieci candidati.

## Fuori scope in questo prompt

Strade, pathfinding, UI di gioco, input del giocatore, salvataggio su disco,
audio, economia con
prezzi o commercio, cittadini simulati individualmente, post-processing, fiumi,
grotte, vegetazione, supporto mobile.
