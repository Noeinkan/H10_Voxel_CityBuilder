# Piano — Sistema robusto di scala per edifici mastodontici

## Obiettivo

Rendere la scala degli edifici una **manopola ripetibile**, non un insieme di
numeri accoppiati da ritoccare a mano a ogni fase. Due assi indipendenti:

- **Asse orizzontale** — il modulo a fasce cresce (impronta fino a sotto `CHUNK`),
  e oltre si compone: un edificio diventa un assemblaggio di sotto-volumi su un
  podio condiviso.
- **Asse verticale** — crescono livelli e fasce.

Vincoli immutabili (confermati dall'utente): `voxel = 1`, `cellSize = 2`,
`CHUNK = 32`, 32 slot palette, 8 tipi di superficie. La microgeometria (zoccolo,
parapetto, portale, passo montanti, smusso, sbalzo) resta a grana voxel fissa;
scala solo la **struttura** (numero di sotto-volumi e fasce, profondità degli
arretramenti, ampiezza dei vuoti).

Target della prima applicazione: `maxLevel 12 → 20`, impronta del modulo
`8 → 16`, passo stradale `22 → ~40`. Il piano a lungo termine (ordine di
grandezza) resta raggiungibile rigirando le stesse manopole, senza riscrivere
regole.

---

## Stato attuale (mappa degli accoppiamenti)

Oggi i numeri accoppiati sono **scritti a mano** e tenuti insieme solo da
commenti e da pochi test di coerenza. Inventario completo, con valore attuale
`→` target e consumatori:

### Asse verticale (livelli / fasce)

| Costante | File | Oggi | Target | Consumatori |
| --- | --- | --- | --- | --- |
| `BUILDER.maxLevel` | `buildings/config/builder.ts` | 12 | 20 | `generate.ts`, `startLevel`, `hierarchy.ts`, `selection.ts`, `main.ts` (diorama), `arcology/config.ts` (clearing), `landmarks/config.ts` (commento) |
| `LEVEL_CAPS` (array 13 voci) | `buildings/config/levels.ts` | 13 voci | generato da `V` | `generate.ts`, `arcology/generate.test.ts` |
| `START_LEVEL_CDF` (array 13 voci) | `buildings/config/levels.ts` | 13 voci | generato da `V` | `startLevel` in `generate.ts` |
| `SKYLINE.levelCap [3,6,9] + coneBonus 2 + peakBonus 1` | `skyline/config.ts` | somma 12 | somma 20 | `tiers.ts`, `tiers.test.ts` |
| `BUILDER.maxDirtyChunksPerBuilding` | `buildings/config/builder.ts` | 40 (2×2×7) | derivato da `V` | `chunkBudget.ts`, `arcology`, `overhang.test.ts` |
| `GRAMMAR.minBandSide` | `buildings/config/grammar.ts` | 4 | `module/2` | `bandOps.ts`, `paint.ts`, `generate.test.ts` |
| `worldHeight` / camera `spanZ` | `main.ts` | 64 clamp 32..256 / 320 | cresce | bootstrap camera |

### Asse orizzontale (impronta / passo / sotto-volumi)

| Costante | File | Oggi | Target | Consumatori |
| --- | --- | --- | --- | --- |
| `MAX_FOOTPRINT` | `buildings/config/grammar.ts` | 8 | 16 | `generate.ts`, `Builder.ts`, `typologies.ts`, `crossingDriver.ts`, `spanDriver.ts`, `aerial/terraceForm.ts`, `landmarks/config.ts`, `traffic/config.ts` |
| `MIN_FOOTPRINT` | `buildings/config/grammar.ts` | 4 | 8 | `generate.ts`, `bandOps.ts`, `aerial/config.ts` |
| `STREETS.pitch` / `jitter` | `streets/config.ts` | 22 / 4 | ~40 / ~8 | `lots.ts`, `streetGrid.ts` |
| `BUILDER.segmentSide` | `buildings/config/builder.ts` | 16 (½ chunk) | ≥ `MAX_FOOTPRINT + overhang` | `sliceStamps`, `growthQueue.ts`, `arcology` |
| `GRAMMAR.maxOverhang` | `buildings/config/grammar.ts` | 2 | 2 (fisso, micro) | `generate.ts`, `overhang.test.ts` |
| `BUILDER.coastalRadius` | `buildings/config/builder.ts` | 14 | derivato | `typology` selezione |
| arcologia `span` | `arcology/config.ts` | [16,16] | `> MAX_FOOTPRINT` | `arcology/generate.test.ts` |

### Vincoli duri già verificati da test (da preservare e generalizzare)

- `LEVEL_CAPS.length === maxLevel + 1` e `START_LEVEL_CDF.length === maxLevel + 1`
  (`generate.test.ts:290-291`).
- `START_LEVEL_CDF` non decrescente, ultimo `= 1` (`generate.test.ts:294-297`).
- `SKYLINE` somma massima `=== BUILDER.maxLevel` (`tiers.test.ts:67`).
- `MAX_FOOTPRINT + maxOverhang < CHUNK` (`overhang.test.ts:233`).
- `MAX_FOOTPRINT + maxOverhang <= BUILDER.segmentSide` (`overhang.test.ts:445`).
- L'inviluppo resta entro 2 colonne di chunk per asse finché il lato < `CHUNK`
  (`overhang.test.ts:247-262`).
- Arcologia: `span <= segmentSide` e `span > MAX_FOOTPRINT`
  (`arcology/generate.test.ts:34-36`).

---

## Architettura della soluzione

Tre parti, in ordine di dipendenza. Ogni parte chiude con un gate di test prima
della successiva.

### Parte 1 — Sistema di scala: manopole + derivazione + invarianti

Nuovo modulo **`src/world/scale.ts`** alla radice di `world/`, con lo stesso
ruolo cross-dominio di `planMask.ts` (due o più domini lo condividono).

Contiene:

- Le **due manopole** come unica fonte di verità:
  - `SCALE.moduleFootprint` (asse orizzontale) — impronta massima del singolo
    modulo a fasce, in voxel. Oggi 8, target 16.
  - `SCALE.maxLevel` (asse verticale). Oggi 12, target 20.
- **Funzioni di derivazione** per ogni costante accoppiata, con commento del
  *perché* (regola del progetto: il numero deriva, non si ricorda):
  - `minFootprint = moduleFootprint / 2`
  - `minBandSide = moduleFootprint / 2` (strutturale: tiene il corpo un volume,
    non un palo)
  - `segmentSide = max(CHUNK/2, ceil((moduleFootprint + maxOverhang + 1) / 2) * 2)`
  - `levelCapsOf(V)` → genera `LEVEL_CAPS` con la stessa silhouette attuale:
    l'impronta satura per prima (raggiunge `moduleFootprint` intorno al livello
    6), poi le fasce continuano a salire. `minBands/maxBands` monotoni.
  - `startLevelCdfOf(V)` → testa a coda lunga (`[0.78, 0.94, 0.985, 0.997]`)
    riempita con `1` fino a lunghezza `V + 1`.
  - `skylineCapsOf(V)` → `levelCap` + `coneBonus` + `peakBonus` con
    `max(levelCap) + coneBonus + peakBonus === V`.
  - `maxDirtyChunksPerBuildingOf(V)` → `2 × 2 × ceil(torreMassimaVoxel / CHUNK)`
    + margine, calcolato in forma chiusa dalla fascia più alta che `V` può
    produrre (non stimato).
  - `streetPitchOf(moduleFootprint)` → `pitch`/`jitter` tali che
    `pitch - 2*jitter >= moduleFootprint + 2*cellSize` (l'isolato più stretto
    regge il modulo più largo).
  - `coastalRadiusOf(moduleFootprint)`.
