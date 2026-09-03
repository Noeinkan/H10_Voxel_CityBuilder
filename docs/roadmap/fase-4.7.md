# Fase 4.7 — Atmosfera e separazione delle quote

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Nessuna dipendenza da altre fasi. **Non** è però vissuta interamente in
`src/engine/`, come questa riga prometteva: due delle quattro voci hanno dovuto
toccare `src/world/`, e il perché è sotto.


**Vincolo:** nessuna texture, nessun PBR, nessun materiale aggiuntivo. Un tema
resta un insieme di uniform, e cambiare tema non deve ricompilare un programma.

**Gate:** a UI nascosta le quote si distinguono anche dove i volumi si
sovrappongono, e le draw call non crescono.

**L'engine non aveva i dati, e non poteva averli.** La fase era annunciata come
interamente sua, e su due voci non lo era: il frammento non ha nessun segnale di
profondità dell'acqua — il mesher ne emette la sola faccia superiore, a quota
costante e con un unico slot, tanto che `waterDeep` non è mai visibile — e non
ha nessun modo di sapere che cosa gli sta sopra, perché l'AO per vertice ha
raggio un voxel e un impalcato ne sta quattro più su. Entrambe le informazioni
esistono altrove e sono gratis lì dove stanno: la profondità vale `seaLevel -
top` al momento della scrittura, e la copertura è un sondaggio verticale nel
volume che il mesher ha già in mano. Il lavoro è stato portare quei due dati
fino al frammento **senza allargare nessun formato**: la classe d'acqua entra
nei tre bit di superficie, che su un voxel d'acqua non significano niente
altrimenti, e la visibilità del cielo nei due bit alti del byte che già portava
l'AO. Nessun tipo di superficie in più, nessuno slot di palette in più, nessun
attributo di vertice in più.

**Il gate delle draw call ha deciso l'architettura, non l'ha solo verificata.**
L'alternativa per l'occlusione era una pass di profondità dall'alto, sul modello
di `SunShadow`: portata illimitata e zero modifiche al mesher, ma una pass in
più. Cuocerla nel mesher costa invece **zero per frame** e funziona anche a
`?quality=performance`, dove l'ombra del sole non viene nemmeno calcolata — che
è precisamente il caso in cui un sotto-ponte aveva più bisogno di essere
raccontato. Il prezzo è una passata a costo fisso nel percorso caldo: **+0,35 ms
per chunk** sulla scena di accettazione, da 2,09 a 2,44.

**Quello che il canale non è, ancora.** Non ci sono fiumi né laghi: l'acqua è
solo il mare attorno all'isola, quindi la classe `canal` si accende su bracci e
insenature strette e non su canali urbani. La regola è pronta per il giorno in
cui il terreno ne produrrà.

**Il velo di quota è dichiaratamente non fisico**, ed è l'unico pezzo di questa
fase che lo sia. Serve a zoom ravvicinato, dove l'integrale lungo il raggio è
quasi zero e la nebbia non separerebbe niente: senza, il gate reggeva solo alla
distanza di default.

**Le tabelle di misura in `README.md` e `src/sim/README.md` vanno rimisurate a
mano**, e non sono state aggiornate qui.
