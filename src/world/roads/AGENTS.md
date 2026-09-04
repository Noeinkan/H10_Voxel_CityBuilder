# Regole per `src/world/roads/`

Il tracciato stradale **visibile**: organico, convergente sui poli, e derivato
da `(seed, terreno, catalizzatori)`.

Prima di modificare questo dominio leggi la sezione «Strade» di
[`docs/world/streets-buildings.md`](../../../docs/world/streets-buildings.md):
la divisione fra questa cartella e `streets/` e' l'unica cosa che vale la pena
sapere prima di toccare qualcosa qui.

- **`streets/` e' il catasto, `roads/` e' la strada.** La maglia di `streets/`
  resta una funzione pura di `(seed, x, y)`, non si vede, e serve a lottizzare:
  `blockAt` e `blockRect` sono l'unita' di terreno che mezzo progetto legge.
  Il tracciato di qui si vede e non lottizza niente. Non fondere le due cose:
  disegnare il catasto e' esattamente cio' che dava a schermo un reticolo
  quadrato.
- **Il dominio puro non conosce il mondo.** `trace.ts`, `network.ts`,
  `stroke.ts` e `viaduct.ts` ricevono sonde (`RoadProbe`, `ViaductProbe`) e non
  importano ne' `TerrainMap` ne' `BuildingRegistry`. Solo `RoadNetwork.ts` legge
  il terreno, e nemmeno lui conosce `buildings/`: l'occupazione entra come
  funzione.
- Larghezze, costi, soglie e ranghi stanno in `config.ts`. Nessun altro file
  contiene un numero.
- **Nessun costo scende sotto `flatCost`.** L'euristica di `traceRoad` lo usa
  come costo minimo di un passo: sotto, A\* smette di essere ammissibile e il
  cammino trovato non e' piu' il minimo. E' lo stesso vincolo di
  `BALANCE.reach.pavement` in `src/sim/`. Il termine continuo di
  `terrainCost.ts` si **somma** apposta: se sottraesse, romperebbe l'invariante
  in silenzio.
- **La forma organica non viene dal rilievo da sola.** Su un terreno a gradini —
  e i costi di `config.ts` sono a gradini — fra due punti ci sono migliaia di
  cammini che costano identico, e la ricerca ne restituisce uno qualunque:
  quello che esce e' sempre la diagonale canonica. Due cose lo impediscono, e
  vanno tenute entrambe: `diagonalCost`, che fa costare un passo quanto e' lungo
  (senza, la diagonale e' la mossa piu' economica del grafo e ogni cammino la
  satura), e il campo continuo di `terrainCost.ts`, che da' una risposta
  migliore delle altre dove il terreno non ne ha. Alzare l'ampiezza della
  divagazione senza alzarne la **lunghezza d'onda** non serve a niente:
  spostarsi di lato dentro la stessa cella non guadagna nulla, ed e' misurato.
- **La rete si ricostruisce, non si salva.** Poli e terreno stanno gia' nel
  salvataggio — i primi come catalizzatori, il secondo come seme — quindi il
  tracciato si rifa' identico al caricamento. Non aggiungerlo alla cattura.
- Il rango non si dichiara: lo misura il carico dell'albero. Se ti serve «questa
  e' l'arteria», la risposta e' `network.ts`, non una tabella.
- Nessun voxel esce da qui. Le colonne le posa `buildings/roadDriver.ts` sulla
  coda di superficie, come ogni altro pezzo di suolo pubblico.

## Verifica

- I quattro moduli puri hanno test co-locati e girano in Node senza terreno:
  `npx vitest run src/world/roads/`.
- Toccando `RoadNetwork.ts` o `roadDriver.ts` allarga a
  `npx vitest run src/world/buildings/Builder.test.ts`, che e' dove la forma
  urbana si vede.
- Per modifiche visuali vale la regola di `src/world/AGENTS.md`: `?debug=1` e i
  budget, mai una misura stimata.
