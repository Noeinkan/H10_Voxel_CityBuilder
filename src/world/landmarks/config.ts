import type { CatalystId } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { SURFACE_KIND, WATER_CLASS, type WaterClass } from '../visualBlock';
import { PART, box, type Part } from './parts';
import { tree } from './vocab';
import { POWER, SCHOOL } from './recipes/growth';
import { LIGHTHOUSE, RADIO } from './recipes/connections';
import { STADIUM, THEATRE } from './recipes/identity';
import { MARINA } from './recipes/identityMarina';
import { AIRPORT, FERRY, PORT } from './recipes/logistics';
import { TRANSPORT } from './recipes/station';
import { FACTORY, GREENHOUSE, MARKET } from './recipes/production';
import { PARK } from './recipes/park';
import { CATHEDRAL, MONUMENT, MUSEUM, UNIVERSITY } from './recipes/civic';

/**
 * Unica fonte di verita' dei numeri e delle forme dei landmark.
 *
 * Vale la stessa regola di `terrain/config.ts`, `streets/config.ts` e
 * `buildings/config.ts`: nessun altro file di `src/world/landmarks/` contiene
 * una quota, un ingombro o un indice di palette.
 *
 * **Perche' esiste questo dominio.** Fino a qui un catalizzatore era un rombo di
 * asfalto di raggio quattro con un voxel colorato al centro — identico per tutti
 * e otto i ruoli. Il porto in particolare non esisteva affatto: quello che si
 * vedeva sull'acqua era la carreggiata dell'isolato costiero, non una banchina.
 * Un ruolo che promette «connette l'isola al mondo» deve avere una forma che lo
 * dica prima di qualunque tooltip.
 *
 * **Una ricetta e' una tabella, non un generatore.** Le parti sono dati
 * (`parts.ts`), quindi un test puo' misurarne l'ingombro senza disegnarle e
 * `generateLandmark` puo' ruotare una ricetta intera trasformando numeri.
 * Aggiungere un landmark e' aggiungere una riga: non c'e' codice da scrivere
 * altrove.
 *
 * **Gli stadi sono cumulativi.** Le parti di uno stadio si **aggiungono** a
 * quelle degli stadi precedenti, e l'ingombro dichiarato e' quello *finale*,
 * riservato fin dal primo stadio. Due conseguenze, entrambe volute: la crescita
 * non puo' mai restare bloccata a meta' da un edificio spuntato accanto, e la
 * cancellazione della sagoma vecchia durante un avanzamento e' un no-op per
 * costruzione, perche' lo stadio nuovo copre sempre quello vecchio.
 */

