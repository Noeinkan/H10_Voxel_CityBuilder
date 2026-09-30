/**
 * Il buttafuori: chi entra, quando, e cosa vede chi aspetta.
 *
 * E' l'unico posto che decide, e non disegna niente — riceve una `AuthGateView`
 * e le dice cosa mostrare. Cosi' la logica che conta, cioe' l'ordine dei
 * controlli e il momento in cui parte la prova, si prova in `node` con una
 * schermata finta e un servizio finto.
 *
 * **La prova parte al «Play», non all'accesso.** Chi apre la pagina, entra e
 * resta a guardare il menu non consuma minuti: la prima chiamata a
 * `canEnterWorld` e' il momento in cui il mondo nasce, ed e' li' che si accende
 * il cronometro. E' anche l'unico punto in cui si poteva metterlo senza
 * inventare un secondo «via» accanto a quello che gia' esiste.
 *
 * **Il conto alla rovescia si ancora alla risposta del server**, non all'ora del
 * computer: `startClock` conserva quanti secondi restavano e l'istante in cui il
 * server l'ha detto, e da li' si conta con un cronometro che nessuno puo'
 * spostare. Vedi `access.ts`.
 */

import {
  SIGNED_OUT,
  accessState,
  clockSecondsLeft,
  startClock,
  type AccessSnapshot,
  type AccessState,
  type TrialClock,
} from './access';
import {
  authErrorText,
  authPaneFor,
  emailProblem,
  passwordProblem,
  type AuthPane,
} from './AuthScreenModel';
import { asAuthError, type AuthBackend, type AuthEvent } from './backend';

/** Cio' che la schermata deve disegnare adesso. */
export interface AuthGateViewState {
  /** La schermata da mostrare; `null` quando si e' lasciato passare. */
  readonly pane: AuthPane | null;
  /** Un giro di rete e' in corso: i bottoni si spengono, il modulo resta. */
  readonly busy: boolean;
  /** Un esito da leggere: un rifiuto, o la conferma che una email e' partita. */
  readonly note: string | null;
  /** `true` quando la nota e' un problema e non un'informazione. */
  readonly warn: boolean;
  /** L'indirizzo in gioco, per le schermate che lo nominano. */
  readonly email: string;
}

export interface AuthGateView {
  paint(state: AuthGateViewState): void;
}

export interface AuthGateHandlers {
  /** Si e' dentro, una volta sola: e' il momento di mostrare il menu del titolo. */
  readonly onAllowed: () => void;
  /**
   * Lo stato e' cambiato, o e' passato un secondo di prova.
   *
   * Un canale solo, e sempre lo stato intero: il conto alla rovescia lo disegna
   * chi ascolta, ma a sapere se c'e' una prova da contare e' questa classe. Due
   * canali separati — «e' cambiato qualcosa» e «quanto resta» — si
   * disallineerebbero al primo caso limite.
   */
  readonly onAccess: (state: AccessState) => void;
}

export interface AuthGateOptions {
  /** Il cronometro monotono. Iniettabile perche' i test non aspettano davvero. */
  readonly now?: () => number;
  /** Un battito al secondo; restituisce la funzione che lo ferma. */
  readonly schedule?: (tick: () => void) => () => void;
}

const defaultSchedule = (tick: () => void): (() => void) => {
  const id = setInterval(tick, 1000);
  return () => {
    clearInterval(id);
  };
};

export class AuthGate {
  private view: AuthGateView | null = null;
  private state: AccessState = { kind: 'signedOut' };
  private pane: AuthPane | null = 'checking';
  private busy = true;
  private note: string | null = null;
  private warn = false;
  private email = '';

  private clock: TrialClock | null = null;
  private cancelTick: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  /** `onAllowed` si annuncia una volta sola, e non a ogni rinnovo di token. */
  private allowed = false;
  /** Finche' `begin()` non ha finito, i cambiamenti di sessione sono rumore. */
  private ready = false;

  private readonly now: () => number;
  private readonly schedule: (tick: () => void) => () => void;

  constructor(
    private readonly backend: AuthBackend,
    private readonly handlers: AuthGateHandlers,
    options: AuthGateOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.schedule = options.schedule ?? defaultSchedule;
  }

  attach(view: AuthGateView): void {
    this.view = view;
    this.paint();
  }

