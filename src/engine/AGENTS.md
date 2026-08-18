# Regole per `src/engine/`

Rendering Three.js, camera, materiale, meshing puro e worker. Il renderer puo'
leggere `src/world/`, ma il mondo non deve dipendere dall'engine.

## Confini

- `mesher/` non importa Three.js, DOM, renderer o generatore di terreno.
- I test girano in Node: mantieni la logica testabile fuori da Three.js e DOM.
- `ChunkRenderer` legge solo `Chunk.blocks`; non accedere a `data`.
- Una geometria e una draw call per chunk sono scelte deliberate.

## Mesh, palette e temi

- Le mesh trasportano `aPalette` e `aFace`, mai RGB.
- Conserva 32 slot esatti (`PALETTE_SIZE` e `uniform vec3[32]`).
- Palette o tema aggiornano solo uniform/stato: zero rebuild di mesh.
- Mantieni job e risultati trasferibili; evita copie nei percorsi caldi.
- Se cambia il layout degli attributi aggiorna tipi, worker, renderer, shader e test.

## Verifica

- Esegui `npm run typecheck`, `npm test` e `npm run build`.
- Per il mesher esegui `npm run bench`; non aggiornare misure a occhio.
- Per palette/temi verifica con `?debug=1` che quad e geometrie non cambino.

