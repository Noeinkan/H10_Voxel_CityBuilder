import { CHUNK, FACE_NEIGHBOUR_OFFSETS, FACE_PZ } from '../../world/chunkCoords';
import { blockSurface, SURFACE_KIND } from '../../world/visualBlock';
import {
  CARVE_KIND,
  carveIndex,
  packCarveMark,
  type CarveKind,
} from './carveMarks';
import {
  blockAt,
  facadeAt,
  facadeHorizontalAxis,
  frontage,
  hasSurfaceFace,
  LATERAL_FACES,
  openRoof,
  propRoll,
  underSetback,
  type ChunkOrigin,
} from './microGeometry';

/**
 * Dove si scava, e con quale ricetta. Qui non si disegna niente.
 *
 * **Il piano precede il greedy pass, ed e' l'unica ragione per cui esiste come
 * fase a se'.** Il mask loop deve sapere quali facce **non** emettere prima di
 * emetterne una qualsiasi, perche' un quad piatto lasciato sopra un vano lo
 * coprirebbe per intero. Da qui tutto il resto: il piano sta in un modulo suo, il
 * disegno in `carveGeometry.ts`, e fra i due passa **soltanto la maschera** —
 * chi disegna non rivaluta mai un aggancio, lo rilegge. E' cosi' che le due
 * meta' non possono divergere.
 *
 * **A differenza delle coperture, scavare non tocca il volume.** `liftGroundCover`
 * svuota la cella e deve percio' precedere cielo, bagliore e AO; qui la cella
 * resta piena e cambia solo cio' che il mesher disegna sulla sua superficie. Ne
 * segue una proprieta' che vale la pena avere in testa quando si aggiunge una
 * ricetta: una nicchia non scurisce il muro a due metri, e non deve.
 *
 * **Una cella si scava su una faccia sola** — il byte della maschera ne porta una
 * — quindi un angolo d'isolato prende la prima faccia che una ricetta rivendica.
 * L'ordine di `LATERAL_FACES` decide, ed e' stabile.
 */

/**
 * Riserva di quad per gli scavi, sotto il tetto dei dettagli.
 *
 * **Non e' un budget come gli altri, e' una garanzia.** Un dettaglio additivo
 * troncato lascia un edificio piu' spoglio; uno riduttivo troncato lascia un
 * edificio **bucato**, perche' la sua faccia base e' gia' stata soppressa dal
 * mask loop. Il piano si ferma qui e `appendCarveDetail` scrive per primo: cosi'
 * uno scavo o e' interamente pianificato e interamente pagato, o non esiste e la
 * parete resta piatta. Non c'e' una terza possibilita'.
 */
export const MAX_CARVE_QUADS_PER_CHUNK = 6144;

/**
 * Quad che una cella si prenota **aprendo** una corsa, per ricetta.
 *
 * Sono limiti superiori: un vano isolato costa quattro spalle piu' il pannello
 * di fondo, la nicchia ci aggiunge le quattro lastre del telaio, e la loggia il
 * mezzanino che ci puo' cadere dentro. Una cella che *prosegue* una corsa gia'
 * aperta costa invece quasi niente, e la carica lo riconosce: senza,
 * `MAX_CARVE_QUADS_PER_CHUNK` verrebbe esaurito da una fascia luminosa lunga
 * quattordici celle che di quad ne emette cinque in tutto.
 */
const CARVE_COST: readonly number[] = [0, 5, 5, 10, 9, 5, 5];

/** Quanto costa proseguire una corsa gia' aperta. */
const CONTINUE_COST = 1;

/** Sotto lo zoccolo non si scava: li' ci sono gli ingressi, non le nicchie. */
const ALCOVE_FLOOR = 2;

/** Facciate di retro che portano una nicchia. Bassa: e' la sola ricetta che spezza una corsa greedy. */
const ALCOVE_CHANCE = 0.02;

/** Fin dove un vano scala ha senso: sopra, si prende l'ascensore. E' la quota di `microStreet`. */
const STAIRWELL_TOP = 14;

