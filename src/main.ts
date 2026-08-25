import {
  Matrix4,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createAtmosphereControl } from './engine/AtmosphereControl';
import { ChunkRenderer } from './engine/ChunkRenderer';
import { InfluenceOverlay, type ReachSummary } from './engine/InfluenceOverlay';
import { InspectGuides } from './engine/InspectGuides';
import { PlacementCursor } from './engine/PlacementCursor';
import { TrafficView } from './engine/TrafficView';
import { RopewayView } from './engine/RopewayView';
import { FrameTiming } from './engine/FrameTiming';
import {
  INSPECT,
  INSPECT_MODE,
  INSPECT_MODES,
  INSPECT_NAMES,
  clampSliceZ,
  cycleInspectMode,
  isCut,
  modeHasLevel,
  parseInspectMode,
  type InspectMode,
} from './engine/inspect';
import { createInspectView } from './engine/InspectView';
import { IsoCameraController } from './engine/IsoCameraController';
import {
  DAYLIGHT,
  DAYLIGHT_MODE,
  dayPhase,
  modeHour,
  nextDaylightMode,
  normaliseHour,
  resolveDaylightMode,
  withHour,
  type DaylightMode,
} from './engine/daylight';
import { faceLuminance } from './engine/lighting';
import { onPaletteChanged } from './engine/palette';
import {
  RenderQualityController,
  parseQualityMode,
  type QualityProfile,
} from './engine/RenderQuality';
import { DropRainView } from './engine/DropRainView';
import { fallHeightFor } from './engine/introDrop';
import {
  advanceRain,
  clearRain,
  createRain,
  spawnOverChunk,
  type RainColumn,
} from './engine/dropRain';
import { createSkyBackground } from './engine/SkyBackground';
import { createPostProcessing } from './engine/PostProcessing';
import { createSunShadow } from './engine/SunShadow';
import { SelectionOutline } from './engine/SelectionOutline';
import { resolveTheme, THEMES, type Theme } from './engine/themes';
import { createVoxelMaterial } from './engine/VoxelMaterial';
import { GrowthScene } from './game/growthScene';
import { resolveLaunchMode, swatchUrl } from './game/launchMode';
import { resolveSelection, type Selection } from './game/selection';
import { pickSolidCell, pickSurfaceCell, type Ray3, type SurfaceCell } from './game/surfacePick';
import { SimScene, SIM_SITE_COUNT, SIM_TICK_RATE } from './game/simScene';
import { coastalSectorAt, shapeWithSector, type CoastalSector } from './game/sectors';
import type { ActionFailure, SiteCost } from './game/actions';
import type { LandmarkSite } from './world/buildings/Builder';
import { BALANCE } from './sim/balance';
import { cityVitality } from './sim/vitality';
import { catalystById, defaultCatalystOfClass, type CatalystId } from './sim/catalysts';
import {
  BUILDING_CLASS,
  CLASS_COUNT,
  CLASS_LABELS,
  CLASS_NAMES,
  type BuildingClass,
} from './sim/classes';
import { BUILDER } from './world/buildings/config';
import { typologiesForUses } from './world/buildings/typology';
import type { BuildSite } from './sim/nextBuildSites';
import { isPolicyId } from './sim/policies';
import './ui/hud.css';
import { DebugOverlay, type OverlayFrame } from './ui/DebugOverlay';
import { GameHud, type GameTool } from './ui/GameHud';
import { daylightControl } from './ui/GameHudModel';
import { unlockLines } from './ui/prospects';
import { hudTokens } from './ui/hudTokens';
import { GrowthOverlay } from './ui/GrowthOverlay';
import { InspectOverlay, type InspectOverlayFrame } from './ui/InspectOverlay';
import { SelectionPanel } from './ui/SelectionPanel';
import { extentOf, type SelectionActionId, type SelectionSectionId } from './ui/SelectionPanelModel';
import { SimOverlay, type SimOverlayFrame } from './ui/SimOverlay';
import { SwatchOverlay, type SwatchOverlayFrame } from './ui/SwatchOverlay';
import { TerrainOverlay, type TerrainOverlayFrame } from './ui/TerrainOverlay';
import {
  buildViewMenuModel,
  viewAfterToolPicked,
  viewLabel,
  type ViewMenuModel,
} from './ui/ViewMenuModel';
import { CHUNK } from './world/chunkCoords';
import { GROUND, type GroundKind } from './world/grading/grade';
import { createScene, type SceneGenerator, type SceneKind } from './world/scenes/cityScene';
import {
  createDioramaScene,
  DIORAMA_DEFAULT_LEVEL,
  parseBuildingUse,
  type DioramaScene,
} from './world/scenes/dioramaScene';
import {
  CELL_HEIGHT,
  SWATCH,
  SWATCH_BAND,
  swatchCellAt,
  swatchExtent,
  type SwatchCell,
} from './world/scenes/swatchLayout';
import { cellDetail, type SwatchDetail } from './world/scenes/swatchProbe';
import { StreetNetwork } from './world/streets/StreetNetwork';
import { TERRAIN } from './world/terrain/config';
import { BiomeView } from './world/terrain/BiomeView';
import { expandIsland } from './world/terrain/IslandGenerator';
import { TerrainStreamer } from './world/terrain/TerrainStreamer';
import type { IslandShape } from './world/terrain/region';
import { VoxelWorld } from './world/VoxelWorld';

/**
 * Bootstrap del motore e harness di performance.
 *
 * Il lavoro sul main thread e' contenuto in un budget per frame: generazione
 * della scena e upload delle geometrie si fermano appena lo esauriscono, cosi'
 * il frame resta sotto la soglia anche durante il popolamento iniziale.
 */

/** Millisecondi di lavoro non-render concessi per frame, sotto il limite di 4 ms. */
const FRAME_BUDGET_MS = 3;

/** Lato della shadow map. Il gating di qualita' puo' abbassarlo a runtime. */
const SHADOW_SIZE = 2048;

/** Quota del budget riservata alla generazione della scena. */
const GENERATION_BUDGET_MS = 1.5;

/**
 * Gli stessi due budget finche' la prima isola non e' a terra.
 *
 * I 3 ms proteggono il frame **di gioco**: sono quelli che tengono fluida una
 * citta' dentro cui si sta giocando. Prima che l'isola esista non c'e' niente da
 * tenere fluido — nessun edificio, nessun comando, un HUD che dice "Preparing
 * the city" — e a 1,5 ms per frame il popolamento iniziale ci metteva centinaia
 * di frame per un lavoro che dura qualche decimo di secondo: mezzo minuto di
 * cielo vuoto per tre decimi di lavoro vero.
 *
 * Restano sotto il frame a 60 Hz di proposito. L'isola deve *comparire*
 * scorrendo, non apparire di colpo dopo uno schermo bloccato, e ogni frame in
 * meno e' anche una rimeshatura in meno: un chunk scritto a meta' viene
 * ricostruito a ogni frame che lo lascia incompleto. Finita la generazione si
 * torna ai budget di gioco, e da li' in avanti — espansioni comprese — valgono
 * quelli.
 */
const LOADING_FRAME_BUDGET_MS = 12;
const LOADING_GENERATION_BUDGET_MS = 9;

const VOXEL_SIZE = 1;

/**
 * Lato dell'isola della scena di debug del terreno, in voxel.
 *
 * Raddoppiato insieme alla scala del contenuto. Un edificio ora e' largo il
 * doppio, quindi a parita' di lato ce ne stavano un quarto e l'isola si leggeva
 * come uno scoglio: 512 riporta la citta' alla capacita' che aveva, con il
 * dettaglio nuovo. Il terreno costa quattro volte in colonne, ma le celle piatte
 * si fondono nel greedy mesher molto meglio delle colonne a quota libera di
 * prima — la spesa vera va misurata, non dedotta.
 */
const TERRAIN_SIZE = 512;

const params = new URLSearchParams(window.location.search);
const { debugEnabled, growEnabled, simEnabled } = resolveLaunchMode(params);
let debugVisible = debugEnabled;
const sceneKind = parseSceneKind(params.get('scene'));
const seed = parseInt(params.get('seed') ?? '1337', 10) || 1337;
const worldSize = clampInt(params.get('size'), 512, 32, 4096);
const worldHeight = clampInt(params.get('height'), 64, 32, 256);
const qualityMode = parseQualityMode(params.get('quality'));

/**
 * Le ombre si possono togliere da URL con `shadows=0`; in Fase 5 anche il gating
 * automatico di qualita' scrivera' qui.
 */
const shadowsAllowedByUrl = params.get('shadows') !== '0';

/** `?terrain=<seed>` sostituisce la scena urbana con l'isola procedurale. */
const terrainParam = params.get('terrain');
const terrainSeed = terrainParam === null ? seed : parseInt(terrainParam, 10) || seed;

/**
 * Vista di ispezione iniziale.
 *
 * `?inspect=` vale **anche senza** `?debug=1`, come `?theme=`: e' il modo in cui
 * uno strumento di cattura inquadra una sezione senza portarsi dietro gli
 * overlay. Hotkey e pannello restano invece dietro il debug, perche' sono
 * comandi e non un'inquadratura.
 */
/**
 * `?intro=0` toglie la caduta d'ingresso.
 *
 * Vale **anche senza** `debug`, come `?theme=`: e' cosi' che uno strumento di
 * cattura ottiene l'isola ferma senza portarsi dietro gli overlay.
 */
const introEnabled = params.get('intro') !== '0';

const initialInspectMode: InspectMode = parseInspectMode(params.get('inspect'));
const initialSliceZ = clampSliceZ(
  params.get('slice') === null ? INSPECT.defaultSliceZ : Number(params.get('slice')),
);

/** `?slice=` e' una quota chiesta esplicitamente, e resta fissa fra un'apertura e l'altra. */
const sliceZFromUrl = params.get('slice') !== null;

