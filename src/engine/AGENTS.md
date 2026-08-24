# Regole per `src/engine/`

Rendering Three.js, camera, materiale, meshing puro e worker. Il renderer puo'
leggere `src/world/`, ma il mondo non deve dipendere dall'engine.

## Confini

- `mesher/` non importa Three.js, DOM, renderer o generatore di terreno.
- I test girano in Node: mantieni la logica testabile fuori da Three.js e DOM.
- `ChunkRenderer` legge solo `Chunk.blocks`; non accedere a `data`.
- Una geometria e una draw call per chunk sono scelte deliberate.
- **Cio' che si muove sta sopra la scena, non dentro il volume.** `TrafficView`
  disegna barche, navi, aerei e dirigibili con mesh proprie: scriverli come voxel
  e riscriverli al frame dopo marcherebbe sporchi i chunk della costa sessanta
  volte al secondo, cioe' rimeshare mezza isola per far navigare una barca. E' la
  stessa divisione di `InfluenceOverlay` e `PlacementCursor`, e vale per
  qualunque cosa cambi posizione a ogni frame. A dire *dove* stanno e'
  `src/world/traffic/`, che e' puro; qui resta il disegno.
- Le sagome dei mezzi restano **di scatole**, e la loro luce esce da
  `faceLight`: il resto della scena e' fatto di cubi di un voxel, e una
  silhouette liscia o illuminata da un altro modello si vedrebbe come un corpo
  estraneo. I colori arrivano dalla palette del tema per l'ora corrente, alla
  cadenza dell'HUD e non per frame — un cambio d'ora sposta il sole di un decimo
  di grado.
- **Quali scatole lo dice `vehicleHulls.ts`, che non importa Three.** La cura per
  una barca che sembra un mattone e' la stessa che `mesher/microGeometry.ts`
  applica agli edifici: prismi piu' piccoli del voxel dove la forma cambia — uno
  scafo in tre conci, una fascia di galleggiamento spessa tre decimi, un
  parapetto due, un'ala in quattro pannelli che arretrano. Tenendole fuori dalla
  vista si verificano in `node`, ed e' cosi' che un test puo' dire che il
  fumaiolo disegnato chiude esattamente sulla bocca da cui esce il fumo.
- **Il pennacchio e' l'unica geometria che si riscrive per frame**, e non poteva
  essere altrimenti: uno sbuffo cambia posto, taglia e densita' a ogni istante.
  Sta in una mesh sola per tutta la citta' — posizioni e colori RGBA in due
  buffer dinamici, `drawRange` a tagliare la coda — invece di una mesh per
  sbuffo, che sarebbe una draw call ogni volta che un traghetto respira. La
  quarta componente del colore e' l'alfa, ed e' la sola ragione per cui il fumo
  non ha bisogno di un materiale per sbuffo. *Dove* stiano gli sbuffi lo dice
  `world/traffic/plume.ts`, che e' puro come le pose.

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
- `collectSurfaceCells` **scarta `plain` e `utility`**, e non e' una svista da
  correggere: `utility` e' la superficie di tutte le carreggiate, dei grembiuli
  e degli impalcati, cioe' l'area dipinta piu' estesa del mondo. Un emettitore
  agganciato li' pagherebbe da solo piu' di tutto il resto del modulo. Se un
  dettaglio deve comparire su una banchina o su una pista, la strada e' dare a
  quella parte un linguaggio costruito nella ricetta, non aprire `utility` qui.
- **Il dettaglio del retro sta in `microStreet.ts`**, e la divisione non e'
  ordine: `microGeometry.ts` e' oltre il budget di righe della cartella, e vale la
  regola a monte — per una responsabilita' nuova un file nuovo. La responsabilita'
  si nomina in una riga: cio' che un edificio mostra dove **non** si affaccia
  sulla strada. L'aggancio e' `frontage` negato, ed e' la differenza fra una
  tenda e una calata di scarico. I due moduli si importano a vicenda, ed e'
  sicuro **solo** perche' nessuno dei due valuta l'altro al caricamento: un
  letterale di modulo che dereferenziasse l'altro lato romperebbe il caricamento e
  non la compilazione.
