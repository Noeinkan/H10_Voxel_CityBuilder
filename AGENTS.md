# H10 Voxel City Builder

Motore voxel a chunk per una citta' isometrica. Integra mondo procedurale,
greedy meshing in worker, rendering Three.js, simulazione a tick e crescita
automatica degli edifici. `src/main.ts` compone i moduli e funge da harness di
debug e misura.

Questo file e' la fonte unica di comandi, convenzioni e contratti. Le regole di
`src/engine/`, `src/world/` e `src/sim/` stanno nei rispettivi `AGENTS.md` e si
caricano quando lavori in quella cartella: non ripeterle qui.

## Stack

- TypeScript 5.9 strict, moduli ES, target ES2022
- Three.js 0.180; Vite 7; Vitest 3 in ambiente Node
- Web Worker ES per meshing e terreno; `simplex-noise` per la generazione

## Mappa rapida

- `src/world/`: storage voxel, scene, terreno, strade ed edifici
- `src/engine/`: meshing, worker, palette, temi, camera e renderer
- `src/sim/`: stato e simulazione pura per colonna `(x, y)`
- `src/game/`: ciclo a passo fisso; `src/ui/`: HUD e overlay di debug
- `src/main.ts`: unico composition root e ciclo di frame
- `docs/PROJECT_MAP.md`: dipendenze e punti di ingresso
- `PROJECT_INDEX.md`: indice dettagliato file per file

## Comandi

```bash
npm install
npm start            # = npm run dev, ma prima libera la porta 8020
npm run dev          # http://localhost:8020/?debug=1
npm run build        # typecheck + build Vite in dist/
npm run preview      # http://localhost:8011/
npm test             # suite intera; vedi "Verifica proporzionata"
npm run test:changed
npm run test:related
npm run test:watch
npm run bench
npm run typecheck
```

`prestart`/`predev` passano da `scripts/free-port.mjs`, che termina l'istanza
node rimasta sulla 8020: `strictPort` fa fallire l'avvio invece di scivolare su
un'altra porta. Se la porta la tiene un programma estraneo, lascia fallire vite.

Non esiste uno script `lint` o un formatter configurato: non inventarne uno.

## Verifica proporzionata

La suite intera e' 134 file e 1482 test: **207 s misurati su questa macchina.**
E' il prezzo giusto per consegnare, non per ogni riga che cambi. Mentre iteri usa
il cerchio stretto — sullo stesso repo, i test legati a un singolo file sorgente
sono 4 file e 8 s.

```bash
npm run test:changed                             # i test toccati dalle modifiche non committate
npm run test:related -- src/engine/daylight.ts   # ...quelli legati a file che scegli tu
npm test -- src/sim                              # una cartella, se sai gia' dove guardare
```

I primi due non filtrano per nome: risalgono il grafo degli import, quindi un
test che arriva al file che hai toccato entra anche se sta in un'altra cartella
— `daylight.ts` ne tira dentro quattro. E' questo che li rende sostituti onesti
della suite e non scorciatoie.

`test:changed` costa quanto e' larga la tua modifica, ed e' giusto cosi': se hai
toccato `src/sim/index.ts` o `main.ts` ti ridara' tutti e 134 i file, perche'
davvero dipendono da li'. Quando succede, non e' il comando che ha sbagliato.

C'e' un secondo motivo per non lanciarla a ogni giro, oltre al tempo: **sotto
contesa di CPU la suite intera produce falsi fallimenti.** Due run consecutive
sulla stessa identica working tree hanno dato 3 test rossi con quattro errori di
timeout la prima, 1482 verdi la seconda. E' la stessa contesa per cui
`testTimeout` sta a 30 s (vedi il commento in `vite.config.ts`). Un rosso
comparso dopo una modifica che non c'entra niente merita una seconda run prima
di inseguirlo.

Restano fuori dal grafo i due worker, che si caricano per URL e non per import
(`mesher.worker.ts`, `terrain.worker.ts`): se tocchi loro o il protocollo dei
messaggi, il cerchio stretto non se ne accorge e serve la suite.

`npm test` usa il reporter `dot`: una riga per file erano 134 righe di output
per dire che andava tutto bene. I fallimenti si vedono per esteso come prima.

## Convenzioni

- Codice, commenti, documentazione e commit in italiano; identificatori in
  inglese. I commenti spiegano il perche', non il comportamento evidente.
