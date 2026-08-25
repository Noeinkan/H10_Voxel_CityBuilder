import {
  CLOUD_GRAZING_EPSILON,
  CLOUD_MIN_DENSITY,
  CLOUD_SIDE_SHADE,
  CLOUD_SLICES,
} from '../cloudDeck';
import { INSPECT } from '../inspect';

/**
 * Lo strato di nuvole a quota, in GLSL.
 *
 * E' la meta' shader di `cloudDeck.ts`, come `inspect.glsl.ts` lo e' di
 * `inspect.ts`: la copia leggibile con il perche' sta li', qui c'e' la stessa
 * matematica scritta per il frammento. `cloudDeck.test.ts` e' cio' che tiene
 * allineate le due copie, e le costanti arrivano da la' invece di essere
 * ribattute — un numero scritto due volte e' un numero che diverge.
 *
 * Sta in un file suo e non dentro `voxel.frag.ts` per la stessa ragione per cui
 * ci sta l'ispezione: scrivere GLSL e comporre il sorgente sono due lavori, e il
 * fragment del voxel e' gia' il file piu' conteso della cartella.
 *
 * **Costa solo a chi lo accende.** La densita' esce a zero appena `uCloudAmount`
 * e' zero — prima del ciclo sulle fette, che e' cio' che costa — e quello e' un
 * uniform: la divergenza e' per draw call e non per pixel, quindi un tema senza
 * strato, o il gioco con le nuvole spente, paga un confronto e nient'altro.
 *
 * **La rigatura e' quella dei raggi X**, con la stessa costante e per la stessa
 * ragione. Non e' riuso opportunistico: una nuvola che si aprisse con un retino
 * diverso da quello dell'ispezione sarebbe un secondo dialetto per dire la
 * stessa cosa, cioe' «attraverso questo si vede».
 */
/**
 * Gli uniform dello strato, dichiarati una volta e usati da due shader.
 *
 * Il fragment del voxel e il fondo procedurale disegnano **la stessa** nuvola —
 * uno su cio' che c'e', l'altro dove non c'e' niente — e due elenchi separati
 * sarebbero due elenchi che divergono al primo parametro aggiunto.
 */
export const cloudDeckUniforms = /* glsl */ `
uniform float uCloudHeight;
uniform float uCloudThickness;
uniform float uCloudAmount;
uniform float uCloudCoverage;
uniform float uCloudCellSize;
uniform float uCloudScale;
uniform float uCloudSpeed;
uniform vec3 uCloudTint;
uniform float uCloudTintBlend;
`;