const container = document.getElementById('app');
if (container === null) throw new Error('missing #app container');

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const renderQuality = new RenderQualityController(qualityMode, window.devicePixelRatio);
renderer.setPixelRatio(renderQuality.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new Scene();
const world = new VoxelWorld();

/**
 * Soggetto del diorama, composto **prima** della camera.
 *
 * Comporlo qui non e' un vezzo di ordine: `targetHeight` e' letto una volta sola
 * dal costruttore della camera, e il perno di un edificio inquadrato da vicino
 * sta a meta' della sua altezza, non sul pianoro dell'isola. Costruirlo costa
 * uno stamp e nessun voxel: la scrittura resta dentro `step`, a budget.
 */
const diorama: DioramaScene | null = sceneKind === 'diorama' && terrainParam === null &&
  !simEnabled && !growEnabled
  ? createDioramaScene(world, {
      seed,
      originX: 0,
      originY: 0,
      use: parseBuildingUse(params.get('class')) ?? BUILDING_CLASS.commercial,
      level: clampInt(params.get('level'), DIORAMA_DEFAULT_LEVEL, 0, BUILDER.maxLevel),
      typologyId: params.get('typology') ?? undefined,
      mixed: parseBuildingUse(params.get('mixed')) ?? undefined,
    })
  : null;

/** `?theme=<id>` sceglie il look; in assenza vale il diorama caldo. */
const initialTheme: Theme = resolveTheme(params.get('theme'));

/**
 * `?daylight=cycle|day|night` sceglie se l'orologio cammina o sta fermo.
 *
 * E' la stessa scelta del bottone nell'HUD, e vale anche senza `debug`: la
 * notte fissa e' un modo di guardare la propria citta', non una misura.
 */
const initialMode: DaylightMode = resolveDaylightMode(params.get('daylight'));

/**
 * `?clouds=1` parte con i banchi in cielo. Vale anche senza `debug`, come
 * `?theme=`.
 *
 * **Di partenza sono spenti**, ed e' una scelta: la lastra e' un fondo per il
 * vuoto, cioe' serve quando si guarda una citta' che sta gia' in quota, e sopra
 * una citta' a terra e' solo qualcosa davanti. Chi la vuole la accende, dal
 * bottone o con C, e chi inquadra una torre per una cattura non se la trova
 * davanti senza averla chiesta.
 */
let cloudsOn = params.get('clouds') === '1';

/**
 * `?hour=<0..24>` fissa l'ora e **ferma** il ciclo: vale anche senza `debug`,
 * come `?theme=` e `?inspect=`, perche' e' un'inquadratura e non una misura.
 *
 * Non e' `?daylight=`: quello sceglie fra tre stati che il gioco conosce,
 * questo inchioda un'ora qualsiasi per una cattura. Il primo clic sul bottone
 * lo scioglie, perche' un comando di gioco che non risponde e' peggio di un
 * parametro perso.
 */
const hourPinned = params.get('hour') !== null;
const initialHour = hourPinned
  ? normaliseHour(Number(params.get('hour')))
  // Senza, si parte dall'ora del modo, e nel ciclo e' meta' pomeriggio: il sole
  // sta ancora sopra la soglia in cui il tetto e' la faccia piu' chiara, quindi
  // la prima immagine e' quella con cui i temi sono stati disegnati.
  : modeHour(initialMode) ?? DAYLIGHT.dayHour;

/** Stesso ritmo dell'HUD: l'occupazione cambia un tick alla volta, non un frame. */
const VITALITY_REFRESH_MS = 150;
let vitalityAt = 0;

const paletteHandle = createVoxelMaterial(initialTheme.colors, VOXEL_SIZE);
const chunkRenderer = new ChunkRenderer(world, paletteHandle.material, VOXEL_SIZE);
scene.add(chunkRenderer.group);
const skyBackground = createSkyBackground(initialTheme.atmosphere);
scene.add(skyBackground.mesh);
const sunShadow = createSunShadow(VOXEL_SIZE, SHADOW_SIZE);

/** Direzione del sole nel mondo, e la stessa portata in spazio vista. */
const sunWorld = new Vector3();
const sunView = new Vector3();

/** Riusata a ogni frame: e' l'unica cosa che porta il fondo procedurale nel mondo. */
const skyInvViewProj = new Matrix4();


// uResolution lavora su gl_FragCoord, che e' in pixel del drawing buffer:
// va letta da li' e non da innerWidth, altrimenti con pixelRatio != 1 il
// gradiente di nebbia si stacca da quello del cielo.
const drawingBuffer = new Vector2();
function syncResolution(): void {
  renderer.getDrawingBufferSize(drawingBuffer);
  paletteHandle.setResolution(drawingBuffer.x, drawingBuffer.y);
}
syncResolution();

/** Direzione di sguardo, riusata ogni frame per lo scattering della nebbia. */
const viewDirection = new Vector3();

const camera = new IsoCameraController(world, window.innerWidth, window.innerHeight, {
  voxelSize: VOXEL_SIZE,
  // Il piano su cui la camera pana, ruota e si centra. Dodici voxel stavano
  // **sotto** il livello del mare (`TERRAIN.seaLevel: 16`): era la quota giusta
  // per una scena di prova piana, non per un'isola che parte a ventiquattro e
  // adesso porta torri centocinquanta piu' su. A ventiquattro il perno sta sul
  // pianoro dell'isola, cioe' sul suolo che si sta guardando davvero.
  //
  // Il diorama e' l'eccezione: li' si guarda un edificio, non un suolo, e il
  // perno va a meta' della sua altezza — altrimenti `Q`/`E` lo fanno ruotare
  // attorno ai propri piedi e la cima esce di campo a ogni scatto.
  // Il campionario e' l'altra eccezione, e per il motivo opposto: e' quasi
  // piatto, e un perno a ventiquattro lo farebbe ruotare attorno a un punto
  // sospeso sopra la griglia.
  targetHeight: diorama !== null
    ? diorama.subject.z + diorama.subject.sizeZ / 2
    : sceneKind === 'swatch'
      ? SWATCH.groundZ + CELL_HEIGHT / 2
      : 24,
});
camera.attach(renderer.domElement);

// Il composer ha bisogno di scena e camera, quindi nasce qui; e `applyTheme`
// ne imposta bloom e tilt, percio' la prima applicazione del tema viene dopo.
const post = createPostProcessing(renderer, scene, camera.camera);
// Con il composer ogni pass interna azzererebbe 'renderer.info', e l'overlay
// finirebbe per misurare solo l'ultimo quad fullscreen. Azzerandolo a mano una
// volta per frame il conteggio torna a essere il totale vero: scena, ombra e post.
renderer.info.autoReset = false;
post.setSize(window.innerWidth, window.innerHeight, renderQuality.pixelRatio);

/**
 * Profilo di effetti in vigore. Lo decide `RenderQuality`, che lo fa scendere
 * insieme al pixel ratio quando il frame non tiene: spegnere bloom e ombre
 * restituisce piu' millisecondi che togliere un quarto di risoluzione, e si
 * nota molto meno.
 */
let qualityProfile = renderQuality.profile;

function applyQualityProfile(profile: QualityProfile): void {
  qualityProfile = profile;
  if (profile.shadowSize > 0) sunShadow.setSize(profile.shadowSize);
  post.setQuality({
    bloom: profile.bloom,
    tilt: profile.tilt,
    bloomScale: profile.bloomScale,
  });
}

applyQualityProfile(renderQuality.profile);

/**
 * Tema, ora e modo del giorno: chi li possiede e chi li scrive nel renderer.
 *
 * Nasce qui perche' ha bisogno del composer, e il composer ha bisogno di scena e
 * camera. I due cablaggi verso l'HUD sono callback e non riferimenti: l'HUD
 * nasce piu' avanti, e `engine/` non lo conosce comunque.
 */
const daylight = createAtmosphereControl({
  renderer,
  paletteHandle,
  post,
  skyBackground,
  sunWorld,
  theme: initialTheme,
  mode: initialMode,
  hour: initialHour,
  pinned: hourPinned,
  onTheme: (next) => gameHud?.setTheme(next.id),
  onMode: (mode) => {
    gameHud?.setDaylight(mode);
    gameHud?.showTransientFeedback(`Daylight · ${daylightControl(mode).label}`);
  },
});

daylight.applyTheme(initialTheme);
// Dopo il tema: `applyTheme` riscrive lo strato del tema nuovo, e l'interruttore
// del giocatore vale sopra di esso.
paletteHandle.setClouds(cloudsOn);
skyBackground.setClouds(cloudsOn);

/**
 * Accende o spegne i banchi in quota.
 *
 * Sta qui e non nell'`AtmosphereControl` perche' non e' un'ora ne' un tema: e'
 * una preferenza di vista, come la qualita'. Il tema continua a dire **come**
 * sono fatte le nuvole, questo solo se si vedono.
 */
function setClouds(on: boolean): void {
  if (on === cloudsOn) return;
  cloudsOn = on;
  paletteHandle.setClouds(on);
  skyBackground.setClouds(on);
  gameHud?.setClouds(on);
  gameHud?.showTransientFeedback(`Clouds · ${on ? 'on' : 'off'}`);
  console.info(`[clouds] ${on ? 'on' : 'off'}`);
}

// La scena di terreno arriva da un worker, quindi non e' pronta a costruttore:
// il primo blocco entra al primo `step` che trova qualcosa in coda.
const terrainRegion = { minX: 0, minY: 0, sizeX: TERRAIN_SIZE, sizeY: TERRAIN_SIZE };

const terrain: TerrainStreamer | null =
  terrainParam === null && !simEnabled && !growEnabled
    ? null
    : new TerrainStreamer(world, terrainSeed, terrainRegion);

let generator: SceneGenerator =
  terrain ??
  diorama ??
  createScene(world, {
    kind: sceneKind,
    seed,
    originX: 0,
    originY: 0,
    sizeX: worldSize,
    sizeY: worldSize,
    sizeZ: worldHeight,
  });
let islandShape: IslandShape | null = terrain?.shape ?? null;
let expansionInFlight: CoastalSector | null = null;

const biomeView = terrain === null ? null : new BiomeView(world, terrain.map);

// Prima passata subito, cosi' il primo frame ha gia' qualcosa da disegnare.
generator.step(8);

// L'inquadratura si basa sulla dimensione richiesta, non sull'AABB corrente: a
// questo punto la scena e' generata solo in parte. Meta' lato perche' inquadrare
// tutta la citta' metterebbe nel frustum tutti i suoi chunk.
if (diorama !== null) {
  // Un soggetto solo: si inquadra il suo ingombro con un margine, non il mondo.
  // Il margine sta a destra e a sinistra dell'edificio ed e' li' che si vedono
  // il fronte strada e il prato, cioe' il contesto che rende leggibili tende,
  // insegne e portali.
  //
  // Il margine e' stretto di proposito: `frameRegion` prende comunque il
  // massimo fra l'altezza proiettata e la larghezza, quindi su un soggetto alto
  // e sottile e' l'altezza a decidere e ogni margine in piu' si paga due volte —
  // una torre di livello nove finiva a occupare un ottavo del campo.
  const s = diorama.subject;
  const span = Math.max(s.sizeX, s.sizeY) * 1.25;
  camera.frameRegion(s.x + s.sizeX / 2, s.y + s.sizeY / 2, span, span, s.sizeZ);
} else if (sceneKind === 'swatch') {
  // Qui si inquadra l'**estensione intera**, non mezza: il gate della 4.10
  // chiede tutte le combinazioni in una sola inquadratura, e un campionario di
  // cui si vede meta' non risponde alla domanda per cui esiste.
  const e = swatchExtent();
  camera.frameRegion(
    e.minX + e.sizeX / 2,
    e.minY + e.sizeY / 2,
    e.sizeX,
    e.sizeY,
    e.sizeZ,
  );
} else if (terrain === null) {
  camera.frameRegion(worldSize / 2, worldSize / 2, worldSize / 2, worldSize / 2, worldHeight);
} else if (growEnabled) {
  // La crescita deve leggersi come skyline, non come texture sull'intera isola:
  // si inquadra il nucleo centrale lasciando alle torri spazio verticale.
  //
  // `spanZ` non e' decorativo: entra in `projectedHeight`, quindi l'inquadratura
  // d'apertura **non** e' indipendente dall'altezza della citta'. Duecentoquaranta
  // erano tarati su torri da sessanta voxel; con la 4.6 un civico di livello
  // massimo ne fa centocinquanta sopra un terreno che parte a ventiquattro, e a
  // spanZ invariato la punta sarebbe nata fuori campo.
  camera.frameRegion(TERRAIN_SIZE / 2, TERRAIN_SIZE / 2, 420, 420, 320);
} else {
  // L'isola invece si guarda intera: 512 di lato stanno in poche centinaia di chunk.
  camera.frameRegion(TERRAIN_SIZE / 2, TERRAIN_SIZE / 2, TERRAIN_SIZE, TERRAIN_SIZE, 160);
}

const overlay = new DebugOverlay(container);
const terrainOverlay =
  terrain !== null && !simEnabled && !growEnabled
    ? new TerrainOverlay(container, toggleBiomeView)
    : null;
const swatchOverlay = sceneKind === 'swatch' ? new SwatchOverlay(container) : null;
overlay.setVisible(debugVisible);
terrainOverlay?.setVisible(debugVisible);
// Il referto del campionario **non** e' un overlay tecnico, ed e' l'unico che
// nasce aperto senza `?debug=1`: e' la legenda dello strumento, come la targa
// delle viste. In-world non ci sono etichette, quindi senza di lui la griglia
// resta duecentocinquanta prismi anonimi — e da quando il dock del gioco apre
// questa scena a chi non ha mai visto un parametro URL, tenere la legenda dietro
// un gate di misura significava mandarlo su una pagina che non si puo' leggere.
swatchOverlay?.setVisible(true);
let terrainApplyMs = 0;

/** Cella del campionario sotto il cursore; la leggono overlay e hook globale. */
let swatchCell: SwatchCell | null = null;

/**
 * Le due scene che possono girare sopra l'isola.
 *
 * Nascono entrambe null, e per la stessa ragione: i catalizzatori si piazzano su
 * colonne edificabili, e l'isola arriva dal worker un blocco alla volta. Partono
 * quando il terreno e' completo, non prima.
 */
let simScene: SimScene | null = null;
let growthScene: GrowthScene | null = null;

const simOverlay = simEnabled
  ? new SimOverlay(container, {
      onTick: () => simScene?.step(1),
      onToggleAuto: () => simScene?.toggleAuto(),
      onSelectClass: (cls) => simScene?.selectClass(cls),
      onTogglePolicy: (id) => simScene?.togglePolicy(id),
    })
  : null;
const growthOverlay = growEnabled ? new GrowthOverlay(container) : null;
const inspectOverlay = new InspectOverlay(container, {
  onMode: (mode) => inspect.setMode(mode),
  onSliceZ: (z) => inspect.setSliceZ(z),
});
simOverlay?.setVisible(debugVisible);
growthOverlay?.setVisible(debugVisible);
inspectOverlay.setVisible(debugVisible);
let selectedTool: GameTool = { kind: 'none' };
let gameHud: GameHud | null = null;
if (growEnabled) {
  gameHud = new GameHud(container, {
    onTool: (tool) => {
      // Con la citta' tagliata il terreno vero sotto il cursore e' nascosto: si
      // piazzerebbe alla cieca, in un punto che non si vede. Le viste a velo
      // sopravvivono, perche' li' il suolo si legge ancora sotto il retino.
      const kept = viewAfterToolPicked(inspect.mode);
      if (kept !== inspect.mode) {
        const closed = viewLabel(inspect.mode);
        inspect.setMode(kept);
        gameHud?.setSelectionNote(`${closed} closed so you can see the ground`);
      } else if (inspect.locked) {
        // Stesso motivo, un gradino piu' in basso: un isolato scelto **taglia**,
        // quindi il terreno attorno non c'e' piu' e si costruirebbe alla cieca.
        // Basta mollarlo, senza spegnere anche la vista: quella vela e si legge.
        inspect.unlockBlock();
        gameHud?.setSelectionNote('Block released so you can see the ground');
      }
      selectedTool = tool;
      preview.hide();
      influenceOverlay?.hideCursor();
    },
      onPolicy: (id) => {
        const result = growthScene?.togglePolicy(id);
        if (result !== undefined && !result.success) gameHud?.showFailure(result.reason);
      },
      onTrade: (mode) => {
        const result = growthScene?.setTradeMode(mode);
        if (result !== undefined && !result.success) gameHud?.showFailure(result.reason);
      },
      onDecision: (optionId) => {
        const result = growthScene?.chooseDecision(optionId);
        if (result !== undefined && !result.success) gameHud?.showFailure(result.reason);
      },
    onPause: (paused) => growthScene?.setPaused(paused),
    onSpeed: (speed) => growthScene?.setSpeed(speed),
    onDaylight: (mode) => daylight.setMode(mode),
    onClouds: (on) => setClouds(on),
    onTheme: (id) => {
      const index = THEMES.findIndex((candidate) => candidate.id === id);
      if (index >= 0) daylight.cycleTheme(index);
    },
    // Una scheda nuova, non questa: il campionario e' una scena diversa e
    // rigenerarla qui vorrebbe dire buttare la partita, che non ha salvataggio.
    // Cosi' la citta' resta viva sotto, e si torna chiudendo la scheda.
    onSwatch: () => {
      window.open(swatchUrl(daylight.theme.id, daylight.hour), '_blank', 'noopener');
    },
    onView: (mode) => inspect.setMode(mode),
    onLevel: (z) => inspect.setSliceZ(z),
    onCancelTool: () => {
      selectedTool = { kind: 'none' };
      preview.hide();
      influenceOverlay?.hideCursor();
      gameHud?.updateCursor(0, 0, null);
    },
    onReleaseBlock: () => inspect.unlockBlock(),
    onClearSelection: () => clearSelection(),
  }, THEMES.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    swatches: [
      candidate.atmosphere.background,
      candidate.colors[5] ?? candidate.atmosphere.fog.color,
      candidate.colors[12] ?? candidate.atmosphere.fog.color,
    ],
    // La derivazione sta qui e non nell'HUD per la stessa ragione delle
    // pastiglie qui sopra: legge l'atmosfera, e l'HUD non conosce l'engine.
    tokens: hudTokens(candidate),
  })), daylight.theme.id);
  // Il bottone nasce sul ciclo: se l'URL ha chiesto altro, va detto subito o la
  // prima cosa che il giocatore legge e' falsa. Lo stesso per le nuvole, che di
  // partenza sono spente mentre la barra le dipinge accese.
  gameHud.setDaylight(daylight.mode);
  gameHud.setClouds(cloudsOn);
}

