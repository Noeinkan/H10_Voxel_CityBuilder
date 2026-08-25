# Regole per `src/world/`

Storage voxel sparso, scene deterministiche, terreno procedurale, rete stradale
e costruzione degli edifici. Questo modulo non dipende dal renderer.

## Storage e coordinate

- Mondo Z-up; chunk `32x32x32`; coordinate negative valide.
- `blocks` e `data` sono buffer distinti, allocati una volta per chunk.
- `setBlock` sporca il chunk e i vicini di bordo; `setData` mai la geometria.
- **Verso il basso la dipendenza e' lunga `SKY_PROBE`, non una cella.** Il mesher
  guarda quei voxel sopra il proprio tetto per sapere cosa lo copre, quindi una
  scrittura nei primi `SKY_PROBE` piani di un chunk sporca anche quello sotto.
  Senza, una campata comparsa dopo il suolo non lo scurirebbe mai.
- `fillColumn` e' `setBlock` su un tratto verticale, e va usata quando il tratto
  si conosce in anticipo: dentro il chunk resta un indice che avanza, e
  conversioni, pack del byte e marcature si pagano una volta invece che per
  voxel. Il terreno ci scrive cinque milioni di celle come cinque corse per
  colonna. Marca i vicini in verticale in modo piu' largo di `setBlock` — per
  tratto e non per cella — perche' sporcare di piu' costa una mesh e sporcare di
  meno lascia una faccia sbagliata.
- Aggiungere chunk non rialloca o sostituisce buffer esistenti.
## Come usare queste regole

Questo file contiene soltanto i contratti comuni a tutto `src/world/`.
Ogni sottocartella con un `AGENTS.md` aggiunge regole locali e indica il solo
riferimento di `docs/world/` da leggere integralmente prima di modificare quel
dominio. Non caricare gli altri riferimenti per abitudine.

I documenti di design conservano motivazioni e casi limite: non duplicarne qui
il testo. Una regola condivisa resta qui; una regola di un solo dominio resta
nell'`AGENTS.md` piu' vicino.

## Confini comuni

- `src/world/` non importa dal renderer. Terreno, generatori e worker non
  importano Three.js o `src/engine/`.
- Il renderer legge soltanto `Chunk.blocks`; `Chunk.data` appartiene alla
  simulazione.
- La forma degli edifici vive in `buildings/`; `src/sim/` non la conosce.
- I percorsi deterministici non usano `Date.now()` o `Math.random()`.
- Soglie, frequenze e moltiplicatori stanno nel `config.ts` del dominio
  indicato dal file radice: non duplicare numeri nei consumatori.
- Distingui sempre modello logico, occupazione voxel e vista: non trasformare in
  voxel traffico, funi o altro contenuto dichiarato non materiale.
- Per il riferimento completo e l'indice dei domini usa
  [`docs/world/README.md`](../../docs/world/README.md).

## Routing

- `terrain/`: quantizzazione, acqua per colonna, biomi e generazione.
- `scenes/`: scene deterministiche e campionario del vocabolario.
- `streets/`, `sites/`, `skyline/`: maglia, siti e gerarchia verticale.
- `buildings/`: costruzione, tipologie, registry e driver trasversali.
- `spans/`, `aerial/`: campate, mensole, nodi e percorsi in quota.
- `crossings/`, `grading/`: attraversamenti, fondazioni e opere di terra.
- `farms/`: lotti agricoli e decorazione rurale.
- `landmarks/`: ricette, piazzamento, porti e landmark in quota.
- `arcology/`: condizioni, ricette e crescita delle arcologie.
- `ropeway/`: stazioni, torri e piano della fune.
- `traffic/`: rotte e pose dei mezzi non voxel.

## Verifica

- Segui la verifica proporzionata del file `AGENTS.md` radice: `typecheck` e
  il piu' stretto fra test diretti, `test:related` e `test:changed`.
- Esegui la suite intera soltanto nei casi dichiarati dal file radice; questo
  file non introduce un obbligo piu' largo.
- Per worker, streaming o generazione esegui anche `npm run build`.
- Per modifiche visuali verifica `?debug=1&terrain=1337` e i budget pertinenti;
  non aggiornare misure per stima.
