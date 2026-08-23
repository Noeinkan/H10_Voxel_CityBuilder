import { SURFACE_KIND } from '../visualBlock';
import type { VoxelStamp } from '../buildings/stamp';
import { CROSSINGS } from './config';
import { CROSSING_HEIGHT, type CrossingPier, type CrossingPlan, type CrossingSegment } from './crossingPlan';

/**
 * Il generatore degli attraversamenti.
 *
 * **Non conosce il mondo.** Entrano un piano e uno dei suoi segmenti, esce uno
 * stamp: nessun `VoxelWorld`, nessuna `TerrainMap`, nessun Three.js. E' la
 * stessa regola di `buildings/generate.ts`, `landmarks/generate.ts` e
 * `spans/generate.ts`, e serve alla stessa cosa — girare in un test in ambiente
 * `node`, e permettere al Builder di rigenerare una sagoma scritta mille tick fa
 * senza averla conservata.
 *
 * **La sezione e' quella delle campate, e non per pigrizia.** Travi sotto i
 * filari di parapetto, aria in mezzo, mensola piena alle testate: e' cio' che da'
 * un sotto all'impalcato, ed e' il sotto a dire l'altezza. Un attraversamento e'
 * piu' lungo di una campata, non fatto di un altro materiale, e dargli una
 * sezione propria vorrebbe dire che a meta' isola la citta' cambia linguaggio.
 *
 * ```
 *   ║ ░░░░ ║   ║ parapetto, da emitRoofTech: non lo emette questo file
 *   ────────   ░ carreggiata
 *   █      █   travi longitudinali, sotto i filari di parapetto
 *   ███  ███   ...e alle testate riempiono tutta la larghezza
 *      ██      la pila, che invece scende: e' quello che una campata non ha
 * ```
 *
 * **La pila e' uno stamp a parte**, non una parte dell'impalcato. Non e' una
 * comodita': una pila e' alta quanto il fondale chiede — decine di voxel — e
 * infilarla nella scatola dell'impalcato vorrebbe dire allocare quella scatola
 * alta come la pila piu' profonda e lasciarla vuota per il novantacinque per
 * cento. Sono due volumi con due quote di base, ed e' esattamente il caso che
 * `anchorZ` esiste per esprimere.
 */

export function generateCrossing(plan: CrossingPlan, segment: CrossingSegment): VoxelStamp {
  const { sizeX, sizeY } = segment;
  const length = sizeX * sizeY * CROSSING_HEIGHT;
  const voxels = new Uint8Array(length);
  const surfaces = new Uint8Array(length);

  for (let ly = 0; ly < sizeY; ly++) {
    for (let lx = 0; lx < sizeX; lx++) {
      const gx = segment.x + lx;
      const gy = segment.y + ly;

      if (girderAt(plan, gx, gy)) {
        for (let lz = 0; lz < CROSSINGS.girderDepth; lz++) {
          const index = lx + sizeX * (ly + sizeY * lz);
          voxels[index] = CROSSINGS.girderPalette;
          surfaces[index] = SURFACE_KIND.utility;
        }
      }

      const index = lx + sizeX * (ly + sizeY * CROSSINGS.girderDepth);
      voxels[index] = CROSSINGS.deckPalette;
      surfaces[index] = SURFACE_KIND.roofTech;
    }
  }

  return {
    sizeX,
    sizeY,
    sizeZ: CROSSING_HEIGHT,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    // Un attraversamento non ha fasce: non nasce da una regola che sale, e la
    // comparsa a budget scorre l'array lineare senza consultare questo indice.
    bandStarts: [0, CROSSING_HEIGHT],
  };
}

/**
 * Una pila, o una spalla: un prisma pieno dal suolo alla trave.
 *
 * Il coronamento e' l'ultimo voxel in quota, e vale la stessa ragione del
 * coronamento di un muro di banchina in `grading/config.ts`: un prisma tutto
 * della stessa tinta legge come uno scoglio, e la riga chiara in cima e' la sola
 * cosa che lo dichiari costruito. Su una spalla resta nascosto sotto
 * l'impalcato, e costa un confronto per voxel: si accetta, invece di tenere due
 * generatori per due piante della stessa cosa.
 */
export function generateCrossingPier(pier: CrossingPier): VoxelStamp {
  const length = pier.sizeX * pier.sizeY * pier.height;
  const voxels = new Uint8Array(length);
  const surfaces = new Uint8Array(length);

  for (let lz = 0; lz < pier.height; lz++) {
    const palette = lz === pier.height - 1 ? CROSSINGS.pierCoping : CROSSINGS.girderPalette;
    for (let i = 0; i < pier.sizeX * pier.sizeY; i++) {
      const index = i + pier.sizeX * pier.sizeY * lz;
      voxels[index] = palette;
      surfaces[index] = SURFACE_KIND.utility;
    }
  }

  return {
    sizeX: pier.sizeX,
    sizeY: pier.sizeY,
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
 * Due correnti sotto i filari di bordo, cosi' che di taglio l'impalcato mostri
 * una travatura e il vuoto in mezzo invece di una soletta. Alle testate
 * riempiono tutta la larghezza: e' la mensola, cioe' il punto d'appoggio reso
 * visibile invece che nascosto nel muro.
 *
 * **Anche sopra una pila**, e non solo alle testate: una pila che incontrasse
 * l'aria fra le due correnti reggerebbe il vuoto. E' l'unica riga in piu'
 * rispetto a `spans/generate.ts`, ed e' esattamente la differenza fra una
 * struttura che non prende suolo e una che lo prende.
 */
function girderAt(plan: CrossingPlan, gx: number, gy: number): boolean {
  const dx = gx - plan.x;
  const dy = gy - plan.y;

  const along = plan.axis === 0 ? dx : dy;
  const across = plan.axis === 0 ? dy : dx;
  const width = plan.axis === 0 ? plan.sizeY : plan.sizeX;
  const run = plan.axis === 0 ? plan.sizeX : plan.sizeY;

  if (along < plan.corbel || along >= run - plan.corbel) return true;
  if (across === 0 || across === width - 1) return true;
  return overPier(plan, gx, gy);
}

/** true se la colonna cade sopra una pila: li' la travatura si richiude. */
function overPier(plan: CrossingPlan, gx: number, gy: number): boolean {
  for (const pier of plan.piers) {
    if (gx >= pier.x && gx < pier.x + pier.sizeX && gy >= pier.y && gy < pier.y + pier.sizeY) {
      return true;
    }
  }
  return false;
}
