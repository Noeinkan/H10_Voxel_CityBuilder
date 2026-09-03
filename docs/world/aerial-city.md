# La citta' in quota

> Riferimento normativo estratto da `src/world/AGENTS.md`. Le regole locali
> indicano quando leggerlo; motivazioni, invarianti e casi limite restano
> intenzionalmente insieme per evitare modifiche corrette in isolamento ma
> incoerenti con il dominio.

- **Un impalcato in quota non prende suolo; lo prende solo la gamba che scende a
  terra.** E' l'invariante di `aerial/`, complemento esatto di quello di `spans/`.
  Sotto una mensola la carreggiata si dipinge ancora e i lotti si costruiscono
  ancora: e' una riga di `index()`, dove solo `AERIAL_PART.pier` entra in
  `groundColumns`.
- **La mensola e' la prima cosa che esce dall'impronta.** La grammatica degli
  edifici dichiara il contrario — «nessuna fascia puo' uscire dall'impronta e la
  collisione fra edifici resta bidimensionale» — e l'aggetto rompe proprio quella
  riga. E' legale perche' `overlaps` confronta gia' gli intervalli di quota
  colonna per colonna; e' per questo che chi lo scrive **eccettua l'ospite** dalla
  collisione, invece di spostare la mensola fuori dal riquadro.
- **Nessuna quota e' imposta da fuori, e per questo qui non esiste `align`.** La
  mensola prende la quota dalla sommita' di una fascia dell'ospite, la gamba dal
  primo appoggio che trova scendendo. Un lotto in quota eredita la fase
  dall'impalcato che lo ospita, non dal cubo di terreno — la stessa ragione per
  cui le campate `align` l'hanno gia' tolto.
- **Dove l'ancoraggio non arriva, nasce una gamba**, e non c'e' una regola per
  ciascuna forma: `planDeck` misura lo sbalzo di ogni colonna e pianta un appoggio
  dove supera `AERIAL.reach`. Ne segue senza codice in piu' che una mensola corta
  non ha gambe e una profonda se le conta da sola. Una gamba **si sposta per
  trovare un tetto** prima di piantarsi nel prato: e' cio' che tiene i cuori
  d'isolato liberi per la piazza della 4.5.
- **Chi regge cresce, se la parete regge ancora.** Il guinzaglio di un impalcato
  tira al contrario di quello di una campata, ma non e' un divieto: e' una
  verifica. `upgradePass` saltava chiunque portasse qualcosa, e la regola era piu'
  severa della geometria — i quattro canali casuali di `buildings/generate.ts`
  non dipendono dal livello, quindi a parita' di tipologia e impronta **i piani
  bassi sono identici a ogni livello** e il muro a cui l'impalcato e' appeso e'
  quasi sempre ancora li'. Un solo Skyport bastava a congelare per sempre la
  torre migliore dell'isolato. La domanda giusta la pone `holdFits` sulla sagoma
  nuova — il volume del piano resta aria, nessuna colonna di muro e' sparita — e
  si puo' porre soltanto dentro `upgrade()`, dove quella sagoma esiste: costa un
  `buildStamp` speso per un rifiuto, e lo spende solo chi porta qualcosa.
  Ospitare resta una rinuncia, perche' una promozione puo' essere rifiutata; la
  soglia che la governa e' `AERIAL.minHostLevel` — dove sta anche la misura per
  cui la regola piu' ovvia («aspetta che abbia finito di crescere») non funziona
  su una citta' che cresce.
- **Cio' che ci sta ancora non cade, e conta piu' del resto.** `releaseDecks`
  faceva cadere ogni mensola vuota a ogni promozione dell'ospite, e con l'ospite
  fermo era un compromesso innocuo; con gli ospiti che crescono avrebbe reso
  questo dominio **inabitabile** — nessun impalcato vivrebbe abbastanza per
  meritarsi un lotto sopra o un montante che lo raggiunga, e la meta' del gate
  che dice «si abita sopra la citta'» tornerebbe a zero. `reseat` fa cadere
  soltanto cio' che la sagoma nuova non regge piu', e rifiuta la promozione
  quando a non starci e' qualcosa che non puo' cadere: tutta la convalida prima
  di qualunque scrittura, come per un percorso.
- **La parete si misura per differenza, non con una soglia.** Quanto muro
  servisse lo ha deciso chi ha appeso l'impalcato — `terraceRect` prende la corsa,
  `facadeRect` si centra sull'intera facciata e ne lascia libero qualche capo —
  quindi ricavare qui un minimo vorrebbe dire inventare un terzo numero che
  nessuna delle due regole conosce. Si chiede invece che nessuna colonna di muro
  presente prima sia sparita: e' la stessa domanda per tutte le forme, e non ha
  niente da tarare.
