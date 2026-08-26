import { BIOME, TERRAIN } from '../terrain/config';
import { STREETS } from '../streets/config';

/**
 * Unica fonte dei numeri dei lotti agricoli.
 *
 * Sta accanto a `terrain/config.ts` e `streets/config.ts` nella tabella «Dove
 * stanno i numeri» di `AGENTS.md`: un dominio, un file.
 *
 * **Cosa non c'e' qui.** Quanto rende un campo e quante braccia vuole stanno in
 * `sim/balance.ts`, perche' sono bilanciamento e non geografia. Qui c'e' solo
 * dove un lotto puo' stare e come e' fatto.
 */
/**
 * Lato di un lotto, in colonne.
 *
 * Multiplo di `STREETS.align` — cioe' del cubo di terreno — per la stessa
 * ragione dei lotti edificati: un bordo a meta' cubo troverebbe sotto la propria
 * impronta due quote diverse dove il terreno e' piatto.
 *
 * Dodici e non ventidue (il passo di un isolato): un campo non e' un isolato e
 * non deve leggersi come uno. A questa scala ne stanno tre in fila nello spazio
 * di due isolati, ed e' la grana che fa leggere la campagna come campagna invece
 * che come lotti vuoti in attesa.
 *
 * **Non si rimpicciolisce per far stare piu' campi sull'isola**, ed e' stato
 * provato: sotto dodici il reticolo degli alberi di `orchard.ts` degrada a un
 * nodo solo — `TREE_PITCH` vale 5, dedotto dalla chioma — e un frutteto con un
 * albero non e' un frutteto. La capienza alimentare si allarga con
 * `minArableShare`, che e' la stessa terra recuperata senza toccare la grana.
 */
const PLOT_SIDE = 12;

