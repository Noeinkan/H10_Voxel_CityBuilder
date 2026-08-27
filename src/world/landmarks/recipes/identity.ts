import type { LandmarkRecipe } from '../config';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { SURFACE_KIND } from '../../visualBlock';
import { PART, box } from '../parts';
import { entrance, signBand } from '../vocab';

/**
 * Le nuove ricette del gruppo Identity.
 *
 * Come gli altri due file del gruppo, importano da `../config` solo i tipi e da
 * `../vocab` le scorciatoie condivise.
 */

/**
 * Un teatro: torre scenica alta, sala a falda e colonnato d'ingresso. Tre
 * altezze diverse composte insieme, che nessun altro ruolo del gruppo identita'
 * combina cosi': la torre dice dove sta il palco, la falda la sala, il portico
 * dove si entra.
 */
export const THEATRE: LandmarkRecipe = {
  kind: 'theatre',
  span: [16, 10],
  height: 24,
  anchor: [8, 5],
  apron: 4,
  stages: [0, 8, 20, 38],
  parts: [
    [
      box(PART.deck, 0, 0, 16, 10, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.pitch, 3, 1, 9, 8, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 1,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    [
      box(PART.mast, 12, 2, 3, 4, 1, 18, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
    ],
    [
      box(PART.slab, 12, 2, 3, 4, 19, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.steps, 12, 2, 3, 4, 21, 2, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, { step: 1 }),
    ],
    [
      box(PART.colonnade, 0, 1, 3, 8, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      // Il vano buca il timpano della sala, dietro il portico: e' una porta su
      // una parete piena, non un prisma in aria accanto ai pilastri.
      entrance(3, 4, 1, 2, 4),
      signBand(12, 2, 1, 4, 14),
    ],
  ],
  variants: [
    {
      name: 'torretta',
      parts: [
        [],
        [],
        [box(PART.mast, 14, 7, 2, 2, 1, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
        [],
      ],
    },
    {
      name: 'pensilina',
      parts: [
        [],
        [],
        // La pensilina arriva con la corona della torre scenica: e' il suo
        // posto nel racconto — il coronamento si attrezza — e da sola
        // distingue l'esemplare a meta' crescita.
        [box(PART.shell, 3, 0, 8, 2, 1, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [],
      ],
    },
    {
      name: 'cassone',
      parts: [
        [],
        [],
        [box(PART.boom, 3, 9, 6, 1, 1, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.roofWhite,
        })],
        [],
      ],
    },
  ],
};

/**
 * Uno stadio: catino ovale cavo, basso e largo.
 *
 * **Cresce di sedime, ed e' la prima ricetta a farlo.** Lo stadietto di paese e'
 * un campetto cinto da un muretto; a ogni stadio l'anello si allarga e sale, il
 * campo si estende e le torri faro spuntano agli angoli — fino al catino da
 * mondiali, largo il doppio di quello iniziale. Ogni stadio dichiara il proprio
 * sedime in `growth`, e `parts[s]` disegna l'intera sagoma di quello stadio.
 */
export const STADIUM: LandmarkRecipe = {
  kind: 'stadium',
  span: [26, 20],
  height: 14,
  anchor: [13, 10],
  apron: 5,
  stages: [0, 8, 18, 34],
  growth: [
    { span: [12, 10], height: 5, anchor: [6, 5] },
    { span: [16, 12], height: 8, anchor: [8, 6] },
    { span: [20, 16], height: 10, anchor: [10, 8] },
    { span: [26, 20], height: 14, anchor: [13, 10] },
  ],
  parts: [
    // Stadio zero: il campetto del paese, un prato cinto da un muretto.
    [
      box(PART.deck, 0, 0, 12, 10, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.shell, 2, 2, 8, 6, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
    ],
    // Stadio uno: il campo si allarga e il muretto sale.
    [
      box(PART.deck, 0, 0, 16, 12, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 6, 4, 4, 4, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.shell, 2, 2, 12, 8, 1, 4, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
    ],
    // Stadio due: il secondo anello e il colonnato che corona la tribuna.
    [
      box(PART.deck, 0, 0, 20, 16, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 6, 5, 8, 6, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.shell, 2, 2, 16, 12, 1, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.colonnade, 2, 2, 16, 12, 6, 2, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    // Stadio tre: il catino da mondiali, con le quattro torri faro agli angoli.
    [
      box(PART.deck, 0, 0, 26, 20, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 9, 7, 8, 6, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.shell, 2, 2, 22, 16, 1, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.colonnade, 2, 2, 22, 16, 8, 2, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 0, 0, 2, 2, 1, 9, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 0, 0, 2, 2, 10, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 24, 0, 2, 2, 1, 9, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 24, 0, 2, 2, 10, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 0, 18, 2, 2, 1, 9, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 0, 18, 2, 2, 10, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 24, 18, 2, 2, 1, 9, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 24, 18, 2, 2, 10, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      entrance(23, 9, 1, 2, 3),
      signBand(23, 6, 1, 3, 3),
    ],
  ],
  variants: [
    {
      name: 'tribuna',
      parts: [
        [],
        [],
        [box(PART.slab, 8, 5, 4, 6, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        })],
        [box(PART.slab, 11, 7, 4, 6, 1, 4, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        })],
      ],
    },
    {
      name: 'fari',
      parts: [
        [],
        [],
        [box(PART.mast, 0, 7, 2, 2, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        })],
        [
          box(PART.mast, 0, 9, 2, 2, 1, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 0, 9, 2, 2, 8, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
      ],
    },
    {
      name: 'ingresso',
      parts: [
        [],
        [],
        [box(PART.colonnade, 17, 4, 3, 8, 1, 4, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 23, 5, 3, 10, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
      ],
    },
  ],
};
