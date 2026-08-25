import type { OverviewFact, OverviewGoal } from './CityOverviewModel';
import { createHudIcon } from './hudIcons';

/**
 * I mattoni condivisi dai cassetti di destra.
 *
 * I due cassetti — la dashboard e le policy — condividono intestazione, righe
 * dei fatti e barre dei traguardi; prima di separarli stavano tutti dentro
 * `PolicyDrawer.ts`, e separarli significa decidere dove vive ogni pezzo. Qui
 * vivono quelli che **non** sanno se stanno dipingendo una lettura o un'azione:
 * sono solo superficie, e non tengono stato.
 */

export interface DrawerHeaderOptions {
  readonly title: string;
  readonly subtitle?: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
}

/**
 * L'intestazione di un cassetto: titolo, sottotitolo e croce.
 *
 * La croce c'e' sempre, anche dove prima si chiudeva ripremendo il bottone del
 * dock: un pannello che si apre con un bottone e si chiude solo con un altro
 * gesto chiede di ricordare due modi diversi per la stessa porta. La croce e'
 * l'unico gesto che non si deve imparare.
 */
export function drawerHeader(options: DrawerHeaderOptions): HTMLElement {
  const header = document.createElement('header');
  header.className = 'drawer-header';

  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'drawer-title';
  title.textContent = options.title;
  copy.appendChild(title);
  if (options.subtitle !== undefined) {
    const subtitle = document.createElement('p');
    subtitle.className = 'drawer-subtitle';
    subtitle.textContent = options.subtitle;
    copy.appendChild(subtitle);
  }

  const actions = document.createElement('div');
  actions.className = 'drawer-header-actions';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'drawer-close';
  close.setAttribute('aria-label', options.closeLabel);
  close.title = options.closeLabel;
  close.appendChild(createHudIcon('close'));
  close.addEventListener('click', options.onClose);
  actions.appendChild(close);

  header.append(copy, actions);
  return header;
}

export function sectionTitle(value: string): HTMLElement {
  const title = document.createElement('h3');
  title.className = 'drawer-section-title';
  title.textContent = value;
  return title;
}

export function note(value: string): HTMLElement {
  const message = document.createElement('p');
  message.className = 'drawer-note';
  message.textContent = value;
  return message;
}

/** Una sezione della dashboard: un'intestazione e le sue cifre sotto. */
export function overviewSection(title: string, content: HTMLElement): HTMLElement {
  const section = document.createElement('section');
  section.className = 'overview-section';
  const heading = document.createElement('h3');
  heading.className = 'overview-section-title';
  heading.textContent = title;
  section.append(heading, content);
  return section;
}

/** I traguardi come barre: quanto se ne ha contro quanto ne serve. */
export function goalRows(goals: readonly OverviewGoal[]): HTMLElement {
  const rows = document.createElement('div');
  rows.className = 'goal-list';
  for (const goal of goals) {
    const row = document.createElement('div');
    row.className = 'goal-row';
    row.dataset.met = goal.met ? 'true' : 'false';
    const label = document.createElement('span');
    label.textContent = goal.label;
    const value = document.createElement('strong');
    value.textContent = goal.value;
    const track = document.createElement('span');
    track.className = 'goal-track';
    const fill = document.createElement('span');
    fill.className = 'goal-fill';
    fill.style.width = `${Math.round(goal.progress * 100)}%`;
    track.appendChild(fill);
    row.append(label, value, track);
    rows.appendChild(row);
  }
  return rows;
}

/** Una griglia di fatti: etichetta sopra, valore sotto, tono al colore. */
export function factRows(facts: readonly OverviewFact[]): HTMLElement {
  const rows = document.createElement('div');
  rows.className = 'overview-facts';
  for (const fact of facts) {
    const row = document.createElement('div');
    row.className = 'overview-fact';
    row.dataset.tone = fact.tone ?? 'neutral';
    const label = document.createElement('span');
    label.textContent = fact.label;
    const value = document.createElement('strong');
    value.textContent = fact.value;
    row.append(label, value);
    if (fact.note !== undefined) {
      const detail = document.createElement('small');
      detail.textContent = fact.note;
      row.appendChild(detail);
    }
    rows.appendChild(row);
  }
  return rows;
}
