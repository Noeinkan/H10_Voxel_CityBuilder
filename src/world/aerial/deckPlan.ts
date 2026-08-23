import { AERIAL, DECK_HEIGHT } from './config';

/**
 * Il primitivo della citta' in quota: un riquadro di impalcato e le gambe che
 * gli servono per stare su.
 *
 * **Pura come `grading/grade.ts`, `sites/siteRules.ts`, `buildings/cluster.ts` e
 * `spans/spanPlan.ts`.** Non conosce il `VoxelWorld`, non conosce il registry e
 * non conosce la `TerrainMap`: cio' che deve sapere del luogo entra come
 * **predicato**. Ne segue che il vincolo della fase — «nessuna struttura sospesa
 * senza appoggi reali» — si verifica in un test in ambiente `node`, senza mondo
 * e senza GPU, invece che a occhio su una citta' cresciuta.
 *
 * **Una funzione sola per tre forme.** Mensola, tratto di percorso e nodo sono lo
 * stesso fatto — un rettangolo a una quota — e differiscono per come sono
 * ancorati: la mensola a una parete, il tratto ai suoi due capi, il nodo ai
 * tratti che vi arrivano. E' l'ancoraggio a entrare come dato, e da lui discende
 * tutto: **dove l'ancoraggio non arriva, nasce una gamba**. Un aggetto corto non
 * ne ha nessuna, uno profondo se le conta da solo, un percorso lungo ne pianta
 * una ogni tanto — senza una riga di codice per ciascun caso.
 */

/** Un riquadro in pianta, estremi esclusi sul lato alto. */
export interface DeckRect {
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

/**
 * Cio' che serve sapere di una colonna sotto un impalcato.
 *
 * `height` e `top` sono due domande diverse e non una ripetizione: la prima e' il
 * terreno, la seconda e' cio' che **occupa** la colonna, tetti compresi. E'
 * quella distinzione a permettere a una gamba di poggiare sopra un edificio
 * invece che accanto, che e' come sono fatte davvero le citta' a livelli.
 */
export interface AerialColumn {
  /** Quota del terreno: la prima cella libera sopra il suolo. */
  readonly height: number;
  /** Prima cella libera sopra tutto cio' che occupa la colonna, edifici compresi. */
  readonly top: number;
  readonly pavement: boolean;
  /** true se nessun edificio prende il suolo di questa colonna. */
  readonly free: boolean;
  /** true se il terreno regge un appoggio: nessuna opera lo rifiuta. */
  readonly firm: boolean;
  /**
   * Id del record su cui `top` poggia, o 0 se e' terreno nudo.
   *
   * E' il guinzaglio dell'appoggio: un edificio che regge una gamba non puo'
   * piu' cambiare sagoma sotto di lei, esattamente come un appoggio di campata.
   */
  readonly carrier: number;
}

/** I due predicati con cui il luogo entra in una regola pura. */
export interface AerialProbe {
  readonly ground: (x: number, y: number) => AerialColumn;
  /** true se nel mondo quel voxel e' pieno. E' cio' che verifica il vuoto vero. */
  readonly solid: (x: number, y: number, z: number) => boolean;
}

export interface DeckQuery extends AerialProbe {
  readonly rect: DeckRect;
  /** Quota del piano calpestabile: e' li' che si cammina e si costruisce. */
  readonly deckZ: number;
  /**
   * I riquadri a cui l'impalcato e' gia' appeso: una parete, un nodo, un tratto.
   *
   * Stanno **fuori** dal riquadro e lo toccano. Non sono un vincolo di forma ma
   * la sorgente delle distanze: da loro si misura lo sbalzo, e dove lo sbalzo
   * supera `AERIAL.reach` si pianta una gamba.
   */
  readonly anchors: readonly DeckRect[];

