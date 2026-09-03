import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { TERRAIN } from '../terrain/config';

/**
 * Unica fonte di verita' dei numeri del tracciato organico.
 *
 * **Perche' un dominio suo e non `streets/`.** Quella cartella dichiara nel
 * proprio `AGENTS.md` che la rete e' una funzione pura di `(seed, x, y)`, ed e'
 * un contratto che vale la pena tenere: `blockAt` e `blockRect` sono l'unita' di
 * lottizzazione che mezzo progetto legge, e devono restare gratuite da
 * interrogare e indipendenti dall'ordine di visita. Un tracciato che converge
 * sui poli non puo' esserlo: dipende da dove il giocatore ha piantato i
 * catalizzatori, quindi e' funzione di `(seed, terreno, poli)` e non della sola
 * colonna.
 *
 * Le due cose convivono perche' rispondono a due domande diverse. La maglia di
 * `streets/` resta il **catasto**: dice di chi e' questo pezzo di terra, e non
 * si vede. Il tracciato di qui e' la **strada**: si vede, e non lottizza niente.
 * Prima erano lo stesso oggetto, ed e' per questo che a schermo compariva un
 * reticolo quadrato — la citta' mostrava il proprio catasto.
 *
 * Vale la regola di `streets/config.ts` e `terrain/config.ts`: nessun altro file
 * di `src/world/roads/` contiene una larghezza, un costo o un indice di palette.
 */

/**
 * Rango di un tratto: quanta citta' ci passa sopra.
 *
 * Non e' una categoria dichiarata a mano ma il risultato di una misura — vedi
 * `network.ts` — e i quattro nomi servono solo a dargli una larghezza e un
 * colore. L'ordine e' crescente e i consumatori ci indicizzano dentro.
 */
export const ROAD_RANK = {
  /** Il capillare che attacca un isolato alla rete. Un voxel: un vicolo. */
  lane: 0,
  /** La strada di quartiere. */
  street: 1,
  /** L'asse che raccoglie piu' quartieri. */
  avenue: 2,
  /** Il tronco: l'unica cosa che possa leggersi come un'autostrada. */
  trunk: 3,
} as const;

export type RoadRank = (typeof ROAD_RANK)[keyof typeof ROAD_RANK];

export const ALL_ROAD_RANKS: readonly RoadRank[] = [
  ROAD_RANK.lane,
  ROAD_RANK.street,
  ROAD_RANK.avenue,
  ROAD_RANK.trunk,
];

