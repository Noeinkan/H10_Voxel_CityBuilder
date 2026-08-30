import { BUILDING_CLASS } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { PART, box, type Part } from '../landmarks/parts';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';
import type { ArcologyRecipe, SunkenArcologyKind } from './config';

/**
 * Le forme che scendono: il catalogo dell'earthscraper.
 *
 * **Sta a parte da `recipes.ts` perche' e' scritto al contrario.** Li' `z = 0`
 * e' il suolo e la ricetta sale; qui `z = 0` e' il **fondo del pozzo** e il
 * piano di campagna sta a `sunken.depth`, cioe' in cima. Le quote locali restano
 * non negative — a spostare tutto e' l'ancora, che il driver posa a
 * `padZ - depth` — ma chi legge una di queste tabelle deve saperlo dalla prima
 * riga, e mescolarle alle altre era il modo sicuro di dimenticarlo.
 *
 * **Ogni ricetta e' due sagome, non una.** `parts` disegna la struttura;
 * `sunken.dig` disegna il **vuoto da aprire**, cioe' l'imbuto scavato nella
 * roccia. Le due non coincidono: la struttura occupa gli anelli lungo la parete
 * dell'imbuto, e cio' che avanza in mezzo e' il pozzo di luce. Uno scavo
 * scritto come un parallelepipedo — la cosa piu' facile da scrivere — avrebbe
 * lasciato la struttura appesa ai fianchi di una scatola vuota, e il rientro
 * progressivo, che e' tutta la forma di una piramide invertita, non si sarebbe
 * visto.
 *
 * **Le profondita' sono misurate.** Vedi `SUNKEN` in `config.ts`: l'isola
 * standard offre ventiquattro quote di scavo quasi ovunque, ventotto in un
 * terzo dei siti e trenta in nessun sito di un seed su tre. Le tre ricette
 * stanno a sedici, ventidue e ventisei apposta — una che entra sempre, una
 * ordinaria, e una che si guadagna.
 */

type ThresholdFactory = (stages: number) => readonly number[];

/**
 * Un anello rettangolare pieno di spessore `thickness`, come shell concentriche.
 *
 * E' `shellBody` di `recipes.ts` con lo spessore portato a parametro invece che
 * fissato a due: li' le due pelli servono a non far scendere sotto il
 * riempimento minimo un corpo alto e sottile, qui lo spessore **e' la forma** —
 * il solaio della terrazza, largo quanto la fascia abitata. Sotto `3` di lato
 * interno la shell degenera e il ciclo si ferma da solo, che e' anche cio' che
 * chiude l'anello piu' profondo in un blocco pieno.
 */
function ring(
  x: number,
  y: number,
  w: number,
  d: number,
  z: number,
  height: number,
  thickness: number,
  palette: number,
  surface: SurfaceKind,
  extra: Parameters<typeof box>[9] = {},
): readonly Part[] {
  const out: Part[] = [];
  for (let inset = 0; inset < thickness; inset++) {
    const innerW = w - inset * 2;
    const innerD = d - inset * 2;
    if (innerW < 3 || innerD < 3) break;
    out.push(box(PART.shell, x + inset, y + inset, innerW, innerD, z, height, palette, surface, extra));
  }
  return out;
}

