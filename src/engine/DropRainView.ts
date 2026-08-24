import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Uint16BufferAttribute,
} from 'three';
import { RAIN, type RainCube } from './dropRain';
import { hexToLinear, type LightingModel } from './lighting';
import { FACE_CORNERS, faceShades } from './TrafficView';

/**
 * Disegna i cubetti che piovono mentre l'isola si monta.
 *
 * Una mesh sola con i buffer riscritti per frame e il `drawRange` a tagliare la
 * coda: e' l'idioma del pennacchio di `TrafficView`, e vale qui per la stessa
 * ragione — una mesh per cubetto sarebbe una draw call ogni goccia. A differenza
 * del pennacchio questa geometria **vive qualche secondo**: la finestra si chiude
 * con la prima scena e i buffer restano fermi per tutta la partita.
 *
 * I colori arrivano dalla palette del tema per la luce della faccia, come scafi e
 * funi: un cubetto che piove sull'isola deve sembrare un pezzo della stessa
 * materia, non un corpo estraneo. Restano allineati agli assi e non ruotano, per
 * la stessa ragione per cui gli scafi restano di scatole.
 */

/** Ombra per faccia finche' nessuno ha ancora passato un modello di luce. */
const FLAT: readonly number[] = [1, 1, 1, 1, 1, 1];

export class DropRainView {
  readonly group = new Group();

  private readonly geometry = new BufferGeometry();
  private readonly material = new MeshBasicMaterial({ vertexColors: true });
  private readonly positions: Float32Array;
  private readonly colours: Float32Array;

  private palette: readonly string[] = [];
  private shades: readonly number[] = FLAT;
  /** Tinte gia' portate in spazio lineare, per slot. Si svuota col tema. */
  private readonly tints = new Map<number, readonly [number, number, number]>();

  constructor() {
    const positions = new Float32BufferAttribute(new Float32Array(RAIN.maxLive * 24 * 3), 3);
    positions.setUsage(DynamicDrawUsage);
    const colours = new Float32BufferAttribute(new Float32Array(RAIN.maxLive * 24 * 3), 3);
    colours.setUsage(DynamicDrawUsage);

    // Gli indici non cambiano mai: i quad sono sempre gli stessi, a cambiare e'
    // solo quanti se ne disegnano.
    const indices = new Uint16Array(RAIN.maxLive * 36);
    for (let quad = 0; quad < RAIN.maxLive * 6; quad++) {
      const base = quad * 4;
      const at = quad * 6;
      indices[at] = base;
      indices[at + 1] = base + 1;
      indices[at + 2] = base + 2;
      indices[at + 3] = base;
      indices[at + 4] = base + 2;
      indices[at + 5] = base + 3;
    }

    this.geometry.setAttribute('position', positions);
    this.geometry.setAttribute('color', colours);
    this.geometry.setIndex(new Uint16BufferAttribute(indices, 1));
    this.geometry.setDrawRange(0, 0);
    this.positions = positions.array as Float32Array;
    this.colours = colours.array as Float32Array;

    const mesh = new Mesh(this.geometry, this.material);
    // La geometria cambia a ogni frame: ricalcolarne i limiti per il frustum
    // costerebbe piu' del disegno.
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.group.add(mesh);
    // Accanto ai mezzi: un cubetto e' un oggetto del mondo e dietro una collina
    // deve sparire.
    this.group.renderOrder = 5;
  }

  /** Colori dal tema e luce dell'ora, come per i mezzi: il colore e' il prodotto. */
  setLighting(colors: readonly string[], light: LightingModel): void {
    this.palette = colors;
    this.shades = faceShades(light);
    this.tints.clear();
  }

  /** Riscrive i cubetti in aria di questo istante. */
  draw(cubes: readonly RainCube[]): void {
    if (this.palette.length === 0) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const positions = this.positions;
    const colours = this.colours;
    let vertex = 0;
    let drawn = 0;

    for (const cube of cubes) {
      if (!cube.falling) continue;
      if (drawn >= RAIN.maxLive) break;

      const tint = this.tintOf(cube.palette);
      const half = cube.size / 2;
      for (let face = 0; face < FACE_CORNERS.length; face++) {
        const shade = this.shades[face];
        for (const [sx, sy, sz] of FACE_CORNERS[face]) {
          positions[vertex * 3] = cube.x + sx * half;
          positions[vertex * 3 + 1] = cube.y + sy * half;
          positions[vertex * 3 + 2] = cube.z + sz * half;
          colours[vertex * 3] = tint[0] * shade;
          colours[vertex * 3 + 1] = tint[1] * shade;
          colours[vertex * 3 + 2] = tint[2] * shade;
          vertex++;
        }
      }
      drawn++;
    }

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('color').needsUpdate = true;
    this.geometry.setDrawRange(0, drawn * 36);
  }

  /** Spegne la pioggia senza buttare via i buffer. */
  hide(): void {
    this.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private tintOf(slot: number): readonly [number, number, number] {
    let tint = this.tints.get(slot);
    if (tint === undefined) {
      tint = hexToLinear(this.palette[slot] ?? '#ffffff');
      this.tints.set(slot, tint);
    }
    return tint;
  }
}
