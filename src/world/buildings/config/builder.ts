import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { TERRAIN } from '../../terrain/config';
import {
  SCALE,
  coastalRadiusOf,
  maxDirtyChunksPerBuildingOf,
  segmentSideOf,
} from '../../scale';

/**
 * Ritmo e tetti della costruzione: quanto in fretta la citta' cresce.
 *
 * Vale qui la stessa regola di `terrain/config.ts` e `sim/balance.ts`: nessun
 * altro file di `src/world/buildings/` contiene una soglia, una cadenza o un
 * indice di palette. La ragione non e' l'ordine ma la separazione dei domini —
 * `balance.ts` descrive le regole della simulazione, e se un edificio viene su
 * troppo alto o troppo spesso la risposta sta in questa cartella, mai in quello.
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
   * nascere. A 6 il ritmo scende a cinque al secondo, e a dieci a due — la
   * citta' cresce ancora di continuo, ma l'isola si riempie in decine di minuti
   * invece che in un paio, il tempo di posa di un edificio resta visibile e il
   * giocatore ha spazio per decidere dove mettere il catalizzatore successivo.
   *
   * **Il rallentamento e' anche una manopola di frame rate.** Meno edifici per
   * secondo significa meno chunk da meshare e meno draw call, che e' il costo
   * che `RenderQuality` non puo' abbattere scalando la risoluzione.
   */
  ticksPerBuild: 10,

  /**
   * Edifici accettati al massimo per infornata.
   *
   * Il ritmo si regola su `ticksPerBuild`, non qui: allargare l'infornata
   * farebbe comparire piu' edifici *nello stesso istante*, che e' proprio la
   * lettura a scatti che il sovra-prelievo qui sotto esiste per evitare. Due e
   * non tre, per la stessa ragione di `ticksPerBuild`: meno volume che appare
   * insieme, meno chunk sporchi nello stesso frame.
   */
  sitesPerBuild: 2,

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

  /** Tick fra una passata di declino e la successiva. */
  ticksPerDecay: 10,

  /**
   * Record esaminati in una passata di declino.
   *
   * Lo stesso numero della promozione, e per la stessa ragione: e' una finestra
   * a cursore sul costruito, non una classifica di tutta la citta'. Chi sta
   * peggio ricompare finche' resta scoperto, quindi la finestra non gli
   * impedisce di essere raggiunto — gli impedisce solo di esserlo *subito*, che
   * e' esattamente il ritmo che il declino deve avere.
   */
  decaysPerPass: 64,

  /**
   * Edifici abbandonati al massimo per passata.
   *
   * Uno. **Non e' una manopola di prestazione**: un cantiere di sgombero costa
   * poco e la coda di comparsa lo assorbirebbe volentieri. E' una manopola di
   * leggibilita' — un isolato intero che sparisce nello stesso secondo non si
   * legge come una conseguenza, si legge come un guasto, e il giocatore non
   * saprebbe quale dei suoi ultimi gesti guardare.
   */
  abandonPerPass: 1,

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
   * **E' la manopola verticale della scala**, importata da `src/world/scale.ts`.
   * Alzarla da sola non spostava niente finche' i numeri accoppiati erano scritti
   * a mano: ora `LEVEL_CAPS`, `START_LEVEL_CDF`, `maxDirtyChunksPerBuilding` e
   * `GRAMMAR.minBandSide` derivano da qui, e `src/world/skyline/` continua a
   * decidere fin dove una colonna puo' salire — senza una quota ammessa per
   * colonna, venti livelli su un campo saturo darebbero un altopiano e non uno
   * skyline.
   */
  maxLevel: SCALE.maxLevel,

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
   * che sfora viene scartato — in silenzio, perche' non e' un errore. **Deriva
   * dalla torre piu' alta che `maxLevel` sa produrre** (`maxDirtyChunksPerBuildingOf`),
   * non da un numero ricordato: due colonne di chunk per asse, i piani che la
   * torre attraversa piu' i due di bordo, e un margine per la fondazione a
   * cavallo di una cucitura. Non si taglia in quota per rientrare: `sliceStamps`
   * dichiara apposta di tagliare solo in pianta, perche' una cucitura orizzontale
   * a meta' di una torre si vede.
   */
  maxDirtyChunksPerBuilding: maxDirtyChunksPerBuildingOf(),

  /**
   * Lato oltre il quale uno stamp compare a ritagli invece che in un colpo solo.
   *
   * **Le strutture grandi si spezzano, non si esentano.** Un molo lungo ventisei
   * colonne attraversa piu' piani di chunk di una torre alta: scriverlo intero li
   * marca tutti nello stesso frame. **Deriva dal modulo** (`segmentSideOf`): deve
   * reggere `MAX_FOOTPRINT + maxOverhang` senza spezzare un edificio normale.
   *
   * Non e' una manopola da girare per far entrare una ricetta: se un ritaglio
   * non ci sta, e' questo numero a doversi abbassare.
   */
  segmentSide: segmentSideOf(),

  /**
   * Cubi scritti per frame per struttura: la crescita e' voxel-per-voxel.
   *
   * **E' la durata della posa, non il suo costo.** Il tetto di lavoro per frame
   * lo fissa `maxGrowing * voxelsPerFrame`, e la meshatura a valle ha gia' un
   * budget in millisecondi suo (`ChunkRenderer.update`): questo numero non
   * compra frame rate, decide quanto un edificio ci mette a salire.
   *
   * **Novantasei era un pop.** Il budget era stato alzato con la scala del voxel
   * per tenere fermo *quanto costa* un edificio, e l'altra meta' della frase —
   * «quanto ci mette a comparire» — era rimasta senza qualcuno che la guardasse.
   * Misurata sugli stamp veri, una sagoma di livello zero sta fra i 290 e i 330
   * voxel solidi ed e' il 78% di quelle che nascono (`START_LEVEL_CDF`): a
   * novantasei erano tre frame, cioe' comparire, non salire.
   *
   * A ventiquattro la stessa casa impiegava circa un quinto di secondo e una
   * torre di livello massimo fra i due e i tre secondi: la posa era ancora un
   * pop, non una salita. A dodici — la meta' — la casa impiega circa due quinti
   * di secondo e la torre fra i quattro e i sei secondi. La costruzione si
   * legge come un lavoro in corso, e resta proporzionata al volume invece di
   * durare uguale per tutti.
   *
   * **Si paga in rimeshature, ed e' li' che il numero trova il fondo.** Un
   * volume spalmato su quattro volte i frame sporca i propri chunk quattro volte
   * piu' spesso, e ogni passata e' un job di meshing. Scendere ancora — a dieci,
   * dove un capannone di livello massimo prenderebbe sette secondi — terrebbe
   * occupato per tutto quel tempo uno dei dodici posti di `maxGrowing`, e a
   * rallentare sarebbe la passata di upgrade, non l'animazione.
   *
   * A sei — tre quarti di otto — la casa impiega poco piu' di un quarto di
   * secondo e la torre fra i cinque e gli otto: la posa resta proporzionata al
   * volume, e ogni frame sporca un quarto di chunk in meno.
   */
  voxelsPerFrame: 6,

  /**
   * Edifici che possono crescere contemporaneamente.
   *
   * La coda non e' un limite di memoria ma di frame: ogni edificio in crescita
   * sporca i suoi chunk una volta per fascia, e sporcare cento chunk nello
   * stesso frame e' esattamente il picco che fa cadere il fps sotto la soglia.
   * Dodici invece di venti dimezza quasi quel picco, e con la cadenza a dieci
   * tick la coda resta comunque abbastanza profonda da non fermare la crescita.
   */
  maxGrowing: 12,

  /**
   * Voxel di superficie urbana scritti per frame.
   *
   * Contava celle finche' una cella valeva un voxel. Dalla 4.2 una cella puo'
   * essere un molo alto sei, e il budget deve restare quello che e': un tetto
   * sul lavoro per frame, non sul numero di colonne toccate. Segue `maxGrowing`
   * nello stesso taglio: meno superficie per frame, meno rimeshature.
   */
  surfaceVoxelsPerFrame: 128,

  /**
   * Quota sopra il terreno bonificata da tronchi e chiome.
   *
   * Deve stare sopra `treeTop` della specie piu' alta — la conifera arriva a
   * diciotto voxel dal suolo — altrimenti un lotto liberato conserva la punta
   * della chioma che stava sopra, sospesa a mezz'aria sopra il tetto nuovo.
   */
  decorClearanceHeight: 20,

  /**
   * Colonne di aria che un lotto tiene davanti e dietro, sui lati che non sono
   * la sua fila.
   *
   * **E' il numero che separa un isolato da una massa.** Senza, il tessuto si
   * saldava su tutti e quattro i lati: misurato su un'isola cresciuta, il 57%
   * delle colonne di perimetro confinava con un altro edificio e il 99% degli
   * edifici aveva almeno un vicino a contatto. Metà di quel contatto era in
   * profondita', cioe' due file affacciate su strade opposte che si toccavano
   * sul retro — ed e' quella meta' che seppellisce la strada, perche' toglie
   * l'unico vuoto da cui la si vedrebbe.
   *
   * Un cubo di terreno, come `CLUSTER.maxSnap` e per la ragione opposta: quel
   * numero chiude i solchi da un voxel perche' a distanza di gioco leggono come
   * una crepa e non come una separazione, e questo per la stessa misura apre un
   * vuoto che invece si legge. Uno solo ricadrebbe esattamente nella crepa che
   * l'altro numero esiste per togliere.
   *
   * **Non e' un divieto**: `placeLot` lo chiede nelle prime due passate e
   * rinuncia nella terza. Dove l'area e' satura si costruisce lo stesso, ed e'
   * corretto — e' cosi' che un centro diventa continuo mentre la periferia
   * resta fatta di case staccate.
   */
  backSetback: TERRAIN.cellSize,

  /** Raggio Manhattan della piazzola che identifica un catalizzatore. */
  catalystPlazaRadius: 4,

  /**
   * Colore del recinto attorno a un riquadro che si sta sgomberando.
   *
   * **Un cantiere deve leggersi come un cantiere**, non come un buco. Fra
   * l'apertura e la struttura passano diverse passate — gli edifici cadono uno
   * per volta, a budget — e senza un segno il giocatore vede solo case che
   * spariscono senza sapere perche'. Il ruggine e' il colore piu' lontano
   * dall'asfalto del suolo pubblico che lo sostituira': il passaggio da recinto a
   * grembiule si vede, ed e' il modo in cui il cantiere dichiara di aver finito.
   *
   * Stava in `LANDMARK` finche' a sventrare c'erano solo i landmark. Il cantiere
   * e' ora di `clearanceSite.ts` e lo usano anche le arcologie: il recinto e' lo
   * stesso segnale, e due colori direbbero che sono due cose diverse.
   */
  fencePalette: PALETTE_SLOTS.metalRust,

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
   * sul porto da un mercato qualunque. **Deriva dal modulo** (`coastalRadiusOf`):
   * l'impronta massima piu' tre cubi, perche' il mercato deve vedere l'acqua,
   * non sfiorarla.
   */
  coastalRadius: coastalRadiusOf(),

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

    /**
     * Tetto a cui le due spinte qui sopra possono portare `shrinkBias`.
     *
     * **Serviva perche' le due spinte sommate chiudevano un ramo intero.** Una
     * torre a blocco dichiara 0.72 e un quartiere ricco e soddisfatto ne aggiunge
     * 0.34: il tiro cadeva sotto la soglia *sempre*, quindi `growOps` — quattro
     * voci su sette — non veniva mai nemmeno costruito. E' lo stesso difetto che
     * `preferredStart` ha corretto dentro un ramo, ripresentato fra i due rami: un
     * repertorio che non si pesca mai e' un repertorio che non esiste.
     *
     * Nove decimi e non uno: la voce piu' alta del catalogo e' 0.9
     * (`rationedBlock`), quindi il tetto non tocca nessuna preferenza dichiarata —
     * taglia solo la spinta locale, che e' cio' che deve fare.
     */
    maxShrinkBias: 0.9,
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