const picker = new Raycaster();
const pointer = new Vector2();
const preview = new PlacementCursor();
scene.add(preview.group);

const influenceOverlay = terrain !== null && growEnabled ? new InfluenceOverlay(terrain.map) : null;
if (influenceOverlay !== null) scene.add(influenceOverlay.group);

/**
 * I mezzi che si muovono: barche, navi, aerei, dirigibili.
 *
 * Vive accanto agli altri overlay dell'engine e per la stessa ragione — cio' che
 * si muove non e' materia. Scrivere una barca nel `VoxelWorld` e riscriverla al
 * frame dopo marcherebbe sporchi i chunk della costa sessanta volte al secondo,
 * cioe' rimeshare mezza isola per farla navigare.
 *
 * Riceve gli uniform del materiale del voxel e non una copia: e' cosi' che una
 * nave vede lo stesso sole, la stessa ombra e la stessa nebbia della costa dietro
 * di lei, e che `applyAtmosphere` resta una scrittura sola invece di due elenchi
 * da tenere allineati.
 */
const trafficView = terrain !== null && growEnabled
  ? new TrafficView(paletteHandle.material.uniforms)
  : null;
if (trafficView !== null) scene.add(trafficView.group);
/** Ultima volta che i colori dei mezzi sono stati riscritti con l'ora corrente. */
let trafficLitAt = 0;

/**
 * Le funi delle funivie.
 *
 * Accanto ai mezzi e per la ragione gemella: quelli non sono materia perche' si
 * muovono, questa perche' e' spessa un terzo di voxel. Vive anche lei fuori dal
 * volume, e nessun chunk se ne accorge.
 */
const ropewayView = terrain !== null && growEnabled ? new RopewayView() : null;
if (ropewayView !== null) scene.add(ropewayView.group);

/**
 * La comparsa della prima isola: i pezzi scendono dal cielo, con una pioggia di
 * cubetti davanti a loro.
 *
 * A cadere e' il **chunk** e non il voxel — a valle del greedy mesher il cubo
 * singolo non esiste piu' — quindi la caduta vive dentro `ChunkRenderer`, che le
 * mesh le possiede gia'. I cubetti sono invece cubetti veri, sopra la scena come
 * i mezzi: nel volume voxel non entra niente di tutto questo.
 */
const dropRainView = new DropRainView();
scene.add(dropRainView.group);
const dropRain = createRain();
/** Vero finche' la comparsa d'ingresso ha ancora qualcosa da animare. */
let introActive = introEnabled;

/**
 * Dove si posa un cubetto e di che colore e'.
 *
 * La `TerrainMap` adotta un blocco appena arriva dal worker, quindi la colonna e'
 * interrogabile prima ancora che i suoi voxel siano scritti; la tinta la da'
 * invece il voxel vero, cosi' un cubetto che cade sulla roccia non e' verde.
 * `heights` e `waterTop` sono estremi **esclusivi**: la superficie e' il voxel
 * sotto, e un lago o il mare la portano piu' in alto del terreno.
 */
function rainProbe(x: number, y: number): RainColumn | null {
  if (terrain === null) return null;
  const column = terrain.map.columnAt(x, y);
  if (column === null) return null;

  const surfaceZ = Math.max(column.height, terrain.map.waterTopAt(x, y)) - 1;
  const palette = world.getBlock(x, y, surfaceZ);
  if (palette === 0) return null;
  return { z: surfaceZ, palette };
}

/**
 * Da quanto in alto partono i pezzi, in voxel.
 *
 * Non e' una costante: «dal cielo» vuol dire **da fuori schermo**, e quanto sia
 * lontano il bordo alto dipende da zoom e inclinazione. L'altezza visibile esce
 * dal frustum ortografico, che e' l'unico posto in cui quel numero esiste
 * davvero.
 */
function introFallHeight(): number {
  const view = camera.camera;
  return fallHeightFor((view.top - view.bottom) / view.zoom, camera.pitchDegrees);
}

/** Fissata all'apertura della finestra: durante il caricamento la camera sta ferma. */
let introFall = introFallHeight();

chunkRenderer.onChunkBorn = (cx, cy, cz, bornAt): void => {
  spawnOverChunk(dropRain, cx, cy, cz, bornAt, introFall, rainProbe);
};
// Una volta sola e non per frame: la comparsa dura qualche secondo, e in quel
// tratto il sole si sposta di un decimo di grado.
dropRainView.setLighting(daylight.theme.colors, withHour(daylight.theme.atmosphere, daylight.hour));
if (introActive) chunkRenderer.armDrop(performance.now() / 1000, introFall);

/**
 * Un frame della comparsa d'ingresso.
 *
 * `stepDrop` sta fra `update` e `cull`, per le ragioni scritte li'.
 *
 * **La finestra non si chiude su `generator.done`**, e questa e' la parte che si
 * sbaglia per prima: quando l'ultimo blocco e' scritto restano in coda centinaia
 * di chunk da meshare, e disarmando li' comparirebbero di colpo — cioe' proprio
 * il pop che la caduta esiste per togliere. Si chiude quando non c'e' piu' niente
 * da meshare, e l'effetto finisce quando anche l'ultimo pezzo e' atterrato e
 * l'ultimo cubetto e' sparito.
 */
function stepIntro(seconds: number): void {
  if (generator.done && chunkRenderer.isIdle) chunkRenderer.disarmDrop();
  const flying = chunkRenderer.stepDrop(seconds);
  advanceRain(dropRain, seconds);
  dropRainView.draw(dropRain.cubes);

  if (!chunkRenderer.dropIsArmed && !flying && dropRain.cubes.length === 0) {
    introActive = false;
    dropRainView.hide();
  }
}

/**
 * Le linee che dicono dove e' puntata la vista.
 *
 * Non dipendono da `growEnabled`: le viste sono dell'harness prima ancora che
 * del gioco, e in `?scene=noise` restano l'unico modo di leggere un taglio.
 */
const inspectGuides = terrain !== null ? new InspectGuides(terrain.map, terrainRegion) : null;
if (inspectGuides !== null) scene.add(inspectGuides.group);

/**
 * Il contorno di cio' che il giocatore ha scelto.
 *
 * Separato dalle guide di ispezione perche' risponde a un'altra domanda — «cosa
 * ho scelto» invece di «dov'e' puntata la lente» — e le due possono essere accese
 * insieme su due cose diverse.
 */
const selectionOutline = terrain !== null && growEnabled ? new SelectionOutline(terrain.map) : null;
if (selectionOutline !== null) scene.add(selectionOutline.group);

/**
 * La rete stradale vista dall'harness.
 *
 * E' una funzione pura del seed — niente stato, niente da salvare — quindi
 * costruirne una qui non duplica quella del `Builder`: entrambe rispondono le
 * stesse cose perche' partono dallo stesso numero. Serve alla sezione, che deve
 * cadere su una carreggiata, e all'isolamento dell'isolato.
 */
const streets = terrain === null ? null : new StreetNetwork(terrainSeed);

/**
 * Le viste di ispezione: raggi X, sezione, fetta e isolato.
 *
 * Nasce dopo la rete stradale perche' la sezione deve cadere su una carreggiata.
 * Il registro e la mappa arrivano come funzioni e non come riferimenti: la scena
 * di crescita non esiste ancora, e quando esistera' sara' un altro oggetto.
 */
const inspect = createInspectView({
  world,
  camera,
  paletteHandle,
  guides: inspectGuides,
  streets,
  map: () => terrain?.map ?? null,
  registry: () => growthScene?.registry,
  pointedCellAt: (clientX, clientY) => pointedCellAt(clientX, clientY),
  toolActive: () => selectedTool.kind !== 'none',
  mode: initialInspectMode,
  sliceZ: initialSliceZ,
  sliceFromUrl: sliceZFromUrl,
  onStudy: (key) => {
    gameHud?.showTransientFeedback(`Studying block ${key} · drag to turn around it`);
  },
});

if (terrain !== null) {
  renderer.domElement.addEventListener('pointermove', (event: PointerEvent) => {
    inspect.onPointerMove(event.clientX, event.clientY);
  });
  renderer.domElement.addEventListener('pointerleave', () => inspect.onPointerLeave());
  renderer.domElement.addEventListener('pointerdown', (event) => inspect.onPointerDown(event));
  renderer.domElement.addEventListener('pointerup', (event) => inspect.onPointerUp(event));
}

if (growEnabled) {
  renderer.domElement.addEventListener('pointermove', onGamePointerMove, { capture: true });
  renderer.domElement.addEventListener('pointerdown', onGamePointerDown, { capture: true });
  renderer.domElement.addEventListener('pointerleave', () => {
    preview.hide();
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(0, 0, null);
  });
}

