import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
} from 'three';

/**
 * Il tappeto sul tetto: la primitiva che due overlay diversi disegnano.
 *
 * **Un quad orizzontale alla quota di un tetto, e nient'altro.** La gomma lo usa
 * per dire chi cadra' e chi la ferma; il cursore del monumento per dire quali
 * riquadri sono gia' presi. Sono due domande diverse con lo stesso disegno, e
 * finche' il disegno stava dentro l'overlay della gomma il secondo avrebbe
 * dovuto ricopiarlo — due scritture di geometria che divergono al primo ritocco
 * sono esattamente il modo in cui due segnali che devono leggersi insieme
 * smettono di somigliarsi.
 *
 * Non conosce ne' registry ne' mondo: entrano pavimenti in aria, esce una mesh.
 */

/** Un pavimento in aria: pianta e quota, senza sapere di cosa sia il tetto. */
export interface CarpetBox {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly z: number;
}

/** Scostamento dal tetto: senza, il pavimento entra nella cima e sfarfalla. */
export const CARPET_LIFT = 0.4;

/**
 * Uno strato di tappeti, spento e vuoto.
 *
 * Sta sopra la scena (`depthTest` spento) come il cursore di piazzamento, per
 * non sparire dietro la torre accanto; `renderOrder` decide chi vince fra due
 * strati complanari, ed e' il motivo per cui e' un parametro invece di una
 * costante — un segnale pieno deve coprire quello fioco che gli sta sotto.
 */
export function carpetLayer(color: number, opacity: number, renderOrder: number): Mesh {
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(new BufferGeometry(), material);
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  return mesh;
}

/** Riscrive lo strato con i tappeti dati: una geometria sola per strato. */
export function writeCarpet(mesh: Mesh, boxes: readonly CarpetBox[]): void {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const box of boxes) {
    const x0 = box.x;
    const y0 = box.y;
    const x1 = box.x + box.sizeX;
    const y1 = box.y + box.sizeY;
    const z = box.z + CARPET_LIFT;
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
