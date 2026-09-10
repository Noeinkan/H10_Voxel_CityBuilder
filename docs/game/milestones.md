# Milestone, sblocco dei landmark e freno sui fondi

Come si sbloccano i diciannove ruoli, e perché il bilancio dei fondi ha dovuto
cambiare prima che una scala di sblocco avesse senso. Il modello di riferimento è
Cities: Skylines, su due livelli distinti: una **scala di milestone** che apre
categorie di contenuto, e una **condizione individuale** per ciascun landmark,
sopra la milestone.

## Il difetto che chiude

I primi tre ruoli — Market, Factory, Park — erano in ordine perché li ordinava il
tutorial di [onboarding.ts](../../src/game/onboarding.ts). Finito quello,
`onboardingAllows` rispondeva sempre sì e i sedici ruoli restanti erano aperti
tutti insieme: l'unico cancello era il prezzo. Al minuto tre il giocatore aveva
l'intero catalogo davanti e nessuna ragione per preferire un ruolo a un altro.

E il prezzo non era un cancello. Una partita misurata di venti minuti — sonda
headless su `GrowthScene`, isola da otto chunk, tredici ruoli piazzati appena
possibile — chiudeva con **17,2 milioni di fondi in cassa**, entrate a 2421 per
tick e uscite a 764: il 32%.

## Perché i fondi divergevano

La simulazione gira a dieci tick al secondo. Per abitante, per tick:

| Voce | Per abitante | Scala con |
| --- | --- | --- |
| Gettito fiscale (`funds.taxPerResident`) | +0,12 | popolazione |
| Incasso al dettaglio (`commerce.revenuePerCustomer`) | +0,08 | popolazione |
| Consumo di cibo (`food.perResident`) | −0,05 **cibo** | popolazione |
| **Costo in fondi di un abitante** | **0** | — |

Le tre uscite storiche guardavano sottoinsiemi che non crescono con la città:
gli edifici civici (`civic * 2`), le policy attive, le torri idroponiche. Gli
edifici, poi, **si costruiscono in materiali, mai in fondi**: esiste
`materials.upkeepPerBuilding`, il gemello in fondi no. Ogni abitante portava
circa due fondi al secondo e non ne costava nessuno.

## Prima parte — le due voci mancanti

`FundsReport` ha due uscite in più, e `dominantOutflow` le nomina come le altre.

1. **`services` — servizi urbani.** `servicesUpkeepOf(capacity)` in
   [flows.ts](../../src/sim/flows.ts): si paga sulla **capacità efficace** — la
   stessa base che genera il gettito, livelli e quote di uso misto compresi —
   perciò il rapporto fra entrate e uscite non dipende più da quanto è grande o
   alta la città. Sotto `funds.servicesFree` non si paga niente: un borgo non ha
   una macchina amministrativa, ed è la stessa idea di
   `materials.freeThroughLevel`.
2. **`catalysts` — manutenzione dei ruoli piazzati.** `catalystUpkeepOf` in
   [catalysts.ts](../../src/sim/catalysts.ts), una frazione del listino
   (`catalyst.upkeepShare`) e non una tabella nuova: il prezzo dice già quanto un
   ruolo pesa, e un ruolo aggiunto domani nasce con la sua manutenzione senza che
   nessuno la scriva. Era l'unica cosa nel gioco che si pagava una volta e
   rendeva per sempre.

**Come è stato tarato.** `servicesPerCapacity` a 1,25 mandava la città in
bancarotta: cassa a zero dal tick 9000, cathedral e stadium mai pagabili. A 1,0
la stessa partita di venti minuti chiude a **5,5 milioni** con le uscite al 101%
delle entrate, cioè in pareggio: la curva dei fondi ha smesso di avere una
pendenza e ha un asintoto.

**Quel che resta, e non è un difetto dei fondi.** Cinque milioni sono ancora
tanti, e vengono tutti dalla fase di crescita: la stessa partita arriva a 12.105
abitanti in venti minuti, contro una condizione di vittoria che ne chiede 120.
Finché la città cresce cento volte oltre il proprio obiettivo dichiarato, una
qualunque economia lineare accumula. È una domanda di ritmo, non di bilancio, e
sta fuori da questo lavoro.

## Seconda parte — la scala

Le soglie **non sono state inventate**: `milestones.ts` rilegge quelle che il
gioco già usa. Girare una di quelle manopole muove anche la scala.

| Milestone | Soglia | Da dove viene | Apre |
| --- | --- | --- | --- |
| `foundation` | i 3 ruoli del tutorial | `onboarding.ts` | Greenhouse, Power Station |
| `settlement` | 24 abitanti + 4 edifici | `terrace.population`, ¼ di `landmark.requiredBuildings` | School, Transit |
| `trading-post` | 48 abitanti + 8 edifici | `expansion.population`, ½ di `landmark.requiredBuildings` | Port, Ferry, Lighthouse |
| `district` | 72 abitanti + 16 edifici | `policy.civicPride.population`, `landmark.requiredBuildings` | Radio Tower, University, Monument |
| `metropolis` | 120 abitanti + 4 usi a 3 edifici | `success` | Museum, Cathedral, Theatre, Stadium, Marina, Airport |

