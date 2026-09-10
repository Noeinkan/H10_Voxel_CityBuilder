import { HARBOR } from './config';
import { HARBOR_FIGURE, NO_SHORE, type CoastSite } from './site';

/**
 * Le figure d'acqua, come rettangoli canonici.
 *
 * **Puro e senza terreno.** Entra la misura della costa (`site.ts`), esce una
 * forma: rettangoli d'acqua da scavare, sponde da murare, colmate da guadagnare
 * al mare e banchine su cui costruire. Chi li porta sul verso vero, li spezza a
 * budget e chiede al terreno se c'e' lavoro da fare e' `plan.ts` — qui non si
 * sonda niente, e per questo una darsena si prova scrivendo tre numeri invece
 * che generando un'isola.
 *
 * **Il sistema di riferimento e' quello della ricetta**: `x` cresce verso il
 * mare, la struttura occupa `x` 0..long-1 e `y` 0..short-1, e la terra sta
 * dietro, a `x` negativo. Ogni figura si dispone **attorno** a quel riquadro e
 * mai sopra: il landmark sta sulla propria banchina, e le darsene gli crescono
 * ai lati come alle West India Docks.
 *
 * **Ogni figura dichiara il proprio confine.** Non c'e' un ritaglio generale che
 * le contenga: e' la forma stessa a essere finita — tre bacini, un canale lungo
 * `canalRun`, due bracci lunghi `coveArm` — ed e' la differenza fra un'impronta
 * e una colata. Il tetto assoluto resta `HARBOR.figureReach`, due isolati.
 */

export interface FigureRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface FigurePlan {
  /** Specchi da scavare e allagare fino al pelo. */
  readonly water: readonly FigureRect[];
  /** Sponde murate: il bordo costruito fra l'acqua e la terra. */
  readonly banks: readonly FigureRect[];
  /** Colmate: moli e argini guadagnati al mare, in quota con la citta'. */
  readonly moles: readonly FigureRect[];
  /**
   * Pontili: tavolati posati sull'acqua, vuoti sotto.
   *
   * **Stanno a parte dalle colmate perche' non sono suolo.** Una colmata porta
   * la terra al piano della citta' — sei voxel sopra il pelo — e ci si
   * costruisce sopra; un pontile e' un tavolato a due voxel dall'acqua che
   * poggia su dei pali. Confonderli e' il difetto che si vedeva a schermo: i
   * bracci del porticciolo e i pontili dell'argine uscivano dal mare come
   * blocchi di pietra alti dodici voxel invece che come passerelle.
   */
  readonly piers: readonly FigureRect[];
  /**
   * Le banchine della figura: le dita fra due darsene, l'isola del canale, la
   * testa degli argini. **Sono i lotti**, ed e' quello che fa leggere Canary
   * Wharf come Canary Wharf invece che come un paio di vasche.
   */
  readonly quays: readonly FigureRect[];
  /**
   * Le gru di banchina: la firma verticale del porto.
   *
   * **Sono due rettangoli e non una direzione**, ed e' voluto: una direzione
   * canonica andrebbe ruotata a mano sul verso della struttura, cioe' un
   * secondo segno da tenere allineato con `orientPart`. Due rettangoli si
   * ruotano da soli, come ogni altra parte della figura.
   *
   * A distanza isometrica una darsena senza gru e' una vasca: e' lo sbraccio
   * sopra l'acqua a dire che di li' si scarica qualcosa.
   */
  readonly cranes: readonly { readonly mast: FigureRect; readonly boom: FigureRect }[];
}

export interface FigureQuery {
  readonly site: CoastSite;
  /** Ingombro canonico della struttura. */
  readonly long: number;
  readonly short: number;
}

const EMPTY: FigurePlan = {
  water: [], banks: [], moles: [], piers: [], quays: [], cranes: [],
};

