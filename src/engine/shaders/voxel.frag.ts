import { PALETTE_SIZE } from '../palette';
import { PALETTE_SLOTS } from '../paletteSlots';
import { FOG_FLAT_EPSILON, FOG_LIFT_SHARPNESS } from '../atmosphere';
import { NIGHT_WINDOWS } from '../nightWindows';
import { SURFACE_KIND, WATER_CLASS } from '../../world/visualBlock';
import { inspectCap, inspectDiscard, inspectHelpers } from './inspect.glsl';

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
uniform vec3 uPalette[${PALETTE_SIZE}];
uniform vec3 uFaceNormal[6];
uniform float uVoxelSize;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunWrap;
uniform vec3 uSkyColor;
uniform vec3 uBounceColor;
uniform float uSkyOcclusion;
uniform float uColorJitter;

uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogSkyBlend;
uniform float uFogHeightBase;
uniform float uFogHeightFalloff;
uniform float uFogAltitudeLift;
uniform float uFogSunTint;
uniform vec3 uSkyTopColor;
uniform vec3 uSkyHorizonColor;
uniform vec3 uViewDirection;
uniform vec2 uResolution;

uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowStrength;
uniform float uShadowTexel;
uniform float uShadowNormalBias;
uniform float uShadowSoftness;

uniform vec3 uGlassTint;
uniform float uGlassLift;
uniform float uTime;
uniform vec3 uWaterHighlight;
uniform vec3 uWaterShallowTint;
uniform float uWaterStrength;
uniform float uWaterScale;
uniform float uWaterSpeed;
uniform float uWaterCalm;
uniform float uWaterGlitter;
uniform float uEmissiveStrength;
uniform vec3 uSpillColor;
uniform float uNight;
uniform float uLitHomes;
uniform float uLitSigns;

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

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float boxMask(vec2 p, vec2 low, vec2 high) {
  vec2 enter = smoothstep(low, low + vec2(0.045), p);
  vec2 leave = 1.0 - smoothstep(high - vec2(0.045), high, p);
  return enter.x * enter.y * leave.x * leave.y;
}

/**
 * Ombra proiettata del sole.
 *
 * Il bias e' normal-offset: si sposta il punto lungo la normale prima di
 * proiettarlo. Su facce allineate agli assi toglie l'acne senza staccare
 * l'ombra dalla base degli oggetti, come farebbe un bias in profondita'.
 */
float sampleShadow(vec3 worldPosition, vec3 n) {
  if (uShadowStrength <= 0.0) return 1.0;

  vec4 coord = uShadowMatrix * vec4(worldPosition + n * uShadowNormalBias, 1.0);
  vec3 uvz = coord.xyz / coord.w;
  // Fuori dalla mappa non si sa nulla: meglio illuminato che un bordo netto.
  if (uvz.x < 0.0 || uvz.x > 1.0 || uvz.y < 0.0 || uvz.y > 1.0 || uvz.z > 1.0) return 1.0;

  float lit = 0.0;
  if (uShadowSoftness <= 0.0) {
    lit = step(uvz.z, texture2D(uShadowMap, uvz.xy).r);
  } else {
    float radius = uShadowTexel * uShadowSoftness;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y)) * radius;
        lit += step(uvz.z, texture2D(uShadowMap, uvz.xy + offset).r);
      }
    }
    lit /= 9.0;
  }
  return mix(1.0, lit, uShadowStrength);
}

