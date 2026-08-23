# Regole per `src/engine/`

Rendering Three.js, camera, materiale, meshing puro e worker. Il renderer puo'
leggere `src/world/`, ma il mondo non deve dipendere dall'engine.

## Confini

- `mesher/` non importa Three.js, DOM, renderer o generatore di terreno.
- I test girano in Node: mantieni la logica testabile fuori da Three.js e DOM.
- `ChunkRenderer` legge solo `Chunk.blocks`; non accedere a `data`.
- Una geometria e una draw call per chunk sono scelte deliberate.

## Mesh, palette e temi

- Le mesh trasportano `aPalette` e `aFace`, mai RGB.
- `aShade` e' un byte con **tre** campi: AO nei bit 0-1, visibilita' del cielo
  nei bit 2-3, bagliore di una faccia emissiva vicina nei bit 4-5. Stanno
  insieme perche' un secondo attributo sarebbe un secondo buffer per vertice a
  parita' di informazione. Chi ne legge uno deve mascherare: `floor(aShade/4)`
  senza `mod` prende anche i bit del bagliore.
- Ogni campo di `aShade` entra anche nella **chiave di merge** di `packFace`, o
  il greedy fonderebbe facce che il fragment tratta in modo diverso. E' un
  costo: il bagliore varia per cella e frammenta le pareti vicine a un'insegna.
- Conserva 32 slot esatti (`PALETTE_SIZE` e `uniform vec3[32]`).
- Palette o tema aggiornano solo uniform/stato: zero rebuild di mesh.
- Mantieni job e risultati trasferibili; evita copie nei percorsi caldi.
- Un prisma di microgeometria porta la **sua** superficie, non sempre `utility`:
  e' cosi' che un'insegna esce `luminous` senza un materiale proprio. Resta uno
  dei sette linguaggi, mai un ottavo.
- `MeshJob.origin` e' l'unica coordinata di mondo che entra nel mesher, e serve
  solo a seminare la scelta dei prop. Non usarla per altro: il mesher non deve
  imparare dove si trova.
- I prop costano una passata sulle celle che ricevono, quindi ricevono le celle
  gia' **filtrate per faccia esposta** (`facadeByFace`). Le interne di un
  edificio pieno sono i due terzi, e nessun prop potra' mai usarle: passarle
  comunque e' costato 2 ms per chunk, misurati.
- Se cambia il layout degli attributi aggiorna tipi, worker, renderer, shader e test.

## Modello di luce

La luce non e' una tabella di costanti per faccia: c'e' un sole vero. La normale
si legge da `uFaceNormal[aFace]`, quindi **il mesher non e' stato toccato** e
nessun attributo di vertice e' stato aggiunto — e' cio' che tiene in piedi il
contratto 4 anche dopo questo lavoro.

Il modello vive in un solo posto, `lighting.ts`, in TypeScript puro:

```
ambiente = mix(rimbalzo, cielo * visibilita', n.z)  — emisferico
diretta  = sole * wrap(n . direzione)               — occlusa dalla shadow map
```

L'ambiente **non** viene moltiplicato per l'ombra proiettata: e' questo, e non un
effetto aggiunto dopo, che rende azzurre le facce in ombra invece che nere. Il
fragment shader riscrive le stesse formule in GLSL; `lighting.test.ts` tiene
allineate le due copie, e `themes.test.ts` verifica — invece di dichiarare — che
la faccia +Z resti la piu' illuminata in ogni tema.

A essere occlusa e' la sola meta' **cielo**, e da un dato geometrico: la
visibilita' del cielo che il mesher cuoce nei due bit alti di `aShade`, un
sondaggio verticale di `SKY_PROBE` voxel dalla cella vuota adiacente alla faccia.
Il rimbalzo resta pieno, ed e' cio' che impedisce a un sotto-ponte di diventare
un buco nero. Non va confusa con `shadow.strength`: quella spegne la diretta,
dipende dall'azimut del sole e sparisce al livello di qualita' piu' basso, mentre
questa vale a ogni ora e a ogni qualita' perche' e' geometria e non luce.