/** La forma che questa costa ha scelto, in coordinate canoniche. */
export function planFigure(query: FigureQuery): FigurePlan {
  switch (query.site.figure) {
    case HARBOR_FIGURE.docks: return planDocks(query);
    case HARBOR_FIGURE.canal: return planCanal(query);
    case HARBOR_FIGURE.cove: return planCove(query);
    case HARBOR_FIGURE.embankment: return planEmbankment(query);
    default: return EMPTY;
  }
}

/**
 * La colonna in cui comincia l'acqua su questa riga, con ripiego sulla mediana.
 *
 * Le righe senza riva sono quelle che entro il tetto acqua non ne hanno: dare
 * loro la mediana invece di saltarle tiene la figura **rettangolare**, che e'
 * cio' che una darsena e' — e le colonne di troppo se le mangia `addPieces`,
 * che scarta i ritagli senza lavoro da fare.
 */
function shoreAt(site: CoastSite, cy: number): number {
  const i = cy - site.fromRow;
  const edge = i >= 0 && i < site.shore.length ? site.shore[i] : NO_SHORE;
  if (edge !== NO_SHORE) return edge;
  const found = site.shore.filter((value) => value !== NO_SHORE);
  if (found.length === 0) return 0;
  return [...found].sort((a, b) => a - b)[found.length >> 1];
}

/**
 * Darsene a pettine: le West India Docks.
 *
 * I bacini entrano nella terra perpendicolari alla costa, uno per lato a
 * distanza crescente dalla struttura, e fra loro restano le dita di banchina.
 * **La struttura sta su una dita**, non dentro un bacino: e' il landmark che
 * presiede la propria darsena, e il pettine gli cresce ai fianchi.
 *
 * L'ordine alternato — nord, sud, nord — non e' un vezzo: il primo bacino e' il
 * piu' vicino e il piu' visibile, e alternare tiene la figura in equilibrio
 * attorno al catalizzatore invece di farla pendere da un lato.
 */
function planDocks(query: FigureQuery): FigurePlan {
  const { short } = query;
  const water: FigureRect[] = [];
  const banks: FigureRect[] = [];
  const quays: FigureRect[] = [];
  const cranes: FigurePlan['cranes'][number][] = [];
  const pitch = HARBOR.dockWidth + HARBOR.dockFinger;

  for (let j = 0; j < HARBOR.dockCount; j++) {
    const step = j >> 1;
    const north = (j & 1) === 0;
    const gap = HARBOR.dockFinger + step * pitch;
    const y0 = north ? short + gap : -gap - HARBOR.dockWidth;
    if (Math.abs(y0) + HARBOR.dockWidth > HARBOR.figureReach) break;

    const edge = shoreAt(query.site, y0 + (HARBOR.dockWidth >> 1));
    const head = edge - HARBOR.dockLength;
    // Il bacino sborda di due colonne oltre la riva: e' quello che gli
    // garantisce di **aprirsi sul mare** invece di restare una vasca chiusa da
    // una lingua di sabbia che la sonda aveva contato come riva.
    water.push({ x: head, y: y0, w: edge - head + 2, h: HARBOR.dockWidth });

    // Le due sponde lunghe e la testata: un bacino che finisce contro l'erba e'
    // una trincea. Le sponde si fermano alla riva, perche' al largo il bacino
    // si apre e non ha piu' niente da contenere.
    banks.push({ x: head, y: y0 - 1, w: edge - head, h: 1 });
    banks.push({ x: head, y: y0 + HARBOR.dockWidth, w: edge - head, h: 1 });
    banks.push({ x: head - 1, y: y0, w: 1, h: HARBOR.dockWidth });

    // La dita fra questo bacino e il precedente — o fra questo e la struttura,
    // per il primo di ogni lato: e' li' che nasce la citta' del porto.
    const fingerY = north ? y0 - HARBOR.dockFinger : y0 + HARBOR.dockWidth;
    quays.push({ x: head, y: fingerY, w: edge - head, h: HARBOR.dockFinger });

    // La gru sul filo della dita, con lo sbraccio sopra il proprio bacino. Sta
    // arretrata di `craneReach` dalla riva perche' il braccio le sporge davanti:
    // in punta alla dita lo sbraccio finirebbe in mare aperto invece che sopra
    // l'acqua che serve.
    const lipY = north ? y0 - 2 : y0 + HARBOR.dockWidth;
    cranes.push({
      mast: { x: edge - HARBOR.craneReach, y: lipY, w: 2, h: 2 },
      boom: {
        x: edge - HARBOR.craneReach,
        y: north ? y0 : y0 + HARBOR.dockWidth - HARBOR.craneReach,
        w: 2,
        h: HARBOR.craneReach,
      },
    });
  }

  return { water, banks, moles: [], piers: [], quays, cranes };
}

