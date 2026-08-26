# Landmark nuovi: firma, stadi e microgeometrie

Rinforzare le sei ricette nuove (`power`, `school`, `radio`, `lighthouse`,
`theatre`, `stadium`) perché raggiungano la qualita' delle dodici storiche:
firme piu' originali, salti di stadio piu' leggibili e microgeometrie attive.

## Stato accertato sul codice

- **Swatch: gia' coperto, niente da fare.** `swatchCatalog.ts` deriva i landmark
  da `CATALYSTS` + `LANDMARKS` (`landmarkRows()`), quindi i sei ruoli compaiono
  gia' nel campionario con le tre varianti ciascuno.
- **Stadi: gia' evolvono, ma in modo poco visibile.** Ogni ricetta ha `stages`
  a 4 soglie e `parts` a 4 stadi cumulativi; `LandmarkDriver` avanza via
  `stageForBuildings` (landmarkDriver.ts:403). Non e' un bug: sono i delta fra
  stadio e stadio a essere troppo deboli (es. `radio`: traliccio allungato di
  otto voxel).
- **Microgeometrie: vero e azionabile.** Solo `theatre` usa `entrance()` e
  `signBand()`. Le altre cinque poggiano su `utility`/`plain`, che
  `collectSurfaceCells` scarta per contratto (engine/AGENTS.md:65-70). I canali
  che il mesher aggancia sono `portal` (→`emitPortals`: montanti, architrave,
  pensilina) e `luminous` (→`emitLuminous`: cornice emissiva), piu' gli emettitori
  di facciata `habitat`/`industrial`/`civic` e di tetto `roofTech`.

## Decisione

