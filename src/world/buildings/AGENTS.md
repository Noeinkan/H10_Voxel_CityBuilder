# Regole per `src/world/buildings/`

Leggi sempre
[`docs/world/streets-buildings.md`](../../../docs/world/streets-buildings.md)
prima di modificare costruzione, crescita, registry o tipologie.

Per i driver specializzati leggi anche il riferimento pertinente:

- `aerialDriver*`: [citta' in quota](../../../docs/world/aerial-city.md);
- `arcologyDriver*`: [arcologie](../../../docs/world/arcology.md);
- `landmarkDriver*`: [landmark di facciata](../../../docs/world/rooftop-landmarks.md)
  e [opere di terra e acqua](../../../docs/world/grading-water.md);
- `crossingDriver*`: [opere di terra e acqua](../../../docs/world/grading-water.md).

Cadenze, tetti, profili e grammatica restano in `config/`, che si importa come
`./config` e resta una facciata sola: `builder.ts` per cadenze e budget,
`grammar.ts` per il vocabolario della forma, `levels.ts` per la massa di un
livello, `classProfile.ts` per l'aspetto di un uso, `typologies.ts` per il
catalogo, `styles.ts` per il tessuto di quartiere. Un numero nuovo va nel modulo
che risponde alla sua domanda, non in fondo al primo file aperto.

La tipologia vive qui: `src/sim/` non conosce la forma degli edifici.

Due moduli rispondono per tutti, e una struttura nuova passa di lì invece di
riscriverli:

- `structureKind.ts` dice **che cosa è** un record. È l'unico posto che legge
  `landmark`, `span`, `aerial`, `arcology`, `ropeway` e `aloft`: una domanda da
  sì o no è una colonna di `STRUCTURE_TRAITS`, una scelta fra comportamenti è uno
  `switch` esaustivo alla sua sede. Leggere quei campi altrove per classificare —
  leggerne il valore per usarlo è un'altra cosa — rimette in piedi il problema.
- `placeStructure.ts` fa **il gesto**: budget di chunk, collisione, record, coda.
  Chi posa un pezzo solo chiama `placeStructure`; chi ne posa più d'uno che devono
  entrare o cadere insieme usa `structureFits` su tutti e poi `writeStructure`.
  Le letture sul mondo con cui si compone una sonda di dominio stanno in
  `worldProbe.ts`.

## Il tessuto e il suolo pubblico

- **Chi costruisce a terra non prende la carreggiata.** Sono due porte —
  `LotSearch.columnIsFree` per un lotto nuovo, `UpgradeDriver.fitsWider` per
  un'impronta che si allarga — e una terza le romperebbe in silenzio: la strada
  resterebbe nei dati e sparirebbe dallo schermo, perché `SurfaceQueue.canPaint`
  non asfalta una colonna occupata. Il resto dell'invariante, contatore di
  invalidazione compreso, sta in [`../roads/AGENTS.md`](../roads/AGENTS.md).
- **L'affaccio e l'arretramento sono due domande, non due distanze.**
  `onFrontage` chiede se il lotto *vede* la strada e ordina i candidati;
  `onSetback` chiede se lascia aria **sui soli lati che non sono la sua fila**, e
  ha bisogno dell'orientamento per sapere quali siano. Accostarsi di fianco fa un
  fronte continuo ed è voluto — `Frontage.snap` lo cerca apposta; saldarsi sul
  retro chiude il cortile, e con lui l'unico vuoto da cui si vede la strada
  dietro.
- **Nessuno dei due può diventare un divieto.** `placeLot` li chiede in passate
  successive e rinuncia nell'ultima: dove l'area è satura si costruisce lo
  stesso. Un requisito che non sapesse rinunciare ferma la città appena il primo
  rettangolo si riempie — è già successo, ed erano quattordici edifici su
  un'isola intera.
- **Cambiare la posa muove `cityDigest`.** È il caso dichiarato di quel test: si
  rigenera l'impronta e si scrive nel changelog che le partite salvate non
  tornano più uguali. Se invece cade dopo una modifica che si dichiarava neutra,
  ha torto la modifica.
