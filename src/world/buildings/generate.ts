import { BUILDING_CLASS, type BuildingClass } from '../../sim';
import { hashCoords, mulberry32 } from '../rng';
import {
  BUILDER,
  CLASS_PROFILE,
  DEFAULT_BUILDING_FORM,
  DEFAULT_TYPOLOGY_SHAPE,
  LEVEL_CAPS,
  MAX_FOOTPRINT,
  START_LEVEL_CDF,
  type ClassProfile,
  type BuildingForm,
  type TypologyShape,
} from './config';
import type { VoxelStamp } from './stamp';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';

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
 * scelta dal PRNG e pesata dal profilo. Le rientranze, le terrazze e le mensole
 * sono cio' che resta quando si applica quella regola cinque volte di fila, non
 * qualcosa che qualcuno ha disegnato.
 *
 * **La tipologia piega la regola, non la sostituisce.** Il generatore non sa
 * che le tipologie esistono: riceve un profilo di disegno gia' fuso e tre
 * interruttori strutturali — podio, corte, coronamento piatto — e li applica.
 * Chi sceglie *quale* tipologia e' `typology.ts`, e sta a monte.
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
export interface BuildingRequest {
  /** Uso urbano primario: decide il profilo di base e la grammatica di superficie. */
  readonly class: BuildingClass;
  readonly level: number;
  readonly seed: number;
  readonly footprintCap?: number;
  readonly footprintFloor?: number;
  readonly form?: BuildingForm;
  /**
   * Profilo di disegno gia' fuso con quello della tipologia. Senza, quello
   * dell'uso: un edificio resta disegnabile anche fuori dal catalogo.
   */
  readonly profile?: ClassProfile;
  readonly shape?: TypologyShape;
  /**
   * Secondo uso ospitato. Colora il podio e gli da' la propria grammatica di
   * superficie: e' cosi' che un edificio misto si legge come misto da fuori,
   * senza bisogno di una zona, di un'etichetta o di un colore in piu'.
   */
  readonly mixed?: BuildingClass;
}

