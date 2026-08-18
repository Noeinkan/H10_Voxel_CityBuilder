# Regole per `src/world/`

Storage voxel sparso, scene deterministiche, terreno procedurale e costruzione
degli edifici. Questo modulo non dipende dal renderer.

## Storage e coordinate

- Mondo Z-up; chunk `32x32x32`; coordinate negative valide.
- `blocks` e `data` sono buffer distinti, allocati una volta per chunk.
- `setBlock` sporca il chunk e i vicini di bordo; `setData` mai la geometria.
- Aggiungere chunk non rialloca o sostituisce buffer esistenti.

## Terreno ed edifici

- Soglie, frequenze e stratigrafie stanno in `terrain/config.ts`.
- Un blocco dipende solo da `(seed, shape, ccx, ccy)`: preserva determinismo,
  indipendenza dall'ordine e continuita' ai confini.
- Generatore e worker non importano Three.js o `src/engine/`.
- Non alzare `warpAmount`, `baseFrequency` o `maxHeight` senza verificare
  continuita' e margine di Lipschitz in `heightField.test.ts`.
- Costanti e profili degli edifici vivono in `buildings/config.ts`.
- Il `Builder` valida terreno e occupazione e costruisce a fasce nel budget;
  la generazione degli stamp resta deterministica.

## Verifica

- Esegui `npm run typecheck` e `npm test`.
- Per streaming/generazione esegui anche `npm run build` e verifica i budget con
  `?debug=1&terrain=1337`; non aggiornare misure per stima.

