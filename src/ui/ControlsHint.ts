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
  { keys: ['F'], action: 'Frame the whole city' },
  { keys: ['V'], action: 'Cycle the views below' },
  // Il tasto **e'** la risposta a «non torna mai giorno»: dice che l'ora e' una
  // cosa che si decide, e non solo qualcosa che capita mentre si guarda.
  { keys: ['L'], action: 'Hold the day, hold the night, or let the clock run' },
  // Una riga sola per i due usi, nell'ordine in cui Escape li prova: prima posa
  // lo strumento, poi esce dalla vista. Due righe separate direbbero che sono
  // due tasti, e chi legge non saprebbe quale dei due effetti aspettarsi.
  { keys: ['Esc'], action: 'Cancel the tool, then leave the view' },
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
    this.root.className = 'help-card hud-surface';
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

    const grid = document.createElement('div');
    grid.className = 'help-grid';
    for (const hint of CONTROL_HINTS) {
      const row = document.createElement('div');
      row.className = 'help-row';
      const action = document.createElement('span');
      action.textContent = hint.action;
      const keys = document.createElement('span');
      keys.className = 'help-keys';
      for (const [index, label] of hint.keys.entries()) {
        if (index > 0) keys.append('/');
        const key = document.createElement('kbd');
        key.textContent = label;
        keys.appendChild(key);
      }
      row.append(action, keys);
      grid.appendChild(row);
    }
    this.root.appendChild(grid);
    this.root.appendChild(viewSection());
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
