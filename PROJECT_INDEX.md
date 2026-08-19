# Indice del progetto

Mappa file per file di `src/`. Il *perché* delle scelte sta nei README
([README.md](README.md), [src/sim/README.md](src/sim/README.md)); le regole
operative in [CLAUDE.md](CLAUDE.md). Qui c'è solo *dove sta cosa*.

Oltre 10 mila righe di TypeScript, 21 file di test (181 test), 2 file di bench.

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
| [AGENTS.md](AGENTS.md) | Regole operative globali e rimando alle regole locali |
| [index.html](index.html) | Pagina unica, `#app`, monta `src/main.ts` |
| [package.json](package.json) | Script npm; dipendenze: `three`, `simplex-noise` |
| [ROADMAP.md](ROADMAP.md) | Direzione del prodotto, milestone e gate dei prossimi incrementi |
| [tsconfig.json](tsconfig.json) | `strict` + flag extra; `noUncheckedIndexedAccess` off di proposito |
| [vite.config.ts](vite.config.ts) | Vite + Vitest insieme; worker in formato ES, test in ambiente `node` |
| [src/main.ts](src/main.ts) | Bootstrap, ciclo di frame a budget, input di gioco e hook globali di debug |

## Documentazione operativa

| File | Ruolo |
| --- | --- |
| [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) | Mappa sintetica di dipendenze, punti di ingresso e flussi |
| [src/engine/AGENTS.md](src/engine/AGENTS.md) | Contratti locali di renderer, mesher, palette e temi |
| [src/world/AGENTS.md](src/world/AGENTS.md) | Contratti locali di storage, terreno ed edifici |
| [src/sim/AGENTS.md](src/sim/AGENTS.md) | Contratti locali di simulazione, stato e campo |

## `src/world/` — storage e mondo

| File | Ruolo | Esporta |
| --- | --- | --- |
| [VoxelWorld.ts](src/world/VoxelWorld.ts) | Storage sparso a chunk, dirty set, AABB, cache dell'ultimo chunk | `VoxelWorld`, `WorldBounds` |
| [Chunk.ts](src/world/Chunk.ts) | Due `Uint8Array(32768)` — `blocks` (rendering) e `data` (simulazione) — allocati una volta sola | `Chunk` |
| [visualBlock.ts](src/world/visualBlock.ts) | Packing visuale in un byte: palette 0..31 e superficie 0..7 | `SURFACE_KIND`, `packVisualBlock`, `blockPalette`, `blockSurface` |
| [chunkCoords.ts](src/world/chunkCoords.ts) | Costanti e conversioni di coordinate, indici delle facce | `CHUNK`, `PADDED`, `idx`, `paddedIdx`, `toChunk`, `toLocal`, `keyOf`, `FACE_*` |
| [rng.ts](src/world/rng.ts) | PRNG deterministico per la generazione | `mulberry32`, `hashCoords` |
| [scenes/cityScene.ts](src/world/scenes/cityScene.ts) | Scene deterministiche a passi con budget: `city`, `noise`, `slab` | `createScene`, `SceneGenerator`, `SceneKind`, `TILE`, `STREET`, `LOT` |

API pubblica del mondo: `setBlock`/`getBlock` e `getSurfaceKind` (rendering, marca sporco),
`setData`/`getData` (simulazione, non marca niente), `ensureChunk`, `flush`,
`markAllDirty`.

## `src/world/terrain/` — isola procedurale

