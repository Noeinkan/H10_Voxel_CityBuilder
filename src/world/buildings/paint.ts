import { BUILDING_CLASS, type BuildingClass } from '../../sim';
import { GRAMMAR, VISUAL_LEVELS } from './config';
import { inside, inset, type BandRect } from './bandRect';
import { inPlan } from '../planMask';
import { courtyardMinSideOf } from '../scale';
import type { VoxelStamp } from './stamp';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';

/** Il lato sotto cui una fascia non viene svuotata in una corte (vedi `scale`). */
const COURT_MIN_SIDE = courtyardMinSideOf();

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
 *
 * **La campata e' l'unico ritmo verticale, e sta qui perche' la sagoma non ci
 * arriva.** Le fasce spostano un rettangolo di uno o due voxel, e con l'impronta
 * a otto e `GRAMMAR.minBandSide` a quattro quel gioco si esaurisce entro il primo
 * quinto di una torre alta: sopra restano ottanta voxel di corpo che possono solo
 * scorrere. Da li' in su a dire la scala c'e' la sola parete, e prima diceva un
 * colore con una riga per fascia. La campata la spezza in verticale **senza
 * toccare volume ne' superfici** — e' lo stesso voxel con un altro slot, quindi
 * la microgeometria emette esattamente i prismi di prima e la collisione, il
 * budget di chunk e la cancellazione non se ne accorgono.
 */
export interface PaintRequest {
  readonly rects: readonly BandRect[];
  readonly heights: readonly number[];
  /**
   * Lati dell'**inviluppo**: l'impronta piu' la striscia prenotata sopra il
   * marciapiede. Coincidono con l'impronta su ogni edificio che non sporge, che
   * e' la stragrande maggioranza.
   */
  readonly sizeX: number;
  readonly sizeY: number;
  /**
   * Offset dell'impronta dentro l'inviluppo: e' l'ancora dello stamp.
   *
   * Vale zero quando la striscia sta dalla parte dei valori crescenti e
   * `overhang` quando sta dall'altra. Tenerlo qui e non dedurlo dai rettangoli
   * e' cio' che permette all'ancora di restare **l'angolo del lotto** anche
   * quando lo stamp comincia due colonne piu' in la'.
   */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Passo della campata: si conta dall'impronta, non dall'inviluppo. */
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
  /** Passo dei montanti di facciata. Sotto due, la parete resta piena. */
  readonly bayPeriod: number;
  /** Angoli tagliati in pianta, in voxel. Zero e' lo spigolo vivo. */
  readonly chamfer: number;
  /** Il piano terra sul fronte d'accento e' un portico invece di una parete. */
  readonly arcade: boolean;
  /**
   * Il piano terra su strada e' una vetrina continua, non un muro con una porta.
   *
   * **Cambia quanto lungo e' il fronte attivo, non cosa c'e' sopra.** `onPortal`
   * apre **un** modulo d'ingresso al centro del lato principale, che e' la
   * risposta giusta per un portone: un isolato commerciale invece ha la strada
   * vetrata da un cantonale all'altro, ed e' quella riga continua a dire
   * «negozi» da lontano, prima di qualunque insegna. I due convivono — la porta
   * resta dov'era, e scende fino al marciapiede mentre la vetrina poggia sullo
   * zoccolo.
   *
   * Non e' solo pittura: da qui passa `frontage` nel mesher, che cerca un
   * portale **sotto** una faccia per decidere se quella faccia guarda la via.
   * Con la vetrina continua tende, lembi e telai d'ingresso smettono di essere
   * un accento sopra la porta e diventano la pensilina di tutto il fronte,
   * mentre calate e scale esterne si spostano sul retro da sole.
   */
  readonly shopfront: boolean;
  /** Fasce di base che appartengono al podio, gia' limitate a `bands - 1`. */
  readonly podium: number;
  readonly podiumBody: number | null;
  readonly podiumAlt: number | null;
  /** Passo del secondo uso: il podio porta anche il ritmo di chi lo occupa. */
  readonly podiumBay: number | null;
  readonly podiumSurface: SurfaceKind;
}

