# Indice — cio’ che si costruisce

Edifici e loro crescita, arcologie, landmark dei catalizzatori e gerarchia verticale.

Una scheda del [Project Index](../../PROJECT_INDEX.md): qui c’e’ solo *dove sta cosa*.
Il modo economico di leggerla e’ `npm run locate -- <termine>`, che cerca su tutte le
schede insieme e restituisce le sole righe che servono. I percorsi delle righe
sono relativi alla radice del repository, non a questa cartella.


## `src/world/buildings/` — crescita voxel

Ponte tra candidati della simulazione e mondo renderizzato: convalida il terreno,
gestisce le impronte, costruisce a fasce entro un budget e promuove gli edifici.

**Il `Builder` orchestra, i driver decidono.** Ogni sottosistema a tick — campate,
citta' in quota, landmark, promozioni — vive in un file proprio e riceve un
`BuildContext`; il `Builder` tiene il ciclo (`onTick`, `step`), la nascita di un
edificio e le statistiche. Le due code — volumi e superficie — sono la sola strada
per cui un voxel arriva nel mondo: l'invariante «nessuno scrive un muro
all'infuori di qui» vale ora per la cartella, ed e' piu' stretta di prima perche'
le scritture stanno in tre file invece che sparse in sei metodi.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [assemble.ts](src/world/buildings/assemble.ts) | Gate e assemblatore dei lotti oltre il modulo: solo un picco maturo eletto puo' usare il lato libero dell'isolato; dispatcher unico e deterministico sotto/sopra otto voxel | `urbanFootprintCap`, `assembleBuilding`, `buildStamp`, `assembleLayoutCells`, `AssembleCell` |
| [src/world/buildings/Builder.ts](src/world/buildings/Builder.ts) | Orchestratore urbano: conserva il candidato radiale in uno spazio continuo, porta i candidati costieri alla prima acqua navigabile senza seguire l'isolato teorico e mantiene la gerarchia verticale del nucleo; la gomma (`demolish`, `demolishSurvey`, `demolishPreview`, `undoDemolition`) apre il cantiere sul riquadro trascinato, lo mostra e lo puo' annullare; `restore` rimette in piedi una citta' salvata, adottando i record in ordine di id e ridisegnandoli con `recordStamp` | `Builder`, `BuilderStats`, `REJECT_REASONS` |
| [buildContext.ts](src/world/buildings/buildContext.ts) | Cio' che ogni driver ha in mano: mondo, terreno, strade, registry e le due code | `BuildContext` |
| [config/builder.ts](src/world/buildings/config/builder.ts) | Cadenze e budget per frame: due siti ogni dieci tick (40% del ritmo precedente), dodici cantieri e code voxel ridotte, oltre ai tetti di chunk e all'aggregazione in fila | `BUILDER`, `CLUSTER`, `BuildingForm`, `DEFAULT_BUILDING_FORM` |
| [config/classProfile.ts](src/world/buildings/config/classProfile.ts) | Proporzioni e colori di base dei quattro usi urbani | `ClassProfile`, `CLASS_PROFILE` |
| [config/grammar.ts](src/world/buildings/config/grammar.ts) | Vocabolario della forma: spessori, trasformazioni di fascia, cime, ruoli di lotto. Le soglie luminose sono le due visuali `consolidated` e `mature` | `GRAMMAR`, `BAND_OP`, `CROWN_KIND`, `LOT_ROLE`, `MIN_FOOTPRINT`, `MAX_FOOTPRINT` |
| [config/index.ts](src/world/buildings/config/index.ts) | Facciata dei numeri della costruzione: chi importa `buildings/config` non sa in quale modulo sta il numero che chiede | ri-esporta tutto cio' che segue |
| [config/levels.ts](src/world/buildings/config/levels.ts) | Quanta massa da' un livello e come si arriva al successivo | `LevelCaps`, `LEVEL_CAPS`, `START_LEVEL_CDF`, `upgradeThresholdOf` |
| [config/styles.ts](src/world/buildings/config/styles.ts) | Forma dell'isolato e catalogo degli stili di quartiere | `BLOCK`, `STYLE`, `STYLES`, `StyleDefinition`, `StylePalette`, `styleById` |
| [config/typologies.ts](src/world/buildings/config/typologies.ts) | Catalogo delle tipologie: forma piu' condizioni, per uso; `evolvesFrom` dichiara le linee evolutive — chi puo' diventare cosa per upgrade | `TypologyShape`, `TypologyDefinition`, `DEFAULT_TYPOLOGY_SHAPE`, `TYPOLOGIES`, `TypologyId`, `typologyById` |
| [config/visual.ts](src/world/buildings/config/visual.ts) | Le cinque soglie visuali condivise — base, consolidato, maturo, torre, skyline — e il premio di coronamento che cresce con loro: e' quando un edificio cambia volto, a parita' di massa | `VISUAL_LEVELS`, `VISUAL_CROWN_BONUS`, `SKYLINE_PROP_HEIGHT`, `crownBonusOf` |
| [src/world/buildings/crossingDriver.ts](src/world/buildings/crossingDriver.ts) | Driver a budget dei ponti fra settori: cerca appoggi locali, registra una campata lunga per settore e la lega alle torri |
| [src/world/buildings/decayDriver.ts](src/world/buildings/decayDriver.ts) | Apre i cantieri dell'abbandono quando il fronte e' armato. Speculare a `upgradeDriver`, e passa da `ClearanceSites` come ogni rimozione. |
| [frontage.ts](src/world/buildings/frontage.ts) | Il fronte strada di un lotto: lo scorrimento che accosta l'impronta al vicino, la raccolta dei termini di fila dal registry e i contatori dell'aggregazione | `Frontage` |
| [growthPoles.ts](src/world/buildings/growthPoles.ts) | Di chi e' il turno di crescere: il riquadro del polo di questa infornata | `poleRectAt` |
| [growthQueue.ts](src/world/buildings/growthQueue.ts) | La coda di comparsa e le scritture a budget: un segmento per struttura, la sagoma nuova prima della cancellazione | `GrowthQueue`, `anchorOf` |
| [harborDriver.ts](src/world/buildings/harborDriver.ts) | La passata del distretto costiero: applica il piano di `harbor/plan.ts` sulle code di sempre — scavi e colmate a budget, passeggiata di superficie — prenota le colonne d'acqua al registry e consegna a `buildPass` gli slot di settore, un edificio per infornata | `HarborDriver` |
| [lotMemo.ts](src/world/buildings/lotMemo.ts) | Le due memorie della ricerca dei lotti: le colonne bocciate, che vivono quanto `buildPass`, e i rettangoli esauriti, che sopravvivono alle infornate finche' il mondo non libera del suolo | `LotMemo`, `BlockMemo` |
| [lotSearch.ts](src/world/buildings/lotSearch.ts) | Dove c'e' posto per un edificio, in pianta e in quota: la ricerca del lotto oltre il proprio isolato, la scelta dell'impalcato, e le tre memorie con cui si risponde a «questa colonna e' libera?» — il memo d'infornata, i rettangoli esauriti e i siti bocciati per sempre | `LotSearch`, `DeckProbe` |
| [src/world/buildings/placeStructure.ts](src/world/buildings/placeStructure.ts) | Il protocollo di piazzamento: budget di chunk, collisione, record, coda. I due tempi per chi posa più pezzi insieme. |
| [src/world/buildings/structureKind.ts](src/world/buildings/structureKind.ts) | Che cosa è un record: l'unico posto che legge i campi marker, la tabella dei tratti e i predicati con nome. |
| [src/world/buildings/sunkenDig.ts](src/world/buildings/sunkenDig.ts) | La terza eccezione allo scavo: l'imbuto di un earthscraper come stamp di cancellazione, intersecato con la roccia che c'e' davvero. Funzione pura del record, ed e' cio' che permette di riaprire il pozzo al caricamento | `sunkenDigStamp`, `DigProbe` |
| [surfaceQueue.ts](src/world/buildings/surfaceQueue.ts) | Il suolo pubblico a budget: carreggiata per isolato, grembiuli, rampe e bonifica del decoro — che si ferma dove il bioma dice acqua | `SurfaceQueue`, `SurfacePaint` |
| [spanDriver.ts](src/world/buildings/spanDriver.ts) | La rete in quota: ponti, mezzanini e piazze; le piazze cercano tasche libere fra pareti reali invece del centro dell'isolato, e una campata non prende suolo | `SpanDriver` |
| [aerialDriver.ts](src/world/buildings/aerialDriver.ts) | Mensole, percorsi, gambe e le quote su cui si costruisce. Un impalcato vuoto cade, uno abitato no; `adopt` ricostruisce colonne in quota e impalcati abitati da un registry appena caricato | `AerialDriver` |
| [guideDriver.ts](src/world/buildings/guideDriver.ts) | La via da terra: un montante per ogni impalcato abitato che non ce l'ha | `GuideDriver` |
| [ropewayDriver.ts](src/world/buildings/ropewayDriver.ts) | Le funivie: due torri a registro, e una fune che non e' materia. Il solo driver senza una freccia che entra o che esce | `RopewayDriver`, `RopewayCable`, `RopewayRide` |
| [src/world/buildings/landmarkDriver.ts](src/world/buildings/landmarkDriver.ts) | Piazzamento dei landmark; verso l'acqua `waterfront`, scavo del bacino (`basinDepth`) che sul lago ritaglia i canali nella riva emersa (`waterSourceAt`, `record.waterZ`), e la **crescita del sedime**: l'avanzamento allarga l'impronta sventrando l'anello nuovo con il cantiere di sempre | `ringStrips` |
| [landmarkSiting.ts](src/world/buildings/landmarkSiting.ts) | Dove una struttura si posa davvero: verso, ingombro e l'angolo gia' portato **incontro all'acqua** — sul lago la bocca del bacino si porta sul pelo e gli slip restano sulla riva da scavare. Puro, ed e' la sola meta' del piazzamento che un test interroga al voxel senza far crescere un'isola | `placeRecipe`, `seawardDrift`, `Placement` |
| [arcologyDriver.ts](src/world/buildings/arcologyDriver.ts) | La megastruttura: condizione sull'isolato, cantiere, costruzione a stadi, piazzali in quota e dichiarazione degli usi alla simulazione; `adopt` riapre le piazzole di un'arcologia caricata, che si ricavano da ricetta e stadio | `ArcologyDriver` |
| [clearance.ts](src/world/buildings/clearance.ts) | Cosa un landmark puo' togliere di mezzo e cosa lo ferma: edifici fino alla soglia, landmark solo per chi li dichiara, mai la rete in quota | `CLEARANCE_KIND`, `ClearanceKind`, `planClearance`, `ClearanceRecord`, `ClearanceRule`, `ClearancePlan`, `ClearanceRefusal` |
| [clearanceSite.ts](src/world/buildings/clearanceSite.ts) | Il cantiere di sventramento, condiviso da chi si prende un riquadro: sopralluogo, recinzione, demolizione a passate. La gomma lo apre senza recinto e lo marca annullabile: `undo` ricostruisce ogni condannato, gia' rimosso o no | `ClearanceSites`, `ClearanceBox`, `ClearanceVerdict`, `OPEN_SITE`, `clearanceOf`, `recordsIn`, `simBuildingOf` |
| [recordStamp.ts](src/world/buildings/recordStamp.ts) | La sagoma **registrata** di un edificio, di un landmark o di un'arcologia, rigenerata dal record per poterla cancellare o ricaricare | `recordStamp`, `typologyOf` |
| [upgradeDriver.ts](src/world/buildings/upgradeDriver.ts) | Crescita verticale: promuove forma e livello, ma consente l'espansione oltre otto solo quando lo stesso gate per-isolato della nascita elegge un picco maturo | `UpgradeDriver` |
| [chunkBudget.ts](src/world/buildings/chunkBudget.ts) | Quanti chunk sporcherebbe un volume, e se ci sta. Puro: aritmetica di chunk e nient'altro | `dirtyChunkCount`, `fitsChunkBudget` |
| [siteWorks.ts](src/world/buildings/siteWorks.ts) | Come si presenta il terreno a chi deve costruirci: la lettura per colonna, l'opera per l'impronta e — per i landmark — il piano che affonda nel pendio coprendo la parete, con l'acqua fonda come unico rifiuto | `groundKindAt`, `surveyGrade`, `surveyLandmarkGrade`, `hasUnworkableColumn`, `nearLand`, `isCoastal`, `buildWorks`, `WorksMask` |
| [hierarchy.ts](src/world/buildings/hierarchy.ts) | Fin dove una colonna puo' salire, e quanto ha gia' speso salendo | `allowedLevel`, `riseOf` |
| [urbanForm.ts](src/world/buildings/urbanForm.ts) | Il profilo locale della simulazione tradotto in forma costruita | `formOf`, `localLevelBonus`, `localUpgradeDiscount` |
| [BuildingRegistry.ts](src/world/buildings/BuildingRegistry.ts) | Indice spaziale e record degli edifici; impronte rettangolari, sbalzi che prenotano aria ma non suolo, landmark contati a parte con la forma fisica su `landmarkForm` e il pelo dell'acqua su `waterZ`. `restore` reinserisce conservando l'id — per l'annullamento della gomma e per il caricamento — e porta `nextId` oltre cio' che ha adottato | `BuildingRegistry`, `BuildingRecord`, `footprintDepth`, `envelopeOf`, `PlanRect` |
| [generate.ts](src/world/buildings/generate.ts) | Monta un edificio: impronta, fasce, coronamento, dettaglio sul tetto. Non disegna - ordina i quattro moduli sotto. Quattro canali casuali indipendenti dal livello — massa, fasce, facciata, tetto — cosi' un upgrade conserva i piani bassi e rifa' solo la cima | `generateBuilding`, `startLevel`, `BuildingRequest` |
| [bandRect.ts](src/world/buildings/bandRect.ts) | Il rettangolo di una fascia e l'algebra che lo muove: appoggio, rientranze centrate, predicati di pianta | `BandRect`, `supported`, `inside`, `inset`, `shrink`, `shrinkAxis`, `pickInt`, `clamp` |
| [bandOps.ts](src/world/buildings/bandOps.ts) | L'interprete del repertorio: prova le candidate nell'ordine del profilo e prende la prima che regge | `nextRect`, `applyOp`, `forcedOp` |
| [crowns.ts](src/world/buildings/crowns.ts) | Come si chiude la silhouette: una geometria per ogni voce di `CROWN_KIND` | `crownBands` |
| [paint.ts](src/world/buildings/paint.ts) | La vernice: corpo, cornice, zoccolo, campate, portale, accento luminoso, terrazze, giardini in copertura e corte. Le soglie visuali accendono la campata alla consolidata, la lama piena alla matura e il linguaggio del tetto tecnico sulla terrazza alla torre | `paint`, `classSurface`, `PaintRequest` |
| [cluster.ts](src/world/buildings/cluster.ts) | A cosa si aggrega un lotto: quota e corso di base condivisi con i vicini di fronte. Puro, e il rifiuto è il gradino | `planCluster`, `joinsCluster`, `ClusterTerms`, `ClusterRequest` |
| [typology.ts](src/world/buildings/typology.ts) | Sceglie la tipologia dal luogo, e dice **perche' no** dove non la sceglie; nessun numero, solo la regola. Un upgrade passa la tipologia corrente: una forma nuova entra solo se la sua linea la dichiara, altrimenti l'edificio resta se' stesso | `selectTypology`, `typologyProfile`, `typologyShape`, `typologiesForUses`, `typologyAccepts`, `typologyGapsOf`, `bestProspectOf`, `TypologyQuery`, `TypologyGap` |
| [unlocks.ts](src/world/buildings/unlocks.ts) | Cosa un ruolo sblocca: le specializzazioni che apre e le forme che ci nascono dentro, derivate dai due cataloghi | `unlocksFor`, `RoleUnlock` |
| [style.ts](src/world/buildings/style.ts) | Di che materia è fatto un quartiere: funzione pura di `(seed, isolato)`, nessuno stato | `styleAt`, `styledProfile`, `styleOf` |
| [blockForm.ts](src/world/buildings/blockForm.ts) | Dove cade un lotto dentro il proprio isolato — angolo, fronte, cuore — e quanto spazio ha per allargarsi. Puro | `lotRoleOf`, `blockRoom` |
| [stamp.ts](src/world/buildings/stamp.ts) | Volume voxel, ancora 3D e conversione in coordinate mondo, nei due versi: `stampSolidAt` interroga una sagoma **prima** che sia scritta | `VoxelStamp`, `VoxelAnchor`, `anchoredVoxel`, `stampSolidAt`, `STAMP_EMPTY` |
| [src/world/buildings/worldProbe.ts](src/world/buildings/worldProbe.ts) | Le letture canoniche sul mondo con cui i driver compongono le proprie sonde di dominio. |