Genera un'isola deterministica da un seed, la scrive nel `VoxelWorld` con la sola
API pubblica, e produce in parallelo una mappa 2D per colonna.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/terrain/config.ts) | **Ogni** soglia, frequenza, ampiezza, stratigrafia e densita' degli alberi | `TERRAIN`, `BIOME`, `BIOME_NAMES`, `BIOME_STRATA`, `BUILDABLE_BIOMES`, `WATER_IDS`, `TREE_DECOR` |
| [heightField.ts](src/world/terrain/heightField.ts) | 4 ottave di simplex × maschera radiale deformata | `HeightField` |
| [biomes.ts](src/world/terrain/biomes.ts) | Bioma da altezza e pendenza, edificabilità, colore per profondità | `classifyBiome`, `isBuildable`, `paletteForDepth` |
| [region.ts](src/world/terrain/region.ts) | Region, `IslandShape`, allineamento ai chunk di colonna | `Region`, `IslandShape`, `shapeFromRegion`, `alignRegion`, `chunkSpanOf` |
| [columnBlock.ts](src/world/terrain/columnBlock.ts) | Blocco 32×32 di colonne piu' record di decorazioni, trasferibile fra worker e main | `ColumnBlock`, `columnIndex`, `blockTransferables` |
| [decor.ts](src/world/terrain/decor.ts) | Alberi deterministici per cella e scrittura ritagliata al blocco | `treeAt`, `writeTree`, `TreeSpec` |
| [IslandGenerator.ts](src/world/terrain/IslandGenerator.ts) | `generateIsland`, `expandIsland`, colonne e decorazioni | `generateIsland`, `expandIsland`, `generateColumnBlock`, `writeBlockColumns`, `writeBlockDecor` |
| [TerrainMap.ts](src/world/terrain/TerrainMap.ts) | Mappa sparsa per colonna, chunkata 32×32 come il mondo | `TerrainMap`, `TerrainColumn`, `TerrainColumnChunk` |
| [terrainMessages.ts](src/world/terrain/terrainMessages.ts) | Protocollo main ↔ worker | `TerrainJob`, `BlockMessage`, `DoneMessage` |
| [terrain.worker.ts](src/world/terrain/terrain.worker.ts) | Generazione fuori dal main thread, un blocco per volta (5,41 kB in bundle) | — |
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
| [VoxelMaterial.ts](src/engine/VoxelMaterial.ts) | Unico `ShaderMaterial`, palette, luce per faccia, `aAO` e nebbia | `createVoxelMaterial`, `VoxelMaterialHandle` |
| [InfluenceOverlay.ts](src/engine/InfluenceOverlay.ts) | Cerchi dei catalizzatori e perimetri dei settori, senza modificare le mesh voxel | `InfluenceOverlay` |
| [IsoCameraController.ts](src/engine/IsoCameraController.ts) | Ortografica isometrica: scatti di 90°, zoom, pan vincolato all'AABB | `IsoCameraController`, `IsoCameraOptions` |
| [IsoCameraController.test.ts](src/engine/IsoCameraController.test.ts) | Contratto dei pulsanti pointer accettati per il pan | — |
| [palette.ts](src/engine/palette.ts) | Caricamento della palette, validazione, HMR a caldo | `paletteHex`, `toPaletteArray`, `isValidHexColor`, `onPaletteChanged` |
| [paletteSlots.ts](src/engine/paletteSlots.ts) | I 32 slot nominati | `PALETTE_SLOTS`, `PALETTE_SIZE` |
| [palette.json](src/engine/palette.json) | I 32 colori. Modificarlo a caldo non rimesha niente | — |

### `src/engine/themes/` — look intercambiabili

Un tema è 32 colori più i parametri di atmosfera. Applicarlo riscrive solo
uniform e stato del renderer: nessuna geometria viene toccata.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [theme.ts](src/engine/themes/theme.ts) | Il contratto, senza import | `Theme`, `Atmosphere` |
| [index.ts](src/engine/themes/index.ts) | Tabella dei temi e risoluzione dell'id | `THEMES`, `DEFAULT_THEME_ID`, `themeById`, `resolveTheme` |
| [natural.ts](src/engine/themes/natural.ts) | Diorama diurno; prende i colori da `palette.json` | `natural` |
| [pastel.ts](src/engine/themes/pastel.ts) | Metropoli pastello in controluce | `pastel` |
| [neon.ts](src/engine/themes/neon.ts) | Notturno al neon, unico senza tone mapping | `neon` |
| [industrial.ts](src/engine/themes/industrial.ts) | Ocra, ruggine e smog | `industrial` |
| [scifi.ts](src/engine/themes/scifi.ts) | Bianchi freddi, teal e magenta | `scifi` |
| [enchanted.ts](src/engine/themes/enchanted.ts) | Bosco incantato, lilla e turchese | `enchanted` |

