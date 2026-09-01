## indice — `src/world/landmarks/` — le strutture dei catalizzatori
| [canvas.ts](src/world/landmarks/canvas.ts) | La tela su cui le parti scrivono, in un file suo per rompere il ciclo fra `parts.ts` e `ornaments.ts` | `LandmarkCanvas`, `createCanvas`, `put` |
| [parts.ts](src/world/landmarks/parts.ts) | Le quindici primitive con cui una ricetta si compone, lo smusso della pianta, le cornici marcapiano e la rotazione sul verso. Le cinque ornate le disegna `ornaments.ts` | `PART`, `Part`, `PartKind`, `box`, `partBounds`, `orientPart`, `orientedSpan`, `createCanvas`, `drawPart`, `LandmarkCanvas` |
| [ornaments.ts](src/world/landmarks/ornaments.ts) | Le cinque primitive ornate — portale passante, cupola convessa, contrafforti rampanti, guglia rastremata, parete traforata — tutte con maschera simmetrica per restare invarianti alla rotazione | `drawArch`, `drawDome`, `drawButtress`, `drawSpire`, `drawTracery` |
| [recipes/civic.ts](src/world/landmarks/recipes/civic.ts) | Le ricette civiche: campus, monumento, museo, cattedrale. Monumento e cattedrale crescono di sedime su sei stadi | `UNIVERSITY`, `MONUMENT`, `MUSEUM`, `CATHEDRAL` |
| [recipes/logistics.ts](src/world/landmarks/recipes/logistics.ts) | Le quattro ricette lineari per natura, tre delle quali guardano l'acqua | `PORT`, `FERRY`, `AIRPORT`, `TRANSPORT` |
| [recipes/park.ts](src/world/landmarks/recipes/park.ts) | Il parco, in un file suo perche' e' l'unico ruolo che si riconosce per assenza di volume | `PARK` |
| [recipes/production.ts](src/world/landmarks/recipes/production.ts) | Le ricette produttive: fabbrica, mercato, serra | `FACTORY`, `MARKET`, `GREENHOUSE` |

## changelog — Revamp dei landmark: piu' ornati, piu' grandi, piu' stadi
- **Cinque primitive ornate e un modificatore.** `arch`, `dome`, `buttress`,
  `spire` e `tracery` portano il vocabolario da dieci a quindici voci, e
  `Part.cornice` aggiunge le fasce marcapiano come campo invece che come
  sedicesima voce — la stessa mossa dello smusso. Ognuna dipende dalla posizione
  solo attraverso una funzione simmetrica, che e' cio' che le tiene invarianti
  alla rotazione: `orientPart` ruota una parte scambiando i lati senza
  ridisegnarla.
- **Il portale e' il permesso, non l'ornamento.** Sopra i ventotto voxel una
  struttura sta a cavallo di una carreggiata — il passo della maglia stradale e'
  venti — e `arch` e' cio' che sotto lascia un passaggio invece di un muro. E'
  la primitiva che rende ammissibili gli ingombri nuovi.
- **`config.ts` si e' spezzato prima di crescere.** Le dodici ricette storiche
  sono passate in `recipes/`, raggruppate per mestiere, a parita' di voxel: il
  file era a 2 146 righe e il revamp lo avrebbe raddoppiato.
- **Cattedrale e monumento crescono di sedime su sei stadi.** La cattedrale va
  da 14x10x28 a 44x28x80, il monumento da 12x12x26 a 32x32x130. Lo stadio zero
  resta piccolo come oggi — e' cio' che protegge la sovrapposizione fra due
  catalizzatori, dove nascono gli usi misti — e la megastruttura arriva quando
  il quartiere attorno c'e' gia'.
- **Dove sta l'ornamento l'ha deciso la misura.** Cornici su tutti gli scafi e
  contrafforti con il linguaggio civico portavano il chunk piu' pieno a
  **16 380 quad di dettaglio contro un tetto di 16 384**. Le cornici stanno ora
  sulle sole torri — il perimetro e' il moltiplicatore: ventiquattro celle su
  una torre 7x7, sessantotto su una navata lunga ventotto — e i contrafforti
  sono `plain`, che e' anche cio' che sono in una cattedrale vera. Il catalogo
  intero misura 8 360, sotto perfino l'isolato fitto di citta' ordinaria.
- **Le due reti scorrono il catalogo, non una ricetta scelta a mano.**
  `fitsChunkBudget` si prova su ogni ricetta, ogni verso e ogni scostamento di
  cucitura; `landmarkChunk` in `microGeometry.test.ts` ritaglia la finestra piu'
  piena fra tutte le sagome vere. Nominare la ricetta piu' grossa di oggi vuol
  dire smettere di misurare il caso peggiore il giorno in cui qualcun altro la
  supera.
