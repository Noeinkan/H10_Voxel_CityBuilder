# Il distretto costiero

> Riferimento normativo di `src/world/harbor/`. Motivazioni, invarianti e casi
> limite stanno qui, insieme, per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **Il distretto e' l'impronta, non un secondo landmark.** La struttura del
  catalizzatore dice *quale* ruolo sta sul fronte; il distretto dice *che
  mestiere* il posto ha preso — i canali scavati nella riva, la banchina
  guadagnata al mare, il frangiflutti che chiude lo specchio, e gli edifici di
  settore che ci crescono attorno con le loro tipologie. La macchina e' quella
  degli edifici: nessuna passata propria, nessun indice nuovo, nessuna porta
  nuova verso `src/sim/`. Gli edifici del distretto sono record ordinari —
  pagano la congestione e portano capacita' come chiunque — e il bonus di
  settore arriva dal catalizzatore, che cresce con lo stadio, e dalle tipologie
  che il ruolo sblocca.
- **Lo stadio del distretto e' lo stadio del landmark, letto da `record.level`.**
  Non c'e' un secondo cursore da far avanzare: il quartiere che fa crescere il
  monumento fa crescere anche la sua impronta, anello per anello. Lo stadio zero
  e' la sola struttura; l'anello arriva con il quartiere e non lo supera mai
  (`ringByStage` dell'ultimo stadio, mai piu' di due isolati).
- **Il piano e' il delta di uno stadio.** Le opere compaiono quando lo stadio le
  sblocca, con la loro geometria finale — un canale arriva intero — mentre cio'
  che cresce con l'anello (l'insenatura, la passeggiata) copre soltanto la
  fascia che lo stadio aggiunge. Applicare i piani in ordine produce il
  distretto cumulativo senza scrivere due volte la stessa colonna, ed e' la
  proprieta' che i test di `plan.test.ts` misurano.
- **L'acqua non e' suolo, e la simulazione non lo sa.** Lo scavo tocca i voxel,
  non la mappa del terreno, che continua a dichiarare riva asciutta: un lotto
  ordinario nascerebbe dentro il canale. Le colonne di scavo e di colmata sono
  quindi **prenotate al registry** — la stessa prenotazione dei cantieri, che
  vale per l'intera colonna e resta, perche' il canale resta — e lo sono **dal
  primo pass**, a stadio zero: un edificio posato sul *futuro* canale
  galleggerebbe per sempre. Le sponde restano libere: la casa sul canale e' il
  punto del distretto.
- **Gli scavi sono quelli del dominio, non una terza eccezione.** Il bacino
  della marina ha stabilito il contratto: si scava solo dove la ricetta lo
  dichiara, si allaga al pelo conservato nel record (`record.waterZ`), e la
  sponda scende a incontrare il fondo. Canali e insenature estendono la stessa
  pratica oltre l'impronta della struttura, con lo stesso confine — mai oltre
  l'anello dello stadio — e la stessa coda di comparsa a budget.
- **La colmata e' la banchina portata al largo, e regge solo dove regge il
  muro.** Il molo usa la grammatica di `buildWorks` — muratura sul perimetro,
  riempimento dentro, calpestio in cima — e rinuncia dove il fondale sprofonda
  oltre `GRADING.maxQuayDepth`: il piano e' un delta, non una promessa da
  riparare dopo. Il frangiflutti non ha piano: sale a quota dichiarata sopra il
  pelo e porta il cappello che si legge dal mare.
- **La passeggiata si ferma sulla battigia e non copre gli scavi.** Il suolo
  pubblico e' suolo (`isDryLand`), e il driver ne scarta le colonne gia'
  scavate: dipingere il calpestio sopra un canale appena scavato lascerebbe un
  pavimento sospeso sull'acqua.
- **Gli slot di settore sono colonne, non edifici.** Il piano sceglie *dove* il
  distretto vuole un edificio e di che uso; a costruirlo e' `buildPass` con la
  macchina ordinaria — collisioni, budget di chunk, comparsa a budget e resa
  del conto alla simulazione — e la forma la sceglie il catalogo: le tipologie
  di settore sono righe con `roles` e `coastal` come condizioni, e il
  catalizzatore le copre perche' il distretto nasce dentro la sua influenza.
  Un rivolo: un edificio per infornata, al massimo.
