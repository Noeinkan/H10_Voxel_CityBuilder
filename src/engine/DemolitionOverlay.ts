import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three';

/**
 * Il riquadro che la gomma mostrera' sopra un edificio, ridotto a cio' che serve
 * a disegnarlo: niente registry, niente mondo — solo un pavimento in aria.
 */
export interface DemolishBox {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly z: number;
}

/**
 * Rosso e ambra: chi cade e chi resta.
 *
 * Il rosso e' il segnale della rimozione; l'ambra dice «questa sta in mezzo» —
 * la rete in quota, un'arcologia, chi la porta — e non e' un rifiuto generico,
 * e' l'unica cosa che la gomma non puo' toccare. Stanno sopra la scena
 * (`depthTest` spento) come il cursore di piazzamento, per non sparire dietro
 * la torre accanto.
 */
const DOOMED_COLOR = 0xff5a4a;
const PROTECTED_COLOR = 0xffb23a;

/** Scostamento dal tetto: senza, il pavimento entra nella cima e sfarfalla. */
const LIFT = 0.4;

/**
 * L'anteprima della gomma: un tappeto colorato sul tetto di ogni edificio che
 * sta per cadere, e uno ambra su cio' che la ferma.
 *
 * Nessuna mesh voxel viene toccata: e' un overlay come il contorno di selezione,
 * e sparisce appena il gesto si chiude.
 */
export class DemolitionOverlay {
  readonly group = new Group();

  private readonly doomed = this.layer(DOOMED_COLOR, 0.52);
  private readonly protectedBoxes = this.layer(PROTECTED_COLOR, 0.4);

  constructor() {
    this.group.add(this.doomed, this.protectedBoxes);
    this.group.visible = false;
  }

  show(doomed: readonly DemolishBox[], protectedBoxes: readonly DemolishBox[]): void {
    this.write(this.doomed, doomed);
    this.write(this.protectedBoxes, protectedBoxes);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  private layer(color: number, opacity: number): Mesh {
    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(new BufferGeometry(), material);
    mesh.renderOrder = 25;
    mesh.frustumCulled = false;
    return mesh;
  }

  private write(mesh: Mesh, boxes: readonly DemolishBox[]): void {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const box of boxes) {
      const x0 = box.x;
      const y0 = box.y;
      const x1 = box.x + box.sizeX;
      const y1 = box.y + box.sizeY;
      const z = box.z + LIFT;
      const base = positions.length / 3;
      positions.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    mesh.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(indices);
    mesh.geometry = geometry;
  }
}
