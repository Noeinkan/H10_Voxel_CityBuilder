# Fase 4.3 — Grammatica verticale degli edifici

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Indipendente da 4.1 e 4.2: è lavoro sullo stamp, verificabile in Node senza
mondo e senza terreno. Può procedere in parallelo.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono determinismo, cime distinguibili, terrazze e
soglie luminose, non la leggibilità a distanza di gioco.


**Gate:** a parità di seed le silhouette restano deterministiche e distinguibili
per uso; nessuno slot di palette e nessun tipo di superficie in più.

**Come è stato risolto.** Le trasformazioni sono diventate una **tabella**,
`BAND_OP`, e quali voci un edificio prova — e in che ordine — arriva dal profilo,
non dal codice. È la mossa che ha tolto di mezzo l'ultimo caso speciale rimasto
nella grammatica: il basamento non è più un ramo del ciclo delle fasce ma `keep`
ripetuto, e l'arretramento netto sopra di esso è `shrink`, cioè due voci della
stessa tabella da cui pesca tutto il resto. Il repertorio vive in `ClassProfile`
e non in `TypologyShape`, e non è un dettaglio: `typologyProfile` fonde già
profilo dell'uso e profilo della tipologia, quindi una riga di catalogo può
ridefinire il repertorio **senza una riga di plumbing in più**.

Le due operazioni nuove sono `setback` — due voxel su un lato, cioè un cubo di
terreno, la più piccola rientranza in cui ci si sta — e `stack`, che rientra di
due per lato e ricentra. Il corpo sovrapposto non ha un contatore che lo limiti a
una volta: `stack` si rifiuta di produrre un risultato sotto `MIN_FOOTPRINT`,
quindi su una torre da otto scatta una volta sola e poi la geometria lo esaurisce
da sé. Nessuna delle due può sfuggire a `supported`, perché entrambe restano
dentro il rettangolo precedente.

**Il coronamento era un booleano e dava due sole cime a tutta la città.** Ora è
`CROWN_KIND` con cinque voci — `taper`, `flat`, `stepped`, `ridge`, `lantern` —
e `paint` ha smesso di riconoscere il coronamento per posizione: `crownStart` ha
sostituito `rects.length - 2`, che assumeva esattamente una fascia e impediva un
cappello a gradoni. La distinzione **per uso** non è un ramo nel generatore: sono
i quattro ripieghi del catalogo, uno per uso, a portarsi la propria cima. Quella
**per livello** è `minLevel` sulle righe nuove, criterio che `accepts` già
valutava — e che funziona anche senza profilo locale, perché `demandsPlace` non
lo elenca.

**La terrazza non è una fascia in più.** È la sommità di una fascia dove quella
sopra non arriva: un anello che la grammatica produce da sempre e che finora
restava verniciato come una parete. Chiedere `roofTech` per quell'anello gli fa
arrivare il parapetto da `emitRoofTech`, che già emette dove un tetto confina con
l'aria — la terrazza si arreda **senza toccare il mesher** e senza un tipo di
superficie nuovo. Vale sul solo corpo: il coronamento è già tetto, e trattarne la
sommità come una rientranza avrebbe pavimentato la copertura di ogni edificio a
tetto piatto, che non è una terrazza ma il tetto di prima ridipinto.

**Due difetti che solo i test hanno rivelato.** Il primo era preesistente e la
4.3 lo ha reso visibile: una catena di rientranze portava la cima a **un voxel**,
e sopra un voxel tutti i coronamenti si assomigliano. Ora `GRAMMAR.minBandSide`
è un pavimento nello stesso filtro che già scartava le candidate fuori riquadro —
il coronamento può assottigliarsi oltre, perché è il suo mestiere, il corpo no.
Il secondo era il commento che spiega il bagliore nello shader: `VoxelMaterial`
compone il fragment shader in un template literal, e un backtick dentro un
commento GLSL rompe il bundle e non il rendering.

**Costo, misurato.** A/B vero sullo stesso script — sedici edifici veri di
livello 4, quattro usi, impacchettati in un chunk — con l'albero di lavoro e con
lo stesso albero senza le modifiche di questa fase:

| | quad base | quad di dettaglio | totale |
| --- | --- | --- | --- |
| prima della 4.3 | 2 156 | **6 810** | 8 966 |
| con la 4.3 | 1 805 | **5 015** | 6 820 |

I quad di dettaglio **calano del 26%**, contro il rischio opposto che la fase
portava: il margine sotto `MAX_DETAIL_QUADS_PER_CHUNK` cresce invece di
consumarsi. Non è fortuna in due parti. La soglia luminosa toglie l'accento agli
edifici bassi, che sono la maggioranza, e ogni faccia spenta è una corsa di
`emitLuminous` in meno; e la terrazza è quasi neutra per costruzione, perché le
celle che passano a `roofTech` sono le stesse che prima ricevevano una mensola da
`emitHabitat` — una corsa al posto di una corsa. `generateBuilding` resta fuori
dal ciclo di frame: gira al piazzamento e all'upgrade. **Le tabelle di misura in
`README.md` e `src/sim/README.md` vanno rimisurate a mano**, e non sono state
aggiornate qui.

**Resta aperto.** Tutte le silhouette sono cambiate, ed è previsto: aggiungere
una voce al repertorio cambia il passo del PRNG per ogni edificio. Non c'è
persistenza da invalidare — la fase 5 non è iniziata — e il `Builder` rigenera lo
stamp da cancellare dal *record*, quindi entro una sessione la coerenza regge. La
grammatica non è più **per edificio singolo**: la 4.4 le ha dato un corso di base
condiviso, e sopra di esso l'arretramento cade alla stessa quota su tutta una
fila — ma resta un corso *di base*, e due arretramenti più in alto continuano a
non sapere l'uno dell'altro. Gli accenti luminosi non sanno ancora niente
dell'occupazione: si accendono per livello e non per quanta gente ci abita, che è
la 4.8.
