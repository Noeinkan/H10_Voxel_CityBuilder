import type { LandmarkRecipe } from '../config';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { SURFACE_KIND } from '../../visualBlock';
import { PART, box } from '../parts';
import { tree } from '../vocab';

/**
 * La ricetta del parco.
 *
 * **Sta in un file suo perche' e' l'unico ruolo che si riconosce per assenza di
 * volume**, e la regola che lo governa e' l'opposto di quella di tutti gli
 * altri: qui una parte in piu' toglie leggibilita' invece di aggiungerne. Fra
 * diciannove ricette che salgono, tenerlo accanto a una di loro sarebbe l'invito
 * a farlo salire anche lui.
 */

// L'unico che non costruisce quasi niente: massa verde bassa e chiome, con un
// chiosco al centro. Si riconosce per assenza di volume, che fra otto ruoli e'
// una firma buona quanto una guglia.
export const PARK: LandmarkRecipe = {
  kind: 'park',
  span: [12, 12],
  height: 12,
  anchor: [6, 6],
  apron: 6,
  stages: [0, 6, 14, 28],
  parts: [
    [
      box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.slab, 7, 7, 4, 4, 0, 1, PALETTE_SLOTS.water, SURFACE_KIND.plain),
    ],
    [...tree(0, 0), ...tree(9, 0), ...tree(0, 9)],
    [
      box(PART.colonnade, 3, 1, 5, 5, 1, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.steps, 3, 1, 5, 5, 5, 3, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
        step: 1,
      }),
    ],
    [
      ...tree(4, 9),
      box(PART.slab, 0, 6, 2, 3, 1, 2, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.slab, 10, 6, 2, 3, 1, 2, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
    ],
  ],
  variants: [
    // Belvedere: un padiglione ottagonale nell'angolo libero. Il parco si
    // riconosce per assenza di volume, quindi il suo esemplare non puo'
    // aggiungerne molto: aggiunge una forma.
    {
      name: 'belvedere',
      parts: [
        [],
        [box(PART.colonnade, 8, 1, 4, 4, 1, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          step: 2,
          chamfer: 1,
          cap: PALETTE_SLOTS.stone,
        })],
        [box(PART.steps, 8, 1, 4, 4, 5, 3, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
          step: 1,
          chamfer: 1,
        })],
        [...tree(5, 6)],
      ],
    },
    // Giardino d'acqua: lo stagno si allarga e il chiosco prende una falda.
    {
      name: 'acqua',
      parts: [
        [],
        [box(PART.deck, 5, 6, 6, 6, 0, 1, PALETTE_SLOTS.water, SURFACE_KIND.plain)],
        [box(PART.pitch, 3, 1, 5, 5, 8, 3, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [...tree(9, 4)],
      ],
    },
    // Viale alberato: un asse lastricato, due chiome in piu' e una pergola.
    // E' il parco disegnato invece che lasciato crescere.
    {
      name: 'viale',
      parts: [
        [],
        [box(PART.deck, 0, 5, 12, 2, 0, 1, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.utility)],
        [...tree(2, 9), ...tree(6, 9)],
        [box(PART.truss, 5, 0, 2, 3, 1, 8, PALETTE_SLOTS.wood, SURFACE_KIND.habitat, {
          step: 2,
          cap: PALETTE_SLOTS.grassDark,
        })],
      ],
    },
  ],
};
