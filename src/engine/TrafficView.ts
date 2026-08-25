import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Uint16BufferAttribute,
  type IUniform,
} from 'three';
import { TRAFFIC, VEHICLE_KINDS, type VehicleKind } from '../world/traffic/config';
import type { SmokePuff } from '../world/traffic/plume';
import type { VehiclePose } from '../world/traffic/poses';
import type { WakeMark } from '../world/traffic/wake';
import { faceLight, hexToLinear, type LightingModel } from './lighting';
import { createVehicleMaterial, createWakeMaterial } from './VehicleMaterial';
import { hullBlocks, type HullBlock } from './vehicleHulls';

/**
 * I mezzi che si muovono: barche, navi, aerei, dirigibili, il fumo che fanno e la
 * scia che lasciano.
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
 * Three; qui restano il cucirle in una geometria e il posarle.
 *
 * **La luce non e' piu' cotta nei vertici.** Fino alla 4.x le facce portavano la
 * tinta di palette gia' moltiplicata per l'ombra della faccia, riscritta alla
 * cadenza dell'HUD: funzionava, e si vedeva — una nave in fondo alla rada
 * restava satura mentre la costa dietro si scioglieva nella nebbia, quindi non
 * stava *nel* paesaggio, ci stava sopra come una figurina. Ora i vertici portano
 * indice di palette, faccia e «questa scatola e' un fanale», e a dipingere e' il
 * programma di `VehicleMaterial.ts`, che prende in prestito gli uniform del
 * voxel: stesso sole, stessa ombra, stessa prospettiva aerea, per costruzione.
 *
 * **Pennacchio e scia sono le uniche geometrie che si riscrivono per frame**, e
 * non potevano essere altrimenti: uno sbuffo cambia posto, taglia e densita' a
 * ogni istante, e un segno di schiuma si apre e sbiadisce. Costano una mesh
 * ciascuna per tutta la citta' — qualche centinaio di vertici riscritti — invece
 * di una mesh per sbuffo, che sarebbe una draw call ogni volta che un traghetto
 * respira.
 */

/** Fattore di luce per faccia, nell'ordine +X, -X, +Y, -Y, +Z, -Z. */
const FACE_ORDER: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/**
 * Le otto combinazioni di segno di un cubo, per faccia: quattro vertici a testa.
 *
 * Esportata perche' non e' del traffico: e' il cubo, e chiunque disegni cubetti
 * fuori dal volume voxel deve emetterne le facce in **quest'ordine**, o l'ombra
 * che `faceShades` restituisce finirebbe sul lato sbagliato.
 */
