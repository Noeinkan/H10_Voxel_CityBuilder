import type { LandmarkRecipe } from '../config';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { SURFACE_KIND } from '../../visualBlock';
import { PART, box } from '../parts';
import { entrance, signBand } from '../vocab';

/**
 * Le nuove ricette del gruppo Growth.
 *
 * Importano da `../config` solo i tipi, mai valori: il catalogo a runtime
 * resta in `config.ts`, che qui viene esteso senza che si formi un ciclo.
 */

/**
 * Una centrale: due torri di raffreddamento a tamburo e una ciminiera sottile.
 *
 * Il corpo basso e' il capannone con la falda, e il fumo che non c'e' e' detto
 * dalla verticale magra accanto ai due tamburi. Il tetto a falda e' la prima
 * cosa che separa il capannone da un qualunque magazzino: fino alla 4.x
 * finiva su un piano orizzontale come tutti gli altri.
 */
export const POWER: LandmarkRecipe = {
  kind: 'power',
  span: [16, 12],
  height: 20,
  anchor: [8, 6],
  apron: 4,
  stages: [0, 8, 18, 34],
  parts: [
    [
      box(PART.deck, 0, 0, 16, 12, 0, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
      box(PART.shell, 1, 1, 10, 6, 1, 6, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalDark,
      }),
      box(PART.pitch, 1, 1, 10, 6, 7, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      entrance(10, 3, 1, 2, 4),
      signBand(10, 1, 1, 5, 6),
    ],
    [
      // Il tamburo non e' piu' un prisma smussato ma un corpo rastremato:
      // l'ottagono largo sotto e il collo stretto sopra dicono «torre di
      // raffreddamento» prima di qualunque palette.
      box(PART.slab, 11, 1, 4, 4, 1, 9, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.slab, 12, 2, 2, 2, 10, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalDark,
      }),
    ],
    [
      box(PART.slab, 11, 7, 4, 4, 1, 9, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.slab, 12, 8, 2, 2, 10, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalDark,
      }),
    ],
    [
      // La ciminiera esce dal tetto del capannone e si corona con un faro
      // acceso: di notte e' la sola verticale della centrale che resti visibile.
      box(PART.mast, 5, 3, 2, 2, 1, 17, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 5, 3, 2, 2, 18, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
  ],
  variants: [
    {
      name: 'caldaia',
      parts: [
        [],
        [box(PART.slab, 2, 8, 2, 2, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        })],
        [],
        [],
      ],
    },
    {
      name: 'condotta',
      parts: [
        [],
        [],
        [box(PART.boom, 3, 10, 8, 2, 4, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [],
      ],
    },
    {
      name: 'torcia',
      parts: [
        [],
        [],
        [],
        [
          box(PART.mast, 7, 1, 2, 2, 7, 10, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 7, 1, 2, 2, 17, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
      ],
    },
  ],
};

/**
 * Una scuola: una U vera con il cortile aperto sul retro.
 *
 * Il fronte e' la sbarra che guarda la strada, le due ali escono all'indietro
 * e fra loro resta il cortile, cinto dal portico e aperto verso ovest. Il
 * quadrante acceso sulla torre e' cio' che la distingue dalla cattedrale: e' un
 * orologio, non un campanile.
 */
export const SCHOOL: LandmarkRecipe = {
  kind: 'school',
  span: [14, 12],
  height: 20,
  anchor: [7, 6],
  apron: 4,
  stages: [0, 8, 18, 34],
  parts: [
    [
      box(PART.deck, 0, 0, 14, 12, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 10, 0, 4, 12, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 10, 0, 4, 12, 6, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.shell, 1, 8, 9, 4, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.pitch, 1, 8, 9, 4, 6, 4, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.shell, 1, 0, 9, 4, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.pitch, 1, 0, 9, 4, 6, 4, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      entrance(13, 5, 1, 2, 4),
      signBand(13, 2, 1, 8, 5),
    ],
    [
      // Il cortile e' il vuoto che le due ali lasciano fra loro, e il portico
      // lo cinge di pilastri: l'unica primitiva che produce aria sotto un
      // pieno, e qui e' l'aria del chiostro.
      box(PART.deck, 1, 4, 9, 4, 0, 1, PALETTE_SLOTS.grassLight, SURFACE_KIND.plain),
      box(PART.colonnade, 1, 4, 9, 4, 1, 4, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
    ],
    [
      box(PART.mast, 11, 4, 3, 3, 1, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
    ],
    [
      box(PART.slab, 11, 4, 3, 3, 15, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.steps, 11, 4, 3, 3, 17, 3, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, { step: 1 }),
    ],
  ],
  variants: [
    {
      name: 'palestra',
      parts: [
        [],
        [box(PART.slab, 0, 9, 3, 3, 1, 3, PALETTE_SLOTS.brickLight, SURFACE_KIND.habitat, {
          cap: PALETTE_SLOTS.wood,
        })],
        [],
        [],
      ],
    },
    {
      name: 'biblioteca',
      parts: [
        [],
        [],
        [box(PART.boom, 0, 0, 10, 2, 1, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.roofWhite,
        })],
        [],
      ],
    },
    {
      name: 'torre',
      parts: [
        [],
        [],
        [],
        [box(PART.mast, 0, 0, 2, 2, 1, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
      ],
    },
  ],
};