  /**
   * La prima lettura: chi c'e', e se puo' passare.
   *
   * Non lancia. Un guasto di rete all'apertura non e' un motivo per lasciare
   * una pagina bianca: diventa una nota sulla schermata d'accesso, che e' il
   * posto da cui si puo' riprovare.
   */
  async begin(): Promise<void> {
    this.pane = 'checking';
    this.busy = true;
    this.paint();

    try {
      const snapshot = await this.backend.session();
      this.apply(snapshot);
    } catch (error) {
      console.error('[auth] session', error);
      this.pane = 'signIn';
      this.note = authErrorText(asAuthError(error));
      this.warn = true;
    } finally {
      this.busy = false;
      this.ready = true;
      this.paint();
    }

    this.unsubscribe = this.backend.watch((event) => {
      void this.onAuthEvent(event);
    });
  }

  /**
   * Il «Play»: accende la prova se non c'e', e dice se si entra.
   *
   * `startTrial` e' idempotente lato database, quindi chiedere qui non sposta
   * niente per chi ha gia' consumato i suoi minuti — e' proprio il caso che deve
   * restare fermo.
   */
  async canEnterWorld(): Promise<boolean> {
    if (this.state.kind === 'signedOut' || this.state.kind === 'unverified') {
      // La sessione e' caduta mentre si era sulla schermata del titolo.
      const pane = this.imposedPane(this.state);
      if (pane !== null) this.showPane(pane);
      return false;
    }

    let allowed = false;
    await this.run(async () => {
      const snapshot = await this.backend.startTrial();
      this.apply(snapshot);
      allowed = this.state.kind === 'trial' || this.state.kind === 'unlimited';
    });
    return allowed;
  }

  async signIn(email: string, password: string): Promise<void> {
    if (this.fieldProblem(email, password) !== null) return;
    await this.run(async () => {
      this.apply(await this.backend.signIn(email.trim(), password));
    });
  }

  async signUp(email: string, password: string): Promise<void> {
    if (this.fieldProblem(email, password) !== null) return;
    await this.run(async () => {
      this.email = email.trim();
      const outcome = await this.backend.signUp(this.email, password);
      if (!outcome.needsVerification) {
        this.apply(await this.backend.session());
        return;
      }
      // Registrarsi non fa entrare nessuno: crea un account in attesa, senza
      // sessione. Lo stato si scrive qui invece di fabbricare una risposta del
      // server — «in attesa» non e' un lavoro che il server abbia fatto, e
      // fingerne una sarebbe il modo piu' rapido per far divergere le due cose.
      this.state = { kind: 'unverified' };
      this.showPane('verify');
    });
  }

  async resendVerification(): Promise<void> {
    if (this.formProblem(emailProblem(this.email)) !== null) return;
    await this.run(async () => {
      await this.backend.resendVerification(this.email);
      this.note = 'Confirmation email sent again. It can take a minute to arrive.';
      this.warn = false;
    });
  }

  async sendReset(email: string): Promise<void> {
    if (this.formProblem(emailProblem(email)) !== null) return;
    await this.run(async () => {
      await this.backend.sendPasswordReset(email.trim());
      // La risposta e' la stessa anche se l'indirizzo non ha un account: dirlo
      // diversamente rivelerebbe chi ce l'ha.
      this.pane = 'signIn';
      this.note = 'If that address has an account, a reset link is on its way.';
      this.warn = false;
    });
  }

  async setNewPassword(password: string): Promise<void> {
    if (this.formProblem(passwordProblem(password)) !== null) return;
    await this.run(async () => {
      await this.backend.updatePassword(password);
      this.apply(await this.backend.session());
    });
  }

  /**
   * «Ho cliccato il link nella email, fammi entrare.»
   *
   * Rilegge dal server invece di credere a un bottone: la conferma e' avvenuta
   * su un'altra pagina, e l'unica cosa che sa se e' successa davvero e' il
   * database.
   */
  async recheck(): Promise<void> {
    await this.run(async () => {
      this.apply(await this.backend.session());
    });
  }

  async signOut(): Promise<void> {
    await this.run(async () => {
      await this.backend.signOut();
      // `apply` basta: da disconnessi la schermata d'accesso e' quella imposta.
      this.apply(SIGNED_OUT);
    });
  }

  /** Lascia una richiesta al proprietario: accesso beta o cancellazione. */
  async requestAccess(kind: 'beta' | 'deletion', message: string): Promise<void> {
    await this.run(async () => {
      await this.backend.requestAccess(kind, message.trim() === '' ? null : message.trim());
      this.note = kind === 'beta'
        ? 'Request sent. You will hear back at the address on this account.'
        : 'Deletion request sent. Your account will be removed by hand.';
      this.warn = false;
    });
  }