export const cloudDeckHelpers = /* glsl */ `
float cloudHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  // Niente fract qui: e' uscire da 0..1 prima di moltiplicare che rende il
  // risultato quasi uniforme. Vedi cloudDeck.ts, dove la misura e' scritta.
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float cloudValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = cloudHash(i);
  float b = cloudHash(i + vec2(1.0, 0.0));
  float c = cloudHash(i + vec2(0.0, 1.0));
  float d = cloudHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float cloudNoise(vec2 p) {
  return (0.5 * cloudValueNoise(p) + 0.25 * cloudValueNoise(p * 2.03 + 17.0)) / 0.75;
}

/** Dove il raggio che arriva a questo punto taglia un piano orizzontale. */
vec2 cloudCrossing(vec3 world, vec3 viewDir, float planeZ) {
  float dz = viewDir.z;
  // Raggio radente: la risalita esploderebbe e il campione cadrebbe a
  // chilometri. La camera del gioco non ci arriva; le scene di misura si'.
  float guard = ${CLOUD_GRAZING_EPSILON.toFixed(4)};
  if (abs(dz) < guard) dz = dz < 0.0 ? -guard : guard;
  float s = (world.z - planeZ) / dz;
  return world.xy - viewDir.xy * s;
}

/**
 * Densita' della cella di nuvola: il rumore si legge **sulla cella** e non sul
 * punto, ed e' la riga che rende la nuvola un oggetto di voxel invece di una
 * sfumatura. Il campione cade al centro della cella: sullo spigolo il rumore si
 * aggancerebbe alla griglia e comparirebbero filari di celle uguali.
 */
float cloudCell(vec2 p, float time) {
  float cell = max(uCloudCellSize, 0.001);
  vec2 centre = (floor(p / cell) + 0.5) * cell;
  float scale = max(uCloudScale, 0.001);

  float value = cloudNoise(centre / scale + vec2(time * uCloudSpeed, 0.0));
  float floorValue = 1.0 - uCloudCoverage;
  if (value < floorValue) return 0.0;

  float over = uCloudCoverage <= 0.0 ? 0.0 : (value - floorValue) / uCloudCoverage;
  float minDensity = ${CLOUD_MIN_DENSITY.toFixed(3)};
  return minDensity + (1.0 - minDensity) * clamp(over, 0.0, 1.0);
}

/** La soglia della rigatura, identica a quella delle viste di ispezione. */
float cloudHatch(vec2 fragment) {
  return fract((fragment.x + fragment.y) * ${(1 / INSPECT.hatch).toFixed(6)});
}

/**
 * Attraversa la lastra sul raggio che arriva a questo punto: x e' la densita'
 * di rigatura, y la faccia colpita — 1 in sommita', 0 sul fianco.
 *
 * Le fette sotto il punto stanno **dietro** al frammento e non lo coprono: e'
 * cio' che fa uscire pulita una cima che emerge, e che la fa entrare nel banco a
 * scalini invece che di colpo. Il confronto e' uno step e non un branch perche'
 * il ciclo deve restare a passo fisso.
 *
 * Delle fette attraversate si tiene la piu' fitta — il banco e' pieno, non un
 * accumulo di veli — ma la faccia e' quella della **prima** colpita dall'alto.
 */
vec2 cloudTrace(vec3 world, vec3 viewDir, float time) {
  if (uCloudAmount <= 0.0) return vec2(0.0);
  float thickness = max(uCloudThickness, 0.001);
  float top = uCloudHeight + thickness * 0.5;
  if (world.z >= top) return vec2(0.0);

  float gap = thickness / ${CLOUD_SLICES.toFixed(1)};
  float best = 0.0;
  float face = 0.0;
  for (int i = 0; i < ${CLOUD_SLICES}; i++) {
    float sliceZ = top - (float(i) + 0.5) * gap;
    float ahead = step(world.z, sliceZ);
    float value = cloudCell(cloudCrossing(world, viewDir, sliceZ), time) * ahead;
    if (best <= 0.0 && value > 0.0) face = 1.0 - float(i) * ${(1 / (CLOUD_SLICES - 1)).toFixed(6)};
    best = max(best, value);
  }
  return vec2(uCloudAmount * best, face);
}

/**
 * La stessa lastra su un pixel di cielo, dove non c'e' nessun frammento.
 *
 * Dietro il fondo non c'e' niente, quindi lo strato gli sta davanti tutto: si
 * scende lungo il raggio fino alla base e da li' si attraversa come da un
 * frammento qualunque. Passare per la stessa cloudTrace invece di riscriverla e'
 * cio' che fa combaciare le due meta' sul filo della sagoma dell'isola.
 */
vec2 cloudSkyTrace(vec3 origin, vec3 viewDir, float time) {
  float base = uCloudHeight - max(uCloudThickness, 0.001) * 0.5;
  return cloudTrace(vec3(cloudCrossing(origin, viewDir, base), base), viewDir, time);
}

/** Quanto scurire la tinta del banco su questa faccia: piena in cima, meno di lato. */
float cloudShade(float face) {
  return mix(${CLOUD_SIDE_SHADE.toFixed(3)}, 1.0, clamp(face, 0.0, 1.0));
}
`;
