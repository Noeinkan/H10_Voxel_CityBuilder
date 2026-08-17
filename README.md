# H10 Voxel City Builder — motore

Motore di rendering voxel a chunk per una città isometrica. Nessuna logica di
gioco: storage sparso, greedy meshing in worker, un solo materiale a palette,
camera ortografica isometrica e harness di misura.

```bash
npm install
npm run dev          # poi apri http://localhost:5173/?debug=1
npm test             # 43 test unitari e di integrazione
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
| [src/engine/mesher/buildPaddedVolume.ts](src/engine/mesher/buildPaddedVolume.ts) | Chunk + sei piani di bordo → volume 34³ |
| [src/engine/ChunkRenderer.ts](src/engine/ChunkRenderer.ts) | Una geometria per chunk, coda a priorità, culling, upload a budget |
| [src/engine/VoxelMaterial.ts](src/engine/VoxelMaterial.ts) | Unico `ShaderMaterial`, palette come `uniform vec3[32]` |
| [src/engine/IsoCameraController.ts](src/engine/IsoCameraController.ts) | Ortografica isometrica: scatti di 90°, zoom, pan vincolato |
| [src/ui/DebugOverlay.ts](src/ui/DebugOverlay.ts) | Overlay delle misure, attivo con `?debug=1` |
| [src/sim/](src/sim/) | Riservata alla simulazione, vuota in questo prompt |

## Contratti che il resto del progetto può dare per assodati

- **Il renderer legge solo `blocks`.** Nessun file di `src/engine/` tocca `data`.
- **`setData` non marca sporco nulla**: scrivere sul layer di simulazione non
  provoca mai un rebuild di mesh. Solo `setBlock` invalida la geometria.
- **Aggiungere chunk non rialloca quelli esistenti**: gli `Uint8Array` nascono
  nel costruttore di `Chunk` e non vengono mai sostituiti.
- **Il colore vive solo nell'uniform.** I vertici portano l'indice di palette
  (`aPalette`) e la direzione della faccia (`aFace`), mai un RGB.
- **Il mesher non conosce Three.js.** Nel bundle di produzione il worker pesa
  2,7 kB proprio perché non se lo trascina dietro.

## Parametri URL

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` accende overlay e hotkey |
| `scene` | `city` | `city`, `noise` (caso peggiore), `slab` |
| `seed` | `1337` | Seed della generazione |
| `size` | `512` | Lato del mondo in voxel |
| `height` | `64` | Altezza del mondo in voxel |

Tasti: `Q`/`E` ruota di 90°, rotella zoom, drag destro o `WASD` pan, `F` inquadra
tutto, `G` aggiunge 64 chunk a runtime, `R` rebuild totale, `C` azzera i picchi.

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

**Bench del mesher** (`npm run bench`, media per chunk):

| Caso | Media |
| --- | --- |
| vuoto | 2,04 ms |
| edifici (scena di accettazione) | **2,19 ms** |
| chunk pieno | 2,32 ms |
| rumore al 20 percento | 9,58 ms |
| scacchiera (caso peggiore assoluto) | 15,58 ms |

**Palette a caldo**: cambiando un colore in
[src/engine/palette.json](src/engine/palette.json) l'HMR riscrive l'uniform e la
scena cambia colore con **zero job di meshing** e le stesse 504 geometrie. Anche
un reload completo funziona, perché i colori non sono mai dentro le mesh.

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
# apri http://localhost:5173/?debug=1 e leggi l'overlay:
#  - attendi che "coda" arrivi a 0 + 0, poi premi C per azzerare i picchi
#  - "draw call" e "main ... max" sono i due numeri dei criteri
#  - premi G e guarda fps e main durante l'aggiunta dei 64 chunk
#  - premi R per il rebuild totale e leggi "mesher max"
#  - cambia un colore in src/engine/palette.json e salva
```

Con `?debug=1` sono esposti anche `__voxelStats()`, `__voxelReset()`,
`__voxelExpand()` e `__voxelRebuildAll()` sull'oggetto globale, per misurare
dalla console o da uno strumento headless.

## Fuori scope in questo prompt

Terreno procedurale, simulazione, edifici come entità, policy, catalizzatori, UI
di gioco, post-processing, audio, salvataggio, input di piazzamento, supporto
mobile.
