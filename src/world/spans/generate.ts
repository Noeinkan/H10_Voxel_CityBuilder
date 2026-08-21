import { SPANS, SPAN_KIND } from './config';
import { SPAN_HEIGHT, type SpanPlan, type SpanSegment } from './spanPlan';
import { SURFACE_KIND } from '../visualBlock';
import type { VoxelStamp } from '../buildings/stamp';

/**
 * Il generatore delle campate.
 *
 * **Non conosce il mondo.** Entrano un piano e uno dei suoi segmenti, esce uno
 * stamp: nessun `VoxelWorld`, nessuna `TerrainMap`, nessun Three.js. E' la
 * stessa regola di `buildings/generate.ts` e `landmarks/generate.ts`, e serve
 * alla stessa cosa — girare in un test in ambiente `node`, e permettere al
 * Builder di rigenerare una sagoma che ha scritto mille tick fa senza averla
 * conservata.
 *
 * **La sezione e' in tre righe, e non e' decorazione.** Un impalcato da un voxel
 * legge come un nastro incollato al cielo: e' il salto sotto la campata a dire
 * l'altezza, e per vederlo serve che la campata *abbia* un sotto. Due voxel di
 * travi sotto la carreggiata, aria fra le travi, e la mensola piena alle
 * testate — cio' che regge si vede.
 *
 * ```
 *   ║ ░ ▓▓ ░ ║   ║ parapetto, da emitRoofTech: non lo emette questo file
 *   ─────────   ░ passaggio  ▓ verde
 *   █       █   travi longitudinali, sotto i filari di parapetto
 *   █       █   ...e sotto le testate riempiono tutta la larghezza
 * ```
 *
 * **Perche' non usa le primitive dei landmark.** `landmarks/parts.ts` descrive
 * una struttura come un elenco di riquadri in un sistema di coordinate proprio.
 * Qui il disegno e' invece una funzione delle coordinate **globali** della
 * campata — la mensola sta ai capi della corsa, il verde sta nel suo cuore — e un
 * segmento e' una finestra su quel disegno. Tradurre la stessa regola in
 * riquadri per ogni finestra sarebbe lo stesso codice piu' una traslazione, e
 * due segmenti confinanti dovrebbero comunque accordarsi su dove cade il bordo.
 * Con i predicati globali si accordano per costruzione.
 */

export function generateSpan(plan: SpanPlan, segment: SpanSegment): VoxelStamp {
  const { sizeX, sizeY } = segment;
  const length = sizeX * sizeY * SPAN_HEIGHT;
  const voxels = new Uint8Array(length);
  const surfaces = new Uint8Array(length);

  const deckPalette = SPANS.deckPalette[plan.kind];

  for (let ly = 0; ly < sizeY; ly++) {
    for (let lx = 0; lx < sizeX; lx++) {
      const gx = segment.x + lx;
      const gy = segment.y + ly;

      if (girderAt(plan, gx, gy)) {
        for (let lz = 0; lz < SPANS.girderDepth; lz++) {
          const index = lx + sizeX * (ly + sizeY * lz);
          voxels[index] = SPANS.girderPalette;
          surfaces[index] = SURFACE_KIND.utility;
        }
      }

      const planted = plantedAt(plan, gx, gy);
      const index = lx + sizeX * (ly + sizeY * SPANS.girderDepth);
      voxels[index] = planted ? SPANS.gardenPalette : deckPalette;
      // Il verde non chiede microgeometria: un parapetto in mezzo alle aiuole
      // sarebbe una ringhiera dentro il prato. E' la stessa scelta che la 4.3 fa
      // sui giardini pensili, e per la stessa ragione.
      surfaces[index] = planted ? SURFACE_KIND.plain : SURFACE_KIND.roofTech;
    }
  }

  return {
    sizeX,
    sizeY,
    sizeZ: SPAN_HEIGHT,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    // Una campata non ha fasce: non nasce da una regola che sale, e la comparsa
    // a budget scorre l'array lineare senza consultare questo indice.
    bandStarts: [0, SPAN_HEIGHT],
  };
}

/**
 * true se sotto questa colonna corre una trave.
 *
 * Su una corsa lineare sono due, sotto i filari di bordo — quelli che portano il
 * parapetto — cosi' che di taglio la campata mostri due correnti e il vuoto in
 * mezzo. Alle testate riempiono tutta la larghezza: e' la mensola, cioe' il
 * punto d'appoggio reso visibile invece che nascosto nel muro.
 *
 * Sotto una piazza corrono in griglia: il bordo piu' una nervatura ogni
 * `segmentLength`, che e' anche il passo con cui la piazza compare.
 */
function girderAt(plan: SpanPlan, gx: number, gy: number): boolean {
  const dx = gx - plan.x;
  const dy = gy - plan.y;

  if (plan.kind === SPAN_KIND.plaza) {
    return dx === 0 || dy === 0 || dx === plan.sizeX - 1 || dy === plan.sizeY - 1 ||
      dx % SPANS.segmentLength === 0 || dy % SPANS.segmentLength === 0;
  }

  const along = plan.axis === 0 ? dx : dy;
  const across = plan.axis === 0 ? dy : dx;
  const width = plan.axis === 0 ? plan.sizeY : plan.sizeX;
  const run = plan.axis === 0 ? plan.sizeX : plan.sizeY;

  if (along < plan.corbel || along >= run - plan.corbel) return true;
  return across === 0 || across === width - 1;
}

/**
 * true se la colonna e' verde invece che pavimentata.
 *
 * Rientra di due per lato, non di uno: rientrando di uno il verde arriverebbe
 * al filo del parapetto e non resterebbe un posto da cui guardarlo. Due lasciano
 * un filare di passaggio dentro il parapetto su ogni lato — che e' il minimo
 * perche' quello che c'e' in mezzo sia un giardino e non un'aiuola spartitraffico.
 *
 * Sotto `plantedMinWidth` non si pianta affatto: l'interno e' tutto passaggio, e
 * un luogo comincia a esistere quando ci si sta.
 */
function plantedAt(plan: SpanPlan, gx: number, gy: number): boolean {
  const width = plan.axis === 0 ? plan.sizeY : plan.sizeX;
  if (plan.kind !== SPAN_KIND.plaza && width < SPANS.plantedMinWidth) return false;

  const dx = gx - plan.x;
  const dy = gy - plan.y;
  return dx >= 2 && dy >= 2 && dx < plan.sizeX - 2 && dy < plan.sizeY - 2;
}