## `src/world/arcology/` — la megastruttura

Il «dopo» della gerarchia verticale. Quando la quota ammessa satura, un isolato
del centro non ha piu' niente da diventare: `upgradePass` lo salta e la citta'
smette di cambiare figura proprio dove e' piu' densa. L'arcologia e' un'opera
sola che vale un quartiere, con **usi diversi su quote diverse** dentro un unico
volume.

Non e' un edificio grosso, ed e' la ragione per cui non sta in `buildings/`: un
edificio ha *un* uso, *un* livello e una pianta rettangolare piena. Qui gli usi
sono quattro e distribuiti in verticale, il livello e' uno **stadio**, e la
pianta ha dei vuoti in mezzo. La macchina e' quella dei landmark — `PartsRecipe`
disegnata da `generateFromRecipe` — e cio' che si aggiunge sono due tabelle di
posti: dove stanno gli usi, e dove attracca la rete in quota.

**Il vuoto dentro l'ingombro non e' una nota di gusto.** Il volume che legge come
megastruttura non e' il piu' alto: e' quello che scavalca il vuoto. Per questo
`skyWindowOf` esiste come predicato e un test lo chiede a ogni ricetta.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [catalog.ts](src/world/arcology/catalog.ts) | Sceglie in modo deterministico la prima ricetta che entra nell'isolato, senza lasciare che la forma da sedici renda irraggiungibili quelle da quattordici | `arcologyForBlock` |
| [src/world/arcology/config.ts](src/world/arcology/config.ts) | Regole, soglie normalizzate, tipi e cataloghi pubblici delle arcologie; separa le otto matrici dalle variazioni di profilo e dalla famiglia interrata, e le riunisce per il driver | `ARCOLOGY`, `SUNKEN`, `BASE_ARCOLOGY_KIND`, `PROFILE_ARCOLOGY_KIND`, `SUNKEN_ARCOLOGY_KIND`, `ARCOLOGY_KIND`, `BASE_ARCOLOGY_RECIPES`, `PROFILE_ARCOLOGY_RECIPES`, `SUNKEN_ARCOLOGY_RECIPES`, `TALL_ARCOLOGY_RECIPES`, `ARCOLOGY_RECIPES`, `MIN_SUNKEN_DEPTH`, `TWIN_STEM`, `BRANCHING_CORE`, `SKY_WEAVE`, `SPIRE_RING`, `DOUBLE_BAR`, `STACK_PAIR`, `QUAD_CLUSTER`, `TRI_SPAN`, `TERRACED_TWIN`, `SPLIT_CROWN`, `STEPPED_BAR`, `COURT_CASCADE`, `INVERTED_PYRAMID`, `SUNKEN_COURT`, `CRATER_RING`, `stageThresholds`, `arcologyOf`, `sunkenDepthOf`, `ArcologyRecipe`, `ArcologyKind`, `BaseArcologyKind`, `ProfileArcologyKind`, `SunkenArcologyKind`, `SunkenShape`, `ArcologyBand`, `ArcologyLanding` |
| [src/world/arcology/depth.ts](src/world/arcology/depth.ts) | Quanta roccia un luogo offre e se il contorno tiene l'acqua fuori. Puro: entrano quote e biomi gia' letti, esce un verdetto | `surveySunkenSite`, `SunkenSite`, `DepthProbe` |
| [src/world/arcology/profileVariants.ts](src/world/arcology/profileVariants.ts) | Quattro variazioni aggiuntive delle arcologie storiche: corpi e corone sfalsati, torri che terminano su quote diverse e profili verticali asimmetrici | `createArcologyProfileVariants` |
| [src/world/arcology/prospect.ts](src/world/arcology/prospect.ts) | Quanto manca, invece del solo perché no: `arcologyGaps`/`sunkenGaps` misurano ogni condizione con `have`/`need` accanto allo stesso `ARCOLOGY` che il predicato legge, `arcologyStanding` porta quota e candidato, `arcologyUses`/`ARCOLOGY_PROMISE` dicono cosa la struttura ospiterà. Un test lega la prima lacuna al rifiuto di `arcologyReady`, nelle due direzioni. |
| [src/world/arcology/recipes.ts](src/world/arcology/recipes.ts) | Catalogo delle otto sagome alte: corpi shell rastremati, quote distinte, corone e guglie a gradoni, con `triSpan` limitata a 440 dal lato corto | `createArcologyRecipes` |
| [src/world/arcology/shaft.ts](src/world/arcology/shaft.ts) | Il pozzo aperto, specchio della finestra di cielo: vuoto misurato dal piano in giu', cieco sui fianchi e aperto in alto, che le passerelle possono attraversare ma non sigillare | `shaftOf`, `Shaft`, `ShaftRule` |
| [siting.ts](src/world/arcology/siting.ts) | Quando la citta' e' pronta a darsene una. Puro e senza mondo: entrano numeri gia' misurati, esce un verdetto | `arcologyReady`, `arcologyAnchor`, `ARCOLOGY_REFUSALS`, `ArcologyQuery`, `ArcologyRefusal`, `BlockBounds` |
| [src/world/arcology/structure.ts](src/world/arcology/structure.ts) | Predicati strutturali sulle parti: connessione a ogni stadio, snellezza delle colonne misurata sulla sezione di base piu' larga e snellezza dei soli pennoni | `partsConnected`, `floatingBoxes`, `slenderColumns`, `maxSlendernessOf`, `mastColumns`, `maxMastSlendernessOf`, `FloatingBox`, `SlenderColumn` |
| [src/world/arcology/sunkenRecipes.ts](src/world/arcology/sunkenRecipes.ts) | Le tre forme interrate — piramide invertita, corte, cratere su due isolati — scritte al contrario: `z = 0` e' il fondo del pozzo e il piano di campagna sta in cima. Ogni ricetta porta due sagome, la struttura e l'imbuto da scavare | `createSunkenRecipes` |
| [window.ts](src/world/arcology/window.ts) | La finestra di cielo e il riempimento, come proprieta' verificabili di uno stamp | `skyWindowOf`, `fillRatio`, `SkyWindow`, `SkyWindowRule` |
| [generate.ts](src/world/arcology/generate.ts) | Ricetta→stamp, ingombro, origine, e le due tabelle di posti portate sul verso vero con la stessa rotazione delle parti | `generateArcology`, `arcologySpan`, `arcologyOrigin`, `worldBands`, `worldLandings`, `WorldBand`, `WorldLanding` |

