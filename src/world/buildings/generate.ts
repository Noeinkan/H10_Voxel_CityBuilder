import type { BuildingClass } from '../../sim';
import { hashCoords, mulberry32 } from '../rng';
import {
  BUILDER,
  CLASS_PROFILE,
  DEFAULT_BUILDING_FORM,
  DEFAULT_TYPOLOGY_SHAPE,
  GRAMMAR,
  LEVEL_CAPS,
  MAX_FOOTPRINT,
  MIN_FOOTPRINT,
  SKYLINE_PROP_HEIGHT,
  START_LEVEL_CDF,
  VISUAL_LEVELS,
  crownBonusOf,
  type BuildingForm,
  type ClassProfile,
  type TypologyShape,
} from './config';
import { clamp, pickInt, type BandRect } from './bandRect';
import { forcedOp, nextRect, type BandBox } from './bandOps';
import { crownBands } from './crowns';
import { classSurface, paint } from './paint';
import type { VoxelStamp } from './stamp';

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
 * **Questo file monta, non disegna.** L'algebra dei rettangoli sta in
 * `bandRect.ts`, l'interprete del repertorio in `bandOps.ts`, la chiusura della
 * silhouette in `crowns.ts` e la vernice in `paint.ts`. La divisione non e'
 * ordine: sono quattro lavori che si fanno separatamente, e finche' stavano in
 * un file solo toccarne uno prendeva in ostaggio gli altri tre.
 *
 * **La tipologia piega la regola, non la sostituisce.** Il generatore non sa
 * che le tipologie esistono: riceve un profilo di disegno gia' fuso — repertorio
 * compreso — e quattro interruttori strutturali: podio, corte, forma del
 * coronamento e giardino pensile. Chi sceglie *quale* tipologia e' `typology.ts`,
 * e sta a monte.
 *
 * **Determinismo a canali.** Tutto il caso esce da quattro PRNG separati, uno
 * per domanda — massa, fasce, facciata, tetto — e **nessuno dei quattro dipende
 * dal livello**: lo stato iniziale e' `hash(seed, cls, sale)` per ciascun canale.
 * Ne segue l'invariante che rende un upgrade leggibile come crescita: a parita'
 * di tipologia, la fascia k di un edificio consuma sempre gli stessi tiri del
 * canale delle fasce, quindi i piani bassi restano identici a ogni livello e a
 * cambiare sono soltanto i piani nuovi e il coronamento — che pescano i propri
 * tiri *dopo* quelli delle fasce, cioe' in una posizione della sequenza che
 * dipende da quante fasce ci sono. Un edificio che promuove conserva il corpo e
 * rifa' la cima, che e' esattamente il racconto che la crescita deve mostrare.
 */

/**
 * I sali che separano i quattro canali.
 *
 * Servono per la stessa ragione del sale dell'assemblatore: lo stesso seme non
 * deve rispondere con la stessa moneta a quattro domande diverse, altrimenti
 * massa e facciata cambierebbero sempre insieme e la citta' mostrerebbe una
 * regolarita' che nessuno ha scritto.
 */
const CHANNEL_MASS = 0x3a1f_9c4d;
const CHANNEL_BAND = 0x5b77_d2e1;
const CHANNEL_FACADE = 0x7c33_6ab5;
const CHANNEL_ROOF = 0x9d44_1f27;

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

/**
 * Di quanto una tipologia sporge, dato il verso che il luogo le da'.
 *
 * **Sta qui e non nel Builder perche' ha due lettori con lo stesso bisogno**: il
 * generatore, che deve dimensionare l'inviluppo, e chi piazza, che dall'inviluppo
 * deve risalire all'impronta di suolo. Scritta due volte divergerebbe al primo
 * ritocco di `maxOverhang`, e la seconda copia sbaglierebbe in silenzio — un
 * record con l'impronta larga due di troppo occupa colonne che nessuno vede.
 *
 * **Senza fronte strada non si sporge.** Non e' una restrizione di comodo: il
 * verso arriverebbe dal tiro d'accento, e allora chi ricostruisce l'inviluppo dal
 * solo record non saprebbe da che parte guardare.
 */
export function overhangFor(shape: TypologyShape, facing: number | undefined): number {
  if (facing === undefined) return 0;
  return clamp(shape.overhang, 0, GRAMMAR.maxOverhang);
}

