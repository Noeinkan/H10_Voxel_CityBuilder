import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Uint32BufferAttribute,
} from 'three';
import { ROPEWAY } from '../world/ropeway/config';
import type { CablePoint } from '../world/ropeway/ropewayPlan';
import type { LightingModel } from './lighting';
import { faceShades } from './TrafficView';

/**
 * Le funi delle funivie.
 *
 * **Non sono voxel, ed e' la ragione per cui questa classe esiste.** Una fune e'
 * spessa un terzo di voxel: scriverla nel `VoxelWorld` vorrebbe dire arrotondarla
 * a un cubo, e una diagonale di cubi lunga centonovanta colonne e' una scala, non
 * un cavo. La pancia — l'unica cosa che la faccia leggere come una fune invece
 * che come un tirante — diventerebbe una gradinata.
 *
 * E' la stessa divisione di `TrafficView`, applicata per la prima volta a
 * qualcosa che **sta fermo**: li' fuori dal volume voxel finiva cio' che si
 * muove, qui cio' che e' troppo sottile per essere materia. Le due cose hanno la
 * stessa conseguenza sul costo — il conto di quad del mondo non se ne accorge, e
 * nessun chunk viene marcato sporco.
 *
 * **La geometria si ricostruisce quando cambiano le linee, non quando passa un
 * frame.** Una fune non si muove: il confronto e' per riferimento, e una citta'
 * con due funivie non paga niente per frame.
 */

/** Una linea da disegnare: la sola cosa che di lei serve sapere e' la spezzata. */
export interface CableLine {
  readonly id: number;
  readonly path: readonly CablePoint[];
}

/**
 * Semispessore della fune, in voxel.
 *
 * Sotto il voxel di proposito: e' cio' che la distingue da qualunque altra cosa
 * nella scena, che e' fatta di cubi interi. Piu' sottile sparirebbe alle
 * distanze di gioco, piu' spessa leggerebbe come una trave.
 */
const RADIUS = 0.18;

/**
 * Indice di faccia per lato di un concio, nell'ordine in cui `beam` li emette.
 *
 * Sono le facce del modello di luce (`FACE_NORMALS`): sopra e sotto prendono
 * quelle verticali, i due fianchi una orizzontale a testa. Una fune quasi
 * orizzontale ha i fianchi quasi verticali, quindi la corrispondenza e' giusta
 * per costruzione e non un'approssimazione.
 */
const BEAM_FACES: readonly number[] = [4, 5, 2, 3];

export class RopewayView {
  readonly group = new Group();

  private readonly material = new MeshBasicMaterial({ vertexColors: true });
  private mesh: Mesh | null = null;
  private faces = new Uint8Array(0);

  private lines: readonly CableLine[] | null = null;
  private colors: readonly string[] = [];
  private light: LightingModel | null = null;

  constructor() {
    // Accanto ai mezzi, e per la stessa ragione: una fune e' un oggetto del
    // mondo, e dietro una collina deve sparire.
    this.group.renderOrder = 5;
  }

  /**
   * Porta a schermo le linee che la citta' ha costruito.
   *
   * Il confronto per riferimento e' voluto: chi possiede le linee le ricalcola
   * solo quando il registro cambia, quindi lo stesso array frame dopo frame
   * significa «niente da rifare» senza doverne confrontare i punti.
   */
  setLines(lines: readonly CableLine[]): void {
    if (lines === this.lines) return;
    this.lines = lines;
    this.rebuild(lines);
    this.paint();
  }

  /** Colori dal tema e luce dell'ora, come per i mezzi: il colore e' il prodotto. */
  setLighting(colors: readonly string[], light: LightingModel): void {
    this.colors = colors;
    this.light = light;
    this.paint();
  }

  /** Nasconde tutto senza dimenticare niente: serve a chi mette in pausa la scena. */
  hide(): void {
    if (this.mesh !== null) this.mesh.visible = false;
  }

