## indice — `src/world/roads/`
| [src/world/roads/network.ts](src/world/roads/network.ts) | L'albero cresciuto dal polo piu' forte **della regione che ne contiene di piu'**: ogni polo si attacca alla prima carreggiata che incontra, chi sta su un'altra costa resta orfano senza cercare, e il rango di un tratto e' il suo carico — quanti poli ci passano per arrivare al centro | `planRoads`, `normalisePoles`, `rankOf`, `RoadPole`, `RoadNode`, `RoadPlan`, `EMPTY_PLAN` |
| [src/world/roads/regions.ts](src/world/roads/regions.ts) | Quali colonne del riquadro si raggiungono a vicenda, con la stessa regola di passo di `traceRoad`: serve a non cercare un cammino che non c'e', ed e' anche cio' che dice dove sta la citta' quando l'isola e' piu' d'una | `roadRegions`, `RoadRegions` |
| [src/world/roads/trace.ts](src/world/roads/trace.ts) | Il cammino a costo minimo su cui tutto poggia: otto vicini, dislivello come costo del passo — da cui i tornanti — e arrivo a un punto o diffuso sulla rete | `traceRoad`, `boundsAround`, `unionBounds`, `TRACE_STEPS`, `RoadProbe`, `TraceRequest`, `TraceBounds`, `TraceStep`, `Trace` |

## changelog — Le regioni del tracciato, e una radice che non abbandona la citta'

- **La ricostruzione della rete stradale e' passata da dodici-diciassette secondi
  a due decimi.** Misurato sullo stesso salvataggio maturo dell'incremento
  precedente (seed 866730858, 1208 record, 78 catalizzatori, popolazione 64 mila):
  quindici ricostruzioni in tre minuti di partita, fra 188 e 306 ms, contro gli
  otto frame da 11,7-16,9 s di prima. Il referto `?perf=1` non ha piu' finestre
  da cinque secondi che ne durano venti, e gli fps restano fra 44 e 55 per tutta
  la misura.
- **La domanda «questa colonna e' gia' in rete?» non costruisce piu' una
  stringa.** `planRoads` la fa una volta per ogni passo verso ognuno degli otto
  vicini di ogni colonna visitata da ognuna delle ricerche, e `onNet.has(keyOf(x,
  y))` era tre secondi e mezzo di solo involucro in un profilo della V8, piu' le
  decine di milioni di stringhe da raccogliere. Adesso risponde una maschera
  `Uint8Array` larga quanto il riquadro; la mappa resta perche' `parent` e
  `resolved` vogliono il passo e non un si'/no, e quelle domande sono poche
  migliaia.
- **Un polo che non si puo' raggiungere non si cerca piu'**, e il nuovo
  `regions.ts` e' quello che lo sa dire. `traceRoad` non ha modo di arrendersi in
  anticipo — finche' la coda non e' vuota un cammino potrebbe esistere — quindi un
  polo su un'altra costa esauriva **tutta** la propria regione prima di
  restituire null: 244 mila colonne, per trentatre poli, che da soli facevano la
  quasi totalita' del blocco. Etichettare il riquadro una volta costa una
  passata, e la risposta e' esatta e non una stima: fra colonne in cui si entra,
  «si raggiungono a vicenda» e' simmetrica, e ogni colonna di carreggiata sta per
  costruzione nella regione della radice.
- **La radice e' il polo piu' forte della terraferma, non il piu' forte in
  assoluto — ed e' una correzione di gioco, non di prestazioni.** La radice e'
  l'unico polo che non si attacca a niente: tutti gli altri raggiungono lei, o non
  hanno strada. Presa per sola intensita' poteva finire su uno scoglio, e allora
  la rete serviva lo scoglio. Misurato prima: la citta' **perdeva** strade mentre
  cresceva — le colonne asfaltate scendevano da 2946 a 1189 e i poli collegati da
  33 a 14 — perche' un avanzamento di stadio che aggiunge otto all'intensita'
  bastava a spostare la radice su una costa mal collegata. Adesso le colonne
  salgono con la citta': 2946, 2957, 2972 nella stessa misura, e i collegati da
  33 a 34. La regola e' «quante teste, non quanto grande»: i poli *sono* la
  citta', e una penisola deserta puo' essere larga il doppio del centro.
- **La firma della rete non porta piu' l'intensita' dei poli**, perche'
  `planRoads` la legge in un posto solo — l'ordine di `normalisePoles` — e due
  liste che normalizzano nella stessa sequenza di colonne danno la stessa rete,
  colonna per colonna. **Sulla citta' di prova questo non ha evitato nemmeno una
  ricostruzione**, ed e' giusto dirlo: con settantotto poli in una fascia
  d'intensita' stretta, quasi ogni bonus di otto scavalca qualcuno e quindi
  cambia l'ordine per davvero. Resta perche' e' un'invariante vera e perche' il
  caso che evita — rifare tutto per un numero che non sposta un voxel — era
  gratuito da chiudere.
- **Cosa resta, e non e' piu' nelle strade.** Con le ricostruzioni a due decimi,
  il buco piu' grande che il rilevatore di frame trova e' di 1,6 s e il profilo lo
  attribuisce per 1625 ms su 1692 a `DesirabilityField.recomputeRect`, per la via
  `onFrame` → `updateGrowth` → `growthScene.advance` → `syncCongestion` →
  `SimState.rebuildField`: un campo intero rifatto dentro un frame, che e' la
  stessa forma del difetto di qui. Finche' c'e' quello, la qualita' adattiva
  continua a leggere gli stalli di CPU come sofferenza della GPU e a spegnere gli
  effetti (`effects none`) senza riaccenderli, perche' le servono dieci secondi
  tranquilli di fila.
