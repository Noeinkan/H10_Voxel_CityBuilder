import { hashCoords } from '../rng';
import { urbanFootprintStepsOf } from '../scale';
import { STREETS } from '../streets/config';
import type { BlockRect } from '../streets/streetGrid';
import { SURFACE_KIND } from '../visualBlock';
import {
  CLASS_PROFILE,
  BUILDER,
  DEFAULT_TYPOLOGY_SHAPE,
  GRAMMAR,
  MAX_FOOTPRINT,
} from './config';
import { generateBuilding, type BuildingRequest } from './generate';
import { classSurface } from './paint';
import { STAMP_EMPTY, type VoxelStamp } from './stamp';

/**
 * L'assemblatore dei lotti oltre il modulo.
 *
 * `generateBuilding` disegna un solo volume a fasce con impronta al massimo
 * `MAX_FOOTPRINT`. Quando il lotto a terra e' piu' largo — l'isolato regge fino
 * a ~40 voxel — un solo modulo lascerebbe il resto del lotto a prato. Qui
 * l'impronta si **scompone** in un layout deterministico di sotto-volumi, ognuno
 * un `generateBuilding` con sotto-impronta `<= MAX_FOOTPRINT` e un sotto-seme,
 * fusi in un solo `VoxelStamp` su un podio condiviso.
 *
 * **Non conosce il mondo.** Nessun `VoxelWorld`, nessuna `TerrainMap`, nessun
 * Three.js: entra una richiesta e un tetto d'impronta, esce uno stamp. E' la
 * stessa regola di `generate.ts`, e serve alla stessa cosa — rigenerare una
 * sagoma che il Builder ha scritto mille tick fa per cancellarla voxel per voxel.
 *
 * **Il vuoto fra i sotto-volumi non e' aria morta.** La sommita' del podio non
 * coperta da un sotto-volume e' terrazza/corte: riusa gli slot di `paint.ts`
 * (`terrace`/`garden` + `SURFACE_KIND.roofTech`), cosi' i pieni e vuoti si
 * leggono come un progetto e non come un errore.
 *
 * **Determinismo.** Tutto il caso esce da `request.seed` via
 * `hashCoords`/`mulberry32` con un sale proprio (`ASSEMBLE_SALT`): mai
 * `Math.random`/`Date.now`. Il sale serve a non correlare i sotto-semi al verso
 * o alla tipologia — lo stesso seme che li ha gia' tirati.
 */

/** Sale dell'assemblatore: separa i sotto-semi da ogni altro hash sullo stesso lotto. */
const ASSEMBLE_SALT = 0x53a9_0d6f;

/** Quante forme di layout esistono. L'indice e' un contratto: vedi `layoutCells`. */
const LAYOUT_COUNT = 5;

/** I gradini d'impronta fra il modulo e l'isolato intero. Vedi `urbanFootprintCap`. */
const URBAN_FOOTPRINT_STEPS = urbanFootprintStepsOf();

