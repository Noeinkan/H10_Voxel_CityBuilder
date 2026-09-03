# Fase 4.13 — Le viste diventano un gesto di gioco

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Dipende dalla 4.11, di cui non riscrive niente. Vive in `src/ui/` e in
`src/main.ts`.

**Stato implementazione:** completata. Verificata a schermo alla radice, senza
`?debug=1`, su una città di ~2.000 residenti.

**Perché il vincolo della 4.11 era sbagliato.** Lo diceva la 4.11 stessa: «se un
giorno diventerà un'azione del giocatore, sarà la fase 7 a darle una pelle». Quel
giorno è stato il giorno dopo. Guardare dentro la propria città non è una
verifica tecnica — è **il modo in cui una città densa si gode**, ed è la risposta
alla stessa domanda che aveva aperto la 4.11, posta però da chi ci gioca invece
che da chi la costruisce. Il motore non aveva bisogno di niente: mancavano il
comando e tre regole.

Le tre regole, che sono il contenuto vero della fase:

- **Il fuoco si aggancia.** Seguendo il cursore un frame alla volta, bastava
  portare il mouse sul dock — o vedersi aprire una carta evento — per far saltare
  la vista a metà città. È il difetto che rendeva le viste inusabili da
  giocatore, e non si vedeva finché le si guidava da console.
- **Prendere uno strumento chiude un taglio.** Sotto Levels o Cutaway il terreno
  vero è nascosto: si piazzerebbe alla cieca. Le viste a velo sopravvivono,
  perché lì il suolo si legge ancora sotto il retino.
- **La quota si ri-arma** tornando alla città intera, o una fetta riaperta
  ripartirebbe da una quota scelta mezz'ora prima, nel frattempo finita
  sottoterra.


**Vincolo:** il motore della 4.11 non si tocca — nessuna uniform nuova, nessun
modo nuovo, nessuna ricompilazione in più. La variante col `discard` continua a
entrare alla prima attivazione: chi non apre mai una vista non la paga, e resta
la scelta giusta anche ora che è una funzione di gioco. La vista è una **lente
sul rendering, non uno stato della città**: `src/sim/` e `src/game/` non sanno
che esiste, non si salva, e al ricaricamento si riparte da Normal.

**Gate:** un giocatore che non ha mai aperto la console scende di un piano nella
propria città, taglia su una strada e isola un quartiere senza uscire dal gioco,
e senza che una vista attiva gli faccia perdere il punto che stava guardando.

**Cosa ha trovato lo schermo.** Che i raggi X hanno una finestra di
`INSPECT.xraySpan` colonne di **mondo**: a tutta inquadratura sono una trentina
di pixel, e la vista sembra non fare niente. Da vicino — dove serve — apre
esattamente ciò che sta davanti. Non è un difetto da correggere con un numero più
grande: un raggio X che scala con lo zoom dissolverebbe mezza città appena ci si
allontana, che è il difetto che la 4.11 aveva già trovato e chiuso. Va detto
nella riga della vista, non allargato.

**Cosa ha trovato il giocatore, il giorno dopo.** Che una vista che non dice dove
è puntata non è una vista, è un difetto di rendering. Il comando c'era, il motore
funzionava, e da fuori si vedeva «una specie di trasparenza ad area quadrata che
non si capisce cosa sia» — parole di chi ci giocava. Le tre cause, tutte fuori
dal motore:

- **Il fuoco era invisibile.** Tre viste su quattro si agganciano alla colonna
  sotto il cursore e nulla a schermo lo diceva: gli unici numeri che lo
  raccontavano stavano in `InspectOverlay`, dietro `F3`. Ci vogliono delle
  **guide** — `src/engine/InspectGuides.ts`, contorno del riquadro, carreggiata
  della sezione, mirino sulla colonna — disegnate dalle uniform già composte, così
  che la linea non possa divergere dal retino.
- **Il bordo era un gradino.** Il predicato del rettangolo cominciava su una riga
  di voxel allineata agli assi, e quel confine netto legge come un artefatto.
  `INSPECT.feather` lo sfuma moltiplicando la densità che c'era già: nessun
  colore nei vertici, nessun mesher, e inerte dove il rettangolo è aperto.
