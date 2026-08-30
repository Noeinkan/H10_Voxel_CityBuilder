import { INSPECT } from '../inspect';
import { XRAY } from '../xray';
import { SURFACE_KIND } from '../../world/visualBlock';

/**
 * I tre predicati delle viste di ispezione e cio' che il velo fa a un frammento.
 *
 * Entrano nel sorgente **solo** alla prima attivazione (vedi
 * `buildFragmentShader`): un `discard` raggiungibile costa l'early-Z su tutta la
 * scena, e queste viste sono uno strumento che non deve pesare su chi non le
 * accende. Gli uniform invece sono sempre dichiarati, cosi' il contratto
 * «dichiarato ⇔ scritto» vale su entrambe le varianti.
 *
 * Velare non e' piu' un solo `discard`, ed e' il cuore di questo file. Un muro
 * bucato a caso resta un muro rotto: si vede il pulviscolo di cio' che e'
 * rimasto, non cio' che c'e' dietro. Qui il velo fa tre cose insieme, e nessuna
 * delle tre da sola basterebbe.
 *
 * 1. **Riga invece di sparpagliare.** La soglia e' una rampa diagonale in pixel
 *    di schermo, non un Bayer: a parita' di copertura i superstiti stanno in
 *    fila e leggono come una campitura. La densita' ne cambia lo spessore, non
 *    il passo, quindi puo' variare con continuita'.
 * 2. **Cede sul filo del voxel.** Sulla cella la densita' scende a
 *    `XRAY.lattice`, quindi la faccia si scioglie ma lo spigolo resta:
 *    l'occlusore diventa una gabbia e conserva la sua sagoma.
 * 3. **Scioglie cio' che resta nell'aria.** I superstiti perdono il linguaggio
 *    di facciata — niente finestre, niente insegne, niente emissivi — e tendono
 *    alla tinta della prospettiva aerea. E' cio' che li fa leggere come vetro
 *    invece che come sporco davanti al soggetto.
 *
 * A `veil` uguale a 1 la soglia scarta tutto, cioe' **taglia**: e' la stessa
 * manopola per le due famiglie e non due percorsi separati. Li' i primi due
 * punti non si applicano — una gabbia dentro un taglio sarebbe il taglio non
 * fatto — e la guardia e' sempre la stessa, `uInspectVeil < 1.0`.
 *
 * Non e' alpha blending: nessun ordinamento, `transparent` resta false.
 */
export const inspectHelpers = /* glsl */ `
float hatchThreshold(vec2 fragment) {
  return fract((fragment.x + fragment.y) * ${(1 / INSPECT.hatch).toFixed(6)});
}

// Il filo della cella: 1 sullo spigolo del voxel, 0 in mezzo alla faccia.
// Stessa lettura di faceUv che il linguaggio di facciata usa gia' per i
// pannelli, quindi la gabbia cade esattamente sulla griglia che si vede quando
// la vista e' spenta, e non su una seconda griglia sfasata.
float voxelWire(int faceIndex, vec3 p) {
  vec2 cellUv = fract(faceUv(faceIndex, p) + vec2(0.0001));
  vec2 d = min(cellUv, 1.0 - cellUv);
  return 1.0 - smoothstep(0.0, ${XRAY.edge.toFixed(3)}, min(d.x, d.y));
}

float inspectDensity(vec3 p, out float ghost) {
  ghost = 0.0;
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
  float density = uInspectVeil;
  // Terzo predicato: la lente dei raggi X. Prima il pavimento, che e' la
  // condizione piu' a buon mercato e quella che si vedeva peggio quando mancava:
  // il terreno davanti al soggetto lo copre come lo copre un muro, ma dietro non
  // ha niente da mostrare, e bucarlo apriva una macchia di cielo.
  if (uInspectLensMax.x > uInspectLensMin.x) {
    if (p.z <= uInspectLensMin.w) return 0.0;
    // Poi la domanda vera: continuando il raggio di vista da qui in avanti,
    // incontro il volume che si sta guardando? Se si', gli sto davanti — e gli
    // sto davanti *a lui*, non a un semipiano che gli passa vicino. E' il test a
    // lastre di lensHit() in xray.ts, riga per riga.
    // Il raggio di questo punto, non quello del fotogramma: da terra i raggi
    // divergono, e una lastra attraversata lungo la direzione media invece che
    // lungo il proprio raggio spalmerebbe la lente di traverso al soggetto.
    vec3 lensRay = viewRay(p);
    vec3 ta = (uInspectLensMin.xyz - p) / lensRay;
    vec3 tb = (uInspectLensMax - p) / lensRay;
    vec3 tNear = min(ta, tb);
    vec3 tFar = max(ta, tb);
    float enter = max(max(tNear.x, tNear.y), tNear.z);
    float leave = min(min(tFar.x, tFar.y), tFar.z);
    // Un enter negativo sono due casi in uno: chi sta dietro non incontra niente, e
    // chi sta dentro ha gia' cominciato — cosi' il soggetto non si vela da solo.
    if (enter <= 0.0 || leave < enter) return 0.0;
    // La corda va a zero sul contorno della sagoma e cresce verso il centro: e'
    // gia' la distanza dal bordo, e sfuma la lente senza un secondo conto.
    ramp *= smoothstep(0.0, ${XRAY.feather.toFixed(1)}, leave - enter);
    // E enter e' quanto il frammento sta **davanti** al soggetto: piu' e'
    // vicino a chi guarda, piu' si scioglie. Non e' un gusto, e' cio' che fa
    // vedere piu' di una parete alla volta — le soglie di una rampa sono
    // annidate, quindi chi sta dietro sopravvive su un insieme piu' largo e
    // spunta fra le righe di chi sta davanti solo se davanti la densita' e'
    // maggiore. Senza questo termine cinque pareti velate in fila si vedevano
    // come una sola.
    density = mix(density, ${XRAY.deep.toFixed(2)}, smoothstep(0.0, ${XRAY.depth.toFixed(1)}, enter));
  }
  ghost = ramp;
  return density * ramp;
}
`;

