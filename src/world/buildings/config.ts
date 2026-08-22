import type { BuildingClass, CatalystId, CharterId, DistrictId, Specialization } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { TERRAIN } from '../terrain/config';

/**
 * Unica fonte di verita' dei numeri della costruzione.
 *
 * Vale qui la stessa regola di `terrain/config.ts` e `sim/balance.ts`: nessun
 * altro file di `src/world/buildings/` contiene una soglia, una cadenza o un
 * indice di palette. La ragione non e' l'ordine ma la separazione dei domini —
 * `balance.ts` descrive le regole della simulazione, e se un edificio viene su
 * troppo alto o troppo spesso la risposta sta in questo file, mai in quello.
 * Toccare `balance.ts` per far tornare un conto visivo sposterebbe il pareggio
 * alimentare per rendere piu' bella una torre.
 */

/** Ritmo con cui il Builder consuma le decisioni della simulazione. */
export const BUILDER = {
  /**
   * Tick fra un'infornata di costruzioni e la successiva.
   *
   * **E' l'unico freno alla crescita della citta'.** La simulazione non fa
   * pagare un edificio: `nextBuildSites` restituisce tutte le colonne sopra
   * soglia, e a raggio pieno un catalizzatore ne apre centinaia in una volta.
   * Quanto in fretta quel quartiere si riempie lo decide solo questa cadenza.
   *
   * A 2 tick l'infornata era ogni cinque di secondo: quindici edifici al
   * secondo, cioe' l'isolato completo prima che si riuscisse a guardarlo
   * nascere. A 6 il ritmo scende a cinque al secondo — la citta' cresce ancora
   * di continuo, ma il tempo di posa di un edificio resta visibile e il
   * giocatore ha spazio per decidere dove mettere il catalizzatore successivo.
   */
  ticksPerBuild: 6,

  /**
   * Edifici accettati al massimo per infornata.
   *
   * Il ritmo si regola su `ticksPerBuild`, non qui: allargare l'infornata
   * farebbe comparire piu' edifici *nello stesso istante*, che e' proprio la
   * lettura a scatti che il sovra-prelievo qui sotto esiste per evitare.
   */
  sitesPerBuild: 3,

  /**
   * Moltiplicatore dei candidati richiesti a `nextBuildSites`.
   *
   * La simulazione ragiona per colonna e non sa niente di footprint, pendenza o
   * chunk: una parte dei suoi candidati e' inevitabilmente inutilizzabile. Senza
   * sovra-prelievo un'infornata da tre finirebbe spesso a zero, e la citta'
   * crescerebbe a scatti invece che di continuo.
   */
  candidateOverfetch: 6,

  /** Tick fra una passata di upgrade e la successiva. */
  ticksPerUpgrade: 10,

  /**
   * Record esaminati in una passata di upgrade.
   *
   * La passata riparte da dove si era fermata invece di ricominciare da capo:
   * con duemila edifici, rileggere il campo su tutti a ogni passata sarebbe la
   * sola cosa nel ciclo il cui costo cresce con la citta'.
   */
  upgradesPerPass: 64,

  /**
   * Isolati di raggio entro cui cercare un lotto quando il proprio e' pieno.
   *
   * La simulazione ripropone le stesse colonne finche' il campo resta saturo:
   * senza questa ricerca la citta' si ferma appena il primo isolato si riempie.
   * Due basta a scavalcare un isolato pieno e uno inutilizzabile di fila. Conta
   * isolati e non colonne, quindi non segue la scala del voxel: e' il passo
   * della maglia stradale a dire quanto valga in colonne.
   */
  blockSearchRadius: 2,

  /**
   * Livello massimo raggiungibile. Oltre, un edificio smette di crescere.
   *
   * **E' il piu' visibile dei tre tetti che tenevano la citta' a mezz'aria, ed
   * era l'unico che da solo non spostava niente.** A sei livelli una torre
   * arrivava a una sessantina di voxel contro gli ottanta del rilievo: gli
   * edifici salivano, la citta' no. Alzarlo qui funziona solo perche' sono
   * saliti insieme a lui `LEVEL_CAPS`, `START_LEVEL_CDF`,
   * `maxDirtyChunksPerBuilding` e `GRAMMAR.minBandSide`, e perche' esiste
   * `src/world/skyline/`: senza una quota ammessa per colonna, dodici livelli su
   * un campo saturo darebbero un altopiano piu' alto e non uno skyline.
   */
  maxLevel: 12,

  /**
   * Desiderabilita' che la colonna deve superare per promuovere un edificio al
   * livello indicato dall'indice. Il livello 0 non ha soglia: e' la costruzione
   * iniziale, che passa dalle soglie della simulazione.
   *
   * Salgono piu' in fretta di quanto scenda la desiderabilita': e' cio' che fa
   * convergere l'altezza invece di farla salire finche' c'e' un catalizzatore.
   *
   * **La scala si ferma prima di `maxLevel`, e non e' una dimenticanza.**
   * `DesirabilityField` e' un `Uint8Array` clampato in `0..255` e
   * `localUpgrade.maxDiscount` vale 38: 198 e' la fine dell'alfabeto, non una
   * taratura stretta. Oltre quel punto il campo non *distingue* piu' due colonne
   * del centro, e allungare l'elenco con numeri fra 198 e 255 darebbe soglie che
   * nessuna colonna supera oppure che le supera tutte insieme. Da li' in su a
   * decidere e' la gerarchia — `skyline/allowedLevelAt` — e questa scala si legge
   * con `upgradeThresholdOf`, che ripete l'ultima voce.
   */
  upgradeThreshold: [0, 50, 78, 108, 138, 168, 198] as readonly number[],

  /**
   * Chunk che un singolo edificio puo' marcare sporchi, fondazione inclusa.
   *
   * E' un tetto duro verificato prima di scrivere, non una speranza: un edificio
   * che sfora viene scartato — in silenzio, perche' non e' un errore. Ventiquattro
   * copre una torre alta a cavallo di una cucitura senza lasciare che un singolo
   * upgrade sporchi una regione intera.
   *
   * Otto bastavano a un'impronta di quattro. Con otto voxel di lato una torre di
   * livello massimo attraversa il triplo dei chunk, e lasciando il tetto dov'era
   * sparirebbero esattamente gli edifici alti — senza che niente lo dica.
   *
   * **Quaranta e' aritmetica, non margine.** Con `maxLevel: 12` una torre supera
   * i centoquaranta voxel. `edgeChunks` aggiunge una colonna di chunk **solo
   * quando l'impronta non ne attraversa gia' due**, quindi le colonne effettive
   * restano due per asse comunque cada l'impronta; in quota una torre copre
   * cinque piani di chunk piu' i due di bordo. Il caso peggiore vale percio'
   * `2 x 2 x 7 = 28`, e quaranta lascia spazio alla fondazione a cavallo di una
   * cucitura. Non si taglia in quota per rientrare: `sliceStamps` dichiara
   * apposta di tagliare solo in pianta, perche' una cucitura orizzontale a meta'
   * di una torre si vede.
   */
  maxDirtyChunksPerBuilding: 40,

  /**
   * Lato oltre il quale uno stamp compare a ritagli invece che in un colpo solo.
   *
   * **Le strutture grandi si spezzano, non si esentano.** Un molo lungo ventisei
   * colonne attraversa piu' piani di chunk di una torre alta: scriverlo intero li
   * marca tutti nello stesso frame, ed e' il motivo per cui la 4.12 aveva dovuto
   * alzare il tetto per i landmark invece di rispettarlo. A sedici — mezzo chunk
   * — un ritaglio tocca al massimo due colonne di chunk per asse, e il picco
   * torna quello di un edificio qualunque.
   *
   * Non e' una manopola da girare per far entrare una ricetta: se un ritaglio
   * non ci sta, e' questo numero a doversi abbassare.
   */
  segmentSide: 16,

  /**
   * Cubi scritti per frame per struttura: la crescita e' voxel-per-voxel.
   *
   * Un edificio e' fatto di circa otto volte i voxel di prima a parita' di
   * volume costruito. Il budget sale con lui, altrimenti non cambia quanto costa
   * un edificio ma solo quanto ci mette a comparire.
   */
  voxelsPerFrame: 96,

  /**
   * Edifici che possono crescere contemporaneamente.
   *
   * La coda non e' un limite di memoria ma di frame: ogni edificio in crescita
   * sporca i suoi chunk una volta per fascia, e sporcare cento chunk nello
   * stesso frame e' esattamente il picco che fa cadere il fps sotto la soglia.
   */
  maxGrowing: 12,

  /**
   * Voxel di superficie urbana scritti per frame.
   *
   * Contava celle finche' una cella valeva un voxel. Dalla 4.2 una cella puo'
   * essere un molo alto sei, e il budget deve restare quello che e': un tetto
   * sul lavoro per frame, non sul numero di colonne toccate.
   */
  surfaceVoxelsPerFrame: 192,

  /**
   * Quota sopra il terreno bonificata da tronchi e chiome.
   *
   * Deve stare sopra `treeTop` della specie piu' alta — la conifera arriva a
   * diciotto voxel dal suolo — altrimenti un lotto liberato conserva la punta
   * della chioma che stava sopra, sospesa a mezz'aria sopra il tetto nuovo.
   */
  decorClearanceHeight: 20,

  /** Raggio Manhattan della piazzola che identifica un catalizzatore. */
  catalystPlazaRadius: 4,

  /**
   * Probabilita' che un edificio prenda il colore d'accento come corpo.
   *
   * Non e' un dettaglio decorativo: e' cio' che produce blocchi interi di colore
   * caldo dentro un fondo pallido invece di una picchiettatura uniforme, che a
   * distanza si legge come rumore.
   */
  accentBuildingChance: 0.18,

  /**
   * Raggio di Chebyshev entro cui una colonna non edificabile fa "costa".
   *
   * Serve alla sola selezione della tipologia: e' cio' che distingue un mercato
   * sul porto da un mercato qualunque. Quattordici colonne perche' l'impronta
   * massima e' otto e il mercato deve vedere l'acqua, non sfiorarla.
   */
  coastalRadius: 14,

  /** Quanto il profilo locale anticipa il livello con cui nasce un edificio. */
  localLevel: {
    density: 1.4,
    wealth: 0.9,
    accessibility: 0.7,
    satisfaction: 0.5,
  },

  /** Riduzione della soglia di upgrade prodotta dalle qualita locali. */
  localUpgrade: {
    density: 18,
    wealth: 14,
    accessibility: 10,
    satisfaction: 8,
    maxDiscount: 38,
  },

  /**
   * Le stesse qualita cambiano anche la grammatica, non solo l'altezza.
   *
   * `densityBandBias` conta fasce e non voxel, quindi non segue la scala;
   * `accessibilityFootprintBias` e' un lato in voxel e la segue.
   */
  localForm: {
    densityBandBias: 2,
    accessibilityFootprintBias: -2,
    satisfactionTerraceBias: 0.22,
    wealthTerraceBias: 0.12,
    wealthAccentChance: 0.24,
  },
} as const;

