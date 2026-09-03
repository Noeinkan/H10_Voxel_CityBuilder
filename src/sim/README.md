# src/sim

Simulazione a tick, senza rendering. Tiene risorse e popolazione, calcola un
campo di desiderabilità per cella e per **uso urbano**, e dice dove crescerebbe
il prossimo edificio e con quali usi. **Non costruisce niente**: espone lo stato
e le decisioni, e chi costruisce sta fuori da questa cartella.

Gli usi urbani sono quattro — residenziale, commerciale, industriale, civico — e
sono indici densi in quest'ordine. Uffici, turismo, ricerca, logistica,
intrattenimento e agricoltura non sono usi ma **specializzazioni**: aggettivi che
si posano su un uso già deciso e servono a chi sceglie la forma degli edifici.
L'ultima è l'unica che cambia anche il bilancio, ed è una deroga dichiarata.

I **produttori di cibo** sono invece contatori a parte (`farmCounts`), non un
quinto uso: campi e frutteti non sono edifici e vivono nel mondo, la torre
idroponica è un edificio industriale che conta due volte. Nessuno dei tre entra
nel campo di desiderabilità — un produttore di cibo compete per la **terra**.

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
| [districts.ts](districts.ts) | Profilo locale, distretti e specializzazioni emergenti dalla sovrapposizione; `specializationGapsOf` legge la stessa regola all'indietro e dice cosa manca |
| [commerce.ts](commerce.ts) | Il ciclo commerciale interno: domanda, organico, merce, ricavi |
| [farms.ts](farms.ts) | I tre produttori di cibo, il listino in case sfamate e il referto del raccolto |
| [flows.ts](flows.ts) | Da dove vengono i fondi di un tick e dove vanno: referto derivato, non un accumulo |
| [materials.ts](materials.ts) | Flussi dei materiali, capacità dei livelli e curva dei costi verticali |
| [decisions.ts](decisions.ts) | Decisioni periodiche e alternative deterministiche |
| [charters.ts](charters.ts) | Mandati lasciati dalle decisioni: uno slot per famiglia, permanenti |
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
  del suo raggio (raggio 20 → 1681 celle), un edificio nuovo il quadrato del
  raggio breve. Non esiste una passata sull'intera mappa. Il quadrato regge
  anche con l'influenza geodetica, perché un passo non costa mai meno di una
  cella: la forma non può uscirne.
- **La simulazione non tocca `blocks`.** L'unica scrittura verso il mondo è
  `writeDesirabilityData`, che va in `VoxelWorld.data` e quindi non marca sporco
  niente e non invalida una mesh.
- **Lo stato è serializzabile in JSON senza perdita.** `toSimStateData` dà dati
  puri, `reviveSimState` li rilegge; il campo non si serializza perché è
  ricostruibile per intero da catalizzatori, edifici, policy **e costo di
  attraversamento**. Quest'ultimo non sta nei dati salvati: `reviveSimState` lo
  riprende come secondo argomento, e ometterlo dà una città identica su
  un'isola piatta.

## Come si calcola la desiderabilità

Per ogni cella e ogni uso:

```
D = clamp(Σ contributi × pesoPolicy − congestione, 0, 255)
contributo = strength × influenza[uso] × falloff(dist / radius)
congestione = edifici entro congestionRadius × congestionPerBuilding
```

A distanza pari al raggio il contributo è **esattamente 0**, e al centro vale
**esattamente `strength`** per gli usi che il ruolo porta a pieno — quest'ultimo
perché i quattro pesi base di desiderabilità valgono 1 in `balance.ts`, di
proposito, e ogni ruolo ha almeno un'influenza pari a 1.

**`dist` è geodetica, e la calcola [reach.ts](reach.ts)**, che è l'unico posto
in cui vive la curva `falloff`. L'influenza si propaga sulle celle percorribili
invece che in linea retta: l'acqua la ferma, un dirupo la rallenta, una strada
la porta più lontano. I costi stanno in `BALANCE.reach`, li legge
[../world/reachCost.ts](../world/reachCost.ts) — l'unico posto da cui terreno e
strade si vedono insieme — e la simulazione riceve una funzione, non il mondo.

Prima erano tre copie della stessa formula: qui, in `urbanProfileAt` per i
distretti, e in `poleReach` per **l'altezza degli edifici**. Adesso è una sola,
e il centro della desiderabilità non può più cadere in tre punti diversi.

