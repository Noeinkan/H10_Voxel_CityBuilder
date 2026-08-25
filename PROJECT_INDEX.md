# Indice del progetto

Mappa file per file di `src/`. Il *perché* delle scelte sta nei README
([README.md](README.md), [src/sim/README.md](src/sim/README.md)); le regole
operative in [CLAUDE.md](CLAUDE.md). Qui c'è solo *dove sta cosa*.

Trentasettemila righe di TypeScript, 107 file di test (1142 test), 2 file di bench.

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
| [scripts/docs-merge.mjs](scripts/docs-merge.mjs) | `npm run docs:merge`: fonde i frammenti di `docs/pending/` in indice e changelog, con lucchetto per non pestarsi fra agenti |
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
| [docs/pending/README.md](docs/pending/README.md) | Formato dei frammenti di indice e changelog, e perché si scrive lì invece che nei due file | a domanda |
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
| [visualBlock.ts](src/world/visualBlock.ts) | Packing visuale in un byte: palette 0..31 e superficie 0..7, che su un voxel d'acqua porta la classe dello specchio e su una copertura del terreno — palette 0, un byte che il pack non produce mai — il tipo di erbetta | `SURFACE_KIND`, `SURFACE_KIND_NAMES`, `ALL_SURFACE_KINDS`, `WATER_CLASS`, `packVisualBlock`, `blockPalette`, `blockSurface`, `packCoverMark`, `coverMarkKind`, `isCoverMark` |
| [chunkCoords.ts](src/world/chunkCoords.ts) | Costanti e conversioni di coordinate, indici delle facce, portata del sondaggio del cielo | `CHUNK`, `PADDED`, `SKY_PROBE`, `CEILING_VOL`, `idx`, `paddedIdx`, `ceilingIdx`, `toChunk`, `toLocal`, `keyOf`, `FACE_*` |
| [rng.ts](src/world/rng.ts) | PRNG deterministico per la generazione | `mulberry32`, `hashCoords` |
| [reachCost.ts](src/world/reachCost.ts) | Quanto costa all'influenza attraversare una colonna: l'acqua ferma, la strada porta lontano. L'unico posto da cui terreno e strade si leggono insieme | `createReachCost` |
| [planMask.ts](src/world/planMask.ts) | Lo smusso della pianta, condiviso fra edifici e landmark: taglio di Manhattan, simmetrico allo scambio degli assi | `inPlan`, `onPlanEdge` |
| [scenes/cityScene.ts](src/world/scenes/cityScene.ts) | Scene deterministiche a passi con budget: `city`, `noise`, `slab`, e il rimando a `diorama` e `swatch` | `createScene`, `SceneGenerator`, `SceneKind`, `SceneOptions`, `TILE`, `STREET`, `LOT` |
| [scenes/dioramaScene.ts](src/world/scenes/dioramaScene.ts) | Un edificio solo su un basamento con il fronte strada, per giudicare il dettaglio da vicino | `createDioramaScene`, `parseBuildingUse`, `DIORAMA_DEFAULT_LEVEL`, `DioramaScene`, `DioramaOptions`, `DioramaSubject`, `DioramaSubjectOptions` |
| [scenes/swatchLayout.ts](src/world/scenes/swatchLayout.ts) | **Ogni** numero e ogni geometria del campionario, puro: estensione, sagoma del provino a pezzi centrati, riquadro di una cella, cella sotto una coordinata | `SWATCH`, `SWATCH_BAND`, `SWATCH_COLUMNS`, `SWATCH_ROWS`, `SWATCH_PILLARS`, `SWATCH_WATERS`, `CELL_PARTS`, `CELL_FOOTPRINT`, `CELL_HEIGHT`, `CELL_LEDGE`, `cellSolidAt`, `SCALE_ITEMS`, `SCALE_ORIGIN_Y`, `swatchExtent`, `matrixCellRect`, `strataPillarRect`, `plinthSpanAt`, `swatchCellAt`, `SwatchBand`, `SwatchCell`, `SwatchExtent`, `SwatchRect`, `SwatchPart`, `ScaleItem` |
| [scenes/swatchProbe.ts](src/world/scenes/swatchProbe.ts) | Quanti prismi di dettaglio emette una cella del campionario: rimisura con gli emettitori veri e un writer che conta invece di scrivere | `cellDetail`, `countDetail`, `SwatchDetail` |
| [scenes/swatchScene.ts](src/world/scenes/swatchScene.ts) | Il campionario dei voxel: matrice palette × superficie, stratigrafia per bioma, fascia di scala. Scrive e basta | `createSwatchScene` |

API pubblica del mondo: `setBlock`/`getBlock` e `getSurfaceKind` (rendering, marca sporco),
`fillColumn` (lo stesso su un tratto verticale, a costo di corsa invece che di
cella), `setData`/`getData` (simulazione, non marca niente), `ensureChunk`,
`flush`, `markAllDirty`.

## `src/world/terrain/` — isola procedurale

Genera un'isola deterministica da un seed, la scrive nel `VoxelWorld` con la sola
API pubblica, e produce in parallelo una mappa 2D per colonna.

La **sagoma** — quali lobi allungano la costa, dove stanno le colline, dove si
apre un lago — e' dichiarata in `landform.ts` e non emerge dal rumore: il rumore
fa la grana. Nessun elemento sceglie la propria altezza, la ricava dal raggio
attraverso il budget di pendenza, ed e' quello che tiene in piedi il vincolo di
Lipschitz su cui si regge il terreno a celle. La **forma in pianta** di un
elemento sta invece in `outline.ts`: un'ellisse orientata a cui poche armoniche
deformano il raggio, e che sul bordo torna il cerchio esatto che dichiara.