/**
 * Lato dell'impronta di **suolo** di uno stamp che sporge.
 *
 * L'inviluppo cresce su un asse solo — quello di `facing` — quindi da uno dei due
 * lati dello stamp l'impronta si legge gia'. Sta accanto a `overhangFor` e per la
 * stessa ragione: sono la stessa aritmetica letta nei due versi, e i suoi tre
 * chiamanti — nascita, promozione e cancellazione — devono ricavarne lo stesso
 * numero o si indicizzerebbero colonne che nessuno vede.
 */
export function groundSideOf(
  stamp: VoxelStamp,
  overhang: number,
  facing: number | undefined,
): number {
  if (overhang <= 0 || facing === undefined) return stamp.sizeX;
  // Facce 0 e 1 sono l'asse x: li' l'inviluppo e' cresciuto e va scontato. Sulle
  // altre due `sizeX` e' gia' l'impronta, ed e' `sizeY` a portare la striscia.
  return facing <= 1 ? stamp.sizeX - overhang : stamp.sizeX;
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
    // Il tetto e' la meta' interessante del clamp: vedi `localForm.maxShrinkBias`.
    // A uno, un quartiere ricco spegneva `growOps` invece di preferirgli le
    // terrazze, e la torre saliva con l'unico ramo che le restava.
    shrinkBias: clamp(
      baseProfile.shrinkBias +
        form.satisfaction * BUILDER.localForm.satisfactionTerraceBias +
        form.wealth * BUILDER.localForm.wealthTerraceBias,
      0,
      Math.max(baseProfile.shrinkBias, BUILDER.localForm.maxShrinkBias),
    ),
  };
  // I quattro canali: uno per domanda, e nessuno dipende dal livello. Vedi la
  // nota sul determinismo a canali in cima al file.
  const mass = mulberry32(hashCoords(request.seed, cls, CHANNEL_MASS));
  const band = mulberry32(hashCoords(request.seed, cls, CHANNEL_BAND));
  const facade = mulberry32(hashCoords(request.seed, cls, CHANNEL_FACADE));
  const roof = mulberry32(hashCoords(request.seed, cls, CHANNEL_ROOF));

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
    MIN_FOOTPRINT + Math.floor(mass() * (MAX_FOOTPRINT - MIN_FOOTPRINT + 1)) + profile.footprintBias,
    MIN_FOOTPRINT,
    MAX_FOOTPRINT,
  );
  const footprint = clamp(naturalFootprint, minFootprint, cap);
  const naturalBands = pickInt(mass, caps.minBands, caps.maxBands);
  const bands = clamp(
    naturalBands + Math.floor(form.density * BUILDER.localForm.densityBandBias),
    caps.minBands,
    caps.maxBands,
  );

  // L'accento a scala di edificio si decide qui, prima di disegnare: e' un
  // colore di corpo alternativo, non una passata di ritocco alla fine.
  const accented = facade() < BUILDER.accentBuildingChance +
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
  const rolledFace = pickInt(facade, 0, 3);
  const accentFace = request.facing ?? rolledFace;
  const accentId = accented ? profile.body : profile.accent;

  const rects: BandRect[] = [];
  const heights: number[] = [];

  // Lo sbalzo: la striscia che l'edificio si prenota **sopra il marciapiede**.
  // Senza un fronte strada non c'e' niente da scavalcare, quindi non si sporge —
  // e non e' solo semantica: il verso arriverebbe dal tiro d'accento, e chi deve
  // ricostruire l'inviluppo dal record non saprebbe da che parte guardare.
  const over = overhangFor(shape, request.facing);
  const alongX = accentFace <= 1;
  // Da che parte sieda l'impronta dentro l'inviluppo e' tutto cio' che decide il
  // verso dello sbalzo: nessuna voce del repertorio lo sa, e nessuna puo' quindi
  // sporgere dalla parte del vicino.
  const anchorX = accentFace === 1 ? over : 0;
  const anchorY = accentFace === 3 ? over : 0;
  const box: BandBox = {
    sizeX: footprint + (alongX ? over : 0),
    sizeY: footprint + (alongX ? 0 : over),
    face: accentFace,
  };

  // Il basamento non e' piu' un ramo del ciclo: e' `keep` ripetuto, cioe' una
  // delle trasformazioni della tabella applicata piu' volte di fila. Sopra
  // l'ultima fascia piena arriva un arretramento netto — `shrink` — ed e' quel
  // gradino a rendere un podio commerciale con abitazioni riconoscibile da
  // lontano, dove una rientranza graduale si leggerebbe come una torre qualunque.
  const full: BandRect = { x0: anchorX, y0: anchorY, w: footprint, h: footprint };
  const podium = Math.min(shape.podiumBands, bands - 1);
  let rect: BandRect = full;
  let bandZ = 0;
  for (let i = 0; i < bands; i++) {
    if (i > 0) {
      rect = nextRect(
        band,
        rect,
        box,
        profile,
        forcedOp(i, podium),
        bandZ < GRAMMAR.overhangFromZ,
        full,
      );
    }
    rects.push(rect);
    // Le fasce del basamento pescano l'altezza come tutte le altre. Prima erano
    // bloccate al minimo, e un basamento "abitato" senza piani di altezza propria
    // resta un blocco: sono l'altezza e il marcapiano a farne un piano.
    const rolled = pickInt(band, profile.bandHeight[0], profile.bandHeight[1]);
    // Il corso di base di una fila **sostituisce** il tiro della fascia zero, ma
    // non lo salta: la sequenza del PRNG resta quella di prima, quindi entrare in
    // un cluster cambia la quota dell'edificio e non la sua sagoma. E' la stessa
    // regola del verso d'accento, che si consuma anche quando arriva dalla rete.
    const height = i === 0 && request.baseBandHeight !== undefined
      ? request.baseBandHeight
      : rolled;
    heights.push(height);
    bandZ += height;
  }

  // Coronamento: chiude la silhouette invece di lasciarla tagliata di netto, che
  // a distanza legge come un edificio in costruzione. Quante fasce servano e
  // quanto siano alte lo dice `crownRects`, che e' l'unica cosa a cambiare fra
  // un capannone, un gradone e la lanterna di un civico.
  //
  // **Il tiro si consuma dopo quelli delle fasce**, e il bonus delle soglie
  // visuali si somma al tiro invece di sostituirlo: salendo di livello il
  // coronamento cambia per due ragioni insieme — la sequenza e' scivolata, perche'
  // le fasce sono di piu', e la soglia ha alzato il premio. La prima e' il
  // racconto «nuova cima», la seconda «cima da torre».
  const crownStart = rects.length;
  const crownHeight = pickInt(roof, GRAMMAR.crownHeight[0], GRAMMAR.crownHeight[1]);
  const crown = crownBands(shape.crownKind, rect, crownHeight, crownBonusOf(level));
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
  //
  // Alla soglia di skyline il dettaglio c'e' **sempre**, alla sua altezza piena:
  // e' la riga che chiude la silhouette della citta' cresciuta, e non dipende
  // dal profilo.
  const propSide = Math.min(GRAMMAR.roofPropSide, crownRect.w, crownRect.h);
  const propRect: BandRect = {
    x0: crownRect.x0 + Math.floor(roof() * (crownRect.w - propSide + 1)),
    y0: crownRect.y0 + Math.floor(roof() * (crownRect.h - propSide + 1)),
    w: propSide,
    h: propSide,
  };
  rects.push(propRect);
  const propHeight = level >= VISUAL_LEVELS.skyline
    ? Math.max(profile.roofPropHeight, SKYLINE_PROP_HEIGHT)
    : profile.roofPropHeight;
  heights.push(crown.roofProp ? propHeight : 0);

  const podiumProfile = request.mixed !== undefined && podium > 0
    ? CLASS_PROFILE[request.mixed]
    : null;
  return paint({
    rects,
    heights,
    sizeX: box.sizeX,
    sizeY: box.sizeY,
    anchorX,
    anchorY,
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
    bayPeriod: profile.bayPeriod,
    // Lo smusso si limita qui e non in `paint`: e' un numero di catalogo, e il
    // posto in cui si tara un numero e' dove il catalogo viene letto, non dove
    // si scrivono i voxel.
    chamfer: clamp(shape.chamfer, 0, GRAMMAR.maxChamfer),
    arcade: shape.arcade,
    podium,
    podiumBody: podiumProfile?.body ?? null,
    podiumAlt: podiumProfile?.bodyAlt ?? null,
    podiumBay: podiumProfile?.bayPeriod ?? null,
    podiumSurface: request.mixed !== undefined ? classSurface(request.mixed) : classSurface(cls),
  });
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
