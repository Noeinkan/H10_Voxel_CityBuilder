# Piano — Parte rimanente: assemblatore, camera e test

Seguito del piano `1787685843754-building-scale-system.md`. Le parti 1 (scale.ts +
derivazioni + refactor config) e 2 (bandOps/paint/crowns relative) e le ricette
arcologia sono **già fatte** e i test mirati (`scale.test.ts`, `generate.test.ts`,
`geometry.test.ts`, `arcology/generate.test.ts`) passano. Restano: l'assemblatore
(Parte 3), `main.ts`, e gli aggiornamenti di test + docs.

**Decisione presa dall'utente**: il lotto a terra può crescere fino alla
**larghezza libera dell'isolato** (~38-40 voxel), quindi l'assemblatore gestisce
impronte 17..~40 con fino a ~6 sotto-volumi.

---

## Contesto già verificato

- `MAX_FOOTPRINT = SCALE.moduleFootprint = 16`, `maxLevel = 20`.
- Torri massime reali ~237 voxel (misurato); `maxTowerHeightOf() = 262` (forma chiusa).
- `Builder.place` genera lo stamp in **tre punti**: draft (riga 792), `shaped` per
  il corso di base (856), fallback senza sbalzo (890). `upgradeDriver.ts` in due
  punti (195, 213). `recordStamp.ts` in uno (31).
- `findLot` (Builder.ts:1196) passa `footprint: MAX_FOOTPRINT` → il lotto non può
  oggi superare 16, quindi l'assemblatore non scatterebbe mai.
- `sliceStamps` (stamp.ts:135) spezza già gli stamp oltre `segmentSide`; il
  budget di chunk deriva da Parte 1 e regge.
- L'invariante di cancellazione: `recordStamp` deve riprodurre **esattamente** ciò
  che `place`/`upgrade` hanno scritto, o restano voxel orfani.

---

## 1. Nuovo modulo `src/world/buildings/assemble.ts`

Firma pubblica:

```ts
export function assembleBuilding(request: BuildingRequest, footprintCap: number): VoxelStamp;
```

- Guardia: se `footprintCap <= MAX_FOOTPRINT`, delega a `generateBuilding`.
- **Sale proprio** (`ASSEMBLE_SALT`, pattern `peakSalt`/`kindSalt`): tutti i tiri
  escono da `seed` via `hashCoords`/`mulberry32`, mai da `Math.random`/`Date.now`.
- **Sotto-volumi**: ognuno è un `generateBuilding({ ...request, footprintCap:
  subSide, seed: subSeed(i) })` con `subSide <= MAX_FOOTPRINT` e
  `subSeed(i) = hashCoords((seed ^ ASSEMBLE_SALT) >>> 0, i, 0)`. Forzare
  `shape.overhang = 0` su ogni sotto-volume (un assemblaggio riempie il lotto,
  non aggetta sulla strada) e `facing` preservato per l'accento/portale.
- **Layout** deterministico scelto da `hashCoords((seed ^ ASSEMBLE_SALT) >>> 0,
  footprintCap, 0) % LAYOUTS.length`; catalogo enumerato:
  - `singleTower` — podio + 1 volume centrato;
  - `twoTowers` — 2 volumi (nord/sud oppure est/ovest);
  - `fourCorners` — 4 volumi agli angoli + corte centrale;
  - `lShape` — 2 volumi a L;
  - `row` — 3..N volumi in fila (per le impronte più larghe, 33..~40).
  Ogni layout mappa `footprintCap → readonly { x, y, side }[]`; i lati si
  quantizzano a multiplo di `STREETS.align` (cellSize=2) e si clampano a
  `1..MAX_FOOTPRINT`.
- **Podio condiviso** di altezza `GRAMMAR.plinthHeight`: riempie l'intera
  impronta; la sommità non coperta da un sotto-volume è **terrazza/corte**
  (palette `terrace`/`garden` + `SURFACE_KIND.roofTech`), riusando gli id già in
  `paint.ts`, mai aria morta.
- **Fusione** in un solo `VoxelStamp` (`sizeX = sizeY = footprintCap`,
  `sizeZ = podium + max(sub.sizeZ)`, `anchorX = anchorY = 0`, `bandStarts = [0,
  sizeZ]`), con un blit sul pattern di `landmarks/generate.ts`.

### Dispatcher unico

Per non far divergere i tre chiamanti:

```ts
export function buildStamp(request: BuildingRequest, footprintCap: number): VoxelStamp {
  return footprintCap > MAX_FOOTPRINT
    ? assembleBuilding(request, footprintCap)
    : generateBuilding(request);
}
```

Aggiornare i tre siti:

1. **`Builder.place`** — sostituire i 3 `generateBuilding({...})` (righe 792, 856,
   890) con `buildStamp({...}, footprintCap)`. Quando `footprintCap >
   MAX_FOOTPRINT`, forzare `over = 0` (l'inviluppo coincide con l'impronta) così
   `groundSideOf(draft, over, facing) === footprintCap` e le righe di
   scorrimento/slack restano inattive (`slack = 0`).
2. **`upgradeDriver.ts`** — righe 195 e 213: usare `buildStamp`. Cambiare
   `footprintCap: Math.min(MAX_FOOTPRINT, room)` → `footprintCap: room`
   (altrimenti un edificio assemblato **restringe** al primo upgrade); il
   fallback `fitsWider` resta `footprintCap: record.footprint`. `footprintFloor:
   record.footprint` resta invariato.