La **montagna la fa la quantizzazione, non il rilievo**: il campo resta dolce, e
`terrace.ts` allarga la pedata con la quota — due voxel in pianura, otto sulla
roccia. Le scale sono pero' **tre** e non una, perche' con una sola il salto vale
esattamente un'alzata e ogni parete di una fascia esce alta uguale: un campo in
pianta sceglie fra roccia fine, media e massiccia, e il ciglio cambia altezza
dove cambia la stratificazione. Da li' escono i cigli, e dai cigli le sporgenze.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/terrain/config.ts) | **Ogni** soglia, frequenza, ampiezza, stratigrafia e numero della sagoma, del terrazzamento, della copertura, delle vene di roccia e delle sporgenze | `TERRAIN`, `LANDFORM`, `TERRACE`, `ROCK`, `GROUND_COVER`, `LEDGE`, `BIOME`, `BIOME_NAMES`, `BIOME_STRATA`, `BUILDABLE_BIOMES`, `WATER_IDS`, `TREE_DECOR` |
| [outline.ts](src/world/terrain/outline.ts) | La forma in pianta di un elemento della sagoma: ellisse orientata con il raggio deformato da poche armoniche, che si spengono sul bordo. Il fattore di Lipschitz della deformazione, misurato e in forma chiusa | `Outline`, `Warp`, `WarpTerm`, `outlineOf`, `outlineRatio`, `outlinePoint`, `planWarp`, `warpLipschitz`, `SHAPE_WARP_LIPSCHITZ` |
| [rockTone.ts](src/world/terrain/rockTone.ts) | I grigi della roccia: uno strato per gradone, e nessuna variazione in pianta — due grigi alla stessa quota vorrebbero dire due strati alla stessa quota | `rockBandAt`, `rockSurface`, `rockSubsoil` |
| [terrace.ts](src/world/terrain/terrace.ts) | Le tre scale di quote su cui il terreno si posa, l'alzata che cresce con la quota e cambia con la stratificazione, il campo in pianta che sceglie la scala — e che toglie al ciglio sia la faccia di curva di livello sia l'altezza costante —, e il ciglio che ne esce | `terraceOf`, `terraceAt`, `terraceStepAt`, `terraceScheduleAt`, `cellFloor`, `isCliff` |
| [flora.ts](src/world/terrain/flora.ts) | Catalogo delle specie e chi cresce dove: sei profili e una lista pesata per bioma | `TREE_SPECIES`, `TREE_SHAPES`, `TreeShape`, `TreeCanopyLevel`, `FLORA`, `BiomeFlora`, `SpeciesWeight`, `pickSpecies` |
| [cellGrid.ts](src/world/terrain/cellGrid.ts) | Il reticolo di celle di un blocco, con due celle di margine: quota terrazzata, bioma, pendenza, salto e verso | `buildCellGrid`, `CellGrid`, `cellIsCliff`, `gridIndex`, `inGrid`, `CELL_MARGIN`, `CELLS_PER_BLOCK`, `GRID_SIDE`, `CELL_STEPS`, `HEIGHT_BORDER` |
| [groundcover.ts](src/world/terrain/groundcover.ts) | Erbette, fiori e sassi: se e cosa cresce su una colonna, da un hash e senza record, piu' la tabella tinta/forma che il mesher legge dalla palette del terreno | `COVER`, `CoverKind`, `COVER_FORM`, `CoverForm`, `coverAt`, `coverToneOn`, `coverFormOn`, `coverGroundPalettes` |
| [ledges.ts](src/world/terrain/ledges.ts) | Sporgenze di roccia sul ciglio: la prima cosa del terreno che non e' una colonna | `ledgeAt`, `ledgeSpec`, `ledgeTop`, `ledgeTouches`, `writeLedge`, `LedgeSpec`, `LEDGE_MIN_DROP`, `LEDGE_RECORD_SIZE` |
| [heightField.ts](src/world/terrain/heightField.ts) | Maschera a lobi × 3 ottave di simplex, piu' rilievi e conche | `HeightField` |
| [landform.ts](src/world/terrain/landform.ts) | La sagoma prima del rumore: lobi della costa, rilievi interni, conche dei laghi. Nessuna altezza dichiarata — la detta il budget di pendenza; la forma in pianta la detta `outline.ts` | `Lobe`, `Mound`, `Basin`, `BasinSite`, `planLobes`, `planMounds`, `planBasins`, `moundRise`, `shapeBasins`, `lakeLevelAt`, `domeFalloff`, `basinProfile`, `basinWeight`, `capForRadius`, `fitRadius` |
| [biomes.ts](src/world/terrain/biomes.ts) | Bioma da altezza e pendenza, edificabilità, colore per profondità — e per colonna, dove la roccia ha una banda | `classifyBiome`, `isBuildable`, `paletteForDepth`, `paletteAt` |
| [region.ts](src/world/terrain/region.ts) | Region, `IslandShape`, allineamento ai chunk di colonna | `Region`, `IslandShape`, `shapeFromRegion`, `alignRegion`, `chunkSpanOf` |
| [columnBlock.ts](src/world/terrain/columnBlock.ts) | Blocco 32×32 di colonne piu' i record di alberi e sporgenze, trasferibile fra worker e main; porta anche la quota d'acqua e la copertura per colonna | `ColumnBlock`, `columnIndex`, `blockTransferables` |
| [decor.ts](src/world/terrain/decor.ts) | Alberi deterministici per cella, specie dai pesi del bioma, scrittura ritagliata al blocco | `treeAt`, `treeSpec`, `treeTop`, `writeTree`, `TreeSpec`, `TREELESS_BIOMES` |
| [IslandGenerator.ts](src/world/terrain/IslandGenerator.ts) | `generateIsland`, `expandIsland`, colonne, alberi e sporgenze | `generateIsland`, `expandIsland`, `generateColumnBlock`, `writeBlockColumns`, `writeBlockDecor`, `writeBlockLedges` |
| [TerrainMap.ts](src/world/terrain/TerrainMap.ts) | Mappa sparsa per colonna, chunkata 32×32 come il mondo | `TerrainMap`, `TerrainColumn`, `TerrainColumnChunk` |
| [terrainMessages.ts](src/world/terrain/terrainMessages.ts) | Protocollo main ↔ worker | `TerrainJob`, `BlockMessage`, `DoneMessage` |
| [terrain.worker.ts](src/world/terrain/terrain.worker.ts) | Generazione fuori dal main thread, un blocco per volta (21,46 kB in bundle) | — |
| [TerrainStreamer.ts](src/world/terrain/TerrainStreamer.ts) | Riceve i blocchi e li applica a budget di frame; è un `SceneGenerator` | `TerrainStreamer` |
| [waterClass.ts](src/world/terrain/waterClass.ts) | Bassofondo, canale o mare aperto da profondita' e sponde, dove la profondita' esiste ancora | `classifyWater` |
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
| [daylight.ts](src/engine/daylight.ts) | Ciclo giorno/notte in TS puro: traiettoria del sole dall'ora, fase del giorno dall'altezza, atmosfera derivata (riflesso dell'acqua compreso), tre modi dell'orologio | `DAYLIGHT`, `DAYLIGHT_MODE`, `DAYLIGHT_MODES`, `DaylightMode`, `dayPhase`, `nightFactor`, `sunElevation`, `sunAzimuth`, `withHour`, `modeHour`, `nextDaylightMode`, `resolveDaylightMode`, `mixHex`, `normaliseHour` |
| [daylight.test.ts](src/engine/daylight.test.ts) | Mezzogiorno identico al tema, sole che sorge a est, crepuscolo continuo, tetto mai la faccia piu' scura, temi che restano distinti di notte, riflesso dell'acqua che segue l'ora, giro dei tre modi | — |
| [atmosphere.ts](src/engine/atmosphere.ts) | Prospettiva aerea in TS puro: densita' esponenziale in quota, integrata in forma chiusa lungo il raggio, piu' il velo di quota | `fogShape`, `fogOpticalDepth`, `fogAmount`, `fogAltitudeLift`, `fogVeil`, `FogModel`, `FOG_FLAT_EPSILON`, `FOG_LIFT_SHARPNESS` |
| [atmosphere.test.ts](src/engine/atmosphere.test.ts) | A pari distanza il frammento alto riceve meno velo; continuita' del ramo limite; composizione per trasmittanza | — |
| [nightWindows.ts](src/engine/nightWindows.ts) | Come si accende una facciata di notte, in TS puro: tetto alla quota accesa, carattere per torre, piani interi contro finestre sparse. **Ogni** numero del dominio | `NIGHT_WINDOWS`, `litShare`, `towerBias` |
| [nightWindows.test.ts](src/engine/nightWindows.test.ts) | Citta' vuota al buio, quota che cresce e non torna indietro, nessuna torre che accende tutto, soglia del piano dentro l'intervallo utile | — |
| [inspect.ts](src/engine/inspect.ts) | Viste di ispezione in TS puro: dal modo attivo ai tre predicati e alla densita' della rigatura. I numeri che valgono per **tutti** i modi | `INSPECT`, `INSPECT_MODE`, `INSPECT_MODES`, `INSPECT_NAMES`, `inspectUniforms`, `sectionAxis`, `cycleInspectMode`, `parseInspectMode`, `clampSliceZ`, `isCut`, `needsCap`, `isOpenPlane`, `modeCuts`, `modeHasLevel`, `isActive`, `isBoundedRect`, `inspectGuide`, `InspectMode`, `InspectState`, `InspectUniforms`, `InspectGuide`, `InspectBox` |
| [inspect.test.ts](src/engine/inspect.test.ts) | Tiene allineate la copia TS e quella GLSL del predicato | — |
| [xray.ts](src/engine/xray.ts) | La lente dei raggi X: test a lastre, densita' che cresce verso la camera, gabbia sul filo del voxel. **Ogni** numero della lente | `XRAY`, `lensHit`, `lensChord`, `xrayDensity`, `LensHit` |
| [xray.test.ts](src/engine/xray.test.ts) | Il velo si scioglie di piu' vicino a chi guarda, non taglia mai, sfuma sul contorno della sagoma, e non buca ne' il soggetto ne' il suo pavimento | — |
| [SunShadow.ts](src/engine/SunShadow.ts) | Shadow map ortografica del sole: fitting sull'AABB visibile, aggancio ai texel, materiale di sola profondita' | `createSunShadow`, `SunShadowHandle` |
| [PostProcessing.ts](src/engine/PostProcessing.ts) | Composer sempre attivo: bloom, tilt-shift, tone mapping in `OutputPass` | `createPostProcessing`, `PostProcessingHandle` |
| [SkyBackground.ts](src/engine/SkyBackground.ts) | Fondo procedurale: quad in NDC senza profondita', gradiente per altezza di schermo, disco solare e nuvole a bande | `createSkyBackground`, `SkyBackgroundHandle` |
| [SkyBackground.test.ts](src/engine/SkyBackground.test.ts) | Quad che non scrive profondita', riscrittura degli uniform senza sostituire la mesh, minimo notturno del sole | — |
| [FrameTiming.ts](src/engine/FrameTiming.ts) | Finestra scorrevole di intervalli rAF: fps, uno percento peggiore, p95/p99, jank | `FrameTiming`, `FrameTimingSnapshot` |
| [FrameTiming.test.ts](src/engine/FrameTiming.test.ts) | Vero uno percento peggiore; tab nascosta e resume non contano come frame lenti | — |
| [RenderQuality.ts](src/engine/RenderQuality.ts) | Pixel ratio adattivo con isteresi e profilo di effetti derivato: ombre, bloom, tilt-shift scendono insieme | `RenderQualityController`, `parseQualityMode`, `QualityMode`, `QualityProfile`, `QualityDecision`, `QualityReason` |
| [RenderQuality.test.ts](src/engine/RenderQuality.test.ts) | Scende dopo due finestre lente, risale dopo dieci secondi stabili, i modi fissi hanno profilo fisso | — |
| [InfluenceOverlay.ts](src/engine/InfluenceOverlay.ts) | Contorno della portata dei catalizzatori, tracciato con marching squares sui dati veri del campo, e perimetri dei settori | `InfluenceOverlay` |
| [InspectGuides.ts](src/engine/InspectGuides.ts) | Le linee che dicono dove e' puntata una vista: riquadro, carreggiata della sezione, colonna a fuoco | `InspectGuides` |
| [InspectView.ts](src/engine/InspectView.ts) | Lo stato delle viste di ispezione: colonna a fuoco, isolato scelto, aggancio della camera, ri-armo della quota. Il raccordo fra mondo e `inspect.ts`, che resta puro | `createInspectView`, `InspectView`, `InspectViewOptions`, `FocusCell` |
| [InspectView.test.ts](src/engine/InspectView.test.ts) | La quota della fetta si arma una volta sola sul suolo guardato: non insegue il cursore, non salta al centro dell'inquadratura quando il raggio manca l'isola, non riscrive una quota scelta, si ri-arma solo riaprendo la vista | — |
| [SelectionOutline.ts](src/engine/SelectionOutline.ts) | Il contorno di cio' che il giocatore ha scelto: base che segue il terreno, coperchio alla quota della cosa, montanti agli angoli. Colore proprio, perche' non e' una guida di ispezione | `SelectionOutline`, `SelectionBox` |
| [AtmosphereControl.ts](src/engine/AtmosphereControl.ts) | Chi possiede tema, ora e modo del giorno, e li scrive in renderer, composer e materiale | `createAtmosphereControl`, `AtmosphereControl`, `AtmosphereOptions` |
| [PlacementCursor.ts](src/engine/PlacementCursor.ts) | Segnaposto sotto il puntatore: base, mirino, onda e fascio, sempre sopra la scena | `PlacementCursor` |
| [TrafficView.ts](src/engine/TrafficView.ts) | I mezzi in movimento, fuori dal volume voxel: geometria condivisa per tipo, colori dalla palette per la luce della faccia, e la mesh unica del pennacchio riscritta per frame | `TrafficView`, `faceShades`, `FACE_CORNERS` |
| [vehicleHulls.ts](src/engine/vehicleHulls.ts) | La forma dei mezzi in scatole, senza Three: scafi rastremati, fasce di galleggiamento, ali a freccia, ciminiere che chiudono sulla bocca dichiarata | `hullBlocks`, `HullBlock` |
| [vehicleHulls.test.ts](src/engine/vehicleHulls.test.ts) | Sagoma articolata e simmetrica, ingombro in lunghezza, la fascia sul pelo dell'acqua, e il fumaiolo che chiude esattamente dove il pennacchio nasce | — |
| [RopewayView.ts](src/engine/RopewayView.ts) | Le funi delle funivie, fuori dal volume voxel: un concio per tratto, riferimento costruito sul verso, geometria ricostruita solo quando nasce una linea | `RopewayView`, `CableLine` |
| [RopewayView.test.ts](src/engine/RopewayView.test.ts) | Ogni faccia del concio guarda in fuori — una fune avvolta al contrario sparirebbe nel culling, e non lo direbbe nessun tipo —, l'array uguale non ricostruisce niente, la luce non lascia i vertici neri | — |
| [introDrop.ts](src/engine/introDrop.ts) | La caduta con cui i pezzi della prima isola entrano in scena, in TS puro. **Ogni** numero: margine oltre il bordo dello schermo, durata, jitter per chunk, ritardo per piano, rimbalzo | `INTRO`, `DROP_SPAN`, `fallHeightFor`, `dropDelay`, `dropLift`, `hasLanded` |
| [introDrop.test.ts](src/engine/introDrop.test.ts) | Accelera invece di galleggiare, non risale mai, il rimbalzo e' in voxel e non in frazione, la quota di partenza sta fuori schermo e non diverge a picco, il piano di chunk sopra atterra dopo quello sotto | — |
| [dropRain.ts](src/engine/dropRain.ts) | I cubetti che piovono davanti al pezzo in arrivo: semina per chunk, discesa, tetto dei vivi. La colonna arriva come sonda, quindi niente mondo e niente Three | `RAIN`, `RainCube`, `RainColumn`, `RainProbe`, `RainState`, `createRain`, `clearRain`, `spawnOverChunk`, `advanceRain` |
| [dropRain.test.ts](src/engine/dropRain.test.ts) | Semina dentro l'impronta, un piano di chunk solo per colonna, determinismo, il tetto assottiglia invece di interrompere, la pioggia si svuota tutta | — |
| [DropRainView.ts](src/engine/DropRainView.ts) | La mesh unica dei cubetti, buffer dinamici e `drawRange` come il pennacchio; colori dalla palette per la luce della faccia | `DropRainView` |
| [PlacementCursor.test.ts](src/engine/PlacementCursor.test.ts) | Posizione sulla colonna, stato valido/rifiutato, esclusione dalla profondita' | — |
| [IsoCameraController.ts](src/engine/IsoCameraController.ts) | Ortografica isometrica: scatti di 90°, zoom, pan vincolato all'AABB, **orbita** libera (yaw continuo, inclinazione 12°-82°) e ritorno all'assetto, piu' il modo studio di un soggetto (pan del perno dentro il soggetto, cattura e ripristino dell'inquadratura) | `IsoCameraController`, `IsoCameraOptions`, `IsoCameraState` |
| [IsoCameraController.test.ts](src/engine/IsoCameraController.test.ts) | Perno della rotazione sotto il cursore, orbita col tasto centrale che non sposta l'inquadratura, riaggancio della griglia dallo scatto piu' vicino, orbita attorno al target con inclinazione clampata, pan che sale lungo il soggetto e ripristino identico | — |
| [CameraInput.ts](src/engine/CameraInput.ts) | La mappa dei gesti: quale tasto del mouse pana e quale orbita, rotella, tasti della camera e insieme dei tasti premuti | `CameraInput`, `CameraCommands`, `isPanButton`, `isOrbitButton` |
| [CameraInput.test.ts](src/engine/CameraInput.test.ts) | Tasti del mouse divisi fra pan e orbita, gesto che non cambia strada a meta', autoscroll del centrale fermato, `Q`/`E`/`F` che non restano premuti | — |
| [orbitPan.ts](src/engine/orbitPan.ts) | Il pan da tastiera in TS puro: cosa dicono i tasti, e dove finisce il perno dell'orbita dentro il volume del soggetto | `readPanAxes`, `panOrbitPivot`, `scaleOrbitBounds`, `OrbitBounds`, `PanAxes`, `Pivot` |
| [orbitPan.test.ts](src/engine/orbitPan.test.ts) | WASD e frecce sono lo stesso comando, versi opposti che si annullano, scorrimento di traverso all'azimut, salita in quota e vincolo al soggetto | — |
| [palette.ts](src/engine/palette.ts) | Caricamento della palette, validazione, HMR a caldo | `paletteHex`, `toPaletteArray`, `isValidHexColor`, `onPaletteChanged` |
| [paletteSlots.ts](src/engine/paletteSlots.ts) | I 32 slot nominati, piu' i nomi derivati per indice | `PALETTE_SLOTS`, `PALETTE_SIZE`, `PALETTE_SLOT_NAMES` |
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
| [greedyMesher.ts](src/engine/mesher/greedyMesher.ts) | Greedy meshing, AO e visibilita' del cielo per faccia, scratch riusato fra job. Il mask loop salta le facce che la maschera degli scavi dichiara scavate | `greedyMesh`, `createScratch`, `MeshScratch`, `MAX_QUADS_PER_CHUNK`, `MAX_BASE_QUADS_PER_CHUNK`, `SHADE_AO_MASK`, `SHADE_SKY_SHIFT`, `SHADE_SKY_MASK` |
| [microGeometry.ts](src/engine/mesher/microGeometry.ts) | Microgeometria **additiva** a 1/16 di voxel accodata al greedy pass: struttura (portali, parapetti, cornici, finiali sulle colonne isolate, fasce sugli sbalzi) piu' i prop appesi alle giunzioni. I prismi di facciata si appoggiano al filo del vano quando la parete e' scavata | `appendMicroGeometry`, `MicroGeometryWriter`, `BoxOptions`, `ChunkOrigin`, `FixedBox`, `RunSpec`, `SurfaceCells`, `MAX_DETAIL_QUADS_PER_CHUNK`, `collectSurfaceCells`, `emitRuns`, `emitPoints`, `facadeBox`, `facadeAt`, `facadeHorizontalAxis`, `frontage`, `openRoof`, `interiorRoof`, `underSetback`, `blockAt`, `isExposed`, `hasSurfaceFace`, `propRoll`, `LATERAL_FACES` |
| [microStreet.ts](src/engine/mesher/microStreet.ts) | Il dettaglio del **retro** e del tetto praticabile: calate, scale esterne, pergole. Si aggancia dove `frontage` è falso | `appendStreetDetail` |
| [carveMarks.ts](src/engine/mesher/carveMarks.ts) | Le ricette di scavo e il byte che le trasporta: modulo foglia, letto dal greedy pass, dal piano, dal disegno e dagli emettitori additivi | `CARVE_KIND`, `CarveKind`, `CARVE_DEPTH`, `packCarveMark`, `carveIndex`, `carvedFace`, `carveKindAt`, `carveFaceAt`, `facadeInset`, `roofInset` |
| [carvePlan.ts](src/engine/mesher/carvePlan.ts) | *Dove* si scava: aggancio geometrico per ricetta, maschera per faccia, riserva di quad. Gira **prima** del greedy pass e non tocca il volume | `planCarves`, `clearCarves`, `carveMarkFor`, `carveKindFor`, `carveRunAxis`, `CarvePlan`, `MAX_CARVE_QUADS_PER_CHUNK` |
| [carveGeometry.ts](src/engine/mesher/carveGeometry.ts) | Microgeometria **riduttiva**: soglie, vetrate a filo interno, logge, nicchie, vani scala, vassoi di terrazza e mezzanini. Disegna il perimetro del vano, non le celle | `appendCarveDetail` |
| [coverDetail.ts](src/engine/mesher/coverDetail.ts) | Erbette in microgeometria: toglie dal volume le celle marcate — anello e soffitto compresi — ci disegna lame, steli e sassi a 1/16, e rimette il volume com'era | `liftGroundCover`, `restoreGroundCover`, `appendCoverDetail`, `LiftedCover` |
| [buildPaddedVolume.ts](src/engine/mesher/buildPaddedVolume.ts) | Chunk + tutti i 26 vicini immediati → volume 34³; e la fetta di soffitto 34×34×`SKY_PROBE` che il cielo deve poter guardare | `buildPaddedVolume`, `buildCeilingSlab` |
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
| [SimState.ts](src/sim/SimState.ts) | Stato, operazioni del giocatore, serializzazione JSON senza perdita | `createSimState`, `addCatalyst`, `addBuilding`, `addFarm`, `removeFarm`, `setPolicyActive`, `setSelectedClass`, `toSimStateData`, `reviveSimState`, `rebuildField` |
| [tick.ts](src/sim/tick.ts) | Il bilancio di un tick, funzione pura | `tick`, `tickMany`, `weightsOf` |
| [DesirabilityField.ts](src/sim/DesirabilityField.ts) | Campo per uso urbano, `Uint8Array` chunkato 32×32, ricalcolo incrementale | `DesirabilityField`, `rectAround`, `rectArea`, `Catalyst`, `Building`, `CellRect` |
| [reach.ts](src/sim/reach.ts) | Portata geodetica di un catalizzatore e l'unica curva di decadimento del progetto: Dijkstra a 8 vicini tagliato al raggio, con cache per centro | `computeReach`, `distAt`, `reachAt`, `falloff`, `ReachCache`, `UNIFORM_COST`, `ReachField`, `StepCost` |
| [reach.test.ts](src/sim/reach.test.ts) | Con costo uniforme riproduce la Chebyshev cella per cella; la forma non esce mai dal quadrato; l'acqua ferma e la strada porta lontano | — |
| [policies.ts](src/sim/policies.ts) | Catalogo delle policy e risoluzione dei pesi | `POLICIES`, `resolveWeights`, `withPolicy`, `policyById`, `isPolicyId`, `Weights`, `PolicyId` |
| [districts.ts](src/sim/districts.ts) | Profili locali, distretti e specializzazioni da campi sovrapposti | `urbanProfileAt`, `specializationOf`, `dominantUse`, `DistrictId`, `LocalUrbanProfile`, `Specialization` |
| [commerce.ts](src/sim/commerce.ts) | Il ciclo commerciale interno: domanda, organico, merce, ricavi | `resolveCommerce`, `EMPTY_COMMERCE`, `CommerceReport` |
| [flows.ts](src/sim/flows.ts) | Da dove vengono i fondi di un tick e dove vanno: referto derivato come `commerce`, non un accumulo | `FundsReport`, `NO_FUNDS_FLOW`, `fundsIn`, `fundsOut`, `dominantOutflow` |
| [decisions.ts](src/sim/decisions.ts) | Scelte periodiche deterministiche, con mandato e opera concessi | `decisionAt`, `decisionOption`, `CityDecision`, `DecisionGrant` |
| [charters.ts](src/sim/charters.ts) | Mandati lasciati dalle decisioni: uno slot per famiglia, permanenti | `CHARTERS`, `charterById`, `charterOfFamily`, `isCharterId`, `withCharter`, `withoutFamily`, `canonicalCharters`, `Charter`, `CharterFamily`, `CharterId` |
| [farms.ts](src/sim/farms.ts) | I tre produttori di cibo: listino in case sfamate, braccia, manutenzione, referto del raccolto, e i due numeri che il bilancio consegna a chi pianta e a chi giudica | `FARM_KIND`, `ALL_FARM_KINDS`, `harvestOf`, `foodYieldOf`, `farmWorkersOf`, `farmUpkeepOf`, `foodDeficitOf`, `missingPlotsOf`, `fedShareOf`, `isFarmKind`, `FarmKind`, `FoodReport`, `EMPTY_HARVEST` |
| [trade.ts](src/sim/trade.ts) | Import/export aggregato sbloccato dal porto | `resolveExternalTrade`, `TRADE_MODES`, `TradeMode` |
| [ferry.ts](src/sim/ferry.ts) | Quali imbarchi sono serviti da una linea: la coppia, non il singolo molo | `ferryLinesOf`, `servedFerryLines`, `FerryLine`, `FerryTerminal` |
| [nextBuildSites.ts](src/sim/nextBuildSites.ts) | I candidati, ordinati, filtrati e con l'eventuale secondo uso | `nextBuildSites`, `BuildSite`, `BuildSiteQuery` |
| [rng.ts](src/sim/rng.ts) | `mulberry32` in forma pura, stato dentro `SimState` | `nextState`, `unitOf` |
| [scenario.ts](src/sim/scenario.ts) | Fixture della scena di debug: catalizzatori, nucleo di edifici e lotti agricoli | `createScenarioState`, `scenarioCatalysts` |
| [debugData.ts](src/sim/debugData.ts) | L'unica scrittura verso il `VoxelWorld`, e va in `data` | `writeDesirabilityData` |
| [vitality.ts](src/sim/vitality.ts) | Quanto la citta' e' viva in due frazioni: case occupate e negozi pieni. Lettura pura, la consumano le luci | `cityVitality`, `DEFAULT_VITALITY`, `CityVitality` |
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
| [corridor.ts](src/world/streets/corridor.ts) | Il raccordo di un isolato nato staccato: percorso a costo minimo sugli incroci della maglia, il terreno entra come costo di un tratto | `planCorridor`, `nearestBlock`, `blockNeighbours`, `CorridorLeg`, `CorridorRequest`, `Axis` |
| [StreetNetwork.ts](src/world/streets/StreetNetwork.ts) | Facciata sul seed: ruoli, isolati, anello di carreggiata da dipingere, colonne di un tratto di raccordo | `StreetNetwork`, `PavementCell` |

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

