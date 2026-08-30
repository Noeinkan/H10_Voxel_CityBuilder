import { TRAFFIC } from '../../world/traffic/config';
import { sceneHelpers, sceneUniforms } from './scene.glsl';

/**
 * La schiuma della scia, in GLSL.
 *
 * **Il programma piu' piccolo della scena, e il piu' facile da sbagliare.** Una
 * scia e' una manciata di rettangoli piatti sul pelo dell'acqua: se li si dipinge
 * di bianco pieno con un bordo netto, non sono schiuma — sono nastro adesivo. Le
 * due righe che fanno la differenza sono qui e nessuna delle due e' geometria: il
 * bordo che si spegne di lato, e il granello che spezza la campitura.
 *
 * **Il granello sta sulla cella del mondo, non sul rettangolo.** E' la stessa
 * scelta opposta a quella dei mezzi, e per la stessa ragione: un mezzo si porta
 * dietro la propria lamiera, la schiuma resta dove la nave l'ha lasciata. Legata
 * al rettangolo, la scorrerebbe con lo scafo e la traccia si vedrebbe scivolare
 * all'indietro come un tapis roulant.
 *
 * Delle uniform condivise legge solo il blocco di scena: la schiuma non ha una
 * normale da cui campionare un'ombra, e non e' fatta di voxel.
 */
export const wakeVertexShader = /* glsl */ `
attribute vec2 aWake;

varying vec2 vWake;
varying vec3 vWorldPosition;
varying float vFogDepth;

void main() {
  // Le posizioni arrivano gia' in coordinate mondo: la mesh e' una sola per
  // tutta la citta' e non ha trasformazione, come quella del pennacchio.
  vWake = aWake;
  vWorldPosition = position;
  vec4 mvPosition = viewMatrix * vec4(position, 1.0);
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const wakeFragmentShader = /* glsl */ `
${sceneUniforms}

/** x: scostamento trasversale -1..1. y: quanto e' ancora bianca, 0..1. */
varying vec2 vWake;
varying vec3 vWorldPosition;
varying float vFogDepth;
${sceneHelpers}
void main() {
  // Il bordo si spegne di lato: una bava a spigolo netto legge come un nastro
  // appoggiato sull'acqua, non come schiuma che si dirada.
  float band = 1.0 - smoothstep(0.2, 1.0, abs(vWake.x));

  // Il granello, sulla cella del mondo: e' cio' che rende la campitura schiuma.
  // Ancorato al rettangolo scorrerebbe con lo scafo, e la traccia si vedrebbe
  // scivolare all'indietro come un tapis roulant.
  float speck = hash21(floor(vWorldPosition.xy / ${TRAFFIC.wake.grain.toFixed(2)}) + 0.17);
  float alpha = clamp(vWake.y * band * (0.4 + 0.8 * speck), 0.0, 1.0);
  // Sotto la soglia non c'e' niente da mescolare, e i segni piu' vecchi coprono
  // molto schermo: e' la coda della vita di una scia a costare, non il suo picco.
  if (alpha < 0.004) discard;

  // La schiuma guarda in su e sta allo scoperto: e' una faccia +Z senza ombra
  // propria. Prende quindi la luce dell'ora come qualunque altra superficie, ed
  // e' cio' che la spegne di notte invece di lasciarla bianca al buio.
  vec3 up = vec3(0.0, 0.0, 1.0);
  vec3 foam = uPalette[${TRAFFIC.wake.palette}] * (faceAmbient(up, 1.0) + uSunColor * faceDirect(up));

  vec3 vray = viewRay(vWorldPosition);
  vec3 aerial = mix(foam, aerialTint(vray), aerialVeil(vWorldPosition, vFogDepth));
  gl_FragColor = vec4(aerial, alpha);
}
`;
