import { STAMP_EMPTY, solidCount, type VoxelStamp } from '../buildings/stamp';

/**
 * La finestra di cielo: cio' che distingue una megastruttura da una torre grossa.
 *
 * **Il vuoto dentro l'ingombro e' il tratto distintivo, e questo file e' il modo
 * di dirlo a un test invece che a un lettore.** Il volume che legge come
 * megastruttura non e' il piu' alto: e' quello che **scavalca il vuoto**. Due
 * steli e un impalcato che li unisce a mezz'altezza ritagliano una finestra di
 * cielo dentro il costruito, e quella finestra e' cio' che dice la scala —
 * senza, una torre grossa e' solo grossa. Una nota di gusto non lo garantisce:
 * un vincolo di ricetta si', e «un'arcologia che riempie il proprio ingombro ha
 * sbagliato ricetta» diventa una suite che non compila.
 *
 * **Si cerca partendo dallo scavalco, non dal vuoto.** Cercare i vuoti vorrebbe
 * dire trovarne uno per ogni portico, ogni scatola cava e ogni intercapedine;
 * cercare invece cio' che sporge **sopra** il vuoto — una colonna piena che sotto
 * non ha niente — trova per costruzione le sole cose che scavalcano, che sono
 * poche e sono quelle che contano. Il vuoto si misura poi scendendo da li'.
 *
 * **Misura, non percorso caldo.** Gira nei test del catalogo e nulla la chiama a
 * ogni tick: costa una scansione dell'inviluppo per quota, che su una ricetta di
 * duecento quote e' qualche decina di migliaia di letture — irrilevante una
 * volta per ricetta, inaccettabile una volta per frame.
 */

/** Il vuoto passante di una struttura, con l'impalcato che lo scavalca. */
export interface SkyWindow {
  /** Riquadro in pianta del vuoto, in coordinate dello stamp. */
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /**
   * Prima e ultima quota **passante**, incluse.
   *
   * Non e' tutto il vuoto sotto l'impalcato: e' la parte di quel vuoto da cui il
   * cielo si vede davvero. Le due coincidono quasi sempre, e dove non coincidono
   * a contare e' questa — un vuoto cieco non e' una finestra, ed e' proprio il
   * caso che il cavedio di uno stelo produce.
   */
  readonly z0: number;
  readonly z1: number;
  /** Quota dell'impalcato che lo scavalca. Mai sotto `z1 + 1`. */
  readonly bridgeZ: number;
  /**
   * Asse lungo cui **si vede il cielo**: 0 e' x, 1 e' y.
   *
   * E' la direzione in cui esiste una linea sgombera da un capo all'altro
   * dell'inviluppo. Il pieno che fa da spalla sta sull'altro asse, per
   * costruzione: se stesse anche su questo, la linea non sarebbe sgombera.
   */
  readonly throughAxis: 0 | 1;
}

export interface SkyWindowRule {
  /** Quote vuote consecutive perche' il vuoto conti come finestra. */
  readonly minHeight: number;
  /** Colonne del riquadro vuoto. */
  readonly minColumns: number;
}

/**
 * Frazione dell'inviluppo che la sagoma riempie, fra 0 e 1.
 *
 * E' l'altra meta' del vincolo, e da sola non basterebbe: un guscio sottile alto
 * duecento voxel ha un riempimento bassissimo e non scavalca niente. Serve a
 * fermare il caso opposto — la ricetta scritta come un parallelepipedo — che la
 * finestra da sola non fermerebbe, perche' un blocco pieno con un buco dentro la
 * troverebbe comunque.
 */
export function fillRatio(stamp: VoxelStamp): number {
  const envelope = stamp.sizeX * stamp.sizeY * stamp.sizeZ;
  if (envelope === 0) return 0;
  return solidCount(stamp) / envelope;
}

/**
 * La finestra di cielo piu' alta della sagoma, o null se non ne ha nessuna.
 *
 * Fra due candidate vince la piu' **alta** e non la piu' larga: e' l'altezza a
 * dire la scala da lontano, ed e' anche cio' che separa una finestra vera dal
 * sottoportico che ogni ricetta ha comunque.
 */