/**
 * La scheda di cio' che il giocatore ha scelto, e il gesto che la apre.
 *
 * Il click si risolve su `pointerup` e non su `pointerdown`, con una soglia in
 * pixel: `isPanButton` accetta anche il tasto sinistro e `camera.attach` e' il
 * primo listener registrato, quindi ogni click **e' gia'** l'inizio di un pan, e
 * fino al rilascio non si sa se il gesto fosse un clic o una rotazione. E' lo
 * stesso motivo — e lo stesso numero — del clic che sceglie un isolato in Block
 * focus.
 */
const SELECT_CLICK_SLOP = 6;

const selectionPanel = growEnabled
  ? new SelectionPanel(container, {
    onSection: (section) => paintSelectionOutline(section),
    onAction: (action) => runSelectionAction(action),
    onClose: () => clearSelection(),
  })
  : null;

/** La cella scelta, non la selezione risolta: quest'ultima invecchia a ogni tick. */
let selectedCell: SurfaceCell | null = null;
let selectPointerDown = false;
let selectPointerX = 0;
let selectPointerY = 0;

if (selectionPanel !== null && terrain !== null) {
  renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
    selectPointerDown = event.button === 0;
    selectPointerX = event.clientX;
    selectPointerY = event.clientY;
  });
  renderer.domElement.addEventListener('pointerup', onSelectPointerUp);
}

if (swatchOverlay !== null) {
  renderer.domElement.addEventListener('pointermove', (event: PointerEvent) => {
    swatchCell = swatchCellUnder(event.clientX, event.clientY);
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    swatchCell = null;
  });
}

window.addEventListener('keydown', onUiKey);

if (debugEnabled) {
  // Hook per misure da console o da strumenti headless: stessa fonte dell'overlay.
  const debugGlobals = globalThis as Record<string, unknown>;
  debugGlobals['__voxelStats'] = (): Record<string, unknown> => {
    const timing = frameTiming.snapshot();
    const stats = chunkRenderer.stats;
    const mesher = chunkRenderer.mesherPool.stats;
    return {
      fps: timing.fps,
      fpsLow: timing.fpsLow,
      frameP95Ms: timing.p95Ms,
      frameP99Ms: timing.p99Ms,
      jankRatio: timing.jankRatio,
      mainMsMax,
      ...effectStats(),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometryBytes: stats.geometryBytes,
      chunksAllocated: stats.chunksAllocated,
      chunksWithMesh: stats.chunksWithMesh,
      chunksVisible: stats.chunksVisible,
      chunksFalling: stats.chunksFalling,
      queued: stats.queued,
      inFlight: stats.inFlight,
      solidVoxels: world.solidVoxelCount,
      mesherAvgMs: mesher.avgMs,
      mesherMaxMs: mesher.maxMs,
      generationDone: generator.done,
      theme: daylight.theme.id,
      quality: renderQuality.mode,
      pixelRatio: renderer.getPixelRatio(),
    };
  };
  debugGlobals['__voxelReset'] = (): void => {
    mainMsMax = 0;
    frameTiming.reset();
    chunkRenderer.mesherPool.resetStats();
  };
  debugGlobals['__voxelExpand'] = (): void => expandWorld();
  // Rimanda in cielo quello che c'e' gia': i numeri di `introDrop` e `dropRain`
  // si tarano guardandoli, e ricaricare la pagina rigenererebbe anche l'isola.
  debugGlobals['__voxelDrop'] = (): Record<string, unknown> => {
    clearRain(dropRain);
    // Rileggendo l'inquadratura: se nel frattempo si e' zoomato, la quota di
    // partenza che era fuori schermo non lo sarebbe piu'.
    introFall = introFallHeight();
    chunkRenderer.replayDrop(performance.now() / 1000, introFall);
    introActive = true;
    return { fall: introFall, chunks: chunkRenderer.stats.chunksFalling };
  };
  debugGlobals['__voxelRebuildAll'] = (): void => world.markAllDirty();
  debugGlobals['__voxelTheme'] = (id?: string): Record<string, unknown> => {
    if (id !== undefined) {
      const found = THEMES.findIndex((candidate) => candidate.id === id);
      if (found < 0) console.warn(`[theme] unknown id: ${id}`);
      else daylight.cycleTheme(found);
    }
    const current = daylight.theme;
    return { id: current.id, name: current.name, available: THEMES.map((t) => t.id) };
  };
  // Sposta il sole senza ricaricare: serve ad autorare i temi guardando il
  // risultato invece che immaginandolo. Non persiste, il tema resta la fonte.
  debugGlobals['__voxelSun'] = (azimuth?: number, elevation?: number): Record<string, unknown> => {
    const atmosphere = daylight.theme.atmosphere;
    const sun = atmosphere.sun;
    const next = {
      ...sun,
      azimuth: azimuth ?? sun.azimuth,
      elevation: elevation ?? sun.elevation,
    };
    paletteHandle.setAtmosphere({ ...atmosphere, sun: next });
    return {
      azimuth: next.azimuth,
      elevation: next.elevation,
      faceLuminance: faceLuminance({ ...atmosphere, sun: next }),
      // Dove il cielo disegna il sole: xy in NDC, `facing` false se sta dietro
      // la camera e quindi resta solo l'alone.
      screen: { x: sunView.x * 1.35, y: sunView.y * 1.35, facing: sunView.z < 0 },
    };
  };
  // L'orologio. Convive con `__voxelSun`, che resta l'override manuale per
  // autorare un tema: quello scrive una posizione e basta, questo la ricava
  // dall'ora e continua a ricavarla finche' il ciclo cammina.
  debugGlobals['__voxelHour'] = (next?: number | string): Record<string, unknown> => {
    // Un numero e' un'ora, una stringa e' un modo: sono la stessa manopola vista
    // da due lati, e due hook separati vorrebbero dire ricordarsi quale chiama
    // quale mentre si guarda una notte che non passa.
    if (typeof next === 'number') daylight.setHour(next);
    else if (typeof next === 'string') daylight.setMode(resolveDaylightMode(next));
    const hour = daylight.hour;
    const atmosphere = withHour(daylight.theme.atmosphere, hour);
    return {
      hour,
      mode: daylight.mode,
      pinned: daylight.pinned,
      day: dayPhase(hour, daylight.theme.atmosphere.sun.elevation),
      azimuth: atmosphere.sun.azimuth,
      elevation: atmosphere.sun.elevation,
      sunIntensity: atmosphere.sun.intensity,
      emissiveStrength: atmosphere.emissiveStrength,
      dayLengthSeconds: DAYLIGHT.daySeconds,
    };
  };
  // Stessa fonte del pannello: due letture separate divergerebbero al primo
  // refactor, ed e' la regola dell'harness.
  debugGlobals['__voxelInspect'] = (mode?: string, z?: number): Record<string, unknown> => {
    if (mode !== undefined) inspect.setMode(parseInspectMode(mode));
    if (z !== undefined) inspect.setSliceZ(z);
    const frame = buildInspectFrame();
    return {
      ...frame,
      mode: INSPECT_NAMES[frame.mode],
      available: INSPECT_MODES.map((candidate) => INSPECT_NAMES[candidate]),
    };
  };

  if (swatchOverlay !== null) {
    // Con `x` e `y` interroga una colonna qualsiasi del campionario senza
    // muovere il mouse: e' cosi' che uno strumento headless verifica che una
    // combinazione ci sia. Senza argomenti riporta cio' che il cursore indica.
    debugGlobals['__voxelSwatch'] = (x?: number, y?: number): Record<string, unknown> => {
      const cell = x === undefined || y === undefined
        ? buildSwatchFrame().cell
        : swatchCellAt(x, y);
      return { extent: swatchExtent(), cell, detail: detailOf(cell) };
    };
  }

  if (terrain !== null) {
    debugGlobals['__terrainStats'] = (): Record<string, unknown> => ({
      seed: terrainSeed,
      size: TERRAIN_SIZE,
      workerMs: terrain.generationMs,
      applyMs: terrainApplyMs,
      blocksApplied: terrain.blocksApplied,
      blocksTotal: terrain.blocksTotal,
      columns: terrain.map.columnCount,
      buildableColumns: terrain.buildableColumns,
      biomeHistogram: Array.from(terrain.map.biomeHistogram()),
      biomeView: biomeView?.enabled ?? false,
      done: terrain.done,
    });
    debugGlobals['__terrainBiomeView'] = (): void => toggleBiomeView();

    if (simEnabled) {
      // Stessa fonte dell'overlay, per misurare la simulazione da console o da
      // uno strumento headless senza passare dai pulsanti.
      debugGlobals['__simStats'] = (): Record<string, unknown> => {
        if (simScene === null) return { ready: false };
        const state = simScene.simState;
        return {
          ready: true,
          tick: state.tickCount,
          auto: simScene.autoEnabled,
          tickMs: simScene.tickMs,
          population: state.population,
          food: state.food,
          materials: state.materials,
          funds: state.funds,
          satisfaction: state.satisfaction,
          buildingCounts: state.buildingCounts,
          mixedCounts: state.mixedCounts,
          // I produttori di cibo passano **sia** di qui sia dall'overlay, come
          // ogni metrica: leggono la stessa fonte, e una delle due che manca e'
          // il modo in cui una diagnosi diventa impossibile da riprodurre.
          farmCounts: state.farmCounts,
          harvest: state.harvest,
          commerce: state.commerce,
          catalysts: state.catalysts.length,
          policies: state.policies,
          selectedClass: CLASS_NAMES[state.selectedClass],
          fieldChunks: state.field.chunkCount,
          recomputedCells: state.field.totalRecomputedCells,
          dataCells: simScene.dataCells,
        };
      };
      debugGlobals['__simTick'] = (count = 1): number => {
        simScene?.step(Math.max(1, Math.floor(count)));
        return simScene?.simState.tickCount ?? 0;
      };
      debugGlobals['__simSites'] = (count = SIM_SITE_COUNT): readonly BuildSite[] =>
        simScene?.sitesAt(count) ?? [];
      debugGlobals['__simClass'] = (cls: number): void => {
        if (cls >= 0 && cls < CLASS_COUNT) simScene?.selectClass(cls as BuildingClass);
      };
      debugGlobals['__simPolicy'] = (id: string): void => {
        if (isPolicyId(id)) simScene?.togglePolicy(id);
      };
    }

    if (growEnabled) {
      debugGlobals['__growStats'] = (): Record<string, unknown> =>
        growthScene === null ? { ready: false } : { ...growthScene.stats };
    }

    // L'espansione qui e' solo una funzione chiamabile: nessun input di gioco la
    // attiva. Aggiunge la striscia a nord riusando seed e maschera dell'isola,
    // quindi la costa continua invece di ricominciare.
    debugGlobals['__terrainExpand'] = (): Record<string, unknown> => {
      const result = expandIsland(
        world,
        terrainSeed,
        { minX: 0, minY: TERRAIN_SIZE, sizeX: TERRAIN_SIZE, sizeY: CHUNK * 2 },
        { map: terrain.map },
      );
      return { blocks: result.blocks, voxels: result.voxelsWritten, ms: result.generationMs };
    };
  }
}

const frameTiming = new FrameTiming(600);
let mainMsMax = 0;
/** Vero finche' la scena si sta ancora popolando: vedi `observeQuality`. */
let generating = true;
/**
 * Vero finche' la **prima** scena non e' completa: e' la finestra in cui valgono
 * i budget di caricamento. Le espansioni che arrivano dopo non la riaprono —
 * quelle succedono dentro una citta' viva, che va tenuta a 3 ms.
 */
let firstScenePending = true;
let previousTime = performance.now();

renderer.setAnimationLoop(onFrame);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setViewport(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight, renderQuality.pixelRatio);
  syncResolution();
  skyBackground.setAspect(window.innerWidth / Math.max(1, window.innerHeight));
});

onPaletteChanged((hexColors) => {
  // `palette.json` appartiene al tema natural: gli altri hanno una palette propria.
  if (daylight.theme.id !== 'natural') return;
  paletteHandle.setPalette(hexColors);
  console.info('[palette] colors updated live, no mesh rebuild');
});

/**
 * Porta nelle uniform quanto la citta' e' viva: finestre accese e insegne.
 *
 * Alla cadenza dell'HUD e non per frame — l'occupazione cambia di un tick alla
 * volta, dieci volte al secondo, e le uniform non hanno niente da guadagnare a
 * essere riscritte sessanta. **Nessun voxel viene toccato**: riscrivere le
 * finestre accese significherebbe marcare sporchi i chunk della citta' a ogni
 * tick, cioe' rimeshare tutto per accendere una luce.
 */
