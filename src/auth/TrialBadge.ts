/**
 * Il tempo rimasto, mentre si gioca.
 *
 * Sta **in alto al centro** perche' e' l'unica banda che l'HUD si e' tenuta
 * libera: i rail stanno ai lati, le risorse in cima al rail, il pannello di
 * debug in basso, e il commento che lo dichiara e' in `hud.css` («la banda alta
 * al centro resta alla citta'»). Un badge messo li' non copre niente che
 * qualcuno stia gia' guardando.
 *
 * Non sa niente dell'accesso: riceve uno stato gia' deciso da `AuthGate` e si
 * limita a scriverlo. E' anche l'unico punto in cui il numero dei secondi
 * diventa una stringa.
 */

import { formatCountdown, type AccessState } from './access';
import './authScreen.css';

export class TrialBadge {
  readonly root: HTMLElement;

  private readonly label: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'auth-badge';
    this.root.hidden = true;

    this.label = document.createElement('span');
    this.label.className = 'auth-badge-text';
    // `status` e non un `alert`: cambia una volta al secondo, e annunciarlo a
    // ogni battito renderebbe la pagina inutilizzabile con un lettore di
    // schermo. Cosi' viene letto quando ci si passa sopra.
    this.label.setAttribute('role', 'status');
    this.root.appendChild(this.label);
  }

  /**
   * Nessun conto alla rovescia per l'accesso beta: e' il criterio «l'utente vede
   * lo stato beta e non il conto alla rovescia», ed e' anche la verita' — a chi
   * non scade niente non serve sapere quanto manca.
   */
  paint(state: AccessState): void {
    if (state.kind === 'trial') {
      this.show('trial', `Trial ${formatCountdown(state.secondsLeft)}`);
      return;
    }
    if (state.kind === 'unlimited') {
      this.show('beta', 'Beta access · no time limit');
      return;
    }
    this.root.hidden = true;
  }

  private show(kind: string, text: string): void {
    this.root.hidden = false;
    this.root.dataset['kind'] = kind;
    this.label.textContent = text;
  }
}