## La luce che esce

`emission` illumina il proprio pixel e alimenta il bloom; non schiarisce il muro
di fronte. Per quello c'e' un quarto termine nella luce, e **non e' una luce
dinamica**: quanto una faccia sia vicina a una superficie `luminous` o `portal`
e' un dato geometrico, cotto nel mesher da `sweepGlow` con sei scansioni lineari
sul volume paddato. Nessuna pass, nessun elenco di sorgenti nel fragment,
nessuna ricompilazione — la stessa mossa con cui la 4.7 ha portato il cielo.

Vale solo di notte (`uNight`): di giorno il sole lo coprirebbe comunque, e
pagarlo vorrebbe dire slavare le facciate a mezzogiorno.

Due limiti dichiarati, non sviste:

- la tinta e' del **tema** e non dell'emettitore. Il frammento che riceve la
  luce non sa chi gliela manda, e dirglielo costerebbe bit che non ci sono:
  un'insegna rossa e una cyan schiariscono il muro con lo stesso ambra;
- l'alone e' corto per scelta — sei voxel, due piani. A dodici ogni faccia di un
  edificio cadeva dentro il raggio di qualcosa di acceso, e l'edificio intero
  diventava ambra invece di avere una parete schiarita accanto all'insegna.

### Le finestre accese

Quali si accendono lo decide il frammento, e il modello sta in `nightWindows.ts`
con **tutti** i suoi numeri. Tre cose che vale la pena sapere prima di toccarlo:

- la quota accesa ha un **tetto**. Con la sola soglia sull'occupazione una citta'
  piena accendeva quasi ogni vetro, e una facciata accesa al novanta per cento
  non e' uno skyline ma un retino: il buio fra le luci e' meta' del disegno;
- la **torre** e' un gruppo di colonne (`towerCell`), non un edificio: al
  frammento non arriva nessun identificatore. E' un'approssimazione dichiarata, e
  una torre larga che cade su due gruppi si accende ad ali diverse — che e' cio'
  che fa anche una torre vera;
- uffici e case si accendono in modo diverso — piani interi contro finestre
  sparse — ma a scegliere e' la torre e non l'uso, perche' la grammatica
  `habitat` copre residenziale e commerciale insieme.

`uLitHomes` continua a decidere **quante** finestre, mai quali: a muoversi sono
le soglie, e le luci non sfarfallano mentre la popolazione cresce.

## Prospettiva aerea

Il secondo modello puro e' `atmosphere.ts`, con il suo `atmosphere.test.ts`. La
densita' della nebbia ha un profilo esponenziale in quota e viene **integrata
lungo il raggio**, non valutata sul frammento: e' cio' che separa le quote e non
le sole distanze, e l'integrale e' in forma chiusa perche' la camera e'
ortografica. `heightFalloff` e' l'inverso di un'altezza di scala e segue la scala
della citta': se il tetto verticale si alza, va abbassata in proporzione.

Il gradiente di schermo con cui la nebbia tende al cielo e quello di
`SkyBackground` sono la stessa curva scritta due volte. Se ne tocchi una tocca
anche l'altra, o si vedra' una riga proprio all'orizzonte.

## Ciclo giorno/notte

Il terzo modello puro e' `daylight.ts`. L'atmosfera scritta in un tema e' quella
di **mezzogiorno**: azimut ed elevazione sono il picco, i colori sono il look a
sole alto. `withHour` li piega verso l'orizzonte e verso la notte senza
sostituirli — `nightReach` sta sotto 1 apposta, o tutti i temi avrebbero la
stessa notte.