export const LANDMARK = {
  /**
   * Edifici che una passata di avanzamento puo' promuovere.
   *
   * I landmark sono unita', non migliaia: qui non c'e' un cursore da far
   * avanzare come in `upgradePass`, e uno per passata basta a non concentrare
   * due comparse grosse nello stesso frame.
   */
  stagesPerPass: 1,

  // Qui stava `maxDirtyChunks: 48`, il tetto di chunk sporchi alzato apposta per
  // i landmark. Non c'e' piu', ed e' la 4.5 ad averlo tolto: il suo stesso
  // commento diceva che una ricetta troppo grossa «andra' spezzata in segmenti —
  // non esentata», e adesso lo e'. `sliceStamps` la fa comparire a ritagli, e il
  // tetto torna a essere quello di ogni altra struttura,
  // `BUILDER.maxDirtyChunksPerBuilding`, senza eccezioni da mantenere.

  /**
   * Colore del grembiule fuori dal riquadro della struttura.
   *
   * Resta l'asfalto di prima: il grembiule non e' il landmark, e' il suolo
   * pubblico che gli sta attorno. A cambiare e' che ora ha qualcosa al centro.
   */
  apronPalette: PALETTE_SLOTS.asphalt,

  // Qui stava `fencePalette`, il colore del recinto di cantiere. Non c'e' piu':
  // il cantiere e' diventato `buildings/clearanceSite.ts`, condiviso con le
  // arcologie, e il recinto e' lo stesso segnale per tutti — due colori direbbero
  // che sono due cose diverse. Sta in `BUILDER.fencePalette`.

  /**
   * Sale con cui il seme del record sceglie l'esemplare.
   *
   * Serve per lo stesso motivo di `SKYLINE.peakSalt`, e contro lo stesso
   * inciampo: `record.seed` **e'** `hashCoords(worldSeed, x, y)`, cioe' lo
   * stesso intero da cui `landmarkFacing` ricava il verso di ripiego con `& 3`.
   * Chiedergli anche l'esemplare con un modulo legherebbe le due risposte — su
   * un landmark senza strada attorno verso e variante cambierebbero sempre
   * insieme — e la citta' mostrerebbe una regolarita' che nessuno ha scritto.
   * Un sale proprio le rende due domande diverse.
   */
  variantSalt: 0x5a3c_11d7,

  // Qui stava `maxTerraceDrop`, il tetto di dislivello che fermava il terrapieno
  // di un landmark su un fianco di montagna. Non c'e' piu': un landmark non
  // riempie il pendio — affonda alla quota piu' bassa e scava la montagna che
  // spunterebbe dal tetto, dentro la sola impronta — quindi il terrapieno che
  // quel tetto limitava non si costruisce mai, e nessun versante resta fuori
  // portata. L'unico rifiuto del terreno e' l'acqua fonda, e vive in
  // `buildings/siteWorks.ts`.

  /**
   * Fin dove una parte **poggia** invece di sporgere, in voxel dal piano finito.
   *
   * E' cio' che l'opera di terra deve reggere, e la ragione per cui non e'
   * «tutto l'ingombro». Il braccio di una gru passa sopra la darsena a tredici
   * voxel d'altezza: contarlo vorrebbe dire riempire di terra l'acqua che
   * sorvola, ed e' esattamente il difetto che questa maschera esiste per
   * togliere. Sotto questa quota invece non c'e' niente a mezz'aria in nessuna
   * ricetta — il piano di banchina, il capannone, la gamba della gru — quindi le
   * prime quote *sono* il suolo che la struttura si costruisce.
   *
   * Quattro voxel sono due celle di terreno: abbastanza da prendere un piano piu'
   * il primo corso di qualunque cosa ci stia sopra, non abbastanza da arrivare a
   * un impalcato.
   */
  groundBand: 4,

  /**
   * Livello minimo dell'edificio che puo' ospitare una struttura sul tetto.
   *
   * **Sopra un grattacielo, non sopra una casa.** Uno scalo in quota su una
   * palazzina di due piani non e' una citta' verticale, e' un tetto attrezzato:
   * il gesto dice qualcosa solo se la torre e' gia' alta, e in cambio la torre
   * smette di crescere — chi regge non cresce — quindi il giocatore sta anche
   * spendendo la crescita futura di quel lotto.
   *
   * Sette su `BUILDER.maxLevel` a dodici: oltre la meta', dentro cio' che la
   * gerarchia verticale concede solo al centro.
   */
  aloftMinLevel: 7,
} as const;

/**
 * Cio' che basta a disegnare una sagoma da una tabella di parti.
 *
 * **Non e' un'astrazione anticipata: e' il confine fra due domande.** Questa
 * meta' risponde a «che forma ha, a questo stadio, in questo verso», e non sa
 * niente di catalizzatori, grembiuli o ormeggi — che sono cio' che fa di una
 * sagoma *un landmark*. Averla separata e' quello che permette a un altro
 * dominio con la stessa grammatica di parti — `src/world/arcology/`, che di
 * catalizzatori non ne ha — di riusare `generateFromRecipe` invece di
 * ricopiarlo: due copie dello stesso ciclo divergerebbero al primo stadio
 * cumulativo che qualcuno tocca.
 */
export interface PartsRecipe {
  /**
   * Ingombro canonico `[lungo, corto]`, in voxel, con il fronte a est.
   *
   * E' l'ingombro **finale**: si riserva al piazzamento e non cambia piu'. Il
   * porto, l'aeroporto e il trasporto hanno l'asse lungo maggiore degli altri —
   * un molo, una pista e un viadotto sono lineari per natura, e schiacciarli in
   * un quadrato li farebbe leggere come monconi.
   */
  readonly span: readonly [number, number];

  /** Quota massima. Riservata anch'essa dal primo stadio. */
  readonly height: number;

  /**
   * Dove cade, dentro il riquadro canonico, la colonna che il giocatore ha
   * cliccato.
   *
   * Non e' il centro: il porto deve avere la banchina sotto il click e il molo
   * davanti, altrimenti meta' del magazzino finisce in mare.
   */
  readonly anchor: readonly [number, number];

  /**
   * Edifici entro il raggio del catalizzatore che sbloccano ogni stadio.
   *
   * L'indice e' lo stadio e il primo vale sempre 0: lo stadio zero e' cio' che
   * compare al piazzamento. E' la trasposizione del modello dei monumenti di
   * Anno 1800 — una costruzione a fasi che corona una citta' **gia' edificata**
   * — con il solo dato che il Builder possiede davvero: cosa e' stato costruito
   * li' attorno. La desiderabilita' non servirebbe, perche' un catalizzatore
   * siede al centro della propria influenza e il campo li' e' quasi sempre
   * saturo: il landmark salterebbe tutti gli stadi al primo tick.
   */
  readonly stages: readonly number[];