## `src/world/farms/` — la campagna

I lotti che nutrono la città: dove possono stare, che forma hanno, e le colonne
da dipingere perché ci si veda un campo. **Un lotto non è un ostacolo** — non
entra in nessuno dei due indici di collisione del registry, quindi la città ci
costruisce sopra senza saperlo e il lotto si ritira. È il ciclo che rende la
torre idroponica una scelta invece di un edificio in più. Puro fin dove può
esserlo: `plotPlan.ts` non tocca né il mondo né il registry.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/farms/config.ts) | **Ogni** misura dei lotti: lato, passo dei solchi, reticolo, soglie di bordo, cadenza | `FARMS`, `FARM_PLOT_ALIGNED` |
| [plotPlan.ts](src/world/farms/plotPlan.ts) | Dove un lotto ci sta e perché no; le colonne che portano un solco | `planPlot`, `plotRows`, `plotRowCount`, `FarmPlot`, `FarmPlan`, `FarmProbe`, `FarmRefusal`, `FarmPlotQuery` |
| [generate.ts](src/world/farms/generate.ts) | Dal lotto alle `SurfacePaint`: posare i solchi e riprendersi il prato | `paintPlot`, `clearPlot`, `FARM_PAINT_PRIORITY` |
| [orchard.ts](src/world/farms/orchard.ts) | Gli alberi di un frutteto su reticolo, come stamp per la coda della crescita | `orchardStamp`, `orchardTrees` |
| [FarmRegistry.ts](src/world/farms/FarmRegistry.ts) | Dove si è già piantato. Un `Map`, non un indice di collisione | `FarmRegistry` |

```ts
planPlot({ x, y, seed, biomeAt, slopeAt, occupied, builtNear });  // { ok, plot } | { ok: false, reason }
paintPlot(plot);                           // SurfacePaint[] con palette 0 e il solco
clearPlot(plot);                           // le stesse colonne con cover 0: «togli»
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
| [siteRules.ts](src/world/sites/siteRules.ts) | Cerca l'acqua sui quattro assi — battigia o acqua a galla, che non sono la stessa colonna —, ne dice verso e distanza, misura un intorno piano, traduce l'etichetta in un motivo di rifiuto | `sightWater`, `WaterSight`, `seesWater`, `waterDistance`, `waterFacing`, `openGround`, `siteRefusal`, `SiteRefusal` |

```ts
seesWater(map, x, y, SITE.coastalRadius);              // il mare e' entro il raggio?
waterFacing(map, x, y, SITE.coastalRadius);            // da che parte? orienta il molo
sightWater(map, x, y, SITE.shoreReach, true);          // { facing, distance } dell'acqua a galla
openGround(map, x, y, SITE.openSpan, SITE.openMaxStep); // l'intorno regge un piano unico?
siteRefusal(map, x, y, 'coastal');                     // 'needs-coast' | 'needs-open-ground' | null
```

`afloat` non e' un dettaglio: la colonna a quota **esatta** del pelo del mare e'
battigia — bagnata, in vista del mare, sito costiero a tutti gli effetti — ma
`IslandGenerator` non ci scrive nessun voxel d'acqua. Chi chiede «e' un posto sul
mare?» la vuole dentro; chi ci deve posare uno scafo la vuole fuori, e su
quest'isola fra le due risposte ci sono dieci colonne di bassofondo.

## `src/world/skyline/` — la gerarchia verticale

Fin dove una colonna puo' salire, che e' una domanda diversa da «questa colonna
vuole crescere?». La desiderabilita' continua a decidere **se** un edificio
promuove; qui si decide **fin dove**, perche' il campo e' un `Uint8Array` che
satura a 255 e sopra l'ultima soglia non distingue piu' due colonne del centro.
Senza questa separazione, alzare il livello massimo darebbe un altopiano piu'
alto invece di uno skyline.

Puro e senza stato come la rete stradale: distanza dai poli, dal mare e dal bordo
dell'edificato entrano come numeri, esce un tetto. `src/sim/` continua a non
avere una coordinata verticale (invariante 7).

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/skyline/config.ts) | **Ogni** tetto di fascia, bonus, raggio e cadenza dei picchi | `SKYLINE` |
| [tiers.ts](src/world/skyline/tiers.ts) | Le tre fasce, il cono verso il polo e l'elezione dell'isolato con il picco | `TIER`, `tierAt`, `allowedLevelAt`, `poleReach`, `isPeakBlock`, `SkylineTier`, `SkylineQuery`, `Pole` |

```ts
tierAt(query);          // fringe | middle | core
allowedLevelAt(query);  // livelli ammessi; il clamp a BUILDER.maxLevel lo fa il Builder
isPeakBlock(seed, kx, ky);
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

