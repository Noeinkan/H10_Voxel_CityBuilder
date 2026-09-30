/**
 * La porta d'accesso in DOM puro, vestita da `titleScreen.css`.
 *
 * E' la terza superficie che indossa quel foglio, ed e' deliberato: chi apre il
 * link e chi apre il gioco vedono la stessa aria, lo stesso marchio e gli stessi
 * bottoni grandi. Quel foglio si carica **prima** del bundle del mondo, che e'
 * esattamente il momento in cui questa schermata esiste.
 *
 * Come `TitleScreen`, non decide niente: riceve un `AuthGateViewState` gia'
 * risolto e chiama gesti. Chi sa se si entra e' `AuthGate`.
 *
 * **Le sottoschermate si costruiscono una volta e si accendono.** Ricostruirle a
 * ogni `paint` sarebbe piu' corto da scrivere e sbagliato da usare: ogni
 * ridisegno — e ce n'e' uno a ogni giro di rete — butterebbe via quello che la
 * persona ha scritto nel campo.
 */

import { verifyNote, expiredNote, type AuthPane } from './AuthScreenModel';
import type { AuthGateView, AuthGateViewState } from './AuthGate';
import { titleSmall } from '../ui/titleBits';
import { TITLE_NAME, TITLE_TAGLINE } from '../ui/TitleScreenModel';
import './authScreen.css';

export interface AuthScreenHandlers {
  readonly onSignIn: (email: string, password: string) => void;
  readonly onSignUp: (email: string, password: string) => void;
  readonly onSendReset: (email: string) => void;
  readonly onSetPassword: (password: string) => void;
  readonly onResend: () => void;
  readonly onRecheck: () => void;
  readonly onSignOut: () => void;
  readonly onRequestAccess: (kind: 'beta' | 'deletion', message: string) => void;
  readonly onOpenPane: (pane: AuthPane) => void;
}

/** Quanto dura la dissolvenza; deve restare uguale alla transizione nel CSS. */
const FADE_MS = 420;

/** Il tetto del messaggio, uguale al vincolo della tabella. */
const MESSAGE_MAX = 2000;

export class AuthScreen implements AuthGateView {
  readonly root: HTMLElement;

  private readonly inner: HTMLElement;
  private readonly panes = new Map<AuthPane, HTMLElement>();
  private readonly note: HTMLElement;
  // Solo i campi che `paint` deve toccare: gli altri li tiene la chiusura del
  // gesto che li legge, ed e' li' che si vedono senza doppioni.
  private readonly signInEmail: HTMLInputElement;
  private readonly signUpEmail: HTMLInputElement;
  private readonly resetEmail: HTMLInputElement;
  private readonly verifyNote: HTMLElement;
  private readonly expiredNote: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private leaving: Promise<void> = Promise.resolve();
  private shown = true;

  constructor(private readonly handlers: AuthScreenHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'title-screen title-screen--sky auth-screen';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', `${TITLE_NAME} — sign in`);

    this.inner = document.createElement('div');
    this.inner.className = 'title-inner';
    this.root.appendChild(this.inner);

    const wordmark = document.createElement('h1');
    wordmark.className = 'title-wordmark';
    wordmark.textContent = TITLE_NAME;
    const tagline = document.createElement('p');
    tagline.className = 'title-tagline';
    tagline.textContent = TITLE_TAGLINE;
    this.inner.append(wordmark, tagline);

    const checking = this.buildChecking();
    this.panes.set('checking', checking);

    const signIn = this.buildSignIn();
    this.signInEmail = signIn.querySelector('[data-role="email"]') as HTMLInputElement;
    this.panes.set('signIn', signIn);

    const signUp = this.buildSignUp();
    this.signUpEmail = signUp.querySelector('[data-role="email"]') as HTMLInputElement;
    this.panes.set('signUp', signUp);

    const reset = this.buildResetRequest();
    this.resetEmail = reset.querySelector('[data-role="email"]') as HTMLInputElement;
    this.panes.set('resetRequest', reset);

    this.panes.set('newPassword', this.buildNewPassword());

    const verify = this.buildVerify();
    this.verifyNote = verify.querySelector('[data-role="verify-note"]') as HTMLElement;
    this.panes.set('verify', verify);

    const expired = this.buildExpired();
    this.expiredNote = expired.querySelector('[data-role="expired-note"]') as HTMLElement;
    this.panes.set('expired', expired);

    this.panes.set('unconfigured', this.buildUnconfigured());

    // Una riga sola per tutti gli esiti: sta sotto la sottoschermata invece che
    // dentro, cosi' non si duplica in ognuna e non sparisce cambiando campo.
    this.note = document.createElement('p');
    this.note.className = 'title-note auth-note';
    this.note.setAttribute('role', 'status');

    const foot = document.createElement('div');
    foot.className = 'title-foot';
    const privacy = document.createElement('span');
    privacy.textContent = 'We store your email to run the trial and to answer you.';
    foot.appendChild(privacy);

    for (const [, pane] of this.panes) this.inner.appendChild(pane);
    this.inner.append(this.note, foot);
  }

