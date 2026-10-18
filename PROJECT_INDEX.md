# Indice del progetto

Mappa file per file di `src/`. Il *perché* delle scelte sta nei README
([README.md](README.md), [src/sim/README.md](src/sim/README.md)); le regole
operative in [CLAUDE.md](CLAUDE.md). Qui c'è solo *dove sta cosa*.

**Interrogalo, non leggerlo**: `npm run locate -- <termine>` cerca su ruolo,
percorso ed export — in questo file e in tutte le schede di `docs/index/` insieme —
e restituisce le sole righe che servono.

Qui restano la direzione delle dipendenze, la radice del repository e la
documentazione: **le righe file per file di `src/` stanno nelle schede**, elencate
in fondo. Una scheda costa fra i tre e i sette mila token; l'indice unico che le
precedeva ne costava trenta.

Circa 84.000 righe di TypeScript in 322 file di produzione. **I test non hanno
una riga qui**: stanno co-locati come `*.test.ts` accanto al file che coprono, e
`npm run test:related -- <sorgente>` li deduce dal grafo degli import — indicizzarli
raddoppiava le righe senza aggiungere un posto dove guardare.

## Direzione delle dipendenze

```
                       main.ts  ──────────────┐
                          │                   │  (l'unico che conosce tutti)
        ┌─────────────────┼─────────────────┐ │
        ▼                 ▼                 ▼ ▼
    src/engine/       src/world/         src/sim/        src/ui/
    (Three.js)     (nessun Three)     (nessun Three,    (DOM puro)
        │                 ▲             nessun engine)
        └── legge ────────┘                 │
            Chunk.blocks                    └── scrive solo Chunk.data
```

`src/engine/mesher/` e `src/world/terrain/` non importano Three.js: girano nei
worker. `src/sim/` gira in Node senza DOM né GPU.

## Radice

