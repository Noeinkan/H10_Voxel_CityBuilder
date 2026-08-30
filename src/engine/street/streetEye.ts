import type { SurfaceCell } from '../../game/surfacePick';

/**
 * I numeri della vista da terra, e la matematica che non ha bisogno di Three.
 *
 * Sta a `StreetCameraController` come `orbitPan.ts` sta a `IsoCameraController`:
 * li' c'e' come la camera si muove, qui cosa significano i gesti e dove ci si
 * puo' mettere. La divisione non e' ordine — e' cio' che rende testabile in node
 * la parte che decide, senza fingere una camera ne' un DOM.
 */

const RADIANS = Math.PI / 180;

/**
 * Quanto sta l'occhio sopra la superficie su cui poggia, in voxel.
 *
 * Una fascia di edificio e' 4-8 voxel (`bandHeight` nel catalogo delle
 * tipologie), cioe' un piano: tre voxel sono la spalla di un piano, ed e' la
 * scala a cui una porta al piano terra si legge come una porta. Piu' in basso si
 * finisce col naso nel marciapiede e la citta' sparisce dietro il primo cordolo;
 * piu' in alto si torna a guardarla dall'alto, che e' la vista da cui si e'
 * appena scesi.
 */
export const EYE_HEIGHT = 3;

/**
 * Estremi dell'inclinazione.
 *
 * Qui il limite e' uno solo, e non e' quello dell'isometrica: `lookAt` degenera
 * quando la direzione di vista diventa parallela a `up`, che nel mondo Z-up vuol
 * dire guardare esattamente ai piedi o esattamente allo zenit. Sotto **non** c'e'
 * nessun `1 / sin(pitch)` da far esplodere — quella era la correzione
 * azimut→schermo del pan sul piano di terra, e a terra non c'e' un piano da
 * seguire. E' per questo che di la' l'orizzonte era vietato e qui e' il punto di
 * partenza.
 */
export const MIN_PITCH = -85 * RADIANS;
export const MAX_PITCH = 85 * RADIANS;

/**
 * Campo visivo, in gradi: e' lo zoom di questa vista.
 *
 * Il riposo sta vicino ai cinquanta perche' e' l'angolo a cui una strada si
 * legge come una strada. Sotto i trenta la prospettiva si appiattisce e la
 * citta' torna quella dell'isometrica da cui si e' appena scesi; sopra i
 * settantacinque le facciate ai bordi si stirano. E' anche **la manopola di
 * costo** di questa vista: dimezzare il campo dimezza all'incirca i chunk nel
 * frustum, e il culling per chunk gira gia' su quello.
 */
export const MIN_FOV = 30;
export const MAX_FOV = 75;
export const REST_FOV = (MIN_FOV + MAX_FOV) / 2;
export const FOV_STEP = 1.08;

/**
 * Radianti di rotazione per pixel di movimento del mouse, al campo di riposo.
 *
 * Piu' lento dei 0,006 con cui `CameraInput` fa orbitare un soggetto, e non per
 * gusto: li' si tira un modellino tenendo premuto, quindi il gesto ha un inizio
 * e una fine e va coperto in fretta; qui il mouse gira la testa in continuazione,
 * e alla stessa velocita' basterebbe un colpo di polso per fare un giro su se
 * stessi.
 */
export const LOOK_SPEED = 0.0022;

/**
 * Il piano vicino, in voxel.
 *
 * Piccolo ma non minuscolo: con l'occhio a tre voxel dal suolo la geometria piu'
 * vicina che si puo' incontrare e' un parapetto a mezzo voxel. Scendere sotto
 * costa solo precisione nel depth buffer, che qui — a differenza
 * dell'ortografica, dove e' lineare e near/far generosi non costano niente — e'
 * distribuita in modo iperbolico e paga il rapporto `far / near`. Con `far` alla
 * diagonale di un'isola da 512 il rapporto resta sotto i quattromila, ed e' un
 * ordine di grandezza sotto il punto in cui due facce complanari di voxel
 * cominciano a litigare.
 */
export const STREET_NEAR = 0.25;