export const FARMS = {
  plotSide: PLOT_SIDE,

  /**
   * Ogni quante colonne corre un solco.
   *
   * Due, e per due ragioni che coincidono. **A schermo**: file attaccate sono una
   * campitura, e il vuoto fra una e l'altra e' cio' che le fa leggere *come*
   * file. **Nel budget**: un solco costa due prismi, cioe' dieci quad, e a passo
   * uno un lotto da 12x12 ne chiederebbe 1440 in un chunk solo. A passo due
   * scendono a 720, che e' meno di quanto costano quattro torri vere.
   */
  rowPitch: 2,

  /**
   * Passo del reticolo su cui si cercano i lotti, in colonne.
   *
   * Vale il lato: due lotti non si sovrappongono mai per costruzione, e non c'e'
   * niente da controllare fra l'uno e l'altro.
   */
  lattice: PLOT_SIDE,

  /** Pendenza oltre la quale non si coltiva. E' la stessa che regge un edificio. */
  maxSlope: TERRAIN.buildableMaxSlope,

  /**
   * Frazione delle colonne del quadrato che devono essere coltivabili.
   *
   * **Era uno, ed e' li' che finiva il cibo dell'isola.** Il rifiuto era del
   * quadrato intero alla prima colonna sterile o ripida — un campo bucato non e'
   * un campo — e su una costa frastagliata quella regola non scarta i posti
   * sbagliati, scarta quelli **quasi** giusti. Misurato sull'isola tarata: le
   * colonne coltivabili sono 31.900, cioe' terra per 443 case, ma i quadrati
   * interamente puliti ne sfamavano **214**, contro una domanda che a citta'
   * matura sta fra 360 e 455 di cibo per tick. Piu' della meta' della campagna
   * possibile veniva buttata via da un masso per volta.
   *
   * A nove decimi i quadrati buoni passano da 107 a 144 e le case sfamate da 214
   * a 288. Il divario si chiude quasi, e resta aperto quel tanto che basta
   * perche' la torre idroponica abbia ancora un mestiere — che e' la curva
   * dichiarata in `sim/farms.ts`: quando l'isola finisce, il cibo sale con tutto
   * il resto.
   *
   * **Non costa niente a schermo.** Un solco e' un marcatore di copertura, e la
   * copertura non si vede sui biomi senza erba: le colonne tollerate sono
   * esattamente quelle su cui il solco era gia' invisibile. Il campo continua a
   * leggersi come un quadrato regolare, con un masso in mezzo.
   *
   * Resta una **soglia alta** di proposito: dieci colonne su centoquarantaquattro
   * sono un affioramento, non un pendio. Sotto, il lotto smetterebbe di essere un
   * campo e diventerebbe una campitura su terreno che non lo regge.
   */
  minArableShare: 0.9,

  /**
   * I biomi che reggono un lotto.
   *
   * Pianura, bosco e collina: sono i tre con dell'erba in superficie, cioe' i
   * tre per cui `GROUND_COVER.cropTone` porta una tinta. Spiaggia e roccia no —
   * non ci cresce niente e il solco resterebbe invisibile — e l'oceano nemmeno
   * per ragioni che non serve spiegare.
   */
  fertile: [BIOME.plain, BIOME.forest, BIOME.hill] as readonly number[],

  /**
   * Raggio entro cui si contano gli edifici per dire «qui e' ancora campagna».
   *
   * E' la stessa domanda che `skyline/tiers.ts` fa per decidere la fascia di una
   * colonna, posta pero' al contrario: li' serve a sapere quanto si e' al centro,
   * qui quanto si e' fuori.
   */
  edgeRadius: 20,

  /**
   * Edifici ammessi dentro `edgeRadius` perche' la colonna sia ancora campagna.
   *
   * Non zero: un campo attaccato al primo isolato e' esattamente l'immagine che
   * serve — la citta' che confina con cio' che la nutre — e a zero i lotti
   * nascerebbero solo in mezzo al nulla, dove non li guarda nessuno.
   */
  edgeMaxNeighbours: 6,

  /**
   * Frazione delle colonne del lotto che devono restare libere.
   *
   * Sotto questa soglia il lotto si ritira: la citta' se l'e' mangiato. Non e'
   * uno a uno con «una colonna presa» perche' un angolo occupato non toglie un
   * campo, e ritirarlo al primo edificio farebbe sparire la campagna appena la
   * citta' la sfiora.
   */
  minFreeShare: 0.7,

  /**
   * Il tetto per passata **non sta qui**: e' `PLOTS_PER_PASS`, in `farmDriver.ts`.
   *
   * Non e' geografia. E' il ritmo del costruttore letto dall'altra parte — quanti
   * residenziali un'infornata sa produrre — diviso per cio' che un campo sfama,
   * cioe' due numeri che stanno in `BUILDER` e in `BALANCE`. Scritto a mano qui
   * era `6`, mentre la sua stessa derivazione ne dava `12`: il conto era nel
   * commento e nessuno lo rifaceva. Adesso e' un prodotto, e vive dove i due
   * vocabolari gia' si toccano.
   */

  /**
   * Tick fra una passata e l'altra.
   *
   * Quattro secondi a dieci tick al secondo. **Erano venti**, per tenere la
   * campagna lo sfondo lento della citta', e il ritmo di comparsa resta quello:
   * a citta' sfamata `missingPlotsOf` vale zero e la passata non pianta niente,
   * quindi la cadenza fitta non si vede. Si sente solo quando c'e' fame, che e'
   * esattamente quando la campagna deve rincorrere invece di aspettare venti
   * secondi per due lotti.
   */
  ticksPerPass: 40,

  /**
   * Candidati sondati in una passata prima di rinunciare a piantare.
   *
   * Il driver cerca a spirale e riparte da dove si era fermato: senza un tetto,
   * una partita senza terra fertile scandirebbe tutto il reticolo a ogni
   * passata. Con questo, il costo di una passata e' fisso comunque sia grande
   * l'isola.
   *
   * **Il numero e' un budget di colonne, non di candidati**, ed e' per questo che
   * si ricava dal lato: `planPlot` sonda `plotSide²` colonne per candidato,
   * quindi il prodotto dei due e' la scansione che una passata paga davvero.
   * Scritto come letterale, rimpicciolire il lotto avrebbe ridotto in silenzio la
   * scansione proprio quando i quadrati da provare diventano piu' numerosi.
   */
  searchDepth: Math.round((96 * 12 * 12) / (PLOT_SIDE * PLOT_SIDE)),

  /**
   * Anelli della spirale, cioe' fin dove si cerca terra da coltivare.
   *
   * Devono coprire un quadrato piu' largo dell'isola tarata (512) e dei suoi
   * settori costieri: oltre non c'e' niente da sondare, e senza un tetto il
   * cursore continuerebbe ad allargarsi sull'oceano per tutta la partita.
   *
   * **Ricavati dal passo e non scritti a mano.** Ventidue e' cio' che a passo
   * dodici copre esattamente quel quadrato, ed e' il valore che questa formula
   * restituisce oggi; scritto a mano, un passo piu' stretto avrebbe lasciato
   * fuori dalla campagna la corona esterna dell'isola senza che nulla lo dicesse.
   *
   * Vale **a spirale centrata sull'isola**: e' cio' che il numero ha sempre
   * dichiarato, e finche' il centro stava sull'origine del mondo ne copriva un
   * quadrante solo.
   */
  searchRings: Math.ceil((540 / PLOT_SIDE - 1) / 2),

  /**
   * Quanti candidati sondare attorno a ogni serra prima di ripiegare sul giro
   * dell'isola.
   *
   * La serra e' la cintura fertile: i lotti nascono per primi nel suo raggio, e
   * questo numero e' il budget di quella ricerca. Vale quanto i due anelli piu'
   * stretti della spirale — fino a un paio di lotti in fila — perche' la serra
   * non deve reclutare l'intera campagna: dice *dove cominciare*, non *dove
   * finire*.
   */
  fertileSearchDepth: 24,

  /** Sale del seme dei lotti: li tiene scorrelati da alberi, copertura e stile. */
  salt: 0x5f_a4_11_03,
} as const;

/** Il lato di un lotto e' un multiplo del cubo di terreno: si verifica, non si spera. */
export const FARM_PLOT_ALIGNED = FARMS.plotSide % STREETS.align === 0;
