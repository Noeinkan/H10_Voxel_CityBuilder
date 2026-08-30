# H10 Voxel City Builder — scheda di prodotto

> **Un'isola che si costruisce da sola. Tu decidi a quali condizioni.**

Un city builder isometrico a voxel che gira **nel browser, senza installare
niente**. Non si disegnano edifici uno per uno: si posano pochi catalizzatori, si
scelgono poche regole, e la città cresce da sé — strade, isolati, campagna,
torri — reagendo a ciò che si è deciso.

---

## Cos'è, in un paragrafo

Un'isola procedurale nasce da un seed. Sopra di lei una simulazione a tick tiene
risorse, popolazione, commercio e un campo di *desiderabilità* per uso del suolo:
è quel campo a dire dove converrebbe costruire e cosa. Un costruttore automatico
traduce quelle decisioni in volumi voxel veri — case, botteghe, capannoni,
edifici a uso misto, torri — allineati a una rete stradale che esisteva prima di
loro. Il giocatore non tocca né l'una né gli altri: **modifica le condizioni**, e
guarda la città rispondere.

È la differenza fra disegnare una città e coltivarla.

## Cosa fa il giocatore

Poche decisioni, tutte con una conseguenza che si vede a schermo.

| Gesto | Cosa cambia |
| --- | --- |
| **Posare un catalizzatore** | Otto ruoli — porto, aeroporto, mercato, fabbrica, trasporto, parco, università, monumento. Ognuno favorisce certi usi del suolo e ne penalizza altri, dentro un raggio visibile prima del click. Ogni ruolo pretende il suo luogo: il porto vuole la costa, l'aeroporto un piano largo |
| **Attivare una policy** | Un vantaggio, un costo che continua a pesare ogni tick, e una conseguenza spaziale. Alcune sono incompatibili fra loro |
| **Rispondere a una decisione** | Due o tre alternative, esito deterministico, e un **mandato permanente** che piega la forma di ciò che nascerà dopo — uno slot per famiglia, come un libro di leggi: la città porta l'ultima scelta, non la somma di tutte |
| **Comprare un settore costiero** | Suolo nuovo e davvero edificabile, non superficie d'oceano |
| **Guardare dentro** | Quattro viste — *X-ray*, *Levels*, *Cutaway*, *Block focus* — che aprono una città diventata opaca. Sono comandi di gioco, non strumenti da console |

## Cosa succede senza che nessuno lo chieda

- **L'isola**: rilievo, biomi, coste, terrazzamenti e boschi, tutto da un seed.
- **Le strade**: una rete deterministica che nasce prima degli edifici e li
  orienta; le pendenze si risolvono con rampe, terrapieni e banchine invece di
  fermare la crescita.
- **Gli edifici**: quattro usi del suolo — residenziale, commerciale,
  industriale, civico — più quelli a uso misto, con tipologie scelte dal luogo e
  una grammatica verticale che dà podi, arretramenti, terrazze e coronamenti
  diversi. A parità di seed la silhouette è sempre la stessa.
- **La campagna**: campi arati, frutteti e torri idroponiche che costano **terra**
  — crescere significa mangiarsi la propria dispensa, e a un certo punto la
  risposta è salire.
- **L'alto**: campate che non poggiano a terra, piazze sopra il cuore degli
  isolati, landmark, e arcologie che da sole valgono un quartiere.

## Cinque cose che lo distinguono

1. **Non si costruisce, si orienta.** Nessuno zoning cella per cella, nessun
   edificio piazzato a mano: si cambiano le pressioni e si osserva l'esito.
2. **La verticale è una dimensione di crescita, non un attributo.** Un edificio
   più alto è solo un numero più grande; qui l'obiettivo dichiarato è una città
   che si **richiude sopra sé stessa** — impalcati abitati, parchi in quota,
   megastrutture. È la direzione della prossima milestone, non una rifinitura.
3. **Leggibile come una miniatura.** Il terreno è fatto di cubi più grossi degli
   edifici, di proposito: è l'unica cosa che dà la scala all'isola e fa capire, a
   colpo d'occhio, se quella è una casa o un cespuglio.
