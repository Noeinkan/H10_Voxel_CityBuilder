import type { LandscapeOptions } from '../world/terrain/region';
import { IslandConfigurator } from './IslandConfigurator';
import { titleNote } from './titleBits';

export interface NewGameHandlers {
  readonly onStart: (seed: number, landscape: LandscapeOptions) => void;
  readonly onRoll: () => number;
}

/** Il menu di pausa usa la stessa configurazione del titolo, con conferma dell'autosalvataggio. */
export class MainMenuNewGame {
  readonly root: HTMLElement;

  private readonly configurator: IslandConfigurator;
  private readonly start: HTMLButtonElement;
  private readonly startLabel: HTMLElement;
  private readonly confirm: HTMLElement;
  private arming = false;

  constructor(private readonly handlers: NewGameHandlers, landscape: LandscapeOptions) {
    this.root = document.createElement('div');
    this.root.className = 'title-section island-configurator__section';
    this.configurator = new IslandConfigurator(landscape, () => handlers.onRoll());
    this.root.appendChild(this.configurator.root);

    this.confirm = titleNote(
      'This replaces the autosave. Your three manual slots stay.',
    );
    this.confirm.dataset['warn'] = 'true';
    this.root.appendChild(this.confirm);

    this.start = document.createElement('button');
    this.start.type = 'button';
    this.start.className = 'title-button title-button--primary';
    this.startLabel = document.createElement('span');
    this.startLabel.className = 'title-label';
    this.start.appendChild(this.startLabel);
    this.start.addEventListener('click', () => this.press());
    this.root.appendChild(this.start);
    this.configurator.setChangeHandler(() => {
      this.arming = false;
      this.paint();
    });
    this.paint();
  }

  reset(): void {
    this.arming = false;
    this.configurator.stop();
    this.paint();
  }

  focus(): void {
    this.configurator.focus();
  }

  private press(): void {
    const { seed, invalid, landscape } = this.configurator.read();
    if (invalid) return;
    if (!this.arming) {
      this.arming = true;
      this.paint();
      return;
    }
    this.handlers.onStart(seed ?? this.handlers.onRoll(), landscape);
  }

  private paint(): void {
    this.start.disabled = this.configurator.read().invalid;
    this.startLabel.textContent = this.arming ? 'Confirm: start over' : 'Create island';
    this.start.dataset['armed'] = String(this.arming);
    this.confirm.hidden = !this.arming;
  }
}
