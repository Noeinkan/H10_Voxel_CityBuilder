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
| `buildPass` → `findLot` | ogni 10 tick (1 s) | **9–14 ms**, picco 250 ms | prima della 1.1 erano 3–9 s; prima della 1.2, 145 ms di mediana a saturazione |
| `spans.pass` | ogni 20 tick (2 s) | 15–27 ms | |
| `aerial.routePass` | ogni 24 tick (2,4 s) | 12–33 ms | |
| `refreshCoach` | ogni tick | 0,3–1,9 ms | di cui `densestColumn` ~la metà |
| `arcologies` / `farms` / `terracePass` | 20 / 40 / 16 tick | 1–5 ms | |
| `tick()` della simulazione | ogni tick | < 1 ms | non è il problema |
| `builder.step()` (scrittura voxel) | ogni frame | 0,01 ms | già a budget, va bene così |

La prima riga è quella che le fasi 1.1 e 1.2 hanno abbattuto, sulla stessa città
(seme `2555647721`, 351 edifici): 3–9 s prima del memo dei lotti, 145 ms di
mediana a saturazione con il memo che vive quanto una infornata, **9,1 ms** con
quello che le sopravvive. Resta comunque la voce più alta dell'elenco, resta
fuori dal budget di frame, e il suo **caso peggiore non è sceso con la mediana**:
c'è ancora una passata da 250 ms ogni volta che il mondo libera del suolo. Il
resto del piano serve tutto.

Il budget dichiarato in [AGENTS.md](AGENTS.md) è **3 ms di lavoro non-render per
frame, 4 ms in accettazione**. `buildPass` lo sfondava di due ordini di
grandezza, una volta al secondo, e oggi lo sfonda di due o tre volte — non è più
il freeze che si vede a occhio, è un frame saltato ogni secondo. Quello che si
vede ancora è il picco: la prima infornata dopo che qualcosa ha liberato suolo
rifà la passeggiata intera, e sono duecento millisecondi in un frame solo.

### Il numero da abbattere

```
27 ricerche di lotto · 1.106.155 colonne lette → 40.969 colonne per ricerca
```

`findLot` cammina radialmente un rettangolo di 5×5 isolati — circa 100×100
colonne — e in un nucleo saturo non trova niente, quindi lo percorre tutto.
`buildRound` chiede fino a `sitesPerBuild × candidateOverfetch` = 12 candidati e
per ciascuno rifà il giro. **Il costo cresce con l'area satura, cioè con la
città**: è la sola cosa in questo elenco che non ha un tetto.

Le due fasi del memo l'hanno portato a **2.202** colonne per ricerca sull'intera
partita, e a poche centinaia nelle infornate a saturazione. Il tetto però non è
arrivato: quando il memo cade, la passeggiata è ancora quella di prima. È la
differenza fra un costo abbattuto e un costo limitato, ed è il motivo per cui la
fase 2 resta in piano.

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

**1.1 — Memo delle colonne non libere, per passata. — fatto**
[`lotMemo.ts`](src/world/buildings/lotMemo.ts) tiene due cose per la sola durata
di `buildPass`: le colonne che `lotIsFree` ha già bocciato, e i rettangoli in cui
un lato non sta più da nessuna parte. **Il guadagno misurato viene quasi tutto
dalla prima**: in un nucleo saturo la stessa colonna la sondano decine di quadrati
diversi, e la risposta è sempre la stessa. Il rettangolo esaurito scatta di rado —
sei o otto volte per infornata a 351 edifici — ma è l'unico argine al caso
peggiore, e vale perché `placeLot` percorre **tutto** il rettangolo mentre il
candidato ne cambia solo l'ordine: se un lato non stava da nessuna parte per il
primo candidato, non ci sta nemmeno per l'undicesimo.

È corretto perché **il rifiuto è monotono dentro una passata**, e il memo
memorizza solo il rifiuto: «libera» non si tiene, o due edifici nascerebbero sullo
stesso lotto.

L'invalidazione **non c'è, ed è il punto**. I tre modi in cui una colonna bocciata
torna libera — un cantiere che chiude, una prenotazione di
`BuildingRegistry.reservations` che cade, un impalcato che nasce — accadono tutti
fuori da `buildPass`. Un memo che sopravvivesse al tick dovrebbe agganciarsi a
tutti e tre, e sbagliarne uno vorrebbe dire tenersi bocciato per sempre un lotto
tornato libero. Questo nasce e muore prima che accadano.

*Misurato*, su isola vera (seme `2555647721`, 351 edifici, ultime quaranta
infornate): mediana **da 5.481 ms a 140 ms**, caso peggiore **da 10.185 ms a
200 ms**. Sotto la saturazione — 300 edifici, 150 infornate — le due misure
coincidono: prima di allora le ricerche trovano posto subito e non c'è niente da
ricordare.

*Comportamento:* la città generata è identica, e da adesso lo dice un test —
[`cityDigest.test.ts`](src/world/buildings/cityDigest.test.ts) fissa l'impronta di
una città matura a parità di seme, come `generateDigest.test.ts` fa per la sagoma
di un singolo edificio.