export const ROADS = {
  /**
   * Larghezza della carreggiata per rango, in voxel.
   *
   * **Il salto fra `avenue` e `trunk` e' deliberatamente brusco.** A distanza di
   * gioco due larghezze vicine sono la stessa strada, e una gerarchia che cresce
   * di un voxel per rango non si legge affatto: quello che si vede e' una
   * carreggiata che si allarga a caso. Tre ranghi sottili piu' uno largo dicono
   * invece una cosa sola e la dicono subito — *quella* e' l'arteria, tutto il
   * resto e' tessuto.
   *
   * Il capillare a un voxel e' sotto il cubo di terreno, ed e' voluto: e' un
   * vicolo, non una strada, e deve leggere come una fessura fra le case.
   */
  rankWidth: [1, 2, 3, 6] as readonly number[],

  /** Colore della carreggiata per rango. Il tronco e' l'unico scuro. */
  rankPalette: [
    PALETTE_SLOTS.stone,
    PALETTE_SLOTS.asphalt,
    PALETTE_SLOTS.asphalt,
    PALETTE_SLOTS.asphaltDark,
  ] as readonly number[],

  /**
   * Priorita' di superficie per rango: chi vince l'incrocio.
   *
   * Parte da 3 per stare **sopra** la carreggiata della maglia catastale
   * (priorita' 1 e 2 in `surfaceQueue`): dove le due si sovrappongono e' il
   * tracciato a doversi vedere.
   */
  rankPriority: [3, 4, 5, 6] as readonly number[],

  // --- Costo del terreno per una strada ------------------------------------

  /**
   * Costo di attraversare una colonna **gia' di carreggiata**. E' il riferimento.
   *
   * Vale 1, ed e' il minimo assoluto: nessun altro costo di questa sezione
   * scende sotto, esattamente come `BALANCE.reach.pavement` in `src/sim/`. Non
   * e' una cortesia al chiamante ma l'invariante su cui poggia la ricerca —
   * l'euristica di `traceRoad` usa questo numero come costo minimo di un passo,
   * e sotto smetterebbe di essere ammissibile, cioe' il cammino trovato non
   * sarebbe piu' il minimo.
   *
   * E' anche cio' che fa **confluire** i rami invece di lasciarli correre
   * paralleli: un tratto nuovo che possa appoggiarsi a uno vecchio ci si
   * appoggia, perche' li' il piano costa meta'. E' la ragione per cui la rete
   * legge come una rete e non come un mazzo di fili.
   */
  flatCost: 1,

  /**
   * Costo di attraversare una colonna piana, edificabile e vergine.
   *
   * Il doppio della carreggiata: e' quel rapporto, e non i due numeri, a
   * decidere quanto la rete si accorpa. A parita' si avrebbero rami paralleli a
   * due colonne di distanza; a un fattore troppo alto ogni strada nuova
   * ripercorrerebbe mezza isola pur di non toccare terra vergine.
   */
  landCost: 2,

  /**
   * Costo aggiunto per ogni voxel di dislivello fra due colonne consecutive.
   *
   * **E' l'unico numero che produce i tornanti**, ed e' anche l'unico che rende
   * il tracciato organico invece che una linea storta. A zero la strada sale
   * dritta su qualunque parete; a otto un voxel di salita costa quanto quattro
   * colonne di terra vergine, quindi conviene qualunque diagonale che salga di
   * meno — che e' esattamente la definizione di una curva di livello.
   *
   * Tarato contro `maxRise`: sotto la soglia si paga, sopra non si passa.
   */
  risePerVoxel: 8,

  /**
   * Dislivello oltre il quale un passo non e' percorribile affatto.
   *
   * Due voxel, cioe' un cubo di terreno. Una strada che salga di piu' in una
   * colonna non e' una strada: e' un gradino, e a schermo legge come un errore
   * di quota. Il tracciato preferisce allungarsi.
   */
  maxRise: TERRAIN.cellSize,

  /**
   * Costo di attraversare una colonna gia' occupata da un edificio.
   *
   * **Passabile e non vietata**, ed e' la stessa scelta di `legCost` in
   * `surfaceQueue`: una strada che giri attorno alla citta' invece di
   * attraversarla e' il contrario di cio' che una strada fa. Cara pero' quanto
   * sei colonne libere, cosi' fra due percorsi simili vince quello che non
   * sventra niente.
   */
  builtCost: 6,

  /**
   * Costo di attraversare l'acqua a nuoto d'uccello, cioe' in viadotto.
   *
   * Non e' `Infinity` — un ponte esiste — ma e' il numero che decide quando ne
   * vale la pena: a venti, un braccio di mare di dieci colonne costa quanto
   * duecento colonne di terra, quindi il tracciato gira sempre attorno a una
   * baia e scavalca solo cio' che non si puo' aggirare.
   */
  waterCost: 20,

  /** Costo di una colonna di roccia o di ciglio: si passa, ma il giro si sente. */
  steepCost: 4,

  // --- Viadotti ------------------------------------------------------------

  /**
   * Colonne consecutive impraticabili a terra oltre le quali il tratto sale in
   * quota invece di rinunciare.
   *
   * Sotto questa lunghezza la carreggiata si appoggia comunque al terreno: una o
   * due colonne di battigia le risolve la rampa di `grading/`, e un viadotto da
   * due campate leggerebbe come un difetto di posa. Sopra, il tratto diventa
   * struttura: pile, impalcato e franco.
   */
  viaductMinRun: 4,

  /**
   * Franco minimo dell'impalcato sopra cio' che scavalca, in voxel.
   *
   * Sotto l'impalcato ci deve passare la citta': e' la stessa ragione per cui
   * `SPANS` tiene un franco sulle passerelle. Sull'acqua il franco si misura dal
   * pelo, sul costruito dal tetto piu' alto sotto la campata.
   */
  viaductClearance: 6,

  /** Distanza fra due pile di un viadotto, in colonne. */
  viaductPierPitch: 8,

  /** Colore dell'impalcato e delle pile. */
  viaductDeck: PALETTE_SLOTS.concrete,
  viaductPier: PALETTE_SLOTS.concreteLight,

  // --- Forma della rete ----------------------------------------------------

  /**
   * Quanti poli, al massimo, entrano nell'albero della rete.
   *
   * L'albero e' minimo su `n` nodi e costa `n^2` distanze di cammino: e' gratis
   * per la ventina di catalizzatori di una partita, e questo tetto esiste solo
   * perche' un salvataggio malformato non faccia esplodere il costo. I poli
   * scartati sono i piu' deboli, che sono anche quelli che il tracciato
   * raggiungerebbe per ultimi.
   */
  maxPoles: 48,

  /**
   * Sotto quante colonne due poli si considerano lo stesso nodo.
   *
   * Due catalizzatori piantati vicini non meritano una strada fra loro: il
   * tratto sarebbe piu' corto del proprio raccordo, e a schermo sarebbe un
   * moncone. Vale mezzo passo della maglia catastale, che e' la distanza sotto
   * la quale i due poli condividono comunque gli isolati.
   */
  mergeDistance: 20,

  /**
   * Carico oltre il quale un tratto diventa tronco, in frazione del carico
   * massimo della rete.
   *
   * Il carico di un tratto e' la sua **intermediazione**: quanti poli ci passano
   * sopra per raggiungere il centro. Vicino al centro tende al numero dei poli,
   * su una foglia vale uno. Normalizzare sul massimo e non sul numero di poli e'
   * quello che tiene la gerarchia leggibile a ogni dimensione di citta': con tre
   * poli il tronco e' comunque una strada sola invece che tutte e tre, e con
   * trenta non sparisce sotto la soglia.
   *
   * A 0,7 il tronco e' la spina che entra nel centro e poco piu' — che e'
   * l'unica cosa che debba leggersi come un'autostrada.
   */
  trunkShare: 0.7,
  /** Le due soglie intermedie, sulla stessa scala di `trunkShare`. */
  avenueShare: 0.4,
  streetShare: 0.15,

  /**
   * Colonne oltre le quali un isolato costruito si tira dietro un capillare.
   *
   * Sotto, l'isolato e' gia' sul fronte di un tratto esistente e il vicolo
   * sarebbe lungo zero. E' anche il raggio entro cui il `Builder` considera un
   * candidato «sulla strada» quando ordina le infornate.
   */
  frontageReach: 6,

  /**
   * Colonne oltre le quali un capillare non si tira piu'.
   *
   * Un isolato piu' lontano di cosi' dalla rete non e' periferia: e' un altro
   * insediamento, e ci arrivera' il ramo di un polo, non un vicolo.
   */
  laneReach: 96,
} as const;