- Quando l'utente chiede perche' una funzionalita' non si comporta nel modo
  descritto, interpreta la formulazione come richiesta di correggerla subito,
  senza chiedere prima conferma. Fanno eccezione solo ambiguita' sostanziali,
  azioni distruttive o cambiamenti che richiedono nuova autorizzazione.
- Mantieni lo stile vicino: due spazi, apici singoli, punto e virgola e trailing
  comma dove gia' usata. Usa `import type` per i soli tipi.
- Oltre a `strict`: `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax`.
- Test co-locati come `*.test.ts`; benchmark come `*.bench.ts`.
- Dentro `src/sim/` usa import diretti; da fuori usa `src/sim/index.ts`.
- Mondo Z-up: `x` est, `y` nord, `z` altezza; coordinate negative valide.
- Chunk `32x32x32`, chiave `"cx,cy,cz"`; simulazione e terreno sono per colonna.

## Contratti da preservare

1. Il renderer legge solo `Chunk.blocks`; `Chunk.data` appartiene alla simulazione.
2. Solo `setBlock` invalida geometria; `setData` non marca chunk sporchi.
3. Non sostituire gli `Uint8Array` di un chunk dopo la costruzione.
4. Colori solo nelle uniform: le mesh hanno `aPalette` e `aFace`, mai RGB.
   `aShade` e' un byte geometrico — AO per corner nei due bit bassi (0..3),
   visibilita' del cielo della faccia nei due alti (0..3) — non un colore.
   Cambiare palette o tema non deve mai provocare un rebuild di mesh.
5. La palette ha esattamente 32 slot; riusa gli indici di `paletteSlots.ts`.
   Per la stessa ragione i tipi di superficie sono **otto e basta**: i tre bit
   alti di `visualBlock` sono tutti impegnati, e prenderne un quarto
   toglierebbe un bit alla palette. Le eccezioni sono due sovraccarichi
   dichiarati, non un nono tipo, e si riconoscono entrambi **prima** di leggere
   la superficie: su un voxel d'**acqua** quei tre bit portano `WATER_CLASS`
   invece di un linguaggio di facciata, perche' nessuno dei sette si applica a
   una lastra d'acqua e il frammento riconosce l'acqua dalla palette; su una
   **copertura del terreno** (`packCoverMark`) portano il tipo di erbetta, e li'
   la palette e' 0 — cioe' un byte che `packVisualBlock` non produce mai, quindi
   uno spazio libero per davvero e non un valore rubato a qualcuno.
6. Mesher e generatore di terreno non importano Three.js.
7. `src/sim/` non importa da `src/engine/` e non usa DOM o Three.js; non sa
   niente di come sono fatti gli edifici — la tipologia vive in
   `src/world/buildings/`.
8. `tick` resta puro, deterministico e non ricalcola la desiderabilita'.
9. Il campo ricalcola, non accumula, e solo nel rettangolo toccato.
10. Gli usi urbani sono **quattro e il loro ordine e' contratto**: residenziale,
    commerciale, industriale, civico. Ogni tupla indicizzata per uso — soglie di
    sito, pesi, `CLASS_PROFILE`, colori degli overlay — segue quest'ordine, e
    cambiarlo significa cambiarle tutte insieme.
11. Il terreno dipende solo da `(seed, shape, ccx, ccy)`.

## Dove stanno i numeri

Ogni costante di bilanciamento vive in un solo file per dominio. Se stai per
scrivere una soglia, una frequenza o un moltiplicatore altrove, quasi sempre e'
il posto sbagliato.