**Con costo uniforme la geodetica è esattamente la Chebyshev di prima.** Un
passo diagonale copre 1 su entrambi gli assi allo stesso prezzo, quindi il
minimo numero di passi verso `(dx, dy)` è `max(|dx|, |dy|)`. Non è un dettaglio
implementativo: è ciò che rende il cambio una generalizzazione stretta, e ciò
che tiene verdi senza modifiche i test scritti sulla forma di prima.

**Il costo di un passo non scende mai sotto 1**, ed è un vincolo, non una
taratura: la distanza geodetica resta perciò almeno quella di Chebyshev, e la
forma non esce mai dal quadrato che il campo ricalcola. Una strada quindi non
costa *meno* di 1 — a costare di più è tutto il resto, e la strada vince in
termini relativi.

**Il raggio è quindi un budget di cammino, non una distanza in linea d'aria.**
Fuori strada un passo costa `reach.land`, quindi nel tessuto un raggio `r`
arriva a circa `r / land` celle; i raggi dei ruoli sono tarati su questo. Il
primo quarto che hanno preso era proprio quella conversione — l'inverso esatto
di `land = 1.25` — per far coprire alla città lontano dalle strade quanto
copriva quando la distanza era in linea retta. Lungo la pavimentazione invece il
budget si spende a costo pieno, e quel quarto in più resta tutto: è lì che la
portata guadagna, non nel tessuto.

Il **secondo** quarto non è una conversione ma una scelta di forma urbana: sopra
la soglia di sito un mercato teneva una trentina di colonne di raggio nel
tessuto su un'isola larga 512 — non copriva nemmeno il proprio settore
d'espansione, che ha il mezzo lato a 64 — e la città cresceva a macchie che non
si toccavano. È lo stesso quarto per tutti e diciannove i ruoli,
quindi la gerarchia fra loro non cambia, e porta il gruppo identità oltre il
centinaio (85–92 → 106–115). Ha però un effetto che il bordo non racconta: il
decadimento è lineare in `dist / radius`, perciò un raggio più largo a intensità
ferma **alza il campo in ogni cella che stava già dentro**, e il pianoro dove
due sfere si sovrappongono satura a 255 su un'area più ampia. Se la gerarchia
degli usi si appiattisce nel nucleo, la manopola è `influence`, non il raggio.

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

Ogni 900 tick, dopo la prima finestra di 450, lo stato apre una decisione con
tre alternative. La decisione resta sospesa finché il giocatore sceglie e gli
effetti sono dati serializzabili derivati dallo stato, senza casualità globale.

La scadenza è però un intervallo, non una memoria: da sola riapre una condizione
vera finché resta vera. L'emergenza alimentare porta perciò un **fronte**
(`supplyArmed`), che risolverla abbassa e solo un raccolto tornato in pareggio
rialza — altrimenti una carestia cronica coprirebbe per sempre le altre due
famiglie, dato che il ramo del cibo esce per primo.

### Il segno che una decisione lascia

Le risorse sono metà della conseguenza. L'altra metà è il **mandato**
(`charters.ts`): un vettore spaziale con la stessa forma di quello delle policy,
che entra in `urbanProfileAt` e quindi cambia forma e tipologia di ciò che
cresce dopo. Alcune alternative concedono in più un'**opera** — un catalizzatore
a forza e raggio ridotti, posato subito sul terreno dal `Builder`.

I mandati sono **permanenti ma esclusivi per famiglia**. Le tre famiglie di
decisione — approvvigionamento, spazio pubblico, investimento — tengono uno slot
ciascuna, e una nuova scelta della stessa famiglia sostituisce la precedente
invece di sommarcisi; l'alternativa «tenere la piazza libera» svuota lo slot.

Il tetto è quindi strutturale, tre vettori attivi al massimo, e non serve una
scadenza a tick. È la scelta importante: `urbanProfileAt` è una funzione
**spaziale**, e farle leggere `tickCount` significherebbe che lo stesso stato
produce edifici diversi a seconda di quando lo si guarda. La città porta addosso
l'ultima scelta di ogni famiglia, non la somma di tutte.

