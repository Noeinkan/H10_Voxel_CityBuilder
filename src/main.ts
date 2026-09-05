import { Matrix4, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from 'three';
import { createAtmosphereControl } from './engine/AtmosphereControl';
import { ChunkRenderer } from './engine/ChunkRenderer';
import { InfluenceOverlay } from './engine/InfluenceOverlay';
import { InfoViewOverlay } from './engine/InfoViewOverlay';
import { InspectGuides } from './engine/InspectGuides';
import { TrafficView } from './engine/TrafficView';
import { RopewayView } from './engine/RopewayView';
import { FrameTiming } from './engine/FrameTiming';
import {
  INSPECT,
  INSPECT_MODE,
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
  modeHour,
  nextDaylightMode,
  normaliseHour,
  resolveDaylightMode,
  withHour,
  type DaylightMode,
} from './engine/daylight';
import { onPaletteChanged } from './engine/palette';
import {
  RenderQualityController,
  parseQualityMode,
  type QualityProfile,
} from './engine/RenderQuality';
import { createSkyBackground } from './engine/SkyBackground';
import { createPostProcessing } from './engine/PostProcessing';
import { createSunShadow } from './engine/SunShadow';
import { resolveTheme, themeSwatches, THEMES, type Theme } from './engine/themes';
import { createVoxelMaterial } from './engine/VoxelMaterial';
import { installDebugHooks } from './shell/debugHooks';
import { createEntryDrop } from './shell/entryDrop';
import { createFrameStats } from './shell/frameStats';
import { createInfoViewScene } from './shell/infoViewScene';
import { createPlacementTools } from './shell/placementTools';
import { createPointerPick } from './shell/pointerPick';
import { createSaveSlots } from './shell/saveSlots';
import { createSelectionScene } from './shell/selectionScene';
import { createStreetEye } from './shell/streetEye';
import { createSwatchScene, SWATCH_PIVOT } from './shell/swatchScene';
import { GrowthScene } from './game/growthScene';
import {
  lookUrl,
  perfToggleUrl,
  PLAY_PARAM,
  resolveLaunchMode,
  resolveSeed,
  rollSeed,
  swatchUrl,
} from './game/launchMode';
import { signalWorldReady } from './game/worldReady';
import { SimScene, SIM_TICK_RATE } from './game/simScene';
import { coastalSectorById, shapeWithSector, type CoastalSector } from './game/sectors';
import {
  AUTO_SLOT,
  browserStorage,
  deleteSlot,
  importText,
  PENDING_SLOT,
  readSlot,
  takeSlot,
  type SaveStorage,
} from './game/save/storage';
import { BALANCE } from './sim/balance';
import { yearPhaseAt } from './sim/seasons';
import { cityVitality } from './sim/vitality';
import { BUILDING_CLASS, CLASS_COUNT, type BuildingClass } from './sim/classes';
import { BUILDER } from './world/buildings/config';
import './ui/hud.css';
import { DebugOverlay } from './ui/DebugOverlay';
import { PerfOverlay } from './ui/PerfOverlay';
import { PerfReport, formatPerfSummary } from './engine/PerfReport';
import { GameHud } from './ui/GameHud';
import { daylightControl } from './ui/GameHudModel';
import { hudTokens } from './ui/hudTokens';
import { GrowthOverlay } from './ui/GrowthOverlay';
import { InfoViewLegend } from './ui/InfoViewLegend';
import { InspectOverlay, type InspectOverlayFrame } from './ui/InspectOverlay';
import { SimOverlay, type SimOverlayFrame } from './ui/SimOverlay';
import { SwatchOverlay } from './ui/SwatchOverlay';
import { TerrainOverlay } from './ui/TerrainOverlay';
import { buildViewMenuModel, type ViewMenuModel } from './ui/ViewMenuModel';
import { CHUNK } from './world/chunkCoords';
import { createScene, type SceneGenerator, type SceneKind } from './world/scenes/cityScene';
import {
  createDioramaScene,
  DIORAMA_DEFAULT_LEVEL,
  parseBuildingUse,
  type DioramaScene,
} from './world/scenes/dioramaScene';
import { StreetNetwork } from './world/streets/StreetNetwork';
import { TERRAIN } from './world/terrain/config';
import { maxTowerHeightOf } from './world/scale';
import { BiomeView } from './world/terrain/BiomeView';
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

/** Quota del budget riservata alla heatmap informativa, pari alla generazione. */
const INFO_OVERLAY_BUDGET_MS = 1.5;

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
 * Il piano su cui la camera pana, ruota e si centra: il pianoro dell'isola.
 *
 * Non e' l'altezza di una torre — e' il suolo che si guarda. Serve anche
 * all'inquadratura della crescita, che deve lasciare sopra di esso lo spazio
 * della torre piu' alta che la scala verticale produce.
 */
const ISLAND_PIVOT = 24;

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
const { debugEnabled, perfEnabled, growEnabled, simEnabled } = resolveLaunchMode(params);
let debugVisible = debugEnabled;
const sceneKind = parseSceneKind(params.get('scene'));

/**
 * Il salvataggio automatico, letto prima di ogni altra cosa.
 *
 * **Deve stare qui in cima** perche' porta il seed, e il seed decide l'isola:
 * tutto cio' che viene dopo — terreno, streamer, camera — e' funzione sua.
 * `localStorage` e' sincrono, quindi leggerlo non costa un percorso a promesse
 * dentro un bootstrap che promesse non ne ha.
 *
 * **Un `?seed=` diverso vince.** Chiederne uno esplicito significa «voglio
 * quell'altro mondo», e caricarci sopra una citta' costruita altrove darebbe
 * edifici sospesi sul mare. Stessa ragione per `?terrain=`, che sostituisce il
 * seed dell'isola: li' il salvataggio non si applica affatto.
 */
const saveStorage: SaveStorage | null = growEnabled ? browserStorage() : null;
/**
 * L'autosalvataggio **non riparte da solo**, e il menu e' il perche'.
 *
 * Finche' la partita si riapriva da se', ogni avvio riportava la citta' di
 * ieri: `npm start` non era mai un inizio. Adesso la porta d'ingresso e' il
 * menu, e l'autosalvataggio e' una delle cose che si possono scegliere li'
 * dentro — «Continue», che passa dallo slot di transito come qualunque altro
 * caricamento. Non e' andato perso: non viene piu' aperto senza chiederlo.
 *
 * `?play=1` e' l'eccezione, ed e' la stessa che salta il menu: i ricaricamenti
 * che il gioco fa da se' — aprire uno slot, iniziare, misurare con `F2` —
 * nascono da una scelta appena presa e devono ritrovare la citta' dov'era.
 */
const directPlay = params.get(PLAY_PARAM) === '1';
// Cio' che il giocatore ha appena chiesto di aprire viene prima dell'autosave,
// e si consuma leggendolo **sempre**: restasse li', ogni ricaricamento
// successivo riaprirebbe quella partita invece della propria.
const pendingGame = growEnabled && !params.has('terrain')
  ? takeSlot(saveStorage, PENDING_SLOT)
  : null;
const savedGame = pendingGame
  ?? (growEnabled && !params.has('terrain') && directPlay ? readSlot(saveStorage, AUTO_SLOT) : null);
const restoredGame = savedGame !== null &&
  (!params.has('seed') || params.get('seed') === String(savedGame.seed))
  ? savedGame
  : null;

const seed = restoredGame?.seed ?? resolveSeed(params, rollSeed);

// Il seed sorteggiato va riscritto nell'URL: e' il modo in cui il mondo
// "appare" al giocatore — come il seed di Minecraft — e il ricaricamento
// riporta la stessa isola invece di sorteggiarne un'altra. `play` invece si
// **consuma**: e' il permesso di saltare il menu per questo avvio soltanto, e
// lasciarlo in coda lo farebbe valere anche per il ricaricamento dopo.
if (!params.has('seed') || directPlay) {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  url.searchParams.delete(PLAY_PARAM);
  window.history.replaceState(window.history.state, '', url);
}
const worldSize = clampInt(params.get('size'), 512, 32, 4096);
// L'altezza del mondo deve contenere la torre piu' alta che la scala verticale
// produce, sopra il rilievo dell'isola. Prima era un 64 fisso: troncava le
// torri da ~237 voxel prima ancora che nascessero. Default e tetto derivano
// dalla manopola verticale, l'override da URL resta.
const worldHeight = clampInt(
  params.get('height'),
  maxTowerHeightOf() + TERRAIN.maxHeight,
  32,
  maxTowerHeightOf() + TERRAIN.maxHeight,
);
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

/**
 * `?season=<0..1>` inchioda l'anno a una fase, come `?hour=` fa con l'ora.
 *
 * Zero e' l'inizio della primavera, 0,375 il pieno dell'estate, 0,875 il pieno
 * dell'inverno. Serve a guardare un inverno senza aspettare i quattro minuti che
 * la partita ci mette ad arrivarci — e a catturare i sette temi nella stessa
 * stagione, che a occhio non si sistema.
 */
const seasonPinned = params.get('season') !== null;
const initialSeason = seasonPinned ? Number(params.get('season')) : 0;

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
      ? SWATCH_PIVOT
      : ISLAND_PIVOT,
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

// Nasce qui e non accanto al ciclo di frame perche' la discesa a terra la
// azzera gia' al primo cambio di modo: e' il piu' vecchio dei consumatori.
const frameTiming = new FrameTiming(600);

/**
 * Profilo di effetti in vigore. Lo decide `RenderQuality`, che lo fa scendere
 * insieme al pixel ratio quando il frame non tiene: spegnere bloom e ombre
 * restituisce piu' millisecondi che togliere un quarto di risoluzione, e si
 * nota molto meno.
 */
let qualityProfile = renderQuality.profile;

function applyQualityProfile(profile: QualityProfile): void {
  qualityProfile = profile;
  // A terra la shadow map raddoppia il lato, e non e' generosita': la scatola su
  // cui si adatta e' passata da mezza isola a 192 voxel, quindi la stessa mappa
  // copre un'area venti volte piu' piccola e la pass disegna **meno** mesh di
  // prima. Il texel scende sotto il ventesimo di voxel, che e' la scala a cui
  // un'ombra si legge come appoggiata a terra invece che disegnata sopra.
  if (profile.shadowSize > 0) {
    sunShadow.setSize(streetView.active ? Math.min(4096, profile.shadowSize * 2) : profile.shadowSize);
  }
  post.setQuality({
    bloom: profile.bloom,
    // Il tilt-shift e' una banda di fuoco orizzontale a schermo, non una
    // profondita' di campo: dice «modellino», ed e' scelto cosi' proprio perche'
    // l'ortografica non ha convergenza. Da terra sfoca il cielo e il selciato e
    // mette a fuoco la fascia di mezzo, cioe' l'esatto contrario di quello che
    // una vista a occhio d'uomo significa.
    tilt: profile.tilt && !streetView.active,
    grade: profile.grade,
    godRays: profile.godRays,
    outline: profile.outline,
    bloomScale: profile.bloomScale,
  });
}

/**
 * La vista da terra, spenta finche' non la si chiede.
 *
 * Nasce prima delle viste d'ispezione e prima del terreno perche' il gating di
 * qualita' la interroga gia': quanto si puo' spendere per fotogramma dipende da
 * dove si sta guardando. Cio' che le serve e non c'e' ancora — le viste, la
 * mappa, l'HUD — arriva come funzione.
 */
const street = createStreetEye({
  camera,
  element: renderer.domElement,
  renderer,
  post,
  renderQuality,
  frameTiming,
  inspect: () => inspect,
  hud: () => gameHud,
  map: () => terrain?.map ?? null,
  pointedCellAt: (clientX, clientY) => pick.pointedCellAt(clientX, clientY),
  syncResolution,
  applyQuality: applyQualityProfile,
  quality: () => qualityProfile,
  voxelSize: VOXEL_SIZE,
  width: window.innerWidth,
  height: window.innerHeight,
  far: Math.hypot(worldSize, worldSize, worldHeight),
});
const streetView = street.streetView;

/** Le tre domande che ogni gesto del mouse fa al mondo, con un raycaster solo. */
const pick = createPointerPick({
  element: renderer.domElement,
  view: () => streetView.view,
  world,
  map: () => terrain?.map ?? null,
  registry: () => growthScene?.registry,
});

/** Il campionario vive solo in `?scene=swatch`: fuori di li' non nasce affatto. */
const swatch = sceneKind === 'swatch'
  ? createSwatchScene({
      element: renderer.domElement,
      world,
      camera,
      cursorRay: (clientX, clientY) => pick.cursorRay(clientX, clientY),
    })
  : null;
if (swatch !== null) scene.add(swatch.group);

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
  season: initialSeason,
  seasonPinned,
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
  rememberLook();
}