- **Le righe dicevano il risultato e mai il gesto.** «See through whatever stands
  in front of what you are looking at» non dice *muovi il mouse sopra*. Da qui
  `ViewOption.gesture`, che entra nel picker, nel toast di `V` e nella card di
  aiuto — dove la 4.13 aveva lasciato la sola riga «V · Look inside the city»,
  che non nomina nessuna delle quattro viste. Ci finisce anche la larghezza della
  finestra dei raggi X, che la riga sopra prometteva di dire e non diceva.

E due difetti veri, non solo di leggibilità: la **barra dei livelli compariva in
Cutaway**, dove `sliceZ` non entra nelle uniform, quindi si trascinava a vuoto —
`modeCuts` rispondeva a due domande diverse, e ora `modeHasLevel` risponde alla
seconda; e **`[`/`]` funzionavano in ogni modo**, senza effetto visibile ma
*armando* la quota, così che una fetta aperta dopo ripartisse da un numero
assoluto invece che dal suolo davanti. Fuori da Levels adesso aprono Levels, e il
ri-armo scatta uscendo da Levels e non solo tornando alla città intera.

**Cosa ha trovato il giocatore, il giorno dopo ancora.** Che le guide dicevano
*dove* è puntata la lente, e niente altro: «non c'è una maniera ovvia per uscire
da questa view e ritornare al gioco normale». Aveva ragione, e il difetto non era
il rendering ma la durata delle superfici. Il picker si chiude appena si sceglie,
il toast dura due secondi, la card di aiuto va aperta: **tutto ciò che spiega una
vista muore prima della vista stessa**, e resta una città retinata senza nome,
senza tasti e senza uscita.

Da qui la **targa** (`ViewBarModel`), l'unica superficie che sopravvive al gesto
che l'ha aperta: nome, gesto, i tasti che valgono *lì dentro* e due bottoni —
cambiare vista, uscirne. E `Escape` che finalmente esce, dopo i pannelli e dopo
lo strumento. Che non lo facesse era scritto e argomentato in
`resolveEscapeTarget` — una vista non è un pannello aperto sopra il gioco — ma
l'argomento vale solo finché esiste un'altra via d'uscita ovvia: c'erano `V`
premuto cinque volte e il picker, e nessuna delle due era scritta da nessuna
parte. Un tasto di annullamento che si rifiuta di annullare l'unica cosa
evidentemente in corso non protegge niente.

**Resta aperto.** Le ombre nel taglio si spengono ancora tutte, e ora che è una
vista di gioco l'appiattimento si nota di più: la risposta giusta resta il
predicato nel materiale di profondità di `SunShadow`, cioè un secondo shader da
tenere allineato a mano. Nessuna icona ridisegnata e nessuno stato sui sette
temi: quella è la fase 7, e l'icona aggiunta qui è una sagoma coerente, non un
progetto grafico.

E soprattutto: **il velo continua a non distinguere terreno da edificio.** I
raggi X aprono anche il suolo davanti alla colonna, e siccome il mesher non
emette facce interne, dentro la finestra si legge un guscio vuoto sopra un buco
nel terreno. Le guide dicono adesso *dove* si sta guardando, il che rende la
vista usabile, ma non tolgono il buco. Tenere il suolo più pieno degli edifici
vuole un'informazione che il mesher non porta — e chiedergliela sarebbe la vista
sbagliata (invariante 6): la strada praticabile è un secondo predicato di quota,
e va decisa prima di scriverla.

**Chiuso, e la strada era quella.** Il predicato di quota è il **pavimento** che
viaggia con la lente: sotto la base del soggetto non si vela mai. Nessun bit nuovo
nel mesher, nessuna distinzione fra materiali — una quota, che è geometria e la
sa già chi ha scelto il soggetto. Nello stesso passaggio è caduta anche la
finestra di 64 colonne, e non allargandola: la lente è un test **raggio/volume**,
cioè «questo frammento copre ciò che sto guardando?», e la sua finestra è la
sagoma del soggetto per costruzione, a ogni zoom e da ogni angolo. La terza gamba
era il puntamento — `pickSurfaceCell` non conosce gli edifici e si fermava sulla
terra *dietro* la torre, a tante colonne quanto la torre è alta — e ora chi
guarda usa `pickSolidCell` mentre chi piazza continua a usare la heightmap.
Restano aperte le ombre nel taglio.
