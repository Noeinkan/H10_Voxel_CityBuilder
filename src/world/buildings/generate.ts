import { BUILDING_CLASS, type BuildingClass } from '../../sim';
import { hashCoords, mulberry32 } from '../rng';
import {
  BAND_OP,
  BUILDER,
  CLASS_PROFILE,
  CROWN_KIND,
  DEFAULT_BUILDING_FORM,
  DEFAULT_TYPOLOGY_SHAPE,
  GRAMMAR,
  LEVEL_CAPS,
  MAX_FOOTPRINT,
  MIN_FOOTPRINT,
  START_LEVEL_CDF,
  type BandOp,
  type CrownKind,
  type ClassProfile,
  type BuildingForm,
  type TypologyShape,
} from './config';
import type { VoxelStamp } from './stamp';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';

/**
 * Generatore procedurale di edifici.
 *
 * **Non conosce il mondo.** Nessun import di Three.js, nessun `VoxelWorld`,
 * nessuna coordinata di mondo: entra una tripla `(class, level, seed)` ed esce
 * uno stamp. E' cio' che rende il generatore verificabile in Node senza mondo e
 * senza terreno, e che permette al Builder di rigenerare l'impronta di un
 * edificio che ha costruito mille tick fa per cancellarla voxel per voxel senza
 * averla conservata.
 *
 * **Scheletro, non forme fisse.** Non esiste un catalogo di modelli. Esiste una
 * regola: una fascia si calcola dalla fascia sotto di se', con una trasformazione
 * scelta dal PRNG e pesata dal profilo. Le rientranze, le terrazze e le mensole
 * sono cio' che resta quando si applica quella regola cinque volte di fila, non
 * qualcosa che qualcuno ha disegnato.
 *
 * **Le trasformazioni stanno in tabella, non nel codice.** Il repertorio e'
 * `BAND_OP`, e quali voci un edificio prova — e in che ordine — arriva dal
 * profilo. E' cio' che ha tolto di mezzo l'ultimo caso speciale: il basamento
 * non e' piu' un ramo del ciclo ma `keep` ripetuto, e il corpo sovrapposto di
 * una torre civica e' `stack` in testa al repertorio, non un secondo generatore.
 *
 * **La tipologia piega la regola, non la sostituisce.** Il generatore non sa
 * che le tipologie esistono: riceve un profilo di disegno gia' fuso — repertorio
 * compreso — e quattro interruttori strutturali: podio, corte, forma del
 * coronamento e giardino pensile. Chi sceglie *quale* tipologia e' `typology.ts`,
 * e sta a monte.
 *
 * **Determinismo.** Tutto il caso esce da un solo PRNG con stato iniziale
 * `hash(class, level, seed)`. Due chiamate con gli stessi argomenti consumano la
 * stessa sequenza nello stesso ordine, quindi producono lo stesso array di byte.
 */