  paint(state: AuthGateViewState): void {
    // Nessuna schermata imposta, e non e' ancora stata tolta: si sfuma. Il
    // mondo si carica sotto mentre questa se ne va, come fa il titolo.
    if (state.pane === null) {
      void this.leave();
      return;
    }
    this.revive();
    this.leaving = Promise.resolve();

    for (const [id, element] of this.panes) element.hidden = id !== state.pane;

    this.note.textContent = state.note ?? '';
    this.note.hidden = state.note === null;
    this.note.dataset['warn'] = state.warn ? 'true' : 'false';

    if (state.pane === 'verify') this.verifyNote.textContent = verifyNote(state.email);
    if (state.pane === 'expired') this.expiredNote.textContent = expiredNote(state.email);

    // L'indirizzo si precompila, non si sovrascrive: chi l'ha gia' scritto non
    // se lo vede riscrivere sotto le dita a ogni giro di rete.
    this.prefill(this.signInEmail, state.email);
    this.prefill(this.signUpEmail, state.email);
    this.prefill(this.resetEmail, state.email);

    // Anche i bottoni piccoli si spengono: durante un giro di rete un secondo
    // clic su «Send it again» manderebbe una seconda email identica.
    for (const button of this.buttons) button.disabled = state.busy;
    this.root.dataset['busy'] = state.busy ? 'true' : 'false';
  }

  /** Il fuoco al primo campo: si entra da tastiera, e da tastiera si comincia li'. */
  focus(): void {
    const pane = [...this.panes].find(([, element]) => !element.hidden)?.[1];
    pane?.querySelector<HTMLElement>('input, textarea')?.focus();
  }

  async fadeOut(): Promise<void> {
    await this.leave();
  }

  /**
   * La schermata torna, se n'era andata.
   *
   * Serve perche' `leave()` **rimuove** l'elemento: quando la prova finisce
   * mentre si gioca, questa schermata deve ricomparire sopra una partita viva, e
   * un elemento staccato dal documento non si vede per quanto lo si accenda.
   */
  private revive(): void {
    if (this.root.isConnected) {
      this.root.hidden = false;
      this.shown = true;
      return;
    }
    // Si rientra da opacity 0 e la si toglie solo dopo un ricalcolo: senza
    // quello il browser vede un elemento gia' visibile e la comparsa non viene
    // animata — la schermata sbatterebbe davanti a chi sta giocando.
    this.root.dataset['leaving'] = 'true';
    this.root.hidden = false;
    document.body.appendChild(this.root);
    void this.root.offsetHeight;
    delete this.root.dataset['leaving'];
    this.shown = true;
  }

  private leave(): Promise<void> {
    if (!this.shown) return this.leaving;
    this.shown = false;
    this.root.dataset['leaving'] = 'true';
    this.leaving = new Promise((resolve) => {
      window.setTimeout(() => {
        this.root.remove();
        resolve();
      }, FADE_MS);
    });
    return this.leaving;
  }

  private prefill(input: HTMLInputElement, email: string): void {
    if (input.value === '' && email !== '') input.value = email;
  }

  private buildChecking(): HTMLElement {
    const pane = document.createElement('div');
    pane.className = 'title-pane auth-pane';
    const waiting = document.createElement('div');
    waiting.className = 'title-loading';
    const spinner = document.createElement('div');
    spinner.className = 'title-spinner';
    const label = document.createElement('span');
    label.textContent = 'Checking your session…';
    label.setAttribute('role', 'status');
    waiting.append(spinner, label);
    pane.appendChild(waiting);
    return pane;
  }

  /**
     * Un campo con la sua etichetta.
     *
     * L'etichetta e' un `label` vero e non un segnaposto: il segnaposto sparisce
     * appena si comincia a scrivere, e chi usa una password lunga non vede piu'
     * quale campo sta compilando.
     */
  private field(
    pane: HTMLElement,
    label: string,
    role: 'email' | 'password',
    autocomplete: AutoFill,
  ): HTMLInputElement {
    const wrap = document.createElement('label');
    wrap.className = 'auth-field';
    const text = document.createElement('span');
    text.className = 'auth-label';
    text.textContent = label;
    const input = document.createElement('input');
    input.className = 'title-field';
    input.type = role === 'password' ? 'password' : 'email';
    input.autocomplete = autocomplete;
    input.dataset['role'] = role;
    wrap.append(text, input);
    pane.appendChild(wrap);
    return input;
  }

  private primary(pane: HTMLElement, label: string, act: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'title-button title-button--primary';
    const span = document.createElement('span');
    span.className = 'title-label';
    span.textContent = label;
    button.appendChild(span);
    button.addEventListener('click', act);
    this.buttons.push(button);
    pane.appendChild(button);
    return button;
  }

  /** Un gesto secondario, che si spegne anche lui mentre la rete lavora. */
  private small(pane: HTMLElement, label: string, act: () => void): HTMLButtonElement {
    const button = titleSmall(label, act);
    this.buttons.push(button);
    pane.appendChild(button);
    return button;
  }

