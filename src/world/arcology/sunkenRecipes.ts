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
 *
 * **E percio' la scala di questa famiglia sta tutta in pianta.** Il tetto di
 * profondita' e' della roccia e non della ricetta: ventotto quote sono meno di
 * un decimo della torre piu' bassa del catalogo alto, e nessuna taratura le fa
 * diventare una megastruttura in verticale. Le tre ricette erano nate su un
 * isolato singolo — venti voxel di fronte, come una piramide da giardino accanto
 * a torri da trecentoventi — e a schermo si leggevano per quello che erano in
 * pianta, non per quanto scendevano. Adesso sono tutte **multi-blocco**: la
 * corte e la piramide prendono un quadrato di quattro isolati (48x48, quasi sei
 * volte l'impronta di prima), il cratere ne prende sei in linea (72x48), che e'
 * l'impronta piu' larga dell'intero catalogo — la voragine deve valere piu'
 * isolati della torre che le sta accanto, o non e' una voragine. Il costo lo
 * paga il piazzamento, che ora chiede un cluster asciutto e sgomberabile: e' il
 * prezzo giusto per una struttura che vale un quartiere.
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
   * Ventidue quote di scavo piu' sei sopra il piano, su un quadrato di quattro
   * isolati. Il rientro va 32 -> 24 -> 16 -> 8 di vuoto libero: la sezione piu'
   * stretta e' 8x8, cioe' sessantaquattro colonne, quattro volte il minimo che
   * `SUNKEN.shaft` chiede perche' un vuoto conti come pozzo. **Il margine e'
   * l'obiettivo, non un avanzo**: sul singolo isolato la sezione profonda era
   * esattamente sedici colonne — il minimo — e un pozzo largo quanto il minimo
   * si legge come un cavedio nell'istante in cui lo si guarda da lontano.
   *
   * **Le due passerelle stanno fuori dall'asse del pozzo**, a `y = 12` e a
   * `x = 33`, e non e' una scelta di composizione: la sezione profonda occupa
   * `20..27` su tutti e due gli assi, e una passerella in mezzeria l'avrebbe
   * coperta per tre quarti — il pozzo sarebbe rimasto aperto sulla carta e cieco
   * a schermo.
   */
  const invertedPyramid: ArcologyRecipe = {
    kind: 'invertedPyramid',
    blocks: [2, 2],
    span: [48, 48],
    height: 28,
    anchor: [24, 24],
    stages: thresholds(5),
    sunken: {
      depth: 22,
      // L'imbuto: quattro tronchi che rientrano, il piu' largo alla bocca.
      dig: [
        box(PART.slab, 16, 16, 16, 16, 0, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 11, 11, 26, 26, 5, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 5, 5, 38, 38, 10, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 0, 0, 48, 48, 15, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      ],
    },
    parts: [
      [
        // La corona a filo di strada: il corpo, il selciato della piazza e il
        // parapetto che ne dichiara il bordo. E' cio' che si vede per primo, e
        // per un lungo tratto l'unica cosa costruita.
        ...ring(0, 0, 48, 48, 15, 6, 8, PALETTE_SLOTS.concrete, SURFACE_KIND.habitat),
        ...ring(0, 0, 48, 48, 21, 1, 8, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        ...ring(0, 0, 48, 48, 22, 2, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      ],
      // Lo spessore cresce con l'impronta: e' il solaio della terrazza, e su una
      // bocca da quarantotto voxel una fascia abitata spessa quattro sarebbe un
      // filo di balcone attorno a un buco.
      ring(5, 5, 38, 38, 10, 5, 7, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      // Da qui in giu' il cielo geometrico non arriva piu' (`SKY_PROBE` e'
      // sedici): le fasce basse sono `luminous`, che emette a ogni ora, e sono
      // l'unica cosa che si legge guardando dentro il pozzo a mezzogiorno.
      ring(11, 11, 26, 26, 5, 5, 5, PALETTE_SLOTS.concreteLight, SURFACE_KIND.luminous),
      ring(16, 16, 16, 16, 1, 4, 4, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      [
        box(PART.slab, 16, 16, 16, 16, 0, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 0, 12, 48, 2, 24, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 33, 0, 2, 48, 26, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.commercial, x: 2, y: 2, z: 21, label: 'plaza' },
      { stage: 1, use: BUILDING_CLASS.residential, x: 41, y: 41, z: 10, label: 'upperTerraces' },
      { stage: 2, use: BUILDING_CLASS.civic, x: 13, y: 34, z: 5, label: 'lowerTerraces' },
      { stage: 3, use: BUILDING_CLASS.industrial, x: 17, y: 29, z: 1, label: 'core' },
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
   * **Esiste per entrare dove la piramide non entra**, e la differenza e' tutta
   * nella roccia, non nell'impronta. Ventidue quote di scavo chiedono una
   * colonna a ventisei, che due terzi dei siti asciutti hanno; sedici ne
   * chiedono venti, che hanno tutti. Senza questa riga un isolato buono sarebbe
   * stato perso per la sola forma sorteggiata, ed e' lo stesso motivo per cui
   * `arcologyForBlock` scorre in avanti invece di rinunciare. Il quadrato di
   * quattro isolati ce l'hanno tutte e due: rimpicciolire *questa* per farla
   * entrare piu' spesso avrebbe barattato la scala con una frequenza che la
   * profondita' gia' le regala.
   */
  const sunkenCourt: ArcologyRecipe = {
    kind: 'sunkenCourt',
    blocks: [2, 2],
    span: [48, 48],
    height: 22,
    anchor: [24, 24],
    stages: thresholds(4),
    sunken: {
      depth: 16,
      dig: [
        box(PART.slab, 12, 12, 24, 24, 0, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 7, 7, 34, 34, 5, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 0, 0, 48, 48, 10, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      ],
    },
    parts: [
      [
        ...ring(0, 0, 48, 48, 10, 5, 8, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.habitat),
        ...ring(0, 0, 48, 48, 15, 1, 8, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        ...ring(0, 0, 48, 48, 16, 2, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      ],
      ring(7, 7, 34, 34, 5, 5, 7, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      ring(12, 12, 24, 24, 1, 4, 6, PALETTE_SLOTS.concreteLight, SURFACE_KIND.luminous),
      [
        // Il giardino sul fondo: e' il pezzo che rende la corte una corte, e sta
        // in uno stadio suo perche' e' anche l'ultimo che una citta' modesta
        // riesce a costruire. Ventiquattro voxel di lato: un giardino, non
        // un'aiuola in fondo a un pozzo.
        box(PART.slab, 12, 12, 24, 24, 0, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 0, 10, 48, 2, 18, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 35, 0, 2, 48, 20, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.commercial, x: 2, y: 45, z: 15, label: 'plaza' },
      { stage: 1, use: BUILDING_CLASS.residential, x: 9, y: 9, z: 5, label: 'court' },
      { stage: 2, use: BUILDING_CLASS.civic, x: 33, y: 14, z: 1, label: 'garden' },
    ],
    landings: [],
  };

  /**
   * La voragine su sei isolati: ventisei quote, e un vuoto che si vede da lontano.
   *
   * **La profondita' persa si riguadagna in pianta**, ed e' qui che la famiglia
   * lo dimostra: settantadue voxel per quarantotto, cioe' l'impronta piu' larga
   * di tutto il catalogo — piu' del `quadCluster`, che e' la torre piu' grande
   * che l'isola sappia produrre. Dall'inquadratura d'insieme conta l'area del
   * vuoto, non quanto scende: un pozzo stretto e profondo si legge come un pozzo
   * di ventilazione, uno largo come un pezzo di citta' che manca. A due isolati
   * la bocca ne valeva uno solo, e accanto a una torre da quattrocentoquaranta
   * quote quel «pezzo di citta' che manca» era una buca.
   *
   * **E' anche quella che si guadagna piu' di tutte**, e le due cose sono la
   * stessa: ventisei quote di roccia le ha un terzo dei siti, e un cluster da sei
   * isolati asciutti e sgomberabili meno ancora. Il catalogo scorre in avanti
   * quando non entra, quindi il costo di questa scala e' che il cratere sia raro
   * — non che l'isolato resti senza megastruttura.
   */
  const craterRing: ArcologyRecipe = {
    kind: 'craterRing',
    blocks: [3, 2],
    span: [72, 48],
    height: 32,
    anchor: [36, 24],
    stages: thresholds(5),
    sunken: {
      depth: 26,
      dig: [
        box(PART.slab, 21, 14, 30, 20, 0, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 13, 9, 46, 30, 7, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 6, 4, 60, 40, 13, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 0, 0, 72, 48, 19, 7, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      ],
    },
    parts: [
      [
        ...ring(0, 0, 72, 48, 19, 6, 8, PALETTE_SLOTS.concrete, SURFACE_KIND.habitat),
        ...ring(0, 0, 72, 48, 25, 1, 8, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        ...ring(0, 0, 72, 48, 26, 2, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      ],
      ring(6, 4, 60, 40, 13, 6, 6, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      ring(13, 9, 46, 30, 7, 6, 6, PALETTE_SLOTS.concreteLight, SURFACE_KIND.luminous),
      ring(21, 14, 30, 20, 1, 6, 5, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
      [
        box(PART.slab, 21, 14, 30, 20, 0, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        // Una passerella attraversa la bocca e due la scavalcano di traverso.
        // Misurato con `shaftOf`: delle 1344 colonne del pozzo ne restano 1144
        // aperte fino al cielo, cioe' le tre campate si vedono *sopra* il vuoto
        // invece di chiuderlo.
        box(PART.boom, 0, 20, 72, 2, 28, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 15, 0, 2, 48, 30, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 55, 0, 2, 48, 30, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.commercial, x: 2, y: 2, z: 25, label: 'plaza' },
      { stage: 1, use: BUILDING_CLASS.residential, x: 63, y: 37, z: 13, label: 'upperTerraces' },
      { stage: 2, use: BUILDING_CLASS.civic, x: 15, y: 35, z: 7, label: 'lowerTerraces' },
      { stage: 3, use: BUILDING_CLASS.industrial, x: 23, y: 16, z: 1, label: 'core' },
    ],
    landings: [],
  };

  return { invertedPyramid, sunkenCourt, craterRing };
}
