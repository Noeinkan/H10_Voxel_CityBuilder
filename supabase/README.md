# Configurare l'accesso

Questa cartella contiene la migration che crea le tabelle e le funzioni
dell'accesso. **Finche' non e' eseguita su un progetto Supabase, la pagina non
lascia entrare nessuno**: dice «Sign-in is not set up» e si ferma li'.

Il codice e' gia' finito e compilato: quello che manca sono un progetto Supabase
e due valori da mettere sul server. Sono una ventina di minuti, quasi tutti di
clic.

L'ordine conta. I passi 1-4 si fanno su Supabase, il 5 sul server, il 6
distribuisce, il 7 controlla. **Il 5 va prima del 6**: se distribuisci senza le
chiavi, il sito online mostra la schermata «not set up» invece del modulo.

---

## 1. Creare il progetto Supabase

1. Vai su <https://supabase.com/dashboard> e accedi.
2. Premi **New project**.
3. Compila:
   - **Name**: `voxelcity` (o quello che preferisci, non compare a nessuno).
   - **Database Password**: generala e **salvala in un posto tuo**. Non serve
     al gioco, ma se la perdi non si recupera.
   - **Region**: `West EU (Ireland)` o `Central EU (Frankfurt)` — il server e'
     in Europa, e la differenza si sente sul tempo di risposta.
4. Premi **Create new project** e aspetta un paio di minuti. La dashboard mostra
   una barra di avanzamento; finche' non finisce, i passi sotto non funzionano.

**Dove sei**: nella dashboard del progetto. La barra a sinistra e' quella che
serve da qui in avanti.

> Supabase rinomina le voci di tanto in tanto. Se un nome non torna, la sezione
> e' comunque quella: **Authentication** per chi entra, **SQL Editor** per
> eseguire codice, **Table Editor** per guardare le tabelle.

---

## 2. Eseguire la migration

Senza questo passo il database non ha nessuna delle tabelle, e ogni tentativo di
accesso fallisce.

1. Nella barra a sinistra, apri **SQL Editor**.
2. Premi **New query**.
3. Apri il file [`migrations/20260930000000_access.sql`](migrations/20260930000000_access.sql)
   di questa cartella, copia **tutto** il contenuto e incollalo nell'editor.
4. Premi **Run** (o `Ctrl`+`Invio`).
5. In basso deve comparire **Success. No rows returned**. Va bene cosi': la
   migration crea tabelle e funzioni, non righe.

**Se invece leggi un errore**, non proseguire. Copia il messaggio e portalo qui:
quasi sempre e' una migration eseguita due volte, e si sistema.

**Dove sei**: sempre in SQL Editor. Per controllare che ci sia tutto, apri
**Table Editor** nella barra a sinistra: sotto `public` devi vedere due tabelle
nuove, `access_grants` e `access_requests`.

---

## 3. Accendere la conferma via email (e l'SMTP)

Serve perche' il criterio e' «un visitatore non entra senza un account
verificato»: senza conferma, chiunque scriva un indirizzo inventato entra.

1. **Authentication** → **Sign In / Providers** → nella lista **Email**.
2. Controlla che **Enable email provider** sia acceso.
3. Accendi **Confirm email**. E' la casella che rende obbligatoria la conferma.
4. Nella stessa pagina, in **Password**, porta **Minimum password length** a `8`
   — la stessa lunghezza che chiede il modulo.

### Poi l'SMTP, prima di dare il link in giro

**Questo passo non si puo' rimandare.** Con il servizio email predefinito
Supabase manda **due email all'ora** per tutto il progetto: la terza persona che
prova a registrarsi non riceve niente, e sembra che il sito sia rotto.