export function createSunkenRecipes(
  thresholds: ThresholdFactory,
): Record<SunkenArcologyKind, ArcologyRecipe> {
  /**
   * L'Earthscraper: quattro terrazze che rientrano scendendo attorno a un pozzo.
   *
   * Ventidue quote di scavo piu' sei sopra il piano. Il rientro va 12 -> 8 -> 6
   * -> 4 di vuoto libero: la sezione piu' stretta e' ancora sedici colonne, cioe'
   * esattamente il minimo che `SUNKEN.shaft` chiede perche' un vuoto conti come
   * pozzo e non come cavedio.
   *
   * **Le due passerelle stanno fuori dall'asse del pozzo**, a `y = 6` e a
   * `x = 13`, e non e' una scelta di composizione: la sezione profonda occupa
   * `8..11` su tutti e due gli assi, e una passerella in mezzeria l'avrebbe
   * coperta per tre quarti — il pozzo sarebbe rimasto aperto sulla carta e cieco
   * a schermo.
   */
  const invertedPyramid: ArcologyRecipe = {
    kind: 'invertedPyramid',
    blocks: [1, 1],
    span: [20, 20],
    height: 28,
    anchor: [10, 10],
    stages: thresholds(5),
    sunken: {
      depth: 22,
      // L'imbuto: quattro tronchi che rientrano, il piu' largo alla bocca.
      dig: [
        box(PART.slab, 6, 6, 8, 8, 0, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 4, 4, 12, 12, 5, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 2, 2, 16, 16, 10, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 0, 0, 20, 20, 15, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      ],
    },
    parts: [
      [
        // La corona a filo di strada: il corpo, il selciato della piazza e il
        // parapetto che ne dichiara il bordo. E' cio' che si vede per primo, e
        // per un lungo tratto l'unica cosa costruita.
        ...ring(0, 0, 20, 20, 15, 6, 4, PALETTE_SLOTS.concrete, SURFACE_KIND.habitat),
        ...ring(0, 0, 20, 20, 21, 1, 4, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        ...ring(0, 0, 20, 20, 22, 2, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      ],
      ring(2, 2, 16, 16, 10, 5, 4, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      // Da qui in giu' il cielo geometrico non arriva piu' (`SKY_PROBE` e'
      // sedici): le fasce basse sono `luminous`, che emette a ogni ora, e sono
      // l'unica cosa che si legge guardando dentro il pozzo a mezzogiorno.
      ring(4, 4, 12, 12, 5, 5, 3, PALETTE_SLOTS.concreteLight, SURFACE_KIND.luminous),
      ring(6, 6, 8, 8, 1, 4, 2, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      [
        box(PART.slab, 6, 6, 8, 8, 0, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 0, 6, 20, 2, 24, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 13, 0, 2, 20, 26, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.commercial, x: 2, y: 2, z: 21, label: 'plaza' },
      { stage: 1, use: BUILDING_CLASS.residential, x: 17, y: 17, z: 10, label: 'upperTerraces' },
      { stage: 2, use: BUILDING_CLASS.civic, x: 5, y: 14, z: 5, label: 'lowerTerraces' },
      { stage: 3, use: BUILDING_CLASS.industrial, x: 6, y: 12, z: 1, label: 'core' },
    ],
    // **Nessun piazzale, e non e' una casella lasciata aperta.** Un'arcologia
    // alta ha bisogno di un attracco perche' il suo ingresso sta a ottanta
    // quote; qui la piazza *e'* il piano di campagna, e ci si arriva
    // camminando. Dichiararne uno sarebbe un capolinea in quota che nessun
    // percorso avrebbe motivo di cercare.
    landings: [],
  };

  /**
   * La corte bassa: sedici quote, e il fondo e' un giardino.
   *
   * **Esiste per entrare dove la piramide non entra.** Ventidue quote di scavo
   * chiedono una colonna a ventisei, che due terzi dei siti asciutti hanno;
   * sedici ne chiedono venti, che hanno tutti. Senza questa riga un isolato
   * buono sarebbe stato perso per la sola forma sorteggiata, ed e' lo stesso
   * motivo per cui `arcologyForBlock` scorre in avanti invece di rinunciare.
   */
  const sunkenCourt: ArcologyRecipe = {
    kind: 'sunkenCourt',
    blocks: [1, 1],
    span: [20, 20],
    height: 22,
    anchor: [10, 10],
    stages: thresholds(4),
    sunken: {
      depth: 16,
      dig: [
        box(PART.slab, 5, 5, 10, 10, 0, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 3, 3, 14, 14, 5, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 0, 0, 20, 20, 10, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      ],
    },
    parts: [
      [
        ...ring(0, 0, 20, 20, 10, 5, 4, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.habitat),
        ...ring(0, 0, 20, 20, 15, 1, 4, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        ...ring(0, 0, 20, 20, 16, 2, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      ],
      ring(3, 3, 14, 14, 5, 5, 3, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      ring(5, 5, 10, 10, 1, 4, 2, PALETTE_SLOTS.concreteLight, SURFACE_KIND.luminous),
      [
        // Il giardino sul fondo: e' il pezzo che rende la corte una corte, e sta
        // in uno stadio suo perche' e' anche l'ultimo che una citta' modesta
        // riesce a costruire.
        box(PART.slab, 5, 5, 10, 10, 0, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 0, 4, 20, 2, 18, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 15, 0, 2, 20, 20, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.commercial, x: 2, y: 17, z: 15, label: 'plaza' },
      { stage: 1, use: BUILDING_CLASS.residential, x: 4, y: 4, z: 5, label: 'court' },
      { stage: 2, use: BUILDING_CLASS.civic, x: 14, y: 6, z: 1, label: 'garden' },
    ],
    landings: [],
  };

  /**
   * La voragine su due isolati: ventisei quote, e un vuoto che si vede da lontano.
   *
   * **La profondita' persa si riguadagna in pianta**, ed e' qui che la famiglia
   * lo dimostra: quarantotto voxel di fronte contro venti, con la bocca che da
   * sola vale un isolato. Dall'inquadratura d'insieme conta l'area del vuoto,
   * non quanto scende — un pozzo stretto e profondo si legge come un pozzo di
   * ventilazione, uno largo come un pezzo di citta' che manca.
   */
  const craterRing: ArcologyRecipe = {
    kind: 'craterRing',
    blocks: [2, 1],
    span: [48, 20],
    height: 32,
    anchor: [24, 10],
    stages: thresholds(5),
    sunken: {
      depth: 26,
      dig: [
        box(PART.slab, 14, 5, 20, 10, 0, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 8, 3, 32, 14, 7, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 4, 1, 40, 18, 13, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 0, 0, 48, 20, 19, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      ],
    },
    parts: [
      [
        ...ring(0, 0, 48, 20, 19, 6, 4, PALETTE_SLOTS.concrete, SURFACE_KIND.habitat),
        ...ring(0, 0, 48, 20, 25, 1, 4, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        ...ring(0, 0, 48, 20, 26, 2, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      ],
      ring(4, 1, 40, 18, 13, 6, 3, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      ring(8, 3, 32, 14, 7, 6, 3, PALETTE_SLOTS.concreteLight, SURFACE_KIND.luminous),
      ring(14, 5, 20, 10, 1, 6, 2, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      [
        box(PART.slab, 14, 5, 20, 10, 0, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 0, 8, 48, 2, 28, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 10, 0, 2, 20, 30, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 36, 0, 2, 20, 30, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.commercial, x: 2, y: 2, z: 25, label: 'plaza' },
      { stage: 1, use: BUILDING_CLASS.residential, x: 45, y: 17, z: 13, label: 'upperTerraces' },
      { stage: 2, use: BUILDING_CLASS.civic, x: 9, y: 16, z: 7, label: 'lowerTerraces' },
      { stage: 3, use: BUILDING_CLASS.industrial, x: 15, y: 6, z: 1, label: 'core' },
    ],
    landings: [],
  };

  return { invertedPyramid, sunkenCourt, craterRing };
}