export function paint(request: PaintRequest): VoxelStamp {
  const { rects, heights, sizeX, sizeY } = request;
  let sizeZ = 0;
  for (const height of heights) sizeZ += height;

  const voxels = new Uint8Array(sizeX * sizeY * sizeZ);
  const surfaces = new Uint8Array(voxels.length);
  const bandStarts: number[] = [];

  // Sotto la prima soglia la faccia d'accento resta la grammatica dell'uso: una
  // casa appena costruita non deve sembrare un'insegna. Fra le due si accende il
  // solo voxel di sommita' — una riga per piano, che a distanza legge come
  // marcapiano illuminato invece che come colonna al neon.
  const lit = request.level >= GRAMMAR.luminousFromLevel;
  const litFull = request.level >= GRAMMAR.luminousFullLevel;

  // La campata e' il ritmo che la soglia `consolidated` accende: sotto, la
  // parete resta piena — un edificio base non ha ancora una facciata da
  // raccontare, e la campata e' esattamente cio' che la fa comparire.
  const bays = request.level >= VISUAL_LEVELS.consolidated;

  // Alla soglia di torre le terrazze diventano attrezzate: sotto sono un gradino
  // verniciato, sopra ricevono il linguaggio del tetto tecnico — parapetto,
  // cassoni, fioriere — e il mesher reagisce da se', perche' e' la superficie a
  // cambiare e non c'e' nessun livello da leggere.
  const equipped = request.level >= VISUAL_LEVELS.tower;

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
      rect.w >= COURT_MIN_SIDE && rect.h >= COURT_MIN_SIDE;

    const bandBody = isPodium && request.podiumBody !== null ? request.podiumBody : request.body;
    const bandAlt = isPodium && request.podiumAlt !== null ? request.podiumAlt : request.bodyAlt;
    const bandSurface = isPodium ? request.podiumSurface : request.surface;
    const bandBay = isPodium && request.podiumBay !== null ? request.podiumBay : request.bayPeriod;
    // Corpo e cornice possono cadere nello stesso slot: succede sul civico, dove
    // l'accento a scala di edificio porta il corpo sullo stesso vetro di
    // `bodyAlt`. Li' l'apertura si inverte e prende il tono neutro, che e' gia'
    // in mano al ciclo come `accentId` — su un edificio accentato quello *e'* il
    // colore normale della classe. Senza, la classe che sale piu' in alto
    // sarebbe anche l'unica a restare senza facciata, che e' esattamente il
    // contrario di cio' per cui la campata esiste.
    const bayLayer = bandAlt === bandBody ? request.accentId : bandAlt;

    // La fascia sopra dice quale parte di questa sommita' resta scoperta.
    //
    // Vale sul solo corpo. Il coronamento e' gia' il tetto — porta il proprio
    // colore e la propria superficie da sempre — e sopra di esso c'e' soltanto
    // il dettaglio verticale, che copre due voxel: trattare quella sommita'
    // come una rientranza pavimenterebbe l'intera copertura di ogni edificio a
    // tetto piatto, che non e' una terrazza ma il tetto di prima ridipinto.
    const above = isCrown || isRoofProp ? null : rects[b + 1];

    // Il portico sta sulla sola fascia zero: e' il piano terra sul fronte
    // strada, non una loggia a meta' torre. Su un fronte troppo stretto non si
    // apre affatto — vedi `arcadeMinSide`.
    const arcaded = request.arcade && b === 0 &&
      rect.w >= GRAMMAR.arcadeMinSide && rect.h >= GRAMMAR.arcadeMinSide;

    // **Lo smusso si limita alla fascia, non all'edificio**, e non e' una
    // raffinatezza: il taglio di Manhattan toglie `chamfer` a *ciascuno* dei due
    // assi, quindi su un lato da quattro uno smusso da due lascia in piedi il
    // solo quadrato centrale da due — cioe' un palo dentro il riquadro, non un
    // ottagono. La sagoma scende fino a `GRAMMAR.minBandSide` salendo, quindi il
    // caso non e' raro: e' *ogni* torre alta sopra il primo quinto. Il tetto e'
    // quello che lascia in piedi almeno una colonna per faccia.
    const bandChamfer = Math.min(
      request.chamfer,
      Math.floor((Math.min(rect.w, rect.h) - 1) / 2),
    );

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

      // Quote finestrate della fascia: sopra il parapetto e sotto la cornice.
      // Si decide per riga e non per voxel, come gia' `layer`, perche' la quota
      // e' l'unica cosa che serve a escluderle.
      //
      // Le condizioni si ripetono invece di dedurle da `layer === bandBody`, che
      // sarebbe piu' corto e sbagliato: dedurle dal colore lega una regola
      // strutturale a una coincidenza di slot, e una riga di catalogo che desse
      // a `crown` lo stesso indice di `body` finestrerebbe il tetto.
      //
      // Il piano terra ne resta fuori per intero: li' ci sono gia' zoccolo,
      // portale e tende, e un'apertura in mezzo sarebbe la quarta cosa sullo
      // stesso metro di facciata.
      const bayRow = !isCrown && !isRoofProp && sz !== top &&
        sz >= z + GRAMMAR.spandrelHeight &&
        sz >= GRAMMAR.portalHeight;

      // La vetrina poggia sullo zoccolo invece di scendere fino al marciapiede:
      // e' la battuta bassa che ogni negozio ha, e senza di lei il vetro
      // toccherebbe il terreno proprio dove il terreno e' irregolare. Il portone
      // no — quello scende, ed e' l'unica cosa che distingue una porta da una
      // vetrina quando sono lo stesso linguaggio di superficie.
      const shopRow = request.shopfront && b === 0 &&
        sz >= GRAMMAR.plinthHeight && sz < GRAMMAR.portalHeight;

      for (let sy = rect.y0; sy < rect.y0 + rect.h; sy++) {
        for (let sx = rect.x0; sx < rect.x0 + rect.w; sx++) {
          if (hollow &&
            sx > rect.x0 && sx < rect.x0 + rect.w - 1 &&
            sy > rect.y0 && sy < rect.y0 + rect.h - 1) {
            continue;
          }

          // Lo smusso taglia gli angoli di **ogni** fascia, coronamento e
          // dettaglio sul tetto compresi: un tamburo con la cima quadrata non e'
          // un tamburo. Si misura sul rettangolo corrente e non sull'impronta,
          // cosi' una fascia rientrata resta smussata quanto quella sotto invece
          // di perdere il taglio salendo.
          if (bandChamfer > 0 &&
            !inPlan(sx - rect.x0, sy - rect.y0, rect.w, rect.h, bandChamfer)) {
            continue;
          }

          // Il portico: vuoto sotto il pieno, sul solo fronte d'accento e sulla
          // sola fascia zero. E' l'unica cosa in tutta la grammatica che tolga
          // volume invece di spostarlo, ed e' anche l'unica che si veda da sotto.
          if (arcaded && sz < GRAMMAR.arcadeHeight &&
            onAccentFace(rect, sx, sy, request.accentFace) &&
            !onPillar(rect, sx, sy, request.accentFace, bandBay)) {
            continue;
          }

          // Scoperto: sommita' della fascia che la fascia sopra non copre, e
          // larga abbastanza perche' ci si stia. E' O(1) per voxel — il
          // rettangolo di sopra e' gia' in mano al ciclo — e non alloca niente.
          //
          // **La larghezza si misura sulla striscia, non sulla fascia**, ed e'
          // la differenza fra una terrazza e il bordo di un gradino: uno scarto
          // da un voxel lascia scoperta una riga sola, che pavimentata legge
          // come un errore di allineamento e in piu' si porta il parapetto di
          // `emitRoofTech`. Li' la sommita' resta la cornice della fascia,
          // com'e' su ogni piano che non ha una terrazza.
          const open = sz === top && above !== null && !inside(above, sx, sy) &&
            openRing(rect, above, sx, sy) >= GRAMMAR.terraceMinRing;
          // Il bordo resta pavimentato anche quando il cuore e' verde: ci si
          // affaccia, e il parapetto lo dice. Un giardino fino al filo del vuoto
          // sarebbe un prato sospeso, non una terrazza piantata.
          const terracePlanted = open && request.garden !== null && inset(rect, sx, sy);
          // `roofGarden` deve arrivare anche sulla copertura vera. Prima il
          // verde compariva soltanto quando una fascia arretrava di almeno tre
          // voxel: una torre idroponica a corpo diritto dichiarava il giardino
          // nel catalogo e non ne mostrava nemmeno una cella dall'alto.
          const roofPlanted = request.garden !== null && b === rects.length - 2 &&
            sz === top && inset(rect, sx, sy);
          const planted = terracePlanted || roofPlanted;

          const accent = !isCrown && !isRoofProp && !open && sz >= GRAMMAR.plinthHeight &&
            lit && (litFull || sz === top) &&
            onAccentFace(rect, sx, sy, request.accentFace);
          // Quando l'intero edificio usa il colore d'accento, `accentId`
          // coincide con la cornice normale. Sulla sommita' della fascia si
          // inverte quindi il contrasto, altrimenti proprio quel piano perde
          // la faccia che rende leggibile il volume.
          const accentLayer = request.accentId === layer ? bandBody : request.accentId;
          // L'apertura prende il tono della cornice, e non e' un ripiego: sono
          // lo stesso materiale — vetro sul residenziale e sul civico, mattone
          // chiaro sul commerciale — quindi la riga di piano e le finestre
          // sotto di essa leggono come un telaio unico invece che come due
          // decorazioni accostate. Cede sia all'accento sia alla terrazza: la
          // lama luminosa e' gia' la faccia che racconta il volume, e bucarla
          // le toglierebbe la continuita' che la rende visibile da lontano.
          const bay = bays && bayRow && !accent && !open && onBay(rect, sx, sy, bandBay);
          const index = sx + sizeX * (sy + sizeY * sz);
          voxels[index] = planted
            ? (request.garden as number)
            : open
              ? request.terrace
              : accent
                ? accentLayer
                : bay
                  ? bayLayer
                  : layer;
          surfaces[index] = isRoofProp
            ? SURFACE_KIND.utility
            : planted
              // Il verde non chiede microgeometria: un parapetto in mezzo alle
              // aiuole sarebbe una ringhiera dentro il prato.
              ? SURFACE_KIND.plain
              : open
                // L'anello scoperto di una rientranza e' terrazza solo quando la
                // soglia di torre l'ha attrezzata: prima resta il linguaggio della
                // parete, un gradino e non un luogo.
                ? equipped
                  ? SURFACE_KIND.roofTech
                  : bandSurface
                : isCrown
                  ? SURFACE_KIND.roofTech
                  : sz < GRAMMAR.portalHeight && (
                    onPortal(rect, sx, sy, request.accentFace) ||
                    (shopRow && onShopfront(rect, sx, sy, request.accentFace))
                  )
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
    sizeX,
    sizeY,
    sizeZ,
    // L'ancora resta **l'angolo dell'impronta**, non quello dello stamp: il sito
    // che la simulazione propone e' la colonna da cui il footprint si estende, e
    // non deve spostarsi perche' l'edificio si e' prenotato dell'aria sopra il
    // marciapiede. Su un edificio che non sporge i due angoli coincidono e
    // l'ancora e' zero, com'e' sempre stata.
    anchorX: request.anchorX,
    anchorY: request.anchorY,
    anchorZ: 0,
    voxels,
    surfaces,
    bandStarts,
  };
}

/**
 * Larghezza della striscia scoperta a cui appartiene un voxel di sommita'.
 *
 * Il voxel sta fuori dal rettangolo di sopra su uno dei due assi, o su entrambi
 * se e' d'angolo: la striscia e' l'arretramento del lato da cui e' rimasto
 * fuori. **Sull'angolo vince la piu' larga**, e non e' una comodita': un voxel
 * al crocevia fra una striscia da uno e una da tre appartiene alla terrazza, e
 * togliergli il pavimento aprirebbe un intaglio nel suo spigolo.
 *
 * I lati da cui la fascia sopra **sporge** danno un arretramento negativo, e non
 * serve escluderli: da quella parte non c'e' nessun voxel scoperto da misurare.
 */
function openRing(rect: BandRect, above: BandRect, sx: number, sy: number): number {
  let width = 0;
  if (sx < above.x0) width = above.x0 - rect.x0;
  else if (sx >= above.x0 + above.w) width = rect.x0 + rect.w - (above.x0 + above.w);
  if (sy < above.y0) width = Math.max(width, above.y0 - rect.y0);
  else if (sy >= above.y0 + above.h) {
    width = Math.max(width, rect.y0 + rect.h - (above.y0 + above.h));
  }
  return width;
}

/**
 * true se il voxel cade in un'apertura della campata.
 *
 * **Il passo si conta dall'impronta, non dalla fascia.** E' la sola decisione
 * non ovvia di questa regola, e vale la sua riga: contandolo dalla fascia, un
 * `jog` da un voxel farebbe scorrere di uno tutte le aperture del piano sopra, e
 * su una torre da venti fasce la parete tornerebbe rumore invece che facciata.
 * Ancorato all'impronta, le colonne restano le stesse per tutta la salita anche
 * dove il corpo si sposta o rientra — che e' come stanno le finestre di un
 * edificio vero.
 *
 * **Il cantonale resta sempre pieno.** E' dove due fronti si incontrano, ed e'
 * anche dove `emitCornerPosts` appoggia il pilastrino: bucarlo metterebbe
 * un'apertura dentro un pilastro. E' anche cio' che garantisce l'appoggio
 * visivo agli angoli su un fronte da quattro, dove fra i due cantonali restano
 * due sole colonne.
 */
function onBay(rect: BandRect, sx: number, sy: number, period: number): boolean {
  if (period < 2) return false;
  const facingX = sx === rect.x0 || sx === rect.x0 + rect.w - 1;
  const facingY = sy === rect.y0 || sy === rect.y0 + rect.h - 1;
  // Veri entrambi e' un cantonale, falsi entrambi e' il cuore della fascia:
  // nessuno dei due e' parete, e il confronto li toglie di mezzo insieme.
  if (facingX === facingY) return false;
  return (facingX ? sy : sx) % period !== 0;
}

/**
 * La vetrina: tutta la parete su strada, meno i due cantonali.
 *
 * **I cantonali restano pieni per la stessa ragione della campata**, e non e'
 * una scelta estetica: e' dove due fronti si incontrano e dove
 * `emitCornerPosts` appoggia il pilastrino, quindi bucarli metterebbe una
 * vetrina dentro un pilastro. Sotto i quattro voxel di fronte fra i due
 * cantonali non resta niente, e la vetrina semplicemente non si apre — come il
 * portico sotto `arcadeMinSide`.
 */
function onShopfront(rect: BandRect, sx: number, sy: number, face: number): boolean {
  if (!onAccentFace(rect, sx, sy, face)) return false;
  const cornerX = sx === rect.x0 || sx === rect.x0 + rect.w - 1;
  const cornerY = sy === rect.y0 || sy === rect.y0 + rect.h - 1;
  return !(cornerX && cornerY);
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
export function classSurface(cls: BuildingClass): SurfaceKind {
  if (cls === BUILDING_CLASS.industrial) return SURFACE_KIND.industrial;
  if (cls === BUILDING_CLASS.civic) return SURFACE_KIND.civic;
  return SURFACE_KIND.habitat;
}

/**
 * true se la colonna del portico porta un pilastro.
 *
 * **Si conta dall'estremo piu' vicino, non da un capo**, ed e' la stessa regola
 * di `onPillarPitch` in `landmarks/parts.ts` — con la stessa ragione, scoperta
 * la' e valida qui: contando da un capo, un fronte che non e' multiplo del passo
 * si ritrova il pilastro su un angolo e l'architrave nudo sull'altro, e il
 * portico smette di essere simmetrico. Su un edificio la si nota subito, perche'
 * i quattro versi d'accento darebbero quattro portici diversi.
 *
 * I due cantonali restano sempre pieni, come nella campata: sono l'angolo su cui
 * poggia il fronte, e bucarli farebbe galleggiare lo spigolo.
 */
function onPillar(rect: BandRect, sx: number, sy: number, face: number, period: number): boolean {
  const alongX = face > 1;
  const v = alongX ? sx - rect.x0 : sy - rect.y0;
  const size = alongX ? rect.w : rect.h;
  if (v === 0 || v === size - 1) return true;
  return Math.min(v, size - 1 - v) % Math.max(2, period) === 0;
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
