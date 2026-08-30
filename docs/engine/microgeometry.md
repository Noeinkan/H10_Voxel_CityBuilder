# Il catalogo delle micro-ricette

Cosa si può aggiungere a un edificio a **1/16 di voxel**, additivo o riduttivo,
e quanto costa. Le voci implementate sono marcate; le altre restano qui perché
il lavoro di trovare l'aggancio è già fatto, e rifarlo costa più che scriverlo.

Prima di aggiungerne una, `src/engine/AGENTS.md`. Le regole che non si negoziano
sono tre e stanno anche lì: **nessun `SurfaceKind` nuovo** (sono otto, i tre bit
sono pieni), **nessuno slot di palette nuovo** (sono trentadue), **nessun
metadato per edificio** — il mesher riceve il volume paddato 34³ e `origin`, e
quest'ultimo serve solo a seminare gli hash.

## Cosa il mesher sa di un edificio

Tutto ciò che un aggancio può leggere. Non c'è altro.

| Segnale | Dove | Dice |
| --- | --- | --- |
| `SurfaceKind` del voxel e dei vicini | `blockAt`, `hasSurfaceFace` | Il linguaggio: abitato, industriale, civico, luminoso, portale, tetto tecnico |
| `facadeAt` | `microGeometry.ts` | Facciata d'uso **esposta** su una faccia, con l'acqua esclusa dalla palette |
| `frontage` | `microGeometry.ts` | C'è un portale entro **cinque celle** sotto, sulla stessa colonna |
| `openRoof` / `interiorRoof` / `underSetback` | `microGeometry.ts` | Tetto tecnico scoperto; scoperto su tutti e quattro i lati; sommità che è un arretramento |
| `facadeUnder` | `microCrown.ts` | **Che uso sostiene questo tetto**, guardando quattro celle in giù |
| `facadeInset` / `roofInset` | `carveMarks.ts` | Di quanto la parete è arretrata, di quanto il calpestio è sceso |
| `propRoll(origin, x, y, z, salt)` | `microGeometry.ts` | Un dado deterministico sulle coordinate di **mondo** |

**Il commerciale non è un segnale.** `classSurface` mappa quattro usi su tre
linguaggi — i tre bit alti sono pieni — e il commerciale riusa `habitat`. «Qui
c'è un negozio» si legge solo dalla **posizione**: la colonna del portale, che
`onPortal` scrive **su una faccia sola** (`request.accentFace`), larga una cella.
Il leisure non esiste affatto: è una specializzazione del commerciale, e
`src/sim/` non la fa arrivare fin qui.

## Il costo, in una riga

Un dettaglio non è mai un prisma per voxel: è un prisma per **corsa**
(`emitRuns`) o per **cella isolata** (`emitPoints`). Un vano scavato non è un
prisma per cella ma cinque pannelli sul suo **perimetro**. Il tetto è
`MAX_DETAIL_QUADS_PER_CHUNK = 16 384`, con `MAX_CARVE_QUADS_PER_CHUNK = 6 144`
riservati agli scavi — riserva e non budget: uno scavo troncato lascia un muro
bucato, perché la sua faccia base è già stata soppressa dal mask loop.

Convenzioni delle tabelle: unità in sedicesimi; `facadeBox(x, y, z, face, h0, h1,
v0, v1, depth, inset)`; «quad» è il costo **per aggancio**, non per cella.

---

## A — Riduttive: le ricette di scavo

Sei ricette esistevano prima di questo giro (`threshold`, `glazing`, `loggia`,
`alcove`, `stairwell`, `tray`); il byte ne ammette trentuno, e le prime due nuove
sono qui sotto. Nessuna profondità arriva a mezzo voxel: oltre, il vano smette di
leggersi come un rientro e comincia a leggersi come volume mancante — che è ciò
che il portico della grammatica fa già, a granularità di voxel intero.

| | Ricetta | Aggancio in `carveKindFor` | Asse | Profondità | Materiale | Quad |
| --- | --- | --- | --- | --- | --- | --- |
| ✅ | `plinth` | Sotto c'è un voxel pieno e `plain`: terreno, fondazione, banchina | orizzontale | 2 | `stoneDark` / `stoneDeep`, fondo `plain` | 5 |
| ✅ | `vent` | `industrial`, con lamiera sopra e non due sopra | orizzontale | 3 | `metalDark` / `metalRust`, fondo `utility` | 5 |
| | `frieze` | `civic` senza civico sopra: la riga alta del fronte | orizzontale | 2 | `concreteWhite` / `stoneWarm` | 5 |
| | `bay` | `civic` a cadenza `(x & 3) === 3`, sfalsata di due dalle lesene | verticale | 3 | `concretePale` / `concrete` | 5 + ~3 di base |
| | `shopWindow` | `habitat` con un portale **subito sotto** | orizzontale | 3 | `stoneDark` / `glassDeep`, fondo **`luminous`** | 5 |
| | `airShaft` | `industrial` di retro, `2 ≤ z ≤ 20`, tiro 0,04 | verticale | 5 | `metalRust` / `metalDark` | 5 |
| | `roofWell` | Ramo `FACE_PZ`, prima del vassoio: tetto interno, tiro 0,03 | non corre | 4 | `concreteLight` / `glassPale`, fondo **`luminous`** | 9-10 |