**Rafforzamento mirato** (scelto dall'utente): si mantengono i sei concetti e i
rispettivi `span`/`height`/`anchor`/`apron`, si rinforzano le firme usando il
vocabolario completo delle dieci primitive e si attivano le microgeometrie con
`entrance()`/`signBand()`. Catalizzatori, pesi, icone e `balance.ts` restano
intoccati. Nessun nuovo `FORMS`/`waterline`/`moorings`.

## Contesto tecnico

- Helper disponibili in `src/world/landmarks/vocab.ts`: `entrance(x,y,w,h,height)`
  (portale, `SURFACE_KIND.portal`) e `signBand(x,y,w,h,z)` (insegna,
  `SURFACE_KIND.luminous`). Vanno **sovrapposti a una parete gia' esistente**
  (sovrascrivono la colonna, non aggiungono volume): se la colonna non c'e',
  creano un prisma a mezz'aria, che viola la regola "niente parti a mezz'aria
  sotto `LANDMARK.groundBand`" e l'invarianza di rotazione.
- `growth.ts` e `connections.ts` oggi **non** importano da `../vocab`; vanno
  aggiunti `import { entrance, signBand } from '../vocab'`.
- Le primitive da sfruttare di piu': `pitch` (falda), `steps` (rastrematura/
  gradoni, anche con `chamfer` per cupola/catino), `colonnade` (vuoto sotto un
  pieno), `truss` (aria dentro), `hull`, e `chamfer` come modificatore della
  pianta (un tamburo e' una scatola smussata, non un `chamfer:1` appena visibile).

## Task ordinati

Tutte le modifiche stanno in `src/world/landmarks/recipes/{growth,connections,identity}.ts`.
Non si tocca `config.ts` (le ricette arrivano gia' via import e spread).

### 1. `growth.ts`

**POWER** (`span [16,12]`, `height 20`):
- Sostituire il tetto piatto del capannone (`deck` a z=7) con una falda `pitch`.
- Torri di raffreddamento: da `slab` `chamfer:1` a tamburi leggibili — `slab`
  con `chamfer:2` + `cap`, oppure `steps` `step:1` per una rastrematura.
- Ciminiera: `mast` + corona `steps` dorata (`cap`).
- Aggiungere `entrance()` sul fronte (+x) del capannone e `signBand()` a quota
  visibile.
- Stadi: 0 capannone con falda; 1 prima torre; 2 seconda torre; 3 ciminiera +
  entrance/signBand. Ogni stadio deve **aggiungere un volume distinto**, non
  estendere il precedente.

**SCHOOL** (`span [14,12]`, `height 20`):
- Corpo a U vero: `shell` sul fronte + due ali laterali (`slab`/`shell`),
  cortile aperto sul retro (il `colonnade` del cortile gia' c'e').
- Falda `pitch` sulle ali.
- Torre dell'orologio: `mast` + quadrante `luminous` + corona `steps`.
- `entrance()` + `signBand()` sul fronte.

### 2. `connections.ts`

**RADIO** (`span [12,10]`, `height 30`):
- Mantenere il traliccio `truss` (e' la firma corretta); aggiungere
  `entrance()` + `signBand()` all'edificio di servizio.
- Antenna sommitale: `mast` + finiale `steps`; opzionale un `boom` trasversale
  come braccio d'antenna nello stadio finale.

**LIGHTHOUSE** (`span [12,12]`, `height 24`):
- Rastremazione vera: sostituire il `mast` 4×4 con una torre `steps` che parte
  da una base piu' larga (es. 6×6 → 4×4 → 2×2) lungo gli stadi.
- Ballatoio `deck` + lanterna `luminous` + cappello dorato `steps`.
- `entrance()` + `signBand()` sulla casa del custode.

### 3. `identity.ts`

**THEATRE** (`span [16,10]`, `height 24`): gia' il piu' completo (falda, torre
scenica, colonnato, `entrance`, `signBand`). Solo polish: corona `steps` sulla
torre scenica; verificare che la falda della sala e il colonnato restino la
firma dominante.

**STADIUM** (`span [20,16]`, `height 10`):
- "Catino" vero: sostituire l'anello `shell` `chamfer:1` con una gradinata
  `steps` (tribune a terrazze) con `chamfer` per l'ovale; campo interno
  `deck` verde; `colonnade` come fascia alta.
- `entrance()` (porta) + `signBand()` sul fronte.
- Le torri faro (`mast` + `slab` `luminous`) restano.

## Invarianti da preservare (verificati da `generate.test.ts`)

1. Ogni parte dentro l'ingombro dichiarato (`x1 < long`, `y1 < short`,
   `z1 < height`), tronco e varianti.
2. `variant.parts.length <= recipe.parts.length`.
3. Palette < 32.
4. `stages[0] === 0`, `stages.length === parts.length`, soglie crescenti.
5. Stamp deterministico byte-per-byte.
6. Stadi cumulativi: lo stadio `n` copre `n-1` e ha piu' voxel.
7. Invarianza di rotazione: `solidCount` uguale sui 4 versi (attenzione a
   `pitch`/`hull`/`steps` con `chamfer`, che seguono l'asse maggiore).
8. Firma unica: `sizeX×sizeY×sizeZ:solidCount` distinta fra le 18 ricette.
9. Varianti additive (contengono il tronco), distinguibili per nome e conteggio.
10. Firma verticale: `top >= floor(height/2)`.
11. `entrance`/`signBand` solo su pareti esistenti (niente prismi a mezz'aria
    sotto `groundBand`).

## Verifica

```bash
npm run typecheck
npm run test:related -- src/world/landmarks/config.ts   # tira dentro generate.test, recipes, swatchCatalog
```

- Se un `test:related` non copre un consumatore reale o si toccano piu' domini,
  allargare a `npm run test:changed`. Non serve `npm run build` (nessun worker).
- Visuale: `?scene=swatch` per confermare che i sei landmark compaiono con la
  nuova firma e le microgeometrie; `?debug=1&terrain=1337` per piazzamento e
  avanzamento degli stadi.
- Collisione di firma (invariante 8): se `generate.test.ts` segnala due ricette
  con lo stesso `sizeX×sizeY×sizeZ:solidCount`, ritoccare una misura (non il
  colore, che non entra nella firma).

## Documentazione

Frammento in `docs/pending/` (indice + changelog) e `npm run docs:merge`, come
da definizione di completamento del file radice.

## Fuori scopo

- Niente modifiche a `CATALYSTS`, `balance.ts`, icone (`hudIcons.ts`), `FORMS`,
  `waterline` o `moorings`.
- Le soglie di `stages` (quanti edifici sbloccano ogni stadio) restano invariate;
  si rinforza solo la geometria dei salti.
- Le dodici ricette storiche in `config.ts` non si toccano.