  /**
   * Voxel di struttura in piu' sotto la travatura. Zero per un impalcato piano.
   *
   * **E' il pianerottolo.** Due tratti di percorso che arrivano a quote diverse
   * si incontrano su un nodo il cui piano sta alla quota alta e il cui fianco
   * scende fino a quella bassa: il salto si vede, ed e' cosi' che i livelli di
   * questa citta' restano fluidi invece di doversi mettere d'accordo su una
   * quota sola prima di potersi toccare.
   */
  readonly drop?: number;
}

/**
 * Perche' un riquadro non regge un impalcato.
 *
 * Sono motivi e non errori, come i rifiuti delle campate: la maggior parte dei
 * riquadri che una passata esamina ne merita uno. Servono ai test, che senza di
 * loro potrebbero solo dire "no" e non "no per la ragione giusta".
 */
export const DECK_REFUSALS = [
  /** Il volume dell'impalcato non e' aria. */
  'blocked',
  /** Sotto una colonna manca il franco: l'impalcato sfiorerebbe un tetto o il suolo. */
  'tooLow',
  /** Il riquadro e' piu' stretto di una gamba, e una gamba gli servirebbe. */
  'tooNarrow',
  /** Una gamba cadrebbe su un suolo gia' preso o che nessuna opera regge. */
  'noFooting',
  /** Una gamba cadrebbe in mezzo alla carreggiata. */
  'onStreet',
  /** Una gamba sarebbe piu' alta di quanto una gamba possa essere. */
  'tooTall',
] as const;

export type DeckRefusal = (typeof DECK_REFUSALS)[number];

/** Una gamba, dal proprio piede fino sotto la travatura. */
export interface Pier {
  /** Angolo minimo dell'ingombro, largo `AERIAL.pierSide` sui due assi. */
  readonly x: number;
  readonly y: number;
  /** Prima quota occupata: il piede, che puo' essere terreno o tetto. */
  readonly baseZ: number;
  readonly height: number;
  /** Record su cui il piede poggia, o 0 se e' terreno nudo. */
  readonly carrier: number;
}

export interface DeckPlan {
  readonly rect: DeckRect;
  readonly deckZ: number;
  /** Prima quota occupata: la travatura sta sotto il piano. */
  readonly baseZ: number;
  /** Voxel occupati in altezza: `deckZ - baseZ + 1`. */
  readonly height: number;
  readonly piers: readonly Pier[];
  /** Gli edifici su cui qualche gamba poggia, in ordine crescente di id. */
  readonly carriers: readonly number[];
  readonly segments: readonly DeckRect[];
}

export type DeckResult =
  | { readonly ok: true; readonly plan: DeckPlan }
  | { readonly ok: false; readonly refusal: DeckRefusal };

function refuse(refusal: DeckRefusal): DeckResult {
  return { ok: false, refusal };
}

/** Prima quota occupata da un impalcato il cui piano calpestabile sta a `deckZ`. */
export function deckBaseZ(deckZ: number, drop = 0): number {
  return deckZ - AERIAL.girderDepth - drop;
}

export function planDeck(query: DeckQuery): DeckResult {
  const { rect, deckZ } = query;
  const drop = query.drop ?? 0;
  const baseZ = deckBaseZ(deckZ, drop);
  const height = DECK_HEIGHT + drop;

  // Il volume dev'essere tutto aria. E' cio' che rende sicura la cancellazione:
  // finche' nel riquadro non c'e' altro che l'impalcato, toglierlo e' svuotare
  // quel riquadro.
  for (let z = baseZ; z < baseZ + height; z++) {
    for (let dy = 0; dy < rect.sizeY; dy++) {
      for (let dx = 0; dx < rect.sizeX; dx++) {
        if (query.solid(rect.x + dx, rect.y + dy, z)) return refuse('blocked');
      }
    }
  }

  // **Il franco si misura dalla trave, non dal piano**: e' il punto piu' basso
  // della struttura, ed e' quello che tocca chi passa sotto. Vale su ogni
  // colonna, tetti compresi: un percorso che sfiora la copertura di un edificio
  // e' un ostacolo, non un piano di citta'.
  //
  // **Si guarda in giu' con `solid`, non con `top`.** Sono due domande diverse:
  // `top` dice quanto e' alta la colonna, e sopra un edificio sta *sopra* la
  // quota dell'impalcato — una mensola che sporge da una parete ha per
  // definizione la cima del proprio ospite sopra di se'. Cio' che conta e' che
  // sotto la trave ci sia aria, e a dirlo e' il solo predicato del vuoto.
  for (let dy = 0; dy < rect.sizeY; dy++) {
    for (let dx = 0; dx < rect.sizeX; dx++) {
      const x = rect.x + dx;
      const y = rect.y + dy;
      if (query.ground(x, y).height + AERIAL.minRise > deckZ) return refuse('tooLow');
      for (let z = baseZ - AERIAL.clearance; z < baseZ; z++) {
        if (query.solid(x, y, z)) return refuse('tooLow');
      }
    }
  }

  const legs = placeLegs(query, baseZ);
  if (typeof legs === 'string') return refuse(legs);

  return {
    ok: true,
    plan: {
      rect,
      deckZ,
      baseZ,
      height,
      piers: legs,
      carriers: [...new Set(legs.map((pier) => pier.carrier))]
        .filter((id) => id !== 0)
        .sort((a, b) => a - b),
      segments: tileDeck(rect),
    },
  };
}

/**
 * Le gambe che il riquadro chiede, e nient'altro.
 *
 * **E' l'unico posto in cui si decide dove nasce un appoggio, e non ha un ramo
 * per ciascuna forma.** Si misura lo sbalzo di ogni colonna dagli ancoraggi; la
 * colonna piu' sbilanciata chiede una gamba; la gamba diventa a sua volta
 * ancoraggio e si rimisura. Si ferma quando nessuna colonna e' oltre `reach` —
 * il che, su una mensola corta, succede prima di piantare qualsiasi cosa.
 *
 * L'avidita' e' voluta: mettere la gamba sotto il punto peggiore e' anche il modo
 * in cui si ragiona a mano, e a queste dimensioni — riquadri da qualche decina di
 * colonne — la differenza con una distribuzione ottima non si vede.
 */
function placeLegs(query: DeckQuery, baseZ: number): Pier[] | DeckRefusal {
  const { rect } = query;
  const anchors = [...query.anchors];
  const piers: Pier[] = [];

  // Un giro per gamba, e le gambe sono al piu' una ogni `reach` colonne per lato:
  // il tetto e' largo e serve solo a garantire la terminazione.
  const rounds = Math.ceil(rect.sizeX / 2) * Math.ceil(rect.sizeY / 2) + 1;
  for (let round = 0; round < rounds; round++) {
    const worst = farthestColumn(rect, anchors);
    if (worst === null) return piers;

    if (rect.sizeX < AERIAL.pierSide || rect.sizeY < AERIAL.pierSide) return 'tooNarrow';

    const footing = plantLeg(query, worst, baseZ);
    if (typeof footing === 'string') return footing;

    piers.push(footing);
    anchors.push({ x: footing.x, y: footing.y, sizeX: AERIAL.pierSide, sizeY: AERIAL.pierSide });
  }
  // Esaurito il tetto dei giri con una colonna ancora sbilanciata. Non dovrebbe
  // succedere — ogni gamba copre almeno il proprio intorno — ma se succedesse la
  // risposta e' un rifiuto, non un impalcato sospeso: il vincolo della fase non
  // ammette il caso "quasi".
  return 'noFooting';
}

/**
 * La colonna piu' lontana da qualunque ancoraggio, se e' oltre lo sbalzo ammesso.
 *
 * La distanza e' di Chebyshev come tutto il resto del progetto — il campo di
 * desiderabilita', il raggio dei vicini — e a parita' vince la colonna piu' in
 * basso e piu' a sinistra: senza un ordine dichiarato la stessa citta' con lo
 * stesso seme metterebbe le gambe in due posti diversi.
 */
function farthestColumn(
  rect: DeckRect,
  anchors: readonly DeckRect[],
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance: number = AERIAL.reach;

  for (let dy = 0; dy < rect.sizeY; dy++) {
    for (let dx = 0; dx < rect.sizeX; dx++) {
      const x = rect.x + dx;
      const y = rect.y + dy;
      let distance = Number.POSITIVE_INFINITY;
      for (const anchor of anchors) {
        const value = chebyshevTo(anchor, x, y);
        if (value < distance) distance = value;
      }
      if (distance > bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** Distanza di Chebyshev da un punto al riquadro, zero se ci sta dentro. */
function chebyshevTo(rect: DeckRect, x: number, y: number): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.sizeX - 1));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.sizeY - 1));
  return Math.max(dx, dy);
}

