# Regole per `src/sim/`

Simulazione a tick per risorse, popolazione e desiderabilita'. Lavora per
colonna `(x, y)` e non costruisce voxel: il `Builder` e' esterno.

## Dipendenze e API

- Nessun import da `src/engine/`, Three.js o DOM; i test usano Node.
- Nel modulo usa import diretti; fuori esporta tramite `index.ts`.
- Ogni coefficiente vive in `balance.ts`; le policy sono moltiplicatori nello stato.

## Purezza e stato

- `tick` non muta input, non usa tempo/casualita' globale e non tocca il campo.
- `addCatalyst`, `addBuilding` e `setPolicyActive` aggiornano il campo in place e
  trasferiscono la proprieta' al nuovo stato: non riusare quello precedente.
- Il campo ricalcola da zero solo il rettangolo toccato, e solo per gli usi che
  quel catalizzatore influenza davvero; non accumulare contributi e non
  scandire l'intera mappa.
- La curva di decadimento sta solo in `reach.ts`: non riscriverla altrove, e
  non far scendere sotto 1 un costo di passo — sotto, la portata uscirebbe dal
  quadrato che il campo ricalcola e cadrebbe l'equivalenza con `rebuild`.
- `writeDesirabilityData` scrive solo in `data`, mai in `blocks`.
- `resolveWeights` riparte dai pesi base; non annullare policy dividendo.

## Relazioni da non rompere per distrazione

In `balance.ts` ci sono due pareggi 1:1, e uno dei due adesso si difende da se'.

`weights.commercialCapacity` vale `weights.residentialCapacity`: un edificio
commerciale serve esattamente un residenziale pieno. Cambiare uno dei due senza
guardare l'altro rompe il pareggio, e non c'e' niente che lo impedisca.

Il cibo era la stessa cosa scritta peggio — `food.perProduction / perResident`
faceva 24, cioe' `residentialCapacity`, e per accorgersene bisognava dividere due
numeri lontani. Dalla 3.1 e' un **prodotto**: `FOOD_PER_HOUSE` e' derivato da
`residentialCapacity * food.perResident`, e il listino di `farms` e' in **case
sfamate** — un campo due, un frutteto una, una torre sei. Cambiare la capacita'
di una casa muove percio' tutto il listino da solo, e il pareggio non si puo'
piu' rompere per distrazione: solo di proposito, riscrivendo `farms`.

**Il cibo non esce dall'industria.** `tick` lo prende da `farmCounts`, che il
mondo riempie con `addFarm` (campi e frutteti) e con `addBuilding` quando
l'edificio porta `specialization: 'farming'` (le torri idroponiche). Una torre
conta in `buildingCounts[industrial]` *e* in `farmCounts[tower]`, e `tick` la
toglie dall'industria che fa materiali: convertire costa, ed e' il punto.

`farming` e' l'unica specializzazione che cambia il bilancio di un tick. Le altre
cinque restano un fatto sulla forma dell'edificio, non sulle risorse. A dichiararla
e' la **tipologia costruita** e non il profilo del luogo: sono due cose diverse, e
un edificio sotto `minLevel` in un distretto che esprime `farming` non e' una torre.

`state.harvest` e' il referto del raccolto, gemello di `flows` e `commerce`:
derivato dal tick e non accumulato. Serve a chi mostra **da dove viene** il cibo,
e va letto invece di rifare il conto — un secondo listino nell'interfaccia
divergerebbe dal primo alla prima ritaratura. Vale parola per parola per
`state.satisfactionReport` e `state.landFactor`: la scomposizione del bersaglio
di soddisfazione e la quota di terra che resta sono fatti dell'ultimo tick,
calcolati da `tick` e gettati via una riga dopo; chi li mostra li legge, non li
ricalcola.

Il **vettore di influenza** di un catalizzatore sta in
`gameplay.catalyst.influence`, non nella sua definizione: ogni ruolo ha almeno
un uso a `1` esatto, ed e' quello a tenere in piedi l'invariante "al centro il
campo vale esattamente `strength`". Un valore negativo e' legale e significa che
quel ruolo caccia via quell'uso; uno zero non costa nulla, perche' il campo
salta del tutto gli usi che un ruolo non tocca.

## Verifica

- Segui la verifica proporzionata di `AGENTS.md` radice: typecheck e il piu'
  stretto fra test diretti, `test:related` e `test:changed`; la suite intera
  resta limitata ai casi globali dichiarati dal file radice.
- Per percorsi caldi esegui anche il benchmark pertinente.
- Testa purezza, serializzazione, incrementalita' equivalente al rebuild e
  assenza di scritture in `blocks`.