**Gli edifici accanto agli abitanti nei gradini bassi sono una correzione
misurata.** Sulle sole soglie di popolazione i primi due gradini si
attraversavano in pochi secondi — la partita di prova arriva a 2163 abitanti in
cento secondi — e la scala non pesava niente proprio dove doveva insegnare il
ritmo. Gli edifici li fa il campo di desiderabilità un lotto alla volta, ed è
quello che il giocatore sta guardando mentre aspetta. Nella stessa partita
`metropolis` arriva al minuto dieci, tenuto fermo dai quattro usi a tre edifici.

**Il premio.** Ogni gradino dal secondo in poi versa fondi pari al listino del
ruolo più caro che apre: sbloccare lo Stadium e scoprire di non poterlo pagare è
peggio che non sbloccarlo. Non passa da `flows` — quello è il referto di un
bilancio ricorrente, e un versamento una tantum letto lì dentro sembrerebbe
un'entrata che si ripete.

## Terza parte — le condizioni individuali

Sopra il gradino, sei landmark chiedono di aver **fatto** qualcosa. È la metà che
lega il monumento alla partita giocata invece che al contatore degli abitanti.

| Landmark | Condizione propria | Perché |
| --- | --- | --- |
| Stadium | 8 edifici commerciali | La folla che impacchetta deve già esistere |
| Theatre | 6 edifici civici | Corona un quartiere civico, non lo fonda |
| Airport | un edificio di livello 7+ | Era già il requisito dello Skyport, scritto nella descrizione e verificato da nessuno |
| Cathedral | soddisfazione ≥ 0,5 | Àncora un quartiere che sta già bene |
| Museum | una University piazzata | L'unica condizione che nomina un altro ruolo: è una scelta di percorso |
| Marina | un ruolo costiero già acceso | Un porto turistico davanti a una riva morta è un molo nel vuoto |

Le due soglie si sommano, e il bottone mostra la **più lontana**: è quello che
`bindingThreshold` già faceva per fondi e abitanti.

## Come è fatto

**Puro e derivato dallo stato, tranne un numero.** Ogni soglia si rimisura sullo
stato a ogni chiamata, come i passi di `onboarding.ts`. L'eccezione è il
**massimo storico** — `scene.milestone` nel salvataggio — e non era evitabile:
senza, una carestia che riporta la città sotto i centoventi abitanti
richiuderebbe un monumento già sbloccato, e il premio si ripagherebbe a ogni
oscillazione della popolazione. Il default `-1` fa rimisurare la scala da capo,
che è il comportamento giusto per un salvataggio scritto prima che esistesse: la
versione del formato non sale, il campo ha il suo default.

**Tre agganci.**

1. [growthScene.ts](../../src/game/growthScene.ts) — `awardMilestone()` a ogni
   tick alza il massimo storico e versa il premio; `catalystFailure` rifiuta con
   `milestone-required`. L'ordine è: tutorial → facciata (in quota) → scala →
   terreno e fondi. La facciata passa davanti perché «cerca un edificio più
   alto» è un gesto e «non ancora» no; la scala passa davanti ai fondi perché chi
   non ha il gradino non deve mettersi a risparmiare per niente.
2. [GameHudModel.ts](../../src/ui/GameHudModel.ts) — `roleThresholds` accanto a
   `orderOk` e `fundsOk`. `locked`, `requirement`, `requirementShort` e
   `progress` esistevano già: è l'affordance del bottone *Expand*. Quando manca
   sia il gradino sia il prezzo, si mostra il gradino.
3. [GameHud.ts](../../src/ui/GameHud.ts) e
   [actionLabels.ts](../../src/shell/actionLabels.ts) — la riga del rifiuto.
   TypeScript le pretende entrambe.

**Il contratto che tiene su il resto** è un test: ogni ruolo del catalogo, tranne
i tre del tutorial, appartiene a esattamente un gradino. Un ruolo nuovo che
nessun gradino apre sarebbe aperto da subito e in silenzio — cioè di nuovo il
difetto di partenza — e nessuno se ne accorgerebbe finché un giocatore non se lo
ritrova nella mensola al minuto tre.

## Cosa non fa

- **Non nasconde i bottoni.** Un ruolo bloccato resta nella mensola e dice cosa
  gli manca. Nascondere il catalogo toglierebbe l'unica mappa di dove si può
  arrivare.
- **Non tocca le ricette dei landmark**: quello è un lavoro suo, in
  [landmarks-revamp.md](../world/landmarks-revamp.md).
- **Non riscala la crescita.** Il divario fra i 120 abitanti della condizione di
  vittoria e i 12.000 che la città raggiunge in venti minuti resta aperto, ed è
  la prima cosa da guardare se un giorno la scala sembrasse di nuovo troppo
  corta.

## Riferimenti

- [Milestone — Skylines Wikia](https://skylines.fandom.com/wiki/Milestone): la
  scala per popolazione e i contanti che ogni gradino versa.
- [Unique buildings — Cities: Skylines Wiki](https://skylines.paradoxwikis.com/Unique_buildings):
  i sei livelli agganciati alle milestone e la condizione individuale di ciascun
  edificio.
- [Game Progression — Cities: Skylines II](https://www.paradoxinteractive.com/games/cities-skylines-ii/features/game-progression):
  il seguito sostituisce la scala unica con progressioni per servizio, che è la
  direzione in cui questa potrebbe crescere se cinque gradini si rivelassero
  pochi.
