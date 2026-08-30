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

/**
 * Il materiale dei mezzi, in GLSL.
 *
 * **Perche' non bastavano i colori nei vertici.** Fino alla 4.x una nave era una
 * `MeshBasicMaterial` con la tinta di palette gia' moltiplicata per l'ombra della
 * faccia, riscritta alla cadenza dell'HUD. Funzionava, e si vedeva: una nave in
 * fondo alla rada restava satura mentre la costa dietro di lei si scioglieva
 * nella nebbia, quindi non stava *nel* paesaggio, ci stava sopra come una
 * figurina. Nessun dettaglio di sagoma corregge quella lettura — la corregge
 * l'unica cosa che le mancava, cioe' passare per lo **stesso** modello di luce e
 * di prospettiva aerea del resto della scena. Da qui il programma, e da qui il
 * fatto che meta' del suo sorgente arrivi da `scene.glsl.ts` invece di essere
 * riscritta.
 *
 * Tre cose che questo programma fa e il voxel no, e sono le tre in cui un mezzo
 * differisce davvero da un muro:
 *
 * - **la normale ruota con la sagoma.** Un mezzo e' una geometria condivisa per
 *   tipo, posata con una matrice: la faccia `+X` di una nave diretta a ovest
 *   guarda a ovest, e leggere `uFaceNormal[aFace]` senza ruotarla darebbe a tutta
 *   la flotta il sole dallo stesso lato qualunque rotta segua;
 * - **la grana e il fasciame si leggono nel sistema del mezzo**, non del mondo.
 *   E' la differenza fra una lamiera e uno stampo: agganciata alle coordinate
 *   mondo, la variazione per cella scorrerebbe *sotto* lo scafo mentre naviga, e
 *   una nave in moto sfarfallerebbe come una televisione;
 * - **le luci sono dichiarate, non dedotte.** `aLamp` viene dalla scatola, non
 *   dallo slot di palette: `lightPalette` veste anche le pinne di un dirigibile, e
 *   dedurre l'emissione dalla tinta le accenderebbe come due tubi al neon.
 */

/** Quanti finestrini per voxel di fascia vetrata. */
const PANE_PITCH = 0.55;

export const vehicleVertexShader = /* glsl */ `
attribute float aFace;
attribute float aPalette;
attribute float aLamp;

uniform vec3 uFaceNormal[6];

varying float vPaletteIndex;
varying float vFaceIndex;
varying float vLamp;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vFogDepth;

void main() {
  vPaletteIndex = aPalette;
  vFaceIndex = aFace;
  vLamp = aLamp;
  // La posizione nel sistema del mezzo, che e' anche quello in cui si leggono
  // grana e fasciame: +x e la prua, z il pelo dell acqua.
  vLocal = position;

  // La normale gira con la sagoma. La trasformazione e' rigida — una rotazione
  // attorno a z e una traslazione — quindi la parte lineare della matrice basta
  // e non serve la trasposta dell'inversa.
  vNormal = normalize(mat3(modelMatrix) * uFaceNormal[int(aFace + 0.5)]);

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const vehicleFragmentShader = /* glsl */ `
// Palette, luce, materia e ombra: gli stessi blocchi che dichiara il fragment del
// voxel. E' cio' che fa sfumare una nave lontana esattamente come la costa dietro
// di lei, invece di lasciarla satura sopra un paesaggio che si scioglie.
${sceneUniforms}${surfaceUniforms}${shadowUniforms}
// Lo strato di nuvole: un aereo che attraversa un banco deve entrarci, non
// passarci davanti. Sono gli stessi uniform del voxel e del fondo procedurale.
${cloudDeckUniforms}

