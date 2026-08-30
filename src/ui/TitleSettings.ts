import { DAYLIGHT_MODES, type DaylightMode } from '../engine/daylight';
import { THEMES, themeSwatches } from '../engine/themes';
import type { LookChoice } from '../game/launchMode';
import { daylightControl } from './daylightControl';

/**
 * Le impostazioni sul titolo: come nascera' il mondo, deciso prima che nasca.
 *
 * **Puo' stare qui perche' non tocca l'engine.** La tabella dei temi e il ciclo
 * della luce sono TypeScript puro — nessun import di Three da quando i colori
 * grezzi vivono in `paletteHex.ts` — e cio' che si sceglie non muove niente a
 * schermo: finisce nei parametri d'indirizzo che la radice legge all'avvio. E'
 * la differenza con la stessa sezione nel menu di pausa, dove la citta' cambia
 * sotto gli occhi mentre si confrontano i temi.
 *
 * Le etichette del cielo arrivano da `daylightControl`, la stessa fonte della
 * barra risorse e del menu: tre elenchi paralleli divergono al primo cambio.
 */

export class TitleSettings {
  readonly root: HTMLElement;

  private readonly themeButtons = new Map<string, HTMLButtonElement>();
  private readonly daylightButtons = new Map<DaylightMode, HTMLButtonElement>();
  private readonly cloudsButton: HTMLButtonElement;
  private look: LookChoice;

  constructor(initial: LookChoice, private readonly onChange: (look: LookChoice) => void) {
    this.look = initial;
    this.root = document.createElement('div');
    this.root.className = 'title-pane';

    const title = document.createElement('h2');
    title.className = 'title-pane-title';
    title.textContent = 'Settings';
    const note = document.createElement('p');
    note.className = 'title-note';
    note.textContent = 'The island is born with these. You can change them again while playing.';
    this.root.append(title, note);

    this.root.appendChild(paneLabel('Look'));
    const grid = document.createElement('div');
    grid.className = 'title-theme-grid';
    for (const theme of THEMES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'title-theme';
      button.setAttribute('aria-label', `Use ${theme.name} theme`);
      button.setAttribute('aria-pressed', 'false');
      const swatches = document.createElement('span');
      swatches.className = 'title-swatches';
      swatches.setAttribute('aria-hidden', 'true');
      for (const color of themeSwatches(theme)) {
        const chip = document.createElement('span');
        chip.style.background = color;
        swatches.appendChild(chip);
      }
      const name = document.createElement('span');
      name.textContent = theme.name;
      button.append(swatches, name);
      button.addEventListener('click', () => this.apply({ theme: theme.id }));
      this.themeButtons.set(theme.id, button);
      grid.appendChild(button);
    }
    this.root.appendChild(grid);

    this.root.appendChild(paneLabel('Sky'));
    const sky = document.createElement('div');
    sky.className = 'title-row';
    for (const mode of DAYLIGHT_MODES) {
      const control = daylightControl(mode);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'title-small title-small--wide';
      button.textContent = control.label;
      button.title = control.tooltip;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => this.apply({ daylight: mode }));
      this.daylightButtons.set(mode, button);
      sky.appendChild(button);
    }
    this.root.appendChild(sky);

    const clouds = document.createElement('div');
    clouds.className = 'title-row';
    this.cloudsButton = document.createElement('button');
    this.cloudsButton.type = 'button';
    this.cloudsButton.className = 'title-small title-small--wide';
    this.cloudsButton.textContent = 'Clouds';
    this.cloudsButton.setAttribute('aria-pressed', 'false');
    this.cloudsButton.addEventListener('click', () => this.apply({ clouds: !this.look.clouds }));
    clouds.appendChild(this.cloudsButton);
    this.root.appendChild(clouds);

    this.paint();
  }

  private apply(patch: Partial<LookChoice>): void {
    this.look = { ...this.look, ...patch };
    this.paint();
    this.onChange(this.look);
  }

  private paint(): void {
    for (const [id, button] of this.themeButtons) {
      button.setAttribute('aria-pressed', id === this.look.theme ? 'true' : 'false');
    }
    for (const [mode, button] of this.daylightButtons) {
      button.setAttribute('aria-pressed', mode === this.look.daylight ? 'true' : 'false');
    }
    this.cloudsButton.setAttribute('aria-pressed', this.look.clouds ? 'true' : 'false');
  }
}

/** Il titolino di un gruppo dentro una sottoschermata. */
function paneLabel(text: string): HTMLElement {
  const label = document.createElement('h3');
  label.className = 'title-group';
  label.textContent = text;
  return label;
}
