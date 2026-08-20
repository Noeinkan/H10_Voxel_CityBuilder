# Salto di qualità della resa grafica

## Stato: tutte e cinque le fasi implementate

| Fase | Esito |
| --- | --- |
| 0 — contratto `Atmosphere` + `lighting.ts` | fatta |
| 1 — sole, ambiente emisferico, jitter, prospettiva aerea | fatta |
| 2 — cielo procedurale | fatta |
| 3 — ombre proiettate | fatta |
| 4 — composer, bloom, tilt-shift | fatta |
| 5 — gating, re-authoring dei 7 temi, overlay, docs | fatta |

**Misure** (`?debug=1&theme=diorama`, scena stabilizzata):

| | `quality=high` | `balanced` | `performance` |
| --- | --- | --- | --- |
| effetti | shadow+bloom+tilt | shadow+bloom+tilt | nessuno |
| shadow map | 2048 px, 0,50 ms | 1024 px, 0,30 ms | spenta |
| draw call | 144 | 144 | **66** |
| triangoli | 92 525 | 92 525 | 46 257 |

Le draw call si dimezzano in `performance` perché sparisce la seconda pass di
geometria: è la conferma diretta che il gating toglie davvero l'ombra.

**Invariante 4 verificata a schermo**: ciclando tutti e 7 i temi `geometryBytes`
resta a 1 480 128 in ognuno dei tre profili. I worker in bundle sono ancora
8,64 kB e 5,77 kB — `src/engine/mesher/` non è stato toccato.

Un guadagno non previsto dal piano: spostando il tone mapping in `OutputPass`, i
materiali di scena non includono più i chunk di tone mapping, quindi **un cambio
di tema non ricompila più nessun programma**. Era l'unica ricompilazione rimasta.

Cosa è stato tolto rispetto al contratto precedente: `faceLight[6]`, `lightTint`,
`shadowTint` (sostituiti dal modello sole/cielo/rimbalzo) e `heightTint` con i
suoi tre parametri, il cui compito lo svolge ora la nebbia altimetrica.

---

## Contesto

Il motore oggi rende con un modello di luce che è una **tabella di 6 costanti**
(`uFaceLight[6]` in [VoxelMaterial.ts](src/engine/VoxelMaterial.ts)): non esiste
una normale, non esiste un sole, non esiste N·L. Il risultato è uno shading piatto
e uniforme — ogni voxel di uno slot ha *esattamente* lo stesso colore, ogni faccia
rivolta a nord ha *esattamente* la stessa luminosità. Manca tutto ciò che in
un'immagine dipinta fa "dipinto": ombre colorate, ombre proiettate, variazione
cromatica, aria, cielo, bloom.

Il riferimento di partenza è concept art dipinta a mano — nessun motore la eguaglia
alla lettera. Ma le sue qualità percettive si decompongono in quattro pilastri
implementabili, e sono i quattro che seguono. L'obiettivo scelto: **stessa qualità
di resa, soggetto attuale** (la colonia sci-fi resta quella che è).

