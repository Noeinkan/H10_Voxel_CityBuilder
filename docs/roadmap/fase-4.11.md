# Fase 4.11 — Vedere dentro la città

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Nessuna dipendenza. Vive in `src/engine/` e nell'harness, non tocca né la
crescita né la simulazione, e va **prima** delle sotto-fasi che sovrappongono
volumi: 4.4, 4.5 e 4.9 costruiscono esattamente ciò che oggi non si potrebbe
verificare a occhio.

**Stato implementazione:** completata. Il gate è stato verificato a schermo su
una città di ~490 edifici, seed 1337: le quattro viste sono in fondo alla
sezione, insieme a cosa il lavoro ha fatto emergere.

**Perché adesso.** La città è già abbastanza densa da essere opaca. Da
inquadratura di gioco un isolato interno è un volume dietro altri volumi, e
l'unico modo di controllare che due edifici si incastrino come previsto è
aspettare che ne cresca uno in periferia, dove non c'è niente davanti. Gli
strumenti che esistono guardano altro — `BiomeView` ricolora le colonne,
`InfluenceOverlay` disegna cerchi sopra la scena, `SimOverlay` mostra il campo in
2D — e nessuno risponde alla domanda «cosa c'è dietro questa facciata».

**Il difetto strutturale, che decide l'ordine dei lavori.** Il greedy meshing
emette solo le facce a contatto con l'aria: **dentro un edificio non c'è
geometria**, e il materiale unico è `FrontSide` con `transparent: false`. Ne
segue che un piano di taglio, da solo, non apre un edificio — lo attraversa.
Dove le facce vicine spariscono si vede il *retro* di quelle lontane, che è
back-face e viene scartato: cioè si vede il cielo. È il problema che i thread di
three.js chiamano *closing up clipped planes*, e va risolto o aggirato, mai
ignorato.

Da lì le due famiglie, e il loro ordine:

- **Velare**, che non toglie niente. Un retino ordinato su `gl_FragCoord` con
  `discard` rende poroso l'occlusore senza aprirlo: si legge la sagoma davanti
  *e* il tessuto dietro. Costa due uniform sul materiale che c'è già, non chiede
  ordinamento perché non è alpha blending, e `transparent` resta `false`.
- **Tagliare**, che va tappato. La faccia di sezione si dipinge dalle back-face
  della stessa geometria — gli stamp sono volumi pieni, quindi il guscio è
  chiuso e le back-face ci sono — leggendo `gl_FrontFacing` nel fragment. Chiede
  però `DoubleSide`, che in three.js entra nella chiave di programma e non è
  solo stato del renderer: entrare in sezione compila una variante, **una
  volta**. Accettabile per uno strumento su hotkey, e l'invariante che conta —
  cambiare tema non ricompila niente — resta intatto.

Il velo viene per primo perché copre tre modi su quattro e non ha capping da
risolvere. Un effetto collaterale gradito: dove la tipologia ha una corte, la
sezione mostra un vuoto vero e non un pieno tagliato.


**Vincolo:** è uno strumento dell'harness, non una modalità di gioco. Sta
accanto a `F3` e al tasto `B` con il suo parametro URL; se un giorno diventerà
un'azione del giocatore, a darle icona, stato e comportamento sui sette temi
sarà la fase 7. Il mesher non si tocca (invariante 6): una vista che chiedesse
di rimeshare per essere disegnata sarebbe la vista sbagliata.

> **Questo vincolo è caduto con la fase 4.13**, e vale la pena dire perché si
> era sbagliato: guardare dentro la propria città non è una verifica tecnica, è
> il modo in cui una città densa si gode. Il giorno dopo averle viste
> funzionare, le viste erano già una funzione di gioco chiusa dietro `?debug=1`.
> Il resto della sezione resta com'era scritto: è il registro di cosa è successo
> allora, non una descrizione dello stato attuale.

**Gate:** su una città matura si legge come un isolato si incastra su più quote —
velato, a fette e in sezione — senza console, senza rigenerare la scena, e senza
che il frame esca dal budget mentre una vista è attiva.

**Come è stato risolto.** Nel materiale non è entrato il concetto di «modo».
Sono entrati **due predicati geometrici e una sola azione**: un semipiano, un
rettangolo con la propria polarità, e la densità di un retino ordinato su
`gl_FragCoord` con `discard`. I quattro modi sono quattro riempimenti diversi di
quelle uniform, e vivono in `src/engine/inspect.ts` — puro, senza Three e senza
DOM, verificato in `node` come `lighting.ts`. È la stessa separazione della 2.1
fra etichetta e terreno: la vista dichiara cosa vuole nascondere, il materiale
sa solo nasconderlo.

**Velare e tagliare sono la stessa manopola.** A densità 1 il retino scarta ogni
pixel, cioè taglia; sotto, lascia passare il tessuto dietro. Non servono due
percorsi, e `transparent` resta `false` perché il retino non è alpha blending —
niente ordinamento, niente da ripensare quando arriveranno le campate della 4.5.
Solo il taglio chiede il tappo, e il tappo è `DoubleSide` più `gl_FrontFacing`
sulla stessa geometria: la sezione verticale, misurata a schermo, non lascia
vedere il cielo attraverso un volume tagliato. Quello che si vede dentro è un
**guscio vuoto**, e non è un difetto: il mesher non emette facce interne, e i
riferimenti citati qui sotto hanno esattamente lo stesso aspetto.

