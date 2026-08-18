# Mappa del progetto

Riferimento rapido. Per l'elenco file per file vedi
[`PROJECT_INDEX.md`](../PROJECT_INDEX.md); per criteri e misure vedi
[`README.md`](../README.md) e [`src/sim/README.md`](../src/sim/README.md).

## Dipendenze

```text
                         src/main.ts
                   composition root + frame loop
                  /          |          |       \
          src/engine     src/world    src/sim   src/ui
          Three.js          ^        Node-safe   DOM/canvas
              |             |            |
              +-- legge blocks            +-- scrive solo data

src/game/loop.ts fornisce il passo fisso usato da main.ts.
```

`src/world/`, `src/sim/` e il mesher non dipendono da Three.js. `src/main.ts` e'
l'unico punto che conosce tutti i sottosistemi.

## Punti di ingresso

- Applicazione: `src/main.ts`
- Storage: `src/world/VoxelWorld.ts`, `src/world/Chunk.ts`
- Terreno: `src/world/terrain/IslandGenerator.ts`, `TerrainStreamer.ts`
- Edifici: `src/world/buildings/Builder.ts`
- Rendering: `src/engine/ChunkRenderer.ts`; meshing: `mesher/greedyMesher.ts`
- Look: `src/engine/VoxelMaterial.ts`, `palette.json`, `themes/`
- Simulazione pubblica: `src/sim/index.ts`; passo fisso: `src/game/loop.ts`
- Diagnostica: `src/ui/` e hook globali in `src/main.ts`

## Flussi principali

```text
scene/terrain -> VoxelWorld.setBlock -> dirty chunks -> ChunkRenderer
              -> buildPaddedVolume -> MesherPool -> worker -> BufferGeometry

FixedStepLoop -> tick -> nextBuildSites -> Builder
              -> BuildingRegistry + setBlock -> addBuilding -> campo incrementale
```

Il debug della desiderabilita' usa `setData`, che non attiva il meshing.

## Configurazione per dominio

- Terreno: `src/world/terrain/config.ts`
- Edifici: `src/world/buildings/config.ts`
- Simulazione: `src/sim/balance.ts`
- Palette: `src/engine/palette.json` e `paletteSlots.ts`
- Temi: `src/engine/themes/`; tooling: file di configurazione nella root

Coordina funzionalita' trasversali da `src/main.ts`, senza introdurre dipendenze
circolari fra engine, mondo e simulazione.

