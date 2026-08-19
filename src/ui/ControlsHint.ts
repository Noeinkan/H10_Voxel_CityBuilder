import { createHudIcon } from './hudIcons';

export interface ControlHint {
  readonly keys: readonly string[];
  readonly action: string;
}

export const CONTROL_HINTS: readonly ControlHint[] = [
  { keys: ['WASD', '↑←↓→'], action: 'Sposta la visuale' },
  { keys: ['Q', 'E'], action: 'Ruota la città' },
  { keys: ['Rotella'], action: 'Avvicina e allontana' },
  { keys: ['Drag'], action: 'Trascina la visuale' },
  { keys: ['F'], action: 'Reinquadra tutto' },
  { keys: ['Esc'], action: 'Annulla lo strumento' },
];

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
    this.root.setAttribute('aria-label', 'Aiuto comandi');

    const header = document.createElement('header');
    header.className = 'drawer-header';
    const copy = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'drawer-title';
    title.textContent = 'Benvenuto, sindaco!';
    const subtitle = document.createElement('p');
    subtitle.className = 'drawer-subtitle';
    subtitle.textContent = 'Muoviti sull’isola e scegli cosa far crescere.';
    copy.append(title, subtitle);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'hud-button hud-button--icon hud-button--small';
    close.setAttribute('aria-label', 'Chiudi aiuto');
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
