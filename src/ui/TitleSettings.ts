import { DAYLIGHT_MODES, type DaylightMode } from '../engine/daylight';
import { THEMES, themeSwatches } from '../engine/themes';
import type { LookChoice } from '../game/launchMode';
import { SEASONS, type Season } from '../sim/seasons';
import { daylightControl } from './daylightControl';
import { paintSegmented, segmentedRow } from './segmented';
import { seasonControl } from './seasonControl';
import { titleGroup } from './titleBits';

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
  private readonly seasonButtons = new Map<Season, HTMLButtonElement>();
  /** Le due piste: `paint` sposta la pastiglia insieme ai bottoni. */
  private readonly daylightTrack: HTMLElement;
  private readonly seasonTrack: HTMLElement;
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

    this.root.appendChild(titleGroup('Look'));
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

    this.root.appendChild(titleGroup('Sky'));
    // **I tre modi in una pista sola**, come nel menu di pausa e nella barra:
    // sono una scelta fra tre, e tre cornici affiancate le facevano sembrare
    // tre interruttori indipendenti. Le nuvole qui sotto restano un bottone
    // loro, perche' quelle sono davvero un si'/no.
    this.daylightTrack = segmentedRow('title-segmented');
    for (const mode of DAYLIGHT_MODES) {
      const control = daylightControl(mode);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'title-small';
      button.textContent = control.label;
      button.title = control.tooltip;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => this.apply({ daylight: mode }));
      this.daylightButtons.set(mode, button);
      this.daylightTrack.appendChild(button);
    }
    this.root.appendChild(this.daylightTrack);

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

    // La stagione sta **dopo** il cielo e in un gruppo suo, e non e' un
    // dettaglio di impaginazione: gli altri tre sono look — si cambiano in
    // partita senza che la citta' se ne accorga — mentre questo decide da dove
    // parte il calendario, e quindi anche quanto rende il primo raccolto.
    this.root.appendChild(titleGroup('Season'));
    this.seasonTrack = segmentedRow('title-segmented');
    for (const season of SEASONS) {
      const control = seasonControl(season);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'title-small';
      button.textContent = control.label;
      button.title = control.birthTooltip;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => this.apply({ season }));
      this.seasonButtons.set(season, button);
      this.seasonTrack.appendChild(button);
    }
    this.root.appendChild(this.seasonTrack);

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
    for (const [season, button] of this.seasonButtons) {
      button.setAttribute('aria-pressed', season === this.look.season ? 'true' : 'false');
    }
    this.cloudsButton.setAttribute('aria-pressed', this.look.clouds ? 'true' : 'false');
    paintSegmented(this.daylightTrack);
    paintSegmented(this.seasonTrack);
  }
}
