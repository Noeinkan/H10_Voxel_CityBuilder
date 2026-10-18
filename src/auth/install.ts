/**
 * Monta la porta d'accesso e la lascia lavorare.
 *
 * E' il solo file di `src/auth/` che tocca il documento, ed esiste perche'
 * `boot.ts` resti quello che e' — l'ingresso che decide **quando** nasce il
 * mondo — invece di diventare anche il posto dove si costruiscono una decina di
 * oggetti. Da qui escono due cose sole: la promessa che si e' pronti, e la
 * domanda «si entra?» da rifare al momento del «Play».
 *
 * **Il ciclo chiuso e' questo:** la schermata chiama il `gate`, il `gate` chiama
 * il servizio, il servizio chiama il database, e la risposta ridiscende fino
 * alla schermata. Nessuno di questi passaggi decide da solo chi entra.
 */

import { AuthGate } from './AuthGate';
import { AuthScreen, type AuthScreenHandlers } from './AuthScreen';
import { TrialBadge } from './TrialBadge';
import { authGateDisabled, readAuthConfig } from './config';
import { createSupabaseBackend } from './supabaseBackend';

export interface AuthGateHandle {
  /**
   * L'ultima parola prima che il mondo nasca.
   *
   * `false` vuol dire che la schermata e' gia' cambiata sotto gli occhi di chi
   * ha premuto: la prova e' finita, e non c'e' niente da caricare.
   */
  canEnterWorld(): Promise<boolean>;
}

/** La schermata d'emergenza quando il build non ha le chiavi: non c'e' niente da premere. */
const INERT: AuthScreenHandlers = {
  onSignIn: () => undefined,
  onSignUp: () => undefined,
  onSendReset: () => undefined,
  onSetPassword: () => undefined,
  onResend: () => undefined,
  onRecheck: () => undefined,
  onSignOut: () => undefined,
  onRequestAccess: () => undefined,
  onOpenPane: () => undefined,
};

/**
 * @param onAllowed chi ha diritto e' stato riconosciuto: si puo' mostrare il
 * menu del titolo. **Puo' arrivare dopo**, quando qualcuno si registra o entra
 * mentre la pagina e' gia' aperta, ed e' per questo che e' una richiamata e non
 * un valore di ritorno.
 */
export async function installAuthGate(onAllowed: () => void): Promise<AuthGateHandle> {
  // Le due variabili si nominano qui, esplicitamente, invece di passare tutto
  // `import.meta.env`: cosi' l'elenco di cio' che questo build legge dal
  // servizio e' una riga sola, visibile, e non l'intero ambiente di Vite.
  const env = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_AUTH_GATE: import.meta.env.VITE_AUTH_GATE,
  };

  if (authGateDisabled(env)) {
    // Nessuna porta: si entra subito. L'attesa di un giro serve a `boot.ts`,
    // che legge la promessa restituita qui dentro `onAllowed`: chiamarlo prima
    // che la promessa esista lo farebbe inciampare sulla propria costante.
    await Promise.resolve();
    onAllowed();
    return { canEnterWorld: () => Promise.resolve(true) };
  }

  const config = readAuthConfig(env);

  if (config === null) {
    // Senza chiavi non si costruisce nessuna porta: si dice che manca, e non si
    // lascia credere che un modulo possa funzionare.
    const screen = new AuthScreen(INERT);
    screen.paint({ pane: 'unconfigured', busy: false, note: null, warn: false, email: '' });
    document.body.appendChild(screen.root);
    return { canEnterWorld: () => Promise.resolve(false) };
  }

  // Il badge vive quanto la pagina e non appartiene a nessuna schermata: e'
  // l'unica cosa che deve sopravvivere al passaggio dal titolo alla partita.
  const badge = new TrialBadge();
  document.body.appendChild(badge.root);

  const gate = new AuthGate(createSupabaseBackend(config), {
    onAllowed,
    onAccess: (state) => badge.paint(state),
  });

  const screen = new AuthScreen({
    onSignIn: (email, password) => void gate.signIn(email, password),
    onSignUp: (email, password) => void gate.signUp(email, password),
    onSendReset: (email) => void gate.sendReset(email),
    onSetPassword: (password) => void gate.setNewPassword(password),
    onResend: () => void gate.resendVerification(),
    onRecheck: () => void gate.recheck(),
    onSignOut: () => void gate.signOut(),
    onRequestAccess: (kind, message) => void gate.requestAccess(kind, message),
    onOpenPane: (pane) => gate.openPane(pane),
  });

  // La schermata si attacca **dopo** il gate: il gate non la conosce alla
  // costruzione, e cosi' non c'e' nessun anello fra i due.
  gate.attach(screen);
  document.body.appendChild(screen.root);

  await gate.begin();
  screen.focus();

  return { canEnterWorld: () => gate.canEnterWorld() };
}