/**
 * Prima riga di main: scartare costa meno di tutto cio' che verrebbe dopo.
 *
 * `inspectGhost` sopravvive al blocco e vale 0 su tutto cio' che il velo non
 * tocca: e' il filo che lega le tre azioni, e chi non e' velato non paga
 * nessuna delle due che vengono dopo.
 */
export const inspectDiscard = /* glsl */ `
  float inspectGhost = 0.0;
  if (uInspectVeil > 0.0) {
    float window = 0.0;
    float density = inspectDensity(vWorldPosition, window);
    if (density > 0.0) {
      // La gabbia vale solo dove c'e' una lente, cioe' nei raggi X. Il velo di
      // Block focus copre tutto cio' che sta fuori dall'isolato — mezzo schermo
      // — e li' un reticolo di voxel su ogni cosa sarebbe rumore, non struttura.
      if (uInspectLensMax.x > uInspectLensMin.x) {
        float wire = voxelWire(int(vFaceIndex + 0.5), vWorldPosition);
        density = mix(density, density * ${XRAY.lattice.toFixed(2)}, wire);
      }
      if (hatchThreshold(gl_FragCoord.xy) < density) discard;
      // Quel che resta si scioglie **in proporzione a quanto e' stato tolto**, e
      // non di una quantita' fissa. Due cose ne dipendono, e nessuna delle due
      // e' un dettaglio: il contesto di Block focus, che ha densita' bassa,
      // resta abbastanza leggibile da essere ancora una risposta — velato non
      // vuol dire cancellato — mentre l'occlusore dei raggi X, che ha densita'
      // alta, se ne va davvero. E il filo del voxel, che cede meno di tutti,
      // conserva anche piu' colore: e' giusto cosi', perche' e' lui a portare la
      // sagoma quando la faccia non c'e' piu'.
      inspectGhost = window * density;
    }
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

/**
 * Cio' che resta di un occlusore velato non e' piu' una facciata.
 *
 * Stessa mossa del tappo e per la stessa ragione, su un caso diverso: spegnere
 * il linguaggio di superficie toglie finestre, insegne ed emissivi, che a bassa
 * copertura erano proprio i pixel che leggevano come sporco. Una finestra accesa
 * ridotta a un ventesimo dei suoi pixel non e' una finestra piu' piccola, e'
 * un puntino luminoso davanti a cio' che si sta cercando di guardare.
 */
export const inspectGhostSurface = /* glsl */ `
  if (inspectGhost > 0.0) surfaceIndex = ${SURFACE_KIND.plain};
`;

/**
 * L'ultima delle tre azioni: il velo scioglie invece di sbriciolare.
 *
 * Si innesta sulla prospettiva aerea invece di aggiungere un termine suo, e non
 * per risparmiare una riga: la nebbia porta gia' la tinta a cui tende la
 * distanza in questo tema e a quest'ora, quindi cio' che e' velato legge come
 * **lontano**, che e' esattamente il rapporto che deve avere con il soggetto.
 * Un colore proprio andrebbe scelto per trentadue palette e sbagliato in
 * qualcuna. `max` e non somma: un frammento gia' in fondo alla nebbia non
 * diventa piu' che sciolto.
 */
export const inspectMelt = /* glsl */ `
  fogVeil = max(fogVeil, inspectGhost * ${INSPECT.melt.toFixed(2)});
`;

/**
 * Il landmark sotto la lente si accende invece di velarsi.
 *
 * E' la seconda azione dei raggi X, e non un velo invertito: il soggetto sta
 * dentro la lente — il test a lastre gli da' `enter <= 0` — e non si vela mai.
 * Qui riceve in piu' una tinta calda che lo stacca da cio' che gli sta davanti,
 * ormai ridotto a gabbia e sciolto nell'aria.
 *
 * Il predicato legge la **cella** e non la posizione del frammento: due facce a
 * contatto — l'ultima del landmark e la prima dell'edificio accanto — stanno
 * sulla stessa coordinata, ma la loro cella differisce perche' il raggio di
 * mezza cella lungo la normale spinge ciascuna dentro il proprio volume. E'
 * l'unica cosa che distingue il landmark dal vicino che lo tocca.
 */
export const inspectGlow = /* glsl */ `
  if (uInspectGlowMax.x > uInspectGlowMin.x) {
    bool landmarkCell =
      cell.x >= uInspectGlowMin.x && cell.x < uInspectGlowMax.x &&
      cell.y >= uInspectGlowMin.y && cell.y < uInspectGlowMax.y &&
      cell.z >= uInspectGlowMin.z && cell.z < uInspectGlowMax.z;
    if (landmarkCell) {
      vec3 glow = vec3(
        ${XRAY.glow.r.toFixed(3)},
        ${XRAY.glow.g.toFixed(3)},
        ${XRAY.glow.b.toFixed(3)});
      shaded = mix(shaded, glow, ${XRAY.glow.tint.toFixed(2)});
      shaded += glow * ${XRAY.glow.boost.toFixed(2)};
    }
  }
`;
