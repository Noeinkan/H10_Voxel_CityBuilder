# Indice — meshing e rendering

Renderer, mesher, materiali, cielo, luce, camera, qualita’ adattiva e temi.

Una scheda del [Project Index](../../PROJECT_INDEX.md): qui c’e’ solo *dove sta cosa*.
Il modo economico di leggerla e’ `npm run locate -- <termine>`, che cerca su tutte le
schede insieme e restituisce le sole righe che servono. I percorsi delle righe
sono relativi alla radice del repository, non a questa cartella.


## `src/engine/` — meshing e rendering

| File | Ruolo | Esporta |
| --- | --- | --- |
| [ChunkRenderer.ts](src/engine/ChunkRenderer.ts) | Una geometria per chunk, coda a priorità, frustum culling, upload a budget | `ChunkRenderer`, `ChunkRendererStats` |
| [DemolitionOverlay.ts](src/engine/DemolitionOverlay.ts) | L'anteprima della gomma: un tappeto rosso sul tetto di ogni edificio che cadra' e uno ambra su cio' che la ferma. Overlay puro, nessuna mesh voxel toccata | `DemolitionOverlay`, `DemolishBox` |
| [InfoViewOverlay.ts](src/engine/InfoViewOverlay.ts) | La heatmap in-world delle viste informative a la Cities Skylines: campiona una regione per cella, a due passi con budget — prima i valori, poi i quad e i bordi in buffer dimensionati sul conto esatto dei quad — e ricostruisce solo quando cambia la vista o il campo, mai per pan o zoom. Continua a gradiente, categorica a tinta piatta con i bordi fra categorie diverse; le viste `sparse` si cercano su tutta l'impronta della cella decimata, non nel suo angolo | `InfoViewOverlay` |
| [src/engine/mesher/aerialSupportDetail.ts](src/engine/mesher/aerialSupportDetail.ts) | Sostegni aerei riduttivi: conserva il 2 x 2 logico, lo sostituisce nel volume di meshing con fusti a 1/16, capitelli dritti o arcuati e lascia pieni i carichi massivi. |
| [src/engine/mesher/microCrown.ts](src/engine/mesher/microCrown.ts) | Come un edificio **finisce contro il cielo**: filo del tetto (gronda, cornicione, gocciolatoio) e coronamento notturno (lanterna civica, ciminiera industriale, lucernario abitato, comignolo d'angolo). Ruota attorno a `facadeUnder`, che e' il primo modo che il mesher ha di sapere **che edificio ha sotto un tetto** | `appendCrownEdges`, `appendCrownProps`, `facadeUnder` |
| [src/engine/mesher/microDetail.ts](src/engine/mesher/microDetail.ts) | Il vocabolario degli edifici maturi, a 1/16 di voxel: balconi con corrimano sopra le terrazze attrezzate, davanzali sotto i fronti attivi, telai d'ingresso, lembi di tenda, passerelle e terminali industriali, lesene e pinne civiche, vasche e gruppi HVAC sui tetti. Non conosce il livello: reagisce alla superficie che le soglie visuali fanno comparire | `appendFacadeDetail`, `appendRoofDetail` |
| [src/engine/mesher/microThreshold.ts](src/engine/mesher/microThreshold.ts) | Come un edificio **tocca la strada**: gradino d'ingresso e cassonetto insegna. L'unico segnale di commercio che il mesher abbia e' la colonna del portale, e tutto qui e' ancorato li'; legge la maschera degli scavi perche' la soglia e' arretrata | `appendThresholdDetail` |
| [MesherPool.ts](src/engine/MesherPool.ts) | Pool di worker, job in volo, statistiche del mesher | `MesherPool`, `MesherStats`, `ChunkMeshResult` |
| [paletteHex.ts](src/engine/paletteHex.ts) | I colori grezzi della palette senza Three attorno: e' cio' che rende `THEMES` importabile dalla schermata del titolo, che vive prima del mondo. `palette.ts` li riespone | `paletteHex` |
| [src/engine/PerfReport.ts](src/engine/PerfReport.ts) | Aggregatore dei numeri di frame per il riepilogo da console: ogni 5 s una riga sola con medie, massimi e totali della finestra, pronta da incollare. Puro, testato in node. |
| [SelectionMaterial.ts](src/engine/SelectionMaterial.ts) | Il materiale della fascia di selezione: filo, alone e ruolo della cometa in quattro uniform, fuori dalla profondita' come le altre guide | `createSelectionMaterial`, `SelectionMaterialOptions` |
| [src/engine/shaders/scene.glsl.ts](src/engine/shaders/scene.glsl.ts) | Il GLSL che i materiali di scena condividono: palette, luce, materia, ombra, prospettiva aerea. |
| [src/engine/shaders/selection.glsl.ts](src/engine/shaders/selection.glsl.ts) | Il programma della selezione: profilo attraverso la fascia (filo quasi bianco, alone nel colore, filo scuro esterno) e cometa lungo il percorso | `selectionVertexShader`, `selectionFragmentShader` |
| [src/engine/shaders/skyGradient.glsl.ts](src/engine/shaders/skyGradient.glsl.ts) | Il gradiente del cielo scritto una volta per i due programmi che lo usano: il quad di fondo e la prospettiva aerea si toccano all'orizzonte, e due copie che divergono ci cuciono una riga. | `skyGradientHelpers` |
| [src/engine/shaders/vehicle.glsl.ts](src/engine/shaders/vehicle.glsl.ts) | Il programma dei mezzi: normale che ruota con la sagoma, fasciame, finestrini accesi, fanali. |
| [src/engine/shaders/wake.glsl.ts](src/engine/shaders/wake.glsl.ts) | Il programma della schiuma: bordo che si spegne e granello sulla cella del mondo. |
| [src/engine/street/StreetCameraController.ts](src/engine/street/StreetCameraController.ts) | La camera prospettica all'altezza degli occhi: occhio fermo, testa libera, rotella sul campo visivo. Implementa `CameraCommands`, quindi riusa `CameraInput` dichiarando `orbitMode` sempre vero. | `StreetCameraController`, `StreetCameraOptions` |
| [src/engine/street/streetEye.ts](src/engine/street/streetEye.ts) | I numeri della vista da terra e la matematica senza Three: dove si puo' posare l'occhio, a che quota, e la scatola d'ombra attorno a lui. | `EYE_HEIGHT`, `MIN_PITCH`, `MAX_PITCH`, `MIN_FOV`, `MAX_FOV`, `REST_FOV`, `FOV_STEP`, `YAW_STEP`, `STREET_NEAR`, `SHADOW_REACH`, `eyeRefusal`, `eyePoint`, `shadowBoxAround` |
| [src/engine/street/StreetLook.ts](src/engine/street/StreetLook.ts) | Lo sguardo a terra: il mouse gira la testa senza premere niente, con il pointer lock a togliere di mezzo cursore e bordi dello schermo. | `StreetLook`, `StreetLookCommands` |
| [src/engine/street/StreetView.ts](src/engine/street/StreetView.ts) | Quale delle due camere sta disegnando e cosa succede quando cambia: cattura e restituisce l'inquadratura isometrica, scambia l'input, stringe il volume dell'ombra. | `StreetView` |
| [src/engine/VehicleMaterial.ts](src/engine/VehicleMaterial.ts) | I materiali di mezzi e scia: non hanno uniform propri, prendono in prestito quelli del voxel. |
| [VoxelMaterial.ts](src/engine/VoxelMaterial.ts) | Unico `ShaderMaterial`: palette, sole e ambiente nel fragment, jitter per voxel, prospettiva aerea | `createVoxelMaterial`, `VoxelMaterialHandle` |
| [lighting.ts](src/engine/lighting.ts) | Modello di luce in TS puro: direzione del sole, diffusa avvolgente, luminanza per faccia | `sunDirection`, `faceLight`, `faceLuminance`, `wrapDiffuse`, `FACE_NORMALS` |
| [daylight.ts](src/engine/daylight.ts) | Ciclo giorno/notte in TS puro: traiettoria del sole dall'ora, fase del giorno dall'altezza, atmosfera derivata (riflesso dell'acqua compreso), tre modi dell'orologio | `DAYLIGHT`, `DAYLIGHT_MODE`, `DAYLIGHT_MODES`, `DaylightMode`, `dayPhase`, `nightFactor`, `sunElevation`, `sunAzimuth`, `withHour`, `modeHour`, `nextDaylightMode`, `resolveDaylightMode`, `mixHex`, `normaliseHour` |
| [atmosphere.ts](src/engine/atmosphere.ts) | Prospettiva aerea in TS puro: densita' esponenziale in quota, integrata in forma chiusa lungo il raggio, piu' il velo di quota | `fogShape`, `fogOpticalDepth`, `fogAmount`, `fogAltitudeLift`, `fogVeil`, `FogModel`, `FOG_FLAT_EPSILON`, `FOG_LIFT_SHARPNESS` |
| [nightWindows.ts](src/engine/nightWindows.ts) | Come si accende una facciata di notte, in TS puro: tetto alla quota accesa, carattere per torre, piani interi contro finestre sparse, grana verticale a blocchi di piani. **Ogni** numero del dominio | `NIGHT_WINDOWS`, `litShare`, `storeyGain`, `towerBias` |
| [inspect.ts](src/engine/inspect.ts) | Viste di ispezione in TS puro: dal modo attivo ai tre predicati, alla densita' della rigatura e all'accensione del landmark. I numeri che valgono per **tutti** i modi | `INSPECT`, `INSPECT_MODE`, `INSPECT_MODES`, `INSPECT_NAMES`, `inspectUniforms`, `sectionAxis`, `cycleInspectMode`, `parseInspectMode`, `clampSliceZ`, `isCut`, `needsCap`, `isOpenPlane`, `modeCuts`, `modeHasLevel`, `isActive`, `isBoundedRect`, `inspectGuide`, `InspectMode`, `InspectState`, `InspectUniforms`, `InspectGuide`, `InspectBox` |
| [xray.ts](src/engine/xray.ts) | La lente dei raggi X: test a lastre, densita' che cresce verso la camera, gabbia sul filo del voxel, ricerca e accensione del landmark. **Ogni** numero della lente | `XRAY`, `lensHit`, `lensChord`, `xrayDensity`, `LensHit` |
| [SunShadow.ts](src/engine/SunShadow.ts) | Shadow map ortografica del sole: fitting sull'AABB visibile, aggancio ai texel, materiale di sola profondita' | `createSunShadow`, `SunShadowHandle` |
| [PostProcessing.ts](src/engine/PostProcessing.ts) | Composer sempre attivo: bloom, tilt-shift, tone mapping in `OutputPass` | `createPostProcessing`, `PostProcessingHandle` |
| [SkyBackground.ts](src/engine/SkyBackground.ts) | Fondo procedurale: quad in NDC senza profondita', gradiente per altezza di schermo, disco solare e nuvole a bande | `createSkyBackground`, `SkyBackgroundHandle` |
| [FrameTiming.ts](src/engine/FrameTiming.ts) | Finestra scorrevole di intervalli rAF: fps, uno percento peggiore, p95/p99, jank | `FrameTiming`, `FrameTimingSnapshot` |
| [RenderQuality.ts](src/engine/RenderQuality.ts) | Pixel ratio adattivo con isteresi e profilo di effetti derivato: ombre, bloom, tilt-shift scendono insieme | `RenderQualityController`, `parseQualityMode`, `QualityMode`, `QualityProfile`, `QualityDecision`, `QualityReason` |
| [InfluenceOverlay.ts](src/engine/InfluenceOverlay.ts) | Portata dei catalizzatori: velatura a gradiente decimata, isolinee ai quarti e contorno tracciati con marching squares sui dati veri del campo; perimetri dei settori, cache del campo del cursore e anello del «metti qui» del coach | `InfluenceOverlay`, `ReachSummary` |
| [InspectGuides.ts](src/engine/InspectGuides.ts) | Le linee che dicono dove e' puntata una vista: riquadro, carreggiata della sezione, colonna a fuoco | `InspectGuides` |
| [InspectView.ts](src/engine/InspectView.ts) | Lo stato delle viste di ispezione: colonna a fuoco, landmark piu' vicino, isolato scelto, aggancio della camera, ri-armo della quota. Il raccordo fra mondo e `inspect.ts`, che resta puro | `createInspectView`, `InspectView`, `InspectViewOptions`, `FocusCell` |
| [SelectionOutline.ts](src/engine/SelectionOutline.ts) | Il contorno di cio' che il giocatore ha scelto: fascia luminosa sul terreno, coperchio alla quota della cosa, montanti agli angoli e squadre che la inquadrano da fuori. Ogni parte e' la stessa fascia con un percorso diverso, e una cometa lenta la percorre | `SelectionOutline`, `SelectionBox`, `HeightAt` |
| [AtmosphereControl.ts](src/engine/AtmosphereControl.ts) | Chi possiede tema, ora e modo del giorno, e li scrive in renderer, composer e materiale | `createAtmosphereControl`, `AtmosphereControl`, `AtmosphereOptions` |
| [PlacementCursor.ts](src/engine/PlacementCursor.ts) | Segnaposto sotto il puntatore: base, mirino, onda e fascio, sempre sopra la scena | `PlacementCursor` |
| [TrafficView.ts](src/engine/TrafficView.ts) | I mezzi in movimento, fuori dal volume voxel: geometria condivisa per tipo, colori dalla palette per la luce della faccia, e la mesh unica del pennacchio riscritta per frame | `TrafficView`, `faceShades`, `FACE_CORNERS` |
| [src/engine/vehicleHulls.ts](src/engine/vehicleHulls.ts) | Sagome dei mezzi in scatole; lo yacht da diporto della marina. |
| [RopewayView.ts](src/engine/RopewayView.ts) | Le funi delle funivie, fuori dal volume voxel: un concio per tratto, riferimento costruito sul verso, geometria ricostruita solo quando nasce una linea | `RopewayView`, `CableLine` |
| [introDrop.ts](src/engine/introDrop.ts) | La caduta con cui i pezzi della prima isola entrano in scena, in TS puro. **Ogni** numero: margine oltre il bordo dello schermo, durata, jitter per chunk, ritardo per piano, rimbalzo | `INTRO`, `DROP_SPAN`, `fallHeightFor`, `dropDelay`, `dropLift`, `hasLanded` |
| [dropRain.ts](src/engine/dropRain.ts) | I cubetti che piovono davanti al pezzo in arrivo: semina per chunk, discesa, tetto dei vivi. La colonna arriva come sonda, quindi niente mondo e niente Three | `RAIN`, `RainCube`, `RainColumn`, `RainProbe`, `RainState`, `createRain`, `clearRain`, `spawnOverChunk`, `advanceRain` |
| [DropRainView.ts](src/engine/DropRainView.ts) | La mesh unica dei cubetti, buffer dinamici e `drawRange` come il pennacchio; colori dalla palette per la luce della faccia | `DropRainView` |
| [IsoCameraController.ts](src/engine/IsoCameraController.ts) | Ortografica isometrica: scatti di 90°, zoom, pan vincolato all'AABB, **orbita** libera (yaw continuo, inclinazione 12°-82°) e ritorno all'assetto, il modo studio di un soggetto (pan del perno dentro il soggetto, cattura e ripristino dell'inquadratura) e il centro verticale dichiarato di `frameRegion`, che il pan non riporta a terra | `IsoCameraController`, `IsoCameraOptions`, `IsoCameraState` |
| [CameraInput.ts](src/engine/CameraInput.ts) | Pointer, rotella e tasti della camera, con la guardia sui campi di testo: i listener stanno su `window` e prendevano ogni tasto | `CameraInput`, `CameraCommands`, `isPanButton`, `isOrbitButton`, `isTypingTarget` |
| [orbitPan.ts](src/engine/orbitPan.ts) | Il pan da tastiera in TS puro: cosa dicono i tasti, e dove finisce il perno dell'orbita dentro il volume del soggetto | `readPanAxes`, `panOrbitPivot`, `scaleOrbitBounds`, `OrbitBounds`, `PanAxes`, `Pivot` |
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