/**
 * Il look in vigore va nella barra degli indirizzi, come il seed.
 *
 * Non e' cosmesi dell'URL: `?theme=`, `?daylight=` e `?clouds=` sono i tre
 * parametri da cui **questo** avvio ha preso il suo cielo, e la schermata del
 * titolo legge di li' cosa mostrare. Senza questa riga, chi cambia tema
 * giocando e poi ricarica ritroverebbe sul titolo il cielo di tre partite fa,
 * con le pastiglie accese sulla scelta sbagliata.
 */
function rememberLook(): void {
  const url = lookUrl(window.location.search, {
    theme: daylight.theme.id,
    daylight: daylight.mode,
    clouds: cloudsOn,
  });
  window.history.replaceState(window.history.state, '', url);
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
} else if (swatch !== null) {
  // Si parte da «Tutto», l'estensione intera: la prima immagine e' il
  // campionario completo, poi i pulsanti del pannello inquadrano una fascia.
  swatch.frameInitial();
} else if (terrain === null) {
  camera.frameRegion(worldSize / 2, worldSize / 2, worldSize / 2, worldSize / 2, worldHeight);
} else if (growEnabled) {
  // La crescita deve leggersi come skyline, non come texture sull'intera isola:
  // si inquadra il nucleo centrale lasciando alle torri spazio verticale.
  //
  // `spanZ` non e' decorativo: entra in `projectedHeight`, quindi l'inquadratura
  // d'apertura **non** e' indipendente dall'altezza della citta'. Deriva dalla
  // torre piu' alta che la scala verticale produce, sopra il pianoro dell'isola:
  // a spanZ invariato la punta nascerebbe fuori campo.
  camera.frameRegion(
    TERRAIN_SIZE / 2,
    TERRAIN_SIZE / 2,
    420,
    420,
    maxTowerHeightOf() + ISLAND_PIVOT,
  );
} else {
  // L'isola invece si guarda intera: 512 di lato stanno in poche centinaia di chunk.
  camera.frameRegion(TERRAIN_SIZE / 2, TERRAIN_SIZE / 2, TERRAIN_SIZE, TERRAIN_SIZE, 160);
}