/**
 * Meta' lato della scatola d'ombra attorno all'occhio, in voxel.
 *
 * La shadow map si adatta all'AABB dei chunk visibili, e da terra quell'AABB e'
 * un corridoio lungo quanto l'isola: a 2048 texel su cinquecento voxel il texel
 * vale un quarto di voxel e l'ombra diventa poltiglia. Novantasei voxel sono
 * tre isolati, il tratto entro cui un'ombra si legge davvero come proiettata da
 * qualcosa; oltre, la prospettiva aerea sta gia' velando. A 2048 fa meno di un
 * decimo di voxel per texel, cioe' **piu' nitide** delle ombre isometriche di
 * oggi, e la pass costa meno perche' `renderShadow` ricula i proiettori sul
 * frustum del sole.
 */
export const SHADOW_REACH = 96;

/** Quanto della scatola d'ombra sta sotto e sopra l'occhio, in voxel. */
export const SHADOW_BELOW = 8;
export const SHADOW_ABOVE = 160;

/**
 * Perche' non ci si puo' mettere. `null` vuol dire che si puo'.
 *
 * `noGround` non e' «hai puntato male»: e' il raggio che esce dal mondo, cioe' il
 * cielo o il mare aperto oltre l'isola. `underwater` e' il caso che il raggio da
 * solo non vede — la heightmap risponde con il fondale, che e' terra a tutti gli
 * effetti, e senza questa riga si poserebbe l'occhio sotto il pelo dell'acqua.
 */
export type EyeRefusal = 'noGround' | 'underwater';

/** Cosa serve sapere del mondo, e non un pezzo di piu'. */
export type WaterTopAt = (x: number, y: number) => number;

export function eyeRefusal(cell: SurfaceCell | null, waterTopAt: WaterTopAt): EyeRefusal | null {
  if (cell === null) return 'noGround';
  // Il confronto e' con `hitZ` e non con `z`: su un molo o su un tetto sopra
  // l'acqua bassa si sta all'asciutto, ed e' la quota colpita a dirlo. Guardando
  // la sola colonna di terreno si rifiuterebbe proprio la banchina, che e' uno
  // dei posti da cui la citta' si guarda meglio.
  if (waterTopAt(cell.x, cell.y) > cell.hitZ) return 'underwater';
  return null;
}

/**
 * Il punto d'occhio, in voxel.
 *
 * Il piede va al **centro** della colonna e non al suo spigolo: mezzo voxel di
 * scarto non si nota da nessun'altra parte, ma qui l'occhio sta dentro la scena
 * e uno spigolo lo mette a filo della parete accanto.
 */
export function eyePoint(cell: SurfaceCell): readonly [number, number, number] {
  return [cell.x + 0.5, cell.y + 0.5, cell.hitZ + EYE_HEIGHT];
}

export interface BoxExtent {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export type MutableBoxExtent = { -readonly [K in keyof BoxExtent]: BoxExtent[K] };

/**
 * La scatola d'ombra attorno all'occhio, ristretta a cio' che esiste davvero.
 *
 * **Puo' solo rimpicciolire** il volume che riceve, ed e' la proprieta' che
 * conta: `visible` esclude gia' i chunk ancora in aria durante la caduta
 * d'ingresso, e un'intersezione non li puo' far rientrare. Fuori dalla scatola
 * la geometria resta semplicemente illuminata — `sampleShadow` risponde `1.0`
 * fuori dalla mappa, ed e' un fallimento morbido dichiarato — e il bordo si
 * nasconde da solo, perche' e' esattamente li' che il velo aereo e' piu' fitto.
 *
 * Scrive in `out` invece di restituire un oggetto nuovo: gira a ogni fotogramma,
 * e il budget di 3 ms non e' fatto di allocazioni per frame.
 */
export function shadowBoxAround(
  visible: BoxExtent,
  eye: readonly [number, number, number],
  out: MutableBoxExtent,
  scale = 1,
): MutableBoxExtent {
  const [ex, ey, ez] = eye;
  out.minX = Math.max(visible.minX, ex - SHADOW_REACH * scale);
  out.minY = Math.max(visible.minY, ey - SHADOW_REACH * scale);
  out.minZ = Math.max(visible.minZ, ez - SHADOW_BELOW * scale);
  out.maxX = Math.min(visible.maxX, ex + SHADOW_REACH * scale);
  out.maxY = Math.min(visible.maxY, ey + SHADOW_REACH * scale);
  out.maxZ = Math.min(visible.maxZ, ez + SHADOW_ABOVE * scale);
  return out;
}

/** Scatola di comodo per i test, che non hanno un `Box3` da riempire. */
export function emptyBox(): MutableBoxExtent {
  return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
}
