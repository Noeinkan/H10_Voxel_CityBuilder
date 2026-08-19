import type { BuildingClass } from '../../sim';
import { hashCoords, mulberry32 } from '../rng';
import {
  BUILDER,
  CLASS_PROFILE,
  LEVEL_CAPS,
  MAX_FOOTPRINT,
  START_LEVEL_CDF,
  type ClassProfile,
} from './config';
import type { VoxelStamp } from './stamp';

/**
 * Generatore procedurale di edifici.
 *
 * **Non conosce il mondo.** Nessun import di Three.js, nessun `VoxelWorld`,
 * nessuna coordinata di mondo: entra una tripla `(class, level, seed)` ed esce
 * uno stamp. E' cio' che rende il generatore verificabile in Node senza mondo e
 * senza terreno, e che permette al Builder di rigenerare l'impronta di un
 * edificio che ha costruito mille tick fa per cancellarla voxel per voxel senza
 * averla conservata.
 *
 * **Scheletro, non forme fisse.** Non esiste un catalogo di modelli. Esiste una
 * regola: una fascia si calcola dalla fascia sotto di se', con una trasformazione
 * scelta dal PRNG e pesata dalla classe. Le rientranze, le terrazze e le mensole
 * sono cio' che resta quando si applica quella regola cinque volte di fila, non
 * qualcosa che qualcuno ha disegnato.
 *
 * **Determinismo.** Tutto il caso esce da un solo PRNG con stato iniziale
 * `hash(class, level, seed)`. Due chiamate con gli stessi argomenti consumano la
 * stessa sequenza nello stesso ordine, quindi producono lo stesso array di byte.
 */

