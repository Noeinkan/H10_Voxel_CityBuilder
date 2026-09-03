# Regole per `src/world/ropeway/`

Prima di modificare questo dominio, leggi integralmente
[`docs/world/ropeway.md`](../../../docs/world/ropeway.md).

- A terra esistono solo le due torri: la campata non occupa colonne.
- La fune non e' voxel, record o materia; il piano e la vista restano separati.
- Mantieni verificata l'uguaglianza fra drop della cabina e sagoma del traffico.
- Una piazzola preferisce il suolo vergine e **poi** sgombera: sono due passate
  di `seekPad`, e fonderle demolirebbe avendo il posto libero accanto.
- Dentro una piazzola che sgombera si legge `ground`, non `top`.
