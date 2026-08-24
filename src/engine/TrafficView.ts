import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Uint16BufferAttribute,
} from 'three';
import { TRAFFIC, VEHICLE_KINDS, type VehicleKind } from '../world/traffic/config';
import type { SmokePuff } from '../world/traffic/plume';
import type { VehiclePose } from '../world/traffic/poses';
import { faceLight, hexToLinear, type LightingModel } from './lighting';
import { hullBlocks, type HullBlock } from './vehicleHulls';

/**
 * I mezzi che si muovono: barche, navi, aerei, dirigibili, e il fumo che fanno.
 *
 * **Non sono voxel, ed e' la ragione per cui questa classe esiste.** Scrivere e
 * riscrivere una barca nel `VoxelWorld` marcherebbe sporchi i chunk della costa
 * a ogni frame, cioe' rimeshare mezza isola per farla navigare. Qui ogni mezzo e'
 * una mesh propria con la geometria condivisa per tipo: muoverne una costa una
 * matrice, e il conto di quad del mondo non si accorge di niente.
 *
 * **La sagoma resta di scatole.** Non e' pigrizia: il resto della scena e' fatto
 * di cubi di un voxel, e una silhouette liscia in mezzo si vedrebbe come un
 * corpo estraneo. A dire quali scatole e' `vehicleHulls.ts`, che non conosce
 * Three; qui restano il cucirle in una geometria e il colorarle. La stessa cosa
 * vale per la luce — le facce prendono i fattori del modello di `lighting.ts`,
 * cosi' una nave girata a sud e' scura sul fianco esattamente come lo e' il muro
 * accanto.
 *
 * **Il pennacchio e' l'unica geometria che si riscrive per frame**, e non poteva
 * essere altrimenti: uno sbuffo cambia posto, taglia e densita' a ogni istante.
 * Costa una mesh sola per tutta la citta' — qualche centinaio di vertici
 * riscritti — invece di una mesh per sbuffo, che sarebbe una draw call ogni
 * volta che un traghetto respira.
 */

/** Fattore di luce per faccia, nell'ordine +X, -X, +Y, -Y, +Z, -Z. */
const FACE_ORDER: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/** Le otto combinazioni di segno di un cubo, per faccia: quattro vertici a testa. */
const FACE_CORNERS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
  [[-1, 1, -1], [-1, -1, -1], [-1, -1, 1], [-1, 1, 1]],
  [[1, 1, -1], [-1, 1, -1], [-1, 1, 1], [1, 1, 1]],
  [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
  [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]],
];

/**
 * A quanti sbuffi per volta cresce il buffer del pennacchio.
 *
 * Cresce e non cala mai, come il pool delle mesh e per la stessa ragione: una
 * citta' che apre una linea in piu' non deve riallocare, e una che ne perde una
 * non guadagna niente a restituire due chilobyte.
 */
const PLUME_GROWTH = 64;

/** Tetto degli sbuffi disegnabili: oltre, gli indici a 16 bit non basterebbero. */
const PLUME_LIMIT = 2048;

/**
 * Geometria di un tipo, piu' cosa serve a ricolorarla senza ricostruirla.
 *
 * Slot di palette e indice di faccia per vertice: il colore e' il prodotto dei
 * due, e tenerli separati e' cio' che permette a un cambio di tema o di ora di
 * riscrivere trecento float invece di rigenerare la mesh.
 */
interface HullGeometry {
  readonly geometry: BufferGeometry;
  readonly slots: Uint8Array;
  readonly faces: Uint8Array;
}

export class TrafficView {
  readonly group = new Group();

  private readonly hulls = new Map<VehicleKind, HullGeometry>();
  private readonly materials = new Map<VehicleKind, MeshBasicMaterial>();
  private readonly pools = new Map<VehicleKind, Mesh[]>();

  private readonly plumeGeometry = new BufferGeometry();
  private readonly plumeMesh: Mesh;
  private plumeCapacity = 0;

  private colors: readonly string[] = [];
  private light: LightingModel | null = null;