**Il `discard` non lo paga chi non lo usa.** Un `discard` raggiungibile nel
sorgente può costare l'early-Z su tutta la scena, e queste sono viste
dell'harness. Il blocco entra nel fragment **alla prima attivazione**: una
ricompilazione per sessione, mai spontanea, e da lì in poi spegnere una vista
significa riscrivere il payload neutro. L'invariante che conta — cambiare tema
non ricompila niente — è sorvegliato dal test che già c'era, esteso a entrambe
le varianti del sorgente.

**Due cose le ha trovate solo lo schermo.** La prima: il semipiano dei raggi X,
da solo, non apre una finestra — **dissolve mezza città**, perché in ortografica
tutto ciò che sta davanti alla colonna è metà dell'inquadratura. Il rettangolo,
che serviva all'isolato, è diventato il secondo predicato di tutti: i due si
intersecano, e la polarità decide se a nascondersi è il dentro (la finestra dei
raggi X) o il fuori (l'isolato). La seconda: la fetta a una quota assoluta
partiva **dentro la collina** — il nucleo della città sta a una quarantina di
voxel sul mare — e il primo colpo d'occhio era l'interno della terra. Finché la
quota non viene scelta, la fetta segue il suolo che si sta guardando; al primo
tasto o al primo trascinamento diventa assoluta.

**Le ombre.** La shadow map non sa del taglio, quindi il piano appena scoperto
resterebbe all'ombra dei piani che si sono nascosti — ed è proprio la lettura che
la fetta esiste per dare. Finché un taglio è attivo le ombre proiettate si
spengono; sole e ambiente restano, quindi le facce continuano a distinguersi e il
risultato legge come un disegno tecnico invece che come una scena piatta.

**Costo e misure.** La colonna a fuoco si risolve **una volta per frame** e non a
ogni `pointermove`: il costo non dipende da quanto si muove il mouse, e la vista
segue anche la rotazione della camera. Su una città di ~490 edifici, `mainMs`
resta sotto il millisecondo con ogni modo attivo, dentro `FRAME_BUDGET_MS`.
Geometria, chunk con mesh e voxel solidi sono **identici bit a bit** con ogni
vista accesa e dopo un cambio di tema: il mesher non è stato toccato (invariante
6) e il suo worker resta 8,64 kB. Le draw call in un modo che taglia scendono da
398 a 116, ma non è merito del taglio: è la pass d'ombra che non gira. Nessuna
tabella di misura di `README.md` o `src/sim/README.md` è stata aggiornata, perché
questa fase non entra né nel mesher né nella simulazione.

**Resta aperto.** Il volume nascosto **continua a proiettare ombra**: nel taglio
si spengono tutte, che è la risposta a costo zero; far sì che solo il volume
nascosto smetta di proiettare vuole lo stesso predicato nel materiale di
profondità di `SunShadow`, cioè un secondo shader da tenere allineato a mano. Il
velo non distingue terreno da edificio — il mesher non porta quell'informazione,
e chiedergliela sarebbe la vista sbagliata — quindi i raggi X aprono anche il
suolo davanti alla colonna. E le viste restano dell'harness: niente icona, niente
stato sui sette temi, niente comportamento da giocatore. Se un giorno
l'ispezione diventerà un'azione del gioco, sarà la fase 7 a darle una pelle.

**Riferimenti.**

- [Going Medieval — view between layers/floors](https://steamcommunity.com/app/1029780/discussions/0/4361250086034818336/)
  e la [guida al costruito verticale di Timberborn](https://timberborn.org/articles/vertical-building-stacking-guide):
  la fetta a quota vista dal lato di chi la usa, difetti compresi.
- [Isometric visibility problem](https://www.gamedev.net/forums/topic/664146-isometric-visibility-problem/)
  e [Reducing occlusions in oblique views](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8253736):
  la tassonomia completa — velare, ritagliare, mostrare silhouette, spostare la
  camera — e il motivo per cui velare è l'opzione che perde meno informazione.
- [Clipping planes on ShaderMaterial](https://discourse.threejs.org/t/clipping-planes-on-shadermaterial/10155)
  e [Closing up clipped planes using shaders](https://discourse.threejs.org/t/closing-up-clipped-planes-using-shaders/18030):
  perché un `ShaderMaterial` non eredita il clipping gratis, e come si tappa il
  taglio.
- [Camera Tool in Cities: Skylines II](https://steamcommunity.com/app/949230/discussions/0/3937895474112407245/):
  la strada opposta — entrare fisicamente negli edifici invece di renderli
  porosi. Non è la nostra, perché la camera qui è ortografica e vincolata, ma
  spiega cosa i giocatori cercano quando la città diventa opaca.
