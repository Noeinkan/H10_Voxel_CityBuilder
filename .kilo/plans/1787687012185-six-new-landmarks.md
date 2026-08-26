# Sei nuovi landmark (2 per categoria)

Aggiungere sei catalizzatori/landmark — due per ciascun gruppo della toolbar
(Growth, Connections, Identity) — portando ogni categoria da 4 a 6 ruoli, per un
totale di 18. Ogni nuovo ruolo ha: definizione catalizzatore, pesi (costo/
intensita'/raggio), vettore di influenza, effetti di distretto e una ricetta
voxel con la propria composizione geometrica.

## Contesto e vincoli (gia' verificati sul codice)

- La toolbar (`src/ui/BuildDock.ts`) e' generata da `CATALYSTS`/`CATALYST_GROUPS`;
  il grid `.dock-group-row` e' `repeat(3, 1fr)`: 4 ruoli oggi vanno a capo come
  3+1, con 6 diventano **due righe piene di 3**. Nessuna modifica CSS.
- Il campionario (`src/world/scenes/swatchCatalog.ts`) deriva i soggetti landmark
  da `CATALYSTS`+`LANDMARKS`: i nuovi ruoli compaiono da soli.
- Invarianti testati da rispettare:
  - `src/world/landmarks/generate.test.ts`: `RECIPES.length === CATALYSTS.length`
    e **ogni** ruolo ha `LANDMARKS[id]`; la firma `sizeX×sizeY×sizeZ:solidCount`
    deve restare unica fra tutte le ricette; ogni ricetta ha >=2 esemplari; ogni
    esemplare contiene il tronco per intero (varianti solo additive).
  - `src/sim/uses.test.ts`: ogni ruolo ha **almeno un uso a influenza esattamente
    1** (invariante "al centro il campo vale `strength`").
  - `src/sim/districts.test.ts`: conteggio ruoli e unicita' degli effetti (oggi
    fissati a 12).
- Regola AGENTS radice: oltre ~600 righe un file va spezzato prima di aggiungere
  altro. `src/world/landmarks/config.ts` e' a ~2010 righe: le sei ricette nuove
  **non** si accodano li', vanno in file nuovi.

## Decisioni di design

### I sei ruoli (confermati dall'utente)

| Gruppo | id | Label | site | firma sagoma |
| --- | --- | --- | --- | --- |
| Growth | `power` | Power Station | any | due torri di raffreddamento tozze + ciminiera sottile |
| Growth | `school` | School | any | corpo a U basso attorno a un cortile + torre dell'orologio |
| Connections | `radio` | Radio Tower | any | traliccio altissimo e sottile + edificio di servizio |
| Connections | `lighthouse` | Lighthouse | coastal | torre rastremata + lanterna luminosa + casa del custode |
| Identity | `theatre` | Theatre | any | torre scenica + sala a falda + colonnato d'ingresso |
| Identity | `stadium` | Stadium | any | catino ovale cavo, basso e largo |

`lighthouse` e' l'unico nuovo vincolo di sito (`coastal`); nessun nuovo ruolo ha
forma da facciata (`aloft`) ne' forma d'acqua, quindi niente `FORMS` e niente
`waterline`.

### Pesi ed effetti (valori target, da `balance.ts`)

