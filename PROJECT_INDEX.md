# Indice del progetto

Mappa file per file di `src/`. Il *perché* delle scelte sta nei README
([README.md](README.md), [src/sim/README.md](src/sim/README.md)); le regole
operative in [CLAUDE.md](CLAUDE.md). Qui c'è solo *dove sta cosa*.

Oltre 26 mila righe di TypeScript, 51 file di test (404 test), 2 file di bench.

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
| [CHANGELOG.md](CHANGELOG.md) | Cosa e' cambiato e quando, per incremento |
| [index.html](index.html) | Pagina unica, `#app`, monta `src/main.ts` |
| [package.json](package.json) | Script npm; dipendenze: `three`, `simplex-noise` |
| [ROADMAP.md](ROADMAP.md) | Direzione del prodotto, milestone e gate dei prossimi incrementi |
| [scripts/free-port.mjs](scripts/free-port.mjs) | Hook `prestart`/`predev`: libera la porta del dev server terminando le istanze node rimaste |
| [shotkit.config.mjs](shotkit.config.mjs) | Ricette di cattura per gli scatti di riferimento in `.shots/` |
| [tsconfig.json](tsconfig.json) | `strict` + flag extra; `noUncheckedIndexedAccess` off di proposito |
| [vite.config.ts](vite.config.ts) | Vite + Vitest insieme; worker in formato ES, test in ambiente `node` |
| [src/main.ts](src/main.ts) | Bootstrap, ciclo di frame a budget, input di gioco e hook globali di debug |

## Documentazione operativa

Caricati sempre: [AGENTS.md](AGENTS.md) e [CLAUDE.md](CLAUDE.md). Tutto il
resto si apre a domanda — è ciò che tiene basso il contesto di partenza.

| File | Ruolo | Caricato |
| --- | --- | --- |
| [AGENTS.md](AGENTS.md) | **Fonte unica** di comandi, convenzioni, contratti, budget e definizione di "finito" | sempre |
| [CLAUDE.md](CLAUDE.md) | Puntatore: dove stanno le regole e cosa si sbaglia facilmente | sempre |
| [src/engine/AGENTS.md](src/engine/AGENTS.md) | Renderer, mesher, palette, temi, modello di luce e pass | lavorando in `src/engine/` |
| [src/world/AGENTS.md](src/world/AGENTS.md) | Storage, terreno, strade, edifici e catalogo delle tipologie | lavorando in `src/world/` |
| [src/sim/AGENTS.md](src/sim/AGENTS.md) | Simulazione, stato, campo e relazioni di bilanciamento | lavorando in `src/sim/` |
| [.claude/skills/debug-harness/SKILL.md](.claude/skills/debug-harness/SKILL.md) | Parametri URL, hotkey e hook globali | `/debug-harness` |
| [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) | Mappa sintetica di dipendenze, punti di ingresso e flussi | a domanda |
| [CHANGELOG.md](CHANGELOG.md) | Storia degli incrementi, con i file toccati da ciascuno | a domanda |

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
`fillColumn` (lo stesso su un tratto verticale, a costo di corsa invece che di
cella), `setData`/`getData` (simulazione, non marca niente), `ensureChunk`,
`flush`, `markAllDirty`.

## `src/world/terrain/` — isola procedurale

