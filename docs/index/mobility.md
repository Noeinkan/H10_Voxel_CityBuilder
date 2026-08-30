# Indice — cio’ che collega

Citta’ in quota, campate, attraversamenti, funivia e mezzi in movimento.

Una scheda del [Project Index](../../PROJECT_INDEX.md): qui c’e’ solo *dove sta cosa*.
Il modo economico di leggerla e’ `npm run locate -- <termine>`, che cerca su tutte le
schede insieme e restituisce le sole righe che servono. I percorsi delle righe
sono relativi alla radice del repository, non a questa cartella.


## `src/world/aerial/` — la citta' in quota

La prima cosa del progetto che **sporge oltre l'impronta** di un edificio: una
mensola appesa a una facciata, e sopra di lei si costruisce. Da qui l'invariante
del dominio — **un impalcato in quota non prende suolo; lo prende solo la gamba
che scende a terra** — che e' il complemento esatto di quello di `spans/`. Sotto
una mensola la carreggiata si dipinge ancora e i lotti si costruiscono ancora,
tranne nelle due colonne di una gamba.

**Nessuna quota e' imposta da fuori**: la mensola la prende dalla sommita' di una
fascia del proprio ospite, la gamba dal primo appoggio che trova scendendo. Non
c'e' una griglia di livelli, e per la stessa ragione qui non esiste `align`.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/aerial/config.ts) | **Ogni** sporto, luce, franco, cadenza e indice di palette | `AERIAL`, `AERIAL_PART`, `AerialPart`, `DECK_HEIGHT`, `takesGround`, `isBuildable` |
| [deckPlan.ts](src/world/aerial/deckPlan.ts) | Il primitivo: dato un riquadro e una quota, dove servono le gambe | `planDeck`, `deckBaseZ`, `tileDeck`, `surveyFooting`, `rectsOverlap`, `DECK_REFUSALS`, `DeckPlan`, `DeckQuery`, `DeckRect`, `DeckRefusal`, `AerialColumn`, `AerialProbe`, `Pier` |
| [terracePlan.ts](src/world/aerial/terracePlan.ts) | L'aggetto: da un edificio e un fronte al riquadro che sporge | `planTerrace`, `faceRuns`, `wallRect`, `faceAxis`, `faceOutward`, `AERIAL_FACE`, `AERIAL_FACES`, `TerracePlan`, `TerraceQuery`, `AerialSupport`, `FaceRun` |
| [terraceForm.ts](src/world/aerial/terraceForm.ts) | La forma di una mensola: pianta fra quattro varianti e angoli esterni smussati | `terraceShape`, `overhangOf`, `terraceSide`, `terraceEdge`, `chamfered`, `cornerCutOf`, `TerraceShape`, `TerraceSide` |
| [routePlan.ts](src/world/aerial/routePlan.ts) | Le forme di un percorso fra due mensole: dritta, larga, a zeta | `planRoute`, `ROUTE_REFUSALS`, `RoutePlan`, `RouteQuery`, `RouteEnd`, `RoutePiece`, `RouteRefusal` |
| [routeDrafts.ts](src/world/aerial/routeDrafts.ts) | I pezzi di un percorso e la meccanica che li regge: colmo, pianerottoli, montaggio | `crestOf`, `climbProfile`, `placeHubs`, `assemble`, `walkDraft`, `hubDraft`, `hubSide`, `hubPad`, `rectOf`, `slideOrder`, `PieceDraft`, `Landing`, `RouteEnd` |
| [guideway.ts](src/world/aerial/guideway.ts) | La guida: il montante che porta da terra a un impalcato abitato | `planLift`, `LIFT_REFUSALS`, `LiftPlan`, `LiftTarget`, `LiftRefusal` |
| [decks.ts](src/world/aerial/decks.ts) | Le quote edificabili di una colonna, ciascuna con il proprio riquadro | `decksAt`, `BuildDeck`, `DeckSource` |
| [generate.ts](src/world/aerial/generate.ts) | Uno stamp per tutte le forme: lastra da un voxel, parapetto e verde; nodi alti vuoti fra piano e appoggi | `generateDeck`, `generateLift`, `generatePier` |
| [testProbe.ts](src/world/aerial/testProbe.ts) | Un luogo finto per i test puri: pareti, tetti, carreggiate | `TestGround` |

