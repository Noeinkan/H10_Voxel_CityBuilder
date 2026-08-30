# CLAUDE.md

Motore di rendering voxel a chunk per una città isometrica, in TypeScript +
Three.js + Vite. Strati indipendenti che non si conoscono fra loro:

- `src/world/` — storage voxel sparso, terreno, strade, opere di terra, edifici
- `src/engine/` — meshing, materiale, cielo, luce, camera, qualità adattiva
- `src/sim/` — simulazione a tick (risorse, desiderabilità, decisioni)
- `src/game/` — regole di gioco: passo fisso, azioni, crescita. Non conosce l'engine
- `src/ui/` — HUD e overlay in DOM e canvas puri

`src/main.ts` è l'unico punto che li mette insieme, e serve da harness di misura.

## Dove stanno le regole

**Comandi, convenzioni, contratti da preservare, budget e definizione di
"finito" stanno in [AGENTS.md](AGENTS.md)**, e non cercarli qui: se una regola
vale sempre, il suo posto è lì. Ma **AGENTS.md non arriva da solo in contesto** —
questo file sì —: aprilo prima della prima scrittura, non a valle di un dubbio.

Le tre regole che, se restano fuori, costano più della lettura:

1. **Non lanciare la suite completa di tua iniziativa**, nemmeno per chiudere.
   Vitest apre un worker per core e mette in coda ogni altro agente sul repo:
   con tre run in parallelo una sola ha superato i venti minuti senza finire. Il
   default è `npm run typecheck` più `npx vitest run <i file che coprono ciò che
   hai toccato>`, o `test:related -- <sorgenti>` se non sai quali siano. La
   suite intera è un evento coordinato: la chiede l'utente, o la proponi e
   aspetti. `test:fast` non è una scorciatoia: esclude un file su 189.
2. **`npm run locate -- <termine>` prima di esplorare**, `rg` dopo per
   confermare i chiamanti: cerca sulla radice del Project Index e su tutte le
   schede di `docs/index/` insieme, e dice da quale viene ogni riga. Se proprio
   devi leggere, leggi **una** scheda, non tutte.
3. **Prosa in italiano, identificatori e stringhe a schermo in inglese.**

Il resto si carica quando serve, e questo è deliberato:

| Serve quando | Dove |
| --- | --- |
| Lavori in una cartella di `src/` | `src/engine/AGENTS.md`, `src/world/AGENTS.md`, `src/sim/AGENTS.md` |
| Ti serve overlay, hotkey o un parametro URL | skill `/debug-harness` |
| Cerchi *dove sta* un file o un export | `npm run locate -- <termine>`; le righe stanno in [docs/index/](docs/index/), instradate da [PROJECT_INDEX.md](PROJECT_INDEX.md) |
| Cerchi *perché* una scelta è stata fatta | [README.md](README.md), [src/sim/README.md](src/sim/README.md) |
| Cerchi *cosa* è cambiato e quando | [CHANGELOG.md](CHANGELOG.md) per gli ultimi tredici incrementi; prima di quelli, cerca il titolo in [docs/changelog/README.md](docs/changelog/README.md) |
| Cerchi dove va il progetto | [ROADMAP.md](ROADMAP.md) |

Nessuno di questi è caricato all'avvio. Aprili quando il compito lo richiede,
non "per contesto".

## Cose che si sbagliano facilmente

- **I commenti esistenti spiegano *perché*, non *cosa***: segui lo stesso
  registro, in italiano come loro.
- **Le tabelle di misura in `README.md` e `src/sim/README.md` sono verificate a
  mano su questa macchina.** Se tocchi il percorso caldo, dillo invece di
  aggiornare i numeri a occhio.
- **I test girano in ambiente `node`**: niente jsdom, niente GPU. Il codice
  testabile non deve importare Three.js né toccare il DOM.
- **Il terreno si riempie, non si scava.** Un'opera di `src/world/grading/`
  aggiunge volume e non ne toglie mai: prima di piegare una quota, guarda se il
  piano di opera la risolve già.
- **La rete stradale è una funzione pura del seed**, non uno stato. Non c'è
  niente da salvare né da invalidare quando arriva un catalizzatore: se ti serve
  un ruolo o un isolato, chiedilo, non tenerlo da parte.
- **Non c'è ancora un gioco completo**: il builder piazza edifici automatici
  dalle decisioni della simulazione, ma pathfinding e audio non esistono. Non
  assumere che ci siano.
- **Il salvataggio c'è, e non serializza ciò che sa ricostruire.** In
  `src/game/save/` finiscono seed, stato della simulazione e record del registro;
  terreno, strade e campo di desiderabilità si rifanno al caricamento perché sono
  funzioni pure. Se aggiungi una struttura che il registro conta, chiediti se
  `recordStamp` sa ridisegnarla dal solo record: se non lo sa, la cattura la pota
  insieme a chi ci poggia sopra.
- **Il Project Index e `CHANGELOG.md` non si scrivono a mano.** Aggiungendo un
  file di produzione, o chiudendo un incremento, lascia un frammento in
  `docs/pending/` e fondilo con `npm run docs:merge`: dichiari la sezione, e la
  fusione trova da sé la scheda di `docs/index/` in cui vive. Sono i file che
  tutti aggiornano nello stesso istante, ed erano quasi un terzo dei rifiuti del
  semaforo. **Un `*.test.ts` non ha riga d'indice**: sta accanto a ciò che copre
  e lo trova `test:related`. Il README di sezione invece, se è una superficie
  pubblica, si aggiorna direttamente.

## Compattazione

Quando compatti, conserva l'elenco completo dei file modificati, i comandi di
verifica già eseguiti e il loro esito.