Genera un'isola deterministica da un seed, la scrive nel `VoxelWorld` con la sola
API pubblica, e produce in parallelo una mappa 2D per colonna.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/terrain/config.ts) | **Ogni** soglia, frequenza, ampiezza, stratigrafia, densita' e forma degli alberi | `TERRAIN`, `BIOME`, `BIOME_NAMES`, `BIOME_STRATA`, `BUILDABLE_BIOMES`, `WATER_IDS`, `TREE_DECOR`, `TREE_SHAPES` |
| [heightField.ts](src/world/terrain/heightField.ts) | 4 ottave di simplex × maschera radiale deformata | `HeightField` |
| [biomes.ts](src/world/terrain/biomes.ts) | Bioma da altezza e pendenza, edificabilità, colore per profondità | `classifyBiome`, `isBuildable`, `paletteForDepth` |
| [region.ts](src/world/terrain/region.ts) | Region, `IslandShape`, allineamento ai chunk di colonna | `Region`, `IslandShape`, `shapeFromRegion`, `alignRegion`, `chunkSpanOf` |
| [columnBlock.ts](src/world/terrain/columnBlock.ts) | Blocco 32×32 di colonne piu' record di decorazioni, trasferibile fra worker e main | `ColumnBlock`, `columnIndex`, `blockTransferables` |
| [decor.ts](src/world/terrain/decor.ts) | Alberi deterministici per cella e scrittura ritagliata al blocco | `treeAt`, `treeSpec`, `treeTop`, `writeTree`, `TreeSpec` |
| [IslandGenerator.ts](src/world/terrain/IslandGenerator.ts) | `generateIsland`, `expandIsland`, colonne e decorazioni | `generateIsland`, `expandIsland`, `generateColumnBlock`, `writeBlockColumns`, `writeBlockDecor` |
| [TerrainMap.ts](src/world/terrain/TerrainMap.ts) | Mappa sparsa per colonna, chunkata 32×32 come il mondo | `TerrainMap`, `TerrainColumn`, `TerrainColumnChunk` |
| [terrainMessages.ts](src/world/terrain/terrainMessages.ts) | Protocollo main ↔ worker | `TerrainJob`, `BlockMessage`, `DoneMessage` |
| [terrain.worker.ts](src/world/terrain/terrain.worker.ts) | Generazione fuori dal main thread, un blocco per volta (5,77 kB in bundle) | — |
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
| [VoxelMaterial.ts](src/engine/VoxelMaterial.ts) | Unico `ShaderMaterial`: palette, sole e ambiente nel fragment, jitter per voxel, prospettiva aerea | `createVoxelMaterial`, `VoxelMaterialHandle` |
| [VoxelMaterial.test.ts](src/engine/VoxelMaterial.test.ts) | Ogni uniform dichiarato nel GLSL esiste davvero, su entrambe le varianti; cambiare tema non ricompila il programma; il retino entra solo alla prima vista attivata | — |
| [lighting.ts](src/engine/lighting.ts) | Modello di luce in TS puro: direzione del sole, diffusa avvolgente, luminanza per faccia | `sunDirection`, `faceLight`, `faceLuminance`, `wrapDiffuse`, `FACE_NORMALS` |
| [lighting.test.ts](src/engine/lighting.test.ts) | Tiene allineate la copia TS e quella GLSL del modello | — |
| [inspect.ts](src/engine/inspect.ts) | Viste di ispezione in TS puro: dal modo attivo ai due predicati e alla densita' del retino. **Ogni** numero del dominio | `INSPECT`, `INSPECT_MODE`, `INSPECT_MODES`, `INSPECT_NAMES`, `inspectUniforms`, `sectionAxis`, `cycleInspectMode`, `parseInspectMode`, `clampSliceZ`, `isCut`, `modeCuts`, `isActive`, `InspectMode`, `InspectState`, `InspectUniforms` |
| [inspect.test.ts](src/engine/inspect.test.ts) | Tiene allineate la copia TS e quella GLSL del predicato | — |
| [SunShadow.ts](src/engine/SunShadow.ts) | Shadow map ortografica del sole: fitting sull'AABB visibile, aggancio ai texel, materiale di sola profondita' | `createSunShadow`, `SunShadowHandle` |
| [PostProcessing.ts](src/engine/PostProcessing.ts) | Composer sempre attivo: bloom, tilt-shift, tone mapping in `OutputPass` | `createPostProcessing`, `PostProcessingHandle` |
| [SkyBackground.ts](src/engine/SkyBackground.ts) | Fondo procedurale: quad in NDC senza profondita', gradiente per altezza di schermo, disco solare e nuvole a bande | `createSkyBackground`, `SkyBackgroundHandle` |
| [SkyBackground.test.ts](src/engine/SkyBackground.test.ts) | Quad che non scrive profondita', riscrittura degli uniform senza sostituire la mesh, minimo notturno del sole | — |
| [FrameTiming.ts](src/engine/FrameTiming.ts) | Finestra scorrevole di intervalli rAF: fps, uno percento peggiore, p95/p99, jank | `FrameTiming`, `FrameTimingSnapshot` |
| [FrameTiming.test.ts](src/engine/FrameTiming.test.ts) | Vero uno percento peggiore; tab nascosta e resume non contano come frame lenti | — |
| [RenderQuality.ts](src/engine/RenderQuality.ts) | Pixel ratio adattivo con isteresi e profilo di effetti derivato: ombre, bloom, tilt-shift scendono insieme | `RenderQualityController`, `parseQualityMode`, `QualityMode`, `QualityProfile`, `QualityDecision`, `QualityReason` |
| [RenderQuality.test.ts](src/engine/RenderQuality.test.ts) | Scende dopo due finestre lente, risale dopo dieci secondi stabili, i modi fissi hanno profilo fisso | — |
| [InfluenceOverlay.ts](src/engine/InfluenceOverlay.ts) | Cerchi dei catalizzatori e perimetri dei settori, senza modificare le mesh voxel | `InfluenceOverlay` |
| [PlacementCursor.ts](src/engine/PlacementCursor.ts) | Segnaposto sotto il puntatore: base, mirino, onda e fascio, sempre sopra la scena | `PlacementCursor` |
| [PlacementCursor.test.ts](src/engine/PlacementCursor.test.ts) | Posizione sulla colonna, stato valido/rifiutato, esclusione dalla profondita' | — |
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
| [diorama.ts](src/engine/themes/diorama.ts) | Modellino caldo con ombre fredde; usa tutti i campi opzionali | `diorama` |

