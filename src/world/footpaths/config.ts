import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { TERRAIN } from '../terrain/config';

/**
 * Unica fonte di verita' dei numeri del tessuto pedonale.
 *
 * **Perche' un dominio suo e non `roads/`.** Le due reti sono opposte su tutt'e
 * tre le cose che le definiscono. Il tracciato e' funzione dei **poli**: e'
 * l'albero che converge sui catalizzatori, si rifa' intero quando i poli
 * cambiano, e ogni suo tratto prende la larghezza del proprio rango. Un sentiero
 * nasce da **un edificio solo**, resta largo un voxel per sempre e non si rifa'
 * mai — e' la traccia che una casa lascia verso la strada, non un ramo di un
 * albero.
 *
 * **E soprattutto sta dove il tracciato ha deciso di non stare.**
 * `RoadNetwork.connect` si autoesclude entro `ROADS.frontageReach`: un lotto a
 * sei colonne dalla carreggiata e' gia' «sul fronte», e non gli si tira nessun
 * capillare. E' la scelta giusta per una strada — sei colonne di asfalto per una
 * villetta sarebbero un piazzale — ma lascia scoperta esattamente la fascia in
 * cui una citta' vera ha i suoi vicoli. Quella fascia e' questo dominio.
 *
 * L'invariante che ne segue: **un sentiero non prende suolo e non lo contende a
 * nessuno.** Dipinge soltanto colonne che nessuno occupa, e lo fa alla priorita'
 * piu' bassa di tutto il suolo pubblico — zero, sotto la maglia catastale che
 * vale uno e sotto il tracciato che parte da tre. Qualunque altra superficie
 * arrivi dopo se la prende, e il sentiero sparisce da se' senza che nessuno
 * debba cancellarlo.
 *
 * Vale la regola di `roads/config.ts`: nessun altro file di `src/world/footpaths/`
 * contiene un costo, una soglia o un indice di palette.
 */
export const FOOTPATHS = {
  /**
   * Colore del lastricato.
   *
   * **Diverso da quello del capillare carrabile**, che e' `stone`: sono due cose
   * diverse — di li' passa un mezzo, di qui una persona — e se le si dipinge
   * uguali la gerarchia che `ROADS.rankPalette` costruisce con quattro toni
   * perde il proprio gradino piu' basso. `stoneWarm` e' gia' il lastricato
   * pedonale del progetto: lo usa il viale alberato del parco.
   */
  palette: PALETTE_SLOTS.stoneWarm,

  /**
   * Priorita' di superficie: l'ultima di tutte, e per contratto.
   *
   * Zero non e' «nessuna priorita'» ma il gradino sotto la maglia catastale
   * (uno) e sotto il tracciato (da tre a sei). E' cio' che rende vera la meta'
   * «non lo contende a nessuno» dell'invariante: dove un vicolo e una
   * carreggiata rivendicano la stessa colonna vince sempre la carreggiata,
   * qualunque delle due sia arrivata prima — `SurfaceQueue` arbitra sia in coda
   * sia a posteriori.
   */
  priority: 0,

  // --- Costo di un passo ----------------------------------------------------

  /**
   * Costo di una colonna **gia' pubblica**: carreggiata o sentiero posato.
   *
   * Non e' un costo di attraversamento — li' la ricerca si **ferma**, perche' e'
   * il suo criterio di arrivo — ma il costo con cui quella colonna si fa
   * trovare. Vale 1, il minimo della sezione, e serve a una cosa sola: fra due
   * approdi pubblici ugualmente lontani deve decidere la distanza, non il colore
   * di cio' che sta in mezzo. E' anche cio' per cui l'insieme legge come una
   * rete invece che come un mazzo di stecchini — un vicolo nuovo si innesta sul
   * primo vicolo che incontra e non corre parallelo fino alla strada.
   */
  pavedCost: 1,

  /**
   * Costo di una colonna libera **a ridosso di un muro**.
   *
   * **E' il numero da cui viene la forma organica di questa rete**, e non c'e'
   * nient'altro che la produca: un vicolo vero corre rasente alle facciate
   * perche' e' li' che il terreno e' avanzato, non in mezzo al prato. Preferire
   * il muro costa una lettura del registry per colonna e in cambio il sentiero
   * si infila nell'arretramento fra due file di case invece di tagliare il
   * giardino in diagonale.
   */
  wallCost: 2,

  /** Costo di una colonna libera in mezzo al niente. */
  openCost: 3,

  /**
   * Quanto costa un passo in diagonale rispetto a uno in asse.
   *
   * La radice di due, per la ragione che `ROADS.diagonalCost` documenta per
   * esteso: contando la diagonale quanto l'asse, la diagonale diventa la mossa
   * piu' conveniente del grafo e ogni cammino la satura prima di raddrizzarsi.
   */
  diagonalCost: Math.SQRT2,

  /**
   * Costo aggiunto per ogni voxel di dislivello fra due colonne consecutive.
   *
   * **Tre e non otto, ed e' la differenza fra una strada e una scala.** Con il
   * numero del tracciato un voxel di salita costa quattro colonne piane, quindi
   * il cammino minimo gira sempre attorno al gradino: e' cio' che si vuole da una
   * carreggiata e non da un sentiero, che sale a scalini per definizione. A tre
   * un gradino di terreno — due voxel — costa due colonne di deviazione: il
   * sentiero resta in piano quando puo' scegliere e sale quando la scelta
   * costerebbe il giro dell'isolato.
   */
  risePerVoxel: 3,

  /**
   * Dislivello oltre il quale un passo non e' percorribile affatto.
   *
   * **Il doppio di quello di una strada**, cioe' due cubi di terreno in un
   * passo. E' l'unico punto in cui questa rete e' piu' capace dell'altra, ed e'
   * la ragione per cui esiste anche dove la carreggiata ha rinunciato: un
   * pendio che una strada non risale a piedi si sale, con una rampa di scalini.
   * Piu' su non si va — tre cubi in una colonna non e' una scala, e' una parete.
   */
  maxStep: 2 * TERRAIN.cellSize,

  /**
   * Colonne oltre le quali un sentiero non si tira piu'.
   *
   * Il doppio di `ROADS.frontageReach`, che e' la fascia da coprire, piu' il
   * gioco per aggirare i vicini che ci stanno dentro. Un edificio piu' lontano
   * di cosi' dal suolo pubblico non ha bisogno di un vicolo ma di un capillare
   * carrabile, e quello glielo tira gia' `RoadNetwork.connect`.
   */
  reach: 12,
} as const;