| File | Ruolo |
| --- | --- |
| [.deploy/compose.yml](.deploy/compose.yml) | Il servizio nginx del sito; passa le due variabili pubbliche al build prendendole dal `.env` accanto a sé, che sul server è `/opt/sites/voxelcity/.env` (0600) |
| [.deploy/Dockerfile](.deploy/Dockerfile) | Build in due stadi del bundle statico; dichiara `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` come argomenti di build, vuoti per difetto, perché Vite li scriva dentro il bundle. Senza, il sito online mostra «Sign-in is not set up» |
| [.env.example](.env.example) | Le due variabili pubbliche di Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), con scritto perché non sono segreti e perché la chiave `service_role` non va mai qui. `.gitignore` tiene `.env` fuori dal repository ma lascia passare questo |
| [AGENTS.md](AGENTS.md) | Regole operative globali compatte: Project Index come mappa primaria, contratti, budget e verifica proporzionata |
| [AUTH_TRIAL_PLAN.md](AUTH_TRIAL_PLAN.md) | Il piano da cui nasce la porta d'accesso — account email/password, prova di 45 minuti, beta illimitata — con in testa l'esito: cosa è stato realizzato, cosa è cambiato rispetto al piano e cosa resta scoperto |
| [CHANGELOG.md](CHANGELOG.md) | Gli ultimi tredici incrementi; i precedenti in `docs/changelog/`, cercabili per titolo dal suo README |
| [index.html](index.html) | Pagina unica, `#app`, monta `src/boot.ts` |
| [LICENSE](LICENSE) | Licenza proprietaria, tutti i diritti riservati: cosa non e' concesso, cosa si', terze parti (in inglese) |
| [package.json](package.json) | Script npm a livelli: test normali prima delle sentinelle lente seriali, percorso locale fail-fast, Builder mirato e profilo oltre soglia |
| [product.md](product.md) | Scheda di prodotto per il marketing: cos'e', cosa fa il giocatore, cosa lo distingue, a chi serve e stato dichiarato dell'alpha |
| [ROADMAP.md](ROADMAP.md) | Direzione del prodotto, milestone e gate: le fasi aperte per intero, quelle chiuse ridotte al loro elenco con il ragionamento in `docs/roadmap/` |
| [scripts/docs-merge.mjs](scripts/docs-merge.mjs) | `npm run docs:merge`: fonde i frammenti di `docs/pending/` nel changelog e nella scheda d'indice che ha la sezione dichiarata, con lucchetto per non pestarsi fra agenti |
| [scripts/free-port.mjs](scripts/free-port.mjs) | Hook `prestart`/`predev`: libera la porta del dev server terminando le istanze node rimaste |
| [scripts/project-locate.mjs](scripts/project-locate.mjs) | `npm run locate -- <termine>`: cerca righe su radice e schede del Project Index insieme, raggruppa per scheda e sezione e limita l'output |
| [shotkit.config.mjs](shotkit.config.mjs) | Ricette di cattura per gli scatti di riferimento in `.shots/` |
| [src/auth/access.ts](src/auth/access.ts) | Cosa può fare chi sta davanti allo schermo, dedotto dalla sola risposta del server: stato d'accesso, lettura difensiva della risposta di rete, e il conto alla rovescia ancorato ai secondi che il server ha dichiarato invece che all'orologio locale. Puro: il tempo entra come parametro | `AccessState`, `AccessSnapshot`, `accessState`, `mayEnter`, `parseSnapshot`, `startClock`, `clockSecondsLeft`, `formatCountdown` |
| [src/auth/AuthGate.ts](src/auth/AuthGate.ts) | Il buttafuori: chi entra, quando, e cosa vede chi aspetta. Decide senza disegnare — riceve una vista e le dice cosa mostrare — quindi si prova con una schermata finta. La prova si accende al «Play» e non all'accesso, e il cronometro si ancora alla risposta del server | `AuthGate`, `AuthGateView`, `AuthGateHandlers`, `AuthGateOptions` |
| [src/auth/authScreen.css](src/auth/authScreen.css) | Quello che la porta aggiunge a `titleScreen.css`: campi con l'etichetta sopra, i due gesti affiancati, la riga d'esito, e il badge del tempo in alto al centro — l'unica banda che l'HUD si è tenuta libera. Si carica prima di `main.ts`, quindi i colori sono scritti e non derivati |
| [src/auth/AuthScreen.ts](src/auth/AuthScreen.ts) | La porta in DOM puro, vestita da `titleScreen.css` come il titolo e il menu di pausa: accesso, registrazione, conferma, recupero password, password nuova, prova scaduta e build senza chiavi. Le sottoschermate si costruiscono una volta e si accendono, così un giro di rete non butta via quello che si è scritto nei campi | `AuthScreen`, `AuthScreenHandlers` |
| [src/auth/AuthScreenModel.ts](src/auth/AuthScreenModel.ts) | Le sottoschermate in TypeScript puro e cosa si può scrivere nei campi: convalida di indirizzo e password — più severa del minimo del server — e la traduzione di un rifiuto di Supabase in una frase leggibile, senza far passare il testo del server. Testato in `node` | `AuthPane`, `MIN_PASSWORD_LENGTH`, `authPaneFor`, `emailProblem`, `passwordProblem`, `authErrorText`, `verifyNote`, `expiredNote` |
| [src/auth/backend.ts](src/auth/backend.ts) | Il confine fra la porta e il servizio che la sostiene: l'interfaccia che rende il comportamento provabile senza rete, l'esito di una registrazione e la riduzione di un errore qualunque alla forma che si sa raccontare | `AuthBackend`, `AccessRequestKind`, `AuthEvent`, `SignUpOutcome`, `asAuthError` |
| [src/auth/config.ts](src/auth/config.ts) | Le due sole informazioni che il browser deve sapere di Supabase, lette dal build: `null` quando non ci sono è una risposta, non un guasto, e la pagina lo dice invece di mostrare un modulo che non può funzionare | `AuthConfig`, `AuthEnv`, `readAuthConfig` |
| [src/auth/install.ts](src/auth/install.ts) | Monta la porta e la lascia lavorare: è il solo file di `src/auth/` che tocca il documento, ed esiste perché `boot.ts` resti l'ingresso che decide quando nasce il mondo. Da qui escono la promessa che si è pronti e la domanda «si entra?» da rifare al momento del «Play» | `installAuthGate`, `AuthGateHandle` |
| [src/auth/supabaseBackend.ts](src/auth/supabaseBackend.ts) | La porta appoggiata a Supabase: l'unico file che importa `@supabase/supabase-js`, e l'unico che parla con le funzioni del database. Non decide niente — traduce chiamate e riconosce risposte, e quando non le riconosce lo dice invece di inventare uno stato | `createSupabaseBackend` |
| [src/auth/TrialBadge.ts](src/auth/TrialBadge.ts) | Il tempo rimasto mentre si gioca: una pastiglia in alto al centro che sopravvive al passaggio dal titolo alla partita. Per l'accesso beta mostra lo stato e non il conto alla rovescia | `TrialBadge` |
| [src/boot.ts](src/boot.ts) | Ingresso della pagina: **passa dalla porta d'accesso prima di tutto**, poi decide fra titolo e partita, tiene lo storage degli slot, riscrive il seed nell'indirizzo e carica `main.ts` con un import dinamico soltanto dopo la scelta. Nessuno dei due `import('./main')` è raggiungibile senza `allowEntry()`, che è anche il momento in cui la prova si accende |
| [src/shell/actionLabels.ts](src/shell/actionLabels.ts) | Le righe che il cursore mostra prima di un click e i motivi di un rifiuto: funzioni pure, senza scena ne' HUD |
| [src/shell/debugHooks.ts](src/shell/debugHooks.ts) | Gli hook globali dell'harness — `__voxelStats`, `__growStats`, `__simTick`, `__terrainExpand` e gli altri — registrati in un posto solo: `__voxelStats` e' la lettura del pannello di render, `__growStats` porta il profilo delle passate |
| [src/shell/demolishGesture.ts](src/shell/demolishGesture.ts) | La gomma, unico strumento in due tempi: ancora, striscio e rilascio, con il riquadro a terra e i tappeti sui tetti |
| [src/shell/entryDrop.ts](src/shell/entryDrop.ts) | La comparsa della prima isola: i chunk che scendono dal cielo, la pioggia di cubetti e la quota di partenza letta dal frustum |
| [src/shell/frameStats.ts](src/shell/frameStats.ts) | Le letture di misura per overlay, riepilogo console e hook globali: traduzioni, non decisioni. `overlay()` non prende argomenti, main e render li legge da `FrameBreakdown` |
| [src/shell/infoViewScene.ts](src/shell/infoViewScene.ts) | La vista informativa accesa sopra la citta': quale, e chi ricostruisce la heatmap quando il campo cambia |
| [src/shell/placementTools.ts](src/shell/placementTools.ts) | Lo strumento in mano e cio' che il puntatore ne fa: mirino, rifiuti, posa di catalizzatori, mensole, funivie e settori |
| [src/shell/plotBlockers.ts](src/shell/plotBlockers.ts) | Le caselle gia' prese mentre un monumento e' in mano: rosso fioco su ogni monumento in piedi, rosso pieno e ambra su chi ferma il riquadro sotto il puntatore. Due chiavi, una per lo strumento e una per la colonna |
| [src/shell/pointerPick.ts](src/shell/pointerPick.ts) | Dal pixel alla colonna: raggio del cursore, terra su cui si costruisce e cosa si sta indicando, con un raycaster solo |
| [src/shell/saveSlots.ts](src/shell/saveSlots.ts) | Il ritmo del salvataggio visto dalla radice: automatico a intervallo, slot a mano, apertura che passa da un ricaricamento |
| [src/shell/selectionScene.ts](src/shell/selectionScene.ts) | Cio' che il giocatore ha scelto: scheda, contorno in-world, campo del landmark e artefatto del coach, che scrivono la stessa superficie |
| [src/shell/streetEye.ts](src/shell/streetEye.ts) | La discesa a terra: armarla, posare l'occhio, risalire, e le conseguenze del cambio di modo su qualita' e post-processing |
| [src/shell/swatchScene.ts](src/shell/swatchScene.ts) | Il campionario di `?scene=swatch`: soggetto sotto il cursore, scelta persistente, referto del voxel e inquadratura delle fasce |
| [supabase/migrations/20260930000000_access.sql](supabase/migrations/20260930000000_access.sql) | Tabelle `access_grants` e `access_requests` e le funzioni `access_snapshot`, `start_trial`, `request_access`, `trial_length`: è qui l'autorità su chi entra, con RLS accesa e nessun permesso di scrittura al browser. La chiave è l'email normalizzata, non l'id dell'account, così riscriversi con lo stesso indirizzo non regala altri 45 minuti |
| [supabase/README.md](supabase/README.md) | La guida passo per passo per chi configura: creare il progetto, eseguire la migration, accendere la conferma email e l'SMTP, gli indirizzi di ritorno, le chiavi sul server, il deploy e i controlli a schermo. Più promuovere un beta e cancellare un account |
| [tsconfig.json](tsconfig.json) | `strict` + flag extra; `noUncheckedIndexedAccess` off di proposito |
| [vidkit.config.mjs](vidkit.config.mjs) | Scene del video dimostrativo in `.videos/`: cinque clip dal seed alla notte |
| [vite.config.ts](vite.config.ts) | Vite + Vitest insieme; worker ES, ambiente `node` e segnalazione standard dei test oltre un secondo |
| [src/main.ts](src/main.ts) | Composition root e ciclo di frame a budget: monta gli strati, li cabla fra loro e non possiede piu' input, scelta ne' misura |