/** Rettangolo di una fascia dentro il riquadro dell'impronta, estremi esclusi in alto. */
interface BandRect {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Impronta voxel di un edificio.
 *
 * Il riquadro dello stamp coincide con l'impronta dichiarata al registry, e la
 * fascia di base lo riempie per intero. E' un vincolo che si paga in varieta' e
 * si riprende in solidita': la collisione fra edifici resta un confronto fra due
 * riquadri, e la fondazione livella esattamente le colonne che l'edificio
 * occupa, senza spianare terreno che poi resta scoperto.
 */
export function generateBuilding(
  cls: BuildingClass,
  level: number,
  seed: number,
  footprintCap = MAX_FOOTPRINT,
  footprintFloor = 1,
): VoxelStamp {
  const caps = LEVEL_CAPS[clamp(level, 0, LEVEL_CAPS.length - 1)];
  const profile = CLASS_PROFILE[cls];
  const random = mulberry32(hashCoords(seed, cls, level));

  // Il tiro pesca sempre da `MAX_FOOTPRINT` e solo dopo si taglia al tetto.
  // Cosi' la sequenza del PRNG non dipende dal tetto, e rigenerare un edificio
  // passando la sua stessa impronta restituisce esattamente lo stamp di prima:
  // e' cio' che permette al Builder di cancellare un edificio senza averne
  // conservato i voxel.
  const cap = Math.min(caps.maxFootprint, footprintCap);
  const minFootprint = Math.min(Math.max(caps.minFootprint, footprintFloor), cap);
  const naturalFootprint = clamp(
    2 + Math.floor(random() * (MAX_FOOTPRINT - 1)) + profile.footprintBias,
    2,
    MAX_FOOTPRINT,
  );
  const footprint = clamp(naturalFootprint, minFootprint, cap);
  const bands = pickInt(random, caps.minBands, caps.maxBands);

  // L'accento a scala di edificio si decide qui, prima di disegnare: e' un
  // colore di corpo alternativo, non una passata di ritocco alla fine.
  const accented = random() < BUILDER.accentBuildingChance;
  const body = accented ? profile.accent : profile.body;
  // La cornice mantiene il proprio tono anche quando l'accento sale a scala di
  // edificio: usare qui `body` renderebbe la faccia d'accento invisibile sulle
  // fasce alte due voxel, dove cornice e faccia finirebbero nello stesso slot.
  const bodyAlt = profile.bodyAlt;

  // La faccia d'accento resta sempre diversa dal corpo: su un edificio gia'
  // accentato prende il colore normale, che e' comunque un contrasto.
  const accentFace = pickInt(random, 0, 3);
  const accentId = accented ? profile.body : profile.accent;

  const rects: BandRect[] = [];
  const heights: number[] = [];

  let rect: BandRect = { x0: 0, y0: 0, w: footprint, h: footprint };
  for (let i = 0; i < bands; i++) {
    if (i > 0) rect = nextRect(random, rect, footprint, profile);
    rects.push(rect);
    heights.push(pickInt(random, profile.bandHeight[0], profile.bandHeight[1]));
  }

  // Coronamento: una fascia bassa e piu' stretta del corpo. Chiude la silhouette
  // invece di lasciarla tagliata di netto, che a distanza legge come un edificio
  // in costruzione.
  const crownRect = shrink(rect);
  rects.push(crownRect);
  heights.push(pickInt(random, 1, 2));

  // Un solo dettaglio verticale chiude la silhouette senza introdurre rumore
  // per-voxel: camino, sfiato o antenna dipendono esclusivamente dalla classe.
  const propRect: BandRect = {
    x0: crownRect.x0 + Math.floor(random() * crownRect.w),
    y0: crownRect.y0 + Math.floor(random() * crownRect.h),
    w: 1,
    h: 1,
  };
  rects.push(propRect);
  heights.push(profile.roofPropHeight);

  return paint(
    rects,
    heights,
    footprint,
    body,
    bodyAlt,
    accentId,
    accentFace,
    profile.crown,
    profile.plinth,
    profile.roofProp,
  );
}

/**
 * Trasforma la fascia precedente in quella sopra.
 *
 * Le trasformazioni candidate vengono provate in ordine casuale e si prende la
 * prima che regge: il seed sceglie *quale* forma, non *se* la forma sta in
 * piedi. La fascia di base resta il riquadro pieno, quindi nessuna fascia puo'
 * uscire dall'impronta e la collisione fra edifici resta bidimensionale.
 */
function nextRect(
  random: () => number,
  prev: BandRect,
  footprint: number,
  profile: ClassProfile,
): BandRect {
  const candidates = random() < profile.shrinkBias
    ? [shrink(prev), shrinkOneSide(random, prev), jog(random, prev)]
    : [jog(random, prev), grow(random, prev), shrinkOneSide(random, prev)];

  for (const candidate of candidates) {
    if (candidate.w <= 0 || candidate.h <= 0) continue;
    if (candidate.x0 < 0 || candidate.y0 < 0) continue;
    if (candidate.x0 + candidate.w > footprint || candidate.y0 + candidate.h > footprint) continue;
    if (!supported(candidate, prev)) continue;
    return candidate;
  }

  // Nessuna trasformazione regge: la fascia ripete quella sotto. Succede sulle
  // impronte 1x1, dove non c'e' spazio per muoversi.
  return prev;
}

/**
 * true se la fascia poggia su almeno meta' della propria area.
 *
 * E' il vincolo che tiene insieme una mensola e un blocco sospeso. Senza, due
 * spostamenti di un voxel nella stessa direzione staccherebbero la fascia dal
 * suo appoggio, e l'edificio avrebbe un pezzo per aria.
 */
function supported(rect: BandRect, below: BandRect): boolean {
  const overlapX = Math.min(rect.x0 + rect.w, below.x0 + below.w) - Math.max(rect.x0, below.x0);
  const overlapY = Math.min(rect.y0 + rect.h, below.y0 + below.h) - Math.max(rect.y0, below.y0);
  if (overlapX <= 0 || overlapY <= 0) return false;
  return overlapX * overlapY * 2 >= rect.w * rect.h;
}

/**
 * Rientranza centrata di un voxel per lato, che non svuota mai il rettangolo.
 *
 * Il minimo a 1 non e' una comodita': un lato di due voxel rientrato di uno per
 * parte resterebbe largo zero, e il coronamento sparirebbe proprio sugli
 * edifici piu' piccoli — dove si nota di piu', perche' la loro silhouette e'
 * quasi tutta cima.
 */
function shrink(rect: BandRect): BandRect {
  const w = Math.max(1, rect.w - 2);
  const h = Math.max(1, rect.h - 2);
  return {
    x0: rect.x0 + ((rect.w - w) >> 1),
    y0: rect.y0 + ((rect.h - h) >> 1),
    w,
    h,
  };
}

/** Rientranza di un voxel su un lato solo: produce le terrazze asimmetriche. */
function shrinkOneSide(random: () => number, rect: BandRect): BandRect {
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 + 1, w: rect.w - 1 };
    case 1:
      return { ...rect, w: rect.w - 1 };
    case 2:
      return { ...rect, y0: rect.y0 + 1, h: rect.h - 1 };
    default:
      return { ...rect, h: rect.h - 1 };
  }
}

