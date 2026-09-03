# La funivia

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **Una campata di fune non prende niente**, ed e' l'invariante del dominio:
  l'opposto esatto di quello di `crossings/`, dove «un attraversamento prende
  suolo» con le pile nel fondale. Qui a terra ci sono solo le due torri; fra loro
  non c'e' impalcato, non c'e' carreggiata e non c'e' pila. E' per questo che
  `ROPEWAY.maxLength` vale il doppio di `CROSSINGS.maxLength`: senza un impalcato
  da reggere, il limite non e' piu' strutturale ma di gioco.
- **La fune non e' materia**, e vale per lei la regola di `traffic/` invece di
  quella delle strutture: e' spessa meno di un voxel, e scriverla a cubi lungo
  centonovanta colonne darebbe una scaletta al posto di un cavo — con la pancia,
  che e' l'unica cosa che la distingua da un tirante, ridotta a una gradinata. La
  calcola `ropewayPlan.ts` come spezzata e la disegna `engine/RopewayView.ts`.
  Non ha un record, non occupa colonne e non compare a budget.
- **Due torri e nessun pilone, e non e' una tabella lasciata a meta'.** Fra le
  due rive non c'e' niente su cui piantare un appoggio, e sull'avvicinamento non
  c'e' spazio — la stazione arretra proprio perche' li' la citta' e' costruita.
  Il pilone intermedio e' roba da linea di montagna, e quando servira' sara' la
  seconda voce di `ROPEWAY_PART`.
- **La stazione arretra invece di rifiutare.** Il lungomare di una citta'
  cresciuta e' costruito: pretendere la piazzola sulla battigia rifiuterebbe la
  funivia proprio dove la citta' c'e'. `seekPad` cammina all'indietro fino a
  `maxSetback` e prende la prima buona, che e' anche la piu' vicina all'acqua.
- **E se arretrando non trova niente, sgombera.** La traversata ha la precedenza
  sul tessuto urbano: le due rive che si guardano sono anche le prime che la
  citta' costruisce, e una riva costruita fino in fondo rifiutava il click. Da
  qui le **due passate** di `seekPad` — prima il suolo vergine, poi lo sgombero
  — e l'ordine conta: con una passata sola la linea raderebbe la battigia
  avendo il posto libero due colonne piu' in la'. Il cantiere e' quello di
  `clearanceSite.ts` e la sua regola sta in `BALANCE.gameplay.ropeway.clearing`.
  Non cadono i **monumenti** — `clearsLandmarks` e' spento, e toccarli resta un
  gesto della gomma — ne' le **altre funivie**: la fune non e' un record, quindi
  abbattere una torre lascerebbe un cavo appeso al nulla, e la classificazione
  di `clearance.ts`, che una stazione la legge come un edificio, non ha modo di
  saperlo. A dirlo e' il predicato `clearable` del driver.
- **Dentro una piazzola che sgombera si legge il terreno, non i tetti.** E'
  l'unico posto in cui `ground` e `top` divergono, e vale sia per la quota di
  appoggio sia per il franco della fune: quei tetti non ci sono piu' quando la
  cabina parte, e tenerne conto pianterebbe la torre sulle case che sta
  demolendo e alzerebbe la fune fino a un `tooTall` proprio dove la citta' e'
  alta.
- **Una torre puo' nascere attaccata a un edificio, e non serve un margine.** Il
  controllo della piazzola guarda le sole cinque per cinque colonne che la
  stazione occupa: nulla chiede un anello libero attorno, e chiederlo
  rifiuterebbe di nuovo la linea proprio nel tessuto denso per cui lo sgombero
  esiste.
- **Il franco si misura sulla prima quota libera, non sul terreno.** `top` dice
  la sommita' di cio' che c'e' — un prato, un bosco, un tetto — e la freccia
  entra *dentro* il massimo invece di essere sommata alla fine: sommarla dopo
  alzerebbe anche le torri, dove la fune non pende affatto.
- Il **limite noto**: un edificio che cresce *dopo*, sotto la corsa, non alza la
  fune. E' il prezzo di una linea che non ha una colonna a registro fra i due
  capi, ed e' un difetto visibile e onesto — la citta' cresce attorno a una linea
  che il giocatore ha deciso, non attraverso di lei.
- Il **drop della cabina e' l'unico numero condiviso fra due domini**:
  `ROPEWAY.cabinDrop` deve valere `TRAFFIC.hull.gondola.height +
  TRAFFIC.gondolaHanger`, perche' la regola alza la fune di quel tanto e la
  sagoma la disegna scendendo di quel tanto. A tenerli fermi c'e' un test, come
  per la copia TS e quella GLSL del modello di luce.
