import type { BuildingClass, CatalystId } from '../../sim';
import { BUILDING_CLASS } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';

/**
 * Unica fonte di verita' dei numeri del distretto costiero.
 *
 * **Che cos'e' il distretto costiero.** Un landmark che vive sull'acqua —
 * marina, porto, traghetto — non e' soltanto la struttura del catalizzatore:
 * e' il mestiere del posto, e il posto lo dice con gli edifici che ci
 * crescono attorno (un club nautico, un capannone container, una casa sul
 * canale) e con le opere che il mestiere comporta (banchine guadagnate al
 * mare, canali scavati nella riva, frangiflutti). Il distretto e' l'impronta
 * che il landmark lascia sul circondario, e nasce con lui: qui stanno le sue
 * misure, nel solo file che il dominio autorizza a portarne.
 *
 * **Contenuto per costruzione.** L'anello del distretto cresce con lo stadio
 * del landmark e ha un tetto — `ringByStage` dell'ultimo stadio — mai piu' di
 * due isolati. Ogni opera dichiara il proprio confine: il molo una
 * profondita', il canale una lunghezza, il frangiflutti una campata. Niente
 * di tutto questo si estende: e' la differenza fra un'impronta e una colata.
 *
 * **Gli edifici portano bonus e malus come tutti gli altri.** Non c'e' una
 * porta nuova verso la simulazione: gli edifici del distretto sono record
 * ordinari, quindi pagano la congestione e portano capacita' come chiunque,
 * e il bonus di settore arriva dal catalizzatore — che cresce di stadio con
 * il landmark — e dalle tipologie che il ruolo sblocca. `src/sim/` non sa
 * che il distretto esiste, esattamente come non sa che i landmark esistono.
 */

export const HARBOR = {
  /** Cadenza della passata del distretto, in tick. */
  ticksPerPass: 10,

  /** Quanti edifici di settore un'infornata puo' far nascere. */
  sitesPerPass: 1,

  /** Lato massimo di un ritaglio di scavo o di colmata, in colonne. */
  pieceSpan: 16,

  /** Quota del frangiflutti sopra il pelo dell'acqua, in voxel. */
  breakwaterFreeboard: 2,

  /** Profondita' dei canali del distretto sotto il pelo, in voxel. */
  canalDepth: 2,

  /** Voxel del corpo del frangiflutti e della colmata, sotto il piano. */
  fillBody: PALETTE_SLOTS.stone,

  /** Ultimo voxel del frangiflutti: il cappello che si legge dal mare. */
  fillCap: PALETTE_SLOTS.stoneDark,

  /** Colore della passeggiata del distretto: il suolo pubblico del fronte. */
  promenadePalette: PALETTE_SLOTS.concretePale,
} as const;

/**
 * Il mestiere di un ruolo sull'acqua: quali opere costruisce e con quale
 * confine, quanti edifici di settore merita per stadio e di che uso.
 */
export interface HarborRoleConfig {
  /** Larghezza dell'anello del distretto per stadio, in colonne. */
  readonly ringByStage: readonly number[];

  /**
   * L'insenatura scavata oltre il fronte della struttura, che cresce con
   * l'anello: la darsena che si allarga dentro la riva a ogni stadio.
   */
  readonly inlet?: {
    readonly fromStage: number;
    /** Profondita' sotto il pelo, in voxel. */
    readonly depth: number;
  };

  /** Canali scavati nella riva emersa, perpendicolari alla costa. */
  readonly canals?: {
    readonly fromStage: number;
    /** Coppie di canali, uno per lato della struttura. */
    readonly count: number;
    /** Larghezza di un canale, in colonne. */
    readonly width: number;
    /** Lunghezza verso terra, in colonne. */
    readonly length: number;
    /** Colonne fra il bordo della struttura e la prima sponda. */
    readonly gap: number;
  };

  /** Molo di terra guadagnata oltre la battigia: la baia artificiale. */
  readonly reclamation?: {
    readonly fromStage: number;
    /** Quante colonne oltre il fronte della struttura. */
    readonly depth: number;
    /** Margine laterale del molo, in colonne. */
    readonly sideMargin: number;
  };

  /** Canale di accesso approfondito davanti al molo. */
  readonly access?: {
    readonly fromStage: number;
    /** Profondita' sotto il pelo, in voxel. */
    readonly depth: number;
    /** Quante colonne oltre il molo. */
    readonly span: number;
  };

  /** Frangiflutti staccato davanti al fronte: chiude lo specchio d'acqua. */
  readonly breakwater?: {
    readonly fromStage: number;
    /** Campata lungo la costa, in colonne. */
    readonly length: number;
    /** Colonne fra il fronte piu' avanzato e il frangiflutti. */
    readonly gap: number;
    /** Spessore del braccio, in colonne. */
    readonly width: number;
  };

  /** Edifici di settore cumulativi per stadio. */
  readonly sitesByStage: readonly number[];

  /** Uso di ogni slot di settore, in ordine di sblocco. */
  readonly siteClasses: readonly BuildingClass[];
}

/**
 * I ruoli che lasciano un'impronta sulla costa, e le loro misure.
 *
 * **Gli stadi sono quelli del landmark**: lo zero e' la sola struttura,
 * e il distretto arriva con cio' che il quartiere ha meritato. La marina
 * scava l'insenatura e i canali — il suo mestiere e' l'acqua calma dentro
 * la riva — e chiude un frangiflutti corto; il porto guadagna terra al mare
 * e scava il canale di accesso — il suo mestiere e' la banchina — con un
 * braccio di pietra lungo quanto lo specchio che protegge; il traghetto si
 * allunga di un molo solo, perche' il suo posto e' il collegamento e non il
 * bacino.
 */
export const HARBOR_ROLES: Partial<Record<CatalystId, HarborRoleConfig>> = {
  marina: {
    ringByStage: [0, 3, 6, 8],
    inlet: { fromStage: 1, depth: 2 },
    canals: { fromStage: 2, count: 1, width: 3, length: 12, gap: 2 },
    breakwater: { fromStage: 3, length: 10, gap: 1, width: 2 },
    sitesByStage: [0, 1, 3, 5],
    siteClasses: [
      BUILDING_CLASS.residential,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.residential,
      BUILDING_CLASS.commercial,
    ],
  },
  port: {
    ringByStage: [0, 3, 6, 8],
    reclamation: { fromStage: 2, depth: 6, sideMargin: 2 },
    access: { fromStage: 3, depth: 3, span: 4 },
    breakwater: { fromStage: 3, length: 14, gap: 2, width: 2 },
    sitesByStage: [0, 1, 3, 5],
    siteClasses: [
      BUILDING_CLASS.industrial,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.industrial,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.industrial,
    ],
  },
  ferry: {
    ringByStage: [0, 2, 4, 6],
    reclamation: { fromStage: 2, depth: 3, sideMargin: 3 },
    breakwater: { fromStage: 3, length: 10, gap: 2, width: 2 },
    sitesByStage: [0, 1, 2, 3],
    siteClasses: [
      BUILDING_CLASS.civic,
      BUILDING_CLASS.commercial,
      BUILDING_CLASS.civic,
    ],
  },
};