/**
 * Numeri dell'aggregazione: quando due edifici adiacenti diventano una fila.
 *
 * Stanno qui e non in `grading/config.ts` perche' rispondono a una domanda
 * diversa. Quella li' dice *cosa serve* perche' una colonna regga un piano, e la
 * sua risposta vale per una banchina come per un terrapieno; questa dice *quanto*
 * un edificio e' disposto a farsi alzare per stare in fila con il vicino, che e'
 * una scelta di forma urbana e non una scelta strutturale.
 */
export const CLUSTER = {
  /**
   * Riempimento massimo che un lotto paga per entrare in una fila gia' aperta.
   *
   * E' il numero che produce i gradoni. `GRADING.maxWorksStep` non andrebbe bene
   * al suo posto: quello e' tarato sulla banchina che scende sul fondale, e con
   * ventiquattro voxel entrerebbero nella stessa fila due lotti separati da mezzo
   * fianco — un muro, non un isolato. Otto voxel sono quattro cubi di terreno:
   * abbastanza da assorbire il dislivello dentro un isolato, troppo poco perche'
   * la fila risalga un versante senza mai spezzarsi.
   */
  maxJoinFill: 8,

  /**
   * Altezza del corso di base condiviso da una fila, in voxel.
   *
   * E' la sola cosa che il cluster impone alla grammatica, e la impone alla sola
   * fascia zero: sopra, ogni membro resta se stesso. Sei voxel sono tre cubi di
   * terreno — uno zoccolo su cui l'arretramento che `forcedOp` gia' produce si
   * legge come cornice continua, invece che come il gradino di una casa sola.
   */
  baseHeight: 6,

  /**
   * Densita' locale sotto cui la fila condivide la quota ma non il basamento.
   *
   * Una casa sparsa in periferia non si e' guadagnata uno zoccolo: darglielo
   * significherebbe portare il linguaggio del centro dove non c'e' un centro. La
   * quota invece si condivide sempre, perche' due edifici accostati a quote
   * diverse leggono come un errore a qualunque densita'.
   */
  minDensity: 0.35,

  /**
   * Colonne di cui un'impronta puo' scorrere lungo il fronte per accostarsi.
   *
   * Un cubo di terreno: `placeLot` scorre a passo di `STREETS.align` e le
   * impronte possono uscire dispari, quindi fra due edifici di una fila puo'
   * restare un solco da un voxel. Chiuderlo vale piu' del passo perso — un solco
   * da un voxel a distanza di gioco e' una crepa, non una separazione.
   */
  maxSnap: TERRAIN.cellSize,
} as const;

