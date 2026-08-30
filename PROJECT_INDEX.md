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
| [AGENTS.md](AGENTS.md) | Regole operative globali compatte: Project Index come mappa primaria, contratti, budget e verifica proporzionata |
| [CHANGELOG.md](CHANGELOG.md) | Gli ultimi tredici incrementi; i precedenti in `docs/changelog/`, cercabili per titolo dal suo README |
| [index.html](index.html) | Pagina unica, `#app`, monta `src/boot.ts` |
| [LICENSE](LICENSE) | Licenza proprietaria, tutti i diritti riservati: cosa non e' concesso, cosa si', terze parti (in inglese) |
| [package.json](package.json) | Script npm a livelli: test normali prima delle sentinelle lente seriali, percorso locale fail-fast, Builder mirato e profilo oltre soglia |
| [PERFORMANCE.md](PERFORMANCE.md) | Piano prestazioni: dove sta il tempo misurato, le fasi per rientrare nel budget del frame e i contatori con cui si difende |
| [product.md](product.md) | Scheda di prodotto per il marketing: cos'e', cosa fa il giocatore, cosa lo distingue, a chi serve e stato dichiarato dell'alpha |
| [ROADMAP.md](ROADMAP.md) | Direzione del prodotto, milestone e gate dei prossimi incrementi |
| [scripts/docs-merge.mjs](scripts/docs-merge.mjs) | `npm run docs:merge`: fonde i frammenti di `docs/pending/` nel changelog e nella scheda d'indice che ha la sezione dichiarata, con lucchetto per non pestarsi fra agenti |
| [scripts/free-port.mjs](scripts/free-port.mjs) | Hook `prestart`/`predev`: libera la porta del dev server terminando le istanze node rimaste |
| [scripts/project-locate.mjs](scripts/project-locate.mjs) | `npm run locate -- <termine>`: cerca righe su radice e schede del Project Index insieme, raggruppa per scheda e sezione e limita l'output |
| [shotkit.config.mjs](shotkit.config.mjs) | Ricette di cattura per gli scatti di riferimento in `.shots/` |
| [src/boot.ts](src/boot.ts) | Ingresso della pagina: decide fra titolo e partita, tiene lo storage degli slot, riscrive il seed nell'indirizzo e carica `main.ts` con un import dinamico soltanto dopo la scelta |
| [tsconfig.json](tsconfig.json) | `strict` + flag extra; `noUncheckedIndexedAccess` off di proposito |
| [vite.config.ts](vite.config.ts) | Vite + Vitest insieme; worker ES, ambiente `node` e segnalazione standard dei test oltre un secondo |
| [src/main.ts](src/main.ts) | Bootstrap, ciclo di frame a budget, input di gioco e hook globali di debug |

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
| [docs/index/](docs/index/) | Le schede del Project Index, una per area: le righe file per file di `src/`, con `npm run locate` che le cerca tutte insieme | a domanda |
| [docs/pending/README.md](docs/pending/README.md) | Formato dei frammenti di indice e changelog, e perché si scrive lì invece che nei due file | a domanda |
| [docs/world/aerial-city.md](docs/world/aerial-city.md) | Contratti e motivazioni della citta' in quota |
| [docs/world/arcology.md](docs/world/arcology.md) | Contratti e casi limite delle arcologie |
| [docs/world/farms.md](docs/world/farms.md) | Contratti della campagna e dei lotti agricoli |
| [docs/world/grading-water.md](docs/world/grading-water.md) | Contratti delle opere di terra e dell'acqua |
| [docs/world/harbor.md](docs/world/harbor.md) | Contratti e casi limite del distretto costiero | a domanda |
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
| [src/world/grading/AGENTS.md](src/world/grading/AGENTS.md) | Regole locali e riferimenti per le opere di terra | lavorando in `src/world/grading/` |
| [src/world/harbor/AGENTS.md](src/world/harbor/AGENTS.md) | Regole locali e riferimenti per il distretto costiero | lavorando in `src/world/harbor/` |
| [src/world/landmarks/AGENTS.md](src/world/landmarks/AGENTS.md) | Routing dei contratti per ricette e piazzamento | lavorando in `src/world/landmarks/` |
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
| [docs/index/ui.md](docs/index/ui.md) | `src/ui/` e i parametri d'indirizzo: pannelli in DOM e canvas puri, modelli testabili in `node` | ~3k |

Una riga nuova va nella scheda dell'area, con lo stesso frammento di
`docs/pending/` di sempre: `npm run docs:merge` cerca la sezione dichiarata in
tutte le schede e scrive quella giusta.
