# Regole per `src/world/streets/`

Prima di modificare questo dominio, leggi integralmente
[`docs/world/streets-buildings.md`](../../../docs/world/streets-buildings.md).

- Passi, scostamenti e larghezze stanno in `config.ts`.
- La rete resta una funzione pura di `(seed, x, y)`.
- Distingui la maglia logica dall'asfalto materializzato nel mondo.
