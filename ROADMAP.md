# Roadmap — H10 Voxel City Builder

## Visione

Una città-isola automatica, enorme ma leggibile come una miniatura voxel. Il
giocatore non disegna ogni edificio: modifica le condizioni della crescita con
catalizzatori, policy ed espansioni territoriali, poi osserva la città adattarsi.

Il principio guida è **poche decisioni con conseguenze visibili**. Ogni nuova
meccanica deve cambiare chiaramente forma della città, economia o uso del suolo
senza compromettere i 60 fps nel browser.

## Stato attuale — MVP

- Isola procedurale deterministica, streaming in worker e mappa di edificabilità.
- Motore voxel a chunk con greedy meshing, shader condiviso e temi a palette.
- Crescita automatica di edifici residenziali, produttivi e civici fino al livello 6.
- Risorse, popolazione, soddisfazione, policy e campo di desiderabilità.
- Piazzamento dei catalizzatori tramite click, anteprima e messaggi di validazione.
- Acquisto di settori costieri, pausa e velocità della simulazione.
- Overlay diagnostico e suite di test per motore, terreno, simulazione e crescita.

## Fase 1 — Rendere solido il ciclo di gioco

Obiettivo: una sessione di 20–30 minuti comprensibile, recuperabile e senza
azioni morte.

- Creare un onboarding giocabile: primo catalizzatore residenziale, poi
  produttivo, infine civico; spiegare perché l’ordine conta.
- Ribilanciare l’avvio affinché una scelta imperfetta rallenti la città senza
  portarla rapidamente a popolazione zero o a uno stato irrecuperabile.
- Mostrare sul cursore costo, raggio, classe e motivo di invalidità prima del click.
- Rendere evidente la zona d’influenza di catalizzatori esistenti e selezionati.
- Impedire acquisti duplicati dello stesso settore e indicare i settori già sbloccati.
- Trasformare l’espansione in nuovo suolo strategicamente utile, non in sola
  superficie oceanica; mantenere continuità e streaming a budget.
- Aggiungere condizioni semplici di successo e crisi per dare una direzione alla partita.

**Gate:** un nuovo giocatore riesce a creare una città autosufficiente senza
console o istruzioni esterne; tutte le azioni hanno feedback immediato e una via
di recupero.

## Fase 2 — Decisioni e identità dei distretti

Obiettivo: città diverse a partire dalla stessa isola.

- Introdurre catalizzatori con ruolo distinto: porto, mercato, fabbrica,
  trasporto, parco, università e monumento.
- Dare a ogni policy un vantaggio, un costo continuativo e una conseguenza
  spaziale osservabile; aggiungere incompatibilità fra alcune policy.
- Creare distretti emergenti da sovrapposizione dei campi, senza zoning manuale
  cella per cella.
- Collegare livelli e forma degli edifici a densità, ricchezza, accessibilità e
  soddisfazione locale.
- Aggiungere decisioni periodiche brevi con due o tre alternative e risultati
  deterministici derivati dallo stato della città.
- Introdurre commercio esterno minimale per cibo, materiali e fondi, con il porto
  come primo collegamento dell’isola al mondo.

**Gate:** almeno tre strategie valide producono skyline, bilanci e rischi
riconoscibilmente diversi.

## Fase 3 — Forma urbana procedurale

Obiettivo: avvicinare la resa alla città verticale e stratificata dei riferimenti.

- Generare strade e percorsi principali come scheletro procedurale influenzato da
  terreno, costa e catalizzatori.
- Raggruppare gli edifici in isolati, terrazze e cluster verticali mantenendo un
  voxel come unità volumetrica, non come dettaglio architettonico.
- Aggiungere ponti, moli, muri di contenimento, piazze e collegamenti fra quote.
- Ampliare le grammatiche degli edifici con basamenti, arretramenti, torri,
  coronamenti e accenti luminosi specifici per classe e livello.
- Preservare una corona naturale e creare una transizione leggibile fra costa,
  periferia, centro e skyline.
- Migliorare atmosfera e profondità con nebbia, acqua e luce stilizzata restando
  nel materiale condiviso e senza texture o PBR.

**Gate:** la silhouette racconta la struttura economica della città anche con UI
nascosta e resta leggibile alle normali distanze di gioco.

## Fase 4 — Persistenza e prodotto browser

Obiettivo: trasformare la demo in un gioco riprendibile e distribuibile.

- Salvare seed, simulazione, catalizzatori, policy, settori e registro edifici in
  un formato versionato; ricostruire terreno e campo invece di serializzare buffer derivati.
- Aggiungere autosave locale, slot manuali, esportazione e importazione JSON.
- Separare UI di gioco e diagnostica; rendere accessibili controlli, colori e testi.
- Adattare layout e input a schermi più piccoli, mantenendo desktop come target principale.
- Aggiungere menu iniziale, scelta del seed, difficoltà e riepilogo della partita.
- Preparare deploy statico, telemetria opt-in degli errori e gestione delle versioni dei salvataggi.

**Gate:** ricaricare o aggiornare il browser non perde la partita e una build
statica può essere pubblicata senza strumenti di sviluppo.

## Fase 5 — Ottimizzazione e scala

Questa fase accompagna tutte le precedenti; nessuna funzionalità supera il gate
se rompe i budget esistenti.

- Mantenere 60 fps desktop, lavoro non-render sotto 4 ms per frame e crescita a
  costo limitato indipendente dal numero totale di edifici.
- Aggiungere scenari automatici di soak per città grandi, espansioni consecutive
  e cambi frequenti di policy.
- Misurare separatamente generazione, applicazione voxel, meshing, upload e UI.
- Introdurre livelli di dettaglio o batching aggiuntivo solo dopo misure reali,
  preservando palette a uniform e una geometria per chunk finché restano adeguati.
- Verificare periodicamente GPU integrata, memoria, tempo di startup e dimensione bundle.

## Prossimo milestone consigliato — Alpha 0.2

1. Tutorial iniziale e feedback del raggio dei catalizzatori.
2. Bilanciamento recuperabile di popolazione, cibo e produzione.
3. Settori costieri unici che aggiungono terreno realmente edificabile.
4. Costi continuativi e conseguenze visibili per le sei policy esistenti.
5. Primo sistema di strade procedurali usato come scheletro della crescita.
6. Salvataggio locale minimo del ciclo completo.
7. Playtest di 30 minuti con budget e criteri automatici registrati.

Alpha 0.2 è completa quando una partita ha apertura, sviluppo ed espansione
leggibili, due strategie sostenibili e un salvataggio ripristinabile, senza
regressioni rispetto ai contratti e ai budget dell’MVP.