### `src/engine/mesher/` — puro, senza Three.js

| File | Ruolo | Esporta |
| --- | --- | --- |
| [greedyMesher.ts](src/engine/mesher/greedyMesher.ts) | Greedy meshing, scratch riusato fra job | `greedyMesh`, `createScratch`, `MeshScratch`, `MAX_QUADS_PER_CHUNK` |
| [buildPaddedVolume.ts](src/engine/mesher/buildPaddedVolume.ts) | Chunk + tutti i 26 vicini immediati → volume 34³ | `buildPaddedVolume` |
| [meshTypes.ts](src/engine/mesher/meshTypes.ts) | Job e risultato, array trasferibili | `MeshJob`, `MeshArrays`, `MeshResult` |
| [mesher.worker.ts](src/engine/mesher/mesher.worker.ts) | Il worker (3,49 kB in bundle) | — |

## `src/sim/` — simulazione a tick

Risorse e popolazione, campo di desiderabilità per cella e per classe, candidati
di crescita. Il `Builder`, esterno al modulo, consuma quei candidati. Dettagli in
[src/sim/README.md](src/sim/README.md).

| File | Ruolo | Esporta |
| --- | --- | --- |
| [index.ts](src/sim/index.ts) | Barrel: superficie pubblica per chi sta fuori dalla cartella | tutto il resto |
| [balance.ts](src/sim/balance.ts) | **Ogni** coefficiente, soglia e moltiplicatore, in un solo oggetto | `BALANCE` |
| [classes.ts](src/sim/classes.ts) | Le tre classi di edificio come indici densi | `BUILDING_CLASS`, `CLASS_NAMES`, `CLASS_COUNT`, `ALL_CLASSES` |
| [catalysts.ts](src/sim/catalysts.ts) | Catalogo dei sette ruoli e relativi effetti locali | `CATALYSTS`, `catalystById`, `CatalystId` |
| [SimState.ts](src/sim/SimState.ts) | Stato, operazioni del giocatore, serializzazione JSON senza perdita | `createSimState`, `addCatalyst`, `addBuilding`, `setPolicyActive`, `setSelectedClass`, `toSimStateData`, `reviveSimState`, `rebuildField` |
| [tick.ts](src/sim/tick.ts) | Il bilancio di un tick, funzione pura | `tick`, `tickMany`, `weightsOf` |
| [DesirabilityField.ts](src/sim/DesirabilityField.ts) | Campo per classe, `Uint8Array` chunkato 32×32, ricalcolo incrementale | `DesirabilityField`, `rectAround`, `rectArea`, `Catalyst`, `Building`, `CellRect` |
| [policies.ts](src/sim/policies.ts) | Catalogo delle policy e risoluzione dei pesi | `POLICIES`, `resolveWeights`, `withPolicy`, `policyById`, `isPolicyId`, `Weights`, `PolicyId` |
| [districts.ts](src/sim/districts.ts) | Profili locali e distretti da campi sovrapposti | `urbanProfileAt`, `DistrictId`, `LocalUrbanProfile` |
| [decisions.ts](src/sim/decisions.ts) | Scelte periodiche deterministiche | `decisionAt`, `decisionOption`, `CityDecision` |
| [trade.ts](src/sim/trade.ts) | Import/export aggregato sbloccato dal porto | `resolveExternalTrade`, `TRADE_MODES`, `TradeMode` |
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

## `src/world/buildings/` — crescita voxel

