# src/sim

Simulazione a tick, senza rendering. Tiene risorse e popolazione, calcola un
campo di desiderabilità per cella e per **uso urbano**, e dice dove crescerebbe
il prossimo edificio e con quali usi. **Non costruisce niente**: espone lo stato
e le decisioni, e chi costruisce sta fuori da questa cartella.

Gli usi urbani sono quattro — residenziale, commerciale, industriale, civico — e
sono indici densi in quest'ordine. Uffici, turismo, ricerca, logistica e
intrattenimento non sono usi ma **specializzazioni**: aggettivi che si posano su
un uso già deciso e servono a chi sceglie la forma degli edifici.

```ts
import { createSimState, addCatalyst, tick, nextBuildSites, BUILDING_CLASS } from './sim';

let state = createSimState();
state = addCatalyst(state, {
  x: 96, y: 96, kind: 'market',
  class: BUILDING_CLASS.residential, strength: 220, radius: 24,
});

state = tick(state, terrainMap);                 // puro: nuovo stato, input intatto
nextBuildSites(state, terrainMap, 10);           // [{ x, y, class, mixed, score }, …]
```

| Percorso | Ruolo |
| --- | --- |
| [balance.ts](balance.ts) | **Ogni** coefficiente, soglia e moltiplicatore. Un solo oggetto esportato |
| [classes.ts](classes.ts) | I quattro usi urbani come indici densi |
| [catalysts.ts](catalysts.ts) | I sette ruoli: vettore di influenza, funzione di toolbar, effetti locali |
| [SimState.ts](SimState.ts) | Stato, operazioni del giocatore, serializzazione |
| [tick.ts](tick.ts) | Il bilancio di un tick, funzione pura |
| [DesirabilityField.ts](DesirabilityField.ts) | Campo per uso, `Uint8Array` chunkato 32×32, ricalcolo incrementale |
| [policies.ts](policies.ts) | Catalogo delle policy e risoluzione dei pesi |
| [districts.ts](districts.ts) | Profilo locale, distretti e specializzazioni emergenti dalla sovrapposizione |
| [commerce.ts](commerce.ts) | Il ciclo commerciale interno: domanda, organico, merce, ricavi |
| [decisions.ts](decisions.ts) | Decisioni periodiche e alternative deterministiche |
| [trade.ts](trade.ts) | Commercio esterno O(1) sbloccato dal porto |
| [nextBuildSites.ts](nextBuildSites.ts) | I candidati, ordinati, filtrati e con l'eventuale secondo uso |
| [rng.ts](rng.ts) | `mulberry32` in forma pura, stato dentro `SimState` |
| [scenario.ts](scenario.ts) | Fixture della scena di debug: catalizzatori e nucleo iniziali |
| [debugData.ts](debugData.ts) | L'unica scrittura verso il `VoxelWorld`, e va in `data` |
| [testTerrain.ts](testTerrain.ts) | Fixture di terreno per i test. Non è codice di produzione |

## Convenzioni

Il piano di terra è **`(x, y)`**, come nel resto del progetto: mondo Z-up, `x`
est, `y` nord, `z` altezza. Una cella della simulazione è una colonna, indicizzata
esattamente come nella [`TerrainMap`](../world/terrain/TerrainMap.ts). Nella
simulazione non esiste una coordinata verticale.

## Contratti

- **Nessun import di Three.js e nessun import da `src/engine/`.** Gira in Node:
  i test non hanno bisogno di un DOM, di una GPU o di un browser.
- **`tick` è puro.** Nessuna mutazione dell'input, nessun `Date.now()`, nessun
  `Math.random()`. Il rumore esce dal PRNG con seed dentro lo stato.
- **`tick` non tocca il campo.** Il nuovo stato riceve lo stesso oggetto `field`,
  non ricalcolato: il costo di un tick non dipende dall'estensione della mappa.
- **Il campo si ricalcola solo dove cambia.** Un catalizzatore tocca il quadrato
  di Chebyshev del suo raggio (raggio 20 → 1681 celle), un edificio nuovo il
  quadrato del raggio breve. Non esiste una passata sull'intera mappa.