varying float vPaletteIndex;
varying float vFaceIndex;
varying float vLamp;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vFogDepth;
${sceneHelpers}${surfaceHelpers}${shadowHelpers}${cloudDeckHelpers}
void main() {
  int paletteIndex = int(vPaletteIndex + 0.5);
  int faceIndex = int(vFaceIndex + 0.5);
  vec3 n = normalize(vNormal);
  bool lateral = faceIndex < 4;

  vec3 albedo = uPalette[paletteIndex];
  bool isGlass = paletteIndex >= ${PALETTE_SLOTS.glass} && paletteIndex <= ${PALETTE_SLOTS.glassDark};
  if (isGlass) albedo = mix(albedo, uGlassTint, uGlassLift);

  // Grana per cella, come sul voxel e con lo stesso hash — ma letta nel sistema
  // del mezzo. Il rientro di mezzo voxel lungo la normale serve a disambiguare la
  // cella: sulla faccia la posizione cade esatta sul confine e floor()
  // sfarfallerebbe fra due.
  vec3 nLocal = uFaceNormal[faceIndex];
  vec3 cell = floor((vLocal - nLocal * uVoxelSize * 0.5) / uVoxelSize);
  float grain = hash31(cell + 7.31) * 2.0 - 1.0;
  albedo *= 1.0 + grain * uColorJitter;

  // Fasciame: il reticolo di lamiera al passo del voxel. E' il gemello di
  // panelEdge sulle facciate, e serve alla stessa cosa — una scatola di tinta
  // piatta larga dodici voxel non ha una scala, e a distanza isometrica non si
  // distingue da una macchia di colore. Sui piani orizzontali pesa meno: li' e'
  // un calpestio, non un fianco.
  vec2 uv = faceUv(faceIndex, vLocal) / uVoxelSize;
  vec2 cellUv = fract(uv + vec2(0.0001));
  vec2 edgeDistance = min(cellUv, 1.0 - cellUv);
  float seam = 1.0 - smoothstep(0.035, 0.08, min(edgeDistance.x, edgeDistance.y));

  vec3 detailed = albedo * (1.0 - seam * (lateral ? 0.14 : 0.09));
  vec3 emission = vec3(0.0);

  // Fascia di finestrini: righe verticali con il montante fra l'una e l'altra.
  // Una fascia vetrata di un traghetto e' fatta cosi' davvero, e in piu' e'
  // l'unica scomposizione che regga su una scatola alta mezzo voxel — un riquadro
  // avrebbe bisogno di sapere dove finisce il pezzo, e al frammento quel dato non
  // arriva.
  if (isGlass && lateral) {
    vec2 guv = faceUv(faceIndex, vLocal) / ${PANE_PITCH.toFixed(2)};
    float slot = floor(guv.x);
    float pane = 1.0 - smoothstep(0.28, 0.40, abs(fract(guv.x) - 0.5));
    detailed *= 1.0 - (1.0 - pane) * 0.28;

    // Quali si accendono e' un tiro per finestrino, fermo nel tempo: le luci non
    // devono sfarfallare mentre il mezzo naviga. Solo di notte, come per le
    // facciate — di giorno il sole le coprirebbe comunque.
    float tone = hash21(vec2(slot, floor(guv.y) + float(paletteIndex)));
    float lit = step(0.42, tone) * uNight;
    vec3 warm = mix(uPalette[${PALETTE_SLOTS.metalBrass}], uPalette[${PALETTE_SLOTS.glassPale}], fract(tone * 6.71));
    detailed = mix(detailed, warm * 0.55, lit * pane * 0.6);
    emission += warm * lit * pane * 0.5;
  }

  // I fanali. Il tremolio e' per scatola e non per frammento — il seme e' la
  // cella del mezzo, che su un cubetto di tre decimi e' una sola — o al posto di
  // una lampada che respira si vedrebbe del rumore sulla faccia.
  if (vLamp > 0.5) {
    float flicker = 0.88 + 0.12 * sin(uTime * 2.3 + hash31(floor(vLocal) + 3.7) * 6.28318);
    detailed = mix(detailed, albedo * 1.35, 0.5);
    emission += albedo * flicker * mix(0.4, 1.5, uNight);
  }

  float shadow = sampleShadow(vWorldPosition, n);

  // Lo stesso modello di luce del voxel, con il cielo pieno: la visibilita' del
  // cielo e' un dato cotto nel mesher, e un mezzo sta sempre allo scoperto.
  // L'ambiente non e' moltiplicato per l'ombra proiettata, ed e' cio' che lascia
  // azzurro il fianco in ombra di una nave invece che nero.
  vec3 light = faceAmbient(n, 1.0) + uSunColor * faceDirect(n) * shadow;

  vec3 shaded = detailed * light + emission * uEmissiveStrength;
  // Lo stesso raggio per pixel del voxel: una nave deve stare **dentro** il
  // paesaggio, e sono queste formule condivise a tenercela. Se qui restasse la
  // direzione per fotogramma, da terra lo scafo prenderebbe un velo diverso
  // dalla costa che gli sta dietro.
  vec3 vray = viewRay(vWorldPosition);
  vec3 aerial = mix(shaded, aerialTint(vray), aerialVeil(vWorldPosition, vFogDepth));

  // Il banco di nuvole si compone dopo la nebbia e per sovrapposizione ordinata,
  // come sul voxel: sta fra la camera e il frammento, quindi copre invece di
  // mescolarsi. Il pixel e' o nuvola o aereo, mai una media dei due.
  vec2 cloud = cloudTrace(vWorldPosition, vray, uTime);
  if (cloudHatch(gl_FragCoord.xy) < cloud.x) {
    aerial = mix(aerialTint(vray), uCloudTint, uCloudTintBlend) * cloudShade(cloud.y);
  }

  gl_FragColor = vec4(aerial, 1.0);
  // Nessun tone mapping: si scrive HDR lineare e ci pensa OutputPass, come per
  // ogni altro materiale di scena.
}
`;
