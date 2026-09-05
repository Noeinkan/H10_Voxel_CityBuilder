import { Raycaster, Vector2, type Camera } from 'three';
import { pickSolidCell, pickSurfaceCell, type Ray3, type SurfaceCell } from '../game/surfacePick';
import { TERRAIN } from '../world/terrain/config';
import type { ReadonlyBuildingRegistry } from '../world/buildings/BuildingRegistry';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';

/**
 * Dal pixel alla colonna: le tre domande che ogni gesto del mouse fa al mondo.
 *
 * Stanno insieme perche' condividono l'unico stato che serve a farle — il
 * raycaster e il vettore di schermo, riusati per non allocare a ogni movimento —
 * e perche' chi ne chiama una quasi sempre chiama anche le altre. Ogni strato
 * che risponde al puntatore (strumenti, scheda, discesa a terra, campionario)
 * riceve questo oggetto invece di rifarsi le proprie closure sul renderer.
 *
 * La camera arriva come **funzione**: dall'alto e da terra sono due proiezioni
 * diverse, e la vista corrente cambia sotto i piedi di chi tiene un riferimento.
 */
export interface PointerPickDeps {
  readonly element: HTMLElement;
  readonly view: () => Camera;
  readonly world: VoxelWorld;
  readonly map: () => TerrainMap | null;
  /** Il registro nasce con la citta': prima di allora si punta il solo terreno. */
  readonly registry: () => ReadonlyBuildingRegistry | undefined;
}

export interface PointerPick {
  /** Il raggio che parte dal pixel, in coordinate di mondo. */
  cursorRay(clientX: number, clientY: number): Ray3;
  /**
   * Su quale **terra** cade il cursore. E' la domanda di chi piazza qualcosa.
   *
   * Gli edifici non contano apposta: si costruisce sul suolo, e fermarsi su un
   * tetto darebbe una colonna dove non si puo' costruire niente.
   */
  surfaceCellAt(clientX: number, clientY: number): SurfaceCell | null;
  /**
   * **Cosa** sta indicando il cursore, edifici compresi. E' la domanda di chi
   * guarda, ed e' un'altra.
   *
   * Le viste usavano la prima, e non poteva funzionare: la heightmap attraversa
   * una torre come se fosse vetro e si ferma sulla terra dietro, che a
   * quarantacinque gradi sta a tante colonne quanto la torre e' alta. Puntare un
   * grattacielo apriva quindi la lente su un altro isolato — ed era la meta' del
   * motivo per cui i raggi X sembravano velare a caso.
   */
  pointedCellAt(clientX: number, clientY: number): SurfaceCell | null;
}

/**
 * Braccio anti-pan: sotto questa soglia in pixel il rilascio e' un clic.
 *
 * `isPanButton` accetta anche il tasto sinistro e `camera.attach` e' il primo
 * listener registrato, quindi ogni click **e' gia'** l'inizio di un pan, e fino
 * al rilascio non si sa se il gesto fosse un clic o una rotazione. Lo stesso
 * numero vale per ogni gesto che sceglie: la scheda, l'isolato in Block focus,
 * la gomma, la discesa a terra e il campionario.
 */
export const SELECT_CLICK_SLOP = 6;

export function createPointerPick(deps: PointerPickDeps): PointerPick {
  const picker = new Raycaster();
  const pointer = new Vector2();

  function cursorRay(clientX: number, clientY: number): Ray3 {
    const rect = deps.element.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    // `setFromCamera` sa gia' distinguere le due proiezioni: da terra il raggio
    // parte dall'occhio e diverge, di sopra parte dal piano vicino ed e' parallelo.
    // E' cio' che fa funzionare lo stesso `pointedCellAt` da entrambe le viste.
    picker.setFromCamera(pointer, deps.view());
    const origin = picker.ray.origin;
    const direction = picker.ray.direction;
    return {
      origin: [origin.x, origin.y, origin.z],
      direction: [direction.x, direction.y, direction.z],
    };
  }

  function surfaceCellAt(clientX: number, clientY: number): SurfaceCell | null {
    const map = deps.map();
    if (map === null) return null;
    return pickSurfaceCell(cursorRay(clientX, clientY), map);
  }

  return {
    cursorRay,
    surfaceCellAt,

    pointedCellAt(clientX: number, clientY: number): SurfaceCell | null {
      const map = deps.map();
      if (map === null) return null;
      const registry = deps.registry();
      if (registry === undefined) return surfaceCellAt(clientX, clientY);
      const bounds = deps.world.bounds;
      return pickSolidCell(
        cursorRay(clientX, clientY),
        map,
        (x, y) => registry.topOf(x, y),
        // La citta' non ha un tetto noto come la heightmap: il suo estremo e' quello
        // che il mondo ha davvero raggiunto, piu' un voxel per non tagliare l'ultimo.
        bounds.empty ? TERRAIN.maxHeight + 1 : bounds.maxZ + 1,
      );
    },
  };
}
