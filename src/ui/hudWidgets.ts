import type { HudAction } from './GameHudModel';
import { createHudIcon, type HudIcon } from './hudIcons';
import { buildActionTip, tipElement, tipText, type HudTip } from './hudTip';
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
  // Niente `data-tooltip`: la bolla di una riga sola resta a chi ha una riga
  // sola da dire, e queste azioni hanno una scheda intera. Gliela appende
  // `paintAction`, che e' anche l'unico posto che sa se sono bloccate.
  const button = labeledButton(icon, action.label, null, onClick);
  const copy = button.querySelector('.button-copy');
  const cost = document.createElement('span');
  cost.className = 'button-cost';
  // L'icona della risorsa accanto alla cifra, non la parola: il costo si legge
  // come si legge la barra in alto, e le due superfici parlano la stessa lingua.
  cost.append(createHudIcon('funds'), document.createTextNode(String(action.cost)));
  if (action.materialCost !== undefined) {
    cost.append(
      document.createTextNode(' · '),
      createHudIcon('materials'),
      document.createTextNode(String(action.materialCost)),
    );
  }
  copy?.appendChild(cost);
  button.setAttribute('aria-pressed', 'false');
  return button;
}

/**
 * Un'azione come **tile**: icona sopra, etichetta sotto, misura fissa.
 *
 * La fila di bottoni larghi quanto la loro parola faceva del dock un elenco; una
 * griglia di tessere uguali si conta a colpo d'occhio, ed e' cio' che permette
 * al tasto numerico di significare qualcosa.
 */
export function tileButton(
  action: HudAction,
  icon: HudIcon,
  key: string | null,
  onClick: () => void,
): HTMLButtonElement {
  const button = actionButton(action, icon, onClick);
  button.classList.add('hud-tile');
  if (key !== null) {
    const badge = document.createElement('span');
    badge.className = 'hud-tile-key';
    badge.textContent = key;
    badge.setAttribute('aria-hidden', 'true');
    button.appendChild(badge);
  }
  return button;
}

/**
 * Il clic col **mouse** non lascia il fuoco sul bottone.
 *
 * `:focus-visible` non e' solo la navigazione da tastiera: il browser lo
 * riaccende sull'elemento gia' a fuoco appena arriva un tasto qualsiasi, e qui
 * ogni tasto e' una scorciatoia sul mondo — WASD, `V`, `L`, le cifre del dock.
 * Bastava quindi scegliere uno strumento e poi muovere la camera perche' la
 * bolla del tooltip si aprisse sopra l'ultima tessera cliccata e non si
 * chiudesse **mai** piu': niente la riguardava, e il fuoco restava li'.
 *
 * `detail` distingue i due gesti — 0 e' Enter o Spazio — perche' a chi naviga da
 * tastiera il fuoco va lasciato dov'e', o il dock diventa intraversabile. E'
 * anche cio' che toglie di mezzo lo Spazio che ricliccava l'ultimo bottone
 * mentre la mano era sul mondo.
 */
function onActivate(button: HTMLButtonElement, onClick: () => void): void {
  button.addEventListener('click', (event) => {
    // Un'azione ancora bloccata resta raggiungibile: il fuoco apre la scheda
    // che spiega requisito e avanzamento, ma il gesto non arriva al mondo.
    if (button.getAttribute('aria-disabled') === 'true') {
      button.focus();
      return;
    }
    if (event.detail > 0) button.blur();
    onClick();
  });
}

export function labeledButton(
  icon: HudIcon,
  label: string,
  tooltip: string | null,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button';
  if (tooltip !== null) button.dataset.tooltip = tooltip;
  button.setAttribute('aria-label', label);
  button.appendChild(createHudIcon(icon));
  const copy = document.createElement('span');
  copy.className = 'button-copy';
  const text = document.createElement('span');
  text.textContent = label;
  copy.appendChild(text);
  button.appendChild(copy);
  onActivate(button, onClick);
  return button;
}