  /**
   * Cambia sottoschermata fra quelle che si scelgono: accesso, registrazione,
   * recupero. La nota precedente se ne va con lei — apparteneva all'altra.
   */
  openPane(pane: AuthPane): void {
    if (this.busy) return;
    this.pane = pane;
    this.note = null;
    this.warn = false;
    this.paint();
  }

  dispose(): void {
    this.stopTicker();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Lo stato in vigore, per chi disegna il conto alla rovescia. */
  get current(): AccessState {
    return this.state;
  }

  private async onAuthEvent(event: AuthEvent): Promise<void> {
    if (!this.ready) return;
    if (event === 'recovery') {
      // Si arriva qui dal link nella email: c'e' una sessione, ma la password
      // che si conosce e' quella vecchia e va cambiata prima di entrare.
      this.pane = 'newPassword';
      this.busy = false;
      this.note = 'Choose a new password for this account.';
      this.warn = false;
      this.paint();
      return;
    }
    if (event === 'tokenRefreshed') return;

    try {
      this.apply(await this.backend.session());
    } catch (error) {
      console.error('[auth] session', error);
    }
  }

  private apply(snapshot: AccessSnapshot): void {
    this.state = accessState(snapshot);
    this.email = snapshot.email ?? this.email;
    this.note = null;
    this.warn = false;

    const pane = this.imposedPane(this.state);
    if (pane !== null) {
      this.showPane(pane);
      return;
    }

    this.pane = null;
    if (this.state.kind === 'trial') {
      this.startTicker(this.state.secondsLeft);
    } else {
      this.stopTicker();
    }
    this.handlers.onAccess(this.state);

    if (!this.allowed) {
      this.allowed = true;
      this.handlers.onAllowed();
    }
  }

  /**
   * La schermata che uno stato impone.
   *
   * `authPaneFor` risponde `null` per «non ne impone nessuna», che per uno stato
   * di passaggio va bene; per chi non e' collegato no, perche' senza sessione
   * non c'e' niente da mostrare dietro e la scelta e' fra accesso e
   * registrazione. Qui si comincia dall'accesso, che e' la meta' piu' probabile.
   */
  private imposedPane(state: AccessState): AuthPane | null {
    if (state.kind === 'signedOut') return 'signIn';
    return authPaneFor(state);
  }

  private showPane(pane: AuthPane): void {
    this.stopTicker();
    this.handlers.onAccess(this.state);
    this.pane = pane;
    this.paint();
  }

  private startTicker(secondsLeft: number): void {
    this.stopTicker();
    this.clock = startClock(secondsLeft, this.now());
    this.cancelTick = this.schedule(() => this.tick());
  }

  private stopTicker(): void {
    this.cancelTick?.();
    this.cancelTick = null;
    this.clock = null;
  }

  /**
   * Un secondo di prova e' passato.
   *
   * Allo zero la schermata torna a coprire tutto: e' lo stesso pannello che si
   * vede ricaricando la pagina dopo la scadenza, quindi non c'e' una seconda
   * strada da tenere allineata — e chi sta giocando se lo trova davanti.
   */
  private tick(): void {
    if (this.clock === null) return;
    const left = clockSecondsLeft(this.clock, this.now());
    if (left > 0) {
      this.handlers.onAccess({ kind: 'trial', secondsLeft: left });
      return;
    }

    this.stopTicker();
    this.state = { kind: 'expired' };
    this.showPane('expired');
  }

  /**
   * Un giro di lavoro con la schermata impegnata.
   *
   * Il testo del guasto non si butta: va in console, dove serve a chi ripara, e
   * a schermo arriva la stessa notizia in una frase leggibile. Vedi
   * `authErrorText`.
   */
  private async run(work: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.note = null;
    this.warn = false;
    this.paint();
    try {
      await work();
    } catch (error) {
      console.error('[auth]', error);
      this.note = authErrorText(asAuthError(error));
      this.warn = true;
      if (this.pane === null || this.pane === 'checking') this.pane = 'signIn';
    } finally {
      this.busy = false;
      this.paint();
    }
  }

  /** Convalida locale del modulo, e la nota che ne segue. `null` se va bene. */
  private fieldProblem(email: string, password: string): string | null {
    return this.formProblem(emailProblem(email) ?? passwordProblem(password));
  }

  private formProblem(problem: string | null): string | null {
    if (problem === null) return null;
    this.note = problem;
    this.warn = true;
    this.paint();
    return problem;
  }

  private paint(): void {
    this.view?.paint({
      pane: this.pane,
      busy: this.busy,
      note: this.note,
      warn: this.warn,
      email: this.email,
    });
  }
}