Una ricetta dichiara anche i propri **ormeggi**: i punti in cui i mezzi di
`src/world/traffic/` stanno fermi, o da cui partono. Stanno qui e non la' perche'
sono coordinate *della forma* — il bordo di una darsena che questa tabella
disegna — e con loro sta la **linea d'acqua**, cioe' la colonna in cui la ricetta
pretende che il mare cominci: e' quella che il piazzamento va a cercare sul
terreno vero, facendo scorrere la struttura lungo il fronte finche' la banchina
incontra l'acqua.

Lo **scalo in quota** (`SKYPORT`) e' la seconda forma dell'aeroporto, scelta dal
luogo invece che dal seme: sotto la colonna c'e' un tetto, quindi non si
costruisce un campo di volo ma tre modi di arrivarci senza pista — il pilone del
dirigibile, la piazzola dell'eVTOL, la cima della mongolfiera.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/landmarks/config.ts) | **Ogni** ingombro, quota, soglia di stadio, ormeggio, linea d'acqua e indice di palette, piu' le nove ricette con tre esemplari a testa e la ricetta da tetto. Qui vive anche `PartsRecipe`, il formato che le arcologie condividono | `LANDMARK`, `LANDMARKS`, `SKYPORT`, `BERTH`, `landmarkOf`, `hasAloftRecipe`, `maxStageOf`, `variantsOf`, `PartsRecipe`, `LandmarkRecipe`, `LandmarkVariant`, `LandmarkMooring`, `BerthKind` |
| [parts.ts](src/world/landmarks/parts.ts) | Le dieci primitive con cui una ricetta si compone, lo smusso della pianta e la rotazione sul verso | `PART`, `Part`, `PartKind`, `box`, `partBounds`, `orientPart`, `orientedSpan`, `createCanvas`, `drawPart`, `LandmarkCanvas` |
| [generate.ts](src/world/landmarks/generate.ts) | Compone tronco ed esemplare in uno stamp; ingombro, origine, stadio, scelta della variante dal seme e ormeggi portati sul verso vero. Il nucleo ricetta→stamp e' condiviso con le arcologie | `generateFromRecipe`, `recipeSpan`, `recipeOrigin`, `generateLandmark`, `landmarkSpan`, `landmarkOrigin`, `landmarkMoorings`, `stageForBuildings`, `variantIndexOf`, `RecipeRequest`, `LandmarkRequest`, `WorldMooring` |

```ts
landmarkSpan('port', FACING.east);          // { sizeX, sizeY, sizeZ } | null
landmarkOrigin('port', facing, x, y);       // angolo minimo dell'ingombro | null
landmarkMoorings('ferry', facing, ox, oy);  // dove stanno le barche, nel mondo
stageForBuildings(recipe, nearby);          // quanto la citta' intorno ha meritato
generateLandmark({ kind, stage, facing });  // VoxelStamp | null
```

## `src/world/arcology/` — la megastruttura

Il «dopo» della gerarchia verticale. Quando la quota ammessa satura, un isolato
del centro non ha piu' niente da diventare: `upgradePass` lo salta e la citta'
smette di cambiare figura proprio dove e' piu' densa. L'arcologia e' un'opera
sola che vale un quartiere, con **usi diversi su quote diverse** dentro un unico
volume.

Non e' un edificio grosso, ed e' la ragione per cui non sta in `buildings/`: un
edificio ha *un* uso, *un* livello e una pianta rettangolare piena. Qui gli usi
sono quattro e distribuiti in verticale, il livello e' uno **stadio**, e la
pianta ha dei vuoti in mezzo. La macchina e' quella dei landmark — `PartsRecipe`
disegnata da `generateFromRecipe` — e cio' che si aggiunge sono due tabelle di
posti: dove stanno gli usi, e dove attracca la rete in quota.

**Il vuoto dentro l'ingombro non e' una nota di gusto.** Il volume che legge come
megastruttura non e' il piu' alto: e' quello che scavalca il vuoto. Per questo
`skyWindowOf` esiste come predicato e un test lo chiede a ogni ricetta.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/arcology/config.ts) | **Ogni** ingombro, quota, soglia, fascia d'uso, piazzale e indice di palette, piu' le ricette | `ARCOLOGY`, `ARCOLOGY_KIND`, `ARCOLOGY_RECIPES`, `TWIN_STEM`, `arcologyOf`, `ArcologyRecipe`, `ArcologyKind`, `ArcologyBand`, `ArcologyLanding` |
| [siting.ts](src/world/arcology/siting.ts) | Quando la citta' e' pronta a darsene una. Puro e senza mondo: entrano numeri gia' misurati, esce un verdetto | `arcologyReady`, `arcologyAnchor`, `ARCOLOGY_REFUSALS`, `ArcologyQuery`, `ArcologyRefusal`, `BlockBounds` |
| [window.ts](src/world/arcology/window.ts) | La finestra di cielo e il riempimento, come proprieta' verificabili di uno stamp | `skyWindowOf`, `fillRatio`, `SkyWindow`, `SkyWindowRule` |
| [generate.ts](src/world/arcology/generate.ts) | Ricetta→stamp, ingombro, origine, e le due tabelle di posti portate sul verso vero con la stessa rotazione delle parti | `generateArcology`, `arcologySpan`, `arcologyOrigin`, `worldBands`, `worldLandings`, `WorldBand`, `WorldLanding` |

```ts
arcologyReady({ existing, tier, blockRect, spanX, spanY, ... }); // refusal | null
generateArcology(recipe, { stage, facing, from });   // cumulativo, o il solo delta
skyWindowOf(stamp, ARCOLOGY.window);                 // il vuoto che scavalca | null
worldBands(recipe, facing, ox, oy);                  // un uso per fascia, sulle colonne vere
```

## `src/world/traffic/` — cio' che si muove

I mezzi che i collegamenti mettono in moto: barche all'ormeggio, traghetti di
linea, navi da carico, aerei in circuito, dirigibili al pilone, eVTOL che si
posano su un tetto, mongolfiere che se ne staccano. E' la risposta a un difetto
che si vedeva prima di ogni tooltip — un imbarco che prometteva di collegare due
punti dell'isola e non aveva niente che attraversasse.

**Il traffico non e' materia**, ed e' l'invariante del dominio. Scrivere una
barca nel `VoxelWorld` e riscriverla al frame dopo marcherebbe sporchi i chunk
della costa sessanta volte al secondo, cioe' rimeshare mezza isola per farla
navigare: qui si calcola *dove sta* un mezzo a un certo istante, e a disegnarlo
e' `engine/TrafficView.ts` con mesh proprie, fuori dal volume voxel.

Puro come la rete stradale: entrano le strutture ridotte all'osso e **due**
predicati — dov'e' l'acqua, quanto e' alto cio' che c'e' sotto — escono delle
rotte. **La posa e' una funzione del tempo, non un'integrazione**: due partite
identiche mostrano le stesse barche negli stessi punti, e un frame perso non
sposta niente.

Il taglio fra i tre file di rotte e' *lungo cosa si lavora separatamente*: una
rotta di mare cerca l'acqua, una in quota scavalca la citta', e il pendolo con
la sosta e' lo stesso conto per tutt'e due.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/traffic/config.ts) | **Ogni** velocita', quota, sosta, franco, misura di sagoma, ciminiera e indice di palette dei mezzi | `TRAFFIC`, `VEHICLE`, `VEHICLE_KINDS`, `VehicleKind`, `VehicleFunnel`, `funnelOf` |
| [seaLane.ts](src/world/traffic/seaLane.ts) | La rotta fra due punti che resta sull'acqua: griglia grossa, ricerca in ampiezza, tiro di corda | `planSeaLane`, `LanePoint`, `LaneQuery` |
| [routePath.ts](src/world/traffic/routePath.ts) | Di cosa e' fatta una rotta, e i quattro modi di costruirne una: fermo, pendolo con sosta, giro chiuso, lunghezze cumulate | `TrafficRoute`, `TrafficWaypoint`, `moored`, `shuttle`, `loop`, `measure`, `phaseOf` |
| [routes.ts](src/world/traffic/routes.ts) | Orchestrazione e cio' che galleggia: traversate, navi che escono dal mondo e ne tornano | `planTraffic`, `TrafficStructure`, `WaterProbe`, `CeilingProbe`, e il rimando a `routePath` |
| [skyRoutes.ts](src/world/traffic/skyRoutes.ts) | Le rotte in quota, e l'unica cosa che le accomuna: **passano sopra la citta' invece che dentro**. Circuito di volo, orbita, giro che si posa su una piazzola, corsa di un pallone | `flightCircuit`, `airshipOrbit`, `padCircuit`, `balloonFlight` |
| [ropewayRoutes.ts](src/world/traffic/ropewayRoutes.ts) | Da una linea di funivia alle sue due cabine, sfasate di mezzo periodo. Qui la rotta e' gia' data: non c'e' niente da cercare | `planRopewayRoutes`, `RopewayLink` |
| [poses.ts](src/world/traffic/poses.ts) | Dove sta un mezzo a un certo istante — o `null` se e' **fuori dal mondo**: pendolo con sosta, giro chiuso, beccheggio | `posesAt`, `poseAt`, `VehiclePose` |
| [plume.ts](src/world/traffic/plume.ts) | Il fumo dei fumaioli: la stessa posa **letta nel passato**, piu' salita, deriva e diradamento | `puffsAt`, `SmokePuff` |

```ts
planSeaLane({ from, to, water });        // spezzata che aggira la terra | null
planTraffic(structures, water, ceiling); // le rotte che una citta' esprime
planRopewayRoutes(links);                // due cabine per linea, in controfase
posesAt(routes, seconds);                // [{ kind, x, y, z, heading }, …]
puffsAt(routes, seconds);                // [{ x, y, z, size, density }, …]
```

`ceiling` e' facoltativo e vale «citta' piatta»: senza, le rotte in quota
restano alla quota che dichiarano. Con — e `GrowthScene` lo passa — la crociera
e' il **massimo** fra quella dichiarata e la cima sorvolata piu' il franco, che
e' l'unica cosa che tenga un aereo fuori dai grattacieli quando `maxLevel` a
dodici porta una torre oltre i centoquaranta voxel.

## `src/world/ropeway/` — la traversata che non prende suolo

Il commento di `CROSSINGS.maxLength` diceva cosa sta oltre i novantasei voxel:
«la distanza oltre la quale un ponte smette di essere una scelta e diventa il
modo per annullare la geografia. Uno stretto piu' largo di cosi' vuole un
traghetto». Il traghetto pero' e' un catalizzatore — lo si piazza dove il *ruolo*
ha senso, non dove serve attraversare — e fra due rive che si guardano non c'era
ancora niente che il giocatore potesse **tirare**.

Da qui l'invariante, che e' l'opposto esatto di quello di `crossings/`: **una
campata di fune non prende niente**. A terra ci sono solo le due torri; fra loro
non c'e' impalcato, non c'e' carreggiata e non c'e' pila — ed e' esattamente cio'
che permette alla linea di scavalcare uno stretto che nessuna pila reggerebbe.

