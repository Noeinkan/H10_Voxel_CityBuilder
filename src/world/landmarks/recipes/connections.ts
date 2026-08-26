import type { LandmarkRecipe } from '../config';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { SURFACE_KIND } from '../../visualBlock';
import { PART, box } from '../parts';
import { entrance, signBand } from '../vocab';

/**
 * Le nuove ricette del gruppo Connections.
 *
 * Come `growth.ts`, importano da `../config` solo i tipi: le ricette non
 * dipendono dal catalogo a runtime.
 */

/**
 * Una torre radio: traliccio altissimo e sottile su un edificio di servizio
 * basso. L'aria fra i montanti e' cio' che la separa da un monumento pieno, e
 * il faro acceso in cima la tiene visibile di notte.
 */
export const RADIO: LandmarkRecipe = {
  kind: 'radio',
  span: [12, 10],
  height: 30,
  anchor: [6, 5],
  apron: 4,
  stages: [0, 6, 16, 30],
  parts: [
    [
      box(PART.deck, 0, 0, 12, 10, 0, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
      box(PART.shell, 0, 0, 5, 4, 1, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 0, 0, 5, 4, 6, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      entrance(4, 1, 1, 2, 3),
      signBand(4, 0, 1, 4, 4),
    ],
    [
      box(PART.truss, 4, 3, 4, 4, 1, 16, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        step: 3,
        cap: PALETTE_SLOTS.metalBrass,
      }),
    ],
    [
      // Il salto di stadio non e' piu' solo un traliccio allungato: arriva la
      // piattaforma di servizio, e il traliccio cresce per raggiungerla.
      box(PART.truss, 4, 3, 4, 4, 17, 10, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        step: 3,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.deck, 4, 3, 4, 4, 27, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
    ],
    [
      // L'antenna sommitale con il braccio trasversale e il faro: e' il pezzo
      // che trasforma un traliccio in una stazione emittente.
      box(PART.boom, 2, 4, 8, 1, 26, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 5, 4, 2, 2, 27, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 5, 4, 2, 2, 29, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
  ],
  variants: [
    {
      name: 'radar',
      parts: [
        [],
        [],
        [box(PART.slab, 1, 6, 4, 4, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          chamfer: 1,
          cap: PALETTE_SLOTS.concretePale,
        })],
        [box(PART.mast, 2, 7, 2, 2, 4, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
      ],
    },
    {
      name: 'cablaggio',
      parts: [
        [],
        [],
        [box(PART.boom, 0, 4, 4, 2, 7, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [],
      ],
    },
    {
      name: 'faro',
      parts: [
        [],
        [],
        [],
        [
          box(PART.mast, 9, 7, 2, 2, 1, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 9, 7, 2, 2, 9, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
      ],
    },
  ],
};

/**
 * Un faro: torre rastremata per stadi, lanterna accesa in cima e casa del
 * custode ai piedi.
 *
 * La rastremazione ora e' vera: la torre parte larga sei voxel e stringe a
 * quattro e poi a due, con un ballatoio a ogni restringimento. E' la scala a
 * dire «torre costruita», non il colore, ed e' cio' che la separa da una
 * qualunque ciminiera della costa.
 */
export const LIGHTHOUSE: LandmarkRecipe = {
  kind: 'lighthouse',
  span: [12, 12],
  height: 24,
  anchor: [6, 6],
  apron: 4,
  stages: [0, 6, 16, 30],
  parts: [
    [
      box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 0, 0, 5, 4, 1, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 0, 0, 5, 4, 5, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      entrance(4, 1, 1, 2, 3),
      signBand(4, 0, 1, 4, 4),
    ],
    [
      box(PART.mast, 3, 3, 6, 6, 1, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 2, 2, 8, 8, 9, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.mast, 4, 4, 4, 4, 10, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 3, 3, 6, 6, 17, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.mast, 5, 5, 2, 2, 18, 2, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 5, 5, 2, 2, 20, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.steps, 5, 5, 2, 2, 23, 1, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, { step: 1 }),
    ],
  ],
  variants: [
    {
      name: 'garitta',
      parts: [
        [],
        [],
        [box(PART.shell, 5, 0, 3, 3, 1, 3, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        })],
        [],
      ],
    },
    {
      name: 'palo',
      parts: [
        [],
        [],
        [],
        [box(PART.mast, 10, 10, 2, 2, 1, 8, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
      ],
    },
    {
      name: 'molo',
      parts: [
        [],
        [],
        [],
        [box(PART.boom, 5, 10, 4, 2, 1, 2, PALETTE_SLOTS.wood, SURFACE_KIND.habitat, {
          cap: PALETTE_SLOTS.brickLight,
        })],
      ],
    },
  ],
};