## Documentazione operativa

Caricato sempre: soltanto [CLAUDE.md](CLAUDE.md). [AGENTS.md](AGENTS.md) **non**
arriva da solo — si apre per primo, prima di scrivere. Tutto il resto si apre a
domanda: è ciò che tiene basso il contesto di partenza.

| File | Ruolo | Caricato |
| --- | --- | --- |
| [AGENTS.md](AGENTS.md) | **Fonte unica e compatta** di comandi, convenzioni, contratti, budget e definizione di "finito" | per primo, a mano |
| [CLAUDE.md](CLAUDE.md) | Puntatore: dove stanno le regole, le tre che non aspettano, e cosa si sbaglia facilmente | sempre |
| [docs/changelog/](docs/changelog/) | Il changelog archiviato in schede da 55.000 caratteri, piu' l'elenco per titolo di ogni incremento in `docs/changelog/README.md` | a domanda |
| [docs/engine/microgeometry.md](docs/engine/microgeometry.md) | Il catalogo delle micro-ricette architettoniche, additive e riduttive: aggancio, asse di corsa, materiale, box in sedicesimi e costo in quad, per residenziale, commerciale, industriale e civico. Cosa e' gia' implementato e cosa resta a catalogo |
| [docs/game/milestones.md](docs/game/milestones.md) | Sblocco progressivo dei diciannove ruoli: la scala derivata dalle soglie che il gioco gia' usa, le condizioni proprie dei landmark, e il freno sui fondi che l'ha dovuta precedere — con i numeri della partita misurata | a domanda |
| [docs/index/](docs/index/) | Le schede del Project Index, una per area: le righe file per file di `src/`, con `npm run locate` che le cerca tutte insieme | a domanda |
| [docs/pending/README.md](docs/pending/README.md) | Formato dei frammenti di indice e changelog, e perché si scrive lì invece che nei due file | a domanda |
| [docs/roadmap/](docs/roadmap/) | Il ragionamento delle fasi chiuse, una scheda per fase, piu' l'indice in `docs/roadmap/README.md`. Le attivita' restano in `ROADMAP.md` | a domanda |
| [docs/world/aerial-city.md](docs/world/aerial-city.md) | Contratti e motivazioni della citta' in quota |
| [docs/world/arcology.md](docs/world/arcology.md) | Contratti e casi limite delle arcologie |
| [docs/world/farms.md](docs/world/farms.md) | Contratti della campagna e dei lotti agricoli |
| [docs/world/grading-water.md](docs/world/grading-water.md) | Contratti delle opere di terra e dell'acqua |
| [docs/world/harbor.md](docs/world/harbor.md) | Contratti e casi limite del distretto costiero | a domanda |
| [docs/world/landmarks-revamp.md](docs/world/landmarks-revamp.md) | Guida alle ricette di landmark ancora da rifare: chi puo' crescere di sedime e chi no, la scala proposta ruolo per ruolo, i vincoli che i test impongono | a domanda |
| [docs/world/README.md](docs/world/README.md) | Indice dei contratti di design di `src/world/` caricati per dominio |
| [docs/world/rooftop-landmarks.md](docs/world/rooftop-landmarks.md) | Contratti dei landmark posati sugli edifici |
| [docs/world/ropeway.md](docs/world/ropeway.md) | Contratti della funivia e della fune non voxel |
| [docs/world/scenes.md](docs/world/scenes.md) | Contratti delle scene deterministiche e del campionario |
| [docs/world/streets-buildings.md](docs/world/streets-buildings.md) | Contratti condivisi da strade, siti ed edifici |
| [docs/world/terrain.md](docs/world/terrain.md) | Contratti, dimostrazioni e casi limite del terreno |
| [docs/world/traffic.md](docs/world/traffic.md) | Contratti delle rotte e dei mezzi non voxel |
| [src/engine/AGENTS.md](src/engine/AGENTS.md) | Contratti compatti per renderer, mesher, palette, luce, pass e caricamento iniziale | lavorando in `src/engine/` |
| [src/world/aerial/AGENTS.md](src/world/aerial/AGENTS.md) | Regole locali e riferimenti per la citta' in quota | lavorando in `src/world/aerial/` |
| [src/world/AGENTS.md](src/world/AGENTS.md) | Contratti comuni e routing delle regole di `src/world/` | lavorando in `src/world/` |
| [src/sim/AGENTS.md](src/sim/AGENTS.md) | Contratti della simulazione e verifica proporzionata ereditata dalla radice | lavorando in `src/sim/` |
| [.claude/skills/debug-harness/SKILL.md](.claude/skills/debug-harness/SKILL.md) | Parametri URL, hotkey e hook globali | `/debug-harness` |
| [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) | Mappa sintetica di dipendenze, punti di ingresso e flussi | a domanda |
| [CHANGELOG.md](CHANGELOG.md) | Storia degli incrementi, con i file toccati da ciascuno | a domanda |
| [src/world/arcology/AGENTS.md](src/world/arcology/AGENTS.md) | Regole locali e riferimenti per le arcologie | lavorando in `src/world/arcology/` |
| [src/world/buildings/AGENTS.md](src/world/buildings/AGENTS.md) | Routing dei contratti per costruzione e driver | lavorando in `src/world/buildings/` |
| [src/world/crossings/AGENTS.md](src/world/crossings/AGENTS.md) | Regole locali e riferimenti per gli attraversamenti | lavorando in `src/world/crossings/` |
| [src/world/farms/AGENTS.md](src/world/farms/AGENTS.md) | Regole locali e riferimenti per i lotti agricoli | lavorando in `src/world/farms/` |
| [src/world/footpaths/AGENTS.md](src/world/footpaths/AGENTS.md) | Regole locali del tessuto pedonale | lavorando in `src/world/footpaths/` |
| [src/world/grading/AGENTS.md](src/world/grading/AGENTS.md) | Regole locali e riferimenti per le opere di terra | lavorando in `src/world/grading/` |
| [src/world/harbor/AGENTS.md](src/world/harbor/AGENTS.md) | Regole locali e riferimenti per il distretto costiero | lavorando in `src/world/harbor/` |
| [src/world/landmarks/AGENTS.md](src/world/landmarks/AGENTS.md) | Routing dei contratti per ricette e piazzamento | lavorando in `src/world/landmarks/` |
| [src/world/roads/AGENTS.md](src/world/roads/AGENTS.md) | Regole locali del tracciato organico | lavorando in `src/world/roads/` |
| [src/world/ropeway/AGENTS.md](src/world/ropeway/AGENTS.md) | Regole locali e riferimenti per la funivia | lavorando in `src/world/ropeway/` |
| [src/world/scenes/AGENTS.md](src/world/scenes/AGENTS.md) | Regole locali e riferimenti per le scene | lavorando in `src/world/scenes/` |
| [src/world/sites/AGENTS.md](src/world/sites/AGENTS.md) | Regole locali e riferimenti per i vincoli di sito | lavorando in `src/world/sites/` |
| [src/world/skyline/AGENTS.md](src/world/skyline/AGENTS.md) | Regole locali e riferimenti per la gerarchia verticale | lavorando in `src/world/skyline/` |
| [src/world/spans/AGENTS.md](src/world/spans/AGENTS.md) | Routing dei contratti per campate e percorsi | lavorando in `src/world/spans/` |
| [src/world/streets/AGENTS.md](src/world/streets/AGENTS.md) | Regole locali e riferimenti per la rete stradale | lavorando in `src/world/streets/` |
| [src/world/terrain/AGENTS.md](src/world/terrain/AGENTS.md) | Regole locali e riferimenti per il terreno | lavorando in `src/world/terrain/` |
| [src/world/traffic/AGENTS.md](src/world/traffic/AGENTS.md) | Regole locali e riferimenti per il traffico | lavorando in `src/world/traffic/` |