  private rebuild(lines: readonly CableLine[]): void {
    if (this.mesh !== null) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (lines.length === 0) return;

    const positions: number[] = [];
    const indices: number[] = [];
    const faces: number[] = [];

    for (const line of lines) {
      for (let i = 0; i + 1 < line.path.length; i++) {
        beam(line.path[i], line.path[i + 1], positions, indices, faces);
      }
    }
    if (indices.length === 0) return;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(faces.length * 3), 3));
    geometry.setIndex(new Uint32BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();

    this.faces = Uint8Array.from(faces);
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.renderOrder = 5;
    this.group.add(this.mesh);
  }

  /**
   * Riscrive i colori per vertice.
   *
   * Una fune ha un solo slot di palette, quindi qui non c'e' la tabella per slot
   * di `TrafficView`: cambia solo l'ombra della faccia, ed e' quella a dare al
   * cavo il filo chiaro sopra e il fianco scuro che lo staccano dal cielo.
   */
  private paint(): void {
    if (this.mesh === null || this.light === null || this.colors.length === 0) return;

    const attribute = this.mesh.geometry.getAttribute('color') as Float32BufferAttribute;
    const values = attribute.array as Float32Array;
    const shades = faceShades(this.light);
    const colour = new Color(this.colors[ROPEWAY.cablePalette] ?? '#ffffff');

    for (let v = 0; v < this.faces.length; v++) {
      const shade = shades[this.faces[v]];
      values[v * 3] = colour.r * shade;
      values[v * 3 + 1] = colour.g * shade;
      values[v * 3 + 2] = colour.b * shade;
    }
    attribute.needsUpdate = true;
    this.mesh.visible = true;
  }
}

/**
 * Un concio di fune fra due vertici della spezzata.
 *
 * Quattro facce e nessun tappo: le testate cadono dentro il concio successivo o
 * dentro l'architrave di una stazione, e nessuno le vede mai. Il riferimento e'
 * costruito dal verso del concio invece che dagli assi del mondo, ed e' quello
 * che permette al tratto in pendenza di restare spesso quanto gli altri invece
 * di assottigliarsi con la pendenza.
 */
function beam(
  from: CablePoint,
  to: CablePoint,
  positions: number[],
  indices: number[],
  faces: number[],
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const span = Math.hypot(dx, dy, dz);
  if (span <= 0) return;

  const fx = dx / span;
  const fy = dy / span;
  const fz = dz / span;

  // Il fianco e' la perpendicolare orizzontale al concio. Una fune verticale non
  // esiste in questo dominio — le due torri stanno su due rive — ma il caso
  // degenere costa un confronto e toglie una NaN silenziosa.
  let sx = -fy;
  let sy = fx;
  let sLength = Math.hypot(sx, sy);
  if (sLength < 1e-6) {
    sx = 1;
    sy = 0;
    sLength = 1;
  }
  sx /= sLength;
  sy /= sLength;

  // L'alto del concio: `verso x fianco`, e in quest'ordine. Il prodotto opposto
  // punta in basso, e con lui tutte e quattro le facce nascerebbero rivolte
  // dalla parte sbagliata — cioe' scartate dal culling, cioe' una fune invisibile.
  const ux = -fz * sy;
  const uy = fz * sx;
  const uz = fx * sy - fy * sx;

  const corner = (end: CablePoint, side: number, up: number): void => {
    positions.push(
      end.x + (sx * side + ux * up) * RADIUS,
      end.y + (sy * side + uy * up) * RADIUS,
      end.z + uz * up * RADIUS,
    );
  };

  /** Per faccia, i quattro angoli come `[capo, fianco, alto]`. `0` e' `from`. */
  const quads: readonly (readonly (readonly [number, number, number])[])[] = [
    [[0, -1, 1], [1, -1, 1], [1, 1, 1], [0, 1, 1]],
    [[0, -1, -1], [0, 1, -1], [1, 1, -1], [1, -1, -1]],
    [[0, 1, -1], [0, 1, 1], [1, 1, 1], [1, 1, -1]],
    [[0, -1, -1], [1, -1, -1], [1, -1, 1], [0, -1, 1]],
  ];

  for (let face = 0; face < quads.length; face++) {
    const base = positions.length / 3;
    for (const [end, side, up] of quads[face]) {
      corner(end === 0 ? from : to, side, up);
      faces.push(BEAM_FACES[face]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