`roles` (costo / intensita' / raggio):
```
power:      { cost: 200, strength: 200, radius: 48 }
school:     { cost: 260, strength: 195, radius: 50 }
radio:      { cost: 300, strength: 185, radius: 60 }
lighthouse: { cost: 240, strength: 175, radius: 40 }
theatre:    { cost: 420, strength: 205, radius: 48 }
stadium:    { cost: 460, strength: 210, radius: 55 }
```

`influence` (residential / commercial / industrial / civic, sempre con un uso a 1):
```
power:      { residential: -0.35, commercial: 0.25, industrial: 1,    civic: 0 }
school:     { residential: 0.75,  commercial: 0.25, industrial: -0.1, civic: 1 }
radio:      { residential: 0.35,  commercial: 1,    industrial: 0.4,  civic: 0.55 }
lighthouse: { residential: 0.5,   commercial: 0.35, industrial: -0.1, civic: 1 }
theatre:    { residential: 0.35,  commercial: 0.7,  industrial: -0.15, civic: 1 }
stadium:    { residential: 0.3,   commercial: 1,    industrial: -0.05, civic: 0.55 }
```

`districts.catalystEffects` (density / wealth / accessibility / satisfaction / industry;
tutti e 18 i JSON devono restare **distinti**):
```
power:      { density: 30, wealth: 25, accessibility: 20,  satisfaction: -65, industry: 150 }
school:     { density: 45, wealth: 70, accessibility: 40,  satisfaction: 110, industry: -5  }
radio:      { density: 25, wealth: 55, accessibility: 150, satisfaction: 10,  industry: 30  }
lighthouse: { density: 15, wealth: 50, accessibility: 60,  satisfaction: 70,  industry: -15 }
theatre:    { density: 55, wealth: 85, accessibility: 40,  satisfaction: 130, industry: -5  }
stadium:    { density: 80, wealth: 40, accessibility: 70,  satisfaction: 85,  industry: 0   }
```

### Esplicite fuori scopo

- **Nessun nuovo canale commerciale**: `radio`/`lighthouse` NON entrano in
  `BALANCE.trade.link` (restano porto e aeroporto). Sono catalizzatori, non
  collegamenti merci.
- **Nessun nuovo ruolo in `SPECIALIZATION_ROLES` o `DISTRICT_RULES`**: i sei non
  aprono specializzazioni ne' quartieri nuovi; `unlockLines`/`pairingLines`
  tornano vuote per loro (comportamento gia' lecito).
- **Nessun ormeggio/traffico** per i sei nuovi ruoli (`moorings` assenti).
- Non si migrano le 12 ricette esistenti fuori da `config.ts` (solo le nuove
  vanno in file separati, per rispettare la regola delle 600 righe senza
  un refactor rischioso).

## Ordine dei task

1. **`src/sim/balance.ts`** — aggiungere i 6 blocchi a `gameplay.catalyst.roles`,
   `gameplay.catalyst.influence` e `districts.catalystEffects` (valori sopra).

2. **`src/sim/catalysts.ts`** — aggiungere le 6 righe a `CATALYSTS` nel giusto
   ordine di gruppo (growth: power, school dopo depot; connections: radio,
   lighthouse dopo transport; identity: theatre, stadium dopo cathedral), con
   `label`, `site` e `description` in inglese. Aggiornare il commento che dice
   "dodici ruoli" → "diciotto ruoli".

3. **`src/world/landmarks/vocab.ts`** (nuovo) — spostare da `config.ts` gli helper
   condivisi ed esportarli: `craneAt`, `quay`, `bollard`, `entrance`, `signBand`,
   `tree`. `config.ts` li importa (toglie ~90 righe).

4. **`src/world/landmarks/recipes/`** (nuovo) — 3 file, uno per gruppo, ciascuno
   con 2 ricette `LandmarkRecipe` (span, height, anchor, apron, stages a 4 stadi,
   `parts` tronco a 4 stadi cumulativi, 3 `variants` additive). Import dei tipi
   da `../config` solo con `import type` (nessun ciclo a runtime):
   - `growth.ts`: `power`, `school`
   - `connections.ts`: `radio`, `lighthouse`
   - `identity.ts`: `theatre`, `stadium`
   Le parti usano solo `PART.*`/`box` e gli slot `PALETTE_SLOTS` esistenti;
   niente parti a mezz'aria sotto `LANDMARK.groundBand`; firme sagoma uniche
   (verifica col test, non a mano). Indicazioni sagoma: power = 2 torri smussate
   `chamfer` + ciminiera sottile; school = U basso + torre con quadrante
   `luminous`; radio = `truss` a `step` stretto + base; lighthouse = `steps`
   rastremata + `luminous` in cima; theatre = torre alta + `pitch` + `entrance`/
   `signBand`; stadium = anello cavo (`colonnade`/`steps`) basso e largo.

5. **`src/world/landmarks/config.ts`** — importare le 6 ricette dai nuovi file e
   unirle in `LANDMARKS` con uno spread, senza riscrivere le 12 esistenti.

6. **`src/ui/hudIcons.ts`** — aggiungere i 6 id alla union `HudIcon` e i 6 path
   SVG a `PATHS` (il check `EveryCatalystHasAnIcon` rompe la compilazione se
   mancano). Disegni riconoscibili a 22px e distinti dai 12 esistenti.

7. **Test da aggiornare** (gli altri sono derivati e si adeguano da soli):
   - `src/sim/districts.test.ts`: `toHaveLength(12)` → `18` e
     `new Set(...effects).size` → `18` (rinominare "dodici" → "diciotto").
   - `src/sim/uses.test.ts`: `constrained = new Set(['port','airport','ferry'])`
     → aggiungere `'lighthouse'`.

8. **Documentazione** — frammento in `docs/pending/` (indice + changelog) e
   `npm run docs:merge`; aggiornare eventuali riferimenti "dodici" nei commenti/
   README toccati (es. header di `catalysts.ts`, nome test `districts.test.ts`).

## Verifica

- `npm run typecheck`
- `npm run test:changed` (copre `sim/` e `world/`, include gli invarianti di
  `generate.test.ts`, `uses.test.ts`, `districts.test.ts`, `swatchScene.test.ts`).
- `npm run build` (modifica ampia, verifica bundle).
- Visuale: `?debug=1&terrain=1337` — sei nuove tessere nella toolbar (2 righe da 3
  per gruppo), landmark nel campionario (`swatch`), nessuna tessera vuota
  (icone), piazzamento `lighthouse` rifiutato fuori costa.

## Rischi

- **Collisione di firma sagoma** (`sizeX×sizeY×sizeZ:solidCount`): se un nuovo
  ruolo collide con uno esistente, il test `generate.test.ts` fallisce e va
  ritoccata una misura (non il colore, che non entra nella firma).
- **Unicita' effetti**: se un `catalystEffects` risulta identico a un altro, il
  test `districts.test.ts` fallisce; ritoccare una metrica.
- **Regola 600 righe**: tenere le ricette nei file nuovi; `config.ts` riceve solo
  import e spread.