/**
 * Quanto lotto puo' chiedere un isolato alla nascita di un edificio.
 *
 * **L'isolato intero resta il premio del picco**, e su questo non e' cambiato
 * niente: solo il lotto che la gerarchia ha portato fino a `BUILDER.maxLevel` —
 * fascia del centro, cono verso il polo ed elezione dell'isolato tutti insieme —
 * puo' prendersi tutto il lato libero.
 *
 * Cio' che e' cambiato e' che sotto di lui non c'e' piu' il vuoto. Il gate era
 * un interruttore, e un interruttore che scatta su una coincidenza rara produce
 * una citta' fatta di aghi: tutto quello che non era picco restava largo otto
 * voxel per quanto in alto salisse. `urbanFootprintStepsOf` mette due gradini in
 * mezzo — la fascia intermedia arriva a meta' strada fra modulo e scala mega, il
 * centro non eletto alla scala mega — e la gerarchia smette di decidere la sola
 * altezza: adesso dice anche quanto un edificio si allarga salendo.
 *
 * **Il confronto e' `>=` e non `===`.** `allowedLevel` clampa gia' a
 * `BUILDER.maxLevel`, ma un tetto che superi il massimo per un altro chiamante
 * non deve ricadere in silenzio nel gradino sotto.
 *
 * **I gradini guardano il livello raggiunto, il lato libero no**, e la
 * distinzione e' costata due gate della citta' in quota. Il tetto dell'isolato
 * dice cosa quel luogo *concederebbe*, non quanto ci si e' costruito: una
 * colonna diventa `core` appena ha dodici vicini, quindi il suo tetto salta a
 * ventitre' mentre gli edifici sopra sono ancora al livello uno. Agganciando i
 * gradini a quel numero, la prima crescita di un quartiere nasceva gia' larga
 * dodici — i cortili si chiudevano, e con loro le sacche in cui `aerial/` apre
 * le piazze in quota. Il `level` di chi chiede riporta il gradino a dire quello
 * che deve dire: **ci si allarga salendo**, non appena il vicinato lo permette.
 *
 * L'isolato intero resta invece appeso al solo tetto, come sempre: e' una
 * proprieta' del luogo — la coincidenza fra fascia, cono ed elezione — e non un
 * premio che un edificio si guadagna crescendo.
 */
export function urbanFootprintCap(
  rect: BlockRect,
  allowedAt: (x: number, y: number) => number,
  level: number = Number.POSITIVE_INFINITY,
): number {
  const blockSide = Math.min(rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);
  const centerX = rect.x0 + ((rect.x1 - rect.x0) >> 1);
  const centerY = rect.y0 + ((rect.y1 - rect.y0) >> 1);
  const allowed = allowedAt(centerX, centerY);
  if (allowed >= BUILDER.maxLevel) return blockSide;

  const reached = Math.min(allowed, level);
  let side = MAX_FOOTPRINT;
  for (const step of URBAN_FOOTPRINT_STEPS) {
    if (reached >= step.fromLevel) side = step.side;
  }
  // Un gradino non puo' comunque sfondare l'isolato: dove la maglia e' stretta
  // il lato libero resta il vincolo, esattamente come per il picco.
  return Math.min(side, blockSide);
}

/**
 * Un sotto-volume nella pianta del podio: dove sta e quanto e' largo.
 *
 * Il lato e' sempre `<= MAX_FOOTPRINT` e il quadrato `[x, x+side) × [y, y+side)`
 * sta sempre dentro l'impronta.
 */
export interface AssembleCell {
  readonly x: number;
  readonly y: number;
  readonly side: number;
}

/**
 * Il lato di un sotto-volume, quantizzato al passo della maglia.
 *
 * Quantizzare a multiplo di `STREETS.align` (un cubo di terreno) tiene i
 * sotto-volumi allineati ai bordi dell'isolato, come gia' i lotti; il clamp a
 * `1..MAX_FOOTPRINT` e' il contratto del singolo modulo.
 */
function subSide(value: number, align: number): number {
  const quantized = Math.floor(value / align) * align;
  return Math.max(1, Math.min(MAX_FOOTPRINT, quantized));
}

/**
 * Il layout deterministico di un'impronta.
 *
 * `axis` sceglie l'asse lungo per le forme che ne hanno uno (due torri, fila, L).
 * Ogni voce torna un quadrato dentro l'impronta; le coordinate sono gia' locali
 * allo stamp fuso, quindi il blit e' un puro offset.
 */