/** Colonne di retro che portano un vano scala. */
const STAIRWELL_CHANCE = 0.05;

const ALCOVE_SALT = 0x3b_71_c2;
const STAIRWELL_SALT = 0x2f_6b_c8_05;

export interface CarvePlan {
  /** Celle scavate, impacchettate come in `collectSurfaceCells`: `x | y<<5 | z<<10`. */
  readonly cells: number[];
  /** Quad prenotati. Mai oltre `MAX_CARVE_QUADS_PER_CHUNK`. */
  quads: number;
  /** Serve al disegno per rispondere sulle celle dell'anello. Vedi `carveKindFor`. */
  origin: ChunkOrigin;
}

/**
 * Vive a livello di modulo per la stessa ragione di `LiftedCover`: e' il buffer
 * di lavoro di una funzione sola, e il worker mesha un chunk alla volta.
 */
const plan: CarvePlan = { cells: [], quads: 0, origin: [0, 0, 0] };

/** true se la coordinata sta dentro il volume paddato, anello compreso. */
function inPadded(c: number): boolean {
  return c >= -1 && c <= CHUNK;
}

/**
 * true se il tetto scoperto prosegue su **tutti e due** gli assi in piano.
 *
 * **Su un asse solo non basta, e non e' pignoleria.** Una cima isolata non ha
 * vicini affatto, e una cornice larga un voxel ne ha su un asse solo: in
 * entrambi i casi non c'e' un piano di calpestio da abbassare, c'e' un filo — e
 * il vano finirebbe per costare per cella invece che per terrazza, che e'
 * esattamente la proprieta' che tiene fuori controllo il costo dei dettagli. Con
 * questa condizione un tetto di quattordici per quattordici si scava tutto, una
 * striscia di sedici celle non si scava affatto, e la cima di una guglia
 * conserva il collarino che `emitFinials` le posa sopra.
 */
function roofOnBothAxes(padded: Uint8Array, x: number, y: number, z: number): boolean {
  const alongX = openRoof(padded, x - 1, y, z) || openRoof(padded, x + 1, y, z);
  return alongX && (openRoof(padded, x, y - 1, z) || openRoof(padded, x, y + 1, z));
}

/**
 * La ricetta che questa cella chiede su questa faccia, o `CARVE_KIND.none`.
 *
 * **E' l'unico posto in cui vive un aggancio di scavo**, e viene chiamato da due
 * parti per due ragioni diverse. `planCarves` lo interroga su ogni cella del
 * chunk e ne scrive il risultato nella maschera. `carveGeometry` lo interroga
 * **solo sull'anello di padding**, quando `emitRuns` chiede se una corsa
 * prosegue oltre il confine: li' la maschera non c'e' — appartiene al chunk
 * accanto — e senza risposta ogni cucitura mostrerebbe la testata del vano come
 * un setto verticale ogni trentadue celle.
 *
 * Sull'anello rispondono le sole ricette di facciata: le altre leggerebbero
 * vicini fuori dal volume paddato, e `paddedIdx` non se ne accorgerebbe.
 */
