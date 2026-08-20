# Changelog

Cosa è cambiato, dal più recente. Il *perché* delle scelte sta in
[README.md](README.md) e in [src/sim/README.md](src/sim/README.md); *dove sta
cosa* in [PROJECT_INDEX.md](PROJECT_INDEX.md); dove va il progetto in
[ROADMAP.md](ROADMAP.md).

Il progetto non è ancora versionato: ogni voce è un incremento, identificato dal
commit che lo chiude. Le voci descrivono il contenuto effettivo, che non sempre
coincide con il messaggio di commit.

---

## 2026-08-20 — `996bc3e` — Calibrazione del terreno, cursore di piazzamento

- **Nuovo**: `src/engine/PlacementCursor.ts` (+ test). Il segnaposto sotto il
  puntatore — base, mirino, onda e fascio — disegnato sempre sopra la scena ed
  escluso dalla pass di profondità, con stato valido/rifiutato distinto.
- Ricalibrati soglie, frequenze e stratigrafia in `world/terrain/config.ts`,
  `biomes.ts`, `decor.ts` e la maschera radiale di `heightField.ts`; il margine
  di Lipschitz resta la rete di sicurezza della calibrazione.
- Ritocchi coordinati a `world/streets/` (config, `lots.ts`, `streetGrid.ts`),
  `world/grading/config.ts`, `world/buildings/` (config e `generate.ts`) e ai
  coefficienti della simulazione.
- `InfluenceOverlay` e `IsoCameraController` allineati al nuovo cursore.
- Entra `shotkit.config.mjs` con gli scatti di riferimento in `.shots/`.

## 2026-08-20 — `c550104` — Opere di terra (Fase 4.2)

- **Nuovo modulo** `src/world/grading/`: `config.ts`, `grade.ts` e il suo test.
  Risponde a «cosa serve *costruire* perché questo pezzo di terreno regga un
  piano» invece che a «questa colonna è già piana?»: classifica la colonna
  (`flat`, `sloped`, `shore`, `rock`, `refused`), la pesa, progetta terrapieno o
  banchina. **Si riempie, non si scava** — un'opera aggiunge volume e non ne
  toglie mai. Recupera circa metà della terra emersa, che prima veniva scartata.
- Il `Builder` passa dal piano di opera prima di scrivere voxel; le azioni di
  gioco usano `BUILD_WEIGHT` per il costo del sito.
- **Nuova skill** `/debug-harness`: parametri URL, hotkey e hook globali escono
  dai file caricati sempre. `AGENTS.md` diventa la fonte unica di comandi,
  convenzioni, contratti, budget e definizione di "finito"; `CLAUDE.md` resta un
  puntatore.

## 2026-08-20 — `62798d5` — Scheletro stradale (Fase 4.1)

- **Nuovo modulo** `src/world/streets/`: `config.ts`, `streetGrid.ts`,
  `lots.ts`, `StreetNetwork.ts` e due test. La rete esiste **prima** degli
  edifici e ne orienta la crescita; è una funzione pura di `(seed, x, y)`,
  quindi non ha stato da salvare né da aggiornare quando arriva un
  catalizzatore. Il ritaglio sulla forma dell'isola avviene a valle.
- Il `Builder` allinea l'edificio al fronte strada, verifica il verso di
  affaccio e l'occupazione dell'isolato prima di piazzare l'impronta.
- `PIANO_GRAFICA.md` rimosso: il suo contenuto è confluito in `ROADMAP.md`.

## 2026-08-20 — `61f3756` — Porta del dev server

- `scripts/free-port.mjs` agganciato a `prestart` e `predev`: libera la porta
  terminando le istanze node rimaste da una sessione precedente.

## 2026-08-20 — `08e7b80` — Ciclo commerciale, tipologie, sole e post-processing

- **Nuovo**: `src/sim/commerce.ts` (+ test). Il ciclo commerciale interno passa
  per tre strozzature indipendenti — banchi, personale, merce — così che la
  città mercantile e quella industriale restino due economie distinguibili.
- **Nuovo**: `src/world/buildings/typology.ts` e il catalogo `TYPOLOGIES` in
  `buildings/config.ts`. La tipologia si sceglie dal luogo, senza numeri sparsi
  nel generatore: stesso luogo, stessa tipologia.
- **Nuovo look**: `engine/lighting.ts` (modello di luce in TS puro, tenuto
  allineato al GLSL da un test), `engine/SunShadow.ts` (shadow map ortografica
  agganciata ai texel) ed `engine/PostProcessing.ts` (bloom, tilt-shift, tone
  mapping in `OutputPass`). Tutti i temi si adeguano.
- Quarto uso urbano nel contratto di `sim/classes.ts`, con `sim/uses.test.ts` a
  presidiarne ordine, influenze e uso misto.

## 2026-08-19 — `f233321` — Microgeometria nel mesher

- **Nuovo**: `engine/mesher/microGeometry.ts` (+ test). Prismi a 1/16 di voxel
  accodati al greedy pass, con facce nascoste eliminate, testate condivise,
  priorità e limite per chunk.

## 2026-08-19 — `16e7073` — Distretti, decisioni, commercio esterno

