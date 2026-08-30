import { STAMP_EMPTY, type VoxelStamp } from '../buildings/stamp';

/**
 * Il pozzo aperto: cio' che distingue un earthscraper da uno scantinato.
 *
 * **E' lo specchio di `window.ts`, e non il suo riuso.** Ci ho provato: le
 * passerelle sopra la bocca sembravano bastare a far trovare il vuoto a
 * `skyWindowOf`, che cerca uno scavalco — pieno a `z`, vuoto a `z-1`. Non
 * regge, e la ragione sta in `seeThrough`: quella funzione pretende una linea
 * sgombera **da un capo all'altro dell'inviluppo**, e in un pozzo le colonne di
 * bordo sono la parete terrazzata. E' esattamente il caso che quel file
 * dichiara di voler escludere — «con il solo pieno ai fianchi la finestra piu'
 * alta risultava essere il cavedio dentro uno stelo» — e un pozzo, guardato da
 * quella regola, *e'* un cavedio.
 *
 * La differenza vera e' che le due domande non sono la stessa. Una finestra di
 * cielo si guarda **attraverso**: sta dentro il costruito e si vede da una
 * parte all'altra. Un pozzo si guarda **dentro**: e' cieco su tutti e quattro i
 * fianchi per costruzione, e cio' che lo rende leggibile e' che sia aperto in
 * **alto**. Misurare la seconda con la regola della prima avrebbe voluto dire o
 * bucare un fianco della piramide — cioe' rovinarla per far passare un test — o
 * abbassare `seeThrough` fino a farle accettare i cavedi che esiste per
 * escludere.
 *
 * **Misura, non percorso caldo.** Gira nei test del catalogo, una volta per
 * ricetta.
 */

/** Il vuoto verticale di una struttura interrata. */
export interface Shaft {
  /** Riquadro in pianta della sezione che regge la profondita' minima. */
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  /** Colonne davvero vuote nel riquadro: e' questo il numero che conta. */
  readonly columns: number;
  /** Quota piu' bassa e piu' alta del vuoto, incluse. */
  readonly z0: number;
  readonly z1: number;
  /** Colonne da cui il cielo si vede davvero: le passerelle non le coprono tutte. */
  readonly openColumns: number;
}

export interface ShaftRule {
  /** Colonne del riquadro vuoto, misurate sulla sezione piu' stretta. */
  readonly minColumns: number;
  /** Quote vuote consecutive sotto il piano finito. */
  readonly minDepth: number;
}

function solidAt(stamp: VoxelStamp, index: number, z: number): boolean {
  return stamp.voxels[index + stamp.sizeX * stamp.sizeY * z] !== STAMP_EMPTY;
}

/**
 * Il pozzo di uno stamp interrato, o null se non ne ha uno.
 *
 * `planeZ` e' la quota del piano finito in coordinate dello stamp — per una
 * ricetta interrata, `sunken.depth - 1`. Sopra c'e' il fuori terra: parapetti e
 * passerelle, che il pozzo attraversa senza chiudersi.
 */
export function shaftOf(stamp: VoxelStamp, rule: ShaftRule, planeZ: number): Shaft | null {
  const plane = stamp.sizeX * stamp.sizeY;
  if (plane === 0 || planeZ < 0 || planeZ >= stamp.sizeZ) return null;

  // Quante quote di fila una colonna resta vuota scendendo dal piano finito.
  const depth = new Int32Array(plane);
  for (let i = 0; i < plane; i++) {
    let run = 0;
    for (let z = planeZ; z >= 0 && !solidAt(stamp, i, z); z--) run++;
    depth[i] = run;
  }

  // **La macchia si cerca sulle colonne che reggono la profondita' minima**, non
  // su tutto il vuoto. Il vuoto e' anche la bocca larga sotto il primo anello, e
  // prendere quella darebbe una sezione enorme e profonda sei quote: la sezione
  // che dice «pozzo» e' la piu' stretta che scende fino in fondo.
  const deep = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) deep[i] = depth[i] >= rule.minDepth ? 1 : 0;

  const seen = new Uint8Array(plane);
  let best: Shaft | null = null;

  for (let start = 0; start < plane; start++) {
    if (deep[start] === 0 || seen[start] === 1) continue;

    const stack = [start];
    seen[start] = 1;
    const members: number[] = [];
    let x0 = start % stamp.sizeX;
    let x1 = x0;
    let y0 = (start / stamp.sizeX) | 0;
    let y1 = y0;

    while (stack.length > 0) {
      const index = stack.pop()!;
      members.push(index);
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
        if (seen[next] === 1 || deep[next] === 0) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }

    if (members.length < rule.minColumns) continue;

    // **Un vuoto che tocca il bordo dell'inviluppo non e' un pozzo**, e' una
    // rientranza del fianco. E' il controllo che qui sostituisce `flanked`: li'
    // si chiede pieno ai lati sull'asse trasversale, qui si chiede che il vuoto
    // stia tutto dentro — che per una struttura cieca su quattro fianchi e'
    // la stessa cosa detta una volta sola.
    if (x0 === 0 || y0 === 0 || x1 === stamp.sizeX - 1 || y1 === stamp.sizeY - 1) continue;

    // Il cielo: almeno una colonna sgombera dal piano finito fino alla cima.
    // Le passerelle ne coprono qualcuna, e devono poterlo fare — sigillare il
    // pozzo e' un'altra cosa, e questa riga e' cio' che separa le due.
    let openColumns = 0;
    for (const index of members) {
      let open = true;
      for (let z = planeZ + 1; z < stamp.sizeZ && open; z++) {
        if (solidAt(stamp, index, z)) open = false;
      }
      if (open) openColumns++;
    }
    if (openColumns === 0) continue;

    let lowest = planeZ;
    for (const index of members) {
      const bottom = planeZ - depth[index] + 1;
      if (bottom < lowest) lowest = bottom;
    }

    const shaft: Shaft = {
      x: x0,
      y: y0,
      sizeX: x1 - x0 + 1,
      sizeY: y1 - y0 + 1,
      columns: members.length,
      z0: lowest,
      z1: planeZ,
      openColumns,
    };
    // Fra due candidati vince il piu' **largo**, al contrario della finestra di
    // cielo che sceglie il piu' alto: qui la profondita' e' gia' filtrata da
    // `minDepth`, e cio' che resta da premiare e' l'area — che e' anche l'unica
    // cosa che si vede dall'inquadratura d'insieme.
    if (best === null || shaft.columns > best.columns) best = shaft;
  }

  return best;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
