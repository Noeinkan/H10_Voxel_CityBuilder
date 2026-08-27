import type { LandmarkRecipe } from '../config';
import { BERTH } from '../berths';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { SURFACE_KIND } from '../../visualBlock';
import { PART, box } from '../parts';
import { bollard, entrance, quay, signBand } from '../vocab';

/**
 * La ricetta del gruppo Identity che guarda l'acqua: la marina.
 *
 * Come gli altri file del gruppo, importa da `../config` solo i tipi e da
 * `../vocab` le scorciatoie condivise.
 */

/**
 * Una marina: promenade a terra, due moli a dita sull'acqua e un pontile di
 * testa che chiude il bacino.
 *
 * **La forma in pianta e' il porticciolo, come per il porto e' il porto.** I
 * moli a dita e il pontile di testa si ottengono disegnando tre banchine e
 * nient'altro: gli slip fra loro restano l'acqua che c'era, perche' l'opera di
 * terra si getta solo dove una parte poggia. Cinque posti barca in uno specchio
 * che non esiste nella ricetta — ed e' la differenza fra una marina e un
 * piazzale con un capanno.
 *
 * **E' il primo landmark che dichiara `lakeQuay`.** Il porto e il traghetto
 * sanno stare solo sul mare: le loro banchine sono muri tarati sulla quota
 * assoluta della spiaggia. Questa ricetta pretende acqua a **qualsiasi quota** —
 * il vincolo di sito `'waterfront'` ammette il lago, e `lakeQuay` dice alle
 * opere di terra di misurare il lago contro il proprio pelo. Sul mare il flag
 * non cambia niente: li' lo specchio della colonna e' il livello del mare.
 */