  private p(title: string, note?: string): HTMLElement {
    const pane = document.createElement('div');
    pane.className = 'title-pane auth-pane';
    const heading = document.createElement('h2');
    heading.className = 'title-pane-title';
    heading.textContent = title;
    pane.appendChild(heading);
    if (note !== undefined) {
      const line = document.createElement('p');
      line.className = 'title-note';
      line.textContent = note;
      pane.appendChild(line);
    }
    return pane;
  }

  private buildSignIn(): HTMLElement {
    const pane = this.p('Enter the city');
    const email = this.field(pane, 'Email', 'email', 'email');
    const password = this.field(pane, 'Password', 'password', 'current-password');
    const submit = (): void => this.handlers.onSignIn(email.value, password.value);
    this.primary(pane, 'Sign in', submit);
    const row = document.createElement('div');
    row.className = 'auth-row';
    pane.appendChild(row);
    this.small(row, 'Create an account', () => this.handlers.onOpenPane('signUp'));
    this.small(row, 'Forgot your password?', () => this.handlers.onOpenPane('resetRequest'));
    this.submitOnEnter(pane, submit);
    return pane;
  }

  private buildSignUp(): HTMLElement {
    const pane = this.p(
      'Create an account',
      'You will get a confirmation link by email. The city opens once you have clicked it.',
    );
    const email = this.field(pane, 'Email', 'email', 'email');
    const password = this.field(pane, 'Password', 'password', 'new-password');
    const hint = document.createElement('p');
    hint.className = 'title-note';
    hint.textContent = 'At least 8 characters.';
    pane.appendChild(hint);
    const submit = (): void => this.handlers.onSignUp(email.value, password.value);
    this.primary(pane, 'Create account', submit);
    this.small(pane, 'Back to sign in', () => this.handlers.onOpenPane('signIn'));
    this.submitOnEnter(pane, submit);
    return pane;
  }

  private buildResetRequest(): HTMLElement {
    const pane = this.p('Reset your password', 'We will email you a link to choose a new one.');
    const email = this.field(pane, 'Email', 'email', 'email');
    const submit = (): void => this.handlers.onSendReset(email.value);
    this.primary(pane, 'Send reset link', submit);
    this.small(pane, 'Back to sign in', () => this.handlers.onOpenPane('signIn'));
    this.submitOnEnter(pane, submit);
    return pane;
  }

  private buildNewPassword(): HTMLElement {
    const pane = this.p('Choose a new password');
    const password = this.field(pane, 'New password', 'password', 'new-password');
    const hint = document.createElement('p');
    hint.className = 'title-note';
    hint.textContent = 'At least 8 characters.';
    pane.appendChild(hint);
    const submit = (): void => this.handlers.onSetPassword(password.value);
    this.primary(pane, 'Save password', submit);
    this.submitOnEnter(pane, submit);
    return pane;
  }

  private buildVerify(): HTMLElement {
    const pane = this.p('Confirm your email');
    const note = document.createElement('p');
    note.className = 'title-note';
    note.dataset['role'] = 'verify-note';
    pane.appendChild(note);
    this.small(pane, 'Send it again', () => this.handlers.onResend());
    this.small(pane, 'I have confirmed — continue', () => this.handlers.onRecheck());
    this.small(pane, 'Use a different account', () => this.handlers.onSignOut());
    return pane;
  }

  private buildExpired(): HTMLElement {
    const pane = this.p('Your trial is over');
    const note = document.createElement('p');
    note.className = 'title-note';
    note.dataset['role'] = 'expired-note';
    const explain = document.createElement('p');
    explain.className = 'title-note';
    explain.textContent =
      'Ask for beta access and you can keep playing without a limit, on this same account.';
    pane.append(note, explain);

    const wrap = document.createElement('label');
    wrap.className = 'auth-field';
    const label = document.createElement('span');
    label.className = 'auth-label';
    label.textContent = 'Anything you want to add (optional)';
    const message = document.createElement('textarea');
    message.className = 'title-field auth-textarea';
    message.rows = 3;
    message.maxLength = MESSAGE_MAX;
    message.dataset['role'] = 'message';
    wrap.append(label, message);
    pane.appendChild(wrap);

    this.primary(pane, 'Request beta access', () =>
      this.handlers.onRequestAccess('beta', message.value));
    this.small(pane, 'Sign out', () => this.handlers.onSignOut());
    // La cancellazione chiede, non esegue: a cancellare e' il proprietario, e
    // una richiesta senza messaggio basta — l'indirizzo lo mette il server.
    this.small(pane, 'Ask for my account to be deleted', () =>
      this.handlers.onRequestAccess('deletion', ''));
    return pane;
  }

  private buildUnconfigured(): HTMLElement {
    return this.p(
      'Sign-in is not set up',
      'This build has no Supabase project behind it, so there is no way to open an account. ' +
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and build again.',
    );
  }

  /** Invio nel campo vuol dire «manda», come premere il bottone grande. */
  private submitOnEnter(pane: HTMLElement, submit: () => void): void {
    pane.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (this.root.dataset['busy'] === 'true') return;
      submit();
    });
  }
}
