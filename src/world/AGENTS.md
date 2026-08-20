# Regole per `src/world/`

Storage voxel sparso, scene deterministiche, terreno procedurale, rete stradale
e costruzione degli edifici. Questo modulo non dipende dal renderer.

## Storage e coordinate

- Mondo Z-up; chunk `32x32x32`; coordinate negative valide.
- `blocks` e `data` sono buffer distinti, allocati una volta per chunk.
- `setBlock` sporca il chunk e i vicini di bordo; `setData` mai la geometria.
- Aggiungere chunk non rialloca o sostituisce buffer esistenti.

## Terreno

- **Il terreno quantizza, il contenuto no.** `TERRAIN.cellSize` e' il lato del
  cubo di terreno, in voxel: il generatore campiona e arrotonda su quella cella
  — in pianta *e* in quota — mentre edifici e alberi restano a dettaglio di un
  voxel. E' quella differenza a dare la scala all'isola, e senza di essa una
  chioma d'albero e' larga quanto un edificio intero. `cellSize` deve dividere
  `CHUNK`.
- Le quote assolute di `terrain/config.ts` sono multiple di `cellSize`, gli
  strati della colonna sono spessi un numero intero di celle, e i lotti si
  allineano allo stesso passo (`STREETS.align`). Una soglia dispari cade a meta'
  di un cubo, ed e' esattamente il gradino da un voxel che la cella esiste per
  togliere.
- **La verticale e' tarata sull'orizzontale.** Il gradiente del campo vale
  rilievo diviso raggio: raddoppiando il lato dell'isola vanno raddoppiate anche
  le quote assolute e dimezzate le frequenze del rumore, altrimenti esce una
  frittella senza fianchi. La taratura attuale e' per un'isola di lato **512**,
  ed e' quella la dimensione su cui i test la verificano.
- Soglie, frequenze e stratigrafie stanno in `terrain/config.ts`.
- Un blocco dipende solo da `(seed, shape, ccx, ccy)`: preserva determinismo,
  indipendenza dall'ordine e continuita' ai confini. Le decorazioni valutano un
  anello di `TREE_DECOR.ring` colonne e scrivono solo la porzione interna, cosi'
  una chioma oltre confine non crea dipendenze d'ordine. La varieta' della
  chioma esce da un PRNG derivato dalla posizione dell'albero, non conservato:
  due blocchi che si dividono lo stesso albero ne ricavano la stessa sequenza.
- Generatore e worker non importano Three.js o `src/engine/`.
- Due tetti duri in `terrain/config.ts`: `warpAmount` sopra ~0,26 attacca terra
  al bordo della region; alzare `baseFrequency` o `maxHeight` consuma il margine
  di Lipschitz. **L'invariante e' in celle**: due celle adiacenti non
  differiscono di piu' di una cella, cioe' `cellSize` voxel, e dentro una cella
  il dislivello e' zero per costruzione. `heightField.test.ts` misura il margine
  sul campo continuo, `IslandGenerator.test.ts` lo verifica sulle quote
  quantizzate.

## Strade ed edifici

- Passi, scostamenti e larghezze della carreggiata stanno in `streets/config.ts`;
  cadenze, tetti e profili visivi in `buildings/config.ts`; gli spessori della
  grammatica — zoccolo, portale, coronamento, dettaglio sul tetto — in
  `buildings/config.ts::GRAMMAR`.
- Assi e lotti si allineano a `STREETS.align`, che e' il cubo di terreno: un
  edificio a meta' cubo si troverebbe sotto l'impronta due quote diverse dove il
  terreno e' piatto, e le opere gli metterebbero sotto un riempimento che nessun
  dislivello vero giustifica.
- La rete stradale e' una funzione pura di `(seed, x, y)`: niente stato, niente
  da salvare, niente da aggiornare quando arriva un catalizzatore.
- Il `Builder` valida terreno e occupazione e costruisce a fasce nel budget;
  la generazione degli stamp resta deterministica.
- **Le opere di terra si riempiono, non si scavano.** `grading/` decide cosa
  serve costruire perche' una colonna regga un piano — terrapieno, banchina o
  niente — e la quota finita e' sempre il massimo delle colonne, mai la media:
  livellare verso il basso toglierebbe isola, e un voxel tolto non torna. La
  battigia e il fianco in pendenza sono meta' della terra emersa, e senza opere
  la citta' li saltava del tutto.
- **Il terreno si paga, non si vieta.** `groundKindOf` classifica e
  `BUILD_WEIGHT` mette un prezzo; l'unico rifiuto rimasto sulla terra emersa e'
  la pendenza oltre `maxTerraceSlope`. La roccia piana **non** e' un rifiuto: lo
  era per bioma, e produceva l'unico no che dallo schermo non si spiegava — una
  mesa piatta respinta per la sola quota. Il bit `buildable` della `TerrainMap`
  resta, ma lo legge solo la scelta dei siti automatici in `sim/`.
- **Il terreno dice cosa regge, `sites/` dice cosa ci sta.** Sono due domande, e
  tenerle separate e' il motivo per cui il porto puo' pretendere la costa senza
  che la battigia torni vietata a tutti: `groundKindOf` risponde con un prezzo,
  `siteRefusal` con un si'/no che nessuna opera compra. Il vincolo e'
  un'etichetta sulla definizione del catalizzatore — `'coastal'`, `'open'`,
  `'any'` — e `src/sim/` non sa cosa significhi: la geografia la legge qui.
  I numeri stanno in `sites/config.ts`, e non vanno confusi con
  `BUILDER.coastalRadius`, che decide l'aspetto di una tipologia e non
  l'ammissibilita' di un piazzamento.
- Il candidato della simulazione designa **un luogo, non un indirizzo**: se il
  suo isolato e' pieno, `findLot` cerca in quelli attorno. Senza, su un campo
  saturo la crescita si ferma appena si riempie il primo isolato, perche' la
  simulazione ripropone all'infinito le stesse colonne.
- Il **catalogo delle tipologie** e' una tabella in `buildings/config.ts`:
  condizioni sul luogo piu' forma. Aggiungere una tipologia e' aggiungere una
  riga — la regola di scelta in `typology.ts` e' generica e non va toccata, e la
  grammatica in `generate.ts` non sa che le tipologie esistono. Ogni uso chiude
  il catalogo con un ripiego senza condizioni, cosi' la scelta non puo' fallire.

## Verifica

- Esegui `npm run typecheck` e `npm test`.
- Per streaming/generazione esegui anche `npm run build` e verifica i budget con
  `?debug=1&terrain=1337`; non aggiornare misure per stima.