3. **`recordStamp.ts`** — riga 31: usare `buildStamp({...}, record.footprint)`.
   È il punto critico dell'invariante di cancellazione.

### `findLot` — alzare il tetto del lotto

`Builder.ts:1196`: invece di `footprint: MAX_FOOTPRINT`, passare il lato libero
dell'isolato:

```ts
const rect = this.streets.blockRect(block);
const side = Math.min(rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);
const lot = placeLot({ rect, x, y, footprint: side, accepts: ... });
```

`placeLot` clampa già a `min(side, width, height)`. Niente altro da toccare:
`surveyGrade`/`joinCluster`/`lotRoleOf` sono generici rispetto all'impronta.

---

## 2. `main.ts` — camera e worldHeight

- **`worldHeight`** (riga 192): `clampInt(params.get('height'), 64, 32, 256)` →
  default e tetto derivati dalla scala verticale (es. `maxTowerHeightOf() +
  TERRAIN.maxHeight`), mantenendo l'override da URL. Oggi 64 tronca le torri da
  ~237.
- **`spanZ` inquadratura crescita** (riga 503, `320`): derivare da
  `maxTowerHeightOf()` + pianoro del terreno (il commento va aggiornato: parla di
  torri da 150, ora 237). La riga 506 (`160`, isola sola) resta sul rilievo.
- **`targetHeight` camera** (riga 353, `24`): **non cambia** — è il perno sul
  pianoro, non la cima della torre.

---

## 3. Test da aggiornare

### `arcology/siting.test.ts`

- `ready()`: `spanX: 16, spanY: 16` → `20, 20` (span Twin Stem).
- "accetta un isolato largo esattamente quanto l'ingombro": blockRect
  `{x0:3,y0:7,x1:18,y1:22}` (lato 16) → `{x0:3,y0:7,x1:22,y1:26}` (lato 20).
- "su un isolato da quattordici sceglie una forma che entra": blockRect
  `{0,0,13,13}` → isolato stretto da 18 (`{0,0,17,17}`); asserire
  `kind !== twinStem` e `span[0] <= 18 && span[1] <= 18` (Branching Core e
  Sky Weave entrano, la Twin Stem da 20 no).
- Verificare che "rifiuta l'isolato che non contiene l'ingombro" e "sugli isolati
  larghi rende raggiungibile ogni forma" passino invariati (con span 20 il blocco
  largo 20 li ammette tutti).

### `generateDigest.test.ts` — rigenerare le digest

Il cambio di grammatica (modulo 16, passo 2, `maxLevel` 20) fa cadere **tutte**
le digest: è il caso "cambio dichiarato" previsto dal commento del file.

- `LEVELS = [0, 3, 6, 9, BUILDER.maxLevel]` → diventa `[0, 3, 6, 9, 20]`.
- Rigenerare le 60 voci (4 usi × 5 livelli × 3 semi) calcolando
  `stampDigest(generateBuilding({ class, level, seed }))` con uno snippet
  monouso (o leggendo i fallimenti del test) e sostituendo la tabella `DIGESTS`;
  le chiavi passano da `*-12-*` a `*-20-*`.

### Altro

- `npm test -- src/world` per stanare eventuali altri letterali accoppiati
  rimasti (aerial/typology/crossingDriver/spanDriver): correggere i soli casi
  reali, non "per prudenza".

---

## 4. Docs

- Scrivere `docs/pending/world-scale-assembler.md` (sezione `## indice` per
  `src/world/scale.ts` e `src/world/buildings/assemble.ts` + `## changelog`) e
  lanciare `npm run docs:merge`. Non toccare a mano `PROJECT_INDEX.md`/
  `CHANGELOG.md`.

---

## Ordine di esecuzione

1. `assemble.ts` + `buildStamp` + `findLot` (cap lato isolato).
2. Aggancio nei 3 siti (`place`, `upgradeDriver`, `recordStamp`).
3. Test mirati assemblatore (`assemble.test.ts` col-locato: determinismo,
   impronta = footprintCap, sotto-volumi ≤ MAX_FOOTPRINT, niente overhang,
   fusione senza vuoti orfani) + `typecheck`.
4. `main.ts` (worldHeight + spanZ).
5. Aggiornare `siting.test.ts` e rigenerare `generateDigest.test.ts`.
6. `docs/pending` + `docs:merge`.
7. Validazione finale (sotto).

## Validazione

- `npm run typecheck` dopo ogni passo.
- `npm test -- src/world/buildings` e `npm test -- src/world/arcology
  src/world/aerial src/world/skyline src/world/streets`.
- `npm test -- src/world` (modifica cross-dominio: è il caso previsto).
- `npm run build`.
- Verifica visuale **manuale** `?debug=1&terrain=1337` (fuori scope per
  l'executor): modulo 16 resta un volume (niente pali), l'assemblatore produce
  pieni/vuoti leggibili, lo skyline conserva poche guglie, budget non-render
  < 3 ms / generazione < 1,5 ms.

## Rischi residui

- **Voxel orfani**: `recordStamp` deve riprodurre lo stamp assemblato esattamente
  (stesso dispatcher, stesso sale, stessi sotto-semi).
- **Restringimento all'upgrade**: senza il cambio `Math.min(MAX_FOOTPRINT, room)
  → room`, un edificio assemblato si restringe al primo upgrade.
- **Overhang**: forzare 0 sui sotto-volumi, altrimenti l'inviluppo esce dal lotto
  e `groundSideOf` diverge dal record.
- **Perdita di capacità dell'isola**: lotti più larghi riducono gli edifici per
  isolato (accettato, fuori scope).