- **Un prop di tetto parte da `(z + 1) * U`, uno di facciata da `facadeBox`.**
  `openRoof` e `interiorRoof` rispondono sul voxel **solido** del tetto, non
  sull'aria che ci sta sopra: un prisma steso da `z * U` finisce dentro quel pieno
  e non lo vede nessuno, pur costando i suoi quad. Sul fronte il problema non si
  pone perche' `facadeBox` prende una profondita' e sporge dal piano da se', ed e'
  proprio questa asimmetria a rendere l'errore facile — e' gia' successo alla
  pergola. Chi aggiunge un emettitore di tetto copi `emitRoofTech`,
  `emitRoofMasts`, `emitTerraceBoxes` o `emitRoofCrowns`, e lo verifichi sulla
  **quota** dei prismi: un conto di prismi non se ne accorge, perche' ci sono
  tutti.
- **La copertura del terreno e' l'unico dettaglio che sostituisce del volume**, e
  sta apposta in un modulo suo (`coverDetail.ts`). `liftGroundCover` svuota le
  celle marcate — nel volume paddato **e** nell'anello e nella fetta di soffitto,
  o un ciuffo del chunk accanto proietterebbe la sua AO su questo — prima che
  cielo, bagliore e greedy pass leggano; `restoreGroundCover` le rimette, perche'
  chi chiama `greedyMesh` riusa il buffer e un mesher che consuma il proprio
  input e' una trappola. Per la stessa ragione viene emessa **per prima** fra i
  dettagli: e' la sola che, troncata dal tetto dei quad, lascerebbe una chiazza
  calva invece di un edificio piu' spoglio. La tinta non e' nel marcatore — la
  ricava dalla palette del terreno sotto, via `groundcover.ts`.
- Struttura e prop si distinguono per l'**aggancio, non per l'aspetto**: se la
  posizione e' interamente decisa dalla geometria e' struttura e va sopra la
  riga dei prop in `appendMicroGeometry`; se serve un tiro per scegliere *quale*
  cella, e' un prop e cade per primo sotto il tetto dei quad. Un finiale sta
  dove una colonna non ha vicini in piano e una fascia dove un intradosso
  finisce nel vuoto: nessuno dei due tira un dado, quindi stanno in struttura —
  in coda, perche' fra la struttura sono i meno gravi da perdere.
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
raggi X — e' un test raggio/volume e non una regione, e vive con i suoi numeri in
`xray.ts`: `lensHit` e il blocco corrispondente nel fragment sono due copie della
stessa cosa, come `lighting.ts` e la sua meta' GLSL, e `xray.test.ts` e' cio' che
le tiene allineate.

**Velare non e' un solo `discard`, ed e' la parte che si sbaglia per prima.** Un
muro bucato a caso resta un muro rotto: si vede il pulviscolo di cio' che e'
rimasto, non cio' che c'e' dietro. L'azione e' quindi una e composta di tre
pezzi, tutti in `shaders/inspect.glsl.ts`:

- la soglia e' una **rigatura** diagonale in pixel di schermo e non un Bayer. A
  parita' di copertura un retino ordinato sparpaglia, e pixel sparsi leggono come
  sporco davanti al soggetto; in fila leggono come una campitura. La densita' ne
  cambia lo spessore e non il passo, quindi puo' variare con continuita';
- la densita' **cresce avvicinandosi alla camera** (`XRAY.deep`). Non e' un
  gusto: le soglie di una rampa sono annidate, quindi due pareti a pari densita'
  sopravvivono sugli stessi pixel e quella davanti copre l'altra per intero. Era
  il difetto per cui i raggi X non lasciavano vedere attraverso **niente**, e la
  cura e' quella nota per la screen-door transparency — far variare la soglia con
  la profondita';
- cio' che resta perde il linguaggio di facciata e si scioglie nella tinta della
  **prospettiva aerea**, in proporzione a quanto e' stato tolto. La tinta e'
  quella della nebbia apposta: segue tema e ora senza un colore proprio da
  scegliere per trentadue palette. La proporzionalita' e' cio' che separa da sola
  i raggi X — dove l'occlusore deve andarsene — da Block focus, dove il contesto
  velato **e'** la risposta e sbiancarlo la toglierebbe.

Sul filo del voxel la densita' cede a `XRAY.lattice`, cosi' l'occlusore si
riduce a una gabbia invece di sbriciolarsi: la sagoma resta leggibile mentre la
faccia si apre. Vale solo dove c'e' una lente — su mezzo schermo di contesto un
reticolo sarebbe rumore — e mai dentro un taglio, dove sarebbe il taglio non
fatto.

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
