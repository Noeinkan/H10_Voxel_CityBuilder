# Indice — simulazione e gioco

Il tick, la desiderabilita’, le decisioni; il passo fisso, le azioni, il salvataggio e la crescita.

Una scheda del [Project Index](../../PROJECT_INDEX.md): qui c’e’ solo *dove sta cosa*.
Il modo economico di leggerla e’ `npm run locate -- <termine>`, che cerca su tutte le
schede insieme e restituisce le sole righe che servono. I percorsi delle righe
sono relativi alla radice del repository, non a questa cartella.


## `src/sim/` — simulazione a tick

Risorse e popolazione, campo di desiderabilità per cella e per classe, candidati
di crescita. Il `Builder`, esterno al modulo, consuma quei candidati. Dettagli in
[src/sim/README.md](src/sim/README.md).

| File | Ruolo | Esporta |
| --- | --- | --- |
| [src/sim/coverage.ts](src/sim/coverage.ts) | Copertura dei servizi per colonna: quota cittadina dal civico cresciuto piu' quota locale dal piano civico del campo. |
| [src/sim/decay.ts](src/sim/decay.ts) | Il declino: chi sta in un posto che non lo regge piu' (`nextDecaySites`) e il fronte che decide quando (`nextDecayPressure`). |
| [forecast.ts](src/sim/forecast.ts) | Quanti tick mancano: stime lette dai delta che il tick ha già misurato, mai da una seconda copia della formula. `null` significa «al ritmo di adesso non ci arriva» | `ticksToReach`, `ticksToEmpty`, `materialRate`, `ticksToAffordConstruction`, `ticksToFillHousing` |
| [index.ts](src/sim/index.ts) | Barrel: superficie pubblica per chi sta fuori dalla cartella | tutto il resto |
| [balance.ts](src/sim/balance.ts) | Coefficienti, soglie e moltiplicatori in `BALANCE`; la densita' urbana e' regolata dalla congestione 8/8, mentre `siteThreshold` resta il solo gate di edificabilita' | `BALANCE` |
| [classes.ts](src/sim/classes.ts) | I quattro usi urbani come indici densi | `BUILDING_CLASS`, `CLASS_NAMES`, `CLASS_LABELS`, `CLASS_COUNT`, `ALL_CLASSES` |
| [catalysts.ts](src/sim/catalysts.ts) | Catalogo dei diciotto ruoli: vettore di influenza, funzione di toolbar, effetti locali | `CATALYSTS`, `CATALYST_GROUPS`, `catalystById`, `isCatalystId`, `catalystInfluence`, `catalystRoleOf`, `defaultCatalystOfClass`, `CatalystId` |
| [infoViews.ts](src/sim/infoViews.ts) | Le viste informative pure: catalogo (cibo, materiali, densita', felicita', distretti), campionatori per cella e indice di capacita' per colonna. Nessun colore, nessun Three: la simulazione risponde ai dati, il look sta nel renderer | `INFO_VIEWS`, `DISTRICT_ORDER`, `DISTRICT_CATEGORIES`, `FOOD_CATEGORIES`, `infoViewSpecOf`, `isInfoViewKind`, `nextInfoView`, `infoViewVersion`, `capacityIndex`, `createSimInfoSampler`, `InfoViewKind`, `InfoViewMode`, `InfoViewSpec`, `InfoSampler` |
| [src/sim/materials.ts](src/sim/materials.ts) | Rendiconto dei materiali, capacità economica dei livelli e costi dei cantieri verticali |
| [satisfaction.ts](src/sim/satisfaction.ts) | Decomposizione del bersaglio di soddisfazione: referto derivato dal tick, gemello di `harvest` | `SatisfactionReport`, `EMPTY_SATISFACTION`, `satisfactionReportOf` |
| [SimState.ts](src/sim/SimState.ts) | Stato, operazioni del giocatore, serializzazione JSON senza perdita | `createSimState`, `addCatalyst`, `addBuilding`, `addFarm`, `removeFarm`, `setPolicyActive`, `setSelectedClass`, `toSimStateData`, `reviveSimState`, `rebuildField`, `resolveDecision`, `snoozeDecision` |
| [tick.ts](src/sim/tick.ts) | Il bilancio di un tick, funzione pura | `tick`, `tickMany`, `weightsOf` |
| [DesirabilityField.ts](src/sim/DesirabilityField.ts) | Campo per uso urbano, `Uint8Array` chunkato 32×32, ricalcolo incrementale e indice dei massimi per chunk mantenuto a scrittura | `DesirabilityField`, `rectAround`, `rectArea`, `Catalyst`, `Building`, `CellRect` |
| [reach.ts](src/sim/reach.ts) | Portata geodetica di un catalizzatore e l'unica curva di decadimento del progetto: Dijkstra a 8 vicini tagliato al raggio, con cache per centro | `computeReach`, `distAt`, `reachAt`, `falloff`, `ReachCache`, `UNIFORM_COST`, `ReachField`, `StepCost` |
| [policies.ts](src/sim/policies.ts) | Catalogo delle policy e risoluzione dei pesi | `POLICIES`, `resolveWeights`, `withPolicy`, `policyById`, `isPolicyId`, `Weights`, `PolicyId` |
| [districts.ts](src/sim/districts.ts) | Profili locali, distretti e specializzazioni da campi sovrapposti; `urbanFieldAt` e' lo spicchio del profilo (soddisfazione e distretto) che le heatmap campionano per cella con la stessa aritmetica | `urbanProfileAt`, `urbanFieldAt`, `specializationOf`, `dominantUse`, `DistrictId`, `LocalUrbanProfile`, `UrbanField`, `Specialization` |
| [commerce.ts](src/sim/commerce.ts) | Il ciclo commerciale interno: domanda, organico, merce, ricavi | `resolveCommerce`, `EMPTY_COMMERCE`, `CommerceReport` |
| [flows.ts](src/sim/flows.ts) | Da dove vengono i fondi di un tick e dove vanno: referto derivato come `commerce`, non un accumulo | `FundsReport`, `NO_FUNDS_FLOW`, `fundsIn`, `fundsOut`, `dominantOutflow` |
| [decisions.ts](src/sim/decisions.ts) | Scelte periodiche deterministiche, con cadenza a eventi, mandato e opera concessi | `decisionAt`, `decisionFingerprint`, `decisionOption`, `CityDecision`, `DecisionGrant` |
| [charters.ts](src/sim/charters.ts) | Mandati lasciati dalle decisioni: uno slot per famiglia, permanenti | `CHARTERS`, `charterById`, `charterOfFamily`, `isCharterId`, `withCharter`, `withoutFamily`, `canonicalCharters`, `Charter`, `CharterFamily`, `CharterId` |
| [farms.ts](src/sim/farms.ts) | I tre produttori di cibo: listino in case sfamate, braccia, manutenzione, referto del raccolto, e i due numeri che il bilancio consegna a chi pianta e a chi giudica | `FARM_KIND`, `ALL_FARM_KINDS`, `harvestOf`, `foodYieldOf`, `farmWorkersOf`, `farmUpkeepOf`, `foodDeficitOf`, `missingPlotsOf`, `fedShareOf`, `isFarmKind`, `FarmKind`, `FoodReport`, `EMPTY_HARVEST` |
| [trade.ts](src/sim/trade.ts) | Import/export aggregato sbloccato dal porto | `resolveExternalTrade`, `TRADE_MODES`, `TradeMode` |
| [ferry.ts](src/sim/ferry.ts) | Quali imbarchi sono serviti da una linea: la coppia, non il singolo molo | `ferryLinesOf`, `servedFerryLines`, `FerryLine`, `FerryTerminal` |
| [nextBuildSites.ts](src/sim/nextBuildSites.ts) | I candidati, ordinati, filtrati e con l'eventuale secondo uso; salta i chunk senza alcun uso sopra soglia | `nextBuildSites`, `BuildSite`, `BuildSiteQuery` |
| [rng.ts](src/sim/rng.ts) | `mulberry32` in forma pura, stato dentro `SimState` | `nextState`, `unitOf` |
| [scenario.ts](src/sim/scenario.ts) | Fixture della scena di debug: catalizzatori, nucleo di edifici e lotti agricoli | `createScenarioState`, `scenarioCatalysts` |
| [debugData.ts](src/sim/debugData.ts) | L'unica scrittura verso il `VoxelWorld`, e va in `data` | `writeDesirabilityData` |
| [vitality.ts](src/sim/vitality.ts) | Quanto la citta' e' viva in due frazioni: case occupate e negozi pieni. Lettura pura, la consumano le luci | `cityVitality`, `DEFAULT_VITALITY`, `CityVitality` |
| [testTerrain.ts](src/sim/testTerrain.ts) | Fixture di terreno per i test. **Non** è codice di produzione | `testTerrain` |

