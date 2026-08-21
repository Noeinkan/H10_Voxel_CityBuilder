import {
  INSPECT,
  INSPECT_MODE,
  INSPECT_MODES,
  modeCuts,
  modeHasLevel,
  type InspectMode,
} from '../engine/inspect';

/**
 * Il menu delle viste come lo vede il giocatore, in TypeScript puro.
 *
 * Stessa divisione di `GameHudModel.ts`: qui non c'e' DOM e non c'e' Three, e i
 * test girano in `node`. Il pannello di `GameHud.ts` disegna quello che esce da
 * qui e nient'altro.
 *
 * Le etichette sono un livello a parte dai nomi tecnici. `off`, `xray`, `slice`,
 * `section` e `block` restano quelli del parametro URL e del pannello di debug —
 * sono identificatori, e cambiarli romperebbe un link salvato. "Levels" e
 * "Cutaway" sono cio' che si legge in un dock, e devono poter cambiare senza
 * toccare il motore. E' la stessa separazione fra etichetta e sostanza della
 * fase 2.1.
 */

export interface ViewOption {
  readonly mode: InspectMode;
  readonly label: string;
  readonly description: string;
  /**
   * Come si punta la vista, in imperativo.
   *
   * E' la meta' che mancava. Tre viste su quattro si agganciano alla colonna
   * sotto il cursore e nessuna riga lo diceva: si sceglieva «X-ray», compariva
   * un riquadro retinato da qualche parte, e non c'era modo di collegare le due
   * cose. Vuoto per Normal, che non si punta.
   */
  readonly gesture: string;
  readonly active: boolean;
  /** Taglia invece di velare: e' la regola che chiude una vista quando si prende uno strumento. */
  readonly cuts: boolean;
}

/** Un tasto che fa qualcosa **dentro** una vista, con cosa fa. */
export interface ViewKeyHint {
  readonly keys: readonly string[];
  readonly action: string;
}

/**
 * La targa che resta a schermo finche' una vista e' accesa.
 *
 * E' il pezzo che mancava, ed e' quello che rendeva le viste un vicolo cieco.
 * Il picker e il toast dicono tutto una volta sola: il primo si chiude subito
 * dopo la scelta, il secondo si spegne da solo dopo due secondi. Da li' in poi
 * il giocatore ha davanti una citta' retinata, nessun nome per quello che sta
 * vedendo, nessun tasto da provare e — soprattutto — nessuna uscita. Questa
 * targa e' l'unica superficie che sopravvive al gesto che l'ha aperta.
 *
 * `keys` sono i tasti che valgono **in questa vista**: la quota solo dentro
 * Levels, la rotazione del taglio solo dentro Cutaway. Elencarli tutti sempre
 * riporterebbe il difetto che la card d'aiuto aveva prima — scorciatoie
 * pubblicizzate dove non muovono niente.
 */
export interface ViewBarModel {
  readonly visible: boolean;
  readonly label: string;
  readonly gesture: string;
  readonly keys: readonly ViewKeyHint[];
}

export interface ViewMenuModel {
  readonly options: readonly ViewOption[];
  readonly mode: InspectMode;
  readonly activeLabel: string;
  /** La riga della vista attiva: e' quella che il toast di `V` fa leggere. */
  readonly activeDescription: string;
  /** Il gesto della vista attiva, per lo stesso toast: senza, `V` resta cieco. */
  readonly activeGesture: string;
  /** Cosa mostrare a schermo mentre si guarda: nome, gesto, tasti e uscita. */
  readonly bar: ViewBarModel;
  /** La barra compare solo dove c'e' una quota da muovere. */
  readonly levelVisible: boolean;
  readonly level: number;
  readonly levelMax: number;
}

const LABELS: Readonly<Record<InspectMode, string>> = {
  [INSPECT_MODE.off]: 'Normal',
  [INSPECT_MODE.xray]: 'X-ray',
  [INSPECT_MODE.slice]: 'Levels',
  [INSPECT_MODE.section]: 'Cutaway',
  [INSPECT_MODE.block]: 'Block focus',
};

/**
 * Cosa risponde ogni vista, in una riga.
 *
 * Sono descrizioni di cosa si va a **vedere**, non di come funziona il retino:
 * chi apre il menu sta cercando una risposta a una domanda sulla sua citta'.
 */
const DESCRIPTIONS: Readonly<Record<InspectMode, string>> = {
  [INSPECT_MODE.off]: 'The city as it stands.',
  [INSPECT_MODE.xray]: 'See through whatever stands in front of what you are looking at.',
  [INSPECT_MODE.slice]: 'Cut the city at a height and walk down floor by floor.',
  [INSPECT_MODE.section]: 'Slice along a street and read the block fronts.',
  [INSPECT_MODE.block]: 'Fade everything outside one block, keeping it in context.',
};

