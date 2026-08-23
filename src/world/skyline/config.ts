/**
 * Unica fonte di verita' dei numeri della gerarchia verticale.
 *
 * Vale qui la stessa regola di `sites/config.ts` e `grading/config.ts`: nessun
 * altro file di `src/world/skyline/` contiene una soglia o un raggio. La ragione
 * e' la stessa separazione dei domini di sempre — `buildings/config.ts` dice
 * *come* e' fatto un edificio, questo dice *fin dove* una colonna puo' salire, e
 * sono due domande diverse. Se lo skyline esce piatto o appuntito la risposta sta
 * qui, mai in `balance.ts`: quello descrive l'economia, e spostarne un
 * coefficiente per far tornare un profilo di altezze cambierebbe il pareggio
 * alimentare per rendere piu' bella una silhouette.
 */
export const SKYLINE = {
  /**
   * Tetto di livello per fascia, indicizzato come `TIER`.
   *
   * Le tre fasce sono l'ossatura del gate — «da inquadratura d'insieme si
   * riconoscono almeno tre fasce di altezza e il centro» — e sono un dato, non
   * un ramo di codice: aggiungerne una e' aggiungere una voce qui e una in
   * `TIER`.
   *
   * La somma con i due bonus e' voluta: `9 + coneBonus + peakBonus` fa
   * esattamente `BUILDER.maxLevel`. Il livello massimo e' quindi raggiungibile
   * **solo** dove centro, prossimita' al polo e isolato eletto coincidono, ed e'
   * la definizione strutturale di «eccezione governata»: pochi picchi per
   * costruzione, non per fortuna.
   */
  levelCap: [3, 6, 9] as readonly number[],

  /**
   * Livelli che la vicinanza al polo aggiunge, dentro il solo centro.
   *
   * E' il cono: il tetto sale con continuita' verso il catalizzatore invece di
   * saltare da una fascia all'altra, ed e' cio' che rende leggibile la
   * transizione fra le fasce. Due e non uno perche' con un solo livello la
   * rampa avrebbe un gradino solo, che a colpo d'occhio e' un confine e non una
   * pendenza.
   */
  coneBonus: 2,

  /** Il livello in piu' dell'isolato eletto. */
  peakBonus: 1,

  /**
   * Isolati ammessi a un picco: uno ogni `peakEvery`.
   *
   * Il cono da solo darebbe una collina di torri identiche attorno a ogni polo.
   * L'elezione per isolato rompe quella regolarita' senza rinunciare al
   * determinismo, ed e' la stessa idea della coda lunga di `START_LEVEL_CDF`:
   * uno skyline e' fatto di molti volumi alti e pochi picchi.
   */
  peakEvery: 7,

  /**
   * Sale del tiro dell'elezione.
   *
   * `hashCoords` viene gia' usato per il seme del lotto e per il verso di un
   * landmark: senza un sale proprio, due domande diverse sullo stesso isolato
   * ricadrebbero sulla stessa sequenza e il picco finirebbe correlato al verso
   * degli edifici che lo compongono.
   */
  peakSalt: 0x5b1e_11a7,

  /**
   * Raggio in colonne entro cui si contano gli edifici vicini.
   *
   * Ventiquattro colonne sono dodici cubi di terreno, cioe' l'ordine di grandezza
   * di un isolato: piu' stretto misurerebbe quanto e' pieno un lotto invece di
   * quanto e' costruito un quartiere, e la corona attorno all'edificato
   * seguirebbe il singolo edificio invece del fronte della citta'.
   */
  edgeRadius: 24,

  /** Vicini sotto cui la colonna e' bordo dell'edificato. */
  edgeMiddle: 4,

  /** Vicini da cui la colonna e' interno, e quindi candidata al centro. */
  edgeCore: 12,

  /**
   * Colonne dal mare entro cui la citta' resta bassa e porosa.
   *
   * Non e' una regola di sicurezza — la banchina regge quello che c'e' scritto
   * in `grading/` — ma di forma urbana: una torre sul filo della battigia
   * cancella la linea di costa, che e' la sola figura che l'isola ha da offrire
   * a inquadratura d'insieme. Otto colonne sono quattro cubi di terreno: un
   * fronte edificato, non una fascia di rispetto.
   */
  coastNear: 8,

  /**
   * Voxel di quota artificiale che consumano un livello del tetto.
   *
   * **Una piattaforma non e' il modo di aggirare la gerarchia: e' il modo in cui
   * la gerarchia sale.** Senza questo numero il secondo livello sarebbe la
   * scorciatoia che rende inutile il primo — una soletta a trenta voxel con
   * sopra una torre da nove restituirebbe in periferia l'altezza che il centro
   * si guadagna con la desiderabilita'.
   *
   * Dodici voxel sono l'ordine di grandezza di una fascia di edificio: chi
   * costruisce in quota parte gia' «piu' in alto di un piano», e il tetto glielo
   * scala. E' anche il motivo per cui una piattaforma bassa non toglie quasi
   * nulla e una altissima non lascia costruire niente, che e' la risposta giusta
   * a entrambi i casi.
   */
  deckLevelRise: 12,
} as const;