export const FACE_CORNERS: readonly (readonly (readonly [number, number, number])[])[] = [
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

/** A quanti segni di scia per volta cresce il buffer. Cresce e non cala, come sopra. */
const WAKE_GROWTH = 128;

/**
 * Tetto dei segni di scia disegnabili.
 *
 * Piu' alto di quello degli sbuffi perche' un segno costa un quarto di un
 * cubetto — un rettangolo contro sei facce — e perche' ogni scafo ne apre tre per
 * intervallo. Resta ben sotto il limite degli indici a 16 bit.
 */
const WAKE_LIMIT = 4096;

export class TrafficView {
  readonly group = new Group();

  private readonly hulls = new Map<VehicleKind, BufferGeometry>();
  private readonly hullMaterial: ShaderMaterial;
  private readonly pools = new Map<VehicleKind, Mesh[]>();

  private readonly plumeGeometry = new BufferGeometry();
  private readonly plumeMesh: Mesh;
  private plumeCapacity = 0;

  private readonly wakeGeometry = new BufferGeometry();
  private readonly wakeMesh: Mesh;
  private wakeCapacity = 0;

  private colors: readonly string[] = [];
  private light: LightingModel | null = null;

  /**
   * Gli uniform sono quelli del materiale del voxel, presi in prestito.
   *
   * E' l'unica dipendenza che questa vista ha verso il resto del motore, ed e'
   * voluta: e' cosi' che un mezzo vede lo stesso sole, la stessa ombra e la stessa
   * nebbia della costa dietro di lui, senza un secondo elenco da tenere allineato.
   */
  constructor(shared: Record<string, IUniform>) {
    this.hullMaterial = createVehicleMaterial(shared);
    for (const kind of VEHICLE_KINDS) {
      this.hulls.set(kind, assemble(hullBlocks(kind)));
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

    // La schiuma sta **sotto** gli scafi e sotto il fumo: e' acqua, e uno scafo
    // che le passa sopra deve coprirla. Anche lei fuori dal frustum culling, per
    // la stessa ragione del pennacchio.
    this.wakeMesh = new Mesh(this.wakeGeometry, createWakeMaterial(shared));
    this.wakeMesh.renderOrder = 4;
    this.wakeMesh.frustumCulled = false;
    this.wakeGeometry.setDrawRange(0, 0);
    this.group.add(this.wakeMesh);

    // Sotto il cursore di piazzamento e i cerchi d'influenza, che disegnano
    // fuori dalla profondita': un mezzo e' un oggetto del mondo e dietro una
    // collina deve sparire.
    this.group.renderOrder = 5;
  }

  /**
   * Colori dal tema e luce dell'ora, per il **solo** pennacchio.
   *
   * Le sagome non passano piu' di qui: la loro tinta e la loro luce arrivano
   * dagli uniform condivisi, quindi un cambio d'ora le raggiunge senza che
   * nessuno riscriva un vertice. Il fumo resta l'eccezione perche' il suo colore
   * porta un'alfa per sbuffo, ed e' proprio quell'alfa a evitargli un materiale
   * per pennacchio.
   */
  setLighting(colors: readonly string[], light: LightingModel): void {
    this.colors = colors;
    this.light = light;
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

  /**
   * Riscrive la scia di questo istante.
   *
   * Un rettangolo per segno, disteso sul pelo dell'acqua e orientato come la
   * prua di allora. I vertici portano lo scostamento trasversale — meno uno su un
   * fianco, piu' uno sull'altro — e quanto il segno e' ancora bianco: e' tutto
   * cio' che serve al programma per spegnere il bordo e sgranare la schiuma,
   * quindi la posizione non deve dire nient'altro.
   */
  setWake(marks: readonly WakeMark[]): void {
    const count = Math.min(marks.length, WAKE_LIMIT);
    if (count === 0) {
      this.wakeGeometry.setDrawRange(0, 0);
      return;
    }

    this.growWake(count);
    const positions = this.wakeGeometry.getAttribute('position') as Float32BufferAttribute;
    const wake = this.wakeGeometry.getAttribute('aWake') as Float32BufferAttribute;
    const xyz = positions.array as Float32Array;
    const across = wake.array as Float32Array;

    let vertex = 0;
    for (let i = 0; i < count; i++) {
      const mark = marks[i];
      const cos = Math.cos(mark.heading);
      const sin = Math.sin(mark.heading);
      const alongX = cos * mark.half;
      const alongY = sin * mark.half;
      const acrossX = -sin * mark.halfWidth;
      const acrossY = cos * mark.halfWidth;

      for (const [along, side] of CORNERS) {
        xyz[vertex * 3] = mark.x + alongX * along + acrossX * side;
        xyz[vertex * 3 + 1] = mark.y + alongY * along + acrossY * side;
        xyz[vertex * 3 + 2] = mark.z;
        across[vertex * 2] = side;
        across[vertex * 2 + 1] = mark.foam;
        vertex++;
      }
    }

    positions.needsUpdate = true;
    wake.needsUpdate = true;
    this.wakeGeometry.setDrawRange(0, count * 6);
  }

  /** Nasconde tutto senza dimenticare niente: serve a chi mette in pausa la scena. */
  hide(): void {
    for (const pool of this.pools.values()) {
      for (const mesh of pool) mesh.visible = false;
    }
    this.plumeGeometry.setDrawRange(0, 0);
    this.wakeGeometry.setDrawRange(0, 0);
  }

  private meshFor(kind: VehicleKind, index: number): Mesh {
    const pool = this.pools.get(kind)!;
    while (pool.length <= index) {
      const mesh = new Mesh(this.hulls.get(kind)!, this.hullMaterial);
      mesh.visible = false;
      mesh.renderOrder = 5;
      pool.push(mesh);
      this.group.add(mesh);
    }
    return pool[index];
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

    this.plumeGeometry.setAttribute('position', positions);
    this.plumeGeometry.setAttribute('color', colors);
    this.plumeGeometry.setIndex(new Uint16BufferAttribute(quadIndices(capacity * 6), 1));
    this.plumeCapacity = capacity;
  }

  /** Allarga i buffer della scia fino a contenere `count` segni. */
  private growWake(count: number): void {
    if (count <= this.wakeCapacity) return;
    const capacity = Math.ceil(count / WAKE_GROWTH) * WAKE_GROWTH;

    const positions = new Float32BufferAttribute(new Float32Array(capacity * 4 * 3), 3);
    positions.setUsage(DynamicDrawUsage);
    const wake = new Float32BufferAttribute(new Float32Array(capacity * 4 * 2), 2);
    wake.setUsage(DynamicDrawUsage);

    this.wakeGeometry.setAttribute('position', positions);
    this.wakeGeometry.setAttribute('aWake', wake);
    this.wakeGeometry.setIndex(new Uint16BufferAttribute(quadIndices(capacity), 1));
    this.wakeCapacity = capacity;
  }
}

/** I quattro angoli di un segno di scia: lungo la rotta, e di traverso. */
const CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1], [1, -1], [1, 1], [-1, 1],
];

/**
 * Da un elenco di scatole a una geometria sola.
 *
 * I vertici portano indice di palette, indice di faccia e «questa scatola e' un
 * fanale», mai un RGB: e' la stessa regola delle mesh dei chunk, e vale per la
 * stessa ragione — un cambio di tema o di ora deve riscrivere degli uniform, non
 * dei buffer.
 */
function assemble(blocks: readonly HullBlock[]): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const palettes: number[] = [];
  const faces: number[] = [];
  const lamps: number[] = [];

  for (const item of blocks) {
    for (let face = 0; face < FACE_ORDER.length; face++) {
      const base = positions.length / 3;
      for (const [sx, sy, sz] of FACE_CORNERS[face]) {
        positions.push(
          item.x + (sx * item.sizeX) / 2,
          item.y + (sy * item.sizeY) / 2,
          item.z + (sz * item.sizeZ) / 2,
        );
        palettes.push(item.palette);
        faces.push(face);
        lamps.push(item.lamp ? 1 : 0);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aPalette', new Float32BufferAttribute(new Float32Array(palettes), 1));
  geometry.setAttribute('aFace', new Float32BufferAttribute(new Float32Array(faces), 1));
  geometry.setAttribute('aLamp', new Float32BufferAttribute(new Float32Array(lamps), 1));
  geometry.setIndex(new Uint16BufferAttribute(new Uint16Array(indices), 1));
  geometry.computeBoundingSphere();

  return geometry;
}

/** Gli indici di `count` quad consecutivi, che e' l'unica forma che questi buffer hanno. */
function quadIndices(count: number): Uint16Array {
  const indices = new Uint16Array(count * 6);
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    const at = i * 6;
    indices[at] = base;
    indices[at + 1] = base + 1;
    indices[at + 2] = base + 2;
    indices[at + 3] = base;
    indices[at + 4] = base + 2;
    indices[at + 5] = base + 3;
  }
  return indices;
}

/**
 * Sostituisce gli indici di faccia con i fattori di luce del modello.
 *
 * Sta fuori dalla classe perche' e' una tabella di sei numeri, e ricalcolarla per
 * ogni chiamante sarebbe lo stesso lavoro fatto piu' volte. La usano il
 * pennacchio, le funi e la pioggia di cubetti: cio' che e' fatto di cubetti e
 * **non** passa per il materiale dei mezzi.
 */
export function faceShades(light: LightingModel): readonly number[] {
  return FACE_ORDER.map((normal) => {
    const rgb = faceLight(light, normal);
    return (rgb[0] + rgb[1] + rgb[2]) / 3;
  });
}