Ponte tra candidati della simulazione e mondo renderizzato: convalida il terreno,
gestisce le impronte, costruisce a fasce entro un budget e promuove gli edifici.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [Builder.ts](src/world/buildings/Builder.ts) | Consuma i candidati, scrive voxel e coordina le crescite | `Builder`, `BuilderStats`, `REJECT_REASONS` |
| [BuildingRegistry.ts](src/world/buildings/BuildingRegistry.ts) | Indice spaziale e record degli edifici | `BuildingRegistry`, `BuildingRecord` |
| [generate.ts](src/world/buildings/generate.ts) | Generatore deterministico di stamp voxel | `generateBuilding`, `startLevel` |
| [stamp.ts](src/world/buildings/stamp.ts) | Volume voxel, ancora 3D e conversione in coordinate mondo | `VoxelStamp`, `VoxelAnchor`, `anchoredVoxel`, `STAMP_EMPTY` |
| [config.ts](src/world/buildings/config.ts) | Cadenze, tetti e profili visivi | `BUILDER`, `CLASS_PROFILE` |

## `src/game/` — ciclo di gioco

| File | Ruolo | Esporta |
| --- | --- | --- |
| [loop.ts](src/game/loop.ts) | Passo fisso della simulazione con tetto di recupero | `FixedStepLoop` |
| [growthScene.ts](src/game/growthScene.ts) | Cablaggio esclusivo di `grow=1`: tick, Builder e animazione | `GrowthScene`, `GrowthStats` |
| [launchMode.ts](src/game/launchMode.ts) | Risoluzione pura della modalita' iniziale e degli harness URL | `resolveLaunchMode`, `LaunchMode` |
| [actions.ts](src/game/actions.ts) | Azioni economiche atomiche: catalizzatori, policy, decisioni, commercio ed espansione | `placeCatalyst`, `togglePolicy`, `chooseDecision`, `changeTradeMode`, `buyExpansion` |
| [surfacePick.ts](src/game/surfacePick.ts) | Selezione pura della colonna sulla heightmap da un raggio 3D | `pickSurfaceCell` |
| [onboarding.ts](src/game/onboarding.ts) | Tutorial derivato dai catalizzatori, senza flag nascosti | `onboardingOf`, `onboardingAllows` |
| [cityCondition.ts](src/game/cityCondition.ts) | Obiettivo di autosufficienza e crisi con indicazioni di recupero | `cityCondition`, `isSelfSufficient` |
| [sectors.ts](src/game/sectors.ts) | Identità, region e maschera composta dei settori costieri | `coastalSectorAt`, `shapeWithSector` |

## `src/ui/` — HUD e overlay di debug

Canvas e DOM puri, nessuna dipendenza da Three.js. Il Cozy HUD è l'interfaccia
giocabile; gli overlay tecnici si alternano con `F3` o partono aperti con
`?debug=1`.

