# Opere di terra e acqua

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **L'opera si getta sotto cio' che la struttura occupa, non sotto il riquadro.**
  `buildWorks` e `surveyGrade` accettano una maschera per colonna
  (`stampFootprint` fino a `LANDMARK.groundBand`). Senza di lei il riquadro di un
  porto — per meta' specchio d'acqua — finiva tutto alla quota della banchina, e
  quello che si vedeva era una piattaforma rettangolare in mezzo al golfo con
  dentro una pozza piu' alta del mare che la circondava. **La darsena e' il mare
  che c'era**: la ricetta la ottiene non disegnando niente.
- **Si riempie e non si scava, e le eccezioni sono tre.** Tutte e tre hanno lo
  stesso confine — l'impronta della struttura, mai il grembiule, mai una colonna
  fuori dall'ingombro — e viaggiano tutte sulla stessa coda di comparsa, cioe'
  non aprono un secondo percorso di scrittura:
  1. `landmarkDriver.enqueueSlopeCarve`: la montagna sopra il tetto di un
     landmark sul pendio, tolta colonna per colonna e solo dove la maschera
     dichiara che la ricetta poggia.
  2. `landmarkDriver.enqueueBasinDig`: la darsena di una marina, scavata a
     `record.waterZ - basinDepth` e allagata al pelo conservato nel record.
  3. `sunkenDig.sunkenDigStamp`: l'imbuto di un earthscraper. E' la piu' grande
     delle tre — decine di quote per un ingombro intero — ed e' anche la sola in
     cui **lo scavo e' la struttura**: senza il vuoto non resta una versione
     ridotta dell'opera, non resta niente.
- **Lo scavo di un earthscraper e' una ricetta di parti, non un
  parallelepipedo.** `sunken.dig` elenca scatole nelle stesse coordinate
  canoniche della struttura e ruota con lo stesso `orientPart`: e' cio' che fa
  rientrare l'imbuto scendendo insieme alle terrazze. Uno scavo scritto come una
  scatola sola avrebbe aperto sotto la prima terrazza un vuoto largo quanto la
  bocca, con gli anelli appesi ai fianchi.
- **Marca solo la roccia che c'e'.** Il volume da togliere si interseca con
  `heightAt` prima di entrare in coda. Non e' un'ottimizzazione:
  `clearObsoleteVoxelBatch` spende il budget del fotogramma per ogni cella che
  visita, anche dove `setBlock` non cambia niente perche' la cella era gia'
  vuota, e su un imbuto da diciassettemila celle sarebbero stati minuti di
  comparsa spesi a svuotare l'aria.
- **Un pozzo si riapre al caricamento, o sparisce.** `Builder.restore` ridisegna
  gli stamp e nient'altro: terreno e strade si rifanno dal seme perche' sono
  funzioni pure, quindi la roccia torna dov'era. `ArcologyDriver.reopenPit` gira
  **prima** di `writeStamp` — dopo, lo scavo porterebbe via la struttura appena
  ridisegnata — ed e' una funzione pura di `(ricetta, verso, angolo, baseZ,
  heightAt)`, cioe' di dati che il record porta o che il seme rigenera.
- `LANDMARK.groundBand` separa cio' che **poggia** da cio' che **sporge**: il
  braccio di una gru passa sopra il bacino a tredici voxel d'altezza, e contarlo
  vorrebbe dire riempire di terra l'acqua che sorvola. Chi scrive una ricetta
  costiera deve quindi tenere sotto quella quota solo cio' che vuole veder
  diventare terra ferma.
- **Il fondale non e' la base di un landmark costiero.** Le ricette con
  `waterline` conservano il piano finito della banchina e costruiscono l'opera
  mascherata fino al fondo; applicare loro l'affondamento dei landmark
  terrestri lascerebbe fuori dall'acqua soltanto gru e torri. Porto e traghetto
  si distinguono dai nomi tramite il dato della ricetta, non con un elenco nel
  Builder.
- Il **grembiule si ferma sulla battigia**: il suolo pubblico e' suolo, e
  prolungarlo sul bassofondo — che `canPaint` ammette, perche' una banchina ci si
  costruisce — dipingeva un anello di asfalto sul fondale attorno a ogni porto,
  visibile in trasparenza sotto il pelo dell'acqua.
- **La bonifica del decoro non tocca l'acqua, ed era lei a scavarla.**
  `clearDecorColumn` sale di `BUILDER.decorClearanceHeight` — venti voxel, la
  conifera piu' alta — a partire dalla quota del terreno; su una colonna
  sommersa quella quota e' il **fondale**, quindi cancellava tutta l'acqua sopra
  di esso. Il difetto e' vissuto a lungo senza test perche' l'opera di terra
  riempiva subito dopo le stesse colonne. A dire «sommersa» e' il **bioma**
  (`isDryLand`) e non il confronto fra quota e specchio: e' la stessa ragione per
  cui quella funzione esiste.