### `src/engine/mesher/` — puro, senza Three.js

| File | Ruolo | Esporta |
| --- | --- | --- |
| [greedyMesher.ts](src/engine/mesher/greedyMesher.ts) | Greedy meshing, scratch riusato fra job | `greedyMesh`, `createScratch`, `MeshScratch`, `MAX_QUADS_PER_CHUNK`, `MAX_BASE_QUADS_PER_CHUNK` |
| [microGeometry.ts](src/engine/mesher/microGeometry.ts) | Prismi sci-fi a 1/16 di voxel accodati al greedy pass | `appendMicroGeometry`, `MicroGeometryWriter`, `FixedBox`, `MAX_DETAIL_QUADS_PER_CHUNK` |
| [buildPaddedVolume.ts](src/engine/mesher/buildPaddedVolume.ts) | Chunk + tutti i 26 vicini immediati → volume 34³ | `buildPaddedVolume` |
| [meshTypes.ts](src/engine/mesher/meshTypes.ts) | Job e risultato, array trasferibili | `MeshJob`, `MeshArrays`, `MeshResult`, `MESH_UNITS_PER_VOXEL` |
| [mesher.worker.ts](src/engine/mesher/mesher.worker.ts) | Il worker (8,64 kB in bundle) | — |

## `src/sim/` — simulazione a tick

Risorse e popolazione, campo di desiderabilità per cella e per classe, candidati
di crescita. Il `Builder`, esterno al modulo, consuma quei candidati. Dettagli in
[src/sim/README.md](src/sim/README.md).

