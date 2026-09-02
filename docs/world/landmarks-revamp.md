# Landmark: le quattordici ricette che restano

Il revamp della 4.12 ha riscritto cinque ricette su diciannove — cattedrale e
monumento come prototipo, poi teatro, stadio e stazione. Questo documento serve
alle **quattordici che restano**, e non ripete il piano: raccoglie i vincoli che
il lavoro fatto ha già pagato, dice quali ricette possono davvero crescere di
sedime e quali no, e propone la scala di ognuna.

È scritto perché tre delle trappole qui sotto non si vedono leggendo le tabelle:
si scoprono a test rosso, o peggio a schermo. Chi riprende il lavoro non deve
riscoprirle.

## Lo stato

| File | Fatte | Restano |
| --- | --- | --- |
| [recipes/civic.ts](../../src/world/landmarks/recipes/civic.ts) | `monument`, `cathedral` | `university`, `museum` |
| [recipes/identity.ts](../../src/world/landmarks/recipes/identity.ts) | `theatre`, `stadium` | — |
| [recipes/station.ts](../../src/world/landmarks/recipes/station.ts) | `transport` | — |
| [recipes/logistics.ts](../../src/world/landmarks/recipes/logistics.ts) | — | `port`, `ferry`, `airport` |
| [recipes/production.ts](../../src/world/landmarks/recipes/production.ts) | — | `factory`, `market`, `greenhouse` |
| [recipes/growth.ts](../../src/world/landmarks/recipes/growth.ts) | — | `power`, `school` |
| [recipes/connections.ts](../../src/world/landmarks/recipes/connections.ts) | — | `radio`, `lighthouse` |
| [recipes/identityMarina.ts](../../src/world/landmarks/recipes/identityMarina.ts) | — | `marina` |
| [recipes/park.ts](../../src/world/landmarks/recipes/park.ts) | — | `park` |

Il catalogo intero misura **8 360 quad** sul chunk più pieno, contro un tetto di
16 384: c'è margine, ed è margine guadagnato applicando la regola del prossimo
paragrafo, non rinunciando all'ornamento.

## Le quattro regole che il prototipo ha già pagato

1. **Le cornici stanno sulle torri, mai sugli scafi lunghi; una struttura nuda è
   `plain`, non `civic`.** Scritte nel modo ovvio, cattedrale e monumento
   portavano il chunk più pieno a 16 380 quad su 16 384. Il perimetro è il
   moltiplicatore: ogni fascia marcapiano apre un davanzale e un intradosso su
   tutto il giro, e su uno scafo da quaranta voxel questo è il budget intero.
   `cornice` va bene su un `mast` da 4×4 a 6×8, e lì fa la differenza fra una
   ciminiera e un campanile.
2. **La maschera di una primitiva dipende dalla posizione solo per una funzione
   simmetrica** — distanza dall'estremità più vicina, o dal centro — mai `lx`
   contro `ly`. `orientPart` **ruota** una parte, non la ridisegna: una maschera
   asimmetrica dà un conto di voxel diverso a seconda del verso, e il test se ne
   accorge subito.
3. **Le primitive scrivono solidi, non li sottraggono.** Un `shell` disegnato
   sopra un `arch` ne tappa il vuoto. Nello stadio le quattro porte stanno nel
   margine **fuori** dall'anello proprio per questo: un passaggio si ottiene
   lasciandogli spazio, non sovrapponendolo.
4. **Lo stadio zero resta piccolo, 12–16 voxel.** È ciò che protegge la
   sovrapposizione fra due catalizzatori, cioè il punto dove nascono gli usi
   misti — l'errore che la 4.12 aveva già corretto una volta abbassando le
   ricette da sedici a dodici.

## Chi può crescere di sedime, e chi non può

Il revamp vuole `growth` su tutte. Non si può, e le due ragioni sono nel codice.

