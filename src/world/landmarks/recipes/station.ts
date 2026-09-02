import type { LandmarkRecipe } from '../config';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { SURFACE_KIND } from '../../visualBlock';
import { PART, box } from '../parts';
import { entrance, signBand } from '../vocab';

/**
 * La stazione, in un file suo.
 *
 * Stava con le altre tre forme lineari in `logistics.ts` — molo, traghetto,
 * pista — e ne condivide la proporzione, ma non il mestiere: e' l'unica che
 * **sospende** invece di appoggiare, l'unica con una campata fra due appoggi, e
 * da quando cresce di sedime su sei stadi e' anche la piu' lunga del catalogo.
 * Tenerla di la' avrebbe portato quel file oltre le mille righe proprio mentre
 * gli altri tre ruoli aspettano lo stesso trattamento.
 */

/**
 * Una linea sospesa con il vuoto sotto, e la grand hall che le sta accanto.
 *
 * **Le pile sono archi, e non e' ornamento.** Un viadotto lungo cinquantadue
 * voxel attraversa due carreggiate della maglia stradale: se le pile fossero
 * prismi pieni la linea sarebbe un muro che taglia il quartiere in due. Il
 * portale passante e' cio' che sotto lascia il passaggio — e' anche come si
 * costruivano i viadotti veri prima del cemento armato — quindi qui `arch` e' la
 * primitiva che rende ammissibile l'ingombro, non quella che lo decora.
 *
 * **Cresce di sedime.** Si parte da una fermata con due piloni e un chiosco e si
 * arriva al capolinea: la hall a falda con il rosone traforato sul timpano, il
 * viadotto su tre pile ad arco, la torre dell'orologio con la guglia. La
 * piattaforma si allunga a ogni stadio e le pile ne seguono i capi; ogni stadio
 * dichiara il proprio sedime in `growth`, e `parts[s]` disegna l'intera sagoma
 * di quello stadio.
 *
 * **La hall e la linea non si contendono lo spazio**: il corpo alto sta a nord
 * della campata e le pile corrono a sud, cosi' l'impalcato passa sopra il
 * piazzale e non sopra il tetto.
 */