| File | Ruolo | Esporta |
| --- | --- | --- |
| [index.ts](src/sim/index.ts) | Barrel: superficie pubblica per chi sta fuori dalla cartella | tutto il resto |
| [balance.ts](src/sim/balance.ts) | **Ogni** coefficiente, soglia e moltiplicatore, in un solo oggetto | `BALANCE` |
| [classes.ts](src/sim/classes.ts) | I quattro usi urbani come indici densi | `BUILDING_CLASS`, `CLASS_NAMES`, `CLASS_LABELS`, `CLASS_COUNT`, `ALL_CLASSES` |
| [catalysts.ts](src/sim/catalysts.ts) | Catalogo dei sette ruoli: vettore di influenza, funzione di toolbar, effetti locali | `CATALYSTS`, `CATALYST_GROUPS`, `catalystById`, `isCatalystId`, `catalystInfluence`, `catalystRoleOf`, `defaultCatalystOfClass`, `CatalystId` |
| [SimState.ts](src/sim/SimState.ts) | Stato, operazioni del giocatore, serializzazione JSON senza perdita | `createSimState`, `addCatalyst`, `addBuilding`, `setPolicyActive`, `setSelectedClass`, `toSimStateData`, `reviveSimState`, `rebuildField` |
| [tick.ts](src/sim/tick.ts) | Il bilancio di un tick, funzione pura | `tick`, `tickMany`, `weightsOf` |
| [DesirabilityField.ts](src/sim/DesirabilityField.ts) | Campo per uso urbano, `Uint8Array` chunkato 32×32, ricalcolo incrementale | `DesirabilityField`, `rectAround`, `rectArea`, `Catalyst`, `Building`, `CellRect` |
| [policies.ts](src/sim/policies.ts) | Catalogo delle policy e risoluzione dei pesi | `POLICIES`, `resolveWeights`, `withPolicy`, `policyById`, `isPolicyId`, `Weights`, `PolicyId` |
| [districts.ts](src/sim/districts.ts) | Profili locali, distretti e specializzazioni da campi sovrapposti | `urbanProfileAt`, `specializationOf`, `dominantUse`, `DistrictId`, `LocalUrbanProfile`, `Specialization` |
| [commerce.ts](src/sim/commerce.ts) | Il ciclo commerciale interno: domanda, organico, merce, ricavi | `resolveCommerce`, `EMPTY_COMMERCE`, `CommerceReport` |
| [decisions.ts](src/sim/decisions.ts) | Scelte periodiche deterministiche, con mandato e opera concessi | `decisionAt`, `decisionOption`, `CityDecision`, `DecisionGrant` |
| [charters.ts](src/sim/charters.ts) | Mandati lasciati dalle decisioni: uno slot per famiglia, permanenti | `CHARTERS`, `charterById`, `charterOfFamily`, `isCharterId`, `withCharter`, `withoutFamily`, `canonicalCharters`, `Charter`, `CharterFamily`, `CharterId` |
| [trade.ts](src/sim/trade.ts) | Import/export aggregato sbloccato dal porto | `resolveExternalTrade`, `TRADE_MODES`, `TradeMode` |
| [nextBuildSites.ts](src/sim/nextBuildSites.ts) | I candidati, ordinati, filtrati e con l'eventuale secondo uso | `nextBuildSites`, `BuildSite`, `BuildSiteQuery` |
| [rng.ts](src/sim/rng.ts) | `mulberry32` in forma pura, stato dentro `SimState` | `nextState`, `unitOf` |
| [scenario.ts](src/sim/scenario.ts) | Fixture della scena di debug: catalizzatori e nucleo di 24 edifici | `createScenarioState`, `scenarioCatalysts` |
| [debugData.ts](src/sim/debugData.ts) | L'unica scrittura verso il `VoxelWorld`, e va in `data` | `writeDesirabilityData` |
| [testTerrain.ts](src/sim/testTerrain.ts) | Fixture di terreno per i test. **Non** è codice di produzione | `testTerrain` |

```ts
let state = createSimState();
state = addCatalyst(state, { x: 96, y: 96, kind: 'market', class: BUILDING_CLASS.residential, strength: 220, radius: 24 });
state = tick(state, terrainMap);        // puro: nuovo stato, input intatto
nextBuildSites(state, terrainMap, 10);  // [{ x, y, class, mixed, score }, …]
```

## `src/world/streets/` — scheletro della crescita

La rete stradale che esiste **prima** degli edifici e ne orienta la crescita. E'
una funzione pura di `(seed, x, y)`: niente stato, niente da salvare, niente da
aggiornare quando arriva un catalizzatore. Il ritaglio sulla forma dell'isola
avviene a valle, dove il terreno gia' si legge.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/streets/config.ts) | **Ogni** passo, scostamento, larghezza e colore della carreggiata | `STREETS` |
| [streetGrid.ts](src/world/streets/streetGrid.ts) | Griglia deformata: assi, isolati, ruolo di una colonna, versi di affaccio | `STREET_ROLE`, `FACING`, `streetRoleAt`, `isPavement`, `blockAt`, `blockRect`, `blockKey`, `lineStart`, `lineEnd`, `lineWidth`, `isArterial`, `BlockId`, `BlockRect`, `Facing`, `StreetRole` |
| [lots.ts](src/world/streets/lots.ts) | Da colonna proposta a lotto sul fronte strada; puro, la disponibilita' entra come predicato | `placeLot`, `Lot`, `LotRequest` |
| [StreetNetwork.ts](src/world/streets/StreetNetwork.ts) | Facciata sul seed: ruoli, isolati, anello di carreggiata da dipingere | `StreetNetwork`, `PavementCell` |

```ts
const streets = new StreetNetwork(1337);
streets.roleAt(96, 96);                    // arterial | minor | frontage | interior
const block = streets.blockAt(96, 96);
placeLot({ rect: streets.blockRect(block), x: 96, y: 96, footprint: 4, accepts });
```

## `src/world/grading/` — opere di terra