export const MARINA: LandmarkRecipe = {
  kind: 'marina',
  span: [16, 12],
  height: 14,
  anchor: [3, 6],
  apron: 4,
  stages: [0, 6, 16, 32],
  parts: [
    [
      // Stadio zero: la promenade e l'identita' minima — il piano a terra e la
      // bandiera, che da sola dice «marina» prima che esista un molo. La
      // bandiera sta sul lato sud della promenade, fuori dal colmo della falda
      // che arrivera' sul club: un albero sotto il colmo verrebbe coperto dal
      // cap su un verso solo, e la rotazione cambierebbe il conteggio.
      quay(0, 0, 6, 12),
      box(PART.mast, 1, 9, 1, 1, 1, 8, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      bollard(5, 2),
      bollard(5, 9),
    ],
    [
      // Stadio uno: la massa funzionale — i due moli a dita che escono in acqua
      // e il club che li serve. I moli poggiano sul fondo (e sul lago e'
      // `lakeQuay` a rendere quel fondo costruibile), gli slip restano acqua.
      quay(6, 2, 9, 2),
      quay(6, 8, 9, 2),
      box(PART.shell, 1, 4, 4, 4, 1, 4, PALETTE_SLOTS.brickLight, SURFACE_KIND.habitat, {
        cap: PALETTE_SLOTS.wood,
      }),
      box(PART.deck, 1, 4, 4, 4, 5, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
    ],
    [
      // Stadio due: l'attrezzatura — il pontile di testa chiude il bacino e il
      // pontile del carburante sporge dal molo di nord: e' lo stesso piano
      // scritto piu' scuro, la stazione di servizio dello scalo.
      quay(14, 3, 1, 6),
      box(PART.slab, 11, 6, 2, 2, 1, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalBrass,
      }),
      bollard(13, 3),
      bollard(13, 8),
    ],
    [
      // Stadio tre: il coronamento e il segnale — la falda sul club, l'ingresso,
      // l'insegna e il fanale in testa al bacino: di notte e' quello a separare
      // una marina da una lingua di terra. La falda e' piu' lunga che larga: una
      // falda quadrata ha il colmo che non ruota, e il cap finirebbe su un
      // fianco diverso a ogni verso.
      box(PART.pitch, 1, 4, 5, 4, 6, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      entrance(4, 5, 1, 2, 4),
      signBand(4, 4, 1, 4, 5),
      box(PART.mast, 13, 5, 1, 1, 1, 10, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 13, 5, 1, 1, 11, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
  ],
  // La promenade finisce a `x` 5 e i moli escono da 6: e' li' che la ricetta
  // pretende l'acqua, ed e' quello che il piazzamento va a cercare sul terreno
  // vero — sul mare come sul lago.
  waterline: 6,
  // Il permesso che distingue la marina dal porto: i moli possono poggiare su
  // acqua dolce, e le opere la misurano contro il pelo della conca.
  lakeQuay: true,
  // Il bacino scavato davanti alla promenade: due voxel sotto il pelo, quanto
  // il lago naturale dell'isola — un fondale che si vede, non un pozzo. Dove
  // la ricetta non poggia, la riva scende a questa quota e l'acqua la riempie.
  basinDepth: 2,
  // Cinque posti barca: due per lato lungo i moli, uno in testa al bacino.
  // Sono punti d'acqua vera — l'opera non li tocca — e ci stanno yacht, non
  // barche da lavoro: una marina piena di mezzi da pesca leggerebbe come un
  // porto.
  moorings: [
    { x: 7, y: 1, z: 0, berth: BERTH.yacht, heading: 0 },
    { x: 12, y: 1, z: 0, berth: BERTH.yacht, heading: 0 },
    { x: 10, y: 5, z: 0, berth: BERTH.yacht, heading: 0 },
    { x: 7, y: 10, z: 0, berth: BERTH.yacht, heading: 0 },
    { x: 12, y: 10, z: 0, berth: BERTH.yacht, heading: 0 },
  ],
  variants: [
    // Legno: la passeggiata sul lungolago — i pontili in doghe e la pergola
    // sulla promenade. E' l'esemplare che `marina-shallows` fissa sui
    // bassofondi: un lago o una spiaggia protetta chiedono legno, non pietra.
    {
      name: 'legno',
      parts: [
        [],
        [
          box(PART.deck, 6, 2, 9, 2, 1, 1, PALETTE_SLOTS.wood, SURFACE_KIND.utility),
          box(PART.deck, 6, 8, 9, 2, 1, 1, PALETTE_SLOTS.wood, SURFACE_KIND.utility),
        ],
        [
          box(PART.deck, 14, 3, 1, 6, 1, 1, PALETTE_SLOTS.wood, SURFACE_KIND.utility),
          box(PART.colonnade, 0, 0, 6, 12, 1, 5, PALETTE_SLOTS.wood, SURFACE_KIND.habitat, {
            step: 2,
            cap: PALETTE_SLOTS.brickLight,
          }),
        ],
        [],
      ],
    },
    // Pietra: il fronte esposto — il bordo in pietra lungo la promenade e i due
    // frangiflutti in testa ai moli. E' l'esemplare che `marina-open` fissa sul
    // mare aperto, dove il legno non reggerebbe.
    {
      name: 'pietra',
      parts: [
        [],
        [box(PART.slab, 5, 0, 1, 12, 1, 1, PALETTE_SLOTS.stone, SURFACE_KIND.utility)],
        [
          box(PART.mast, 14, 2, 1, 2, 1, 3, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.concreteWhite,
          }),
          box(PART.mast, 14, 8, 1, 2, 1, 3, PALETTE_SLOTS.stone, SURFACE_KIND.civic, {
            cap: PALETTE_SLOTS.concreteWhite,
          }),
        ],
        [],
      ],
    },
    // Vela: l'albero da diporto e la vela tesa sopra il club. E' l'esemplare
    // che si legge di taglio quanto da sopra, e compare solo dove il seme lo
    // sceglie — nessuna forma d'acqua lo fissa. L'albero sta a sud della vela,
    // fuori dal suo colmo, per la stessa ragione della bandiera: un cap che
    // copre un albero su un verso solo cambia il conteggio alla rotazione.
    {
      name: 'vela',
      parts: [
        [],
        [box(PART.mast, 2, 8, 1, 1, 1, 9, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.pitch, 0, 3, 6, 5, 9, 4, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [],
      ],
    },
  ],
};