- **La simulazione non tocca `blocks`.** L'unica scrittura verso il mondo è
  `writeDesirabilityData`, che va in `VoxelWorld.data` e quindi non marca sporco
  niente e non invalida una mesh.
- **Lo stato è serializzabile in JSON senza perdita.** `toSimStateData` dà dati
  puri, `reviveSimState` li rilegge; il campo non si serializza perché è
  ricostruibile per intero da catalizzatori, edifici e policy.

## Come si calcola la desiderabilità

Per ogni cella e ogni uso:

```
D = clamp(Σ contributi × pesoPolicy − congestione, 0, 255)
contributo = strength × influenza[uso] × max(0, 1 − dist / radius)   dist = Chebyshev
congestione = edifici entro congestionRadius × congestionPerBuilding
```

A distanza pari al raggio il contributo è **esattamente 0**, e al centro vale
**esattamente `strength`** per gli usi che il ruolo porta a pieno — quest'ultimo
perché i quattro pesi base di desiderabilità valgono 1 in `balance.ts`, di
proposito, e ogni ruolo ha almeno un'influenza pari a 1.

**Un catalizzatore parla a più usi.** L'influenza è un vettore, non una classe:
un mercato somma su residenziale e commerciale insieme, una fabbrica somma
sull'industriale e *sottrae* dal residenziale. Il segno negativo non ha avuto
bisogno di un meccanismo suo — il clamp a zero era già lì. Un'influenza nulla
non costa nulla: il campo salta del tutto gli usi che un ruolo non tocca, ed è
ciò che ha tenuto il costo di un piazzamento dov'era con tre usi.

**Il campo non accumula: ricalcola.** Ogni cella toccata viene ricostruita da
zero rileggendo la lista dei catalizzatori. È l'unico modo perché togliere un
catalizzatore dia esattamente lo stesso campo di non averlo mai aggiunto, e per
cui percorso incrementale e ricostruzione completa siano indistinguibili — cosa
che i test verificano cella per cella.

## Policy

Una policy è un moltiplicatore nominato su un peso della simulazione. Lo stato
tiene solo la lista degli `id` attivi; `resolveWeights` riparte sempre dal valore
base di `balance.ts` e rimoltiplica le policy attive **nell'ordine del catalogo**.

Non si divide mai per tornare indietro: dividere accumulerebbe errore di virgola
mobile e "spegnere tutto e riaccendere tutto" smetterebbe di riportare ai pesi
esatti di partenza dopo poche oscillazioni. Da qui seguono due proprietà: i pesi
tornano identici bit a bit, e l'ordine in cui il giocatore attiva le policy non
cambia il risultato.

Attivare o disattivare una policy è un'operazione sullo stato (`setPolicyActive`),
mai una modifica di `balance.ts`.

Ogni policy richiede inoltre fondi a ogni tick e dichiara le incompatibilità con
le altre. Il suo effetto spaziale entra nel profilo locale: per esempio la
cintura verde aumenta la vivibilità e limita la densità vicino ai parchi,
mentre lo zoning permissivo densifica i campi industriali. C'è una policy di
desiderabilità per ciascuno dei quattro usi — l'ultima, la *carta del mercato*,
allarga i campi commerciali e rende più probabili gli isolati a uso misto.

## Distretti, decisioni e commercio

`urbanProfileAt` combina i campi dei sette ruoli in densità, ricchezza,
accessibilità, soddisfazione e intensità industriale, più il peso di ciascun uso
urbano. Un distretto compare solo quando almeno due ruoli superano la soglia
locale: non esiste una griglia di zoning salvata o modificata cella per cella. Il
`Builder` usa questo profilo per livello iniziale, soglia di promozione,
impronta, terrazze, accenti — e per la **tipologia** dello stamp.

Dallo stesso profilo esce la specializzazione: ricerca, logistica, turismo,
intrattenimento o uffici, valutate in ordine fisso dalla più rara alla più
comune. Non entra nel campo e non è un uso: è ciò che distingue una torre di
uffici da un hotel a parità di uso commerciale.