**1.2 — Memo dell'isolato pieno. — fatto**
Complementare al precedente e più grosso di grana. La 1.1 aveva già la struttura
giusta — il rettangolo esaurito, cioè «per questo isolato d'origine e questo lato
non c'è posto da nessuna parte» — ma la buttava via a ogni infornata insieme alle
colonne bocciate. Il fatto invece **vale più a lungo della passata**: `placeLot`
percorre tutto il rettangolo e il candidato ne cambia soltanto l'ordine, quindi
se un lato non stava da nessuna parte per la prima infornata non ci sta nemmeno
per la seconda, a meno che nel frattempo qualcuno non abbia liberato del suolo.

Il rettangolo esaurito è quindi uscito da `LotMemo` ed è diventato
[`BlockMemo`](src/world/buildings/lotMemo.ts), che sopravvive alle infornate. Il
`LotMemo` resta quello che era, per le sole colonne bocciate: due memorie, due
scadenze, un fatto per casa.

**L'invalidazione è un'epoca, e non tre ganci.** `Builder.freedomEpoch` somma tre
contatori monotoni — `BuildingRegistry.vacated` (una prenotazione rilasciata, un
record tolto), `AerialDriver.decksOpened` (un impalcato che nasce sopra un suolo
preso, perché `lotIsFree` lo conta come libero) e `TerrainMap.chunkCount` (terra
che arriva dove non c'era isola). `findLot` la mostra al memo prima di ogni
ricerca; se è cambiata, il memo cade **tutto**. Inseguire quale rettangolo sia
cambiato costerebbe più della passeggiata che risparmia, e sbagliarne uno
significherebbe tenersi bocciato per sempre un lotto tornato libero — che è il
solo modo in cui questa ottimizzazione può rompere la partita senza dirlo.
Ciascun contatore sta accanto alla domanda che invalida, non nel `Builder`: un
quarto modo di liberare suolo dovrà portarsi il proprio, non aggiungere un gancio.

*Misurato*, A/B nello stesso processo sulla stessa isola vera (seme
`2555647721`, 351 edifici, 300 infornate), quattro esecuzioni alternate — i
contatori sono identici a ogni ripetizione, i millisecondi oscillano:

| | colonne per ricerca | quadrati provati | mediana per passata | ultime 40 infornate |
| --- | --- | --- | --- | --- |
| con la 1.1 | 7.099 | 48,4 M | 110–125 ms | mediana 145 ms, max 210 ms |
| con la 1.2 | **2.202** | **8,4 M** | **10–12 ms** | **mediana 9,1 ms, max 14,3 ms** |

Nelle sole quaranta infornate a saturazione — quelle che il piano esiste per
difendere — le colonne lette passano da 5.538.280 a **315.200**, i quadrati
provati da 13.553.440 a **496.480**.

*Comportamento:* la città generata è identica, verificata due volte — l'impronta
dell'A/B dentro la sonda, e
[`cityDigest.test.ts`](src/world/buildings/cityDigest.test.ts) che non si è mosso.

**Quello che la 1.2 non ha fatto, e va detto.** Il caso peggiore non è sceso con
la mediana: resta una passata da **190–250 ms**, ed è sempre la prima dopo che
l'epoca è cambiata. Cade a metà partita e non alla fine, quindi non si vede nella
coda delle misure — ma è un frame perso, e il piano non lo tocca finché non
arriva la fase 2. Sono due difetti diversi e la 1.2 ne chiude uno solo: il costo
medio è abbattuto, il costo massimo è ancora senza tetto.

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
| Colonne lette per ricerca di lotto | < 2.000 | < 5.000 (oggi 2.202) |
| Crescita col numero di edifici | nessuna voce super-lineare | — |

## Ordine di lavoro

1. ~~**Fase 1.1** — memo delle colonne non libere, con l'invalidazione delle
   prenotazioni e il test di città identica.~~ **Fatto**: 39× sulla mediana della
   passata in città satura, e l'invalidazione si è rivelata non necessaria perché
   il memo non sopravvive alla passata. La città generata è identica, e
   `cityDigest.test.ts` lo verifica.
2. ~~**Fase 1.2** — il memo che sopravvive all'infornata.~~ **Fatto**: la mediana
   della passata a saturazione scende da 145 a 9,1 ms, le colonne lette per
   ricerca da 7.099 a 2.202. La città generata è identica. Il caso peggiore però
   non si è mosso, ed è ancora un frame perso ogni volta che il mondo libera del
   suolo.
3. **Fase 5** — il bench con i contatori. Adesso serve più di prima: 1.1 e 1.2
   sono state misurate a mano con due sonde usa e getta, quindi il guadagno è
   dimostrato ma non è difeso. Le due misure che vanno rese permanenti sono le
   colonne lette per ricerca e le prove di quadrato per passata — e sono le
   stesse che le sonde stampavano, quindi il bench non è da inventare, è da
   scrivere una volta invece che tre.
4. **Fase 3** — lo sfasamento delle cadenze, che costa una riga per passata.
5. **Fase 2**, che ora è la voce più promettente di quelle rimaste, e la sola che
   affronta il picco: dopo la 1.2 il costo medio è sotto controllo e quello
   massimo no, ed è esattamente il difetto che un budget per tick rende
   impossibile invece che raro.
6. **Fase 4**, a scalare.

La **fase 1.3** resta fuori dall'ordine perché è una decisione di gioco, non di
prestazioni: va portata a chi decide come deve crescere la città.
