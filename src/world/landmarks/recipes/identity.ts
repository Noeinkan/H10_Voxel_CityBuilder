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
 *
 * **Tutte e due crescono di sedime su sei stadi.** Il teatro non lo faceva:
 * riservava sedici voxel dal primo giorno e ci restava. Ora parte da una sala
 * di paese e arriva all'opera con la torre scenica e la cupola, e lo stadio dal
 * campetto al catino da mondiali. Vale per tutte e due la regola misurata sul
 * prototipo: **le cornici stanno sulle torri, mai sugli scafi lunghi**, perche'
 * ogni fascia apre un davanzale su tutto il perimetro e il perimetro e' il
 * moltiplicatore.
 */

/**
 * Un teatro: portico d'ingresso, sala a falda, torre scenica.
 *
 * **Tre altezze diverse composte insieme**, che nessun altro ruolo del gruppo
 * identita' combina cosi': il portico dice dove si entra, la falda la sala, la
 * torre dove sta il palco. Crescendo la sequenza resta quella e si arricchisce
 * da ovest a est — l'arco davanti al portico, il rosone sopra l'arco, la cupola
 * sopra la torre — cosi' la silhouette e' leggibile a ogni stadio invece che
 * solo all'ultimo.
 */
export const THEATRE: LandmarkRecipe = {
  kind: 'theatre',
  span: [34, 22],
  height: 44,
  anchor: [17, 11],
  apron: 4,
  stages: [0, 8, 20, 38, 60, 88],
  growth: [
    { span: [14, 10], height: 14, anchor: [7, 5] },
    { span: [18, 14], height: 22, anchor: [9, 7] },
    { span: [22, 16], height: 28, anchor: [11, 8] },
    { span: [26, 18], height: 34, anchor: [13, 9] },
    { span: [30, 20], height: 39, anchor: [15, 10] },
    { span: [34, 22], height: 44, anchor: [17, 11] },
  ],
  parts: [
    [
      // Stadio zero: la sala di paese. Un corpo a falda e la torretta del palco,
      // che e' gia' la sagoma a due altezze da cui il ruolo si riconosce.
      box(PART.deck, 0, 0, 14, 10, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 2, 2, 7, 6, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 2, 2, 7, 6, 6, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 9, 3, 4, 4, 1, 13, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 4, depth: 1 },
        cap: PALETTE_SLOTS.glassPale,
      }),
      entrance(2, 4, 1, 2, 3),
    ],
    [
      // Stadio uno: il portico. La torre scenica sale oltre il doppio della sala
      // e prende il quadrante acceso in cima — di notte e' l'unica cosa che si
      // veda di un teatro.
      box(PART.deck, 0, 0, 18, 14, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.colonnade, 0, 4, 3, 6, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.shell, 3, 3, 9, 8, 1, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 3, 3, 9, 8, 8, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 12, 4, 5, 6, 1, 20, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.slab, 12, 4, 5, 6, 21, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      entrance(3, 6, 1, 2, 4),
    ],
    [
      // Stadio due: l'arco e il rosone. Il portale davanti al portico e' quello
      // che rende ammissibile l'ingombro dei prossimi stadi — sopra i ventotto
      // voxel il teatro sta a cavallo di una carreggiata — e il traforo sopra
      // l'arco e' il primo pezzo di parete lavorata.
      box(PART.deck, 0, 0, 22, 16, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.colonnade, 0, 4, 3, 8, 1, 6, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.arch, 3, 3, 4, 10, 1, 9, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 1,
      }),
      box(PART.tracery, 3, 4, 4, 8, 10, 4, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.shell, 7, 4, 8, 8, 1, 9, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 7, 4, 8, 8, 10, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 15, 5, 5, 6, 1, 25, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.slab, 15, 5, 5, 6, 26, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      entrance(7, 7, 1, 2, 4),
    ],
    [
      // Stadio tre: la cupola. La torre scenica smette di finire su un piano e
      // prende una calotta — il profilo convesso e' cio' che distingue un teatro
      // d'opera da un magazzino alto.
      box(PART.deck, 0, 0, 26, 18, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.colonnade, 0, 4, 4, 10, 1, 7, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.arch, 4, 3, 4, 12, 1, 11, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.tracery, 4, 4, 4, 10, 12, 5, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.shell, 8, 4, 10, 10, 1, 11, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 8, 4, 10, 10, 12, 5, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 18, 5, 6, 8, 1, 29, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.dome, 19, 6, 4, 6, 30, 4, PALETTE_SLOTS.metalBrass, SURFACE_KIND.roofTech, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      signBand(18, 6, 1, 6, 22),
      entrance(8, 7, 1, 4, 5),
    ],
    [
      // Stadio quattro: l'opera. La sala raddoppia, l'arco diventa un vestibolo
      // e la cupola prende l'oculo.
      box(PART.deck, 0, 0, 30, 20, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.colonnade, 0, 5, 4, 10, 1, 8, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.arch, 4, 4, 5, 12, 1, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.tracery, 4, 5, 5, 10, 13, 5, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.shell, 9, 5, 12, 10, 1, 13, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 9, 5, 12, 10, 14, 6, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 21, 6, 6, 8, 1, 32, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.dome, 22, 7, 4, 6, 33, 6, PALETTE_SLOTS.metalBrass, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalGold,
      }),
      signBand(21, 7, 1, 6, 25),
      entrance(9, 8, 1, 4, 5),
    ],
    [
      // Stadio cinque: il teatro d'opera. Trentaquattro voxel di fronte e
      // quarantaquattro di quota — due isolati di maglia stradale — con il
      // portale che sotto lascia passare invece di chiudere.
      box(PART.deck, 0, 0, 34, 22, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.colonnade, 0, 5, 5, 12, 1, 9, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.arch, 5, 4, 5, 14, 1, 14, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.tracery, 5, 5, 5, 12, 15, 6, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.shell, 10, 6, 14, 10, 1, 15, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.pitch, 10, 6, 14, 10, 16, 7, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.mast, 25, 7, 6, 8, 1, 36, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.dome, 25, 7, 6, 8, 37, 7, PALETTE_SLOTS.metalBrass, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalGold,
      }),
      signBand(25, 8, 1, 6, 28),
      entrance(10, 10, 1, 4, 6),
    ],
  ],
  variants: [
    {
      name: 'torretta',
      parts: [
        [],
        [box(PART.mast, 15, 1, 2, 2, 1, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
        [box(PART.mast, 18, 1, 3, 3, 1, 10, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
        [box(PART.mast, 21, 1, 3, 3, 1, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
        [
          box(PART.mast, 25, 1, 4, 4, 1, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 25, 1, 4, 4, 15, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
        [
          box(PART.mast, 29, 1, 4, 4, 1, 16, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 29, 1, 4, 4, 17, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
      ],
    },
    {
      name: 'pensilina',
      parts: [
        [],
        [box(PART.shell, 3, 1, 9, 2, 1, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.shell, 7, 1, 8, 2, 1, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.shell, 8, 1, 10, 2, 1, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.shell, 9, 2, 12, 2, 1, 5, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.shell, 10, 3, 14, 2, 1, 5, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
      ],
    },
    {
      name: 'cassone',
      parts: [
        [],
        [],
        [box(PART.boom, 7, 12, 8, 2, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.roofWhite,
        })],
        [box(PART.boom, 8, 14, 10, 2, 1, 3, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.roofWhite,
        })],
        [box(PART.boom, 9, 15, 12, 2, 1, 4, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.roofWhite,
        })],
        [box(PART.boom, 10, 16, 14, 2, 1, 4, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.roofWhite,
        })],
      ],
    },
    // Pinnacoli: le guglie sul portico. Sono la primitiva `spire` usata per
    // quello per cui e' nata — una punta continua invece di due gradoni — e
    // arrivano con l'arco, cioe' appena c'e' un portico su cui appoggiarle.
    {
      name: 'pinnacoli',
      parts: [
        [],
        [],
        [box(PART.spire, 0, 3, 3, 3, 7, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.metalGold,
        })],
        [box(PART.spire, 0, 3, 4, 4, 8, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.metalGold,
        })],
        [box(PART.spire, 0, 4, 4, 4, 9, 9, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.metalGold,
        })],
        [box(PART.spire, 0, 4, 5, 5, 10, 10, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.metalGold,
        })],
      ],
    },
    // Loggia: il ballatoio colonnato sul fianco sud. E' l'esemplare che allarga
    // la sagoma invece di alzarla, e in un isolato con due teatri e' quello che
    // si distingue in pianta.
    {
      name: 'loggia',
      parts: [
        [],
        [],
        [box(PART.colonnade, 3, 12, 12, 3, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 4, 14, 14, 3, 1, 6, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 5, 15, 16, 3, 1, 6, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 6, 16, 18, 3, 1, 7, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
      ],
    },
  ],
};

/**
 * Uno stadio: catino ovale cavo, basso e largo.
 *
 * **E' la ricetta piu' larga del catalogo**, e cresce di sedime come nessun
 * altro: lo stadietto di paese e' un campetto cinto da un muretto, il catino da
 * mondiali e' cinquantadue voxel per quaranta — due isolati e mezzo di maglia
 * stradale. Quello che rende ammissibile l'ingombro sono le **porte ad arco**
 * che dal terzo stadio si aprono nei quattro assi: sotto una struttura larga
 * cosi' deve restare un passaggio, altrimenti non e' un monumento ma un muro.
 *
 * L'anello si legge in tre fasce sovrapposte — l'arcata a terra, le gradinate
 * piene, il parapetto traforato — che e' il modo in cui un anfiteatro vero da'
 * scala a un volume basso e larghissimo. Ogni stadio dichiara il proprio sedime
 * in `growth`, e `parts[s]` disegna l'intera sagoma di quello stadio.
 */
export const STADIUM: LandmarkRecipe = {
  kind: 'stadium',
  span: [52, 40],
  height: 32,
  anchor: [26, 20],
  apron: 5,
  // Le ultime due soglie sono alte apposta: un catino da mondiali corona una
  // citta', e in periferia lo stadio si ferma all'anello colonnato.
  stages: [0, 8, 18, 34, 58, 90],
  growth: [
    { span: [12, 10], height: 5, anchor: [6, 5] },
    { span: [18, 14], height: 9, anchor: [9, 7] },
    { span: [26, 20], height: 14, anchor: [13, 10] },
    { span: [34, 26], height: 20, anchor: [17, 13] },
    { span: [44, 32], height: 26, anchor: [22, 16] },
    { span: [52, 40], height: 32, anchor: [26, 20] },
  ],
  parts: [
    // Stadio zero: il campetto del paese, un prato cinto da un muretto.
    [
      box(PART.deck, 0, 0, 12, 10, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.shell, 2, 2, 8, 6, 1, 4, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
    ],
    // Stadio uno: il campo si allarga, il muretto sale e prende l'architrave.
    [
      box(PART.deck, 0, 0, 18, 14, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 6, 5, 6, 4, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.shell, 2, 2, 14, 10, 1, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.colonnade, 2, 2, 14, 10, 6, 3, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    // Stadio due: le tre fasce. L'arcata a terra, le gradinate sopra, il
    // parapetto traforato in cima: da qui in poi l'anello e' un anfiteatro e
    // non un muretto alto.
    [
      box(PART.deck, 0, 0, 26, 20, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 9, 7, 8, 6, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.colonnade, 2, 2, 22, 16, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.shell, 2, 2, 22, 16, 6, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 1,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.tracery, 2, 2, 22, 16, 11, 3, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 3,
        chamfer: 1,
        cap: PALETTE_SLOTS.metalGold,
      }),
      entrance(2, 9, 1, 2, 4),
      signBand(2, 7, 1, 6, 8),
    ],
    // Stadio tre: le porte. L'anello supera i ventotto voxel e sta a cavallo di
    // una carreggiata: i due portali sull'asse lungo sono cio' che sotto lascia
    // un passaggio invece di un muro.
    [
      box(PART.deck, 0, 0, 34, 26, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 12, 9, 10, 8, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.colonnade, 3, 3, 28, 20, 1, 6, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.shell, 3, 3, 28, 20, 7, 8, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.tracery, 3, 3, 28, 20, 15, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.arch, 0, 9, 3, 8, 1, 9, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, { step: 1 }),
      box(PART.arch, 31, 9, 3, 8, 1, 9, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, { step: 1 }),
      box(PART.mast, 0, 0, 3, 3, 1, 16, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 0, 0, 3, 3, 17, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 31, 23, 3, 3, 1, 16, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 31, 23, 3, 3, 17, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      signBand(3, 10, 1, 6, 10),
    ],
    // Stadio quattro: le torri faro. Due pile d'angolo con le fasce marcapiano
    // — sono torri, quindi le cornici ci stanno — e il proiettore acceso in
    // cima, che di notte e' la firma del ruolo.
    [
      box(PART.deck, 0, 0, 44, 32, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 15, 11, 14, 10, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.colonnade, 4, 4, 36, 24, 1, 7, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 4,
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.shell, 4, 4, 36, 24, 8, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.tracery, 4, 4, 36, 24, 18, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 3,
        chamfer: 2,
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.arch, 0, 11, 4, 10, 1, 10, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, { step: 2 }),
      box(PART.arch, 40, 11, 4, 10, 1, 10, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, { step: 2 }),
      box(PART.mast, 0, 0, 4, 4, 1, 22, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 6, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 0, 0, 4, 4, 23, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 40, 28, 4, 4, 1, 22, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 6, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 40, 28, 4, 4, 23, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      entrance(4, 14, 1, 4, 5),
      signBand(4, 12, 1, 8, 12),
    ],
    // Stadio cinque: il catino da mondiali. Quattro porte, una per asse, quattro
    // torri faro agli angoli e il parapetto traforato su tutto il giro.
    [
      box(PART.deck, 0, 0, 52, 40, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 18, 14, 16, 12, 0, 1, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain),
      box(PART.colonnade, 4, 4, 44, 32, 1, 8, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 4,
        chamfer: 3,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.shell, 4, 4, 44, 32, 9, 12, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        chamfer: 3,
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.tracery, 4, 4, 44, 32, 21, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 3,
        chamfer: 3,
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.arch, 0, 14, 4, 12, 1, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, { step: 2 }),
      box(PART.arch, 48, 14, 4, 12, 1, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, { step: 2 }),
      box(PART.arch, 20, 0, 12, 4, 1, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, { step: 2 }),
      box(PART.arch, 20, 36, 12, 4, 1, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, { step: 2 }),
      box(PART.mast, 0, 0, 4, 4, 1, 28, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 7, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 0, 0, 4, 4, 29, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 48, 0, 4, 4, 1, 28, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 7, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 48, 0, 4, 4, 29, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 0, 36, 4, 4, 1, 28, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 7, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 0, 36, 4, 4, 29, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.mast, 48, 36, 4, 4, 1, 28, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 7, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 48, 36, 4, 4, 29, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      entrance(4, 18, 1, 4, 6),
      signBand(4, 16, 1, 8, 14),
    ],
  ],
  variants: [
    {
      name: 'tribuna',
      parts: [
        [],
        [],
        [box(PART.slab, 8, 2, 10, 3, 6, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        })],
        [box(PART.slab, 10, 3, 14, 4, 7, 8, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        })],
        [box(PART.slab, 13, 4, 18, 5, 8, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        })],
        [box(PART.slab, 16, 4, 22, 6, 9, 12, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concretePale,
        })],
      ],
    },
    {
      name: 'fari',
      parts: [
        [],
        [],
        [box(PART.mast, 4, 4, 2, 2, 1, 10, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        })],
        [
          box(PART.mast, 5, 5, 2, 2, 1, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 5, 5, 2, 2, 15, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
        [
          box(PART.mast, 6, 6, 3, 3, 1, 18, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 6, 6, 3, 3, 19, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
        [
          box(PART.mast, 6, 6, 3, 3, 1, 24, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.slab, 6, 6, 3, 3, 25, 4, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
      ],
    },
    {
      name: 'ingresso',
      parts: [
        [],
        [],
        [box(PART.colonnade, 17, 4, 4, 12, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 22, 5, 5, 14, 1, 6, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 28, 6, 6, 18, 1, 7, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.colonnade, 34, 8, 7, 22, 1, 8, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
      ],
    },
    // Velario: la copertura sospesa sopra le gradinate. E' l'esemplare che si
    // legge dall'alto — il catino smette di essere un anello aperto — e non
    // tocca il campo, che resta scoperto come in uno stadio vero.
    {
      name: 'velario',
      parts: [
        [],
        [],
        [box(PART.boom, 2, 8, 22, 4, 12, 2, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.boom, 3, 10, 28, 6, 17, 2, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.boom, 4, 12, 36, 8, 22, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.boom, 4, 15, 44, 10, 27, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
      ],
    },
    // Torre: il pennone con la guglia, dentro l'anello. E' l'unico esemplare che
    // dia allo stadio una verticale vera, e in una citta' con due stadi e' quello
    // che si riconosce da lontano.
    {
      name: 'torre',
      parts: [
        [],
        [],
        [box(PART.mast, 20, 8, 3, 3, 1, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
        [
          box(PART.mast, 25, 10, 4, 4, 1, 15, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.spire, 25, 10, 4, 4, 16, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 2,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.mast, 32, 13, 5, 5, 1, 19, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.spire, 32, 13, 5, 5, 20, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 2,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.mast, 38, 16, 6, 6, 1, 24, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.spire, 38, 16, 6, 6, 25, 7, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 3,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
      ],
    },
  ],
};
