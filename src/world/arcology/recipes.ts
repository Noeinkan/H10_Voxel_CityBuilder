import { BUILDING_CLASS } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { PART, box, type Part } from '../landmarks/parts';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';
import type { ArcologyRecipe, BaseArcologyKind } from './config';

type ThresholdFactory = (stages: number) => readonly number[];

/** Il podio condiviso: corto, pieno e con due piazzali sul perimetro. */
function podium(
  w: number,
  d: number,
  palette: number,
  chamfer: number,
  step: number,
  pods: readonly (readonly [number, number, number, number])[],
): readonly Part[] {
  return [
    box(PART.slab, 0, 0, w, d, 0, 13, palette, SURFACE_KIND.industrial, { chamfer }),
    box(PART.deck, 0, 0, w, d, 13, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, { chamfer }),
    box(PART.colonnade, 0, 0, w, d, 14, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
      step,
      chamfer,
      cap: PALETTE_SLOTS.concretePale,
    }),
    box(PART.deck, 0, 0, w, d, 18, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility, { chamfer }),
    ...pods.map(([x, y, pw, ph]) =>
      box(PART.slab, x, y, pw, ph, 19, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility)),
  ];
}

/**
 * Corpo cavo a parete esplicita, sempre composto da shell concentriche.
 *
 * Due pelli tengono il corpo cavo ma impediscono che gli inviluppi molto alti
 * scendano sotto il riempimento minimo soltanto per lo spessore di un voxel.
 */
function shellBody(
  x: number,
  y: number,
  w: number,
  d: number,
  z: number,
  height: number,
  palette: number,
  surface: SurfaceKind,
  thickness = 2,
): readonly Part[] {
  const result: Part[] = [];
  for (let inset = 0; inset < thickness; inset++) {
    const innerW = w - inset * 2;
    const innerD = d - inset * 2;
    if (innerW < 3 || innerD < 3) break;
    result.push(box(
      PART.shell,
      x + inset,
      y + inset,
      innerW,
      innerD,
      z,
      height,
      palette,
      surface,
    ));
  }
  return result;
}

