import { createHudIcon } from './hudIcons';
import { INSPECT, INSPECT_MODE } from '../engine/inspect';
import { buildViewMenuModel } from './ViewMenuModel';

export interface ControlHint {
  readonly keys: readonly string[];
  readonly action: string;
}

export const CONTROL_HINTS: readonly ControlHint[] = [
  { keys: ['WASD', '↑←↓→'], action: 'Move the camera' },
  { keys: ['Q', 'E'], action: 'Rotate the city' },
  { keys: ['Wheel'], action: 'Zoom in and out' },
  { keys: ['Drag'], action: 'Pan the camera' },
  // L'orbita libera va detta **qui** e non solo dentro Block focus: il tasto
  // centrale non lo prova nessuno per caso, e senza questa riga l'unico modo di
  // scoprire che la citta' si puo' guardare da un altro angolo sarebbe isolare
  // un isolato — cioe' passare da uno strumento per ottenere una vista.
  { keys: ['Middle drag'], action: 'Orbit and tilt the view' },
  { keys: ['F'], action: 'Frame the city and level the view' },
  // Il click a mani vuote non fa niente di visibile finche' non si scopre che
  // apre una scheda, e nessun bottone lo suggerisce: e' un gesto che si impara
  // leggendolo, o per caso.
  { keys: ['Click'], action: 'Inspect a building, block, column or voxel' },
  // Le cifre nude sono degli **strumenti**, e i temi hanno ceduto loro il posto:
  // il dock e' la prima cosa che si guarda per sapere cosa si puo' costruire, e
  // il badge sulla tessera promette proprio questo tasto. Il tema si cambia una
  // volta ogni tanto, e si accontenta di Shift.
  { keys: ['1', '…', '9'], action: 'Pick the matching tool from the dock' },
  { keys: ['Shift', '1..9'], action: 'Switch the visual theme' },
  { keys: ['V'], action: 'Cycle the views below' },
  // Il tasto **e'** la risposta a «non torna mai giorno»: dice che l'ora e' una
  // cosa che si decide, e non solo qualcosa che capita mentre si guarda.
  { keys: ['L'], action: 'Hold the day, hold the night, or let the clock run' },
  // Una riga sola per i quattro usi, nell'ordine in cui Escape li prova: posa lo
  // strumento, chiude la scheda, esce dalla vista. Righe separate direbbero che
  // sono quattro tasti, e chi legge non saprebbe quale effetto aspettarsi.
  // L'ultimo passo e' l'unico che **apre** invece di chiudere: a mani vuote non
  // c'e' piu' niente da annullare, e il tasto smette di non fare nulla.
  { keys: ['Esc'], action: 'Cancel the tool, close the card, leave the view, then open the menu' },
];

/** Una vista nella card: come si chiama e come si punta. */
export interface ViewHint {
  readonly label: string;
  readonly gesture: string;
}

/**
 * Le viste, con il loro gesto, dentro l'aiuto.
 *
 * Qui e' dove il giocatore scopre che esistono, e finora la card ne diceva una
 * riga sola — «V · Look inside the city» — che non nomina nessuna delle quattro
 * e non spiega come puntarle. Chi premeva `V` vedeva comparire un riquadro
 * retinato e non aveva nessun posto dove andare a capire cosa fosse.
 *
 * Derivate da `ViewMenuModel` e non riscritte a mano: la card e il picker devono
 * chiamare le viste con lo stesso nome, e due elenchi paralleli divergono al
 * primo cambio. Normal esce da sola — non si punta, e non ha un gesto.
 */
export const VIEW_HINTS: readonly ViewHint[] = buildViewMenuModel(
  INSPECT_MODE.off,
  INSPECT.defaultSliceZ,
  INSPECT.maxSliceZ,
).options
  .filter((option) => option.gesture !== '')
  .map((option) => ({ label: option.label, gesture: option.gesture }));

/**
 * La riga che dice da dove si aprono — e da dove si esce.
 *
 * L'uscita sta qui e non in fondo perche' e' la prima cosa che serve sapere:
 * si prova una vista volentieri se si sa gia' come tornare indietro, e chi non
 * lo sa la subisce.
 */
export const VIEW_HINTS_LEAD =
  'Open the Views button in the dock, or press V to cycle. Esc brings the whole city back.';

/**
 * I tre gesti della gomma, detti in un posto solo.
 *
 * La demolizione e' l'unico strumento con un linguaggio suo da imparare — clic
 * per un edificio, striscio per l'area, Ctrl+Z per tornare indietro — e finora
 * non era scritto da nessuna parte: il toast lo dice una riga alla volta,
 * mentre qui si legge tutto insieme.
 */
export const DEMOLISH_HINTS: readonly ControlHint[] = [
  { keys: ['Click'], action: 'Tear down a single building' },
  { keys: ['Drag'], action: 'Sweep an area of buildings' },
  { keys: ['Ctrl', 'Z'], action: 'Undo the last sweep while it is still falling' },
];