function updateVitality(time: number): void {
  if (growthScene === null || time - vitalityAt < VITALITY_REFRESH_MS) return;
  vitalityAt = time;
  const vitality = cityVitality(growthScene.stats.state);
  paletteHandle.setVitality(vitality.homes, vitality.commerce);
}

/**
 * Porta a schermo i mezzi in movimento.
 *
 * **Pose, fumo e scia a ogni frame, i colori alla cadenza dell'HUD.** Sono due
 * costi diversi: una posa e' una matrice per mezzo — decine in tutta la partita —
 * mentre pennacchio e schiuma sono qualche centinaio di vertici in due mesh sole.
 * I colori dipendono dall'ora, che si muove di un centesimo alla volta, e non
 * hanno niente da guadagnare a essere riscritti sessanta volte al secondo; da
 * quando le sagome prendono la tinta dagli uniform condivisi, quel ricolore
 * riguarda il solo fumo, che porta un'alfa per sbuffo.
 *
 * L'orologio e' quello della scena e non quello del frame: in pausa le barche si
 * fermano, e a 4x attraversano quattro volte piu' in fretta.
 */
function updateTraffic(time: number): void {
  if (trafficView === null) return;
  if (growthScene === null) {
    trafficView.hide();
    ropewayView?.hide();
    return;
  }
  trafficView.setPoses(growthScene.trafficPoses());
  trafficView.setPuffs(growthScene.trafficPuffs());
  trafficView.setWake(growthScene.trafficWake());
  // Le funi non si muovono: `setLines` confronta un riferimento e torna subito
  // finche' nessuno ne tira una nuova.
  ropewayView?.setLines(growthScene.ropewayCables());
  if (time - trafficLitAt < VITALITY_REFRESH_MS) return;
  trafficLitAt = time;
  const atmosphere = withHour(daylight.theme.atmosphere, daylight.hour);
  trafficView.setLighting(daylight.theme.colors, atmosphere);
  ropewayView?.setLighting(daylight.theme.colors, atmosphere);
}

/**
 * Pass d'ombra: profondita' dei chunk vista dal sole.
 *
 * Sta dentro `renderStart` e non nel lavoro non-render, perche' e' spesa sulla
 * GPU e non sul main thread: il budget di 3 ms non la riguarda, la si legge in
 * `renderMs`. Un tema senza `shadow` la salta del tutto.
 */
function drawShadowPass(): void {
  const settings = daylight.theme.atmosphere.shadow;
  // Di notte la forza scende a zero e la pass si salta del tutto: un sole sotto
  // l'orizzonte non proietta niente, e disegnarla comunque sarebbe una mappa di
  // profondita' buttata via a ogni frame.
  const strength = daylight.shadowStrength;
  // Un taglio ha appena tolto di mezzo dei volumi, ma la shadow map non lo sa:
  // il piano appena scoperto resterebbe all'ombra dei piani che si sono
  // nascosti, ed e' proprio la lettura che la fetta esiste per dare. Sole e
  // ambiente restano, quindi le facce continuano a distinguersi.
  if (
    settings === undefined ||
    strength <= 0 ||
    !shadowsAllowedByUrl ||
    qualityProfile.shadowSize === 0 ||
    isCut(inspect.payload)
  ) {
    sunShadow.setEnabled(false);
    paletteHandle.setShadow({
      texture: null,
      matrix: sunShadow.matrix,
      strength: 0,
      texelSize: 1,
      normalBias: 0,
      softness: 0,
    });
    return;
  }

  sunShadow.setEnabled(true);
  const start = performance.now();
  sunShadow.fit(chunkRenderer.visibleBounds, sunWorld);
  sunShadow.begin(renderer);
  const drawn = chunkRenderer.renderShadow(renderer, sunShadow.camera, sunShadow.depthMaterial);
  sunShadow.end(renderer, performance.now() - start, drawn);

  paletteHandle.setShadow({
    texture: sunShadow.texture,
    matrix: sunShadow.matrix,
    strength,
    texelSize: 1 / sunShadow.stats.size,
    // Un texel e mezzo lungo la normale: sotto compare l'acne, sopra l'ombra
    // si stacca dalla base di cio' che la proietta.
    normalBias: sunShadow.worldTexelSize * 1.5,
    // Il profilo puo' portare la morbidezza a 0, e il campionamento degrada
    // a un solo tap invece di nove.
    softness: settings.softness * qualityProfile.shadowSoftness,
  });
}
function onFrame(time: number): void {
  frameTiming.sample(time, document.visibilityState === 'visible');
  const dt = Math.min(0.1, (time - previousTime) / 1000);
  previousTime = time;

  const workStart = performance.now();
  renderer.info.reset();

  camera.update(dt);
  preview.update(dt);

  // Finche' la prima scena non c'e', il frame non deve proteggere niente:
  // conviene spendere di piu' per frame e finire in una manciata di frame.
  const loading = firstScenePending;
  const frameBudget = loading ? LOADING_FRAME_BUDGET_MS : FRAME_BUDGET_MS;

  if (!generator.done) {
    const generationStart = performance.now();
    generator.step(loading ? LOADING_GENERATION_BUDGET_MS : GENERATION_BUDGET_MS);
    terrainApplyMs += performance.now() - generationStart;
  } else if (biomeView !== null && biomeView.busy) {
    // Il ricolore per bioma usa lo stesso budget della generazione, e solo
    // quando la generazione ha finito: non competono mai per lo stesso frame.
    biomeView.step(GENERATION_BUDGET_MS);
  }

  updateSim(dt);
  updateGrowth(dt);
  daylight.advance(dt);

  // La direzione di sguardo serve alla vista prima che alla nebbia: in
  // ortografica e' un vettore solo, e ce lo dividiamo.
  camera.camera.getWorldDirection(viewDirection);
  inspect.apply([viewDirection.x, viewDirection.y, viewDirection.z]);

  const elapsed = performance.now() - workStart;
  chunkRenderer.update(camera.camera, Math.max(0.5, frameBudget - elapsed));
  // Fra `update` e `cull`: un chunk nato adesso deve gia' scendere in questo
  // frame, e il culling deve leggere gli AABB appena spostati.
  if (introActive) stepIntro(time / 1000);
  chunkRenderer.cull(camera.camera);

  // La finestra di caricamento si chiude su `generator.done`, non su
  // `chunkRenderer.isIdle`: e' la generazione a tenere fermo il gioco, e le
  // ultime mesh possono benissimo salire con i budget di regime.
  if (loading && generator.done) firstScenePending = false;

  const mainMs = performance.now() - workStart;
  if (mainMs > mainMsMax) mainMsMax = mainMs;

  const renderStart = performance.now();
  drawShadowPass();
  paletteHandle.setTime(time / 1000);
  paletteHandle.setViewDirection(viewDirection.x, viewDirection.y, viewDirection.z);
  // Il sole in spazio vista da' la sua posizione a schermo. Con una camera
  // ortografica un punto all'infinito non si proietta, quindi si usa la
  // direzione: la componente xy dice dove sta, la z se e' davanti o dietro.
  sunView.copy(sunWorld).transformDirection(camera.camera.matrixWorldInverse);
  skyBackground.setSunScreen(sunView.x * 1.35, sunView.y * 1.35, sunView.z < 0);
  skyBackground.setTime(time / 1000);
  // Dalla NDC al mondo, per il solo strato di nuvole: il fondo e' un quad in
  // NDC e senza questa non saprebbe a che punto del piano corrisponde un pixel.
  // Due moltiplicazioni di matrici per frame, non per pixel.
  skyInvViewProj.multiplyMatrices(
    camera.camera.matrixWorld,
    camera.camera.projectionMatrixInverse,
  );
  skyBackground.setCamera(skyInvViewProj, viewDirection.x, viewDirection.y, viewDirection.z);
  post.render();
  const renderMs = performance.now() - renderStart;

  const frameMs = performance.now() - workStart;
  observeQuality(time);

  if (overlay !== null && overlay.needsPaint(time)) {
    overlay.update(buildOverlayFrame(mainMs, renderMs, frameMs), time);
  }
  if (terrainOverlay !== null && terrain !== null && terrainOverlay.needsPaint(time)) {
    terrainOverlay.update(buildTerrainFrame(terrain), time);
  }
  if (simOverlay !== null && simScene !== null && simOverlay.needsPaint(time)) {
    simOverlay.update(buildSimFrame(simScene), time);
  }
  if (growthOverlay !== null && growthOverlay.needsPaint(time)) {
    growthOverlay.update(growthScene?.stats ?? null, time);
  }
  if (swatchOverlay !== null && swatchOverlay.needsPaint(time)) {
    swatchOverlay.update(buildSwatchFrame(), time);
  }
  updateVitality(time);
  updateTraffic(time);
  if (inspectOverlay.needsPaint(time)) {
    // La citta' cresce in altezza, e con lei la quota utile della fetta.
    if (!world.bounds.empty) inspectOverlay.setSliceRange(world.bounds.maxZ);
    inspectOverlay.update(buildInspectFrame(), time);
  }
  if (gameHud !== null && growthScene !== null && gameHud.needsPaint(time)) {
    gameHud.update(growthScene.stats, time);
    // Nello stesso ritmo del resto dell'HUD, cioe' 150 ms: la vista e' gia'
    // scritta nelle uniform per il frame corrente, e il pannello non deve
    // ridisegnarsi sessanta volte al secondo per dirlo.
    gameHud.setView(viewMenuModel());
  }
  // Stessa cadenza, e per lo stesso motivo: cio' che la scheda racconta —
  // desiderabilita', quartiere, livello di un edificio promosso — cambia a dieci
  // tick al secondo, e l'unica parte che costa e' l'aggregato dell'isolato.
  if (selectionPanel !== null && selectionPanel.needsPaint(time)) refreshSelection(time);
}

/**
 * Gating di qualita', ma solo a regime.
 *
 * Il popolamento della scena non e' il regime: dura pochi secondi e salta dei
 * frame per costruzione, mentre risalire di un gradino costa dieci secondi
 * stabili. Misurato li', il controller scendeva quasi sempre entro i primi
 * quattro secondi e non risaliva piu' — e il primo gradino che si perde e' anche
 * il piu' visibile, perche' dimezza la shadow map. Quindi si misura solo a
 * generazione ferma, ripartendo da una finestra pulita.
 *
 * Per la stessa ragione la finestra riparte a ogni cambio applicato: la
 * decisione successiva deve misurare il profilo appena messo in opera, non
 * quello di prima. Senza, un cambio ne innescava un altro sugli stessi campioni.
 */
function observeQuality(time: number): void {
  if (!generator.done) {
    generating = true;
    return;
  }
  if (generating) {
    generating = false;
    frameTiming.reset();
    return;
  }

  const quality = renderQuality.observe(frameTiming.snapshot(), time);
  if (!quality.changed || quality.reason === 'initial') return;

  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight, quality.pixelRatio);
  applyQualityProfile(quality.profile);
  syncResolution();
  frameTiming.reset();
}

// --- Scena di simulazione ---------------------------------------------------

/**
 * Fa avanzare la simulazione, e la fa nascere al primo frame in cui puo'.
 *
 * Il passo automatico e' a cadenza fissa (`SIM_TICK_RATE` tick al secondo) e non
 * legata al frame rate: la simulazione e' deterministica, e legarla al `dt`
 * significherebbe farne dipendere l'esito dalla macchina che la guarda. Il debito
 * di tick lo tiene `SimScene`, come `GrowthScene` tiene il proprio.
 */
function updateSim(dt: number): void {
  if (!simEnabled || terrain === null) return;

  if (simScene === null) {
    // L'isola arriva a blocchi: i catalizzatori aspettano che sia completa.
    if (!generator.done) return;
    simScene = new SimScene(world, terrain.map, terrainRegion);
    console.info(`[sim] ${simScene.simState.catalysts.length} catalysts placed by script`);
    return;
  }

  simScene.advance(dt);
}

/** Traduce la scena in cio' che l'overlay disegna: e' cablaggio, e resta qui. */
function buildSimFrame(scene: SimScene): SimOverlayFrame {
  return {
    state: scene.simState,
    sites: scene.sites,
    region: terrainRegion,
    auto: scene.autoEnabled,
    tickRate: SIM_TICK_RATE,
    tickMs: scene.tickMs,
    dataCells: scene.dataCells,
    builder: null,
  };
}

