# src/sim

Simulazione a tick, senza rendering. Tiene risorse e popolazione, calcola un
campo di desiderabilità per cella e per classe di edificio, e dice dove
crescerebbe il prossimo edificio. **Non costruisce niente**: espone lo stato e le
decisioni, e chi costruisce sta fuori da questa cartella.

```ts
import { createSimState, addCatalyst, tick, nextBuildSites, BUILDING_CLASS } from './sim';

let state = createSimState();
state = addCatalyst(state, { x: 96, y: 96, class: BUILDING_CLASS.residential, strength: 220, radius: 24 });

state = tick(state, terrainMap);                 // puro: nuovo stato, input intatto
nextBuildSites(state, terrainMap, 10);           // [{ x, y, class, score }, …]
```

| Percorso | Ruolo |
| --- | --- |
| [balance.ts](balance.ts) | **Ogni** coefficiente, soglia e moltiplicatore. Un solo oggetto esportato |
| [classes.ts](classes.ts) | Le tre classi di edificio come indici densi |
| [SimState.ts](SimState.ts) | Stato, operazioni del giocatore, serializzazione |
| [tick.ts](tick.ts) | Il bilancio di un tick, funzione pura |
| [DesirabilityField.ts](DesirabilityField.ts) | Campo per classe, `Uint8Array` chunkato 32×32, ricalcolo incrementale |
| [policies.ts](policies.ts) | Catalogo delle policy e risoluzione dei pesi |
| [nextBuildSites.ts](nextBuildSites.ts) | I candidati, ordinati e filtrati |
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

Per ogni cella e ogni classe:

```
D = clamp(Σ contributi × pesoPolicy − congestione, 0, 255)
contributo = strength × max(0, 1 − dist / radius)     dist = Chebyshev
congestione = edifici entro congestionRadius × congestionPerBuilding
```

A distanza pari al raggio il contributo è **esattamente 0**, e al centro vale
**esattamente `strength`** — quest'ultimo perché i tre pesi base di
desiderabilità valgono 1 in `balance.ts`, di proposito.

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

## Proprietà del campo e proprietà dello stato

`tick` è puro, ma le operazioni del giocatore no: `addCatalyst`, `addBuilding`,
`setPolicyActive` aggiornano il campo **in place** e restituiscono un nuovo
oggetto stato che ne prende possesso. Lo stato precedente non va più usato — è la
stessa regola di un buffer trasferito, ed è ciò che permette l'aggiornamento
incrementale senza clonare il campo a ogni piazzamento.

## Bilancio di un tick

In ordine: lavoro e produzione, cibo, fondi e manutenzione, soddisfazione,
popolazione. L'ordine conta, perché ogni passo consuma ciò che il precedente ha
appena prodotto.

Nessuno stock può andare sotto zero **per costruzione**, non per clamp finale:
ogni consumo è un `min(domanda, disponibile)`, e ciò che manca diventa un rapporto
di soddisfacimento in `[0, 1]` (`fed`, `funded`) che degrada la simulazione invece
di scavare un buco. `finiteStock` è la rete, non il meccanismo.

Un numero da conoscere: `food.perProduction / food.perResident` fa 24, cioè
esattamente `weights.residentialCapacity`. Un edificio produttivo sfama quindi un
edificio residenziale pieno, e una città in rapporto **1:1** sta in pareggio
alimentare. Cambiare uno dei tre valori senza guardare gli altri due rompe la
relazione.

## Scena di debug

`?debug=1&sim=1` — genera l'isola 256×256, piazza i catalizzatori da script e
consegna alla simulazione un nucleo di 24 edifici (10 residenziali, 10 produttivi,
4 civici: il rapporto che sta in pareggio).

L'overlay mostra stock e delta per tick, la heatmap del campo per la classe
selezionata e i prossimi dieci candidati. Tasti: `T` un tick, `P` avvia o ferma il
passo automatico, `M` cicla la classe mostrata. I pulsanti del pannello fanno le
stesse cose, più l'accensione delle policy.

La heatmap è una canvas 2D, non voxel. Il renderer legge solo `blocks` e la
simulazione non ha il permesso di scriverci: colorare le colonne per
desiderabilità significherebbe rimeshare mezza isola a ogni ricalcolo. Il campo
finisce comunque in `VoxelWorld.data`, dove è interrogabile da console.

Con `?debug=1&sim=1` sono esposti `__simStats()`, `__simTick(n)`, `__simSites(n)`,
`__simClass(i)` e `__simPolicy(id)` sull'oggetto globale.

## Misure

`npm run bench`, isola 256×256 con 50 catalizzatori e 400 edifici, Node 22.

| Operazione | Media | Criterio |
| --- | --- | --- |
| **tick** | **0,0004 ms** | < 3 ms ✅ |
| modifica di un catalizzatore di raggio 20 (1681 celle) | 0,09 ms | — |
| `setPolicyActive` su un peso di desiderabilità | 3,6 ms | azione del giocatore |
| `nextBuildSites`, primi 10 su tutto il campo | 2,5 ms | azione del giocatore |

Il tick sta settemila volte sotto il suo budget perché non scorre né la mappa né
il campo: legge tre contatori di edifici e un contatore di colonne edificabili.
Le altre tre non stanno su un budget di frame — la scena di debug le rifà solo
quando il campo può essere cambiato, mai a ogni tick.