**La fune non e' materia**, e vale per lei la regola di `traffic/`: e' spessa meno
di un voxel, non ha un record e non occupa colonne. La disegna
`engine/RopewayView.ts`, fuori dal volume voxel.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/ropeway/config.ts) | **Ogni** luce, franco, arretramento, freccia e indice di palette della linea | `ROPEWAY`, `ROPEWAY_PART`, `RopewayPart` |
| [ropewayPlan.ts](src/world/ropeway/ropewayPlan.ts) | Da un click alla linea: la riva di qua, quella di la', le due piazzole, la quota della fune e la sua pancia | `chooseRopeway`, `ROPEWAY_REFUSALS`, `RopewayPlan`, `RopewayQuery`, `RopewayProbe`, `RopewayStation`, `RopewayResult`, `RopewayRefusal`, `CablePoint` |
| [generate.ts](src/world/ropeway/generate.ts) | Lo stamp di una torre: zoccolo, fusto, banchina d'imbarco e castello | `generateStation` |

```ts
chooseRopeway({ x, y, top, land, firm, free });  // { ok, plan } | { ok: false, refusal }
generateStation(plan.stations[0], plan.axis);    // il volume di una torre
```

## `src/world/spans/` — la rete in quota

La prima struttura del progetto che **non poggia a terra**: una campata fra due
appoggi che non sono suoi. Da qui l'invariante del dominio — **una campata non
prende suolo** — che e' anche l'unica cosa che il modello dei landmark non sapeva
gia' dire: sotto un ponte la carreggiata si dipinge ancora e i lotti si
costruiscono ancora, e se un edificio cresce attraverso la campata a cedere e' la
campata. Puro: entrano due appoggi e due predicati sul luogo, esce un piano.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/spans/config.ts) | **Ogni** lunghezza, quota, franco, cadenza e indice di palette delle campate | `SPANS`, `SPAN_KIND`, `SpanKind`, `SpanRule` |
| [spanPlan.ts](src/world/spans/spanPlan.ts) | Ponte e mezzanino: asse, vuoto, quota d'atterraggio, segmenti | `planSpan`, `spanBaseZ`, `tileSegments`, `SPAN_HEIGHT`, `SPAN_REFUSALS`, `SpanPlan`, `SpanQuery`, `SpanSupport`, `SpanProbe`, `GapColumn`, `SpanSegment`, `SpanResult`, `SpanRefusal` |
| [plazaPlan.ts](src/world/spans/plazaPlan.ts) | La piazza sul cuore di un isolato, retta da tre o piu' edifici | `planPlaza`, `PlazaQuery`, `CourtyardRect` |
| [generate.ts](src/world/spans/generate.ts) | Lo stamp di un segmento: travi, carreggiata, verde | `generateSpan` |
| [network.ts](src/world/spans/network.ts) | Union-find sugli appoggi e la proprieta' di continuita' del gate | `SpanNetwork`, `widestReach`, `SpanLink` |

```ts
planSpan({ a, b, kind: SPAN_KIND.bridge, ground, solid }); // { ok, plan } | { ok: false, refusal }
planPlaza({ rect, supports, ground, solid });              // stessa forma
widestReach(registry.spans, blockOf);                      // isolati raggiunti: >= 2 passa il gate
```

## `src/world/crossings/` — i ponti che il giocatore chiede

Il viadotto che il commento di `SPANS.maxGap` annunciava: oltre dodici voxel «non
e' piu' una passerella ma un viadotto, che ha bisogno di appoggi propri a terra».
Da qui l'invariante, che e' **l'opposto** di quello di `spans/` — **un
attraversamento prende suolo**, con pile che scendono nel fondale — ed e' la
ragione per cui i due domini non sono lo stesso file.

L'altra differenza sta nel formato: `spans/` esamina tutte le coppie e ne accetta
poche, qui arriva **un click** e la regola deve trovare il compagno da sola. Il
click sceglie anche il tipo: sopra un edificio si cerca un ponte fra grattacieli
a quota libera, sulla riva un ponte su pile. Puro: entrano una colonna e quattro
predicati sul luogo, esce un piano.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/crossings/config.ts) | **Ogni** luce, franco, passo di pila, pescaggio e indice di palette | `CROSSINGS`, `CROSSING_KIND`, `CrossingKind` |
| [crossingPlan.ts](src/world/crossings/crossingPlan.ts) | Sceglie il compagno e convalida: asse, quota, pile, spalle, segmenti | `chooseCrossing`, `crossingBaseZ`, `CROSSING_HEIGHT`, `CROSSING_REFUSALS`, `CrossingPlan`, `CrossingQuery`, `CrossingProbe`, `CrossingTower`, `CrossingPier`, `CrossingSegment`, `CrossingResult`, `CrossingRefusal` |
| [generate.ts](src/world/crossings/generate.ts) | Lo stamp di un segmento e quello di una pila | `generateCrossing`, `generateCrossingPier` |

```ts
chooseCrossing({ x, y, ground, land, occupied, solid });          // ponte a terra
chooseCrossing({ x, y, from: tower, towers, ...probe });          // ponte in quota
```

## `src/world/aerial/` — la citta' in quota

La prima cosa del progetto che **sporge oltre l'impronta** di un edificio: una
mensola appesa a una facciata, e sopra di lei si costruisce. Da qui l'invariante
del dominio — **un impalcato in quota non prende suolo; lo prende solo la gamba
che scende a terra** — che e' il complemento esatto di quello di `spans/`. Sotto
una mensola la carreggiata si dipinge ancora e i lotti si costruiscono ancora,
tranne nelle due colonne di una gamba.

**Nessuna quota e' imposta da fuori**: la mensola la prende dalla sommita' di una
fascia del proprio ospite, la gamba dal primo appoggio che trova scendendo. Non
c'e' una griglia di livelli, e per la stessa ragione qui non esiste `align`.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/aerial/config.ts) | **Ogni** sporto, luce, franco, cadenza e indice di palette | `AERIAL`, `AERIAL_PART`, `AerialPart`, `DECK_HEIGHT`, `takesGround`, `isBuildable` |
| [deckPlan.ts](src/world/aerial/deckPlan.ts) | Il primitivo: dato un riquadro e una quota, dove servono le gambe | `planDeck`, `deckBaseZ`, `tileDeck`, `surveyFooting`, `rectsOverlap`, `DECK_REFUSALS`, `DeckPlan`, `DeckQuery`, `DeckRect`, `DeckRefusal`, `AerialColumn`, `AerialProbe`, `Pier` |
| [terracePlan.ts](src/world/aerial/terracePlan.ts) | L'aggetto: da un edificio e un fronte al riquadro che sporge | `planTerrace`, `faceRuns`, `wallRect`, `faceAxis`, `faceOutward`, `AERIAL_FACE`, `AERIAL_FACES`, `TerracePlan`, `TerraceQuery`, `AerialSupport`, `FaceRun` |
| [terraceForm.ts](src/world/aerial/terraceForm.ts) | La forma di una mensola: pianta fra quattro varianti, sezione che si assottiglia, angoli smussati | `terraceShape`, `overhangOf`, `terraceSide`, `terraceEdge`, `terraceGirder`, `chamfered`, `cornerCutOf`, `TerraceShape`, `TerraceSide` |
| [routePlan.ts](src/world/aerial/routePlan.ts) | Le forme di un percorso fra due mensole: dritta, larga, a zeta | `planRoute`, `ROUTE_REFUSALS`, `RoutePlan`, `RouteQuery`, `RouteEnd`, `RoutePiece`, `RouteRefusal` |
| [routeDrafts.ts](src/world/aerial/routeDrafts.ts) | I pezzi di un percorso e la meccanica che li regge: colmo, pianerottoli, montaggio | `crestOf`, `climbProfile`, `placeHubs`, `assemble`, `walkDraft`, `hubDraft`, `hubSide`, `hubPad`, `rectOf`, `slideOrder`, `PieceDraft`, `Landing`, `RouteEnd` |
| [guideway.ts](src/world/aerial/guideway.ts) | La guida: il montante che porta da terra a un impalcato abitato | `planLift`, `LIFT_REFUSALS`, `LiftPlan`, `LiftTarget`, `LiftRefusal` |
| [decks.ts](src/world/aerial/decks.ts) | Le quote edificabili di una colonna, ciascuna con il proprio riquadro | `decksAt`, `BuildDeck`, `DeckSource` |
| [generate.ts](src/world/aerial/generate.ts) | Uno stamp per tutte e tre le forme: travatura, piano, parapetto, verde; la mensola con la sua sezione a cuneo | `generateDeck`, `generateLift`, `generatePier` |
| [testProbe.ts](src/world/aerial/testProbe.ts) | Un luogo finto per i test puri: pareti, tetti, carreggiate | `TestGround` |

```ts
planTerrace({ host, faces, ground, solid });   // { ok, plan } | { ok: false, refusal }
planDeck({ rect, deckZ, anchors, drop, ... }); // le gambe che lo sbalzo richiede
decksAt(registry.at(x, y), groundZ);           // suolo piu' le quote che passano di qui
```

## `src/world/buildings/` — crescita voxel

Ponte tra candidati della simulazione e mondo renderizzato: convalida il terreno,
gestisce le impronte, costruisce a fasce entro un budget e promuove gli edifici.

