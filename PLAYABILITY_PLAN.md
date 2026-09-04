# Piano — Giocabilità: manutenzione, declino e ritmo

Proposta di **fase 8** per [ROADMAP.md](ROADMAP.md), scritta a parte quando non
era ancora concordata. È ortogonale alla spina dorsale verticale: 4.9 e 4.14
restano aperte e nessuna delle voci qui sotto le tocca o le rimanda.

> **La fase è stata accettata e vive in [ROADMAP.md](ROADMAP.md#L1296).** 8.1,
> 8.2 e 8.4 sono chiuse; resta aperta la 8.3. Questo file è il piano **come è
> stato scritto**, non come è stato costruito: dove le due versioni divergono —
> e divergono, perché scrivere il codice ha corretto il piano in più punti — la
> roadmap è quella giusta. Le caselle qui sotto dicono solo cosa è stato fatto.

## La diagnosi

**La città può solo crescere.** La simulazione è profonda — due catene
economiche che si contendono le stesse braccia, cibo che costa terra, materiali
che finanziano l'altezza, mandati permanenti — ma niente di tutto questo può
**peggiorare in un punto che si possa indicare**. Quando le cose vanno male va
male un numero nella barra in alto; nessun isolato si spegne, nessun edificio se
ne va, nessuna colonna torna libera.

Ne segue il difetto che si sente giocando: le azioni del giocatore
**accelerano**, non **salvano**. Piazzare un catalizzatore fa crescere la città
più in fretta in quel punto; non piazzarlo la fa crescere più piano. Non esiste
una mossa che eviti una perdita, perché non esiste una perdita.

Due tracce dicono che il buco è esattamente questo, e che il resto del codice lo
sta già aggirando:

- `removeBuildings` esiste, è verificato come **inverso esatto** di
  `addBuilding` byte per byte, e ha un solo chiamante — il cantiere di un
  landmark, che sventra per far posto. Non c'è nessun percorso in cui la città
  perda un edificio perché *va male*.
- `cityVitality` calcola già lo sfitto, `1 - homes`, e serve ad **accendere le
  finestre**: una città mezza vuota si legge mezza vuota di notte. Lo sfitto è
  quindi un numero globale che decora, mentre dovrebbe essere un fatto locale che
  minaccia.

Il modello non è «più meccaniche». In SimCity il ciclo non è l'economia, è
**copertura contro degrado**: si piazza un servizio, copre un raggio, e fuori dal
raggio l'isolato si svuota. Manor Lords aggiunge la stessa cosa nel tempo invece
che nello spazio — le stagioni fanno sì che una scorta abbia senso. Cities
Skylines aggiunge la terza: la densità si punisce da sola attraverso la
distanza.

## Fase 8 — La città si può perdere

Obiettivo: che esista una mossa che evita una perdita, e che la perdita si veda
nel punto in cui è avvenuta.

Tre sotto-fasi in ordine obbligato. La 8.1 introduce la perdita, la 8.2 dà al
giocatore la leva per evitarla, la 8.3 e la 8.4 la rendono ricorrente. Ognuna
deve lasciare la città giocabile anche se le successive non arrivano mai.

**Vincoli trasversali.** Sono gli stessi della fase 4 più tre che nascono qui:

- **`src/sim/` non impara la geografia** (invariante 7). La simulazione propone e
  non demolisce: la porta resta `removeBuildings`, chiamata da fuori.
- **Il campo non guadagna un quinto piano** (contratto 10). `CLASS_COUNT` resta
  4; la copertura si deriva dal piano civico che c'è già.
- **`urbanProfileAt` non legge il tempo.** È una funzione spaziale: se leggesse
  `tickCount`, lo stesso stato produrrebbe edifici diversi a seconda di quando lo
  si guarda. Le stagioni entrano in `tick`, che il tempo lo legge già, e non nel
  profilo.
- **Il pareggio non è il bersaglio.** La 3.1 ha già imparato che puntare al
  pareggio secco lascia una città senza margine; ogni soglia qui sotto va tarata
  sopra il punto in cui la condizione si spegne, o l'allarme si riarma sulla
  propria risposta.

### Fase 8.1 — Il declino ha un luogo

Obiettivo: un edificio che sta in un posto diventato invivibile se ne va, e si
vede quale.

*Chiusa.* In costruzione `nextDecaySites` è risultato speculare a `UpgradeDriver`
e non a `nextBuildSites` — cammina `state.buildings` a cursore invece di scandire
il campo — e il fronte è diventato `decayPressure`, un numero in `SimState` con
due soglie e una banda morta. La versione costruita sta in
[ROADMAP.md](ROADMAP.md#L1332).

- [x] Aggiungere `nextDecaySites`, **speculare a `nextBuildSites`**: prende lo <!-- size: L -->
  stato e restituisce gli edifici che il posto non regge più, ordinati dal
  peggiore. Vive in `src/sim/`, non rimuove niente, e non ha bisogno di sapere
  dove sia la costa.
- [x] Far consumare la lista al driver in `src/game/`, che chiama <!-- size: M -->
  `removeBuildings` e `clearVolume` **a passi dentro il budget di frame**, come
  già fa la crescita: uno sventramento non deve poter sporcare mezza isola in un
  tick.
- [x] Dare all'abbandono un **fronte**, come l'emergenza alimentare: una colonna <!-- size: M -->
  liberata non deve poter essere ricostruita e riabbandonata a ogni tick.
- [x] Portare la perdita nell'HUD e nelle cause (7.6): «tre isolati abbandonati» <!-- size: S -->
  con il perché accanto, non un contatore che scende.

**La scelta di progetto che tiene in piedi il resto: il degrado è una proprietà
del posto, non dell'edificio.** L'alternativa ovvia — un contatore di sofferenza
su ogni `Building`, che scende finché l'edificio muore — costa molto più di
quanto sembri: `Building` è serializzato, quindi il formato di salvataggio sale
di versione; il valore va ricostruito al caricamento; e la stessa informazione
va replicata sul `BuildingRecord` del mondo, o `recordStamp` non saprebbe
ridisegnare un edificio degradato e la cattura lo poterebbe insieme a chi ci
poggia sopra.

Chiedendo invece «quali edifici stanno in un posto che non li regge più» la
risposta è **derivata dallo stato a ogni tick**, esattamente come `flows` e come
il referto del raccolto: nessun campo nuovo, nessuna versione di salvataggio,
nessun rischio che il contatore e la realtà divergano. Ed è la stessa forma che
i candidati alla costruzione hanno già, quindi non introduce un secondo modo di
ragionare.

**Resta fuori di proposito: la rovina.** Un edificio che si spegne, si annerisce
e resta lì qualche decina di tick prima di sparire è molto più leggibile di uno
che svanisce, e la grammatica saprebbe già farlo — basterebbe spegnere gli
accenti `luminous`. Ma quello **è** uno stato per edificio, con tutto il conto
scritto sopra. Va fatto dopo, sapendo che si paga una versione di salvataggio, e
non infilato qui perché sembra un dettaglio grafico.

**Gate:** una città lasciata senza servizi perde edifici in un punto che il
giocatore può indicare, e riprendersi è possibile; il campo dopo un abbandono è
identico a quello di una città che quell'edificio non l'aveva mai costruito.

### Fase 8.2 — I servizi devono stare al passo

Obiettivo: che almeno un catalizzatore smetta di essere un bonus e diventi una
manutenzione.

*Chiusa.* **La domanda aperta qui sotto è stata decisa, e la risposta non è
quella consigliata:** la copertura ha due metà, una quota cittadina uguale
ovunque che fa da pavimento e una quota locale letta dal piano civico. Il motivo
sta nel fatto tecnico che il paragrafo in fondo già annunciava — sotto un
catalizzatore residenziale forte gli edifici civici non nascono affatto — più uno
trovato costruendo: a pavimento zero un quartiere lontano da ogni servizio cade a
zero e il declino diventa una spirale. Il conto per esteso sta in
[ROADMAP.md](ROADMAP.md#L1383).

Oggi gli otto ruoli sono tutti facoltativi: aggiungono desiderabilità, e non
averli significa crescere più piano. Nessuno è necessario, quindi la toolbar è
un menu di acceleratori.

- [x] Dare al residenziale una **domanda di copertura** che cresce con la <!-- size: L -->
  popolazione, e leggere la copertura dal **piano civico del campo che esiste
  già**: coperto vuol dire desiderabilità civica sopra soglia su quella colonna.
  Zero memoria in più, nessun piano nuovo per chunk.
- [x] Far entrare lo scoperto in `nextDecaySites` come primo motivo di declino, e <!-- size: M -->
  nella soddisfazione come penalità locale prima di arrivare all'abbandono.
- [x] Mostrare la copertura come vista di ispezione, riusando le cinque che <!-- size: M -->
  4.11 e 4.13 hanno già messo in mano al giocatore.
- [x] Tarare il listino in `balance.ts` e **rimisurare a mano** le tabelle di <!-- size: M -->
  `README.md` e `src/sim/README.md`: si tocca `balance.ts`, quindi non si
  aggiornano a occhio.

**Una domanda aperta da decidere prima di scrivere.** La copertura può venire
solo dai catalizzatori che il giocatore posa, o anche dagli edifici civici che
crescono da soli. Consiglio **solo dai catalizzatori**: è l'unica delle due che
mette il giocatore nel ciclo, ed è coerente con la visione — non disegna ogni
edificio, ma la rete dei servizi sì. Se la copertura arrivasse anche dal civico
automatico, la città si curerebbe da sé e saremmo tornati a guardarla crescere.
C'è però un fatto tecnico da conoscere: oggi gli edifici nel campo **solo
sottraggono** (congestione), non aggiungono desiderabilità, quindi la seconda
opzione non è gratis nemmeno volendola.

**Gate:** una città che cresce senza che il giocatore aggiunga servizi si ferma e
poi arretra; la stessa città con i servizi al passo continua. Le due partite
partono dallo stesso seed.

### Fase 8.3 — La congestione diventa geografia

Obiettivo: che densificare abbia un prezzo spaziale, senza simulare un solo
veicolo.

[reach.ts](src/sim/reach.ts) calcola già distanze **geodetiche** con costi di
attraversamento per cella, letti da `world/reachCost.ts` — l'unico posto da cui
terreno e strade si vedono insieme — e una strada costa meno del tessuto. Basta
far salire il costo delle celle di carreggiata con la densità costruita accanto:
un quartiere che si infittisce diventa **lontano** da tutto, i campi che lo
raggiungevano si accorciano, la desiderabilità cala e la crescita si ferma —
finché non arriva un catalizzatore di trasporto o una linea in quota.

È il ciclo del traffico di Cities Skylines senza un veicolo e senza pathfinding.
Non collide con `src/world/traffic/`, che è un'altra cosa: lì barche e aerei sono
**pose in funzione del tempo** per il colpo d'occhio, e non sanno niente di
carichi.

- [ ] Aggiungere a `reachCost` un termine di densità costruita, mantenendo il <!-- size: L -->
  vincolo che **un passo non costa mai meno di 1**: la geodetica resta almeno la
  Chebyshev e la forma non esce dal quadrato che il campo ricalcola.
- [ ] Invalidare la cache geodetica **a scaglioni**, non a ogni edificio: il <!-- size: M -->
  precedente è già nel repo — `GrowthScene` rifà le rotte ogni sessantaquattro
  edifici, ed è lo stesso segnale.
- [ ] Misurare l'A/B come ha fatto la 4.2 — worktree sul commit precedente, <!-- size: M -->
  esecuzioni alternate — perché qui si tocca il percorso caldo del campo.

**Il costo vero è l'invalidazione, non il termine.** La distanza geodetica si
calcola una volta per catalizzatore e si tiene in cache; un costo che cambia con
la città rende stale ogni catalizzatore che arriva in quell'area. È la ragione
per cui questa sotto-fase viene terza e non prima: senza gli scaglioni,
`setPolicyActive` e la modifica di un catalizzatore — già a 8,6 e 0,42 ms — si
moltiplicano per il numero di edifici costruiti.

**Gate:** un quartiere denso senza trasporto rallenta in modo osservabile, e un
catalizzatore di trasporto lo rimette in moto; i budget della fase 6 reggono con
la misura A/B in mano, non a occhio.

### Fase 8.4 — Il ritmo

Obiettivo: che una scorta abbia senso.

*Chiusa.* Il moltiplicatore è un **seno** e non quattro gradini — media annua
esattamente uno, così chi pianta continua a dimensionare la campagna su un numero
onesto — e l'ampiezza è tarata contro `food.targetCoverage` invece che a occhio.
Il fronte dell'emergenza ha avuto bisogno di due correzioni e non di una: misura
la campagna all'anno medio, **e** pretende un deficit strutturale prima di
dichiarare una carestia. Il conto sta in [ROADMAP.md](ROADMAP.md#L1467) e il
ragionamento in [src/sim/README.md](src/sim/README.md).

Dalla 3.1 il cibo ha un posto sulla mappa e un listino in case sfamate. Manca il
motivo per averne più del necessario: `food.targetCoverage` punta a un margine
fisso, e una città in pareggio resta in pareggio per sempre. Una resa stagionale
dà alla partita un tempo — si accumula quando si può, si sopravvive quando non si
può — ed è la cosa che manca a una città che sale sempre.

- [x] Moltiplicatore stagionale sulla resa dei tre produttori, dentro `tick`. <!-- size: M -->
- [x] Verificare che il fronte dell'emergenza alimentare non oscilli con la <!-- size: M -->
  stagione: l'inverno non deve poter dichiarare una carestia che la primavera
  risolve da sola, o l'allarme torna a essere rumore.
- [x] Stagione visibile nel mondo, riusando i sette temi di `src/engine/themes/`. <!-- size: L -->

**Il vincolo che non si negozia:** la stagione entra in `tick` e **non** in
`urbanProfileAt`. La prima legge già `tickCount`; la seconda è spaziale, e farle
leggere il tempo romperebbe il determinismo della forma — la stessa ragione per
cui i mandati sono slot e non scadenze.

**Gate:** una partita ha un ciclo riconoscibile in cui accumulare e uno in cui
consumare, e la scorta è la differenza fra le due.

## Cosa questo piano non propone, e perché

- **Traffico con agenti.** Contraddice «la rete stradale è una funzione pura del
  seed»: veicoli con una destinazione vogliono stato da serializzare, e la fase 5
  ha appena chiuso il salvataggio proprio non serializzando ciò che sa
  ricostruire. E il p95 del tick è già sopra i 3 ms di `FRAME_BUDGET_MS`.
- **Zoning manuale cella per cella.** È contro la visione della roadmap, e la
  fase 2 ha fatto il lavoro opposto: i distretti emergono dalla sovrapposizione
  dei campi.
- **Disastri casuali.** Nessun `Math.random()` globale, e soprattutto un disastro
  che il giocatore non poteva prevedere non insegna niente. Il declino qui è
  sempre la conseguenza leggibile di una copertura che non c'è.

## Ordine consigliato

**8.1 e 8.2 sono un incremento solo** e vanno insieme: la perdita senza la leva
per evitarla è una punizione, la leva senza la perdita è il gioco di adesso. 8.3
e 8.4 sono indipendenti fra loro e possono seguire in qualsiasi ordine; se c'è da
sceglierne una, 8.4 costa meno e si vede di più.

*L'ordine è stato seguito: 8.1 e 8.2 insieme, poi 8.4. Resta la 8.3, che è la più
cara delle due perché tocca il percorso caldo del campo e chiede la misura A/B su
worktree.*

**Da fare prima di aprire un file — fatto.** La domanda aperta della 8.2 è stata
decisa (copertura in due metà, non solo dai catalizzatori) e la fase è in
`ROADMAP.md`, fusa con il frammento in `docs/pending/` più `npm run docs:merge`
come vuole la regola per i file che tutti aggiornano nello stesso istante.
