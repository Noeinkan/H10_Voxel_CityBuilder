import { AERIAL, isBuildable, type AerialPart } from './config';
import type { DeckPlan, DeckRect, Pier } from './deckPlan';
import { SURFACE_KIND } from '../visualBlock';
import type { VoxelStamp } from '../buildings/stamp';

/**
 * Il generatore della citta' in quota.
 *
 * **Non conosce il mondo.** Entrano un piano e uno dei suoi pezzi, esce uno
 * stamp: nessun `VoxelWorld`, nessuna `TerrainMap`, nessun Three.js. E' la stessa
 * regola di `buildings/generate.ts`, `landmarks/generate.ts` e
 * `spans/generate.ts`, e serve alla stessa cosa — girare in un test in ambiente
 * `node`, e permettere al Builder di rigenerare una sagoma scritta mille tick fa
 * senza averla conservata.
 *
 * **Un generatore solo per tre forme.** Mensola, tratto e nodo escono da qui, e
 * non c'e' un ramo per ciascuno: **la forma la dice il riquadro**. Il piano e' un
 * piano, il bordo prende il parapetto, il cuore diventa verde se e' largo
 * abbastanza. La sola cosa che il tipo decide e' se il cuore e' suolo su cui si
 * costruisce o pavimentazione da attraversare.
 *
 * **La sezione dice come sta in piedi.**
 *
 * ```
 *   ║ ░░░░░░░░░ ║    parapetto sul filo, da emitRoofTech
 *   ─────────────    piano calpestabile
 *   ██  ▒▒▒▒  ██     travatura sul bordo e sopra le gambe
 *   ██        ██     ...e piena, dove il nodo scende alla quota bassa
 *   ██        ██     la gamba, fino al proprio piede
 * ```
 *
 * Il parapetto non si disegna qui: si chiede `roofTech` al filo, e `emitRoofTech`
 * lo emette **solo dove quel filo confina con l'aria**. E' cio' che fa sparire la
 * ringhiera dal lato in cui una mensola tocca la propria parete, senza che questo
 * file sappia dove sia quella parete.
 */

/** Un impalcato, un riquadro per volta. */
export function generateDeck(plan: DeckPlan, part: AerialPart, segment: DeckRect): VoxelStamp {
  const { sizeX, sizeY } = segment;
  const height = plan.height;
  const length = sizeX * sizeY * height;
  const voxels = new Uint8Array(length);
  const surfaces = new Uint8Array(length);

  const drop = height - (AERIAL.girderDepth + 1);
  const planted = isBuildable(part) &&
    plan.rect.sizeX >= AERIAL.plantedMinWidth && plan.rect.sizeY >= AERIAL.plantedMinWidth;

  for (let ly = 0; ly < sizeY; ly++) {
    for (let lx = 0; lx < sizeX; lx++) {
      const gx = segment.x + lx;
      const gy = segment.y + ly;
      const edge = edgeAt(plan.rect, gx, gy);

      for (let lz = 0; lz < height - 1; lz++) {
        // Sotto la travatura il nodo e' pieno: e' il fianco che scende alla quota
        // bassa, ed e' cio' che si vede del salto fra due livelli.
        if (lz >= drop && !edge && !overPier(plan, gx, gy)) continue;
        const index = lx + sizeX * (ly + sizeY * lz);
        voxels[index] = AERIAL.girderPalette;
        surfaces[index] = SURFACE_KIND.utility;
      }

      const index = lx + sizeX * (ly + sizeY * (height - 1));
      const green = planted && !edge && !inset(plan.rect, gx, gy);
      voxels[index] = green ? AERIAL.gardenPalette : AERIAL.deckPalette;
      surfaces[index] = edge ? SURFACE_KIND.roofTech : SURFACE_KIND.plain;
    }
  }

  return {
    sizeX,
    sizeY,
    sizeZ: height,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    // Un impalcato non ha fasce: non nasce da una regola che sale, e la comparsa
    // a budget scorre l'array lineare senza consultare questo indice.
    bandStarts: [0, height],
  };
}

/** Una gamba, dal proprio piede fino sotto la travatura. */
export function generatePier(pier: Pier): VoxelStamp {
  const side = AERIAL.pierSide;
  const length = side * side * pier.height;
  const voxels = new Uint8Array(length);
  const surfaces = new Uint8Array(length);

  voxels.fill(AERIAL.pierPalette);
  surfaces.fill(SURFACE_KIND.utility);

  return {
    sizeX: side,
    sizeY: side,
    sizeZ: pier.height,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    bandStarts: [0, pier.height],
  };
}

/**
 * true se sotto questa colonna corre una trave.
 *
 * Il filo, piu' una nervatura in corrispondenza di ogni gamba: cosi' la travatura
 * scarica dove ci sono gli appoggi invece che a caso, e di sotto la griglia
 * racconta come l'impalcato sta su. Sopra una gamba e' piena per tutta la sua
 * sezione — e' la testa dell'appoggio, cioe' il punto di scarico reso visibile
 * invece che nascosto nella soletta.
 */
function overPier(plan: DeckPlan, gx: number, gy: number): boolean {
  for (const pier of plan.piers) {
    if (gx >= pier.x && gx < pier.x + AERIAL.pierSide) return true;
    if (gy >= pier.y && gy < pier.y + AERIAL.pierSide) return true;
  }
  return false;
}

/** true se la colonna sta sul filo dell'impalcato. */
function edgeAt(rect: DeckRect, gx: number, gy: number): boolean {
  return gx === rect.x || gy === rect.y ||
    gx === rect.x + rect.sizeX - 1 || gy === rect.y + rect.sizeY - 1;
}

/** true se la colonna sta nell'anello subito dentro il filo. */
function inset(rect: DeckRect, gx: number, gy: number): boolean {
  return gx === rect.x + 1 || gy === rect.y + 1 ||
    gx === rect.x + rect.sizeX - 2 || gy === rect.y + rect.sizeY - 2;
}