/**
 * Il canale che stacca un'isola: Dubai Marina.
 *
 * Il canale corre **dietro** la struttura, parallelo alla costa, e si richiude
 * in mare ai due capi. Quello che ne esce non e' il canale: e' la striscia fra
 * il canale e il mare, che diventa un'isola — e la struttura ci sta sopra
 * insieme agli edifici che il distretto ci fa nascere. E' la figura, e il canale
 * e' solo il taglio che la produce.
 *
 * Le due bocche stanno alle estremita' della corsa, a una trentina di colonne
 * dal catalizzatore: abbastanza lontano perche' nessuna delle due attraversi il
 * riquadro della struttura, che e' l'unico modo in cui questa figura si
 * taglierebbe addosso al proprio landmark.
 */
function planCanal(query: FigureQuery): FigurePlan {
  const { short } = query;
  const inner = -HARBOR.canalIsland - HARBOR.canalWidth;
  const centre = short >> 1;
  const half = HARBOR.canalRun >> 1;
  const y0 = centre - half;

  const water: FigureRect[] = [
    { x: inner, y: y0, w: HARBOR.canalWidth, h: HARBOR.canalRun },
  ];
  const banks: FigureRect[] = [
    { x: inner - 1, y: y0, w: 1, h: HARBOR.canalRun },
    { x: inner + HARBOR.canalWidth, y: y0, w: 1, h: HARBOR.canalRun },
  ];
  const quays: FigureRect[] = [];

  // Le due bocche, e con loro l'isola: ogni bocca taglia la striscia verso il
  // mare, e cio' che resta in mezzo e' staccato dalla terra su tutti i lati.
  for (const mouthY of [y0, y0 + HARBOR.canalRun - HARBOR.canalWidth]) {
    const edge = shoreAt(query.site, mouthY + (HARBOR.canalWidth >> 1));
    water.push({ x: inner, y: mouthY, w: edge - inner + 2, h: HARBOR.canalWidth });
  }

  // L'isola: dalla sponda esterna del canale fino alla riva, per tutta la corsa
  // fra le due bocche. E' il lotto, ed e' la ragione della figura.
  const islandY = y0 + HARBOR.canalWidth;
  const islandH = HARBOR.canalRun - 2 * HARBOR.canalWidth;
  if (islandH > 0) {
    const edge = shoreAt(query.site, centre);
    quays.push({
      x: inner + HARBOR.canalWidth,
      y: islandY,
      w: edge - inner - HARBOR.canalWidth,
      h: islandH,
    });
  }

  return { water, banks, moles: [], piers: [], quays, cranes: [] };
}

/**
 * Il porticciolo: due bracci di pietra che chiudono un pezzo di mare.
 *
 * **La figura di chi la terra non ce l'ha.** Su una punta o su una lingua
 * stretta non c'e' niente in cui scavare, e l'unico gesto disponibile e'
 * aggiungere: due moli escono dalla riva, girano l'uno verso l'altro e si
 * fermano lasciando la bocca. Lo specchio dentro e' il mare che c'era — la
 * figura non lo scava, lo **recinta** — ed e' la stessa economia con cui la
 * ricetta del porto ottiene la darsena non disegnando niente.
 */
