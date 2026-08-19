# CLAUDE.md

Guida per Claude Code su questo repository. Indice file per file in
[PROJECT_INDEX.md](PROJECT_INDEX.md); numeri, misure e criteri in
[README.md](README.md) e [src/sim/README.md](src/sim/README.md).

## Cos'è

Motore di rendering voxel a chunk per una città isometrica, in TypeScript +
Three.js + Vite. Tre strati indipendenti che non si conoscono fra loro:

- `src/world/` — storage voxel sparso e generazione del terreno
- `src/engine/` — meshing, materiale, camera, renderer
- `src/sim/` — simulazione a tick (risorse, desiderabilità, decisioni)

`src/main.ts` è l'unico punto che li mette insieme, e serve da harness di misura.
Non c'è ancora un gioco: il builder piazza edifici automatici dalle decisioni
della simulazione, ma non esistono strade, pathfinding, UI di gioco, salvataggio
o audio (vedi "Fuori scope" nel README).

## Comandi

```bash
npm run dev          # http://localhost:8010/?debug=1
npm test             # vitest run — 181 test, ambiente node, nessun DOM
npm run test:watch
npm run bench        # vitest bench --run, *.bench.ts
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + vite build
```

I test girano in ambiente `node` (`vite.config.ts`): non c'è jsdom, non c'è GPU.
Il codice testabile non deve quindi importare Three.js né toccare il DOM.

## Lingua

Codice, commenti, documentazione e messaggi di commit sono in **italiano**.
Mantieni la convenzione: identificatori in inglese, prosa in italiano. I commenti
esistenti spiegano *perché*, non *cosa* — segui lo stesso registro.

## Convenzioni di coordinate

Mondo **Z-up**: `x` = est, `y` = nord, `z` = altezza. Il piano di terra è
`(x, y)`. Un voxel = una cella edificabile. Le coordinate negative sono valide:
il mondo non ha limiti prefissati, cresce aggiungendo chunk alla mappa sparsa.

Chunk `32×32×32` (`CHUNK` in [chunkCoords.ts](src/world/chunkCoords.ts)), chiave
`"cx,cy,cz"`. La simulazione e la `TerrainMap` lavorano per **colonna** `(x, y)`:
non hanno una coordinata verticale.

## Invarianti da non rompere

Sono contratti su cui il resto del progetto è costruito, e i test li verificano
(`src/sim/contracts.test.ts`, `src/world/VoxelWorld.test.ts`).

1. **Il renderer legge solo `Chunk.blocks`.** Nessun file di `src/engine/` tocca
   `Chunk.data`, che è riservato alla simulazione.
2. **`setData` non marca sporco niente.** Solo `setBlock` invalida geometria. La
   simulazione non ha il permesso di scrivere in `blocks`.
3. **Aggiungere chunk non rialloca quelli esistenti.** Gli `Uint8Array` nascono
   nel costruttore di `Chunk` e non vengono mai sostituiti.
4. **Il colore vive solo nell'uniform.** I vertici portano indice di palette
   (`aPalette`) e direzione di faccia (`aFace`), mai un RGB. `aAO` e' un
   attributo geometrico scalare (0..3), non un colore. Cambiare
   `palette.json` — o cambiare tema — non deve mai provocare un rebuild di mesh.
   È quello che rende i temi in [src/engine/themes/](src/engine/themes/)
   gratuiti: un tema è solo un insieme di uniform.
5. **32 slot di palette esatti**, fissati dall'uniform `vec3[32]`. Chi aggiunge
   materiali riusa gli indici in [paletteSlots.ts](src/engine/paletteSlots.ts).
6. **Il mesher non conosce Three.js** e nemmeno il generatore di terreno: i
   worker in bundle pesano 8,64 kB e 5,77 kB proprio per questo.
7. **`src/sim/` non importa Three.js e non importa da `src/engine/`.**
8. **`tick` è puro**: nessuna mutazione dell'input, nessun `Date.now()`, nessun
   `Math.random()`, e non tocca il campo di desiderabilità.
9. **Il campo di desiderabilità ricalcola, non accumula**, e solo sul rettangolo
   di Chebyshev toccato. Mai una passata sull'intera mappa.
10. **Il contenuto di un blocco di terreno è funzione di `(seed, shape, ccx, ccy)`**
    e di nient'altro: da qui determinismo, indipendenza dall'ordine e continuità
    al confine. Le decorazioni valutano un anello di due colonne e scrivono solo
    la porzione interna: una chioma oltre confine non crea dipendenze d'ordine.

## Dove stanno i numeri

Ogni costante di bilanciamento vive in un solo file per dominio. Se stai per
scrivere una soglia, una frequenza o un moltiplicatore altrove, quasi sempre è il
posto sbagliato.