- **Nuovi** in `src/sim/`: `catalysts.ts` (i sette ruoli con vettore di
  influenza), `districts.ts` (profili locali e specializzazioni da campi
  sovrapposti), `decisions.ts` (scelte periodiche deterministiche) e `trade.ts`
  (import/export sbloccato dal porto).
- **Nuovo**: `world/visualBlock.ts` (+ test) — palette e superficie impacchettate
  nello stesso byte.
- Grammatica di superficie negli edifici, con `buildings/urbanForm.test.ts` a
  verificare che la forma vari in modo deterministico dal profilo locale.

## 2026-08-19 — `d38e7af` — Cozy HUD, qualità adattiva, cielo

- **Nuova interfaccia giocabile**: `ui/GameHud.ts`, `ui/GameHudModel.ts` (view
  model puro, testabile in Node), `ui/hud.css` e `ui/hudIcons.ts` sostituiscono
  `ui/GameToolbar.ts`. Gli overlay tecnici passano dietro a `F3`/`?debug=1`.
- **Nuova qualità adattiva**: `engine/FrameTiming.ts` misura gli intervalli rAF
  (fps, vero uno percento peggiore, p95/p99, jank) ed `engine/RenderQuality.ts`
  ne deriva pixel ratio e profilo di effetti con una sola isteresi — ombre,
  bloom e tilt-shift scendono insieme invece di litigarci. Parametro `?quality=`.
- **Nuovo**: `engine/SkyBackground.ts` — quad in NDC senza profondità, gradiente
  per altezza di schermo (non per elevazione del raggio: la camera è ortografica
  e guarda in basso), disco solare e nuvole a bande. Nuovo tema `diorama`.
- **Nuovi** in `src/game/`: `onboarding.ts` (tutorial derivato dai catalizzatori,
  senza flag nascosti), `cityCondition.ts` (autosufficienza e crisi),
  `sectors.ts` (settori costieri e maschera composta).
- **Nuovo**: `engine/InfluenceOverlay.ts` — cerchi dei catalizzatori e perimetri
  dei settori senza toccare le mesh voxel.

## 2026-08-18 — `1e61a81` — Comandi e modalità di avvio

- **Nuovi**: `game/launchMode.ts` (risoluzione pura della modalità iniziale: la
  radice `/` è l'esperienza completa, gli harness URL restano isolati) e
  `ui/ControlsHint.ts` (onboarding contestuale persistente e pannello di aiuto).

## 2026-08-18 — `c8ee82c` — Azioni di gioco e piazzamento

- **Nuovi**: `game/actions.ts` (azioni economiche atomiche: catalizzatori,
  policy, decisioni, commercio, espansione) e `game/surfacePick.ts` (selezione
  pura della colonna sulla heightmap da un raggio 3D).
- Prima toolbar (`ui/GameToolbar.ts`, poi sostituita dal Cozy HUD) e contratto
  dei pulsanti pointer accettati per il pan della camera.

## 2026-08-18 — `9fc7077` — Edifici procedurali, temi, alberi

- **Nuovo modulo** `src/world/buildings/`: `Builder.ts`, `BuildingRegistry.ts`,
  `generate.ts`, `stamp.ts`, `config.ts` e i loro test. È il ponte tra candidati
  della simulazione e mondo renderizzato.
- **Nuovo modulo** `src/engine/themes/`: sette look intercambiabili. Applicarne
  uno riscrive solo uniform e stato del renderer — nessuna geometria toccata.
- **Nuovi**: `game/loop.ts` (passo fisso con tetto di recupero),
  `game/growthScene.ts` (cablaggio di `grow=1`), `world/terrain/decor.ts`
  (alberi deterministici per cella), `ui/GrowthOverlay.ts`.
- Nascono `AGENTS.md`, i tre `AGENTS.md` di sezione e `docs/PROJECT_MAP.md`.

## 2026-08-18 — `1c9c1a3` — Simulazione a tick

- **Nuovo modulo** `src/sim/`: stato, bilancio del tick, campo di desiderabilità
  chunkato con ricalcolo incrementale, policy, candidati di crescita, barrel
  pubblico e `balance.ts` come unico posto dei coefficienti.
- Contratti presidiati da test fin dal primo giorno: purezza di `tick`, nessuna
  scrittura in `blocks`, serializzazione senza perdita, incrementale ≡
  ricostruzione completa, tick sotto 3 ms.
- Nascono `CLAUDE.md` e `PROJECT_INDEX.md`.

## 2026-08-17 — `6e0a3e0` — Isola procedurale in worker

- **Nuovo modulo** `src/world/terrain/`: 4 ottave di simplex per una maschera
  radiale deformata, biomi da altezza e pendenza, generazione fuori dal main
  thread un blocco di 32×32 colonne per volta, applicazione a budget di frame.
- `TerrainMap` affianca il mondo voxel con una mappa 2D per colonna.

## 2026-08-17 — `544d4b0` — Scaffold del motore voxel

- Storage sparso a chunk (`VoxelWorld`, `Chunk`), greedy mesher puro in worker,
  `ChunkRenderer` con coda a priorità e upload a budget, `VoxelMaterial` unico,
  camera ortografica isometrica, palette a 32 slot, overlay di debug.
