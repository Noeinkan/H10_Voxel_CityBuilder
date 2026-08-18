# Indice del progetto

Mappa file per file di `src/`. Il *perché* delle scelte sta nei README
([README.md](README.md), [src/sim/README.md](src/sim/README.md)); le regole
operative in [CLAUDE.md](CLAUDE.md). Qui c'è solo *dove sta cosa*.

9 328 righe di TypeScript, 15 file di test (146 test), 2 file di bench.

## Direzione delle dipendenze

```
                       main.ts  ──────────────┐
                          │                   │  (l'unico che conosce tutti)
        ┌─────────────────┼─────────────────┐ │
        ▼                 ▼                 ▼ ▼
    src/engine/       src/world/         src/sim/        src/ui/
    (Three.js)     (nessun Three)     (nessun Three,    (DOM puro)
        │                 ▲             nessun engine)
        └── legge ────────┘                 │
            Chunk.blocks                    └── scrive solo Chunk.data
```

`src/engine/mesher/` e `src/world/terrain/` non importano Three.js: girano nei
worker. `src/sim/` gira in Node senza DOM né GPU.

## Radice

| File | Ruolo |
| --- | --- |
| [index.html](index.html) | Pagina unica, `#app`, monta `src/main.ts` |
| [package.json](package.json) | Script npm; dipendenze: `three`, `simplex-noise` |
| [tsconfig.json](tsconfig.json) | `strict` + flag extra; `noUncheckedIndexedAccess` off di proposito |
| [vite.config.ts](vite.config.ts) | Vite + Vitest insieme; worker in formato ES, test in ambiente `node` |
| [src/main.ts](src/main.ts) | Bootstrap, ciclo di frame a budget, harness di misura, hook globali di debug (574 righe) |

## `src/world/` — storage e mondo

| File | Ruolo | Esporta |
| --- | --- | --- |
| [VoxelWorld.ts](src/world/VoxelWorld.ts) | Storage sparso a chunk, dirty set, AABB, cache dell'ultimo chunk | `VoxelWorld`, `WorldBounds` |
| [Chunk.ts](src/world/Chunk.ts) | Due `Uint8Array(32768)` — `blocks` (rendering) e `data` (simulazione) — allocati una volta sola | `Chunk` |
| [chunkCoords.ts](src/world/chunkCoords.ts) | Costanti e conversioni di coordinate, indici delle facce | `CHUNK`, `PADDED`, `idx`, `paddedIdx`, `toChunk`, `toLocal`, `keyOf`, `FACE_*` |
| [rng.ts](src/world/rng.ts) | PRNG deterministico per la generazione | `mulberry32`, `hashCoords` |
| [scenes/cityScene.ts](src/world/scenes/cityScene.ts) | Scene deterministiche a passi con budget: `city`, `noise`, `slab` | `createScene`, `SceneGenerator`, `SceneKind`, `TILE`, `STREET`, `LOT` |

API pubblica del mondo: `setBlock`/`getBlock` (rendering, marca sporco),
`setData`/`getData` (simulazione, non marca niente), `ensureChunk`, `flush`,
`markAllDirty`.

## `src/world/terrain/` — isola procedurale

Genera un'isola deterministica da un seed, la scrive nel `VoxelWorld` con la sola
API pubblica, e produce in parallelo una mappa 2D per colonna.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/terrain/config.ts) | **Ogni** soglia, frequenza, ampiezza e stratigrafia. Niente numeri altrove | `TERRAIN`, `BIOME`, `BIOME_NAMES`, `BIOME_STRATA`, `BUILDABLE_BIOMES`, `WATER_IDS` |
| [heightField.ts](src/world/terrain/heightField.ts) | 4 ottave di simplex × maschera radiale deformata | `HeightField` |
| [biomes.ts](src/world/terrain/biomes.ts) | Bioma da altezza e pendenza, edificabilità, colore per profondità | `classifyBiome`, `isBuildable`, `paletteForDepth` |
| [region.ts](src/world/terrain/region.ts) | Region, `IslandShape`, allineamento ai chunk di colonna | `Region`, `IslandShape`, `shapeFromRegion`, `alignRegion`, `chunkSpanOf` |
| [columnBlock.ts](src/world/terrain/columnBlock.ts) | Blocco 32×32 di colonne, in forma trasferibile fra worker e main | `ColumnBlock`, `columnIndex`, `blockTransferables` |
| [IslandGenerator.ts](src/world/terrain/IslandGenerator.ts) | `generateIsland`, `expandIsland`, scrittura dei voxel | `generateIsland`, `expandIsland`, `generateColumnBlock`, `writeBlockColumns` |
| [TerrainMap.ts](src/world/terrain/TerrainMap.ts) | Mappa sparsa per colonna, chunkata 32×32 come il mondo | `TerrainMap`, `TerrainColumn`, `TerrainColumnChunk` |
| [terrainMessages.ts](src/world/terrain/terrainMessages.ts) | Protocollo main ↔ worker | `TerrainJob`, `BlockMessage`, `DoneMessage` |
| [terrain.worker.ts](src/world/terrain/terrain.worker.ts) | Generazione fuori dal main thread, un blocco per volta (4,1 kB in bundle) | — |
| [TerrainStreamer.ts](src/world/terrain/TerrainStreamer.ts) | Riceve i blocchi e li applica a budget di frame; è un `SceneGenerator` | `TerrainStreamer` |
| [BiomeView.ts](src/world/terrain/BiomeView.ts) | Ricolore delle colonne per bioma, a passi con budget (tasto `B`) | `BiomeView` |

