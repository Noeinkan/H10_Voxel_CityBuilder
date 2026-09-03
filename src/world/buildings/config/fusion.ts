import { SCALE, urbanFootprintStepsOf } from '../../scale';

/**
 * La fusione: quando un edificio smette di salire e si prende il lotto del
 * vicino.
 *
 * **E' l'altra meta' della campata.** L'arco fa incontrare due corpi sopra un
 * vuoto che resta; qui il vuoto sparisce e i due diventano uno. Le due cose
 * rispondono alla stessa domanda — «cosa succede quando la scala verticale
 * finisce» — e la risposta di prima era una sola: niente, la citta' smetteva di
 * cambiare figura proprio dove e' piu' densa.
 *
 * **Non serve una rappresentazione nuova.** `assembleBuilding` sa gia' disegnare
 * *un* record come piu' masse su un podio condiviso, con il vuoto in mezzo
 * dipinto a terrazza: la citta' ha sempre avuto l'edificio che si separa e si
 * ritrova, e gli mancava soltanto l'evento che lo produce. Cio' che questo
 * incremento aggiunge e' quell'evento, non una geometria.
 *
 * **Un edificio in meno non e' un abitante in meno.** Il record che sopravvive
 * dichiara in `uses` anche l'uso di chi ha assorbito, ed e' la stessa macchina
 * con cui un'arcologia vale quattro edifici: `tally` conta le voci al posto
 * della `class`, e la simulazione ne riceve una `addBuilding` per ciascuna. Senza,
 * fondere due torri dimezzerebbe la capacita' di quell'isolato.
 */
export const FUSION = {
  /**
   * Tick fra una passata e la successiva, e fusioni aperte da una passata.
   *
   * **Una per passata, e non per risparmiare**: un isolato che si fonde tutto
   * insieme non si legge come una conseguenza, che e' la stessa ragione per cui
   * il declino ne abbandona uno per volta. La cadenza e' la piu' lenta del
   * ciclo insieme a quella degli archi, perche' una fusione ha bisogno di un
   * cantiere che finisca prima di potersi compiere.
   */
  ticksPerPass: 60,
  perPass: 1,

  /** Record esaminati da una passata. Come `BUILDER.upgradesPerPass`. */
  perPassRecords: 48,

  /**
   * Livello da cui un edificio puo' assorbirne un altro.
   *
   * **E' il primo gradino della scala d'impronta, e non un numero scelto.** Sotto
   * quel livello `urbanFootprintCap` concede esattamente il modulo, quindi il
   * lato quadrato che la fusione chiederebbe coincide con quello che l'edificio
   * ha gia' e la regola direbbe `noRoom` a chiunque: una soglia piu' bassa non
   * sarebbe piu' permissiva, sarebbe soltanto una promessa che il gradino
   * successivo smentisce. Derivarla da li' e' anche cio' che la tiene giusta il
   * giorno in cui la scala verticale cambia — le quote sono frazioni di
   * `maxLevel`, non livelli scritti a mano.
   *
   * Ne segue il racconto giusto: **ci si allarga salendo, e quando lo spazio
   * libero finisce ci si prende il vicino.** La fusione comincia dove comincia
   * l'allargamento, non prima.
   */
  minLevel: urbanFootprintStepsOf()[0].fromLevel,

  /**
   * Edifici che una fusione puo' assorbire in una volta.
   *
   * Tre e non l'isolato intero: oltre, cio' che si vede non e' un edificio che
   * si allarga ma un quartiere che sparisce, e per quello c'e' gia'
   * l'arcologia — che infatti sventra, e lo dichiara.
   */
  maxAbsorbed: 3,

  /**
   * Lato massimo che una fusione puo' raggiungere, in voxel.
   *
   * **E' la scala mega, e non e' una taratura di gusto**: e' il numero da cui
   * `maxDirtyChunksPerBuilding` e' calcolato — due piani di chunk per lato — e
   * quindi il piu' largo che una sagoma possa avere continuando a comparire
   * come *una* struttura, con la propria cancellazione accodata insieme.
   * L'isolato intero resta il premio del picco, e ci si arriva promuovendo:
   * quella strada passa per `enqueueSegments`, che compare a ritagli e non
   * porta una sagoma da cancellare. Una fusione invece deve cancellare — dove
   * c'era una torre l'assemblaggio ha una corte — quindi si ferma dove la
   * cancellazione ci sta ancora.
   */
  maxSide: SCALE.megaFootprint,
} as const;