function layoutCells(layout: number, side: number, axis: number): readonly AssembleCell[] {
  const align = STREETS.align;
  switch (layout) {
    // Un solo volume centrato: il podio resta leggibile come margine.
    case 0: {
      const s = subSide(side, align);
      const off = Math.floor((side - s) / 2);
      return [{ x: off, y: off, side: s }];
    }
    // Due volumi agli estremi opposti: nord/sud o est/ovest.
    case 1: {
      const s = subSide(Math.floor(side / 2), align);
      const far = side - s;
      return axis === 0
        ? [{ x: 0, y: 0, side: s }, { x: far, y: 0, side: s }]
        : [{ x: 0, y: 0, side: s }, { x: 0, y: far, side: s }];
    }
    // Quattro volumi agli angoli, con la corte centrale scoperta.
    case 2: {
      const s = subSide(Math.floor(side / 2), align);
      const far = side - s;
      return [
        { x: 0, y: 0, side: s }, { x: far, y: 0, side: s },
        { x: 0, y: far, side: s }, { x: far, y: far, side: s },
      ];
    }
    // Due volumi a L: uno pieno e uno piu' stretto sopra o di fianco.
    case 3: {
      const a = subSide(side - align, align);
      const b = subSide(Math.floor((side - a) / 2), align);
      return axis === 0
        ? [{ x: 0, y: 0, side: a }, { x: 0, y: a, side: b }]
        : [{ x: 0, y: 0, side: a }, { x: a, y: 0, side: b }];
    }
    // Una fila: tre volumi sulle impronte piu' larghe, due altrove.
    default: {
      const count = side >= 33 ? 3 : 2;
      const gap = align;
      const s = subSide(Math.floor((side - gap * (count - 1)) / count), align);
      const out: AssembleCell[] = [];
      for (let i = 0; i < count; i++) {
        const offset = i * (s + gap);
        out.push(axis === 0 ? { x: offset, y: 0, side: s } : { x: 0, y: offset, side: s });
      }
      return out;
    }
  }
}

/**
 * Le celle di un'assemblaggio, dal solo seme e dall'impronta.
 *
 * E' la meta' pura dell'assemblatore, estratta per essere verificabile senza
 * disegnare niente: lo stesso seme e la stessa impronta danno sempre lo stesso
 * layout, e ogni cella sta dentro l'impronta con lato `<= MAX_FOOTPRINT`.
 */
export function assembleLayoutCells(
  seed: number,
  footprintCap: number,
): readonly AssembleCell[] {
  const salt = (seed ^ ASSEMBLE_SALT) >>> 0;
  const layout = hashCoords(salt, footprintCap, 0) % LAYOUT_COUNT;
  const axis = hashCoords(salt, footprintCap, 1) & 1;
  return layoutCells(layout, footprintCap, axis);
}

/**
 * Un sotto-volume e lo stamp che lo disegna.
 *
 * Il sotto-seme esce da `hashCoords(sale, i, 0)`: l'indice della cella e' il
 * secondo argomento, cosi' l'ordine del layout non consuma tiri e la stessa
 * cella dello stesso lotto ha sempre lo stesso seme.
 */
interface AssembleSub extends AssembleCell {
  readonly stamp: VoxelStamp;
}

/** Copia i voxel solidi di uno stamp dentro la tela fusa, con un offset in pianta e in quota. */
function blit(
  voxels: Uint8Array,
  surfaces: Uint8Array,
  side: number,
  sizeZ: number,
  x0: number,
  y0: number,
  z0: number,
  stamp: VoxelStamp,
): void {
  for (let sz = 0; sz < stamp.sizeZ; sz++) {
    for (let sy = 0; sy < stamp.sizeY; sy++) {
      for (let sx = 0; sx < stamp.sizeX; sx++) {
        const from = sx + stamp.sizeX * (sy + stamp.sizeY * sz);
        const id = stamp.voxels[from];
        if (id === STAMP_EMPTY) continue;
        const wx = x0 + sx;
        const wy = y0 + sy;
        const wz = z0 + sz;
        // Cio' che sfora si scarta in silenzio, come in `landmarks/parts.ts`: le
        // celle del layout stanno dentro l'impronta, il controllo e' solo la rete
        // che tiene la scrittura nel buffer.
        if (wx < 0 || wy < 0 || wz < 0 || wx >= side || wy >= side || wz >= sizeZ) continue;
        const to = wx + side * (wy + side * wz);
        voxels[to] = id;
        surfaces[to] = stamp.surfaces[from];
      }
    }
  }
}

