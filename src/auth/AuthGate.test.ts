import { describe, expect, it, vi } from 'vitest';
import { SIGNED_OUT, type AccessSnapshot, type AccessState } from './access';
import { AuthGate, type AuthGateView, type AuthGateViewState } from './AuthGate';
import type { AccessRequestKind, AuthBackend, AuthEvent, SignUpOutcome } from './backend';

const EMAIL = 'persona@esempio.com';

function snapshot(overrides: Partial<AccessSnapshot> = {}): AccessSnapshot {
  return {
    authenticated: true,
    email: EMAIL,
    emailVerified: true,
    betaUnlimited: false,
    secondsLeft: 2700,
    ...overrides,
  };
}

/**
 * Il servizio finto: risponde quello che il test decide, e annota ogni chiamata.
 *
 * L'elenco delle chiamate e' la meta' del valore di questi test — parecchie
 * delle cose che devono succedere qui sono «non chiamare affatto».
 */
class FakeBackend implements AuthBackend {
  sessionValue: AccessSnapshot = SIGNED_OUT;
  trialValue: AccessSnapshot = snapshot();
  signInValue: AccessSnapshot | null = null;
  trialError: unknown = null;
  sessionError: unknown = null;
  /** Il messaggio arrivato con l'ultima richiesta: `null` quando era vuoto. */
  lastMessage: string | null | undefined = undefined;
  readonly calls: string[] = [];
  private listeners: ((event: AuthEvent) => void)[] = [];

  async session(): Promise<AccessSnapshot> {
    this.calls.push('session');
    if (this.sessionError !== null) throw this.sessionError;
    return this.sessionValue;
  }

  async signUp(): Promise<SignUpOutcome> {
    this.calls.push('signUp');
    return { needsVerification: true };
  }

  async resendVerification(): Promise<void> {
    this.calls.push('resend');
  }

  async signIn(): Promise<AccessSnapshot> {
    this.calls.push('signIn');
    return this.signInValue ?? this.sessionValue;
  }

  async signOut(): Promise<void> {
    this.calls.push('signOut');
    this.sessionValue = SIGNED_OUT;
  }

  async sendPasswordReset(): Promise<void> {
    this.calls.push('reset');
  }

  async updatePassword(): Promise<void> {
    this.calls.push('password');
  }

  async startTrial(): Promise<AccessSnapshot> {
    this.calls.push('startTrial');
    if (this.trialError !== null) throw this.trialError;
    return this.trialValue;
  }

  refresh(): Promise<AccessSnapshot> {
    return this.session();
  }

  async requestAccess(kind: AccessRequestKind, message: string | null): Promise<void> {
    this.calls.push(`request:${kind}`);
    this.lastMessage = message;
  }

