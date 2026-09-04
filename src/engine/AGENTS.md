# Regole per `src/engine/`

Rendering Three.js, camera, materiale, meshing puro e worker. Il renderer puo'
leggere `src/world/`; il mondo non dipende mai dall'engine.

## Confini

- `mesher/` non importa Three.js, DOM, renderer o generatore di terreno; i test
  girano in Node e la logica verificabile resta pura.
- `ChunkRenderer` legge soltanto `Chunk.blocks`. Una geometria e una draw call
  per chunk sono scelte deliberate.
- Cio' che si muove vive sopra la scena: `TrafficView`, overlay, cursore,
  pennacchi e pioggia iniziale usano mesh proprie, mai voxel riscritti per frame.
- Le sagome dei mezzi sono scatole definite in `vehicleHulls.ts`, senza
  Three.js, illuminate da `faceLight` e colorate dalla palette corrente.
- Pennacchio e `DropRainView` usano ciascuno una mesh condivisa con buffer
  dinamici; non creare una mesh o una draw call per elemento.

## Mesh, palette e temi

- Le mesh trasportano `aPalette` e `aFace`, mai RGB. `aShade` contiene AO
  nei bit 0-1, cielo nei bit 2-3 e bagliore nei bit 4-5: maschera sempre il
  campo letto e includi tutti i campi nella chiave di merge di `packFace`.
- Conserva 32 slot esatti (`PALETTE_SIZE` e `uniform vec3[32]`). Palette,
  tema e ora aggiornano uniform/stato senza rebuild o ricompilazione.
- Mantieni job e risultati trasferibili. `MeshJob.origin` serve esclusivamente
  a seminare i prop e non insegna al mesher dove si trova.
- `collectSurfaceCells` riceve facce gia' esposte e scarta `plain` e
  `utility`: per dettagli su banchine o piste assegna una superficie costruita
  nella ricetta, non ampliare `utility`.
- Il linguaggio dei dettagli maturi sta in `microDetail.ts`; il retro in
  `microStreet.ts`. I cicli di import restano sicuri soltanto finche' nessun
  modulo dereferenzia l'altro durante il caricamento.
- Un prisma di tetto parte da `(z + 1) * U` o `roofBase`; uno di facciata
  usa `facadeBox` con `facadeInset`. Il parapetto ignora `roofInset` di
  proposito.
- Struttura e prop si distinguono per aggancio: geometria deterministica prima
  dei prop; scelte casuali sotto il budget dei quad.

## Scavi e copertura

- `carvePlan.ts` decide gli scavi prima del greedy pass e scrive la maschera;
  il disegno la rilegge senza rivalutare l'aggancio.
- `planCarves` rispetta `MAX_CARVE_QUADS_PER_CHUNK`;
  `appendCarveDetail` scrive per primo e ogni ricetta aggiorna `CARVE_COST`
  come limite superiore.
- Uno scavo non modifica il volume: cielo, bagliore e AO dei vicini restano
  invariati. Disegna fondo e bordi sul perimetro della regione, non per cella.
- `planCarves` usa le liste di `collectSurfaceCells`, mai una nuova scansione
  del volume.
- `coverDetail.ts` e' l'unico dettaglio che sostituisce volume:
  `liftGroundCover` svuota volume paddato, anello e soffitto prima del meshing;
  `restoreGroundCover` ripristina l'input. Emettila per prima.
- Il materiale e' `FrontSide`: winding e `aFace` devono concordare.
  `emitBox({ inward: true })` e' la variante per superfici interne.
- Se cambia il layout degli attributi aggiorna tipi, worker, renderer, shader,
  chiavi di merge e test.

## Luce, atmosfera e ora

- `lighting.ts` e' la fonte TypeScript pura del modello replicato nel fragment;
  `lighting.test.ts` e `themes.test.ts` tengono allineate formule e temi.
