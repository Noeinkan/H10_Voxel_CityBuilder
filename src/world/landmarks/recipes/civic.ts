import type { LandmarkRecipe } from '../config';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { SURFACE_KIND } from '../../visualBlock';
import { PART, box } from '../parts';
import { entrance, signBand } from '../vocab';

/**
 * Le ricette dei ruoli civici: il campus, il monumento, il museo, la cattedrale.
 *
 * Sono le quattro che non hanno una funzione da mostrare — nessuna gru, nessuna
 * pista, nessun silo — quindi **la sagoma e' tutto quello che hanno**, ed e' il
 * gruppo su cui l'ornamento rende di piu'. Le quattro cime sono deliberatamente
 * diverse fra loro: la torre del quadrilatero, l'obelisco, la cupola, la
 * doppia verticale di facciata.
 */

// Un quadrato cavo con una torre su un lato: il cortile e' la forma, e la
// scatola cava e' la sola primitiva che lo produca senza svuotare niente.
export const UNIVERSITY: LandmarkRecipe = {
  kind: 'university',
  span: [12, 12],
  height: 20,
  anchor: [6, 6],
  apron: 4,
  stages: [0, 8, 20, 40],
  parts: [
    [
      // Stadio zero: il basamento e l'identita' minima — il piano e l'anello
      // esterno del quadrilatero: il cortile e' la forma, e la scatola cava
      // la dichiara da subito.
      box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      // Un'ala spessa un voxel sarebbe un recinto, non un edificio: l'anello
      // esterno sta da solo fino a quando l'interno non lo raddoppia.
      box(PART.shell, 0, 0, 12, 12, 1, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.shell, 0, 0, 12, 12, 9, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      // Stadio uno: la massa funzionale — l'anello interno, il cortile verde
      // e il portico che lo cinge: l'unica primitiva che produce aria sotto
      // un pieno, e qui e' l'aria del chiostro.
      box(PART.shell, 1, 1, 10, 10, 1, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.shell, 1, 1, 10, 10, 9, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.deck, 2, 2, 8, 8, 0, 1, PALETTE_SLOTS.grassLight, SURFACE_KIND.plain),
      box(PART.colonnade, 2, 2, 8, 8, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
    ],
    [
      // Stadio due: la torre — la verticale del quadrante, che fa del
      // quadrilatero un campus invece che un cortile chiuso.
      box(PART.mast, 9, 4, 3, 4, 1, 13, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.steps, 9, 4, 3, 4, 14, 2, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
        step: 1,
      }),
    ],
    [
      // Stadio tre: il coronamento — il rettorato sull'angolo, che chiude la
      // silhouette con una cima propria sopra l'anello.
      box(PART.shell, 0, 0, 5, 5, 10, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 0, 0, 5, 5, 15, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.steps, 1, 1, 3, 3, 16, 2, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
        step: 1,
      }),
    ],
  ],
  variants: [
    // Rettorato a cupola: la piramide d'angolo si allarga e si smussa. Il
    // gradone smussato e' la cosa piu' vicina a una cupola che questo
    // vocabolario sappia dire, e a distanza di gioco basta.
    {
      name: 'rettorato',
      parts: [
        [],
        [box(PART.steps, 0, 0, 5, 5, 16, 3, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          step: 1,
          chamfer: 1,
          cap: PALETTE_SLOTS.metalGold,
        })],
        [box(PART.slab, 1, 1, 3, 3, 19, 1, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech)],
        [entrance(0, 5, 1, 2, 4)],
      ],
    },
    // Biblioteca: un'ala a falda sul quadrilatero, insegna e ingresso sul
    // fronte est. Lascia libera la torre, che resta la firma del ruolo.
    {
      name: 'biblioteca',
      parts: [
        [],
        [box(PART.pitch, 0, 0, 9, 12, 10, 4, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [signBand(11, 4, 1, 4, 7)],
        [entrance(11, 5, 1, 2, 4)],
      ],
    },
    // Campanile: un traliccio in pietra sull'angolo libero, con la cella
    // campanaria accesa. E' la verticale che il quadrilatero non ha.
    {
      name: 'campanile',
      parts: [
        [],
        [box(PART.truss, 0, 9, 3, 3, 10, 8, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.slab, 1, 10, 1, 1, 14, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous)],
        [box(PART.slab, 0, 9, 3, 3, 18, 1, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech)],
      ],
    },
  ],
};

/**
 * Il monumento: sei stadi, dal cippo al faro civico.
 *
 * **E' la cosa piu' alta dell'isola, e cresce soprattutto in quota.** Non ha una
 * funzione da raccontare — nessuna gru, nessun portale d'ingresso, nessuna sala
 * — quindi la sagoma e' tutto quello che ha, e la sagoma di un monumento e' una
 * verticale. Il sedime si allarga da dodici a trentadue perche' un fusto da
 * centotrenta quote su un basamento da dodici sarebbe un palo; ma e' il fusto a
 * crescere di cinque volte, non l'impronta.
 *
 * **Il basamento diventa attraversabile, e non e' decorazione.** Dallo stadio
 * tre il monumento porta due propilei allineati sullo stesso asse: si passa
 * sotto invece di girarci attorno. E' la stessa ragione della cattedrale — a
 * trentadue voxel di lato una struttura sta a cavallo di una carreggiata, e il
 * passaggio e' cio' che la distingue da un muro — con in piu' che qui il varco
 * *e'* il monumento: un arco di trionfo si attraversa per definizione.
 *
 * Le cornici stanno sul solo fusto, che ha ventiquattro celle di perimetro; il
 * basamento e il colonnato ne hanno cento, e la misura di `cathedralChunk` dice
 * cosa costerebbe (vedi la nota su `Part.cornice`).
 */
export const MONUMENT: LandmarkRecipe = {
  kind: 'monument',
  span: [32, 32],
  height: 130,
  anchor: [16, 16],
  apron: 5,
  stages: [0, 10, 24, 44, 72, 104],
  growth: [
    { span: [12, 12], height: 14, anchor: [6, 6] },
    { span: [16, 16], height: 34, anchor: [8, 8] },
    { span: [20, 20], height: 56, anchor: [10, 10] },
    { span: [24, 24], height: 82, anchor: [12, 12] },
    { span: [28, 28], height: 106, anchor: [14, 14] },
    { span: [32, 32], height: 130, anchor: [16, 16] },
  ],
  parts: [
    [
      // Stadio zero: il cippo. Un sagrato, tre gradoni e una punta — e' gia'
      // una verticale, ed e' l'unica cosa che a questo stadio serve dire.
      box(PART.deck, 0, 0, 12, 12, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.steps, 3, 3, 6, 6, 1, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 1,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.spire, 4, 4, 5, 5, 4, 9, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    [
      // Stadio uno: la stele. Il fusto prende le cornici marcapiano, che sono
      // cio' che gli da' la scala: senza, un prisma alto venti quote e uno alto
      // quaranta hanno la stessa immagine.
      box(PART.deck, 0, 0, 16, 16, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.steps, 4, 4, 8, 8, 1, 4, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 1,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.mast, 6, 6, 4, 4, 5, 20, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 6, 6, 4, 4, 25, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    [
      // Stadio due: il peristilio. Il colonnato mette aria sotto un pieno
      // attorno al fusto, ed e' il primo stadio in cui il monumento e' un
      // **luogo** e non solo un segno.
      box(PART.deck, 0, 0, 20, 20, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.steps, 3, 3, 14, 14, 1, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 1,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.colonnade, 4, 4, 12, 12, 4, 8, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.mast, 7, 7, 6, 6, 4, 36, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 6, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 7, 7, 6, 6, 40, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 4,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    [
      // Stadio tre: i propilei. Due archi sullo stesso asse aprono un
      // passaggio da parte a parte: da qui il monumento si attraversa, e a
      // trentadue voxel di lato e' questo a renderlo ammissibile in mezzo a un
      // isolato invece che al posto suo.
      box(PART.deck, 0, 0, 24, 24, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.steps, 2, 2, 20, 20, 1, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 1,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.arch, 3, 8, 4, 8, 4, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.arch, 17, 8, 4, 8, 4, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.colonnade, 5, 5, 14, 14, 4, 10, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.mast, 9, 9, 6, 6, 4, 52, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 6, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 9, 9, 6, 6, 56, 24, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 5,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    [
      // Stadio quattro: il ballatoio traforato. E' l'unico pezzo di parete
      // lavorata che stia a settanta quote, e serve a spezzare il fusto: senza,
      // sopra i cinquanta voxel la verticale smette di avere una misura.
      box(PART.deck, 0, 0, 28, 28, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.steps, 2, 2, 24, 24, 1, 4, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 1,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.arch, 3, 10, 5, 8, 5, 14, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.arch, 20, 10, 5, 8, 5, 14, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.colonnade, 6, 6, 16, 16, 5, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.mast, 11, 11, 6, 6, 5, 64, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 6, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.tracery, 10, 10, 8, 8, 69, 10, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.spire, 11, 11, 6, 6, 79, 26, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 5,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    [
      // Stadio cinque: il faro civico. Il tamburo coperto chiude il peristilio,
      // e la guglia arriva a centotrenta quote — cinque volte il monumento di
      // prima, e la cosa piu' alta che il giocatore possa posare.
      box(PART.deck, 0, 0, 32, 32, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.steps, 2, 2, 28, 28, 1, 4, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 1,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.arch, 3, 12, 6, 8, 5, 16, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.arch, 23, 12, 6, 8, 5, 16, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.colonnade, 7, 7, 18, 18, 5, 14, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.dome, 8, 8, 16, 16, 19, 8, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 13, 13, 6, 6, 5, 78, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 6, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.tracery, 12, 12, 8, 8, 83, 12, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.spire, 13, 13, 6, 6, 95, 35, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 6,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  variants: [
    // Obelisco: lo zoccolo si allarga e si smussa fino a diventare un'isola di
    // pietra, e sopra il ballatoio il fusto passa a sezione ottagonale. E'
    // l'esemplare piu' snello, e lo si riconosce dal basamento prima che dalla
    // punta — che e' l'ordine in cui lo si vede avvicinandosi.
    {
      name: 'obelisco',
      parts: [
        [],
        [],
        [
          box(PART.steps, 2, 2, 16, 16, 1, 4, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 1,
            chamfer: 3,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
        ],
        [
          box(PART.steps, 1, 1, 22, 22, 1, 4, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 1,
            chamfer: 4,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
        ],
        [
          box(PART.steps, 1, 1, 26, 26, 1, 5, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 1,
            chamfer: 5,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.slab, 12, 12, 4, 4, 69, 20, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            chamfer: 1,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.steps, 1, 1, 30, 30, 1, 5, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 1,
            chamfer: 6,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.slab, 14, 14, 4, 4, 83, 26, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            chamfer: 1,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
      ],
    },
    // Rotonda: un tamburo ottagonale attorno al fusto, chiuso da una calotta.
    // E' l'esemplare piu' massiccio, e l'unico in cui la verticale nasce da
    // dentro un volume invece che da un basamento piatto.
    {
      name: 'rotonda',
      parts: [
        [],
        [],
        [
          box(PART.shell, 5, 5, 10, 10, 12, 14, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
        ],
        [
          box(PART.shell, 6, 6, 12, 12, 16, 18, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.dome, 6, 6, 12, 12, 34, 7, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.shell, 8, 8, 12, 12, 18, 22, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.dome, 8, 8, 12, 12, 40, 8, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.shell, 10, 10, 12, 12, 20, 26, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.dome, 10, 10, 12, 12, 46, 9, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
      ],
    },
    // Quadriportico: la seconda coppia di archi, sull'asse che il tronco lascia
    // chiuso. E' l'unico esemplare che cambia **come ci si muove** invece di
    // come si vede: il monumento si attraversa in tutte e due le direzioni, e
    // il basamento smette di essere un ostacolo per la maglia stradale.
    {
      name: 'quadriportico',
      parts: [
        [],
        [],
        [
          box(PART.arch, 6, 3, 8, 4, 4, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 2,
          }),
          box(PART.arch, 6, 13, 8, 4, 4, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 2,
          }),
        ],
        [
          box(PART.arch, 8, 3, 8, 4, 4, 14, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 2,
          }),
          box(PART.arch, 8, 17, 8, 4, 4, 14, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 2,
          }),
        ],
        [
          box(PART.arch, 10, 3, 8, 5, 5, 16, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 2,
          }),
          box(PART.arch, 10, 20, 8, 5, 5, 16, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 2,
          }),
        ],
        [
          box(PART.arch, 12, 3, 8, 6, 5, 18, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 2,
          }),
          box(PART.arch, 12, 23, 8, 6, 5, 18, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            step: 2,
          }),
        ],
      ],
    },
  ],
};

// Un museo: basamento, portico a colonne sul fronte e una cupola a gradoni.
// La cupola smussata e' la firma del ruolo, e il lanternino acceso in cima e'
// cio' che lo tiene visibile di notte.
export const MUSEUM: LandmarkRecipe = {
  kind: 'museum',
  span: [14, 12],
  height: 18,
  anchor: [7, 6],
  apron: 4,
  stages: [0, 8, 20, 40],
  parts: [
    [
      // Stadio zero: il basamento e l'identita' minima — il piano e il corpo
      // del museo, che da solo dichiara il fronte lungo.
      box(PART.deck, 0, 0, 14, 12, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 1, 1, 12, 10, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 1, 1, 12, 10, 6, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      // Stadio uno: l'accesso monumentale — il portico a colonne sul fronte,
      // con l'ingresso e l'insegna: qui si entra, e il portico lo dice.
      box(PART.colonnade, 11, 1, 3, 10, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      entrance(12, 5, 1, 2, 4),
      signBand(12, 4, 1, 4, 3),
    ],
    [
      // Stadio due: il coronamento — la cupola a gradoni smussati, la firma
      // del ruolo.
      box(PART.steps, 3, 1, 8, 10, 7, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 1,
        chamfer: 1,
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    [
      // Stadio tre: il segnale notturno — il lanternino acceso in cima alla
      // cupola, che tiene il museo visibile anche al buio.
      box(PART.mast, 6, 5, 2, 2, 11, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
  ],
  variants: [
    // Rotonda: la cupola si allarga e si smussa di piu', fino al tamburo.
    // Cresce in due tempi — prima il tamburo, poi il gradone alto — perche'
    // ogni esemplare si distingue gia' a meta' crescita e chiude con un
    // dettaglio suo.
    {
      name: 'rotonda',
      parts: [
        [],
        [box(PART.steps, 2, 2, 10, 8, 7, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          step: 1,
          chamfer: 2,
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.steps, 2, 2, 10, 8, 10, 2, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          step: 1,
          chamfer: 2,
          cap: PALETTE_SLOTS.metalGold,
        })],
        [],
      ],
    },
    // Biblioteca: un'ala a falda che esce dal fianco del basamento.
    {
      name: 'biblioteca',
      parts: [
        [],
        [],
        [box(PART.pitch, 1, 1, 5, 10, 7, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [],
      ],
    },
    // Facciata: una torre d'angolo che da' al fronte una verticale propria.
    // La base compare con la cupola, il coronamento dorato la chiude.
    {
      name: 'facciata',
      parts: [
        [],
        [],
        [box(PART.mast, 0, 0, 2, 2, 1, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.concreteWhite,
        })],
        [box(PART.mast, 0, 0, 2, 2, 4, 3, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.metalGold,
        })],
      ],
    },
  ],
};

/**
 * La cattedrale: sei stadi, dal sagrato con la cappella alla basilica.
 *
 * **E' la ricetta su cui il revamp si misura**, e per due ragioni. E' il ruolo
 * che non ha niente da mostrare — nessuna gru, nessuna pista, nessun silo —
 * quindi la sagoma e' tutto quello che ha; ed e' quello la cui architettura di
 * riferimento ha inventato le forme che al vocabolario mancavano. Le cinque
 * primitive ornate compaiono qui tutte e cinque: il portale (`arch`), il rosone
 * (`tracery`), i contrafforti rampanti (`buttress`), le guglie (`spire`) e il
 * tiburio sulla crociera (`dome`).
 *
 * **Il sedime cresce, e non poteva non crescere.** L'ingombro finale e'
 * quarantaquattro voxel per ventotto: due isolati e mezzo, contro il passo di
 * venti della maglia stradale. Riservarlo dal piazzamento, come fanno le ricette
 * a sedime fisso, vorrebbe dire sventrare mezzo quartiere per costruirci una
 * cappella — e soprattutto seppellire la sovrapposizione fra due catalizzatori,
 * cioe' il punto dove nascono gli usi misti: e' l'errore che le prime ricette
 * avevano gia' fatto una volta, e che le aveva riportate da sedici voxel a
 * dodici. Cosi' invece lo stadio zero e' piccolo come allora, e la megastruttura
 * arriva quando il quartiere attorno c'e' gia'.
 *
 * **Il portale non e' un ornamento, e' il permesso.** Sopra i ventotto voxel una
 * struttura attraversa una carreggiata: `arch` e' cio' che sotto la facciata
 * lascia un passaggio invece di un muro, ed e' la ragione per cui la ricetta ha
 * potuto crescere fino a qui.
 *
 * **Dove sta l'ornamento e dove no, l'ha deciso la misura.** Le cornici stanno
 * sulle torri e mai sui due scafi lunghi, e i contrafforti sono `plain` e non
 * `civic`: scritti nel modo ovvio — cornici ovunque, contrafforti con il
 * linguaggio civico — il chunk piu' pieno misurava **16 380 quad di dettaglio
 * contro un tetto di 16 384**, cioe' quattro. Le due correzioni lo portano a
 * 5 296, sotto perfino l'isolato fitto di citta' ordinaria. Nessuna delle due
 * toglie qualcosa a schermo: il fianco della navata il proprio ritmo se lo
 * prende dai contrafforti, e un contrafforte e' pietra nuda anche in una
 * cattedrale vera. La sorveglia `cathedralChunk` in
 * `engine/mesher/microGeometry.test.ts`, che ritaglia la sagoma vera invece di
 * riprodurla: quando questa ricetta cresce, la misura cresce con lei.
 *
 * **La pianta non e' quadrata, e non e' un vezzo.** La falda segue l'asse lungo:
 * con un quadrato il colmo non avrebbe un asse da seguire, e le parti piazzate
 * rispetto alla gronda — l'ingresso e il rosone sul fronte — si troverebbero una
 * volta sulla gronda e una volta sul colmo a seconda del verso, facendo cambiare
 * il conto di voxel. L'asse lungo e' cio' che tiene l'intera ricetta invariante
 * per rotazione.
 */
export const CATHEDRAL: LandmarkRecipe = {
  kind: 'cathedral',
  span: [44, 28],
  height: 80,
  anchor: [22, 14],
  apron: 5,
  // Sei soglie, e le ultime due sono deliberatamente alte: la basilica corona un
  // centro pieno, e in periferia la struttura si ferma alla chiesa con le torri.
  // E' lo stesso patto delle arcologie — non e' il tempo a far salire gli stadi,
  // e' il luogo — con la differenza che qui i primi tre arrivano presto, perche'
  // una cattedrale nasce con il quartiere e non dopo.
  stages: [0, 8, 20, 38, 64, 96],
  growth: [
    { span: [14, 10], height: 12, anchor: [7, 5] },
    { span: [20, 14], height: 22, anchor: [10, 7] },
    { span: [26, 18], height: 34, anchor: [13, 9] },
    { span: [32, 22], height: 50, anchor: [16, 11] },
    { span: [38, 26], height: 64, anchor: [19, 13] },
    { span: [44, 28], height: 80, anchor: [22, 14] },
  ],
  parts: [
    [
      // Stadio zero: la cappella. Il sagrato, una navata a falda e la vela
      // campanaria sul colmo — tre parti, e gia' non e' una scatola.
      box(PART.deck, 0, 0, 14, 10, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.pitch, 2, 2, 10, 6, 1, 6, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 1,
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.spire, 5, 3, 5, 4, 4, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.metalGold,
      }),
      entrance(11, 4, 1, 2, 3),
    ],
    [
      // Stadio uno: la chiesa. La navata prende un corpo murario con le cornici
      // marcapiano, e la facciata nasce gia' bucata dal portale: le due torri
      // che la fiancheggiano sono la firma doppia del ruolo, e arrivano subito
      // perche' e' da loro che si riconosce da lontano.
      box(PART.deck, 0, 0, 20, 14, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 3, 4, 13, 6, 1, 8, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.pitch, 3, 4, 13, 6, 9, 5, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.arch, 16, 3, 3, 8, 1, 10, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.mast, 16, 0, 3, 3, 1, 18, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 16, 11, 3, 3, 1, 18, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 6, 4, 5, 5, 14, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 3,
        cap: PALETTE_SLOTS.metalGold,
      }),
      entrance(18, 6, 1, 2, 4),
    ],
    [
      // Stadio due: il transetto e il rosone. La croce latina si legge dall'alto
      // — due navate a falda che si incrociano — e il traforo sopra il portale
      // e' il primo pezzo di parete lavorata della citta'.
      box(PART.deck, 0, 0, 26, 18, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 4, 6, 16, 6, 1, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.pitch, 4, 6, 16, 6, 13, 5, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.shell, 9, 2, 6, 14, 1, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.pitch, 9, 2, 6, 14, 13, 5, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.arch, 20, 5, 4, 8, 1, 14, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.tracery, 20, 6, 4, 6, 15, 6, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.mast, 20, 1, 4, 4, 1, 24, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 20, 13, 4, 4, 1, 24, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 9, 6, 6, 6, 18, 14, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 4,
        cap: PALETTE_SLOTS.metalGold,
      }),
      entrance(23, 7, 1, 4, 5),
    ],
    [
      // Stadio tre: i contrafforti. Sono la ragione per cui una cattedrale sale
      // senza chiudersi, e a schermo sono la prima cosa che spezza il fianco
      // liscio della navata: due piedritti e l'arco che scarica sul muro.
      box(PART.deck, 0, 0, 32, 22, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 4, 8, 20, 6, 1, 16, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.pitch, 4, 8, 20, 6, 17, 6, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.shell, 11, 3, 7, 16, 1, 16, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.pitch, 11, 3, 7, 16, 17, 7, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.buttress, 6, 2, 3, 18, 1, 20, PALETTE_SLOTS.stone, SURFACE_KIND.plain, {
        step: 2,
      }),
      box(PART.buttress, 20, 2, 3, 18, 1, 20, PALETTE_SLOTS.stone, SURFACE_KIND.plain, {
        step: 2,
      }),
      box(PART.arch, 24, 7, 5, 8, 1, 18, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.tracery, 24, 8, 5, 6, 19, 7, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.mast, 24, 2, 5, 5, 1, 32, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 24, 15, 5, 5, 1, 32, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 11, 7, 7, 7, 23, 24, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 5,
        cap: PALETTE_SLOTS.metalGold,
      }),
      entrance(28, 9, 1, 4, 6),
    ],
    [
      // Stadio quattro: le torri prendono la cuspide. Da qui la facciata ha tre
      // punte — due sulle torri e una sulla crociera — ed e' quella terna a
      // renderla riconoscibile da qualunque parte della citta'.
      box(PART.deck, 0, 0, 38, 26, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 4, 10, 24, 6, 1, 20, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.pitch, 4, 10, 24, 6, 21, 6, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.shell, 13, 4, 8, 18, 1, 20, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.pitch, 13, 4, 8, 18, 21, 8, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.buttress, 8, 3, 3, 20, 1, 24, PALETTE_SLOTS.stone, SURFACE_KIND.plain, {
        step: 2,
      }),
      box(PART.buttress, 24, 3, 3, 20, 1, 24, PALETTE_SLOTS.stone, SURFACE_KIND.plain, {
        step: 2,
      }),
      box(PART.arch, 28, 9, 6, 8, 1, 22, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.tracery, 28, 10, 6, 6, 23, 8, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.mast, 28, 3, 6, 6, 1, 40, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 28, 17, 6, 6, 1, 40, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 5, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 28, 3, 6, 6, 41, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 4,
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 28, 17, 6, 6, 41, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 4,
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 13, 9, 8, 8, 27, 34, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 6,
        cap: PALETTE_SLOTS.metalGold,
      }),
      entrance(33, 11, 1, 4, 6),
    ],
    [
      // Stadio cinque: la basilica. Il tiburio sulla crociera e' l'unica cupola
      // a profilo convesso della citta', e la guglia che ci esce sopra porta la
      // struttura a ottanta quote: e' la sola cosa costruita dal giocatore che
      // stia alla pari con una torre di livello massimo.
      box(PART.deck, 0, 0, 44, 28, 0, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility),
      box(PART.shell, 4, 11, 28, 6, 1, 24, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.pitch, 4, 11, 28, 6, 25, 6, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.shell, 14, 4, 10, 20, 1, 24, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concreteWhite,
      }),
      box(PART.pitch, 14, 4, 10, 20, 25, 9, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.buttress, 9, 3, 3, 22, 1, 28, PALETTE_SLOTS.stone, SURFACE_KIND.plain, {
        step: 2,
      }),
      box(PART.buttress, 28, 3, 3, 22, 1, 28, PALETTE_SLOTS.stone, SURFACE_KIND.plain, {
        step: 2,
      }),
      box(PART.arch, 32, 10, 7, 8, 1, 26, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
        step: 2,
      }),
      box(PART.tracery, 32, 11, 7, 6, 27, 9, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.mast, 32, 3, 7, 7, 1, 48, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 6, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.mast, 32, 18, 7, 7, 1, 48, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cornice: { step: 6, depth: 1 },
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 32, 3, 7, 7, 49, 20, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 5,
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 32, 18, 7, 7, 49, 20, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 5,
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.dome, 15, 9, 9, 9, 31, 9, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.spire, 16, 10, 7, 7, 40, 40, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 6,
        cap: PALETTE_SLOTS.metalGold,
      }),
      entrance(38, 12, 1, 4, 7),
    ],
  ],
  // I tre esemplari occupano tre angoli diversi del sagrato e non si toccano
  // mai: e' quello che permette a ciascuno di crescere con la struttura senza
  // dover sapere cosa fanno gli altri due.
  variants: [
    // Campanile: la torre staccata sull'angolo di sud-ovest, con la cella
    // traforata sotto la cuspide. E' l'unico esemplare che aggiunge una quarta
    // verticale, e da lontano e' quello che si conta prima.
    {
      name: 'campanile',
      parts: [
        [],
        [],
        [
          box(PART.mast, 0, 0, 4, 4, 1, 22, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            cornice: { step: 4, depth: 1 },
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.mast, 0, 0, 5, 5, 1, 30, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            cornice: { step: 5, depth: 1 },
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.spire, 0, 0, 5, 5, 31, 10, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 3,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.mast, 0, 0, 5, 5, 1, 36, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            cornice: { step: 5, depth: 1 },
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.tracery, 0, 0, 5, 5, 37, 6, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
            step: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.spire, 0, 0, 5, 5, 43, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 3,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.mast, 0, 0, 6, 6, 1, 44, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            cornice: { step: 6, depth: 1 },
            cap: PALETTE_SLOTS.metalGold,
          }),
          box(PART.tracery, 0, 0, 6, 6, 45, 8, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
            step: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.spire, 0, 0, 6, 6, 53, 20, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            step: 4,
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
      ],
    },
    // Chiostro: il portico basso sull'angolo di nord-ovest, con il prato dentro.
    // E' l'esemplare che cresce **in pianta** invece che in quota, e l'unico che
    // aggiunge vuoto sotto un pieno al posto di un'altra punta.
    {
      name: 'chiostro',
      parts: [
        [],
        [],
        [
          box(PART.colonnade, 0, 12, 7, 6, 1, 5, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
            step: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
        ],
        [
          box(PART.deck, 0, 15, 8, 7, 0, 1, PALETTE_SLOTS.grassLight, SURFACE_KIND.plain),
          box(PART.colonnade, 0, 15, 8, 7, 1, 6, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
            step: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
        ],
        [
          box(PART.deck, 0, 18, 9, 8, 0, 1, PALETTE_SLOTS.grassLight, SURFACE_KIND.plain),
          box(PART.colonnade, 0, 18, 9, 8, 1, 7, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
            step: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
        ],
        [
          box(PART.deck, 0, 20, 10, 8, 0, 1, PALETTE_SLOTS.grassLight, SURFACE_KIND.plain),
          box(PART.colonnade, 0, 20, 10, 8, 1, 8, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
            step: 3,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.spire, 3, 23, 3, 3, 9, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
      ],
    },
    // Abside: il coro semicircolare in fondo alla navata, chiuso da una calotta.
    // Lo smusso e' cio' che lo fa leggere come un'abside e non come un'altra
    // scatola, e la cupola in cima e' la seconda del catalogo — la prima che si
    // vede da terra, perche' sta a dodici quote e non a trenta.
    {
      name: 'abside',
      parts: [
        [],
        [],
        [
          box(PART.slab, 0, 5, 5, 8, 1, 12, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
        ],
        [
          box(PART.slab, 0, 7, 5, 8, 1, 16, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.dome, 0, 7, 5, 8, 17, 5, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.slab, 0, 9, 5, 8, 1, 20, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.dome, 0, 9, 5, 8, 21, 6, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
        [
          box(PART.slab, 0, 10, 5, 8, 1, 24, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.civic, {
            chamfer: 2,
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.tracery, 0, 10, 5, 8, 13, 6, PALETTE_SLOTS.glassDeep, SURFACE_KIND.civic, {
            step: 2,
            cap: PALETTE_SLOTS.glassPale,
          }),
          box(PART.dome, 0, 10, 5, 8, 25, 7, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
            cap: PALETTE_SLOTS.metalGold,
          }),
        ],
      ],
    },
  ],
};