export function carveKindFor(
  padded: Uint8Array,
  origin: ChunkOrigin,
  x: number,
  y: number,
  z: number,
  face: number,
): number {
  if (!inPadded(x) || !inPadded(y) || !inPadded(z)) return CARVE_KIND.none;
  const outside = x < 0 || x >= CHUNK || y < 0 || y >= CHUNK || z < 0 || z >= CHUNK;

  if (face === FACE_PZ) {
    // Il vassoio della terrazza: il calpestio scende sotto il filo del
    // parapetto, che smette di leggere come un bordino e comincia a leggere come
    // un parapetto. Sta sul **contorno** del tetto — dove `emitRoofTech` mette
    // gia' la sua ringhiera — e non sul suo interno, che il greedy fonde in un
    // quad solo e che scavare costerebbe senza mostrare niente.
    //
    // Non sugli arretramenti: li' `emitTerraceBoxes` posa fioriere e cassoni a
    // partire da `(z + 1) * U`, e abbassare il piano sotto di loro li lascerebbe
    // sospesi. L'anello che resta alto attorno alla torre non e' un difetto: e'
    // il cordolo su cui poggiano le fioriere.
    //
    // Antenne, chiome e pergole invece stanno **dentro** il vassoio, e per loro
    // la cura e' l'altra: leggono `roofInset` e scendono con il piano.
    if (outside) return CARVE_KIND.none;
    return openRoof(padded, x, y, z) && !underSetback(padded, x, y, z) &&
      roofOnBothAxes(padded, x, y, z)
      ? CARVE_KIND.tray
      : CARVE_KIND.none;
  }

  // La soglia: il vano dell'ingresso arretra dal filo della parete, e i montanti
  // di `emitPortals` girano attorno alla bocca invece che su un muro piatto.
  if (hasSurfaceFace(padded, x, y, z, SURFACE_KIND.portal, face)) return CARVE_KIND.threshold;

  // La vetrata a filo interno: la fascia d'accento rientra dietro la cornice che
  // `emitLuminous` gia' le disegna, e quella cornice diventa una strombatura.
  if (hasSurfaceFace(padded, x, y, z, SURFACE_KIND.luminous, face)) return CARVE_KIND.glazing;

  const use = facadeAt(padded, x, y, z, face);
  if (use === SURFACE_KIND.plain) return CARVE_KIND.none;

  // La loggia: il piano di facciata si ritira sotto lo sbalzo che lo copre.
  // L'aggancio e' quello di `emitSoffits` letto dal basso — la' e' l'intradosso
  // che finisce nel vuoto, qui e' il vuoto che ha un intradosso sopra — e come
  // quello non tira nessun dado: e' struttura, sta dove il volume la mette.
  const offset = FACE_NEIGHBOUR_OFFSETS[face];
  const ax = x + offset[0];
  const ay = y + offset[1];
  if (inPadded(ax) && inPadded(ay) && inPadded(z + 1) &&
    blockAt(padded, ax, ay, z + 1) !== 0) {
    return CARVE_KIND.loggia;
  }

  // Da qui in giu' si va sul retro, dove `frontage` e' falso: un vano scala o
  // una nicchia sul fronte strada leggerebbero come un difetto della facciata.
  if (frontage(padded, x, y, z, face)) return CARVE_KIND.none;

  // Il vano scala. Il tiro si semina sulla **colonna** — `z` fisso a zero — come
  // fanno le calate e i rampicanti: cosi' il predicato risponde uguale a tutte le
  // quote e la corsa verticale diventa un box solo invece di tratti staccati.
  if (z >= ALCOVE_FLOOR && z <= STAIRWELL_TOP &&
    propRoll(origin, x, y, 0, STAIRWELL_SALT) < STAIRWELL_CHANCE) {
    return CARVE_KIND.stairwell;
  }

  // La nicchia, e non risponde sull'anello: e' l'unica ricetta che non corre,
  // quindi nessuna corsa le chiedera' mai se prosegue.
  if (!outside && z >= ALCOVE_FLOOR &&
    propRoll(origin, x, y, z, ALCOVE_SALT) < ALCOVE_CHANCE) {
    return CARVE_KIND.alcove;
  }

  return CARVE_KIND.none;
}

/**
 * Il marchio che questa cella riceverebbe, priorita' di faccia compresa.
 *
 * E' la funzione che `planCarves` applica a ogni cella del chunk, ed e' anche
 * quella con cui `carveGeometry` risponde sull'anello: chiedere la sola ricetta
 * per una faccia non basterebbe, perche' una cella che ne rivendica due ne
 * ottiene una sola, e chi cuce due chunk deve sapere **quale**.
 */
