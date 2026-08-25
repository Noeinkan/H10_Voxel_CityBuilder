# Regole per `src/world/terrain/`

Prima di modificare questo dominio, leggi integralmente
[`docs/world/terrain.md`](../../../docs/world/terrain.md): contiene i contratti,
le dimostrazioni e i casi limite del generatore.

- Soglie, frequenze e stratigrafie restano in `config.ts`.
- Preserva la dipendenza pura da `(seed, shape, ccx, ccy)`, la continuita' ai
  confini e l'indipendenza dall'ordine di generazione.
- Generatore e worker non importano Three.js o `src/engine/`.