/** Scarto laterale di un voxel a parita' di dimensione: la fascia sporge da un lato. */
function jog(random: () => number, rect: BandRect): BandRect {
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 + 1 };
    case 1:
      return { ...rect, x0: rect.x0 - 1 };
    case 2:
      return { ...rect, y0: rect.y0 + 1 };
    default:
      return { ...rect, y0: rect.y0 - 1 };
  }
}

/** Allargamento di un voxel su un lato, dentro il riquadro. */
function grow(random: () => number, rect: BandRect): BandRect {
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 - 1, w: rect.w + 1 };
    case 1:
      return { ...rect, w: rect.w + 1 };
    case 2:
      return { ...rect, y0: rect.y0 - 1, h: rect.h + 1 };
    default:
      return { ...rect, h: rect.h + 1 };
  }
}

/**
 * Riempie i voxel dalle fasce.
 *
 * Tre colori in tre passaggi sullo stesso voxel, nell'ordine in cui si
 * sovrascrivono: corpo, cornice di sommita', faccia d'accento. L'ultima fascia
 * e' il coronamento e prende il suo colore per intero, cornice compresa.
 */
function paint(
  rects: readonly BandRect[],
  heights: readonly number[],
  footprint: number,
  body: number,
  bodyAlt: number,
  accentId: number,
  accentFace: number,
  crown: number,
  plinth: number,
  roofProp: number,
): VoxelStamp {
  let sizeZ = 0;
  for (const height of heights) sizeZ += height;

  const voxels = new Uint8Array(footprint * footprint * sizeZ);
  const bandStarts: number[] = [];

  let z = 0;
  for (let b = 0; b < rects.length; b++) {
    bandStarts.push(z);
    const rect = rects[b];
    const isCrown = b === rects.length - 2;
    const isRoofProp = b === rects.length - 1;
    const top = z + heights[b] - 1;

    for (let sz = z; sz <= top; sz++) {
      // La cornice e' il voxel di sommita' della fascia: costa nulla e produce
      // le righe orizzontali che danno la scala all'edificio. Su una fascia alta
      // un voxel la cornice e' la fascia, ed e' corretto che lo sia.
      const layer = isRoofProp
        ? roofProp
        : isCrown
          ? crown
          : sz === 0
            ? plinth
            : sz === top
              ? bodyAlt
              : body;

      for (let sy = rect.y0; sy < rect.y0 + rect.h; sy++) {
        for (let sx = rect.x0; sx < rect.x0 + rect.w; sx++) {
          const accent = !isCrown && !isRoofProp && sz !== 0 &&
            onAccentFace(rect, sx, sy, accentFace);
          // Quando l'intero edificio usa il colore d'accento, `accentId`
          // coincide con la cornice normale. Sulla sommita' della fascia si
          // inverte quindi il contrasto, altrimenti proprio quel piano perde
          // la faccia che rende leggibile il volume.
          const accentLayer = accentId === layer ? body : accentId;
          voxels[sx + footprint * (sy + footprint * sz)] = accent
            ? accentLayer
            : layer;
        }
      }
    }

    z = top + 1;
  }
  bandStarts.push(sizeZ);

  return {
    sizeX: footprint,
    sizeY: footprint,
    sizeZ,
    // L'ancora e' l'angolo minimo: il sito che la simulazione propone e' la
    // colonna da cui il footprint si estende, non il suo centro.
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    bandStarts,
  };
}

/** true se il voxel sta sullo strato esterno del lato d'accento della sua fascia. */
function onAccentFace(rect: BandRect, sx: number, sy: number, face: number): boolean {
  switch (face) {
    case 0:
      return sx === rect.x0 + rect.w - 1;
    case 1:
      return sx === rect.x0;
    case 2:
      return sy === rect.y0 + rect.h - 1;
    default:
      return sy === rect.y0;
  }
}

/** Intero uniforme in `[min, max]`, estremi inclusi. */
function pickInt(random: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Livello con cui nasce un edificio nuovo.
 *
 * Estratto dalla distribuzione a coda lunga di `START_LEVEL_CDF`, e con un PRNG
 * separato da quello della forma: se condividessero la sequenza, cambiare il
 * livello iniziale cambierebbe anche la sagoma, e un upgrade non si
 * riconoscerebbe piu' come lo stesso edificio.
 */
export function startLevel(seed: number): number {
  const roll = mulberry32(hashCoords(seed, 0x1e7e1, 0))();
  for (let level = 0; level < BUILDER.maxLevel; level++) {
    if (roll < START_LEVEL_CDF[level]) return level;
  }
  return BUILDER.maxLevel;
}