**Il vincolo che regge tutto**: nessuna delle modifiche tocca il mesher, gli
attributi di vertice o le geometrie. L'invariante 4 di `CLAUDE.md` — il colore vive
solo nell'uniform, cambiare tema non rebuilda una mesh — vale ancora a fine lavoro,
e il modo di verificarlo è invariato (contatori `quads`/`geometryBytes`
dell'overlay fermi mentre si preme `1`..`9`). `src/engine/mesher/` **non si tocca**.

---

## Fase 0 — Contratto `Atmosphere` e sorgente unica della luce

Rifattorizzare il tipo *una volta sola*, con tutti i campi delle fasi successive
già previsti, per non riscrivere 7 file di tema cinque volte.

**Nuovo modulo `src/engine/lighting.ts`** — puro TS, nessun import di Three,
testabile in ambiente node come il resto. È la fonte unica che alimenta materiale,
cielo e ombre:

- `sunDirection(azimuth, elevation): [x, y, z]` — Z-up, sole fisso nel mondo
  (preserva il comportamento voluto documentato in
  [theme.ts](src/engine/themes/theme.ts): ruotando `Q`/`E` cambia il lato
  illuminato).
- `faceLuminance(atmosphere): number[6]` — valuta il modello sulle 6 normali
  canoniche. Serve al test per verificare che **+Z resti la faccia più
  illuminata**, cioè l'invariante di leggibilità che oggi il test impone a mano su
  `faceLight[4]` in [themes.test.ts](src/engine/themes/themes.test.ts).

**[theme.ts](src/engine/themes/theme.ts)** — rimuovere `faceLight`, `lightTint`,
`shadowTint`. Sostituirli con:

| Gruppo | Campi |
| --- | --- |
| `sun` | `azimuth`, `elevation`, `color`, `intensity`, `wrap` |
| `skyLight` | `color`, `intensity` — ambiente dall'alto |
| `bounceLight` | `color`, `intensity` — rimbalzo dal terreno |
| `colorJitter` | ampiezza della variazione per voxel |
| `fog` | `color`, `density`, `skyBlend`, `heightBase`, `heightFalloff`, `sunTint` |
| `sky` | `top`, `horizon`, `sunGlow`, `cloudAmount`, `cloudSpeed`, `cloudTint` |
| `shadow?` | `strength`, `softness` |
| `bloom?` | `threshold`, `strength`, `radius` |
| `tilt?` | `strength`, `focus`, `width` |

Cinque parametri fisici sono più facili da autorare di sei numeri arbitrari più due
tinte, ed è il modello che *produce da solo* le ombre colorate.

---

## Fase 1 — Modello di luce nel materiale (zero pass aggiuntive)

Tutto in [VoxelMaterial.ts](src/engine/VoxelMaterial.ts). È il salto singolo più
grande e non costa una draw call.

**1a. Normali da `aFace`.** Aggiungere `uniform vec3 uFaceNormal[6]`, riempito una
volta alla creazione. *Non* usare `const vec3 n[6] = vec3[6](...)`: è sintassi
GLSL ES 3.00, mentre `ShaderMaterial` compila in ES 1.00. L'indicizzazione dinamica
di un uniform array è già usata e funzionante (`uPalette[paletteIndex]`).

**1b. Illuminazione emisferica + sole con wrap**, al posto del lookup
`uFaceLight[faceIndex]`:

```glsl
vec3 n = uFaceNormal[faceIndex];
vec3 ambient = mix(uBounceColor, uSkyColor, n.z * 0.5 + 0.5);
float wrapped = clamp((dot(n, uSunDirection) + uSunWrap) / (1.0 + uSunWrap), 0.0, 1.0);
vec3 light = ambient + uSunColor * wrapped * shadow;
```

Il `wrap` toglie il terminatore duro — è ciò che rende la luce "dipinta" invece che
calcolata. L'ambiente non è moltiplicato dall'ombra: le facce in ombra restano
illuminate dal cielo, quindi **virano al blu da sole**. È il meccanismo che rende
le ombre azzurre invece che nere.

**1c. Spostare il calcolo della luce dal vertex al fragment shader.** Serve per
l'ombra e il jitter per-pixel. I varying necessari (`vFaceIndex`, `vPaletteIndex`,
`vWorldPosition`, `vAO`) **esistono già**. Lo shading resta piatto: indice di
palette e di faccia sono costanti sul quad. Va aggiornato il commento di testata
del file, che oggi descrive la divisione opposta.

**1d. Jitter cromatico per voxel** — il vero antidoto alla piattezza. Hash della
cella mondo, con l'accortezza di rientrare di mezzo voxel lungo la normale,
altrimenti sulla faccia `floor()` è ambiguo fra due celle e il colore sfarfalla:

```glsl
vec3 cell = floor((vWorldPosition - n * uVoxelSize * 0.5) / uVoxelSize);
float j = hash31(cell) * 2.0 - 1.0;
detailed *= 1.0 + j * uColorJitter;                                               // valore
detailed = mix(detailed, detailed * uSunColor, max(0.0, j) * uColorJitter * 0.5); // tinta
```

**1e. Prospettiva aerea** al posto della nebbia a tinta fissa: densità che decade
con la quota (le valli e i piedi degli edifici si impastano, le cime restano
nitide) e tinta che tende al colore del cielo, più un guadagno verso il sole per lo
scattering in avanti. Resta miscelata in spazio lineare prima del tone mapping,
come oggi.

---

## Fase 2 — Cielo procedurale

Sostituire [SkyBackground.ts](src/engine/SkyBackground.ts) (`DataTexture` 2×96)
con un quad fullscreen shaderizzato: `depthTest: false`, `depthWrite: false`,
`renderOrder: -1`, `frustumCulled: false`; `scene.background = null`.

