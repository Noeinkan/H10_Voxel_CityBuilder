/**
 * Come si accende una facciata di notte, in TypeScript puro.
 *
 * E' il quarto modello puro dell'engine, accanto a `lighting.ts`,
 * `atmosphere.ts` e `daylight.ts`: non importa Three, non tocca il DOM, e il
 * fragment shader ne riscrive le formule in GLSL interpolando **questi** numeri
 * invece di riscriverli. Un numero di questo dominio si cambia qui e in nessun
 * altro posto.
 *
 * Il problema che risolve. Con una sola soglia — «accendi la finestra se il suo
 * numero casuale supera `1 - occupazione`» — una citta' piena accende quasi ogni
 * vetro, e una facciata con il novanta per cento delle finestre accese non e'
 * uno skyline: e' un retino. Le luci si vedono ma non si legge piu' niente, ne'
 * dove finisce una torre e comincia la vicina, ne' quali sono le torri vive.
 * **Il buio fra le luci e' la meta' del disegno**, e prima non c'era.
 *
 * Da qui quattro idee, e nessuna costa un bit nuovo per voxel:
 *
 * 1. **Un tetto alla quota accesa.** Anche a citta' piena si accende una
 *    minoranza di finestre. L'occupazione continua a governarla, ma dentro un
 *    intervallo che non arriva mai al muro di luce.
 * 2. **La torre come unita'.** Un gruppo di colonne dell'ordine dell'impronta ha
 *    la sua quota accesa e il suo carattere. Non e' l'edificio — al frammento
 *    non arriva nessun identificatore, e dargliene uno costerebbe bit che non ci
 *    sono — ma e' la scala alla quale due vicini devono differire per
 *    distinguersi.
 * 3. **Due modi di accendersi.** Un ufficio accende piani interi, una casa
 *    finestre sparse. La grammatica `habitat` copre residenziale e commerciale
 *    insieme, quindi a scegliere quale dei due sia una torre e' la torre stessa
 *    e non l'uso: e' un limite dichiarato, ed e' cio' che mette bande
 *    orizzontali in mezzo alle macchie.
 * 4. **La torre non e' accesa allo stesso modo per tutta la sua altezza.** Un
 *    blocco di piani contigui condivide lo stato: alcuni restano spenti del
 *    tutto, altri sono pieni. E' la differenza fra un grattacielo e una colonna
 *    di retino, ed e' quella che si vede per prima da lontano — in una foto
 *    notturna di Manhattan la massa scura fra due fasce accese e' piu' estesa
 *    delle fasce.
 *
 * La quarta e' arrivata dopo le altre tre, e le ha ritarate: la quota di punta
 * e' salita perche' adesso vale su un blocco e non su tutta la facciata, e
 * l'estremo buio della polarizzazione e' sceso di un'ottava perche' **una torre
 * quasi spenta e' un elemento del disegno**, non un difetto. In media questo
 * modello accende circa la meta' delle finestre di prima — 0.20 contro 0.38 di
 * quota a citta' piena — e le poche accese sono piu' forti: e' lo scambio
 * giusto, perche' il contrasto si legge e la densita' uniforme no.
 *
 * Cosa **non** cambia: quali finestre si accendono resta deterministico per
 * cella. A muoversi con l'economia sono le soglie, mai i numeri casuali — le
 * luci non sfarfallano mentre la popolazione cresce.
 */

