import {
  planDeck,
  type AerialProbe,
  type DeckPlan,
  type DeckRect,
  type DeckRefusal,
} from '../aerial/deckPlan';
import {
  faceAxis,
  faceOutward,
  faceRuns,
  wallRect,
  type AerialFace,
  type AerialSupport,
  type FaceRun,
} from '../aerial/terracePlan';

/** Una piattaforma di landmark appesa a una facciata. */
export interface FacadeLandmarkPlan {
  readonly host: number;
  readonly face: AerialFace;
  readonly deck: DeckPlan;
}

export type FacadeLandmarkRefusal = DeckRefusal | 'noRun';

export type FacadeLandmarkResult =
  | { readonly ok: true; readonly plan: FacadeLandmarkPlan }
  | { readonly ok: false; readonly refusal: FacadeLandmarkRefusal };

export interface FacadeLandmarkQuery extends AerialProbe {
  readonly host: AerialSupport;
  readonly faces: readonly AerialFace[];
  /** Ingombro della ricetta gia' ruotato nella faccia che si sta provando. */
  readonly sizeX: number;
  readonly sizeY: number;
}

/**
 * Appende l'ingombro di un landmark alla prima corsa di facciata che lo regge.
 *
 * Usa la stessa lettura di parete e lo stesso pianificatore delle terrazze:
 * quota, vuoto, franco e gambe non hanno una seconda interpretazione solo
 * perche' sopra il piano sorgera' uno scalo invece di restare una terrazza.
 */
export function planFacadeLandmark(query: FacadeLandmarkQuery): FacadeLandmarkResult {
  let refusal: FacadeLandmarkRefusal = 'noRun';

  for (const face of query.faces) {
    for (const run of faceRuns(query, query.host, face)) {
      const rect = facadeRect(query.host, face, run, query.sizeX, query.sizeY);
      if (rect === null) continue;

      const anchor = alignedWall(face, run, rect);
      const result = planDeck({
        rect,
        deckZ: run.z,
        anchors: [anchor],
        ground: query.ground,
        solid: query.solid,
      });
      if (result.ok) {
        return { ok: true, plan: { host: query.host.id, face, deck: result.plan } };
      }
      refusal = result.refusal;
    }
  }

  return { ok: false, refusal };
}

/** Il riquadro esce interamente dalla parete e si centra lungo la corsa. */
function facadeRect(
  host: AerialSupport,
  face: AerialFace,
  run: FaceRun,
  sizeX: number,
  sizeY: number,
): DeckRect | null {
  const axis = faceAxis(face);
  const outward = faceOutward(face);
  const along = axis === 0 ? sizeY : sizeX;
  const available = axis === 0 ? host.sizeY : host.sizeX;
  if (available < along) return null;

  // La ricetta si centra sull'intera facciata, non sulla sola corsa piena: una
  // torre 8×8 con spigoli smussati offre sei voxel continui di muro ma porta
  // comunque una piattaforma larga otto, con un voxel libero a ciascun capo.
  const crossFrom = axis === 0 ? host.y : host.x;
  const cross = crossFrom + ((available - along) >> 1);
  if (axis === 0) {
    const x = outward > 0 ? run.wall + 1 : run.wall - sizeX;
    return { x, y: cross, sizeX, sizeY };
  }
  const y = outward > 0 ? run.wall + 1 : run.wall - sizeY;
  return { x: cross, y, sizeX, sizeY };
}

/** Solo il tratto di parete davvero affiancato alla piattaforma porta il carico. */
function alignedWall(face: AerialFace, run: FaceRun, rect: DeckRect): DeckRect {
  const axis = faceAxis(face);
  const from = Math.max(run.from, axis === 0 ? rect.y : rect.x);
  const to = Math.min(
    run.to,
    axis === 0 ? rect.y + rect.sizeY - 1 : rect.x + rect.sizeX - 1,
  );
  return wallRect(face, {
    ...run,
    from,
    to,
  });
}