/**
 * La gamba che regge quella colonna, cercandole un appoggio degno.
 *
 * **Una gamba si sposta per trovare un tetto.** Il piede si prova prima sotto la
 * colonna e poi tutt'intorno, fino a `AERIAL.nudge`, e vince il primo che poggia
 * su un edificio; solo se non ce n'e' nessuno la gamba scende nel prato. Non e'
 * un vezzo: e' la correzione dell'errore misurato del primo tentativo, in cui le
 * gambe piantate nei cuori d'isolato toglievano alla piazza della 4.5 il luogo
 * per cui esiste.
 */
function plantLeg(
  query: DeckQuery,
  at: { x: number; y: number },
  baseZ: number,
): Pier | DeckRefusal {
  const { rect } = query;
  let fallback: Pier | null = null;
  let refusal: DeckRefusal = 'noFooting';

  for (const [ox, oy] of nudgeOffsets()) {
    const x = clamp(at.x + ox, rect.x, rect.x + rect.sizeX - AERIAL.pierSide);
    const y = clamp(at.y + oy, rect.y, rect.y + rect.sizeY - AERIAL.pierSide);

    const footing = surveyFooting(query, x, y);
    if (footing === 'street') {
      refusal = 'onStreet';
      continue;
    }
    if (footing === 'taken') continue;

    const height = baseZ - footing.baseZ;
    if (height <= 0) continue;
    if (height > AERIAL.maxPierHeight) {
      refusal = 'tooTall';
      continue;
    }

    const pier: Pier = { x, y, baseZ: footing.baseZ, height, carrier: footing.carrier };
    // Un tetto e' l'appoggio giusto e si prende subito. Il prato si tiene da
    // parte: vale solo se nessuna posizione trova di meglio.
    if (footing.carrier !== 0) return pier;
    if (fallback === null) fallback = pier;
  }

  return fallback ?? refusal;
}