4. **Sette temi, cambiabili a caldo.** Naturale, pastello, neon, industriale,
   sci-fi, incantato, diorama: cambiano cielo, luce, nebbia e palette in un
   istante, e l'interfaccia cambia con loro invece di restare crema sotto ogni
   cielo.
5. **Un seed è una città.** Stesso seed, stessa isola, ovunque e sempre: si
   condivide un numero, non un file da centinaia di megabyte.

## Una sessione tipo

Venti-trenta minuti, con un arco riconoscibile.

**Apertura** — il primo catalizzatore residenziale accende un nucleo di case.
**Sviluppo** — arriva il produttivo, poi il civico; l'ordine conta, e il gioco lo
spiega mentre lo si fa. **Tensione** — la popolazione supera la dispensa, i campi
finiscono sotto gli isolati, il bilancio si stringe: la crisi si legge nell'HUD
prima che diventi irreversibile, e c'è sempre una via di recupero.
**Espansione** — un settore costiero, un porto o un aeroporto, e il commercio
esterno cambia scala alla partita. **Identità** — a fine partita due città
cresciute dallo stesso seed hanno skyline diversi, perché diverse erano le
decisioni.

La partita si salva da sola nel browser, si riprende da dove era, e un file JSON
la porta altrove.

## A chi serve

**Chi gioca city builder e li vuole calmi.** Il registro è quello di
*Dorfromantik* e *Timberborn* più che quello di un simulatore gestionale: poche
decisioni, conseguenze visibili, nessuna micro-gestione di singoli abitanti. Se
l'idea di guardare una città crescere e capire *perché* sta crescendo così è
attraente, è per te.

**Chi ama la generazione procedurale.** Isole, strade, terrazzamenti, tipologie
edilizie e microgeometria architettonica escono tutti da regole, mai da modelli
disegnati a mano. C'è molto da guardare per chi guarda con quell'occhio.

**Chi valuta il motore.** Studi, sviluppatori e tecnici interessati al voxel
rendering nel browser trovano un caso reale: greedy meshing in worker senza
Three.js dentro, una sola draw call per chunk, colore che vive nell'uniform e non
nei vertici, simulazione pura testabile in Node. La documentazione tecnica sta in
[README.md](README.md), le motivazioni e i contratti in [AGENTS.md](AGENTS.md).

**Chi non è il pubblico.** Chi cerca cittadini simulati uno per uno, traffico con
pathfinding vero, audio o una versione mobile: non ci sono, e non sono in
programma a breve. Il desktop è il target.

## Come si prova

Un browser moderno su desktop e un dev server locale:

```bash
npm install
npm start        # poi apri http://localhost:8020/
```

La radice avvia la sessione completa: isola, crescita e HUD giocabile. Con
`?seed=<numero>` si riapre esattamente la stessa isola. `npm run build` produce
una build statica pubblicabile.

## Stato: alpha, e onesta

Il ciclo di gioco è completo e giocabile — crescita, economia, policy, decisioni,
espansione, salvataggio e ripresa. Il progetto è però in **alpha**: manca il menu
iniziale con scelta di seed e difficoltà, l'adattamento a schermi piccoli e la
seconda passata su iconografia e movimento dell'interfaccia. Il budget di
prestazione è dichiarato e vincolante — 60 fps su desktop, lavoro non-render
sotto i pochi millisecondi per frame — e nessuna funzionalità entra se lo rompe;
le tabelle di misura pubblicate sono in corso di ri-verifica dopo l'ultimo
cambio di scala del contenuto.

**Dove va.** La milestone successiva porta a schermo la seconda metà della
visione: due livelli abitati sovrapposti nella stessa inquadratura e un percorso
continuo in quota fra due isolati diversi. Il dettaglio, con i suoi gate, sta in
[ROADMAP.md](ROADMAP.md).

## Disponibilità e licenza

Copyright © 2026 Andrea Aita (Noeinkan). Tutti i diritti riservati.

Il progetto **non è open source**: il codice è visibile per essere mostrato, non
per essere riusato. Provarlo in locale sì; copie, opere derivate, port,
redistribuzione e uso come materiale di addestramento per modelli di IA non sono
consentiti senza permesso scritto. I termini completi stanno in
[LICENSE](LICENSE).