**Nodo tecnico**: la camera è **ortografica**, quindi tutti i raggi di vista sono
paralleli e un cielo calcolato dalla direzione del raggio sarebbe una tinta piatta.
Soluzione: ricostruire un raggio da una **prospettiva virtuale** (FOV ~55°) usata
solo per il cielo. È il trucco standard dei diorami e regge benissimo dietro una
scena ortografica.

Contenuto: gradiente multi-stop, disco solare e alone posizionati da
`uSunDirection` (**lo stesso uniform del materiale**, quindi il sole sta dov'è
coerente con le ombre), 2-3 strati di nuvole da value-noise con soglie morbide —
stilizzate a bande, non fotorealistiche.

---

## Fase 3 — Ombre proiettate del sole

Nuovo file **`src/engine/SunShadow.ts`**. È ciò che disegna la chioma sul prato, ed
è la prima cosa che costa.

- `WebGLRenderTarget` con `DepthTexture`, `OrthographicCamera` orientata lungo
  `-sunDirection`.
- **Materiale depth-only** dedicato: stessa trasformazione di vertice del materiale
  principale (`position` Int16 / 16 × `voxelSize`), fragment vuoto.
- **Fitting del frustum**: `ChunkRenderer` tiene già un `Box3` in coordinate mondo
  per chunk (`entry.box` in [ChunkRenderer.ts](src/engine/ChunkRenderer.ts)). Unire
  i box visibili, trasformare gli angoli in spazio sole, adattare la scatola
  ortografica. Ricalcolare **solo** quando la camera si muove o si aggiungono
  chunk, non ogni frame — stesso criterio di `rescoreIfNeeded`.
- **Visibilità separata**: un chunk fuori dal frustum di vista può proiettare ombra
  dentro. Aggiungere `ChunkRenderer.cullForShadow(camera)` accanto a `cull()`.
  Ordine nel frame: cull ombra → render ombra → cull vista → render vista.
- **Bias**: i voxel sono allineati agli assi, quindi il *normal-offset bias*
  (spostare il punto campionato lungo `n` di un texel-mondo prima di proiettare)
  elimina quasi del tutto l'acne. Più un piccolo bias in profondità.
- **PCF 3×3** a qualità alta, 1 tap a qualità media.

Costo: raddoppia le draw call di geometria. Va sotto gating (vedi Fase 5).

---

## Fase 4 — Post-processing

`EffectComposer` da `three/addons/postprocessing/` — già dentro il pacchetto
`three` installato, nessuna dipendenza npm nuova. **Da verificare** che la 0.180
esporti i path usati.

Catena: `RenderPass` → `UnrealBloomPass` → `TiltShiftPass` (custom) → `OutputPass`,
su render target `HalfFloatType` in spazio lineare.

**Migrazione del tone mapping** — il punto delicato. Oggi il materiale se lo fa da
solo (`#include <tonemapping_fragment>` + `<colorspace_fragment>`) e `applyTheme`
lo imposta sul renderer in [main.ts](src/main.ts). Con il composer, il materiale
deve scrivere HDR lineare e lasciare tono e sRGB a `OutputPass`.

> **Scelta**: il composer, se abilitato all'avvio, resta **sempre attivo**; il
> gating agisce su forza e risoluzione del bloom, non sull'esistenza del composer.
> Alternare i due percorsi a runtime significherebbe ricompilare il programma a
> ogni cambio di qualità, e sono i `#define` di tone mapping — proprio la cosa che
> `applyTheme` è scritto per evitare.

**Bloom selettivo di fatto**: con soglia di luminanza ~1.0 in HDR lineare, solo gli
emissivi e il cielo superano. Richiede che `uEmissiveStrength` spinga sopra 1 — il
range `[0, 2]` già ammesso dal test basta.

**Tilt-shift invece di un DoF vero**: sfocatura per distanza da una banda di fuoco
orizzontale in screen space. Poche righe, nessuna depth texture, ed è il segnale
percettivo classico del diorama — più evocativo di un CoC corretto su una camera
ortografica. Il DoF depth-based resta possibile (la depth è già nel target).

**Agganci in [main.ts](src/main.ts)**: `renderer.render` → `composer.render`;
`composer.setSize` / `setPixelRatio` accanto a quelli del renderer nel resize e nel
gating qualità.

**Igiene**: `three` è `^0.180.0` ma `@types/three` è `^0.185.4` — cinque minor di
scarto. Usare gli addons fa emergere il disallineamento: allineare i types a
`0.180.x` in questa fase.

---

## Fase 5 — Gating, temi, overlay, documentazione

