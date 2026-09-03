# Fase 3 — Usi urbani e tipologie ibride

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

**Stato implementazione:** completata. Il gate resta da validare con un playtest
che confronti una città mercantile e una industriale a occhio, senza overlay.


**Gate:** mercato e industria producono cicli economici distinguibili, gli
edifici misti emergono da sovrapposizioni comprensibili e almeno sei tipologie
sono riconoscibili per forma e funzione senza selezionare manualmente una zona.

**Come è stato risolto.** L'uso urbano è un indice denso in `src/sim/classes.ts`
e i quattro usi sono in ordine di contratto; un catalizzatore non ha più una
classe ma un vettore di influenza in `balance.ts`, che può anche essere negativo
— una fabbrica sottrae dal residenziale, e il clamp a zero del campo bastava già
a reggerlo. Il commercio interno vive in `src/sim/commerce.ts` e compete con
l'industria per la stessa forza lavoro e gli stessi materiali: è quella
competizione, non due bilanci separati, a rendere distinguibili i due cicli. La
tipologia è un catalogo di quindici righe in `world/buildings/config/typologies.ts` con la
sola regola di scelta in `typology.ts`, e piega la grammatica esistente con tre
interruttori — podio, corte, coronamento piatto — invece di introdurre modelli
disegnati a mano. La selezione dei siti è rimasta al suo costo perché il secondo
uso si cerca solo sui siti che entrano davvero in lista.
