import type { InspectBox } from './inspect';
import { XRAY } from './xray';

/**
 * La buccia di un landmark, estratta dal volume voxel e pronta da disegnare
 * **attraverso** cio' che lo nasconde.
 *
 * ## Perche' il velo da solo non poteva bastare
 *
 * I raggi X dissolvevano gli occlusori sperando che il landmark emergesse fra le
 * righe. Non e' una questione di taratura: il retino e' una soglia in **pixel di
 * schermo**, quindi due occlusori sovrapposti la interrogano nello stesso punto
 * e ottengono la stessa risposta — non si compongono, vince il piu' vicino. Con
 * venti torri davanti la misura e' netta: solo il 39% dei pixel della lente
 * arriva fino al soggetto, e il resto e' la gabbia del primo occlusore sciolta
 * nella tinta dell'aria. E' il limite noto della screen-door transparency, e le
 * cure note — depth peeling, ordinamento per frammento — costano passate intere
 * su una citta' che si rimesha da sola.
 *
 * La via che i giochi prendono e' un'altra, ed e' sempre la stessa: **non
 * dissolvere venti cose, disegnarne una sola**. Il landmark si ridisegna con il
 * test di profondita' rovesciato — passa solo dove qualcosa gli sta davanti — e
 * allora si vede attraverso la citta' a piena intensita', che ci sia una torre o
 * venti. Il costo non dipende da quante sono.
 *
 * ## Perche' una mesh a parte
 *
 * Il mesher vero lavora a chunk, su volumi imbottiti dei 26 vicini, con piano di
 * scavo e microgeometria: e' la macchina che fa **sembrare** la citta' una
 * citta', e non la si riapre per una sagoma. Qui serve molto meno — la buccia
 * esterna del solo riquadro del landmark — e conviene estrarla a mano: sei
 * letture per voxel pieno, nessuna imbottitura, nessun AO.
 *
 * Questo file resta puro apposta: gira nei test in `node` come `inspect.ts` e
 * `xray.ts`, e chi lo veste di Three e' `LandmarkSilhouette.ts`.
 */

/**
 * Cosa c'e' in una cella: l'indice di palette, 0 se vuota.
 *
 * Una funzione e non il `VoxelWorld`: questo modulo non deve conoscere lo
 * storage, e il test gli passa un reticolo scritto a mano.
 */
export type VoxelReader = (x: number, y: number, z: number) => number;

/**
 * Quanto ogni faccia scurisce la tinta.
 *
 * Senza, la sagoma e' una macchia arancione piatta e si perde proprio la forma
 * che si stava cercando di mostrare. Sono gli stessi rapporti che `faceShades`
 * usa per i mezzi, riscritti qui invece che importati: quel modulo porta Three
 * dentro di se' e questo deve restare leggibile in `node`.
 *
 * Ordine: +X, -X, +Y, -Y, +Z, -Z.
 */
const FACE_SHADE: readonly number[] = [0.82, 0.68, 0.92, 0.6, 1, 0.5];

/** Spostamento della cella vicina, nello stesso ordine di `FACE_SHADE`. */
const FACE_STEP: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * I quattro angoli di ogni faccia, in frazioni di cella e in ordine antiorario
 * visti da fuori. Il verso conta: la sagoma si disegna con le back-face scartate,
 * e una faccia girata al contrario sparirebbe invece di accendersi.
 */
const FACE_CORNERS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
];

/**
 * Tetto duro di facce per sagoma.
 *
 * Un landmark sta in poche migliaia di facce, ma il riquadro arriva da un record
 * e un record puo' crescere: senza un tetto, una scatola sbagliata allocherebbe
 * decine di megabyte in mezzo a un frame. Cio' che sfora si scarta in silenzio,
 * come nel mesher — una sagoma tagliata resta leggibile, un fotogramma perso no.
 */
export const MAX_SILHOUETTE_FACES = 24000;

/** Vertici per faccia: due triangoli, niente indici. */
const VERTS_PER_FACE = 6;

/**
 * La buccia pronta per un `BufferGeometry`: posizioni e colori, triangoli
 * sciolti.
 *
 * `vertexCount` e non la lunghezza degli array: i buffer si allocano una volta
 * al massimo consentito e si riscrivono in posto, come fa `InspectGuides`, e
 * chi disegna muove il `drawRange` invece di riallocare.
 */
export interface LandmarkSurface {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly vertexCount: number;
}

/** Buffer vuoti: nessuna sagoma da disegnare. */
export const EMPTY_SURFACE: LandmarkSurface = {
  positions: new Float32Array(0),
  colors: new Float32Array(0),
  vertexCount: 0,
};

/**
 * Le facce esposte dei voxel pieni dentro il riquadro.
 *
 * Il vicino si interroga **anche fuori dal riquadro**, e non e' un dettaglio: un
 * landmark che tocca l'edificio accanto non deve disegnare la parete che li
 * separa, o la sagoma si accenderebbe di una faccia che nessuno puo' vedere. Per
 * la stessa ragione il riquadro e' quello del record e non quello allargato
 * della lente: il respiro serve al retino, non alla buccia.
 *
 * Gli estremi sono aperti a destra, come in `InspectBox`.
 */
export function buildLandmarkSurface(
  read: VoxelReader,
  box: InspectBox,
  scratch?: LandmarkSurface,
): LandmarkSurface {
  const capacity = MAX_SILHOUETTE_FACES * VERTS_PER_FACE * 3;
  const positions = scratch?.positions.length === capacity
    ? scratch.positions
    : new Float32Array(capacity);
  const colors = scratch?.colors.length === capacity
    ? scratch.colors
    : new Float32Array(capacity);

  const { r, g, b } = XRAY.glow;
  let cursor = 0;
  let faces = 0;

  for (let z = Math.floor(box.z0); z < box.z1; z++) {
    for (let y = Math.floor(box.y0); y < box.y1; y++) {
      for (let x = Math.floor(box.x0); x < box.x1; x++) {
        if (read(x, y, z) === 0) continue;
        for (let face = 0; face < 6; face++) {
          const step = FACE_STEP[face]!;
          if (read(x + step[0], y + step[1], z + step[2]) !== 0) continue;
          if (faces >= MAX_SILHOUETTE_FACES) {
            return { positions, colors, vertexCount: faces * VERTS_PER_FACE };
          }
          faces++;

          const shade = FACE_SHADE[face]!;
          const corners = FACE_CORNERS[face]!;
          // Due triangoli sullo stesso quadrilatero: 0-1-2 e 0-2-3.
          for (const index of [0, 1, 2, 0, 2, 3]) {
            const corner = corners[index]!;
            positions[cursor] = x + corner[0];
            positions[cursor + 1] = y + corner[1];
            positions[cursor + 2] = z + corner[2];
            colors[cursor] = r * shade;
            colors[cursor + 1] = g * shade;
            colors[cursor + 2] = b * shade;
            cursor += 3;
          }
        }
      }
    }
  }

  return { positions, colors, vertexCount: faces * VERTS_PER_FACE };
}

/** true se due riquadri sono lo stesso: evita di riestrarre una buccia identica. */
export function sameBox(a: InspectBox | null, b: InspectBox | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x0 === b.x0 && a.y0 === b.y0 && a.z0 === b.z0
    && a.x1 === b.x1 && a.y1 === b.y1 && a.z1 === b.z1;
}
