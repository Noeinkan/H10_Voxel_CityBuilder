# Fase 4.12 — I catalizzatori diventano strutture

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Nessuna dipendenza forte. Vive in `src/world/` e riusa la macchina di crescita
degli edifici invece di aggiungerne una.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono ingombri, determinismo, stadi cumulativi,
invarianza per rotazione e budget di chunk, non la leggibilità a distanza di
gioco.

**Perché la fase si è aperta.** Un giocatore ha guardato il porto e ha detto che
faceva schifo, e aveva ragione due volte. Primo: **il porto non esisteva**.
Quello che si vedeva sull'acqua era la carreggiata dell'isolato costiero —
`groundKindOf` chiama `shore` ogni colonna d'acqua entro `maxQuayDepth`, quindi
`rampAround` portava l'intero anello di strada a `quayLevel` e ne costruiva il
muro fino al fondale. Secondo: tutti e otto i ruoli condividevano lo stesso rombo
di asfalto di raggio quattro, e si distinguevano per il colore di **un voxel** al
centro. La fase 3 aveva chiuso «catalizzatori con ruolo distinto» sul piano della
simulazione e mai su quello della forma.


**Vincolo:** un landmark non è un tipo nuovo di cosa. È un `BuildingRecord` con
un campo in più, e tutto ciò che lo governa — occupazione, collisione, budget di
chunk, comparsa a budget, avanzamento — è la macchina degli edifici. Se una forma
chiede una passata propria, è la forma a essere sbagliata.

**Gate:** i sette ruoli si riconoscono dalla sagoma senza overlay e senza
tooltip; il porto legge come porto e non come piattaforma; la crescita resta
dentro i budget con più landmark in comparsa insieme.

**Come è stato risolto.** L'idea portante è che **la macchina esisteva già**.
`upgradePass` percorre i record a cursore, verifica un tetto, rigenera vecchia e
nuova sagoma, sostituisce il record e accoda la comparsa a budget; `upgrade`
limita l'allargamento con `blockRoom`, `fitsWider`, `dirtyChunkCount` e
`surveyGrade`. Un landmark è quindi un record con `landmark: CatalystId`, e
l'unico ramo nuovo in tutto il Builder è quale generatore disegna lo stamp.
Nessuna passata in più, nessun secondo indice, nessuno stato nuovo.

**Cosa fa avanzare uno stadio, e perché non la desiderabilità.** Un catalizzatore
siede al centro della propria influenza: il campo lì è quasi sempre saturo,
quindi un landmark che leggesse `field.valueAt` salterebbe tutti gli stadi al
primo tick. Lo stadio conta invece i record entro il raggio del catalizzatore —
ciò che la città ha davvero costruito. È il modello dei
[monumenti di Anno 1800](https://anno1800.fandom.com/wiki/Monuments), una
costruzione a fasi che corona una città *già edificata*
([devblog](https://www.anno-union.com/devblog-welcome-to-the-world-fair/)), detto
con il solo dato che il Builder possiede. Non serve stato: è una funzione pura
del contenuto del registry, ed è monotona perché nessuno demolisce.

**Gli stadi sono cumulativi dentro un ingombro che non cambia mai**, riservato
per intero al piazzamento. Due garanzie invece di due controlli: un landmark non
può restare bloccato a metà perché nel frattempo è cresciuto un edificio accanto,
e la sagoma dello stadio precedente non ha mai niente da cancellare.

**Due difetti trovati dai test.** I pilastri di `colonnade` contavano il passo da
un capo solo, quindi su un lato non multiplo del passo la ricetta smetteva di
essere invariante per rotazione — e si vedeva come un conto di voxel diverso a
seconda del verso, dove due parti si sovrappongono. E le prime ricette erano
larghe sedici voxel, quasi un isolato: seppellivano la sovrapposizione fra due
catalizzatori, cioè esattamente il punto dove nascono gli usi misti. A dirlo è
stato un test di fase 3 già in suite, che è il modo migliore in cui poteva
saltare fuori.

**Costo e misure.** `generateLandmark` gira al piazzamento e a ogni avanzamento
di stadio, cioè unità di volte per partita, e `landmarkPass` scorre i soli record
con `landmark` una volta ogni `ticksPerUpgrade`. `stageBonus` entra in
`balance.ts`: **le tabelle di misura in `README.md` e `src/sim/README.md` vanno
rimisurate a mano**, e non sono state aggiornate qui.

**Resta aperto.** Le forme lineari sono limitate da `LANDMARK.maxDirtyChunks` e
non ancora spezzate in segmenti: una pista davvero lunga — o un viadotto che
attraversi mezzo isolato — chiede la segmentazione della 4.5, e va fatta lì.
Il landmark non partecipa ancora alla città in quota: il suo impalcato è un
volume del registry come gli altri, quindi la 4.9 potrebbe già costruirci sopra,
ma nessuno gliel'ha ancora chiesto. E la ricetta non varia con il seme: la forma
è una funzione di `(ruolo, stadio, verso)`, scelta perché il giocatore deve
riconoscere il ruolo dalla sagoma e non imparare otto sagome moltiplicate per i
semi — se un giorno si vorrà varietà, andrà aggiunta senza toccare quel patto.
