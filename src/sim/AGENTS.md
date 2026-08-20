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
- Il campo ricalcola da zero solo il rettangolo di Chebyshev toccato, e solo per
  gli usi che quel catalizzatore influenza davvero; non accumulare contributi e
  non scandire l'intera mappa.
- `writeDesirabilityData` scrive solo in `data`, mai in `blocks`.
- `resolveWeights` riparte dai pesi base; non annullare policy dividendo.

## Relazioni da non rompere per distrazione

In `balance.ts` ci sono due pareggi 1:1. `food.perProduction / food.perResident`
fa 24, cioe' esattamente `weights.residentialCapacity`: un edificio industriale
sfama un residenziale pieno. E `weights.commercialCapacity` vale a sua volta 24:
un edificio commerciale ne serve uno. Cambiare uno di questi valori senza
guardare gli altri rompe il pareggio.

Il **vettore di influenza** di un catalizzatore sta in
`gameplay.catalyst.influence`, non nella sua definizione: ogni ruolo ha almeno
un uso a `1` esatto, ed e' quello a tenere in piedi l'invariante "al centro il
campo vale esattamente `strength`". Un valore negativo e' legale e significa che
quel ruolo caccia via quell'uso; uno zero non costa nulla, perche' il campo
salta del tutto gli usi che un ruolo non tocca.

## Verifica

- Esegui `npm run typecheck` e `npm test`; per percorsi caldi anche `npm run bench`.
- Testa purezza, serializzazione, incrementalita' equivalente al rebuild e
  assenza di scritture in `blocks`.
