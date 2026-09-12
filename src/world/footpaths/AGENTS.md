# Regole per `src/world/footpaths/`

Il tessuto pedonale: i vicoli che una casa lascia verso il suolo pubblico.

## L'invariante

**Un sentiero non prende suolo e non lo contende a nessuno.** Dipinge soltanto
colonne libere, e lo fa a `FOOTPATHS.priority` — zero, l'ultima di tutto il suolo
pubblico. Qualunque altra superficie arrivi dopo se la prende, e il vicolo
sparisce da se' senza che nessuno debba cancellarlo. Non c'e' nessun record, non
c'e' niente da invalidare e non c'e' niente da demolire.

Ne segue la regola pratica: **non aggiungere qui niente che vada registrato**.
Una struttura che debba essere ricordata — una pensilina, una scalinata con un
volume proprio — non e' un sentiero: e' un edificio, e vive in `buildings/`.

## Confini

- Puro e senza mondo: entrano una sonda e un criterio d'arrivo, esce una
  spezzata. Nessun import di `VoxelWorld`, del renderer o di `buildings/`.
- **Non scrive un voxel.** Chi fa comparire un vicolo e' la coda di superficie
  del `Builder`, per il tramite di `buildings/footpathDriver.ts`.
- Ogni costo, soglia e indice di palette sta in `config.ts`. Nessun altro file di
  questa cartella ne contiene uno.
- Il portone da cui un vicolo parte lo calcola `buildings/siteWorks.ts`
  (`doorstepOf`), la stessa funzione che usa il capillare carrabile: due
  definizioni farebbero partire le due reti da due colonne diverse dello stesso
  lato.

## Il confine con `roads/`, che e' la cosa che si sbaglia

Le due reti sembrano la stessa e non lo sono su nessuna delle tre cose che le
definiscono.

| | `roads/` | qui |
| --- | --- | --- |
| Da cosa nasce | dai poli, cioe' dai catalizzatori | da **un** edificio |
| Quando si rifa' | intera, se i poli cambiano | mai: cresce e basta |
| Larghezza | quella del rango | uno, per sempre |

E soprattutto: `RoadNetwork.connect` si autoesclude entro `ROADS.frontageReach`.
Un lotto a sei colonne dalla carreggiata e' gia' «sul fronte» e non riceve nessun
capillare — giusto per una strada, e' il motivo per cui esiste questo dominio.
**Se ti trovi ad alzare `FOOTPATHS.reach` oltre il doppio di quella fascia, la
domanda giusta e' un'altra**: quell'edificio non vuole un vicolo, vuole un
capillare, e a tirarlo e' `roads/`.

## Verifica

- `npx vitest run src/world/footpaths/` copre il dominio intero in meno di due
  secondi, e non serve nessuna isola: le fixture sono griglie di caratteri.
- Chi tocca `walk.ts` o i costi guardi anche
  `npx vitest run src/world/buildings/Builder.test.ts`, che e' l'unico posto in
  cui i vicoli nascono su una citta' vera. Costa qualche minuto.
- Per il risultato a schermo, `?debug=1` e una citta' cresciuta: un vicolo e' un
  voxel di `stoneWarm` fra le case, e si distingue dal capillare carrabile —
  `stone` — per il tono piu' caldo.