**Gating su [RenderQuality.ts](src/engine/RenderQuality.ts)** — estendere
`QualityDecision` oltre il solo `pixelRatio`, con un profilo per livello:

| Modo | Shadow map | PCF | Bloom | Tilt-shift |
| --- | --- | --- | --- | --- |
| `high` | 2048² | 3×3 | pieno | sì |
| `balanced` / `auto` | 1024² | 1 tap | ridotto | sì |
| `performance` | off | — | off | off |

La logica di salita e discesa esistente (`slow-down` / `stable-up`, isteresi e
cooldown) resta identica: cambia solo cosa consuma la decisione.

**Re-authoring dei 7 temi** sotto il nuovo modello — `natural`, `pastel`, `neon`,
`industrial`, `scifi`, `enchanted`, `diorama`.
[diorama.ts](src/engine/themes/diorama.ts) è il riferimento da cui partire: è
l'unico che già usa tutti i campi opzionali, e il suo `lightTint: '#ffe2b0'` /
`shadowTint: '#a8c8dc'` è esattamente la coppia caldo/freddo che il nuovo modello
produrrà da sé con `sun` caldo e `skyLight` freddo.

**Riscrittura di [themes.test.ts](src/engine/themes/themes.test.ts)** — sostituire
l'assert su `faceLight` con quello derivato: `faceLuminance(atmosphere)` da
`lighting.ts` deve avere il massimo su indice 4. Aggiungere i range dei campi nuovi
e un test diretto di `lighting.ts` (elevazione del sole > 0, normalizzazione).

**Overlay e hook globali** — `CLAUDE.md` impone che leggano la stessa fonte.
Aggiungere a `buildOverlayFrame`: ms della pass d'ombra, lato della shadow map,
stato di bloom e tilt. Nuovo hook di debug `__voxelSun(azimuth, elevation)` per
autorare i temi dal vivo, più un hotkey per ciclare i profili di qualità.

**Documentazione**: `CLAUDE.md` (sezione temi e budget), `README.md` («Fuori scope»
elenca oggi il post-processing), `PROJECT_INDEX.md` per i due file nuovi,
`src/engine/AGENTS.md`.

---

## Ordine consigliato

1. **Fase 0 + 1** insieme — luce, jitter, aria. Nessuna pass nuova, nessun rischio,
   ed è già il 60% della differenza percepita.
2. **Fase 2** — cielo. Migliore resa per riga scritta dopo la Fase 1.
3. **Fase 3** — ombre. La prima che costa; da qui in poi il gating serve davvero.
4. **Fase 4** — composer, bloom, tilt-shift.
5. **Fase 5** — rifinitura dei temi con tutte le manopole disponibili.

Ogni fase è rilasciabile da sola.

---

## Verifica

**Automatica**, a ogni fase:

```bash
npm run typecheck && npm test
npm run bench
```

**A schermo** — `npm run dev`, poi `http://localhost:8020/?debug=1&grow=1`:

- **Invariante 4 (il test che conta di più)**: premere `1`..`9` per ciclare i temi
  e verificare che `quads` e `geometryBytes` nell'overlay **non si muovano**. Se si
  muovono, qualcosa è finito nella geometria e va tolto.
- **Regressione di prestazioni**: annotare `renderMs`, `fps p95` e `jank` prima e
  dopo ogni fase. Il lavoro non-render deve restare sotto i 3 ms di
  `FRAME_BUDGET_MS` — le fasi 3 e 4 spendono sulla GPU, non sul main thread, e
  vanno lette in `renderMs`.
- **Gating**: `?quality=performance` deve spegnere ombre e bloom; `?quality=high`
  accenderli. Con `quality=auto`, strozzando il frame (tasto `G` più volte per
  aggiungere chunk), la discesa automatica deve degradare gli effetti e non solo il
  pixel ratio.
- **Ombre**: ruotare con `Q`/`E` — le ombre devono restare ancorate al mondo, non
  alla camera. Zoom fuori con la rotella: nessun popping ai bordi della shadow map
  (verifica del fitting del frustum). Cercare acne sulle facce quasi parallele al
  sole.
- **Jitter**: muovere la camera in pan e verificare che il colore per voxel sia
  **stabile**, senza sfarfallio — è la prova che il rientro di mezzo voxel lungo la
  normale funziona.
- **Sole coerente**: `__voxelSun(az, el)` da console — disco solare nel cielo,
  direzione delle ombre e lato illuminato devono muoversi insieme.