/** Rettangolo di una fascia dentro il riquadro dell'impronta, estremi esclusi in alto. */
interface BandRect {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Impronta voxel di un edificio.
 *
 * Il riquadro dello stamp coincide con l'impronta dichiarata al registry, e la
 * fascia di base lo riempie per intero. E' un vincolo che si paga in varieta' e
 * si riprende in solidita': la collisione fra edifici resta un confronto fra due
 * riquadri, e la fondazione livella esattamente le colonne che l'edificio
 * occupa, senza spianare terreno che poi resta scoperto.
 */
export interface BuildingRequest {
  /** Uso urbano primario: decide il profilo di base e la grammatica di superficie. */
  readonly class: BuildingClass;
  readonly level: number;
  readonly seed: number;
  readonly footprintCap?: number;
  readonly footprintFloor?: number;
  readonly form?: BuildingForm;
  /**
   * Profilo di disegno gia' fuso con quello della tipologia. Senza, quello
   * dell'uso: un edificio resta disegnabile anche fuori dal catalogo.
   */
  readonly profile?: ClassProfile;
  readonly shape?: TypologyShape;
  /**
   * Secondo uso ospitato. Colora il podio e gli da' la propria grammatica di
   * superficie: e' cosi' che un edificio misto si legge come misto da fuori,
   * senza bisogno di una zona, di un'etichetta o di un colore in piu'.
   */
  readonly mixed?: BuildingClass;
  /**
   * Altezza in voxel del corso di base condiviso con gli edifici in fila.
   *
   * E' l'unica cosa che l'aggregazione impone alla grammatica, e la impone alla
   * **sola fascia zero**: sopra, ogni membro resta se stesso. La fascia zero e'
   * gia' il riquadro pieno, quindi non serve forzarne la forma — basta la quota,
   * ed e' quella a far cadere l'arretramento di `forcedOp` alla stessa altezza su
   * tutta la fila. Assente quando l'edificio non e' in fila; il valore, quando
   * c'e', e' positivo.
   */
  readonly baseBandHeight?: number;
  /**
   * Faccia che guarda la strada, negli indici di `accentFace`.
   *
   * Senza, la faccia d'accento e il portale a piano terra escono dal PRNG e
   * finiscono una volta su quattro contro il cuore dell'isolato — cioe' con
   * l'ingresso murato verso il giardino interno. Con la rete stradale
   * l'orientamento smette di essere un tiro e diventa un dato del luogo.
   */
  readonly facing?: number;
}

export function generateBuilding(request: BuildingRequest): VoxelStamp {
  const cls = request.class;
  const level = request.level;
  const form = request.form ?? DEFAULT_BUILDING_FORM;
  const shape = request.shape ?? DEFAULT_TYPOLOGY_SHAPE;
  const caps = LEVEL_CAPS[clamp(level, 0, LEVEL_CAPS.length - 1)];
  const baseProfile = request.profile ?? CLASS_PROFILE[cls];
  const profile: ClassProfile = {
    ...baseProfile,
    footprintBias: baseProfile.footprintBias + Math.round(
      form.accessibility * BUILDER.localForm.accessibilityFootprintBias,
    ),
    shrinkBias: clamp(
      baseProfile.shrinkBias +
        form.satisfaction * BUILDER.localForm.satisfactionTerraceBias +
        form.wealth * BUILDER.localForm.wealthTerraceBias,
      0,
      1,
    ),
  };
  const random = mulberry32(hashCoords(request.seed, cls, level));

  // Il tiro pesca sempre da `MAX_FOOTPRINT` e solo dopo si taglia al tetto.
  // Cosi' la sequenza del PRNG non dipende dal tetto, e rigenerare un edificio
  // passando la sua stessa impronta restituisce esattamente lo stamp di prima:
  // e' cio' che permette al Builder di cancellare un edificio senza averne
  // conservato i voxel.
  const cap = Math.min(caps.maxFootprint, request.footprintCap ?? MAX_FOOTPRINT, shape.maxFootprint);
  const minFootprint = Math.min(
    Math.max(caps.minFootprint, request.footprintFloor ?? 1, shape.minFootprint),
    cap,
  );
  const naturalFootprint = clamp(
    MIN_FOOTPRINT + Math.floor(random() * (MAX_FOOTPRINT - MIN_FOOTPRINT + 1)) + profile.footprintBias,
    MIN_FOOTPRINT,
    MAX_FOOTPRINT,
  );
  const footprint = clamp(naturalFootprint, minFootprint, cap);
  const naturalBands = pickInt(random, caps.minBands, caps.maxBands);
  const bands = clamp(
    naturalBands + Math.floor(form.density * BUILDER.localForm.densityBandBias),
    caps.minBands,
    caps.maxBands,
  );

  // L'accento a scala di edificio si decide qui, prima di disegnare: e' un
  // colore di corpo alternativo, non una passata di ritocco alla fine.
  const accented = random() < BUILDER.accentBuildingChance +
    form.wealth * BUILDER.localForm.wealthAccentChance;
  const body = accented ? profile.accent : profile.body;
  // La cornice mantiene il proprio tono anche quando l'accento sale a scala di
  // edificio: usare qui `body` renderebbe la faccia d'accento invisibile sulle
  // fasce piu' basse, dove cornice e faccia finirebbero nello stesso slot.
  const bodyAlt = profile.bodyAlt;

  // La faccia d'accento resta sempre diversa dal corpo: su un edificio gia'
  // accentato prende il colore normale, che e' comunque un contrasto.
  // Il tiro si consuma comunque, anche quando l'orientamento arriva da fuori:
  // e' la stessa regola del dettaglio sul tetto sotto un coronamento piatto.
  // Cosi' due edifici sullo stesso seme restano confrontabili, e dare una
  // strada a un lotto non ne cambia la sagoma — solo il verso.
  const rolledFace = pickInt(random, 0, 3);
  const accentFace = request.facing ?? rolledFace;
  const accentId = accented ? profile.body : profile.accent;

  const rects: BandRect[] = [];
  const heights: number[] = [];

  // Il basamento non e' piu' un ramo del ciclo: e' `keep` ripetuto, cioe' una
  // delle trasformazioni della tabella applicata piu' volte di fila. Sopra
  // l'ultima fascia piena arriva un arretramento netto — `shrink` — ed e' quel
  // gradino a rendere un podio commerciale con abitazioni riconoscibile da
  // lontano, dove una rientranza graduale si leggerebbe come una torre qualunque.
  const full: BandRect = { x0: 0, y0: 0, w: footprint, h: footprint };
  const podium = Math.min(shape.podiumBands, bands - 1);
  let rect: BandRect = full;
  for (let i = 0; i < bands; i++) {
    if (i > 0) rect = nextRect(random, rect, footprint, profile, forcedOp(i, podium));
    rects.push(rect);
    // Le fasce del basamento pescano l'altezza come tutte le altre. Prima erano
    // bloccate al minimo, e un basamento "abitato" senza piani di altezza propria
    // resta un blocco: sono l'altezza e il marcapiano a farne un piano.
    const rolled = pickInt(random, profile.bandHeight[0], profile.bandHeight[1]);
    // Il corso di base di una fila **sostituisce** il tiro della fascia zero, ma
    // non lo salta: la sequenza del PRNG resta quella di prima, quindi entrare in
    // un cluster cambia la quota dell'edificio e non la sua sagoma. E' la stessa
    // regola del verso d'accento, che si consuma anche quando arriva dalla rete.
    heights.push(i === 0 && request.baseBandHeight !== undefined
      ? request.baseBandHeight
      : rolled);
  }

  // Coronamento: chiude la silhouette invece di lasciarla tagliata di netto, che
  // a distanza legge come un edificio in costruzione. Quante fasce servano e
  // quanto siano alte lo dice `crownRects`, che e' l'unica cosa a cambiare fra
  // un capannone, un gradone e la lanterna di un civico.
  const crownStart = rects.length;
  const crownHeight = pickInt(random, GRAMMAR.crownHeight[0], GRAMMAR.crownHeight[1]);
  const crown = crownBands(shape.crownKind, rect, crownHeight);
  for (const band of crown.bands) {
    rects.push(band.rect);
    heights.push(band.height);
  }
  const crownRect = crown.bands[crown.bands.length - 1].rect;

  // Un solo dettaglio verticale chiude la silhouette senza introdurre rumore
  // per-voxel: camino, sfiato o antenna dipendono dal profilo. I tiri si
  // consumano comunque, anche sui coronamenti che il dettaglio non lo portano:
  // cosi' la tipologia sceglie la forma e non la sequenza, e due tipologie sullo
  // stesso seme restano confrontabili.
  const propSide = Math.min(GRAMMAR.roofPropSide, crownRect.w, crownRect.h);
  const propRect: BandRect = {
    x0: crownRect.x0 + Math.floor(random() * (crownRect.w - propSide + 1)),
    y0: crownRect.y0 + Math.floor(random() * (crownRect.h - propSide + 1)),
    w: propSide,
    h: propSide,
  };
  rects.push(propRect);
  heights.push(crown.roofProp ? profile.roofPropHeight : 0);

  const podiumProfile = request.mixed !== undefined && podium > 0
    ? CLASS_PROFILE[request.mixed]
    : null;
  return paint({
    rects,
    heights,
    footprint,
    level,
    body,
    bodyAlt,
    accentId,
    accentFace,
    crown: profile.crown,
    plinth: profile.plinth,
    roofProp: profile.roofProp,
    terrace: profile.terrace,
    garden: shape.roofGarden ? profile.garden : null,
    surface: classSurface(cls),
    courtyard: shape.courtyard,
    crownStart,
    podium,
    podiumBody: podiumProfile?.body ?? null,
    podiumAlt: podiumProfile?.bodyAlt ?? null,
    podiumSurface: request.mixed !== undefined ? classSurface(request.mixed) : classSurface(cls),
  });
}

/**
 * Trasformazione imposta dalla posizione della fascia, o `null` se la sceglie il
 * repertorio.
 *
 * E' tutto cio' che resta dei tre rami che il ciclo delle fasce aveva prima. Il
 * basamento e' `keep` ripetuto e l'arretramento sopra di esso e' `shrink`: due
 * voci della stessa tabella da cui il repertorio pesca, non due eccezioni.
 */
function forcedOp(index: number, podium: number): BandOp | null {
  if (index < podium) return BAND_OP.keep;
  if (index === podium && podium > 0) return BAND_OP.shrink;
  return null;
}

/**
 * Trasforma la fascia precedente in quella sopra.
 *
 * Le trasformazioni candidate vengono provate nell'ordine del repertorio e si
 * prende la prima che regge: il seed sceglie *quale* forma, non *se* la forma
 * sta in piedi. La fascia di base resta il riquadro pieno, quindi nessuna fascia
 * puo' uscire dall'impronta e la collisione fra edifici resta bidimensionale.
 *
 * **Le candidate si costruiscono tutte, sempre.** Chi consuma tiri li consuma
 * anche quando la sua candidata verra' scartata: la sequenza del PRNG dipende
 * dal repertorio, mai dall'esito di un vincolo. Senza, un'impronta stretta
 * cambierebbe la sagoma di tutte le fasce sopra di se'.
 */
function nextRect(
  random: () => number,
  prev: BandRect,
  footprint: number,
  profile: ClassProfile,
  forced: BandOp | null,
): BandRect {
  const ops = forced !== null
    ? [forced]
    : random() < profile.shrinkBias ? profile.shrinkOps : profile.growOps;
  const candidates = ops.map((op) => applyOp(random, op, prev));

  for (const candidate of candidates) {
    if (candidate.w < GRAMMAR.minBandSide || candidate.h < GRAMMAR.minBandSide) continue;
    if (candidate.x0 < 0 || candidate.y0 < 0) continue;
    if (candidate.x0 + candidate.w > footprint || candidate.y0 + candidate.h > footprint) continue;
    if (!supported(candidate, prev)) continue;
    return candidate;
  }

  // Nessuna trasformazione regge: la fascia ripete quella sotto. Succede sulle
  // impronte strette, dove non c'e' spazio per muoversi.
  return prev;
}

/** Applica una voce del repertorio. Chi non consuma tiri, non ne consuma. */
function applyOp(random: () => number, op: BandOp, prev: BandRect): BandRect {
  switch (op) {
    case BAND_OP.keep:
      return prev;
    case BAND_OP.shrink:
      return shrink(prev);
    case BAND_OP.shrinkOneSide:
      return shrinkOneSide(random, prev);
    case BAND_OP.jog:
      return jog(random, prev);
    case BAND_OP.grow:
      return grow(random, prev);
    case BAND_OP.setback:
      return setback(random, prev);
    default:
      return stack(prev);
  }
}

/**
 * Fasce del coronamento e presenza del dettaglio verticale.
 *
 * Il coronamento era un booleano e produceva due sole cime per tutta la citta'.
 * Qui e' una tabella, e ogni voce risponde alla stessa domanda con una geometria
 * diversa: quante fasce, quanto strette, quanto alte. Il tiro dell'altezza
 * arriva gia' fatto da fuori, cosi' resta consumato anche dalle voci che non lo
 * usano.
 */
function crownBands(
  kind: CrownKind,
  top: BandRect,
  height: number,
): { bands: readonly { rect: BandRect; height: number }[]; roofProp: boolean } {
  switch (kind) {
    case CROWN_KIND.flat:
      // Non rientra affatto: su un'impronta stretta `shrink` lascerebbe un
      // cappello minuscolo, cioe' proprio la guglia che una tipologia a tetto
      // piano non deve avere. Un capannone finisce largo quanto lui.
      return { bands: [{ rect: top, height: GRAMMAR.flatCrownHeight }], roofProp: false };
    case CROWN_KIND.stepped:
      // Due gradini, il secondo piu' basso: la cima si legge come una scala e
      // non come una punta, ed e' la sola forma che continua verso l'alto il
      // racconto degli arretramenti sotto.
      return {
        bands: [
          { rect: shrink(top), height: GRAMMAR.flatCrownHeight },
          { rect: shrink(shrink(top)), height: GRAMMAR.flatCrownHeight },
        ],
        roofProp: false,
      };
    case CROWN_KIND.ridge:
      // Rientra su un asse solo, e sul lato lungo resta larga quanto il corpo:
      // e' la copertura di un mercato o di un deposito vista di fianco.
      return { bands: [{ rect: shrinkAxis(top), height: GRAMMAR.flatCrownHeight }], roofProp: false };
    case CROWN_KIND.lantern:
      // L'unica cima che sale invece di chiudere. Rientra di due per lato e si
      // porta dietro il supplemento: senza, resterebbe un cappello basso e
      // stretto, cioe' il contrario di una torretta.
      return {
        bands: [{ rect: shrink(shrink(top)), height: height + GRAMMAR.lanternRise }],
        roofProp: true,
      };
    default:
      return { bands: [{ rect: shrink(top), height }], roofProp: true };
  }
}

/**
 * true se la fascia poggia su almeno meta' della propria area.
 *
 * E' il vincolo che tiene insieme una mensola e un blocco sospeso. Senza, due
 * spostamenti di un voxel nella stessa direzione staccherebbero la fascia dal
 * suo appoggio, e l'edificio avrebbe un pezzo per aria.
 */
function supported(rect: BandRect, below: BandRect): boolean {
  const overlapX = Math.min(rect.x0 + rect.w, below.x0 + below.w) - Math.max(rect.x0, below.x0);
  const overlapY = Math.min(rect.y0 + rect.h, below.y0 + below.h) - Math.max(rect.y0, below.y0);
  if (overlapX <= 0 || overlapY <= 0) return false;
  return overlapX * overlapY * 2 >= rect.w * rect.h;
}

/**
 * Rientranza centrata di un voxel per lato, che non svuota mai il rettangolo.
 *
 * Il minimo a 1 non e' una comodita': un lato di due voxel rientrato di uno per
 * parte resterebbe largo zero, e il coronamento sparirebbe proprio sugli
 * edifici piu' piccoli — dove si nota di piu', perche' la loro silhouette e'
 * quasi tutta cima.
 */
function shrink(rect: BandRect): BandRect {
  const w = Math.max(1, rect.w - 2);
  const h = Math.max(1, rect.h - 2);
  return {
    x0: rect.x0 + ((rect.w - w) >> 1),
    y0: rect.y0 + ((rect.h - h) >> 1),
    w,
    h,
  };
}

/** Rientranza di un voxel su un lato solo: produce le terrazze asimmetriche. */
function shrinkOneSide(random: () => number, rect: BandRect): BandRect {
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 + 1, w: rect.w - 1 };
    case 1:
      return { ...rect, w: rect.w - 1 };
    case 2:
      return { ...rect, y0: rect.y0 + 1, h: rect.h - 1 };
    default:
      return { ...rect, h: rect.h - 1 };
  }
}

