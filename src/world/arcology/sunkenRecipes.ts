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
 * **Le tre ricette erano tarate su un'isola che il gioco non genera.** Il
 * catalogo precedente stava a 20x20 di sedime e sedici-ventisei quote di scavo
 * perche' quei numeri erano stati misurati su una region da **256**, che e' la
 * fixture dei test; `TERRAIN_SIZE` in `main.ts` vale **512**, e il rilievo non e'
 * indipendente dal lato — `maxReliefSlope` lo limita a `0,3 * raggio`, quindi su
 * 512 e' il **doppio**. Rimisurato con `surveySunkenSite` su tre seed dell'isola
 * vera: il picco sta a 52-60 quote invece che a 32-36, e le finestre con il
 * contorno asciutto sono ~800 a 48x48, ~610 a 64x64, ~270 a 96x96 e ~50-95 a
 * 128x128 (a 160 sono zero su tutti e tre). La profondita' mediana di quelle
 * finestre e' 40-56 quote, non 20.
 *
 * Le tre ricette stanno percio' a **64x64 x 32**, **96x96 x 40** e **128x64 x
 * 46**: una che entra quasi ovunque, una ordinaria, una che si guadagna. E' da
 * tre a nove volte il sedime di prima e il doppio dello scavo, e resta tutto
 * dentro il misurato — chi vuole andare oltre non deve alzare questi numeri, deve
 * guardare `SUNKEN.maxDepth` e la riga di `TERRAIN` che decide il rilievo.
 *
 * **Le fixture da 256 restano legittime, ma non sono l'isola.** Un numero
 * misurato li' e portato qui torna falso senza che nessuno se ne accorga: e' il
 * modo in cui questa famiglia e' nata piccola. `sunkenSites.test.ts` misura ora
 * la region vera, ed e' l'allarme che tiene il catalogo agganciato al terreno.
 */

type ThresholdFactory = (stages: number) => readonly number[];

