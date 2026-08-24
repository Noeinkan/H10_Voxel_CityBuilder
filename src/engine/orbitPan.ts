/**
 * Il pan da tastiera, nelle due forme che la camera deve avere.
 *
 * Sulla citta' i tasti spostano l'inquadratura sul piano di terra. In **orbita**
 * no: li' il perno e' il soggetto che si sta studiando, e muoverlo alla cieca
 * vuol dire perderlo — era esattamente la ragione per cui i tasti di pan in
 * orbita venivano ignorati. Qui il movimento c'e', ma dentro una scatola: si
 * gira attorno all'isolato e ci si sale lungo, senza poterlo lasciare fuori
 * inquadratura.
 *
 * Sta fuori da `IsoCameraController` perche' e' la meta' verificabile in `node`:
 * niente Three.js e niente DOM, come `inspect.ts` e `lighting.ts`.
 */

/**
 * Respiro oltre il soggetto, in voxel.
 *
 * Il perno e' il **centro** dell'inquadratura: fermandolo esatto sulla cima, il
 * tetto resterebbe a meta' schermo e non ci sarebbe modo di guardarlo dall'alto.
 * Poche colonne bastano — allargarlo rimette in gioco proprio la deriva da cui
 * la scatola difende.
 */
const PIVOT_MARGIN = 6;

/** Un perno mutabile: un `Vector3` entra qui senza che il modulo conosca Three. */
export interface Pivot {
  x: number;
  y: number;
  z: number;
}

/** La scatola dentro cui il perno dell'orbita puo' muoversi, in unita' di mondo. */
export interface OrbitBounds {
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
}

/** Gli assi di schermo che i tasti premuti compongono, in -1..1. */
export interface PanAxes {
  x: number;
  y: number;
}

/**
 * Legge i tasti premuti negli assi di schermo.
 *
 * Scrive in `out` invece di restituire un oggetto perche' gira una volta per
 * frame: e' la stessa ragione per cui `groundUnderPointer` prende un `Vector3`.
 * Il valore di ritorno dice se c'e' qualcosa da muovere, cosi' chi chiama salta
 * il resto del lavoro quando nessun tasto e' giu'.
 */
export function readPanAxes(keys: ReadonlySet<string>, out: PanAxes): boolean {
  let x = 0;
  let y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  out.x = x;
  out.y = y;
  return x !== 0 || y !== 0;
}

/**
 * Da voxel a unita' di mondo, con il respiro gia' dentro.
 *
 * La conversione sta qui e non da chi dichiara il soggetto: chi sceglie un
 * isolato ragiona in colonne, e la scala del voxel e' una faccenda della camera.
 */
export function scaleOrbitBounds(box: OrbitBounds, voxelSize: number): OrbitBounds {
  const margin = PIVOT_MARGIN * voxelSize;
  return {
    x0: box.x0 * voxelSize - margin,
    y0: box.y0 * voxelSize - margin,
    z0: box.z0 * voxelSize - margin,
    x1: box.x1 * voxelSize + margin,
    y1: box.y1 * voxelSize + margin,
    z1: box.z1 * voxelSize + margin,
  };
}

/**
 * Muove il perno dell'orbita di un passo, e lo riporta dentro la scatola.
 *
 * `right` scorre lungo la destra di schermo — la stessa base del trascinamento,
 * quindi i due gesti concordano a qualunque rotazione — mentre `up` sale in
 * **quota** invece di correre sul terreno. Non e' un'incoerenza con il pan della
 * citta': su un isolato l'asse con qualcosa da percorrere e' l'altezza, e
 * l'impronta si attraversa in una frazione di secondo. Su una torre di duecento
 * voxel il piano di terra non ha niente da offrire.
 */
export function panOrbitPivot(
  pivot: Pivot,
  yaw: number,
  right: number,
  up: number,
  bounds: OrbitBounds,
): void {
  pivot.x += right * -Math.sin(yaw);
  pivot.y += right * Math.cos(yaw);
  pivot.z += up;
  pivot.x = clamp(pivot.x, bounds.x0, bounds.x1);
  pivot.y = clamp(pivot.y, bounds.y0, bounds.y1);
  pivot.z = clamp(pivot.z, bounds.z0, bounds.z1);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  return value > max ? max : value;
}