- **Test dedicato `scale.test.ts`** che asserisce tutti i vincoli duri sopra per
  la coppia di manopole corrente e per una seconda coppia "ordine di grandezza"
  (`moduleFootprint` 24, `maxLevel` 40) a titolo di prova di scala. Questo è il
  cuore della ripetibilità: cambiare le manopole e vedere i test verdi garantisce
  che nessun accoppiamento è rimasto scoperto.

Poi i file di dominio importano da `scale.ts` invece di scrivere i numeri:
`buildings/config/builder.ts`, `grammar.ts`, `levels.ts`, `streets/config.ts`,
`skyline/config.ts`, `arcology/config.ts`, `aerial/config.ts`,
`traffic/config.ts`. Ogni dominio conserva le proprie costanti **locali**
(soglie di bioma, palette, ritmi), ma le costanti accoppiate alla scala sono
derivate.

### Parte 2 — Motore di composizione relativa

Rende le regole procedurali **relative al modulo**, così lo stesso repertorio
compone una casa da 8 voxel o un modulo da 16 senza taratura a mano.

- `bandOps.ts`: gli scarti di `shrink`, `shrinkOneSide`, `setback`, `stack`,
  `grow`, `jog`, `shear`, `corner` diventano funzione di un **passo** =
  `floor(moduleFootprint / 8)` invece di 1–2 voxel fissi. `keep` e `jut` restano
  invariati. **Determinismo preservato**: si cambia la *grandezza* degli scarti,
  non il *numero* di tiri consumati (invariante «chi consuma tiri li consuma
  sempre»).
