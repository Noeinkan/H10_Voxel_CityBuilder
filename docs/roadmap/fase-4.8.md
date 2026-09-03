# Fase 4.8 — Dettaglio d'artista e vita notturna

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Dipende da 4.3 per gli agganci: un dettaglio si appende a una rientranza, a un
coronamento o a un fronte, e finché la grammatica non li produce non c'è dove
metterlo. La parte di luce è indipendente, vive in `src/engine/` e può procedere
in parallelo.

**Perché non è già coperta da 4.3 e 4.7.** La microgeometria in
`src/engine/mesher/microGeometry.ts` e i sette linguaggi di superficie oltre a
`plain` in `VoxelMaterial.ts` fanno già la *facciata*: pannelli, portali, fasce
luminose, sfiati, circuiti di tetto. Quello che manca è l'**oggetto** — la tenda,
il condizionatore, l'insegna a bandiera, la pianta sul balcone — e la luce che
*esce* dall'edificio: oggi `emission` illumina il proprio pixel e alimenta il
bloom, non schiarisce il muro di fronte. Nebbia, acqua e prospettiva aerea
restano invece competenza della 4.7.


**Vincolo:** il tetto di quad della microgeometria non si alza per fare posto ai
prop. Un prop entra togliendo densità altrove o fondendo meglio le corse, e la
priorità di troncamento resta quella che c'è — a cadere sono le ultime voci,
mai una classe a caso. Nessun tipo di superficie e nessuno slot di palette in
più (invarianti 4 e 5): un'insegna è un prisma con una palette esistente e il
linguaggio `luminous`, non un materiale nuovo.

**Gate:** un edificio inquadrato da vicino regge lo sguardo senza mostrare
facciate piatte ripetute; di notte la città si legge per luci accese e non per
sola silhouette; il costo per chunk edificato resta dentro il tetto misurato
oggi e le draw call non crescono.

**Il costo per chunk ha deciso l'architettura, non l'ha solo verificata.** I
prop scritti nel modo ovvio — un emettitore per giunzione, ognuno con la sua
passata sulle celle di quel tipo di superficie — costavano **+2,2 ms per
chunk**, misurati A/B nello stesso processo. Sono scesi a **+0,3 ms** con due
cambi che non si vedono a schermo: le celle di facciata si indicizzano una volta
sola **per faccia esposta** — quelle interne di un edificio pieno sono i due
terzi e nessun prop potrà mai usarle — e quella scansione legge i quattro vicini
con gli indici invece che con la tabella degli offset. La stessa lezione è
tornata sul bagliore notturno: scritto in modo diretto costava +1,35 ms, e la
sola differenza è una moltiplicazione per cella tolta dal ciclo. In questo
mesher il costo non sta quasi mai nella geometria che si produce, ma in quante
volte si tocca una cella che non produrrà niente.

**Il tetto di quad ha tenuto**, e senza alzarlo: sulla fixture `densityChunk`
si passa da 3 320 quad di sola struttura a 4 355 con prop e verde, un trenta per
cento. La voce che pesava era l'unica che pesca su tutta la parete invece che su
una giunzione, e sta a 0,012 e non a 0,09 — dove da sola valeva più di tutto il
dettaglio strutturale del chunk. Il verde è quasi gratis perché non aggiunge
prismi: fioriera e cassone sono la stessa forma con due slot di palette, e un
rampicante è una corsa sola per colonna.

**Due limiti dichiarati, che passano alla fase dopo.** La tinta della luce che
esce è del **tema** e non dell'emettitore — un'insegna rossa e una cyan
schiariscono il muro con lo stesso ambra — perché portare la tinta costerebbe
bit che non ci sono. E l'accensione è una lettura **per città e per uso**, mai
per singolo edificio: il fragment non sa a quale edificio appartenga un voxel,
quindi un quartiere vuoto in mezzo a una città piena non si spegne da solo. È lo
stesso muro contro cui batte la 4.9 dal lato opposto — quando l'edificio avrà
un'identità che il rendering può leggere, entrambi cadranno insieme.

**Il ciclo giorno/notte rompe di proposito un invariante dei temi.** A sole
radente una parete illuminata supera il tetto, che è il caso da cui
`SunLight.elevation` mette in guardia: sotto i quaranta gradi circa il diorama
smette di leggersi «dall'alto». Non si corregge — l'alternativa misurata sarebbe
raddoppiare l'ambiente di cielo, che slava la scena invece di salvarla. Quello
che il ciclo garantisce, a ogni ora, è che il tetto non sia mai la faccia più
scura.

**Le tabelle di misura in `README.md` e `src/sim/README.md` vanno rimisurate a
mano**, e non sono state aggiornate qui.