/**
 * Il gesto che punta ogni vista.
 *
 * Sta accanto alla descrizione e non dentro perche' risponde a un'altra domanda:
 * quella dice **cosa si vede**, questa **cosa fare con le mani**. Chi apre il
 * menu legge la prima per scegliere e la seconda subito dopo aver scelto, ed e'
 * la seconda che mancava del tutto.
 *
 * La finestra dei raggi X e' larga `INSPECT.xraySpan` colonne di **mondo**: a
 * inquadratura larga sono pochi pixel e la vista sembra non fare niente. Non e'
 * un numero da alzare — un raggio X che scala con lo zoom dissolverebbe mezza
 * citta' — e' un fatto da dire qui.
 */
const GESTURES: Readonly<Record<InspectMode, string>> = {
  [INSPECT_MODE.off]: '',
  [INSPECT_MODE.xray]: `Point at a building. The window is ${INSPECT.xraySpan * 2} tiles wide, so zoom in first.`,
  [INSPECT_MODE.slice]: 'Drag the Level rail on the left, or press [ and ] — hold Shift for a whole floor.',
  [INSPECT_MODE.section]: 'Point at a block: the cut falls on the nearest street. Q and E turn it.',
  [INSPECT_MODE.block]: 'Point at the block you want to keep.',
};

/**
 * I tasti che valgono solo dentro una vista.
 *
 * Non ce ne sono per i raggi X e per l'isolato: quelle due si guidano con il
 * cursore e basta, e inventare una riga di tasti per riempire il pannello
 * direbbe una cosa falsa. Il vuoto e' un fatto, non una dimenticanza.
 */
const VIEW_KEYS: Readonly<Record<InspectMode, readonly ViewKeyHint[]>> = {
  [INSPECT_MODE.off]: [],
  [INSPECT_MODE.xray]: [],
  [INSPECT_MODE.slice]: [
    { keys: ['[', ']'], action: 'Move the level' },
    { keys: ['Shift'], action: 'Jump a whole floor' },
  ],
  [INSPECT_MODE.section]: [{ keys: ['Q', 'E'], action: 'Turn the cut' }],
  [INSPECT_MODE.block]: [],
};

/**
 * I due tasti che valgono in ogni vista, e il secondo e' quello che mancava.
 *
 * Uscire da una vista si poteva gia' fare — `V` fino a completare il giro, o il
 * picker e poi Normal — ma nessuna delle due strade era scritta da nessuna
 * parte, e la prima chiede al giocatore di passare per tre viste che non voleva
 * vedere. Chi si trovava la citta' velata senza sapere come tornare indietro
 * aveva ragione: non c'era una via d'uscita, c'era un giro.
 */
const VIEW_KEYS_ALWAYS: readonly ViewKeyHint[] = [
  { keys: ['V'], action: 'Next view' },
  { keys: ['Esc'], action: 'Back to the whole city' },
];

/** Il gesto di una vista, per chi lo deve scrivere fuori dal menu. */
export function viewGesture(mode: InspectMode): string {
  return GESTURES[mode];
}

/** L'etichetta di una vista, per chi ne deve nominare una senza costruire il menu. */
export function viewLabel(mode: InspectMode): string {
  return LABELS[mode];
}

export function buildViewMenuModel(
  mode: InspectMode,
  level: number,
  maxZ: number,
): ViewMenuModel {
  const options = INSPECT_MODES.map((candidate): ViewOption => ({
    mode: candidate,
    label: LABELS[candidate],
    description: DESCRIPTIONS[candidate],
    gesture: GESTURES[candidate],
    active: candidate === mode,
    cuts: modeCuts(candidate),
  }));

  return {
    options,
    mode,
    activeLabel: LABELS[mode],
    activeDescription: DESCRIPTIONS[mode],
    activeGesture: GESTURES[mode],
    bar: {
      visible: mode !== INSPECT_MODE.off,
      label: LABELS[mode],
      gesture: GESTURES[mode],
      keys: [...VIEW_KEYS[mode], ...VIEW_KEYS_ALWAYS],
    },
    // `modeHasLevel` e non `modeCuts`: Cutaway taglia ma non guarda `sliceZ`, e
    // finche' le due domande erano la stessa la barra compariva anche li' — uno
    // slider che si trascinava senza muovere niente.
    levelVisible: modeHasLevel(mode),
    level,
    // La citta' cresce in altezza, e con lei la quota utile. Il minimo tiene la
    // barra trascinabile anche su una mappa appena generata, dove il punto piu'
    // alto e' ancora una collina.
    levelMax: Math.max(INSPECT.minSliceZ + 1, Math.min(INSPECT.maxSliceZ, Math.ceil(maxZ))),
  };
}

/**
 * La vista che resta in mano quando il giocatore prende uno strumento.
 *
 * Con una vista che taglia, il terreno vero sotto il cursore e' nascosto: si
 * piazzerebbe alla cieca, in un punto che non si vede. Prendere in mano un
 * catalizzatore riporta quindi alla citta' intera. Le viste a **velo**
 * sopravvivono, perche' li' il suolo si legge ancora attraverso il retino, e
 * spegnerle sarebbe togliere al giocatore proprio il contesto che stava
 * guardando mentre decideva dove costruire.
 */
export function viewAfterToolPicked(mode: InspectMode): InspectMode {
  return modeCuts(mode) ? INSPECT_MODE.off : mode;
}