1. **Project Settings** (l'ingranaggio in basso a sinistra) → **Authentication**
   → **SMTP Settings**.
2. Accendi **Enable Custom SMTP** e inserisci i dati del tuo fornitore di posta.
3. Dopo aver salvato, usa il pulsante **Send test email** e controlla che arrivi
   davvero.

**Se salti questo passo e pubblichi il link su X**, le prime due registrazioni
funzionano e tutte le altre no, senza che nessuno capisca perche'. L'errore che
il modulo mostra in quel caso e': *«Too many emails have been sent just now»*.

---

## 4. Dire a Supabase dove si torna

I link nelle email — conferma e reimpostazione password — riportano la persona
sul sito. Se l'indirizzo non e' in elenco, Supabase la manda altrove.

1. **Authentication** → **URL Configuration**.
2. **Site URL**: `https://voxelcity.noeinsolutions.com`
3. In **Redirect URLs**, premi **Add URL** e aggiungi entrambi:
   - `https://voxelcity.noeinsolutions.com/**`
   - `http://localhost:8020/**` — per quando lavori sul tuo computer.

**Dove sei**: resti in **Project Settings**. Il passo dopo e' prendere le due
chiavi, che stanno qui.

---

## 5. Portare le due chiavi sul server

**Project Settings** → **API** (o **API Keys**). Servono due valori:

- **Project URL** — una riga che comincia per `https://`.
- La chiave **publishable**, chiamata anche **anon** — una riga lunghissima.
  Se la dashboard mostra le chiavi nuove, il nome e' `sb_publishable_...`.

> **Non copiare mai la chiave `service_role`, o `secret`.** Quella scavalca
> tutte le regole: chi la leggesse potrebbe concedersi l'accesso illimitato. Le
> due che servono qui sono fatte per stare nel browser, e infatti ci finiscono.

**Dove sei**: adesso passi al terminale. Le due righe vanno scritte nel file
delle variabili del sito, sul server:

```bash
ssh root@77.42.70.26 "printf 'VITE_SUPABASE_URL=https://il-tuo-progetto.supabase.co\nVITE_SUPABASE_ANON_KEY=incolla-qui-la-chiave\n' >> /opt/sites/voxelcity/.env"
```

Sostituisci i due valori con quelli copiati. Il file esiste gia' ed e' leggibile
solo da root; **questo e' l'unico posto dove vanno scritte**, e non entrano mai
nel repository.

Per controllare che siano arrivate, senza stamparle a schermo:

```bash
ssh root@77.42.70.26 "cut -d= -f1 /opt/sites/voxelcity/.env"
```

Devi vedere due righe: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Se ne
vedi quattro, hai eseguito il comando due volte: rifai il file da capo con
`install -m 600 /dev/null /opt/sites/voxelcity/.env` e poi una sola volta il
`printf`.

---

## 6. Distribuire

Da questo repository:

```bash
bash deploy.sh --dry-run
bash deploy.sh
```

Il primo comando non pubblica niente: controlla dominio e DNS e mostra cosa
partirebbe. Il secondo pubblica.

Le due chiavi vengono lette dal `.env` del server al momento del build, quindi
**una modifica alle chiavi richiede un nuovo deploy**: scriverle mentre il sito
e' gia' online non cambia niente finche' non ridistribuisci.

---

## 7. Controllare che funzioni

Da fare una volta, con calma, prima di dare il link a qualcuno.

1. Apri <https://voxelcity.noeinsolutions.com/> in una **finestra
   anonima** — altrimenti la sessione salvata ti salta il controllo.
2. Devi vedere il modulo **Sign in**, non il gioco. Se vedi «Sign-in is not set
   up», le chiavi non sono arrivate al build: torna al passo 5 e ridistribuisci.
3. Premi **Create an account**, registra un indirizzo **tuo vero** e una password
   di almeno 8 caratteri.
4. Controlla la posta: deve arrivare un messaggio di conferma. **Se non arriva
   entro un minuto**, guarda nello spam, e se non c'e' nemmeno li' torna al
   passo 3 (l'SMTP).
5. Apri il link. La pagina deve riportarti sul sito, e stavolta vedi il menu del
   titolo con la citta' da creare.
6. In alto al centro compare **Trial 45:00**, e scende.
7. Ricarica la pagina: sei ancora dentro, e il tempo e' **meno** di prima. E' la
   prova che la scadenza e' sul server e non nel browser.
8. Apri il sito da un altro dispositivo o da un altro browser, entra con lo
   stesso indirizzo, e controlla che il tempo sia lo stesso di prima — non
   ricominciato da 45:00.

Fatto questo, il link si puo' dare in giro.

---

## 8. Promuovere qualcuno ad accesso illimitato

Quando una persona chiede l'accesso beta, arriva una riga nella tabella
`access_requests`. Per vederla: **Table Editor** → `access_requests`. Le colonne
sono l'indirizzo, il tipo (`beta` o `deletion`), il messaggio e le date.

Per concedere l'accesso:

1. Nella barra a sinistra apri **SQL Editor** → **New query**.
2. Incolla questa riga, **sostituendo l'indirizzo** con quello della persona:

```sql
update public.access_grants
   set beta_unlimited = true, updated_at = now()
 where email = 'persona@esempio.com';
```

3. Premi **Run**. Deve dire **Success. No rows returned**.
4. Dopo un ricaricamento, quella persona vede **Beta access · no time limit** al
   posto del conto alla rovescia.

**Non e' una funzione dell'applicazione, ed e' voluto**: si fa solo da qui, con
il tuo accesso alla dashboard. Se fosse un pulsante nel gioco, chiunque
potrebbe premerlo.

L'indirizzo va scritto **tutto minuscolo**: nel database e' normalizzato cosi',
e `Mario@Esempio.com` non troverebbe la riga di `mario@esempio.com`.

Per togliere l'accesso, la stessa riga con `= false`.

---

## 9. Cancellare un account

Una richiesta di cancellazione arriva nella stessa tabella, con `kind` uguale a
`deletion`. Per eseguirla: **Authentication** → **Users**, trova la persona,
menu dei tre puntini → **Delete user**.

**L'account sparisce ma la prova resta.** La riga in `access_grants` non viene
cancellata, ed e' deliberato: se quella persona si riscrivesse con lo stesso
indirizzo, ritroverebbe la scadenza di prima invece di ricevere altri 45 minuti.
E' il criterio «un account scaduto non riceve minuti aggiuntivi registrandosi di
nuovo con la stessa email».

Se invece vuoi **ricominciare da zero** con quella persona — per esempio perche'
la prova si era bruciata per un problema tecnico — cancella anche la sua riga:

```sql
delete from public.access_grants where email = 'persona@esempio.com';
```

---

## Cambiare la durata della prova

I 45 minuti sono scritti in **un punto solo**: la funzione `trial_length()` in
fondo alla migration, la riga `select interval '45 minutes';`. Il client non
conosce il numero — legge solo quanti secondi restano — quindi non c'e' un
secondo posto da aggiornare.

Per cambiarli, riapri **SQL Editor**, esegui la `create or replace function
public.trial_length()` con il valore nuovo, e **ridistribuisci**: la durata vale
per le prove accese da li' in avanti, non per quelle gia' in corso.

---

## Cosa non e' coperto

- **Il limite non e' a prova di manomissione.** Questa e' una build statica: il
  controllo ferma il flusso normale del browser, ma chi scarica il bundle e lo
  modifica se ne libera. Lo dice il piano stesso, ed e' il motivo per cui la
  prova vale 45 minuti di calendario e non qualcosa di piu' prezioso.
- **Alla scadenza la partita in corso non viene messa in pausa.** La schermata
  ricompare sopra al gioco e non si puo' piu' entrare, ma la citta' dietro
  continua a girare. Chiuderla davvero richiede un collegamento fra questo
  strato e il ciclo di gioco, che non c'e' ancora.
- **Nessun limite di richieste sugli indirizzi.** La funzione `request_access`
  accetta una richiesta per indirizzo, ma niente impedisce a molte persone
  diverse di scriverne una a testa.