  constructor() {
    for (const kind of VEHICLE_KINDS) {
      this.hulls.set(kind, assemble(hullBlocks(kind)));
      this.materials.set(kind, new MeshBasicMaterial({ vertexColors: true }));
      this.pools.set(kind, []);
    }

    // Il fumo non scrive profondita': gli sbuffi si compenetrano, e uno che
    // nascondesse quello dietro si vedrebbe come un cubetto ritagliato invece
    // che come una nuvola. La profondita' la **legge** ancora, quindi un
    // pennacchio dietro una collina resta dietro la collina.
    this.plumeMesh = new Mesh(
      this.plumeGeometry,
      new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    );
    this.plumeMesh.renderOrder = 6;
    // La geometria cambia a ogni frame: ricalcolarne i limiti per il frustum
    // costerebbe piu' del disegno.
    this.plumeMesh.frustumCulled = false;
    this.plumeGeometry.setDrawRange(0, 0);
    this.group.add(this.plumeMesh);

    // Sotto il cursore di piazzamento e i cerchi d'influenza, che disegnano
    // fuori dalla profondita': un mezzo e' un oggetto del mondo e dietro una
    // collina deve sparire.
    this.group.renderOrder = 5;
  }

  /**
   * Colori dal tema e luce dell'ora.
   *
   * Le due cose insieme e non a due chiamate: il colore di una faccia e' il
   * prodotto dei due, e ricalcolarlo per meta' lascerebbe una nave illuminata da
   * mezzogiorno dentro una notte.
   */
  setLighting(colors: readonly string[], light: LightingModel): void {
    this.colors = colors;
    this.light = light;
    for (const kind of VEHICLE_KINDS) this.paint(kind);
  }

  /**
   * Porta a schermo le pose di questo istante.
   *
   * Il pool cresce e non si svuota mai: i mezzi sono unita', e una barca che
   * sparisce torna quasi subito. Nasconderla costa un booleano, distruggerne la
   * mesh costerebbe una riallocazione a ogni traversata.
   */
  setPoses(poses: readonly VehiclePose[]): void {
    const used = new Map<VehicleKind, number>();

    for (const pose of poses) {
      const index = used.get(pose.kind) ?? 0;
      used.set(pose.kind, index + 1);
      const mesh = this.meshFor(pose.kind, index);
      mesh.position.set(pose.x, pose.y, pose.z);
      mesh.rotation.z = pose.heading;
      mesh.visible = true;
    }

    for (const kind of VEHICLE_KINDS) {
      const pool = this.pools.get(kind)!;
      for (let i = used.get(kind) ?? 0; i < pool.length; i++) pool[i].visible = false;
    }
  }

  /**
   * Riscrive il pennacchio di questo istante.
   *
   * Una mesh sola per tutti i fumaioli della citta', riempita di nuovo a ogni
   * frame: un cubetto per sbuffo, la tinta del fumo per l'ombra della faccia, e
   * la densita' nel canale alfa. Il buffer e' preallocato e il `drawRange` taglia
   * la coda, cosi' un traghetto in meno non e' una riallocazione.
   */
  setPuffs(puffs: readonly SmokePuff[]): void {
    const count = Math.min(puffs.length, PLUME_LIMIT);
    if (this.light === null || this.colors.length === 0 || count === 0) {
      this.plumeGeometry.setDrawRange(0, 0);
      return;
    }

    this.growPlume(count);
    const positions = this.plumeGeometry.getAttribute('position') as Float32BufferAttribute;
    const colors = this.plumeGeometry.getAttribute('color') as Float32BufferAttribute;
    const xyz = positions.array as Float32Array;
    const rgba = colors.array as Float32Array;
    const tint = hexToLinear(this.colors[TRAFFIC.plume.palette] ?? '#ffffff');
    const shades = faceShades(this.light);

    let vertex = 0;
    for (let i = 0; i < count; i++) {
      const puff = puffs[i];
      const half = puff.size / 2;
      for (let face = 0; face < FACE_ORDER.length; face++) {
        const shade = shades[face];
        for (const [sx, sy, sz] of FACE_CORNERS[face]) {
          xyz[vertex * 3] = puff.x + sx * half;
          xyz[vertex * 3 + 1] = puff.y + sy * half;
          xyz[vertex * 3 + 2] = puff.z + sz * half;
          rgba[vertex * 4] = tint[0] * shade;
          rgba[vertex * 4 + 1] = tint[1] * shade;
          rgba[vertex * 4 + 2] = tint[2] * shade;
          rgba[vertex * 4 + 3] = puff.density;
          vertex++;
        }
      }
    }

    positions.needsUpdate = true;
    colors.needsUpdate = true;
    this.plumeGeometry.setDrawRange(0, count * 36);
  }