```ts
let state = createSimState();
state = addCatalyst(state, { x: 96, y: 96, kind: 'market', class: BUILDING_CLASS.residential, strength: 220, radius: 24 });
state = tick(state, terrainMap);        // puro: nuovo stato, input intatto
nextBuildSites(state, terrainMap, 10);  // [{ x, y, class, mixed, score }, …]
```

## `src/game/` — ciclo di gioco

| File | Ruolo | Esporta |
| --- | --- | --- |
| [coach.ts](src/game/coach.ts) | Il coach di sviluppo: la rotta della voce in nove tier ordinati (cibo, connessioni, identita', distretti, stadi, skyline, tetti, citta' in quota, arcologie). Il tier skyline nomina un landmark concreto e segna il blocco denso da coprire (`place`). Puro, derivato dallo stato e da fatti del mondo gia' misurati | `coachSuggestion`, `coachSuggestions`, `CoachSuggestion`, `CoachContext`, `CoachLandmark`, `CoachTier` |
| [src/game/coachArcology.ts](src/game/coachArcology.ts) | La scala della megastruttura come voce del coach: una riga per lacuna bloccante, l'anello del candidato su `place`, e il traguardo in edifici quando la quota è piena. Estratto da `coach.ts` alla soglia delle 600 righe. |
| [facadePick.ts](src/game/facadePick.ts) | La faccia di un edificio sotto il puntatore, dal raggio: punto d'ingresso nella scatola e parete piu' vicina, pareggio che non sceglie. Puro, gira in node | `pickFacade`, `FacadeBox` |
| [infoViews.ts](src/game/infoViews.ts) | Cablaggio delle viste informative: le quattro della simulazione passano da `createSimInfoSampler`, la vista del cibo rastrella i lotti del mondo e le torri idroponiche | `createInfoSampler` |
| [loop.ts](src/game/loop.ts) | Passo fisso della simulazione con tetto di recupero | `FixedStepLoop` |
| [growthScene.ts](src/game/growthScene.ts) | Cablaggio esclusivo di `grow=1`: tick, Builder e animazione; espone la gomma (`demolish`, `demolishAt`, `demolishSurvey`, `demolishPreview`, `undoDemolition`) al gioco e le due porte del salvataggio (`toSave`, `restore`). Raccoglie anche la colonna piu' densa per il coach dello skyline | `GrowthScene`, `GrowthStats`, `SectorRegion` |
| [save/capture.ts](src/game/save/capture.ts) | Da partita in corso a file: pota cio' che nessun generatore sa ridisegnare da un record (campate, impalcati, funivie) e transitivamente chi ci poggiava sopra, togliendo gli stessi edifici dalla simulazione su una copia staccata | `captureSave`, `CaptureInput` |
| [save/format.ts](src/game/save/format.ts) | Il formato di salvataggio versionato e la sua lettura difensiva: un file piu' nuovo si rifiuta, un campo mancante prende il proprio default come in `reviveSimState`, record e settori malformati cadono invece di aprirsi a meta' | `readSave`, `SAVE_VERSION`, `SaveGame`, `SaveScene` |
| [save/storage.ts](src/game/save/storage.ts) | Slot su uno storage iniettabile: autosave, tre slot a mano, lo slot di passaggio che il prossimo avvio consuma, export e import JSON. Nessuna eccezione verso l'alto — quota piena e storage bloccato sono esiti | `browserStorage`, `readSlot`, `writeSlot`, `takeSlot`, `deleteSlot`, `listSlots`, `exportText`, `importText`, `AUTO_SLOT`, `MANUAL_SLOTS`, `PENDING_SLOT`, `SaveStorage`, `SlotInfo`, `WriteResult` |
| [simScene.ts](src/game/simScene.ts) | Cablaggio di `sim=1`: la simulazione che gira sull'isola senza costruirci. Gemello di `growthScene` per la scena di misura | `SimScene`, `SIM_TICK_RATE`, `SIM_SITE_COUNT` |
| [launchMode.ts](src/game/launchMode.ts) | Modalita' d'avvio, seed e indirizzi derivati: cosa conta come seed sta in un posto solo — lo leggono sia `?seed=` sia il campo del menu — e qui vive anche la regola della porta d'ingresso, cioe' quando il menu si apre e quando la scelta e' gia' fatta | `resolveLaunchMode`, `resolveSeed`, `parseSeedInput`, `opensEntryMenu`, `newGameUrl`, `perfToggleUrl`, `swatchUrl`, `PLAY_PARAM`, `LaunchMode` |
| [actions.ts](src/game/actions.ts) | Azioni economiche atomiche: catalizzatori, policy, decisioni, commercio ed espansione | `placeCatalyst`, `catalystFailure`, `catalystSiteCost`, `togglePolicy`, `chooseDecision`, `changeTradeMode`, `buyExpansion`, `expansionFailure`, `SiteCost`, `ActionResult`, `ActionFailure` |
| [surfacePick.ts](src/game/surfacePick.ts) | Selezione pura della colonna da un raggio 3D: sulla sola heightmap per chi costruisce, sugli edifici compresi per chi guarda | `pickSurfaceCell`, `pickSolidCell`, `Ray3`, `SurfaceCell`, `BuiltTop` |
| [selection.ts](src/game/selection.ts) | Cosa c'è sotto un punto, con l'isolato come unità di selezione. `BlockProductivity` aggrega capacità residenziale e commerciale, materiali, cibo e costo civico dagli edifici dell'isolato, applicando policy, usi misti, torri agricole e organico cittadino. `growth` porta anche la soglia scomposta (base e sconto locale), le fonti della desiderabilità (`DesirabilitySource`, gli stessi addendi del campo) e la congestione; `influence` è il vettore per uso di un landmark al centro, pesato dalle policy | `resolveSelection`, `Selection`, `SelectionQuery`, `StructureInfo`, `DesirabilitySource`, `UseInfo`, `BlockInfo`, `BlockProductivity`, `ColumnInfo`, `VoxelInfo` |
| [onboarding.ts](src/game/onboarding.ts) | Tutorial derivato dai catalizzatori, senza flag nascosti | `onboardingOf`, `onboardingAllows` |
| [cityCondition.ts](src/game/cityCondition.ts) | Obiettivo di autosufficienza e crisi con indicazioni di recupero | `cityCondition`, `isSelfSufficient` |
| [sectors.ts](src/game/sectors.ts) | Identità, region e maschera composta dei settori costieri, dalla cella cliccata o dall'identificatore che un salvataggio si porta dietro | `coastalSectorAt`, `coastalSectorById`, `shapeWithSector` |
| [tips.ts](src/game/tips.ts) | La salute della citta' in due famiglie ordinate per urgenza: crisi e colli di bottiglia. Puro e senza storia; opportunita' e meccaniche sono migrate nel coach | `tipsFor`, `urgentTip`, `GameTip`, `TipKind` |
| [worldReady.ts](src/game/worldReady.ts) | Il segnale «la prima scena c'e'» fra radice e titolo: evento sulla finestra e attesa con tetto, perche' una schermata ferma non diventi un guasto | `WORLD_READY_EVENT`, `signalWorldReady`, `whenWorldReady` |
