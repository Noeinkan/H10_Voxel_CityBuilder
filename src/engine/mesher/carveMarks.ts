import { FACE_PZ, paddedIdx } from '../../world/chunkCoords';

/**
 * Le ricette di scavo e il byte che le trasporta.
 *
 * **E' un modulo foglia apposta.** Non importa niente da questa cartella, e per
 * questo puo' essere letto da tutti: dal greedy pass, che consulta la maschera
 * nel suo ciclo piu' caldo; da `carvePlan.ts`, che la riempie; da
 * `carveGeometry.ts`, che ci disegna dentro; e da `microGeometry.ts` e
 * `microStreet.ts`, che devono sapere di quanto la parete e' arretrata per
 * appoggiarci sopra i loro prismi. Tenere qui le sole tabelle evita il ciclo che
 * i due moduli di dettaglio si concedono gia' fra loro — quello e' sicuro solo
 * perche' nessuno dei due valuta l'altro al caricamento, e non e' una liberta'
 * da spendere due volte.
 *
 * **Un byte per cella, e una faccia sola.** La ricetta sta nei bit 3-7, la
 * faccia scavata nei bit 0-2; lo zero e' «questa cella non si scava», per cui le
 * ricette partono da 1. Ne segue una restrizione che vale la pena dichiarare: un
 * angolo d'isolato, che espone due facce ortogonali, si scava su una sola — la
 * prima che una ricetta visita. Costa un caso raro; il byte singolo tiene il
 * mask loop a una lettura e due confronti, ed e' un ciclo che gira centomila
 * volte per chunk.
 */

export const CARVE_KIND = {
  none: 0,
  /** La soglia d'ingresso: il vano del portale arretra dal filo della parete. */
  threshold: 1,
  /** La vetrata a filo interno: la fascia d'accento rientra dietro la sua cornice. */
  glazing: 2,
  /** La loggia: il piano di facciata coperto da uno sbalzo si ritira sotto di esso. */
  loggia: 3,
  /** La nicchia: l'unico vano piu' piccolo della cella, quindi l'unico con un telaio. */
  alcove: 4,
  /** Il vano scala: la colonna di retro che ospita la rampa di `microStreet`. */
  stairwell: 5,
  /** Il vassoio: il calpestio della terrazza scende sotto il filo del parapetto. */
  tray: 6,
  /** Lo zoccolo: la prima riga di facciata sopra il suolo arretra, e fa ombra. */
  plinth: 7,
  /** La feritoia: la riga sotto il ciglio di un capannone rientra in una fessura. */
  vent: 8,
} as const;

export type CarveKind = (typeof CARVE_KIND)[keyof typeof CARVE_KIND];

/**
 * Quante ricette esistono, `none` compresa.
 *
 * **Serve perche' le tabelle di questo gruppo sono cinque e vivono in tre file**
 * — profondita' e arretramento qui, carica in `carvePlan.ts`, materiale e ordine
 * di disegno in `carveGeometry.ts` — e una ricetta nuova che ne dimentichi una
 * non fallisce: legge `undefined`, lo somma a una coordinata e disegna un prisma
 * a `NaN` che nessuno vede. Un test lo confronta con la lunghezza di ognuna.
 *
 * Il byte ne ammette trentuno oltre lo zero: la ricetta sta nei bit 3-7.
 */
export const CARVE_KIND_COUNT = Object.keys(CARVE_KIND).length;

/**
 * Caselle del secchiello per marchio di `CarvePlan`: `ricette x 8 facce`.
 *
 * Era un letterale a 64, che regge esattamente fino alla settima ricetta —
 * `packCarveMark(7, 7)` vale 63 — e alla nona diventa un accesso fuori array su
 * cui `.push` esplode. Derivarlo toglie di mezzo la trappola invece di spostarla
 * di due ricette.
 */
export const CARVE_MARK_COUNT = CARVE_KIND_COUNT * 8;

/**
 * Profondita' del vano in sedicesimi, per ricetta.
 *
 * Nessuna arriva a meta' voxel, ed e' deliberato: oltre, il vano smette di
 * leggersi come un rientro della parete e comincia a leggersi come un pezzo di
 * volume mancante — che e' cio' che il portico della grammatica fa gia', a
 * granularita' di voxel intero e con il volume tolto per davvero.
 */
export const CARVE_DEPTH: readonly number[] = [0, 3, 2, 4, 5, 6, 2, 2, 3];

/**
 * Di quanto la ricetta arretra il piano di facciata **per intero**.
 *
 * Vale zero dove lo scavo non sposta tutta la faccia — la nicchia lascia il suo
 * anello di parete al filo, e il vassoio scava in orizzontale — quindi un prisma
 * additivo che si appoggia li' non deve arretrare di niente. E' la sola cosa che
 * `microGeometry.ts` chiede a questo modulo, ed e' il motivo per cui la tabella
 * sta qui e non insieme alle ricette.
 */
const PLANE_INSET: readonly number[] = [0, 3, 2, 4, 0, 6, 0, 2, 3];

/** Il byte da scrivere nella maschera. `face` e' un `FACE_*` di `chunkCoords`. */
export function packCarveMark(kind: CarveKind, face: number): number {
  return (kind << 3) | face;
}

/** Indice nella maschera, che e' paddata come il volume. */
export function carveIndex(x: number, y: number, z: number): number {
  return paddedIdx(x + 1, y + 1, z + 1);
}

/**
 * true se questa cella e' scavata **su questa faccia**.
 *
 * E' il predicato che il mask loop del greedy pass chiama per ogni faccia che
 * sta per emettere: una lettura e due confronti, e il confronto sulla faccia
 * cade per primo su tutto cio' che e' scavato altrove.
 */
export function carvedFace(marks: Uint8Array, p: number, face: number): boolean {
  return marks[p] >= 8 && (marks[p] & 7) === face;
}

/** La ricetta di questa cella, o `CARVE_KIND.none`. */
export function carveKindAt(marks: Uint8Array, p: number): number {
  return marks[p] >>> 3;
}

/** La faccia scavata di questa cella. Ha senso solo se `carveKindAt` non e' zero. */
export function carveFaceAt(marks: Uint8Array, p: number): number {
  return marks[p] & 7;
}

/**
 * Quanto e' arretrato il piano di facciata di questa cella, in sedicesimi.
 *
 * Zero se non e' scavata, se lo e' su un'altra faccia, o se la ricetta non
 * sposta la faccia per intero. E' cio' che serve a un montante o a un traverso
 * per stare **sul filo della bocca** invece che a mezz'aria davanti al vano.
 */
export function facadeInset(
  marks: Uint8Array,
  x: number,
  y: number,
  z: number,
  face: number,
): number {
  const p = carveIndex(x, y, z);
  return carvedFace(marks, p, face) ? PLANE_INSET[marks[p] >>> 3] : 0;
}

/**
 * Di quanto e' sceso il piano di calpestio di questo tetto, in sedicesimi.
 *
 * E' il gemello verticale di `facadeInset`, e serve alla stessa cosa: un'antenna,
 * una chioma o una pergola partono da `(z + 1) * U`, che sopra un vassoio non e'
 * piu' il piano su cui poggiano. Il parapetto invece **non** lo legge, ed e' la
 * ragione per cui il vassoio esiste: resta dov'era, e da dentro cresce.
 */
export function roofInset(marks: Uint8Array, x: number, y: number, z: number): number {
  const p = carveIndex(x, y, z);
  return marks[p] === ((CARVE_KIND.tray << 3) | FACE_PZ) ? CARVE_DEPTH[CARVE_KIND.tray] : 0;
}