export interface BuildingForm {
  readonly density: number;
  readonly wealth: number;
  readonly accessibility: number;
  readonly satisfaction: number;
}

export const DEFAULT_BUILDING_FORM: BuildingForm = {
  density: 0,
  wealth: 0,
  accessibility: 0,
  satisfaction: 0,
};

/**
 * Tetti per livello.
 *
 * Il livello e' l'unica leva che fa crescere un edificio, e cresce solo per
 * desiderabilita'. Footprint e fasce salgono insieme perche' una torre stretta e
 * altissima su una base 1x1 si legge come un palo, non come un edificio.
 */
/**
 * Lato massimo assoluto di un'impronta, su qualunque livello.
 *
 * E' in voxel, e il voxel di un edificio e' quello fine: un edificio e' fatto
 * di mattoni piu' piccoli del cubo di terreno su cui poggia (`TERRAIN.cellSize`).
 * Otto voxel di lato sono quattro cubi di terreno — la stessa area di prima,
 * con il doppio del dettaglio per lato in facciata.
 */
export const MAX_FOOTPRINT = 8;

/**
 * Lato minimo assoluto: sotto, un edificio e' un palo e non una casa.
 *
 * Quattro voxel sono due cubi di terreno, cioe' lo stesso ingombro minimo di
 * prima. Serve dichiarato perche' il tiro dell'impronta parte da qui, e con
 * `MAX_FOOTPRINT` raddoppiato un minimo di due darebbe casupole che alla scala
 * nuova leggono come garage.
 */
export const MIN_FOOTPRINT = 4;

/**
 * Spessori della grammatica, in voxel.
 *
 * Sono le sole quote che non dipendono ne' dalla classe ne' dal livello: lo
 * zoccolo a terra, il portale al piano terra, il coronamento in cima e il lato
 * del dettaglio sul tetto. Stanno qui e non in `generate.ts` per la stessa
 * ragione di tutto il resto — un numero che decide una proporzione visibile si
 * cambia in un file solo.
 *
 * Sono tutti multipli di due perche' il voxel di un edificio e' la meta' del
 * cubo di terreno: alla scala vecchia uno zoccolo da un voxel era alto quanto
 * un gradino di terreno, e i due si confondevano.
 */
export const GRAMMAR = {
  /** Zoccolo a contatto col terreno: i voxel piu' bassi dell'intero edificio. */
  plinthHeight: 2,

  /** Quota entro cui una faccia sul fronte d'accento diventa portale. */
  portalHeight: 4,

  /** Altezza del coronamento, `[minimo, massimo]` inclusi. */
  crownHeight: [2, 4] as readonly [number, number],

  /** Altezza del coronamento quando la tipologia lo vuole piatto. */
  flatCrownHeight: 2,

  /**
   * Altezza della lanterna, sommata a quella tirata per il coronamento.
   *
   * E' la sola forma di coronamento che *sale* invece di chiudere: senza il
   * supplemento rientrerebbe di quattro voxel per lato e resterebbe bassa, cioe'
   * un cappello minuscolo invece di una torretta.
   */
  lanternRise: 4,

  /**
   * Lato del dettaglio verticale sul tetto.
   *
   * A un voxel su un tetto largo otto sparirebbe alla distanza di gioco, che e'
   * il contrario di cio' per cui esiste: chiudere la silhouette.
   */
  roofPropSide: 2,

  /**
   * Lato sotto cui una fascia non scende.
   *
   * Senza, una catena di rientranze porta la cima a un voxel e la torre finisce
   * a punta di spillo: succedeva gia' con `shrink` ripetuto, e con `stack` in
   * repertorio succederebbe in meta' delle fasce.
   *
   * **Due bastavano su otto fasce, non su ventisei.** Con `maxLevel: 12` una
   * torre ha tre volte le fasce di prima, e una catena di `shrink` la portava al
   * minimo entro il primo terzo: sopra restava uno stelo da un cubo di terreno
   * per due terzi dell'altezza, cioe' un palo. A quattro voxel — due cubi — lo
   * stelo resta un volume per tutta la salita. Il coronamento puo' assottigliarsi
   * oltre, perche' e' il suo mestiere; il corpo no.
   */
  minBandSide: 4,

  /**
   * Lato minimo perche' una rientranza diventi terrazza invece di restare uno
   * scalino.
   *
   * Sotto, l'anello scoperto e' largo un voxel e non ci si sta: verniciarlo di
   * pavimentazione mentirebbe, e — dato che la terrazza chiede a `emitRoofTech`
   * un parapetto — pagherebbe geometria di dettaglio per un bordo che nessuno
   * legge come praticabile.
   */
  terraceMinSide: 3,

  /**
   * Livello da cui la faccia d'accento comincia a essere luminosa.
   *
   * Sotto, resta la grammatica di superficie dell'uso: una casa appena costruita
   * non deve sembrare un'insegna, e sono la maggioranza degli edifici — quindi
   * e' anche la voce che tiene basso il conto delle corse di `emitLuminous`.
   */
  luminousFromLevel: 2,

  /**
   * Livello da cui la lama luminosa sale su tutta la fascia.
   *
   * Fra le due soglie si accende il solo voxel di sommita': una riga per piano,
   * che a distanza legge come marcapiano illuminato e non come colonna al neon.
   */
  luminousFullLevel: 4,
} as const;

/**
 * Le trasformazioni della regola di fascia, per nome.
 *
 * Sono la grammatica: una fascia si ricava da quella sotto applicando una di
 * queste, e non esiste altro modo di salire. Il podio, che prima era un ramo nel
 * ciclo, e' `keep` ripetuto; l'arretramento netto sopra di esso e' `shrink`.
 * Tenerle in tabella e non nel codice e' cio' che permette a un uso — e a una
 * tipologia, che sovrascrive il profilo — di avere un repertorio proprio senza
 * che `generate.ts` sappia chi sta chiedendo cosa.
 */
export const BAND_OP = {
  /** Ripete la fascia sotto: corpo continuo, e le fasce del basamento. */
  keep: 0,
  /** Rientranza centrata di un voxel per lato. */
  shrink: 1,
  /** Rientranza di un voxel su un lato solo: le terrazze asimmetriche. */
  shrinkOneSide: 2,
  /** Scarto laterale di un voxel a parita' di dimensione. */
  jog: 3,
  /** Allargamento di un voxel su un lato, dentro il riquadro. */
  grow: 4,
  /** Arretramento di due voxel su un lato: una terrazza in cui ci si sta. */
  setback: 5,
  /** Rientra due per lato e ricentra: e' il corpo sovrapposto, non un gradino. */
  stack: 6,
} as const;