export function generateBuilding(request: BuildingRequest): VoxelStamp {
  const cls = request.class;
  const level = request.level;
  const form = request.form ?? DEFAULT_BUILDING_FORM;
  const shape = request.shape ?? DEFAULT_TYPOLOGY_SHAPE;
  const caps = LEVEL_CAPS[clamp(level, 0, LEVEL_CAPS.length - 1)];
  const baseProfile = request.profile ?? CLASS_PROFILE[cls];
  const profile: ClassProfile = {
    ...baseProfile,
    footprintBias: baseProfile.footprintBias + Math.round(
      form.accessibility * BUILDER.localForm.accessibilityFootprintBias,
    ),
    shrinkBias: clamp(
      baseProfile.shrinkBias +
        form.satisfaction * BUILDER.localForm.satisfactionTerraceBias +
        form.wealth * BUILDER.localForm.wealthTerraceBias,
      0,
      1,
    ),
  };
  const random = mulberry32(hashCoords(request.seed, cls, level));

  // Il tiro pesca sempre da `MAX_FOOTPRINT` e solo dopo si taglia al tetto.
  // Cosi' la sequenza del PRNG non dipende dal tetto, e rigenerare un edificio
  // passando la sua stessa impronta restituisce esattamente lo stamp di prima:
  // e' cio' che permette al Builder di cancellare un edificio senza averne
  // conservato i voxel.
  const cap = Math.min(caps.maxFootprint, request.footprintCap ?? MAX_FOOTPRINT, shape.maxFootprint);
  const minFootprint = Math.min(
    Math.max(caps.minFootprint, request.footprintFloor ?? 1, shape.minFootprint),
    cap,
  );
  const naturalFootprint = clamp(
    2 + Math.floor(random() * (MAX_FOOTPRINT - 1)) + profile.footprintBias,
    2,
    MAX_FOOTPRINT,
  );
  const footprint = clamp(naturalFootprint, minFootprint, cap);
  const naturalBands = pickInt(random, caps.minBands, caps.maxBands);
  const bands = clamp(
    naturalBands + Math.floor(form.density * BUILDER.localForm.densityBandBias),
    caps.minBands,
    caps.maxBands,
  );

  // L'accento a scala di edificio si decide qui, prima di disegnare: e' un
  // colore di corpo alternativo, non una passata di ritocco alla fine.
  const accented = random() < BUILDER.accentBuildingChance +
    form.wealth * BUILDER.localForm.wealthAccentChance;
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

  // Il podio non attraversa la grammatica: e' un blocco pieno che non rientra e
  // non si sposta, e la prima fascia sopra parte arretrata di netto. E' quel
  // gradino a rendere un podio commerciale con abitazioni riconoscibile da
  // lontano, dove una rientranza graduale si leggerebbe come una torre qualunque.
  const full: BandRect = { x0: 0, y0: 0, w: footprint, h: footprint };
  const podium = Math.min(shape.podiumBands, bands - 1);
  let rect: BandRect = full;
  for (let i = 0; i < bands; i++) {
    if (i < podium) rect = full;
    else if (i === podium && podium > 0) rect = shrink(full);
    else if (i > 0) rect = nextRect(random, rect, footprint, profile);
    rects.push(rect);
    heights.push(i < podium
      ? profile.bandHeight[0]
      : pickInt(random, profile.bandHeight[0], profile.bandHeight[1]));
  }

  // Coronamento: una fascia bassa e piu' stretta del corpo. Chiude la silhouette
  // invece di lasciarla tagliata di netto, che a distanza legge come un edificio
  // in costruzione.
  //
  // Un coronamento piatto non rientra affatto: su un'impronta di tre `shrink`
  // lascerebbe un cappello 1x1, cioe' proprio la guglia che una tipologia a
  // tetto piano non deve avere. Un capannone finisce con una copertura larga
  // quanto lui.
  const crownRect = shape.flatCrown ? rect : shrink(rect);
  rects.push(crownRect);
  const crownHeight = pickInt(random, 1, 2);
  heights.push(shape.flatCrown ? 1 : crownHeight);

  // Un solo dettaglio verticale chiude la silhouette senza introdurre rumore
  // per-voxel: camino, sfiato o antenna dipendono dal profilo. Il tiro si
  // consuma comunque, anche quando il coronamento e' piatto e il dettaglio non
  // viene disegnato: cosi' la tipologia sceglie la forma e non la sequenza, e
  // due tipologie sullo stesso seme restano confrontabili.
  const propRect: BandRect = {
    x0: crownRect.x0 + Math.floor(random() * crownRect.w),
    y0: crownRect.y0 + Math.floor(random() * crownRect.h),
    w: 1,
    h: 1,
  };
  rects.push(propRect);
  heights.push(shape.flatCrown ? 0 : profile.roofPropHeight);

  const podiumProfile = request.mixed !== undefined && podium > 0
    ? CLASS_PROFILE[request.mixed]
    : null;

  return paint({
    rects,
    heights,
    footprint,
    body,
    bodyAlt,
    accentId,
    accentFace,
    crown: profile.crown,
    plinth: profile.plinth,
    roofProp: profile.roofProp,
    surface: classSurface(cls),
    courtyard: shape.courtyard,
    podium,
    podiumBody: podiumProfile?.body ?? null,
    podiumAlt: podiumProfile?.bodyAlt ?? null,
    podiumSurface: request.mixed !== undefined ? classSurface(request.mixed) : classSurface(cls),
  });
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
 * sovrascrivono: corpo, cornice di sommita', faccia d'accento. La penultima
 * fascia e' il coronamento e prende il suo colore per intero, cornice compresa;
 * l'ultima e' il dettaglio sul tetto, e su un coronamento piatto e' alta zero.
 */
interface PaintRequest {
  readonly rects: readonly BandRect[];
  readonly heights: readonly number[];
  readonly footprint: number;
  readonly body: number;
  readonly bodyAlt: number;
  readonly accentId: number;
  readonly accentFace: number;
  readonly crown: number;
  readonly plinth: number;
  readonly roofProp: number;
  readonly surface: SurfaceKind;
  readonly courtyard: boolean;
  /** Fasce di base che appartengono al podio, gia' limitate a `bands - 1`. */
  readonly podium: number;
  readonly podiumBody: number | null;
  readonly podiumAlt: number | null;
  readonly podiumSurface: SurfaceKind;
}

function paint(request: PaintRequest): VoxelStamp {
  const { rects, heights, footprint } = request;
  let sizeZ = 0;
  for (const height of heights) sizeZ += height;

  const voxels = new Uint8Array(footprint * footprint * sizeZ);
  const surfaces = new Uint8Array(voxels.length);
  const bandStarts: number[] = [];

  let z = 0;
  for (let b = 0; b < rects.length; b++) {
    bandStarts.push(z);
    const rect = rects[b];
    const isCrown = b === rects.length - 2;
    const isRoofProp = b === rects.length - 1;
    const isPodium = b < request.podium;
    const top = z + heights[b] - 1;

    // La corte svuota il cuore delle fasce larghe. Non tocca il coronamento ne'
    // il podio: un isolato a corte ha un cortile, non un pozzo che lo attraversa
    // dal tetto alle fondamenta.
    const hollow = request.courtyard && !isCrown && !isRoofProp && !isPodium &&
      rect.w >= 3 && rect.h >= 3;

    const bandBody = isPodium && request.podiumBody !== null ? request.podiumBody : request.body;
    const bandAlt = isPodium && request.podiumAlt !== null ? request.podiumAlt : request.bodyAlt;
    const bandSurface = isPodium ? request.podiumSurface : request.surface;

    for (let sz = z; sz <= top; sz++) {
      // La cornice e' il voxel di sommita' della fascia: costa nulla e produce
      // le righe orizzontali che danno la scala all'edificio. Su una fascia alta
      // un voxel la cornice e' la fascia, ed e' corretto che lo sia.
      const layer = isRoofProp
        ? request.roofProp
        : isCrown
          ? request.crown
          : sz === 0
            ? request.plinth
            : sz === top
              ? bandAlt
              : bandBody;

      for (let sy = rect.y0; sy < rect.y0 + rect.h; sy++) {
        for (let sx = rect.x0; sx < rect.x0 + rect.w; sx++) {
          if (hollow &&
            sx > rect.x0 && sx < rect.x0 + rect.w - 1 &&
            sy > rect.y0 && sy < rect.y0 + rect.h - 1) {
            continue;
          }

          const accent = !isCrown && !isRoofProp && sz !== 0 &&
            onAccentFace(rect, sx, sy, request.accentFace);
          // Quando l'intero edificio usa il colore d'accento, `accentId`
          // coincide con la cornice normale. Sulla sommita' della fascia si
          // inverte quindi il contrasto, altrimenti proprio quel piano perde
          // la faccia che rende leggibile il volume.
          const accentLayer = request.accentId === layer ? bandBody : request.accentId;
          const index = sx + footprint * (sy + footprint * sz);
          voxels[index] = accent
            ? accentLayer
            : layer;
          surfaces[index] = isRoofProp
            ? SURFACE_KIND.utility
            : isCrown
              ? SURFACE_KIND.roofTech
              : sz <= 1 && onPortal(rect, sx, sy, request.accentFace)
                ? SURFACE_KIND.portal
                : accent
                  ? SURFACE_KIND.luminous
                  : bandSurface;
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
    surfaces,
    bandStarts,
  };
}

/** Un solo modulo d'ingresso, centrato sul lato principale e mai su un angolo. */
function onPortal(rect: BandRect, sx: number, sy: number, face: number): boolean {
  if (face <= 1) {
    if (rect.h < 3 || sy !== rect.y0 + Math.floor(rect.h / 2)) return false;
    return face === 0 ? sx === rect.x0 + rect.w - 1 : sx === rect.x0;
  }
  if (rect.w < 3 || sx !== rect.x0 + Math.floor(rect.w / 2)) return false;
  return face === 2 ? sy === rect.y0 + rect.h - 1 : sy === rect.y0;
}

/**
 * Grammatica di superficie di un uso.
 *
 * Gli usi sono quattro ma i tipi di superficie disponibili per gli edifici sono
 * tre: i tre bit alti di `visualBlock` sono tutti impegnati, e prendersene un
 * quarto significherebbe togliere un bit alla palette — cioe' rompere
 * l'invariante dei 32 slot per una lama di facciata. Il commerciale riusa
 * quindi la grammatica del residenziale, che gli calza: mensole orizzontali che
 * a piano terra leggono come tende e pensiline. A distinguerlo restano il
 * colore caldo, i portali al piano terra e le insegne luminose sugli accenti.
 */
function classSurface(cls: BuildingClass): SurfaceKind {
  if (cls === BUILDING_CLASS.industrial) return SURFACE_KIND.industrial;
  if (cls === BUILDING_CLASS.civic) return SURFACE_KIND.civic;
  return SURFACE_KIND.habitat;
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