/** Scarto laterale di un voxel a parita' di dimensione: la fascia sporge da un lato. */
function jog(random: () => number, rect: BandRect): BandRect {
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 + 1 };
    case 1:
      return { ...rect, x0: rect.x0 - 1 };
    case 2:
      return { ...rect, y0: rect.y0 + 1 };
    default:
      return { ...rect, y0: rect.y0 - 1 };
  }
}

/** Allargamento di un voxel su un lato, dentro il riquadro. */
function grow(random: () => number, rect: BandRect): BandRect {
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 - 1, w: rect.w + 1 };
    case 1:
      return { ...rect, w: rect.w + 1 };
    case 2:
      return { ...rect, y0: rect.y0 - 1, h: rect.h + 1 };
    default:
      return { ...rect, h: rect.h + 1 };
  }
}

/**
 * Arretramento di due voxel su un lato: la rientranza in cui ci si sta.
 *
 * Un voxel di scarto lascia un anello largo uno, che a distanza di gioco e' un
 * gradino e non una terrazza — e infatti `terraceMinSide` lo scarta. Due voxel
 * sono un cubo di terreno intero: e' la piu' piccola rientranza che la
 * pavimentazione, il parapetto e un giardino riescono a raccontare.
 */
function setback(random: () => number, rect: BandRect): BandRect {
  switch (pickInt(random, 0, 3)) {
    case 0:
      return { ...rect, x0: rect.x0 + 2, w: rect.w - 2 };
    case 1:
      return { ...rect, w: rect.w - 2 };
    case 2:
      return { ...rect, y0: rect.y0 + 2, h: rect.h - 2 };
    default:
      return { ...rect, h: rect.h - 2 };
  }
}

