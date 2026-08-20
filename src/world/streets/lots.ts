import { FACING, type BlockRect, type Facing } from './streetGrid';

/**
 * Come un candidato della simulazione diventa un lotto sul fronte strada.
 *
 * **La simulazione propone un isolato, non una colonna.** `nextBuildSites`
 * ragiona per cella e non sa cosa sia un'impronta, una carreggiata o un fronte:
 * i suoi candidati cadono per due terzi nel cuore degli isolati, dove un
 * edificio resterebbe circondato da altri edifici e senza un accesso. Invece di
 * scartarli — che farebbe crollare il ritmo della crescita, gia' protetto da
 * `candidateOverfetch` — la colonna proposta si legge come "questo isolato
 * vuole un edificio di questo uso", e il lotto si cerca sul suo perimetro.
 *
 * **Il fronte piu' vicino vince.** I quattro lati si provano in ordine di
 * distanza dalla colonna proposta, e lungo il lato scelto si scorre partendo
 * dalla posizione preferita verso l'esterno. L'edificio nasce quindi il piu'
 * vicino possibile a dove la desiderabilita' lo voleva, ma sempre su strada.
 *
 * **Puro.** Nessun PRNG, nessuno stato, nessun mondo: la disponibilita' entra
 * come predicato. E' cio' che rende questa regola verificabile senza terreno e
 * che tiene la scelta indipendente dall'ordine in cui gli isolati si riempiono.
 */

export interface LotRequest {
  /** Riquadro edificabile dell'isolato, estremi inclusi. */
  readonly rect: BlockRect;
  /** Colonna proposta dalla simulazione: decide da quale fronte si comincia. */
  readonly x: number;
  readonly y: number;
  /** Lato massimo desiderato. Il lotto puo' uscire piu' stretto, mai piu' largo. */
  readonly footprint: number;
  /** true se il quadrato di lato `footprint` ancorato qui e' libero e costruibile. */
  readonly accepts: (x: number, y: number, footprint: number) => boolean;
}

export interface Lot {
  /** Angolo minimo del lotto. */
  readonly x: number;
  readonly y: number;
  readonly footprint: number;
  /** Verso cui l'edificio si affaccia: il lato di strada che il lotto tocca. */
  readonly facing: Facing;
}

/**
 * Lotto piu' vicino alla colonna proposta, o null se l'isolato non ne ha piu'.
 *
 * Il lato si riduce solo dopo aver provato tutti e quattro i fronti: un lotto
 * stretto su strada vale piu' di un lotto largo in mezzo all'isolato, perche' e'
 * l'allineamento a leggersi da lontano, non la dimensione.
 */
export function placeLot(request: LotRequest): Lot | null {
  const { rect } = request;
  const width = rect.x1 - rect.x0 + 1;
  const height = rect.y1 - rect.y0 + 1;
  const largest = Math.min(request.footprint, width, height);

  for (let footprint = largest; footprint >= 1; footprint--) {
    for (const facing of edgeOrder(request)) {
      const lot = slideAlongEdge(request, facing, footprint);
      if (lot !== null) return lot;
    }
  }

  return null;
}

/**
 * I quattro fronti, dal piu' vicino alla colonna proposta al piu' lontano.
 *
 * A parita' di distanza decide l'indice della direzione: senza un ordine totale
 * il lotto scelto dipenderebbe dall'ordine di enumerazione, che e' esattamente
 * il tipo di dipendenza nascosta che rompe il determinismo.
 */
function edgeOrder(request: LotRequest): readonly Facing[] {
  const { rect, x, y } = request;
  const ranked = [
    { facing: FACING.east, distance: rect.x1 - x },
    { facing: FACING.west, distance: x - rect.x0 },
    { facing: FACING.north, distance: rect.y1 - y },
    { facing: FACING.south, distance: y - rect.y0 },
  ];
  ranked.sort((a, b) => a.distance - b.distance || a.facing - b.facing);
  return ranked.map((entry) => entry.facing);
}

/**
 * Primo lotto libero lungo un fronte, partendo dalla posizione preferita.
 *
 * L'ancora sul lato scelto e' fissa — e' cio' che fa combaciare l'edificio con
 * la carreggiata — mentre l'altra coordinata scorre. Si prova prima la
 * posizione preferita, poi alternativamente in avanti e indietro: il risultato
 * e' un fronte che si riempie a partire da dove la desiderabilita' era piu'
 * alta, invece che da un capo all'altro.
 */
function slideAlongEdge(request: LotRequest, facing: Facing, footprint: number): Lot | null {
  const { rect } = request;
  // Est e ovest bloccano `x` e fanno scorrere `y`; nord e sud il contrario.
  const slidesAlongY = facing === FACING.east || facing === FACING.west;

  const fixed = facing === FACING.east
    ? rect.x1 - footprint + 1
    : facing === FACING.west
      ? rect.x0
      : facing === FACING.north
        ? rect.y1 - footprint + 1
        : rect.y0;

  const min = slidesAlongY ? rect.y0 : rect.x0;
  const max = (slidesAlongY ? rect.y1 : rect.x1) - footprint + 1;
  if (max < min) return null;

  const preferred = clamp(slidesAlongY ? request.y : request.x, min, max);

  for (let step = 0; step <= max - min; step++) {
    for (const sign of step === 0 ? CENTRE : BOTH) {
      const along = preferred + sign * step;
      if (along < min || along > max) continue;

      const x = slidesAlongY ? fixed : along;
      const y = slidesAlongY ? along : fixed;
      if (request.accepts(x, y, footprint)) return { x, y, footprint, facing };
    }
  }

  return null;
}

/** Al passo zero c'e' una sola posizione: provarla due volte la valuterebbe due volte. */
const CENTRE: readonly number[] = [0];
/** In avanti prima che indietro, per fissare l'ordine a parita' di distanza. */
const BOTH: readonly number[] = [1, -1];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