/** Avanza esclusivamente la scena `grow=1`, dopo che l'isola e' completa. */
function updateGrowth(dt: number): void {
  if (!growEnabled || terrain === null) return;
  if (growthScene === null) {
    if (!generator.done) return;
    growthScene = new GrowthScene(world, terrain.map, terrainRegion, terrainSeed);
    influenceOverlay?.refreshCatalysts(
      growthScene.simState.catalysts,
      growthScene.simState.reach,
    );
    console.info('[growth] automatic scene ready');
    return;
  }
  // La TerrainMap arriva prima dei voxel: durante un'espansione la crescita
  // riparte solo quando il settore e' stato applicato per intero.
  if (!generator.done) return;
  if (expansionInFlight !== null) {
    growthScene.markSectorReady();
    expansionInFlight = null;
  }
  growthScene.advance(dt);
}

// --- Viste di ispezione -----------------------------------------------------

/**
 * Il giro delle viste da tastiera.
 *
 * Il toast e' qui e non in `setInspectMode` perche' e' l'unico percorso cieco:
 * chi sceglie dal picker ha il pannello aperto davanti che gli dice cosa ha
 * scelto, chi preme `V` no.
 */
function cycleInspectView(): void {
  inspect.setMode(cycleInspectMode(inspect.mode));
  announceInspectView();
}

/**
 * Il toast che dice cosa e' appena successo.
 *
 * Porta anche il **gesto**, non solo la descrizione: la vista si e' accesa da
 * tastiera, quindi il picker non e' aperto, e senza la riga che dice «punta un
 * edificio» il giocatore vede comparire un riquadro retinato e non ha modo di
 * collegarlo al proprio cursore. Era il percorso cieco della 4.13, ed era cieco
 * per meta'.
 */
function announceInspectView(): void {
  const model = viewMenuModel();
  const gesture = model.activeGesture === '' ? '' : ` · ${model.activeGesture}`;
  gameHud?.showTransientFeedback(`${model.activeLabel} · ${model.activeDescription}${gesture}`);
}

/** Il modello del picker delle viste: stessa fonte per il pannello e per il toast. */
function viewMenuModel(): ViewMenuModel {
  return buildViewMenuModel(inspect.mode, inspect.sliceZ, inspect.maxZ, inspect.locked);
}

function buildInspectFrame(): InspectOverlayFrame {
  return {
    mode: inspect.mode,
    sliceZ: inspect.sliceZ,
    focus: inspect.focus,
    block: inspect.blockKey,
    locked: inspect.locked,
    veil: inspect.payload.veil,
    shadowsOff: isCut(inspect.payload),
  };
}

function onGamePointerMove(event: PointerEvent): void {
  if (selectedTool.kind === 'none' || growthScene === null || terrain === null) {
    preview.hide();
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(0, 0, null);
    return;
  }
  const cell = surfaceCellAt(event.clientX, event.clientY);
  if (cell === null) {
    preview.hide();
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(event.clientX, event.clientY, {
      title: 'No surface',
      details: 'Move the cursor over the island.',
      valid: false,
      reason: 'No selectable column.',
    });
    return;
  }
  let valid = false;
  if (selectedTool.kind === 'catalyst') {
    const catalyst = catalystById(selectedTool.id ?? defaultCatalystOfClass(selectedTool.class));
    // Un ruolo che sa posarsi su un tetto va chiesto alla colonna dell'edificio
    // e non a quella del terreno dietro di lui: e' la stessa distinzione della
    // mensola, e per la stessa ragione — la heightmap attraversa una torre come
    // se fosse vetro e si ferma sulla terra dietro.
    const target = catalystTarget(event.clientX, event.clientY, catalyst.id, cell);
    const failure = growthScene.catalystFailure(target.x, target.y, catalyst.id);
    const radius = catalyst.radius;
    const site = growthScene.catalystSiteCost(target.x, target.y, catalyst.id);
    const cost = site === null ? catalyst.cost : site.cost;
    valid = failure === null;
    const coverage = influenceOverlay?.showCursor(
      target.x,
      target.y,
      radius,
      valid,
      growthScene.simState.reach,
    );
    preview.show(target.x, target.y, target.hitZ, valid);
    gameHud?.updateCursor(event.clientX, event.clientY, {
      title: catalyst.label,
      details: `${cost} funds${groundNote(site)} · ${reachNote(radius, coverage)} · mainly ${classLabel(catalyst.class)}`,
      favours: catalyst.favours.map(classLabel),
      penalises: catalyst.penalises.map(classLabel),
      typologies: typologiesForUses(catalyst.favours),
      unlocks: unlockLines(catalyst.id),
      valid,
      reason: failure !== null
        ? actionFailureLabel(failure)
        // Il piazzamento e' valido comunque: cio' che cambia e' cosa comparira'
        // e cosa costera' alla citta'. Dirlo qui e' il punto — dopo il click e'
        // troppo tardi, ed e' esattamente il difetto muto che questa fase chiude.
        : landmarkNote(growthScene.catalystSite(target.x, target.y, catalyst.id)),
    });
    return;
  } else if (selectedTool.kind === 'terrace') {
    // La colonna che conta e' quella dell'**edificio**, non quella del terreno
    // dietro di lui: una mensola si appende a un corpo, e chi la posa punta il
    // corpo. E' la stessa distinzione che le viste di ispezione hanno gia'
    // dovuto fare — la heightmap attraversa una torre come se fosse vetro.
    const pointed = pointedCellAt(event.clientX, event.clientY) ?? cell;
    const failure = growthScene.terraceFailure(pointed.x, pointed.y);
    valid = failure === null;
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(event.clientX, event.clientY, {
      title: 'Terrace',
      details: `${BALANCE.gameplay.terrace.cost} funds · a floor above the street`,
      valid,
      reason: failure === null
        ? 'This facade can carry a floor. The building stops growing once it does.'
        : actionFailureLabel(failure),
    });
    // **Il mirino va alla quota del puntatore, non a quella della colonna.** In
    // isometrica la z e' tutta verticale sullo schermo: disegnato a `z`, sotto
    // una torre di quaranta voxel finiva trecento pixel piu' in basso, in mezzo
    // agli edifici davanti, e sembrava puntare un altro isolato. Era il motivo
    // per cui una mensola si posava a tentativi.
    preview.show(pointed.x, pointed.y, pointed.hitZ, valid);
    return;
  } else if (selectedTool.kind === 'ropeway') {
    // La colonna del **terreno**, non quella dell'edificio: una funivia parte da
    // una riva, e la riva e' suolo. E' l'opposto della mensola, ed e' la ragione
    // per cui qui non si passa da `pointedCellAt`.
    const failure = growthScene.ropewayFailure(cell.x, cell.y);
    valid = failure === null;
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(event.clientX, event.clientY, {
      title: 'Ropeway',
      details: `${BALANCE.gameplay.ropeway.cost} funds · a crossing that takes no ground`,
      valid,
      reason: failure === null
        ? 'Two towers and a cable: the water below stops counting.'
        : actionFailureLabel(failure),
    });
    preview.show(cell.x, cell.y, cell.z, valid);
    return;
  } else {
    const sector = coastalSectorAt(cell.x, cell.y, terrainRegion, BALANCE.gameplay.expansion.size);
    const failure = generator.done
      ? growthScene.expansionFailure(sector.id)
      : 'terrain-loading';
    valid = failure === null;
    influenceOverlay?.hideCursor();
    gameHud?.updateCursor(event.clientX, event.clientY, {
      title: `Sector ${sector.id}`,
      details: `${BALANCE.gameplay.expansion.cost} funds · ${sector.region.sizeX}×${sector.region.sizeY} voxels`,
      valid,
      reason: failure === null ? 'New buildable land connected to the coast.' : actionFailureLabel(failure),
    });
  }
  preview.show(cell.x, cell.y, cell.z, valid);
}

function onGamePointerDown(event: PointerEvent): void {
  if (event.button !== 0 || selectedTool.kind === 'none') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (growthScene === null || terrain === null) return;
  const cell = surfaceCellAt(event.clientX, event.clientY);
  if (cell === null) {
    gameHud?.showPickingFailure();
    return;
  }

  if (selectedTool.kind === 'catalyst') {
    const role = selectedTool.id ?? defaultCatalystOfClass(selectedTool.class);
    const target = catalystTarget(event.clientX, event.clientY, role, cell);
    const result = growthScene.placeCatalyst(target.x, target.y, role);
    if (!result.success) gameHud?.showFailure(result.reason);
    else {
      gameHud?.clearFeedback();
      influenceOverlay?.refreshCatalysts(
        growthScene.simState.catalysts,
        growthScene.simState.reach,
      );
      selectedTool = { kind: 'none' };
      gameHud?.setTool(selectedTool);
      preview.hide();
      influenceOverlay?.hideCursor();
      gameHud?.updateCursor(0, 0, null);
    }
    return;
  }

  if (selectedTool.kind === 'terrace') {
    const pointed = pointedCellAt(event.clientX, event.clientY) ?? cell;
    const result = growthScene.placeTerrace(pointed.x, pointed.y);
    if (!result.success) {
      gameHud?.showFailure(result.reason);
      return;
    }
    gameHud?.clearFeedback();
    // Lo strumento resta in mano: una mensola sola non fa un piano di citta', e
    // chi ne vuole una fila la posa un edificio dopo l'altro. E' il contrario
    // del catalizzatore, che si piazza una volta e cambia un quartiere.
    preview.hide();
    gameHud?.updateCursor(0, 0, null);
    return;
  }

  if (selectedTool.kind === 'ropeway') {
    const result = growthScene.placeRopeway(cell.x, cell.y);
    if (!result.success) {
      gameHud?.showFailure(result.reason);
      return;
    }
    gameHud?.clearFeedback();
    // Lo strumento si posa dopo l'uso, come il catalizzatore e al contrario
    // della mensola: una funivia costa quanto una scelta di partita, e
    // lasciarla in mano vorrebbe dire tirarne una seconda per un click di
    // troppo.
    selectedTool = { kind: 'none' };
    gameHud?.setTool(selectedTool);
    preview.hide();
    gameHud?.updateCursor(0, 0, null);
    return;
  }

  if (!generator.done) {
    gameHud?.showFailure('terrain-loading');
    return;
  }
  const sector = coastalSectorAt(cell.x, cell.y, terrainRegion, BALANCE.gameplay.expansion.size);
  const paid = growthScene.buyExpansion(sector.id, sector.region);
  if (!paid.success) {
    gameHud?.showFailure(paid.reason);
    return;
  }
  beginCoastalExpansion(sector);
}

/**
 * Su quale colonna cade un catalizzatore: il terreno, o il tetto che si sta
 * puntando.
 *
 * **Un solo strumento, due strutture.** L'aeroporto e' l'unico ruolo che sa
 * posarsi in quota, e non ha un pulsante suo: puntare un grattacielo *e'* la
 * richiesta di uno scalo sul tetto, puntare il prato accanto quella di un campo
 * di volo. Chiedere la colonna giusta e' l'unica cosa che serve perche' la
 * distinzione funzioni, e la decide `src/world/` guardando cosa c'e' sotto.
 */
function catalystTarget(
  clientX: number,
  clientY: number,
  kind: CatalystId,
  fallback: SurfaceCell,
): SurfaceCell {
  if (growthScene === null || !growthScene.catalystUsesRooftop(kind)) return fallback;
  return pointedCellAt(clientX, clientY) ?? fallback;
}

/** Il raggio che parte dal pixel, in coordinate di mondo. */
function cursorRay(clientX: number, clientY: number): Ray3 {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  picker.setFromCamera(pointer, camera.camera);
  const origin = picker.ray.origin;
  const direction = picker.ray.direction;
  return {
    origin: [origin.x, origin.y, origin.z],
    direction: [direction.x, direction.y, direction.z],
  };
}

/**
 * Quale cella del campionario sta sotto il cursore.
 *
 * Non passa da `pickSurfaceCell`, che vuole una `TerrainMap` e qui non c'e'
 * terreno: il campionario e' piatto e la quota dei soggetti e' nota, quindi
 * basta l'intersezione del raggio con un piano. Puntare la cima di un provino o
 * il basamento accanto risponde percio' la stessa cosa, ed e' il comportamento
 * giusto — la domanda e' «quale casella», non «quale voxel».
 *
 * **Il piano sta a meta' provino, e la meta' e' quel che minimizza l'errore.**
 * In isometrica un voxel di quota si sposta a schermo quanto un voxel su
 * ciascun asse di terra: mettere il piano sul basamento sbaglierebbe di tutta
 * l'altezza puntando una guglia, metterlo sulla sommita' sbaglierebbe di
 * altrettanto puntando il vuoto fra due celle. A meta' l'errore e' meta'
 * altezza per parte, cioe' un terzo scarso di interasse, e si resta dentro la
 * casella indicata.
 */