/** Le otto forme alte; i numeri di quota vivono soltanto in questo catalogo. */
export function createArcologyRecipes(
  thresholds: ThresholdFactory,
): Record<BaseArcologyKind, ArcologyRecipe> {
  const twinStem: ArcologyRecipe = {
    kind: 'twinStem',
    blocks: [1, 1],
    span: [20, 20],
    // Tre tronchi di corpo occupano 205 quote; corona e due montanti arrivano a 320.
    height: 320,
    anchor: [10, 10],
    stages: thresholds(6),
    parts: [
      podium(20, 20, PALETTE_SLOTS.concrete, 2, 3, [[7, 0, 6, 6], [7, 14, 6, 6]]),
      shellBody(2, 2, 16, 16, 19, 70, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      [
        ...shellBody(2, 3, 6, 14, 89, 68, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(12, 3, 6, 14, 89, 68, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(3, 4, 5, 12, 157, 67, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(12, 4, 5, 12, 157, 67, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        box(PART.boom, 3, 6, 14, 8, 224, 8, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 3, 6, 14, 8, 232, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 2, 6, 7, 7, 233, 30, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 3, 7, 5, 5, 263, 30, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 4, 8, 3, 3, 293, 27, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 11, 6, 7, 7, 233, 30, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 12, 7, 5, 5, 263, 30, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 13, 8, 3, 3, 293, 27, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 2, y: 8, z: 89, label: 'stems' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 11, y: 8, z: 157, label: 'towers' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 9, y: 8, z: 224, label: 'crown' },
    ],
    landings: [
      { stage: 0, x: 7, y: 0, w: 6, h: 6, z: 23 },
      { stage: 0, x: 7, y: 14, w: 6, h: 6, z: 23 },
    ],
  };

  const branchingCore: ArcologyRecipe = {
    kind: 'branchingCore',
    blocks: [1, 1],
    span: [20, 20],
    // Il nucleo si divide presto in quattro corpi e finisce in un solo montante.
    height: 320,
    anchor: [10, 10],
    stages: thresholds(6),
    parts: [
      podium(20, 20, PALETTE_SLOTS.stoneDeep, 3, 4, [[0, 7, 6, 6], [14, 7, 6, 6]]),
      shellBody(2, 2, 16, 16, 19, 65, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      [
        ...shellBody(2, 2, 7, 7, 84, 67, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(11, 2, 7, 7, 84, 67, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(2, 11, 7, 7, 84, 67, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(11, 11, 7, 7, 84, 67, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      ],
      [
        ...shellBody(3, 3, 6, 6, 151, 68, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(11, 3, 6, 6, 151, 68, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(3, 11, 6, 6, 151, 68, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(11, 11, 6, 6, 151, 68, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        box(PART.boom, 3, 8, 6, 1, 219, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 11, 8, 6, 1, 219, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 3, 9, 14, 2, 219, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        // Il secondo braccio sale dopo il primo: sullo stesso piano i due vuoti
        // formerebbero un unico riquadro e nasconderebbero la finestra passante.
        box(PART.boom, 8, 3, 4, 14, 227, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.deck, 3, 9, 14, 2, 235, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.deck, 8, 3, 4, 14, 235, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 6, 6, 7, 7, 236, 28, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 7, 7, 5, 5, 264, 28, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 8, 8, 3, 3, 292, 28, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 2, y: 4, z: 84, label: 'branches' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 11, y: 4, z: 151, label: 'spires' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 9, y: 9, z: 219, label: 'cross' },
    ],
    landings: [
      { stage: 0, x: 0, y: 7, w: 6, h: 6, z: 23 },
      { stage: 0, x: 14, y: 7, w: 6, h: 6, z: 23 },
    ],
  };

  const skyWeave: ArcologyRecipe = {
    kind: 'skyWeave',
    blocks: [1, 1],
    span: [20, 20],
    // Due lame orizzontali rientrano due volte e reggono quattro montanti corti.
    height: 320,
    anchor: [10, 10],
    stages: thresholds(6),
    parts: [
      podium(20, 20, PALETTE_SLOTS.concrete, 1, 3, [[7, 0, 6, 6], [7, 14, 6, 6]]),
      shellBody(2, 3, 16, 14, 19, 73, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      [
        ...shellBody(3, 3, 14, 6, 92, 68, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(3, 11, 14, 6, 92, 68, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(4, 4, 12, 5, 160, 66, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(4, 11, 12, 5, 160, 66, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        box(PART.boom, 4, 8, 12, 4, 226, 7, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.boom, 8, 4, 4, 12, 226, 7, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 4, 8, 12, 4, 233, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.deck, 8, 4, 4, 12, 233, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        // L'armatura e' larga quattro: il gradone arriva a quattro per quattro
        // e il tronco finale resta tre per tre, senza invadere i vuoti del nodo.
        box(PART.mast, 4, 8, 4, 4, 234, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 5, 8, 3, 3, 258, 62, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 12, 8, 4, 4, 234, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 13, 9, 3, 3, 258, 54, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 8, 3, 4, 4, 234, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 8, 5, 3, 3, 258, 46, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 8, 11, 4, 4, 234, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 9, 13, 3, 3, 258, 38, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 3, y: 6, z: 92, label: 'weave' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 4, y: 12, z: 160, label: 'ribbons' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 9, y: 9, z: 226, label: 'knot' },
    ],
    landings: [
      { stage: 0, x: 7, y: 0, w: 6, h: 6, z: 23 },
      { stage: 0, x: 7, y: 14, w: 6, h: 6, z: 23 },
    ],
  };

  const spireRing: ArcologyRecipe = {
    kind: 'spireRing',
    blocks: [1, 1],
    span: [18, 18],
    // Quattro guglie rastremate circondano il vuoto; la corona sale in diagonale.
    height: 320,
    anchor: [9, 9],
    stages: thresholds(6),
    parts: [
      podium(18, 18, PALETTE_SLOTS.stoneDeep, 2, 3, [[6, 0, 6, 6], [6, 12, 6, 6]]),
      shellBody(1, 1, 16, 16, 19, 68, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      [
        ...shellBody(1, 1, 7, 7, 87, 69, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(10, 1, 7, 7, 87, 69, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(1, 10, 7, 7, 87, 69, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(10, 10, 7, 7, 87, 69, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(2, 2, 6, 6, 156, 66, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(10, 2, 6, 6, 156, 66, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(2, 10, 6, 6, 156, 66, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(10, 10, 6, 6, 156, 66, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        box(PART.boom, 2, 7, 6, 1, 222, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 10, 7, 6, 1, 222, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 2, 8, 14, 2, 222, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 8, 2, 2, 14, 230, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.deck, 2, 8, 14, 2, 238, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.deck, 8, 2, 2, 14, 238, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 1, 5, 7, 7, 239, 27, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 2, 6, 5, 5, 266, 27, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 3, 7, 3, 3, 293, 27, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 11, 7, 5, 5, 239, 37, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 12, 8, 3, 3, 276, 37, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 1, y: 4, z: 87, label: 'ring' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 10, y: 4, z: 156, label: 'spires' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 8, y: 8, z: 222, label: 'diagonal crown' },
    ],
    landings: [
      { stage: 0, x: 6, y: 0, w: 6, h: 6, z: 23 },
      { stage: 0, x: 6, y: 12, w: 6, h: 6, z: 23 },
    ],
  };

  const doubleBar: ArcologyRecipe = {
    kind: 'doubleBar',
    blocks: [2, 1],
    span: [48, 20],
    // Due barre a parete doppia salgono per 336 quote con due ritiri netti.
    height: 440,
    anchor: [24, 10],
    stages: thresholds(6),
    parts: [
      podium(48, 20, PALETTE_SLOTS.concrete, 2, 3, [[18, 0, 12, 6], [18, 14, 12, 6]]),
      [
        ...shellBody(2, 1, 20, 18, 19, 116, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(26, 1, 20, 18, 19, 116, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(3, 2, 18, 16, 135, 114, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(27, 2, 18, 16, 135, 114, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      ],
      [
        ...shellBody(4, 3, 16, 14, 249, 106, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(28, 3, 16, 14, 249, 106, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        box(PART.boom, 4, 7, 40, 6, 355, 18, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.deck, 4, 7, 40, 6, 373, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 7, 6, 7, 7, 374, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 8, 7, 5, 5, 398, 21, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 9, 8, 3, 3, 419, 21, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 34, 6, 7, 7, 374, 20, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 35, 7, 5, 5, 394, 19, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 36, 8, 3, 3, 413, 19, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 6, y: 4, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 3, y: 8, z: 135, label: 'bars' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 28, y: 8, z: 249, label: 'towers' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 24, y: 8, z: 355, label: 'bridge crown' },
    ],
    landings: [
      { stage: 0, x: 18, y: 0, w: 12, h: 6, z: 23 },
      { stage: 0, x: 18, y: 14, w: 12, h: 6, z: 23 },
    ],
  };

  const stackPair: ArcologyRecipe = {
    kind: 'stackPair',
    blocks: [1, 2],
    span: [20, 48],
    // Due corpi orizzontali hanno quote diverse dalla gemella ruotata doubleBar.
    height: 440,
    anchor: [10, 24],
    stages: thresholds(6),
    parts: [
      podium(20, 48, PALETTE_SLOTS.stoneDeep, 2, 3, [[0, 18, 6, 12], [14, 18, 6, 12]]),
      [
        ...shellBody(1, 2, 18, 20, 19, 109, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(1, 26, 18, 20, 19, 109, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      ],
      [
        ...shellBody(2, 3, 16, 18, 128, 114, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(2, 27, 16, 18, 128, 114, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(3, 4, 14, 16, 242, 110, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(3, 28, 14, 16, 242, 110, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        box(PART.boom, 7, 4, 6, 40, 352, 17, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 7, 4, 6, 40, 369, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 6, 18, 7, 7, 370, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 7, 19, 5, 5, 394, 23, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 8, 20, 3, 3, 417, 23, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 6, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 8, y: 3, z: 128, label: 'plates' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 8, y: 28, z: 242, label: 'towers' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 8, y: 24, z: 352, label: 'vertical crown' },
    ],
    landings: [
      { stage: 0, x: 0, y: 18, w: 6, h: 12, z: 23 },
      { stage: 0, x: 14, y: 18, w: 6, h: 12, z: 23 },
    ],
  };

  const quadCluster: ArcologyRecipe = {
    kind: 'quadCluster',
    blocks: [2, 2],
    span: [48, 48],
    // L'anello di base largo quaranta regge 633 quote di corpo rastremato.
    height: 735,
    anchor: [24, 24],
    stages: thresholds(7),
    parts: [
      podium(48, 48, PALETTE_SLOTS.concrete, 3, 3, [[18, 0, 12, 6], [18, 42, 12, 6]]),
      shellBody(4, 4, 40, 40, 19, 127, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      [
        ...shellBody(4, 4, 18, 18, 146, 129, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(26, 4, 18, 18, 146, 129, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(4, 26, 18, 18, 146, 129, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(26, 26, 18, 18, 146, 129, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      ],
      [
        ...shellBody(5, 5, 16, 16, 275, 129, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(27, 5, 16, 16, 275, 129, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(5, 27, 16, 16, 275, 129, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(27, 27, 16, 16, 275, 129, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(6, 6, 14, 14, 404, 128, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(28, 6, 14, 14, 404, 128, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(6, 28, 14, 14, 404, 128, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(28, 28, 14, 14, 404, 128, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(7, 7, 12, 12, 532, 120, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(29, 7, 12, 12, 532, 120, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(7, 29, 12, 12, 532, 120, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(29, 29, 12, 12, 532, 120, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        // I tre tratti salgono a gradino sulla diagonale NO-SE: il primo e' la
        // finestra passante, gli altri due si appoggiano uno sopra l'altro.
        box(PART.boom, 7, 18, 12, 1, 652, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 29, 18, 12, 1, 652, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 7, 19, 34, 4, 652, 15, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.deck, 7, 19, 34, 4, 667, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.boom, 23, 13, 6, 22, 668, 15, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 23, 29, 18, 6, 683, 15, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.deck, 23, 29, 18, 6, 698, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.mast, 8, 17, 7, 7, 668, 23, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 9, 18, 5, 5, 691, 22, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 10, 19, 3, 3, 713, 22, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 33, 29, 5, 5, 699, 14, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 34, 30, 3, 3, 713, 12, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 6, y: 6, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 4, y: 10, z: 146, label: 'ring' },
      { stage: 4, use: BUILDING_CLASS.residential, x: 29, y: 10, z: 404, label: 'spires' },
      { stage: 6, use: BUILDING_CLASS.civic, x: 24, y: 16, z: 652, label: 'diagonal crown' },
    ],
    landings: [
      { stage: 0, x: 18, y: 0, w: 12, h: 6, z: 23 },
      { stage: 0, x: 18, y: 42, w: 12, h: 6, z: 23 },
    ],
  };

  const triSpan: ArcologyRecipe = {
    kind: 'triSpan',
    blocks: [3, 1],
    span: [72, 20],
    // Il lato corto limita il corpo a circa 350 quote: 440 resta sotto il cap 22.
    height: 440,
    anchor: [36, 10],
    stages: thresholds(6),
    parts: [
      podium(72, 20, PALETTE_SLOTS.stoneDeep, 2, 3, [[30, 0, 12, 6], [30, 14, 12, 6]]),
      [
        ...shellBody(2, 1, 20, 18, 19, 111, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(26, 1, 20, 18, 19, 111, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(50, 1, 20, 18, 19, 111, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(3, 2, 18, 16, 130, 114, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(27, 2, 18, 16, 130, 114, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(51, 2, 18, 16, 130, 114, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      ],
      [
        ...shellBody(4, 3, 16, 14, 244, 106, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(28, 3, 16, 14, 244, 106, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(52, 3, 16, 14, 244, 106, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        box(PART.boom, 4, 7, 64, 6, 350, 17, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.deck, 4, 7, 64, 6, 367, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        // Tre guglie, una per barra: prima erano quattro spilli, due dei quali
        // a cinque colonne l'uno dall'altro sul fianco della barra di mezzo.
        box(PART.mast, 8, 5, 7, 7, 368, 26, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 9, 6, 5, 5, 394, 23, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 10, 7, 3, 3, 417, 23, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 32, 5, 7, 7, 368, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 33, 6, 5, 5, 392, 21, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 34, 7, 3, 3, 413, 21, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 56, 5, 7, 7, 368, 22, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 57, 6, 5, 5, 390, 19, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 58, 7, 3, 3, 409, 19, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 6, y: 4, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 3, y: 8, z: 130, label: 'three bars' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 28, y: 8, z: 244, label: 'towers' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 36, y: 8, z: 350, label: 'long crown' },
    ],
    landings: [
      { stage: 0, x: 30, y: 0, w: 12, h: 6, z: 23 },
      { stage: 0, x: 30, y: 14, w: 12, h: 6, z: 23 },
    ],
  };

  return {
    twinStem,
    branchingCore,
    skyWeave,
    spireRing,
    doubleBar,
    stackPair,
    quadCluster,
    triSpan,
  };
}
