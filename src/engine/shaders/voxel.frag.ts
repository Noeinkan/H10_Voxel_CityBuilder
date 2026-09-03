import { PALETTE_SLOTS } from '../paletteSlots';
import { cloudDeckHelpers, cloudDeckUniforms } from './cloudDeck.glsl';
import {
  sceneHelpers,
  sceneUniforms,
  shadowHelpers,
  shadowUniforms,
  surfaceHelpers,
  surfaceUniforms,
} from './scene.glsl';
import { NIGHT_WINDOWS } from '../nightWindows';
import { SURFACE_KIND, WATER_CLASS } from '../../world/visualBlock';
import {
  inspectCap,
  inspectDiscard,
  inspectGhostSurface,
  inspectGlow,
  inspectHelpers,
  inspectMelt,
} from './inspect.glsl';

/**
 * Fragment shader del voxel, nelle sue due varianti.
 *
 * Il colore arriva esclusivamente dalla palette: gli attributi di vertice
 * portano l'indice, mai un RGB. La normale non e' un attributo ma una lettura di
 * `uFaceNormal[aFace]`, ed e' il motivo per cui aggiungere un sole vero non ha
 * richiesto di toccare il mesher ne' di ricostruire una geometria.
 *
 * `inspect` compone la variante con le viste dell'harness. Si paga una volta per
 * sessione, alla prima attivazione: un `discard` raggiungibile costa l'early-Z
 * su tutta la scena, e chi non le accende non deve averlo nel programma.
 */
