import { mixHex } from '../engine/daylight';

/**
 * Un volume voxel proiettato in isometrica vera, come tracciati SVG.
 *
 * E' la miniatura delle tessere dei catalizzatori (fase 7.2): il dock mostra la
 * struttura che il gioco costruira', non un pittogramma che la ricorda. Il
 * volume e' lo stamp che `generateLandmark` gia' produce, quindi la miniatura
 * non ha una seconda fonte da tenere d'accordo con la ricetta.
 *
 * **Perche' un reticolo di triangoli e non un pittore che ordina i cubi.** In
 * isometrica vera ogni spigolo di voxel cade su una delle tre direzioni dello
 * schermo, e lo schermo si tassella in triangoli: ogni faccia visibile ne copre
 * esattamente due. Basta allora uno z-buffer per triangolo — vince il voxel piu'
 * vicino alla camera — e le facce coperte a meta' si risolvono da sole, senza
 * ordinare niente e senza poligoni che si sovrappongono. Senza sovrapposizioni
 * i triangoli dello stesso colore possono stare in un tracciato solo, e le
 * strisce contigue di una colonna diventano un quadrilatero: una faccia intera
 * di una torre e' qualche decina di caratteri, non centinaia di triangoli.
 *
 * Il punto di vista e' quello di `IsoCameraController` allo scatto zero: camera
 * da `+x +y +z`, quindi si vedono il tetto, la faccia `+x` (a sinistra) e la
 * faccia `+y` (a destra). Puro e senza DOM: il test lo esercita in `node`.
 */

/** Le tre facce che la camera isometrica vede, dalla piu' chiara alla piu' scura. */
export const MINIATURE_FACE = { top: 0, left: 1, right: 2 } as const;

export type MiniatureFace = (typeof MINIATURE_FACE)[keyof typeof MINIATURE_FACE];

export const MINIATURE_FACES: readonly MiniatureFace[] = [MINIATURE_FACE.top, MINIATURE_FACE.left, MINIATURE_FACE.right];

/**
 * Quanto ogni faccia va verso il nero.
 *
 * Fisso e non preso dal sole del tema: a 22px la luce vera non si legge, mentre
 * tre gradini costanti sono cio' che fa di una macchia di colore un volume. E
 * sono gli stessi su ogni tessera, cosi' la fila del dock ha una luce sola.
 */
const FACE_SHADE: Readonly<Record<MiniatureFace, number>> = { 0: 0, 1: 0.2, 2: 0.38 };

/** Il colore di una faccia, dal colore dello slot. */
export function miniatureFill(slotColor: string, face: MiniatureFace): string {
  return mixHex(slotColor, '#000000', FACE_SHADE[face]);
}

/** La custom property che porta il colore di uno slot su una faccia. */
export function miniatureToken(slot: number, face: MiniatureFace): string {
  return `--vox-${slot}-${face}`;
}

/** Il minimo di uno stamp che serve a proiettarlo: le misure e gli indici di palette. */
export interface VoxelVolume {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  /** `sizeX * sizeY * sizeZ` indici di palette, 0 = vuoto; x, poi y, poi z. */
  readonly voxels: Uint8Array;
}

/** Tutti i triangoli visibili di uno slot di palette su una delle tre facce. */
export interface MiniatureGroup {
  readonly slot: number;
  readonly face: MiniatureFace;
  /** Coordinate di reticolo: `x` in colonne, `y` in mezzi spigoli. */
  readonly d: string;
}

export interface Miniature {
  /** Colonne del reticolo occupate. Una colonna e' `sqrt(3)/2` spigoli di voxel. */
  readonly columns: number;
  /** Mezzi spigoli occupati in verticale. */
  readonly rows: number;
  /** Ordinati per slot e poi per faccia, perche' lo stesso volume dia lo stesso SVG. */
  readonly groups: readonly MiniatureGroup[];
}

/** La larghezza di una colonna del reticolo, in spigoli di voxel. */
export const LATTICE_COLUMN = Math.sqrt(3) / 2;

export const EMPTY_MINIATURE: Miniature = { columns: 0, rows: 0, groups: [] };