const overlay = new DebugOverlay(container);
// La misura delle prestazioni sta fuori dal gate del debug, come le viste:
// nasce con ?perf=1 e vive sulla partita vera, senza F3 di mezzo.
const perfOverlay = perfEnabled ? new PerfOverlay(container) : null;
const perfReport = perfEnabled ? new PerfReport() : null;
const terrainOverlay =
  terrain !== null && !simEnabled && !growEnabled
    ? new TerrainOverlay(container, toggleBiomeView)
    : null;
const swatchOverlay = swatch === null
  ? null
  : new SwatchOverlay(container, (focus) => swatch.frameFocus(focus));
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
let gameHud: GameHud | null = null;
// Scena e HUD arrivano come funzioni: entrambi nascono dopo questa riga, e una
// copia presa adesso resterebbe `null` per sempre.
const { autosave, refreshSaveList, startNewGame, saveToSlot, openSlot, exportSave } =
  createSaveSlots({
    storage: saveStorage,
    seed: terrainSeed,
    scene: () => growthScene,
    hud: () => gameHud,
  });
if (growEnabled) {
  gameHud = new GameHud(container, {
    onTool: (tool) => tools?.pickTool(tool),
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
      onSnooze: () => {
        const result = growthScene?.snoozeDecision();
        if (result !== undefined && !result.success) gameHud?.showFailure(result.reason);
      },
    onPause: (paused) => growthScene?.setPaused(paused),
    onSpeed: (speed) => growthScene?.setSpeed(speed),
    onDaylight: (mode) => {
      daylight.setMode(mode);
      rememberLook();
    },
    onClouds: (on) => setClouds(on),
    onTheme: (id) => {
      const index = THEMES.findIndex((candidate) => candidate.id === id);
      if (index >= 0) daylight.cycleTheme(index);
      rememberLook();
    },
    // Una scheda nuova, non questa: il campionario e' una scena diversa e
    // rigenerarla qui vorrebbe dire buttare la partita, che non ha salvataggio.
    // Cosi' la citta' resta viva sotto, e si torna chiudendo la scheda.
    onSwatch: () => {
      window.open(swatchUrl(daylight.theme.id, daylight.hour), '_blank', 'noopener');
    },
    onView: (mode) => inspect.setMode(mode),
    onInfoView: (kind) => infoViews?.setView(kind),
    onLevel: (z) => inspect.setSliceZ(z),
    onCancelTool: () => tools?.cancel(),
    onReleaseBlock: () => inspect.unlockBlock(),
    onClearSelection: () => selection?.clear(),
    onSaveSlot: (slot) => saveToSlot(slot),
    onLoadSlot: (slot) => openSlot(readSlot(saveStorage, slot), 'That slot is empty.'),
    onDeleteSlot: (slot) => {
      deleteSlot(saveStorage, slot);
      refreshSaveList();
    },
    onExportSave: () => exportSave(),
    onSavesOpened: () => refreshSaveList(),
    onImportSave: (text) => openSlot(importText(text), 'That file is not a saved game.'),
    onNewGame: (chosen) => startNewGame(chosen),
    onRollSeed: () => rollSeed(),
  }, THEMES.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    // Le tre pastiglie arrivano dalla tabella dei temi e non da qui: le disegna
    // anche la schermata del titolo, che l'engine non lo carica affatto, e due
    // derivazioni dello stesso campione divergerebbero al primo tema nuovo.
    swatches: themeSwatches(candidate),
    // La derivazione dei token invece resta qui, per la stessa ragione delle
    // pastiglie di prima: legge l'atmosfera, e l'HUD non conosce l'engine.
    tokens: hudTokens(candidate),
  })), daylight.theme.id);
  // Il bottone nasce sul ciclo: se l'URL ha chiesto altro, va detto subito o la
  // prima cosa che il giocatore legge e' falsa. Lo stesso per le nuvole, che di
  // partenza sono spente mentre la barra le dipinge accese.
  gameHud.setDaylight(daylight.mode);
  gameHud.setClouds(cloudsOn);
  // Qui non si apre piu' niente all'avvio: la porta d'ingresso e' `boot.ts`, e
  // quando questo modulo viene importato la scelta e' gia' stata fatta. Il menu
  // che resta e' quello di pausa, che si apre con Esc su una partita viva.
}

