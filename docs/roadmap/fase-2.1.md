# Fase 2.1 — Vincoli di sito dei catalizzatori

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono le regole e i motivi di rifiuto, non la
leggibilità del cursore mentre lo si muove. Le due sezioni che seguono
descrivono la situazione *prima* del lavoro; cosa è cambiato sta in fondo.

**Perché la fase 2 si riapre.** Il porto è stato chiuso come «primo collegamento
dell'isola al mondo», ma non ha mai avuto una regola sull'acqua:
`catalystFailure` in `src/game/actions.ts` convalida tutti i ruoli con la stessa
riga, `if (!column.buildable)`, e `BUILDABLE_BIOMES` in
`world/terrain/config.ts` esclude `beach`. Le due regole si sommano nel
risultato opposto a quello previsto — il porto si piazza in cima a una collina e
viene rifiutato sulla battigia, che è l'unica fascia dove avrebbe senso. Il
tooltip intanto promette *«concentrates industry and trade on the coast»*, cioè
annuncia un vincolo che il codice non ha, e a `tick.ts` basta che un porto
esista in un punto qualsiasi della mappa perché il commercio esterno si sblocchi.

Non è un difetto isolato: è la stessa asimmetria che la 4.2 ha già risolto per i
lotti. Lì «il terreno non è già piano e asciutto» ha smesso di essere un motivo
di rifiuto, perché la banchina costruisce il piano che manca; i catalizzatori
sono rimasti indietro sul singolo bit `column.buildable`, e continuano a
rifiutare proprio le colonne che il mondo saprebbe già preparare.

**Metà è già arrivata, e da un'altra strada.** Il bit se n'è andato prima del
vincolo di ruolo, perché produceva un rifiuto che nessuno riusciva a leggere:
una mesa piana e larga respinta mentre il prato accanto accettava, per la sola
quota. `catalystFailure` ora chiede a `groundKindOf` e paga il terreno con
`BUILD_WEIGHT` — prato 1, terrapieno 1,4, banchina 1,8, roccia 2,2 — e rifiuta
solo ciò che nessuna opera raddrizza: pareti oltre `maxTerraceSlope` e acqua
oltre `maxQuayDepth`. La battigia è quindi ammessa **a tutti** i ruoli, non ai
soli ruoli costieri: è il prezzo, non il permesso, a distinguerla. Il vincolo di
ruolo resta da fare, e ora è l'unica cosa che manca perché il porto stia sulla
costa. La tabella `BUILDABLE_BIOMES` non è stata toccata: la crescita automatica
sceglie ancora i suoi siti con il bit, quindi il peso non ha spostato l'equilibrio
della città che cresce da sola.


**Vincolo:** la simulazione non impara la geografia. Il vincolo di sito vive fra
`src/game/` e `src/world/`, come già il lotto e l'isolato; `src/sim/` continua a
ragionare per cella e a non sapere dove sia la costa (invariante 7). Un ruolo
nuovo tocca `balance.ts`, quindi le tabelle di misura verificate a mano vanno
rimisurate e non aggiornate a occhio.

**Gate:** ogni catalizzatore è rifiutato dove il suo ruolo non ha senso e
accettato dove ce l'ha, con il motivo visibile prima del click; porto e
aeroporto restano due scelte con conseguenze diverse e non due prezzi per lo
stesso sblocco.

**Come è stato risolto.** Il vincolo si è diviso in due metà che non si toccano:
la definizione del catalizzatore porta un'**etichetta** — `'coastal'`, `'open'`,
`'any'` — e non sa cosa significhi, mentre a tradurla sul terreno è il nuovo
dominio `src/world/sites/`. È la stessa mossa della 4.1, dove il candidato ha
smesso di essere un indirizzo ed è diventato un isolato: `src/sim/` dichiara
cosa un ruolo pretende e continua a non sapere dove sia la costa (invariante 7).
Il campo su `CatalystDefinition` è una stringa e non un numero, quindi non tocca
il contratto «i coefficienti stanno solo in `balance.ts`».

`sites/` è un dominio a sé e non un'appendice di `grading/`, perché le due
rispondono a domande diverse: quella lì è «cosa serve costruire perché regga», e
la sua risposta è un prezzo; questa è «questo ruolo ci sta», e la sua risposta è
un no che nessuna opera compra. Tenerle separate è ciò che permette al porto di
pretendere la costa **senza** che la battigia torni vietata agli altri sette
ruoli — che è esattamente l'errore che la 4.2 aveva appena finito di correggere.
`BUILDABLE_BIOMES` non è stata toccata: la crescita automatica sceglie ancora i
suoi siti con il bit, e l'equilibrio della città che cresce da sola non si è
mosso.

**Una ricerca sola, due raggi.** `Builder.isCoastal` esisteva già, privata, e
faceva la stessa marcia sui quattro assi che serviva al porto: è stata estratta
in `seesWater` e ora ha due chiamanti con due numeri diversi. Non sono lo stesso
numero travestito — `BUILDER.coastalRadius: 14` decide se un mercato *sembra* un
mercato sul porto, ed è generoso per costruzione; `SITE.coastalRadius: 6` decide
se un piazzamento è ammesso, e chiede il fronte mare. Il vincolo opposto riusa
`planGrade` sul quadrato di lato `SITE.openSpan`, con un tetto proprio di quattro
voxel: `GRADING.maxWorksStep` è tarato sulla banchina che scende sul fondale e
qui direbbe di sì a un terreno che nessuno chiamerebbe piano.

**Il commercio ha smesso di essere un interruttore.** `connected` diceva solo
«esiste un porto da qualche parte», quindi il secondo collegamento non avrebbe
aggiunto niente e l'aeroporto sarebbe stato un porto più caro. Ora ogni
collegamento porta la propria capacità e le capacità si sommano: il porto muove
volume, l'aeroporto muove valore — importa cibo in fretta perché non aspetta una
stiva piena, non spedisce materiali sfusi, e su quel poco spunta un prezzo
migliore. Resta uno scambio aggregato O(1) per tick. Nel passaggio è emerso un
difetto vero: l'HUD ricalcolava il flag con `catalyst.kind === 'port'` e ignorava
i catalizzatori senza `kind` — i salvataggi dell'MVP e le fixture di scena — così
che diceva «nessun porto» mentre il commercio girava. Ora tick e HUD chiedono
alla stessa `tradeLinksOf`.

**Costo e misure.** `catalystFailure` gira a ogni `pointermove`, e con
l'aeroporto in mano passa da una a `openSpan²` letture di colonna: sono letture
di `Int16Array` già in memoria, fuori dal ciclo di frame della simulazione, e
solo mentre quello strumento è selezionato. `tradeLinksOf` è lineare nel numero
di catalizzatori, che sono unità. Un ruolo nuovo tocca `balance.ts`: **le tabelle
di misura in `README.md` e `src/sim/README.md` vanno rimisurate a mano**, e non
sono state aggiornate qui.

**Resta aperto.** Il vincolo di sito riguarda solo ciò che il giocatore piazza:
la crescita automatica non ha ruoli e quindi non ha luoghi ammessi. L'aeroporto
non ha un `DistrictId` proprio — entra nei ruoli logistici e si distingue per
influenza, effetti e commercio, non per un quartiere che porta il suo nome.