export type BandOp = typeof BAND_OP[keyof typeof BAND_OP];

/**
 * Come una tipologia chiude la silhouette.
 *
 * Il coronamento era un booleano — piatto o no — e produceva due sole cime per
 * tutta la citta'. Qui ogni voce e' una geometria diversa applicata all'ultima
 * fascia del corpo, e la scelta arriva dal catalogo: sono i ripieghi per uso a
 * dare a ciascun uso la propria cima, e le righe con `minLevel` a distinguerla
 * per livello.
 */
export const CROWN_KIND = {
  /** Rientra di uno per lato e porta il dettaglio verticale. L'attuale default. */
  taper: 0,
  /** Non rientra affatto, basso e senza dettaglio: la copertura di un capannone. */
  flat: 1,
  /** Due gradini che rientrano: un cappello a gradoni, senza dettaglio. */
  stepped: 2,
  /** Rientra su un asse solo: la copertura lunga di un mercato o di un deposito. */
  ridge: 3,
  /** Rientra di due per lato e sale: la lanterna dei civici alti, con dettaglio. */
  lantern: 4,
} as const;

export type CrownKind = typeof CROWN_KIND[keyof typeof CROWN_KIND];

export interface LevelCaps {
  /** Lato minimo naturale; durante un upgrade bloccato puo' restare piu' stretto. */
  readonly minFootprint: number;
  /** Lato massimo dell'impronta, in voxel. */
  readonly maxFootprint: number;
  readonly minBands: number;
  readonly maxBands: number;
}

/**
 * Le impronte sono raddoppiate rispetto alla scala vecchia, le fasce **no**: un
 * livello 6 resta un edificio di otto piani, non di sedici. A raddoppiare e'
 * `bandHeight`, cioe' l'altezza del singolo piano — l'edificio resta alto
 * quanto prima e guadagna i voxel in mezzo, che e' esattamente il punto.
 *
 * **Le prime sette voci non si toccano**, e non per prudenza: sono la citta' che
 * gia' esiste, e cambiarle avrebbe rifatto la sagoma di ogni edificio basso —
 * cioe' della maggioranza — per una fase che parla dei pochi alti. Le sei nuove
 * raddoppiano le fasce, e un civico di livello massimo passa da una sessantina
 * di voxel a centocinquanta: la torre di punta **supera** il rilievo dell'isola
 * (`TERRAIN.maxHeight: 80`) invece di stargli sotto, che e' la differenza fra una
 * citta' sopra la collina e una citta' accanto.
 *
 * **L'impronta non cresce con loro, e questo rende la punta una matita.** A otto
 * voxel di lato e centocinquanta di altezza il rapporto e' circa venti a uno.
 * Non e' una svista ed e' l'unica forma disponibile: `MAX_FOOTPRINT` non puo'
 * salire senza `STREETS.pitch`, perche' un isolato stretto misura quattordici
 * colonne e un'impronta piu' larga non ci starebbe — cambiare la scala della
 * maglia stradale e' un'altra fase. Regge perche' i picchi sono **rari per
 * costruzione**: `skyline/` concede il livello massimo solo dove centro,
 * prossimita' al polo e isolato eletto coincidono, quindi sono guglie e non un
 * bosco di pali. A dare massa alle torri, qui e ora, e' l'aggregazione della
 * 4.4: una fila di livelli alti legge come un volume unico anche se ogni record
 * resta stretto.
 */
export const LEVEL_CAPS: readonly LevelCaps[] = [
  { minFootprint: 4, maxFootprint: 6, minBands: 1, maxBands: 2 },
  { minFootprint: 4, maxFootprint: 6, minBands: 2, maxBands: 3 },
  { minFootprint: 4, maxFootprint: 8, minBands: 3, maxBands: 4 },
  { minFootprint: 6, maxFootprint: 8, minBands: 4, maxBands: 5 },
  { minFootprint: 6, maxFootprint: 8, minBands: 5, maxBands: 6 },
  { minFootprint: 6, maxFootprint: 8, minBands: 6, maxBands: 7 },
  { minFootprint: 8, maxFootprint: 8, minBands: 7, maxBands: 8 },
  { minFootprint: 8, maxFootprint: 8, minBands: 8, maxBands: 9 },
  { minFootprint: 8, maxFootprint: 8, minBands: 9, maxBands: 10 },
  { minFootprint: 8, maxFootprint: 8, minBands: 10, maxBands: 11 },
  { minFootprint: 8, maxFootprint: 8, minBands: 11, maxBands: 12 },
  { minFootprint: 8, maxFootprint: 8, minBands: 13, maxBands: 15 },
  { minFootprint: 8, maxFootprint: 8, minBands: 16, maxBands: 19 },
];

/**
 * Distribuzione del livello iniziale, cumulata.
 *
 * Coda lunga di proposito: quasi tutto nasce al livello base e pochissimo piu'
 * su. Uno skyline e' fatto di molti volumi bassi e pochi picchi; una
 * distribuzione uniforme darebbe un altopiano, che a colpo d'occhio non si legge
 * come una citta'.
 *
 * **Ha una voce per livello, ed e' un requisito e non un'abitudine.**
 * `startLevel` scorre questo elenco: finche' era lungo `maxLevel + 1` per caso,
 * alzare `maxLevel` da solo avrebbe fatto leggere `undefined` — e `roll <
 * undefined` e' falso, quindi **ogni** edificio sarebbe nato al livello massimo.
 * Un test verifica ora la lunghezza insieme a quella di `LEVEL_CAPS`, invece di
 * lasciarla alla buona volonta' del prossimo cambio di scala.
 */
