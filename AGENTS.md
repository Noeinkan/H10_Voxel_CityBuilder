# H10 Voxel City Builder

Motore voxel a chunk per una citta' isometrica: terreno procedurale, greedy
meshing in worker, rendering Three.js, simulazione a tick e crescita automatica.
`src/main.ts` e' l'unico composition root e harness di debug/misura.

Questo file contiene soltanto regole globali. Le eccezioni di
`src/engine/`, `src/world/` e `src/sim/` stanno nei rispettivi
`AGENTS.md` e si caricano lavorando in quelle cartelle.

## Stack e mappa

- TypeScript 5.9 strict, ES2022; Three.js 0.180; Vite 7; Vitest 3 in Node.
- `src/world/`: voxel, terreno, strade, edifici; `src/engine/`: meshing e
  rendering; `src/sim/`: simulazione pura; `src/game/`: ciclo e regole;
  `src/ui/`: HUD e debug.
- `docs/PROJECT_MAP.md`: dipendenze, entry point e posizione delle costanti.
- `PROJECT_INDEX.md`: responsabilita' ed export file per file.

## Project Index prima di cercare

- Prima di esplorare, interroga `PROJECT_INDEX.md` con
  `npm run locate -- <termine>`; apri soltanto le righe e i file pertinenti.
- Usa `rg` dopo l'indice per confermare chiamanti e working tree, non come
  discovery primaria a tentoni.
- Ogni modifica a codice, configurazione o struttura aggiorna nello stesso
  incremento le righe interessate del Project Index.
- Usa un frammento personale in `docs/pending/` e `npm run docs:merge`;
  non considerare concluso il lavoro finche' l'indice non descrive il risultato.

## Comandi

```bash
npm install
npm start            # dev server su http://localhost:8020/
npm run dev
npm run build        # typecheck + bundle
npm run preview      # http://localhost:8011/
npm run locate -- <termine>
npm run test:related -- <file-sorgente>
npm run test:changed
npm test             # solo nei casi globali indicati sotto
npm run bench
npm run typecheck
npm run docs:merge
```

`prestart`/`predev` liberano soltanto istanze node rimaste sulla 8020;
`strictPort` deve fallire se la porta appartiene ad altro. Non esistono lint
o formatter configurati: non inventarli.

## Ambiguita' e verifica a schermo

- Un termine spaziale o visivo ambiguo («sinistra», «lato lungo», «in fondo»)
  si chiarisce subito con una domanda secca, prima di toccare codice: il costo
  di una risposta sbagliata e' un refactor intero, non un minuto perso.
- Per «dove sta X a schermo» usa lo strumento empirico, mai la derivazione a
  mano: `__voxelSwatch(x?, y?)` con `?scene=swatch&debug=1` fa il raycast vero
  e risponde in secondi. La matematica della camera (cross-product, proiezioni)
  e' l'ultima spiaggia, non la prima.
- Se dopo due tentativi stai ancora cercando di stabilire lo stesso fatto senza
  riuscirci, fermati e chiedi. Niente cicli di derivazioni che non convergono.

## Verifica proporzionata

- Per TypeScript esegui `npm run typecheck` e il controllo piu' stretto che
  copre il rischio: test diretto, `test:related` o `test:changed`.
- Non lanciare automaticamente `npm test`: la suite completa serve soltanto
  per worker/protocolli invisibili al grafo degli import, modifiche trasversali
  non rappresentabili dai test mirati, configurazione globale di test/runtime o
  richiesta esplicita dell'utente.
- Se una suite sotto contesa fallisce per timeout estranei, ripeti soltanto i
  file falliti. Non ripetere tutta la suite se il difetto non e' globale.
- Per bundle o worker esegui anche `npm run build`; per percorsi caldi il
  benchmark pertinente. Le tabelle di misura richiedono verifica manuale.
- Per modifiche visuali verifica `?debug=1`, overlay e budget pertinenti.

## Working tree condiviso

- Prima di iniziare registra con `git status --short` i file gia' sporchi che
  non appartengono al tuo compito: un rosso che emerge in quei domini non va
  inseguito ne' riparato, solo segnalato. E' di un altro agente.
- Se un rosso tocca un file tuo, isolalo: `git stash push -- <i tuoi path>` e
  una re-run del singolo test. Se resta rosso anche senza le tue modifiche,
  era gia' rotto e non e' tuo.