| Dominio | File unico |
| --- | --- |
| Terreno | `src/world/terrain/config.ts` |
| Strade | `src/world/streets/config.ts` |
| Opere di terra | `src/world/grading/config.ts` |
| Vincoli di sito | `src/world/sites/config.ts` |
| Lotti agricoli | `src/world/farms/config.ts` |
| Gerarchia verticale | `src/world/skyline/config.ts` |
| Campate e rete in quota | `src/world/spans/config.ts` |
| Citta' in quota | `src/world/aerial/config.ts` |
| Arcologie | `src/world/arcology/config.ts` |
| Simulazione | `src/sim/balance.ts` |
| Costruzione e tipologie | `src/world/buildings/config.ts` |
| Palette | `src/engine/palette.json` + `paletteSlots.ts` |
| Temi | `src/engine/themes/` — un file per tema, colori piu' atmosfera |
| Modello di luce | `src/engine/lighting.ts` — sole, ambiente, luminanza per faccia |
| Finestre di notte | `src/engine/nightWindows.ts` — quota accesa, carattere della torre, guadagno notturno |
| Viste di ispezione | `src/engine/inspect.ts` — densita' del velo, passo della rigatura, quota |
| Lente dei raggi X | `src/engine/xray.ts` — respiro, profondita', gabbia sul filo del voxel |
| Caduta d'ingresso | `src/engine/introDrop.ts` — quota, durata, jitter, rimbalzo |
| Pioggia di cubetti | `src/engine/dropRain.ts` — semina per chunk, taglia, tetto dei vivi |

Non aggiornare a occhio le misure documentate nei README: sono verificate a mano
su questa macchina.

## Budget e pattern da evitare

- Lavoro non-render sotto 3 ms per frame (accettazione: 4 ms); generazione 1,5
  ms. Spezza generazione, upload e ricolore su piu' frame. Ombra e
  post-processing sono spesa GPU e restano fuori dal budget.
- **Unica eccezione: la prima scena.** Finche' non esiste, quel budget protegge
  un frame che non ha niente da proteggere, e misurare a 1,5 ms qualche decimo di
  secondo di lavoro costa centinaia di frame di attesa. `main.ts` usa allora
  `LOADING_FRAME_BUDGET_MS` / `LOADING_GENERATION_BUDGET_MS`, sempre sotto il
  frame a 60 Hz perche' la scena deve comparire scorrendo. La finestra si chiude
  su `generator.done` e non si riapre: le espansioni avvengono dentro una citta'
  viva e tornano ai 3 ms.
- Simulazione a 10 tick/s a passo fisso con recupero limitato: non usare `dt`.
- Evita `Date.now()` e `Math.random()` nei percorsi deterministici.
- Non riattivare `noUncheckedIndexedAccess` senza discuterne (vedi il commento
  in `tsconfig.json`).
- Non modificare `dist/` o `node_modules/`.
- Se aggiungi file, non scrivere a mano in `PROJECT_INDEX.md` ne' in
  `CHANGELOG.md`: lascia un frammento in `docs/pending/` e fondilo con
  `npm run docs:merge` (istruzioni in `docs/pending/README.md`). Il README di
  modulo invece si aggiorna direttamente.
- **Oltre ~600 righe un file va spezzato prima di aggiungerci altro.** Non e'
  estetica: il semaforo fra agenti prende il lock **per path**, e finche' ci
  scrivi sopra lo rinnovi — un file grande e' un file su cui si lavora a lungo,
  quindi il possesso dura quanto il lavoro e ogni riga di troppo si paga in
  attesa di qualcun altro. La linea di taglio e' *lungo
  cosa si lavora separatamente* — gli shader stanno in `engine/shaders/` perche'
  scrivere GLSL e scrivere l'handle sono due lavori, non perche' sia piu'
  elegante — e non lungo l'astrazione migliore sulla carta. Il numero non e'
  arbitrario: i file che lo superano sono esattamente quelli in cima alla
  classifica di contesa misurata su `git log --name-only`.

## Harness di debug

Parametri URL, hotkey e hook globali stanno nella skill `debug-harness`
(`/debug-harness`). Se aggiungi una metrica, falla passare **sia** dall'overlay
sia dall'hook globale: leggono la stessa fonte.

## Definizione di completamento

1. Aggiungi o aggiorna test per comportamento, contratti e casi limite toccati.
2. Esegui `npm run typecheck` e, **una volta sola a fine lavoro**, `npm test`
   intero. Mentre iteri basta il cerchio stretto: vedi "Verifica proporzionata".
3. Per bundle o worker esegui anche `npm run build`.
4. Per percorsi caldi esegui il benchmark pertinente e segnala che le tabelle
   di misura richiedono verifica manuale.
5. Per modifiche visuali verifica `?debug=1`, overlay e budget pertinenti.
6. Scrivi il tuo frammento in `docs/pending/` e lancia `npm run docs:merge`. Se
   la fusione non passa perche' l'indice e' occupato, consegna lo stesso: il
   frammento resta li' e lo fonde il prossimo che passa.

@RTK.md
