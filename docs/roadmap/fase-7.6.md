# Fase 7.6 — Leggibilità delle cause

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Le altre cinque sottofasi lavorano sulla leggibilità dello **stato**: cosa c'è
adesso, dove sta andando, cosa si può premere. Questa lavora sulla leggibilità
della **causa**, che è un difetto diverso e più grave: il giocatore vedeva i due
capi della catena — piazzo un catalizzatore, compare un edificio — e mai il
mezzo. Diciotto soglie in `specializationOf`, più i cancelli di ogni riga del
catalogo delle tipologie, non comparivano in nessuna superficie del gioco.

Il principio è quello che la 7.4 aveva già trovato per i bottoni e mai applicato
altrove: **dove il gioco nomina un esito, nomina accanto la condizione
vincolante** — la più lontana, non la prima.


**Stato implementazione:** completata. **Il gate resta da validare a schermo:** i
test coprono le regole — che il requisito riportato sia quello vincolante, che
chiuderlo basti davvero a ottenere la specializzazione, che le due letture di
`accepts` non divergano — non se un giocatore che non ha letto il codice
*capisca*, cliccando in giro, come si arriva a una torre idroponica. Quello si
misura con qualcuno davanti allo schermo, non con `npm test`.

**Gate:** un giocatore che non ha mai visto il codice sa dire, cliccando su un
isolato, cosa dovrebbe cambiare perché ci nasca una forma che ancora non c'è.