```ts
planTerrace({ host, faces, ground, solid });   // { ok, plan } | { ok: false, refusal }
planDeck({ rect, deckZ, anchors, drop, ... }); // le gambe che lo sbalzo richiede
decksAt(registry.at(x, y), groundZ);           // suolo piu' le quote che passano di qui
```

## `src/world/spans/` — la rete in quota

La prima struttura del progetto che **non poggia a terra**: una campata fra due
appoggi che non sono suoi. Da qui l'invariante del dominio — **una campata non
prende suolo** — che e' anche l'unica cosa che il modello dei landmark non sapeva
gia' dire: sotto un ponte la carreggiata si dipinge ancora e i lotti si
costruiscono ancora, e se un edificio cresce attraverso la campata a cedere e' la
campata. Puro: entrano due appoggi e due predicati sul luogo, esce un piano.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/spans/config.ts) | Lunghezze, quote, franchi e cadenze delle campate; la ricerca delle piazze organiche ha un budget fisso di tasche per tentativo | `SPANS`, `SPAN_KIND`, `SpanKind`, `SpanRule` |
| [spanPlan.ts](src/world/spans/spanPlan.ts) | Ponte e mezzanino: asse, vuoto, quota d'atterraggio, segmenti | `planSpan`, `spanBaseZ`, `tileSegments`, `SPAN_HEIGHT`, `SPAN_REFUSALS`, `SpanPlan`, `SpanQuery`, `SpanSupport`, `SpanProbe`, `GapColumn`, `SpanSegment`, `SpanResult`, `SpanRefusal` |
| [plazaPlan.ts](src/world/spans/plazaPlan.ts) | La piazza sul cuore di un isolato, retta da tre o piu' edifici | `planPlaza`, `PlazaQuery`, `CourtyardRect` |
| [generate.ts](src/world/spans/generate.ts) | Lo stamp di un segmento: travi, carreggiata, verde | `generateSpan` |
| [network.ts](src/world/spans/network.ts) | Union-find sugli appoggi e la proprieta' di continuita' del gate | `SpanNetwork`, `widestReach`, `SpanLink` |

```ts
planSpan({ a, b, kind: SPAN_KIND.bridge, ground, solid }); // { ok, plan } | { ok: false, refusal }
planPlaza({ rect, supports, ground, solid });              // stessa forma
widestReach(registry.spans, blockOf);                      // isolati raggiunti: >= 2 passa il gate
```

## `src/world/crossings/` — i ponti che il giocatore chiede

Il viadotto che il commento di `SPANS.maxGap` annunciava: oltre dodici voxel «non
e' piu' una passerella ma un viadotto, che ha bisogno di appoggi propri a terra».
Da qui l'invariante, che e' **l'opposto** di quello di `spans/` — **un
attraversamento prende suolo**, con pile che scendono nel fondale — ed e' la
ragione per cui i due domini non sono lo stesso file.