export function carveMarkFor(
  padded: Uint8Array,
  origin: ChunkOrigin,
  x: number,
  y: number,
  z: number,
): number {
  let kind = carveKindFor(padded, origin, x, y, z, FACE_PZ);
  if (kind !== CARVE_KIND.none) return packCarveMark(kind as CarveKind, FACE_PZ);
  for (const face of LATERAL_FACES) {
    kind = carveKindFor(padded, origin, x, y, z, face);
    if (kind !== CARVE_KIND.none) return packCarveMark(kind as CarveKind, face);
  }
  return 0;
}

/** Asse su cui corre il vano di una ricetta. La nicchia non corre e vale zero. */
export function carveRunAxis(kind: number, face: number): 0 | 1 | 2 {
  if (kind === CARVE_KIND.stairwell) return 2;
  if (kind === CARVE_KIND.tray) return 0;
  if (kind === CARVE_KIND.alcove) return 0;
  return facadeHorizontalAxis(face);
}

/**
 * Riempie la maschera degli scavi e restituisce il piano.
 *
 * La scansione ha la stessa forma e lo stesso filtro di `collectSurfaceCells`:
 * salta il vuoto, salta `plain` e `utility`. Non e' un'ottimizzazione di
 * contorno — `utility` e' la superficie di tutte le carreggiate e di tutti gli
 * impalcati, cioe' l'area dipinta piu' estesa del mondo, e nessuna ricetta la
 * rivendica.
 *
 * Quando la riserva finisce la scansione **si ferma** invece di saltare la
 * singola cella: fermarsi e' prevedibile e lascia intatta la coda del chunk,
 * mentre saltare farebbe entrare le ricette a caso a seconda di quanto costano.
 * La coda di una corsa gia' aperta che resta fuori non apre un buco: `emitRuns`
 * legge la maschera, quindi la corsa finisce dove finisce il piano e le celle
 * successive conservano la loro faccia piatta.
 */
export function planCarves(
  padded: Uint8Array,
  marks: Uint8Array,
  origin: ChunkOrigin,
): CarvePlan {
  plan.cells.length = 0;
  plan.quads = 0;
  plan.origin = origin;

  for (let z = 0; z < CHUNK; z++) {
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const block = blockAt(padded, x, y, z);
        if (block === 0) continue;
        const surface = blockSurface(block);
        if (surface === SURFACE_KIND.plain || surface === SURFACE_KIND.utility) continue;

        const mark = carveMarkFor(padded, origin, x, y, z);
        if (mark === 0) continue;

        const cost = continuesRun(marks, mark, x, y, z)
          ? CONTINUE_COST
          : CARVE_COST[mark >>> 3];
        if (plan.quads + cost > MAX_CARVE_QUADS_PER_CHUNK) return plan;

        marks[carveIndex(x, y, z)] = mark;
        plan.cells.push(x | (y << 5) | (z << 10));
        plan.quads += cost;
      }
    }
  }

  return plan;
}

/**
 * true se la cella precedente lungo l'asse di corsa porta gia' lo stesso marchio.
 *
 * La scansione cresce in x, poi y, poi z, quindi la precedente lungo un asse
 * qualsiasi e' sempre gia' stata visitata: la maschera basta, e non serve un
 * secondo giro per contare le corse.
 */
function continuesRun(
  marks: Uint8Array,
  mark: number,
  x: number,
  y: number,
  z: number,
): boolean {
  const kind = mark >>> 3;
  if (kind === CARVE_KIND.alcove) return false;
  const axis = carveRunAxis(kind, mark & 7);
  const px = axis === 0 ? x - 1 : x;
  const py = axis === 1 ? y - 1 : y;
  const pz = axis === 2 ? z - 1 : z;
  if (px < 0 || py < 0 || pz < 0) return false;
  return marks[carveIndex(px, py, pz)] === mark;
}

/**
 * Azzera le sole celle marcate: la maschera vive nello scratch, che il pool
 * riusa fra un job e l'altro, e ripulirla per intero costerebbe il volume invece
 * del piano.
 */
export function clearCarves(marks: Uint8Array, carves: CarvePlan): void {
  for (const cell of carves.cells) {
    marks[carveIndex(cell & 31, (cell >>> 5) & 31, cell >>> 10)] = 0;
  }
}
