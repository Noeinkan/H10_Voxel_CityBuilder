## changelog — La sonda del tracciato si ricorda cosa ha letto

- **Una ricostruzione della rete stradale bloccava il frame per dodici-diciassette
  secondi, e lo rifaceva ogni quindici-venti.** Misurato caricando un
  salvataggio maturo (seed 866730858, 1208 record, 78 catalizzatori) e leggendo
  il referto `?perf=1`: finestre da cinque secondi che ne duravano venti con un
  frame solo dentro. Il profilo della V8 lo attribuiva per il 95% a
  `Builder.onTick` → `roadDriver.onTick` → `RoadNetwork.update` → `planRoads`.
  La causa non e' il tracciato in se': `planRoads` fa una ricerca per polo — fino
  a `maxPoles` meno uno, quarantasette su quella citta' — e ognuna interroga
  `costAt` per ogni passo verso ognuno degli otto vicini, sul riquadro che
  contiene **tutti** i poli: 455 x 537 colonne. La stessa colonna riceveva quindi
  la stessa domanda centinaia di volte, e ogni volta rifaceva le sei letture di
  `TerrainMap` e l'interrogazione del registry per riottenere la stessa risposta.
- **La sonda ora tiene le proprie risposte su due array larghi quanto il
  riquadro della ricerca.** Non e' una cache da invalidare, ed e' il punto:
  terreno, seme e suolo occupato non cambiano *durante* una ricostruzione —
  `planRoads` e `connect` sono chiamate sincrone, e chi scrive nel registry sta
  aspettando che ritornino — quindi la memoria vive quanto l'oggetto che
  `RoadNetwork.probe` restituisce e non un tick di piu'. `Float64Array` e non
  `Float32Array`: il termine continuo di `terrainCost.ts` ha la virgola, e
  arrotondarlo cambierebbe quale di due cammini uguali vince, cioe' il disegno
  delle strade.
- **Misura, sullo stesso salvataggio e sulla stessa macchina.** Ricostruzione al
  caricamento (quindici poli irraggiungibili): da 1900 ms a 830-1705 ms.
  Ricostruzione a regime (trentatre irraggiungibili): da 11,7-16,9 s a 6,4-8,7 s
  nella mediana, con un campione a 15,6 s sotto contesa di CPU. Il piano e'
  identico — `connected`, `orphans` e le colonne asfaltate coincidono voce per
  voce prima e dopo — che e' cio' che rende la memoria un'ottimizzazione e non
  una taratura.
- **Cosa resta, e dove.** Il costo dominante ora e' in `network.ts`: `netProbe`
  chiede `onNet.has(keyOf(x, y))` prima di ogni lettura, e `keyOf` costruisce una
  stringa per ogni passo — nel profilo erano 3,5 s di solo involucro piu' 1,0 s
  fra `toAny` e `keyOf`, e altrettanti milioni di stringhe da raccogliere. Una
  maschera `Uint8Array` sul riquadro accanto alla mappa — che resta per
  `parent` e `resolved` — e' la mossa successiva. Restano anche le due cose che
  non sono velocita': un polo irraggiungibile paga una scansione completa del
  riquadro prima di arrendersi, e un avanzamento di stadio di un landmark
  (`setCatalystStrength`, +8) cambia la firma dei poli e ordina una ricostruzione
  intera che quasi mai cambia il piano — ma quando lo cambia sposta la radice
  dell'albero, e le colonne asfaltate scendono da 2946 a 1189.