function swatchCellUnder(clientX: number, clientY: number): SwatchCell | null {
  const ray = cursorRay(clientX, clientY);
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  if (dz >= -1e-8) return null;

  const t = (SWATCH.groundZ + CELL_HEIGHT / 2 - oz) / dz;
  if (t < 0) return null;
  return swatchCellAt(Math.floor(ox + dx * t), Math.floor(oy + dy * t));
}

/**
 * Su quale **terra** cade il cursore. E' la domanda di chi piazza qualcosa.
 *
 * Gli edifici non contano apposta: si costruisce sul suolo, e fermarsi su un
 * tetto darebbe una colonna dove non si puo' costruire niente.
 */
function surfaceCellAt(clientX: number, clientY: number): SurfaceCell | null {
  if (terrain === null) return null;
  return pickSurfaceCell(cursorRay(clientX, clientY), terrain.map);
}

/**
 * **Cosa** sta indicando il cursore, edifici compresi. E' la domanda di chi
 * guarda, ed e' un'altra.
 *
 * Le viste usavano la prima, e non poteva funzionare: la heightmap attraversa
 * una torre come se fosse vetro e si ferma sulla terra dietro, che a
 * quarantacinque gradi sta a tante colonne quanto la torre e' alta. Puntare un
 * grattacielo apriva quindi la lente su un altro isolato — ed era la meta' del
 * motivo per cui i raggi X sembravano velare a caso.
 */
function pointedCellAt(clientX: number, clientY: number): SurfaceCell | null {
  if (terrain === null) return null;
  const registry = growthScene?.registry;
  if (registry === undefined) return surfaceCellAt(clientX, clientY);
  return pickSolidCell(
    cursorRay(clientX, clientY),
    terrain.map,
    (x, y) => registry.topOf(x, y),
    // La citta' non ha un tetto noto come la heightmap: il suo estremo e' quello
    // che il mondo ha davvero raggiunto, piu' un voxel per non tagliare l'ultimo.
    world.bounds.empty ? TERRAIN.maxHeight + 1 : world.bounds.maxZ + 1,
  );
}

/**
 * Il clic che sceglie, e quello che non ha scelto niente.
 *
 * Le tre guardie sono quelle del clic di studio, e nessuna e' di troppo: il
 * tasto sinistro pana, uno strumento in mano sta piazzando — e il suo
 * `stopImmediatePropagation` non protegge questo listener, perche' sta su
 * `pointerdown` e gli eventi qui partono in ordine di registrazione — e un
 * trascinamento non e' un clic.
 */
function onSelectPointerUp(event: PointerEvent): void {
  if (!selectPointerDown || event.button !== 0) return;
  selectPointerDown = false;
  if (selectedTool.kind !== 'none') return;
  const moved = Math.abs(event.clientX - selectPointerX) + Math.abs(event.clientY - selectPointerY);
  if (moved > SELECT_CLICK_SLOP) return;

  // Su cio' che si vede, non sul terreno: cliccando una torre si sceglie la
  // torre, e non la terra che le sta dietro a tante colonne quanto e' alta.
  const cell = pointedCellAt(event.clientX, event.clientY);
  if (cell === null) {
    clearSelection();
    return;
  }
  selectedCell = cell;
  const picked = resolvePickedSelection();
  if (picked === null) {
    clearSelection();
    return;
  }
  selectionPanel?.show(picked, performance.now(), isolatedBlockKey());
  gameHud?.setSelectionOpen(true);
}

/**
 * Il gesto della scheda, tradotto in vista e camera.
 *
 * Sta qui e non nel pannello perche' e' il punto in cui i due strati si toccano:
 * la scheda sa cosa il giocatore ha scelto, la vista sa come si guarda, e nessuno
 * dei due importa l'altro.
 *
 * L'andata e' in due mosse e l'ordine non e' libero: `lockBlock` si rifiuta se il
 * modo non e' gia' Block focus, perche' agganciare un isolato che nessuna vista
 * sta ritagliando muoverebbe la camera senza che a schermo cambi niente.
 *
 * Il ritorno spegne la vista invece di mollare e basta. Mollare lascerebbe acceso
 * il velo che insegue il cursore — utile a chi era entrato dal picker per
 * scegliere un isolato, ma qui il giocatore non ha mai chiesto una vista: ha
 * chiesto *questo* isolato, e uscendone si aspetta la sua citta'. `setMode` molla
 * comunque, e restituisce l'inquadratura di partenza.
 */
function runSelectionAction(action: SelectionActionId): void {
  if (action === 'release-block') {
    inspect.setMode(INSPECT_MODE.off);
    return;
  }
  if (selectedCell === null) return;
  inspect.setMode(INSPECT_MODE.block);
  // La cella scelta e non la colonna sotto il cursore: si isola l'isolato che la
  // scheda sta descrivendo, e il mouse nel frattempo puo' essere ovunque — sul
  // bottone, per esempio, che sta sopra un'altra parte della citta'.
  inspect.lockBlock(selectedCell);
}

/** L'isolato che la vista sta studiando, se ce n'e' uno: la scheda ne fa un interruttore. */
function isolatedBlockKey(): string | null {
  return inspect.locked ? inspect.blockKey : null;
}

/** La pila sotto la cella scelta, oppure `null` se non c'e' piu' niente da dire. */
function resolvePickedSelection(): Selection | null {
  if (selectedCell === null || terrain === null || streets === null) return null;
  const registry = growthScene?.registry;
  const state = growthScene?.simState;
  if (registry === undefined || state === undefined) return null;
  return resolveSelection({
    cell: selectedCell,
    world,
    map: terrain.map,
    registry,
    streets,
    state,
    seed: terrainSeed,
  });
}

/**
 * Riscrive la scheda con i dati di adesso.
 *
 * Gira alla cadenza dell'HUD e non per frame: la citta' cambia a dieci tick al
 * secondo, e la sola parte che costa — l'aggregato dell'isolato — non ha ragione
 * di girare sessanta volte per dire lo stesso numero.
 */
function refreshSelection(now: number): void {
  const picked = resolvePickedSelection();
  if (picked === null) {
    clearSelection();
    return;
  }
  selectionPanel?.update(picked, now, isolatedBlockKey());
  if (selectionPanel !== null) paintSelectionOutline(selectionPanel.section);
}

function paintSelectionOutline(section: SelectionSectionId): void {
  const picked = resolvePickedSelection();
  if (picked === null) {
    selectionOutline?.hide();
    return;
  }
  const extent = extentOf(picked, section);
  selectionOutline?.show(extent);
}

function clearSelection(): void {
  selectedCell = null;
  selectionPanel?.close();
  selectionOutline?.hide();
  gameHud?.setSelectionOpen(false);
}

function beginCoastalExpansion(sector: CoastalSector): void {
  if (terrain === null || growthScene === null || islandShape === null) return;
  islandShape = shapeWithSector(islandShape, sector);
  generator = new TerrainStreamer(
    world,
    terrainSeed,
    sector.generationRegion,
    islandShape,
    terrain.map,
  );
  expansionInFlight = sector;
  influenceOverlay?.addSector(sector.region);
  growthScene.setMessage('Generating the new coastal sector…');
  selectedTool = { kind: 'none' };
  gameHud?.setTool(selectedTool);
  preview.hide();
  influenceOverlay?.hideCursor();
  gameHud?.updateCursor(0, 0, null);
}

function classLabel(cls: BuildingClass): string {
  return CLASS_LABELS[cls] ?? 'urban';
}

const GROUND_LABELS: Readonly<Record<GroundKind, string>> = {
  [GROUND.flat]: 'flat ground',
  [GROUND.sloped]: 'terraced slope',
  [GROUND.shore]: 'quay',
  [GROUND.rock]: 'rock',
  [GROUND.refused]: 'unworkable',
};

/**
 * Il perche' del sovrapprezzo, accanto al prezzo.
 *
 * Su terreno di listino non compare nulla: un `×1` accanto a ogni cartellino
 * insegnerebbe a ignorare la riga proprio dove invece cambia.
 */
function groundNote(site: SiteCost | null): string {
  if (site === null || site.ground === GROUND.flat) return '';
  if (site.ground === GROUND.refused) return ` · ${GROUND_LABELS[site.ground]}`;
  return ` · ${GROUND_LABELS[site.ground]} ×${site.weight}`;
}

/**
 * Cosa il raggio nominale non dice: quanto terreno tocca davvero **da qui**.
 *
 * Da quando la portata e' geodetica il raggio e' un budget di cammino, e due
 * siti a dieci celle di distanza possono coprire il doppio l'uno dell'altro
 * perche' uno guarda l'entroterra e l'altro il mare. Il conto delle celle da
 * solo non si legge — nessuno sa se tremila siano tante — ma due siti a
 * confronto si', ed e' esattamente cio' che il giocatore sta facendo mentre
 * muove il cursore. La percentuale in coda compare solo dove il sito e'
 * tagliato: dirla sempre la ridurrebbe a rumore di fondo.
 */
function reachNote(radius: number, coverage: ReachSummary | undefined): string {
  if (coverage === undefined) return `reach ${radius}`;
  const cells = `${coverage.cells.toLocaleString('en-US')} cells`;
  if (coverage.ratio >= 0.85) return `reach ${radius} · ${cells}`;
  return `reach ${radius} · ${cells} (${Math.round((1 - coverage.ratio) * 100)}% blocked)`;
}

/**
 * Cosa succedera' al riquadro del landmark, detto sul cursore.
 *
 * Sono tutte posizioni **valide**: il catalizzatore si piazza e il suo campo
 * funziona in ogni caso. La riga cambia solo cio' che il giocatore non potrebbe
 * dedurre — se il monumento comparira', e quante case costa.
 */
function landmarkNote(site: LandmarkSite): string {
  // **Il terreno per primo**, come nella regola che lo decide: dire quante case
  // porta via un riquadro che nessuna opera reggerebbe manderebbe a cercare una
  // sacca bassa dove il problema e' la parete. Ed e' il solo dei tre casi in cui
  // non compare nemmeno la piazzola — `canPaint` scarta le colonne in parete —
  // quindi la riga promette meno delle altre due, di proposito.
  if (site.refusal === 'no-footing') {
    return 'Valid position, but nothing can be built on this slope: the catalyst works, the landmark will not appear. Try flatter ground.';
  }
  if (site.refusal === 'structure-in-the-way') {
    return 'Valid position. Something built to last stands here: only the plaza will appear.';
  }
  if (site.refusal === 'block-too-tall') {
    return 'Valid position, but too tall to clear: only the plaza will appear. Try a lower pocket.';
  }
  if (site.clears === 0) return 'Valid position.';
  const what = site.clears === 1 ? 'building' : 'buildings';
  return `Valid position. Clears ${site.clears} ${what} to make room.`;
}

function actionFailureLabel(reason: ActionFailure): string {
  const labels: Readonly<Record<ActionFailure, string>> = {
    'terrain-loading': 'The terrain is still being generated.',
    'not-buildable': 'No earthwork holds here: cliff or deep water.',
    'needs-coast': 'This link has to reach the sea.',
    'needs-open-ground': 'Needs a wide, level clearing.',
    'too-close': 'Too close to a catalyst of the same class.',
    'insufficient-funds': 'Not enough funds.',
    // Senza un numero: tre azioni con tre soglie diverse passano di qui — il
    // settore, la mensola, le policy — e citare quella dell'espansione era
    // gia' sbagliato per le policy. La cifra esatta sta nel tooltip di ciascuna
    // azione, che la prende dal proprio listino.
    'population-required': 'The city needs more residents for this.',
    'already-active': 'This action is already active.',
    'already-unlocked': 'This sector is already unlocked.',
    'onboarding-order': 'Complete the current tutorial step first.',
    'policy-incompatible': 'This policy conflicts with one that is already active.',
    'decision-option-invalid': 'This decision option is no longer available.',
    // I tre della mensola dicono tre gesti diversi, ed e' il punto: cercare un
    // edificio, cercarne uno piu' alto, cercare un altro posto.
    'needs-building': 'Point at a building: a terrace hangs off a facade.',
    'building-too-short': 'This building is too low to carry a floor.',
    'no-room-aloft': 'No room for a terrace here.',
    // I tre della funivia dicono tre gesti diversi, come quelli della mensola:
    // andare sulla costa, cercare un braccio di mare, spostarsi lungo la stessa
    // riva. Il terzo e' quello che capita di piu' su un lungomare costruito.
    'needs-shore': 'Point at dry land: a ropeway starts on a shore.',
    'needs-crossing': 'Nothing to cross from here: find water between two shores.',
    'no-room-for-line': 'No room for the towers here. Try further along the shore.',
  };
  return labels[reason];
}