**Il `Builder` orchestra, i driver decidono.** Ogni sottosistema a tick — campate,
citta' in quota, landmark, promozioni — vive in un file proprio e riceve un
`BuildContext`; il `Builder` tiene il ciclo (`onTick`, `step`), la nascita di un
edificio e le statistiche. Le due code — volumi e superficie — sono la sola strada
per cui un voxel arriva nel mondo: l'invariante «nessuno scrive un muro
all'infuori di qui» vale ora per la cartella, ed e' piu' stretta di prima perche'
le scritture stanno in tre file invece che sparse in sei metodi.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [Builder.ts](src/world/buildings/Builder.ts) | Orchestratore: il ciclo a tick, la nascita di un edificio sul lotto, le statistiche | `Builder`, `BuilderStats`, `REJECT_REASONS` |
| [buildContext.ts](src/world/buildings/buildContext.ts) | Cio' che ogni driver ha in mano: mondo, terreno, strade, registry e le due code | `BuildContext` |
| [growthQueue.ts](src/world/buildings/growthQueue.ts) | La coda di comparsa e le scritture a budget: un segmento per struttura, la sagoma nuova prima della cancellazione | `GrowthQueue`, `anchorOf` |
| [surfaceQueue.ts](src/world/buildings/surfaceQueue.ts) | Il suolo pubblico a budget: carreggiata per isolato, grembiuli, rampe e bonifica del decoro — che si ferma dove il bioma dice acqua | `SurfaceQueue`, `SurfacePaint` |
| [spanDriver.ts](src/world/buildings/spanDriver.ts) | La rete in quota: ponti, mezzanini e piazze. Vince chi unisce due componenti; una campata non prende suolo | `SpanDriver` |
| [aerialDriver.ts](src/world/buildings/aerialDriver.ts) | Mensole, percorsi, gambe e le quote su cui si costruisce. Un impalcato vuoto cade, uno abitato no | `AerialDriver` |
| [guideDriver.ts](src/world/buildings/guideDriver.ts) | La via da terra: un montante per ogni impalcato abitato che non ce l'ha | `GuideDriver` |
| [ropewayDriver.ts](src/world/buildings/ropewayDriver.ts) | Le funivie: due torri a registro, e una fune che non e' materia. Il solo driver senza una freccia che entra o che esce | `RopewayDriver`, `RopewayCable`, `RopewayRide` |
| [landmarkDriver.ts](src/world/buildings/landmarkDriver.ts) | I monumenti dei catalizzatori: piazzamento, cantiere di sventramento, grembiule e avanzamento di stadio | `LandmarkDriver`, `LandmarkSite` |
| [landmarkSiting.ts](src/world/buildings/landmarkSiting.ts) | Dove una struttura si posa davvero: verso, ingombro e l'angolo gia' portato **incontro all'acqua**. Puro, ed e' la sola meta' del piazzamento che un test interroga al voxel senza far crescere un'isola | `placeRecipe`, `seawardDrift`, `Placement` |
| [arcologyDriver.ts](src/world/buildings/arcologyDriver.ts) | La megastruttura: condizione sull'isolato, cantiere, costruzione a stadi, piazzali in quota e dichiarazione degli usi alla simulazione | `ArcologyDriver` |
| [clearance.ts](src/world/buildings/clearance.ts) | Cosa un landmark puo' togliere di mezzo e cosa lo ferma. Puro: entrano record ridotti all'osso, esce un verdetto | `planClearance`, `CLEARANCE_KIND`, `ClearanceRecord`, `ClearanceRefusal` |
| [clearanceSite.ts](src/world/buildings/clearanceSite.ts) | Il cantiere di sventramento, condiviso da chi si prende un riquadro: sopralluogo, recinzione, demolizione a passate | `ClearanceSites`, `ClearanceBox`, `ClearanceVerdict`, `OPEN_SITE`, `clearanceOf`, `recordsIn`, `simBuildingOf` |
| [recordStamp.ts](src/world/buildings/recordStamp.ts) | La sagoma **registrata** di un edificio, rigenerata dal record per poterla cancellare | `recordStamp`, `typologyOf` |
| [upgradeDriver.ts](src/world/buildings/upgradeDriver.ts) | La crescita verticale: chi promuove, e in che tipologia diventa | `UpgradeDriver` |
| [chunkBudget.ts](src/world/buildings/chunkBudget.ts) | Quanti chunk sporcherebbe un volume, e se ci sta. Puro: aritmetica di chunk e nient'altro | `dirtyChunkCount`, `fitsChunkBudget` |
| [siteWorks.ts](src/world/buildings/siteWorks.ts) | Come si presenta il terreno a chi ci costruisce, e l'opera che lo regge | `groundKindAt`, `surveyGrade`, `hasUnworkableColumn`, `nearLand`, `isCoastal`, `buildWorks` |
| [hierarchy.ts](src/world/buildings/hierarchy.ts) | Fin dove una colonna puo' salire, e quanto ha gia' speso salendo | `allowedLevel`, `riseOf` |
| [urbanForm.ts](src/world/buildings/urbanForm.ts) | Il profilo locale della simulazione tradotto in forma costruita | `formOf`, `localLevelBonus`, `localUpgradeDiscount` |
| [BuildingRegistry.ts](src/world/buildings/BuildingRegistry.ts) | Indice spaziale e record degli edifici; impronte rettangolari, sbalzi che prenotano aria ma non suolo, landmark contati a parte | `BuildingRegistry`, `BuildingRecord`, `footprintDepth`, `envelopeOf`, `PlanRect` |
| [generate.ts](src/world/buildings/generate.ts) | Monta un edificio: impronta, fasce, coronamento, dettaglio sul tetto. Non disegna — ordina i quattro moduli sotto | `generateBuilding`, `startLevel`, `BuildingRequest` |
| [bandRect.ts](src/world/buildings/bandRect.ts) | Il rettangolo di una fascia e l'algebra che lo muove: appoggio, rientranze centrate, predicati di pianta | `BandRect`, `supported`, `inside`, `inset`, `shrink`, `shrinkAxis`, `pickInt`, `clamp` |
| [bandOps.ts](src/world/buildings/bandOps.ts) | L'interprete del repertorio: prova le candidate nell'ordine del profilo e prende la prima che regge | `nextRect`, `applyOp`, `forcedOp` |
| [crowns.ts](src/world/buildings/crowns.ts) | Come si chiude la silhouette: una geometria per ogni voce di `CROWN_KIND` | `crownBands` |
| [paint.ts](src/world/buildings/paint.ts) | La vernice: corpo, cornice, zoccolo, campate, portale, accento luminoso, terrazze e corte | `paint`, `classSurface`, `PaintRequest` |
| [cluster.ts](src/world/buildings/cluster.ts) | A cosa si aggrega un lotto: quota e corso di base condivisi con i vicini di fronte. Puro, e il rifiuto è il gradino | `planCluster`, `joinsCluster`, `ClusterTerms`, `ClusterRequest` |
| [typology.ts](src/world/buildings/typology.ts) | Sceglie la tipologia dal luogo, e dice **perché no** dove non la sceglie; nessun numero, solo la regola | `selectTypology`, `typologyProfile`, `typologyShape`, `typologiesForUses`, `typologyAccepts`, `typologyGapsOf`, `bestProspectOf`, `TypologyQuery`, `TypologyGap` |
| [unlocks.ts](src/world/buildings/unlocks.ts) | Cosa un ruolo sblocca: le specializzazioni che apre e le forme che ci nascono dentro, derivate dai due cataloghi | `unlocksFor`, `RoleUnlock` |
| [style.ts](src/world/buildings/style.ts) | Di che materia è fatto un quartiere: funzione pura di `(seed, isolato)`, nessuno stato | `styleAt`, `styledProfile`, `styleOf` |
| [blockForm.ts](src/world/buildings/blockForm.ts) | Dove cade un lotto dentro il proprio isolato — angolo, fronte, cuore — e quanto spazio ha per allargarsi. Puro | `lotRoleOf`, `blockRoom` |
| [stamp.ts](src/world/buildings/stamp.ts) | Volume voxel, ancora 3D e conversione in coordinate mondo | `VoxelStamp`, `VoxelAnchor`, `anchoredVoxel`, `STAMP_EMPTY` |
| [config.ts](src/world/buildings/config.ts) | Cadenze, impronte, grammatica verticale, repertorio delle trasformazioni di fascia, cime, campate di facciata, aggregazione, profili visivi, **catalogo delle tipologie** e **catalogo degli stili** | `BUILDER`, `CLUSTER`, `GRAMMAR`, `BAND_OP`, `CROWN_KIND`, `LEVEL_CAPS`, `MIN_FOOTPRINT`, `MAX_FOOTPRINT`, `START_LEVEL_CDF`, `CLASS_PROFILE`, `TYPOLOGIES`, `STYLE`, `STYLES`, `DEFAULT_BUILDING_FORM`, `DEFAULT_TYPOLOGY_SHAPE`, `typologyById`, `styleById` |

## `src/game/` — ciclo di gioco

| File | Ruolo | Esporta |
| --- | --- | --- |
| [loop.ts](src/game/loop.ts) | Passo fisso della simulazione con tetto di recupero | `FixedStepLoop` |
| [growthScene.ts](src/game/growthScene.ts) | Cablaggio esclusivo di `grow=1`: tick, Builder e animazione | `GrowthScene`, `GrowthStats` |
| [simScene.ts](src/game/simScene.ts) | Cablaggio di `sim=1`: la simulazione che gira sull'isola senza costruirci. Gemello di `growthScene` per la scena di misura | `SimScene`, `SIM_TICK_RATE`, `SIM_SITE_COUNT` |
| [launchMode.ts](src/game/launchMode.ts) | Risoluzione pura della modalita' iniziale e degli harness URL, e l'indirizzo del campionario letto al contrario | `resolveLaunchMode`, `swatchUrl`, `LaunchMode` |
| [actions.ts](src/game/actions.ts) | Azioni economiche atomiche: catalizzatori, policy, decisioni, commercio ed espansione | `placeCatalyst`, `catalystFailure`, `catalystSiteCost`, `togglePolicy`, `chooseDecision`, `changeTradeMode`, `buyExpansion`, `expansionFailure`, `SiteCost`, `ActionResult`, `ActionFailure` |
| [surfacePick.ts](src/game/surfacePick.ts) | Selezione pura della colonna da un raggio 3D: sulla sola heightmap per chi costruisce, sugli edifici compresi per chi guarda | `pickSurfaceCell`, `pickSolidCell`, `Ray3`, `SurfaceCell`, `BuiltTop` |
| [selection.ts](src/game/selection.ts) | Cosa c'è sotto un punto, in quattro strati insieme: struttura, isolato, colonna, voxel. Puro, e il record giusto lo sceglie la quota. `UseInfo` è cosa la simulazione dice di un edificio *come* questo — rendimento del tipo, parco costruito, quota d'uso della città — e mai di questo | `resolveSelection`, `Selection`, `SelectionQuery`, `StructureInfo`, `UseInfo`, `BlockInfo`, `ColumnInfo`, `VoxelInfo` |
| [onboarding.ts](src/game/onboarding.ts) | Tutorial derivato dai catalizzatori, senza flag nascosti | `onboardingOf`, `onboardingAllows` |
| [cityCondition.ts](src/game/cityCondition.ts) | Obiettivo di autosufficienza e crisi con indicazioni di recupero | `cityCondition`, `isSelfSufficient` |
| [sectors.ts](src/game/sectors.ts) | Identità, region e maschera composta dei settori costieri | `coastalSectorAt`, `shapeWithSector` |

## `src/ui/` — HUD e overlay di debug

Canvas e DOM puri, nessuna dipendenza da Three.js. Il Cozy HUD è l'interfaccia
giocabile; gli overlay tecnici si alternano con `F3` o partono aperti con
`?debug=1`.

| File | Ruolo |
| --- | --- |
| [hud.css](src/ui/hud.css) | Token, elevazione a tre livelli, cornice, tessere del dock, stati accessibili e layout responsivo Cozy City |
| [hudIcons.ts](src/ui/hudIcons.ts) | Icone SVG interne, senza dipendenze o richieste di rete |
| [hudWidgets.ts](src/ui/hudWidgets.ts) | Le fabbriche DOM che non toccano `this`: bottoni, tessere, righe del cursore, tasti della targa, separatore |
| [hudTokens.ts](src/ui/hudTokens.ts) | I `--hud-*` derivati dal tema attivo: pannello chiaro o scuro dalla luminanza dell'aria, tinta verso il mondo e contrasto AA garantito |
| [GameHud.ts](src/ui/GameHud.ts) | Composizione dell'HUD: pannelli, decisioni, temi, targa della vista, catena di Escape e feedback contestuale |
| [PolicyDrawer.ts](src/ui/PolicyDrawer.ts) | Il pannello di governo in tre linguette — politiche, commercio interno, commercio esterno — con l'intestazione ferma e solo il corpo che scorre |
| [ResourceBar.ts](src/ui/ResourceBar.ts) | La colonna di destra: cinque risorse con tendenza, sparkline, anello del tetto e popover del bilancio, piu' i controlli del tempo |
| [BuildDock.ts](src/ui/BuildDock.ts) | Il rail di sinistra: quattro corsie etichettate incolonnate, tessere icona-sopra-etichetta su due colonne con badge di tasto e costo, selezione per indice |
| [ResourceTrend.ts](src/ui/ResourceTrend.ts) | La finestra dei tick recenti per risorsa: direzione, magnitudine e serie per la sparkline. Campionamento ancorato al tick |
| [GameHudModel.ts](src/ui/GameHudModel.ts) | View model puro di risorse, tendenze, tetti, scomposizione dei fondi, requisiti vincolanti e disponibilità delle azioni |
| [ControlsHint.ts](src/ui/ControlsHint.ts) | Onboarding contestuale persistente e pannello di aiuto |
| [DebugOverlay.ts](src/ui/DebugOverlay.ts) | fps, draw call, triangoli, code, tempi di mesher e main thread |
| [GrowthOverlay.ts](src/ui/GrowthOverlay.ts) | Conteggi, livelli, coda e scarti della crescita automatica |
| [TerrainOverlay.ts](src/ui/TerrainOverlay.ts) | Progresso della generazione, istogramma dei biomi, colonne edificabili |
| [SimOverlay.ts](src/ui/SimOverlay.ts) | Stock e delta per tick, heatmap 2D del campo, primi dieci candidati, pulsanti delle policy |
| [InspectOverlay.ts](src/ui/InspectOverlay.ts) | Referto tecnico delle viste: modi, slider della quota, colonna a fuoco e id dell'isolato |
| [SwatchOverlay.ts](src/ui/SwatchOverlay.ts) | Referto del campionario: fascia, riga e colonna sotto il cursore, legenda dell'ordine delle righe |
| [ViewMenuModel.ts](src/ui/ViewMenuModel.ts) | Il menu delle viste dal lato del giocatore, puro: etichette, gesti, targa della vista attiva con i suoi tasti, gesti e tasti dell'isolato **scelto**, barra dei livelli, regola dello strumento |
| [SelectionPanel.ts](src/ui/SelectionPanel.ts) | La scheda di selezione: intestazione, quattro linguette, le righe di quella aperta e il suo bottone |
| [SelectionPanelModel.ts](src/ui/SelectionPanelModel.ts) | Cosa la scheda dice e cosa offre, puro: il ramo che distingue landmark, campata, impalcato ed edificio, le righe di rendimento di ogni uso, il riquadro da evidenziare per sezione e l'interruttore che isola un isolato |
| [prospects.ts](src/ui/prospects.ts) | La lingua di cosa un luogo **non** è ancora: le due righe che nominano il quartiere che potrebbe diventare e la forma che ci crescerebbe, più la riga di tooltip di ciò che un ruolo sblocca |

