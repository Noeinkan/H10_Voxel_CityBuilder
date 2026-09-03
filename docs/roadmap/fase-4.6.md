# Fase 4.6 — Gerarchia verticale della città

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Dipende da 4.3 e 4.4 per le forme locali: la calibrazione globale ha senso solo
quando c'è qualcosa da calibrare. **È la seconda della spina dorsale**, ed è
anche il punto in cui si rompono i tre tetti che fermano la città a mezz'aria:
la ragione per cui questa sotto-fase pesa più di quanto il suo elenco lasciasse
credere.

**I tre tetti, in ordine di quanto ingannano.**

1. **`BUILDER.maxLevel: 6`**, con `LEVEL_CAPS` fermo a otto fasce: una torre
   arriva a una sessantina di voxel. È l'unico che si vede e l'unico che si alza
   cambiando un numero — ed è per questo che è una trappola.
2. **`upgradeThreshold` finisce a 198 su un campo che satura a 255.**
   `DesirabilityField` è un `Uint8Array` clampato in `0..255`; con
   `localUpgrade.maxDiscount` a 38 lo spazio residuo vale sì e no un livello.
   Non è una taratura stretta: è la fine dell'alfabeto. Oltre quel punto la
   desiderabilità non *distingue* più due colonne del centro, e alzare
   `maxLevel` non darebbe uno skyline ma l'altopiano che il commento di
   `START_LEVEL_CDF` dichiara di voler evitare — tutto il nucleo saturo che sale
   insieme, che a colpo d'occhio non si legge come una città.
3. **`maxDirtyChunksPerBuilding: 24`** è tarato sulla torre di livello 6, e il
   suo stesso commento racconta cosa è già successo una volta quando l'impronta
   è raddoppiata: sono spariti esattamente gli edifici alti, «senza che niente
   lo dicesse», perché sforare non è un errore e viene scartato in silenzio. Un
   edificio tre volte più alto attraversa tre volte i piani di chunk.

Sotto ce ne sono altri tre che non fermano la crescita ma la fanno leggere male,
e vanno rimisurati insieme: il terreno ha `TERRAIN.maxHeight: 80` con
`seaLevel: 16`, quindi il rilievo è tarato per stare sotto la città e non
accanto; `SunShadow.fit` adatta il frustum al raggio dell'AABB **visibile**,
perciò salire allarga il volume illuminato e abbassa la densità di texel
dell'ombra a parità di `SHADOW_SIZE`; la nebbia di quota ha `heightBase` fra 6 e
12 e `heightFalloff` intorno a 0,02, cioè è tarata su una città alta trenta
voxel e a quota cento ha già finito di decadere.

**La regola.** L'altezza smette di essere una funzione della sola desiderabilità
e diventa una **quota ammessa per colonna**, derivata da distanza dai poli, dal
mare e dal bordo dell'edificato. La desiderabilità continua a decidere *se* un
edificio promuove; la gerarchia decide *fin dove*. Sono due domande diverse, e
per questo due dati diversi — è la stessa separazione che la 4.2 ha fatto fra
«cosa regge il terreno» e la 2.1 fra «dove ha senso questo ruolo», ed è ciò che
permette di alzare il tetto senza spostare un coefficiente di `balance.ts`.

**Stato implementazione:** completata. Il gate è verificato dai test — tre fasce
popolate, nessun livello che raccolga la città intera, nessun edificio alto
scartato in silenzio, e la stessa figura su tre seed — tranne la leggibilità a
UI nascosta, che resta da guardare a occhio.


**Vincolo:** la simulazione non impara la verticale (invariante 7). La quota
ammessa è un dato del mondo — sta dove stanno strade, opere e vincoli di sito —
e `src/sim/` continua a non avere una coordinata z. Un indice `z` nel campo di
desiderabilità moltiplicherebbe per il numero di livelli tutta la memoria densa:
è l'alternativa da non prendere, e la 4.9 lo dice già per il suo motivo.

**Gate:** da inquadratura d'insieme si riconoscono almeno tre fasce di altezza e
il centro, senza overlay; alzare il livello massimo non fa sparire nessun
edificio e non produce un altopiano.

