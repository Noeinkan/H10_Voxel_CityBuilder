# Arcologie

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **E' la quinta riga della stessa macchina**, dopo `landmark`, `span`, `aerial`
  e `aloft`: un `BuildingRecord` con `arcology` valorizzato eredita occupazione,
  collisione, budget di chunk e comparsa a budget, e a cambiare e' solo quale
  generatore disegna lo stamp. `level` e' lo **stadio**, come per un landmark, e
  il record sta fuori dal `levelHistogram`.
- **Non si posa: nasce da una condizione.** Non c'e' nessuno strumento in
  toolbar e nessuna riga in `src/sim/`. Le leve del giocatore restano quelle che
  ci sono gia' — dove piazza i catalizzatori, quali policy tiene accese — e
  `arcologyReady` legge cio' che ne e' venuto: fascia `core`, isolato che
  contiene l'ingombro, densita' costruita e **crescita effettivamente esaurita
  nei vicini**. Conta chi ha raggiunto la quota ammessa e anche l'ospite reso
  immutabile da un impalcato abitato: in quel caso la citta' in quota ha gia'
  consumato la possibilita' di promuoverlo. Questa e' la mezza riga che rende la
  fase quello che dice di essere: la megastruttura arriva dove la citta' non ha
  piu' niente da diventare, non dove e' semplicemente densa.
- **Gli usi arrivano alla simulazione uno per fascia, su colonne distinte.**
  `record.uses` e' l'elenco di cio' che `addBuilding` ha **accettato**, in ordine
  di stadio: `tally` conta quelle voci invece della `class` del record, ed e'
  cosi' che `countsByClass` resta esattamente uguale a `state.buildingCounts`
  (invariante 7) mentre `src/sim/` continua a non avere una coordinata verticale.
  Un'arcologia e' quindi *un* record e *N* edifici per la simulazione:
  `registry.count` e `state.buildings.length` non coincidono, e la differenza e'
  esattamente la somma degli `uses`.
- **Cresce per delta, non per sagoma cumulativa.** L'inviluppo arriva a 735
  quote e non potrebbe entrare intero in `maxDirtyChunksPerBuilding`: ogni
  stadio accoda il proprio `from = stage`, e `trimStampZ` taglia le quote vuote
  perche' la stima sul riquadro sia onesta. Il tetto di 56 chunk vale per il
  delta non affettato; l'altezza si ottiene aggiungendo stadi, mai allungandone
  uno oltre il proprio budget. Senza il taglio una ricetta legittima verrebbe
  **scartata in silenzio**.
- **Le soglie dipendono dal numero di stadi, non dalla ricetta.** Il corpo parte
  a 50 vicini, sotto la condizione di fondazione, e ogni corona arriva a 93:
  `stageThresholds` interpola gli stadi intermedi su una curva quadratica. Una
  ricetta piu' articolata non diventa per questo meno probabile da completare.
- **Le sagome nuove si sommano alle matrici, non le sostituiscono.** Le otto
  ricette storiche restano in `BASE_ARCOLOGY_RECIPES`; ogni voce di
  `PROFILE_ARCOLOGY_RECIPES` dichiara `variationOf` e cambia il profilo con
  corpi che terminano su quote diverse. Il driver sceglie dall'unione dei due
  cataloghi, mentre test e campionario possono ancora distinguerli.
- **Il vuoto dentro l'ingombro e' un vincolo di ricetta.** `skyWindowOf` e
  `fillRatio` girano su ogni ricetta a ogni stadio: una finestra aperta non si
  richiude piu', e un'arcologia che riempie il proprio ingombro non compila la
  suite.
- **I piazzali sono capi di percorso, e hanno tre requisiti misurati.** Devono
  stare entro `maxNodes * stepPerNode` dal piano finito, essere larghi almeno
  `walkWidth` su **tutti e due** gli assi, e non partire a filo di un piano
  solido della struttura — altrimenti la corsia nasce dentro il podio. Ognuno dei
  tre e' stato violato da una versione della ricetta con la suite pura tutta
  verde.