```ts
arcologyReady({ existing, tier, blockRect, spanX, spanY, ... }); // refusal | null
generateArcology(recipe, { stage, facing, from });   // cumulativo, o il solo delta
skyWindowOf(stamp, ARCOLOGY.window);                 // il vuoto che scavalca | null
worldBands(recipe, facing, ox, oy);                  // un uso per fascia, sulle colonne vere
```

## `src/world/landmarks/` — le strutture dei catalizzatori

La forma che ogni ruolo prende a terra. Prima di questo dominio un catalizzatore
era un rombo di asfalto di raggio quattro con un voxel colorato al centro,
identico per tutti e otto: il porto in particolare non esisteva, e quello che si
vedeva sull'acqua era la carreggiata dell'isolato costiero.

Un landmark **non e' un tipo nuovo di cosa**: e' un `BuildingRecord` con
`landmark` valorizzato, quindi eredita dal Builder occupazione, collisione,
budget di chunk, comparsa a budget e avanzamento. A cambiare e' solo quale
generatore disegna lo stamp.

Una ricetta dichiara anche i propri **ormeggi**: i punti in cui i mezzi di
`src/world/traffic/` stanno fermi, o da cui partono. Stanno qui e non la' perche'
sono coordinate *della forma* — il bordo di una darsena che questa tabella
disegna — e con loro sta la **linea d'acqua**, cioe' la colonna in cui la ricetta
pretende che il mare cominci: e' quella che il piazzamento va a cercare sul
terreno vero, facendo scorrere la struttura lungo il fronte finche' la banchina
incontra l'acqua.

