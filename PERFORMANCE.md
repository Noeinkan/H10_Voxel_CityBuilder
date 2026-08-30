# Piano prestazioni — tenere il frame

Questo file è un piano di lavoro, non una relazione: dice cosa va fatto, in che
ordine, quanto ci si aspetta di guadagnare e come si verifica. I numeri che cita
sono misurati, non stimati; dove sono ipotesi, lo dice.

Il difetto sta tutto in una riga: **il frame ha un budget per ogni cosa tranne
che per quella che costa di più.** Generazione del terreno, meshatura, upload di
geometria e ricolore per bioma hanno ciascuno il proprio tetto in millisecondi e
si spezzano fra i frame ([main.ts:1501-1524](src/main.ts#L1501-L1524)). Il tick
della simulazione no: `updateGrowth` chiama `growthScene.advance(dt)` e quello
che c'è dentro gira fino in fondo, quanto ci mette ci mette.

## Dove sta il tempo

Misurato su città matura (177 → 189 edifici, isola 256×256, seme `2555647721`)
con una sonda headless che avvolge a runtime ogni passata del `Builder`.

| Voce | Cadenza | Costo | Note |
| --- | --- | --- | --- |
| `buildPass` → `findLot` | ogni 10 tick (1 s) | **150–400 ms** | 90% dentro `findLot`; a 297 edifici arrivava a **3–9 s** |
| `spans.pass` | ogni 20 tick (2 s) | 15–27 ms | |
| `aerial.routePass` | ogni 24 tick (2,4 s) | 12–33 ms | |
| `refreshCoach` | ogni tick | 0,3–1,9 ms | di cui `densestColumn` ~la metà |
| `arcologies` / `farms` / `terracePass` | 20 / 40 / 16 tick | 1–5 ms | |
| `tick()` della simulazione | ogni tick | < 1 ms | non è il problema |
| `builder.step()` (scrittura voxel) | ogni frame | 0,01 ms | già a budget, va bene così |

Il budget dichiarato in [AGENTS.md](AGENTS.md) è **3 ms di lavoro non-render per
frame, 4 ms in accettazione**. `buildPass` lo sfonda di due ordini di grandezza,
una volta al secondo. È questo, e non il rendering, a produrre il blocco che
sembra un freeze: gli elementi mobili si fermano e la camera non risponde perché
il main thread è dentro una ricerca di lotto.

### Il numero da abbattere

```
27 ricerche di lotto · 1.106.155 colonne lette → 40.969 colonne per ricerca
```

`findLot` cammina radialmente un rettangolo di 5×5 isolati — circa 100×100
colonne — e in un nucleo saturo non trova niente, quindi lo percorre tutto.
`buildRound` chiede fino a `sitesPerBuild × candidateOverfetch` = 12 candidati e
per ciascuno rifà il giro. **Il costo cresce con l'area satura, cioè con la
città**: è la sola cosa in questo elenco che non ha un tetto.

## Le tre regole

Ogni intervento qui sotto serve una di queste, e se non ne serve nessuna non
entra nel piano.

1. **Il tick sta dentro il budget del frame.** Nessuna passata può superare i
   4 ms; quello che non ci sta si spezza fra i frame come già fanno generazione
   e meshatura.
2. **Il costo di una passata non cresce con la città.** Una passata è un cursore,
   non una scansione: se il suo costo dipende da quanti edifici ci sono, è un
   difetto anche quando oggi è veloce.
3. **Le cadenze non coincidono.** Oggi tutte le passate usano
   `tickCount % N === 0`, quindi si accavallano a ogni multiplo comune: al tick
   40 ne partono otto insieme.

## Fase 0 — fatto

- **Chiave di colonna numerica.** `columns`, `groundColumns`, `buckets` del
  registro e la blacklist del `Builder` non allocano più una stringa a
  interrogazione: `columnKey` in [chunkCoords.ts](src/world/chunkCoords.ts) le
  impacchetta in un intero piccolo. A/B isolato: **2,51×** sulla sola lettura,
  circa 9 ms per `buildPass`. Reale ma marginale — è il 5% del problema, e va
  detto.

### Cosa è stato provato e scartato

- **Memo dell'ancora dentro `placeLot`.** L'ipotesi era che il ciclo sulle
  misure d'impronta riscandisse l'anello otto volte. Il contatore dice che fa
  una passata sola, e che `lotIsFree` esce già alla prima colonna occupata: il
  memo non faceva mai centro e aggiungeva il 7% di letture. Rimosso. Se torna la
  tentazione, il dato è: senza memo 509.134 prove di quadrato e 925.849 colonne;
  con memo 66.267 prove, 509.134 sonde e 992.116 colonne.

## Fase 1 — togliere la crescita con la città da `findLot`

È il 90% del problema. Tre mosse, dalla più contenuta alla più strutturale; la
prima da sola dovrebbe bastare per la maggior parte dei casi.

**1.1 — Memo delle colonne non libere, per passata.**
Un `Set<number>` nel `Builder`: `lotIsFree` lo consulta per primo e ci scrive
ogni colonna che boccia. Il secondo candidato, e i dieci dopo di lui, smettono di
ricamminare lo stesso nucleo saturo — una lettura di `Set` invece di
`isOccupied` + `groundKindAt` + `nearLand`.

È corretto perché **il rifiuto è monotono dentro una passata**: una colonna presa
o inadatta torna libera solo per demolizione o sgombero, e quei due chiamano già
`forget()`, che è il punto in cui il memo si svuota.

L'unica insidia sono le **prenotazioni** (`BuildingRegistry.reservations`), che
sono temporanee: rilasciarne una deve invalidare le sue colonne, altrimenti il
memo le tiene bocciate per sempre. Va risolto insieme al memo, non dopo.

*Atteso:* letture per ricerca da ~41.000 a poche migliaia dal secondo candidato
in poi. *Rischio:* nessun cambiamento di comportamento se l'invalidazione è
giusta — un test che confronta la città generata con e senza memo, a parità di
seme, è il modo di dimostrarlo.

**1.2 — Memo dell'isolato pieno.**
Complementare al precedente e più grosso di grana: se un isolato non ha più un
lotto, `findLot` lo salta senza percorrerne le colonne. Il commento che lo
descrive è ancora lì, orfano del proprio campo, in
[Builder.ts:272-283](src/world/buildings/Builder.ts#L272-L283): il concetto
esisteva ed è stato tolto. Va rimesso con la stessa invalidazione di `forget()`.

*Atteso:* nel nucleo maturo la ricerca degenera da 10.000 colonne a 25 isolati.

**1.3 — Non allargare il raggio quando il primo anello fallisce.**
`blockSearchRadius: 2` è un tetto di costo, non una regola urbana. Se l'isolato
d'origine e i suoi otto vicini sono pieni, camminare fino al quinto anello serve
solo a trovare un lotto dove la desiderabilità non lo voleva. Vale la pena
misurare quanti lotti nascono davvero oltre il primo anello: se sono pochi, il
raggio si stringe e il caso peggiore si divide per quattro.

*Attenzione:* questa **cambia la città generata**. Va decisa, non fatta di
soppiatto, e le impronte digitali della grammatica cambieranno.

## Fase 2 — dare un budget al tick

Anche risolta la fase 1, resta il principio: nessuna passata deve poter sfondare
il frame. La simulazione è a passo fisso e non si può saltare un tick senza
cambiare la partita — ma **le passate del `Builder` non sono la simulazione**:
sono già cursori a cadenza propria, e `onTick` le chiama una dopo l'altra senza
guardare l'orologio.

- **`buildPass` diventa riprendibile.** La ricerca dei siti tiene il proprio
  punto e riprende dal frame dopo, come fa `generator.step(budget)`. Il ritmo
  con cui la città cresce resta quello di `ticksPerBuild`; a cambiare è solo il
  frame in cui il lavoro atterra.
- **`onTick` riceve un budget** e ferma la coda delle passate quando l'ha speso,
  riprendendo dalla successiva al tick dopo. Le passate hanno già cadenze
  diverse: rimandarne una di un tick non cambia nulla di osservabile.

## Fase 3 — sfasare le cadenze

Una riga per passata, nessun rischio: `(tickCount + offset) % N === 0` con un
offset distinto per ciascuna. Oggi al tick 40 partono insieme costruzione,
promozioni, landmark, porto, arcologie, campate, guide e campagna. Sfasate, lo
stesso lavoro si distribuisce su otto tick diversi e il picco si abbassa senza
che nessuno faccia meno.

## Fase 4 — il resto, quando le prime tre sono in porto

- **`densestColumn`** in [growthScene.ts:1199](src/game/growthScene.ts#L1199)
  scorre tutti i record e per ciascuno chiama `countWithinRadius`, a ogni tick.
  Oggi è 0,7–1,4 ms, ma cresce col quadrato della città: viola la regola 2 anche
  se non si sente ancora. Basta ricalcolarla a cadenza invece che a ogni tick.
- **`BuildingRegistry.at()`** costruisce un array e lo filtra a ogni chiamata;
  `topOf`, `supportAt` e `overlaps` ci passano in ciclo. Stessa medicina della
  fase 0: scorrere gli id senza materializzare.
- **`aerialDriver.deckColumns`** usa ancora chiavi di testo
  ([aerialDriver.ts:153](src/world/buildings/aerialDriver.ts#L153)), ed è
  interrogato da dentro `lotIsFree`. Va convertito a `columnKey`.
- **Autosave** ogni 20 s serializza l'intero registro sul main thread
  ([main.ts:1749](src/main.ts#L1749)). Non è il problema dei 3–4 secondi, ma è
  l'hitch grosso e raro che si sente sopra tutto il resto. Da misurare, e se
  costa, da spezzare.
- **`spans.pass`** a 15–27 ms ogni 2 s è il secondo elenco della tabella: dopo la
  fase 1 diventa la voce più alta rimasta.

## Fase 5 — rendere la misura permanente

Finché il costo non è in un test, torna. Il posto giusto c'è già: `npm run bench`
raccoglie `src/**/*.bench.ts`, accanto a `sim.bench.ts` e `greedyMesher.bench.ts`.

Serve un `tickProfile.bench.ts` che faccia maturare una città con un seme fisso e
riporti **contatori deterministici**, non solo millisecondi:

- colonne lette per ricerca di lotto;
- prove di quadrato per passata di costruzione;
- millisecondi per passata, come indicazione.

I contatori sono la parte che conta: su questa macchina girano più agenti insieme
e il tempo di parete oscilla di 2,5× fra una run e l'altra, mentre il numero di
colonne lette è identico a parità di seme. Un rosso su un contatore è un rosso
vero; un rosso sui millisecondi è quasi sempre la CPU occupata da qualcun altro.

## I budget da difendere

| Misura | Obiettivo | Accettazione |
| --- | --- | --- |
| Lavoro non-render per frame | 3 ms | 4 ms (già in `AGENTS.md`) |
| Costo di una passata del `Builder` | < 4 ms | mai oltre un frame a 60 fps |
| `tickMs` medio | < 2 ms | p99 < 8 ms |
| Colonne lette per ricerca di lotto | < 2.000 | < 5.000 |
| Crescita col numero di edifici | nessuna voce super-lineare | — |

## Ordine di lavoro

1. **Fase 1.1** — memo delle colonne non libere, con l'invalidazione delle
   prenotazioni e il test di città identica. È il singolo intervento che sposta
   di più.
2. **Fase 5** — il bench con i contatori, subito dopo: serve a dimostrare 1.1 e a
   difendere tutto il resto.
3. **Fase 3** — lo sfasamento delle cadenze, che costa una riga per passata.
4. **Fase 1.2**, se 1.1 non è bastato.
5. **Fase 2**, che è la sola che rende il difetto impossibile invece che raro.
6. **Fase 4**, a scalare.

La **fase 1.3** resta fuori dall'ordine perché è una decisione di gioco, non di
prestazioni: va portata a chi decide come deve crescere la città.