  /**
   * Il tronco: parti aggiunte da ciascuno stadio, disegnate per ogni esemplare.
   *
   * Cumulative — lo stadio n disegna 0..n — e comuni a tutte le varianti: qui
   * sta cio' che dice **il ruolo**, cioe' quello che il giocatore deve
   * riconoscere da lontano senza doverlo imparare due volte.
   */
  readonly parts: readonly (readonly Part[])[];

  /**
   * Gli esemplari: cio' che dice **quale** porto, non che e' un porto.
   *
   * Assente vale un esemplare solo, cioe' il comportamento di prima, e questo
   * non e' un ripiego: un ruolo la cui forma e' gia' tutta nel tronco non ha
   * niente da variare, e non deve dichiarare una lista di uno per dirlo.
   *
   * **Perche' un'aggiunta e non una ricetta alternativa.** La nota di
   * `generate.ts` contro il PRNG resta vera: se ogni esemplare fosse una lista
   * di parti a se', due porti potrebbero non avere piu' niente in comune e il
   * ruolo smetterebbe di essere leggibile. Tenendo il tronco fuori dalla
   * variante, la leggibilita' e' garantita per costruzione invece che per
   * disciplina di chi scrive la tabella — e la varieta' arriva dove serve, sul
   * secondo sguardo.
   */
  readonly variants?: readonly LandmarkVariant[];

  /**
   * Il sedime per stadio, quando la struttura cresce anche in pianta.
   *
   * **Assente vale il sedime fisso di sempre.** Una ricetta che non lo
   * dichiara riserva l'ingombro finale dal primo stadio, e `span`, `height` e
   * `anchor` restano quelli — il comportamento storico, e quello di ogni
   * arcologia. Quando c'e', ha una voce per stadio (stessa lunghezza di
   * `parts`), e `parts[s]` disegna **l'intera sagoma** dello stadio s nel
   * sedime `growth[s]`.
   *
   * **Il sedime cresce davvero, non si riempie.** L'ingombro riservato al
   * piazzamento e' quello dello stadio zero, e un avanzamento allarga
   * l'impronta sventrando cio' che il quartiere ha costruito nel frattempo sul
   * nuovo terreno. L'ancora — la colonna cliccata — resta ferma per tutti gli
   * stadi, e ogni voce dichiara dove cade dentro il proprio riquadro.
   *
   * **Per stadio, non cumulativa.** A differenza del tronco a sedime fisso, qui
   * `parts[s]` non si somma agli stadi precedenti: li sostituisce, perche' il
   * sedime cambia e non c'e' un riquadro comune su cui accumulare. L'avanzamento
   * quindi cancella la sagoma vecchia e scrive quella nuova, invece di coprirla.
   *
   * **Il sedime cresce in modo monotono.** Lo stadio n+1 deve contenere lo
   * stadio n allineato sull'ancora — l'ancora si allontana da ogni bordo, mai si
   * avvicina — cosi' la struttura cresce verso l'esterno e mai sopra se stessa.
   *
   * Una ricetta che cresce e' **terrestre**: niente `waterline`, `basinDepth` o
   * `lakeQuay`, perche' l'opera si getta di nuovo a ogni avanzamento e il
   * fronte d'acqua non ha una forma da far crescere.
   */
  readonly growth?: readonly StageFootprint[];
}

/** Il sedime che una ricetta occupa a un certo stadio. */
export interface StageFootprint {
  /** Ingombro canonico `[lungo, corto]` a questo stadio. */
  readonly span: readonly [number, number];
  /** Quota massima a questo stadio. */
  readonly height: number;
  /** Dove cade la colonna cliccata dentro questo riquadro canonico. */
  readonly anchor: readonly [number, number];
}

/** La sagoma di un ruolo, piu' cio' che ne fa il monumento di un catalizzatore. */
export interface LandmarkRecipe extends PartsRecipe {
  readonly kind: CatalystId;

  /** Raggio di Manhattan del grembiule dipinto attorno alla struttura. */
  readonly apron: number;

  /**
   * Dove i mezzi di `src/world/traffic/` stanno fermi, nel canonico.
   *
   * **Sta nella ricetta e non nel traffico**, ed e' la stessa ragione per cui
   * l'ancora sta qui: sono coordinate *della forma*. Il punto in cui una barca
   * attracca e' il bordo di una darsena che questa tabella disegna, e tenerlo
   * altrove significherebbe due file da correggere ogni volta che il molo si
   * sposta di una colonna — con il difetto che si vede solo a schermo, perche'
   * nessun test puo' sapere che *quel* voxel era il bordo.
   *
   * Assente vale «nessun mezzo»: sette ruoli su nove non ne hanno.
   */
  readonly moorings?: readonly LandmarkMooring[];