**Una ricetta che cresce è terrestre.** Lo dice
[config.ts](../../src/world/landmarks/config.ts) sul campo stesso: niente
`waterline`, `basinDepth` o `lakeQuay`, perché l'opera di terra si rigetta a
ogni avanzamento e il fronte d'acqua non ha una forma da far crescere. Escono
`port`, `ferry`, `marina`.

**Gli ormeggi vivono nel canonico del sedime finale.** `landmarkMoorings` in
[generate.ts:118](../../src/world/landmarks/generate.ts#L118) legge
`recipe.span`, non `footprintOf(recipe, stage)`. Con un sedime che cresce, ai
primi stadi le barche e gli aerei cadono **fuori** dalla struttura — e per i
versi ruotati sbagliano anche la rotazione, perché il riquadro con cui la
calcolano non è quello vero. Non è un difetto estetico: da quei punti partono le
rotte di `src/world/traffic/`, e `TrafficStructure` non porta lo stadio. Esce
anche `airport`.

| Ruolo | `growth` | Perché |
| --- | --- | --- |
| `university`, `museum`, `factory`, `market`, `greenhouse`, `power`, `school`, `radio`, `lighthouse`, `park` | sì | niente acqua, niente ormeggi |
| `port`, `ferry`, `marina` | no | `waterline` / `lakeQuay` / `basinDepth` |
| `airport` | no | `moorings` (pista e velivoli) |

Per le quattro escluse il revamp vale lo stesso, ma su un solo asse: **sei stadi
additivi dentro un sedime fisso**, con l'ornamento nuovo. Renderle crescenti
davvero è un incremento a sé — passare lo stadio a `landmarkMoorings` e da lì a
`TrafficStructure` — e il piano attuale vieta esplicitamente di toccare
`generate.ts`: se un passo lo chiede, il segnale è che la ricetta è sbagliata.

**Il sedime fisso si paga al piazzamento.** Senza `growth` l'ingombro finale è
riservato dal primo stadio: allargare il porto da 20×12 a 24×14 significa
chiedere al terreno un sito più grande *subito*. Per questo la proposta qui sotto
lascia il sedime di `port`, `ferry` e `marina` **esattamente com'è**: `waterline`
è una colonna canonica e gli ormeggi sono punti canonici, quindi ogni voxel di
span in più va rinegoziato con `harborDriver` e con le rotte. La ricchezza la
portano le due parti in più e le primitive, che non costano niente al sito.

## Le quattordici, con la scala proposta

La scala è una proposta tarata sui vincoli, non un vincolo a sua volta. Il passo
della maglia stradale è **20 voxel**: sopra i ~28 un landmark attraversa una
carreggiata, ed è ammesso **solo se porta un `arch`**, così sotto la struttura
resta un passaggio invece di un muro.

### Le dieci che crescono

Sei voci in `growth`, sei in `stages`, sei in `parts`. L'ancora è al centro
tranne dove la forma ha un fronte.

| Ruolo | Oggi | Scala del lato lungo | Quota | Primitive da usare |
| --- | --- | --- | --- | --- |
| `university` | 12×12×20 | 12 → 16 → 22 → 28 → 34 → **40** | 14 → **56** | `colonnade` sul quadriportico, `arch` sul portale d'ingresso, `tracery` nel chiostro, `dome` sulla biblioteca, `cornice` sulla torre dell'orologio |
| `museum` | 14×12×18 | 12 → 16 → 20 → 24 → 28 → **32** | 12 → **34** | `colonnade` sul pronao, `dome` sulla rotonda, `tracery` sul lucernario, `steps` sul basamento |
| `factory` | 14×12×22 | 12 → 16 → 20 → 24 → 28 → **30** | 14 → **40** | `mast` + `cornice` sulle ciminiere, `truss` sul carroponte, `arch` sul portone merci, `tracery` sullo shed |
| `market` | 12×12×18 | 12 → 16 → 20 → 24 → 26 → **28** | 12 → **26** | `arch` su tutti e quattro i lati — un mercato coperto è una loggia — `tracery` sul cleristorio, `dome` sull'incrocio |
| `greenhouse` | 14×12×14 | 12 → 16 → 20 → 24 → 26 → **28** | 10 → **24** | `dome` e `tracery` sono qui a casa loro: la calotta è la palm house, il traforo sono i montanti dei vetri |
| `power` | 16×12×20 | 14 → 18 → 22 → 26 → 28 → **30** | 16 → **44** | `mast` + `cornice` sulle torri, `truss` sui tralicci, `tracery` sulla schermatura di stazione, `arch` sulla campata dei trasformatori |
| `school` | 14×12×20 | 12 → 16 → 18 → 22 → 24 → **26** | 14 → **28** | `colonnade` sul portico, `arch` sul cancello, `tracery` sul finestrone della palestra, `dome` piccola sull'aula magna |
| `radio` | 12×10×30 | 12 → 14 → 16 → 18 → 18 → **20** | 20 → **86** | verticale: `truss` sul fusto, `tracery` **dentro** il traliccio, `spire` in punta, `cornice` sul solo blocco di base |
| `lighthouse` | 12×12×24 | 12 → 14 → 16 → 16 → 18 → **18** | 18 → **74** | il caso da manuale della `cornice`: fasce sul fusto, `tracery` sul ballatoio, `dome` sulla lanterna |
| `park` | 12×12×12 | 12 → 18 → 22 → 26 → 32 → **36** | **12, invariata** | `arch` sui cancelli, `colonnade` sul viale, `tracery` sul pergolato, `dome` bassa sul chiosco della banda |

`park` è il caso da non sbagliare: la sua firma è **non avere volume**, quindi
cresce in pianta e in numero di chiome e mai in quota. Il sedime che cresce
lasciando la quota ferma è legittimo — il test chiede che l'area cresca in senso
stretto, non l'altezza — e la firma verticale regge perché è misurata contro
`recipe.height`, non contro il lato.

`radio` e `lighthouse` crescono soprattutto in quota, ma **l'area deve comunque
crescere a ogni stadio**: un fusto che sale a pianta ferma fa fallire il test. La
base si allarga di due voxel ogni stadio o due, ed è anche più credibile.

### Le quattro a sedime fisso

Sei stadi additivi, `span` invariato salvo dove indicato. Qui gli stadi **sono
cumulativi**: lo stadio n disegna 0..n, ogni stadio deve aggiungere voxel e non
può toglierne.

| Ruolo | `span` | Cosa aggiungono i due stadi nuovi |
| --- | --- | --- |
| `port` | 20×12×18, invariato | arcata di `arch` sul basamento dei magazzini, `tracery` sul portale della gru, `mast` + `cornice` sulla torre di capitaneria |
| `ferry` | 22×12×16, invariato | `arch` sulla sala d'imbarco, `tracery` sulla pensilina, `cornice` sulla torre di segnalazione |
| `marina` | 16×12×14, invariato | `arch` sul portico del club, `tracery` sulla balaustra del lungolago, `cornice` sulla torretta |
| `airport` | 26×12×20 → **32×16×26** | `truss` sulla campata del molo d'imbarco, `tracery` sulla vetrata, `arch` sul sottopasso dei bus, `cornice` sulla torre di controllo |

L'aeroporto è l'unico dei quattro che può allargarsi, perché non dichiara
`waterline`. Ma ha ormeggi: se `span` cambia, **i due ormeggi `runway` vanno
riportati ai nuovi estremi**, ed è da lì che `skyRoutes.flightCircuit` costruisce
il circuito di volo. Vale la pena solo se si è disposti a rileggere anche i test
del traffico.

## Le varianti, da tre a cinque

Tier A e B passano a cinque esemplari. Il tronco resta comune e la variante è
**additiva**: è quello che garantisce per costruzione che due porti si
riconoscano come porti.

**Su `port` e `marina` le varianti sono legate all'indice.** `FORMS` in
[config.ts:640](../../src/world/landmarks/config.ts#L640) fissa
`port-bulk` → variante 0, `port-shipyard` → 1, `port-passenger` → 2,
`marina-shallows` → 0, `marina-open` → 1: è la classe d'acqua davanti al molo a
scegliere il mestiere, non il seme. Le nuove varianti si **accodano**; riordinare
quelle esistenti cambia in silenzio cosa costruisce il giocatore sul mare aperto.

Una variante deve distinguersi **entro lo stadio due** e lasciare un dettaglio
all'ultimo: c'è un test che lo verifica, e la ragione è che una differenza
rivelata solo a fine crescita non la vede nessuno.

## Cosa i test chiedono, prima di scrivere

Da [generate.test.ts](../../src/world/landmarks/generate.test.ts), sulle ricette
che crescono:

- l'ancora resta dentro il riquadro, e **si allontana da ogni bordo** stadio dopo
  stadio, mai si avvicina;
- l'area cresce in senso **stretto** a ogni stadio;
- l'ultima voce di `growth` è identica a `span`/`height` dichiarati, e
  `growth[0].span[0]` è strettamente minore di `span[0]`;
- la sagoma di ogni stadio sta nel proprio sedime e non è vuota.

Sulle ricette a sedime fisso: ogni stadio **contiene** il precedente e ne
aggiunge. Su tutte: la firma verticale (il voxel più alto arriva almeno a metà di
`height`) e la firma di sagoma unica nel catalogo.

E infine il guardiano che conta di più:
[chunkBudget.test.ts](../../src/world/buildings/chunkBudget.test.ts) prova **ogni
landmark del catalogo, su ogni verso e su ogni cucitura** — trentadue
sfasamenti — contro il tetto di chunk sporchi. Non è un test da lanciare alla
fine: è quello che dice se la scala scelta sta in piedi, e risponde in un
secondo.

## Verifica

Cerchio stretto, durante il lavoro:

```
npm run typecheck
npx vitest run src/world/landmarks src/world/buildings/landmarkDriver.test.ts \
  src/world/buildings/chunkBudget.test.ts src/world/buildings/clearance.test.ts
```

La misura dei quad, quando la scala cresce:

```
npx vitest run src/engine/mesher/microGeometry.test.ts
```

Toccando porto, traghetto o marina, aggiungere
`src/world/buildings/harborDriver.test.ts`; spostando un ormeggio, i test di
`src/world/traffic/`.

A occhio, sulla scena `diorama` dell'harness (skill `/debug-harness` per i
parametri URL): un landmark solo, girevole, inquadrato da vicino. Poi su
un'isola vera, che è l'unico posto dove si vede se l'`arch` cade davvero dove
passava la carreggiata.

La suite intera **su richiesta o su proposta accettata**, mai di iniziativa.

## Quello che resta aperto, oltre alle ricette

- **Il vocabolario ornamentale non è stato scritto.**
  [vocab.ts](../../src/world/landmarks/vocab.ts) ha ancora le sei frasi di
  prima (`craneAt`, `quay`, `bollard`, `entrance`, `signBand`, `tree`). Dopo
  cinque ricette scritte a mano, `rose`, `pinnacles`, `arcade` e `frieze` si
  ripetono abbastanza da meritare un aiutante ciascuno — ma vanno estratti da
  ricorrenze vere, non inventati prima.
- **Il rischio che nessuno ha ancora misurato**: un landmark che cresce
  **sventra** ciò che il quartiere ha costruito sul sedime nuovo, e sono quegli
  edifici a contare per `stageForBuildings`. Con ingombri da quaranta voxel la
  struttura può restare bloccata a metà. Non regredisce — `record.level` sale e
  basta — ma può fermarsi. Si misura su una crescita vera, e la correzione, se
  serve, sta nelle **soglie**, non nel driver.
- **`ROADMAP.md`**: il revamp non è una sotto-fase nuova ma la riapertura della
  **4.12**, come la 2.1 riaprì la 2.
- **La documentazione non si scrive a mano**: un frammento in `docs/pending/` per
  ogni file di produzione nuovo e per l'incremento, fuso con `npm run docs:merge`.
  I `*.test.ts` non hanno riga d'indice.