| Dominio | File unico |
| --- | --- |
| Terreno | [src/world/terrain/config.ts](src/world/terrain/config.ts) |
| Simulazione | [src/sim/balance.ts](src/sim/balance.ts) |
| Palette | [src/engine/palette.json](src/engine/palette.json) + [paletteSlots.ts](src/engine/paletteSlots.ts) |
| Temi | [src/engine/themes/](src/engine/themes/) — un file per tema, colori piu' atmosfera |

Due tetti duri in `config.ts`: `warpAmount` sopra ~0,26 attacca terra al bordo
della region; alzare `baseFrequency` o `maxHeight` consuma il margine di
Lipschitz (dislivello fra colonne adiacenti ≤ 1, misurato sotto 0,8 su otto
seed). `heightField.test.ts` è la rete di sicurezza.

In `balance.ts`: `food.perProduction / food.perResident` fa 24, cioè esattamente
`weights.residentialCapacity`. Cambiare uno dei tre senza guardare gli altri due
rompe il pareggio alimentare 1:1.

Le policy sono moltiplicatori nominati sui pesi e vivono **nello stato**
(`setPolicyActive`), mai in `balance.ts`. `resolveWeights` riparte sempre dal
valore base e rimoltiplica: non si divide mai per tornare indietro.

## Proprietà dello stato di simulazione

`tick` è puro, ma le operazioni del giocatore no: `addCatalyst`, `addBuilding`,
`setPolicyActive` aggiornano il campo **in place** e restituiscono un nuovo
oggetto stato che ne prende possesso. Lo stato precedente non va più usato — è la
regola di un buffer trasferito.

## Budget di frame

`src/main.ts` tiene il lavoro non-render sotto **3 ms** per frame
(`FRAME_BUDGET_MS`), di cui 1,5 ms per la generazione di scena
(`GENERATION_BUDGET_MS`). Il limite di accettazione è 4 ms. Ogni lavoro lungo —
generazione, upload di geometrie, ricolore per bioma — si ferma appena esaurisce
la sua quota e riprende al frame dopo. Non aggiungere lavoro non budgetato al
ciclo di frame.

Il passo automatico della simulazione è a cadenza fissa (10 tick/s), **non**
legato al `dt`: se un frame è lungo si recuperano più tick, non un tick più
grande, con un tetto per il rientro da una scheda in background.

## Harness di debug

`?debug=1` accende overlay e hotkey. Parametri: `scene` (`city`|`noise`|`slab`),
`seed`, `size`, `height`, `terrain=<seed>`, `sim=1`. `theme=<id>` vale anche
senza `debug`: è un look, non una misura.

Tasti: `Q`/`E` ruota, rotella zoom, drag destro o `WASD` pan, `F` inquadra tutto,
`G` +64 chunk, `R` rebuild totale, `C` azzera i picchi, `B` colore per bioma,
`1`..`9` sceglie il tema, `T`/`P`/`M` in scena simulazione.

Sul globale (solo con `?debug=1`): `__voxelStats()`, `__voxelReset()`,
`__voxelExpand()`, `__voxelRebuildAll()`, `__voxelTheme(id?)`; con terreno `__terrainStats()`,
`__terrainBiomeView()`, `__terrainExpand()`; con `sim=1` `__simStats()`,
`__simTick(n)`, `__simSites(n)`, `__simClass(i)`, `__simPolicy(id)`.

Gli overlay e gli hook globali leggono **la stessa fonte**: se aggiungi una
metrica, aggiungila una volta sola e falla passare da entrambi.

## Stile e strumenti

- TypeScript `strict`, più `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax` (usa `import type` per i tipi).
- `noUncheckedIndexedAccess` è **disattivato di proposito** — vedi il commento in
  `tsconfig.json`. Non riattivarlo senza discuterne.
- Nessun linter e nessun formatter configurato: adegua lo stile ai file vicini.
- Import fra moduli di `src/sim/` per percorso diretto; `src/sim/index.ts` è il
  barrel per chi sta fuori dalla cartella.
- Test co-locati come `*.test.ts`, bench come `*.bench.ts`.

## Quando modifichi qualcosa

- Le tabelle di misura in `README.md` e `src/sim/README.md` sono verificate a
  mano su questa macchina. Se tocchi il percorso caldo, dillo invece di
  aggiornare i numeri a occhio.
- Aggiungendo un file, aggiorna la tabella in [PROJECT_INDEX.md](PROJECT_INDEX.md)
  e, se è una superficie pubblica, quella nel README di sezione.
- `npm run typecheck && npm test` prima di considerare finito un cambiamento.
