# Indice — il suolo

Storage voxel, terreno, strade, opere di terra, campagna, vincoli di sito e porto.

Una scheda del [Project Index](../../PROJECT_INDEX.md): qui c’e’ solo *dove sta cosa*.
Il modo economico di leggerla e’ `npm run locate -- <termine>`, che cerca su tutte le
schede insieme e restituisce le sole righe che servono. I percorsi delle righe
sono relativi alla radice del repository, non a questa cartella.


## `src/world/` — storage e mondo

| File | Ruolo | Esporta |
| --- | --- | --- |
| [scale.ts](src/world/scale.ts) | Le scale separate della citta': modulo ordinario da otto voxel con progressione 4–8 e passo uno; riferimento strutturale mega per strade, segmenti, costa e arcologie | `SCALE`, `levelCapsOf`, `bandStepOf`, `segmentSideOf`, `streetPitchOf`, `coastalRadiusOf`, `arcologySpanOf` |
| [scenes/swatchCatalog.ts](src/world/scenes/swatchCatalog.ts) | Catalogo dei soggetti del campionario: arcologie matrici e variazioni, quattro linee evolutive, tipologie mature e landmark derivati dagli stamp veri, con fasce, scheda e inquadrature | `SWATCH_ITEM_GAP`, `SWATCH_BUILDING_LEVEL`, `SWATCH_LINE_TYPOLOGIES`, `SWATCH_LINE_LEVELS`, `SWATCH_LINES`, `SWATCH_FOCUS`, `SWATCH_FOCUSES`, `SWATCH_BUILDINGS`, `SWATCH_LANDMARKS`, `SWATCH_CATALOG_SUBJECTS`, `SWATCH_SUBJECTS`, `swatchExtent`, `swatchFocusExtent`, `swatchSubjectAt`, `swatchPlinthSpanAt`, `SwatchFocus`, `SwatchSubject`, `SwatchCatalogSubject`, `SwatchSubjectKind`, `SwatchInfoRow` |
| [scenes/swatchLabels.ts](src/world/scenes/swatchLabels.ts) | Le parole della scheda del campionario: forme e note dei landmark, nomi delle arcologie, soglia visuale di un livello, forma, impronta, linea di crescita e le condizioni complete di una tipologia | `FORM_LABELS`, `FORM_NOTES`, `WATER_LABELS`, `ARCOLOGY_LABELS`, `levelLabel`, `useLabel`, `footprintLabel`, `shapeLabel`, `requirementLabel`, `evolutionLabel` |
| [scenes/swatchOcclusion.ts](src/world/scenes/swatchOcclusion.ts) | Quanto spazio serve perche' un soggetto del campionario non ne copra un altro: il conto isometrico in un posto solo, letto dalle fasce, dalle gallerie e dal test | `clearanceBehind`, `clearanceBeside`, `hiddenBehind` |
| [scenes/swatchPick.ts](src/world/scenes/swatchPick.ts) | Traversata DDA del raggio nel volume del campionario: il primo solido visibile, puro e senza mondo | `firstSolidVoxel`, `VoxelRay`, `VoxelHit`, `SwatchBox` |
| [src/world/traffic/wake.ts](src/world/traffic/wake.ts) | La scia sull'acqua: il pennacchio letto in orizzontale, dalle pose passate. |
| [VoxelWorld.ts](src/world/VoxelWorld.ts) | Storage sparso a chunk, dirty set, AABB, cache dell'ultimo chunk | `VoxelWorld`, `WorldBounds` |
| [Chunk.ts](src/world/Chunk.ts) | Due `Uint8Array(32768)` — `blocks` (rendering) e `data` (simulazione) — allocati una volta sola | `Chunk` |
| [visualBlock.ts](src/world/visualBlock.ts) | Packing visuale in un byte: palette 0..31 e superficie 0..7, che su un voxel d'acqua porta la classe dello specchio e su una copertura del terreno — palette 0, un byte che il pack non produce mai — il tipo di erbetta | `SURFACE_KIND`, `SURFACE_KIND_NAMES`, `ALL_SURFACE_KINDS`, `WATER_CLASS`, `packVisualBlock`, `blockPalette`, `blockSurface`, `packCoverMark`, `coverMarkKind`, `isCoverMark` |
| [chunkCoords.ts](src/world/chunkCoords.ts) | Costanti e conversioni di coordinate, indici delle facce, portata del sondaggio del cielo | `CHUNK`, `PADDED`, `SKY_PROBE`, `CEILING_VOL`, `idx`, `paddedIdx`, `ceilingIdx`, `toChunk`, `toLocal`, `keyOf`, `FACE_*` |
| [rng.ts](src/world/rng.ts) | PRNG deterministico per la generazione | `mulberry32`, `hashCoords` |
| [reachCost.ts](src/world/reachCost.ts) | Quanto costa all'influenza attraversare una colonna: l'acqua ferma, la strada porta lontano. L'unico posto da cui terreno e strade si leggono insieme | `createReachCost` |
| [planMask.ts](src/world/planMask.ts) | Lo smusso della pianta, condiviso fra edifici e landmark: taglio di Manhattan, simmetrico allo scambio degli assi | `inPlan`, `onPlanEdge` |
| [scenes/cityScene.ts](src/world/scenes/cityScene.ts) | Scene deterministiche a passi con budget: `city`, `noise`, `slab`, e il rimando a `diorama` e `swatch` | `createScene`, `SceneGenerator`, `SceneKind`, `SceneOptions`, `TILE`, `STREET`, `LOT` |
| [scenes/dioramaScene.ts](src/world/scenes/dioramaScene.ts) | Un edificio solo su un basamento con il fronte strada, per giudicare il dettaglio da vicino | `createDioramaScene`, `parseBuildingUse`, `DIORAMA_DEFAULT_LEVEL`, `DioramaScene`, `DioramaOptions`, `DioramaSubject`, `DioramaSubjectOptions` |
| [scenes/swatchLayout.ts](src/world/scenes/swatchLayout.ts) | **Ogni** numero e ogni geometria del campionario, puro: estensione, sagoma del provino a pezzi centrati, riquadro di una cella, cella sotto una coordinata | `SWATCH`, `SWATCH_BAND`, `SWATCH_BASE_REAR`, `SWATCH_COLUMNS`, `SWATCH_ROWS`, `SWATCH_PILLARS`, `SWATCH_WATERS`, `CELL_PARTS`, `CELL_FOOTPRINT`, `CELL_HEIGHT`, `CELL_LEDGE`, `cellSolidAt`, `SCALE_ITEMS`, `SCALE_ORIGIN_Y`, `swatchExtent`, `matrixCellRect`, `strataPillarRect`, `plinthSpanAt`, `swatchCellAt`, `SwatchBand`, `SwatchCell`, `SwatchExtent`, `SwatchRect`, `SwatchPart`, `ScaleItem` |
| [scenes/swatchProbe.ts](src/world/scenes/swatchProbe.ts) | Quanti prismi di dettaglio emette una cella del campionario: rimisura con gli emettitori veri e un writer che conta invece di scrivere | `cellDetail`, `countDetail`, `SwatchDetail` |
| [scenes/swatchScene.ts](src/world/scenes/swatchScene.ts) | Il campionario dei voxel: matrice palette × superficie, stratigrafia per bioma, fascia di scala e le due gallerie del catalogo. Scrive e basta | `createSwatchScene` |

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