export function projectMiniature(volume: VoxelVolume): Miniature {
  const { sizeX, sizeY, sizeZ, voxels } = volume;
  if (sizeX <= 0 || sizeY <= 0 || sizeZ <= 0) return EMPTY_MINIATURE;

  // Colonna `c = y - x`, riga `m = x + y - 2z` a meno di una costante: sono le
  // due coordinate intere del reticolo. Gli offset le portano a indici >= 0.
  const cOffset = sizeX;
  const mOffset = 2 * sizeZ;
  const width = sizeX + sizeY;
  const height = sizeX + sizeY + 2 * sizeZ;
  // La profondita' di un voxel verso la camera e' `x + y + z`: tutte le sue
  // facce visibili la condividono, e due facce esposte di voxel diversi che
  // cadono sullo stesso triangolo non hanno mai la stessa.
  const depth = new Int32Array(width * height).fill(-1);
  const cell = new Uint8Array(width * height);
  const put = (c: number, m: number, p: number, slot: number, face: MiniatureFace): void => {
    const index = (c + cOffset) + (m + mOffset) * width;
    if (p <= depth[index]) return;
    depth[index] = p;
    cell[index] = slot * 3 + face;
  };

  const plane = sizeX * sizeY;
  const solid = (x: number, y: number, z: number): boolean =>
    x < sizeX && y < sizeY && z < sizeZ && voxels[x + sizeX * (y + sizeY * z)] !== 0;

  for (let z = 0; z < sizeZ; z++) {
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        const slot = voxels[x + sizeX * y + plane * z];
        if (slot === 0) continue;
        const p = x + y + z;
        const c = y - x;
        const s = x + y - 2 * z;
        if (!solid(x, y, z + 1)) {
          put(c - 1, s - 1, p, slot, MINIATURE_FACE.top);
          put(c, s - 1, p, slot, MINIATURE_FACE.top);
        }
        if (!solid(x + 1, y, z)) {
          put(c - 1, s, p, slot, MINIATURE_FACE.left);
          put(c - 1, s + 1, p, slot, MINIATURE_FACE.left);
        }
        if (!solid(x, y + 1, z)) {
          put(c, s, p, slot, MINIATURE_FACE.right);
          put(c, s + 1, p, slot, MINIATURE_FACE.right);
        }
      }
    }
  }

  let cMin = width;
  let cMax = -1;
  let mMin = height;
  let mMax = -1;
  for (let m = 0; m < height; m++) {
    for (let c = 0; c < width; c++) {
      if (depth[c + m * width] < 0) continue;
      if (c < cMin) cMin = c;
      if (c > cMax) cMax = c;
      if (m < mMin) mMin = m;
      if (m > mMax) mMax = m;
    }
  }
  if (cMax < 0) return EMPTY_MINIATURE;

  const paths = new Map<number, string[]>();
  for (let c = cMin; c <= cMax; c++) {
    let m = mMin;
    while (m <= mMax) {
      const index = c + m * width;
      if (depth[index] < 0) {
        m++;
        continue;
      }
      const value = cell[index];
      const m0 = m;
      while (m + 1 <= mMax && depth[c + (m + 1) * width] >= 0 && cell[c + (m + 1) * width] === value) m++;
      const run = stripOutline(c - cMin, m0 - mMin + 1, m - mMin + 1, (c - cOffset) + (m0 - mOffset));
      const list = paths.get(value);
      if (list === undefined) paths.set(value, [run]);
      else list.push(run);
      m++;
    }
  }

  const groups: MiniatureGroup[] = [...paths.keys()]
    .sort((a, b) => a - b)
    .map((value) => ({
      slot: Math.floor(value / 3),
      face: (value % 3) as MiniatureFace,
      d: (paths.get(value) ?? []).join(''),
    }));
  // Il triangolo `m` va da `m - 1` a `m + 1`: le righe sono l'intervallo dei
  // vertici, non quello dei centri.
  return { columns: cMax - cMin + 1, rows: mMax - mMin + 2, groups };
}

/**
 * Il contorno di una striscia di triangoli contigui in una colonna.
 *
 * In una colonna i triangoli si alternano — lato verticale a sinistra con la
 * punta a destra, poi il contrario — e due vicini condividono una diagonale.
 * L'unione e' quindi sempre un quadrilatero con i lati verticali: basta sapere
 * dove cominciano e finiscono i due lati, che dipende dal verso del primo e
 * dell'ultimo triangolo. `parity` e' `c + m0` nelle coordinate del reticolo,
 * prima degli offset del buffer: e' cio' che dice il verso del primo.
 */
function stripOutline(x: number, m0: number, m1: number, parity: number): string {
  // Punta a destra (lato verticale a sinistra) quando `m - c` e' dispari; la
  // parita' di `m - c` e quella di `m + c` coincidono.
  const firstRight = (parity & 1) === 1;
  const lastRight = firstRight === ((m1 - m0) % 2 === 0);
  const topLeft = firstRight ? m0 - 1 : m0;
  const topRight = firstRight ? m0 : m0 - 1;
  const bottomLeft = lastRight ? m1 + 1 : m1;
  const bottomRight = lastRight ? m1 : m1 + 1;
  const right = x + 1;
  // Un triangolo solo ha un vertice doppio sul lato della punta: si salta.
  const rightSide = topRight === bottomRight ? `L${right} ${topRight}` : `L${right} ${topRight}L${right} ${bottomRight}`;
  const leftBottom = bottomLeft === topLeft ? '' : `L${x} ${bottomLeft}`;
  return `M${x} ${topLeft}${rightSide}${leftBottom}Z`;
}
