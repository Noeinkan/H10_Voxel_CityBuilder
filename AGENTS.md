# H10 Voxel City Builder

Motore voxel a chunk per una citta' isometrica. Integra mondo procedurale,
greedy meshing in worker, rendering Three.js, simulazione a tick e crescita
automatica degli edifici. `src/main.ts` compone i moduli e funge da harness di
debug e misura.

## Stack

- TypeScript 5.9 strict, moduli ES, target ES2022
- Three.js 0.180; Vite 7; Vitest 3 in ambiente Node
- Web Worker ES per meshing e terreno; `simplex-noise` per la generazione

## Mappa rapida

- `src/world/`: storage voxel, scene, terreno ed edifici
- `src/engine/`: meshing, worker, palette, temi, camera e renderer
- `src/sim/`: stato e simulazione pura per colonna `(x, y)`
- `src/game/`: ciclo a passo fisso; `src/ui/`: overlay di debug
- `src/main.ts`: unico composition root e ciclo di frame
- `docs/PROJECT_MAP.md`: dipendenze e punti di ingresso
- `PROJECT_INDEX.md`: indice dettagliato file per file

Le regole specifiche di `src/engine/`, `src/world/` e `src/sim/` sono nei
rispettivi `AGENTS.md` e si aggiungono a queste.

## Comandi

```bash
npm install
npm run dev          # http://localhost:8010/?debug=1
npm run build        # typecheck + build Vite in dist/
npm run preview      # http://localhost:8011/
npm test
npm run test:watch
npm run bench
npm run typecheck
```

Non esiste uno script `lint` o un formatter configurato: non inventarne uno.

## Convenzioni

- Codice, commenti, documentazione e commit in italiano; identificatori in
  inglese. I commenti spiegano il perche', non il comportamento evidente.
- Quando l'utente chiede perche' una funzionalita' non si comporta nel modo
  descritto, interpreta la formulazione come richiesta di correggerla subito,
  senza chiedere prima conferma. Fanno eccezione solo ambiguita' sostanziali,
  azioni distruttive o cambiamenti che richiedono nuova autorizzazione.
- Mantieni lo stile vicino: due spazi, apici singoli, punto e virgola e trailing
  comma dove gia' usata. Usa `import type` per i soli tipi.
- Test co-locati come `*.test.ts`; benchmark come `*.bench.ts`.
- Dentro `src/sim/` usa import diretti; da fuori usa `src/sim/index.ts`.
- Mondo Z-up: `x` est, `y` nord, `z` altezza; coordinate negative valide.
- Chunk `32x32x32`, chiave `"cx,cy,cz"`; simulazione e terreno sono per colonna.

## Contratti da preservare

1. Il renderer legge solo `Chunk.blocks`; `Chunk.data` appartiene alla simulazione.
2. Solo `setBlock` invalida geometria; `setData` non marca chunk sporchi.
3. Non sostituire gli `Uint8Array` di un chunk dopo la costruzione.
4. Colori solo nelle uniform: le mesh hanno `aPalette` e `aFace`, mai RGB.
5. La palette ha esattamente 32 slot; riusa gli indici di `paletteSlots.ts`.
6. Mesher e generatore di terreno non importano Three.js.
7. `src/sim/` non importa da `src/engine/` e non usa DOM o Three.js.
8. `tick` resta puro, deterministico e non ricalcola la desiderabilita'.
9. Il campo ricalcola, non accumula, e solo nel rettangolo toccato.
10. Il terreno dipende solo da `(seed, shape, ccx, ccy)`.

Le costanti vivono nel file del dominio: terreno in `terrain/config.ts`, edifici
in `buildings/config.ts`, simulazione in `sim/balance.ts`, palette nell'engine.
Non aggiornare a occhio le misure documentate nei README.

## Budget e pattern da evitare

- Lavoro non-render sotto 3 ms per frame (accettazione: 4 ms); generazione 1,5
  ms. Spezza generazione, upload e ricolore su piu' frame.
- Simulazione a 10 tick/s a passo fisso con recupero limitato: non usare `dt`.
- Evita `Date.now()` e `Math.random()` nei percorsi deterministici.
- Non riattivare `noUncheckedIndexedAccess` senza discuterne.
- Non modificare `dist/` o `node_modules/`.
- Se aggiungi file, aggiorna `PROJECT_INDEX.md` e il README di modulo pertinente.

## Definizione di completamento

1. Aggiungi o aggiorna test per comportamento, contratti e casi limite toccati.
2. Esegui almeno `npm run typecheck` e `npm test`.
3. Per bundle o worker esegui anche `npm run build`.
4. Per percorsi caldi esegui il benchmark pertinente e segnala che le tabelle
   di misura richiedono verifica manuale.
5. Per modifiche visuali verifica `?debug=1`, overlay e budget pertinenti.

@RTK.md
