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
export const FARMS = {
  /**
   * Lato di un lotto, in colonne.
   *
   * Multiplo di `STREETS.align` — cioe' del cubo di terreno — per la stessa
   * ragione dei lotti edificati: un bordo a meta' cubo troverebbe sotto la
   * propria impronta due quote diverse dove il terreno e' piatto.
   *
   * Dodici e non ventidue (il passo di un isolato): un campo non e' un isolato
   * e non deve leggersi come uno. A questa scala ne stanno tre in fila nello
   * spazio di due isolati, ed e' la grana che fa leggere la campagna come
   * campagna invece che come lotti vuoti in attesa.
   */
  plotSide: 12,

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
  lattice: 12,

  /** Pendenza oltre la quale non si coltiva. E' la stessa che regge un edificio. */
  maxSlope: TERRAIN.buildableMaxSlope,

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
   * Lotti piantati al massimo in una passata.
   *
   * **E' un tetto, non il ritmo**, e la differenza e' tutta la meccanica. Quanti
   * piantarne lo dice `missingPlotsOf`: il driver chiede alla simulazione quanti
   * campi mancano e ne pianta quel numero, fin qui. Finche' questo numero era
   * anche il ritmo — due lotti, sempre, comunque andasse — l'offerta era una
   * costante contro una domanda che cresce con la citta', e le due divergevano
   * dal primo isolato.
   *
   * Sei perche' e' il caso peggiore che il costruttore sa produrre: tre edifici
   * ogni sei tick (`BUILDER.sitesPerBuild`, `BUILDER.ticksPerBuild`), un campo
   * ogni due residenziali, e questa cadenza. Piu' alto non servirebbe a niente —
   * il deficit taglia comunque prima — e farebbe comparire mezza campagna in un
   * istante.
   */
  plotsPerPass: 6,

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
   */
  searchDepth: 96,

  /**
   * Anelli della spirale, cioe' fin dove si cerca terra da coltivare.
   *
   * Ventidue anelli a passo dodici coprono un quadrato di lato 540, che e' piu'
   * dell'isola tarata (512) e dei suoi settori costieri. Oltre non c'e' niente
   * da sondare, e senza un tetto il cursore continuerebbe ad allargarsi
   * sull'oceano per tutta la partita.
   *
   * Vale **a spirale centrata sull'isola**: e' cio' che il numero ha sempre
   * dichiarato, e finche' il centro stava sull'origine del mondo ne copriva un
   * quadrante solo.
   */
  searchRings: 22,

  /** Sale del seme dei lotti: li tiene scorrelati da alberi, copertura e stile. */
  salt: 0x5f_a4_11_03,
} as const;

/** Il lato di un lotto e' un multiplo del cubo di terreno: si verifica, non si spera. */
export const FARM_PLOT_ALIGNED = FARMS.plotSide % STREETS.align === 0;
