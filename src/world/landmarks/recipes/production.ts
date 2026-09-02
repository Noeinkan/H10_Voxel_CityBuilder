import type { LandmarkRecipe } from '../config';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { SURFACE_KIND } from '../../visualBlock';
import { PART, box } from '../parts';
import { entrance, signBand } from '../vocab';

/**
 * Le ricette dei ruoli che producono: merce, scambio, cibo.
 *
 * Le tre si distinguono per **cosa hanno al posto del piazzale** — le ciminiere
 * la fabbrica, la tettoia su pilastri il mercato, il vetro la serra — e nessuna
 * delle tre ha una verticale che competa con lo skyline: sono massa bassa e
 * attrezzatura, che e' il modo in cui un'area produttiva si legge da lontano.
 */

// Ciminiere molto piu' alte del corpo: la fabbrica si riconosce dal fumo che
// non c'e', cioe' dalle verticali sottili sopra un capannone basso e lungo.
export const FACTORY: LandmarkRecipe = {
  kind: 'factory',
  span: [14, 12],
  height: 22,
  anchor: [7, 6],
  apron: 4,
  stages: [0, 8, 20, 40],
  parts: [
    [
      // Stadio zero: il basamento e l'identita' minima — il piazzale e la
      // prima ciminiera, che da sola dice «fabbrica» prima che esista il
      // capannone.
      box(PART.deck, 0, 0, 14, 12, 0, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
      box(PART.mast, 10, 1, 3, 3, 1, 18, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalDark,
      }),
    ],
    [
      // Stadio uno: la massa funzionale — il capannone e la seconda ciminiera.
      box(PART.shell, 0, 0, 9, 8, 1, 8, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalDark,
      }),
      box(PART.deck, 0, 0, 9, 8, 9, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
      box(PART.mast, 10, 5, 3, 3, 1, 14, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalDark,
      }),
    ],
    [
      // Stadio due: l'attrezzatura — i silos e il nastro che li lega al
      // capannone: e' la parte che fa leggere il complesso come un impianto.
      box(PART.mast, 0, 9, 3, 3, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.mast, 4, 9, 3, 3, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.boom, 2, 10, 10, 2, 11, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalBrass,
      }),
    ],
    [
      // Stadio tre: il coronamento e il segnale — il terzo silo, il blocco
      // uffici sopra il capannone e la torcia, l'unica cosa accesa di notte.
      box(PART.mast, 8, 9, 3, 3, 1, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.shell, 2, 2, 5, 4, 10, 3, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalDark,
      }),
      box(PART.deck, 2, 2, 5, 4, 13, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
      box(PART.mast, 13, 6, 1, 2, 1, 20, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  variants: [
    // Acciaieria: castello di estrazione a traliccio e il ponte che porta al
    // capannone. Il traliccio ha aria dentro, ed e' l'aria a dire «impianto»
    // dove un prisma pieno direbbe solo «volume alto».
    {
      name: 'acciaieria',
      parts: [
        [],
        [box(PART.truss, 0, 9, 4, 3, 1, 16, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          step: 3,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.boom, 0, 10, 11, 2, 16, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [entrance(0, 3, 1, 2, 4)],
      ],
    },
    // Raffineria: serbatoi cilindrici e una torcia sottilissima. Lo smusso e'
    // tutta la differenza fra un serbatoio e una cassa.
    {
      name: 'raffineria',
      parts: [
        [],
        [box(PART.slab, 9, 8, 5, 4, 1, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          chamfer: 1,
          cap: PALETTE_SLOTS.metalDark,
        })],
        [box(PART.slab, 0, 9, 4, 3, 1, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          chamfer: 1,
          cap: PALETTE_SLOTS.metalDark,
        })],
        [box(PART.mast, 6, 9, 2, 2, 1, 20, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalGold,
        })],
      ],
    },
    // Manifattura: falda sul capannone, insegna e ingresso. E' la fabbrica che
    // sta dentro la citta' invece che al suo margine.
    {
      name: 'manifattura',
      parts: [
        [],
        [box(PART.pitch, 0, 0, 9, 8, 10, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [signBand(8, 1, 1, 6, 6)],
        [entrance(8, 3, 1, 2, 4)],
      ],
    },
  ],
};

// L'unico landmark con il vuoto sotto un tetto: una tettoia su pilastri, che
// nessuna scatola cava sa dare e che a distanza di gioco lo distingue subito.
export const MARKET: LandmarkRecipe = {
  kind: 'market',
  span: [12, 12],
  height: 18,
  anchor: [6, 6],
  apron: 4,
  stages: [0, 6, 16, 32],
  parts: [
    [
      box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.utility),
      box(PART.colonnade, 1, 1, 10, 10, 1, 6, PALETTE_SLOTS.wood, SURFACE_KIND.habitat, {
        step: 3,
        cap: PALETTE_SLOTS.brickLight,
      }),
      box(PART.deck, 1, 1, 10, 10, 7, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.slab, 2, 2, 2, 2, 1, 3, PALETTE_SLOTS.brick, SURFACE_KIND.plain),
      box(PART.slab, 8, 2, 2, 2, 1, 3, PALETTE_SLOTS.metalBrass, SURFACE_KIND.plain),
      box(PART.slab, 2, 8, 2, 2, 1, 3, PALETTE_SLOTS.brickLight, SURFACE_KIND.plain),
      box(PART.slab, 8, 8, 2, 2, 1, 3, PALETTE_SLOTS.wood, SURFACE_KIND.plain),
    ],
    [
      box(PART.shell, 3, 3, 6, 6, 8, 5, PALETTE_SLOTS.brickLight, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.wood,
      }),
      box(PART.deck, 3, 3, 6, 6, 13, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.mast, 0, 0, 3, 3, 1, 14, PALETTE_SLOTS.brick, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.steps, 0, 0, 3, 3, 15, 2, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
        step: 1,
      }),
    ],
  ],
  variants: [
    // Loggia: un tiburio ottagonale sul tetto, che e' la sagoma che il
    // mercato coperto ha in mezza Europa e che nessuna scatola sa dare.
    {
      name: 'loggia',
      parts: [
        [],
        [box(PART.colonnade, 3, 3, 6, 6, 14, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          step: 2,
          chamfer: 1,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.steps, 4, 4, 4, 4, 17, 1, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
          step: 1,
          chamfer: 1,
        })],
        [entrance(1, 5, 1, 2, 3)],
      ],
    },
    // Mercato coperto: una falda unica su tutta la tettoia. E' l'esemplare
    // piu' basso e piu' largo, e di taglio non somiglia agli altri due.
    {
      name: 'coperto',
      parts: [
        [],
        [box(PART.pitch, 1, 1, 10, 10, 14, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [signBand(8, 4, 1, 4, 10)],
        [entrance(10, 5, 1, 2, 3)],
      ],
    },
    // Torri d'angolo: il mercato fortificato. Tre verticali in laterizio agli
    // spigoli liberi, che la ricetta base lascia vuoti.
    {
      name: 'torri',
      parts: [
        [],
        [box(PART.mast, 9, 0, 3, 3, 1, 12, PALETTE_SLOTS.brick, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
        [box(PART.mast, 0, 9, 3, 3, 1, 12, PALETTE_SLOTS.brick, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
        [box(PART.mast, 9, 9, 3, 3, 1, 12, PALETTE_SLOTS.brick, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
      ],
    },
  ],
};

// Una serra: un capannone di vetro a falda, con le vasche d'acqua e le aiole
// che la nutrono. E' la crescita che si riconosce dal **vetro** — nessun altro
// ruolo del gruppo e' una scatola trasparente — e dal colmo, che la separa da
// un capannone di lamiera. Produce cibo, non merce: al posto della gru c'e'
// l'acqua, e al posto del piazzale le aiole.
export const GREENHOUSE: LandmarkRecipe = {
  kind: 'greenhouse',
  span: [14, 12],
  height: 14,
  anchor: [7, 6],
  apron: 4,
  stages: [0, 6, 16, 32],
  parts: [
    [
      // Stadio zero: il basamento e l'identita' minima — il piano e la
      // scatola di vetro, che da sola dice «serra» prima di qualunque colmo.
      box(PART.deck, 0, 0, 14, 12, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 1, 1, 12, 10, 1, 6, PALETTE_SLOTS.glassPale, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalBrass,
      }),
    ],
    [
      // Stadio uno: la massa funzionale — il colmo a falda e i due serbatoi:
      // la serra finita, con l'acqua che la nutre.
      box(PART.pitch, 1, 1, 12, 10, 7, 4, PALETTE_SLOTS.glassPale, SURFACE_KIND.industrial, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.slab, 0, 0, 3, 3, 1, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.slab, 0, 3, 2, 2, 1, 4, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
    ],
    [
      // Stadio due: il volume secondario — la casa del custode e le aiole
      // all'aperto, la coltura che esce dal vetro.
      box(PART.shell, 11, 0, 3, 2, 1, 4, PALETTE_SLOTS.brick, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.roofPale,
      }),
      box(PART.deck, 11, 0, 3, 2, 5, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      box(PART.slab, 1, 0, 3, 1, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.slab, 6, 0, 3, 1, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.slab, 1, 11, 3, 1, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.slab, 6, 11, 3, 1, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
    ],
    [
      // Stadio tre: l'accesso, l'insegna e il comignolo di servizio — la
      // serra che lavora anche di notte.
      entrance(1, 4, 1, 2, 4),
      signBand(1, 3, 1, 4, 5),
      box(PART.mast, 5, 5, 2, 2, 11, 3, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  variants: [
    // Vivaio: aiole rialzate lungo il retro, dove le piantine stanno fuori.
    {
      name: 'vivaio',
      parts: [
        [],
        [],
        [box(PART.slab, 0, 11, 6, 1, 1, 2, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain)],
        [],
      ],
    },
    // Acquaponica: una vasca alta sul bordo est, il serbatoio di ricircolo.
    // Cresce in due tempi — il fusto col colmo, la testa con la casa del
    // custode — cosi' l'esemplare si legge gia' a meta' crescita.
    {
      name: 'acquaponica',
      parts: [
        [],
        [box(PART.slab, 13, 3, 1, 4, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        })],
        [box(PART.slab, 13, 3, 1, 4, 4, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.concretePale,
        })],
        [],
      ],
    },
    // Ricerca: un condotto acceso che esce dal colmo, la serra che lavora di
    // notte. Sale in due tempi: il tronco con la casa del custode, la testa
    // accesa con il coronamento.
    {
      name: 'ricerca',
      parts: [
        [],
        [],
        [box(PART.mast, 13, 9, 1, 1, 1, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial)],
        [box(PART.mast, 13, 9, 1, 1, 3, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous)],
      ],
    },
  ],
};
