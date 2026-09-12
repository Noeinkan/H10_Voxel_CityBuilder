import {
  BufferAttribute,
  BufferGeometry,
  FrontSide,
  GreaterDepth,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { InspectBox } from './inspect';
import {
  buildLandmarkSurface,
  sameBox,
  MAX_SILHOUETTE_FACES,
  type LandmarkSurface,
} from './landmarkSurface';
import { XRAY } from './xray';

/**
 * Il landmark ridisegnato **attraverso** cio' che lo nasconde.
 *
 * E' la seconda meta' dei raggi X, e quella che mantiene la promessa scritta nel
 * pannello: «point near a landmark: it lights up through whatever hides it». Il
 * velo da solo non poteva mantenerla, e non per taratura — vedi `XRAY.lattice`:
 * la soglia del retino sta in pixel di schermo, quindi gli occlusori non si
 * compongono e con venti torri davanti il monumento resta sotto la gabbia del
 * primo.
 *
 * Qui non si vela niente. La mesh si disegna con `depthFunc: GreaterDepth`,
 * cioe' passa **solo dove il buffer di profondita' ha gia' qualcosa di piu'
 * vicino**: dove il landmark e' scoperto questa passata non disegna nulla — ci
 * pensa gia' la passata normale con la tinta di `inspectGlow` — e dove e'
 * sepolto compare la sua sagoma a piena intensita'. Il costo non dipende da
 * quanti edifici ci sono in mezzo, ed e' l'intera ragione della scelta.
 *
 * Vive accanto a `InspectGuides` e ne segue le regole: nessuna geometria voxel
 * del mondo viene toccata (invariante 6), il mesher resta intatto, e la tinta e'
 * la stessa delle guide perche' anche questa e' interfaccia appoggiata al mondo
 * — `toneMapped: false`, cosi' resta quella su tutti e sette i temi.
 */
export class LandmarkSilhouette {
  readonly mesh: Mesh;

  private readonly geometry = new BufferGeometry();
  private readonly material: MeshBasicMaterial;

  /**
   * I buffer, allocati una volta al tetto di `landmarkSurface.ts` e riscritti in
   * posto. Riallocare due `Float32Array` da qualche megabyte ogni volta che il
   * cursore passa su un monumento sarebbe l'unico costo vero di uno strumento
   * che altrimenti non ne ha.
   */
  private surface: LandmarkSurface | null = null;

  /** Ultimo riquadro estratto: la buccia si rifa' solo quando cambia. */
  private lastBox: InspectBox | null = null;

  constructor(private readonly world: VoxelWorld) {
    this.material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: XRAY.silhouette.opacity,
      // Il cuore della vista: passa solo dove qualcosa e' gia' piu' vicino.
      depthFunc: GreaterDepth,
      // E non scrive: la sagoma non deve nascondere ne' se stessa ne' cio' che
      // le sta dietro, altrimenti smetterebbe di leggersi come un fantasma.
      depthWrite: false,
      side: FrontSide,
      toneMapped: false,
    });

    const capacity = MAX_SILHOUETTE_FACES * 6 * 3;
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity), 3));
    this.geometry.setAttribute('color', new BufferAttribute(new Float32Array(capacity), 3));
    this.geometry.setDrawRange(0, 0);

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.renderOrder = XRAY.silhouette.renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // La sagoma e' un segno sopra la scena, non una cosa che si possa indicare:
    // il cursore deve continuare a trovare l'edificio che ha sotto.
    this.mesh.raycast = () => {};
  }

  /**
   * Allinea la sagoma al landmark che la lente ha agganciato, o la spegne.
   *
   * Gira una volta per frame subito dopo le uniform, e con la vista spenta si
   * riduce a un `visible = false`. La buccia si riestrae solo quando il riquadro
   * cambia — e cambia anche quando il landmark avanza di stadio, perche' lo
   * stadio ne cambia l'altezza, che e' proprio uno dei sei numeri confrontati.
   */
  update(box: InspectBox | null): void {
    if (box === null) {
      this.mesh.visible = false;
      this.lastBox = null;
      return;
    }
    if (!sameBox(box, this.lastBox)) {
      this.lastBox = box;
      this.surface = buildLandmarkSurface(
        (x, y, z) => this.world.getBlock(x, y, z),
        box,
        this.surface ?? undefined,
      );
      this.upload();
    }
    this.mesh.visible = (this.surface?.vertexCount ?? 0) > 0;
  }

  private upload(): void {
    const surface = this.surface;
    if (surface === null) return;
    const position = this.geometry.getAttribute('position') as BufferAttribute;
    const color = this.geometry.getAttribute('color') as BufferAttribute;
    const floats = surface.vertexCount * 3;
    (position.array as Float32Array).set(surface.positions.subarray(0, floats));
    (color.array as Float32Array).set(surface.colors.subarray(0, floats));
    position.needsUpdate = true;
    color.needsUpdate = true;
    this.geometry.setDrawRange(0, surface.vertexCount);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
