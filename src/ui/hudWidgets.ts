import type { HudAction } from './GameHudModel';
import { createHudIcon, type HudIcon } from './hudIcons';
import type { ViewKeyHint } from './ViewMenuModel';

/**
 * I mattoni DOM dell'HUD.
 *
 * Nessuno di questi tocca lo stato del pannello: entrano etichetta, icona e un
 * callback, esce un elemento. Stavano in coda a `GameHud.ts` e ne sono usciti
 * perche' erano gia' separati in tutto tranne che nel file — ed e' il file che
 * decide chi aspetta chi, quando due agenti lavorano sullo stesso HUD.
 */
export function actionButton(action: HudAction, icon: HudIcon, onClick: () => void): HTMLButtonElement {
  const button = labeledButton(icon, action.label, action.reason, onClick);
  const copy = button.querySelector('.button-copy');
  const cost = document.createElement('span');
  cost.className = 'button-cost';
  cost.textContent = `${action.cost} funds`;
  copy?.appendChild(cost);
  button.setAttribute('aria-pressed', 'false');
  return button;
}

export function labeledButton(icon: HudIcon, label: string, tooltip: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button';
  button.dataset.tooltip = tooltip;
  button.setAttribute('aria-label', label);
  button.appendChild(createHudIcon(icon));
  const copy = document.createElement('span');
  copy.className = 'button-copy';
  const text = document.createElement('span');
  text.textContent = label;
  copy.appendChild(text);
  button.appendChild(copy);
  button.addEventListener('click', onClick);
  return button;
}

export function iconButton(icon: HudIcon, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button hud-button--icon';
  button.dataset.tooltip = label;
  button.setAttribute('aria-label', label);
  button.appendChild(createHudIcon(icon));
  button.addEventListener('click', onClick);
  return button;
}

export function textButton(label: string, tooltip: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button';
  button.textContent = label;
  button.dataset.tooltip = tooltip;
  button.setAttribute('aria-label', tooltip);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', onClick);
  return button;
}

export function paintAction(button: HTMLButtonElement | undefined, action: HudAction): void {
  if (button === undefined) return;
  button.disabled = !action.available;
  // Bloccato ma visibile: il bottone resta al suo posto e cambia solo stato,
  // cosi' la toolbar non si riordina sotto il dito mentre i fondi salgono.
  button.dataset.locked = action.locked === true ? 'true' : 'false';
  button.dataset.tooltip = actionTooltip(action);
  button.title = actionTooltip(action);
}

/** Motivo dell'azione, piu' cio' che quel ruolo favorisce e puo' far nascere. */
export function actionTooltip(action: HudAction): string {
  const lines = [action.reason];
  // Subito dopo il motivo e prima di tutto il resto: un vincolo di sito cambia
  // *dove* si clicca, e leggerlo in fondo all'elenco vorrebbe dire leggerlo
  // dopo aver gia' scelto il punto.
  if (action.site !== undefined) lines.push(action.site);
  if (action.radius !== undefined) lines.push(`Radius ${action.radius}`);
  if (action.favours !== undefined && action.favours.length > 0) {
    lines.push(`Favours: ${action.favours.join(', ')}`);
  }
  if (action.penalises !== undefined && action.penalises.length > 0) {
    lines.push(`Penalises: ${action.penalises.join(', ')}`);
  }
  if (action.typologies !== undefined && action.typologies.length > 0) {
    lines.push(`May build: ${action.typologies.join(', ')}`);
  }
  return lines.join(' · ');
}

/** Una riga etichettata della scheda al cursore. */
export function cursorLine(label: string, value: string): HTMLElement {
  const line = document.createElement('span');
  line.className = 'cursor-line';
  const name = document.createElement('em');
  name.textContent = `${label}: `;
  line.append(name, document.createTextNode(value));
  return line;
}

/** Una riga di tasti della targa: i capitasti a sinistra, cosa fanno a destra. */
export function viewKeyRow(hint: ViewKeyHint): HTMLElement {
  const row = document.createElement('div');
  row.className = 'view-bar-key';
  const caps = document.createElement('span');
  caps.className = 'view-bar-caps';
  for (const label of hint.keys) {
    const key = document.createElement('kbd');
    key.textContent = label;
    caps.appendChild(key);
  }
  const action = document.createElement('span');
  action.textContent = hint.action;
  row.append(caps, action);
  return row;
}

/** Bottone di testo della targa: niente icona, perche' e' la parola che conta. */
export function barButton(label: string, tooltip: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'view-bar-button';
  button.textContent = label;
  // `title` e non `data-tooltip`: la bolla del dock e' legata a `.hud-button`, e
  // qui la parola sul bottone dice gia' quasi tutto.
  button.title = tooltip;
  button.setAttribute('aria-label', tooltip);
  button.addEventListener('click', onClick);
  return button;
}

export function divider(): HTMLElement {
  const element = document.createElement('span');
  element.className = 'dock-divider';
  element.setAttribute('aria-hidden', 'true');
  return element;
}
