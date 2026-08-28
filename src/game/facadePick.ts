import { AERIAL_FACE, type AerialFace } from '../world/aerial/terracePlan';
import type { Ray3 } from './surfacePick';

/**
 * Su quale faccia di un edificio cade il puntatore.
 *
 * E' la terza domanda del cursore, accanto alle due di `surfacePick.ts` — «su
 * quale terra» e «cosa sto indicando» — e nasce dallo stesso difetto: la faccia
 * usciva dal registro invece che dal raggio. Puntare il retro di un grattacielo
 * con lo Skyport in mano lo mostrava sul fronte strada, cioe' spesso sulla
 * faccia opposta a quella sotto il mouse.
 *
 * Puro e senza allocazioni oltre al risultato: gira una volta per pointermove.
 */

/** La scatola di un edificio in coordinate di mondo, estremi esclusi in alto. */
export interface FacadeBox {
  /** Angolo minimo dell'impronta. */
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /** Prima quota occupata. */
  readonly baseZ: number;
  /** Voxel occupati in altezza a partire da `baseZ`. */
  readonly height: number;
}

/**
 * La faccia sotto il puntatore, o null se non ce n'e' una da scegliere.
 *
 * Il punto d'ingresso del raggio nella scatola dice da che parte si sta
 * guardando l'edificio: entrando da una parete laterale la distanza da quella
 * parete e' zero e vince lei; entrando dal tetto — il mouse galleggia sul
 * colmo, non su un fianco — vince lo spigolo piu' vicino, che e' la faccia che
 * sullo schermo sta sotto il puntatore. Un pareggio esatto (il centro del
 * tetto) non sceglie, e chi chiama ricade sul fronte strada di sempre.
 */
export function pickFacade(ray: Ray3, box: FacadeBox): AerialFace | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  const minX = box.x;
  const maxX = box.x + box.sizeX;
  const minY = box.y;
  const maxY = box.y + box.sizeY;
  const minZ = box.baseZ;
  const maxZ = box.baseZ + box.height;

  const ix = axisInterval(ox, dx, minX, maxX);
  const iy = axisInterval(oy, dy, minY, maxY);
  const iz = axisInterval(oz, dz, minZ, maxZ);
  if (ix === null || iy === null || iz === null) return null;

  const tEnter = Math.max(ix[0], iy[0], iz[0]);
  const tExit = Math.min(ix[1], iy[1], iz[1]);
  if (tEnter > tExit || tEnter < 0) return null;

  const entry = {
    x: ox + dx * tEnter,
    y: oy + dy * tEnter,
    z: oz + dz * tEnter,
  };

  // Distanza del punto d'ingresso dalle quattro pareti verticali: zero sulla
  // parete attraversata, positiva per le altre — e dal tetto, la parete piu'
  // vicina al punto d'atterraggio. Gli indici coincidono con `FACING`.
  const distances: readonly { face: AerialFace; d: number }[] = [
    { face: AERIAL_FACE.east, d: maxX - entry.x },
    { face: AERIAL_FACE.west, d: entry.x - minX },
    { face: AERIAL_FACE.north, d: maxY - entry.y },
    { face: AERIAL_FACE.south, d: entry.y - minY },
  ];

  let best = distances[0];
  let tied = false;
  for (let i = 1; i < distances.length; i++) {
    const delta = distances[i].d - best.d;
    if (delta < -EPSILON) {
      best = distances[i];
      tied = false;
    } else if (delta <= EPSILON) {
      tied = true;
    }
  }
  return tied ? null : best.face;
}

/** Due distanze piu' vicine di questo sono un pareggio: non si sceglie. */
const EPSILON = 1e-9;

/**
 * Intervallo di `t` in cui il raggio attraversa `[lo, hi]` su un asse, o null.
 *
 * Un raggio parallelo all'asse e fuori dall'intervallo non incontra mai la
 * scatola; dentro, non restringe l'intersezione — il suo contributo e'
 * l'infinito pratico, come i predicati aperti di `inspect.ts`.
 */
function axisInterval(
  o: number,
  d: number,
  lo: number,
  hi: number,
): readonly [number, number] | null {
  if (Math.abs(d) < 1e-12) {
    if (o < lo || o >= hi) return null;
    return [-Infinity, Infinity];
  }
  const tLo = (lo - o) / d;
  const tHi = (hi - o) / d;
  return tLo <= tHi ? [tLo, tHi] : [tHi, tLo];
}