/**
 * Corpo sovrapposto: rientra di due per lato e si ricentra.
 *
 * Non consuma tiri, come `shrink`, ed e' voluto: `stack` deve dare *sempre* la
 * stessa cosa — una torre che riparte, non una torre che si sposta. Il ricentro
 * garantisce l'appoggio su tutta l'area, quindi `supported` passa per
 * costruzione e la mensola non c'entra: qui non sporge niente.
 */
function stack(rect: BandRect): BandRect {
  const w = rect.w - 4;
  const h = rect.h - 4;
  // Il corpo che riparte deve restare un corpo: sotto `MIN_FOOTPRINT` non e' un
  // volume nuovo ma il resto del precedente, e su una torre alta `stack` a ogni
  // fascia porterebbe la cima a un voxel in quattro passi. Chiedere che il
  // risultato sia ancora un edificio limita l'operazione a una o due volte per
  // silhouette senza contare nulla: e' la geometria a esaurirla.
  if (w < MIN_FOOTPRINT || h < MIN_FOOTPRINT) return { ...rect, w: 0, h: 0 };
  return { x0: rect.x0 + 2, y0: rect.y0 + 2, w, h };
}

/**
 * Rientranza di un voxel per lato sul solo asse corto.
 *
 * Serve al coronamento `ridge` e a nient'altro: rientrare su entrambi gli assi
 * darebbe un cappello, rientrare sull'asse lungo darebbe una lama. A parita' di
 * lato sceglie x, cosi' resta una funzione della sola forma e non del seme.
 */
