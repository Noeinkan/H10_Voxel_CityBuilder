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
        [],
        [box(PART.shell, 3, 0, 8, 2, 1, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
      ],
    },
    {
      name: 'cassone',
      parts: [
        [],
        [],
        [],
        [box(PART.boom, 3, 9, 6, 1, 1, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.roofWhite,
        })],
      ],
    },
  ],
};

/**
 * Uno stadio: catino ovale cavo, basso e largo.
 *
 * La tribuna ora e' una gradinata a due ordini smussati — l'anello esterno
 * basso e quello interno che vi sale sopra — e non piu' una sola scatola cava.
 * Il campo verde resta il vuoto al centro, e le torri faro segnano i quattro
 * angoli della folla anche di notte.
 */
export const STADIUM: LandmarkRecipe = {
  kind: 'stadium',
  span: [20, 16],
  height: 10,
  anchor: [10, 8],
  apron: 5,
  stages: [0, 8, 18, 34],
  parts: [
    [
      box(PART.deck, 0, 0, 20, 16, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.shell, 2, 2, 16, 12, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
    ],
    [
      box(PART.deck, 6, 5, 8, 6, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.shell, 4, 4, 12, 8, 4, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
    ],
    [
      box(PART.colonnade, 2, 2, 16, 12, 7, 2, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    [
      box(PART.mast, 0, 0, 2, 2, 1, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 0, 0, 2, 2, 8, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 17, 0, 2, 2, 1, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 17, 0, 2, 2, 8, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      entrance(17, 7, 1, 2, 3),
      signBand(17, 4, 1, 3, 3),
    ],
  ],
  variants: [
    {
      name: 'tribuna',
      parts: [
        [],
        [],
        [box(PART.slab, 8, 5, 6, 6, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        })],
        [],
      ],
    },
    {
      name: 'torri faro',
      parts: [
        [],
        [],
        [],
        [
          box(PART.mast, 0, 14, 2, 2, 1, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 0, 14, 2, 2, 8, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
          box(PART.mast, 17, 14, 2, 2, 1, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 17, 14, 2, 2, 8, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
      ],
    },
    {
      name: 'ingresso',
      parts: [
        [],
        [box(PART.colonnade, 8, 2, 4, 2, 1, 4, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [],
        [],
      ],
    },
  ],
};