export function iconButton(icon: HudIcon, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button hud-button--icon';
  button.dataset.tooltip = label;
  button.setAttribute('aria-label', label);
  button.appendChild(createHudIcon(icon));
  onActivate(button, onClick);
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
  onActivate(button, onClick);
  return button;
}

export function paintAction(button: HTMLButtonElement | undefined, action: HudAction): void {
  if (button === undefined) return;
  // `disabled` toglierebbe il bottone dall'ordine di tabulazione e impedirebbe
  // proprio di leggere perche' non e' ancora disponibile. `aria-disabled`
  // comunica lo stesso stato senza nascondere la spiegazione.
  button.disabled = false;
  button.setAttribute('aria-disabled', action.available ? 'false' : 'true');
  // Bloccato ma visibile: il bottone resta al suo posto e cambia solo stato,
  // cosi' la toolbar non si riordina sotto il dito mentre i fondi salgono.
  button.dataset.locked = action.locked === true ? 'true' : 'false';
  // Il riempimento e' una custom property e non una classe: il CSS la legge in
  // una `calc()`, quindi la barra avanza da sola a ogni ripittura senza che
  // nessuno debba decidere delle soglie.
  if (action.progress === undefined) {
    button.style.removeProperty('--hud-progress');
    delete button.dataset.requirement;
    delete button.dataset.requirementShort;
  } else {
    button.style.setProperty('--hud-progress', action.progress.toFixed(3));
    button.dataset.requirement = action.requirement ?? '';
    // Le due cifre nude vanno sotto la tessera, dove la frase intera finiva
    // sopra il costo; la frase resta nel tooltip.
    button.dataset.requirementShort = action.requirementShort ?? '';
  }
  paintTip(button, buildActionTip(action));
}

/**
 * La scheda del bottone, **rifatta solo quando cambia**.
 *
 * Il dock si ridipinge sei volte al secondo e la scheda cambia una volta ogni
 * tanto — quando i fondi scavalcano il prezzo, o quando il tutorial si sposta.
 * Ricostruirne dodici a ogni giro sarebbe un rumore di DOM che nessuno guarda,
 * e cancellerebbe la bolla proprio sotto il puntatore di chi la sta leggendo.
 */
const paintedTips = new WeakMap<HTMLElement, string>();
let tipSerial = 0;

function paintTip(button: HTMLButtonElement, tip: HudTip): void {
  const key = tipText(tip);
  if (paintedTips.get(button) === key) return;
  paintedTips.set(button, key);

  button.querySelector('.hud-tip')?.remove();
  const element = tipElement(tip);
  tipSerial += 1;
  element.id = `hud-tip-${tipSerial}`;
  // Il bottone porta gia' il nome in `aria-label`: la scheda e' cio' che lo
  // *descrive*, ed e' l'unico modo perche' chi non la vede la senta comunque.
  button.setAttribute('aria-describedby', element.id);
  button.appendChild(element);
}

/**
 * Quanti nomi entrano in un elenco prima di diventare un conteggio.
 *
 * Tre e' quanti se ne ricordano leggendo; il diciassettesimo nome del monumento
 * non informava nessuno — allungava una riga che a quel punto si saltava
 * intera, e con lei le due righe utili che le stavano sotto.
 */
const TIP_LIST_MAX = 3;

/**
 * Un elenco che si accorcia da solo: i primi nomi, poi quanti ne restano.
 *
 * Resta qui per la scheda al cursore, che e' una riga sola dentro una pastiglia
 * stretta. La scheda del dock ha la sua — `nameList` in `hudTip.ts` — perche'
 * li' l'elenco sta dentro una frase e la coda va detta a parole.
 */
export function shortList(items: readonly string[], separator = ', '): string {
  const rest = items.length - TIP_LIST_MAX;
  const shown = items.slice(0, TIP_LIST_MAX).join(separator);
  return rest > 0 ? `${shown}, +${rest} more` : shown;
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
