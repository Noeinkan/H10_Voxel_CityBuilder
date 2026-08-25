/**
 * Traversata di un raggio nel volume voxel del campionario.
 *
 * **Pura e senza mondo.** Entra un raggio, il riquadro del campionario e un
 * predicato `solidAt`; esce il primo voxel pieno incontrato. Chi passa il
 * predicato decide cos'e' solido — il `VoxelWorld` vero in `main.ts`, un volume
 * sintetico nei test — e per questo la traversata si verifica in Node senza
 * Three.js e senza DOM.
 *
 * **Perche' una DDA e non il piano di prima.** Il campionario non e' piu' piatto:
 * accanto alla matrice ci sono edifici e landmark alti decine di voxel, e
 * intersecare un piano a meta' altezza sbaglia il soggetto quando si punta una
 * guglia o il vuoto dietro una torre. La traversata cella per cella si ferma sul
 * primo solido *visibile*, che e' la stessa domanda del picking di gioco.
 */

export interface VoxelRay {
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
}

export interface VoxelHit {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Riquadro in voxel, estremo massimo escluso, entro cui vale la traversata. */
export interface SwatchBox {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/** Intervallo di `t` in cui il raggio attraversa una lastra, o un intervallo vuoto. */
function axisRange(o: number, d: number, min: number, max: number): readonly [number, number] {
  if (d === 0) {
    return o >= min && o < max ? [-Infinity, Infinity] : [1, -1];
  }
  const t0 = (min - o) / d;
  const t1 = (max - o) / d;
  return t0 <= t1 ? [t0, t1] : [t1, t0];
}

/** `t` assoluto del primo confine che il raggio incontra oltre la cella `cell`. */
function boundaryT(o: number, d: number, cell: number, step: number): number {
  if (d === 0) return Infinity;
  const boundary = step > 0 ? cell + 1 : cell;
  return (boundary - o) / d;
}

/**
 * Primo voxel solido lungo il raggio, o null se esce dal riquadro senza colpirne.
 *
 * Amanatides & Woo: si avanza una cella alla volta, sempre verso il confine piu'
 * vicino, quindi nessun voxel viene saltato e il costo e' la sola lunghezza del
 * tratto attraversato. Il raggio si limita al riquadro con il metodo slab prima
 * di partire, cosi' un raggio che punta il cielo non cammina all'infinito.
 */
export function firstSolidVoxel(
  ray: VoxelRay,
  box: SwatchBox,
  solidAt: (x: number, y: number, z: number) => boolean,
): VoxelHit | null {
  const [tx0, tx1] = axisRange(ray.ox, ray.dx, box.minX, box.maxX);
  const [ty0, ty1] = axisRange(ray.oy, ray.dy, box.minY, box.maxY);
  const [tz0, tz1] = axisRange(ray.oz, ray.dz, box.minZ, box.maxZ);

  const enter = Math.max(0, tx0, ty0, tz0);
  const exit = Math.min(tx1, ty1, tz1);
  if (exit < enter) return null;

  // Un filo dentro il riquadro: fermarsi esattamente sul bordo esclusivo farebbe
  // leggere il voxel appena fuori.
  const t0 = enter + 1e-9;
  let x = Math.floor(ray.ox + ray.dx * t0);
  let y = Math.floor(ray.oy + ray.dy * t0);
  let z = Math.floor(ray.oz + ray.dz * t0);

  const stepX = ray.dx > 0 ? 1 : -1;
  const stepY = ray.dy > 0 ? 1 : -1;
  const stepZ = ray.dz > 0 ? 1 : -1;

  const deltaX = ray.dx === 0 ? Infinity : Math.abs(1 / ray.dx);
  const deltaY = ray.dy === 0 ? Infinity : Math.abs(1 / ray.dy);
  const deltaZ = ray.dz === 0 ? Infinity : Math.abs(1 / ray.dz);

  let tMaxX = boundaryT(ray.ox, ray.dx, x, stepX);
  let tMaxY = boundaryT(ray.oy, ray.dy, y, stepY);
  let tMaxZ = boundaryT(ray.oz, ray.dz, z, stepZ);

  let t = t0;
  while (t <= exit) {
    if (solidAt(x, y, z)) return { x, y, z };
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += deltaX;
    } else if (tMaxY <= tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += deltaY;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += deltaZ;
    }
  }
  return null;
}