vec2 faceUv(int faceIndex, vec3 position) {
  if (faceIndex < 2) return position.yz;
  if (faceIndex < 4) return position.xz;
  return position.xy;
}
${inspect ? inspectHelpers : ''}
void main() {
${inspect ? inspectDiscard : ''}
  int paletteIndex = int(vPaletteIndex + 0.5);
  int faceIndex = int(vFaceIndex + 0.5);
  int surfaceIndex = int(vSurfaceIndex + 0.5);
  vec3 n = uFaceNormal[faceIndex];
${inspect ? inspectCap : ''}
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
      // una facciata altrimenti a macchie.
      lit = max(lit, step(${(1 - NIGHT_WINDOWS.coreShare).toFixed(2)},
        hash21(cell.xy * 0.73 + 11.7)));
      lit *= pane;

      // Ambra di casa e bianco d'ufficio. Sono slot di palette e non costanti,
      // per la stessa ragione per cui un'insegna prende il colore del suo voxel:
      // un tema li ritinge insieme al resto della citta'. Il tono per finestra
      // impedisce che una torre sia tutta di un colore, che e' la seconda causa
      // di piattezza dopo il «tutte accese».
      float tone = hash21(floor(uv) + vec2(41.7, 8.3));
      vec3 windowLight = mix(
        mix(uPalette[${PALETTE_SLOTS.concreteWhite}], uPalette[${PALETTE_SLOTS.glassPale}], 0.35),
        uPalette[${PALETTE_SLOTS.metalBrass}],
        clamp(mix(0.86, 0.24, office) + tone - 0.5, 0.0, 1.0));
      // Poche finestre molto accese valgono piu' di tante uguali: e' la coda
      // lunga che fa scintillare una facciata invece di velarla.
      float hot = fract(tone * 6.71);
      float strength = mix(0.55, 1.25, hot) + step(0.97, hot) * 1.4;

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
  vec3 ambient = mix(uBounceColor, uSkyColor * skyReach, n.z * 0.5 + 0.5);
  float wrapped = clamp((dot(n, uSunDirection) + uSunWrap) / (1.0 + uSunWrap), 0.0, 1.0);
  vec3 light = ambient + uSunColor * wrapped * shadow;

  // La luce che **esce** dagli edifici. Non e' una luce dinamica: vGlow e' un
  // dato geometrico cotto nel mesher — quanto vicina sta una superficie
  // emissiva — esattamente come la visibilita' del cielo. Nessuna pass in piu',
  // nessun elenco di sorgenti nel fragment, nessuna ricompilazione.
  //
  // Vale solo di notte, e non per timidezza: di giorno il sole la coprirebbe
  // comunque, e pagarla vorrebbe dire slavare le facciate a mezzogiorno.
  light += uSpillColor * vGlow * vGlow * uNight;

  vec3 shaded = detailed * light * vAO + emission * uEmissiveStrength;

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
    vec3 mirrored = reflect(uViewDirection, vec3(0.0, 0.0, 1.0));
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
  // del frammento, cosi' la distanza vi si scioglie.
  //
  // La densita' ha un profilo esponenziale in quota e viene **integrata lungo il
  // raggio**, non valutata sul frammento: e' cio' che separa le quote invece
  // delle sole distanze, perche' il raggio che arriva in cima a una torre ha
  // attraversato aria rarefatta e quello che arriva in strada no. L'integrale e'
  // in forma chiusa perche' la camera e' ortografica. La copia leggibile di
  // queste righe, con il perche' e i suoi test, sta in atmosphere.ts.
  float fogEntry = uFogHeightFalloff * (vWorldPosition.z - uViewDirection.z * vFogDepth - uFogHeightBase);
  float fogExit = uFogHeightFalloff * (vWorldPosition.z - uFogHeightBase);
  float fogSpan = fogExit - fogEntry;
  // Raggio quasi orizzontale: il rapporto degenera in 0/0 e vale il suo limite.
  float fogShape = abs(fogSpan) < ${FOG_FLAT_EPSILON.toFixed(6)}
    ? exp(-fogEntry)
    : (exp(-fogEntry) - exp(-fogExit)) / fogSpan;
  float fogAmount = 1.0 - exp(-uFogDensity * vFogDepth * fogShape);

  // Velo di quota: la parte dichiaratamente non fisica. Non dipende dalla
  // distanza, quindi sopravvive allo zoom ravvicinato dove l'integrale e' quasi
  // zero; decade piu' in fretta della nebbia, altrimenti velerebbe anche i tetti.
  float fogLift = uFogAltitudeLift *
    exp(-${FOG_LIFT_SHARPNESS.toFixed(1)} * uFogHeightFalloff * max(0.0, vWorldPosition.z - uFogHeightBase));
  // Trasmittanza e non somma: due veli in fila non superano l'opacita' piena.
  float fogVeil = 1.0 - (1.0 - clamp(fogAmount, 0.0, 1.0)) * (1.0 - clamp(fogLift, 0.0, 1.0));

  // Stessa curva del gradiente di SkyBackground: erano due implementazioni della
  // stessa mappatura, e divergendo cucivano una riga proprio all'orizzonte, dove
  // il cielo e la nebbia si toccano.
  float screenY = smoothstep(0.0, 1.0, clamp(gl_FragCoord.y / max(1.0, uResolution.y), 0.0, 1.0));
  vec3 skyTint = mix(uSkyHorizonColor, uSkyTopColor, screenY);
  vec3 fogTint = mix(uFogColor, skyTint, uFogSkyBlend);
  float towardSun = max(0.0, dot(uViewDirection, uSunDirection));
  fogTint = mix(fogTint, uSunColor, pow(towardSun, 4.0) * uFogSunTint);

  gl_FragColor = vec4(mix(shaded, fogTint, fogVeil), 1.0);
  // Nessun tone mapping qui: si scrive HDR lineare e ci pensa OutputPass.
  // Ecco perche' un cambio di tema non ricompila piu' nessun materiale di scena.
}
`;
}