Un mandato viaggia sul suo **portante** — l'uso urbano che lo trasporta — quindi
si sente dove quell'uso c'è e non altrove: un mandato industriale non tocca un
quartiere che di industria non ne ha. `LocalUrbanProfile.charters` elenca quelli
percepiti sulla colonna, ed è ciò che le tipologie leggono: quattro righe di
`world/buildings/config/typologies.ts` sono concesse da un mandato e senza quello non
compaiono affatto.

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

## Materiali e crescita verticale

`state.materialFlows` è il rendiconto dell'ultimo giro: industria in entrata;
manutenzione, negozi, export e cantieri in uscita. Porta anche la riserva e il
prezzo del cantiere meno caro rimasto in attesa, così l'HUD può distinguere una
fabbrica spenta da una produzione interamente assorbita.

La riserva vale `buildings × reservePerBuilding`. Manutenzione, negozi ed export
non la consumano; i cantieri sì. Per questo lo stock può scendere mentre la città
sale, poi l'industria lo ricostituisce prima che il commercio torni a vendere il
surplus. Terrazze, funivie e fondazione dell'arcologia passano dalla stessa
operazione e compaiono tutti sotto `construction`.

I livelli non moltiplicano la resa uno a uno. `capacityAtLevel` aggiunge 0,25 per
livello fino a un massimo di quattro edifici base: una torre conta di più, ma non
rende inutile costruire un quartiere. Il tessuto fino al livello 6 cresce senza
materiali; dal livello 7 parte una curva quadratica. È lì che la forma diventa
economia: senza industria il centro arriva al tessuto medio, ma non finanzia i
grattacieli che attraversano le nuvole.

## Il bilancio dei fondi, voce per voce

`state.flows` è un `FundsReport`: tasse, incasso dei negozi, saldo del commercio
esterno da una parte; servizi civici, policy e torri idroponiche dall'altra, più
`paid` — quanto degli oneri si è **davvero** potuto pagare, che a cassa vuota è
meno della somma nominale ed è ciò che lascia i servizi scoperti.

Ha la stessa natura di `commerce`, e per la stessa ragione vive accanto a lui:
**è derivato dal tick, non accumulato**, quindi ricostruirlo non richiede storia
e `tick` resta puro. I numeri non sono un secondo conto — sono esattamente
quelli che il tick già calcolava per il saldo e poi buttava via, ed è questo a
garantire che la scomposizione mostrata dall'HUD non possa divergere dal
`funds.delta` scritto accanto (`flows.test.ts` lo verifica su quaranta tick).

Esiste perché «perché sto perdendo denaro» non aveva risposta: un saldo netto
dice di quanto, non di chi è la colpa, e con sei voci in gioco un numero solo non
indica nessuna azione da fare.

Un edificio **a uso misto** ha un uso primario e un secondo uso che ne porta
`mixedUse.secondaryShare` di capacità economica. La capacità primaria e quella
secondaria stanno in `capacityCounts` e `mixedCapacityCounts`, perché il livello
non deve trasformare `buildingCounts` in un conteggio frazionario. Nasce dove due campi
compatibili superano insieme le loro soglie — la seconda ridotta, perché il
secondo uso è ospite — e non è una zona: resta un volume, una cella occupata,
una riga fra i candidati. `buildingCounts` lo conta sotto il primario e
`mixedCounts` sotto il secondo; la somma delle due tabelle non è il numero di
edifici, ed è giusto così. Si incontrano in un punto solo, la capacità efficace
che il bilancio legge.

## Proprietà del campo e proprietà dello stato

`tick` è puro, ma le operazioni del giocatore no: `addCatalyst`, `addBuilding`,
`removeBuildings`, `setPolicyActive` aggiornano il campo **in place** e
restituiscono un nuovo oggetto stato che ne prende possesso. Lo stato precedente
non va più usato — è la stessa regola di un buffer trasferito, ed è ciò che
permette l'aggiornamento incrementale senza clonare il campo a ogni piazzamento.

## Togliere edifici

`removeBuildings` è l'inverso di `addBuilding`, e «inverso» è il requisito:
toglierne N deve dare lo stesso campo di non averli mai aggiunti, byte per byte.
L'equivalenza fra percorso incrementale e `rebuild` è la proprietà su cui poggia
tutto il modulo, e varrebbe in una direzione sola se la rimozione lasciasse
residui di congestione o di occupazione. Un test la verifica in entrambi i versi.