function buildTerrainFrame(streamer: TerrainStreamer): TerrainOverlayFrame {
  return {
    fps: frameTiming.snapshot().fps,
    generationMs: streamer.generationMs,
    applyMs: terrainApplyMs,
    blocksApplied: streamer.blocksApplied,
    blocksTotal: streamer.blocksTotal,
    columns: streamer.map.columnCount,
    buildableColumns: streamer.buildableColumns,
    histogram: Array.from(streamer.map.biomeHistogram()),
    biomeView: biomeView?.enabled ?? false,
    seed: terrainSeed,
    regionSize: TERRAIN_SIZE,
  };
}

function toggleBiomeView(): void {
  if (biomeView === null) return;
  biomeView.toggle();
}

/**
 * Metriche della pass d'ombra e del post-processing.
 *
 * Esiste per essere chiamata da entrambe le superfici di misura, overlay e
 * hook di console: una metrica si aggiunge qui una volta sola.
 */
function effectStats(): { shadowMs: number; shadowSize: number; effects: string } {
  const shadow = sunShadow.stats;
  const parts: string[] = [];
  if (shadow.enabled) parts.push('shadow');
  if (qualityProfile.bloom) parts.push('bloom');
  if (qualityProfile.tilt) parts.push('tilt');
  return {
    shadowMs: shadow.lastPassMs,
    shadowSize: shadow.enabled ? shadow.size : 0,
    effects: parts.length === 0 ? 'none' : parts.join('+'),
  };
}

function buildOverlayFrame(mainMs: number, renderMs: number, frameMs: number): OverlayFrame {
  const stats = chunkRenderer.stats;
  const mesher = chunkRenderer.mesherPool.stats;
  const timing = frameTiming.snapshot();

  return {
    fps: timing.fps,
    fpsLow: timing.fpsLow,
    frameP95Ms: timing.p95Ms,
    frameP99Ms: timing.p99Ms,
    jankRatio: timing.jankRatio,
    frameMs,
    mainMs,
    mainMsMax,
    renderMs,
    ...effectStats(),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometryBytes: stats.geometryBytes,
    chunksAllocated: stats.chunksAllocated,
    chunksNonEmpty: stats.chunksNonEmpty,
    chunksWithMesh: stats.chunksWithMesh,
    chunksVisible: stats.chunksVisible,
    chunksFalling: stats.chunksFalling,
    queued: stats.queued,
    inFlight: stats.inFlight,
    quads: stats.quads,
    detailQuads: stats.detailQuads,
    solidVoxels: world.solidVoxelCount,
    mesherLastMs: mesher.lastMs,
    mesherAvgMs: mesher.avgMs,
    mesherMaxMs: mesher.maxMs,
    mesherPoolSize: mesher.poolSize,
    generationProgress: generator.done ? 1 : generator.progress,
    scene: terrain === null ? sceneKind : 'terrain',
    seed: terrain === null ? seed : terrainSeed,
    theme: daylight.theme.name,
    hour: daylight.hour,
    // Fermo e' fermo, che sia il modo scelto dal giocatore o un `?hour=`: al
    // pannello serve sapere che l'orologio non cammina, non da quale delle due
    // strade e' arrivato. Il modo lo dice comunque, subito accanto.
    hourMode: daylight.mode,
    hourPinned: daylight.pinned || daylight.mode !== DAYLIGHT_MODE.cycle,
    quality: renderQuality.mode,
    pixelRatio: renderer.getPixelRatio(),
    zoom: camera.zoom,
    yawDegrees: camera.yawDegrees,
    pitchDegrees: camera.pitchDegrees,
  };
}

/** L'unica lettura del campionario: la consumano overlay e `__voxelSwatch()`. */
function buildSwatchFrame(): SwatchOverlayFrame {
  return { cell: swatchCell, detail: detailOf(swatchCell) };
}

/**
 * Prismi di dettaglio della cella indicata, o null fuori dalla matrice.
 *
 * Solo la matrice: stratigrafia e fascia di scala non sono provini della stessa
 * sagoma, e un conteggio li' risponderebbe a una domanda che nessuno ha fatto.
 * `cellDetail` memoizza, quindi ripassare sulla stessa cella non rimisura.
 */
function detailOf(cell: SwatchCell | null): SwatchDetail | null {
  if (cell === null || cell.band !== SWATCH_BAND.matrix) return null;
  return cellDetail(cell.row, cell.col);
}

function onDebugKey(event: KeyboardEvent): void {
  if (simEnabled && simScene !== null) {
    if (event.code === 'KeyT') {
      simScene.step(1);
      return;
    }
    if (event.code === 'KeyP') {
      simScene.toggleAuto();
      return;
    }
    if (event.code === 'KeyM') {
      const next = (simScene.simState.selectedClass + 1) % CLASS_COUNT;
      simScene.selectClass(next as BuildingClass);
      return;
    }
  }
  if (event.code === 'KeyH') {
    // Un'ora avanti, indietro con Shift. Scorrere l'orologio a mano e' l'unico
    // modo di giudicare un look notturno senza aspettare dodici minuti.
    daylight.setHour(daylight.hour + (event.shiftKey ? -1 : 1));
    console.info(`[daylight] ${daylight.hour.toFixed(2)}h`);
    return;
  }
  if (event.code === 'KeyB') {
    toggleBiomeView();
    return;
  }
  if (event.code === 'KeyG') {
    expandWorld();
    return;
  }
  if (event.code === 'KeyR') {
    // Stress di rebuild: tutti i chunk tornano sporchi e ripassano dai worker.
    world.markAllDirty();
    return;
  }
  if (event.code === 'KeyC') {
    // Azzera i picchi: serve per misurare il regime, non lo startup.
    mainMsMax = 0;
    frameTiming.reset();
    chunkRenderer.mesherPool.resetStats();
  }
}

function onUiKey(event: KeyboardEvent): void {
  if (event.code === 'F3') {
    event.preventDefault();
    setDebugVisible(!debugVisible);
    return;
  }
  if (event.code === 'Escape' && gameHud?.handleEscape()) {
    event.preventDefault();
    return;
  }
  // La barra dei livelli e' un `<input type=range>`: con il fuoco sopra, il
  // browser muove gia' lui il cursore su PageUp e sulle frecce. Senza questa
  // guardia la quota si sposterebbe due volte per tasto.
  if (event.target instanceof HTMLInputElement) return;
  // Le viste non sono tecniche: stanno **prima** del gate del debug, come `F3` e
  // `Escape`. Guardare dentro la propria citta' e' parte del gioco, e chiuderlo
  // dietro `?debug=1` era il vincolo sbagliato della 4.11.
  if (event.code === 'KeyV') {
    cycleInspectView();
    return;
  }
  // Il ciclo del giorno sta **fuori** dal gate del debug per lo stesso motivo di
  // `V`: scegliere se guardare la propria citta' di giorno o di notte e' gioco,
  // non misura. `H` resta la manopola fine dell'harness, di un'ora alla volta.
  if (event.code === 'KeyL') {
    daylight.setMode(nextDaylightMode(daylight.mode));
    return;
  }
  // E per la stessa ragione le nuvole: un banco davanti alla torre che si sta
  // guardando si toglie, non si sopporta.
  if (event.code === 'KeyC') {
    setClouds(!cloudsOn);
    return;
  }
  // Tasti 1..9: gli **strumenti** del dock; con Shift, i temi.
  //
  // Le cifre nude stavano sui temi, e stavano fuori dal gate del debug con una
  // buona ragione: il tema si sceglie da un bottone del dock, che e' aperto a
  // chiunque, e la scorciatoia per la stessa cosa non poteva restare chiusa
  // dietro `?debug=1`. Quella ragione e' esattamente cio' che ora le sposta —
  // il dock e' la prima superficie che un giocatore nuovo guarda per sapere
  // cosa puo' costruire, e la fila di cifre nude appartiene a **quella**
  // domanda. Il tema, che si cambia una volta ogni tanto, sta bene su Shift.
  //
  // Nel campionario resta com'era: li' non c'e' dock, e cambiare tema **e'** lo
  // strumento — e' cosi' che si riconosce uno slot morto.
  if (event.code.startsWith('Digit')) {
    const index = parseInt(event.code.slice(5), 10) - 1;
    if (index >= 0) {
      if (event.shiftKey || sceneKind === 'swatch') {
        daylight.cycleTheme(index);
        return;
      }
      // Solo se quel posto esiste ed e' disponibile: un `7` che non seleziona
      // niente deve poter cadere su chi viene dopo, invece di essere ingoiato.
      if (gameHud?.selectToolByIndex(index) === true) return;
    }
  }
  // La quota: un voxel per volta, un piano intero con Shift. La barra serve a
  // cercarla, questi tasti a rifinirla. `PageUp`/`PageDown` sono l'alias che
  // tutti provano per primo — e su tastiera italiana le parentesi quadre
  // stanno sotto `è` e `+`, dove nessuno le cerca.
  if (event.code === 'BracketLeft' || event.code === 'PageDown'
    || event.code === 'BracketRight' || event.code === 'PageUp') {
    // La quota esiste solo in Levels. Fuori di li' il tasto non muoveva niente
    // di visibile — e intanto **armava** la quota, cosi' che la fetta aperta
    // dopo partisse da un numero assoluto invece che dal suolo davanti. Adesso
    // apre la vista e basta: il primo colpo mostra il piano, il secondo lo
    // muove, e si parte sempre da dove si sta guardando.
    if (!modeHasLevel(inspect.mode)) {
      inspect.setMode(INSPECT_MODE.slice);
      announceInspectView();
      return;
    }
    const up = event.code === 'BracketRight' || event.code === 'PageUp';
    const step = event.shiftKey ? INSPECT.sliceCoarse : INSPECT.sliceStep;
    inspect.setSliceZ(inspect.sliceZ + (up ? step : -step));
    return;
  }
  if (debugVisible) onDebugKey(event);
}

function setDebugVisible(visible: boolean): void {
  debugVisible = visible;
  overlay.setVisible(visible);
  terrainOverlay?.setVisible(visible);
  simOverlay?.setVisible(visible);
  growthOverlay?.setVisible(visible);
  // `swatchOverlay` non e' in questa lista: e' la legenda del campionario e non
  // una metrica, quindi `F3` non la spegne. Per uno scatto pulito si chiude il
  // `<details>`, che e' il gesto giusto per un pannello che nomina cose.
  inspectOverlay.setVisible(visible);
}

/**
 * Aggiunge esattamente 64 chunk oltre il bordo nord del mondo e ne genera il
 * contenuto. I chunk esistenti non vengono toccati: la mappa sparsa cresce e le
 * loro geometrie restano quelle di prima.
 */
function expandWorld(): void {
  // La scena di terreno ha la sua espansione, che passa da `expandIsland` e non
  // dalla griglia urbana: qui `G` non deve fare nulla.
  if (terrain !== null) return;

  const b = world.bounds;
  if (b.empty) return;

  const columns = b.maxCx - b.minCx + 1;
  const layers = b.maxCz - b.minCz + 1;
  const rows = Math.max(1, Math.ceil(64 / (columns * layers)));

  const cyStart = b.maxCy + 1;
  let added = 0;
  for (let row = 0; row < rows; row++) {
    for (let cz = b.minCz; cz <= b.maxCz; cz++) {
      for (let cx = b.minCx; cx <= b.maxCx; cx++) {
        world.ensureChunk(cx, cyStart + row, cz);
        added++;
      }
    }
  }

  // La griglia urbana della striscia riparte dal proprio angolo: la cucitura con
  // la citta' esistente non e' allineata, ma qui interessa la crescita a runtime.
  generator = createScene(world, {
    kind: sceneKind,
    seed: seed + cyStart,
    originX: b.minCx * CHUNK,
    originY: cyStart * CHUNK,
    sizeX: columns * CHUNK,
    sizeY: rows * CHUNK,
    sizeZ: layers * CHUNK,
  });

  console.info(`[harness] added ${added} chunks, ${world.chunkCount} now allocated`);
}

function parseSceneKind(value: string | null): SceneKind {
  if (value === 'noise' || value === 'slab' || value === 'city' || value === 'diorama') return value;
  if (value === 'swatch') return value;
  return 'city';
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null) return fallback;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
