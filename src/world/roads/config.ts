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
   * Quanto costa un passo in diagonale rispetto a uno in asse.
   *
   * **La radice di due, cioe' la lunghezza vera del passo.** Contando la
   * diagonale quanto l'asse — come fa ogni ricerca a otto vicini scritta senza
   * pensarci — si dichiara che spostarsi di 1,41 colonne costa quanto spostarsi
   * di una: la diagonale diventa la mossa piu' conveniente del grafo, e ogni
   * cammino minimo la usa fino a esaurirla prima di raddrizzarsi. Il risultato
   * e' la spezzata a due tratti — una riga a quarantacinque gradi e una in asse —
   * che si vedeva a schermo, e non la si toglie con nessuna quantita' di
   * rumore: e' la metrica a dire che quella forma non ha alternative allo
   * stesso prezzo.
   *
   * Con il fattore giusto il costo di un cammino torna proporzionale alla sua
   * **lunghezza**, tutte le direzioni costano il vero, e il minimo diventa una
   * geodetica del campo di costo: una curva, che e' cio' che si voleva.
   *
   * L'euristica di `traceRoad` resta ammissibile perche' cresce: il passo piu'
   * economico continua a valere `flatCost`, che e' il numero su cui e' tarata.
   */
  diagonalCost: Math.SQRT2,

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
   * vale la pena. La regola e' `larghezza x waterCost` contro
   * `giro x landCost`: a otto, una strozzatura di dieci colonne si scavalca pur
   * di risparmiare una trentina di colonne di giro, e una baia larga si continua
   * a costeggiare perche' il giro costa comunque meno dell'attraversamento.
   *
   * **A venti — il numero con cui questo e' nato — non si scavalcava niente**, e
   * misurato e' letteralmente niente: su un'isola vera da 384 con
   * millequattrocento colonne di lago, cinque poli agli estremi e mille colonne
   * di carreggiata, le campate erano zero. Il viadotto esisteva solo per il polo
   * irraggiungibile a piedi, che su un'isola sola non capita mai: tutto il ramo
   * era codice non percorso.
   */
  waterCost: 8,

  /** Costo di una colonna di roccia o di ciglio: si passa, ma il giro si sente. */
  steepCost: 4,

  /**
   * Costo aggiunto per unita' di pendenza della colonna.
   *
   * **I quattro costi qui sopra sono a gradini, e a gradini si va dritti.** Su
   * un pianoro dove ogni colonna costa lo stesso esistono migliaia di cammini
   * dello stesso prezzo, e A\* ne sceglie uno qualunque: quello che esce e' la
   * diagonale canonica, cioe' una riga a quarantacinque gradi lunga mezza isola.
   * Non e' un difetto della ricerca ma dell'assenza di preferenza — se il piano
   * e' piatto, ogni curva costa quanto la retta.
   *
   * La pendenza e' l'unico campo continuo che il terreno ha gia', e usarla
   * rompe i pareggi **dove il terreno vuole che si rompano**: fra due passi
   * uguali vince quello che sta piu' in piano, e il cammino segue la curva di
   * livello invece di attraversarla. E' la stessa cosa che fa `risePerVoxel`,
   * ma sul posto invece che sul salto — quello vieta di salire, questo
   * suggerisce da che parte girare prima ancora che ci sia da salire.
   *
   * A otto, un fianco a mezza pendenza costa quanto due colonne di terra
   * vergine: abbastanza da spostare il tracciato di qualche colonna, non tanto
   * da fargli fare il giro dell'isola.
   */
  slopeCost: 8,

  /**
   * Ampiezza del campo di divagazione, in costo.
   *
   * La pendenza non basta da sola: **una piana e' piana davvero**, e li' i
   * pareggi restano. Questo e' un campo liscio, funzione di `(seed, x, y)` e di
   * nient'altro, che aggiunge fra zero e questo numero al costo di ogni colonna
   * di terra. Non e' rumore per fare rumore: e' cio' che sta al posto di tutto
   * quello che il terreno non modella — un fosso, un filare, un pezzo di terra
   * che non si e' potuto comprare — e che nelle citta' vere e' la ragione per
   * cui una strada di pianura non e' comunque dritta.
   *
   * **Il tetto e' il salto fra due gradini del terreno**, cioe' `steepCost`
   * meno `landCost`. Sopra, una piana sfortunata costerebbe piu' di un ciglio e
   * la strada preferirebbe la parete: la divagazione avrebbe smesso di piegare
   * il tracciato e avrebbe cominciato a riscrivere la graduatoria del terreno,
   * che e' un'altra cosa e non e' cio' che serve. A due pareggia e non batte.
   *
   * (La pendenza invece quel tetto lo puo' superare, ed e' voluto: `isBuildable`
   * e' una soglia sulla pendenza stessa, quindi due colonne quasi identiche
   * finiscono su gradini diversi. Che un fianco ripido ma edificabile costi piu'
   * di una roccia piana e' il termine continuo che corregge la soglia, non un
   * riordino arbitrario.)
   */
  wanderCost: 2,

  /**
   * Lato del reticolo su cui il campo di divagazione e' campionato, in colonne.
   *
   * E' la **lunghezza d'onda della curva**, ed e' il numero che decide se il
   * risultato legge come una strada o come un errore. Sotto le poche colonne il
   * tracciato tremerebbe a ogni passo — una linea seghettata, non una curva.
   *
   * **Ma il rischio vero e' dal lato corto, non da quello lungo**, ed e' meno
   * ovvio: un cammino teso fra due punti si piega solo se trova un *dislivello
   * di costo trasversale* alla propria direzione. Con la cella corta, spostarsi
   * di sei colonne di lato resta dentro la stessa cella — il campo li' vale
   * quasi lo stesso, non c'e' niente da guadagnare, e il cammino resta la
   * diagonale di prima per quanto si alzi l'ampiezza. Misurato a dodici: la rete
   * si accorciava della meta' ma le diagonali restavano righe. Serve una cella
   * dell'ordine della *lunghezza di un ramo*, cosi' che una deviazione di poche
   * colonne cada in un valore davvero diverso.
   */
  wanderCell: 32,

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
   *
   * **Quattro volte il fronte strada, e non di piu'.** A novantasei — la misura
   * con cui questo e' nato — un capillare era piu' lungo di un ramo dell'albero:
   * una casa isolata a settanta colonne se ne tirava dietro settanta di vicolo,
   * e su un'isola vera la somma dei vicoli superava l'intera rete dei poli.
   * Misurato: mille colonne di carreggiata di cui piu' della meta' capillari,
   * righe dritte da un capo all'altro della mappa, e la fascia di fronte strada
   * dilatata su **tutta** l'isola — a quel punto ogni ancoraggio risulta
   * affacciato e la preferenza che doveva addensare il tessuto non discrimina
   * piu' niente. Il vicolo e' un passo carraio: se non basta, l'isolato e'
   * semplicemente nel posto sbagliato, ed e' la ricerca del lotto a doverlo
   * sapere.
   */
  laneReach: 24,
} as const;
