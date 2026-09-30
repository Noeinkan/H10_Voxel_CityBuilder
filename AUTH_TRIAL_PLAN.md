# Piano: accesso via email, prova di 45 minuti e beta tester

## Esito

**Realizzato.** Il codice e' in `src/auth/`, l'autorita' in
`supabase/migrations/20260930000000_access.sql`, e la configurazione passo per
passo in [supabase/README.md](supabase/README.md).

Le decisioni che il piano lasciava aperte sono state chiuse cosi':

- **Provider: Supabase**, come proposto.
- **Timer: tempo reale dal primo «Play».** L'orologio parte quando il mondo nasce
  e corre anche a pagina chiusa; non ci sono minuti di gioco effettivo da
  contabilizzare.
- **Nessuna scorciatoia per lo sviluppo locale.** La porta vale allo stesso modo
  sul computer di chi sviluppa e in produzione; le due chiavi pubbliche si
  mettono in un `.env` locale, che il `.gitignore` tiene fuori dal repository.
- **L'accesso beta si chiede da un modulo dentro la pagina**, che scrive una riga
  in `access_requests`. La cancellazione dell'account usa la stessa tabella con
  `kind = 'deletion'`.

Due cose sono cambiate rispetto a quanto scritto sotto:

- **La chiave della prova e' l'email, non l'account.** Il piano parlava di «un
  record privato per utente»; con `user_id` come chiave, pero', cancellare
  l'account e riscriversi con lo stesso indirizzo regalerebbe altri 45 minuti, e
  il criterio d'accettazione vieta esattamente questo. `user_id` resta come
  puntatore, con `on delete set null`.
- **La verifica dell'indirizzo si controlla sul server**, dentro `start_trial()`,
  e non nel client: un controllo che vive nel browser non e' un controllo.

Resta scoperto, come il piano prevedeva:

- **Il limite non e' a prova di manomissione.** E' una build statica.
- **Alla scadenza la partita in corso non viene messa in pausa**: la schermata
  ricompare sopra al gioco, ma la citta' dietro continua a girare.

## Obiettivo

Richiedere un account email/password prima di entrare nella demo. Ogni nuovo
account riceve 45 minuti di prova; il proprietario puo' concedere accesso beta
illimitato a persone che lo richiedono.

## Stato attuale

- `src/boot.ts` decide l'ingresso e carica `src/main.ts` in modo dinamico dopo
  la scelta del giocatore.
- `.deploy/site.json` descrive una build statica servita da nginx, senza server
  applicativo, account o stato persistente.
- Non esiste quindi un'identita' su cui salvare la prova o il privilegio beta.

## Flusso desiderato

1. La pagina mostra registrazione, accesso e recupero password prima di avviare
   il gioco.
2. La registrazione usa email e password e richiede la verifica dell'indirizzo.
3. Alla prima pressione di **Play**, il sistema crea una scadenza di 45 minuti
   associata all'account. La scadenza continua anche se la persona chiude la
   pagina o cambia dispositivo.
4. La pagina mostra il tempo rimasto. Alla scadenza impedisce un nuovo ingresso
   e invita a chiedere l'accesso beta.
5. Quando una persona viene accettata come beta tester, il proprietario
   contrassegna il suo account come illimitato. La persona continua a usare la
   propria email e password e non riceve una password condivisa.

**Assunzione da confermare:** il timer parte al primo avvio del gioco e misura
45 minuti di tempo reale, non 45 minuti cumulativi di gioco attivo.

## Architettura proposta

- Usare Supabase Auth per registrazione email/password, verifica email,
  accesso e recupero password; usare Postgres per i diritti di accesso.
- Creare un record privato per utente con almeno `trial_started_at`,
  `trial_expires_at` e `beta_unlimited`.
- Avviare la prova con un'operazione idempotente lato database/backend: il
  client non deve poter spostare la scadenza, creare altri minuti o concedersi
  il privilegio beta.
- Applicare Row Level Security: l'utente legge soltanto il proprio stato;
  le modifiche ai privilegi restano riservate al proprietario tramite la
  dashboard del provider o uno strumento amministrativo autenticato.
- Conservare soltanto l'URL pubblico del progetto e la chiave pubblicabile
  nelle variabili di build. Non mettere mai una chiave `service_role`, password
  SMTP o altri segreti nel bundle del browser o nel repository.
- Configurare SMTP personalizzato per verifica e recupero password prima di
  promuovere le registrazioni su X. La documentazione Supabase indica un limite
  di due email/ora per il mittente predefinito.

## Sequenza di lavoro

1. Confermare il provider e la semantica del timer. Il default proposto e'
   Supabase e una scadenza persistente di 45 minuti dal primo **Play**.
2. Creare/configurare il progetto auth, i redirect per il dominio pubblico e
   SMTP; custodire le credenziali fuori dal repository.
3. Aggiungere una migration per i diritti di accesso e una funzione sicura per
   iniziare la prova e leggerne lo stato. Rendere l'attivazione beta
   amministrativa, mai modificabile dal browser dell'utente.
4. Integrare la porta d'accesso in `src/boot.ts`, prima dell'import dinamico del
   gioco. Aggiungere gli stati di registrazione, login, verifica, recupero
   password, errore di rete, prova attiva, prova scaduta e accesso illimitato.
5. Mostrare il conto alla rovescia durante la prova e aggiornare lo stato
   dall'autorita' remota; non fidarsi dell'orologio locale come fonte della
   scadenza.
6. Aggiungere una nota privacy essenziale su raccolta e uso dell'email e un
   percorso per chiedere la cancellazione dell'account.
7. Verificare i flussi di registrazione/verifica, login, reset, scadenza,
   reload, cambio dispositivo e beta illimitata; eseguire typecheck, test
   mirati e build.
8. Applicare migration e variabili nel servizio remoto, poi distribuire e
   controllare manualmente il dominio pubblico.

## Criteri di accettazione

- Un visitatore non entra nel gioco senza autenticarsi con un account verificato.
- Ogni account standard riceve una sola prova di 45 minuti, la cui scadenza
  sopravvive a logout, reload e cambio dispositivo.
- Un account scaduto non riceve minuti aggiuntivi registrandosi di nuovo con
  la stessa email.
- Il proprietario puo' concedere l'accesso illimitato all'account richiesto;
  l'utente vede lo stato beta e non il conto alla rovescia.
- Un utente non puo' modificare dal browser la propria scadenza o il privilegio
  beta; nessun segreto amministrativo compare nel bundle pubblico.
- Verifica email e recupero password funzionano sul dominio di produzione.

## Limiti e decisioni aperte

- **Provider:** Supabase e' la proposta, non e' ancora configurato o approvato.
- **Timer:** confermare se i 45 minuti decorrono in tempo reale dal primo avvio
  oppure sono minuti attivi che si fermano quando l'utente esce. La seconda
  opzione richiede heartbeat e una contabilita' piu' complessa.
- **Forza del limite:** questa e' una build statica client-side. Il gate puo'
  controllare il normale flusso del browser, ma non impedisce a una persona
  determinata di scaricare o modificare il bundle. Un limite resistente alla
  manomissione richiederebbe spostare una parte sostanziale dell'esecuzione o
  della validazione su un backend.
- **Accesso beta:** il piano assume che il tester crei/verifichi il proprio
  account e che il proprietario promuova quell'email a illimitata. Non si
  inviano password condivise in chiaro.

## Riferimenti

- Configurazione corrente: `.deploy/site.json` e `src/boot.ts`.
- [Supabase: password auth](https://supabase.com/docs/guides/auth/passwords)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
