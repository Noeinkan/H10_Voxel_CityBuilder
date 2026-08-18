# Regole per `src/sim/`

Simulazione a tick per risorse, popolazione e desiderabilita'. Lavora per
colonna `(x, y)` e non costruisce voxel: il `Builder` e' esterno.

## Dipendenze e API

- Nessun import da `src/engine/`, Three.js o DOM; i test usano Node.
- Nel modulo usa import diretti; fuori esporta tramite `index.ts`.
- Ogni coefficiente vive in `balance.ts`; le policy sono moltiplicatori nello stato.

## Purezza e stato

- `tick` non muta input, non usa tempo/casualita' globale e non tocca il campo.
- `addCatalyst`, `addBuilding` e `setPolicyActive` aggiornano il campo in place e
  trasferiscono la proprieta' al nuovo stato: non riusare quello precedente.
- Il campo ricalcola da zero solo il rettangolo di Chebyshev toccato; non
  accumulare contributi e non scandire l'intera mappa.
- `writeDesirabilityData` scrive solo in `data`, mai in `blocks`.
- `resolveWeights` riparte dai pesi base; non annullare policy dividendo.
- Mantieni il pareggio 1:1 quando tocchi produzione, consumo o capacita' abitativa.

## Verifica

- Esegui `npm run typecheck` e `npm test`; per percorsi caldi anche `npm run bench`.
- Testa purezza, serializzazione, incrementalita' equivalente al rebuild e
  assenza di scritture in `blocks`.