## Test e bench

| File | Copre |
| --- | --- |
| [ui/hudWidgets.test.ts](src/ui/hudWidgets.test.ts) | Le righe del tooltip: una voce per riga, elenchi che si contano invece di srotolarsi, ordine fra cio' che si costruisce e cio' che si sblocca |
| [world/VoxelWorld.test.ts](src/world/VoxelWorld.test.ts) | Sparsità, dirty set ai bordi, AABB, contratto `data` ≠ `blocks` |
| [world/visualBlock.test.ts](src/world/visualBlock.test.ts) | Palette e superficie nello stesso byte, il vuoto ignora la superficie |
| [world/scenes/cityScene.test.ts](src/world/scenes/cityScene.test.ts) | Determinismo, riempimento al 20%, ripresa a passi, nessuna scrittura fuori region |
| [world/scenes/dioramaScene.test.ts](src/world/scenes/dioramaScene.test.ts) | Determinismo del soggetto, ingombro dichiarato, carreggiata sul fronte, superfici che arrivano al mondo, tipologia forzata |
| [world/scenes/swatchScene.test.ts](src/world/scenes/swatchScene.test.ts) | Tutte le combinazioni palette × superficie — il modo per accorgersi che uno slot nuovo non e' mai stato aggiunto al campionario; la colonna vuota dello slot zero; i tre strati di ogni bioma su multipli di cella; i tre `WATER_CLASS`; la fascia di scala; la simmetria C4 della sagoma e le quattro precondizioni che la microgeometria chiede; il mondo confrontato con `cellSolidAt`; l'interasse che tiene il provino fuori dall'occlusione; un pavimento di prismi per linguaggio e il tetto dei quad sul chunk piu' carico; determinismo, passi ed estensione dichiarata |
| [world/terrain/heightField.test.ts](src/world/terrain/heightField.test.ts) | Margine di Lipschitz su otto seed — la rete di sicurezza della calibrazione; specchio d'acqua per colonna; un'estensione costiera non muove il resto dell'isola |
| [world/terrain/landform.test.ts](src/world/terrain/landform.test.ts) | Cadute e profili, il budget di pendenza che nessun elemento supera, lobi dentro il bordo, conche solo dove il terreno e' piano e mai sovrapposte |
| [world/terrain/IslandGenerator.test.ts](src/world/terrain/IslandGenerator.test.ts) | Determinismo per blocco, continuità al confine — l'alzata come tetto del salto e il cubo sotto la soglia del terrazzamento —, cigli che compaiono davvero e non si costruiscono, `expandIsland` |
| [world/terrain/terrace.test.ts](src/world/terrain/terrace.test.ts) | Scale monotone su multipli di cella che coincidono sotto la spiaggia, alzata fra un cubo e il tetto e mai piu' grossa della propria tacca, la proprieta' che regge tutto — due quote vicine non distano piu' di un'alzata **su qualunque coppia di scale** — e il ciglio che a parita' di quota non ha una sola altezza |
| [world/terrain/groundcover.test.ts](src/world/terrain/groundcover.test.ts) | Copertura funzione della sola colonna, densita' misurata contro quella dichiarata, una tinta e una forma per ogni copertura che un bioma sappia produrre, palette di superficie distinte fra biomi |
| [world/terrain/ledges.test.ts](src/world/terrain/ledges.test.ts) | Salto minimo dedotto, aria sotto la lastra e parete sopra, cuneo verso l'esterno, ritaglio al blocco e sporgenze vere sull'isola del seed di riferimento |
| [world/terrain/TerrainMap.test.ts](src/world/terrain/TerrainMap.test.ts) | Mappa per colonna, istogramma, chunking |
| [world/terrain/waterClass.test.ts](src/world/terrain/waterClass.test.ts) | La profondita' decide per prima, un braccio chiuso su un asse e' canale, una baia con una sponda sola resta mare |
| [engine/mesher/greedyMesher.test.ts](src/engine/mesher/greedyMesher.test.ts) | Fusione dei quad, orientamento delle facce, casi limite |
| [engine/mesher/buildPaddedVolume.test.ts](src/engine/mesher/buildPaddedVolume.test.ts) | Piani, spigoli e angoli del padding |
| [engine/mesher/microGeometry.test.ts](src/engine/mesher/microGeometry.test.ts) | Unità fisse, facce nascoste, testate condivise, priorità e limite; i prop: aggancio all'ingresso, superficie per prisma, seme in coordinate di mondo, margine sotto il tetto |
| [engine/mesher/carveGeometry.test.ts](src/engine/mesher/carveGeometry.test.ts) | La faccia soppressa e pagata dal vano, il winding di ogni quad di dettaglio verificato sul prodotto vettoriale, il gradiente di AO, il costo che segue il perimetro, la riserva come limite superiore, la cucitura fra chunk senza setto |
| [engine/mesher/microStreet.test.ts](src/engine/mesher/microStreet.test.ts) | Il dettaglio del retro misurato da solo, con un writer che conta: scende a terra su una parete cieca, si alza sopra la quota franca dove c'è un ingresso, segue le coordinate di mondo |
| [engine/mesher/coverDetail.test.ts](src/engine/mesher/coverDetail.test.ts) | Il cubo sparisce e restano i prismi, il volume torna intatto, la faccia di terreno si ricuce, niente esce dalla cella; fiore, sasso, marcatore rimasto senza il suo terreno, anello di padding |
| [engine/palette.test.ts](src/engine/palette.test.ts) | 32 slot, validazione dei colori |
| [engine/themes/themes.test.ts](src/engine/themes/themes.test.ts) | Ogni tema riempie i 32 slot, atmosfera in range |
| [world/terrain/decor.test.ts](src/world/terrain/decor.test.ts) | Alberi deterministici, biomi esclusi, chiome non sovrapposte, profili delle specie e specie estratte solo dall'elenco del proprio bioma |
| [game/loop.test.ts](src/game/loop.test.ts) | Cadenza fissa e limite del recupero |
| [game/growthScene.test.ts](src/game/growthScene.test.ts) | Ciclo completo tick → costruzione → voxel, ordine del tutorial, usi misti e crescita verticale |
| [game/actions.test.ts](src/game/actions.test.ts) | Costo del sito con le opere di terra, pagamento una volta sola, requisiti e rifiuti, sito dell'opera concessa |
| [game/surfacePick.test.ts](src/game/surfacePick.test.ts) | Colonna sotto il raggio, edificabilita', raggi che escono dalla mappa e raggio che si ferma sulla torre invece che sulla terra dietro |
| [game/launchMode.test.ts](src/game/launchMode.test.ts) | Esperienza completa alla radice e isolamento degli harness URL; il link del campionario porta tema e ora e apre un harness invece di una seconda partita |
| [game/onboarding.test.ts](src/game/onboarding.test.ts) | Sequenza e sblocco dei tre passi iniziali |
| [game/cityCondition.test.ts](src/game/cityCondition.test.ts) | Priorità delle crisi e stabilità richiesta per il successo |
| [game/sectors.test.ts](src/game/sectors.test.ts) | Identità uniche, terra utile e continuità delle espansioni |
| [game/selection.test.ts](src/game/selection.test.ts) | Il record scelto e' quello il cui intervallo di quota contiene il punto colpito; il tetto e non l'aria sopra di lui; tre strati su quattro anche su terreno nudo; l'aggregato dell'isolato che non conta ne' i landmark ne' le campate ne' i vicini di fronte; il rendimento che passa per le policy attive, la quota dell'uso ospitato, e niente rendimento su cio' che edificio non e' |
| [ui/SelectionPanelModel.test.ts](src/ui/SelectionPanelModel.test.ts) | Un landmark che mostra lo stadio e mai un livello, una campata senza uso urbano, i due usi di un edificio misto, il quartiere del record distinto da quello di adesso, l'acqua che legge la classe dello specchio, il riquadro evidenziato per ciascuna sezione, le righe di rendimento con la percentuale etichettata come cittadina, e l'interruttore che isola un isolato |
| [ui/ControlsHint.test.ts](src/ui/ControlsHint.test.ts) | Completezza dei comandi camera e delle viste nella card di aiuto |
| [ui/GameHudModel.test.ts](src/ui/GameHudModel.test.ts) | Risorse, requisiti, blocchi economici e policy attive del HUD; il requisito **vincolante** e non il primo, il blocco da tutorial che non finge una progressione, il delta vuoto al posto di `±0`, l'anello del cibo ancorato alla soglia della carestia, e la tessera che dice cosa il ruolo *sblocca* invece di promettere ciò che le soglie non confermeranno |
| [ui/prospects.test.ts](src/ui/prospects.test.ts) | Le righe che spiegano cosa manca: il ruolo mancante che batte ogni soglia, la soglia vincolante quando il ruolo c'è, il livello detto solo dove morde, e la riga del quartiere che spiega quella della forma invece di rispondere a un'altra domanda |
| [world/buildings/unlocks.test.ts](src/world/buildings/unlocks.test.ts) | La torre idroponica nominata solo dai due ruoli che aprono l'agricoltura, ogni coppia ruolo/specializzazione coperta, e nessun ripiego spacciato per conquista |
| [ui/hudTokens.test.ts](src/ui/hudTokens.test.ts) | Il gate della 7.1: contrasto AA di ogni token di testo sui sette temi, il testo sopra i pieni d'accento e d'oro, il pannello scuro sotto un'aria notturna, sette superfici distinte |
| [ui/ResourceTrend.test.ts](src/ui/ResourceTrend.test.ts) | Campionamento idempotente sul tick, finestra scorrevole in ordine, direzione letta sulla finestra e non sull'ultimo passo, magnitudine relativa fra scale diverse, tick che torna indietro |
| [ui/ResourceBar.test.ts](src/ui/ResourceBar.test.ts) | La sparkline: larghezza piena, verso corretto della `y`, autoscala sul proprio intervallo, serie ferma a mezza altezza |
| [world/streets/streetGrid.test.ts](src/world/streets/streetGrid.test.ts) | Partizione strada/isolato, gerarchia degli assi, fronte e cuore, carreggiata piu' vicina, determinismo |
| [engine/inspect.test.ts](src/engine/inspect.test.ts) | Predicati delle quattro viste, finestra dei raggi X, lato della sezione, quota della fetta, accordo fra `modeCuts` e `isCut`, isolato scelto che taglia senza chiedere un tappo |
| [engine/xray.test.ts](src/engine/xray.test.ts) | La densita' del velo cresce verso la camera — e' cio' che fa vedere piu' di una parete alla volta — resta sempre sotto il taglio e sfuma sul contorno della sagoma |
| [ui/ViewMenuModel.test.ts](src/ui/ViewMenuModel.test.ts) | Ordine, etichette e gesti delle viste, targa che dice sempre come si esce, isolato scelto che cambia gesto ma non nome, barra dei livelli solo dove c'e' una quota, strumento che chiude un taglio |
| [engine/InspectView.test.ts](src/engine/InspectView.test.ts) | La quota della fetta si arma una volta sola e poi non insegue piu' il cursore, ne' si inchioda sul centro dell'inquadratura quando il raggio manca l'isola |
| [world/streets/lots.test.ts](src/world/streets/lots.test.ts) | Il lotto tocca sempre un fronte, non esce dall'isolato, l'isolato si riempie |
| [world/streets/corridor.test.ts](src/world/streets/corridor.test.ts) | Il percorso parte da un capo e arriva all'altro senza spezzarsi, non devia dove non serve, gira attorno a cio' che e' dichiarato impraticabile e rinuncia quando non c'e' passaggio; due isolati che si toccano non hanno niente da collegare; la scelta del capo non dipende dall'ordine |
| [world/buildings/surfaceQueue.test.ts](src/world/buildings/surfaceQueue.test.ts) | Il gate del raccordo: fra due isolati lontani si cammina sull'asfalto senza staccare i piedi — con il controllo negativo che senza raccordo non si arriva — e la strada aggira un canale invece di finirci dentro |
| [world/grading/grade.test.ts](src/world/grading/grade.test.ts) | Classificazione del terreno, quota del piano finito, tetto strutturale, rampa a pendenza uno |
| [world/sites/siteRules.test.ts](src/world/sites/siteRules.test.ts) | Ricerca dell'acqua sui quattro assi, intorno piano sotto il tetto proprio, motivi di rifiuto per ruolo |
| [world/skyline/tiers.test.ts](src/world/skyline/tiers.test.ts) | Le tre fasce e il loro ordine, la costa che vince su tutto, la corona sul bordo dell'edificato, il cono monotono verso il polo, i picchi rari e deterministici, e il massimo teorico che coincide con `BUILDER.maxLevel` |
| [world/buildings/Builder.test.ts](src/world/buildings/Builder.test.ts) | Candidato → occupazione della simulazione → voxel; allineamento alla rete stradale; opere di terra su isola vera; la banchina non si stacca dalla terra; landmark dei catalizzatori e avanzamento di stadio; isolati terrazzati — quota e basamento condivisi, nessun solco fra i membri, gradoni sul fianco; la rete in quota — appoggi reali, nessun suolo preso, un percorso continuo fra due isolati, nessuna campata orfana; i landmark lineari che compaiono a ritagli; due mandati opposti danno due città diverse; la gerarchia verticale — tre fasce e nessun altopiano, la corona bassa sulla costa, nessun edificio alto scartato in silenzio, la figura che tiene su isole di seed diverso |
| [world/landmarks/generate.test.ts](src/world/landmarks/generate.test.ts) | Ingombro dichiarato, determinismo, stadi cumulativi, invarianza per rotazione, firma verticale e sagome distinte fra tutti i ruoli; gli ormeggi dentro l'ingombro e **sull'acqua** — una barca su una colonna che l'opera riempie finirebbe in mezzo al molo —, la prua che gira con la struttura, e lo scalo in quota come ricetta a se' con i suoi tre mestieri |
| [world/buildings/landmarkCoast.test.ts](src/world/buildings/landmarkCoast.test.ts) | La banchina va **incontro al mare**: su un bassofondo asciutto largo dieci colonne il porto scorre fin sopra l'acqua vera invece di fermarsi sulla sabbia, guarda il mare aperto e non l'orlo bagnato, non arretra dove il mare comincia subito, e tiene comunque la colonna cliccata dentro il proprio ingombro |
| [world/buildings/siteWorks.test.ts](src/world/buildings/siteWorks.test.ts) | La maschera dell'opera di terra: il molo esce su acqua che l'ingombro intero rifiuterebbe, il mare resta mare fuori dalla maschera, e il muro segue il bordo della maschera invece di quello del riquadro |
| [world/traffic/seaLane.test.ts](src/world/traffic/seaLane.test.ts) | La rotta gira attorno alla terra invece di attraversarla, tiene i due capi, rinuncia dove non c'e' acqua, e da la stessa risposta a ogni partita |
| [world/traffic/routes.test.ts](src/world/traffic/routes.test.ts) | Un imbarco solo non fa una linea; la traversata attracca ai due capi e aspetta; la nave da carico esce dal mondo al capo lontano — non c'e', invece di aspettare al largo — e da li' torna; il circuito di volo tocca la pista, sale in quota e **si alza sopra i grattacieli che sorvola** invece di attraversarli; lo scalo in quota mette in moto dirigibili, eVTOL che si posano davvero e mongolfiere che salgono e rientrano |
| [world/traffic/plume.test.ts](src/world/traffic/plume.test.ts) | Fuma solo chi ha una ciminiera; lo sbuffo appena uscito sta sulla bocca; gli sbuffi salgono, crescono e si diradano in ordine; la scia resta dove la nave e' passata invece di seguirla; una nave fuori dal mondo non fuma, ma la scia le sopravvive sul bordo |
| [world/traffic/ropewayRoutes.test.ts](src/world/traffic/ropewayRoutes.test.ts) | Due cabine per linea che stanno sempre ai capi opposti, la corsa che segue la pancia della fune invece di tagliarla, e l'accordo fra `cabinDrop` e la sagoma appesa |
| [world/ropeway/ropewayPlan.test.ts](src/world/ropeway/ropewayPlan.test.ts) | La sponda opposta trovata da un click solo; la fune ancorata ai centri delle torri e la pancia in mezzo; il franco sul mare e su una collina, colonna per colonna; la stazione che arretra su un lungomare costruito; i rifiuti uno per uno |
| [world/ropeway/generate.test.ts](src/world/ropeway/generate.test.ts) | Zoccolo pieno, banchina calpestabile a `deckDrop` sotto la fune, architrave in mezzeria alla quota della fune, e l'asse che gira il castello senza cambiare l'ingombro |
| [world/buildings/ropewayDriver.test.ts](src/world/buildings/ropewayDriver.test.ts) | Dal click ai voxel su uno stretto scritto a mano: due torri a registro che non sono edifici, entrambe sull'asciutto, e **nessun voxel fra loro** — la prova che la fune non e' materia |
| [world/buildings/BuildingRegistry.test.ts](src/world/buildings/BuildingRegistry.test.ts) | Indice spaziale e sostituzione di record |
| [world/buildings/chunkBudget.test.ts](src/world/buildings/chunkBudget.test.ts) | Il volume dentro un chunk, quello a cavallo di una cucitura, il vicino di bordo contato per eccesso; il tetto misurato sul ritaglio e non sull'ingombro intero |
| [world/crossings/crossingPlan.test.ts](src/world/crossings/crossingPlan.test.ts) | La scelta del compagno da un click solo, le due rive, il franco di navigazione, il pescaggio delle pile, i motivi di rifiuto uno per uno |
| [world/crossings/generate.test.ts](src/world/crossings/generate.test.ts) | La carreggiata continua fra i segmenti, la travatura aperta in mezzo e chiusa sopra le pile |
| [world/spans/spanPlan.test.ts](src/world/spans/spanPlan.test.ts) | Asse, vuoto e fronte comune; l'atterraggio sull'arretramento; i motivi di rifiuto uno per uno; il taglio in segmenti; il mezzanino dentro la fila |
| [world/spans/plazaPlan.test.ts](src/world/spans/plazaPlan.test.ts) | Il cuore dell'isolato cresciuto dal centro, gli appoggi su lati diversi, i rifiuti di forma |
| [world/spans/generate.test.ts](src/world/spans/generate.test.ts) | La sezione: travi sotto i filari di bordo, mensole alle testate, verde nel cuore, segmenti che si accordano |
| [world/spans/network.test.ts](src/world/spans/network.test.ts) | Union-find, grado per appoggio, la piazza come nodo, e la proprieta' di continuita' del gate |
| [world/aerial/deckPlan.test.ts](src/world/aerial/deckPlan.test.ts) | Lo sbalzo e le sue gambe: mensola corta senza appoggi, profonda con i propri; nessuna colonna oltre `reach`; il piede che cerca un tetto; mai sulla carreggiata; il pianerottolo spesso |
| [world/aerial/terracePlan.test.ts](src/world/aerial/terracePlan.test.ts) | La corsa di parete su una sommita' di fascia vera, la quota in facciata su un prisma, il voxel che esce dall'impronta, le quattro facce che non danno lo stesso riquadro, determinismo |
| [world/aerial/terraceForm.test.ts](src/world/aerial/terraceForm.test.ts) | Le quattro piante non sono lo stesso quadrato, la sezione cala dalla parete alla punta, lo smusso solo sugli angoli esterni e ridotto sui balconi piccoli |
| [world/aerial/generate.test.ts](src/world/aerial/generate.test.ts) | La rastremazione arriva fino ai voxel, e arriva alla sola mensola: tratti e nodi restano simmetrici |
| [world/aerial/routePlan.test.ts](src/world/aerial/routePlan.test.ts) | Il percorso dritto piu' lungo di una campata, i pianerottoli che assorbono il dislivello, i rifiuti uno per uno, e **la piega a zeta con il suo tratto di traverso** |
| [world/aerial/guideway.test.ts](src/world/aerial/guideway.test.ts) | Il montante che poggia davvero e tocca l'impalcato, il tetto preferito al prato, il marciapiede ammesso, i tre rifiuti |
| [world/buildings/cluster.test.ts](src/world/buildings/cluster.test.ts) | Chi entra in fila e chi apre il gradino: mai scavare, tetto del riempimento, soglia di densità, termini adottati invariati |
| [world/buildings/generate.test.ts](src/world/buildings/generate.test.ts) | Determinismo e limiti degli stamp; terrazze, giardini, soglie luminose, silhouette per uso, campate che spezzano la parete senza toccare volume né superfici, e corso di base che sposta la quota senza toccare la sagoma |
| [world/buildings/generateDigest.test.ts](src/world/buildings/generateDigest.test.ts) | Impronte digitali della grammatica, fissate su codice funzionante: si accorge di uno spostamento di codice che consuma un tiro in più o in un altro ordine |
| [world/buildings/blockForm.test.ts](src/world/buildings/blockForm.test.ts) | Quattro angoli per isolato e non un lato intero, fronte a metà lato, cuore staccato dai bordi, invarianza allo scambio degli assi, `blockRoom` che non scende mai sotto il pavimento |
| [world/buildings/overhang.test.ts](src/world/buildings/overhang.test.ts) | Lo sbalzo: inviluppo sul solo asse del fronte, ancora sull'angolo del lotto, niente che sporga sotto la quota franca, `columns` contro `groundColumns`, budget di chunk su tutte le fasi di cucitura, e nessun inviluppo che ne attraversi un altro in una città vera |
| [world/buildings/geometry.test.ts](src/world/buildings/geometry.test.ts) | Smusso simmetrico allo scambio degli assi e limitato per fascia, portico che buca sotto e non sopra con i cantonali pieni, falda distinta da ogni altra cima, `shear` e `corner` dentro l'impronta |
| [world/buildings/style.test.ts](src/world/buildings/style.test.ts) | Catalogo degli stili entro i 32 slot, tessuto ridipinto e accento intatto, scelta pura e costante per quartiere, distribuzione sull'intera tabella |
| [world/buildings/blockStyle.test.ts](src/world/buildings/blockStyle.test.ts) | Lo stile visto dai record di una città vera: registrato su ogni edificio, uguale dentro un isolato, mai divergente dalla regola pura |
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
| [sim/flows.test.ts](src/sim/flows.test.ts) | La scomposizione torna con il saldo dei fondi su quaranta tick, a cassa vuota si paga solo il possibile, un saldo commerciale negativo conta come uscita e non come entrata mancata |
| [sim/registryIsolation.test.ts](src/sim/registryIsolation.test.ts) | 500 tick senza registry; `src/sim` non importa il dominio degli edifici voxel |
| [sim/decisions.test.ts](src/sim/decisions.test.ts) | Cadenza, persistenza, risoluzione e mandato occupato dalla scelta |
| [sim/charters.test.ts](src/sim/charters.test.ts) | Uno slot per famiglia, sostituzione, revoca, ordine canonico |
| [sim/trade.test.ts](src/sim/trade.test.ts) | Prerequisito del porto e priorità commerciali |
| [sim/nextBuildSites.test.ts](src/sim/nextBuildSites.test.ts) | Ordinamento, filtri di edificabilità |
| [sim/vitality.test.ts](src/sim/vitality.test.ts) | Occupazione da popolazione su capacita', citta' sovracostruita piu' spenta, commercio fermo a zero, lettura pura |
| [sim/simPerf.test.ts](src/sim/simPerf.test.ts) | Tick sotto 3 ms, zero celle ricalcolate, costo indipendente dalla mappa |
| [engine/mesher/greedyMesher.bench.ts](src/engine/mesher/greedyMesher.bench.ts) | Costo per chunk: vuoto, edifici, edifici sci-fi, pieno, rumore, scacchiera |
| [sim/sim.bench.ts](src/sim/sim.bench.ts) | `tick`, catalizzatore, policy, `nextBuildSites` |

## Parametri URL

La radice `/` avvia isola, crescita e Cozy HUD; gli overlay tecnici sono nascosti.

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` apre overlay e hotkey tecniche; `F3` li alterna a runtime |
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
