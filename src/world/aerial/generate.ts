import { AERIAL, AERIAL_PART, isBuildable, type AerialPart } from './config';
import type { DeckPlan, DeckRect, Pier } from './deckPlan';
import type { LiftPlan } from './guideway';
import {
  chamfered,
  cornerCutOf,
  terraceEdge,
  terraceSide,
  type TerraceSide,
} from './terraceForm';
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
 * **La mensola e' l'eccezione dichiarata, e la ragione e' che ha un davanti.** Un
 * tratto e un nodo non hanno un verso; una mensola esce da una parete e smussa i
 * due angoli alla punta. La sezione resta pero' la stessa lastra da un voxel del
 * percorso: a dire come regge sono gli appoggi, non un bordo colato alto quasi
 * quanto un piano di edificio.
 *
 * **La sezione dice come sta in piedi.**
 *
 * ```
 *   ║ ░░░░░░░░░ ║    parapetto sul filo, da emitRoofTech
 *   ─────────────    piano calpestabile
 *   ─────────────    lastra da un voxel
 *   ██        ██     la gamba, fino al proprio piede
 * ```
 *
 * Quella di una mensola smussa invece i due angoli esterni:
 *
 * ```
 *   ║░░░░░░░░░░╮     il piano arriva fino alla punta
 *   ──────────╯      una sola lastra, come il percorso
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

  // Una mensola ha un davanti; un tratto e un nodo no. `side` e' quel davanti, ed
  // e' anche l'interruttore fra le due sezioni: nullo, si scrive l'impalcato
  // piano che questo file ha sempre scritto.
  const side: TerraceSide | null = part === AERIAL_PART.terrace && plan.anchors.length > 0
    ? terraceSide(plan.rect, plan.anchors[0])
    : null;
  const cut = side === null ? 0 : cornerCutOf(plan.rect);

  for (let ly = 0; ly < sizeY; ly++) {
    for (let lx = 0; lx < sizeX; lx++) {
      const gx = segment.x + lx;
      const gy = segment.y + ly;
      // L'angolo smussato non e' un voxel che manca: e' la sagoma, e nemmeno il
      // piano ci arriva.
      if (side !== null && chamfered(plan.rect, side, cut, gx, gy)) continue;
      const edge = side === null
        ? edgeAt(plan.rect, gx, gy)
        : terraceEdge(plan.rect, side, cut, gx, gy);

      for (let lz = 0; lz < height - 1; lz++) {
        const carried = side === null
          // Il `drop` e' un inviluppo di quota, non un blocco da colare pieno.
          // Sotto la travatura del nodo continua soltanto la testa delle gambe:
          // riempire tutto il riquadro trasformava un pianerottolo da 6 x 6 con
          // un salto di otto voxel in un cubo quasi pieno alto dieci. La fascia
          // alta resta invece la travatura simmetrica di bordo e nervature che
          // regge il piano costruibile.
          ? lz < drop
            ? part === AERIAL_PART.node && onPier(plan, gx, gy)
            : edge || overPier(plan, gx, gy)
          // Una mensola ordinaria e' una lastra sola. Questo ramo resta utile
          // soltanto a un eventuale inviluppo verticale: sopra una gamba la
          // testa continua fino al piano, senza colare il resto del riquadro.
          : overPier(plan, gx, gy);
        if (!carried) continue;

        const index = lx + sizeX * (ly + sizeY * lz);
        voxels[index] = AERIAL.girderPalette;
        surfaces[index] = SURFACE_KIND.utility;
      }

      const index = lx + sizeX * (ly + sizeY * (height - 1));
      const green = planted && !edge && !inset(plan.rect, gx, gy);
      // **La linea corre incassata nel piano di un tratto, non sopra di lui.**
      // Un binario in rilievo vorrebbe un voxel di altezza in piu' su tutto
      // l'impalcato, cioe' un `DECK_HEIGHT` diverso per una decorazione; un file
      // di guida al posto della pavimentazione non costa niente a nessun budget
      // e legge come il maglev a filo di pavimento che deve leggere.
      const railed = part === AERIAL_PART.walk && !edge && onRail(plan.rect, gx, gy);
      voxels[index] = railed
        ? AERIAL.guide.railPalette
        : green ? AERIAL.gardenPalette : AERIAL.deckPalette;
      surfaces[index] = edge
        ? SURFACE_KIND.roofTech
        : railed ? SURFACE_KIND.utility : SURFACE_KIND.plain;
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

/**
 * Il montante: il fusto, la guida che gli corre addosso, e le capsule.
 *
 * ```
 *   ██▓  fusto e guida, per tutta la salita
 *   ██▓
 *   ██◆  una capsula ogni `podPitch`, luminosa di notte
 *   ██▓
 * ```
 *
 * La guida sta su **un** file di colonne del fusto, non su tutti: e' quella
 * asimmetria a farla leggere come una guida invece che come una scanalatura, e
 * a dire da che parte si sale.
 */
export function generateLift(plan: LiftPlan): VoxelStamp {
  const side = AERIAL.guide.side;
  const length = side * side * plan.height;
  const voxels = new Uint8Array(length);
  const surfaces = new Uint8Array(length);

  voxels.fill(AERIAL.guide.shaftPalette);
  surfaces.fill(SURFACE_KIND.utility);

  const { podStart, podPitch } = AERIAL.guide;
  for (let lz = 0; lz < plan.height; lz++) {
    // Una capsula ferma sulla guida: e' la parte che si accende, quindi e' anche
    // la sola che dice, di notte, che quel fusto e' una linea e non un pilastro.
    const pod = lz >= podStart && (lz - podStart) % podPitch === 0;
    for (let ly = 0; ly < side; ly++) {
      const index = 0 + side * (ly + side * lz);
      voxels[index] = pod ? AERIAL.guide.podPalette : AERIAL.guide.railPalette;
      surfaces[index] = pod ? SURFACE_KIND.luminous : SURFACE_KIND.utility;
    }
  }

  return {
    sizeX: side,
    sizeY: side,
    sizeZ: plan.height,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    bandStarts: [0, plan.height],
  };
}

/**
 * true se questa colonna porta la linea.
 *
 * Il file subito dentro il filo, su un lato solo: dall'altro resta il passaggio.
 * Si sceglie il lato lungo la corsa, cioe' quello che il tratto percorre — su un
 * riquadro piu' lungo che largo la linea corre nel verso in cui si va.
 */
function onRail(rect: DeckRect, gx: number, gy: number): boolean {
  return rect.sizeX >= rect.sizeY ? gy === rect.y + 1 : gx === rect.x + 1;
}

/** Una gamba, dal proprio piede fino sotto la travatura. */
export function generatePier(pier: Pier): VoxelStamp {
  const side = AERIAL.pierSide;
  const length = side * side * pier.height;
  const voxels = new Uint8Array(length);
  const surfaces = new Uint8Array(length);

  voxels.fill(AERIAL.pierPalette);
  // `plain` e' il segnale geometrico dei carichi pesanti: il mesher assottiglia
  // soltanto il 2 x 2 utility in calcestruzzo, senza introdurre un nono tipo di
  // superficie ne' cambiare l'ingombro strutturale nel mondo.
  surfaces.fill(pier.massive ? SURFACE_KIND.plain : SURFACE_KIND.utility);

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

/** true se la colonna sta proprio sopra la testa di una gamba. */
function onPier(plan: DeckPlan, gx: number, gy: number): boolean {
  for (const pier of plan.piers) {
    if (gx >= pier.x && gx < pier.x + AERIAL.pierSide &&
      gy >= pier.y && gy < pier.y + AERIAL.pierSide) return true;
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
