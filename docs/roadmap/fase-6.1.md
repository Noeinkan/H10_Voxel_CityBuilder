# Fase 6.1 — La ricerca dei lotti non cresce con la città

Il ragionamento dietro una sottofase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge. Il testo
viene da `PERFORMANCE.md`, il piano di lavoro che la fase 6 ha assorbito: le
voci ancora aperte di quel piano stanno in radice, sotto le fasi 6.3 e 6.4.

## Dove stava il tempo

Misurato su città matura (177 → 189 edifici, isola 256×256, seme `2555647721`)
con una sonda headless che avvolgeva a runtime ogni passata del `Builder`. Sono i
numeri da cui è partita la sottofase, con l'isola da 256 di lato: la fase 6.2 li
rifà a 512.

| Voce | Cadenza | Costo | Note |
| --- | --- | --- | --- |
| `buildPass` → `findLot` | ogni 10 tick (1 s) | **9–14 ms**, picco 250 ms | prima della 1.1 erano 3–9 s; prima della 1.2, 145 ms di mediana a saturazione |
| `spans.pass` | ogni 20 tick (2 s) | 15–27 ms | |
| `aerial.routePass` | ogni 24 tick (2,4 s) | 12–33 ms | |
| `refreshCoach` | ogni tick | 0,3–1,9 ms | di cui `densestColumn` ~la metà |
| `arcologies` / `farms` / `terracePass` | 20 / 40 / 16 tick | 1–5 ms | |
| `tick()` della simulazione | ogni tick | < 1 ms | non è il problema |
| `builder.step()` (scrittura voxel) | ogni frame | 0,01 ms | già a budget, va bene così |

Il budget dichiarato in [AGENTS.md](../../AGENTS.md) è **3 ms di lavoro
non-render per frame, 4 ms in accettazione**. Prima di questa sottofase
`buildPass` lo sfondava di due o tre ordini di grandezza una volta al secondo:
era il freeze che si vede a occhio.

### Il numero da abbattere

```
27 ricerche di lotto · 1.106.155 colonne lette → 40.969 colonne per ricerca
```

`findLot` cammina radialmente un rettangolo di 5×5 isolati — circa 100×100
colonne — e in un nucleo saturo non trova niente, quindi lo percorre tutto.
`buildRound` chiede fino a `sitesPerBuild × candidateOverfetch` = 12 candidati e
per ciascuno rifà il giro. **Il costo cresce con l'area satura, cioè con la
città**: era la sola voce dell'elenco senza un tetto.

## Chiave di colonna numerica

`columns`, `groundColumns`, `buckets` del registro e la blacklist del `Builder`
non allocano più una stringa a interrogazione: `columnKey` in
[chunkCoords.ts](../../src/world/chunkCoords.ts) le impacchetta in un intero
piccolo. A/B isolato: **2,51×** sulla sola lettura, circa 9 ms per `buildPass`.
Reale ma marginale — il 5% del problema, e va detto.

### Provato e scartato: il memo dell'ancora dentro `placeLot`

L'ipotesi era che il ciclo sulle misure d'impronta riscandisse l'anello otto
volte. Il contatore dice che fa una passata sola, e che `lotIsFree` esce già alla
prima colonna occupata: il memo non faceva mai centro e aggiungeva il 7% di
letture. Rimosso. Se torna la tentazione, il dato è: senza memo 509.134 prove di
quadrato e 925.849 colonne; con memo 66.267 prove, 509.134 sonde e 992.116
colonne.

## Memo delle colonne non libere, per passata

[`lotMemo.ts`](../../src/world/buildings/lotMemo.ts) tiene due cose per la sola
durata di `buildPass`: le colonne che `lotIsFree` ha già bocciato, e i rettangoli
in cui un lato non sta più da nessuna parte. **Il guadagno misurato viene quasi
tutto dalla prima**: in un nucleo saturo la stessa colonna la sondano decine di
quadrati diversi, e la risposta è sempre la stessa. Il rettangolo esaurito scatta
di rado — sei o otto volte per infornata a 351 edifici — ma è l'unico argine al
caso peggiore, e vale perché `placeLot` percorre **tutto** il rettangolo mentre
il candidato ne cambia solo l'ordine: se un lato non stava da nessuna parte per il
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

*Comportamento:* la città generata è identica, e da allora lo dice un test —
[`cityDigest.test.ts`](../../src/world/buildings/cityDigest.test.ts) fissa
l'impronta di una città matura a parità di seme, come `generateDigest.test.ts` fa
per la sagoma di un singolo edificio.

## Memo dell'isolato pieno

Complementare al precedente e più grosso di grana. Il memo per passata aveva già
la struttura giusta — il rettangolo esaurito, cioè «per questo isolato d'origine
e questo lato non c'è posto da nessuna parte» — ma la buttava via a ogni
infornata insieme alle colonne bocciate. Il fatto invece **vale più a lungo della
passata**: se un lato non stava da nessuna parte per la prima infornata non ci sta
nemmeno per la seconda, a meno che nel frattempo qualcuno non abbia liberato del
suolo.

Il rettangolo esaurito è quindi uscito da `LotMemo` ed è diventato `BlockMemo`,
nello stesso file, che sopravvive alle infornate. Il `LotMemo` resta quello che
era, per le sole colonne bocciate: due memorie, due scadenze, un fatto per casa.

**L'invalidazione è un'epoca, e non tre ganci.** L'epoca somma contatori monotoni
— `BuildingRegistry.vacated` (una prenotazione rilasciata, un record tolto),
`TerrainMap.chunkCount` (terra che arriva dove non c'era isola) e, oggi, anche la
revisione della rete stradale — e `findLot` la mostra al memo prima di ogni
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
| con il solo memo per passata | 7.099 | 48,4 M | 110–125 ms | mediana 145 ms, max 210 ms |
| con il memo dell'isolato | **2.202** | **8,4 M** | **10–12 ms** | **mediana 9,1 ms, max 14,3 ms** |

Nelle sole quaranta infornate a saturazione le colonne lette passano da 5.538.280
a **315.200**, i quadrati provati da 13.553.440 a **496.480**.

*Comportamento:* la città generata è identica, verificata due volte — l'impronta
dell'A/B dentro la sonda, e `cityDigest.test.ts` che non si è mosso.

## Cosa non ha fatto, e perché la fase continua

**Il caso peggiore non è sceso con la mediana.** Resta una passata da
**190–250 ms**, ed è sempre la prima dopo che l'epoca è cambiata. Cade a metà
partita e non alla fine, quindi non si vede nella coda delle misure — ma è un
frame perso. Sono due difetti diversi e la sottofase ne chiude uno solo: il costo
medio è abbattuto, il costo massimo è ancora senza tetto. È la differenza fra un
costo abbattuto e un costo limitato, e il tetto spetta alla fase 6.3.

**Il guadagno è dimostrato ma non difeso.** Le due misure sono state prese con
sonde usa e getta: colonne lette per ricerca e prove di quadrato per passata non
stanno in nessun test, e un cambio che le riportasse su non farebbe diventare
rosso niente. Renderle permanenti è la prima voce della fase 6.2.
