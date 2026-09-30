/**
 * Cosa puo' fare chi sta davanti allo schermo, dedotto dalla sola risposta del
 * server.
 *
 * **La scadenza non si legge dall'orologio locale.** Il server manda quanti
 * secondi restavano *nel momento in cui ha risposto*; da li' in poi si conta in
 * avanti con un orologio che non si puo' spostare. Un sistema con l'ora
 * sbagliata sposta il punto di partenza della conta, non la fine della prova —
 * e nessuno guadagna minuti mettendo indietro l'orologio di casa.
 *
 * Tutto qui dentro e' puro: nessuna rete, nessun DOM, nessun `Date.now()`.
 * Il tempo entra come parametro, cosi' i casi limite — l'ultimo secondo, lo
 * zero esatto — si provano senza aspettare.
 */

/** Cio' che il server ha risposto su chi sta chiamando. */
export interface AccessSnapshot {
  readonly authenticated: boolean;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly betaUnlimited: boolean;
  /** Secondi che restavano alla risposta del server; `null` se la prova non e' mai partita. */
  readonly secondsLeft: number | null;
}

/** La risposta di chi non e' collegato: una risposta, non un errore. */
export const SIGNED_OUT: AccessSnapshot = {
  authenticated: false,
  email: null,
  emailVerified: false,
  betaUnlimited: false,
  secondsLeft: null,
};

/**
 * Le sei situazioni in cui la porta d'accesso si puo' trovare.
 *
 * `ready` e `trial` sono le uniche due che lasciano passare oltre il cancello;
 * `unlimited` pure, ma e' l'unica che non ha un conto alla rovescia da mostrare.
 */
export type AccessState =
  | { readonly kind: 'signedOut' }
  | { readonly kind: 'unverified' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'trial'; readonly secondsLeft: number }
  | { readonly kind: 'expired' }
  | { readonly kind: 'unlimited' };

/**
 * L'ordine dei controlli e' l'ordine delle precedenze.
 *
 * La verifica viene prima della prova perche' senza quella `start_trial` non
 * parte comunque: dirlo qui vuol dire dirlo a schermo, invece di far premere un
 * bottone che il server rifiutera'.
 */
export function accessState(snapshot: AccessSnapshot): AccessState {
  if (!snapshot.authenticated) return { kind: 'signedOut' };
  if (!snapshot.emailVerified) return { kind: 'unverified' };
  if (snapshot.betaUnlimited) return { kind: 'unlimited' };
  if (snapshot.secondsLeft === null) return { kind: 'ready' };
  if (snapshot.secondsLeft <= 0) return { kind: 'expired' };
  return { kind: 'trial', secondsLeft: snapshot.secondsLeft };
}

/** Se da questo stato si entra nel mondo. `ready` lo diventa dopo `startTrial`. */
export function mayEnter(state: AccessState): boolean {
  return state.kind === 'trial' || state.kind === 'unlimited';
}

/**
 * La risposta del server e' di rete, quindi e' un dato non fidato: si legge
 * campo per campo e si rifiuta cio' che non si riconosce.
 *
 * `null` vuol dire «non ho capito la risposta», che e' diverso da «non sei
 * collegato»: confonderli disconnetterebbe in silenzio qualcuno che aveva
 * diritto di entrare, e lo farebbe sembrare un problema suo.
 */
export function parseSnapshot(value: unknown): AccessSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;

  if (typeof row['authenticated'] !== 'boolean') return null;
  if (!row['authenticated']) return SIGNED_OUT;

  // `seconds_left` arriva dal `::int` di Postgres: o un numero intero, o null.
  const secondsLeft = row['seconds_left'];
  if (secondsLeft !== null && typeof secondsLeft !== 'number') return null;

  const email = row['email'];
  if (email !== null && typeof email !== 'string') return null;

  return {
    authenticated: true,
    email: email ?? null,
    emailVerified: row['email_verified'] === true,
    betaUnlimited: row['beta_unlimited'] === true,
    secondsLeft: secondsLeft === null ? null : Math.max(0, Math.floor(secondsLeft)),
  };
}

/**
 * Il conto alla rovescia ancorato alla risposta del server.
 *
 * `readAtMs` e' una lettura di `performance.now()`, non l'ora di sistema: e' un
 * cronometro che avanza e basta, quindi non lo tocca nessun cambio d'ora e
 * nessun aggiustamento automatico dell'orologio.
 */
export interface TrialClock {
  readonly secondsLeft: number;
  readonly readAtMs: number;
}

export function startClock(secondsLeft: number, nowMs: number): TrialClock {
  return { secondsLeft, readAtMs: nowMs };
}

/** Quanti secondi restano adesso. Non scende sotto zero: la prova non torna. */
export function clockSecondsLeft(clock: TrialClock, nowMs: number): number {
  const elapsed = Math.floor((nowMs - clock.readAtMs) / 1000);
  return Math.max(0, clock.secondsLeft - Math.max(0, elapsed));
}

/**
 * Il tempo rimasto come lo si legge in un angolo dello schermo.
 *
 * Sotto l'ora e' `mm:ss`, che e' il caso normale di una prova di 45 minuti;
 * sopra, `h:mm:ss`, che tiene la forma se un giorno la prova si allunga. Il
 * secondo che manca si scrive `0:00` e non `-0:01`.
 */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const two = (value: number): string => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${two(minutes)}:${two(rest)}`;
  return `${minutes}:${two(rest)}`;
}