export const START_LEVEL_CDF: readonly number[] =
  [0.78, 0.94, 0.985, 0.997, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/**
 * Soglia di desiderabilita' per promuovere al livello indicato.
 *
 * Ripete l'ultima voce oltre la fine della scala, e non e' un ripiego: da li' in
 * su la desiderabilita' ha finito l'alfabeto e chi decide e' la gerarchia
 * verticale. Leggere `upgradeThreshold[level]` direttamente darebbe `undefined`,
 * e un confronto con `undefined` e' sempre falso — cioe' nessuna promozione, in
 * silenzio.
 */
export function upgradeThresholdOf(level: number): number {
  const scale = BUILDER.upgradeThreshold;
  return scale[Math.min(Math.max(level, 0), scale.length - 1)];
}

/** Proporzioni e colori di una classe. */
export interface ClassProfile {
  /**
   * Altezza di una fascia, estremi inclusi.
   *
   * Una fascia e' un piano. A quattro-sei voxel invece di due-tre, la cornice
   * sulla sua sommita' ha sotto di se' una parete vera: e' cosi' che nascono le
   * righe di piano che danno la scala all'edificio, che a due voxel erano la
   * meta' della fascia e non si leggevano come marcapiano.
   */
  readonly bandHeight: readonly [number, number];

  /**
   * Quanto la classe tende a restringersi salendo, in 0..1.
   *
   * A 1 ogni fascia rientra e l'edificio e' un gradone; a 0 le fasce si spostano
   * e sporgono senza rimpicciolire, e l'edificio resta un blocco irregolare.
   */
  readonly shrinkBias: number;

  /**
   * Trasformazioni provate quando il tiro cade sotto `shrinkBias`, in ordine.
   *
   * Si prende la prima che regge i vincoli, quindi l'ordine e' una preferenza e
   * non un'alternativa: mettere `setback` in testa significa "questo uso arretra
   * profondo quando puo', e ripiega su una rientranza normale quando non ci sta".
   * E' qui, e non in `TypologyShape`, perche' `typologyProfile` fonde gia' il
   * profilo dell'uso con quello della tipologia: una riga di catalogo puo'
   * sovrascrivere il repertorio senza una riga di plumbing in piu'.
   */
  readonly shrinkOps: readonly BandOp[];

  /** Trasformazioni provate quando il tiro cade sopra `shrinkBias`, in ordine. */
  readonly growOps: readonly BandOp[];

  /** Preferenza di impronta applicata al tiro comune, prima del clamp di livello. */
  readonly footprintBias: number;

  /** Corpo. */
  readonly body: number;
  /** Cornice: il voxel di sommita' di ogni fascia. */
  readonly bodyAlt: number;
  /** Faccia d'accento, e corpo intero quando l'accento sale di scala. */
  readonly accent: number;
  /** Coronamento. */
  readonly crown: number;
  /** Zoccolo a contatto col terreno. */
  readonly plinth: number;
  /** Unico dettaglio verticale sul tetto. */
  readonly roofProp: number;
  /** Altezza del dettaglio sul tetto. */
  readonly roofPropHeight: number;
  /**
   * Pavimentazione dell'anello scoperto lasciato da una rientranza.
   *
   * Una terrazza non e' una fascia in piu': e' la sommita' della fascia sotto
   * dove quella sopra non arriva, che la grammatica produce da sempre e che
   * finora restava verniciata come una parete qualunque.
   */
  readonly terrace: number;
  /** Verde del giardino pensile, quando la tipologia lo chiede. */
  readonly garden: number;
}

/**
 * I quattro usi urbani, indicizzati come `BUILDING_CLASS`.
 *
 * E' il colore e la proporzione *di base* di un uso: la tipologia (sotto) ne
 * sovrascrive quel che le serve. Un uso senza tipologia riconosciuta resta
 * comunque leggibile, ed e' cio' che tiene in piedi la citta' anche nelle
 * colonne che non esprimono niente di particolare.
 *
 * I colori escono tutti dai 32 slot esistenti: l'uniform `vec3[32]` e' un
 * invariante del progetto, e un edificio non e' una buona ragione per
 * consumarne uno nuovo.
 */
export const CLASS_PROFILE: readonly ClassProfile[] = [
  // residenziale — moduli terrazzati e scafi chiari, massa di fondo della citta'.
  {
    bandHeight: [4, 6],
    shrinkBias: 0.38,
    // Arretra profondo quando lo spazio c'e': e' l'uso che deve produrre le
    // terrazze abitabili, ed e' anche quello che ne ha piu' bisogno per non
    // leggersi come una fila di scatole.
    shrinkOps: [BAND_OP.setback, BAND_OP.shrink, BAND_OP.shrinkOneSide, BAND_OP.jog],
    growOps: [BAND_OP.jog, BAND_OP.grow, BAND_OP.shrinkOneSide],
    footprintBias: 2,
    body: PALETTE_SLOTS.concretePale,
    bodyAlt: PALETTE_SLOTS.glassDeep,
    accent: PALETTE_SLOTS.glass,
    crown: PALETTE_SLOTS.roofPale,
    plinth: PALETTE_SLOTS.metalDark,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 4,
    terrace: PALETTE_SLOTS.stone,
    garden: PALETTE_SLOTS.grass,
  },
  // commerciale — fronti caldi e bassi, insegne d'ottone, tetti larghi.
  {
    bandHeight: [4, 6],
    shrinkBias: 0.24,
    shrinkOps: [BAND_OP.shrink, BAND_OP.shrinkOneSide, BAND_OP.jog],
    growOps: [BAND_OP.jog, BAND_OP.grow, BAND_OP.keep],
    footprintBias: 2,
    body: PALETTE_SLOTS.brick,
    bodyAlt: PALETTE_SLOTS.brickLight,
    accent: PALETTE_SLOTS.metalBrass,
    crown: PALETTE_SLOTS.roofPale,
    plinth: PALETTE_SLOTS.stoneWarm,
    roofProp: PALETTE_SLOTS.metalGold,
    roofPropHeight: 4,
    terrace: PALETTE_SLOTS.stoneWarm,
    garden: PALETTE_SLOTS.grassLight,
  },
  // industriale — megastrutture compatte, corazze e apparati di dissipazione.
  {
    bandHeight: [4, 6],
    shrinkBias: 0.18,
    // `keep` in testa al ramo che sale: un capannone e' un corpo continuo, e
    // prima l'unico modo di ottenerlo era che tutte le candidate fallissero.
    shrinkOps: [BAND_OP.shrinkOneSide, BAND_OP.jog],
    growOps: [BAND_OP.keep, BAND_OP.jog, BAND_OP.grow],
    footprintBias: 2,
    body: PALETTE_SLOTS.stoneDeep,
    bodyAlt: PALETTE_SLOTS.metalDark,
    accent: PALETTE_SLOTS.metalRust,
    crown: PALETTE_SLOTS.metalDark,
    plinth: PALETTE_SLOTS.asphaltDark,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 6,
    terrace: PALETTE_SLOTS.asphalt,
    garden: PALETTE_SLOTS.grassDark,
  },
  // civico — guglie vetrate ed esoscheletri chiari, i landmark dello skyline.
  {
    bandHeight: [6, 8],
    shrinkBias: 0.62,
    // `stack` in testa: il civico e' l'uso che deve produrre corpi sovrapposti,
    // cioe' una torre che riparte piu' stretta invece di assottigliarsi.
    shrinkOps: [BAND_OP.stack, BAND_OP.shrink, BAND_OP.shrinkOneSide],
    growOps: [BAND_OP.jog, BAND_OP.shrink, BAND_OP.grow],
    footprintBias: 0,
    body: PALETTE_SLOTS.concreteWhite,
    bodyAlt: PALETTE_SLOTS.glassPale,
    // Era `glassDeep`, l'unico accento troppo scuro per emettere: da quando il
    // bagliore prende il colore dello slot, un blu profondo spegneva proprio la
    // classe che sullo skyline deve leggersi da piu' lontano.
    accent: PALETTE_SLOTS.glassPale,
    crown: PALETTE_SLOTS.roofWhite,
    plinth: PALETTE_SLOTS.concrete,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 6,
    terrace: PALETTE_SLOTS.concreteLight,
    garden: PALETTE_SLOTS.grassPale,
  },
];

// --- Catalogo delle tipologie ---------------------------------------------

/**
 * Come si legge una tipologia.
 *
 * Una tipologia e' *forma piu' condizioni*: sotto quali condizioni locali
 * quell'uso prende quella forma. Non e' un modello disegnato a mano — la
 * grammatica di `generate.ts` resta la stessa — ma un insieme di parametri che
 * la piegano, piu' tre interruttori strutturali (podio, corte, coronamento
 * piatto) che da soli producono silhouette non confondibili.
 *
 * Aggiungere una tipologia significa aggiungere una riga qui. Non c'e' codice
 * da scrivere da nessun'altra parte: la selezione in `typology.ts` e' generica,
 * e i suoi criteri sono i campi di questa struttura.
 */
export interface TypologyShape {
  /**
   * Fasce di base che riempiono l'impronta senza rientrare.
   *
   * Il podio e' cio' che distingue un podio commerciale con abitazioni sopra da
   * una torre qualunque: due fasce piene, poi un arretramento netto. Su un
   * edificio misto il podio prende anche il colore del secondo uso, e la
   * divisione delle funzioni si legge dal basamento.
   */
  readonly podiumBands: number;
  /** Svuota il cuore delle fasce larghe: e' l'isolato a corte. */
  readonly courtyard: boolean;
  /** Come si chiude la silhouette. Vedi `CROWN_KIND`. */
  readonly crownKind: CrownKind;
  /**
   * Pianta le rientranze scoperte invece di lasciarle pavimentate.
   *
   * Il bordo resta comunque terrazza — ci si affaccia, e il parapetto lo dice —
   * ma il cuore dell'anello diventa verde. Non e' una fascia in piu' ne' un
   * volume: e' lo stesso voxel di sommita', con un altro slot.
   */
  readonly roofGarden: boolean;
  /** Lato minimo dell'impronta imposto dalla tipologia. */
  readonly minFootprint: number;
  /** Lato massimo dell'impronta imposto dalla tipologia. */
  readonly maxFootprint: number;
}

export interface TypologyRequirement {
  /** Uso primario a cui la tipologia si applica. */
  readonly use: BuildingClass;
  /** Se presente, la tipologia vale solo su edifici misti con questo secondo uso. */
  readonly mixed?: BuildingClass;
  readonly specialization?: Specialization;
  /** Basta uno dei ruoli elencati fra i catalizzatori che coprono la colonna. */
  readonly roles?: readonly CatalystId[];
  /**
   * Mandati che concedono la tipologia: ne basta uno fra quelli che si sentono
   * sulla colonna.
   *
   * E' la forma piu' leggibile che una decisione puo' prendere. Un vettore
   * numerico sposta una soglia e a volte non scavalla niente; una riga concessa
   * da un mandato produce edifici che senza quella scelta non possono
   * comparire, e la differenza fra due partite si vede a colpo d'occhio.
   */
  readonly charter?: readonly CharterId[];
  readonly districts?: readonly DistrictId[];
  /** La colonna deve affacciare sul mare entro il raggio di ricerca del Builder. */
  readonly coastal?: boolean;
  readonly minLevel?: number;
  readonly minDensity?: number;
  readonly maxDensity?: number;
  readonly minWealth?: number;
  readonly minAccessibility?: number;
  readonly minSatisfaction?: number;
  readonly minIndustry?: number;
}

export interface TypologyDefinition extends TypologyRequirement {
  readonly id: string;
  readonly label: string;
  /**
   * Specificita' della tipologia.
   *
   * Fra tutte le tipologie che accettano una colonna vince quella con la
   * priorita' piu' alta, e a parita' vince la prima del catalogo. Non e' un
   * peso probabilistico: una scelta casuale renderebbe illeggibile la relazione
   * fra luogo e forma, che e' esattamente cio' che questa fase deve mostrare.
   */
  readonly priority: number;
  readonly shape: TypologyShape;
  /** Cio' che la tipologia sovrascrive del profilo dell'uso. */
  readonly profile: Partial<ClassProfile>;
}

/** Forma senza vincoli: la grammatica di `generate.ts` lasciata libera. */
export const DEFAULT_TYPOLOGY_SHAPE: TypologyShape = {
  podiumBands: 0,
  courtyard: false,
  crownKind: CROWN_KIND.taper,
  roofGarden: false,
  minFootprint: 4,
  maxFootprint: MAX_FOOTPRINT,
};

/**
 * Il catalogo, in ordine di lettura per uso.
 *
 * Ogni uso chiude con una riga a priorita' zero e senza condizioni: e' la forma
 * che quell'uso prende quando il luogo non dice niente di piu' preciso, e
 * garantisce che la selezione trovi sempre una risposta.
 */
export const TYPOLOGIES: readonly TypologyDefinition[] = [
  // --- residenziale --------------------------------------------------------
  {
    id: 'shophouse',
    label: 'Shophouse',
    use: 0,
    mixed: 1,
    // Nessuna condizione sul luogo: e' *la* forma dell'uso misto, quella che
    // vale ovunque un secondo uso attecchisca. Dove il podio commerciale
    // qualifica — densita' alta e livello alto — vince lui, che ha priorita'
    // maggiore; qui sotto resta la casa-bottega.
    priority: 3,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, crownKind: CROWN_KIND.flat, maxFootprint: 6 },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.12,
      body: PALETTE_SLOTS.brickLight,
      bodyAlt: PALETTE_SLOTS.wood,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stoneWarm,
    },
  },
  {
    id: 'commercialPodium',
    label: 'Podium block',
    use: 0,
    mixed: 1,
    minDensity: 0.4,
    minLevel: 2,
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 2, minFootprint: 6 },
    profile: {
      bandHeight: [4, 6],
      shrinkBias: 0.58,
      body: PALETTE_SLOTS.concretePale,
      bodyAlt: PALETTE_SLOTS.glassDeep,
      accent: PALETTE_SLOTS.glass,
    },
  },
  {
    id: 'courtyardBlock',
    label: 'Courtyard block',
    use: 0,
    minDensity: 0.3,
    minLevel: 2,
    priority: 2,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, courtyard: true, crownKind: CROWN_KIND.flat, minFootprint: 8 },
    profile: {
      bandHeight: [4, 6],
      shrinkBias: 0.08,
      body: PALETTE_SLOTS.concrete,
      bodyAlt: PALETTE_SLOTS.concreteLight,
      accent: PALETTE_SLOTS.brickLight,
    },
  },
  {
    id: 'towerBlock',
    label: 'Tower block',
    use: 0,
    minDensity: 0.55,
    minLevel: 4,
    priority: 4,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, maxFootprint: 6 },
    profile: { bandHeight: [6, 8], shrinkBias: 0.72 },
  },
  {
    id: 'skyTerraces',
    label: 'Sky terraces',
    use: 0,
    // `minWealth` non era usato da nessuna riga: la ricchezza entrava nella forma
    // solo come spinta continua su `shrinkBias`, che mezza fascia se la mangia.
    // Qui e' una soglia, e sopra di essa il quartiere cambia tipologia.
    minWealth: 0.6,
    minLevel: 5,
    // Sopra `towerBlock`, che a questo livello qualifica quasi sempre: dove c'e'
    // anche la ricchezza, la torre liscia diventa un gradone abitato.
    priority: 5,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      crownKind: CROWN_KIND.stepped,
      roofGarden: true,
      minFootprint: 7,
    },
    profile: {
      bandHeight: [4, 6],
      shrinkBias: 0.85,
      // Solo arretramenti profondi: e' l'unica riga che rinuncia del tutto alla
      // rientranza da un voxel, e infatti e' quella che deve produrre terrazze
      // su cui il giardino ci sta davvero.
      shrinkOps: [BAND_OP.setback, BAND_OP.stack, BAND_OP.shrink],
      growOps: [BAND_OP.setback, BAND_OP.jog, BAND_OP.shrinkOneSide],
      body: PALETTE_SLOTS.concreteWhite,
      bodyAlt: PALETTE_SLOTS.concretePale,
      accent: PALETTE_SLOTS.glass,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stone,
      garden: PALETTE_SLOTS.grassLight,
    },
  },
  // Le due righe concesse dai mandati stanno in fondo all'uso e a priorita' 6:
  // una decisione del giocatore e' l'affermazione piu' forte sulla forma di un
  // quartiere, e vince su cio' che le soglie locali avrebbero scelto da sole.
  {
    id: 'gardenHousing',
    label: 'Garden housing',
    use: 0,
    charter: ['communityGardens'],
    priority: 6,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      courtyard: true,
      crownKind: CROWN_KIND.flat,
      // Il mandato si chiama "orti di quartiere": era l'unica riga a portare il
      // verde nei soli slot di colore, e ora lo porta anche dove si sta.
      roofGarden: true,
      minFootprint: 7,
    },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.05,
      footprintBias: 2,
      body: PALETTE_SLOTS.brickLight,
      bodyAlt: PALETTE_SLOTS.wood,
      accent: PALETTE_SLOTS.grassLight,
      crown: PALETTE_SLOTS.grass,
      plinth: PALETTE_SLOTS.stoneWarm,
      roofPropHeight: 0,
      terrace: PALETTE_SLOTS.wood,
      garden: PALETTE_SLOTS.grassLight,
    },
  },
  {
    id: 'rationedBlock',
    label: 'Rationed block',
    use: 0,
    charter: ['rationing'],
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, maxFootprint: 5 },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.9,
      footprintBias: -2,
      body: PALETTE_SLOTS.concrete,
      bodyAlt: PALETTE_SLOTS.concrete,
      accent: PALETTE_SLOTS.concreteLight,
      crown: PALETTE_SLOTS.asphaltDark,
      plinth: PALETTE_SLOTS.stoneDark,
      roofPropHeight: 0,
    },
  },
  { id: 'terracedHousing', label: 'Terraced housing', use: 0, priority: 0, shape: DEFAULT_TYPOLOGY_SHAPE, profile: {} },

  // --- commerciale ---------------------------------------------------------
  {
    id: 'harborMarket',
    label: 'Harbor market',
    use: 1,
    roles: ['port'],
    coastal: true,
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, crownKind: CROWN_KIND.flat, minFootprint: 6 },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0.08,
      footprintBias: 4,
      body: PALETTE_SLOTS.wood,
      bodyAlt: PALETTE_SLOTS.brickLight,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  {
    id: 'officeTower',
    label: 'Office tower',
    use: 1,
    specialization: 'office',
    minLevel: 3,
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, minFootprint: 6 },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.78,
      body: PALETTE_SLOTS.glassDeep,
      bodyAlt: PALETTE_SLOTS.glassDark,
      accent: PALETTE_SLOTS.glassPale,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.stoneDark,
      roofPropHeight: 4,
    },
  },
  {
    id: 'hotel',
    label: 'Hotel',
    use: 1,
    specialization: 'tourism',
    minLevel: 2,
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 1, minFootprint: 6 },
    profile: {
      bandHeight: [4, 6],
      shrinkBias: 0.28,
      body: PALETTE_SLOTS.concreteWhite,
      bodyAlt: PALETTE_SLOTS.roofPale,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stoneWarm,
    },
  },
  {
    id: 'entertainmentHall',
    label: 'Entertainment hall',
    use: 1,
    specialization: 'entertainment',
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, minFootprint: 6 },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.18,
      body: PALETTE_SLOTS.brickDark,
      bodyAlt: PALETTE_SLOTS.brick,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.metalBrass,
      plinth: PALETTE_SLOTS.stoneDark,
    },
  },
  {
    id: 'marketArcade',
    label: 'Market arcade',
    use: 1,
    charter: ['leasedSquare', 'localShops'],
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, podiumBands: 2, minFootprint: 7 },
    profile: {
      bandHeight: [4, 5],
      shrinkBias: 0.3,
      footprintBias: 2,
      body: PALETTE_SLOTS.stoneWarm,
      bodyAlt: PALETTE_SLOTS.brick,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stone,
    },
  },
  {
    id: 'terraceArcade',
    label: 'Terrace arcade',
    use: 1,
    // `minSatisfaction` era l'altro criterio dichiarato e mai usato. Un fronte
    // commerciale con la gente che ci sta sopra ha senso dove la gente sta bene,
    // e non dove il commercio e' solo fitto.
    minSatisfaction: 0.5,
    minLevel: 3,
    // Sotto le tre righe di specializzazione, che restano piu' specifiche di
    // "qui si sta bene": un albergo resta un albergo anche in un quartiere felice.
    priority: 4,
    shape: {
      ...DEFAULT_TYPOLOGY_SHAPE,
      podiumBands: 2,
      crownKind: CROWN_KIND.stepped,
      roofGarden: true,
      minFootprint: 7,
    },
    profile: {
      bandHeight: [4, 5],
      shrinkBias: 0.7,
      footprintBias: 2,
      shrinkOps: [BAND_OP.setback, BAND_OP.shrinkOneSide, BAND_OP.shrink],
      growOps: [BAND_OP.keep, BAND_OP.jog, BAND_OP.grow],
      body: PALETTE_SLOTS.stone,
      bodyAlt: PALETTE_SLOTS.stoneWarm,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.roofPale,
      plinth: PALETTE_SLOTS.stoneDark,
      terrace: PALETTE_SLOTS.wood,
    },
  },
  { id: 'retailRow', label: 'Retail row', use: 1, priority: 0, shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, maxFootprint: 6 }, profile: { bandHeight: [4, 4] } },

  // --- industriale ---------------------------------------------------------
  {
    id: 'logisticsDepot',
    label: 'Logistics depot',
    use: 2,
    specialization: 'logistics',
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, minFootprint: 8 },
    profile: {
      bandHeight: [4, 4],
      shrinkBias: 0,
      footprintBias: 4,
      body: PALETTE_SLOTS.asphalt,
      bodyAlt: PALETTE_SLOTS.metalDark,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.asphaltShadow,
    },
  },
  {
    id: 'productionLoft',
    label: 'Production loft',
    use: 2,
    minLevel: 2,
    priority: 2,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, minFootprint: 6 },
    profile: { bandHeight: [4, 4], shrinkBias: 0.05, footprintBias: 4 },
  },
  {
    id: 'strippedYard',
    label: 'Stripped yard',
    use: 2,
    charter: ['soldReserves'],
    priority: 6,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat, minFootprint: 7 },
    profile: {
      bandHeight: [5, 6],
      shrinkBias: 0,
      footprintBias: 2,
      body: PALETTE_SLOTS.metalRust,
      bodyAlt: PALETTE_SLOTS.metalDark,
      accent: PALETTE_SLOTS.concrete,
      crown: PALETTE_SLOTS.asphaltDark,
      plinth: PALETTE_SLOTS.asphaltShadow,
      roofPropHeight: 0,
    },
  },
  {
    id: 'stackedWorks',
    label: 'Stacked works',
    use: 2,
    // `minIndustry` chiudeva la terna dei criteri dichiarati e mai usati. Dove
    // l'impatto industriale e' alto la fabbrica smette di allargarsi — non c'e'
    // piu' isolato — e comincia a impilarsi.
    minIndustry: 0.5,
    minLevel: 3,
    // Sopra `productionLoft` (2), sotto `logisticsDepot` (5): un polo logistico
    // resta un capannone anche in mezzo alle ciminiere.
    priority: 3,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.ridge, minFootprint: 7 },
    profile: {
      bandHeight: [4, 5],
      shrinkBias: 0.5,
      footprintBias: 4,
      shrinkOps: [BAND_OP.stack, BAND_OP.shrinkOneSide],
      growOps: [BAND_OP.keep, BAND_OP.keep, BAND_OP.jog],
      body: PALETTE_SLOTS.stoneDeep,
      bodyAlt: PALETTE_SLOTS.metalRust,
      accent: PALETTE_SLOTS.metalBrass,
      crown: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.asphaltShadow,
      roofPropHeight: 6,
    },
  },
  {
    id: 'industrialYard',
    label: 'Industrial yard',
    use: 2,
    priority: 0,
    // Il ripiego di ogni uso porta la cima che distingue quell'uso da lontano:
    // e' la sola forma in cui "coronamenti per uso" resta una riga di tabella e
    // non un ramo dentro la grammatica. Qui una copertura lunga, da capannone.
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.ridge },
    profile: {},
  },

  // --- civico --------------------------------------------------------------
  {
    id: 'universityLab',
    label: 'University lab',
    use: 3,
    specialization: 'research',
    minLevel: 2,
    priority: 5,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, courtyard: true, crownKind: CROWN_KIND.flat, minFootprint: 8 },
    profile: {
      bandHeight: [6, 6],
      shrinkBias: 0.12,
      body: PALETTE_SLOTS.concreteWhite,
      bodyAlt: PALETTE_SLOTS.glassPale,
      accent: PALETTE_SLOTS.glassDeep,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stone,
    },
  },
  {
    id: 'culturalPavilion',
    label: 'Cultural pavilion',
    use: 3,
    roles: ['monument', 'park'],
    maxDensity: 0.6,
    priority: 4,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, minFootprint: 6 },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.34,
      body: PALETTE_SLOTS.stoneWarm,
      bodyAlt: PALETTE_SLOTS.concreteWhite,
      accent: PALETTE_SLOTS.metalGold,
      crown: PALETTE_SLOTS.roofWhite,
      plinth: PALETTE_SLOTS.stone,
      roofProp: PALETTE_SLOTS.metalGold,
    },
  },
  {
    id: 'civicLantern',
    label: 'Civic lantern',
    use: 3,
    // L'unica condizione e' il livello, e non e' una condizione *sul luogo*:
    // `demandsPlace` non lo elenca, quindi la riga vale anche dove il profilo
    // non c'e' — un catalizzatore piazzato a mano, una fixture di scena. E' cosi'
    // che "coronamenti per livello" resta una riga e non un ramo.
    minLevel: 4,
    // Sopra il solo ripiego: `culturalPavilion` (4) e `universityLab` (5) restano
    // piu' specifici, perche' dicono qualcosa del luogo e non dell'edificio.
    priority: 1,
    shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.lantern, minFootprint: 6 },
    profile: {
      bandHeight: [6, 8],
      shrinkBias: 0.68,
      shrinkOps: [BAND_OP.stack, BAND_OP.shrink, BAND_OP.setback],
      growOps: [BAND_OP.shrink, BAND_OP.jog, BAND_OP.grow],
      roofProp: PALETTE_SLOTS.metalGold,
      roofPropHeight: 6,
    },
  },
  { id: 'civicSpire', label: 'Civic spire', use: 3, priority: 0, shape: DEFAULT_TYPOLOGY_SHAPE, profile: {} },
];

export type TypologyId = (typeof TYPOLOGIES)[number]['id'];

const TYPOLOGY_BY_ID = new Map<string, TypologyDefinition>(
  TYPOLOGIES.map((entry) => [entry.id, entry]),
);

export function typologyById(id: string): TypologyDefinition | null {
  return TYPOLOGY_BY_ID.get(id) ?? null;
}