export function buildFragmentShader(inspect: boolean): string {
  return /* glsl */ `
// Palette, luce del sole, prospettiva aerea, materia e ombra proiettata: cio'
// che questo programma condivide con quello dei mezzi, dichiarato una volta sola
// in scene.glsl.ts. Quello che segue e' invece soltanto del voxel.
${sceneUniforms}${surfaceUniforms}${shadowUniforms}
// Visibilita' del cielo: l'unica parte del modello di luce che qui e' un dato
// cotto nel mesher, e che un mezzo — sempre allo scoperto — non ha.
uniform float uSkyOcclusion;

// Lo strato di nuvole a quota: un piano nello spazio, non un secondo velo di
// quota. La matematica e il perche' stanno in cloudDeck.ts, e questi stessi
// uniform li dichiara anche il fondo procedurale — e' una nuvola sola.
${cloudDeckUniforms}

uniform vec3 uWaterHighlight;
uniform vec3 uWaterShallowTint;
uniform float uWaterStrength;
uniform float uWaterScale;
uniform float uWaterSpeed;
uniform float uWaterCalm;
uniform float uWaterGlitter;
uniform vec3 uSpillColor;
uniform float uLitHomes;
uniform float uLitSigns;

// Bordo chiaro delle facce di scorcio, il segnale "cartoon". Colore e forza
// sono uniform separati perche' sono due fonti: la tinta e' del tema, la forza
// del tema o del default — e spegnere il bordo e' solo scrivere uRimStrength.
uniform float uRimStrength;
uniform float uRimPower;
uniform vec3 uRimColor;

// Viste di ispezione: tre predicati geometrici e una sola densita'. Il materiale
// non sa quale modo sia attivo: quella decisione vive in inspect.ts.
uniform vec4 uInspectPlane;
uniform vec4 uInspectRect;
uniform float uInspectVeil;
uniform float uInspectInside;
// Il volume che i raggi X stanno guardando, gia' allargato del respiro; la w del
// minimo e' il pavimento, e sotto quella quota non si vela mai.
uniform vec4 uInspectLensMin;
uniform vec3 uInspectLensMax;
// Il landmark che la lente accende, col suo volume esatto: spento quando il
// massimo non supera il minimo. Non ha un pavimento suo perche' la base del
// landmark e' gia' la quota sotto cui non c'e' niente da accendere.
uniform vec3 uInspectGlowMin;
uniform vec3 uInspectGlowMax;

varying float vAO;
varying float vOcclusion;
varying float vSkyVisibility;
varying float vGlow;
varying float vFogDepth;
varying float vPaletteIndex;
varying float vFaceIndex;
varying float vSurfaceIndex;
varying vec2 vWorldXY;
varying vec3 vWorldPosition;

${sceneHelpers}${surfaceHelpers}${shadowHelpers}${cloudDeckHelpers}${inspect ? inspectHelpers : ''}
void main() {
${inspect ? inspectDiscard : ''}
  int paletteIndex = int(vPaletteIndex + 0.5);
  int faceIndex = int(vFaceIndex + 0.5);
  int surfaceIndex = int(vSurfaceIndex + 0.5);
  vec3 n = uFaceNormal[faceIndex];
${inspect ? inspectCap : ''}
${inspect ? inspectGhostSurface : ''}
  vec3 albedo = uPalette[paletteIndex];
  bool isGlass = paletteIndex >= ${PALETTE_SLOTS.glass} && paletteIndex <= ${PALETTE_SLOTS.glassDark};
  if (isGlass) albedo = mix(albedo, uGlassTint, uGlassLift);

  // Variazione cromatica per voxel: senza, ogni voxel di uno slot ha esattamente
  // lo stesso colore, ed e' la prima causa di piattezza. Il rientro di mezzo
  // voxel lungo la normale serve a disambiguare la cella: sulla faccia la
  // posizione mondo cade esatta sul confine e floor() sfarfallerebbe fra due.
  vec3 cell = floor((vWorldPosition - n * uVoxelSize * 0.5) / uVoxelSize);
  float jitter = hash31(cell) * 2.0 - 1.0;
  albedo *= 1.0 + jitter * uColorJitter;
  albedo = mix(albedo, albedo * uSunColor, max(0.0, jitter) * uColorJitter * 0.5);

  vec3 detailed = albedo;
  vec3 emission = vec3(0.0);

  // Per un voxel d'acqua i tre bit di superficie non sono un linguaggio di
  // facciata ma la classe dello specchio (WATER_CLASS): l'acqua cortocircuita
  // lo switch qui sotto invece di attraversarne il ramo neutro. Il perche' del
  // sovraccarico sta su WATER_CLASS, in world/visualBlock.ts.
  bool isWater = paletteIndex == ${PALETTE_SLOTS.water} || paletteIndex == ${PALETTE_SLOTS.waterDeep};

  if (!isWater && surfaceIndex != ${SURFACE_KIND.plain}) {
    vec2 uv = faceUv(faceIndex, vWorldPosition);
    vec2 cellUv = fract(uv + vec2(0.0001));
    vec2 edgeDistance = min(cellUv, 1.0 - cellUv);
    float panelEdge = 1.0 - smoothstep(0.045, 0.085, min(edgeDistance.x, edgeDistance.y));
    float variation = hash21(floor(uv) + vec2(float(surfaceIndex) * 17.0, float(paletteIndex)));
    bool lateral = faceIndex < 4;

    if (surfaceIndex == ${SURFACE_KIND.habitat}) {
      // Finestra piu' alta che larga: a distanza e' la proporzione, prima ancora
      // del numero di vetri, a dire che quella e' una facciata e non un retino.
      float pane = lateral ? boxMask(cellUv, vec2(0.24, 0.1), vec2(0.76, 0.9)) : 0.0;

      // La "torre": un gruppo di colonne dell'ordine dell'impronta. Non e'
      // l'edificio — al frammento non arriva nessun identificatore, e dargliene
      // uno costerebbe bit che non ci sono — ma e' la scala alla quale due
      // vicini devono differire per potersi distinguere. Il modello, i suoi
      // numeri e il perche' stanno in nightWindows.ts.
      vec2 tower = floor(cell.xy / ${NIGHT_WINDOWS.towerCell.toFixed(1)});
      float towerHash = hash21(tower + 0.37);
      // Un ufficio accende piani interi, una casa finestre sparse: a scegliere
      // e' la torre e non l'uso, perche' la grammatica habitat li copre
      // entrambi. E' un limite dichiarato, e in cambio da' le bande orizzontali
      // che sono la firma di uno skyline di notte.
      float office = step(${(1 - NIGHT_WINDOWS.officeShare).toFixed(2)}, towerHash);
      // Quante finestre sono accese lo dice l'occupazione, non l'ora: la citta'
      // di notte resta una lettura dell'economia. Ma la quota ha un **tetto** e
      // una polarizzazione per torre: senza, una citta' piena accende ogni vetro
      // e la facciata torna il retino uniforme da cui questo modello scappa.
      // Il carattere si decorrela dall'uso con un fract: se no le torri accese
      // sarebbero sempre le stesse che si accendono per piani.
      float share = clamp(
        pow(uLitHomes, ${NIGHT_WINDOWS.occupancyGamma.toFixed(2)}) *
          ${NIGHT_WINDOWS.peakShare.toFixed(2)} *
          mix(${NIGHT_WINDOWS.towerBias.low.toFixed(2)}, ${NIGHT_WINDOWS.towerBias.high.toFixed(2)},
            fract(towerHash * 7.31)),
        0.0, 1.0);

      // La grana verticale. Un edificio non si svuota a finestre sparse lungo
      // l'altezza ma per blocchi di piani contigui, e da lontano e' la prima
      // cosa che si vede: la massa scura fra due fasce accese e' piu' estesa
      // delle fasce. Il fattore sta fra 0 e 1 — toglie luce e non ne aggiunge —
      // ed e' cosi' che le invarianti sulla quota della torre restano valide
      // blocco per blocco senza riverificarle. Il perche' sta in nightWindows.ts.
      float storeyBlock = floor(cell.z / ${NIGHT_WINDOWS.storey.block.toFixed(1)});
      float blockHash = hash21(tower * 2.11 + vec2(storeyBlock, 91.3));
      share *= step(${NIGHT_WINDOWS.storey.darkShare.toFixed(2)}, blockHash) *
        mix(${NIGHT_WINDOWS.storey.dimmest.toFixed(2)}, 1.0, fract(blockHash * 5.17));

      // Le due soglie dell'ufficio si dividono la stessa quota: quella del piano
      // e' la quota diviso il riempimento, quella della finestra il riempimento.
      // Cambia **come** la luce si distribuisce, non quanta ce n'e'.
      float floorLit = step(1.0 - share / ${NIGHT_WINDOWS.floorFill.toFixed(2)},
        hash21(tower * 1.37 + vec2(0.0, cell.z)));
      // La variazione resta deterministica per cella, quindi a muoversi sono le
      // soglie e mai i numeri: cambia **quante** finestre si accendono, mai
      // quali, e le luci non sfarfallano mentre la popolazione cresce.
      float lit = mix(
        step(1.0 - share, variation),
        floorLit * step(${(1 - NIGHT_WINDOWS.floorFill).toFixed(2)}, variation),
        office);
      // Vani scala e ascensori: la colonna accesa a ogni piano che tiene insieme
      // una facciata altrimenti a macchie. E' l'unica luce che ignora la grana
      // verticale — un vano scala e' acceso anche al piano vuoto — e proprio per
      // questo va tenuta fioca: alla forza di una finestra era la stessa riga
      // continua su ogni torre della citta'. Quante colonne siano lo dice
      // comunque l'economia, come per tutto il resto.
      lit = max(lit, ${NIGHT_WINDOWS.coreDim.toFixed(2)} *
        step(1.0 - ${NIGHT_WINDOWS.coreShare.toFixed(3)} * uLitHomes,
          hash21(cell.xy * 0.73 + 11.7)));
      lit *= pane;

      // Ambra di casa e bianco d'ufficio. Sono slot di palette e non costanti,
      // per la stessa ragione per cui un'insegna prende il colore del suo voxel:
      // un tema li ritinge insieme al resto della citta'. Il tono per finestra
      // impedisce che una torre sia tutta di un colore, che e' la seconda causa
      // di piattezza dopo il «tutte accese».
      float tone = hash21(floor(uv) + vec2(41.7, 8.3));
      // Il bianco freddo tira meno al vetro di prima: al 35 per cento di
      // glassPale ogni ufficio era ciano, e un ciano ripetuto su mezza citta'
      // legge come tinta del materiale invece che come lampada.
      vec3 cool = mix(uPalette[${PALETTE_SLOTS.concreteWhite}], uPalette[${PALETTE_SLOTS.glassPale}], 0.22);
      // Una minoranza di finestre calde va oltre l'ambra fino all'oro: sono i
      // punti che a distanza si staccano dal tessuto, e senza il gradino la coda
      // calda si fermerebbe tutta sullo stesso tono.
      vec3 warm = mix(uPalette[${PALETTE_SLOTS.metalBrass}], uPalette[${PALETTE_SLOTS.metalGold}],
        step(0.88, tone));
      // Il carattere cromatico e' anche della torre e non solo della finestra:
      // due palazzi di uffici affiancati non hanno la stessa lampada, e senza
      // questo termine avrebbero esattamente lo stesso bianco. Decorrelato dalla
      // polarizzazione con un altro fract, o le torri piu' calde sarebbero
      // sempre le piu' buie.
      float towerTone = fract(towerHash * 3.71);
      float warmth = clamp(mix(0.92, 0.22, office) + (tone - 0.5) * 1.1 + (towerTone - 0.5) * 0.55,
        0.0, 1.0);
      vec3 windowLight = mix(cool, warm, warmth);
      // Poche finestre molto accese valgono piu' di tante uguali: e' la coda
      // lunga che fa scintillare una facciata invece di velarla.
      float hot = fract(tone * 6.71);
      float strength = mix(0.4, 1.35, hot) + step(0.97, hot) * 1.5;

      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glassDeep}] * 0.62, pane * 0.72);
      detailed *= 1.0 - panelEdge * 0.16;
      // Il vetro acceso schiarisce anche il proprio pixel: con la sola emissione
      // una finestra accesa di giorno resterebbe un buco scuro nel vetro.
      detailed = mix(detailed, windowLight * 0.55, lit * 0.6);
      emission += windowLight * lit * strength *
        mix(${NIGHT_WINDOWS.gain.day.toFixed(2)}, ${NIGHT_WINDOWS.gain.night.toFixed(2)}, uNight) * 0.34;
    } else if (surfaceIndex == ${SURFACE_KIND.industrial}) {
      float rib = 1.0 - smoothstep(0.035, 0.075, abs(cellUv.x - 0.5));
      float vent = lateral ? boxMask(cellUv, vec2(0.18, 0.3), vec2(0.82, 0.68)) : 0.0;
      float louvers = step(0.52, fract(cellUv.y * 8.0)) * vent;
      detailed *= 1.0 - panelEdge * 0.24;
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.metalDark}] * 0.72, max(rib * 0.32, louvers * 0.3));
    } else if (surfaceIndex == ${SURFACE_KIND.civic}) {
      float glassPanel = lateral ? boxMask(cellUv, vec2(0.1, 0.12), vec2(0.9, 0.88)) : 0.0;
      float spine = 1.0 - smoothstep(0.045, 0.09, abs(cellUv.x - 0.5));
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glass}] * 0.82, glassPanel * 0.62);
      detailed *= 1.0 - panelEdge * 0.12;
      emission += uPalette[${PALETTE_SLOTS.glassPale}] * spine * glassPanel * 0.16;
    } else if (surfaceIndex == ${SURFACE_KIND.luminous}) {
      float band = lateral
        ? 1.0 - smoothstep(0.055, 0.12, abs(cellUv.y - 0.5))
        : 1.0 - smoothstep(0.055, 0.12, abs(cellUv.x - 0.5));
      float pulse = 0.82 + 0.18 * sin(uTime * 0.85 + variation * 6.28318);
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glassDeep}], 0.42 + band * 0.26);
      // Il bagliore tinge con lo slot del voxel invece di essere sempre pallido:
      // e' cio' che rende un'insegna commerciale d'ottone diversa da una spina
      // civica in vetro, che prima emettevano la stessa luce. Il residuo di
      // pallido non e' timidezza: uno slot scuro spegnerebbe la fascia, e
      // l'accento sparirebbe proprio dove serve, cioe' di notte e da lontano.
      vec3 glow = mix(uPalette[${PALETTE_SLOTS.glassPale}], uPalette[paletteIndex], 0.7);
      // Un'insegna segue il commercio: dove i negozi sono pieni e' accesa, dove
      // sono fermi resta un'insegna spenta e non un buco nero. Il minimo non e'
      // timidezza — un accento che sparisce del tutto cancella la faccia che
      // rende leggibile il volume, e resterebbe una silhouette.
      emission += glow * band * pulse * 0.72 * mix(0.3, 1.0, uLitSigns);
    } else if (surfaceIndex == ${SURFACE_KIND.portal}) {
      float portal = lateral ? boxMask(cellUv, vec2(0.12, 0.05), vec2(0.88, 0.95)) : 0.0;
      float core = lateral ? boxMask(cellUv, vec2(0.23, 0.08), vec2(0.77, 0.88)) : 0.0;
      float frame = max(0.0, portal - core);
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.glassDark}] * 0.62, core * 0.86);
      emission += uPalette[${PALETTE_SLOTS.glassPale}] * frame * (0.72 + 0.12 * sin(uTime * 1.1));
    } else if (surfaceIndex == ${SURFACE_KIND.roofTech}) {
      float circuitX = 1.0 - smoothstep(0.025, 0.065, abs(cellUv.x - 0.5));
      float circuitY = 1.0 - smoothstep(0.025, 0.065, abs(cellUv.y - 0.5));
      float circuit = faceIndex == 4 ? max(circuitX, circuitY) : circuitY;
      detailed *= 1.0 - panelEdge * 0.2;
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.metalDark}] * 0.75, circuit * 0.34);
      // Di notte le luci di sommita' pesano piu' del disegno del tetto: sopra il
      // fronte illuminato sono l'unica cosa che continua a dire dove finisce una
      // torre e comincia il cielo.
      emission += uPalette[${PALETTE_SLOTS.metalBrass}] * circuit * step(0.58, variation) *
        mix(0.18, 0.5, uNight);
    } else {
      // utility e' metallo strutturale uniforme: la forma arriva dalla mesh,
      // non da un warning pattern dipinto sulla superficie.
      detailed = mix(detailed, uPalette[${PALETTE_SLOTS.metalDark}] * 0.78, 0.28);
    }
  }

  // Il raggio di vista di questo frammento, calcolato una volta e passato a tutti
  // e cinque i posti che prima leggevano uViewDirection. Con i raggi paralleli
  // e' ancora quello del fotogramma; da terra e' per pixel, ed e' la differenza
  // fra un bordo che si accende dove la faccia scorcia davvero e uno che si
  // accende su meta' schermo.
  vec3 vray = viewRay(vWorldPosition);

  float shadow = sampleShadow(vWorldPosition, n);

  // Ambiente emisferico piu' sole avvolgente. L'ambiente non e' moltiplicato per
  // l'ombra proiettata: e' cio' che lascia azzurre le facce in ombra invece che
  // nere.
  //
  // A essere occlusa e' la sola meta' **cielo**, e con un dato geometrico e non
  // con il sole: sotto un impalcato o un ponte il cielo non arriva a qualunque
  // ora, mentre l'ombra del sole dipende dall'azimut e al livello di qualita'
  // piu' basso non viene nemmeno calcolata. Il rimbalzo resta pieno, ed e' cio'
  // che impedisce al sotto-ponte di diventare un buco nero.
  float skyReach = mix(1.0 - uSkyOcclusion, 1.0, vSkyVisibility);
  vec3 light = faceAmbient(n, skyReach) + uSunColor * faceDirect(n) * shadow;

  // La luce che **esce** dagli edifici. Non e' una luce dinamica: vGlow e' un
  // dato geometrico cotto nel mesher — quanto vicina sta una superficie
  // emissiva — esattamente come la visibilita' del cielo. Nessuna pass in piu',
  // nessun elenco di sorgenti nel fragment, nessuna ricompilazione.
  //
  // Vale solo di notte, e non per timidezza: di giorno il sole la coprirebbe
  // comunque, e pagarla vorrebbe dire slavare le facciate a mezzogiorno.
  light += uSpillColor * vGlow * vGlow * uNight;

  vec3 shaded = detailed * light * vAO + emission * uEmissiveStrength;

  // Bordo chiaro delle facce di scorcio: il segnale "cartoon". Il fresnel usa la
  // direzione di sguardo (dalla camera alla scena) e la normale della faccia:
  // per una faccia visibile i due sono quasi opposti, quindi il prodotto e'
  // negativo e max(0, -dot) cresce avvicinandosi al profilo. E' la meta' GLSL
  // di rimFactor in lighting.ts, e non richiede attributi ne' pass nuove.
  float rimFacing = max(0.0, -dot(n, vray));
  float rim = pow(1.0 - rimFacing, uRimPower);
  shaded += uRimColor * rim * uRimStrength;

${inspect ? inspectGlow : ''}

  // Tre risposte d'acqua, dalla classe che il generatore ha scritto nei bit di
  // superficie. Il mesher emette del mare la sola faccia superiore, quindi senza
  // quella classe qui arriverebbero una quota costante e un solo indice di
  // palette: una pozza e sedici voxel di mare aperto sarebbero lo stesso colore.
  if (isWater && faceIndex == 4 && uWaterStrength > 0.0) {
    float phase = uTime * uWaterSpeed;

    // Bassofondo: increspatura fitta e bassa, e la base schiarisce verso la
    // tinta del fondale — e' la classe dove si legge la sabbia sotto.
    // Canale: ampiezza quasi nulla, perche' l'acqua chiusa e' uno specchio.
    // Mare aperto: onda lunga, con la seconda ottava a fare la cresta.
    bool shallow = surfaceIndex == ${WATER_CLASS.shallow};
    bool canal = surfaceIndex == ${WATER_CLASS.canal};
    float scale = uWaterScale * (shallow ? 2.6 : canal ? 0.7 : 1.0);
    float amplitude = canal ? 0.28 : shallow ? 0.85 : 1.0;

    float waveA = sin((vWorldXY.x + vWorldXY.y) * scale + phase);
    float waveB = sin((vWorldXY.x - vWorldXY.y) * scale * 0.73 - phase * 0.61);
    float shimmer = 0.5 + 0.25 * (waveA + waveB) * amplitude;
    if (!shallow && !canal) {
      // Solo il mare aperto porta la seconda ottava: e' cio' che gli da' la
      // scala grande, e in un canale sarebbe rumore.
      shimmer += 0.12 * sin((vWorldXY.x * 0.37 - vWorldXY.y) * scale * 2.9 + phase * 1.7);
    }

    vec3 tint = shallow ? mix(uWaterHighlight, uWaterShallowTint, 0.65)
      : canal ? mix(uWaterHighlight, uSkyHorizonColor, uWaterCalm)
      : uWaterHighlight;
    shaded = mix(shaded, tint, clamp(shimmer * uWaterStrength, 0.0, 1.0));

    // Riflesso del sole. La normale e' +Z e la vista e' una sola direzione:
    // riflettere costa un dot e una pow, e non c'e' niente da campionare. E' la
    // firma del mare aperto — il canale la spegne, il bassofondo la smorza.
    vec3 mirrored = reflect(vray, vec3(0.0, 0.0, 1.0));
    float glint = pow(max(0.0, dot(mirrored, uSunDirection)), 24.0);
    float glintAmount = canal ? 0.0 : shallow ? 0.35 : 1.0;
    shaded += uSunColor * glint * uWaterGlitter * glintAmount * (0.6 + 0.4 * shimmer);

    // Schiuma di riva, gratis: sulla faccia superiore l'AO per vertice scende
    // esattamente dove una colonna vicina e' solida al livello del mare, cioe'
    // sul filo dell'acqua. Non serve un dato nuovo, basta leggerlo al contrario.
    float shore = vOcclusion;
    shaded = mix(shaded, uWaterHighlight, shore * uWaterStrength * 0.8);
  }

  // Prospettiva aerea. La nebbia si miscela in spazio lineare, prima del tone
  // mapping: dopo, il colore di sfumatura non corrisponderebbe piu' a quello
  // dichiarato dal tema. La tinta tende al cielo alla stessa altezza di schermo
  // del frammento, cosi' la distanza vi si scioglie. L'integrale in quota, il
  // velo e il gradiente stanno in scene.glsl.ts, che e' anche il modo in cui i
  // mezzi si sfumano esattamente come la costa dietro di loro.
  float fogVeil = aerialVeil(vWorldPosition, vFogDepth);
  vec3 fogTint = aerialTint(vray);

${inspect ? inspectMelt : ''}
  vec3 aerial = mix(shaded, fogTint, fogVeil);

  // Lo strato di nuvole si compone **dopo** la nebbia e per sovrapposizione
  // ordinata, non per trasmittanza: sta fra la camera e il frammento, quindi
  // copre cio' che la prospettiva aerea ha gia' fatto invece di mescolarcisi.
  // Senza una tinta propria e' la stessa della nebbia — che segue il gradiente
  // di cielo e lo scattering verso il sole — e allora lo strato aggiunge una
  // forma senza aggiungere un colore da tarare per sette palette.
  //
  // **Il pixel e' o nuvola o citta', mai una media dei due.** E' la trasparenza
  // a rigatura dei raggi X: la densita' decide quante righe, e fra le righe si
  // vede cio' che sta dentro il banco. Una miscela darebbe la nebbiolina da cui
  // questa fase e' partita, e con cui non si vede attraverso niente.
  //
  // La faccia colpita scurisce la tinta: e' cio' che fa leggere la lastra come
  // spessa invece che larga, perche' di un prisma si vede la sommita' **e** il
  // fianco, e con lo stesso colore sarebbero una macchia sola.
  vec2 cloud = cloudTrace(vWorldPosition, vray, uTime);
  if (cloudHatch(gl_FragCoord.xy) < cloud.x) {
    aerial = mix(fogTint, uCloudTint, uCloudTintBlend) * cloudShade(cloud.y);
  }
  gl_FragColor = vec4(aerial, 1.0);
  // Nessun tone mapping qui: si scrive HDR lineare e ci pensa OutputPass.
  // Ecco perche' un cambio di tema non ricompila piu' nessun materiale di scena.
}
`;
}
