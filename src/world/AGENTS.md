# Regole per `src/world/`

Storage voxel sparso, scene deterministiche, terreno procedurale, rete stradale
e costruzione degli edifici. Questo modulo non dipende dal renderer.

## Storage e coordinate

- Mondo Z-up; chunk `32x32x32`; coordinate negative valide.
- `blocks` e `data` sono buffer distinti, allocati una volta per chunk.
- `setBlock` sporca il chunk e i vicini di bordo; `setData` mai la geometria.
- `fillColumn` e' `setBlock` su un tratto verticale, e va usata quando il tratto
  si conosce in anticipo: dentro il chunk resta un indice che avanza, e
  conversioni, pack del byte e marcature si pagano una volta invece che per
  voxel. Il terreno ci scrive cinque milioni di celle come cinque corse per
  colonna. Marca i vicini in verticale in modo piu' largo di `setBlock` — per
  tratto e non per cella — perche' sporcare di piu' costa una mesh e sporcare di
  meno lascia una faccia sbagliata.
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
- La **grammatica delle fasce e' una tabella**, `BAND_OP`, e il repertorio — quali
  trasformazioni provare e in che ordine — sta in `ClassProfile`, non nel codice
  di `generate.ts`. E' li' e non in `TypologyShape` perche' `typologyProfile`
  fonde gia' profilo dell'uso e profilo della tipologia: una riga di catalogo
  ridefinisce il repertorio senza plumbing. Il basamento non e' un caso speciale
  ma `keep` ripetuto, e il corpo sovrapposto e' `stack`, che si esaurisce da se'
  quando il risultato scenderebbe sotto `MIN_FOOTPRINT` — nessun contatore.
- La **cima e' una riga di catalogo**, non un ramo: `CROWN_KIND` ha cinque voci e
  i quattro ripieghi per uso ne portano una ciascuno, cosi' "coronamenti per uso"
  resta tabellare. Per livello lo fa `minLevel`, che vale anche senza profilo
  locale perche' `demandsPlace` non lo elenca.
- La **terrazza non e' una fascia in piu'**: e' la sommita' di una fascia dove
  quella sopra non arriva, e chiede `roofTech` per avere il parapetto che
  `emitRoofTech` gia' emette — il mesher non si tocca. Vale sul solo corpo: il
  coronamento e' gia' tetto, e pavimentarlo ridipingerebbe la copertura di ogni
  edificio a tetto piatto invece di aggiungere un luogo dove si sta.
- **Un cluster e' due numeri su un record, non un'entita'.** Gli edifici
  adiacenti dello stesso fronte condividono la quota — che e' gia' `baseZ` — e
  l'altezza del corso di base, che e' `baseBand`; da li' `cluster` dice solo con
  chi. Non c'e' una struttura che sopravviva ai membri, quindi la collisione, il
  budget di chunk e la cancellazione restano per record e la simulazione continua
  a contare un edificio per record (invariante 7). Il basamento condiviso sta
  **dentro** lo stamp di ciascun membro: e' quello che tiene in piedi la
  rigenerabilita', perche' l'upgrade deve poter ricostruire la sagoma vecchia dal
  solo record per cancellarla.
- **Il rifiuto di una fila e' il gradino, non un fallimento.** `cluster.ts` e'
  puro come `grading/` e `sites/`: entrano un `GradePlan` e i termini dei vicini,
  esce una terna. Un lotto entra solo se non deve *scendere* per allinearsi —
  vale anche qui "si riempie, non si scava" — e se il riempimento resta dentro
  `CLUSTER.maxJoinFill`. Chi non entra apre una fila propria alla propria quota,
  ed e' cosi' che su un fianco l'isolato terrazzato esce dalla regola invece di
  essere disegnato. `GRADING.maxWorksStep` non andrebbe bene al posto di
  `maxJoinFill`: e' tarato sulla banchina che scende sul fondale, e metterebbe
  nella stessa fila due lotti separati da mezzo versante.
- **Una banchina e' il bordo costruito della terra, non un'isola artificiale.**
  `GRADING.maxQuayDepth` dice fin dove il fondale regge un muro, e su un
  bassofondo dolce dice di si' per una quindicina di colonne al largo: il
  vincolo di *forma* e' `GRADING.quayReach`, che il Builder applica sia alla
  carreggiata di un isolato costiero sia ai lotti. Senza, l'anello di strada di
  un isolato sul mare si costruiva tutto, e a schermo era una piattaforma
  rettangolare in mezzo all'acqua. A spingersi piu' al largo e' solo un molo,
  che ha una ricetta e quindi un limite proprio.
- Un **landmark e' un edificio con un altro generatore.** Vive in
  `landmarks/`, entra nel registry come `BuildingRecord` con `landmark`
  valorizzato, e da li' eredita occupazione, collisione, budget di chunk,
  comparsa a budget e avanzamento: l'unico ramo nuovo nel Builder e' quale
  generatore disegna lo stamp. `level` e' lo stadio, e i record con `landmark`
  restano fuori dagli istogrammi — la simulazione non li ha mai contati come
  edifici.
- Lo **stadio di un landmark e' cio' che la citta' gli ha costruito intorno**:
  il numero di record entro il raggio del catalizzatore, non la desiderabilita'.
  Un catalizzatore siede al centro della propria influenza, quindi il campo li'
  e' quasi sempre saturo e un landmark che lo leggesse salterebbe tutti gli
  stadi al primo tick. Non c'e' stato da tenere: lo stadio e' una funzione pura
  del contenuto del registry.
- Le **ricette dei landmark sono dati**, non codice: `landmarks/parts.ts` ha
  sette primitive e `landmarks/config.ts` le compone. Gli stadi sono
  **cumulativi dentro un ingombro che non cambia mai** — riservato per intero al
  piazzamento — quindi uno stadio non puo' restare bloccato da un edificio
  spuntato accanto, e la sagoma precedente non ha mai niente da cancellare.
  Aggiungere un ruolo e' aggiungere una riga; un ruolo senza riga ottiene la
  piazzola di ripiego e resta giocabile.
- Il **catalogo delle tipologie** e' una tabella in `buildings/config.ts`:
  condizioni sul luogo piu' forma. Aggiungere una tipologia e' aggiungere una
  riga — la regola di scelta in `typology.ts` e' generica e non va toccata, e la
  grammatica in `generate.ts` non sa che le tipologie esistono. Ogni uso chiude
  il catalogo con un ripiego senza condizioni, cosi' la scelta non puo' fallire.

## Verifica

- Esegui `npm run typecheck` e `npm test`.
- Per streaming/generazione esegui anche `npm run build` e verifica i budget con
  `?debug=1&terrain=1337`; non aggiornare misure per stima.
