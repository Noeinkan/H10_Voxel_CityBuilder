import type { LandscapeOptions } from '../world/terrain/region';
import { seedNote } from './TitleScreenModel';
import { IslandPreview } from './IslandPreview';

type Feature = 'mountains' | 'valleys' | 'lakes';
const FEATURES = [
  { key: 'mountains', name: 'Mountains', description: 'Raise the skyline with extra peaks.', choices: ['Low', 'High', 'Alpine'] },
  { key: 'valleys', name: 'Valleys', description: 'Open broad corridors through the high ground.', choices: ['None', 'One', 'Two'] },
  { key: 'lakes', name: 'Inland lakes', description: 'Add freshwater among the hills.', choices: ['None', 'Some', 'More'] },
] as const;

/** Le stesse scelte e la stessa carta nelle due porte verso un'isola nuova. */
export class IslandConfigurator {
  readonly root: HTMLElement;
  readonly preview = new IslandPreview();

  private readonly field: HTMLInputElement;
  private readonly hint: HTMLElement;
  private readonly choices: Record<Feature, 0 | 1 | 2>;
  private onChange: (() => void) | null = null;

  constructor(landscape: LandscapeOptions, private readonly onRoll: () => number) {
    this.choices = {
      mountains: landscape.mountains,
      valleys: landscape.valleys,
      lakes: landscape.lakes,
    };
    this.root = document.createElement('div');
    this.root.className = 'island-configurator';

    const controls = document.createElement('div');
    controls.className = 'island-configurator__controls';
    const seedLabel = document.createElement('label');
    seedLabel.className = 'island-configurator__label';
    seedLabel.htmlFor = 'island-seed';
    seedLabel.textContent = 'Island seed';
    const row = document.createElement('div');
    row.className = 'title-row';
    this.field = document.createElement('input');
    this.field.id = 'island-seed';
    this.field.type = 'text';
    this.field.className = 'title-field';
    this.field.inputMode = 'numeric';
    this.field.placeholder = 'Enter a seed';
    this.field.addEventListener('input', () => this.paint());
    const roll = document.createElement('button');
    roll.type = 'button';
    roll.className = 'title-small island-configurator__roll';
    roll.textContent = 'Surprise me';
    roll.addEventListener('click', () => {
      this.field.value = String(this.onRoll());
      this.paint();
    });
    row.append(this.field, roll);
    this.hint = document.createElement('p');
    this.hint.className = 'title-note island-configurator__hint';
    this.hint.setAttribute('aria-live', 'polite');
    controls.append(seedLabel, row, this.hint);

    for (const feature of FEATURES) {
      const section = document.createElement('section');
      section.className = 'island-configurator__feature';
      const heading = document.createElement('div');
      heading.className = 'island-configurator__feature-heading';
      const name = document.createElement('h3');
      name.textContent = feature.name;
      const description = document.createElement('p');
      description.textContent = feature.description;
      heading.append(name, description);
      const group = document.createElement('div');
      group.className = 'island-configurator__choices';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', feature.name);
      const buttons: HTMLButtonElement[] = [];
      feature.choices.forEach((label, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('aria-pressed', String(index === this.choices[feature.key]));
        button.addEventListener('click', () => {
          this.choices[feature.key] = index as 0 | 1 | 2;
          buttons.forEach((item, value) => item.setAttribute('aria-pressed', String(value === index)));
          this.paint();
        });
        buttons.push(button);
        group.appendChild(button);
      });
      section.append(heading, group);
      controls.appendChild(section);
    }
    const map = document.createElement('div');
    map.className = 'island-configurator__map';
    const mapHeading = document.createElement('div');
    mapHeading.className = 'island-configurator__map-heading';
    const mapTitle = document.createElement('span');
    mapTitle.textContent = 'LIVE ISLAND PREVIEW';
    const compass = document.createElement('span');
    compass.textContent = 'N ↑';
    mapHeading.append(mapTitle, compass);
    const legend = document.createElement('div');
    legend.className = 'island-configurator__legend';
    for (const [kind, label] of [['water', 'Water'], ['lowland', 'Lowland'], ['highland', 'Highland'], ['rock', 'Rock']] as const) {
      const item = document.createElement('span');
      item.className = `island-configurator__legend-item island-configurator__legend-item--${kind}`;
      item.textContent = label;
      legend.appendChild(item);
    }
    map.append(mapHeading, this.preview.root, legend);
    this.root.append(controls, map);
    this.field.value = String(this.onRoll());
    this.hint.textContent = seedNote(this.field.value).note;
  }

  setChangeHandler(handler: () => void): void {
    this.onChange = handler;
  }

  setSubmitHandler(handler: () => void): void {
    this.field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') handler();
    });
  }

  focus(): void {
    this.fillSeed();
    this.field.focus();
    this.field.select();
  }

  read(): { seed: number | null; invalid: boolean; landscape: LandscapeOptions } {
    const { seed, invalid } = seedNote(this.field.value);
    return { seed, invalid, landscape: { ...this.choices } };
  }

  stop(): void {
    this.preview.stop();
  }

  private fillSeed(): void {
    if (this.field.value.trim() === '') this.field.value = String(this.onRoll());
    this.paint();
  }

  private paint(): void {
    const { seed, invalid, note } = seedNote(this.field.value);
    this.hint.textContent = note;
    this.preview.update(invalid ? null : seed, this.choices);
    this.onChange?.();
  }
}
