import { Box3, MathUtils, type Camera } from 'three';
import type { IsoCameraController, IsoCameraState } from '../IsoCameraController';
import type { StreetCameraController } from './StreetCameraController';
import { emptyBox, shadowBoxAround, type MutableBoxExtent } from './streetEye';

/**
 * Chi delle due camere sta disegnando, e cosa succede nell'istante in cui cambia.
 *
 * Esiste perche' scendere a terra non e' «usare un'altra camera»: e' staccare
 * l'input dell'una e attaccare quello dell'altra, mettere da parte
 * l'inquadratura da restituire, ripuntare il composer e restringere il volume
 * dell'ombra. Sono cinque conseguenze di un solo interruttore, e tenerle in
 * `main.ts` vorrebbe dire spargerle in cinque punti di un file che e' gia' la
 * radice di composizione di tutto il resto.
 *
 * Cio' che invece **non** fa e' avvolgere l'isometrica. Ne tiene un riferimento
 * per catturarne e restituirne lo stato, ma non ne rimpiazza il tipo: `main.ts`
 * legge ancora `view.top` e `view.zoom` per la caduta d'ingresso, e `InspectView`
 * chiama sei metodi che esistono solo la'. Allargare quel tipo a `Camera` per
 * servire un modo in cui nessuno dei due entra farebbe pagare dieci chiamanti
 * giusti per uno nuovo.
 */

export class StreetView {
  private readonly iso: IsoCameraController;
  private readonly street: StreetCameraController;
  private readonly element: HTMLElement;

  /** L'inquadratura da restituire all'uscita. `null` quando si e' di sopra. */
  private isoState: IsoCameraState | null = null;

  private readonly voxelSize: number;
  private readonly box = new Box3();
  private readonly extent: MutableBoxExtent = emptyBox();
  private readonly eye: [number, number, number] = [0, 0, 0];

  constructor(
    iso: IsoCameraController,
    element: HTMLElement,
    street: StreetCameraController,
    voxelSize = 1,
  ) {
    this.iso = iso;
    this.element = element;
    this.street = street;
    this.voxelSize = voxelSize;
  }

  get active(): boolean {
    return this.isoState !== null;
  }

  /** La camera del fotogramma: e' l'unica domanda che il ciclo di frame pone. */
  get view(): Camera {
    return this.isoState === null ? this.iso.camera : this.street.camera;
  }

  get controller(): StreetCameraController {
    return this.street;
  }

  setViewport(width: number, height: number): void {
    this.street.setViewport(width, height);
  }

  /**
   * Posa l'occhio e scende.
   *
   * La direzione di partenza e' quella da cui l'isometrica stava guardando —
   * mezzo giro dallo yaw della camera, che li' e' l'azimut dell'**offset** e non
   * dello sguardo. E' cio' che rende il passaggio un cambio di scala invece di
   * un teletrasporto: la citta' che si aveva davanti resta davanti.
   */
  enter(x: number, y: number, z: number): void {
    this.isoState ??= this.iso.captureState();
    this.street.setEye(x, y, z, MathUtils.degToRad(this.iso.yawDegrees) + Math.PI);
    // In coordinate di mondo, come l'AABB dei chunk con cui verranno intersecate.
    this.eye[0] = x * this.voxelSize;
    this.eye[1] = y * this.voxelSize;
    this.eye[2] = z * this.voxelSize;
    this.iso.detach(this.element);
    this.street.attach(this.element);
  }

  /** Risale, e restituisce l'inquadratura esattamente com'era. */
  exit(): void {
    const state = this.isoState;
    if (state === null) return;
    this.isoState = null;
    this.street.detach(this.element);
    this.iso.attach(this.element);
    this.iso.restoreState(state);
  }

  /**
   * Il volume su cui adattare la shadow map.
   *
   * Di sopra e' quello di sempre — **lo stesso oggetto**, non una copia: qui non
   * c'e' niente da decidere e passare per questa funzione non deve costare nulla.
   * A terra si stringe attorno all'occhio, perche' l'AABB dei chunk visibili
   * diventa un corridoio lungo quanto l'isola e il texel dell'ombra con lui.
   */
  shadowBounds(visible: Box3): Box3 {
    if (this.isoState === null || visible.isEmpty()) return visible;
    const e = shadowBoxAround(
      {
        minX: visible.min.x, minY: visible.min.y, minZ: visible.min.z,
        maxX: visible.max.x, maxY: visible.max.y, maxZ: visible.max.z,
      },
      this.eye,
      this.extent,
      this.voxelSize,
    );
    this.box.min.set(e.minX, e.minY, e.minZ);
    this.box.max.set(e.maxX, e.maxY, e.maxZ);
    return this.box;
  }
}