- `test:changed` raccoglie i file modificati da chiunque, non solo dai tuoi
  incrementi: mescola i rossi altrui con i tuoi, quindi da solo non prova
  nulla sulla responsabilita'.

## Convenzioni

- Codice, commenti, documentazione e commit in italiano; identificatori e ogni
  stringa visibile nel gioco o nel debug in inglese.
- I commenti spiegano il perche', non il comportamento evidente.
- Se l'utente chiede perche' una funzione non si comporta come descritto,
  correggila subito salvo ambiguita', distruzione o nuova autorizzazione.
- Mantieni lo stile vicino: due spazi, apici singoli, punto e virgola, trailing
  comma dove usata e `import type` per i soli tipi.
- Restano attivi `strict`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noUnusedLocals`,
  `noUnusedParameters` e `verbatimModuleSyntax`.
- Test co-locati come `*.test.ts`; benchmark come `*.bench.ts`.
- Dentro `src/sim/` usa import diretti; da fuori usa `src/sim/index.ts`.
- Mondo Z-up: x est, y nord, z altezza; coordinate negative valide.
- Chunk 32x32x32, chiave `"cx,cy,cz"`; simulazione e terreno per colonna.

## Contratti da preservare

1. Il renderer legge solo `Chunk.blocks`; `Chunk.data` e' della simulazione.
2. Solo `setBlock` invalida geometria; `setData` non sporca i chunk.
3. Non sostituire gli `Uint8Array` di un chunk dopo la costruzione.
4. Le mesh portano `aPalette`, `aFace` e `aShade`, mai RGB. In
   `aShade`: AO bit 0-1, cielo bit 2-3, bagliore bit 4-5. Palette o tema non
   provocano rebuild.
5. La palette ha 32 slot e le superfici sono otto. Riconosci prima i due
   sovraccarichi: `WATER_CLASS` sull'acqua e `packCoverMark` sulla copertura.
6. Mesher e generatore di terreno non importano Three.js.
7. `src/sim/` non importa engine, DOM o Three.js e non conosce le tipologie
   degli edifici, che vivono in `src/world/buildings/`.
8. `tick` resta puro, deterministico e non ricalcola la desiderabilita'.
9. Il campo ricalcola, non accumula, e soltanto nel rettangolo toccato.
10. Gli usi sono quattro e ordinati: residenziale, commerciale, industriale,
    civico. Ogni tupla indicizzata segue lo stesso ordine.
11. Il terreno dipende soltanto da `(seed, shape, ccx, ccy)`.

## Numeri, budget e struttura

- Ogni costante di bilanciamento vive nel solo file indicato da
  `docs/PROJECT_MAP.md`.
- Lavoro non-render sotto 3 ms per frame (accettazione 4 ms); generazione 1,5
  ms. Spezza generazione, upload e ricolore fra frame.
- Solo la prima scena usa `LOADING_FRAME_BUDGET_MS` e
  `LOADING_GENERATION_BUDGET_MS`; la finestra si chiude su `generator.done`
  e non si riapre.
- Simulazione a 10 tick/s con passo fisso e recupero limitato: non usare `dt`.
- Evita `Date.now()` e `Math.random()` nei percorsi deterministici.
- Non riattivare `noUncheckedIndexedAccess` senza discuterne.
- Non modificare `dist/` o `node_modules/`.
- Oltre circa 600 righe, spezza il file lungo responsabilita' lavorabili
  separatamente prima di aggiungere altro.

## Documentazione e debug

- Per file aggiunti o righe indice cambiate usa `docs/pending/` e
  `npm run docs:merge`; aggiorna direttamente soltanto i README di modulo.
- Parametri URL, hotkey e hook globali stanno nella skill `debug-harness`.
  Ogni nuova metrica passa dalla stessa fonte verso overlay e hook globale.

## Definizione di completamento

1. Aggiorna test per comportamento, contratti e casi limite toccati.
2. Esegui typecheck e verifica proporzionata; build/bench/debug solo se richiesti
   dal tipo di modifica.
3. Aggiorna il Project Index e il changelog tramite un frammento
   `docs/pending/`; se il merge e' occupato, consegna lasciando il frammento.

@RTK.md
