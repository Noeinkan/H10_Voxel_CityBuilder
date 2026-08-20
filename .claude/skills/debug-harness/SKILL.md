---
name: debug-harness
description: Parametri URL, hotkey e hook globali dell'harness di debug del voxel city builder. Usala quando devi riprodurre un comportamento a schermo, misurare un budget di frame, leggere un overlay, o quando aggiungi una metrica di debug.
---

# Harness di debug

`?debug=1` accende overlay e hotkey tecniche; `F3` le alterna a runtime. La
radice `/` avvia isola, crescita e Cozy HUD con gli overlay tecnici nascosti.

## Parametri URL

| Parametro | Default | Effetto |
| --- | --- | --- |
| `debug` | — | `1` apre overlay e hotkey tecniche |
| `scene` | — | Isola una scena `city`, `noise` (caso peggiore) o `slab` |
| `seed` | `1337` | Seed della generazione |
| `size` | `512` | Lato del mondo in voxel (32…4096) |
| `height` | `64` | Altezza del mondo in voxel (32…256) |
| `terrain` | — | `<seed>` sostituisce la scena urbana con un'isola 256×256 |
| `sim` | — | `1` accende la scena di simulazione (implica l'isola, richiede `debug=1`) |
| `grow` | — | `1` accende la crescita automatica degli edifici |
| `quality` | — | `performance` toglie le pass aggiuntive e dimezza le draw call |
| `theme` | — | `<id>` sceglie il tema; vale **anche senza** `debug`, è un look, non una misura |

## Tasti

`Q`/`E` ruotano attorno al punto di terra sotto al mouse (sul centro
dell'inquadratura se il cursore è fuori dalla canvas), rotella zoom, drag destro
o `WASD` pan, `F` inquadra tutto, `G` +64 chunk, `R` rebuild totale, `C` azzera
i picchi, `B` colore per bioma, `1`..`9` sceglie il tema, `T`/`P`/`M` in scena
simulazione. `__simClass(i)` e il tasto `M` ciclano su quattro usi, non tre.

## Hook globali

Solo con `?debug=1`:

- sempre: `__voxelStats()`, `__voxelReset()`, `__voxelExpand()`,
  `__voxelRebuildAll()`, `__voxelTheme(id?)`, `__voxelSun(azimuth?, elevation?)`
- con terreno: `__terrainStats()`, `__terrainBiomeView()`, `__terrainExpand()`
- con `sim=1`: `__simStats()`, `__simTick(n)`, `__simSites(n)`, `__simClass(i)`,
  `__simPolicy(id)`

## Regola quando aggiungi una metrica

Gli overlay (`src/ui/`) e gli hook globali leggono **la stessa fonte**. Aggiungi
la metrica una volta sola e falla passare da entrambi: due letture separate
divergono al primo refactor.

I tempi da guardare: `renderMs` e `shadow` sono spesa GPU e restano **fuori** dal
budget di 3 ms di main thread definito in `src/main.ts`.