const influenceOverlay = terrain !== null && growEnabled ? new InfluenceOverlay(terrain.map) : null;
if (influenceOverlay !== null) scene.add(influenceOverlay.group);

/**
 * Lo strumento in mano, con i suoi tre segnaposto in-world.
 *
 * Nasce con la citta' e non con la scena: senza `grow=1` non c'e' niente da
 * piazzare, e il cursore di posa sarebbe un gruppo vuoto appeso alla scena.
 */
const tools = growEnabled
  ? createPlacementTools({
      element: renderer.domElement,
      map: () => terrain?.map ?? null,
      scene: () => growthScene,
      hud: () => gameHud,
      inspect: () => inspect,
      influence: influenceOverlay,
      region: terrainRegion,
      surfaceCellAt: (clientX, clientY) => pick.surfaceCellAt(clientX, clientY),
      pointedCellAt: (clientX, clientY) => pick.pointedCellAt(clientX, clientY),
      cursorRay: (clientX, clientY) => pick.cursorRay(clientX, clientY),
      streetActive: () => streetView.active,
      generationDone: () => generator.done,
      onIdleMove: () => selection?.syncInfluence(),
      onExpansion: (sector) => beginCoastalExpansion(sector),
    })
  : null;
if (tools !== null) for (const group of tools.groups) scene.add(group);

/**
 * La heatmap informativa in-world (cibo, materiali, densita', felicita',
 * distretti). Vive accanto a `InfluenceOverlay` e ne segue le regole: mesh
 * sopra la scena, mai un voxel toccato, geometria ricostruita solo quando la
 * vista o il campo cambiano.
 */
const infoViewOverlay = terrain !== null && growEnabled
  ? new InfoViewOverlay(terrain.map, terrainRegion)
  : null;
