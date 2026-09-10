# Milestone e sblocco dei landmark — piano

Piano di un incremento non ancora aperto. Descrive **come si sbloccano i
diciannove ruoli** invece di averli tutti aperti al minuto tre, e la correzione
del bilancio dei fondi senza la quale lo sblocco non regge.

Il modello di riferimento è Cities: Skylines, su due livelli distinti: una
**scala di milestone** che apre categorie di contenuto, e una **condizione
individuale** per ciascun edificio unico, sopra la milestone.

## Il problema, misurato

### Gli sblocchi non esistono

I primi tre ruoli — Market, Factory, Park — sono in ordine perché li ordina il
tutorial di [onboarding.ts](../../src/game/onboarding.ts), che finisce a
`'complete'`; da lì `onboardingAllows` risponde sempre sì. Un piazzamento
attraversa quattro controlli in
[actions.ts:187-231](../../src/game/actions.ts#L187-L231):

1. il terreno regge e il sito è quello che il ruolo chiede;
2. non c'è già un catalizzatore **dello stesso tipo** entro `minDistance` — di
   tipo diverso possono stare uno sull'altro;
3. `landmark-requires-city`: sedici edifici già costruiti, ma solo per le ricette
   con impronta oltre `SCALE.megaFootprint` (16 voxel), cioè cattedrale,
   monumento, stadio, porto e aeroporto;
4. i fondi bastano.

Nessuno dei quattro è una progressione. Nel modello dell'HUD la disponibilità di
un bottone è letteralmente `ready && orderOk && fundsOk`
([GameHudModel.ts:328](../../src/ui/GameHudModel.ts#L328)).

### I fondi non hanno un freno che scala con la città

È la ragione per cui il denaro corre mentre cibo e materiali restano stretti, e
va corretta **prima** dello sblocco: un cancello che chiede soldi non chiude
niente se i soldi non finiscono mai.

La simulazione gira a dieci tick al secondo. Per abitante, per tick:

| Voce | Per abitante | Scala con |
| --- | --- | --- |
| Gettito fiscale (`funds.taxPerResident`) | +0,12 | popolazione |
| Incasso al dettaglio (`commerce.revenuePerCustomer`, domanda 1/abitante) | +0,08 | popolazione |
| Consumo di cibo (`food.perResident`) | −0,05 **cibo** | popolazione |
| **Costo in fondi di un abitante** | **0** | — |

Le uscite in fondi sono tre e nessuna guarda la popolazione: `civic * 2` per gli
edifici civici, la manutenzione delle policy attive, e la torre idroponica
([tick.ts:147-159](../../src/sim/tick.ts#L147-L159)). Gli edifici, poi, **si
costruiscono in materiali, mai in fondi**: `materials.upkeepPerBuilding` è 0,02
per edificio per tick, e il corrispettivo in fondi non esiste.

Il risultato in una riga: **ogni abitante porta circa due fondi al secondo e non
ne costa nessuno**, mentre porta una domanda di cibo che qualcuno deve produrre.
A centoventi abitanti — cioè alla condizione di vittoria — la città incassa sui
240 fondi al secondo lordi. Lo Stadium, il pezzo più caro del catalogo dopo
l'espansione, costa 460: due secondi. Il divario si allarga con la popolazione,
perché il lato che cresce è solo quello delle entrate.

## Prima parte — il freno sui fondi

Tre correzioni possibili, dalla più piccola alla più strutturale. Non sono
alternative esclusive: la prima e la seconda si sommano bene.

1. **Manutenzione per catalizzatore.** Oggi un catalizzatore si paga una volta e
   rende per sempre: non ha `upkeep`, a differenza di una policy. Un costo per
   tick proporzionale al listino trasforma «posso permettermelo» in «posso
   mantenerlo», che è la scelta che oggi manca. È anche la correzione che dà
   senso allo sblocco: un ruolo aperto non è ancora un ruolo sostenibile.
2. **Servizi che scalano con la città.** Un termine di uscita legato a
   `buildings.length` o alla popolazione, gemello di
   `materials.upkeepPerBuilding` che già esiste. È la voce che oggi manca al
   bilancio e la sola che chiude il divario in modo strutturale.
3. **Ritarare `taxPerResident` e `revenuePerCustomer`.** Da fare per ultimo e
   solo se le prime due non bastano: abbassare le entrate senza aggiungere
   un'uscita rende la partita lenta all'inizio e resta divergente alla fine.

Va misurata su una partita vera, non solo sui test: il numero che conta è
**quanti secondi di città serve accumulare** per un landmark del gruppo Identity,
e deve essere dell'ordine delle decine, non dei secondi.

## Seconda parte — la scala delle milestone

Le soglie **non si inventano**: sono quelle che il gioco già usa. Ventiquattro
abitanti è la mensola, quarantotto l'espansione e la policy `marketCharter`,
settantadue `civicPride`, centoventi la vittoria; sedici edifici è già il gate
dei landmark grandi. Una scala su quei valori non aggiunge una tabella da tenere
allineata a mano.

| Milestone | Soglia | Apre | Già lì a quella soglia |
| --- | --- | --- | --- |
| `foundation` | tutorial completo | Greenhouse, Power Station | — |
| `settlement` | 24 abitanti, città sfamata | School, Transit | Terrace |
| `trading-post` | 48 abitanti | Port, Ferry, Lighthouse | Expand, `marketCharter` |
| `district` | 72 abitanti + 16 edifici | Radio Tower, University, Monument | `civicPride`, gate landmark |
| `metropolis` | 120 abitanti + 3 edifici per classe | Museum, Cathedral, Theatre, Stadium, Marina, Airport | condizione di vittoria |

«Città sfamata» si chiede a `fedShareOf`, non al segno del delta: uno stock
esaurito si ferma a zero e il delta vale zero, e una città che mangia un terzo di
quel che le serve passerebbe il controllo. È lo stesso punto cieco già
documentato in [cityCondition.ts:15-25](../../src/game/cityCondition.ts#L15-L25).

**La ricompensa in fondi resta**, ma tarata dopo la prima parte: il gradino deve
finanziare i ruoli che ha appena aperto — sbloccare lo Stadium e scoprire di non
poterlo pagare è peggio che non sbloccarlo — senza rimettere in circolo il
problema che la prima parte ha appena chiuso. Ordine di grandezza: il listino del
ruolo più caro che il gradino apre, non un multiplo.

## Terza parte — le condizioni individuali

Sopra la milestone, il singolo landmark chiede di aver **fatto** qualcosa. È la
metà che dà carattere: lega il monumento alla partita giocata invece che al
contatore degli abitanti. Tutte le condizioni qui sotto sono esprimibili da
`SimState`, che porta già `buildingCounts`, `mixedCounts`, `catalysts`,
`satisfaction`, `harvest`, `policies` e il livello di ogni edificio.

| Landmark | Milestone | Condizione propria | Perché quella |
| --- | --- | --- | --- |
| Stadium | `metropolis` | N edifici commerciali | La folla che impacchetta deve già esistere |
| Airport | `metropolis` | un edificio di livello 7+ | È già il requisito dello Skyport, oggi scritto solo nella descrizione |
| Marina | `metropolis` | un edificio cresciuto entro il raggio costiero | Un porto turistico senza fronte costruito è un molo nel nulla |
| Cathedral | `metropolis` | soddisfazione ≥ soglia mantenuta | Ancora un quartiere che sta già bene |
| Museum | `metropolis` | una University già piazzata | Catena: la conoscenza prima della sua vetrina |
| Theatre | `metropolis` | N edifici civici | Corona un quartiere civico, non lo fonda |

Le condizioni non sostituiscono la milestone: si sommano. Il bottone mostra la
**più lontana delle due**, che è già quello che `bindingThreshold` fa per fondi e
abitanti ([GameHudModel.ts:158-178](../../src/ui/GameHudModel.ts#L158-L178)).

## Come si scrive

### Il contratto: puro e derivato dallo stato

`src/game/milestones.ts`, nuovo, puro, **senza flag salvati**. È la stessa
proprietà di `onboarding.ts`: il tutorial non memorizza a che passo è, lo ricava
dallo stato ogni volta, e per questo sopravvive a salvataggio e ricarica senza
dati aggiuntivi. Una scala scritta allo stesso modo eredita quella proprietà
gratis e **`src/game/save/` non va toccato**.

Superficie prevista:

- `MILESTONES` — la scala, in ordine;
- `milestoneOf(state)` — il gradino raggiunto;
- `catalystGate(state, id)` — `null` se il ruolo è aperto, altrimenti la soglia
  vincolante fra milestone e condizione propria, nella forma che
  `bindingThreshold` già consuma.

I numeri vanno in `BALANCE.gameplay.milestone`, come tutti gli altri.

### I punti d'aggancio, tre

1. **[actions.ts](../../src/game/actions.ts)** — `catalystFailure` guadagna un
   rifiuto `'milestone-required'`, prima del controllo sui fondi e dopo quello
   sul sito: la soglia è una proprietà della città, e sentirsi dire «non ancora»
   dove il landmark non starebbe comunque manderebbe a far crescere abitanti
   invece che a cercare un altro posto. **Il cursore non va toccato**: legge già
   `catalystFailure`.
2. **[GameHudModel.ts](../../src/ui/GameHudModel.ts)** — il ciclo dei catalizzatori
   aggiunge il gate accanto a `orderOk` e `fundsOk`. `locked`, `requirement`,
   `requirementShort` e `progress` esistono già e la CSS li disegna già: è
   l'affordance del bottone *Expand*, che mostra «0 / 48 residents» con la barra
   di riempimento. Non serve UI nuova.
3. **[GameHud.ts](../../src/ui/GameHud.ts)** — una riga nella mappa dei messaggi
   di rifiuto. TypeScript la pretende: il `Record<ActionFailure, string>` non
   compila senza.

Il coach di [coach.ts](../../src/game/coach.ts) **non va allineato a mano**: i
suoi nove tier seguono già la stessa rotta (cibo, fondamenta, sviluppo,
connessioni, identità, distretti, stadi, skyline, tetti, quota, arcologie). Se
una milestone e un tier divergono, è la milestone a essere sbagliata.

### Verifica

Test mirati, non la suite: `npm run typecheck` più i file che coprono ciò che si
tocca — `milestones.test.ts` (nuovo), `actions.test.ts`, `GameHudModel.test.ts`,
`onboarding.test.ts`, `cityCondition.test.ts`, e i test del bilancio
(`policyCosts.test.ts`, `flows.test.ts`, `commerce.test.ts`) per la prima parte.

Il caso che vale più di tutti gli altri: **una partita salvata prima
dell'incremento si ricarica e la scala si ricostruisce da sé**, senza campi nuovi
nel formato. Se non è vero, il piano ha sbagliato qualcosa.

## Cosa questo piano non fa

- **Non nasconde i bottoni.** Un ruolo bloccato resta nella mensola e dice cosa
  gli manca: è la regola già scritta in
  [GameHudModel.ts:350-352](../../src/ui/GameHudModel.ts#L350-L352), e nascondere
  il catalogo toglierebbe al giocatore l'unica mappa di dove può arrivare.
- **Non tocca le ricette dei landmark.** La revisione delle forme è un lavoro
  suo, in [landmarks-revamp.md](../world/landmarks-revamp.md).
- **Non aggiunge un obiettivo dopo la vittoria.** Le milestone lo risolvono di
  rimbalzo — diventano loro la scala che dice sempre dove sei — ma `success` in
  `cityCondition` resta quello che è.

## Riferimenti

- [Milestone — Skylines Wiki](https://skylines.fandom.com/wiki/Milestone): la
  scala per popolazione, da Little Hamlet (120) a Megalopolis (20.000), e i
  contanti che ogni gradino versa.
- [Unique buildings — Cities: Skylines Wiki](https://skylines.paradoxwikis.com/Unique_buildings):
  i sei livelli agganciati alle milestone, e la condizione individuale di ciascun
  edificio — 10.000 caselle residenziali, sette università da dieci settimane,
  5.000 bambini alle elementari.
- [Game Progression — Cities: Skylines II](https://www.paradoxinteractive.com/games/cities-skylines-ii/features/game-progression):
  il seguito sostituisce la scala unica con progressioni per servizio, che è la
  direzione in cui questo piano potrebbe crescere se cinque gradini si
  rivelassero pochi.