- `paint.ts`: `terraceMinRing` (ampiezza vuoto), la soglia di svuotamento della
  corte (`rect.w >= 6`), e il clamp dello smusso diventano funzioni del modulo.
  **Restano fissi** (microgeometria): `plinthHeight`, `spandrelHeight`,
  `portalHeight`, `bayPeriod`, `maxChamfer`, `maxOverhang`, `arcadeHeight`.
- `crowns.ts` / `GRAMMAR.crownHeight`: si verifica che il coronamento resti
  leggibile sul modulo più largo (le rientranze `shrink` ora scalano).

### Parte 3 — Assemblatore di sotto-volumi

Nuovo modulo **`src/world/buildings/assemble.ts`**.

- Quando `footprintCap` (dal lotto) supera `MAX_FOOTPRINT`, invece di generare un
  solo `generateBuilding`, l'assemblatore **scompone** l'impronta in un layout
  deterministico di 2..N sotto-volumi (podio + torre singola, due torri,
  quattro angoli + corte, L): layout e sotto-semi derivati dal seme del record
  via `hashCoords`/`mulberry32` già esistenti.
- Ogni sotto-volume è un `generateBuilding` con sotto-impronta `<= MAX_FOOTPRINT`
  e un sotto-seme. Poi si fondono in **un solo `VoxelStamp`** su un podio
  condiviso (analogo a come `landmarks/generate.ts` fonde `PART` in un canvas).
- I vuoti tra i sotto-volumi sono i "pieni e vuoti": la sommità del podio non
  coperta da un sotto-volume diventa terrazza/corte (riusa `roofTech`/`garden`
  già in `paint.ts`), non aria morta.
- L'assembler produce uno stamp che può superare `CHUNK` in pianta; `sliceStamps`
  lo spezza già (è il meccanismo dei moli/landmark). Il tetto di chunk sporchi
  arriva dalla derivazione di Parte 1, quindi il budget regge.
- `Builder.place` / `upgradePass` restano a un solo record per edificio
  (invariante 7: la simulazione conta un edificio per record). L'assemblaggio è
  interno alla sagoma, come già lo sono `courtyard` e `overhang`.

---

## Elenco ordinato delle modifiche

1. **`src/world/scale.ts`** (nuovo) — manopole `moduleFootprint`/`maxLevel` +
   funzioni di derivazione + `levelCapsOf`/`startLevelCdfOf`/`skylineCapsOf`/
   `maxDirtyChunksPerBuildingOf`/`streetPitchOf`/`coastalRadiusOf`.
2. **`src/world/scale.test.ts`** (nuovo) — invarianti per la coppia corrente e
   per la coppia "ordine di grandezza" di prova.
3. Rifattorizzare i config di dominio per importare da `scale.ts`:
   `buildings/config/grammar.ts` (`MAX_FOOTPRINT`, `MIN_FOOTPRINT`,
   `minBandSide`), `builder.ts` (`maxLevel`, `maxDirtyChunksPerBuilding`,
   `segmentSide`, `coastalRadius`), `levels.ts` (`LEVEL_CAPS`,
   `START_LEVEL_CDF`), `streets/config.ts` (`pitch`, `jitter`),
   `skyline/config.ts` (`levelCap`, `coneBonus`, `peakBonus`),
   `arcology/config.ts` (span/height sopra `MAX_FOOTPRINT`),
   `aerial/config.ts`, `traffic/config.ts`.
4. **Parte 2**: `bandOps.ts` (passo proporzionale), `paint.ts` (soglie vuoto
   relative), verifica `crowns.ts`.
