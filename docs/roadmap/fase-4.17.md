# Fase 4.17 — Il distretto costiero dei landmark

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Vive in un dominio puro nuovo — `src/world/harbor/` — e in un driver
trasversale, `src/world/buildings/harborDriver.ts`.

**Stato implementazione:** completata. Il gate resta da validare a occhio su
un'isola vera: i test coprono contenimento, monotonia per stadio, geometria
delle opere e il percorso end-to-end fino alla tipologia di settore, non la
leggibilità del fronte a distanza di gioco.


**Vincolo:** nessuna porta nuova verso `src/sim/` — il ritorno resta il
catalizzatore che cresce con lo stadio; nessuna passata propria — il distretto
viaggia sulle code di sempre; niente oltre l'anello dichiarato.

**Gate:** una marina al terzo stadio legge come porticciolo scavato nella riva
con il suo quartiere di case sul canale, e un porto come polo logistico
riparato, senza overlay né tooltip.

**Resta aperto.** Le colonne scavate non cambiano la `TerrainMap`, quindi la
portata dell'influenza (`reachCost`) continua a leggere il bioma e non vede i
canali: è il disallineamento già noto del bacino della marina, esteso al
distretto. E gli slot di settore sono sul solo lato di terra: il molo
guadagnato al mare non ospita ancora edifici, perché la simulazione lo dichiara
oceano.