Lo **scalo in quota** (`SKYPORT`) e' la seconda forma dell'aeroporto, scelta dal
luogo invece che dal seme: sotto la colonna c'e' un tetto, quindi non si
costruisce un campo di volo ma tre modi di arrivarci senza pista — il pilone del
dirigibile, la piazzola dell'eVTOL, la cima della mongolfiera.

| File | Ruolo | Esporta |
| --- | --- | --- |
| [src/world/landmarks/berths.ts](src/world/landmarks/berths.ts) | Gli ormeggi (`BERTH`) in un file loro, perche' le ricette di `recipes/` possano leggerli senza il ciclo di import con `config.ts`. |
| [canvas.ts](src/world/landmarks/canvas.ts) | La tela su cui le parti scrivono, in un file suo per rompere il ciclo fra `parts.ts` e `ornaments.ts` | `LandmarkCanvas`, `createCanvas`, `put` |
| [src/world/landmarks/config.ts](src/world/landmarks/config.ts) | Catalogo ricette e forme (`LANDMARKS`, `FORMS`), tipi di ricetta (`waterline`, `lakeQuay`, `basinDepth`), forme d'acqua della marina, e il sedime per stadio (`growth`, `StageFootprint`) con `growsFootprint` e `footprintOf`. |
| [facadePlan.ts](src/world/landmarks/facadePlan.ts) | Piano puro dello Skyport di facciata: centra la ricetta fuori dall'ospite, riusa le corse delle terrazze e affida gli appoggi a `planDeck` | `planFacadeLandmark`, `FacadeLandmarkPlan`, `FacadeLandmarkQuery`, `FacadeLandmarkResult`, `FacadeLandmarkRefusal` |
| [ornaments.ts](src/world/landmarks/ornaments.ts) | Le cinque primitive ornate — portale passante, cupola convessa, contrafforti rampanti, guglia rastremata, parete traforata — tutte con maschera simmetrica per restare invarianti alla rotazione | `drawArch`, `drawDome`, `drawButtress`, `drawSpire`, `drawTracery` |
| [parts.ts](src/world/landmarks/parts.ts) | Le quindici primitive con cui una ricetta si compone, lo smusso della pianta, le cornici marcapiano e la rotazione sul verso. Le cinque ornate le disegna `ornaments.ts` | `PART`, `Part`, `PartKind`, `box`, `partBounds`, `orientPart`, `orientedSpan`, `createCanvas`, `drawPart`, `LandmarkCanvas` |
| [generate.ts](src/world/landmarks/generate.ts) | Compone tronco ed esemplare in uno stamp; ingombro, origine, stadio, scelta della variante dal seme (o fissata dalla forma) e ormeggi portati sul verso vero. `landmarkWaterColumn` porta la linea d'acqua di una ricetta sul terreno vero. Il nucleo ricetta-stamp e' condiviso con le arcologie; una ricetta che cresce di sedime e' **autocontenuta per stadio**, non cumulativa | `generateFromRecipe`, `recipeSpan`, `recipeOrigin`, `generateLandmark`, `landmarkSpan`, `landmarkOrigin`, `landmarkMoorings`, `landmarkWaterColumn`, `stageForBuildings`, `variantIndexOf`, `RecipeRequest`, `LandmarkRequest`, `WorldMooring` |
| [recipes/civic.ts](src/world/landmarks/recipes/civic.ts) | Le ricette civiche: campus, monumento, museo, cattedrale. Monumento e cattedrale crescono di sedime su sei stadi | `UNIVERSITY`, `MONUMENT`, `MUSEUM`, `CATHEDRAL` |
| [recipes/connections.ts](src/world/landmarks/recipes/connections.ts) | Le due ricette nuove del gruppo Connections: torre radio e faro | `RADIO`, `LIGHTHOUSE` |
| [recipes/growth.ts](src/world/landmarks/recipes/growth.ts) | Le due ricette nuove del gruppo Growth: centrale elettrica e scuola | `POWER`, `SCHOOL` |
| [recipes/identity.ts](src/world/landmarks/recipes/identity.ts) | Le due ricette del gruppo Identity: teatro e stadio. Crescono di sedime su sei stadi — il teatro dalla sala di paese all'opera con la cupola, lo stadio dal campetto al catino da mondiali | `THEATRE`, `STADIUM` |
| [src/world/landmarks/recipes/identityMarina.ts](src/world/landmarks/recipes/identityMarina.ts) | La ricetta della marina: promenade, moli a dita e bacino scavato (`waterline`, `lakeQuay`, `basinDepth`); sul lago gli slip diventano canali ritagliati nella riva emersa. |
| [recipes/logistics.ts](src/world/landmarks/recipes/logistics.ts) | Le tre ricette lineari che guardano l'acqua: molo, traghetto, pista | `PORT`, `FERRY`, `AIRPORT` |
| [recipes/park.ts](src/world/landmarks/recipes/park.ts) | Il parco, in un file suo perche' e' l'unico ruolo che si riconosce per assenza di volume | `PARK` |
| [recipes/production.ts](src/world/landmarks/recipes/production.ts) | Le ricette produttive: fabbrica, mercato, serra | `FACTORY`, `MARKET`, `GREENHOUSE` |
| [recipes/station.ts](src/world/landmarks/recipes/station.ts) | La stazione, in un file suo: l'unica forma lineare che sospende invece di appoggiare, e la piu' lunga del catalogo. Cresce di sedime su sei stadi, con le pile del viadotto disegnate ad arco | `TRANSPORT` |
| [vocab.ts](src/world/landmarks/vocab.ts) | Scorciatoie condivise fra le ricette: gru di banchina, banchina, bitta, vano d'ingresso, fascia d'insegna e albero | `craneAt`, `quay`, `bollard`, `entrance`, `signBand`, `tree` |