`plinth` è lo stacco d'ombra a terra, e in isometrica è l'unica cosa che separa
un edificio dal suolo: non è imitabile in additivo, perché una fascia aggiunta fa
una cornice e non un'ombra. `shopWindow` farebbe la vetrina che si accende **dal
fondo del vano** — luce dentro invece di adesivo sopra — ed è la voce più
promettente di quelle non fatte. `roofWell` è l'unica che chiede un ramo suo in
`appendCarveDetail` e un'eccezione in `continuesRun`: è il motivo per cui non è
nel lotto.

### Aggiungerne una

Cinque tabelle in tre file, e dimenticarne una non fallisce: si legge
`undefined`, lo si somma a una coordinata e si disegna un prisma a `NaN` che il
writer accetta e nessuno vede. Un test in `carveGeometry.test.ts` confronta le
lunghezze con `CARVE_KIND_COUNT`, e un altro pretende che ogni ricetta scatti
almeno una volta sulla fixture di riferimento.

| File | Tabella |
| --- | --- |
| `carveMarks.ts` | `CARVE_KIND`, `CARVE_DEPTH`, `PLANE_INSET` |
| `carvePlan.ts` | `CARVE_COST`, il ramo in `carveKindFor`, `carveRunAxis` se non corre in orizzontale |
| `carveGeometry.ts` | `CARVE_MATERIAL`, `WALL_KINDS` se è una ricetta di parete |

**Attenzione a `z ± n`.** `carveKindFor` è chiamato anche sull'anello di padding,
dove `z` vale −1: `paddedIdx` non se ne accorge e `blockAt` risponde con la cella
di un'altra riga. Il difetto non esplode, si nasconde.

---

## B — Residenziale e tessuto basso

Il vocabolario maturo di `microDetail.ts` si accende alle soglie alte: prima di
questo giro una casa di sei livelli era un parallelepipedo con un bordino.

| | Elemento | Aggancio | Asse | Materiale | Box | Quad |
| --- | --- | --- | --- | --- | --- | --- |
| ✅ | `roofEaves` | Filo del tetto con `facadeUnder === habitat` | lungo il filo | `roofPale` | scende 4 sotto la linea, sporge 5 | 5 |
| ✅ | `chimney` | Angolo di tetto abitato, tiro 0,2 | punto | `brick` | `[4..11]²`, da `roofBase` a +10 | 5 |
| | `windowBox` | Base di una regione `luminous` con `habitat` sotto, tiro 0,2 | punto | `grassDark` | `(4, 12, 0, 3, 3)` | 5 |
| | `shutterBlade` | Colonna luminosa, due lame ai lati, tiro 0,12 | verticale | `wood` | `(0, 2, 2, 14, 2)` e `(14, 16, …)` | 10 |
| | `gutterPipe` | Angolo d'isolato, come `emitCornerPosts` ma senza il limite `z ≤ 7` | verticale | `metalDark` | `(start, start+2, 0, len·U, 2)` | 5 |

La gronda sta **sotto e fuori** il filo, dove il parapetto di `emitRoofTech` sta
sopra e dentro: è la sporgenza a fare l'ombra, e un parapetto che rientra non
può darla. `shutterBlade` costa per cella e non per corsa, ed è la ragione per
cui non è nel lotto.

---

## C — Commerciale e leisure

Tutto ancorato alla colonna del portale, perché non c'è altro.

| | Elemento | Aggancio | Asse | Materiale | Box | Quad |
| --- | --- | --- | --- | --- | --- | --- |
| ✅ | `doorStep` | Piede del portale, con un marciapiede davanti sotto | orizzontale | `stone` | `(0, len·U, 0, 2, 6)` dal fondo del vano | 5 |
| ✅ | `shopFascia` | La riga **subito sopra** il portale, su `habitat` | orizzontale | `metalBrass`, **`luminous`** | `(0, len·U, 1, 6, 2)` | 5 |
| | `bowWindow` | `luminous` con `frontage` | orizzontale | `glassPale`, `luminous` | `(±1, 1, 15, 3)` | 5 |
| | `bollard` | Riga bassa del portale, due punti staccati dal muro (da +6 a +9) | punto | `stoneDark` | box manuale da `planeOf` | 10 |
| | `menuBoard` | `habitat` con un portale nella colonna **accanto** | punto | `glassPale`, `luminous` | `(1, 4, 4, 11, 1)` | 5 |
| | `shutterRoll` | Cella di portale, tiro 0,3 | orizzontale | `metalDark` | pannello degenere a `inset = 3` | **1** |

Le quote sul fronte sono già affollate e vanno rispettate: la tenda di
`emitAwnings` occupa `v 12..15`, la sua frangia `v 6..12`, la mensola di
`emitHabitat` `v 15..16`. Il cassonetto insegna sta a `v 1..6`, che era la fascia
libera. `emitSigns` fa già la bandiera **ortogonale**: le due insieme fanno un
negozio, una sola è un cartello su un muro. `shutterRoll` costa **un quad** ed è
la voce più economica proponibile.