Cosa serve **costruire** perche' un pezzo di terreno regga un piano: un
terrapieno con il suo muro di contenimento, una banchina che porta il piano
sopra la battigia, oppure niente. E' la risposta alla domanda che la 4.2
sostituisce a "questa colonna e' gia' piana?", e vale meta' della terra emersa,
che prima veniva scartata. Puro: entrano quote e classificazioni, esce un piano
di opera. **Si riempie, non si scava** — un'opera aggiunge volume e non ne toglie
mai.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/grading/config.ts) | **Ogni** quota, dislivello, colore e peso di costo delle opere | `GRADING`, `BUILD_WEIGHT` |
| [grade.ts](src/world/grading/grade.ts) | Classifica la colonna, la pesa, progetta il piano, rampa un campo di quote | `GROUND`, `WORKS`, `groundKindOf`, `isDryLand`, `buildWeightOf`, `footprintWeightOf`, `planGrade`, `rampField`, `GradePlan`, `GroundColumn`, `GroundKind`, `Works` |

```ts
groundKindOf(biome, slope, height);        // flat | sloped | shore | rock | refused
buildWeightOf(kind);                       // moltiplicatore di costo, Infinity se rifiutata
planGrade(columns);                        // { works, padZ, footZ, fill } | null
rampField(level, width, height);           // alza il campo a pendenza uno, in posto
```

## `src/world/sites/` — vincoli di sito

Dove un **ruolo** ha senso, che e' una domanda diversa da "cosa regge il
terreno". Da quando le opere hanno tolto il divieto e messo un prezzo, il porto
si piazzava in cima a una collina: qui vive la regola che glielo impedisce.
La definizione del catalizzatore porta solo un'etichetta — `'coastal'`,
`'open'`, `'any'` — e non sa cosa significhi; tradurla sul terreno vero e'
lavoro di questo dominio.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/sites/config.ts) | **Ogni** distanza, lato e dislivello dei vincoli di sito | `SITE` |
| [siteRules.ts](src/world/sites/siteRules.ts) | Cerca l'acqua sui quattro assi, ne dice il verso, misura un intorno piano, traduce l'etichetta in un motivo di rifiuto | `seesWater`, `waterFacing`, `openGround`, `siteRefusal`, `SiteRefusal` |

```ts
seesWater(map, x, y, SITE.coastalRadius);              // il mare e' entro il raggio?
waterFacing(map, x, y, SITE.coastalRadius);            // da che parte? orienta il molo
openGround(map, x, y, SITE.openSpan, SITE.openMaxStep); // l'intorno regge un piano unico?
siteRefusal(map, x, y, 'coastal');                     // 'needs-coast' | 'needs-open-ground' | null
```

## `src/world/landmarks/` — le strutture dei catalizzatori

La forma che ogni ruolo prende a terra. Prima di questo dominio un catalizzatore
era un rombo di asfalto di raggio quattro con un voxel colorato al centro,
identico per tutti e otto: il porto in particolare non esisteva, e quello che si
vedeva sull'acqua era la carreggiata dell'isolato costiero.

Un landmark **non e' un tipo nuovo di cosa**: e' un `BuildingRecord` con
`landmark` valorizzato, quindi eredita dal Builder occupazione, collisione,
budget di chunk, comparsa a budget e avanzamento. A cambiare e' solo quale
generatore disegna lo stamp.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/landmarks/config.ts) | **Ogni** ingombro, quota, soglia di stadio e indice di palette, piu' le otto ricette | `LANDMARK`, `LANDMARKS`, `landmarkOf`, `maxStageOf`, `LandmarkRecipe` |
| [parts.ts](src/world/landmarks/parts.ts) | Le sette primitive con cui una ricetta si compone, e la rotazione sul verso | `PART`, `Part`, `PartKind`, `partBounds`, `orientPart`, `orientedSpan`, `createCanvas`, `drawPart`, `LandmarkCanvas` |
| [generate.ts](src/world/landmarks/generate.ts) | Compone le parti in uno stamp; ingombro, origine e stadio di una ricetta | `generateLandmark`, `landmarkSpan`, `landmarkOrigin`, `stageForBuildings`, `LandmarkRequest` |

```ts
landmarkSpan('port', FACING.east);          // { sizeX, sizeY, sizeZ } | null
landmarkOrigin('port', facing, x, y);       // angolo minimo dell'ingombro | null
stageForBuildings(recipe, nearby);          // quanto la citta' intorno ha meritato
generateLandmark({ kind, stage, facing });  // VoxelStamp | null
```

