import { DAYLIGHT_MODES, type DaylightMode } from '../engine/daylight';
import { SEASONS, type Season } from '../sim/seasons';
import { daylightControl } from './GameHudControlsModel';
import type { ThemeChoice } from './GameHud';
import { createHudIcon } from './hudIcons';
import { paintSegmented, segmentedRow } from './segmented';
import { seasonControl } from './seasonControl';
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
  /** Porta l'anno al primo giorno di una stagione: e' un comando sulla partita. */
  readonly onSeason: (season: Season) => void;
  readonly onClouds: (on: boolean) => void;
  /** Il campionario dei voxel: e' una scena, e chi la apre sta nella radice. */
  readonly onSwatch: () => void;
}

export class MainMenuSettings {
  readonly root: HTMLElement;

  private readonly themeButtons = new Map<string, HTMLButtonElement>();
  private readonly daylightButtons = new Map<DaylightMode, HTMLButtonElement>();
  private readonly seasonButtons = new Map<Season, HTMLButtonElement>();
  /** Le due piste: la pastiglia va spostata a ogni cambio, non solo al clic. */
  private readonly daylightTrack: HTMLElement;
  private readonly seasonTrack: HTMLElement;
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
    // **I tre modi in una pista sola.** Sono una scelta fra tre, non tre
    // interruttori: tre cornici affiancate dicevano il contrario, e la pastiglia
    // che scorre dice insieme dove si e' e dove si puo' andare. Le nuvole qui
    // sotto restano un bottone loro, perche' sono un si'/no.
    this.daylightTrack = segmentedRow('title-segmented');
    for (const mode of DAYLIGHT_MODES) {
      const control = daylightControl(mode);
      const button = titleSmall(control.label, () => handlers.onDaylight(mode));
      button.title = control.tooltip;
      button.setAttribute('aria-pressed', 'false');
      this.daylightButtons.set(mode, button);
      this.daylightTrack.appendChild(button);
    }
    this.root.appendChild(this.daylightTrack);

    const clouds = titleRow();
    this.cloudsButton = titleSmall('Clouds', () => {
      handlers.onClouds(this.cloudsButton.getAttribute('aria-pressed') !== 'true');
    });
    this.cloudsButton.classList.add('title-small--wide');
    this.cloudsButton.setAttribute('aria-pressed', 'false');
    clouds.appendChild(this.cloudsButton);
    this.root.appendChild(clouds);

    // **La stagione non e' un'impostazione, ed e' l'eccezione dichiarata di
    // questa sezione.** Pausa e velocita' stanno fuori di qui perche' sono
    // comandi dal vivo, e questo lo e' quanto loro: sposta il calendario della
    // citta' viva. Sta qui lo stesso per la ragione opposta a quella di pausa e
    // velocita' — la si sceglie guardando il prato e il cielo, cioe' proprio le
    // cose che questa sezione mette insieme — e la nota dice cosa succede, cosi'
    // nessuno la scambia per un fermo immagine.
    this.root.appendChild(titleGroup('Season'));
    this.root.appendChild(titleNote('Moves the year on to the first day of that season. It keeps running from there.'));
    this.seasonTrack = segmentedRow('title-segmented');
    for (const season of SEASONS) {
      const control = seasonControl(season);
      const button = titleSmall(control.label, () => handlers.onSeason(season));
      button.title = control.tooltip;
      button.setAttribute('aria-pressed', 'false');
      this.seasonButtons.set(season, button);
      this.seasonTrack.appendChild(button);
    }
    this.root.appendChild(this.seasonTrack);

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

    // La larghezza della pastiglia e' una frazione di quante celle ci sono, e
    // quel numero lo scrive `paintSegmented`: senza questo giro a vuoto la pista
    // si disegnerebbe con una pastiglia larga tutta la pista fino al primo
    // `setDaylight`, che arriva da fuori e non e' detto arrivi subito.
    paintSegmented(this.daylightTrack);
    paintSegmented(this.seasonTrack);
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
    paintSegmented(this.daylightTrack);
  }

  /** Acceso e' quello in cui la citta' sta adesso, come per la luce. */
  setSeason(season: Season): void {
    for (const [candidate, button] of this.seasonButtons) {
      button.setAttribute('aria-pressed', candidate === season ? 'true' : 'false');
    }
    paintSegmented(this.seasonTrack);
  }

  setClouds(on: boolean): void {
    this.cloudsButton.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