Ogni 120 tick, dopo la prima finestra di 80 tick, lo stato apre una decisione
con tre alternative. La decisione resta sospesa finché il giocatore sceglie e
gli effetti sono dati serializzabili derivati dallo stato, senza casualità globale.

Il porto abilita un singolo scambio aggregato O(1) per tick. Le strategie
bilanciata, priorità al cibo e priorità alle esportazioni muovono cibo,
materiali e fondi mantenendo riserve diverse.

## Commercio interno e uso misto

`resolveCommerce` è la seconda catena economica, e si legge contro la prima:

| | consuma | produce |
| --- | --- | --- |
| industria | lavoratori | materiali, cibo |
| commercio | lavoratori, **materiali** | fondi, soddisfazione |

Le due pescano dallo stesso bacino di manodopera e si passano gli stessi
materiali, quindi non sono due bilanci paralleli ma due estremi dello stesso:
una città tutta fabbriche accumula materiali che nessuno vende, una città tutta
negozi ha scaffali vuoti e commessi disoccupati.

Tre strozzature in fila, ognuna un `min` e mai una sottrazione secca — la
domanda dei residenti, i banchi con l'organico che c'è, la merce che il
magazzino fornisce. `service` (quanta domanda è servita) e `occupancy` (quanto
sono pieni i banchi) restano due numeri distinti: con uno solo, "troppi negozi" e
"pochi negozi" si leggerebbero uguale.

Un edificio **a uso misto** ha un uso primario e un secondo uso che ne porta
`mixedUse.secondaryShare` di capacità economica. Nasce dove due campi
compatibili superano insieme le loro soglie — la seconda ridotta, perché il
secondo uso è ospite — e non è una zona: resta un volume, una cella occupata,
una riga fra i candidati. `buildingCounts` lo conta sotto il primario e
`mixedCounts` sotto il secondo; la somma delle due tabelle non è il numero di
edifici, ed è giusto così. Si incontrano in un punto solo, la capacità efficace
che il bilancio legge.

## Proprietà del campo e proprietà dello stato

`tick` è puro, ma le operazioni del giocatore no: `addCatalyst`, `addBuilding`,
`setPolicyActive` aggiornano il campo **in place** e restituiscono un nuovo
oggetto stato che ne prende possesso. Lo stato precedente non va più usato — è la
stessa regola di un buffer trasferito, ed è ciò che permette l'aggiornamento
incrementale senza clonare il campo a ogni piazzamento.

## Bilancio di un tick

In ordine: lavoro, industria, cibo, materiali e commercio interno, fondi e
manutenzione, commercio esterno, soddisfazione, popolazione. L'ordine conta,
perché ogni passo consuma ciò che il precedente ha appena prodotto — e i
materiali si contano prima dei fondi perché il commercio li trasforma in
incasso nello stesso tick.

Nessuno stock può andare sotto zero **per costruzione**, non per clamp finale:
ogni consumo è un `min(domanda, disponibile)`, e ciò che manca diventa un rapporto
di soddisfacimento in `[0, 1]` (`fed`, `funded`) che degrada la simulazione invece
di scavare un buco. `finiteStock` è la rete, non il meccanismo.

Due numeri da conoscere. `food.perProduction / food.perResident` fa 24, cioè
esattamente `weights.residentialCapacity`: un edificio industriale sfama un
edificio residenziale pieno, e una città in rapporto **1:1** sta in pareggio
alimentare. E `weights.commercialCapacity` vale a sua volta 24: un edificio
commerciale serve esattamente un edificio residenziale pieno. Sono le due
relazioni che rendono leggibile un bilancio a colpo d'occhio, e cambiare uno dei
valori senza guardare gli altri le rompe.

## Scena di debug

`?debug=1&sim=1` — genera l'isola 256×256, piazza i catalizzatori da script e
consegna alla simulazione un nucleo di 30 edifici (10 residenziali, 6
commerciali, 10 industriali, 4 civici: il rapporto che sta in pareggio).