## `src/world/buildings/` — crescita voxel

Ponte tra candidati della simulazione e mondo renderizzato: convalida il terreno,
gestisce le impronte, costruisce a fasce entro un budget e promuove gli edifici.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [Builder.ts](src/world/buildings/Builder.ts) | Consuma i candidati, scrive voxel, coordina le crescite e piazza i landmark dei catalizzatori | `Builder`, `BuilderStats`, `REJECT_REASONS` |
| [BuildingRegistry.ts](src/world/buildings/BuildingRegistry.ts) | Indice spaziale e record degli edifici; impronte rettangolari e landmark contati a parte | `BuildingRegistry`, `BuildingRecord`, `footprintDepth` |
| [generate.ts](src/world/buildings/generate.ts) | Generatore deterministico di stamp voxel: fasce da una tabella di trasformazioni, cinque cime, terrazze e giardini sulle rientranze | `generateBuilding`, `startLevel`, `BuildingRequest` |
| [cluster.ts](src/world/buildings/cluster.ts) | A cosa si aggrega un lotto: quota e corso di base condivisi con i vicini di fronte. Puro, e il rifiuto è il gradino | `planCluster`, `joinsCluster`, `ClusterTerms`, `ClusterRequest` |
| [typology.ts](src/world/buildings/typology.ts) | Sceglie la tipologia dal luogo; nessun numero, solo la regola | `selectTypology`, `typologyProfile`, `typologyShape`, `typologiesForUses`, `TypologyQuery` |
| [stamp.ts](src/world/buildings/stamp.ts) | Volume voxel, ancora 3D e conversione in coordinate mondo | `VoxelStamp`, `VoxelAnchor`, `anchoredVoxel`, `STAMP_EMPTY` |
| [config.ts](src/world/buildings/config.ts) | Cadenze, impronte, grammatica verticale, repertorio delle trasformazioni di fascia, cime, aggregazione, profili visivi e **catalogo delle tipologie** | `BUILDER`, `CLUSTER`, `GRAMMAR`, `BAND_OP`, `CROWN_KIND`, `LEVEL_CAPS`, `MIN_FOOTPRINT`, `MAX_FOOTPRINT`, `START_LEVEL_CDF`, `CLASS_PROFILE`, `TYPOLOGIES`, `DEFAULT_BUILDING_FORM`, `DEFAULT_TYPOLOGY_SHAPE`, `typologyById` |

## `src/game/` — ciclo di gioco

| File | Ruolo | Esporta |
| --- | --- | --- |
| [loop.ts](src/game/loop.ts) | Passo fisso della simulazione con tetto di recupero | `FixedStepLoop` |
| [growthScene.ts](src/game/growthScene.ts) | Cablaggio esclusivo di `grow=1`: tick, Builder e animazione | `GrowthScene`, `GrowthStats` |
| [launchMode.ts](src/game/launchMode.ts) | Risoluzione pura della modalita' iniziale e degli harness URL | `resolveLaunchMode`, `LaunchMode` |
| [actions.ts](src/game/actions.ts) | Azioni economiche atomiche: catalizzatori, policy, decisioni, commercio ed espansione | `placeCatalyst`, `catalystFailure`, `catalystSiteCost`, `togglePolicy`, `chooseDecision`, `changeTradeMode`, `buyExpansion`, `expansionFailure`, `SiteCost`, `ActionResult`, `ActionFailure` |
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
| [InspectOverlay.ts](src/ui/InspectOverlay.ts) | Referto tecnico delle viste: modi, slider della quota, colonna a fuoco e id dell'isolato |
| [ViewMenuModel.ts](src/ui/ViewMenuModel.ts) | Il menu delle viste dal lato del giocatore, puro: etichette, barra dei livelli, regola dello strumento |

## Test e bench

