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
  isExposed,
  LATERAL_FACES,
  openRoof,
  propRoll,
  underSetback,
  type ChunkOrigin,
  type SurfaceCells,
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
  /**
   * Le stesse celle, divise per marchio.
   *
   * **Non e' una comodita', e' il costo del disegno.** `appendCarveDetail` fa
   * una passata per ogni superficie di ogni ricetta su ogni faccia — una
   * ottantina in tutto — e su una lista unica ognuna scorrerebbe anche tutte le
   * celle che non la riguardano. Diviso qui, dove le celle si stanno gia'
   * visitando, ogni passata vede solo le proprie.
   *
   * L'indice e' il byte della maschera, quindi bastano `ricette x 8` caselle.
   */
  readonly byMark: number[][];
  /** Quad prenotati. Mai oltre `MAX_CARVE_QUADS_PER_CHUNK`. */
  quads: number;
  /** Serve al disegno per rispondere sulle celle dell'anello. Vedi `carveKindFor`. */
  origin: ChunkOrigin;
}

/**
 * Vive a livello di modulo per la stessa ragione di `LiftedCover`: e' il buffer
 * di lavoro di una funzione sola, e il worker mesha un chunk alla volta.
 */
const plan: CarvePlan = {
  cells: [],
  byMark: Array.from({ length: 64 }, () => [] as number[]),
  quads: 0,
  origin: [0, 0, 0],
};

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
 * parti per due ragioni diverse. `planCarves` lo interroga sulle celle che
 * `collectSurfaceCells` gli ha gia' filtrato, e ne scrive il risultato nella
 * maschera. `carveGeometry` lo interroga
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
    // Il vassoio della terrazza: **tutto** il calpestio scende sotto il filo del
    // parapetto, che resta dov'era e smette di leggere come un bordino. Da fuori
    // la terrazza e' identica a prima — la facciata sale fino alla stessa quota —
    // e a cambiare e' cio' che si vede guardandoci dentro.
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

  // **Una lettura del voxel e una del vicino, poi solo confronti.** Il predicato
  // gira su ogni coppia (cella, faccia esposta) del chunk, e la versione che
  // interrogava `hasSurfaceFace` due volte prima di `facadeAt` ne pagava sei di
  // indirizzamenti dove ne bastano due. La superficie del voxel decide da sola
  // quale famiglia di ricette puo' rivendicarlo: un portale non e' mai una
  // vetrata, e nessuno dei due e' una facciata d'uso.
  const block = blockAt(padded, x, y, z);
  if (block === 0 || !isExposed(padded, x, y, z, face)) return CARVE_KIND.none;
  const surface = blockSurface(block);

  // La soglia: il vano dell'ingresso arretra dal filo della parete, e i montanti
  // di `emitPortals` girano attorno alla bocca invece che su un muro piatto.
  if (surface === SURFACE_KIND.portal) return CARVE_KIND.threshold;

  // La vetrata a filo interno: la fascia d'accento rientra dietro la cornice che
  // `emitLuminous` gia' le disegna, e quella cornice diventa una strombatura.
  if (surface === SURFACE_KIND.luminous) return CARVE_KIND.glazing;

  if (surface !== SURFACE_KIND.habitat && surface !== SURFACE_KIND.industrial &&
    surface !== SURFACE_KIND.civic) {
    return CARVE_KIND.none;
  }
  // L'acqua porta `WATER_CLASS` in questi stessi bit, e due dei suoi tre valori
  // coincidono con `habitat` e `industrial`. A riconoscerla dalla palette c'e'
  // gia' `facadeAt`, ed e' l'unico posto che deve saperlo.
  if (facadeAt(padded, x, y, z, face) === SURFACE_KIND.plain) return CARVE_KIND.none;

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

  // **I dadi prima di `frontage`, ed e' una scelta di costo come in `emitAwnings`.**
  // `frontage` e' l'unico predicato che scandisce una colonna — sei letture — e
  // le due ricette che lo vogliono scattano su una cella su venti e su una su
  // cinquanta. Interrogandolo per primo lo pagavano tutte.
  if (z >= ALCOVE_FLOOR && z <= STAIRWELL_TOP &&
    propRoll(origin, x, y, 0, STAIRWELL_SALT) < STAIRWELL_CHANCE &&
    !frontage(padded, x, y, z, face)) {
    return CARVE_KIND.stairwell;
  }

  // La nicchia, e non risponde sull'anello: e' l'unica ricetta che non corre,
  // quindi nessuna corsa le chiedera' mai se prosegue.
  if (!outside && z >= ALCOVE_FLOOR &&
    propRoll(origin, x, y, z, ALCOVE_SALT) < ALCOVE_CHANCE &&
    !frontage(padded, x, y, z, face)) {
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
 * **Non scandisce il volume, riceve le liste che `collectSurfaceCells` ha gia'
 * fatto.** La prima versione faceva la sua passata su tutte le 32 768 celle e
 * interrogava quattro facce a testa: costava 7,8 ms per chunk, cioe' da sola
 * quanto l'intero budget di rebuild. Le liste per superficie tolgono di mezzo il
 * vuoto e i linguaggi che nessuna ricetta rivendica; `facadeByFace` toglie anche
 * le celle **interne** di un edificio pieno, che sono i due terzi e non potranno
 * mai portare un vano. E' lo stesso ragionamento per cui esistono per i prop, e
 * hoistare quella scansione sopra il greedy pass non ne aggiunge una: la sposta.
 *
 * L'ordine e' quello di `carveMarkFor`, e deve restarlo: la prima ricetta che
 * rivendica una cella se la prende, e chi cuce due chunk si aspetta la stessa
 * risposta da entrambe le parti. Le ricette non si contendono quasi mai una
 * cella — la superficie del voxel ne ammette una sola — tranne dentro il gruppo
 * di facciata, dove decide l'ordine delle facce.
 *
 * Quando la riserva finisce la scansione **si ferma**. Fermarsi e' prevedibile,
 * e la coda di una corsa gia' aperta che resta fuori non apre un buco: `emitRuns`
 * legge la maschera, quindi la corsa finisce dove finisce il piano e le celle
 * successive conservano la loro faccia piatta.
 */
export function planCarves(
  padded: Uint8Array,
  marks: Uint8Array,
  origin: ChunkOrigin,
  cells: SurfaceCells,
): CarvePlan {
  plan.cells.length = 0;
  plan.quads = 0;
  plan.origin = origin;
  for (const bucket of plan.byMark) bucket.length = 0;

  // Il vassoio per primo, come in `carveMarkFor`. Non contende niente a nessuno:
  // `roofTech` non e' una facciata d'uso, quindi nessuna ricetta laterale la
  // guarda.
  if (!claimAll(padded, marks, origin, cells.bySurface[SURFACE_KIND.roofTech], FACE_PZ)) {
    return plan;
  }

  // Portali e vetrate arrivano dalle liste **volumetriche**: `collectSurfaceCells`
  // filtra per faccia esposta solo i tre linguaggi d'uso, e l'esposizione qui la
  // verifica `carveKindFor` con la lettura che farebbe comunque.
  for (const surface of [SURFACE_KIND.portal, SURFACE_KIND.luminous] as const) {
    for (const face of LATERAL_FACES) {
      if (!claimAll(padded, marks, origin, cells.bySurface[surface], face)) return plan;
    }
  }

  // Le facciate d'uso: qui la lista e' gia' filtrata per faccia, quindi ogni
  // cella si guarda una volta sola e sulla faccia giusta.
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    if (!claimAll(padded, marks, origin, cells.facadeByFace[i], LATERAL_FACES[i])) return plan;
  }

  return plan;
}

/**
 * Prende per il piano ogni cella della lista che rivendica un vano su `face`.
 *
 * Restituisce `false` quando la riserva e' finita, e il chiamante si ferma.
 * Salta le celle gia' marcate: una cella si scava su una faccia sola, e chi e'
 * arrivato prima ha la precedenza.
 */
function claimAll(
  padded: Uint8Array,
  marks: Uint8Array,
  origin: ChunkOrigin,
  cells: readonly number[],
  face: number,
): boolean {
  for (const cell of cells) {
    const x = cell & 31;
    const y = (cell >>> 5) & 31;
    const z = cell >>> 10;
    const index = carveIndex(x, y, z);
    if (marks[index] !== 0) continue;

    const kind = carveKindFor(padded, origin, x, y, z, face);
    if (kind === CARVE_KIND.none) continue;

    const mark = packCarveMark(kind as CarveKind, face);
    const cost = continuesRun(marks, mark, x, y, z) ? CONTINUE_COST : CARVE_COST[kind];
    if (plan.quads + cost > MAX_CARVE_QUADS_PER_CHUNK) return false;

    marks[index] = mark;
    plan.cells.push(cell);
    plan.byMark[mark].push(cell);
    plan.quads += cost;
  }
  return true;
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
