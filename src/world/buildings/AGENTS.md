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

Cadenze, tetti, profili e grammatica restano in `config.ts`. La tipologia vive
qui: `src/sim/` non conosce la forma degli edifici.
