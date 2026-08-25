import { PALETTE_SIZE } from '../palette';
import { FOG_FLAT_EPSILON, FOG_LIFT_SHARPNESS } from '../atmosphere';

/**
 * Cio' che i materiali di scena condividono, in GLSL.
 *
 * **Esiste da quando i materiali di scena sono tre.** Palette, luce del sole,
 * ombra proiettata e prospettiva aerea erano scritte dentro `voxel.frag.ts`
 * perche' li' c'era l'unico programma che le usasse; dal momento in cui anche i
 * mezzi si illuminano e la loro scia si sfuma come il resto della scena, una
 * seconda copia di quelle formule sarebbe una copia che diverge — e a divergere
 * sarebbe l'unica cosa che tiene una nave *dentro* il paesaggio invece che
 * appiccicata sopra. E' la stessa mossa di `cloudDeck.glsl.ts`, che una nuvola
 * sola la disegna su due programmi.
 *
 * La copia leggibile della nebbia, con il perche' e i suoi test, sta in
 * `atmosphere.ts`; quella della luce in `lighting.ts`. Qui c'e' la stessa
 * matematica scritta per il frammento, e le costanti arrivano da la' invece di
 * essere ribattute.
 *
 * **Tre blocchi e non uno, e la divisione non e' ordine.** Un uniform dichiarato
 * e mai letto e' codice morto che continua a sembrare vivo, e i test dei
 * materiali sorvegliano la corrispondenza nei due versi: un blocco unico
 * costringerebbe la schiuma a dichiarare la shadow map che non campiona. Ogni
 * blocco risponde a una domanda diversa:
 *
 * - `sceneUniforms` — dove sta il sole e com'e' l'aria. Lo sa ogni programma.
 * - `surfaceUniforms` — come si dipinge una superficie di voxel. Lo sanno il
 *   volume e i mezzi, che sono fatti della stessa materia; la schiuma no.
 * - `shadowUniforms` — l'ombra proiettata. La campiona chi ha una normale.
 */
export const sceneUniforms = /* glsl */ `
uniform vec3 uPalette[${PALETTE_SIZE}];

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunWrap;
uniform vec3 uSkyColor;
uniform vec3 uBounceColor;

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
`;

export const surfaceUniforms = /* glsl */ `
uniform vec3 uFaceNormal[6];
uniform float uVoxelSize;
uniform float uColorJitter;
uniform vec3 uGlassTint;
uniform float uGlassLift;
uniform float uEmissiveStrength;
uniform float uTime;
uniform float uNight;
`;

export const shadowUniforms = /* glsl */ `
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowStrength;
uniform float uShadowTexel;
uniform float uShadowNormalBias;
uniform float uShadowSoftness;
`;

export const sceneHelpers = /* glsl */ `
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

/**
 * Quanta prospettiva aerea sta fra la camera e questo punto, 0..1.
 *
 * La densita' ha un profilo esponenziale in quota e viene **integrata lungo il
 * raggio**, non valutata sul frammento: e' cio' che separa le quote invece delle
 * sole distanze, perche' il raggio che arriva in cima a una torre ha attraversato
 * aria rarefatta e quello che arriva in strada no. L'integrale e' in forma chiusa
 * perche' la camera e' ortografica.
 *
 * Il secondo termine e' il velo di quota, la parte dichiaratamente non fisica:
 * non dipende dalla distanza, quindi sopravvive allo zoom ravvicinato dove
 * l'integrale e' quasi zero, e decade piu' in fretta della nebbia o velerebbe
 * anche i tetti. I due si compongono per **trasmittanza** e non per somma: due
 * veli in fila non superano l'opacita' piena.
 */
float aerialVeil(float height, float depth) {
  float entry = uFogHeightFalloff * (height - uViewDirection.z * depth - uFogHeightBase);
  float leave = uFogHeightFalloff * (height - uFogHeightBase);
  float span = leave - entry;
  // Raggio quasi orizzontale: il rapporto degenera in 0/0 e vale il suo limite.
  float shape = abs(span) < ${FOG_FLAT_EPSILON.toFixed(6)}
    ? exp(-entry)
    : (exp(-entry) - exp(-leave)) / span;
  float amount = 1.0 - exp(-uFogDensity * depth * shape);
  float lift = uFogAltitudeLift *
    exp(-${FOG_LIFT_SHARPNESS.toFixed(1)} * uFogHeightFalloff * max(0.0, height - uFogHeightBase));
  return 1.0 - (1.0 - clamp(amount, 0.0, 1.0)) * (1.0 - clamp(lift, 0.0, 1.0));
}

/**
 * La tinta in cui la distanza si scioglie, alla quota di schermo del frammento.
 *
 * Il gradiente e la **stessa curva** di SkyBackground: erano due
 * implementazioni della stessa mappatura, e divergendo cucivano una riga proprio
 * all'orizzonte, dove il cielo e la nebbia si toccano. Se ne tocchi una tocca
 * anche l'altra.
 */
vec3 aerialTint() {
  float screenY = smoothstep(0.0, 1.0, clamp(gl_FragCoord.y / max(1.0, uResolution.y), 0.0, 1.0));
  vec3 skyTint = mix(uSkyHorizonColor, uSkyTopColor, screenY);
  vec3 tint = mix(uFogColor, skyTint, uFogSkyBlend);
  float towardSun = max(0.0, dot(uViewDirection, uSunDirection));
  return mix(tint, uSunColor, pow(towardSun, 4.0) * uFogSunTint);
}

/**
 * L'ambiente emisferico su una faccia orientata come n.
 *
 * E' la meta' GLSL di faceLight in lighting.ts, spezzata in due perche'
 * l'ambiente **non** va moltiplicato per l'ombra proiettata: e' cio' che rende
 * azzurre le facce in ombra invece che nere. Tenendo separato il termine diretto,
 * l'occlusione ha un solo posto in cui applicarsi e non c'e' modo di sbagliarsi
 * al contrario.
 *
 * skyReach e quanto cielo arriva a questa faccia: un dato geometrico che il
 * mesher cuoce nel volume, e che vale 1 per tutto cio' che sta allo scoperto —
 * un mezzo, una schiuma. Non va confuso con l'ombra del sole: questo vale a ogni
 * ora e a ogni qualita', perche' e' geometria e non luce.
 */
vec3 faceAmbient(vec3 n, float skyReach) {
  return mix(uBounceColor, uSkyColor * skyReach, n.z * 0.5 + 0.5);
}

/** Il termine diretto: sole avvolgente, da moltiplicare per l'ombra proiettata. */
float faceDirect(vec3 n) {
  return clamp((dot(n, uSunDirection) + uSunWrap) / (1.0 + uSunWrap), 0.0, 1.0);
}
`;

export const surfaceHelpers = /* glsl */ `
float boxMask(vec2 p, vec2 low, vec2 high) {
  vec2 enter = smoothstep(low, low + vec2(0.045), p);
  vec2 leave = 1.0 - smoothstep(high - vec2(0.045), high, p);
  return enter.x * enter.y * leave.x * leave.y;
}

/** Le due coordinate di superficie di una faccia, dal punto e dall'indice. */
vec2 faceUv(int faceIndex, vec3 position) {
  if (faceIndex < 2) return position.yz;
  if (faceIndex < 4) return position.xz;
  return position.xy;
}
`;

export const shadowHelpers = /* glsl */ `
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
`;