function shrinkAxis(rect: BandRect): BandRect {
  if (rect.w <= rect.h) {
    const w = Math.max(1, rect.w - 2);
    return { ...rect, x0: rect.x0 + ((rect.w - w) >> 1), w };
  }
  const h = Math.max(1, rect.h - 2);
  return { ...rect, y0: rect.y0 + ((rect.h - h) >> 1), h };
}

/**
 * Riempie i voxel dalle fasce.
 *
 * Tre colori in tre passaggi sullo stesso voxel, nell'ordine in cui si
 * sovrascrivono: corpo, cornice di sommita', faccia d'accento. Le fasce da
 * `crownStart` in poi sono il coronamento e prendono il suo colore per intero,
 * cornice compresa; l'ultima e' il dettaglio sul tetto, e sui coronamenti che
 * non lo portano e' alta zero.
 *
 * **La terrazza non e' una fascia in piu'.** E' la sommita' di una fascia dove
 * quella sopra non arriva — un anello che la grammatica produce da sempre e che
 * finora restava verniciato come una parete. Chiedere `roofTech` per quell'anello
 * gli fa arrivare il parapetto da `emitRoofTech`, che gia' emette dove un tetto
 * confina con l'aria: la terrazza si arreda senza toccare il mesher.
 */
interface PaintRequest {
  readonly rects: readonly BandRect[];
  readonly heights: readonly number[];
  readonly footprint: number;
  /** Livello dell'edificio: decide quanta faccia d'accento si accende. */
  readonly level: number;
  readonly body: number;
  readonly bodyAlt: number;
  readonly accentId: number;
  readonly accentFace: number;
  readonly crown: number;
  readonly plinth: number;
  readonly roofProp: number;
  /** Pavimentazione dell'anello scoperto di una rientranza. */
  readonly terrace: number;
  /** Verde del cuore della terrazza, o `null` se la tipologia non lo chiede. */
  readonly garden: number | null;
  readonly surface: SurfaceKind;
  readonly courtyard: boolean;
  /** Prima fascia del coronamento: da qui all'ultima esclusa. */
  readonly crownStart: number;
  /** Fasce di base che appartengono al podio, gia' limitate a `bands - 1`. */
  readonly podium: number;
  readonly podiumBody: number | null;
  readonly podiumAlt: number | null;
  readonly podiumSurface: SurfaceKind;
}

