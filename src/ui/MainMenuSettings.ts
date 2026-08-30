import { DAYLIGHT_MODES, type DaylightMode } from '../engine/daylight';
import { sectionTitle } from './drawerBits';
import { daylightControl } from './GameHudControlsModel';
import type { ThemeChoice } from './GameHud';
import { createHudIcon } from './hudIcons';

/**
 * La sezione delle impostazioni: come si guarda la citta', e che tempo fa sopra.
 *
 * **Non toglie niente al dock e alla barra.** Il tema si cambia a caldo ed e' un
 * gesto che si ripete: la pastiglia nel rail resta il percorso caldo, e questo
 * e' quello freddo — l'unico posto dove le manopole si vedono tutte insieme,
 * con il nome scritto accanto invece che dentro un tooltip.
 *
 * Pausa e velocita' non stanno qui: sono comandi dal vivo sulla partita, non
 * impostazioni, e vivono nella barra risorse dove si leggono mentre la citta'
 * cambia. Il menu ferma comunque il tempo finche' e' aperto.
 *
 * Le etichette della luce arrivano da `daylightControl`, che e' la stessa fonte
 * della barra: due elenchi paralleli divergono al primo cambio.
 */

export interface SettingsHandlers {
  readonly onTheme: (id: string) => void;
  readonly onDaylight: (mode: DaylightMode) => void;
  readonly onClouds: (on: boolean) => void;
  /** Il campionario dei voxel: e' una scena, e chi la apre sta nella radice. */
  readonly onSwatch: () => void;
}

export class MainMenuSettings {
  readonly root: HTMLElement;

  private readonly themeButtons = new Map<string, HTMLButtonElement>();
  private readonly daylightButtons = new Map<DaylightMode, HTMLButtonElement>();
  private readonly cloudsButton: HTMLButtonElement;

  constructor(themes: readonly ThemeChoice[], handlers: SettingsHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'menu-section-body';

    this.root.appendChild(sectionTitle('Look'));
    const grid = document.createElement('div');
    grid.className = 'theme-grid';
    for (const theme of themes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-option';
      button.dataset.themeName = theme.name;
      button.setAttribute('aria-label', `Use ${theme.name} theme`);
      button.setAttribute('aria-pressed', 'false');
      // Nessuna chiusura del menu dopo la scelta, al contrario del picker del
      // dock: qui si sta confrontando, e sette temi si guardano uno dopo
      // l'altro. La citta' cambia dietro il velo, che e' il punto.
      button.addEventListener('click', () => handlers.onTheme(theme.id));

      const preview = document.createElement('span');
      preview.className = 'theme-swatches';
      preview.setAttribute('aria-hidden', 'true');
      for (const color of theme.swatches) {
        const swatch = document.createElement('span');
        swatch.style.background = color;
        preview.appendChild(swatch);
      }
      const label = document.createElement('span');
      label.textContent = theme.name;
      button.append(preview, label);
      this.themeButtons.set(theme.id, button);
      grid.appendChild(button);
    }
    this.root.appendChild(grid);

    this.root.appendChild(sectionTitle('Sky'));
    const sky = document.createElement('div');
    sky.className = 'menu-choice-row';
    for (const mode of DAYLIGHT_MODES) {
      const control = daylightControl(mode);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'save-button';
      button.textContent = control.label;
      button.title = control.tooltip;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => handlers.onDaylight(mode));
      this.daylightButtons.set(mode, button);
      sky.appendChild(button);
    }
    this.root.appendChild(sky);

    const clouds = document.createElement('div');
    clouds.className = 'menu-choice-row';
    this.cloudsButton = document.createElement('button');
    this.cloudsButton.type = 'button';
    this.cloudsButton.className = 'save-button';
    this.cloudsButton.textContent = 'Clouds';
    this.cloudsButton.setAttribute('aria-pressed', 'false');
    this.cloudsButton.addEventListener('click', () => {
      handlers.onClouds(this.cloudsButton.getAttribute('aria-pressed') !== 'true');
    });
    clouds.appendChild(this.cloudsButton);
    this.root.appendChild(clouds);

    this.root.appendChild(sectionTitle('Tools'));
    const note = document.createElement('p');
    note.className = 'drawer-note';
    note.textContent = 'F3 opens the technical overlays; F2 reloads the same city with the frame meter on.';
    this.root.appendChild(note);

    const tools = document.createElement('div');
    tools.className = 'menu-choice-row';
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'save-button';
    swatch.append(createHudIcon('swatch'), document.createTextNode('Voxel swatches'));
    swatch.title = 'Every palette slot and surface, in a new tab';
    swatch.addEventListener('click', () => handlers.onSwatch());
    tools.appendChild(swatch);
    this.root.appendChild(tools);
  }

  setTheme(id: string): void {
    for (const [themeId, button] of this.themeButtons) {
      button.setAttribute('aria-pressed', themeId === id ? 'true' : 'false');
    }
  }

  setDaylight(mode: DaylightMode): void {
    for (const [candidate, button] of this.daylightButtons) {
      button.setAttribute('aria-pressed', candidate === mode ? 'true' : 'false');
    }
  }

  setClouds(on: boolean): void {
    this.cloudsButton.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
