import {
  INSPECT,
  INSPECT_MODE,
  INSPECT_MODES,
  modeCuts,
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
  readonly active: boolean;
  /** Taglia invece di velare: decide la barra dei livelli e la regola degli strumenti. */
  readonly cuts: boolean;
}

export interface ViewMenuModel {
  readonly options: readonly ViewOption[];
  readonly mode: InspectMode;
  readonly activeLabel: string;
  /** La riga della vista attiva: e' quella che il toast di `V` fa leggere. */
  readonly activeDescription: string;
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
    active: candidate === mode,
    cuts: modeCuts(candidate),
  }));

  return {
    options,
    mode,
    activeLabel: LABELS[mode],
    activeDescription: DESCRIPTIONS[mode],
    levelVisible: modeCuts(mode),
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