  /** Nasconde tutto senza dimenticare niente: serve a chi mette in pausa la scena. */
  hide(): void {
    for (const pool of this.pools.values()) {
      for (const mesh of pool) mesh.visible = false;
    }
    this.plumeGeometry.setDrawRange(0, 0);
  }

  private meshFor(kind: VehicleKind, index: number): Mesh {
    const pool = this.pools.get(kind)!;
    while (pool.length <= index) {
      const mesh = new Mesh(this.hulls.get(kind)!.geometry, this.materials.get(kind)!);
      mesh.visible = false;
      mesh.renderOrder = 5;
      pool.push(mesh);
      this.group.add(mesh);
    }
    return pool[index];
  }

  /** Riscrive i colori per vertice: palette del tema per la luce della faccia. */
  private paint(kind: VehicleKind): void {
    const hull = this.hulls.get(kind);
    if (hull === undefined || this.light === null || this.colors.length === 0) return;

    const attribute = hull.geometry.getAttribute('color') as Float32BufferAttribute;
    const values = attribute.array as Float32Array;
    const shades = faceShades(this.light);
    const linear = new Map<number, readonly [number, number, number]>();

    for (let v = 0; v < hull.slots.length; v++) {
      const slot = hull.slots[v];
      let rgb = linear.get(slot);
      if (rgb === undefined) {
        rgb = hexToLinear(this.colors[slot] ?? '#ffffff');
        linear.set(slot, rgb);
      }
      const shade = shades[hull.faces[v]];
      values[v * 3] = rgb[0] * shade;
      values[v * 3 + 1] = rgb[1] * shade;
      values[v * 3 + 2] = rgb[2] * shade;
    }
    attribute.needsUpdate = true;
  }

  /** Allarga i buffer del pennacchio fino a contenere `count` sbuffi. */
  private growPlume(count: number): void {
    if (count <= this.plumeCapacity) return;
    const capacity = Math.ceil(count / PLUME_GROWTH) * PLUME_GROWTH;

    const positions = new Float32BufferAttribute(new Float32Array(capacity * 24 * 3), 3);
    positions.setUsage(DynamicDrawUsage);
    // Quattro componenti e non tre: la quarta e' l'alfa, ed e' la sola ragione
    // per cui il fumo non ha bisogno di un materiale per sbuffo.
    const colors = new Float32BufferAttribute(new Float32Array(capacity * 24 * 4), 4);
    colors.setUsage(DynamicDrawUsage);

    const indices = new Uint16Array(capacity * 36);
    for (let i = 0; i < capacity * 6; i++) {
      const base = i * 4;
      const at = i * 6;
      indices[at] = base;
      indices[at + 1] = base + 1;
      indices[at + 2] = base + 2;
      indices[at + 3] = base;
      indices[at + 4] = base + 2;
      indices[at + 5] = base + 3;
    }

    this.plumeGeometry.setAttribute('position', positions);
    this.plumeGeometry.setAttribute('color', colors);
    this.plumeGeometry.setIndex(new Uint16BufferAttribute(indices, 1));
    this.plumeCapacity = capacity;
  }
}

/** Da un elenco di scatole a una geometria sola, con lo slot e l'ombra per vertice. */
function assemble(blocks: readonly HullBlock[]): HullGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const slots: number[] = [];
  const faces: number[] = [];

  for (const item of blocks) {
    for (let face = 0; face < FACE_ORDER.length; face++) {
      const base = positions.length / 3;
      for (const [sx, sy, sz] of FACE_CORNERS[face]) {
        positions.push(
          item.x + (sx * item.sizeX) / 2,
          item.y + (sy * item.sizeY) / 2,
          item.z + (sz * item.sizeZ) / 2,
        );
        slots.push(item.palette);
        faces.push(face);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(slots.length * 3), 3));
  geometry.setIndex(new Uint16BufferAttribute(new Uint16Array(indices), 1));
  geometry.computeBoundingSphere();

  return { geometry, slots: new Uint8Array(slots), faces: new Uint8Array(faces) };
}

/**
 * Sostituisce gli indici di faccia con i fattori di luce del modello.
 *
 * Sta fuori dalla classe perche' e' una tabella di sei numeri, e ricalcolarla per
 * ogni tipo sarebbe cinque volte lo stesso lavoro.
 */
export function faceShades(light: LightingModel): readonly number[] {
  return FACE_ORDER.map((normal) => {
    const rgb = faceLight(light, normal);
    return (rgb[0] + rgb[1] + rgb[2]) / 3;
  });
}