function paint(request: PaintRequest): VoxelStamp {
  const { rects, heights, footprint } = request;
  let sizeZ = 0;
  for (const height of heights) sizeZ += height;

  const voxels = new Uint8Array(footprint * footprint * sizeZ);
  const surfaces = new Uint8Array(voxels.length);
  const bandStarts: number[] = [];

  // Sotto la prima soglia la faccia d'accento resta la grammatica dell'uso: una
  // casa appena costruita non deve sembrare un'insegna. Fra le due si accende il
  // solo voxel di sommita' — una riga per piano, che a distanza legge come
  // marcapiano illuminato invece che come colonna al neon.
  const lit = request.level >= GRAMMAR.luminousFromLevel;
  const litFull = request.level >= GRAMMAR.luminousFullLevel;

  let z = 0;
  for (let b = 0; b < rects.length; b++) {
    bandStarts.push(z);
    const rect = rects[b];
    const isRoofProp = b === rects.length - 1;
    const isCrown = !isRoofProp && b >= request.crownStart;
    const isPodium = b < request.podium;
    const top = z + heights[b] - 1;

    // La corte svuota il cuore delle fasce larghe. Non tocca il coronamento ne'
    // il podio: un isolato a corte ha un cortile, non un pozzo che lo attraversa
    // dal tetto alle fondamenta.
    const hollow = request.courtyard && !isCrown && !isRoofProp && !isPodium &&
      rect.w >= 6 && rect.h >= 6;

    const bandBody = isPodium && request.podiumBody !== null ? request.podiumBody : request.body;
    const bandAlt = isPodium && request.podiumAlt !== null ? request.podiumAlt : request.bodyAlt;
    const bandSurface = isPodium ? request.podiumSurface : request.surface;

    // La fascia sopra dice quale parte di questa sommita' resta scoperta.
    //
    // Vale sul solo corpo. Il coronamento e' gia' il tetto — porta il proprio
    // colore e la propria superficie da sempre — e sopra di esso c'e' soltanto
    // il dettaglio verticale, che copre due voxel: trattare quella sommita'
    // come una rientranza pavimenterebbe l'intera copertura di ogni edificio a
    // tetto piatto, che non e' una terrazza ma il tetto di prima ridipinto.
    const above = isCrown || isRoofProp ? null : rects[b + 1];
    const terraced = above !== null && rect.w >= GRAMMAR.terraceMinSide &&
      rect.h >= GRAMMAR.terraceMinSide;

    for (let sz = z; sz <= top; sz++) {
      // La cornice e' il voxel di sommita' della fascia: costa nulla e produce
      // le righe orizzontali che danno la scala all'edificio. Su una fascia alta
      // un voxel la cornice e' la fascia, ed e' corretto che lo sia.
      const layer = isRoofProp
        ? request.roofProp
        : isCrown
          ? request.crown
          : sz < GRAMMAR.plinthHeight
            ? request.plinth
            : sz === top
              ? bandAlt
              : bandBody;

      for (let sy = rect.y0; sy < rect.y0 + rect.h; sy++) {
        for (let sx = rect.x0; sx < rect.x0 + rect.w; sx++) {
          if (hollow &&
            sx > rect.x0 && sx < rect.x0 + rect.w - 1 &&
            sy > rect.y0 && sy < rect.y0 + rect.h - 1) {
            continue;
          }

          // Scoperto: sommita' della fascia che la fascia sopra non copre. E'
          // O(1) per voxel — il rettangolo di sopra e' gia' in mano al ciclo —
          // e non alloca niente.
          const open = terraced && sz === top && above !== null &&
            !inside(above, sx, sy);
          // Il bordo resta pavimentato anche quando il cuore e' verde: ci si
          // affaccia, e il parapetto lo dice. Un giardino fino al filo del vuoto
          // sarebbe un prato sospeso, non una terrazza piantata.
          const planted = open && request.garden !== null && inset(rect, sx, sy);

          const accent = !isCrown && !isRoofProp && !open && sz >= GRAMMAR.plinthHeight &&
            lit && (litFull || sz === top) &&
            onAccentFace(rect, sx, sy, request.accentFace);
          // Quando l'intero edificio usa il colore d'accento, `accentId`
          // coincide con la cornice normale. Sulla sommita' della fascia si
          // inverte quindi il contrasto, altrimenti proprio quel piano perde
          // la faccia che rende leggibile il volume.
          const accentLayer = request.accentId === layer ? bandBody : request.accentId;
          const index = sx + footprint * (sy + footprint * sz);
          voxels[index] = planted
            ? (request.garden as number)
            : open
              ? request.terrace
              : accent
                ? accentLayer
                : layer;
          surfaces[index] = isRoofProp
            ? SURFACE_KIND.utility
            : planted
              // Il verde non chiede microgeometria: un parapetto in mezzo alle
              // aiuole sarebbe una ringhiera dentro il prato.
              ? SURFACE_KIND.plain
              : open || isCrown
                ? SURFACE_KIND.roofTech
                : sz < GRAMMAR.portalHeight && onPortal(rect, sx, sy, request.accentFace)
                  ? SURFACE_KIND.portal
                  : accent
                    ? SURFACE_KIND.luminous
                    : bandSurface;
        }
      }
    }

    z = top + 1;
  }
  bandStarts.push(sizeZ);

  return {
    sizeX: footprint,
    sizeY: footprint,
    sizeZ,
    // L'ancora e' l'angolo minimo: il sito che la simulazione propone e' la
    // colonna da cui il footprint si estende, non il suo centro.
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    bandStarts,
  };
}