Quanto sia giorno si ricava dall'**altezza del sole**, non da una tabella di
orari: il crepuscolo esiste per costruzione e non c'e' una seconda tabella da
tenere allineata. L'ora tocca luce, cielo, nebbia, ombra, emissivi e il
**riflesso dell'acqua**; palette, materia, tone mapping ed esposizione restano
del tema, ed e' per questo che scorrere l'orologio non ricompila niente.

L'acqua e' l'unica materia che l'ora tocca, e non e' un'eccezione arbitraria: il
mare non ha un colore proprio, ha quello di cio' che riflette. Lasciandogli la
tinta di mezzogiorno su un fondo notturno, l'increspatura smetteva di leggersi
come un'onda e diventava un quadrettato chiaro largo quanto l'inquadratura.

`DaylightMode` decide se l'orologio cammina: `cycle`, `day` o `night`. I due modi
fissi non sono un secondo look ma **ore vere** del ciclo (`DAYLIGHT.dayHour` e
`nightHour`), quindi tutto quello che l'ora produce vale identico. Il giocatore
li sceglie dal bottone accanto alla velocita' o con `L`; l'harness ha ancora
`?hour=` e `H`, che inchiodano un'ora qualsiasi.

`applyTheme` e `applyAtmosphere` in `main.ts` sono separate proprio qui: la
seconda gira molte volte per partita, la prima quasi mai.

## Pass e post-processing

Tre pass, non una: ombra -> scena -> post-processing. Il composer e' **sempre
attivo**, perche' alternarlo significherebbe accendere e spegnere il tone
mapping dentro i materiali, cioe' ricompilarli. Da qui una conseguenza che vale
la pena sapere: il tone mapping lo fa `OutputPass`, i materiali di scena
scrivono HDR lineare, e un cambio di tema non ricompila nessun programma.

Il gating vive in `RenderQuality.ts`: il profilo di effetti si *deriva* da quanto
il controller ha gia' dovuto abbassare il pixel ratio, cosi' c'e' una sola
isteresi invece di due che possono sfasarsi. Con `?quality=performance` le pass
aggiuntive spariscono e le draw call si dimezzano, perche' la geometria viene
disegnata una volta sola.

## Viste di ispezione

La decisione sta in `inspect.ts`, che e' puro e si verifica in `node`: nel
materiale entrano sei uniform e nient'altro. Il terzo predicato — la lente dei
raggi X — e' un test raggio/volume e non una regione: `lensChord` in `inspect.ts`
e il blocco corrispondente nel fragment sono due copie della stessa cosa, come
`lighting.ts` e la sua meta' GLSL, e `inspect.test.ts` e' cio' che le tiene
allineate.

Tre predicati vicini che vale la pena non confondere, perche' ognuno risponde a
una domanda diversa e ogni coppia diverge in un caso solo:

- `modeCuts(mode)` — «questo **modo** taglia?». Serve alla regola che chiude una
  vista quando si prende in mano uno strumento.
- `isCut(uniforms)` — «si sta tagliando **adesso**?». Non e' la stessa cosa da
  quando Block focus taglia se l'isolato e' stato scelto e vela se e' solo
  puntato. E' la condizione che spegne le ombre proiettate.
- `needsCap(uniforms)` — «il taglio lascia una **superficie di sezione**?». Solo
  qui serve `DoubleSide` e il tappo dalle back-face. Un taglio di solo rettangolo
  toglie per intero cio' che sta fuori e lascia chiusa la geometria che resta:
  tapparlo sarebbe il doppio dei fragment per niente.

Limite noto e dichiarato: il predicato vive nel materiale di **scena** e non in
quello di **profondita'**, quindi il volume nascosto continua a proiettare ombra.
E' il motivo per cui un taglio le spegne tutte invece di correggerle.

## Verifica

- Esegui `npm run typecheck`, `npm test` e `npm run build`.
- Per il mesher esegui `npm run bench`; non aggiornare misure a occhio.
- Per palette/temi verifica con `?debug=1` che quad e geometrie non cambino.