export function skyWindowOf(stamp: VoxelStamp, rule: SkyWindowRule): SkyWindow | null {
  const plane = stamp.sizeX * stamp.sizeY;
  if (plane === 0 || stamp.sizeZ < 2) return null;

  let best: SkyWindow | null = null;
  const seen = new Uint8Array(plane);

  for (let z = 1; z < stamp.sizeZ; z++) {
    seen.fill(0);
    for (let i = 0; i < plane; i++) {
      // Lo scavalco: pieno qui, vuoto subito sotto. Tutto il resto e' parete.
      if (seen[i] === 1) continue;
      if (!solidAt(stamp, i, z) || solidAt(stamp, i, z - 1)) continue;

      const rect = componentRect(stamp, seen, i, z);
      if (rect.sizeX * rect.sizeY < rule.minColumns) continue;

      const depth = voidDepth(stamp, rect, z);
      if (depth < rule.minHeight) continue;

      const open = openRun(stamp, rect, z - depth, z - 1);
      if (open === null || open.z1 - open.z0 + 1 < rule.minHeight) continue;

      const window: SkyWindow = { ...rect, ...open, bridgeZ: z };
      if (best === null || heightOf(window) > heightOf(best)) best = window;
    }
  }

  return best;
}

function solidAt(stamp: VoxelStamp, index: number, z: number): boolean {
  return stamp.voxels[index + stamp.sizeX * stamp.sizeY * z] !== STAMP_EMPTY;
}

interface PlanRect {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

/**
 * Il riquadro della macchia di scavalco che passa per questa colonna.
 *
 * Una visita a quattro vicini, e poi il riquadro che la contiene. Le ricette
 * disegnano scatole, quindi la macchia **e'** quasi sempre il suo riquadro; dove
 * non lo fosse, le colonne in piu' finiscono comunque dentro `voidDepth`, che le
 * misura tutte e risponde con la peggiore. La forma irregolare quindi non
 * sbaglia, al massimo si scarta da sola.
 */
function componentRect(
  stamp: VoxelStamp,
  seen: Uint8Array,
  start: number,
  z: number,
): PlanRect {
  const stack = [start];
  seen[start] = 1;
  let x0 = start % stamp.sizeX;
  let x1 = x0;
  let y0 = (start / stamp.sizeX) | 0;
  let y1 = y0;

  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % stamp.sizeX;
    const y = (index / stamp.sizeX) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= stamp.sizeX || ny >= stamp.sizeY) continue;
      const next = nx + stamp.sizeX * ny;
      if (seen[next] === 1) continue;
      if (!solidAt(stamp, next, z) || solidAt(stamp, next, z - 1)) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }

  return { x: x0, y: y0, sizeX: x1 - x0 + 1, sizeY: y1 - y0 + 1 };
}

/** Quote vuote consecutive sotto `z`, su **tutte** le colonne del riquadro. */
function voidDepth(stamp: VoxelStamp, rect: PlanRect, z: number): number {
  let depth = 0;
  for (let below = z - 1; below >= 0; below--) {
    for (let dy = 0; dy < rect.sizeY; dy++) {
      for (let dx = 0; dx < rect.sizeX; dx++) {
        const index = (rect.x + dx) + stamp.sizeX * (rect.y + dy);
        if (solidAt(stamp, index, below)) return depth;
      }
    }
    depth++;
  }
  return depth;
}

function heightOf(window: SkyWindow): number {
  return window.z1 - window.z0 + 1;
}