```ts
landmarkSpan('port', FACING.east);          // { sizeX, sizeY, sizeZ } | null
landmarkOrigin('port', facing, x, y);       // angolo minimo dell'ingombro | null
landmarkMoorings('ferry', facing, ox, oy);  // dove stanno le barche, nel mondo
stageForBuildings(recipe, nearby);          // quanto la citta' intorno ha meritato
generateLandmark({ kind, stage, facing });  // VoxelStamp | null
```

## `src/world/skyline/` — la gerarchia verticale

Fin dove una colonna puo' salire, che e' una domanda diversa da «questa colonna
vuole crescere?». La desiderabilita' continua a decidere **se** un edificio
promuove; qui si decide **fin dove**, perche' il campo e' un `Uint8Array` che
satura a 255 e sopra l'ultima soglia non distingue piu' due colonne del centro.
Senza questa separazione, alzare il livello massimo darebbe un altopiano piu'
alto invece di uno skyline.

Puro e senza stato come la rete stradale: distanza dai poli, dal mare e dal bordo
dell'edificato entrano come numeri, esce un tetto. `src/sim/` continua a non
avere una coordinata verticale (invariante 7).

| File | Ruolo | Esporta |
| --- | --- | --- |
| [config.ts](src/world/skyline/config.ts) | **Ogni** tetto di fascia, bonus, raggio e cadenza dei picchi | `SKYLINE` |
| [tiers.ts](src/world/skyline/tiers.ts) | Le tre fasce, il cono verso il polo, l'elezione dell'isolato con il picco e il bonus di quota che distingue la cresta dalla spalla | `TIER`, `tierAt`, `allowedLevelAt`, `heightBonusAt`, `poleReach`, `isPeakBlock`, `SkylineTier`, `SkylineQuery`, `Pole` |

```ts
tierAt(query);          // fringe | middle | core
allowedLevelAt(query);  // livelli ammessi; il clamp a BUILDER.maxLevel lo fa il Builder
isPeakBlock(seed, kx, ky);
```
