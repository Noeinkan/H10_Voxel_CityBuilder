/**
 * La porta d'accesso in TypeScript puro: quali schermate esistono, cosa si
 * puo' scrivere nei campi, e come si racconta un rifiuto del server.
 *
 * Sta separato da `AuthScreen.ts` per la stessa ragione di `TitleScreenModel`:
 * qui non c'e' DOM, quindi si prova in `node` — e le parti che sbagliano davvero
 * sono queste, non la costruzione degli elementi.
 *
 * Tutte le stringhe sono in inglese perche' finiscono a schermo.
 */

import type { AccessState } from './access';

/**
 * Le schermate della porta.
 *
 * `checking` e' quella d'ingresso e non e' decorativa: fra l'apertura della
 * pagina e la risposta del server c'e' un giro di rete, e senza di lei si
 * vedrebbe una pagina bianca che sembra rotta.
 */
export type AuthPane =
  | 'checking'
  | 'signIn'
  | 'signUp'
  | 'resetRequest'
  | 'newPassword'
  | 'verify'
  | 'expired'
  | 'unconfigured';

/**
 * Sotto questa lunghezza il server rifiuta comunque (impostazione del
 * progetto), e fermarsi prima evita un giro di rete per un errore che si vede
 * da qui. E' **piu' severa** del minimo predefinito di Supabase: una regola
 * locale piu' stretta non puo' mai accettare qualcosa che il server rifiuta.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Dove si entra data la situazione.
 *
 * `null` vuol dire «nessuna schermata imposta»: chi ha diritto passa oltre e
 * vede il menu del titolo, chi non ne ha una la sceglie — dentro e fuori
 * l'account.
 */
export function authPaneFor(state: AccessState): AuthPane | null {
  switch (state.kind) {
    case 'unverified':
      return 'verify';
    case 'expired':
      return 'expired';
    case 'signedOut':
    case 'ready':
    case 'trial':
    case 'unlimited':
      return null;
  }
}

/**
 * Un indirizzo accettabile.
 *
 * Deliberatamente permissiva: la posta e' complicata e un controllo severo
 * rifiuta indirizzi veri. Serve a prendere il refuso evidente — la chiocciola
 * dimenticata, il punto mancante — non a decidere chi ha diritto a un indirizzo.
 * L'unica prova che conta e' il messaggio di conferma che arriva.
 */
export function emailProblem(email: string): string | null {
  const value = email.trim();
  if (value === '') return 'Enter your email address.';
  if (/\s/.test(value)) return 'An email address cannot contain spaces.';
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return 'That does not look like an email address.';
  const domain = value.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return 'That does not look like an email address.';
  }
  return null;
}

export function passwordProblem(password: string): string | null {
  if (password === '') return 'Enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * Cio' che il server puo' rispondere male.
 *
 * Il tipo e' strutturale e non importa `AuthError` di Supabase: cosi' questa
 * funzione si prova con due litterali, e il resto del client non si porta dietro
 * la libreria per parlare di un errore.
 */
export interface AuthErrorLike {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
  readonly message?: string | undefined;
}

/**
 * Il rifiuto del server detto a una persona.
 *
 * **Il testo del server non passa.** E' scritto per chi sviluppa, cambia fra
 * versioni e in qualche caso racconta com'e' fatto il progetto; quello che si
 * legge qui e' la stessa notizia in una frase che si puo' capire. Il testo
 * originale resta nella console, dove serve.
 */
export function authErrorText(error: AuthErrorLike | null | undefined): string {
  if (error === null || error === undefined) return 'Something went wrong. Try again.';

  // `status: 0` e' la libreria che non ha potuto parlare affatto: rete assente,
  // DNS, o richiesta bloccata. E' il caso piu' frequente ed e' l'unico che
  // conviene dire con precisione, perche' la persona puo' rimediare.
  if (error.status === 0) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  switch (error.code) {
    case 'invalid_credentials':
      return 'That email and password do not match an account.';
    case 'email_not_confirmed':
      return 'Confirm your email address first — the link is in your inbox.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account already exists for that email. Sign in instead.';
    case 'weak_password':
      return `That password is too short. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    case 'same_password':
      return 'That is the password you already had. Choose a new one.';
    case 'over_email_send_rate_limit':
      return 'Too many emails have been sent just now. Wait a few minutes and try again.';
    case 'over_request_rate_limit':
      return 'Too many attempts just now. Wait a minute and try again.';
    case 'signup_disabled':
      return 'New accounts are closed at the moment.';
    case 'validation_failed':
      return 'That email address was refused. Check it and try again.';
    case 'not_authenticated':
    case 'email_not_verified':
      return 'Your session is no longer valid. Sign in again.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/**
 * Il testo del messaggio di benvenuto della schermata di verifica.
 *
 * Non dice «ti abbiamo mandato una email» al passato remoto: la persona puo'
 * essere tornata qui dopo aver ricaricato la pagina, e in quel caso nessun
 * messaggio e' partito adesso. Dice dove guardare, che e' l'unica cosa vera in
 * entrambi i casi.
 */
export function verifyNote(email: string): string {
  const who = email.trim() === '' ? 'your email address' : email.trim();
  return `We sent a confirmation link to ${who}. Open it, then come back to this page.`;
}

/** Quanto resta, detto a parole, sulla schermata di prova scaduta. */
export function expiredNote(email: string): string {
  const who = email.trim() === '' ? 'This account' : email.trim();
  return `The 45-minute trial for ${who} is over.`;
}
