# Landmark di facciata

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **La presenza di un edificio sotto la colonna sceglie la ricetta.** L'aeroporto
  e' l'unico ruolo con due forme — il campo di volo e lo scalo in quota,
  `SKYPORT` — e non ha un secondo strumento: puntare un grattacielo *e'* la
  richiesta di uno scalo appeso alla facciata, puntare il prato accanto quella di una pista.
  E' l'unica scelta di forma di questo dominio che dipende dal luogo invece che
  dal seme, e non poteva essere un esemplare: un campo di volo largo ventisei
  colonne non sta su nessuna facciata, perche' `MAX_FOOTPRINT` e' otto.
- **Lo scalo usa la stessa lettura di facciata delle terrazze.** `faceRuns`
  sceglie una fascia o il ripiego sulla parete piena; il fronte strada viene
  provato per primo. La piattaforma resta interamente fuori dall'impronta,
  centrata sulla larghezza completa della facciata, mentre il carico si ancora
  soltanto alla corsa di muro realmente piena. Cosi' una torre 8×8 con angoli
  smussati porta lo Skyport pur offrendo sei voxel continui di parete.
- **Lo sporto conserva gli appoggi di `planDeck`.** Dove la profondita' supera
  `AERIAL.reach` nascono piloni come per una terrazza; la ricetta dello Skyport
  disegna gia' soletta e bordo, quindi non si registra una seconda terrazza
  sovrapposta.
- Un landmark in quota e' un record con `aloft`, la quarta riga della stessa
  macchina di `landmark`, `span` e `aerial`. Non prende le colonne di suolo —
  sotto ci passa ancora la carreggiata — e mette il proprio ospite fra quelli che
  **non promuovono**: chi regge non cresce, come per una mensola.
- Non ha ne' opera di terra ne' grembiule, e le due assenze sono la stessa cosa
  detta due volte: **qui sotto non c'e' terreno**.
