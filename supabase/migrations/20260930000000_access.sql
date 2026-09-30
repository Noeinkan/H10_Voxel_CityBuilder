-- Accesso, prova di 45 minuti e beta illimitata.
--
-- Tutto cio' che decide se una persona entra vive qui, e il browser non ha
-- **nessun** permesso di scrittura: le uniche due strade sono le funzioni
-- `security definer` piu' sotto, che ricavano l'email da `auth.users` invece di
-- fidarsi di quella che arriva dal client. Un utente che si riscrive la propria
-- scadenza dal browser non ha nemmeno una riga da modificare.
--
-- **La chiave e' l'email, non l'id dell'account.** Cancellare l'account e
-- riscriversi con lo stesso indirizzo deve ritrovare la stessa riga: se la
-- chiave fosse `user_id`, quella manovra regalerebbe altri 45 minuti, ed e'
-- esattamente il criterio «un account scaduto non riceve minuti aggiuntivi
-- registrandosi di nuovo con la stessa email». `user_id` resta come puntatore
-- all'ultimo account che ha reclamato la riga, e si azzera da solo se quell'
-- account sparisce.

-- --------------------------------------------------------------------------
-- Quanto dura la prova
-- --------------------------------------------------------------------------

/**
 * L'unico posto dove sono scritti i 45 minuti.
 *
 * E' una funzione e non una costante sparsa perche' il numero va cambiato in un
 * punto solo: `start_trial` la chiama, e il client non lo conosce affatto — lui
 * legge solo quanti secondi restano, che e' un'altra cosa.
 *
 * `security invoker` di proposito: non deve poter fare niente che chi la chiama
 * non possa gia' fare. A eseguirla e' soltanto `start_trial`, che gira come
 * proprietario.
 */
create or replace function public.trial_length()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '45 minutes';
$$;

-- --------------------------------------------------------------------------
-- Il diritto d'accesso
-- --------------------------------------------------------------------------

create table if not exists public.access_grants (
  email            text primary key,
  user_id          uuid references auth.users (id) on delete set null,
  beta_unlimited   boolean not null default false,
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- L'email si normalizza una volta sola, all'ingresso: due righe per la stessa
  -- persona vorrebbero dire due prove.
  constraint access_grants_email_normalized check (email = lower(email))
);

comment on table public.access_grants is
  'Un diritto d''accesso per indirizzo email. Scritto soltanto dalle funzioni security definer e dal proprietario del progetto dalla dashboard.';

comment on column public.access_grants.beta_unlimited is
  'Concesso a mano dal proprietario. Il browser non ha nessun percorso per scriverlo.';

-- RLS accesa **e senza nessuna policy**: la tabella e' chiusa a `anon` e
-- `authenticated` per ogni verbo, e le due funzioni sotto sono l'unica porta.
-- Un `grant select` con una policy sulla propria riga sarebbe una seconda strada
-- da tenere allineata alla prima, per un dato che il client riceve gia' tutto
-- da `access_snapshot`.
alter table public.access_grants enable row level security;

revoke all on public.access_grants from anon, authenticated;

-- --------------------------------------------------------------------------
-- Le richieste: accesso beta e cancellazione dell'account
-- --------------------------------------------------------------------------

/**
 * Una richiesta per (indirizzo, tipo).
 *
 * Beta e cancellazione stanno nella stessa tabella perche' sono la stessa cosa
 * vista da due lati: una persona che chiede qualcosa al proprietario e resta in
 * attesa di una risposta. Cambia l'etichetta, non il meccanismo.
 */
create table if not exists public.access_requests (
  email      text not null,
  kind       text not null,
  message    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (email, kind),
  constraint access_requests_kind check (kind in ('beta', 'deletion')),
  constraint access_requests_email_normalized check (email = lower(email)),
  -- Il modulo e' una riga di testo libero: un tetto tiene la tabella leggibile
  -- e toglie di mezzo il copia-incolla di un intero documento.
  constraint access_requests_message_length check (message is null or length(message) <= 2000)
);

comment on table public.access_requests is
  'Richieste in attesa: accesso beta e cancellazione dell''account. Le legge il proprietario dalla dashboard, che non passa dalla RLS.';

alter table public.access_requests enable row level security;

revoke all on public.access_requests from anon, authenticated;

-- --------------------------------------------------------------------------
-- Lettura: cosa puo' fare chi sta chiamando
-- --------------------------------------------------------------------------

/**
 * Lo stato di chi chiama, in una risposta sola.
 *
 * **`seconds_left` e' il campo che conta.** Il client non riceve una data da
 * confrontare con il proprio orologio — quello si puo' spostare, e spostarlo
 * all'indietro allungherebbe la prova. Riceve quanti secondi restano *nel
 * momento in cui il server risponde*, e da li' conta in avanti: un orologio
 * sbagliato sposta il punto di partenza, non la fine.
 *
 * Non solleva eccezioni: senza sessione risponde `authenticated: false`, che e'
 * una risposta e non un errore — e' cio' che vede chi arriva sulla pagina.
 */
create or replace function public.access_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  mail       text;
  confirmed  timestamptz;
  beta       boolean;
  expires_at timestamptz;