/**
 * Un anello rettangolare pieno di spessore `thickness`, come shell concentriche.
 *
 * E' `shellBody` di `recipes.ts` con lo spessore portato a parametro invece che
 * fissato a due: li' le due pelli servono a non far scendere sotto il
 * riempimento minimo un corpo alto e sottile, qui lo spessore **e' la forma** —
 * il solaio della terrazza, largo quanto la fascia abitata, e cresce con
 * l'impronta: su una bocca da novantasei voxel una fascia abitata spessa quattro
 * sarebbe un filo di balcone attorno a un buco. Sotto `3` di lato interno la
 * shell degenera e il ciclo si ferma da solo, che e' anche cio' che chiude
 * l'anello piu' profondo in un blocco pieno.
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
   * Quaranta quote di scavo piu' sei sopra il piano, su un quadrato di sedici
   * isolati. Il rientro va 72 -> 52 -> 34 -> 15 di vuoto libero: la sezione piu'
   * stretta e' 15x15, cioe' duecentoventicinque colonne, quattordici volte il
   * minimo che `SUNKEN.shaft` chiede perche' un vuoto conti come pozzo. **Il
   * margine e' l'obiettivo, non un avanzo**: sul singolo isolato la sezione
   * profonda era esattamente sedici colonne — il minimo — e un pozzo largo quanto
   * il minimo si legge come un cavedio nell'istante in cui lo si guarda da
   * lontano.
   *
   * **Il giardino sul fondo sale allo stadio tre, e non e' composizione.** Uno
   * stadio si accoda come **delta**, e `dirtyChunkCount` conta i piani di chunk
   * che quel delta attraversa: con la lastra del fondo insieme alle passerelle in
   * cima, l'ultimo stadio andava da `z = 0` a `z = 45` e sforava
   * `maxDirtyChunksPerBuilding` — cioe' non sarebbe stato scritto affatto, in
   * silenzio. Nessuno stadio deve tenere insieme il fondo e la cima.
   *
   * **Le due passerelle stanno fuori dall'asse del pozzo**, a `y = 24` e a
   * `x = 69`: la sezione profonda occupa `40..54` su tutti e due gli assi, e una
   * passerella in mezzeria l'avrebbe coperta per tre quarti — il pozzo sarebbe
   * rimasto aperto sulla carta e cieco a schermo.
   */
  const invertedPyramid: ArcologyRecipe = {
    kind: 'invertedPyramid',
    blocks: [4, 4],
    span: [96, 96],
    height: 46,
    anchor: [48, 48],
    stages: thresholds(5),
    sunken: {
      depth: 40,
      // L'imbuto: quattro tronchi che rientrano, il piu' largo alla bocca.
      dig: [
        box(PART.slab, 33, 33, 30, 30, 0, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 22, 22, 52, 52, 10, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 11, 11, 74, 74, 20, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 0, 0, 96, 96, 30, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      ],
    },
    parts: [
      [
        // La corona a filo di strada: il corpo, il selciato della piazza e il
        // parapetto che ne dichiara il bordo. E' cio' che si vede per primo, e
        // per un lungo tratto l'unica cosa costruita.
        ...ring(0, 0, 96, 96, 30, 9, 12, PALETTE_SLOTS.concrete, SURFACE_KIND.habitat),
        ...ring(0, 0, 96, 96, 39, 1, 12, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        ...ring(0, 0, 96, 96, 40, 2, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      ],
      ring(11, 11, 74, 74, 20, 10, 11, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      // Da qui in giu' il cielo geometrico non arriva piu' (`SKY_PROBE` e'
      // sedici): le fasce basse sono `luminous`, che emette a ogni ora, e sono
      // l'unica cosa che si legge guardando dentro il pozzo a mezzogiorno.
      ring(22, 22, 52, 52, 10, 10, 9, PALETTE_SLOTS.concreteLight, SURFACE_KIND.luminous),
      [
        ...ring(33, 33, 30, 30, 1, 9, 7, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        box(PART.slab, 33, 33, 30, 30, 0, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      ],
      [
        box(PART.boom, 0, 24, 96, 2, 42, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 69, 0, 2, 96, 44, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.commercial, x: 3, y: 3, z: 39, label: 'plaza' },
      { stage: 1, use: BUILDING_CLASS.residential, x: 79, y: 79, z: 20, label: 'upperTerraces' },
      { stage: 2, use: BUILDING_CLASS.civic, x: 25, y: 68, z: 10, label: 'lowerTerraces' },
      { stage: 3, use: BUILDING_CLASS.industrial, x: 35, y: 57, z: 1, label: 'core' },
    ],
    // **Nessun piazzale, e non e' una casella lasciata aperta.** Un'arcologia
    // alta ha bisogno di un attracco perche' il suo ingresso sta a ottanta
    // quote; qui la piazza *e'* il piano di campagna, e ci si arriva
    // camminando. Dichiararne uno sarebbe un capolinea in quota che nessun
    // percorso avrebbe motivo di cercare.
    landings: [],
  };

  /**
   * La corte bassa: trentadue quote, e il fondo e' un giardino.
   *
   * **Esiste per entrare dove la piramide non entra**, e la differenza sta sia
   * nella roccia sia nel sedime: quaranta quote su un quadrato da novantasei le
   * offrono ~270 finestre dell'isola, trentadue su uno da sessantaquattro ne
   * hanno ~610. E' la ricetta che salva l'isolato buono quando la forma
   * sorteggiata non ci sta, ed e' lo stesso motivo per cui `arcologyForBlock`
   * scorre in avanti invece di rinunciare.
   */
  const sunkenCourt: ArcologyRecipe = {
    kind: 'sunkenCourt',
    blocks: [3, 3],
    span: [64, 64],
    height: 38,
    anchor: [32, 32],
    stages: thresholds(4),
    sunken: {
      depth: 32,
      dig: [
        box(PART.slab, 20, 20, 24, 24, 0, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 10, 10, 44, 44, 10, 12, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 0, 0, 64, 64, 22, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      ],
    },
    parts: [
      [
        ...ring(0, 0, 64, 64, 22, 9, 10, PALETTE_SLOTS.stoneDeep, SURFACE_KIND.habitat),
        ...ring(0, 0, 64, 64, 31, 1, 10, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        ...ring(0, 0, 64, 64, 32, 2, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      ],
      ring(10, 10, 44, 44, 10, 12, 9, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      ring(20, 20, 24, 24, 1, 9, 6, PALETTE_SLOTS.concreteLight, SURFACE_KIND.luminous),
      [
        // Il giardino sul fondo: e' il pezzo che rende la corte una corte, e sta
        // in uno stadio suo perche' e' anche l'ultimo che una citta' modesta
        // riesce a costruire. Qui il delta sta dentro il tetto di chunk anche con
        // le passerelle — l'inviluppo e' trentotto quote, non quarantasei.
        box(PART.slab, 20, 20, 24, 24, 0, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
        box(PART.boom, 0, 14, 64, 2, 34, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 47, 0, 2, 64, 36, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.commercial, x: 2, y: 61, z: 31, label: 'plaza' },
      { stage: 1, use: BUILDING_CLASS.residential, x: 12, y: 12, z: 10, label: 'court' },
      { stage: 2, use: BUILDING_CLASS.civic, x: 41, y: 22, z: 1, label: 'garden' },
    ],
    landings: [],
  };

  /**
   * La voragine su quindici isolati: quarantasei quote, e un vuoto che si vede
   * da lontano.
   *
   * **La profondita' persa si riguadagna in pianta**, ed e' qui che la famiglia
   * lo dimostra: centoventotto voxel per sessantaquattro, cioe' l'impronta piu'
   * larga di tutto il catalogo — il doppio del `quadCluster`, che e' la torre piu'
   * grande che l'isola sappia produrre. Dall'inquadratura d'insieme conta l'area
   * del vuoto, non quanto scende: un pozzo stretto e profondo si legge come un
   * pozzo di ventilazione, uno largo come un pezzo di citta' che manca.
   *
   * **E' anche quella che si guadagna piu' di tutte**, e le due cose sono la
   * stessa: quarantasei quote di roccia sotto un sedime cosi' largo si trovano in
   * poche decine di posti per isola, e il cluster va anche sgomberato. Il catalogo
   * scorre in avanti quando non entra, quindi il costo di questa scala e' che il
   * cratere sia raro — non che l'isolato resti senza megastruttura.
   *
   * **`128 x 64` e non `128 x 96`**: il tetto non e' il terreno ma
   * `maxDirtyChunksPerBuilding`. A novantasei di profondita' il delta dello
   * stadio piu' basso sfora di otto chunk nel caso peggiore di allineamento —
   * cioe' la struttura verrebbe scartata dal budget, in silenzio, su una
   * cucitura su quattro.
   */
  const craterRing: ArcologyRecipe = {
    kind: 'craterRing',
    blocks: [5, 3],
    span: [128, 64],
    height: 52,
    anchor: [64, 32],
    stages: thresholds(5),
    sunken: {
      depth: 46,
      dig: [
        box(PART.slab, 44, 22, 40, 20, 0, 11, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 28, 14, 72, 36, 11, 12, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 14, 7, 100, 50, 23, 12, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
        box(PART.slab, 0, 0, 128, 64, 35, 11, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      ],
    },
    parts: [
      [
        ...ring(0, 0, 128, 64, 35, 10, 10, PALETTE_SLOTS.concrete, SURFACE_KIND.habitat),
        ...ring(0, 0, 128, 64, 45, 1, 10, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
        ...ring(0, 0, 128, 64, 46, 2, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.utility),
      ],
      ring(14, 7, 100, 50, 23, 12, 8, PALETTE_SLOTS.glassDeep, SURFACE_KIND.habitat),
      ring(28, 14, 72, 36, 11, 12, 8, PALETTE_SLOTS.concreteLight, SURFACE_KIND.luminous),
      [
        ...ring(44, 22, 40, 20, 1, 10, 6, PALETTE_SLOTS.glassDeep, SURFACE_KIND.luminous),
        box(PART.slab, 44, 22, 40, 20, 0, 1, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic),
      ],
      [
        // Una passerella attraversa la bocca e due la scavalcano di traverso: il
        // pozzo resta aperto sulla gran parte delle proprie colonne, cioe' le tre
        // campate si vedono *sopra* il vuoto invece di chiuderlo.
        box(PART.boom, 0, 28, 128, 2, 48, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 26, 0, 2, 64, 50, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
        box(PART.boom, 100, 0, 2, 64, 50, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.civic),
      ],
    ],
    bands: [
      { stage: 0, use: BUILDING_CLASS.commercial, x: 3, y: 3, z: 45, label: 'plaza' },
      { stage: 1, use: BUILDING_CLASS.residential, x: 109, y: 45, z: 23, label: 'upperTerraces' },
      { stage: 2, use: BUILDING_CLASS.civic, x: 31, y: 17, z: 11, label: 'lowerTerraces' },
      { stage: 3, use: BUILDING_CLASS.industrial, x: 46, y: 24, z: 1, label: 'core' },
    ],
    landings: [],
  };

  return { invertedPyramid, sunkenCourt, craterRing };
}
