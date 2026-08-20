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
npm run dev          # http://localhost:8020/?debug=1
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
   Per la stessa ragione i tipi di superficie sono **otto e basta**: i tre bit
   alti di `visualBlock` sono tutti impegnati, e prendersene un quarto
   significherebbe togliere un bit alla palette. È perché il commerciale riusa
   la grammatica del residenziale invece di averne una sua.
6. **Il mesher non conosce Three.js** e nemmeno il generatore di terreno: i
   worker in bundle pesano 8,64 kB e 5,77 kB proprio per questo.
7. **`src/sim/` non importa Three.js e non importa da `src/engine/`**, e non sa
   niente di come sono fatti gli edifici: la tipologia — la forma che un uso
   prende in un certo luogo — vive in `src/world/buildings/`, non qui.
8. **`tick` è puro**: nessuna mutazione dell'input, nessun `Date.now()`, nessun
   `Math.random()`, e non tocca il campo di desiderabilità.
9. **Il campo di desiderabilità ricalcola, non accumula**, e solo sul rettangolo
   di Chebyshev toccato, e solo per gli usi che quel catalizzatore influenza
   davvero. Mai una passata sull'intera mappa.
10. **Gli usi urbani sono quattro e il loro ordine è contratto**: residenziale,
    commerciale, industriale, civico. Ogni tupla indicizzata per uso — soglie di
    sito, pesi di desiderabilità, `CLASS_PROFILE`, colori degli overlay — segue
    quest'ordine, e cambiarlo significa cambiarle tutte insieme.
11. **Il contenuto di un blocco di terreno è funzione di `(seed, shape, ccx, ccy)`**
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
| Costruzione e tipologie | [src/world/buildings/config.ts](src/world/buildings/config.ts) |
| Palette | [src/engine/palette.json](src/engine/palette.json) + [paletteSlots.ts](src/engine/paletteSlots.ts) |
| Temi | [src/engine/themes/](src/engine/themes/) — un file per tema, colori piu' atmosfera |
| Modello di luce | [src/engine/lighting.ts](src/engine/lighting.ts) — sole, ambiente, luminanza per faccia |

Due tetti duri in `config.ts`: `warpAmount` sopra ~0,26 attacca terra al bordo
della region; alzare `baseFrequency` o `maxHeight` consuma il margine di
Lipschitz (dislivello fra colonne adiacenti ≤ 1, misurato sotto 0,8 su otto
seed). `heightField.test.ts` è la rete di sicurezza.

In `balance.ts` ci sono due relazioni 1:1 da non rompere per distrazione.
`food.perProduction / food.perResident` fa 24, cioè esattamente
`weights.residentialCapacity`: un edificio industriale sfama un residenziale
pieno. E `weights.commercialCapacity` vale a sua volta 24: un edificio
commerciale ne serve uno. Cambiare uno di questi valori senza guardare gli altri
rompe il pareggio.

Il **vettore di influenza** di un catalizzatore sta in
`gameplay.catalyst.influence`, non nella sua definizione: ogni ruolo ha almeno
un uso a `1` esatto, ed è quello a tenere in piedi l'invariante "al centro il
campo vale esattamente `strength`". Un valore negativo è legale e significa che
quel ruolo caccia via quell'uso; uno zero non costa nulla, perché il campo salta
del tutto gli usi che un ruolo non tocca.

Il **catalogo delle tipologie** è una tabella in `world/buildings/config.ts`:
condizioni sul luogo più forma. Aggiungere una tipologia è aggiungere una riga —
la regola di scelta in `typology.ts` è generica e non va toccata, e la
grammatica in `generate.ts` non sa che le tipologie esistono. Ogni uso chiude il
catalogo con un ripiego senza condizioni, così la scelta non può fallire.

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
(`GENERATION_BUDGET_MS`). Il limite di accettazione è 4 ms. La pass d'ombra e il post-processing **non**
rientrano in questo budget: sono spesa GPU, non lavoro di main thread, e si
leggono in `renderMs` e `shadow` dell'overlay. Ogni lavoro lungo —
generazione, upload di geometrie, ricolore per bioma — si ferma appena esaurisce
la sua quota e riprende al frame dopo. Non aggiungere lavoro non budgetato al
ciclo di frame.

Il passo automatico della simulazione è a cadenza fissa (10 tick/s), **non**
legato al `dt`: se un frame è lungo si recuperano più tick, non un tick più
grande, con un tetto per il rientro da una scheda in background.

## Resa grafica

La luce non è più una tabella di sei costanti per faccia: c'è un sole vero.
La normale si legge da `uFaceNormal[aFace]`, quindi **il mesher non è stato
toccato** e nessun attributo di vertice è stato aggiunto — è ciò che tiene in
piedi l'invariante 4 anche dopo questo lavoro.

Il modello vive in un solo posto,
[src/engine/lighting.ts](src/engine/lighting.ts), in TypeScript puro:

```
ambiente = mix(rimbalzo, cielo, n.z)     — emisferico, mai occluso
diretta  = sole * wrap(n · direzione)    — occlusa dalla shadow map
```

L'ambiente **non** viene moltiplicato per l'ombra: è questo, e non un effetto
aggiunto dopo, che rende azzurre le facce in ombra invece che nere. Il fragment
shader riscrive le stesse formule in GLSL; `lighting.test.ts` è ciò che tiene
allineate le due copie, e `themes.test.ts` verifica — invece di dichiarare —
che la faccia +Z resti la più illuminata in ogni tema.

Tre pass, non una: ombra → scena → post-processing. Il composer è **sempre
attivo**, perché alternarlo significherebbe accendere e spegnere il tone mapping
dentro i materiali, cioè ricompilarli. Da qui una conseguenza che vale la pena
sapere: il tone mapping ora lo fa `OutputPass`, i materiali di scena scrivono
HDR lineare, e **un cambio di tema non ricompila più nessun programma**.

Il gating vive in [RenderQuality.ts](src/engine/RenderQuality.ts): il profilo di
effetti si *deriva* da quanto il controller ha già dovuto abbassare il pixel
ratio, così c'è una sola isteresi invece di due che possono sfasarsi. Con
`?quality=performance` le pass aggiuntive spariscono, e le draw call si
dimezzano perché la geometria viene disegnata una volta sola.
## Harness di debug

`?debug=1` accende overlay e hotkey. Parametri: `scene` (`city`|`noise`|`slab`),
`seed`, `size`, `height`, `terrain=<seed>`, `sim=1`. `theme=<id>` vale anche
senza `debug`: è un look, non una misura.

`__simClass(i)` e il tasto `M` ciclano ora su quattro usi, non tre.

Tasti: `Q`/`E` ruota, rotella zoom, drag destro o `WASD` pan, `F` inquadra tutto,
`G` +64 chunk, `R` rebuild totale, `C` azzera i picchi, `B` colore per bioma,
`1`..`9` sceglie il tema, `T`/`P`/`M` in scena simulazione.

Sul globale (solo con `?debug=1`): `__voxelStats()`, `__voxelReset()`,
`__voxelExpand()`, `__voxelRebuildAll()`, `__voxelTheme(id?)`,
`__voxelSun(azimuth?, elevation?)`; con terreno `__terrainStats()`,
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
