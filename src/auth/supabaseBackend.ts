/**
 * La porta d'accesso appoggiata a Supabase.
 *
 * E' l'unico file del progetto che importa `@supabase/supabase-js`, ed e' il
 * motivo per cui esiste `backend.ts`: la libreria sta qui, il comportamento sta
 * in `AuthGate.ts`, e i test non toccano ne' l'una ne' l'altro.
 *
 * **Qui non si decide niente.** Ogni risposta che conta — chi sei, se hai
 * verificato l'indirizzo, quanto ti resta, se sei beta — la produce il database,
 * che e' l'unico a poterlo fare senza essere contraddetto. Questo file traduce
 * chiamate e riconosce le risposte, e quando non le riconosce lo dice invece di
 * tirare a indovinare.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SIGNED_OUT, parseSnapshot, type AccessSnapshot } from './access';
import type {
  AccessRequestKind,
  AuthBackend,
  AuthEvent,
  SignUpOutcome,
} from './backend';
import type { AuthConfig } from './config';

/**
 * Dove tornare dopo aver cliccato il link nella email.
 *
 * Si ricava dalla pagina invece di essere una costante: lo stesso build gira su
 * `localhost:8020` mentre si lavora e su `voxelcity.demos.noeinsolutions.com`
 * in produzione, e un indirizzo scritto a mano sarebbe giusto in uno solo dei
 * due. Il controllo che conta resta comunque l'elenco dei redirect ammessi nel
 * progetto Supabase: se questo indirizzo non e' in quell'elenco, Supabase
 * riporta la persona al sito predefinito.
 *
 * Senza query e senza frammento: il token di conferma arriva proprio li', e una
 * stringa di ricerca rimasta attaccata finirebbe dentro il link.
 */
function pageUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Rotte di Supabase Auth: solo quelle che riguardano l'accesso. */
function mapEvent(event: string): AuthEvent | null {
  switch (event) {
    case 'SIGNED_IN':
    case 'INITIAL_SESSION':
      // `INITIAL_SESSION` arriva anche senza nessuno collegato, quindi non dice
      // «sei entrato»: lo dice solo se c'e' davvero una sessione, e a deciderlo
      // e' chi riceve l'evento rileggendo lo stato.
      return 'signedIn';
    case 'SIGNED_OUT':
      return 'signedOut';
    case 'PASSWORD_RECOVERY':
      return 'recovery';
    case 'TOKEN_REFRESHED':
      return 'tokenRefreshed';
    // `USER_UPDATED` e i fattori di autenticazione non cambiano il diritto
    // d'accesso: chi li riceve non ha niente da ridisegnare.
    default:
      return null;
  }
}

class SupabaseBackend implements AuthBackend {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Accende la prova, o restituisce quella gia' accesa.
   *
   * Il server risponde con un `jsonb` che questo file non interpreta: lo passa
   * a `parseSnapshot`, e se la forma non e' quella attesa solleva invece di
   * inventare uno stato. Uno stato inventato qui vorrebbe dire o un accesso
   * regalato o una prova negata a chi ne aveva diritto.
   */
  private async rpcSnapshot(
    name: 'access_snapshot' | 'start_trial',
  ): Promise<AccessSnapshot> {
    const { data, error } = await this.client.rpc(name);
    if (error !== null) throw error;
    const snapshot = parseSnapshot(data);
    if (snapshot === null) {
      throw new Error(`Unexpected answer from ${name}()`);
    }
    return snapshot;
  }

  async session(): Promise<AccessSnapshot> {
    const { data, error } = await this.client.auth.getSession();
    if (error !== null) throw error;
    // Il token salvato dice che qualcuno c'era; quanto gli resta lo sa solo il
    // server. Saltare questo giro vorrebbe dire far entrare qualcuno su una
    // prova scaduta fino alla prima chiamata.
    if (data.session === null) return SIGNED_OUT;
    return this.refresh();
  }

  async refresh(): Promise<AccessSnapshot> {
    try {
      return await this.rpcSnapshot('access_snapshot');
    } catch (error) {
      // Una sessione scaduta fa fallire la chiamata con un 401, ed e' un esito
      // normale, non un guasto: si dice «non sei collegato» invece di lasciare
      // la persona davanti a un errore che non puo' risolvere. Un errore con la
      // sessione ancora viva resta un errore e va raccontato.
      const { data } = await this.client.auth.getSession();
      if (data.session === null) return SIGNED_OUT;
      throw error;
    }
  }

  async signUp(email: string, password: string): Promise<SignUpOutcome> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: pageUrl() },
    });
    if (error !== null) throw error;
    // Con la conferma via email accesa Supabase risponde con un utente ma senza
    // sessione: e' il caso normale, e la schermata deve mandare alla posta.
    return { needsVerification: data.session === null };
  }

  async resendVerification(email: string): Promise<void> {
    const { error } = await this.client.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: pageUrl() },
    });
    if (error !== null) throw error;
  }

  async signIn(email: string, password: string): Promise<AccessSnapshot> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error !== null) throw error;
    return this.refresh();
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error !== null) throw error;
  }

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: pageUrl(),
    });
    if (error !== null) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error !== null) throw error;
  }

  startTrial(): Promise<AccessSnapshot> {
    return this.rpcSnapshot('start_trial');
  }

  async requestAccess(kind: AccessRequestKind, message: string | null): Promise<void> {
    const { error } = await this.client.rpc('request_access', { kind, message });
    if (error !== null) throw error;
  }

  watch(listener: (event: AuthEvent) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((event) => {
      const mapped = mapEvent(event);
      if (mapped !== null) listener(mapped);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }
}

export function createSupabaseBackend(config: AuthConfig): AuthBackend {
  const client = createClient(config.url, config.anonKey, {
    auth: {
      // Le tre voci che rendono la prova «una sola per persona» anche
      // ricaricando: la sessione sopravvive al reload, il token si rinnova da
      // solo, e il frammento con cui Supabase rimanda qui dopo la conferma o la
      // reimpostazione viene letto e ripulito dall'indirizzo.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return new SupabaseBackend(client);
}