| File | Ruolo |
| --- | --- |
| [hud.css](src/ui/hud.css) | Token, componenti, stati accessibili e layout responsivo Cozy City |
| [hudIcons.ts](src/ui/hudIcons.ts) | Icone SVG interne, senza dipendenze o richieste di rete |
| [GameHud.ts](src/ui/GameHud.ts) | Risorse, sette catalizzatori, policy, commercio, decisioni, temi e feedback contestuale |
| [GameHudModel.ts](src/ui/GameHudModel.ts) | View model puro di risorse, requisiti e disponibilità delle azioni |
| [ControlsHint.ts](src/ui/ControlsHint.ts) | Onboarding contestuale persistente e pannello di aiuto |
| [DebugOverlay.ts](src/ui/DebugOverlay.ts) | fps, draw call, triangoli, code, tempi di mesher e main thread |
| [GrowthOverlay.ts](src/ui/GrowthOverlay.ts) | Conteggi, livelli, coda e scarti della crescita automatica |
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
| [engine/mesher/buildPaddedVolume.test.ts](src/engine/mesher/buildPaddedVolume.test.ts) | Piani, spigoli e angoli del padding |
| [engine/palette.test.ts](src/engine/palette.test.ts) | 32 slot, validazione dei colori |
| [engine/themes/themes.test.ts](src/engine/themes/themes.test.ts) | Ogni tema riempie i 32 slot, atmosfera in range |
| [world/terrain/decor.test.ts](src/world/terrain/decor.test.ts) | Alberi deterministici, biomi esclusi e chiome non sovrapposte |
| [game/loop.test.ts](src/game/loop.test.ts) | Cadenza fissa e limite del recupero |
| [game/launchMode.test.ts](src/game/launchMode.test.ts) | Esperienza completa alla radice e isolamento degli harness URL |
| [game/onboarding.test.ts](src/game/onboarding.test.ts) | Sequenza e sblocco dei tre passi iniziali |
| [game/cityCondition.test.ts](src/game/cityCondition.test.ts) | Priorità delle crisi e stabilità richiesta per il successo |
| [game/sectors.test.ts](src/game/sectors.test.ts) | Identità uniche, terra utile e continuità delle espansioni |
| [ui/ControlsHint.test.ts](src/ui/ControlsHint.test.ts) | Completezza delle indicazioni dei comandi camera |
| [ui/GameHudModel.test.ts](src/ui/GameHudModel.test.ts) | Risorse, requisiti, blocchi economici e policy attive del HUD |
| [world/buildings/Builder.test.ts](src/world/buildings/Builder.test.ts) | Candidato → occupazione della simulazione → voxel |
| [world/buildings/BuildingRegistry.test.ts](src/world/buildings/BuildingRegistry.test.ts) | Indice spaziale e sostituzione di record |
| [world/buildings/generate.test.ts](src/world/buildings/generate.test.ts) | Determinismo e limiti degli stamp |
| [world/buildings/urbanForm.test.ts](src/world/buildings/urbanForm.test.ts) | Variazione deterministica della forma dal profilo locale |
| [sim/contracts.test.ts](src/sim/contracts.test.ts) | Purezza di `tick`, nessuna scrittura in `blocks`, serializzazione |
| [sim/SimState.test.ts](src/sim/SimState.test.ts) | Operazioni del giocatore, possesso del campo |
| [sim/tick.test.ts](src/sim/tick.test.ts) | Bilancio, nessuno stock negativo, pareggio 1:1 |
| [sim/DesirabilityField.test.ts](src/sim/DesirabilityField.test.ts) | Incrementale ≡ ricostruzione completa, cella per cella |
| [sim/policies.test.ts](src/sim/policies.test.ts) | Pesi identici bit a bit dopo on/off, indipendenza dall'ordine |
| [sim/policyCosts.test.ts](src/sim/policyCosts.test.ts) | Costi continuativi delle policy |
| [sim/districts.test.ts](src/sim/districts.test.ts) | Ruoli distinti, sovrapposizioni ed effetti spaziali |
| [sim/decisions.test.ts](src/sim/decisions.test.ts) | Cadenza, persistenza e risoluzione delle decisioni |
| [sim/trade.test.ts](src/sim/trade.test.ts) | Prerequisito del porto e priorità commerciali |
| [sim/nextBuildSites.test.ts](src/sim/nextBuildSites.test.ts) | Ordinamento, filtri di edificabilità |
| [sim/simPerf.test.ts](src/sim/simPerf.test.ts) | Tick sotto 3 ms, zero celle ricalcolate, costo indipendente dalla mappa |
| [engine/mesher/greedyMesher.bench.ts](src/engine/mesher/greedyMesher.bench.ts) | Costo per chunk: vuoto, edifici, pieno, rumore, scacchiera |
| [sim/sim.bench.ts](src/sim/sim.bench.ts) | `tick`, catalizzatore, policy, `nextBuildSites` |

## Parametri URL

La radice `/` avvia isola, crescita e Cozy HUD; gli overlay tecnici sono nascosti.

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` apre overlay e hotkey tecniche; `F3` li alterna a runtime |
| `scene` | — | Isola una scena `city`, `noise` (caso peggiore) o `slab` |
| `seed` | `1337` | Seed della generazione |
| `size` | `512` | Lato del mondo in voxel (32…4096) |
| `height` | `64` | Altezza del mondo in voxel (32…256) |
| `terrain` | — | `<seed>` sostituisce la scena urbana con un'isola 256×256 |
| `sim` | — | `1` accende la scena di simulazione (implica l'isola, richiede `debug=1`) |
