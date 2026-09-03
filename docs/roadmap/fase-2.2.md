# Fase 2.2 — Le decisioni lasciano un segno

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

**Stato implementazione:** completata. Il gate resta da validare con due partite
a confronto sullo stesso seed.

**Perché la fase 2 si riapre di nuovo.** Alle policy la fase 2 aveva chiesto «una
conseguenza spaziale osservabile»; alle decisioni no, e infatti non ce l'avevano.
`resolveDecision` spostava cibo, materiali, fondi e soddisfazione e finiva lì:
scegliere «Community gardens» invece di «Ration supplies» era indistinguibile a
schermo, contro il principio guida di questa roadmap.


**Perché lo slot e non la scadenza.** `urbanProfileAt` è una funzione spaziale e
il `Builder` la chiama a ogni piazzamento e a ogni promozione. Un mandato che
scade le farebbe leggere `tickCount`, e lo stesso stato produrrebbe edifici
diversi a seconda di quando lo si guarda — il contrario del contratto di
determinismo. Con lo slot il tetto è strutturale: tre vettori attivi al massimo,
e la città porta l'ultima scelta di ogni famiglia invece della somma di tutte. Il
modello è il *Book of Laws* di Frostpunk, dove i rami sono permanenti e
mutuamente esclusivi.

**Perché la tipologia e non solo il vettore.** Le fasce sono
`naturalBands + Math.floor(form.density * 2)` e poi vengono clampate ai limiti
del livello: un vettore che sposta la densità di 0,3 vale mezza fascia, che
`Math.floor` mangia. Una riga di catalogo concessa da un mandato cambia invece
podio, corte, coronamento, impronta minima e tutti i colori del profilo, e si
vede a colpo d'occhio.

**Costo e misure.** `urbanProfileAt` guadagna un ciclo su al massimo tre mandati,
sullo stesso percorso dei catalizzatori che già scorre. `tick` non è toccato: i
mandati non entrano in `resolveWeights` e risolvere una decisione non ricostruisce
il campo di desiderabilità. **Le tabelle di misura in `README.md` e
`src/sim/README.md` vanno rimisurate a mano** e non sono state aggiornate qui.

**Resta aperto.** Il mandato agisce solo su ciò che nasce o viene promosso dopo:
il tessuto già costruito non viene ridisegnato, quindi su una città matura la
differenza si accumula invece di comparire subito. L'opera concessa sceglie il
sito da sé — il giocatore non la posa — e se nessun candidato passa la convalida
la decisione resta valida senza opera.

**Gate:** due partite sullo stesso seed che divergono solo nelle decisioni
producono skyline riconoscibilmente diversi.