/**
 * Un edificio assemblato: sotto-volumi fusi su un podio condiviso.
 *
 * Il podio ha altezza `GRAMMAR.plinthHeight` e riempie l'intera impronta; la sua
 * sommita' e' terrazza (o giardino, se la tipologia chiede il verde) e i
 * sotto-volumi ci si appoggiano sopra. Il risultato e' un solo `VoxelStamp`
 * quadrato di lato `footprintCap`, con un'unica fascia — la comparsa a budget
 * scorre l'array lineare, come per i landmark.
 */
export function assembleBuilding(request: BuildingRequest, footprintCap: number): VoxelStamp {
  if (footprintCap <= MAX_FOOTPRINT) return generateBuilding({ ...request, footprintCap });

  const profile = request.profile ?? CLASS_PROFILE[request.class];
  const shape = request.shape ?? DEFAULT_TYPOLOGY_SHAPE;
  const surface = classSurface(request.class);
  const podium = GRAMMAR.plinthHeight;
  const salt = (request.seed ^ ASSEMBLE_SALT) >>> 0;

  const subs: AssembleSub[] = assembleLayoutCells(request.seed, footprintCap).map((cell, i) => ({
    ...cell,
    // Il sotto-volume forza `footprintFloor` a uno, cosi' il risultato non
    // dipende dal tetto d'impronta del chiamante: la nascita passa 1, la
    // cancellazione passa `record.footprint`, e se i due si propagassero ai
    // sotto-volumi la sagoma rigenerata non coinciderebbe con quella scritta.
    stamp: generateBuilding({
      ...request,
      footprintCap: cell.side,
      footprintFloor: 1,
      seed: hashCoords(salt, i, 0),
      // Un assemblaggio riempie il lotto, non aggetta sulla strada: lo sbalzo
      // resta alla nascita e alla promozione del singolo modulo, mai qui.
      shape: { ...shape, overhang: 0 },
    }),
  }));

  const maxHeight = subs.reduce((max, sub) => Math.max(max, sub.stamp.sizeZ), 0);
  const sizeZ = podium + maxHeight;
  const plane = footprintCap * footprintCap;
  const voxels = new Uint8Array(plane * sizeZ);
  const surfaces = new Uint8Array(plane * sizeZ);

  // Il podio: pieno su tutta l'impronta. La sommita' scoperta e' terrazza, con
  // il cuore piantato dove la tipologia porta il giardino pensile.
  const garden = shape.roofGarden ? profile.garden : null;
  for (let z = 0; z < podium; z++) {
    for (let y = 0; y < footprintCap; y++) {
      for (let x = 0; x < footprintCap; x++) {
        const index = x + footprintCap * (y + footprintCap * z);
        if (z === podium - 1) {
          const interior = x > 0 && y > 0 && x < footprintCap - 1 && y < footprintCap - 1;
          const planted = garden !== null && interior;
          voxels[index] = planted ? garden : profile.terrace;
          surfaces[index] = planted ? SURFACE_KIND.plain : SURFACE_KIND.roofTech;
        } else {
          voxels[index] = profile.plinth;
          surfaces[index] = surface;
        }
      }
    }
  }

  for (const sub of subs) {
    blit(voxels, surfaces, footprintCap, sizeZ, sub.x, sub.y, podium, sub.stamp);
  }

  return {
    sizeX: footprintCap,
    sizeY: footprintCap,
    sizeZ,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    bandStarts: [0, sizeZ],
  };
}

/**
 * Lo stamp di un edificio, singolo o assemblato.
 *
 * E' l'unico punto da cui nascita, promozione e cancellazione devono passare:
 * tre chiamanti con lo stesso sale e la stessa derivazione dei sotto-semi,
 * altrimenti la cancellazione rigenera una sagoma diversa e lascia voxel orfani.
 */
export function buildStamp(request: BuildingRequest, footprintCap: number): VoxelStamp {
  return footprintCap > MAX_FOOTPRINT
    ? assembleBuilding(request, footprintCap)
    : generateBuilding({ ...request, footprintCap });
}
