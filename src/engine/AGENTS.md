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
- `aShade` e' un byte con due campi: AO nei bit 0-1, visibilita' del cielo nei
  bit 2-3. Stanno insieme perche' un secondo attributo sarebbe un secondo buffer
  per vertice a parita' di informazione.
- Conserva 32 slot esatti (`PALETTE_SIZE` e `uniform vec3[32]`).
- Palette o tema aggiornano solo uniform/stato: zero rebuild di mesh.
- Mantieni job e risultati trasferibili; evita copie nei percorsi caldi.
- Se cambia il layout degli attributi aggiorna tipi, worker, renderer, shader e test.

## Modello di luce

La luce non e' una tabella di costanti per faccia: c'e' un sole vero. La normale
si legge da `uFaceNormal[aFace]`, quindi **il mesher non e' stato toccato** e
nessun attributo di vertice e' stato aggiunto — e' cio' che tiene in piedi il
contratto 4 anche dopo questo lavoro.

Il modello vive in un solo posto, `lighting.ts`, in TypeScript puro:

```
ambiente = mix(rimbalzo, cielo * visibilita', n.z)  — emisferico
diretta  = sole * wrap(n . direzione)               — occlusa dalla shadow map
```

L'ambiente **non** viene moltiplicato per l'ombra proiettata: e' questo, e non un
effetto aggiunto dopo, che rende azzurre le facce in ombra invece che nere. Il
fragment shader riscrive le stesse formule in GLSL; `lighting.test.ts` tiene
allineate le due copie, e `themes.test.ts` verifica — invece di dichiarare — che
la faccia +Z resti la piu' illuminata in ogni tema.

A essere occlusa e' la sola meta' **cielo**, e da un dato geometrico: la
visibilita' del cielo che il mesher cuoce nei due bit alti di `aShade`, un
sondaggio verticale di `SKY_PROBE` voxel dalla cella vuota adiacente alla faccia.
Il rimbalzo resta pieno, ed e' cio' che impedisce a un sotto-ponte di diventare
un buco nero. Non va confusa con `shadow.strength`: quella spegne la diretta,
dipende dall'azimut del sole e sparisce al livello di qualita' piu' basso, mentre
questa vale a ogni ora e a ogni qualita' perche' e' geometria e non luce.

## Prospettiva aerea

Il secondo modello puro e' `atmosphere.ts`, con il suo `atmosphere.test.ts`. La
densita' della nebbia ha un profilo esponenziale in quota e viene **integrata
lungo il raggio**, non valutata sul frammento: e' cio' che separa le quote e non
le sole distanze, e l'integrale e' in forma chiusa perche' la camera e'
ortografica. `heightFalloff` e' l'inverso di un'altezza di scala e segue la scala
della citta': se il tetto verticale si alza, va abbassata in proporzione.

Il gradiente di schermo con cui la nebbia tende al cielo e quello di
`SkyBackground` sono la stessa curva scritta due volte. Se ne tocchi una tocca
anche l'altra, o si vedra' una riga proprio all'orizzonte.

## Pass e post-processing

Tre pass, non una: ombra -> scena -> post-processing. Il composer e' **sempre
attivo**, perche' alternarlo significherebbe accendere e spegnere il tone
mapping dentro i materiali, cioe' ricompilarli. Da qui una conseguenza che vale
la pena sapere: il tone mapping lo fa `OutputPass`, i materiali di scena
scrivono HDR lineare, e un cambio di tema non ricompila nessun programma.

Il gating vive in `RenderQuality.ts`: il profilo di effetti si *deriva* da quanto
il controller ha gia' dovuto abbassare il pixel ratio, cosi' c'e' una sola
isteresi invece di due che possono sfasarsi. Con `?quality=performance` le pass
aggiuntive spariscono e le draw call si dimezzano, perche' la geometria viene
disegnata una volta sola.

## Verifica

- Esegui `npm run typecheck`, `npm test` e `npm run build`.
- Per il mesher esegui `npm run bench`; non aggiornare misure a occhio.
- Per palette/temi verifica con `?debug=1` che quad e geometrie non cambino.
