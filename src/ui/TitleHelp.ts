import {
  CONTROL_HINTS,
  DEMOLISH_HINTS,
  DEMOLISH_HINTS_LEAD,
  VIEW_HINTS,
  VIEW_HINTS_LEAD,
  type ControlHint,
} from './ControlsHint';
import { titleGroup, titleNote } from './titleBits';

/**
 * I comandi sul titolo: si leggono **prima** di aver sbagliato il primo gesto.
 *
 * **Il testo non e' una seconda copia.** Le tre tabelle arrivano da
 * `ControlsHint.ts`, che e' la stessa fonte della card di benvenuto e della
 * sezione Help nel menu di pausa: quello che cambia qui e' solo il disegno.
 * Ridisegnare invece di riusare `helpSections()` non e' un capriccio — quella
 * versione parla il vocabolario di `hud.css`, che sono novantaquattro kilobyte
 * di foglio scritti per una partita in corso, e caricarli davanti alla scelta
 * rimetterebbe il peso del gioco prima della domanda.
 */
export function titleHelpPane(): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'title-pane';

  const title = document.createElement('h2');
  title.className = 'title-pane-title';
  title.textContent = 'Controls';
  pane.appendChild(title);
  pane.appendChild(hintList(CONTROL_HINTS));

  pane.appendChild(group('Look inside the city', VIEW_HINTS_LEAD));
  // Le viste non hanno un tasto: hanno un nome e un gesto, e il nome e' il
  // termine. Passarle da `hintList` metterebbe una frase intera dentro un `kbd`,
  // cioe' direbbe che si preme.
  pane.appendChild(viewList());

  pane.appendChild(group('Clear the city', DEMOLISH_HINTS_LEAD));
  pane.appendChild(hintList(DEMOLISH_HINTS));

  return pane;
}

/** Un titoletto con la riga che dice a cosa serve il gruppo. */
function group(label: string, lead: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(titleGroup(label), titleNote(lead));
  return wrap;
}

/** Le viste: come si chiamano, e come si puntano. */
function viewList(): HTMLElement {
  const list = document.createElement('dl');
  list.className = 'title-hints title-hints--views';
  for (const view of VIEW_HINTS) {
    const name = document.createElement('dt');
    name.textContent = view.label;
    const gesture = document.createElement('dd');
    gesture.textContent = view.gesture;
    list.append(name, gesture);
  }
  return list;
}

function hintList(hints: readonly ControlHint[]): HTMLElement {
  const list = document.createElement('dl');
  list.className = 'title-hints';
  for (const hint of hints) {
    const keys = document.createElement('dt');
    // I tasti sono `kbd` e non testo: e' l'unico elemento che dice «questo si
    // preme», e chi legge lo schermo lo annuncia come tale.
    for (const key of hint.keys) {
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      keys.appendChild(kbd);
    }
    const action = document.createElement('dd');
    action.textContent = hint.action;
    list.append(keys, action);
  }
  return list;
}