```ts
const { map, buildableColumns } = generateIsland(world, 1337, {
  minX: 0, minY: 0, sizeX: 256, sizeY: 256,
});
map.columnAt(120, 96); // { height, biome, slope, buildable }
```

## `src/engine/` — meshing e rendering

| File | Ruolo | Esporta |
| --- | --- | --- |
| [ChunkRenderer.ts](src/engine/ChunkRenderer.ts) | Una geometria per chunk, coda a priorità, frustum culling, upload a budget | `ChunkRenderer`, `ChunkRendererStats` |
| [MesherPool.ts](src/engine/MesherPool.ts) | Pool di worker, job in volo, statistiche del mesher | `MesherPool`, `MesherStats`, `ChunkMeshResult` |
| [VoxelMaterial.ts](src/engine/VoxelMaterial.ts) | Unico `ShaderMaterial`, palette come `uniform vec3[32]` | `createVoxelMaterial`, `VoxelMaterialHandle` |
| [IsoCameraController.ts](src/engine/IsoCameraController.ts) | Ortografica isometrica: scatti di 90°, zoom, pan vincolato all'AABB | `IsoCameraController`, `IsoCameraOptions` |
| [palette.ts](src/engine/palette.ts) | Caricamento della palette, validazione, HMR a caldo | `paletteHex`, `toPaletteArray`, `isValidHexColor`, `onPaletteChanged` |
| [paletteSlots.ts](src/engine/paletteSlots.ts) | I 32 slot nominati | `PALETTE_SLOTS`, `PALETTE_SIZE` |
| [palette.json](src/engine/palette.json) | I 32 colori. Modificarlo a caldo non rimesha niente | — |

### `src/engine/mesher/` — puro, senza Three.js

| File | Ruolo | Esporta |
| --- | --- | --- |
| [greedyMesher.ts](src/engine/mesher/greedyMesher.ts) | Greedy meshing, scratch riusato fra job | `greedyMesh`, `createScratch`, `MeshScratch`, `MAX_QUADS_PER_CHUNK` |
| [buildPaddedVolume.ts](src/engine/mesher/buildPaddedVolume.ts) | Chunk + sei piani di bordo → volume 34³ | `buildPaddedVolume` |
| [meshTypes.ts](src/engine/mesher/meshTypes.ts) | Job e risultato, array trasferibili | `MeshJob`, `MeshArrays`, `MeshResult` |
| [mesher.worker.ts](src/engine/mesher/mesher.worker.ts) | Il worker (2,7 kB in bundle) | — |

## `src/sim/` — simulazione a tick

Risorse e popolazione, campo di desiderabilità per cella e per classe, candidati
di crescita. **Non costruisce niente.** Dettagli in
[src/sim/README.md](src/sim/README.md).

| File | Ruolo | Esporta |
| --- | --- | --- |
| [index.ts](src/sim/index.ts) | Barrel: superficie pubblica per chi sta fuori dalla cartella | tutto il resto |
| [balance.ts](src/sim/balance.ts) | **Ogni** coefficiente, soglia e moltiplicatore, in un solo oggetto | `BALANCE` |
| [classes.ts](src/sim/classes.ts) | Le tre classi di edificio come indici densi | `BUILDING_CLASS`, `CLASS_NAMES`, `CLASS_COUNT`, `ALL_CLASSES` |
| [SimState.ts](src/sim/SimState.ts) | Stato, operazioni del giocatore, serializzazione JSON senza perdita | `createSimState`, `addCatalyst`, `addBuilding`, `setPolicyActive`, `setSelectedClass`, `toSimStateData`, `reviveSimState`, `rebuildField` |
| [tick.ts](src/sim/tick.ts) | Il bilancio di un tick, funzione pura | `tick`, `tickMany`, `weightsOf` |
| [DesirabilityField.ts](src/sim/DesirabilityField.ts) | Campo per classe, `Uint8Array` chunkato 32×32, ricalcolo incrementale | `DesirabilityField`, `rectAround`, `rectArea`, `Catalyst`, `Building`, `CellRect` |
| [policies.ts](src/sim/policies.ts) | Catalogo delle policy e risoluzione dei pesi | `POLICIES`, `resolveWeights`, `withPolicy`, `policyById`, `isPolicyId`, `Weights`, `PolicyId` |
| [nextBuildSites.ts](src/sim/nextBuildSites.ts) | I candidati, ordinati e filtrati | `nextBuildSites`, `BuildSite` |
| [rng.ts](src/sim/rng.ts) | `mulberry32` in forma pura, stato dentro `SimState` | `nextState`, `unitOf` |
| [scenario.ts](src/sim/scenario.ts) | Fixture della scena di debug: catalizzatori e nucleo di 24 edifici | `createScenarioState`, `scenarioCatalysts` |
| [debugData.ts](src/sim/debugData.ts) | L'unica scrittura verso il `VoxelWorld`, e va in `data` | `writeDesirabilityData` |
| [testTerrain.ts](src/sim/testTerrain.ts) | Fixture di terreno per i test. **Non** è codice di produzione | `testTerrain` |