---

## D — Industriale e civico

Il perno è `facadeUnder`, e vale più di tutti gli emettitori che lo usano: prima,
un tetto non sapeva che edificio avesse sotto.

| | Elemento | Aggancio | Asse | Materiale | Box | Quad |
| --- | --- | --- | --- | --- | --- | --- |
| ✅ | `roofCornice` | Filo del tetto con `facadeUnder === civic` | lungo il filo | `stoneWarm` | scende 6, sporge 4 | 5 |
| ✅ | `roofDrip` | Filo del tetto con `facadeUnder === industrial` | lungo il filo | `metalRust` | scende 3, sporge 3 | 5 |
| ✅ | `roofLantern` | Tetto interno civico, tiro 0,08 | punto | `glassPale` **`luminous`** + cappello `metalBrass` | `[5..11]²`, `roofBase..+7` | 10 |
| ✅ | `roofStack` | Tetto interno industriale, tiro 0,06 | punto | `metalDark` + collarino `metalRust` | `[6..10]²`, fino a +18 | 10 |
| ✅ | `roofSkylight` | Tetto interno abitato, tiro 0,10 | punto | `glassPale`, **`luminous`** | `[4..12]²`, `roofBase+1..+2` | 5 |
| | `corrugation` | `industrial` a cadenza `(x & 3) === 2` | verticale | `metalDark` | `(7, 9, 0, len·U, 2)` | 5 |
| | `pilasterCap` | Aggancio di `emitPilasters` senza civico sopra | punto | `stoneWarm` | `(5, 10, U−2, U, 2)` | 5 |
| | `entrancePodium` | Riga bassa del portale con `facadeUnder` civico | orizzontale | `stone` | due lastre, `(…, 0, 1, 6)` e `(…, 1, 2, 3)` | 10 |

Lanterna, ciminiera e lucernario sono la ragione per cui `facadeUnder` esiste: di
notte lo skyline si legge senza etichette, perché è l'unico momento in cui la
palette delle facciate non si vede. La ciminiera è **grassa e bassa** (larga 4,
alta 18) dove l'antenna di `emitRoofMasts` è **sottile e alta** (larga 2, alta
22): in una silhouette è la stessa distinzione che separa un ripetitore da uno
sfiato.

**Le cadenze `& 3` valgono perché `CHUNK = 32` è multiplo di quattro**, quindi
`x & 3` locale e di mondo coincidono — è la licenza che `emitPilasters` si prende
già. Una cadenza `& 5` o `& 6` non varrebbe, e la cucitura fra due chunk si
vedrebbe.

---

## Trappole

1. **Un prisma di tetto parte da `roofBase`, non da `(z + 1) * U`.** `openRoof`
   risponde sul voxel solido, e sopra un vassoio scavato il calpestio è sceso.
2. **Un prisma di facciata passa `facadeInset` a `facadeBox`.** Senza, resta a
   mezz'aria davanti a un vano arretrato. `microDetail.ts` non lo fa, ed è un
   debito che si riscuoterà quando una ricetta arretrerà una riga che le sue
   corse attraversano.
3. **Complanare significa z-fighting.** Il filo del tetto sta un sedicesimo sotto
   la linea, il lucernario un sedicesimo sopra il fondo del vassoio.
4. **Il materiale è `FrontSide`**: un quad con il winding girato non è storto, è
   **invisibile**, e nessun conto di prismi lo segnala. Ogni gruppo nuovo passa
   dal test del prodotto vettoriale.
5. **`emitRuns` chiama `box` una volta per corsa**, con l'`inset` della cella che
   la apre. Un elemento verticale che attraversa la riga dello zoccolo passa
   davanti allo stacco d'ombra: è corretto architettonicamente, ed è meglio
   saperlo che scoprirlo.
6. **`facadeUnder` è caro se lo si chiede più volte.** `microCrown.ts` divide i
   tetti per uso una volta sola (`partitionRoofs`) invece di interrogarli in
   ognuna delle diciassette passate: da sola quella mossa vale 2,3 ms sul bench.

## Misurare

Il numero che decide è il dettaglio su un **isolato fitto**, non su un chunk
pieno: il costo si paga sugli agganci — facciate, tetti, ingressi — e quattro
corpi da 14×14 ne hanno un decimo di venti corpi da quattro.

```
npx vitest run src/engine/mesher/microGeometry.test.ts --reporter=verbose   # isolato fitto, chunk fitto
npx vitest run src/engine/mesher/carveGeometry.test.ts --reporter=verbose   # scavo: disegnati e prenotati
npx vitest run src/world/scenes/swatchScene.test.ts                         # il tetto per chunk, sorvegliato
npm run bench                                                               # il costo in tempo
```

Stato al primo lotto, su questa macchina: isolato fitto **12 010 / 16 384**
(73%), chunk fitto 10 549, scavo 1 823 disegnati su 4 279 prenotati (riserva
6 144), picco del campionario 12 614, bench `edifici sci-fi` 13,69 ms contro
13,16 senza il lotto.