/**
 * La riga che dice cosa significano i colori dell'anteprima.
 *
 * Il rosso e l'ambra compaiono solo durante lo striscio, e chi non ha mai visto
 * la gomma non ha modo di sapere che l'ambra e' un "no" invece di un'evidenza.
 */
export const DEMOLISH_HINTS_LEAD =
  'Pick Demolish in the dock: red roofs fall, amber roofs are built to last and stay.';

export const HELP_STORAGE_KEY = 'h10-cozy-help-seen-v1';

interface HelpStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Aiuto contestuale del primo avvio, riapribile dal dock con il pulsante `?`. */
export class ControlsHint {
  private readonly root: HTMLElement;
  private readonly storage: HelpStorage | null;

  constructor(parent: HTMLElement, storage: HelpStorage | null = browserStorage()) {
    this.storage = storage;
    this.root = document.createElement('aside');
    this.root.className = 'help-card hud-surface hud-surface--panel';
    this.root.setAttribute('aria-label', 'Controls help');

    const header = document.createElement('header');
    header.className = 'drawer-header';
    const copy = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'drawer-title';
    title.textContent = 'Welcome, Mayor!';
    const subtitle = document.createElement('p');
    subtitle.className = 'drawer-subtitle';
    subtitle.textContent = 'Explore the island and choose how your city will grow.';
    copy.append(title, subtitle);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'hud-button hud-button--icon hud-button--small';
    close.setAttribute('aria-label', 'Close help');
    close.appendChild(createHudIcon('close'));
    close.addEventListener('click', () => this.hide(true));
    header.append(copy, close);
    this.root.appendChild(header);

    for (const section of helpSections()) this.root.appendChild(section);
    parent.appendChild(this.root);
    this.root.hidden = hasSeenHelp(storage);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(markSeen = false): void {
    this.root.hidden = true;
    if (markSeen) rememberHelp(this.storage);
  }

  toggle(): void {
    if (this.isOpen) this.hide(true);
    else this.show();
  }
}

/**
 * Il corpo dell'aiuto: comandi, viste, gomma.
 *
 * Lo disegnano in due — la card di primo avvio e la sezione Help del menu
 * principale — e per questo sta in una funzione invece che dentro il
 * costruttore. Due disegnatori dello stesso testo divergono al primo comando
 * nuovo, e il giocatore leggerebbe due elenchi diversi a seconda della porta.
 */
export function helpSections(): readonly HTMLElement[] {
  return [hintGrid(CONTROL_HINTS, '/'), viewSection(), demolishSection()];
}

/** Le righe «azione a sinistra, tasti a destra», in griglia. */
function hintGrid(hints: readonly ControlHint[], separator: string): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'help-grid';
  for (const hint of hints) {
    const row = document.createElement('div');
    row.className = 'help-row';
    const action = document.createElement('span');
    action.textContent = hint.action;
    const keys = document.createElement('span');
    keys.className = 'help-keys';
    for (const [index, label] of hint.keys.entries()) {
      if (index > 0) keys.append(separator);
      const key = document.createElement('kbd');
      key.textContent = label;
      keys.appendChild(key);
    }
    row.append(action, keys);
    grid.appendChild(row);
  }
  return grid;
}

/** Il blocco delle viste, sotto i comandi della camera. */
function viewSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'help-views';

  const title = document.createElement('h3');
  title.className = 'help-section-title';
  title.textContent = 'Look inside the city';
  const lead = document.createElement('p');
  lead.className = 'help-section-lead';
  lead.textContent = VIEW_HINTS_LEAD;
  section.append(title, lead);

  for (const hint of VIEW_HINTS) {
    const row = document.createElement('div');
    row.className = 'help-view-row';
    const label = document.createElement('strong');
    label.textContent = hint.label;
    const gesture = document.createElement('span');
    gesture.textContent = hint.gesture;
    row.append(label, gesture);
    section.appendChild(row);
  }
  return section;
}

/** Il blocco della gomma, sotto le viste: i tre gesti e il senso dei colori. */
function demolishSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'help-views';

  const title = document.createElement('h3');
  title.className = 'help-section-title';
  title.textContent = 'Clear the city';
  const lead = document.createElement('p');
  lead.className = 'help-section-lead';
  lead.textContent = DEMOLISH_HINTS_LEAD;
  section.append(title, lead);
  // `+` e non `/`: `Ctrl` e `Z` si premono insieme, mentre in alto le
  // alternative sono una **o** l'altra.
  section.appendChild(hintGrid(DEMOLISH_HINTS, '+'));
  return section;
}

function browserStorage(): HelpStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hasSeenHelp(storage: HelpStorage | null): boolean {
  try {
    return storage?.getItem(HELP_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberHelp(storage: HelpStorage | null): void {
  try {
    storage?.setItem(HELP_STORAGE_KEY, '1');
  } catch {
    // L'aiuto resta funzionante anche quando lo storage e' disabilitato.
  }
}