## Le schede

Le righe file per file stanno in `docs/index/`, una scheda per area: aprirne una
costa fra i tre e i sette mila token, contro i trenta di un indice unico. Chi cerca
un nome preciso non ne apre nessuna — `npm run locate` le legge tutte per lui.

| Scheda | Cosa contiene | Costo |
| --- | --- | --- |
| [docs/index/world.md](docs/index/world.md) | `src/world/` e `terrain/`, `streets/`, `grading/`, `farms/`, `sites/`, `harbor/`: storage voxel, isola, strade, opere di terra, campagna, vincoli di sito e porto | ~6k |
| [docs/index/structures.md](docs/index/structures.md) | `buildings/`, `arcology/`, `landmarks/`, `skyline/`: ciò che cresce sul suolo e la sua gerarchia verticale | ~7k |
| [docs/index/mobility.md](docs/index/mobility.md) | `aerial/`, `spans/`, `crossings/`, `ropeway/`, `traffic/`: ciò che collega, in quota e in movimento | ~4k |
| [docs/index/engine.md](docs/index/engine.md) | `src/engine/` con `mesher/` e `themes/`: renderer, meshing, materiali, cielo, luce, camera, qualità adattiva | ~5k |
| [docs/index/sim-game.md](docs/index/sim-game.md) | `src/sim/` e `src/game/`: tick, desiderabilità, decisioni; passo fisso, azioni, salvataggio, crescita | ~4k |
| [docs/index/ui.md](docs/index/ui.md) | `src/ui/`, `src/audio/` e i parametri d'indirizzo: pannelli in DOM e canvas puri, suono sintetizzato, modelli testabili in `node` | ~3k |

Una riga nuova va nella scheda dell'area, con lo stesso frammento di
`docs/pending/` di sempre: `npm run docs:merge` cerca la sezione dichiarata in
tutte le schede e scrive quella giusta.
