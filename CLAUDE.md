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
"finito" stanno in [AGENTS.md](AGENTS.md)**, che si carica insieme a questo file.
Non cercarli qui e non duplicarli: se una regola vale sempre, il suo posto è lì.

Il resto si carica quando serve, e questo è deliberato:

| Serve quando | Dove |
| --- | --- |
| Lavori in una cartella di `src/` | `src/engine/AGENTS.md`, `src/world/AGENTS.md`, `src/sim/AGENTS.md` |
| Ti serve overlay, hotkey o un parametro URL | skill `/debug-harness` |
| Cerchi *dove sta* un file o un export | [PROJECT_INDEX.md](PROJECT_INDEX.md) |
| Cerchi *perché* una scelta è stata fatta | [README.md](README.md), [src/sim/README.md](src/sim/README.md) |
| Cerchi *cosa* è cambiato e quando | [CHANGELOG.md](CHANGELOG.md) |
| Cerchi dove va il progetto | [ROADMAP.md](ROADMAP.md) |

Nessuno di questi è caricato all'avvio. Aprili quando il compito lo richiede,
non "per contesto".

## Cose che si sbagliano facilmente

- **Prosa in italiano, identificatori in inglese.** Vale per commenti,
  documentazione e messaggi di commit. I commenti esistenti spiegano *perché*,
  non *cosa*: segui lo stesso registro.
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
  dalle decisioni della simulazione, ma pathfinding, salvataggio e audio non
  esistono. Non assumere che ci siano.
- **`PROJECT_INDEX.md` e `CHANGELOG.md` non si scrivono a mano.** Aggiungendo un
  file, o chiudendo un incremento, lascia un frammento in `docs/pending/` e
  fondilo con `npm run docs:merge`: sono i due file che tutti aggiornano nello
  stesso istante, ed erano quasi un terzo dei rifiuti del semaforo. Il README di
  sezione invece, se è una superficie pubblica, si aggiorna direttamente.

## Compattazione

Quando compatti, conserva l'elenco completo dei file modificati, i comandi di
verifica già eseguiti e il loro esito.