  /**
   * Colonna canonica in cui la ricetta si aspetta che **cominci il mare**.
   *
   * **Senza questo numero il porto restava senza barche, ed e' il difetto che
   * lo ha fatto nascere.** Il vincolo di sito ammette il click fino a
   * `SITE.coastalRadius` colonne dall'acqua — sei, e lo fa apposta, perche' la
   * scelta fra la banchina e il primo terreno asciutto dietro *e'* la decisione
   * che un porto comporta — mentre gli ormeggi del porto stanno quattro e cinque
   * colonne oltre il click. Su una costa che dista piu' di quattro, la darsena
   * cadeva sull'asciutto, l'opera di terra la riempiva, e `planTraffic` scartava
   * ogni ormeggio a galla: un porto perfettamente costruito, con la sua fila di
   * gru, e niente in acqua.
   *
   * Dichiararlo permette al piazzamento di far **scorrere la struttura lungo il
   * proprio fronte** finche' questa colonna cade sulla battigia vera: il
   * catalizzatore resta dove il dito l'ha messo — e' lui a portare l'influenza —
   * e la banchina va a incontrare l'acqua. Il conto sta in `landmarkDriver.ts`,
   * che il terreno lo conosce; qui c'e' solo cosa la forma pretende.
   *
   * Assente vale «questa ricetta non guarda l'acqua», che e' il caso di sette
   * ruoli su nove e di ogni ricetta da tetto.
   */
  readonly waterline?: number;

  /**
   * Vero se la ricetta sa costruire sull'**acqua dolce**, oltre che sul mare.
   *
   * **E' il permesso che mancava al vincolo di sito.** `'waterfront'` ammette
   * il click davanti a un lago, ma le opere di terra rifiutano l'acqua di lago
   * per costruzione — la banchina e' un muro tarato sul mare, e la citta'
   * normale deve continuare a crescere *intorno* ai laghi. Questa bandiera
   * scavalca il rifiuto solo per chi la porta: il suo sondaggio misura il lago
   * contro il proprio pelo, e il piano della banchina sale a quello specchio
   * piu' il franco invece che alla quota assoluta del mare. Sul mare non cambia
   * niente — li' lo specchio della colonna *e'* il livello del mare.
   */
  readonly lakeQuay?: true;

  /**
   * Profondita' del bacino che la ricetta scava davanti a se', in voxel sotto
   * il pelo dell'acqua.
   *
   * **E' il permesso di scavare, e vale solo per chi lo dichiara.** Il mondo si
   * riempie e non si scava, con una sola eccezione storica — il landmark sul
   * pendio, che scava la montagna sopra il proprio tetto. Questo e' il secondo
   * scavo, ed e' l'altra meta' del fronte d'acqua: dove la ricetta non poggia
   * (le colonne fuori dalla maschera dell'opera) il terreno scende fino a
   * `waterline` meno questa profondita', e l'acqua lo riempie fino al pelo.
   * Quello che ne esce e' la darsena — il bacino scavato nella riva, non il
   * mare che capitava di esserci — e il muro di banchina scende a incontrarne
   * il fondo. Assente vale «la ricetta non scava»: il porto e il traghetto
   * vivono dell'acqua che il terreno aveva gia'.
   */
  readonly basinDepth?: number;
}

/**
 * Gli ormeggi, ri-esportati da `berths.ts`: stanno li' perche' le ricette in
 * `recipes/` devono poterli leggere senza importare valori da questo file, che
 * le importa a sua volta (vedi la nota in `berths.ts` sul ciclo).
 */
import { BERTH, type BerthKind } from './berths';
export { BERTH, type BerthKind } from './berths';

export interface LandmarkMooring {
  /** Colonna canonica, in voxel dallo spigolo dell'ingombro. */
  readonly x: number;
  readonly y: number;
  /** Quota dal piano finito. Zero e' il piano stesso. */
  readonly z: number;
  readonly berth: BerthKind;
  /**
   * Verso in cui il mezzo guarda nel canonico, in radianti: `0` e' est.
   *
   * Un angolo e non un `Facing`, perche' quello che ne esce va sommato alla
   * rotazione della ricetta e finisce dritto in una matrice di rotazione: gli
   * indici andrebbero comunque tradotti, e tradurli due volte e' il modo con cui
   * un molo si ritrova le barche di traverso su meta' dei versi.
   */
  readonly heading: number;
}

export interface LandmarkVariant {
  /** Nome dell'esemplare. Serve a chi legge la tabella e ai test, non al disegno. */
  readonly name: string;

  /**
   * Parti che questo esemplare aggiunge al tronco, stadio per stadio.
   *
   * Stessa lunghezza e stessa regola cumulativa del tronco. Una voce vuota e'
   * legittima e frequente: un esemplare si distingue di solito in uno o due
   * stadi, non in tutti.
   */
  readonly parts: readonly (readonly Part[])[];
}

