/**
 * Il confine fra la porta d'accesso e il servizio che la sostiene.
 *
 * Esiste per una ragione sola ma buona: il comportamento della porta — quando
 * blocca, quando lascia passare, cosa mostra mentre aspetta — e' la parte che si
 * sbaglia, e con un'interfaccia davanti si prova senza rete e senza un progetto
 * vero. `AuthGate.test.ts` ne monta una finta e attraversa tutti gli stati; il
 * servizio vero e' una delle due implementazioni possibili, non l'unica.
 */

import type { AccessSnapshot } from './access';
import type { AuthErrorLike } from './AuthScreenModel';

/** Le due richieste che una persona puo' lasciare al proprietario. */
export type AccessRequestKind = 'beta' | 'deletion';

/**
 * Cosa e' cambiato nell'account mentre la pagina era aperta.
 *
 * `recovery` non e' un dettaglio della libreria: e' l'unico modo di sapere che
 * si e' arrivati qui da un link di reimpostazione password, e che quindi va
 * chiesta una password nuova invece di mostrare il gioco.
 */
export type AuthEvent = 'signedIn' | 'signedOut' | 'recovery' | 'tokenRefreshed';

/**
 * Esito di una registrazione.
 *
 * `needsVerification` e' quasi sempre `true`: con la conferma via email accesa,
 * registrarsi non fa entrare nessuno — crea un account in attesa. Il campo esiste
 * perche' il giorno in cui quella conferma fosse spenta la schermata dovrebbe
 * cambiare, e il tipo lo dice invece di lasciarlo scoprire a schermo.
 */
export interface SignUpOutcome {
  readonly needsVerification: boolean;
}

export interface AuthBackend {
  /** Chi e' collegato adesso, secondo il token salvato. Non lancia se non c'e' nessuno. */
  session(): Promise<AccessSnapshot>;

  signUp(email: string, password: string): Promise<SignUpOutcome>;

  /**
   * Rimanda il messaggio di conferma.
   *
   * Serve perche' una email si perde, finisce nello spam o viene aperta su un
   * altro telefono: senza questa, l'unica via d'uscita per chi non l'ha ricevuta
   * sarebbe rifare la registrazione, che si scontra con «esiste gia' un
   * account».
   */
  resendVerification(email: string): Promise<void>;

  signIn(email: string, password: string): Promise<AccessSnapshot>;

  signOut(): Promise<void>;

  /** Manda il link di reimpostazione. Non dice se l'indirizzo esiste: non deve. */
  sendPasswordReset(email: string): Promise<void>;

  /** Scrive la password nuova, per chi e' arrivato da un link di reimpostazione. */
  updatePassword(password: string): Promise<void>;

  /**
   * Accende la prova, o restituisce quella gia' accesa.
   *
   * E' idempotente lato database, quindi il chiamante non deve sapere se e' la
   * prima volta: chiedere «quanto mi resta?» e chiedere «parti» hanno la stessa
   * risposta.
   */
  startTrial(): Promise<AccessSnapshot>;

  /** Rilegge lo stato dall'autorita' remota. */
  refresh(): Promise<AccessSnapshot>;

  requestAccess(kind: AccessRequestKind, message: string | null): Promise<void>;

  /** Si iscrive ai cambiamenti; la funzione restituita disiscrive. */
  watch(listener: (event: AuthEvent) => void): () => void;
}

/**
 * Un errore qualunque ridotto a cio' che serve per scriverne uno leggibile.
 *
 * `authErrorText` vuole tre campi; quello che arriva da una `catch` e' `unknown`
 * e puo' essere qualsiasi cosa, `undefined` compreso. Farlo qui, una volta, vale
 * piu' che ripetere lo stesso restringimento in ogni punto in cui si maneggia
 * un fallimento.
 */
export function asAuthError(value: unknown): AuthErrorLike {
  if (typeof value !== 'object' || value === null) return {};
  const row = value as Record<string, unknown>;
  const code = row['code'];
  const status = row['status'];
  const message = row['message'];
  return {
    code: typeof code === 'string' ? code : undefined,
    status: typeof status === 'number' ? status : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}