**Riferimento.** La progressione dei city builder classici lega l'altezza a uno
stato globale della città — densità alta che pretende popolazione regionale,
valore del suolo e trasporto, e la regola «non si costruisce in alto finché si
può costruire in larghezza» — ed è documentata per
[SimCity 4](https://simcity.fandom.com/wiki/Density). Qui la scarsità di suolo
non diventa una meccanica: è la controprova che il tetto verticale va derivato
da uno stato d'insieme, e non dalla singola cella.

**Come è stato risolto.** La quota ammessa vive in `src/world/skyline/`, che è un
dominio a sé e non un'appendice di `buildings/`, per la stessa ragione per cui
`sites/` non è finito dentro `grading/`: quello lì dice *come è fatto* un
edificio, questo *fin dove* una colonna può salire. Puro e senza stato come la
rete stradale — entrano distanza dai poli, dal mare e dal bordo dell'edificato,
esce un tetto — quindi non si salva, non si invalida quando arriva un
catalizzatore, e si verifica in `node` senza mondo e senza terreno. `src/sim/`
non ha guadagnato una coordinata verticale (invariante 7), e nessun coefficiente
di `balance.ts` è stato toccato.

**Le due domande stanno affiancate, e l'ordine conta.** In `upgradePass` la
gerarchia risponde per prima, perché dice di no più spesso e non costa un profilo
locale; la desiderabilità decide dopo. È la separazione che la fase esisteva per
fare: `DesirabilityField` è un `Uint8Array` clampato a 255 e l'ultima soglia sta
a 198 — 198 è la **fine dell'alfabeto**, non una taratura stretta. `upgradeThreshold`
non è quindi stato allungato: si legge con `upgradeThresholdOf`, che ripete
l'ultima voce, e sopra quel punto a decidere è la fascia.

**Lo skyline è la somma di tre condizioni che raramente coincidono.** Fascia
(`3 / 6 / 9`), più un cono di due livelli verso il polo, più un livello a un
isolato ogni sette eletto da un hash del suo indice: il massimo esce solo dove i
tre si sommano, ed è per questo che i picchi sono pochi **per costruzione** e non
per fortuna. Un test verifica che quella somma valga esattamente
`BUILDER.maxLevel`: se `SKYLINE` concedesse di più, il clamp del Builder
mangerebbe la differenza in silenzio e il livello massimo finirebbe anche a chi
non se l'è guadagnato. La corona attorno all'edificato non è disegnata da
nessuno — cade fuori dalla regola, perché in periferia i vicini costruiti sono
pochi per definizione.

**I tre tetti, rotti insieme, più due che nessuno aveva contato.** `maxLevel` da
6 a 12; `LEVEL_CAPS` da sette a tredici voci, con le prime sette **intatte**,
perché sono la città bassa che già esiste e cambiarle avrebbe rifatto la sagoma
della maggioranza degli edifici per una fase che parla dei pochi alti;
`maxDirtyChunksPerBuilding` da 24 a 40, che è aritmetica — `edgeChunks` aggiunge
una colonna di chunk solo quando l'impronta non ne attraversa già due, quindi le
colonne effettive restano due per asse e il caso peggiore è `2 × 2 × 7 = 28`. I
due non previsti: `GRAMMAR.minBandSide` da 2 a 4, senza il quale una catena di
rientranze riduce a un palo i due terzi superiori di una torre da diciannove
fasce; e `START_LEVEL_CDF`, che era lungo `maxLevel + 1` **per caso** — con
`maxLevel` alzato, `startLevel` leggeva `undefined`, il confronto era falso a
ogni giro e ogni edificio sarebbe nato al livello massimo. Un difetto che non
lancia niente e si vede solo guardando la città; ora un test verifica la
lunghezza di entrambe le tabelle indicizzate per livello.

**La punta è una matita, ed è dichiarato.** Il contratto di proporzione passa da
dieci a uno a diciannove a uno, e il test lo dice invece di tacerlo. Non c'è
un'altra forma disponibile: `MAX_FOOTPRINT` è otto voxel e non può salire senza
allargare `STREETS.pitch`, perché l'isolato più stretto è largo quattordici
colonne — cambiare la scala della maglia stradale è un'altra fase. A dare massa
alle torri, qui e ora, è l'aggregazione della 4.4.

**Costo e misure.** Su isola vera 256×256, un polo a raggio 96, 500 tick, 334
edifici. I tick di upgrade hanno mediana **9,4 ms** e p95 16,7 ms; tutti gli
altri stanno a mediana ~0 e p95 11,4 ms.

| | mediana del tick di upgrade |
| --- | --- |
| con la gerarchia | **9,4 ms** |
| con la gerarchia spenta | 9,5 ms |
| con il tetto riportato a sei | 10,7 ms |

Le tre righe dicono la stessa cosa: **il costo è della passata di upgrade, non di
questa fase**. Quel tick supera i 3 ms di `FRAME_BUDGET_MS` ed è preesistente,
come già lo è `nextBuildSites`; appartiene alla fase 6. Non è un A/B contro il
commit precedente, e di proposito: gli stessi file portano in parallelo un altro
lavoro, e un A/B avrebbe attribuito alla 4.6 anche quello.

Ci è voluto un giro di ottimizzazione per arrivarci: la prima versione portava il
tick di upgrade a 17,2 ms. Le due voci erano `withinRadius(...).length`, che
costruiva un array di qualche centinaio di record per leggerne la lunghezza — da
cui `countWithinRadius` e la scansione condivisa — e `waterDistance`, che
chiedeva `columnAt` e allocava un oggetto per colonna. Nessuna delle due era
microtaratura: insieme valevano metà della passata.

L'ombra **non** è stata ritarata, e il conto dice perché: `SunShadow.fit` adatta
il frustum al raggio dell'AABB visibile, che è la diagonale di una scatola larga
420 voxel e alta 200 invece di 80 — da 601 a 626, cioè il quattro per cento. A
dominare è l'estensione orizzontale, e la densità di texel non si muove.

**Le tabelle di misura in `README.md` e `src/sim/README.md` vanno rimisurate a
mano**, e non sono state aggiornate qui.

**Resta aperto.** Il franco delle campate **non è stato liberato**, ed era il
debito che la 4.5 aveva lasciato proprio qui: misurato, alzarlo da due a tre cubi
di terreno costa i due terzi delle campate (da undici a quattro). La ragione è
che questa stessa fase alza il centro e **abbassa la periferia**, quindi le
coppie di appoggi alti sono diventate più rare e non più comuni; il debito passa
alla 4.9, dove un impalcato con appoggi propri non deve aspettare che due torri
diventino alte nello stesso punto. La città arriva in alto **lentamente**: la
scala di `upgradeThreshold` è ripida e sopra il livello sei a far salire un
edificio è solo la gerarchia — sul seed di prova il primo livello 7 compare
attorno al quattrocentesimo tick, e il primo livello 11 attorno al
seicentesimo. La gerarchia legge il costruito e non l'ha ancora imparato a
dimenticare: se un giorno arriverà la demolizione, la fascia di una colonna dovrà
poter scendere. E l'altezza resta un attributo del singolo record: il secondo
livello percorribile è la 4.9, non questa.