if (infoViewOverlay !== null) scene.add(infoViewOverlay.group);
const infoViewLegend = growEnabled ? new InfoViewLegend(container) : null;
const infoViews = growEnabled
  ? createInfoViewScene({
      overlay: infoViewOverlay,
      legend: infoViewLegend,
      hud: () => gameHud,
      scene: () => growthScene,
      budgetMs: INFO_OVERLAY_BUDGET_MS,
    })
  : null;
// Lo stato iniziale della tessera Data nel dock: la citta' nuda, nessun dato.
if (infoViews !== null) gameHud?.setInfoView(infoViews.kind);

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
 * La comparsa della prima isola. Nasce **dopo** l'inquadratura: la quota di
 * partenza dei pezzi si ricava dal frustum, che `frameRegion` ha appena scritto.
 */
const entryDrop = createEntryDrop({
  chunkRenderer,
  world,
  camera,
  daylight,
  map: () => terrain?.map ?? null,
  generationDone: () => generator.done,
  enabled: introEnabled,
});
scene.add(entryDrop.group);

/**
 * Le linee che dicono dove e' puntata la vista.
 *
 * Non dipendono da `growEnabled`: le viste sono dell'harness prima ancora che
 * del gioco, e in `?scene=noise` restano l'unico modo di leggere un taglio.
 */
const inspectGuides = terrain !== null ? new InspectGuides(terrain.map, terrainRegion) : null;
if (inspectGuides !== null) scene.add(inspectGuides.group);

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
  pointedCellAt: (clientX, clientY) => pick.pointedCellAt(clientX, clientY),
  toolActive: () => tools !== null && tools.tool.kind !== 'none',
  mode: initialInspectMode,
  sliceZ: initialSliceZ,
  sliceFromUrl: sliceZFromUrl,
  onStudy: (key) => {
    gameHud?.showTransientFeedback(`Studying block ${key} · drag to turn around it`);
  },
});

if (terrain !== null) {
  // Le viste d'ispezione sono spente a terra — entrare le chiude — ma i loro
  // listener restano appesi: senza la guardia, il puntatore sotto lock (che una
  // posizione non ce l'ha) le rimetterebbe a inseguire una cella qualsiasi.
  renderer.domElement.addEventListener('pointermove', (event: PointerEvent) => {
    if (streetView.active) return;
    inspect.onPointerMove(event.clientX, event.clientY);
  });
  renderer.domElement.addEventListener('pointerleave', () => inspect.onPointerLeave());
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (streetView.active) return;
    inspect.onPointerDown(event);
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (streetView.active) return;
    inspect.onPointerUp(event);
  });
}

/**
 * La scheda di cio' che il giocatore ha scelto.
 *
 * Nasce dopo le viste d'ispezione perche' le comanda: il pulsante «studia
 * l'isolato» aggancia un modo, e agganciarlo prima che il modo esista non
 * vorrebbe dire niente.
 */
const selection = growEnabled
  ? createSelectionScene({
      container,
      element: renderer.domElement,
      world,
      map: () => terrain?.map ?? null,
      streets,
      seed: terrainSeed,
      scene: () => growthScene,
      hud: () => gameHud,
      inspect,
      influence: influenceOverlay,
      pointedCellAt: (clientX, clientY) => pick.pointedCellAt(clientX, clientY),
      streetActive: () => streetView.active,
      toolActive: () => tools !== null && tools.tool.kind !== 'none',
    })
  : null;
if (selection !== null) scene.add(selection.group);

/**
 * **L'ordine di registrazione e' il contratto.** Il puntatore attraversa gli
 * strati in questa sequenza, e il primo che si prende il clic lo toglie a tutti
 * quelli dopo: gli strumenti annullano la propagazione quando piazzano, la
 * scheda si difende dalla soglia anti-pan, la discesa a terra guarda se e'
 * armata. Spostare una di queste righe cambia chi risponde al mouse.
 */
tools?.attach();
selection?.attach();
if (terrain !== null) street.attach();
swatch?.attach();

window.addEventListener('keydown', onUiKey);

/** Le letture di misura: overlay, riepilogo console e hook globali, una fonte sola. */
const frameStats = createFrameStats({
  renderer,
  chunkRenderer,
  frameTiming,
  world,
  camera,
  sunShadow,
  daylight,
  renderQuality,
  quality: () => qualityProfile,
  generator: () => generator,
  biomeView,
  terrainApplyMs: () => terrainApplyMs,
  terrain,
  sceneKind,
  seed,
  terrainSeed,
  terrainSize: TERRAIN_SIZE,
});

installDebugHooks({
  debugEnabled,
  perfEnabled,
  simEnabled,
  growEnabled,
  renderer,
  chunkRenderer,
  frameTiming,
  world,
  paletteHandle,
  daylight,
  renderQuality,
  inspect,
  stats: frameStats,
  mainMsMax: () => mainMsMax,
  resetPeaks,
  generator: () => generator,
  inspectFrame: buildInspectFrame,
  sunView,
  expandWorld,
  entryDrop,
  swatch,
  infoViews,
  terrain,
  terrainSeed,
  terrainSize: TERRAIN_SIZE,
  terrainApplyMs: () => terrainApplyMs,
  biomeView,
  toggleBiomeView,
  simScene: () => simScene,
  growthScene: () => growthScene,
});


let mainMsMax = 0;

