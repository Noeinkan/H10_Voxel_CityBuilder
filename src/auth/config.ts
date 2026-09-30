/**
 * Le due sole cose che il browser deve sapere di Supabase.
 *
 * Arrivano dal **build**, non dal repository: Vite scrive dentro il bundle ogni
 * variabile che comincia per `VITE_`, quindi queste due finiscono in una pagina
 * pubblica e devono restare l'URL del progetto e la chiave pubblicabile. Una
 * chiave `service_role` qui dentro darebbe a chiunque il diritto di concedersi
 * l'accesso illimitato, e il piano lo vieta esplicitamente.
 *
 * La chiave pubblicabile non e' un segreto: e' fatta per stare nel browser. Chi
 * la legge puo' solo fare cio' che le regole del database permettono, ed e' per
 * questo che tutta l'autorita' sta nella migration e non qui.
 */

export interface AuthConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Cio' che Vite sa del build.
 *
 * Dichiarato come tipo proprio invece di leggere `import.meta.env` qui dentro:
 * cosi' la funzione si prova in `node` passando due stringhe, senza dover
 * fingere un ambiente di build.
 */
export interface AuthEnv {
  readonly VITE_SUPABASE_URL?: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY?: string | undefined;
}

/**
 * `null` quando il build non ha le chiavi, e non e' un caso da nascondere.
 *
 * Un modulo di accesso che non puo' funzionare e' peggio di nessun modulo: la
 * porta d'accesso lo dice e si ferma, invece di raccogliere un indirizzo e una
 * password e lasciarli cadere.
 */
export function readAuthConfig(env: AuthEnv): AuthConfig | null {
  const url = (env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (url === '' || anonKey === '') return null;
  return { url, anonKey };
}
