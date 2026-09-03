import { DAYLIGHT_MODES, type DaylightMode } from '../engine/daylight';
import { daylightControl } from './GameHudControlsModel';
import type { ThemeChoice } from './GameHud';
import { createHudIcon } from './hudIcons';
import { titleGroup, titleNote, titleRow, titleSection, titleSmall } from './titleBits';

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
    this.root = titleSection();

    this.root.appendChild(titleGroup('Look'));
    const grid = document.createElement('div');
    grid.className = 'title-theme-grid';
    for (const theme of themes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'title-theme';
      button.dataset.themeName = theme.name;
      button.setAttribute('aria-label', `Use ${theme.name} theme`);
      button.setAttribute('aria-pressed', 'false');
      // Nessuna chiusura del menu dopo la scelta, al contrario del picker del
      // dock: qui si sta confrontando, e sette temi si guardano uno dopo
      // l'altro. La citta' cambia dietro il velo, che e' il punto.
      button.addEventListener('click', () => handlers.onTheme(theme.id));

      const preview = document.createElement('span');
      preview.className = 'title-swatches';
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

    this.root.appendChild(titleGroup('Sky'));
    const sky = titleRow();
    for (const mode of DAYLIGHT_MODES) {
      const control = daylightControl(mode);
      const button = titleSmall(control.label, () => handlers.onDaylight(mode));
      button.classList.add('title-small--wide');
      button.title = control.tooltip;
      button.setAttribute('aria-pressed', 'false');
      this.daylightButtons.set(mode, button);
      sky.appendChild(button);
    }
    this.root.appendChild(sky);

    const clouds = titleRow();
    this.cloudsButton = titleSmall('Clouds', () => {
      handlers.onClouds(this.cloudsButton.getAttribute('aria-pressed') !== 'true');
    });
    this.cloudsButton.classList.add('title-small--wide');
    this.cloudsButton.setAttribute('aria-pressed', 'false');
    clouds.appendChild(this.cloudsButton);
    this.root.appendChild(clouds);

    this.root.appendChild(titleGroup('Tools'));
    this.root.appendChild(titleNote(
      'F3 opens the technical overlays; F2 reloads the same city with the frame meter on.',
    ));

    const tools = titleRow();
    const swatch = titleSmall('Voxel swatches', () => handlers.onSwatch());
    swatch.classList.add('title-small--wide');
    swatch.prepend(createHudIcon('swatch'));
    swatch.title = 'Every palette slot and surface, in a new tab';
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