export const NIGHT_WINDOWS = {
  /**
   * Lato in voxel del gruppo di colonne che il frammento tratta come una torre.
   *
   * Sei sta in mezzo alle impronte ammesse (`MIN_FOOTPRINT` 4, `MAX_FOOTPRINT`
   * 8), ed e' deliberato che non coincida con nessuna: una torre larga cade su
   * due gruppi e si accende a ali diverse, che e' esattamente cio' che fa una
   * torre vera. Piu' stretto darebbe scacchi dentro la stessa facciata, piu'
   * largo accenderebbe l'isolato come un blocco unico.
   */
  towerCell: 6,

  /**
   * Frazione di torri che si accendono per piani interi invece che a finestre
   * sparse. Poco piu' di un terzo, non poco meno della meta' come prima.
   *
   * Le due soglie dell'ufficio si dividono la stessa quota, quindi un ufficio e
   * una casa accendono in media **lo stesso numero** di finestre: a pesare non e'
   * la quantita' ma la forma. La luce di un ufficio e' compatta — un piano
   * intero — e la stessa quantita' concentrata legge come una massa piu'
   * luminosa di quanta ne sia sparsa; con il bianco freddo addosso, poco meno
   * della meta' delle torri bastava a far virare al ciano tutto lo skyline.
   */
  officeShare: 0.36,

  /**
   * Quota accesa del blocco di piani piu' pieno di una torre media a citta'
   * piena.
   *
   * Non e' piu' la quota della torre intera: `storey` la spegne su un blocco su
   * tre e la smorza sugli altri, quindi il valore di punta puo' salire senza che
   * la facciata torni un muro. Chi cerca la media di una torre la trova
   * moltiplicando per `storeyGain`, che vale circa 0.49.
   */
  peakShare: 0.46,

  /**
   * Curvatura con cui l'occupazione arriva a `peakShare`.
   *
   * Sotto 1 la citta' si accende in fretta e poi satura: a meta' occupazione ha
   * gia' due terzi delle sue luci. E' la lettura giusta — un quartiere abitato a
   * meta' di notte sembra vivo, non mezzo spento — e conserva l'estremo che
   * conta: a occupazione zero non si accende niente, come dice `vitality.ts`.
   */
  occupancyGamma: 0.6,

  /**
   * Moltiplicatore della quota accesa fra la torre piu' buia e la piu' viva.
   *
   * E' la manopola del contrasto: senza, tutte le torri avrebbero la stessa
   * densita' di luce e la citta' resterebbe un tessuto uniforme anche con il
   * tetto di `peakShare`.
   *
   * L'estremo basso e' un'ottava sotto quello di prima, che a 0.3 lasciava
   * comunque una finestra accesa su nove: abbastanza per far luccicare **ogni**
   * torre e togliere al quartiere la sua profondita'. Una torre praticamente
   * spenta accanto a una viva e' cio' che dice quale delle due sta davanti.
   */
  towerBias: { low: 0.12, high: 1.6 },

  /**
   * La grana verticale: quanto di una torre e' acceso a quale quota.
   *
   * Un edificio si svuota per piani contigui — un'ala di uffici che stacca, i
   * piani alti ancora invenduti — non per finestre sparse a caso lungo
   * l'altezza. Senza questo, ogni facciata aveva la stessa densita' dal
   * marciapiede alla cima: leggibile come materiale, non come edificio.
   *
   * - `block` e' quanti piani condividono lo stato. Quattro e' il minimo perche'
   *   una fascia si legga da lontano come fascia e non come piano isolato, e
   *   resta sotto l'altezza tipica di una torre cosi' che ognuna ne mostri
   *   parecchi.
   * - `darkShare` e' la frazione di blocchi spenti del tutto. Un terzo scarso: e'
   *   il buio che separa le fasce, e sotto quella soglia le fasce si toccano.
   * - `dimmest` e' quanto resta acceso nel piu' vuoto dei blocchi **non** spenti.
   *   Non zero, o ci sarebbero solo due stati e la torre tornerebbe un codice a
   *   barre.
   */
  storey: { block: 4, darkShare: 0.32, dimmest: 0.45 },

  /**
   * Finestre accese su un piano d'ufficio acceso.
   *
   * Non uno: un piano completamente acceso e' un rettangolo pieno e si legge
   * come un errore. Qualche vetro spento e' cio' che lo fa leggere come un
   * piano. Vale anche come vincolo — `peakShare * towerBias.high` deve restarci
   * sotto, o la soglia del piano uscirebbe dall'intervallo utile e le bande si
   * accenderebbero tutte.
   */
  floorFill: 0.86,

  /**
   * Colonne di servizio — scale e ascensori — accese a ogni piano.
   *
   * Costano una soglia e restituiscono la riga verticale che tiene insieme una
   * facciata altrimenti a macchie: e' il dettaglio che a distanza distingue un
   * edificio da una manciata di puntini.
   *
   * E' l'unica luce che ignora la grana verticale, perche' un vano scala e'
   * acceso anche al piano vuoto: e' proprio questo che la rende la piu' visibile
   * di tutte, e per questo si paga con `coreDim`.
   */
  coreShare: 0.045,

  /**
   * Quanto e' fioca una colonna di servizio rispetto a una finestra accesa.
   *
   * Alla stessa forza era il motivo per cui ogni torre portava le stesse righe
   * verticali continue, e da lontano il motivo si ripeteva identico su tutta la
   * citta': era la firma piu' riconoscibile dello skyline, e non doveva esserlo.
   * Un vano scala e' illuminato di servizio, non abitato — e' piu' scuro di una
   * finestra anche dal vero.
   */
  coreDim: 0.4,

  /**
   * Guadagno dell'emissione delle finestre di giorno e di notte piena.
   *
   * Di giorno una finestra accesa resta visibile ma non compete con il sole; di
   * notte deve bucare la facciata, ed e' quel guadagno che porta anche il bloom.
   * Con la grana verticale le finestre accese sono circa la meta' di prima: il
   * guadagno notturno sale per non perdere il bagliore complessivo, e il conto
   * torna dove serve — poche finestre forti invece di tante tiepide.
   */
  gain: { day: 0.45, night: 1.7 },
} as const;

/**
 * Quota di finestre accese di una torre, fra 0 e 1.
 *
 * `occupancy` e' `CityVitality.homes` — la lettura dell'economia — e `bias` il
 * carattere della torre, fra `towerBias.low` e `towerBias.high`. Il fragment
 * shader calcola la stessa cosa per frammento; questa copia esiste per poterla
 * verificare senza GPU.
 */
export function litShare(occupancy: number, bias: number): number {
  const base = Math.pow(clamp01(occupancy), NIGHT_WINDOWS.occupancyGamma);
  return clamp01(base * NIGHT_WINDOWS.peakShare * bias);
}

/** Il carattere di una torre da un numero casuale 0..1. */
export function towerBias(hash: number): number {
  const { low, high } = NIGHT_WINDOWS.towerBias;
  return low + (high - low) * clamp01(hash);
}

/**
 * Quanto e' acceso un blocco di piani rispetto alla quota della sua torre.
 *
 * Fra 0 e 1: **puo' soltanto togliere luce**, e non e' un dettaglio di
 * implementazione. E' cio' che lascia valide tutte le invarianti scritte sopra
 * sulla quota della torre — quella dell'ufficio in particolare, che romperebbe
 * se la quota effettiva superasse `floorFill` — senza doverle riverificare a
 * ogni blocco.
 *
 * Il secondo numero casuale si ricava dal primo con un `fract`, invece di
 * costare un secondo hash nel frammento: e' abbastanza decorrelato alla scala di
 * un blocco, che e' l'unica alla quale qualcuno lo guarda.
 */
export function storeyGain(hash: number): number {
  const { darkShare, dimmest } = NIGHT_WINDOWS.storey;
  const value = clamp01(hash);
  if (value < darkShare) return 0;
  return dimmest + (1 - dimmest) * fract(value * 5.17);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