/**
 * Azzera i picchi e riapre la finestra di misura.
 *
 * Serve a misurare il regime e non lo startup, ed e' lo stesso gesto per il
 * tasto `C` e per `__voxelReset()`: due azzeramenti diversi darebbero due
 * regimi diversi a seconda di come li si e' chiesti.
 */
function resetPeaks(): void {
  mainMsMax = 0;
  frameTiming.reset();
  chunkRenderer.mesherPool.resetStats();
}

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
  streetView.setViewport(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight, renderQuality.pixelRatio);
  syncResolution();
  skyBackground.setAspect(window.innerWidth / Math.max(1, window.innerHeight));
});

/**
 * L'ultimo salvataggio, quando la pagina se ne va.
 *
 * `pagehide` e non `beforeunload`: il secondo non scatta su mobile e sulle
 * chiusure di scheda in background, che sono proprio i casi in cui la partita
 * sparirebbe. `visibilitychange` copre l'altra meta' — la scheda che passa
 * dietro e che il browser puo' scaricare senza altro preavviso.
 */
window.addEventListener('pagehide', () => autosave(performance.now(), true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autosave(performance.now(), true);
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
  const atmosphere = withHour(daylight.look.atmosphere, daylight.hour);
  trafficView.setLighting(daylight.look.colors, atmosphere);
  ropewayView?.setLighting(daylight.look.colors, atmosphere);
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
  // A terra il volume dei chunk visibili e' un corridoio lungo quanto l'isola, e
  // il texel dell'ombra vale `max(spanX, spanY) / size`: senza restringerlo
  // attorno all'occhio l'ombra diventa poltiglia. Di sopra e' lo stesso oggetto
  // di prima, quindi passare di qui non costa niente.
  sunShadow.fit(streetView.shadowBounds(chunkRenderer.visibleBounds), sunWorld);
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
  // Il tempo dei segnaposto: qualche scrittura di uniform a frame, nessuna
  // ricostruzione di geometria. Lo vogliono tutti, non solo la scelta — la
  // cometa che percorre la fascia vive in un `uTime`, e un contorno che non
  // avanza mai se la ritrova ferma sul primo campione.
  tools?.update(dt);
  selection?.update(dt);
  swatch?.update(dt);

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

  // Il menu principale ferma la citta' senza toccare la pausa del giocatore:
  // quella finisce dentro il salvataggio e accende il bottone della barra, e
  // salvare dal menu produrrebbe una partita che si riapre in pausa senza che
  // nessuno l'abbia chiesto. Un `dt` di zero non muove ne' clock ne' tick, e
  // lascia comunque scorrere la materializzazione dei voxel gia' decisi —
  // esattamente cio' che fa la pausa vera.
  const cityDt = gameHud?.menuOpen === true ? 0 : dt;
  updateSim(cityDt);
  updateGrowth(cityDt);
  infoViews?.advance();
  daylight.advance(dt);
  // L'anno lo tiene la simulazione, non il renderer: `yearPhaseAt` e' la stessa
  // funzione da cui esce il moltiplicatore del raccolto, quindi il prato non
  // puo' ingiallire in un mese diverso da quello in cui i campi rendono meno.
  // Senza citta' non c'e' anno, e la fase resta quella di partenza.
  if (growthScene !== null) daylight.setSeason(yearPhaseAt(growthScene.simState.tickCount));

  // La camera del fotogramma, chiesta **una volta**: da qui in giu' nessuno deve
  // piu' sapere se si sta guardando la citta' dall'alto o da una sua strada.
  const view = streetView.view;

  // La direzione di sguardo serve alla vista prima che alla nebbia: in
  // ortografica e' un vettore solo, e ce lo dividiamo.
  view.getWorldDirection(viewDirection);
  inspect.apply([viewDirection.x, viewDirection.y, viewDirection.z]);

  const elapsed = performance.now() - workStart;
  chunkRenderer.update(view, Math.max(0.5, frameBudget - elapsed));
  // Fra `update` e `cull`: un chunk nato adesso deve gia' scendere in questo
  // frame, e il culling deve leggere gli AABB appena spostati.
  if (entryDrop.active) entryDrop.step(time / 1000);
  chunkRenderer.cull(view);

  // La finestra di caricamento si chiude su `generator.done`, non su
  // `chunkRenderer.isIdle`: e' la generazione a tenere fermo il gioco, e le
  // ultime mesh possono benissimo salire con i budget di regime.
  //
  // **Per una partita caricata la prima scena comprende i suoi settori.** Erano
  // terra comprata: senza di loro l'isola non e' quella su cui la citta' e'
  // stata costruita, e chiudere la finestra al primo `done` li farebbe arrivare
  // uno alla volta con i budget di regime, con la citta' che compare in fondo.
  // La finestra resta una sola e continua a non riaprirsi.
  if (loading && generator.done && sectorsToReplay.length === 0) {
    firstScenePending = false;
    // La schermata del titolo aspetta questo istante per togliersi: e' l'unico
    // in cui «il mondo c'e'» e' vero, e non un frame in cui il mare e' ancora vuoto.
    signalWorldReady();
  }

  const mainMs = performance.now() - workStart;
  if (mainMs > mainMsMax) mainMsMax = mainMs;

  const renderStart = performance.now();
  drawShadowPass();
  paletteHandle.setTime(time / 1000);
  paletteHandle.setViewDirection(viewDirection.x, viewDirection.y, viewDirection.z);
  // Il sole in spazio vista da' la sua posizione a schermo. Con una camera
  // ortografica un punto all'infinito non si proietta, quindi si usa la
  // direzione: la componente xy dice dove sta, la z se e' davanti o dietro.
  sunView.copy(sunWorld).transformDirection(view.matrixWorldInverse);
  skyBackground.setSunScreen(sunView.x * 1.35, sunView.y * 1.35, sunView.z < 0);
  // Stessa posizione a schermo del disco: i raggi del sole irradiano da li'.
  post.setSunScreen(sunView.x * 1.35, sunView.y * 1.35, sunView.z < 0);
  skyBackground.setTime(time / 1000);
  // Dalla NDC al mondo, per il solo strato di nuvole: il fondo e' un quad in
  // NDC e senza questa non saprebbe a che punto del piano corrisponde un pixel.
  // Due moltiplicazioni di matrici per frame, non per pixel.
  skyInvViewProj.multiplyMatrices(view.matrixWorld, view.projectionMatrixInverse);
  skyBackground.setCamera(skyInvViewProj, viewDirection.x, viewDirection.y, viewDirection.z);
  post.render();
  const renderMs = performance.now() - renderStart;

  const frameMs = performance.now() - workStart;
  observeQuality(time);

  if (perfReport !== null) {
    // Un campione a frame: il riepilogo esce quando la finestra si chiude, e
    // la riga e' gia' pronta da incollare.
    const summary = perfReport.add(frameStats.perf(frameMs), time);
    if (summary !== null) console.info(formatPerfSummary(summary));
  }

  if (overlay !== null && overlay.needsPaint(time)) {
    overlay.update(frameStats.overlay(mainMs, mainMsMax, renderMs, frameMs), time);
  }
  if (perfOverlay !== null && perfOverlay.needsPaint(time)) {
    perfOverlay.update(frameStats.perf(frameMs), time);
  }
  if (terrainOverlay !== null && terrain !== null && terrainOverlay.needsPaint(time)) {
    terrainOverlay.update(frameStats.terrain(terrain), time);
  }
  if (simOverlay !== null && simScene !== null && simOverlay.needsPaint(time)) {
    simOverlay.update(buildSimFrame(simScene), time);
  }
  if (growthOverlay !== null && growthOverlay.needsPaint(time)) {
    growthOverlay.update(growthScene?.stats ?? null, time);
  }
  if (swatchOverlay !== null && swatch !== null && swatchOverlay.needsPaint(time)) {
    swatchOverlay.update(swatch.frame(), time);
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
    selection?.syncCoach(growthScene.stats.coach);
  }
  // Stessa cadenza, e per lo stesso motivo: cio' che la scheda racconta —
  // desiderabilita', quartiere, livello di un edificio promosso — cambia a dieci
  // tick al secondo, e l'unica parte che costa e' l'aggregato dell'isolato.
  selection?.tick(time);
  autosave(time);
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

/**
 * I settori del salvataggio ancora da rigenerare, in ordine di acquisto.
 *
 * **L'ordine e' il formato.** Ogni acquisto estende la sagoma dell'isola, e il
 * settore successivo viene generato leggendo quella estesa: rifarli in un altro
 * ordine — o tutti insieme con la sagoma finale — darebbe una costa diversa da
 * quella su cui la citta' salvata e' stata costruita. Si ripercorre la stessa
 * sequenza che la partita ha percorso, uno streamer per volta.
 */
const sectorsToReplay: CoastalSector[] = restoredGame === null ? [] : restoredGame.sectors
  .map((id) => coastalSectorById(id, terrainRegion, BALANCE.gameplay.expansion.size))
  .filter((sector): sector is CoastalSector => sector !== null);

/** Gli stessi, tenuti interi: il caricamento della scena li rivuole tutti. */
const replayedSectors: readonly CoastalSector[] = [...sectorsToReplay];

/**
 * Rigenera un settore comprato in una partita salvata.
 *
 * E' `beginCoastalExpansion` senza il prezzo e senza il messaggio, e soprattutto
 * senza `expansionInFlight`: quel flag fa piantare alla scena il borgo che il
 * settore si porta dietro, e qui il borgo e' gia' dentro lo stato salvato.
 */
function replaySector(sector: CoastalSector): void {
  if (terrain === null || islandShape === null) return;
  islandShape = shapeWithSector(islandShape, sector);
  generator = new TerrainStreamer(
    world,
    terrainSeed,
    sector.generationRegion,
    islandShape,
    terrain.map,
  );
  influenceOverlay?.addSector(sector.region);
}

/** Avanza esclusivamente la scena `grow=1`, dopo che l'isola e' completa. */
function updateGrowth(dt: number): void {
  if (!growEnabled || terrain === null) return;
  if (growthScene === null) {
    if (!generator.done) return;
    // La terra prima della citta': un edificio salvato su un settore comprato
    // sta su colonne che l'isola di partenza non ha, e materializzarlo prima
    // che il terreno arrivi lo pianterebbe sul vuoto.
    const next = sectorsToReplay.shift();
    if (next !== undefined) {
      replaySector(next);
      return;
    }
    growthScene = new GrowthScene(world, terrain.map, terrainRegion, terrainSeed);
    if (restoredGame !== null) {
      growthScene.restore(restoredGame, replayedSectors);
      console.info(`[save] game restored: ${restoredGame.records.length} records`);
    }
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
  // Lo strumento si posa dopo l'uso: la terra e' comprata, e un secondo click
  // sul settore accanto sarebbe una spesa che nessuno ha chiesto.
  tools?.releaseTool();
}

function toggleBiomeView(): void {
  if (biomeView === null) return;
  biomeView.toggle();
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
    // modo di giudicare un look notturno senza aspettare il giro del ciclo.
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
    resetPeaks();
    chunkRenderer.resetRemeshPeaks();
  }
}

function onUiKey(event: KeyboardEvent): void {
  if (event.code === 'F3') {
    event.preventDefault();
    setDebugVisible(!debugVisible);
    return;
  }
  // `F2` sta accanto a `F3` perche' e' l'altra meta' della stessa domanda: quello
  // mostra gli overlay tecnici, questo accende la misura. Ma `perf` non si
  // alterna a runtime — ricarica la stessa partita con `?perf=1` addosso, che e'
  // l'unico modo di misurare una partita nata misurata. Il seed viaggia
  // nell'indirizzo e l'autosalvataggio scatta su `pagehide`: si torna sulla
  // stessa isola, con sopra la citta' che si era costruita.
  if (event.code === 'F2') {
    event.preventDefault();
    window.location.assign(perfToggleUrl(window.location.search, !perfEnabled));
    return;
  }
  // Nel campionario Esc molla la scelta: e' lo stesso gesto del gioco, senza
  // nessun pannello da chiudere prima. E rimette la fascia da cui si era partiti,
  // perche' dopo un doppio clic la scelta e' anche l'inquadratura: mollarla senza
  // tornare indietro lascerebbe la camera addosso a un soggetto che non e' piu'
  // scelto.
  if (event.code === 'Escape' && swatch?.releaseSelection() === true) {
    event.preventDefault();
    return;
  }
  // `Escape` a due gradini, come in Block focus: prima molla lo strumento armato,
  // poi risale. Sta **sopra** `handleEscape` perche' altrimenti uscire da terra
  // aprirebbe il menu principale, che e' l'ultima cosa che chiede chi sta
  // guardando una strada.
  if (event.code === 'Escape' && street.escape()) {
    event.preventDefault();
    return;
  }
  // La catena di Escape sta **sopra** tutto il resto del router, e non solo
  // sopra le scorciatoie di gioco: e' il tasto che apre e chiude il menu, e
  // sotto il menu nessun altro comando deve valere. Con la modale aperta il
  // router si ferma qui.
  if (event.code === 'Escape' && gameHud?.handleEscape() === true) {
    event.preventDefault();
    return;
  }
  if (gameHud?.menuOpen === true) return;
  // Ctrl/Cmd+Z annulla l'ultima passata della gomma: prima che i voxel spariscano
  // del tutto il gesto e' reversibile, ed e' la rete di sicurezza che rende la
  // demolizione un colpo da poter sbagliare. Sta fuori dal gate del debug come
  // V ed L — e' gioco, non misura.
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
    event.preventDefault();
    const result = growthScene?.undoDemolition();
    if (result !== undefined && result.restored > 0) {
      gameHud?.showTransientFeedback(
        `Undone · ${result.restored} ${result.restored === 1 ? 'building' : 'buildings'} rebuilt.`,
      );
    } else {
      gameHud?.showFeedback('Nothing to undo.', 'neutral');
    }
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
    // La ripetizione del tasto tenuto giu' arriva a trenta hertz: senza questa
    // guardia una pressione un filo lunga girava i tre modi decine di volte e
    // il cielo finiva dove capitava — il difetto per cui il tasto «non
    // funzionava». Un interruttore si preme, non si tiene.
    if (event.repeat) return;
    daylight.setMode(nextDaylightMode(daylight.mode));
    rememberLook();
    return;
  }
  // E per la stessa ragione le nuvole: un banco davanti alla torre che si sta
  // guardando si toglie, non si sopporta. Stessa guardia sulla ripetizione: e'
  // l'altro interruttore della fila.
  if (event.code === 'KeyC') {
    if (event.repeat) return;
    setClouds(!cloudsOn);
    return;
  }
  // La discesa a terra sta fuori dal gate del debug come `V` e `L`: guardare la
  // propria citta' dal ciglio di una sua strada e' gioco. `O` perche' tutte le
  // lettere con un nesso — `G` per ground, `S` per street — sono gia' prese
  // dall'harness, e prendersele qui le spegnerebbe **in silenzio**: un tasto di
  // gioco sta sopra il gate e vince sempre su quello tecnico.
  if (event.code === 'KeyO') {
    street.toggle();
    return;
  }
  // Le viste informative: un dato alla volta sopra la citta', come `V` per le
  // viste di ispezione. Leggere la citta' per dato e' gioco, non misura.
  if (event.code === 'KeyI') {
    infoViews?.cycle();
    return;
  }
  // `X` alterna suolo e facciata per lo strumento in mano: e' un comando di
  // gioco come `V` e `L`, e fa qualcosa solo quando il ruolo ha una forma in
  // quota — il selettore del dock appare solo allora, e il tasto segue la stessa
  // regola. Se non c'e' niente da alternare prosegue verso gli altri handler.
  if (event.code === 'KeyX' && gameHud?.togglePlacementMode() === true) {
    event.preventDefault();
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
        rememberLook();
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