/**
 * Il catalogo.
 *
 * E' parziale di proposito: un ruolo senza ricetta resta giocabile e ottiene il
 * solo grembiule, che e' esattamente cio' che tutti e otto avevano prima. Un
 * ruolo nuovo aggiunto a `CATALYSTS` non puo' quindi rompere la citta' mentre la
 * sua forma non e' ancora stata disegnata.
 *
 * **Perche' gli ingombri sono contenuti.** Un landmark occupa il cuore del
 * proprio catalizzatore, cioe' esattamente il punto dove la desiderabilita' e'
 * piu' alta e dove nascerebbero gli edifici migliori. Le prime ricette erano
 * larghe sedici voxel — otto celle di terreno, quasi un isolato intero — e il
 * risultato l'ha detto un test gia' esistente: gli usi misti, che vivono dove
 * due catalizzatori si sovrappongono, sparivano perche' quella sovrapposizione
 * finiva sepolta sotto le strutture. Dodici voxel sono una volta e mezza
 * l'impronta massima di un edificio: si vedono, e lasciano vivere l'isolato.
 */
export const LANDMARKS: Partial<Record<CatalystId, LandmarkRecipe>> = {
  [PORT.kind]: PORT,
  [FERRY.kind]: FERRY,
  [FACTORY.kind]: FACTORY,
  [MARKET.kind]: MARKET,
  [PARK.kind]: PARK,
  [GREENHOUSE.kind]: GREENHOUSE,
  [AIRPORT.kind]: AIRPORT,
  [TRANSPORT.kind]: TRANSPORT,
  [UNIVERSITY.kind]: UNIVERSITY,
  [MONUMENT.kind]: MONUMENT,
  [MUSEUM.kind]: MUSEUM,
  [CATHEDRAL.kind]: CATHEDRAL,
  [POWER.kind]: POWER,
  [SCHOOL.kind]: SCHOOL,
  [RADIO.kind]: RADIO,
  [LIGHTHOUSE.kind]: LIGHTHOUSE,
  [THEATRE.kind]: THEATRE,
  [STADIUM.kind]: STADIUM,
  [MARINA.kind]: MARINA,
};

/**
 * Lo scalo in quota: l'aeroporto quando il click cade su un tetto.
 *
 * **Non e' una variante e non poteva esserlo.** Un esemplare si sceglie dal
 * seme e condivide ingombro e tronco con gli altri; qui l'ingombro *deve*
 * cambiare, perche' un campo di volo largo ventisei colonne non sta su nessun
 * tetto — la facciata di un edificio e' larga al massimo sei voxel. E' una
 * ricetta a se' che il **luogo** seleziona, che e' l'unica cosa in questo
 * dominio a non dipendere dal seme.
 *
 * Fuori dal catalogo `LANDMARKS`, e non per timidezza: quella tabella promette
 * «una struttura per ruolo» e un test la verifica. Questa e' la seconda forma
 * dello stesso ruolo, e tenerla in un'altra tabella e' il modo di dirlo senza
 * indebolire la prima.
 *
 * Niente pista e niente ali: **in quota non si atterra su una corsa, ci si posa
 * o ci si aggancia**, e i tre modi di farlo sono i tre mezzi che questo scalo
 * mostra. Il dirigibile si appende a un pilone e ci resta; l'eVTOL scende su
 * una piazzola di tre colonne, che e' l'unico modo di *arrivare* davvero su una
 * piattaforma cosi' stretta; la mongolfiera si stacca da una cima, prende quota e rientra.
 * Tre sagome che nessun campo di volo produrrebbe, e nessuna che chieda i
 * ventisei voxel di pista che qui non ci sono.
 */