export const TRANSPORT: LandmarkRecipe = {
  kind: 'transport',
  span: [52, 24],
  height: 46,
  anchor: [26, 12],
  apron: 4,
  // Le prime tre soglie sono le stesse di prima: una fermata nasce presto,
  // perche' senza non c'e' quartiere. Le ultime due sono da capolinea.
  stages: [0, 8, 18, 36, 62, 94],
  growth: [
    { span: [16, 8], height: 8, anchor: [8, 4] },
    { span: [24, 12], height: 16, anchor: [12, 6] },
    { span: [32, 16], height: 24, anchor: [16, 8] },
    { span: [40, 18], height: 32, anchor: [20, 9] },
    { span: [46, 20], height: 38, anchor: [23, 10] },
    { span: [52, 24], height: 46, anchor: [26, 12] },
  ],
  parts: [
    [
      // Stadio zero: la fermata — il piazzale, due piloni e il chiosco.
      box(PART.deck, 4, 0, 8, 8, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      box(PART.mast, 1, 2, 2, 4, 1, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.mast, 13, 2, 2, 4, 1, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.shell, 5, 2, 6, 4, 1, 4, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 5, 2, 6, 4, 5, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
    ],
    [
      // Stadio uno: la stazione — le pile diventano archi, l'impalcato le unisce
      // e la linea aerea corre sopra.
      box(PART.deck, 6, 0, 12, 12, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      box(PART.arch, 0, 3, 4, 6, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.arch, 20, 3, 4, 6, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.boom, 0, 3, 24, 6, 11, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.asphaltDark,
      }),
      box(PART.shell, 7, 3, 10, 6, 1, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 7, 3, 10, 6, 8, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 2, 5, 1, 1, 13, 3, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.mast, 21, 5, 1, 1, 13, 3, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      entrance(7, 5, 1, 2, 4),
    ],
    [
      // Stadio due: la linea e l'orologio. Le rotaie percorrono l'impalcato e la
      // torre nasce con le fasce marcapiano — e' una torre, quindi le cornici ci
      // stanno.
      box(PART.deck, 8, 0, 16, 16, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      box(PART.arch, 0, 5, 5, 6, 1, 13, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.arch, 27, 5, 5, 6, 1, 13, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.boom, 0, 5, 32, 6, 14, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.asphaltDark,
      }),
      box(PART.boom, 0, 5, 32, 1, 16, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.boom, 0, 10, 32, 1, 16, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.shell, 9, 4, 14, 8, 1, 9, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 9, 4, 14, 8, 10, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 24, 1, 4, 4, 1, 20, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 24, 1, 4, 4, 21, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      entrance(9, 7, 1, 2, 5),
      signBand(9, 4, 1, 8, 8),
    ],
    [
      // Stadio tre: la campata doppia. Una pila in mezzo divide il viadotto in
      // due luci, che e' il punto in cui una linea smette di essere un ponticello.
      box(PART.deck, 10, 0, 20, 18, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      box(PART.arch, 0, 6, 6, 6, 1, 16, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.arch, 17, 6, 6, 6, 1, 16, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.arch, 34, 6, 6, 6, 1, 16, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.boom, 0, 6, 40, 6, 17, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.asphaltDark,
      }),
      box(PART.boom, 0, 6, 40, 1, 19, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.boom, 0, 11, 40, 1, 19, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.shell, 6, 2, 10, 12, 1, 11, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 6, 2, 10, 12, 12, 5, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 30, 1, 5, 5, 1, 26, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 30, 1, 5, 5, 27, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 3, 8, 1, 1, 20, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.mast, 20, 8, 1, 1, 20, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.mast, 36, 8, 1, 1, 20, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      entrance(6, 6, 1, 4, 5),
      signBand(6, 3, 1, 10, 9),
    ],
    [
      // Stadio quattro: il rosone. Il timpano della hall si apre in un traforo, e
      // la torre prende la calotta: da qui la stazione legge come un edificio
      // civico e non come un capannone accanto a un ponte.
      box(PART.deck, 12, 0, 22, 20, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      box(PART.arch, 0, 7, 6, 6, 1, 19, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.arch, 20, 7, 6, 6, 1, 19, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.arch, 40, 7, 6, 6, 1, 19, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.boom, 0, 7, 46, 6, 20, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.asphaltDark,
      }),
      box(PART.boom, 0, 7, 46, 1, 22, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.boom, 0, 12, 46, 1, 22, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.shell, 7, 2, 12, 14, 1, 13, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 7, 2, 12, 14, 14, 6, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.tracery, 7, 4, 1, 10, 6, 6, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.mast, 34, 2, 6, 6, 1, 31, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.dome, 35, 3, 4, 4, 32, 4, PALETTE_SLOTS.metalBrass, SURFACE_KIND.roofTech, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 3, 9, 1, 1, 23, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.mast, 23, 9, 1, 1, 23, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.mast, 43, 9, 1, 1, 23, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      entrance(7, 7, 1, 4, 6),
      signBand(7, 3, 1, 12, 10),
    ],
    [
      // Stadio cinque: il capolinea. Cinquantadue voxel di linea su tre pile ad
      // arco, il portico sul piazzale e la guglia sopra il quadrante — che a
      // quarantasei voxel di quota e' la cosa piu' alta del quartiere.
      box(PART.deck, 14, 0, 24, 24, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      box(PART.arch, 0, 9, 6, 6, 1, 22, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.arch, 23, 9, 6, 6, 1, 22, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.arch, 46, 9, 6, 6, 1, 22, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        step: 1,
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.boom, 0, 9, 52, 6, 23, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.asphaltDark,
      }),
      box(PART.boom, 0, 9, 52, 1, 25, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.boom, 0, 14, 52, 1, 25, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.shell, 8, 2, 14, 16, 1, 15, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 8, 2, 14, 16, 16, 7, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.tracery, 8, 4, 1, 12, 7, 8, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.colonnade, 8, 18, 14, 4, 1, 7, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.mast, 38, 2, 6, 6, 1, 37, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 38, 2, 6, 6, 38, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.spire, 39, 3, 4, 4, 40, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 3, 11, 1, 1, 26, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.mast, 26, 11, 1, 1, 26, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      box(PART.mast, 49, 11, 1, 1, 26, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
      entrance(8, 8, 1, 4, 6),
      signBand(8, 3, 1, 14, 11),
    ],
  ],
  variants: [
    // Volta: la tettoia a botte sul piazzale, davanti alla hall. E' il
    // capolinea che accoglie invece di smistare.
    {
      name: 'volta',
      parts: [
        [],
        [],
        [box(PART.pitch, 24, 10, 8, 6, 1, 5, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.pitch, 28, 12, 10, 6, 1, 6, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.pitch, 30, 14, 12, 6, 1, 6, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.pitch, 32, 16, 14, 8, 1, 7, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
      ],
    },
    // Elettrificato: i portali a traliccio sopra la linea aerea. Aggiunge
    // struttura *sopra* l'impalcato invece che accanto.
    {
      name: 'elettrificato',
      parts: [
        [],
        [],
        [box(PART.truss, 0, 5, 2, 6, 17, 4, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          step: 2,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [
          box(PART.truss, 0, 6, 2, 6, 20, 5, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          }),
          box(PART.truss, 38, 6, 2, 6, 20, 5, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          }),
        ],
        [
          box(PART.truss, 0, 7, 2, 6, 23, 6, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          }),
          box(PART.truss, 22, 7, 2, 6, 23, 6, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          }),
          box(PART.truss, 44, 7, 2, 6, 23, 6, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          }),
        ],
        [
          box(PART.truss, 0, 9, 2, 6, 26, 7, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          }),
          box(PART.truss, 25, 9, 2, 6, 26, 7, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          }),
          box(PART.truss, 50, 9, 2, 6, 26, 7, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
            step: 2,
            cap: PALETTE_SLOTS.metalBrass,
          }),
        ],
      ],
    },
    // Campanile: una seconda torre al capo opposto dell'orologio, cosi' la
    // linea e' inquadrata da due verticali invece che appesa a una.
    {
      name: 'campanile',
      parts: [
        [],
        [],
        [box(PART.mast, 0, 1, 3, 3, 1, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
        [
          box(PART.mast, 0, 1, 4, 4, 1, 18, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.spire, 0, 1, 4, 4, 19, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 2,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.mast, 0, 1, 5, 5, 1, 22, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.spire, 0, 1, 5, 5, 23, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 3,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.mast, 0, 1, 6, 6, 1, 26, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.spire, 0, 1, 6, 6, 27, 9, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 3,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
      ],
    },
    // Pensiline: i marciapiedi coperti sul piazzale. E' l'esemplare che si
    // riconosce in pianta invece che in silhouette.
    {
      name: 'pensiline',
      parts: [
        [],
        [],
        [box(PART.colonnade, 12, 0, 8, 4, 1, 4, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 18, 0, 10, 4, 1, 4, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 22, 0, 10, 4, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 24, 0, 12, 4, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
      ],
    },
    // Arcate: un'ala di magazzini ad arco addossata al piazzale, come i
    // sottopassi di una stazione di testa.
    {
      name: 'arcate',
      parts: [
        [],
        [],
        [box(PART.arch, 12, 12, 10, 4, 1, 8, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          step: 2,
        })],
        [box(PART.arch, 20, 14, 12, 4, 1, 9, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          step: 2,
        })],
        [box(PART.arch, 24, 16, 14, 4, 1, 9, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          step: 2,
        })],
        [box(PART.arch, 26, 20, 16, 4, 1, 10, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          step: 2,
        })],
      ],
    },
  ],
};