begin
  if uid is null then
    return jsonb_build_object('authenticated', false);
  end if;

  select lower(u.email), u.email_confirmed_at
    into mail, confirmed
    from auth.users u
   where u.id = uid;

  if mail is null then
    return jsonb_build_object('authenticated', false);
  end if;

  -- Con zero righe i due bersagli restano NULL: `beta` lo raddrizza il
  -- coalesce, `expires_at` resta NULL e vuol dire «prova mai iniziata».
  select g.beta_unlimited, g.trial_expires_at
    into beta, expires_at
    from public.access_grants g
   where g.email = mail;

  return jsonb_build_object(
    'authenticated',    true,
    'email',            mail,
    'email_verified',   confirmed is not null,
    'beta_unlimited',   coalesce(beta, false),
    'trial_expires_at', expires_at,
    'seconds_left',     case
                          when expires_at is null then null
                          else greatest(
                                 0,
                                 floor(extract(epoch from (expires_at - now())))
                               )::int
                        end
  );
end;
$$;

comment on function public.access_snapshot() is
  'Lo stato d''accesso di chi chiama. L''unica lettura concessa al browser.';

-- --------------------------------------------------------------------------
-- La prova: si accende al primo «Play», e una volta sola
-- --------------------------------------------------------------------------

/**
 * Accende i 45 minuti, o restituisce quelli che restano.
 *
 * **Idempotente per costruzione.** L'`on conflict` tocca solo `user_id` e
 * `updated_at`: `trial_started_at`, `trial_expires_at` e `beta_unlimited` non
 * compaiono nel `SET`, quindi chiamarla mille volte lascia la scadenza dov'e'.
 * E' per questo che il client puo' chiamarla a ogni «Play» senza dover sapere se
 * e' la prima volta — la domanda «quanto mi resta?» e la domanda «parti» hanno
 * la stessa risposta.
 *
 * L'email non verificata si ferma qui, non nel client: un modulo che si puo'
 * modificare dal browser non e' un controllo.
 */
create or replace function public.start_trial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := auth.uid();
  mail      text;
  confirmed timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select lower(u.email), u.email_confirmed_at
    into mail, confirmed
    from auth.users u
   where u.id = uid;

  if mail is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if confirmed is null then
    raise exception 'email_not_verified' using errcode = '28000';
  end if;

  insert into public.access_grants (email, user_id, trial_started_at, trial_expires_at)
  values (mail, uid, now(), now() + public.trial_length())
  on conflict (email) do update
    set user_id    = excluded.user_id,
        updated_at = now();

  -- La risposta si costruisce leggendo, non ricordando: cosi' il numero che
  -- arriva al client e' lo stesso che darebbe una lettura separata.
  return public.access_snapshot();
end;
$$;

comment on function public.start_trial() is
  'Accende la prova al primo Play e non la sposta piu''. Sicura da chiamare a ogni ingresso.';

-- --------------------------------------------------------------------------
-- Le richieste: una riga per persona, riscrivibile
-- --------------------------------------------------------------------------

/**
 * Lascia una richiesta al proprietario, a nome di chi chiama.
 *
 * L'email la mette il server, non il modulo: un utente autenticato puo' chiedere
 * solo per se stesso. Ripetere la richiesta aggiorna la riga invece di
 * accodarne una seconda, cosi' la dashboard resta un elenco di persone e non di
 * clic.
 */
create or replace function public.request_access(kind text, message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := auth.uid();
  mail      text;
  confirmed timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if kind is null or kind not in ('beta', 'deletion') then
    raise exception 'unknown_request_kind' using errcode = '22023';
  end if;

  select lower(u.email), u.email_confirmed_at
    into mail, confirmed
    from auth.users u
   where u.id = uid;

  -- Solo un indirizzo verificato puo' chiedere: altrimenti chiunque puo'
  -- riempire la coda con indirizzi che non sono suoi.
  if mail is null or confirmed is null then
    raise exception 'email_not_verified' using errcode = '28000';
  end if;

  insert into public.access_requests (email, kind, message)
  values (mail, kind, nullif(left(coalesce(message, ''), 2000), ''))
  on conflict (email, kind) do update
    set message    = excluded.message,
        updated_at = now();
end;
$$;

comment on function public.request_access(text, text) is
  'Lascia una richiesta a nome di chi chiama: accesso beta o cancellazione dell''account.';

-- --------------------------------------------------------------------------
-- Chi puo' eseguire cosa
-- --------------------------------------------------------------------------

-- `public` e' il ruolo fittizio «chiunque», e le funzioni nascono con EXECUTE
-- gia' concesso li': senza questo revoke, `anon` potrebbe accendere una prova
-- senza avere un account.
revoke all on function public.trial_length() from public, anon, authenticated;
revoke all on function public.access_snapshot() from public, anon, authenticated;
revoke all on function public.start_trial() from public, anon, authenticated;
revoke all on function public.request_access(text, text) from public, anon, authenticated;

grant execute on function public.access_snapshot() to authenticated;
grant execute on function public.start_trial() to authenticated;
grant execute on function public.request_access(text, text) to authenticated;

-- `trial_length` non compare qui di proposito: la chiama solo `start_trial`, che
-- gira come proprietario, quindi nessun ruolo della pagina deve poterla eseguire.

-- --------------------------------------------------------------------------
-- Promuovere una persona ad accesso illimitato
-- --------------------------------------------------------------------------
--
-- Non e' una funzione: e' una riga da eseguire a mano, dalla dashboard
-- (SQL Editor, oppure Table Editor sulla tabella `access_grants`). E' l'unico
-- modo, ed e' voluto — se fosse una funzione concessa a qualcuno, quel qualcuno
-- potrebbe promuovere se stesso.
--
--   update public.access_grants
--      set beta_unlimited = true, updated_at = now()
--    where email = 'persona@esempio.com';
--
-- Per togliere l'accesso illimitato, la stessa riga con `false`.