## `src/world/streets/` — scheletro della crescita

La rete stradale che esiste **prima** degli edifici e ne orienta la crescita. E'
una funzione pura di `(seed, x, y)`: niente stato, niente da salvare, niente da
aggiornare quando arriva un catalizzatore. Il ritaglio sulla forma dell'isola
avviene a valle, dove il terreno gia' si legge.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/streets/config.ts) | **Ogni** passo, scostamento, larghezza e colore della carreggiata | `STREETS` |
| [streetGrid.ts](src/world/streets/streetGrid.ts) | Griglia deformata: assi, isolati, ruolo di una colonna, versi di affaccio | `STREET_ROLE`, `FACING`, `streetRoleAt`, `isPavement`, `blockAt`, `blockRect`, `blockKey`, `lineStart`, `lineEnd`, `lineWidth`, `isArterial`, `BlockId`, `BlockRect`, `Facing`, `StreetRole` |
| [src/world/streets/lots.ts](src/world/streets/lots.ts) | Ricerca pura dell'impronta libera per distanza euclidea attorno al candidato, continua oltre la maglia; la variante esplicita sul bordo puo' preferire un verso fornito dal mondo | `placeLot`, `Lot`, `LotRequest` |
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
| [src/world/sites/siteRules.ts](src/world/sites/siteRules.ts) | Vincoli di sito; `sightWater` per il mare, `sightAnyWater` per l'acqua a qualsiasi quota (laghi), con la quota dello specchio nel `WaterSight`; rifiuto `needs-waterfront`. |

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

## `src/world/harbor/` — il distretto costiero

L'impronta che un landmark costiero lascia sul proprio circondario: l'anello
che cresce con lo stadio, le opere dell'acqua — insenature e canali scavati
nella riva, moli guadagnati al mare, frangiflutti staccati — e gli slot di
settore che la macchina ordinaria del Builder trasforma in edifici con le
tipologie del posto. Puro: il piano entra come delta di uno stadio e non tocca
il mondo; lo applica `buildings/harborDriver.ts` sulle code di sempre, e le
colonne di scavo e colmata sono prenotate al registry contro la crescita.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/harbor/config.ts) | **Ogni** anello, misura d'opera, profondita' e cadenza del distretto, per ruolo | `HARBOR`, `HARBOR_ROLES`, `HarborRoleConfig` |
| [plan.ts](src/world/harbor/plan.ts) | Il piano puro di uno stadio: scavi, sponde, colmate, passeggiata e slot di settore, ruotati sul verso vero con `orientPart` e spezzati in ritagli a budget | `planHarborDistrict`, `HarborPlan`, `HarborDig`, `HarborWall`, `HarborFill`, `SectorSite`, `HarborProbe`, `HarborQuery` |
