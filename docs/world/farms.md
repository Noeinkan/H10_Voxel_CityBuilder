# La campagna

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **Un lotto agricolo non e' un ostacolo, e non sta in nessuno dei due indici del
  registry.** E' la differenza con landmark, campate e citta' in quota, che sono
  «un record con un flag» dentro il `BuildingRegistry`: quelli scelgono *quale*
  dei due indici li tiene — `columns` per chi non si puo' attraversare,
  `groundColumns` per chi prende suolo — mentre un campo non appartiene a
  nessuno dei due. In `columns` impedirebbe di costruirci sopra, in
  `groundColumns` impedirebbe perfino di passarci una strada, e la meccanica di
  questa fase e' esattamente che **la citta' si mangia i propri campi**. I lotti
  hanno percio' un registro loro, `farms/FarmRegistry.ts`, che risponde a una
  domanda sola: qui si e' gia' piantato? Aggiungere un quinto tipo di record con
  regole d'indice tutte sue a un file di settecento righe sarebbe costato di piu'
  e avrebbe indebolito un invariante che ne regge quattro.
- **Chi cede e' sempre il campo.** Al suolo vince chi sul suolo ci sta — la
  stessa riga che vale per le campate — quindi il `farmDriver` non difende
  niente: rilegge le proprie colonne, e quando `FARMS.minFreeShare` non e' piu'
  rispettata ritira il lotto. Non c'e' una demolizione nuova, e non deve
  essercene una: `clearance.ts` resta l'unica del progetto.
- **Un campo entra nel mondo dalla coda della superficie, non da uno stamp.** Non
  e' una scelta di comodo ma di formato: uno stamp porta indici di palette e
  `STAMP_EMPTY` vale 0, mentre un marcatore di copertura **e'** palette 0 —
  inesprimibile in quel linguaggio. La coda del suolo invece dipinge colonne, che
  e' cio' che fa un campo, e ci porta in dote la priorita': `FARM_PAINT_PRIORITY`
  vale 0, sotto la carreggiata secondaria, quindi una strada che ripassa su un
  lotto vince sempre. In `SurfacePaint`, `palette` a **0** significa «lascia il
  suolo dov'e'», e `cover` a **0** significa «togli il marcatore» — non «non
  toccare», che si dice con `undefined`.
- **Il terreno di un campo non si ridipinge.** Non esiste uno slot di terra arata
  e non se ne aggiunge uno (invarianti 4 e 5): a leggere come campo, a distanza
  isometrica, e' la **regolarita' dei solchi** e non il colore del suolo. E' lo
  stesso argomento della roccia — a dare varieta' e' il ciglio, non la tinta.
- **L'asse del solco sta nel marcatore, non in un hash.** Le altre coperture
  prendono una delle quattro giravolte dalla posizione della colonna, che per un
  ciuffo e' giusto — un prato tutto nello stesso verso e' carta da parati — e per
  un campo e' rovinoso: solchi orientati a caso non sono un campo, sono rumore
  verde. `COVER.cropX` e `COVER.cropY` portano quindi il verso, e il mesher
  continua a non sapere che i lotti esistono. Il solco e' anche l'unica forma di
  copertura che **attraversa** la propria cella da bordo a bordo, o due colonne
  contigue non si salderebbero in una fila sola.
- Il costo e' misurato e non stimato: un chunk arato per intero fa **5120 quad**
  di dettaglio contro un tetto di 16384, ed e' `FARMS.rowPitch` a tenerlo li'.
  Dimezzare il passo raddoppia il conto.
- **Un frutteto passa dalla coda della crescita, un campo da quella del suolo**,
  e non e' un'incoerenza: sono due cose diverse. Un campo e' superficie, un
  frutteto e' un migliaio di voxel di volume, e consegnandolo come stamp eredita
  budget, affettamento e cancellazione che la coda ha gia' — invece di aggiungere
  un quarto posto da cui i voxel entrano nel mondo. Il ritiro e' la stessa strada
  di un upgrade: uno stamp vuoto con il volume vecchio come `erase`.
- Il lotto agricolo non ha un `BuildingRecord`, quindi non ha nemmeno un `id`: nella
  coda della crescita prende un **identificatore negativo**, derivato dalla propria
  posizione. E' uno spazio che il contatore del registry non raggiunge mai, e
  serve solo a distinguere due frutteti fra loro.
- **La specie da frutto non compare in `FLORA`**, ed e' cio' che le permette una
  sagoma che in natura non si spiegherebbe: bassa, tonda, larga uguale — potata.
  A dire «coltivato» e' la **regolarita' del reticolo** contro il jitter del bosco
  vero, non la specie. Il passo del reticolo e' dedotto dal raggio della chioma e
  non e' calibrazione: cambiare il profilo della specie senza cambiare il passo fa
  toccare le chiome.
- Il disegno di un albero sta **una volta sola** in `terrain/decor.ts`: `drawTree`
  e' il corpo senza destinazione, `writeTree` lo manda nel mondo e il frutteto in
  uno stamp. Ritaglio, controllo dell'aria e conteggio appartengono a chi scrive,
  non a come e' fatto un albero.