/**
 * Gli scostamenti con cui si cerca un piede, dal centro verso fuori.
 *
 * A raggio crescente e a giro fisso: e' l'ordine che rende la scelta una funzione
 * del solo luogo, senza consumare tiri di PRNG in una regola che deve restare
 * pura.
 */
function nudgeOffsets(): readonly (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [[0, 0]];
  for (let radius = 1; radius <= AERIAL.nudge; radius++) {
    out.push([radius, 0], [-radius, 0], [0, radius], [0, -radius]);
  }
  return out;
}

/**
 * Il piede di una gamba, o perche' non ce n'e' uno.
 *
 * **Il piede dev'essere un piano solo.** Una gamba che poggia per meta' su un
 * tetto e per meta' sul prato e' appesa a mezz'aria da un lato, cioe' la
 * struttura sospesa senza appoggi reali che il vincolo della fase vieta. Una
 * gamba e' larga esattamente un cubo di terreno, quindi al suolo la condizione e'
 * soddisfatta per costruzione — il terreno quantizza in pianta *e* in quota — e
 * sopra un tetto lo e' dove il tetto e' piano.
 */
export function surveyFooting(
  probe: AerialProbe,
  x: number,
  y: number,
): { baseZ: number; carrier: number } | 'taken' | 'street' {
  let baseZ = -1;
  let carrier = 0;

  for (let dy = 0; dy < AERIAL.pierSide; dy++) {
    for (let dx = 0; dx < AERIAL.pierSide; dx++) {
      const column = probe.ground(x + dx, y + dy);
      // Una gamba in mezzo alla carreggiata e' un ostacolo alto quanto un
      // isolato: e' lo stesso rifiuto che un mezzanino riceve sopra una strada.
      if (column.pavement) return 'street';
      // Al suolo il terreno deve reggere. Sopra un tetto la domanda non si pone:
      // quel piano lo regge gia' l'edificio che l'ha costruito.
      if (column.carrier === 0 && (!column.free || !column.firm)) return 'taken';
      if (baseZ === -1) {
        baseZ = column.top;
        carrier = column.carrier;
        continue;
      }
      if (column.top !== baseZ || column.carrier !== carrier) return 'taken';
    }
  }
  return { baseZ, carrier };
}

/**
 * I riquadri in cui la comparsa di un impalcato si spezza.
 *
 * E' la stessa idea di `tileSegments` in `spans/`, con il passo di questo
 * dominio: le due non si condividono perche' i due passi rispondono a due
 * strutture diverse — una corsa lunga e stretta, un piano quadrato — e legarle
 * significherebbe che cambiare il taglio di una sposta il picco di scrittura
 * dell'altra.
 */
export function tileDeck(rect: DeckRect): readonly DeckRect[] {
  const out: DeckRect[] = [];
  for (let dy = 0; dy < rect.sizeY; dy += AERIAL.segmentSide) {
    for (let dx = 0; dx < rect.sizeX; dx += AERIAL.segmentSide) {
      out.push({
        x: rect.x + dx,
        y: rect.y + dy,
        sizeX: Math.min(AERIAL.segmentSide, rect.sizeX - dx),
        sizeY: Math.min(AERIAL.segmentSide, rect.sizeY - dy),
      });
    }
  }
  return out;
}

/** true se i due riquadri si sovrappongono in pianta. */
export function rectsOverlap(a: DeckRect, b: DeckRect): boolean {
  return a.x < b.x + b.sizeX && b.x < a.x + a.sizeX &&
    a.y < b.y + b.sizeY && b.y < a.y + a.sizeY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
