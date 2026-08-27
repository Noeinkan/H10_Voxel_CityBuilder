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
- **L'unico scavo del progetto e' il landmark sul pendio.** Si riempie e non si
  scava ovunque; l'eccezione sta in `landmarkDriver.enqueueSlopeCarve`, e il suo
  confine e' l'impronta della struttura: la montagna sopra il tetto viene tolta
  con la stessa coda di comparsa del monumento, colonna per colonna e solo dove
  la maschera dichiara che la ricetta poggia. Fuori dall'impronta — parete e
  grembiule compresi — non si tocca un voxel.
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