5. **Parte 3**: `src/world/buildings/assemble.ts` + aggancio in
   `Builder.ts::place` (e `upgradePass` per la coerenza) quando
   `footprintCap > MAX_FOOTPRINT`.
6. `main.ts`: parametri camera/`worldHeight` derivati dalla scala verticale.
7. Test di coerenza: aggiornare i test esistenti che leggono `LEVEL_CAPS`,
   `START_LEVEL_CDF`, `MAX_FOOTPRINT`, `maxLevel` affinché leggano le manopole
   invece di numeri fissi (già in buona parte lo fanno: `generate.test.ts`,
   `tiers.test.ts`, `overhang.test.ts`, `arcology/generate.test.ts`).
8. `docs/pending/` + `npm run docs:merge`.

---

## Validazione

- `npm run typecheck` dopo ogni parte.
- Test mirati: `npm run test:related -- src/world/scale.ts` e i file toccati
  (`buildings/config`, `streets/config`, `skyline`, `arcology`, `bandOps`,
  `paint`, `assemble`).
- `npm test -- src/world` quando la modifica attraversa più domini (è il caso:
  tocca buildings, streets, skyline, arcology, aerial, traffic).
- **Verifica visuale obbligatoria** (`?debug=1&terrain=1337`): l'overlay e i
  budget pertinenti (lavoro non-render < 3 ms, generazione < 1,5 ms) vanno
  confermati a mano; non aggiornare misure per stima. Guardare: il modulo 16
  resta un volume (niente pali), l'assemblatore produce pieni/vuoti leggibili,
  lo skyline conserva poche guglie.
- Per worker/bundle: `npm run build` (la modifica non tocca i worker, ma
  `main.ts` e i config sì; eseguire a fine lavoro per sicurezza).

---

## Rischi e modalità di guasto

- **Rompere il determinismo.** Gli scarti proporzionali di `bandOps` non devono
  cambiare il *numero* di tiri consumati; solo la grandezza degli scarti.
  `generateDigest.test.ts` è la rete.
- **Palo / matita.** Se `minBandSide` non scala con il modulo, un modulo 16 con
  scarti più profondi torna a restringersi a un palo. `minBandSide =
  moduleFootprint / 2` lo impedisce; verificare in `geometry.test.ts`.
- **Sforare il budget di chunk.** L'assemblatore produce impronte oltre `CHUNK`;
  il tetto deve derivare dalla torre massima (Parte 1), altrimenti gli edifici
  grandi spariscono in silenzio (difetto già documentato nel commento di
  `maxDirtyChunksPerBuilding`).
- **Arcologia sotto il modulo.** Il test `span > MAX_FOOTPRINT` impone di
  alzare le ricette arcologia quando il modulo cresce; non va lasciato ai
  commenti.
- **Perdita di capacità dell'isola.** Impronte e passo più larghi riducono il
  numero di edifici per isolato su un'isola fissa (`TERRAIN_SIZE 512`); è una
  conseguenza accettata della scala, da segnalare ma fuori scope per ora.
- **PRNG / hash condivisi.** L'assemblatore consuma sotto-semi da
  `hashCoords`; usare un sale proprio (pattern `peakSalt`/`kindSalt`) per non
  correlare i sotto-volumi al verso o alla tipologia.

---

## Fuori scope (esplicito)

- Cambiare `CHUNK`, `cellSize` o il voxel (restano fissi per decisione utente).
- Ridisegnare il mesher o le primitive `PART` dei landmark (riusate, non
  estese).
- Ricalibrare `TERRAIN.maxHeight`/`TERRAIN_SIZE` per la scala nuova (verrà
  fatto solo se l'isola risulta sottodimensionata, come step separato).

---

## Note finali per chi implementa

- Rispettare le convenzioni del repo: due spazi, apici singoli, `import type`,
  commenti in italiano che spiegano il perché, nessun `lint`/formatter.
- Ogni costante derivata vive **in un solo file per dominio** e importa da
  `scale.ts`; non duplicare numeri nei consumatori.
- Non modificare `dist/`, `node_modules/`, `PROJECT_INDEX.md` o `CHANGELOG.md`
  a mano: usare `docs/pending/` + `docs:merge`.

Questo piano richiede modifiche al codice sorgente; per implementarlo serve un
agente in grado di scrivere codice.
