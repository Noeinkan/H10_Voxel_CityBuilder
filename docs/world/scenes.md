# Scene

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **Il campionario e' una scena, non un percorso di rendering.** `scenes/swatch*`
  mostra il vocabolario — ogni slot per ogni linguaggio, la stratigrafia di ogni
  bioma, la scala fra cella, albero ed edificio — riusando quello che c'e' gia':
  `STRATA_DEPTH` per gli strati, `writeTree` per gli alberi, `generateBuilding`
  per l'edificio. Non aggiunge geometria, materiali, slot di palette o tipi di
  superficie (invarianti 4 e 5), e se una combinazione si vede male il difetto
  sta altrove. Le sue dimensioni si ricavano dalle tabelle e mai da un letterale:
  uno slot o una specie in piu' allargano la griglia da se'.
- I numeri stanno in `scenes/swatchLayout.ts`, che e' puro e ha tre consumatori —
  il generatore, l'inquadratura di `main.ts` e il referto sotto il cursore.
- **Il provino della matrice e' una massa articolata, non un prisma**, e la forma
  e' un requisito del mesher e non un gusto: `emitSoffits`, `emitTerraceBoxes`,
  `emitFinials` e il terzetto `emitRoofMasts`/`emitRoofCrowns`/`emitPergolas`
  chiedono rispettivamente un intradosso con aria sotto, una sommita' scoperta
  con volume di fianco, una cella senza vicini in piano e una sommita' scoperta
  con **tutti e quattro** i vicini scoperti. Nessuna delle quattro esiste su una
  scatola, quindi appiattire `CELL_PARTS` spegnerebbe altrettante famiglie di
  dettaglio senza che niente lo segnali — ed e' successo: fino alla sagoma a
  gradoni il tetto piu' largo era un anello di spessore uno, e chiome e pergole
  non comparivano affatto. Il cortile e' li' per questo. La sagoma e' la stessa
  in ogni cella: l'unica variabile dev'essere palette x superficie.
- **La pianta del provino e' invariante per rotazione di 90 gradi**, e la ragione
  e' la camera: a un quarto di giro meta' campionario mostrerebbe gli sbalzi e
  meta' no. Non e' «ogni gradone e' centrato» — che valeva finche' i pezzi erano
  quadrati pieni — ma la simmetria C4 della sagoma vera, cortili e pinnacoli
  compresi, e un test la verifica su `cellSolidAt`. Chi vuole un recesso a L o
  una torretta su un fianco solo sta rompendo questa riga, non aggirandola: lo
  dichiari.
- **La sagoma sta in un posto solo, `cellSolidAt`**, e la leggono in tre: il
  generatore che la scrive, `swatchProbe.ts` che ne conta i prismi e il test che
  confronta il mondo con lei. E' la stessa ragione per cui `matrixCellRect` sta
  in `swatchLayout.ts` e non nel generatore.
- **Quanto dettaglio emette una cella non si stima, si rimisura.**
  `scenes/swatchProbe.ts` passa `appendMicroGeometry` vero con un writer che
  conta al posto di scrivere: niente tabella scritta a mano che possa restare
  indietro rispetto agli emettitori. Lo consumano il referto sotto il cursore e
  i due controlli che tengono il campionario onesto — un pavimento di prismi per
  linguaggio, cosi' una famiglia spenta cade li' invece di non lasciare traccia,
  e il tetto di `MAX_DETAIL_QUADS_PER_CHUNK` sul chunk piu' carico.
- **L'interasse e' governato dall'occlusione, non dallo spazio.** A `REST_PITCH`
  un voxel di quota si proietta in alto il doppio di un voxel di profondita', e
  la fila davanti nasconde `CELL_HEIGHT - cellPitch / 2` di quella dietro: con
  interasse pari all'altezza sparisce meta' di ogni provino. Un test lo fissa.
- **La galleria e' un catalogo, non un secondo disegno.** `scenes/swatchCatalog.ts`
  deriva le fasce in fondo al campionario dagli stamp veri: le quattro linee
  evolutive — un ripiego per uso — alle cinque soglie visuali
  (`SWATCH_LINE_LEVELS`), ogni tipologia di `TYPOLOGIES` alla forma matura
  (`SWATCH_BUILDING_LEVEL`), seme 0 e fronte est, ogni landmark di `LANDMARKS`
  nei suoi quattro stadi — con l'esemplare primo fisso, cosi' la crescita si
  legge sullo stesso monumento — e allo stadio finale per tutte le varianti piu'
  le forme contestuali di `FORMS`, Skyport compreso, con un seme che produce
  davvero l'esemplare dichiarato, e ogni arcologia di `ARCOLOGY_RECIPES` allo
  stadio finale. Ingombri e altezze escono dagli stamp, mai da riquadri copiati
  a mano, quindi una tipologia, un esemplare o una megastruttura nuovi compaiono
  da soli.
- **Gli otto voxel fra due soggetti sono vuoto, non spazio di nessuno.**
  `SWATCH_ITEM_GAP` separa i riquadri delle gallerie e fa da margine alle
  inquadrature; `swatchSubjectAt` risponde solo dentro un riquadro, cosi' il
  vuoto non e' selezionabile. Il basamento sotto l'ingombro di un soggetto resta
  cliccabile: a decidere e' la colonna del voxel colpito, non la sua quota.
- **La selezione passa da una traversata di raggio, non da un piano.**
  `scenes/swatchPick.ts` e' una DDA pura (`firstSolidVoxel`) sul primo solido
  visibile; `main.ts` la consuma per hover, click persistente e referto del voxel
  esatto. Il contorno riusa `SelectionOutline` con una quota piatta
  (`heightAt` = `SWATCH.groundZ`): nessun rebuild di mesh, nessuna geometria nuova.
- **Il pannello ha sei pulsanti** — Matrice, Scala, Edifici, Landmark, Arcologie,
  Tutto — che inquadrano la fascia con `swatchFocusExtent`; si parte da Tutto. La
  scelta sopravvive alla navigazione, il clic nel vuoto e `Esc` la mollano.