```ts
let state = createSimState();
state = addCatalyst(state, { x: 96, y: 96, class: BUILDING_CLASS.residential, strength: 220, radius: 24 });
state = tick(state, terrainMap);        // puro: nuovo stato, input intatto
nextBuildSites(state, terrainMap, 10);  // [{ x, y, class, score }, …]
```

## `src/ui/` — overlay di debug

Canvas e DOM puri, nessuna dipendenza da Three.js. Esistono solo con `?debug=1`.

| File | Ruolo |
| --- | --- |
| [DebugOverlay.ts](src/ui/DebugOverlay.ts) | fps, draw call, triangoli, code, tempi di mesher e main thread |
| [TerrainOverlay.ts](src/ui/TerrainOverlay.ts) | Progresso della generazione, istogramma dei biomi, colonne edificabili |
| [SimOverlay.ts](src/ui/SimOverlay.ts) | Stock e delta per tick, heatmap 2D del campo, primi dieci candidati, pulsanti delle policy |

## Test e bench

| File | Copre |
| --- | --- |
| [world/VoxelWorld.test.ts](src/world/VoxelWorld.test.ts) | Sparsità, dirty set ai bordi, AABB, contratto `data` ≠ `blocks` |
| [world/scenes/cityScene.test.ts](src/world/scenes/cityScene.test.ts) | Determinismo, riempimento al 20%, ripresa a passi, nessuna scrittura fuori region |
| [world/terrain/heightField.test.ts](src/world/terrain/heightField.test.ts) | Margine di Lipschitz su otto seed — la rete di sicurezza della calibrazione |
| [world/terrain/IslandGenerator.test.ts](src/world/terrain/IslandGenerator.test.ts) | Determinismo per blocco, continuità al confine, `expandIsland` |
| [world/terrain/TerrainMap.test.ts](src/world/terrain/TerrainMap.test.ts) | Mappa per colonna, istogramma, chunking |
| [engine/mesher/greedyMesher.test.ts](src/engine/mesher/greedyMesher.test.ts) | Fusione dei quad, orientamento delle facce, casi limite |
| [engine/mesher/buildPaddedVolume.test.ts](src/engine/mesher/buildPaddedVolume.test.ts) | I sei piani di bordo |
| [engine/palette.test.ts](src/engine/palette.test.ts) | 32 slot, validazione dei colori |
| [sim/contracts.test.ts](src/sim/contracts.test.ts) | Purezza di `tick`, nessuna scrittura in `blocks`, serializzazione |
| [sim/SimState.test.ts](src/sim/SimState.test.ts) | Operazioni del giocatore, possesso del campo |
| [sim/tick.test.ts](src/sim/tick.test.ts) | Bilancio, nessuno stock negativo, pareggio 1:1 |
| [sim/DesirabilityField.test.ts](src/sim/DesirabilityField.test.ts) | Incrementale ≡ ricostruzione completa, cella per cella |
| [sim/policies.test.ts](src/sim/policies.test.ts) | Pesi identici bit a bit dopo on/off, indipendenza dall'ordine |
| [sim/nextBuildSites.test.ts](src/sim/nextBuildSites.test.ts) | Ordinamento, filtri di edificabilità |
| [sim/simPerf.test.ts](src/sim/simPerf.test.ts) | Tick sotto 3 ms, zero celle ricalcolate, costo indipendente dalla mappa |
| [engine/mesher/greedyMesher.bench.ts](src/engine/mesher/greedyMesher.bench.ts) | Costo per chunk: vuoto, edifici, pieno, rumore, scacchiera |
| [sim/sim.bench.ts](src/sim/sim.bench.ts) | `tick`, catalizzatore, policy, `nextBuildSites` |

## Parametri URL

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` accende overlay e hotkey |
| `scene` | `city` | `city`, `noise` (caso peggiore), `slab` |
| `seed` | `1337` | Seed della generazione |
| `size` | `512` | Lato del mondo in voxel (32…4096) |
| `height` | `64` | Altezza del mondo in voxel (32…256) |
| `terrain` | — | `<seed>` sostituisce la scena urbana con un'isola 256×256 |
| `sim` | — | `1` accende la scena di simulazione (implica l'isola, richiede `debug=1`) |