export const SKYPORT: LandmarkRecipe = {
  kind: 'airport',
  // **La larghezza segue il tetto d'impronta degli edifici, non il modulo.** Con
  // `moduleFootprint` a otto un singolo edificio satura a `mid` (sei voxel), mai
  // al lato pieno: una piattaforma larga otto non troverebbe una facciata che la
  // regga. Lo sporto resta invece otto, oltre `AERIAL.reach`, cosi' lo scalo
  // conserva i piloni e la lettura di struttura appesa.
  span: [8, 6],
  height: 16,
  anchor: [4, 3],
  // Nessun grembiule: la cornice di suolo pubblico e' suolo, mentre questa
  // piattaforma sta fuori dalla facciata. Chi la posa salta la mano di vernice.
  apron: 0,
  stages: [0, 4, 12, 24],
  parts: [
    // Il plinto: tre strati e un orlo, cosi' la piattaforma legge come una
    // soletta costruita e non come un foglio appoggiato sul vuoto. La base e'
    // scura, il piano chiaro, il centro piu' pallido e il bordo una cornice.
    [
      box(PART.deck, 0, 0, 8, 6, 0, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
      box(PART.deck, 0, 0, 8, 6, 1, 1, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      box(PART.deck, 1, 1, 6, 4, 1, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      box(PART.shell, 0, 0, 8, 6, 2, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility),
    ],
    [
      // La torre di controllo: e' il pezzo che dice il ruolo, e da qui in avanti
      // la sagoma sul cielo e' quella di un ormeggio e non di un tetto attrezzato.
      // La piazzola luminosa in cima la tiene visibile anche di notte.
      box(PART.mast, 2, 2, 2, 2, 3, 10, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 2, 2, 2, 2, 13, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      // La cima della mongolfiera nell'angolo libero, e nell'**unico** che lo
      // sia: la torre sta al centro, l'aerostazione al fronte, il colonnato al
      // fianco. Un pallone e' largo sette voxel e deve potersene andare senza
      // attraversare niente.
      box(PART.slab, 0, 0, 2, 2, 2, 1, PALETTE_SLOTS.metalBrass, SURFACE_KIND.utility),
      box(PART.mast, 0, 0, 1, 1, 3, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalBrass,
      }),
    ],
    [
      // L'aerostazione: un guscio con la fascia vetrata e il tetto chiaro. Non
      // e' un capannone pieno — il vetro gira sulle pareti e la legge come un
      // luogo di transito, non come un deposito.
      box(PART.shell, 5, 0, 3, 3, 2, 3, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.shell, 5, 0, 3, 3, 3, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 5, 0, 3, 3, 5, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      // Il secondo pilone d'ormeggio: piu' basso della torre, sull'angolo
      // opposto, cosi' i due dirigibili appesi hanno prue opposte e quote diverse.
      box(PART.mast, 5, 4, 2, 2, 3, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
    ],
    [
      // Il colonnato lungo il fianco libero: da' profondita' alla piattaforma e
      // fa da soglia fra il piano e il vuoto, senza chiudere il lato da cui
      // l'eVTOL scende.
      box(PART.colonnade, 0, 2, 2, 4, 3, 4, PALETTE_SLOTS.metalDark, SURFACE_KIND.utility, {
        step: 2,
        cap: PALETTE_SLOTS.concretePale,
      }),
      // La piazzola dell'eVTOL **sopra l'aerostazione**, non sul piano: otto
      // colonne di tetto sono tutte impegnate, e l'unico posto libero su uno
      // scalo in quota e' un altro tetto. Sborda di una colonna a ovest, che e'
      // lo sbalzo che la fa leggere come una piazzola invece che come la
      // copertura del volume sotto. Il segno chiaro al centro e' il bersaglio
      // di atterraggio.
      box(PART.deck, 4, 0, 3, 3, 6, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
      box(PART.deck, 5, 1, 1, 1, 6, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
    ],
  ],
  // **Quattro ormeggi per tre mestieri**, tutti su quote e angoli diversi.
  //
  // I due dirigibili stanno accanto ai piloni con le prue opposte: due sagome
  // lunghe sedici voxel appese allo stesso tetto si attraverserebbero, e due
  // dirigibili incastrati sono peggio di uno solo. La piazzola guarda a est —
  // il verso da cui l'eVTOL scende — perche' e' l'unico lato del riquadro senza
  // un pilone davanti; la cima del pallone guarda a sud per la stessa ragione,
  // ed e' anche il verso in cui il pallone si allontana.
  moorings: [
    { x: 2, y: 2, z: 10, berth: BERTH.airship, heading: Math.PI },
    { x: 5, y: 4, z: 8, berth: BERTH.airship, heading: 0 },
    { x: 5, y: 1, z: 7, berth: BERTH.pad, heading: 0 },
    { x: 0, y: 0, z: 6, berth: BERTH.balloon, heading: -Math.PI / 2 },
  ],
};

/**
 * Il giardino pensile: il parco quando il click cade su un tetto.
 *
 * Un parco a terra e' assenza di volume; in quota l'assenza non basta, perche'
 * sopra un tetto vuoto non c'e' niente da leggere. La firma e' allora il bordo
 * lastricato che chiude il prato e il chiosco centrale: e' il segno che quel
 * tetto e' diventato un luogo, non una copertura.
 */
export const SKY_PARK: LandmarkRecipe = {
  kind: 'park',
  // Stessa larghezza dello scalo: sei voxel, il tetto d'impronta degli edifici.
  span: [8, 6],
  height: 12,
  anchor: [4, 3],
  apron: 0,
  stages: [0, 3, 8, 14],
  parts: [
    [
      box(PART.deck, 0, 0, 8, 6, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 0, 0, 8, 1, 0, 1, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.utility),
      box(PART.deck, 0, 5, 8, 1, 0, 1, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.utility),
      box(PART.deck, 0, 1, 1, 4, 0, 1, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.utility),
      box(PART.deck, 7, 1, 1, 4, 0, 1, PALETTE_SLOTS.stoneWarm, SURFACE_KIND.utility),
    ],
    [...tree(1, 1), ...tree(4, 1), ...tree(1, 3), ...tree(4, 3)],
    [
      box(PART.colonnade, 2, 1, 4, 4, 1, 4, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        step: 2,
        cap: PALETTE_SLOTS.stone,
      }),
    ],
    [
      box(PART.steps, 3, 2, 2, 2, 5, 2, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, { step: 1 }),
    ],
  ],
};

/**
 * La stazione di testa in quota: il transito quando il click cade su un tetto.
 *
 * Il viadotto a terra e' una linea sospesa fra appoggi; sopra un tetto non c'e'
 * una linea da tirare, quindi la firma diventa il binario che **sale** — due
 * pylon e un impalcato che li unisce — piu' il chiosco che lo serve. E' il nodo
 * da cui il transito parte, invece del tratto che lo attraversa.
 */
export const SKY_TRANSIT: LandmarkRecipe = {
  kind: 'transport',
  // Stessa larghezza delle altre forme in quota: sei voxel di facciata.
  span: [8, 6],
  height: 16,
  anchor: [4, 3],
  apron: 0,
  stages: [0, 4, 10, 18],
  parts: [
    [
      box(PART.deck, 0, 0, 8, 6, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      box(PART.shell, 1, 1, 6, 5, 1, 5, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 1, 1, 6, 5, 6, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
    ],
    [
      box(PART.mast, 0, 2, 2, 2, 1, 8, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.mast, 6, 2, 2, 2, 1, 8, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.stone,
      }),
      box(PART.boom, 0, 2, 8, 2, 9, 2, PALETTE_SLOTS.concrete, SURFACE_KIND.utility, {
        cap: PALETTE_SLOTS.asphaltDark,
      }),
    ],
    [
      box(PART.pitch, 1, 1, 6, 5, 7, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
        step: 1,
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.slab, 2, 1, 1, 5, 6, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
    [
      box(PART.mast, 3, 4, 2, 2, 1, 10, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 3, 4, 2, 2, 11, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
  ],
};

/**
 * Le forme contestuali: una seconda struttura dello stesso ruolo.
 *
 * **Sono la generalizzazione di `SKYPORT`.** Il ruolo resta `kind` — il
 * catalizzatore, l'influenza, la selezione — e la forma dice quale ricetta
 * disegna lo stamp. A scegliere la forma e' il **luogo**, non il seme: e' la
 * differenza che separa una forma da una variante, che il seme la sceglie e
 * condivide ingombro e tronco.
 *
 * Due modi di essere una seconda forma, e due tabelle lo dicono:
 *
 * - **forma di facciata** (`aloft`): una ricetta propria, con ingombro e firma
 *   suoi. Si appende a un tetto, non prende suolo e non dipinge un grembiule;
 * - **forma d'acqua**: un mestiere della ricetta a terra, espresso come una
 *   **variante fissata** della stessa sagoma. Il porto non ha bisogno di una
 *   seconda geometria — banchina, gru e magazzini restano quelli — gli cambia
 *   solo cosa ci si scarica, e a deciderlo e' la classe dell'acqua davanti al
 *   molo invece di un tiro di seme.
 */
export type LandmarkFormId =
  | 'skyport'
  | 'sky-park'
  | 'sky-transit'
  | 'port-bulk'
  | 'port-shipyard'
  | 'port-passenger'
  | 'marina-shallows'
  | 'marina-open';

export interface LandmarkForm {
  readonly kind: CatalystId;
  /** true per le forme che si appendono a una facciata e non prendono suolo. */
  readonly aloft: boolean;
  readonly recipe: LandmarkRecipe;
  /** Variante fissata della ricetta a terra: la forma d'acqua sceglie il mestiere. */
  readonly variant?: number;
  /** Classe d'acqua che seleziona questa forma. Solo per le forme d'acqua. */
  readonly waterClass?: WaterClass;
}

export const FORMS: Readonly<Record<LandmarkFormId, LandmarkForm>> = {
  skyport: { kind: 'airport', aloft: true, recipe: SKYPORT },
  'sky-park': { kind: 'park', aloft: true, recipe: SKY_PARK },
  'sky-transit': { kind: 'transport', aloft: true, recipe: SKY_TRANSIT },
  'port-bulk': { kind: 'port', aloft: false, recipe: LANDMARKS.port!, variant: 0, waterClass: WATER_CLASS.open },
  'port-shipyard': { kind: 'port', aloft: false, recipe: LANDMARKS.port!, variant: 1, waterClass: WATER_CLASS.canal },
  'port-passenger': { kind: 'port', aloft: false, recipe: LANDMARKS.port!, variant: 2, waterClass: WATER_CLASS.shallow },
  // La marina cambia esemplare con l'acqua, e a scegliere e' la stessa classe
  // che decide il mestiere del porto: un bassofondo — il lago, la spiaggia
  // protetta — chiede legno, il mare aperto chiede pietra. Il lago e' sempre
  // basso (`basinWaterDepth` sta sotto `shallowDepth`), quindi la forma
  // lacustre non e' mai un tiro di seme: chi costruisce sul lago ottiene il
  // lungolago di doghe, chi sulla baia aperta il fronte in pietra.
  'marina-shallows': { kind: 'marina', aloft: false, recipe: LANDMARKS.marina!, variant: 0, waterClass: WATER_CLASS.shallow },
  'marina-open': { kind: 'marina', aloft: false, recipe: LANDMARKS.marina!, variant: 1, waterClass: WATER_CLASS.open },
};

/**
 * La ricetta di un ruolo, a terra o nella sua forma contestuale.
 *
 * `form` non e' una preferenza: e' il luogo che il click ha scelto, e un ruolo
 * che non ha quella forma risponde `null` invece di ripiegare a terra —
 * ripiegare significherebbe costruire un campo di volo dentro un grattacielo.
 */
export function landmarkOf(kind: CatalystId, form?: LandmarkFormId): LandmarkRecipe | null {
  if (form !== undefined) {
    const entry = FORMS[form];
    return entry !== undefined && entry.kind === kind ? entry.recipe : null;
  }
  return LANDMARKS[kind] ?? null;
}

/** true se la forma si appende a una facciata e non prende suolo. */
export function isFacadeForm(form: LandmarkFormId): boolean {
  return FORMS[form].aloft;
}

/** true se questo ruolo ha una forma da tetto oltre a quella da terra. */
export function hasFacadeForm(kind: CatalystId): boolean {
  return facadeFormOf(kind) !== null;
}

/** La forma da facciata di un ruolo, o null se non ne ha una. */
export function facadeFormOf(kind: CatalystId): LandmarkFormId | null {
  for (const id of contextualFormsOf(kind)) {
    if (FORMS[id].aloft) return id;
  }
  return null;
}

/** true se questo ruolo sceglie una forma in base all'acqua. */
export function hasWaterForm(kind: CatalystId): boolean {
  return contextualFormsOf(kind).some((id) => !FORMS[id].aloft);
}

/** La forma d'acqua che questa classe seleziona, o null. */
export function waterFormFor(kind: CatalystId, waterClass: WaterClass): LandmarkFormId | null {
  for (const id of contextualFormsOf(kind)) {
    const form = FORMS[id];
    if (!form.aloft && form.waterClass === waterClass) return id;
  }
  return null;
}

/** La variante fissata da una forma, o `undefined` per la scelta dal seme. */
export function formVariantOf(form: LandmarkFormId | undefined): number | undefined {
  return form === undefined ? undefined : FORMS[form].variant;
}

/** Le forme contestuali di un ruolo, nell'ordine di dichiarazione. */
export function contextualFormsOf(kind: CatalystId): readonly LandmarkFormId[] {
  const out: LandmarkFormId[] = [];
  for (const id of Object.keys(FORMS) as LandmarkFormId[]) {
    if (FORMS[id].kind === kind) out.push(id);
  }
  return out;
}

/** Ultimo stadio raggiungibile da una ricetta. */
export function maxStageOf(recipe: PartsRecipe): number {
  return recipe.parts.length - 1;
}

/** true se la ricetta cresce di sedime per stadio invece di riservarlo. */
export function growsFootprint(recipe: PartsRecipe): boolean {
  return recipe.growth !== undefined;
}

/**
 * Il sedime di una ricetta a un certo stadio.
 *
 * Senza `growth` risponde il sedime finale dichiarato — il comportamento di
 * sempre — e il parametro `stage` non conta. Con `growth`, ritaglia la voce
 * dello stadio richiesto, in silenzio dentro i limiti.
 */
export function footprintOf(recipe: PartsRecipe, stage: number): StageFootprint {
  const growth = recipe.growth;
  if (growth === undefined) {
    return { span: recipe.span, height: recipe.height, anchor: recipe.anchor };
  }
  const s = Math.max(0, Math.min(stage, growth.length - 1));
  return growth[s];
}

/**
 * Gli esemplari di una ricetta, mai meno di uno.
 *
 * Una ricetta senza `variants` ne ha comunque uno — il tronco nudo — e dirlo
 * qui invece che in `generateLandmark` evita al generatore di distinguere il
 * caso: sceglie sempre dentro una lista, che a volte e' lunga uno.
 */
export function variantsOf(recipe: PartsRecipe): readonly LandmarkVariant[] {
  if (recipe.variants === undefined || recipe.variants.length === 0) return [TRUNK_ONLY];
  return recipe.variants;
}

const TRUNK_ONLY: LandmarkVariant = { name: 'base', parts: [] };