/**
 * La corsa di quote **consecutive** in cui il vuoto e' passante, o null.
 *
 * **Tre condizioni insieme, e nessuna delle tre basta.** Serve una linea sgombera
 * da un capo all'altro dell'inviluppo — cioe' che di li' il cielo si veda
 * davvero; serve del pieno da entrambe le parti sull'**altro** asse, cioe' che
 * quel vuoto stia dentro il costruito; e servono abbastanza quote **di fila**,
 * cioe' che la finestra sia una finestra e non una fessura.
 *
 * Sono i tre difetti che le prime versioni avevano, e li ha trovati la misura
 * sulla ricetta vera, non un ragionamento. Con il solo pieno ai fianchi la
 * finestra piu' alta risultava essere il **cavedio dentro uno stelo**: una
 * scatola cava ha pieno a destra e a sinistra come due torri, e da fuori non ci
 * si vede attraverso niente. Con la sola linea sgombera passerebbe qualunque
 * **sbalzo** dal fianco della struttura, dove il vuoto sotto e' il cielo di fuori.
 * E senza la consecutivita' passava di nuovo il cavedio, perche' in fondo allo
 * stelo si apre il portico del podio: quattro quote sgombere su ottanta cieche,
 * che nessuno leggerebbe come una finestra.
 */
function openRun(
  stamp: VoxelStamp,
  rect: PlanRect,
  from: number,
  to: number,
): { z0: number; z1: number; throughAxis: 0 | 1 } | null {
  let best: { z0: number; z1: number; throughAxis: 0 | 1 } | null = null;

  for (const axis of AXES) {
    const flank = axis === 0 ? 1 : 0;
    let start = -1;
    for (let z = from; z <= to + 1; z++) {
      const open = z <= to &&
        flanked(stamp, rect, z, flank) &&
        seeThrough(stamp, rect, z, axis);
      if (open) {
        if (start === -1) start = z;
        continue;
      }
      if (start !== -1 && (best === null || z - start > best.z1 - best.z0 + 1)) {
        best = { z0: start, z1: z - 1, throughAxis: axis };
      }
      start = -1;
    }
  }

  return best;
}

/**
 * true se da qualche colonna del riquadro si vede da un capo all'altro.
 *
 * La colonna si sceglie fra quelle del riquadro sull'asse **trasversale**: la
 * linea corre lungo `axis` per tutta la larghezza dello stamp, e basta che ne
 * esista una sgombera. Chiederle tutte sarebbe piu' severo di quanto la vista
 * richieda — una finestra con un pilastro in mezzo resta una finestra.
 */
function seeThrough(stamp: VoxelStamp, rect: PlanRect, z: number, axis: 0 | 1): boolean {
  const cross = axis === 0 ? 1 : 0;
  const from = cross === 0 ? rect.x : rect.y;
  const count = cross === 0 ? rect.sizeX : rect.sizeY;
  const length = axis === 0 ? stamp.sizeX : stamp.sizeY;

  for (let i = 0; i < count; i++) {
    let clear = true;
    for (let along = 0; along < length && clear; along++) {
      if (solidAt(stamp, indexOf(stamp, axis, along, from + i), z)) clear = false;
    }
    if (clear) return true;
  }
  return false;
}

const AXES: readonly (0 | 1)[] = [0, 1];

function flanked(stamp: VoxelStamp, rect: PlanRect, z: number, axis: 0 | 1): boolean {
  const across = axis === 0 ? rect.sizeY : rect.sizeX;
  const low = axis === 0 ? rect.x : rect.y;
  const high = low + (axis === 0 ? rect.sizeX : rect.sizeY) - 1;
  const size = axis === 0 ? stamp.sizeX : stamp.sizeY;

  let before = false;
  let after = false;
  for (let along = 0; along < across && !(before && after); along++) {
    const other = (axis === 0 ? rect.y : rect.x) + along;
    for (let v = 0; v < low && !before; v++) {
      if (solidAt(stamp, indexOf(stamp, axis, v, other), z)) before = true;
    }
    for (let v = high + 1; v < size && !after; v++) {
      if (solidAt(stamp, indexOf(stamp, axis, v, other), z)) after = true;
    }
  }
  return before && after;
}

function indexOf(stamp: VoxelStamp, axis: 0 | 1, along: number, other: number): number {
  return axis === 0 ? along + stamp.sizeX * other : other + stamp.sizeX * along;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
