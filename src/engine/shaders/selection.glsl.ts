/**
 * La fascia luminosa della selezione, in GLSL.
 *
 * **Il problema non era il colore, era il profilo.** Una fascia a opacita'
 * costante con i bordi netti non legge come luce: legge come nastro adesivo
 * appoggiato sui tetti, ed e' il motivo per cui un rettangolo magenta sembra un
 * riquadro di debug anche quando la tinta e' quella giusta. Qui il profilo
 * attraverso la fascia e' tutto il lavoro:
 *
 * - un **filo** stretto e quasi bianco, che dice *dove* passa il bordo;
 * - un **alone** largo nel colore della selezione, a caduta cubica, che e' cio'
 *   che trasforma il bordo in una luce appoggiata sul terreno;
 * - un **filo scuro** all'estremita' esterna, che e' l'unica cosa che tiene il
 *   contorno leggibile sull'erba chiara e sui tetti chiari — stesso mestiere del
 *   contorno scuro che il post-processing mette sulle sagome.
 *
 * Il nucleo esce **sopra 1**: e' l'unica parte della scena di overlay che supera
 * la soglia del bloom, e da li' l'alone morbido arriva gratis, senza un pass
 * dedicato alla selezione.
 *
 * L'animazione e' una **cometa che gira**, non un lampeggio di opacita'. Un
 * lampeggio cambia tutta la figura insieme e non dice niente; la cometa percorre
 * il perimetro, e nel percorrerlo lo *descrive* — e' la versione continua delle
 * «formiche in marcia» dei programmi di grafica, senza il tremolio.
 *
 * La stessa coppia di shader serve fascia, coperchio, angoli e montanti: cambia
 * il percorso, non il modo di dipingerlo. Nei montanti il percorso sale, quindi
 * la cometa sale con lui.
 */

/**
 * `aRibbon.x` va da -1 a 1 attraverso la fascia, `aRibbon.y` da 0 a 1 lungo il
 * percorso. Sono le due sole cose che il fragment deve sapere: la geometria puo'
 * essere un anello sul terreno o un montante verticale senza cambiare una riga.
 */
export const selectionVertexShader = /* glsl */ `
attribute vec2 aRibbon;

varying vec2 vRibbon;

void main() {
  vRibbon = aRibbon;
  // Le posizioni arrivano gia' in coordinate mondo: il gruppo della selezione
  // non ha trasformazione, come l'overlay di influenza.
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const selectionFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
/** Il respiro: moltiplica tutto, cosi' la forma non cambia mai con il battito. */
uniform float uOpacity;
/** Meta' larghezza del filo pieno, in unita' di \`aRibbon.x\`. */
uniform float uCore;
/** Quanto il nucleo sfonda sopra 1, cioe' quanto bloom si porta dietro. */
uniform float uBoost;
/** 0 spegne la cometa: gli angoli sono un ancoraggio fermo, non un'animazione. */
uniform float uSweep;
uniform float uSweepPeriod;

varying vec2 vRibbon;

void main() {
  float e = abs(vRibbon.x);

  // Il filo. Stretto apposta: e' la sola parte che va letta come una linea, e
  // allargarlo e' esattamente il modo in cui si torna al nastro adesivo.
  float core = 1.0 - smoothstep(uCore, uCore + 0.18, e);

  // L'alone. La caduta cubica tiene la meta' esterna quasi vuota: e' quello che
  // fa sembrare la fascia una luce diffusa invece di una campitura sfumata.
  float halo = pow(1.0 - e, 3.0);

  // La cometa. \`behind\` e' la distanza *dietro* la testa lungo il percorso: la
  // coda decade all'indietro, o la scia precederebbe la luce che la produce.
  float head = fract(uTime / uSweepPeriod);
  float behind = fract(head - vRibbon.y);
  float comet = uSweep * exp(-behind * 9.0);

  // Il filo scuro esterno, appena fuori dall'alone. Senza, su un tetto chiaro
  // l'alone si appoggia a un valore vicino al proprio e il bordo sparisce
  // proprio sugli edifici che uno clicca per primi.
  float shade = smoothstep(0.6, 0.94, e) * (1.0 - smoothstep(0.94, 1.0, e));

  float lit = core * 0.95 + halo * 0.4 + comet * 0.45;
  float dark = shade * 0.22;
  float alpha = clamp(lit + dark, 0.0, 1.0) * uOpacity;
  // Sotto la soglia non c'e' niente da mescolare, e la meta' esterna della
  // fascia e' quasi tutta sotto: e' li' che si risparmiano i pixel.
  if (alpha < 0.004) discard;

  // Il nucleo e' quasi bianco e l'alone porta la tinta: e' la regola di ogni
  // luce vera, e da sola vale piu' della scelta del colore.
  vec3 tint = mix(uColor, vec3(1.0), clamp(core * 0.8 + comet * 0.5, 0.0, 1.0));
  vec3 glow = tint * (1.0 + (core + comet) * uBoost);

  // I due contributi hanno colori opposti: si mescolano pesati per la loro
  // opacita', non sommati, o il filo scuro sporcherebbe anche il nucleo.
  vec3 color = (glow * lit + vec3(0.02) * dark) / max(lit + dark, 0.0001);
  gl_FragColor = vec4(color, alpha);
}
`;