L'overlay mostra stock e delta per tick, il riepilogo del commercio interno, i
conteggi per uso primario e secondario, la heatmap del campo per l'uso
selezionato e i prossimi dieci candidati. Tasti: `T` un tick, `P` avvia o ferma
il passo automatico, `M` cicla l'uso mostrato. I pulsanti del pannello fanno le
stesse cose, più l'accensione delle policy.

La heatmap è una canvas 2D, non voxel. Il renderer legge solo `blocks` e la
simulazione non ha il permesso di scriverci: colorare le colonne per
desiderabilità significherebbe rimeshare mezza isola a ogni ricalcolo. Il campo
finisce comunque in `VoxelWorld.data`, dove è interrogabile da console.

Con `?debug=1&sim=1` sono esposti `__simStats()`, `__simTick(n)`, `__simSites(n)`,
`__simClass(i)` e `__simPolicy(id)` sull'oggetto globale.

## Misure

> ⚠️ **Da rimisurare.** Con la scala del voxel dimezzata i raggi dei
> catalizzatori sono raddoppiati per conversione di unità (`radius: 22 → 44` e
> simili) e `congestionRadius` con loro: un raggio doppio è **quattro volte** le
> celle toccate, e le due righe di modifica del campo qui sotto sono
> proporzionali a quel numero. Anche l'isola è passata da 256 a 512 di lato. I
> valori sono quelli di prima del cambio: vanno rifatti con `npm run bench` su
> questa macchina prima di essere citati.

`npm run bench`, isola 256×256 con 50 catalizzatori e 400 edifici, Node 22.

| Operazione | Prima di fase 3 | Dopo fase 3 | Criterio |
| --- | --- | --- | --- |
| **tick** | 0,0004 ms | **0,0010 ms** | < 3 ms ✅ |
| modifica di un catalizzatore di raggio 20 (1681 celle) | 0,09 ms | 0,22 ms | — |
| `setPolicyActive` su un peso di desiderabilità | 3,6 ms | 6,4 ms | azione del giocatore |
| `nextBuildSites`, primi 10 su tutto il campo | 2,5 ms | 4,0 ms | azione del giocatore |

> **Le due colonne non sono confrontabili in assoluto.** La prima è stata
> misurata quando la tabella è stata scritta, la seconda dopo l'estensione a
> quattro usi, e nel mezzo è cambiata anche la macchina: tutte e quattro le
> righe sono salite di circa due volte e mezza, `tick` compreso, che con quattro
> usi legge un contatore in più e poco altro. Il confronto che regge è quello
> *relativo al tick*: `nextBuildSites` è passato da 6250× a 4050× il costo di un
> tick, e `setPolicyActive` da 9000× a 6420×. Il quarto uso non ha reso più
> costosi i percorsi caldi. Chi rifà la misura su una macchina ferma sostituisca
> entrambe le colonne.

Il tick sta migliaia di volte sotto il suo budget perché non scorre né la mappa
né il campo: legge quattro contatori di edifici, quattro di uso secondario e un
contatore di colonne edificabili. Le altre tre non stanno su un budget di frame —
la scena di debug le rifà solo quando il campo può essere cambiato, mai a ogni
tick.

**Memoria del campo.** Sette byte per colonna di mondo: quattro `Uint8Array` di
desiderabilità, uno di occupazione e un `Uint16Array` di affollamento. Il quarto
uso è costato un byte per colonna, non una struttura nuova. Su una città che
copre 64 colonne di chunk fanno 458 kB, e il campo alloca solo dove un
catalizzatore o un edificio è arrivato: una mappa grande e vuota non costa nulla.

**Selezione dei siti.** L'uso misto non ha aggiunto una seconda scansione: il
secondo uso si cerca *dopo* aver stabilito che il sito entra nella lista dei
primi `n`, perché non partecipa all'ordinamento. Su una mappa fitta le celle
sopra soglia sono decine di migliaia e i posti una ventina, quindi la ricerca
avviene qualche decina di volte invece di trentamila. `simPerf.test.ts` verifica
che il costo segua le celle allocate e non il numero di edifici.