L'altra differenza sta nel formato: `spans/` esamina tutte le coppie e ne accetta
poche, qui arriva **un click** e la regola deve trovare il compagno da sola. Il
click sceglie anche il tipo: sopra un edificio si cerca un ponte fra grattacieli
a quota libera, sulla riva un ponte su pile. Puro: entrano una colonna e quattro
predicati sul luogo, esce un piano.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/crossings/config.ts) | **Ogni** luce, franco, passo di pila, pescaggio e indice di palette | `CROSSINGS`, `CROSSING_KIND`, `CrossingKind` |
| [crossingPlan.ts](src/world/crossings/crossingPlan.ts) | Sceglie il compagno e convalida: asse, quota, pile, spalle, segmenti | `chooseCrossing`, `crossingBaseZ`, `CROSSING_HEIGHT`, `CROSSING_REFUSALS`, `CrossingPlan`, `CrossingQuery`, `CrossingProbe`, `CrossingTower`, `CrossingPier`, `CrossingSegment`, `CrossingResult`, `CrossingRefusal` |
| [generate.ts](src/world/crossings/generate.ts) | Lo stamp di un segmento e quello di una pila | `generateCrossing`, `generateCrossingPier` |
| [src/world/crossings/secondaryBridgePlan.ts](src/world/crossings/secondaryBridgePlan.ts) | Regola pura del ponte automatico: separa territorio primario e secondario, pretende torri mature e un canale d'acqua continuo |

```ts
chooseCrossing({ x, y, ground, land, occupied, solid });          // ponte a terra
chooseCrossing({ x, y, from: tower, towers, ...probe });          // ponte in quota
```

## `src/world/ropeway/` — la traversata che non prende suolo

Il commento di `CROSSINGS.maxLength` diceva cosa sta oltre i novantasei voxel:
«la distanza oltre la quale un ponte smette di essere una scelta e diventa il
modo per annullare la geografia. Uno stretto piu' largo di cosi' vuole un
traghetto». Il traghetto pero' e' un catalizzatore — lo si piazza dove il *ruolo*
ha senso, non dove serve attraversare — e fra due rive che si guardano non c'era
ancora niente che il giocatore potesse **tirare**.

Da qui l'invariante, che e' l'opposto esatto di quello di `crossings/`: **una
campata di fune non prende niente**. A terra ci sono solo le due torri; fra loro
non c'e' impalcato, non c'e' carreggiata e non c'e' pila — ed e' esattamente cio'
che permette alla linea di scavalcare uno stretto che nessuna pila reggerebbe.

**La fune non e' materia**, e vale per lei la regola di `traffic/`: e' spessa meno
di un voxel, non ha un record e non occupa colonne. La disegna
`engine/RopewayView.ts`, fuori dal volume voxel.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/ropeway/config.ts) | **Ogni** luce, franco, arretramento, freccia e indice di palette della linea | `ROPEWAY`, `ROPEWAY_PART`, `RopewayPart` |
| [ropewayPlan.ts](src/world/ropeway/ropewayPlan.ts) | Da un click alla linea: la riva di qua, quella di la', le due piazzole, la quota della fune e la sua pancia | `chooseRopeway`, `ROPEWAY_REFUSALS`, `RopewayPlan`, `RopewayQuery`, `RopewayProbe`, `RopewayStation`, `RopewayResult`, `RopewayRefusal`, `CablePoint` |
| [generate.ts](src/world/ropeway/generate.ts) | Lo stamp di una torre: zoccolo, fusto, banchina d'imbarco e castello | `generateStation` |

```ts
chooseRopeway({ x, y, top, land, firm, free });  // { ok, plan } | { ok: false, refusal }
generateStation(plan.stations[0], plan.axis);    // il volume di una torre
```

## `src/world/traffic/` — cio' che si muove

I mezzi che i collegamenti mettono in moto: barche all'ormeggio, traghetti di
linea, navi da carico, aerei in circuito, dirigibili al pilone, eVTOL che si
posano su un tetto, mongolfiere che se ne staccano. E' la risposta a un difetto
che si vedeva prima di ogni tooltip — un imbarco che prometteva di collegare due
punti dell'isola e non aveva niente che attraversasse.

**Il traffico non e' materia**, ed e' l'invariante del dominio. Scrivere una
barca nel `VoxelWorld` e riscriverla al frame dopo marcherebbe sporchi i chunk
della costa sessanta volte al secondo, cioe' rimeshare mezza isola per farla
navigare: qui si calcola *dove sta* un mezzo a un certo istante, e a disegnarlo
e' `engine/TrafficView.ts` con mesh proprie, fuori dal volume voxel.