La simulazione **non demolisce da sola**: questa è la porta da cui il costruttore
dichiara che qualcosa non c'è più, come `addBuilding` è quella da cui dichiara che
qualcosa è stato eretto. La chiamano il cantiere di un landmark, la gomma del
giocatore e — da qui — l'abbandono, ma qui non c'è niente che sappia cosa sia un
landmark (invariante 7): il declino **propone** e chi ha il registro in mano
decide.

**Non c'è una penalità scritta apposta, ed è deliberato.** Meno edifici
residenziali vuol dire meno `capacity`, quindi un'occupazione sopra uno, quindi il
`crowdingPenalty` che il bilancio applica già; meno civico e meno commercio
abbassano soddisfazione e servizio per la stessa strada. Il costo di uno
sventramento è il bilancio che c'era.

## Copertura dei servizi e declino

`coverageAt` risponde quanto una colonna è **servita**, fra zero e uno, sommando
due metà di natura diversa. Una quota **cittadina**, uguale su tutta la mappa,
che viene dai servizi posati — pesati per la loro influenza civica, la stessa
colonna della tabella con cui il campo dipinge — più gli edifici civici cresciuti
attorno, pesati per la quota di manutenzione che i fondi coprono. E una quota
**locale**, che è il piano civico del campo diviso per `coverage.localFull`,
quindi con decadimento geodetico: lungo le strade arriva lontano, dietro una
collina no.

**Perché il pavimento è a metà.** A uno, la città si curerebbe da sé e le azioni
del giocatore tornerebbero a essere solo acceleratori. A zero, un quartiere
lontano da ogni servizio cadrebbe a zero e il declino diventerebbe una spirale.
Con `cityShare` a metà il pavimento tiene in piedi la città mentre nessuno
guarda, e a chiudere il divario è solo chi posa un servizio.

**Perché un servizio posato vale otto edifici civici.** È misurato, non tarato a
occhio: sotto un catalizzatore residenziale forte gli edifici civici **non
nascono affatto**, perché `nextBuildSites` dà la cella all'uso che ci prende il
punteggio più alto e il residenziale satura per primo. Una copertura che
dipendesse solo da loro varrebbe zero in ogni partita.

Il **fronte**, `decayPressure`, è l'unica parte che ha una memoria, e ha **tre**
andature: sale in `tick` sotto `decay.strainCoverage`, rientra in fretta sopra
`decay.recoveryCoverage`, e fra le due rientra piano. Il declino deve essere
*lento* — tre minuti di scoperto continuo prima che il primo edificio se ne vada —
ed è la lentezza dell'accumulo, non una banda ferma, a impedire che una città che
oscilla intorno al pareggio accenda e spenga l'allarme a ogni edificio nuovo.

**Fra le due soglie la pressione restava ferma, ed era un fermo e non un fronte.**
Una città risalita al 105% non poteva più rientrare: il 110% era l'unica uscita,
niente glielo diceva, e nel frattempo `buildPass` non fondava più niente. Adesso
la banda restituisce con lo stesso passo con cui ha preso (`pressureEase`), e
posare il servizio che porta oltre `recoveryCoverage` resta tre volte più rapido:
il gesto che risolve si distingue da quello che tiene soltanto la linea.

L'isteresi che serviva davvero vive in `decay.pressureCeiling`: la pressione sale
**oltre** il punto in cui il fronte si arma, e quell'eccesso è il debito da
restituire prima che l'allarme si spenga. È la forma di un trigger di Schmitt —
due livelli sull'*uscita*, non una zona morta sull'*ingresso* — e a differenza
della banda congelata non ha uno stato da cui non si esce.

`isDistressPossible` risponde alla domanda che l'avviso sbagliava: un fronte
armato ferma **sempre** la crescita, ma porta via edifici solo se la quota
cittadina è scesa sotto `decay.distressCoverage`, cioè sotto il 40% di copertura.
Sopra, il pavimento tiene ogni colonna e non si svuota niente — dirlo lo stesso
era la metà falsa di un avviso che il giocatore leggeva accanto a un numero che
lo smentiva.

`nextDecaySites` dice **chi** sta in un posto che non lo regge più, camminando
`state.buildings` da un cursore: è lo speculare di `UpgradeDriver`, non di
`nextBuildSites`, perché fondare deve cercare celle vuote mentre gli edifici sono
già un elenco. Risponde sempre, anche a pressione zero — la lista è l'avviso prima
di essere l'ordine — e non sa cosa non si abbandona: a filtrare landmark,
arcologie e chi regge un impalcato è chi ha il registro del mondo.

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

