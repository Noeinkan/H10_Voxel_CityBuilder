# Cio' che si muove

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **Il traffico non e' materia.** Barche, navi, aerei, dirigibili, eVTOL e
  mongolfiere di `traffic/`
  non sono voxel e non devono diventarlo: scriverne uno nel `VoxelWorld` e
  riscriverlo al frame dopo marcherebbe sporchi i chunk della costa sessanta
  volte al secondo, cioe' rimeshare mezza isola per far navigare una barca. Qui
  si calcola **dove sta** un mezzo a un certo istante; a disegnarlo e'
  `engine/TrafficView.ts`, con mesh proprie fuori dal volume voxel.
- **La posa e' una funzione del tempo, non un'integrazione.** Non c'e' stato che
  avanza di `dt` in `dt`: una rotta e' una spezzata piu' un periodo, e la
  posizione e' una lettura. Ne discendono tre cose che l'integrazione non
  darebbe gratis — due partite identiche mostrano le stesse barche negli stessi
  punti, un frame perso non sposta niente, e la velocita' di gioco si applica
  moltiplicando un orologio invece che ritarando delle accelerazioni.
- **Le navi vengono da fuori, quindi devono poter non esserci.** Il capo lontano
  di una rotta `offworld` non e' un capolinea, e' il **bordo del mondo**: chi ci
  arriva sparisce — `poseAt` risponde `null`, `posesAt` lo lascia fuori
  dall'elenco — e la sosta del pendolo diventa il tempo che passa fuori. Una nave
  che invertiva la marcia in mezzo al mare in piena vista diceva l'esatto
  contrario di cio' che il porto promette, cioe' che un fuori non c'e'. Chi
  disegna non ha imparato niente: gli arriva un mezzo in meno, e il pool nasconde
  la mesh in eccesso come faceva gia'.
- **Il fumo e' la stessa posa letta nel passato.** Uno sbuffo di `plume.ts` non e'
  una particella con una velocita' da integrare: e' dov'era la nave `age` secondi
  fa — che `poseAt` sa gia' rispondere — piu' una salita e una deriva lineari. Ne
  discende, gratis, tutto quello che discende dalle pose: in pausa il fumo si
  ferma, a 4x accelera, un frame perso non lascia un buco nella scia. E' anche il
  motivo per cui la scia e' *giusta* invece che verosimile — uno sbuffo resta
  dove la nave l'ha lasciato perche' li' la nave c'era davvero. Dove esce lo dice
  `TRAFFIC.funnel`, la stessa voce da cui `engine/vehicleHulls.ts` prende il
  fumaiolo: due misure separate si scoprirebbero divergenti da uno screenshot.
- **Una rotta si ricalcola quando cambia la citta', non quando passa un frame.**
  Cercare una rotta di mare visita qualche migliaio di celle: `GrowthScene` la
  rifa' quando cambia il numero di landmark o di catalizzatori, e **a scaglioni
  di sessantaquattro edifici** — quello e' il segnale della citta' che si alza, e
  senza di lui un circuito calcolato in mezzo ai campi resterebbe alla propria
  quota mentre attorno crescono le torri.
- **Le rotte in quota si alzano sopra la citta', e la quota dichiarata e' il
  minimo.** `TRAFFIC.planeCruise` a quarantaquattro voxel bastava quando gli
  edifici erano bassi; con `BUILDER.maxLevel` a dodici una torre supera i
  centoquaranta, e un semilato di circuito da ottantaquattro la centra in pieno.
  `skyRoutes.ts` sonda percio' il profilo **sotto la propria spezzata** — a passo
  di `ceilingStep`, per segmenti e non per vertici, altrimenti due vertici a
  ottantaquattro voxel di distanza saltano qualunque torre ci sia in mezzo — e
  prende il massimo fra quota dichiarata e cima sorvolata piu' il franco. Il
  profilo arriva come predicato (`CeilingProbe`), come gia' l'acqua: il dominio
  non ha un registry e non deve averne uno.
- **Gli ormeggi li dichiara la ricetta**, non il traffico: sono coordinate della
  forma — il bordo di una darsena che `landmarks/config.ts` disegna — e tenerle
  altrove vorrebbe dire due file da correggere ogni volta che un molo si sposta
  di una colonna, con il difetto visibile solo a schermo. Un test verifica che un
  ormeggio da barca **non** cada su una colonna che l'opera di terra riempie.
- **Un ormeggio a galla pretende acqua, e a portargliela e' il piazzamento.** La
  ricetta dichiara la propria `waterline` — la colonna in cui il mare deve
  cominciare — e `landmarkDriver` fa scorrere la struttura lungo il fronte
  finche' quella colonna cade sull'acqua vera. Senza, il porto era il difetto
  piu' silenzioso del dominio: perfettamente costruito, con la sua fila di gru, e
  **niente in acqua**, perche' il vincolo di sito ammette il click a sei colonne
  dalla battigia mentre gli ormeggi stanno quattro e cinque colonne oltre, e su
  meta' del fronte costiero la battigia e' un bassofondo asciutto largo dieci
  colonne. Lo scorrimento e' limitato dall'ancora della ricetta: oltre, la colonna
  cliccata uscirebbe dall'ingombro e `catalystIn` non ritroverebbe piu' il
  catalizzatore, cioe' un monumento fermo allo stadio zero per sempre.
- **«Costa» e «acqua» non sono la stessa colonna.** La colonna a quota esatta del
  pelo del mare e' battigia — bagnata, in vista del mare, sito costiero a tutti
  gli effetti — ma `IslandGenerator` non ci scrive nessun voxel d'acqua. Chi
  chiede «e' un posto sul mare?» usa `sightWater` cosi' com'e'; chi ci deve posare
  uno scafo passa `afloat`, e fra le due risposte ci sono celle intere.
- **La rotta di mare aggira la terra.** I due capi di una linea stanno sulla
  costa per definizione, e due punti di costa vicini hanno quasi sempre un pezzo
  d'isola in mezzo: e' proprio la forma che rende utile un traghetto. Dove non
  c'e' acqua fra i due, la linea resta **senza barca** invece di farne passare
  una dentro la collina — un difetto visibile e onesto, non un blocco.