- **Il livello si risolve dove si risolve il lotto.** `TerrainMap` resta una
  quota e un bit per colonna; `decksAt` legge dal registry, e in quota **il lotto
  e' l'impalcato** — niente `findLot`, niente opere di terra, niente fila.
  `src/sim/` non guadagna una coordinata verticale: conta le quote spese
  (`stack`) e chiede al mondo quante ce ne sono (`headroomAt`).
- **La mensola nasce sulla prima fascia utile del fronte strada, e il verso della
  scansione e' la regola.** `faceRuns` cerca dal basso in su: la prima corsa e' la
  sommita' del basamento, che la 4.4 rende condivisa da tutta la fila, quindi due
  vicini sono complanari **per costruzione** — senza `align` e senza una griglia
  imposta da fuori. Cercando dall'alto ogni ospite si prendeva la propria fascia
  piu' alta, e la rete non esisteva. Il fronte strada e' l'altra meta': li' il
  corridoio di un percorso corre sopra la carreggiata invece che sopra i corpi.
- **Dove non c'e' una fascia da continuare, la mensola e' un balcone.** Meta'
  della citta' sale a prisma dentro il corso di base condiviso e non arretra
  affatto: centoquarantasette ospiti su quattrocento non avevano una sola corsa
  utile. Il ripiego su facciata piena e' cio' che rende le mensole abbastanza
  fitte da guardarsi.
- **Il balcone su facciata piena non parte da `minRise`, e non e' la stessa regola
  della riga sopra.** Dove una fascia rientra la quota e' un fatto dell'ospite, e
  la scansione dal basso e' quella che rende complanari due vicini; dove la
  facciata e' piena non c'e' nessuna fascia da rispettare, e prendere comunque la
  quota piu' bassa attaccava il balcone a tre cubi dal marciapiede — su una torre
  di trenta cubi una pensilina, non un piano in facciata. Il ripiego parte allora
  da `AERIAL.terrace.facadeRise` dell'altezza dell'ospite, e le quote successive
  si **distribuiscono** sul fronte invece di impilarsi: le tre mensole di un
  ospite stavano tutte dentro nove voxel.
- **La forma di una mensola sta in `terraceForm.ts`, ed e' pura.** Erano tutte lo
  stesso quadrato, e non per caso: `overhangOf` legava lo sporto alla lunghezza
  della corsa, e dentro i due estremi quella riga e' l'identita'. Resta come
  misura di riferimento; il riquadro ora si dispone dentro la corsa in una di
  quattro forme — balcone, loggia, ala, sperone — scelta da un hash di ospite,
  faccia e quota. Puo' scorrere lungo la corsa ma **non uscirne**: oltre i capi non
  c'e' piu' parete a cui appendersi. Ne segue anche la varieta' delle gambe, che
  nessuno decide: `planDeck` le pianta dove lo sbalzo supera `reach`.
- **Mensola e percorso sono lastre da un voxel.** A dire che reggono sono gambe,
  teste dei nodi e microgeometria dei sostegni: due file pieni di travatura sotto
  il bordo li trasformavano in volumi alti tre voxel e mangiavano il vuoto che
  devono attraversare. La mensola conserva il proprio davanti nella pianta — i
  due angoli esterni sono smussati — e il parapetto segue quella sagoma invece
  del riquadro; `emitRoofTech` lo emette gia' solo dove il tetto confina con
  l'aria.
- **Chi si appende a una mensola la inchioda, non solo chi ci abita.** Un tratto
  di percorso puo' avere per capo — o per appoggio di una gamba — una mensola, e
  `releaseDecks` la faceva cadere lo stesso quando l'ospite promuoveva: il tratto
  restava con un `supports` che non risolve piu'. La domanda giusta e'
  `registry.carries`, cioe' lo stesso guinzaglio che un edificio si sente tirare
  prima di promuovere, posto un piano piu' in alto.
- **Il colmo di un percorso e' un tetto, non un pavimento.** La corsa parte dalla
  quota dei due capi e si alza di un pianerottolo per volta finche' il luogo la
  accetta; `crestOf` dice solo fin dove ha senso salire, e si misura sui
  **riquadri veri dei pezzi** — e' quello che ha reso possibile la piega a zeta,
  il cui tratto di traverso sta fuori dal corridoio della corsa.
- **La guida e' una cosa sola posata in due modi.** In verticale e' il montante
  d'isolato (`AERIAL_PART.lift`), che sale da terra a un impalcato **abitato** ed
  e' la sola risposta al «ci si muove fra i livelli» del gate; in orizzontale e'
  un file di rotaia incassato nel piano di un tratto di percorso, che non e' ne'
  un record ne' un voxel in piu'. Niente si muove: le capsule sono voxel fermi.
- **Il montante sta sul marciapiede, una gamba no.** Non e' una concessione ma
  l'unico posto disponibile: sotto una mensola sul fronte strada c'e' o il
  proprio ospite o l'asfalto. E' il terzo parametro di `surveyFooting`.