Puro come la rete stradale: entrano le strutture ridotte all'osso e **due**
predicati — dov'e' l'acqua, quanto e' alto cio' che c'e' sotto — escono delle
rotte. **La posa e' una funzione del tempo, non un'integrazione**: due partite
identiche mostrano le stesse barche negli stessi punti, e un frame perso non
sposta niente.

Il taglio fra i tre file di rotte e' *lungo cosa si lavora separatamente*: una
rotta di mare cerca l'acqua, una in quota scavalca la citta', e il pendolo con
la sosta e' lo stesso conto per tutt'e due.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/traffic/config.ts) | **Ogni** velocita', quota, sosta, franco, misura di sagoma, ciminiera e indice di palette dei mezzi, incluso il giro corto dello yacht (`yachtSpeed`, `yachtDwell`, `yachtReach`) | `TRAFFIC`, `VEHICLE`, `VEHICLE_KINDS`, `VehicleKind`, `VehicleFunnel`, `funnelOf` |
| [seaLane.ts](src/world/traffic/seaLane.ts) | La rotta fra due punti che resta sull'acqua: griglia grossa, ricerca in ampiezza, tiro di corda | `planSeaLane`, `LanePoint`, `LaneQuery` |
| [routePath.ts](src/world/traffic/routePath.ts) | Di cosa e' fatta una rotta, e i quattro modi di costruirne una: fermo, pendolo con sosta, giro chiuso, lunghezze cumulate | `TrafficRoute`, `TrafficWaypoint`, `moored`, `shuttle`, `loop`, `measure`, `phaseOf` |
| [src/world/traffic/routes.ts](src/world/traffic/routes.ts) | Rotte dei mezzi; gli ormeggi a galla posano i mezzi sul pelo della struttura (`waterZ`), e gli yacht escono dal posto barca per un giro breve senza allontanarsi. |
| [skyRoutes.ts](src/world/traffic/skyRoutes.ts) | Le rotte in quota, e l'unica cosa che le accomuna: **passano sopra la citta' invece che dentro**. Il sondaggio del cielo sporge quanto l'ingombro del mezzo, cosi' la quota scavalca anche la torre accanto alla linea di centro e non solo quella sotto. Circuito di volo, orbita, giro che si posa su una piazzola, corsa di un pallone | `flightCircuit`, `airshipOrbit`, `padCircuit`, `balloonFlight` |
| [ropewayRoutes.ts](src/world/traffic/ropewayRoutes.ts) | Da una linea di funivia alle sue due cabine, sfasate di mezzo periodo. Qui la rotta e' gia' data: non c'e' niente da cercare | `planRopewayRoutes`, `RopewayLink` |
| [poses.ts](src/world/traffic/poses.ts) | Dove sta un mezzo a un certo istante — o `null` se e' **fuori dal mondo**: pendolo con sosta, giro chiuso, beccheggio | `posesAt`, `poseAt`, `VehiclePose` |
| [plume.ts](src/world/traffic/plume.ts) | Il fumo dei fumaioli: la stessa posa **letta nel passato**, piu' salita, deriva e diradamento | `puffsAt`, `SmokePuff` |

```ts
planSeaLane({ from, to, water });        // spezzata che aggira la terra | null
planTraffic(structures, water, ceiling); // le rotte che una citta' esprime
planRopewayRoutes(links);                // due cabine per linea, in controfase
posesAt(routes, seconds);                // [{ kind, x, y, z, heading }, …]
puffsAt(routes, seconds);                // [{ x, y, z, size, density }, …]
```

`ceiling` e' facoltativo e vale «citta' piatta»: senza, le rotte in quota
restano alla quota che dichiarano. Con — e `GrowthScene` lo passa — la crociera
e' il **massimo** fra quella dichiarata e la cima sorvolata piu' il franco, che
e' l'unica cosa che tenga un aereo fuori dai grattacieli quando `maxLevel` a
dodici porta una torre oltre i centoquaranta voxel.