- Il cielo geometrico cotto in `aShade` e' distinto da `shadow.strength`:
  il primo vale sempre, la seconda occlude soltanto la luce diretta.
- `emission` illumina il pixel; il bagliore vicino e' cotto da `sweepGlow`
  con sei scansioni lineari, vale soltanto con `uNight`, usa la tinta del tema
  e ha raggio breve dichiarato.
- `nightWindows.ts` contiene tutti i numeri delle finestre accese:
  `uLitHomes` cambia quante, mai quali; le torri sono gruppi di colonne.
- `atmosphere.ts` integra la densita' lungo il raggio. Il gradiente del cielo
  deve restare uguale a quello di `SkyBackground`.
- `daylight.ts` deriva tutto dall'altezza solare. `withHour` modifica luce,
  cielo, nebbia, ombra, emissivi e riflesso dell'acqua senza cambiare palette,
  materia, tone mapping o esposizione.
- `DaylightMode` usa `cycle`, `day` e `night`; le modalita' fisse sono ore
  reali definite in `DAYLIGHT`. `applyTheme` e `applyAtmosphere` restano
  separate.
- `season.ts` sta a `daylight.ts` come la stagione sta all'ora: `withSeason` e
  `seasonColors` piegano prato, rimbalzo dal terreno, nebbia e orizzonte, e
  lasciano stare sole, esposizione, tone mapping e materia. **A meta' estate
  tornano il tema per identita'**: il verde scritto in un tema e' il suo verde
  d'estate, ed e' cio' che tiene i temi sette invece di ventotto.
- La stagione si applica **prima** dell'ora, e le due non commutano: la notte
  spegne il rimbalzo, e spegnerne uno gia' ingiallito non e' come ingiallirne
  uno gia' spento. Chi ha bisogno della palette in vigore legge
  `AtmosphereControl.look`, non `theme`: quello e' l'identita' del tema.
- La fase dell'anno arriva da `src/sim/seasons.ts` (`yearPhaseAt(tickCount)`) e
  da nessun'altra parte: e' la stessa da cui esce il moltiplicatore del
  raccolto, quindi il prato non puo' ingiallire in un mese diverso da quello in
  cui i campi rendono meno.

## Pass e ispezione

- Il composer resta sempre attivo: `OutputPass` esegue il tone mapping e i
  materiali scrivono HDR lineare. `RenderQuality.ts` deriva gli effetti dal
  pixel ratio con una sola isteresi.
- `inspect.ts` e `xray.ts` restano puri e allineati agli shader. Distingui
  `modeCuts`, `isCut` e `needsCap`: rispondono rispettivamente al modo, al
  taglio attuale e alla necessita' della sezione.
- Il velo X-ray e' una rigatura screen-door che varia con profondita', cede sul
  reticolo del voxel e sfuma nella prospettiva aerea; non ridurlo a un
  `discard` uniforme.
- Il materiale di profondita' non replica il predicato di ispezione: durante un
  taglio le ombre si spengono tutte, limite dichiarato.

## Prima isola

- La caduta muove chunk rigidi, non voxel o vertici del greedy mesh. Ombra e AABB
  seguono la mesh; una geometria arrivata dopo eredita la posizione corrente.
- `fallHeightFor` deriva la quota fuori schermo da zoom e inclinazione.
- La finestra di caduta si chiude su `isIdle`, non su `generator.done`;
  `dropRain.ts` e `DropRainView.ts` vivono sopra la scena e soltanto durante
  il primo caricamento.

## Verifica

- Segui la verifica proporzionata di `AGENTS.md` radice: typecheck e il piu'
  stretto fra test diretti, `test:related` e `test:changed`.
- Esegui la suite intera soltanto nei casi globali dichiarati dal file radice;
  per worker e bundle esegui anche `npm run build`.
- Per il mesher esegui il benchmark pertinente; per palette e temi verifica
  `?debug=1` che quad e geometrie non cambino.
