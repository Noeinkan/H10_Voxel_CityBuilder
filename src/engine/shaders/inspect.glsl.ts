import { INSPECT } from '../inspect';
import { SURFACE_KIND } from '../../world/visualBlock';

/**
 * Retino ordinato e i due predicati delle viste di ispezione.
 *
 * Entrano nel sorgente **solo** alla prima attivazione (vedi
 * `buildFragmentShader`): un `discard` raggiungibile costa l'early-Z su tutta la
 * scena, e queste viste sono uno strumento dell'harness che non deve pesare su
 * chi non le accende. Gli uniform invece sono sempre dichiarati, cosi' il
 * contratto «dichiarato ⇔ scritto» vale su entrambe le varianti.
 *
 * Il retino e' in forma chiusa e senza operatori bit: la matrice 4x4 e' due
 * matrici 2x2 annidate, e vale 0..15/16. A densita' 0 non scarta niente, a 1
 * scarta ogni pixel — cioe' **taglia**, con la stessa manopola con cui vela.
 * Non e' alpha blending: nessun ordinamento, `transparent` resta false.
 */
export const inspectHelpers = /* glsl */ `
float bayer2(vec2 p) {
  return mod(2.0 * p.x + 3.0 * p.y, 4.0);
}

float bayer4(vec2 p) {
  vec2 cell = mod(floor(p), 4.0);
  return (4.0 * bayer2(mod(floor(cell * 0.5), 2.0)) + bayer2(mod(cell, 2.0))) / 16.0;
}

float inspectDensity(vec3 p) {
  // Primo predicato: oltre il semipiano. Fuori di li' non si nasconde niente,
  // e non c'e' motivo di misurare la distanza dal bordo.
  if (dot(uInspectPlane.xyz, p) <= uInspectPlane.w) return 0.0;
  // Secondo predicato, con la sua rampa: edge e' la distanza dal bordo del
  // rettangolo con il segno della polarita', positiva dove si nasconde. I raggi
  // X nascondono dentro la finestra, l'isolamento fuori dall'isolato, e la
  // sfumatura vale per entrambi senza doverli distinguere.
  vec2 d = min(p.xy - uInspectRect.xy, uInspectRect.zw - p.xy);
  float edge = min(d.x, d.y) * (uInspectInside > 0.0 ? 1.0 : -1.0);
  // Con il rettangolo aperto del taglio la distanza e' l'infinito pratico: la
  // rampa satura a 1 e la fetta resta il taglio netto di prima.
  //
  // Ma con un rettangolo **chiuso** che taglia — l'isolato scelto — la rampa
  // farebbe danno invece di ammorbidire: nasce per sfumare il bordo di una lente,
  // e su un taglio sbriciola le ultime file di colonne del soggetto, proprio
  // quelle che il +1 sul rettangolo esiste per tenere. Li' il bordo dev'essere
  // netto, ed e' lo stesso confine fra velare e tagliare che governa tutto il
  // resto di questo file.
  float ramp = uInspectVeil >= 1.0
    ? (edge > 0.0 ? 1.0 : 0.0)
    : smoothstep(0.0, ${INSPECT.feather.toFixed(1)}, edge);
  // Terzo predicato: la lente dei raggi X. Prima il pavimento, che e' la
  // condizione piu' a buon mercato e quella che si vedeva peggio quando mancava:
  // il terreno davanti al soggetto lo copre come lo copre un muro, ma dietro non
  // ha niente da mostrare, e bucarlo apriva una macchia di cielo.
  if (uInspectLensMax.x > uInspectLensMin.x) {
    if (p.z <= uInspectLensMin.w) return 0.0;
    // Poi la domanda vera: continuando il raggio di vista da qui in avanti,
    // incontro il volume che si sta guardando? Se si', gli sto davanti — e gli
    // sto davanti *a lui*, non a un semipiano che gli passa vicino. E' il test a
    // lastre di lensChord() in inspect.ts, riga per riga.
    vec3 ta = (uInspectLensMin.xyz - p) / uViewDirection;
    vec3 tb = (uInspectLensMax - p) / uViewDirection;
    vec3 tNear = min(ta, tb);
    vec3 tFar = max(ta, tb);
    float enter = max(max(tNear.x, tNear.y), tNear.z);
    float leave = min(min(tFar.x, tFar.y), tFar.z);
    // Un enter negativo sono due casi in uno: chi sta dietro non incontra niente, e
    // chi sta dentro ha gia' cominciato — cosi' il soggetto non si vela da solo.
    if (enter <= 0.0 || leave < enter) return 0.0;
    // La corda va a zero sul contorno della sagoma e cresce verso il centro: e'
    // gia' la distanza dal bordo, e sfuma la lente senza un secondo conto.
    ramp *= smoothstep(0.0, ${INSPECT.feather.toFixed(1)}, leave - enter);
  }
  return uInspectVeil * ramp;
}
`;

/** Prima riga di main: scartare costa meno di tutto cio' che verrebbe dopo. */
export const inspectDiscard = /* glsl */ `
  if (uInspectVeil > 0.0) {
    float density = inspectDensity(vWorldPosition);
    if (density > 0.0 && bayer4(gl_FragCoord.xy) < density) discard;
  }
`;

/**
 * Il tappo del taglio.
 *
 * Dove il taglio ha tolto le facce vicine si vedrebbe il retro di quelle
 * lontane, che e' back-face: con `DoubleSide` arriva fin qui invece di essere
 * scartata. La normale si inverte perche' guarda dentro il volume, e il
 * linguaggio di superficie si spegne — una faccia di sezione e' materiale
 * grezzo, non una facciata con le sue finestre.
 */
export const inspectCap = /* glsl */ `
  if (!gl_FrontFacing) {
    n = -n;
    surfaceIndex = ${SURFACE_KIND.plain};
  }
`;