Due relazioni da conoscere. `weights.commercialCapacity` vale
`weights.residentialCapacity`: un edificio commerciale serve esattamente un
edificio residenziale pieno. E il listino agricolo è in **case sfamate** — un
campo ne sfama due, un frutteto una, una torre idroponica sei — dove una casa
piena mangia `FOOD_PER_HOUSE`, che è il prodotto `residentialCapacity *
food.perResident` e non un numero scritto a mano. Sono le due relazioni che
rendono leggibile un bilancio a colpo d'occhio; la prima si rompe cambiando un
valore senza guardare l'altro, la seconda no, perché è derivata.

**Il cibo non esce più dall'industria.** Fino alla 3.1 la fabbrica produceva cibo
e materiali dallo stesso termine, e il cibo non aveva un posto sulla mappa. Ora ha
tre produttori con un costo in terra — campi, frutteti, torri idroponiche — che il
mondo dichiara con `addFarm`, e la fabbrica fa solo materiali. Una torre è un
edificio industriale con `specialization: 'farming'`: conta come industria per il
suolo che occupa e come produttore per ciò che raccoglie, quindi convertire una
fabbrica in torre è un vero scambio fra materiali e cibo.

### I due numeri che il cibo consegna fuori

`missingPlotsFor` dice **quanti campi mancano**, e `fedShareOf` **quanto della
domanda è stata servita**. Sono le due domande che nessun altro può rispondersi
da solo, e vivono qui per la stessa ragione del referto: il listino sta qui.

Attraversa il confine solo la risposta: `missingPlotsFor` prende lo stato e legge
da sé la popolazione, i contatori e l'**organico**. Non è un dettaglio di firma —
il driver passava un `1` scritto a mano, cioè stimava il raccolto su un'aritmetica
diversa da quella con cui `tick` lo calcola davvero, e una città a 0,8 di organico
ne raccoglieva 0,8 credendosi in pareggio. Quale organico usare è una scelta della
simulazione, che sa cosa ne farà; `missingPlotsOf` resta l'aritmetica sotto, dove
i test la interrogano a organico scelto.

Contano perché tutte e due erano state chieste male. Chi pianta riceveva il cibo
mancante e lo riduceva a un booleano, quindi piantava sempre lo stesso numero di
lotti — un'offerta a ritmo costante contro una domanda che cresce con la città, e
le due divergevano dal primo isolato. Chi giudica chiedeva invece il segno di
`food.delta`: ma nessuno stock scende sotto zero *per costruzione*, quindi una
dispensa esaurita si ferma a zero e il delta vale **esattamente** zero. Una
carestia stabile e un pareggio scrivevano lo stesso numero, e la città moriva di
fame senza che niente lo dicesse.

Lo stesso errore, in una terza forma, teneva accesa l'emergenza alimentare: si
apriva sotto una **scorta** in dispensa, ma `missingPlotsOf` punta al pareggio e
non a una scorta, quindi una città sfamata tiene lo stock a zero per costruzione
e la condizione non poteva spegnersi — misurati 9000 tick su 9000 con la
condizione vera. `fedShareOf` è la domanda giusta per aprirla; per **chiuderla**
non basta, perché conta i pasti e i pasti li paga anche la dotazione appena
concessa: l'allarme si riarmava sulla propria risposta. Il rientro si misura
perciò sul raccolto (`decisions.recoveryCoverage`), che solo chi pianta muove —
più la **portata** del collegamento esterno, non quanto è passato davvero: una
città che compra il proprio cibo l'ha risolto, e senza quel termine non
riarmerebbe mai, quindi il giorno in cui i fondi finissero l'emergenza non
tornerebbe più a suonare.

### Il pareggio secco era il bersaglio sbagliato

`missingPlotsOf` puntava esattamente al pareggio, e la conseguenza si legge solo
guardando la HUD di una città sana: **FOOD 0**. Il raccolto pareggia il pasto e
non avanza niente, quindi non esiste nessuna scorta ad assorbire un lotto ritirato
o un tick di organico basso. Il bersaglio ora è `food.targetCoverage`, e sta
**sopra** `decisions.recoveryCoverage` per contratto: se stesse sotto, piantare
non riarmerebbe mai il fronte e una carestia si potrebbe dichiarare una volta sola
per partita.

