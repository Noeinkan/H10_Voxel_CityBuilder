# Regole per `src/world/harbor/`

Prima di modificare questo dominio, leggi integralmente
[`docs/world/harbor.md`](../../../docs/world/harbor.md).

Il driver che applica i piani vive in `src/world/buildings/harborDriver.ts` e
si regola come gli altri driver trasversali: prima di toccarlo leggi anche
[`docs/world/grading-water.md`](../../../docs/world/grading-water.md).

- Il piano e' il **delta di uno stadio**: mai l'intero distretto.
- Il distretto e' contenuto per costruzione: l'anello e le misure delle opere
  stanno in `config.ts` e niente le deroga nei consumatori.
- Le colonne di scavo e colmata sono prenotate al registry: l'acqua non e'
  suolo, e la simulazione non lo sa.
