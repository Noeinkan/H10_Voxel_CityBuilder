import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { BUILDING_CLASS } from '../../sim';
import { PART, box, type Part } from '../landmarks/parts';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';
import type { ArcologyRecipe, ProfileArcologyKind } from './config';

type ThresholdFactory = (stages: number) => readonly number[];

/**
 * Il podio ripete la grammatica delle ricette storiche, non la loro sagoma.
 *
 * Tenerlo locale permette alle variazioni di evolvere come catalogo aggiuntivo
 * senza aprire o riscrivere `recipes.ts`, che resta la fonte delle otto forme
 * originarie chieste come riferimento stabile.
 */
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

/** Due pelli cave danno massa alla sagoma senza trasformarla in un blocco pieno. */
function shellBody(
  x: number,
  y: number,
  w: number,
  d: number,
  z: number,
  height: number,
  palette: number,
  surface: SurfaceKind,
): readonly Part[] {
  return [0, 1]
    .filter((inset) => w - inset * 2 >= 3 && d - inset * 2 >= 3)
    .map((inset) => box(
      PART.shell,
      x + inset,
      y + inset,
      w - inset * 2,
      d - inset * 2,
      z,
      height,
      palette,
      surface,
    ));
}

/** Quattro variazioni verticali aggiuntive; nessuna sostituisce la propria matrice. */
export function createArcologyProfileVariants(
  thresholds: ThresholdFactory,
): Record<ProfileArcologyKind, ArcologyRecipe> {
  const terracedTwin: ArcologyRecipe = {
    kind: 'terracedTwin',
    variationOf: 'twinStem',
    blocks: [1, 1],
    span: [20, 20],
    // I due steli condividono la base, poi cambiano quota a ogni ritiro.
    height: 320,
    anchor: [10, 10],
    stages: thresholds(6),
    parts: [
      podium(20, 20, PALETTE_SLOTS.concrete, 2, 3, [[7, 0, 6, 6], [7, 14, 6, 6]]),
      shellBody(2, 2, 16, 16, 19, 58, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      [
        ...shellBody(2, 3, 8, 14, 77, 72, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(11, 4, 7, 12, 77, 46, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      ],
      [
        ...shellBody(3, 4, 6, 12, 149, 62, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(13, 5, 5, 10, 123, 46, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        // Il ponte nasce sulla torre bassa mentre quella alta continua alle sue spalle.
        box(PART.boom, 3, 8, 15, 4, 169, 8, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 3, 8, 15, 4, 177, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.boom, 3, 4, 6, 12, 211, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.deck, 3, 4, 6, 12, 218, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 3, 6, 7, 7, 219, 34, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 4, 7, 5, 5, 253, 34, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 5, 8, 3, 3, 287, 33, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 11, 6, 7, 7, 178, 28, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 12, 7, 5, 5, 206, 27, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 13, 8, 3, 3, 233, 27, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 2, y: 8, z: 77, label: 'terraced stems' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 13, y: 8, z: 123, label: 'split towers' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 9, y: 9, z: 169, label: 'low bridge' },
    ],
    landings: [
      { stage: 0, x: 7, y: 0, w: 6, h: 6, z: 23 },
      { stage: 0, x: 7, y: 14, w: 6, h: 6, z: 23 },
    ],
  };

  const splitCrown: ArcologyRecipe = {
    kind: 'splitCrown',
    variationOf: 'branchingCore',
    blocks: [1, 1],
    span: [20, 20],
    // Quattro rami partono insieme; soltanto la coppia sul fronte prosegue.
    height: 320,
    anchor: [10, 10],
    stages: thresholds(6),
    parts: [
      podium(20, 20, PALETTE_SLOTS.stoneDeep, 3, 4, [[0, 7, 6, 6], [14, 7, 6, 6]]),
      shellBody(2, 2, 16, 16, 19, 64, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      [
        ...shellBody(2, 2, 7, 7, 83, 126, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(11, 2, 7, 7, 83, 126, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(11, 11, 7, 7, 83, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(2, 11, 7, 7, 83, 70, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(3, 3, 5, 6, 209, 48, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(12, 3, 5, 6, 209, 48, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        // Il varco di quattro per quattro resta passante sotto la corona.
        box(PART.boom, 3, 4, 14, 4, 257, 8, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 3, 4, 14, 4, 265, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 2, 2, 7, 7, 266, 18, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 3, 3, 5, 5, 284, 18, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 4, 4, 3, 3, 302, 18, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 11, 2, 7, 7, 266, 14, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 12, 3, 5, 5, 280, 14, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 13, 4, 3, 3, 294, 14, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 4, y: 4, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 2, y: 5, z: 83, label: 'four branches' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 12, y: 5, z: 209, label: 'upper pair' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 9, y: 5, z: 257, label: 'split crown' },
    ],
    landings: [
      { stage: 0, x: 0, y: 7, w: 6, h: 6, z: 23 },
      { stage: 0, x: 14, y: 7, w: 6, h: 6, z: 23 },
    ],
  };

  const steppedBar: ArcologyRecipe = {
    kind: 'steppedBar',
    variationOf: 'doubleBar',
    blocks: [2, 1],
    span: [48, 20],
    // Le due barre non condividono piu' nessuna linea di coronamento.
    height: 440,
    anchor: [24, 10],
    stages: thresholds(6),
    parts: [
      podium(48, 20, PALETTE_SLOTS.concrete, 2, 3, [[18, 0, 12, 6], [18, 14, 12, 6]]),
      [
        ...shellBody(2, 1, 20, 18, 19, 106, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(26, 1, 20, 18, 19, 78, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      ],
      [
        ...shellBody(3, 2, 18, 16, 125, 112, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(27, 2, 18, 16, 97, 112, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(4, 3, 16, 14, 237, 96, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(28, 3, 16, 14, 209, 82, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        box(PART.boom, 4, 6, 40, 8, 291, 18, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 4, 6, 40, 8, 309, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.boom, 4, 3, 16, 14, 333, 16, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.deck, 4, 3, 16, 14, 349, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      ],
      [
        box(PART.mast, 7, 6, 7, 7, 350, 30, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 8, 7, 5, 5, 380, 30, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 9, 8, 3, 3, 410, 30, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 32, 6, 7, 7, 310, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 33, 7, 5, 5, 334, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 34, 8, 3, 3, 358, 24, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 6, y: 4, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 3, y: 8, z: 125, label: 'stepped bars' },
      { stage: 3, use: BUILDING_CLASS.residential, x: 28, y: 8, z: 209, label: 'offset towers' },
      { stage: 4, use: BUILDING_CLASS.civic, x: 24, y: 8, z: 291, label: 'low bridge' },
    ],
    landings: [
      { stage: 0, x: 18, y: 0, w: 12, h: 6, z: 23 },
      { stage: 0, x: 18, y: 14, w: 12, h: 6, z: 23 },
    ],
  };

  const courtCascade: ArcologyRecipe = {
    kind: 'courtCascade',
    variationOf: 'quadCluster',
    blocks: [2, 2],
    span: [48, 48],
    // Quattro torri scalari lasciano leggibile la corte e terminano su tre quote.
    height: 735,
    anchor: [24, 24],
    stages: thresholds(7),
    parts: [
      podium(48, 48, PALETTE_SLOTS.stoneDeep, 3, 3, [[18, 0, 12, 6], [18, 42, 12, 6]]),
      shellBody(4, 4, 40, 40, 19, 119, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      [
        ...shellBody(4, 4, 18, 18, 138, 120, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(26, 4, 18, 18, 138, 105, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(4, 26, 18, 18, 138, 90, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(26, 26, 18, 18, 138, 120, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      ],
      [
        ...shellBody(5, 5, 16, 16, 258, 110, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(27, 5, 16, 16, 243, 108, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(5, 27, 16, 16, 228, 105, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        ...shellBody(27, 27, 16, 16, 258, 110, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(6, 6, 14, 14, 368, 105, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(28, 6, 14, 14, 351, 100, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(6, 28, 14, 14, 333, 95, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(28, 28, 14, 14, 368, 105, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        ...shellBody(7, 7, 12, 12, 473, 110, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
        ...shellBody(29, 7, 12, 12, 451, 120, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(7, 29, 12, 12, 428, 130, PALETTE_SLOTS.concreteLight, SURFACE_KIND.habitat),
        ...shellBody(29, 29, 12, 12, 473, 110, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.habitat),
      ],
      [
        // Un appoggio sottile separa la spalla dal tratto sospeso: cosi' il
        // ponte conserva una finestra passante e poi piega verso la diagonale.
        box(PART.boom, 7, 18, 12, 1, 583, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 7, 19, 34, 4, 583, 16, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 7, 19, 34, 4, 599, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.boom, 37, 19, 4, 22, 600, 16, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
        box(PART.deck, 37, 19, 4, 22, 616, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
        box(PART.mast, 8, 17, 7, 7, 600, 34, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 9, 18, 5, 5, 634, 33, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 10, 19, 3, 3, 667, 33, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
        box(PART.mast, 35, 31, 7, 7, 617, 40, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 36, 32, 5, 5, 657, 39, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.mast, 37, 33, 3, 3, 696, 39, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        }),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.industrial, x: 6, y: 6, z: 0, label: 'podium' },
      { stage: 2, use: BUILDING_CLASS.commercial, x: 4, y: 10, z: 138, label: 'court towers' },
      { stage: 4, use: BUILDING_CLASS.residential, x: 6, y: 30, z: 333, label: 'cascade' },
      { stage: 6, use: BUILDING_CLASS.civic, x: 20, y: 20, z: 583, label: 'L crown' },
    ],
    landings: [
      { stage: 0, x: 18, y: 0, w: 12, h: 6, z: 23 },
      { stage: 0, x: 18, y: 42, w: 12, h: 6, z: 23 },
    ],
  };

  return { terracedTwin, splitCrown, steppedBar, courtCascade };
}