| File | Copre |
| --- | --- |
| [world/VoxelWorld.test.ts](src/world/VoxelWorld.test.ts) | Sparsità, dirty set ai bordi, AABB, contratto `data` ≠ `blocks` |
| [world/visualBlock.test.ts](src/world/visualBlock.test.ts) | Palette e superficie nello stesso byte, il vuoto ignora la superficie |
| [world/scenes/cityScene.test.ts](src/world/scenes/cityScene.test.ts) | Determinismo, riempimento al 20%, ripresa a passi, nessuna scrittura fuori region |
| [world/terrain/heightField.test.ts](src/world/terrain/heightField.test.ts) | Margine di Lipschitz su otto seed — la rete di sicurezza della calibrazione |
| [world/terrain/IslandGenerator.test.ts](src/world/terrain/IslandGenerator.test.ts) | Determinismo per blocco, continuità al confine, `expandIsland` |
| [world/terrain/TerrainMap.test.ts](src/world/terrain/TerrainMap.test.ts) | Mappa per colonna, istogramma, chunking |
| [engine/mesher/greedyMesher.test.ts](src/engine/mesher/greedyMesher.test.ts) | Fusione dei quad, orientamento delle facce, casi limite |
| [engine/mesher/buildPaddedVolume.test.ts](src/engine/mesher/buildPaddedVolume.test.ts) | Piani, spigoli e angoli del padding |
| [engine/mesher/microGeometry.test.ts](src/engine/mesher/microGeometry.test.ts) | Unità fisse, facce nascoste, testate condivise, priorità e limite |
| [engine/palette.test.ts](src/engine/palette.test.ts) | 32 slot, validazione dei colori |
| [engine/themes/themes.test.ts](src/engine/themes/themes.test.ts) | Ogni tema riempie i 32 slot, atmosfera in range |
| [world/terrain/decor.test.ts](src/world/terrain/decor.test.ts) | Alberi deterministici, biomi esclusi, chiome non sovrapposte e profili delle specie |
| [game/loop.test.ts](src/game/loop.test.ts) | Cadenza fissa e limite del recupero |
| [game/growthScene.test.ts](src/game/growthScene.test.ts) | Ciclo completo tick → costruzione → voxel, ordine del tutorial, usi misti e crescita verticale |
| [game/actions.test.ts](src/game/actions.test.ts) | Costo del sito con le opere di terra, pagamento una volta sola, requisiti e rifiuti, sito dell'opera concessa |
| [game/surfacePick.test.ts](src/game/surfacePick.test.ts) | Colonna sotto il raggio, edificabilita' e raggi che escono dalla mappa |
| [game/launchMode.test.ts](src/game/launchMode.test.ts) | Esperienza completa alla radice e isolamento degli harness URL |
| [game/onboarding.test.ts](src/game/onboarding.test.ts) | Sequenza e sblocco dei tre passi iniziali |
| [game/cityCondition.test.ts](src/game/cityCondition.test.ts) | Priorità delle crisi e stabilità richiesta per il successo |
| [game/sectors.test.ts](src/game/sectors.test.ts) | Identità uniche, terra utile e continuità delle espansioni |
| [ui/ControlsHint.test.ts](src/ui/ControlsHint.test.ts) | Completezza delle indicazioni dei comandi camera |
| [ui/GameHudModel.test.ts](src/ui/GameHudModel.test.ts) | Risorse, requisiti, blocchi economici e policy attive del HUD |
| [world/streets/streetGrid.test.ts](src/world/streets/streetGrid.test.ts) | Partizione strada/isolato, gerarchia degli assi, fronte e cuore, carreggiata piu' vicina, determinismo |
| [engine/inspect.test.ts](src/engine/inspect.test.ts) | Predicati delle quattro viste, finestra dei raggi X, lato della sezione, quota della fetta, accordo fra `modeCuts` e `isCut` |
| [ui/ViewMenuModel.test.ts](src/ui/ViewMenuModel.test.ts) | Ordine e etichette delle viste, barra dei livelli solo dove si taglia, strumento che chiude un taglio |
| [world/streets/lots.test.ts](src/world/streets/lots.test.ts) | Il lotto tocca sempre un fronte, non esce dall'isolato, l'isolato si riempie |
| [world/grading/grade.test.ts](src/world/grading/grade.test.ts) | Classificazione del terreno, quota del piano finito, tetto strutturale, rampa a pendenza uno |
| [world/sites/siteRules.test.ts](src/world/sites/siteRules.test.ts) | Ricerca dell'acqua sui quattro assi, intorno piano sotto il tetto proprio, motivi di rifiuto per ruolo |
| [world/buildings/Builder.test.ts](src/world/buildings/Builder.test.ts) | Candidato → occupazione della simulazione → voxel; allineamento alla rete stradale; opere di terra su isola vera; la banchina non si stacca dalla terra; landmark dei catalizzatori e avanzamento di stadio; isolati terrazzati — quota e basamento condivisi, nessun solco fra i membri, gradoni sul fianco; due mandati opposti danno due città diverse |
| [world/landmarks/generate.test.ts](src/world/landmarks/generate.test.ts) | Ingombro dichiarato, determinismo, stadi cumulativi, invarianza per rotazione, firma verticale e sagome distinte fra gli otto ruoli |
| [world/buildings/BuildingRegistry.test.ts](src/world/buildings/BuildingRegistry.test.ts) | Indice spaziale e sostituzione di record |
| [world/buildings/cluster.test.ts](src/world/buildings/cluster.test.ts) | Chi entra in fila e chi apre il gradino: mai scavare, tetto del riempimento, soglia di densità, termini adottati invariati |
| [world/buildings/generate.test.ts](src/world/buildings/generate.test.ts) | Determinismo e limiti degli stamp; terrazze, giardini, soglie luminose, silhouette per uso e corso di base che sposta la quota senza toccare la sagoma |
| [world/buildings/typology.test.ts](src/world/buildings/typology.test.ts) | Copertura del catalogo, scelta deterministica dal luogo, forme distinguibili fra tipologie, righe concesse da un mandato |
| [world/buildings/urbanForm.test.ts](src/world/buildings/urbanForm.test.ts) | Variazione deterministica della forma dal profilo locale |
| [sim/contracts.test.ts](src/sim/contracts.test.ts) | Purezza di `tick`, nessuna scrittura in `blocks`, serializzazione |
| [sim/SimState.test.ts](src/sim/SimState.test.ts) | Operazioni del giocatore, possesso del campo |
| [sim/tick.test.ts](src/sim/tick.test.ts) | Bilancio, nessuno stock negativo, pareggio 1:1 |
| [sim/DesirabilityField.test.ts](src/sim/DesirabilityField.test.ts) | Incrementale ≡ ricostruzione completa, cella per cella |
| [sim/policies.test.ts](src/sim/policies.test.ts) | Pesi identici bit a bit dopo on/off, indipendenza dall'ordine |
| [sim/policyCosts.test.ts](src/sim/policyCosts.test.ts) | Costi continuativi delle policy |
| [sim/districts.test.ts](src/sim/districts.test.ts) | Ruoli distinti, sovrapposizioni ed effetti spaziali |
| [sim/uses.test.ts](src/sim/uses.test.ts) | I quattro usi in ordine di contratto, vettori di influenza, uso misto e sua serializzazione |
| [sim/commerce.test.ts](src/sim/commerce.test.ts) | Le tre strozzature (banchi, personale, merce) e i due cicli economici distinguibili |
| [sim/registryIsolation.test.ts](src/sim/registryIsolation.test.ts) | 500 tick senza registry; `src/sim` non importa il dominio degli edifici voxel |
| [sim/decisions.test.ts](src/sim/decisions.test.ts) | Cadenza, persistenza, risoluzione e mandato occupato dalla scelta |
| [sim/charters.test.ts](src/sim/charters.test.ts) | Uno slot per famiglia, sostituzione, revoca, ordine canonico |
| [sim/trade.test.ts](src/sim/trade.test.ts) | Prerequisito del porto e priorità commerciali |
| [sim/nextBuildSites.test.ts](src/sim/nextBuildSites.test.ts) | Ordinamento, filtri di edificabilità |
| [sim/simPerf.test.ts](src/sim/simPerf.test.ts) | Tick sotto 3 ms, zero celle ricalcolate, costo indipendente dalla mappa |
| [engine/mesher/greedyMesher.bench.ts](src/engine/mesher/greedyMesher.bench.ts) | Costo per chunk: vuoto, edifici, edifici sci-fi, pieno, rumore, scacchiera |
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
| `grow` | — | `1` accende la crescita automatica degli edifici (acceso di default alla radice) |
| `quality` | `auto` | `high`, `balanced` o `performance` fissano pixel ratio ed effetti; `auto` adatta con isteresi |
| `shadows` | — | `0` spegne la pass del sole, qualunque sia la qualita' |
| `theme` | `natural` | `<id>` sceglie il tema; vale **anche senza** `debug` |
| `inspect` | — | `xray`, `slice`, `section` o `block` aprono una vista di ispezione; vale **anche senza** `debug` |
| `slice` | — | `<z>` fissa la quota della fetta; senza, segue il suolo che si sta guardando |