function planCove(query: FigureQuery): FigurePlan {
  const { short } = query;
  // **I bracci sono pontili, non colmate.** Escono sull'acqua e non portano
  // niente: un braccio colmato al piano della citta' uscirebbe dal mare come un
  // muro alto sei voxel, che e' l'aspetto che il porticciolo aveva a schermo.
  const piers: FigureRect[] = [];
  const quays: FigureRect[] = [];
  const centre = short >> 1;
  const half = HARBOR.coveMouth >> 1;

  for (const north of [true, false]) {
    const y0 = north ? short + 1 : -1 - HARBOR.coveThickness;
    const edge = shoreAt(query.site, north ? short + 2 : -2);

    // Il braccio che esce al largo, e la piega che chiude verso il centro
    // fermandosi al bordo della bocca.
    piers.push({ x: edge, y: y0, w: HARBOR.coveArm, h: HARBOR.coveThickness });
    const tipX = edge + HARBOR.coveArm - HARBOR.coveThickness;
    const turnY = north ? centre + half : centre - half;
    const turnH = north ? y0 - turnY : turnY - (y0 + HARBOR.coveThickness);
    if (turnH > 0) {
      piers.push({
        x: tipX,
        y: north ? turnY : y0 + HARBOR.coveThickness,
        w: HARBOR.coveThickness,
        h: turnH,
      });
    }

    // La banchina alla radice del braccio: l'unico suolo che questa figura
    // guadagna, e quindi l'unico posto in cui puo' nascerci qualcosa.
    quays.push({
      x: edge - HARBOR.embankmentDeck,
      y: north ? short + 1 : -1 - HARBOR.dockFinger,
      w: HARBOR.embankmentDeck,
      h: HARBOR.dockFinger,
    });
  }

  return { water: [], banks: [], moles: [], piers, quays, cranes: [] };
}

/**
 * L'argine: il bordo murato, con la banchina guadagnata e i suoi pontili.
 *
 * Il ripiego del vocabolario, e un ripiego onesto: dove la riva e' bassa,
 * frastagliata o gia' costruita non c'e' una forma da scavare, e il fronte
 * d'acqua e' un bordo — muro, calpestio, e ogni tanto un pontile che sporge.
 * E' anche la sola figura che non pretende **niente** dal terreno, ed e' per
 * questo che chiude la gerarchia: l'ultimo ramo non puo' fallire.
 */
function planEmbankment(query: FigureQuery): FigurePlan {
  const { short } = query;
  const moles: FigureRect[] = [];
  const piers: FigureRect[] = [];
  const quays: FigureRect[] = [];
  const span = HARBOR.embankmentPier * 2;

  for (let cy = -span; cy < short + span; cy += HARBOR.embankmentPier) {
    // **La fascia salta le righe della struttura.** Li' il fronte d'acqua l'ha
    // gia' costruito la ricetta, e una colmata sopra il proprio molo ne
    // sotterrerebbe gli ormeggi — la barca resterebbe sull'asciutto, che e' il
    // difetto da cui tutta questa fase e' nata.
    if (cy + HARBOR.embankmentPier > 0 && cy < short) continue;
    const edge = shoreAt(query.site, cy + (HARBOR.embankmentPier >> 1));
    // **Il bordo e' una colmata, il pontile no.** La fascia lungo la riva porta
    // la terra al piano della citta' — e' l'argine, ci si cammina e ci si
    // costruisce accanto; cio' che sporge sull'acqua e' un tavolato su pali.
    // Confonderli faceva uscire dal mare dei blocchi di pietra alti dodici
    // voxel invece che delle passerelle.
    moles.push({ x: edge, y: cy, w: HARBOR.embankmentDeck, h: HARBOR.embankmentPier });
    piers.push({
      x: edge + HARBOR.embankmentDeck,
      y: cy + (HARBOR.embankmentPier >> 2),
      w: HARBOR.embankmentDeck * 2,
      h: HARBOR.embankmentPier >> 1,
    });
    quays.push({
      x: edge - HARBOR.embankmentDeck,
      y: cy,
      w: HARBOR.embankmentDeck,
      h: HARBOR.embankmentPier,
    });
  }

  return { water: [], banks: [], moles, piers, quays, cranes: [] };
}