/** true se la colonna cade dentro il rettangolo della fascia. */
function inside(rect: BandRect, sx: number, sy: number): boolean {
  return sx >= rect.x0 && sx < rect.x0 + rect.w && sy >= rect.y0 && sy < rect.y0 + rect.h;
}

/** true se la colonna non tocca il perimetro della fascia: il cuore piantabile. */
function inset(rect: BandRect, sx: number, sy: number): boolean {
  return sx > rect.x0 && sx < rect.x0 + rect.w - 1 &&
    sy > rect.y0 && sy < rect.y0 + rect.h - 1;
}

/** Un solo modulo d'ingresso, centrato sul lato principale e mai su un angolo. */
function onPortal(rect: BandRect, sx: number, sy: number, face: number): boolean {
  if (face <= 1) {
    if (rect.h < 3 || sy !== rect.y0 + Math.floor(rect.h / 2)) return false;
    return face === 0 ? sx === rect.x0 + rect.w - 1 : sx === rect.x0;
  }
  if (rect.w < 3 || sx !== rect.x0 + Math.floor(rect.w / 2)) return false;
  return face === 2 ? sy === rect.y0 + rect.h - 1 : sy === rect.y0;
}

/**
 * Grammatica di superficie di un uso.
 *
 * Gli usi sono quattro ma i tipi di superficie disponibili per gli edifici sono
 * tre: i tre bit alti di `visualBlock` sono tutti impegnati, e prendersene un
 * quarto significherebbe togliere un bit alla palette — cioe' rompere
 * l'invariante dei 32 slot per una lama di facciata. Il commerciale riusa
 * quindi la grammatica del residenziale, che gli calza: mensole orizzontali che
 * a piano terra leggono come tende e pensiline. A distinguerlo restano il
 * colore caldo, i portali al piano terra e le insegne luminose sugli accenti.
 */