Misurato su 9000 tick, città di 3264 abitanti con industria e commercio a contendersi le braccia:

| | prima | dopo |
| --- | --- | --- |
| quota di domanda servita | 0,80 | 1,00 |
| tick con la città affamata | 6478 | 926 (solo l'avvio) |
| scorta in dispensa | 0 | reale |
| campi | 68 | 106 |
| materiali per tick | 161,9 | 150,2 |

I materiali che scendono del 7% non sono un effetto collaterale: sono **il**
prezzo, e va pagato in braccia perché il bacino è uno solo. Una città che non
mangia però non è una città che produce poco, è una città che muore.

### Il commercio esterno è una quota, non una quantità

`trade.importFoodShare` dice quanta della **spesa** un collegamento copre in un
tick. Era una quantità assoluta, e una quantità contro una domanda che vale
`pop × food.perResident` sbaglia da tutte e due le parti: un porto copriva il 667%
della spesa a 240 abitanti — la campagna non serviva — e il 4,9% a 3268, cioè era
decorativo. Resta comunque un supplemento: porto e aeroporto insieme, con la
priorità sul cibo, arrivano al 55%, e il cibo continua a competere per la terra.

Stessa forma per la dotazione dell'emergenza, che si conta in `decisions.reliefTicks`
— **tick di respiro** sulla spesa vera. Una quantità non dice quanto tempo compra:
cento tick di consumo, misurati a schermo, sono dieci secondi, e in dieci secondi
non si pianta niente.

## Scena di debug

`?debug=1&sim=1` — genera l'isola 256×256, piazza i catalizzatori da script e
consegna alla simulazione un nucleo di 30 edifici (10 residenziali, 6
commerciali, 10 industriali, 4 civici) più 5 campi. Il rapporto che sta in
pareggio è quello fra case e campi — dieci case, cinque campi da due — mentre le
fabbriche servono i materiali e non entrano più nel bilancio alimentare.

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
> proporzionali a quel numero. Anche l'isola è passata da 256 a 512 di lato, e
> il listino dei ruoli ha poi preso un secondo quarto (gruppo identità 85–92 →
> 106–115, cioè 225² celle per modifica dove le misure viste si fermavano a
> 193²). I valori sono quelli di prima dei cambi: vanno rifatti con
> `npm run bench` su questa macchina prima di essere citati.

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

**Cosa ha aggiunto l'influenza geodetica.** Misurato con `npm run bench` su
questa macchina, stessa scena, **a costo uniforme** — la fixture del bench non ha
terreno, quindi il Dijkstra gira su un campo piatto e non pota niente:

| Operazione | Media |
| --- | --- |
| tick | 0,0033 ms |
| modifica di un catalizzatore di raggio 20 | 0,42 ms |
| `nextBuildSites`, primi 10 | 2,0 ms |
| `setPolicyActive` | 8,6 ms |

Due misure a macchina ferma, concordi allo 0,1 ms. La prima presa mentre altri
agenti giravano sullo stesso repo dava 0,48, 4,3 e 12,5 — fino al doppio, sulle
stesse righe. Vale per chi rifà la tabella: sotto contesa di CPU questi numeri
non significano niente.

**Non sono confrontabili con le colonne qui sopra**, misurate su un'altra
macchina: `tick` da solo è passato da 0,0010 a 0,0033 ms senza che il suo codice
cambiasse. Il rapporto che regge il confronto è quello *relativo al tick*, e dice
che il Dijkstra si vede dove deve: `setPolicyActive` è passato da 6420× a 2600×
il costo di un tick, `nextBuildSites` da 4050× a 610×, la modifica di un
catalizzatore da 220× a 127×. Il campo, in proporzione, costa **meno** di prima —
perché la distanza non si ricalcola più per cella e per catalizzatore a ogni
ricalcolo, ma una volta sola quando quel catalizzatore cambia.

`tick` non è toccato, perché continua a non guardare il campo.

Su terreno vero il Dijkstra costa **meno**, non di più: acqua e dirupi tagliano
la coda prima del raggio, e le celle irraggiungibili non vengono mai visitate.
Questa riga va quindi presa come il tetto, non come il caso tipico.

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
