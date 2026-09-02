# Regole per `src/world/buildings/`

Leggi sempre
[`docs/world/streets-buildings.md`](../../../docs/world/streets-buildings.md)
prima di modificare costruzione, crescita, registry o tipologie.

Per i driver specializzati leggi anche il riferimento pertinente:

- `aerialDriver*`: [citta' in quota](../../../docs/world/aerial-city.md);
- `arcologyDriver*`: [arcologie](../../../docs/world/arcology.md);
- `landmarkDriver*`: [landmark di facciata](../../../docs/world/rooftop-landmarks.md)
  e [opere di terra e acqua](../../../docs/world/grading-water.md);
- `crossingDriver*`: [opere di terra e acqua](../../../docs/world/grading-water.md).

Cadenze, tetti, profili e grammatica restano in `config/`, che si importa come
`./config` e resta una facciata sola: `builder.ts` per cadenze e budget,
`grammar.ts` per il vocabolario della forma, `levels.ts` per la massa di un
livello, `classProfile.ts` per l'aspetto di un uso, `typologies.ts` per il
catalogo, `styles.ts` per il tessuto di quartiere. Un numero nuovo va nel modulo
che risponde alla sua domanda, non in fondo al primo file aperto.

La tipologia vive qui: `src/sim/` non conosce la forma degli edifici.

Due moduli rispondono per tutti, e una struttura nuova passa di lì invece di
riscriverli:

- `structureKind.ts` dice **che cosa è** un record. È l'unico posto che legge
  `landmark`, `span`, `aerial`, `arcology`, `ropeway` e `aloft`: una domanda da
  sì o no è una colonna di `STRUCTURE_TRAITS`, una scelta fra comportamenti è uno
  `switch` esaustivo alla sua sede. Leggere quei campi altrove per classificare —
  leggerne il valore per usarlo è un'altra cosa — rimette in piedi il problema.
- `placeStructure.ts` fa **il gesto**: budget di chunk, collisione, record, coda.
  Chi posa un pezzo solo chiama `placeStructure`; chi ne posa più d'uno che devono
  entrare o cadere insieme usa `structureFits` su tutti e poi `writeStructure`.
  Le letture sul mondo con cui si compone una sonda di dominio stanno in
  `worldProbe.ts`.