function classSurface(cls: BuildingClass): SurfaceKind {
  if (cls === BUILDING_CLASS.industrial) return SURFACE_KIND.industrial;
  if (cls === BUILDING_CLASS.civic) return SURFACE_KIND.civic;
  return SURFACE_KIND.habitat;
}

/** true se il voxel sta sullo strato esterno del lato d'accento della sua fascia. */
function onAccentFace(rect: BandRect, sx: number, sy: number, face: number): boolean {
  switch (face) {
    case 0:
      return sx === rect.x0 + rect.w - 1;
    case 1:
      return sx === rect.x0;
    case 2:
      return sy === rect.y0 + rect.h - 1;
    default:
      return sy === rect.y0;
  }
}

/** Intero uniforme in `[min, max]`, estremi inclusi. */
function pickInt(random: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Livello con cui nasce un edificio nuovo.
 *
 * Estratto dalla distribuzione a coda lunga di `START_LEVEL_CDF`, e con un PRNG
 * separato da quello della forma: se condividessero la sequenza, cambiare il
 * livello iniziale cambierebbe anche la sagoma, e un upgrade non si
 * riconoscerebbe piu' come lo stesso edificio.
 *
 * **Il ciclo si ferma sulla lunghezza della distribuzione, non su `maxLevel`.**
 * Erano lo stesso numero per caso, e alzare `maxLevel` senza allungare l'elenco
 * faceva leggere `undefined`: `roll < undefined` e' falso a ogni giro, quindi il
 * ciclo cadeva in fondo e restituiva il livello massimo a *ogni* edificio. E' il
 * difetto che si ripresenta a ogni cambio di scala, e qui e' chiuso da entrambi i
 * lati — l'elenco e' lungo quanto serve, e il ciclo non lo supera comunque.
 */
export function startLevel(seed: number): number {
  const roll = mulberry32(hashCoords(seed, 0x1e7e1, 0))();
  for (let level = 0; level < START_LEVEL_CDF.length; level++) {
    if (roll < START_LEVEL_CDF[level]) return Math.min(level, BUILDER.maxLevel);
  }
  return BUILDER.maxLevel;
}
