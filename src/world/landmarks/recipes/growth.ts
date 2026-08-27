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
      // Stadio zero: il basamento, l'accesso e l'identita' minima — il
      // capannone con la falda, l'ingresso e l'insegna: la centrale si
      // riconosce dal tetto prima che dalle torri.
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
      // Stadio uno: la massa funzionale — la prima torre di raffreddamento. Il
      // tamburo non e' un prisma smussato ma un corpo rastremato: l'ottagono
      // largo sotto e il collo stretto sopra dicono «torre» prima di qualunque
      // palette.
      box(PART.slab, 11, 1, 4, 4, 1, 9, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.slab, 12, 2, 2, 2, 10, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalDark,
      }),
    ],
    [
      // Stadio due: la seconda torre — l'attrezzatura caratteristica, la coppia
      // che fa di un capannone una centrale.
      box(PART.slab, 11, 7, 4, 4, 1, 9, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.slab, 12, 8, 2, 2, 10, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalDark,
      }),
    ],
    [
      // Stadio tre: il coronamento e il segnale — la ciminiera esce dal tetto
      // del capannone e si corona con un faro acceso: di notte e' la sola
      // verticale della centrale che resti visibile.
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
        [],
        // Il parallelepipedo della caldaia compare con la seconda torre: e' il
        // suo posto nel racconto, e da solo distingue l'esemplare gia' a meta'
        // crescita.
        [box(PART.slab, 2, 8, 2, 2, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        })],
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
        // La torcia sale in due tempi — il fusto con le torri, la testa accesa
        // con la ciminiera — cosi' l'esemplare si legge gia' a meta' crescita.
        [box(PART.mast, 7, 1, 2, 2, 7, 5, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalDark,
        })],
        [
          box(PART.mast, 7, 1, 2, 2, 12, 5, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
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
      // Stadio zero: il basamento, l'accesso e l'identita' minima — il fronte
      // con l'ingresso e l'insegna: la sbarra che guarda la strada, prima che
      // la U si chiuda.
      box(PART.deck, 0, 0, 14, 12, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 10, 0, 4, 12, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 10, 0, 4, 12, 6, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      entrance(13, 5, 1, 2, 4),
      signBand(13, 2, 1, 8, 5),
    ],
    [
      // Stadio uno: la massa funzionale — le due ali escono all'indietro con le
      // loro falde: la U vera, con il cortile che gia' si annuncia.
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
    ],
    [
      // Stadio due: il percorso — il cortile e' il vuoto che le due ali
      // lasciano fra loro, e il portico lo cinge di pilastri: l'unica
      // primitiva che produce aria sotto un pieno, e qui e' l'aria del chiostro.
      box(PART.deck, 1, 4, 9, 4, 0, 1, PALETTE_SLOTS.grassLight, SURFACE_KIND.plain),
      box(PART.colonnade, 1, 4, 9, 4, 1, 4, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
    ],
    [
      // Stadio tre: il coronamento e il segnale — la torre dell'orologio, con
      // il quadrante acceso e la cima dorata: un orologio, non un campanile.
      box(PART.mast, 11, 4, 3, 3, 1, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.slab, 11, 4, 3, 3, 15, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.steps, 11, 4, 3, 3, 17, 3, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, { step: 1 }),
    ],
  ],
  variants: [
    {
      name: 'palestra',
      parts: [
        [],
        [],
        // La palestra compare con il cortile, sul fondo del lotto: e' il suo
        // posto, e da sola distingue l'esemplare a meta' crescita.
        [box(PART.slab, 0, 9, 3, 3, 1, 3, PALETTE_SLOTS.brickLight, SURFACE_KIND.habitat, {
          cap: PALETTE_SLOTS.wood,
        })],
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
        // La torre d'angolo sale in due tempi: il fusto con il cortile, la
        // cima dorata con l'orologio — cosi' l'esemplare ha gia' una voce a
        // meta' crescita e un finale suo.
        [box(PART.mast, 0, 0, 2, 2, 1, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        })],
        [box(PART.mast, 0, 0, 2, 2, 7, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
      ],
    },
  ],
};