  watch(listener: (event: AuthEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  emit(event: AuthEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

class FakeView implements AuthGateView {
  readonly states: AuthGateViewState[] = [];

  paint(state: AuthGateViewState): void {
    this.states.push({ ...state });
  }

  get last(): AuthGateViewState {
    return this.states[this.states.length - 1] as AuthGateViewState;
  }
}

/** Il battito del cronometro, mosso a mano: un test non aspetta un secondo. */
function manualTicker(): {
  readonly schedule: (tick: () => void) => () => void;
  fire: () => void;
  armed: () => boolean;
} {
  let tick: (() => void) | null = null;
  return {
    schedule: (fn) => {
      tick = fn;
      return () => {
        tick = null;
      };
    },
    fire: () => tick?.(),
    armed: () => tick !== null,
  };
}

function harness(options: { readonly startState?: AccessSnapshot } = {}): {
  readonly backend: FakeBackend;
  readonly view: FakeView;
  readonly gate: AuthGate;
  readonly allowedCount: () => number;
  readonly announced: AccessState[];
  readonly ticker: ReturnType<typeof manualTicker>;
  advance: (ms: number) => void;
} {
  const backend = new FakeBackend();
  if (options.startState !== undefined) backend.sessionValue = options.startState;
  const view = new FakeView();
  const ticker = manualTicker();
  let allowed = 0;
  const announced: AccessState[] = [];
  let clock = 0;

  const gate = new AuthGate(
    backend,
    {
      onAllowed: () => {
        allowed += 1;
      },
      onAccess: (state) => {
        announced.push(state);
      },
    },
    { now: () => clock, schedule: ticker.schedule },
  );
  gate.attach(view);

  return {
    backend,
    view,
    gate,
    allowedCount: () => allowed,
    announced,
    ticker,
    advance: (ms) => {
      clock += ms;
    },
  };
}

describe('begin', () => {
  it('senza sessione mostra il modulo e non fa comparire il menu', async () => {
    const h = harness();
    await h.gate.begin();

    expect(h.allowedCount()).toBe(0);
    expect(h.view.last.pane).toBe('signIn');
    expect(h.ticker.armed()).toBe(false);
  });

  it('con una prova viva lascia passare e conta dalla risposta del server', async () => {
    const h = harness({ startState: snapshot({ secondsLeft: 2700 }) });
    await h.gate.begin();

    expect(h.allowedCount()).toBe(1);
    expect(h.view.last.pane).toBeNull();
    expect(h.ticker.armed()).toBe(true);
    expect(h.announced).toContainEqual({ kind: 'trial', secondsLeft: 2700 });
  });

  it('con la prova finita mostra la richiesta beta e non lascia passare', async () => {
    const h = harness({ startState: snapshot({ secondsLeft: 0 }) });
    await h.gate.begin();

    expect(h.allowedCount()).toBe(0);
    expect(h.view.last.pane).toBe('expired');
    expect(h.view.last.email).toBe(EMAIL);
  });

  it('con l indirizzo non confermato manda alla posta', async () => {
    const h = harness({ startState: snapshot({ emailVerified: false }) });
    await h.gate.begin();

    expect(h.allowedCount()).toBe(0);
    expect(h.view.last.pane).toBe('verify');
  });

  it('con l accesso beta lascia passare senza nessun conto alla rovescia', async () => {
    // Il criterio e' «l'utente vede lo stato beta e non il conto alla rovescia»:
    // a chi non scade niente non si mostra un tempo che scorre.
    const h = harness({ startState: snapshot({ betaUnlimited: true }) });
    await h.gate.begin();

    expect(h.allowedCount()).toBe(1);
    expect(h.view.last.pane).toBeNull();
    expect(h.ticker.armed()).toBe(false);
    expect(h.announced).toContainEqual({ kind: 'unlimited' });
  });

  it('se il server non risponde si riprova dal modulo, non da una pagina bianca', async () => {
    const h = harness();
    h.backend.sessionError = { status: 0 };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await h.gate.begin();

    expect(h.view.last.pane).toBe('signIn');
    expect(h.view.last.warn).toBe(true);
    expect(h.view.last.note).toContain('connection');
    expect(h.allowedCount()).toBe(0);
    quiet.mockRestore();
  });
});

describe('canEnterWorld', () => {
  it('accende la prova al primo Play e lascia entrare', async () => {
    const h = harness({ startState: snapshot({ secondsLeft: null }) });
    await h.gate.begin();
    expect(h.allowedCount()).toBe(1);

    const entered = await h.gate.canEnterWorld();

    expect(entered).toBe(true);
    expect(h.backend.calls).toContain('startTrial');
    expect(h.ticker.armed()).toBe(true);
  });

  it('non conta i minuti per conto suo: ripete quello che dice il server', async () => {
    // La scadenza e' del database, non di questa classe. Qui si verifica
    // soltanto che il gate non se la fabbrichi per conto suo: due «Play» di
    // fila e il numero mostrato e' ancora quello del servizio, non uno
    // calcolato qui. Che due «Play» non sommino minuti e' scritto nella
    // migration, dove `on conflict do update` non tocca la scadenza.
    const h = harness({ startState: snapshot({ secondsLeft: 300 }) });
    h.backend.trialValue = snapshot({ secondsLeft: 240 });
    await h.gate.begin();

    await h.gate.canEnterWorld();
    h.advance(60_000);
    await h.gate.canEnterWorld();

    const trials = h.announced.filter((state) => state.kind === 'trial');
    expect(trials.at(-1)).toEqual({ kind: 'trial', secondsLeft: 240 });
  });

  it('su un account scaduto non lascia entrare, e mostra la richiesta beta', async () => {
    // E' il criterio d'accettazione: chi ha finito i minuti non rientra, e non
    // c'e' nessun percorso che glielo permetta.
    const h = harness({ startState: snapshot({ secondsLeft: null }) });
    h.backend.trialValue = snapshot({ secondsLeft: 0 });
    await h.gate.begin();

    const entered = await h.gate.canEnterWorld();

    expect(entered).toBe(false);
    expect(h.view.last.pane).toBe('expired');
    expect(h.ticker.armed()).toBe(false);
  });

  it('se la sessione e caduta nel frattempo rimanda al modulo', async () => {
    const h = harness({ startState: snapshot({ secondsLeft: 900 }) });
    await h.gate.begin();
    h.backend.trialError = { code: 'not_authenticated' };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const entered = await h.gate.canEnterWorld();

    expect(entered).toBe(false);
    expect(h.view.last.note).toContain('session is no longer valid');
    quiet.mockRestore();
  });
});

describe('il cronometro', () => {
  it('scende, e allo zero fa ricomparire la schermata sopra la partita', async () => {
    const h = harness({ startState: snapshot({ secondsLeft: 2 }) });
    await h.gate.begin();
    expect(h.allowedCount()).toBe(1);

    h.advance(1_000);
    h.ticker.fire();
    expect(h.announced.at(-1)).toEqual({ kind: 'trial', secondsLeft: 1 });
    expect(h.view.last.pane).toBeNull();

    h.advance(1_000);
    h.ticker.fire();

    // La prova e' finita mentre si giocava: la stessa schermata che si vedrebbe
    // ricaricando la pagina, e nessun modo di continuare.
    expect(h.view.last.pane).toBe('expired');
    expect(h.ticker.armed()).toBe(false);
  });

  it('un orologio che salta avanti non allunga la prova', async () => {
    const h = harness({ startState: snapshot({ secondsLeft: 60 }) });
    await h.gate.begin();

    h.advance(3_600_000);
    h.ticker.fire();

    expect(h.view.last.pane).toBe('expired');
  });
});

describe('i moduli', () => {
  it('un indirizzo senza chiocciola non fa partire nessuna chiamata', async () => {
    const h = harness();
    await h.gate.begin();
    const before = h.backend.calls.length;

    await h.gate.signIn('senza-chiocciola', 'password-lunga');

    expect(h.backend.calls.length).toBe(before);
    expect(h.view.last.warn).toBe(true);
    expect(h.view.last.note).not.toBeNull();
  });

  it('un accesso rifiutato racconta il rifiuto senza citare il server', async () => {
    const h = harness();
    await h.gate.begin();
    h.backend.signIn = async () => {
      throw { code: 'invalid_credentials', message: 'Invalid login credentials' };
    };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await h.gate.signIn(EMAIL, 'password-lunga');

    expect(h.view.last.note).toContain('do not match');
    expect(h.view.last.note).not.toContain('Invalid login credentials');
    quiet.mockRestore();
  });

  it('una registrazione manda alla verifica invece di far entrare', async () => {
    // Senza la conferma via email non c'e' sessione: credere di essere entrati
    // qui vorrebbe dire mostrare un mondo che il server non ha autorizzato.
    const h = harness();
    await h.gate.begin();

    await h.gate.signUp(EMAIL, 'password-lunga');

    expect(h.view.last.pane).toBe('verify');
    expect(h.allowedCount()).toBe(0);
  });

  it('il link di reimpostazione porta a scegliere la password nuova', async () => {
    const h = harness();
    await h.gate.begin();

    h.backend.emit('recovery');

    expect(h.view.last.pane).toBe('newPassword');
    expect(h.allowedCount()).toBe(0);
  });

  it('la richiesta di accesso beta lascia una richiesta e lo conferma', async () => {
    const h = harness({ startState: snapshot({ secondsLeft: 0 }) });
    await h.gate.begin();

    await h.gate.requestAccess('beta', '  Vorrei provare la città  ');

    expect(h.backend.calls).toContain('request:beta');
    expect(h.backend.lastMessage).toBe('Vorrei provare la città');
    expect(h.view.last.warn).toBe(false);
    expect(h.view.last.note).toContain('Request sent');
  });

  it('un messaggio vuoto resta vuoto invece di diventare una riga di spazi', async () => {
    // La colonna `message` ammette NULL e non la stringa vuota: lasciare degli
    // spazi farebbe sembrare che qualcuno abbia scritto qualcosa.
    const h = harness({ startState: snapshot({ secondsLeft: 0 }) });
    await h.gate.begin();

    await h.gate.requestAccess('deletion', '   ');

    expect(h.backend.calls).toContain('request:deletion');
    expect(h.backend.lastMessage).toBeNull();
  });
});
