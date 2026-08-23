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
 * Da qui tre idee, e nessuna costa un bit nuovo per voxel:
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
   * sparse. Poco sotto la meta': le bande orizzontali sono la firma di uno
   * skyline notturno, ma se fossero la maggioranza tornerebbe la regolarita' da
   * cui si sta scappando.
   */
  officeShare: 0.42,

  /** Quota accesa di una torre media a citta' piena. */
  peakShare: 0.38,

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
   */
  towerBias: { low: 0.3, high: 1.7 },

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
   */
  coreShare: 0.05,

  /**
   * Guadagno dell'emissione delle finestre di giorno e di notte piena.
   *
   * Di giorno una finestra accesa resta visibile ma non compete con il sole; di
   * notte deve bucare la facciata, ed e' quel guadagno che porta anche il bloom.
   */
  gain: { day: 0.45, night: 1.5 },
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

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
