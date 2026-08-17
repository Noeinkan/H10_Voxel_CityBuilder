# src/sim

Cartella riservata alla simulazione, vuota di proposito in questo prompt.

Il contratto con il motore esiste già: ogni chunk ha un secondo layer
`Chunk.data` (`Uint8Array` di 32768 byte, un byte libero per cella) che si scrive
con `VoxelWorld.setData(x, y, z, value)` e si legge con `getData`.

Due garanzie su cui la simulazione può contare:

- **Il renderer non legge mai `data`.** Nessun file di `src/engine/` lo tocca.
- **Scrivere `data` non marca il chunk sporco**, quindi non provoca alcun
  rebuild di mesh. Solo `setBlock` invalida la geometria.

Verificate da `src/world/VoxelWorld.test.ts`.
