import { hashCoords, mulberry32 } from '../rng';
import { LANDFORM, TERRAIN } from './config';
import {
  outlineOf,
  outlinePoint,
  outlineRatio,
  planWarp,
  SHAPE_WARP_LIPSCHITZ,
  warpLipschitz,
  type Outline,
  type Warp,
} from './outline';
import type { IslandShape } from './region';

/**
 * La forma dell'isola prima del rumore: lobi, rilievi e conche.
 *
 * Fino a qui la sagoma era una sola ellisse con la caduta a coseno, e il rumore
 * era l'unica cosa che la rompesse. Ma il rumore e' *isotropo*: moltiplicato per
 * una maschera radiale da' una cupola con le fasce di bioma a cerchi
 * concentrici, cioe' esattamente il bersaglio che `warpAmount` esiste per
 * evitare — e a deformare il raggio con un'ottava sola si ottiene un'ellisse un
 * po' storta, non una costa.
 *
 * Qui la sagoma diventa una **composizione di elementi dichiarati**: qualche
 * lobo che allunga la costa in poche direzioni, qualche rilievo che sposta le
 * vette fuori dal centro, qualche conca che apre uno specchio d'acqua interno.
 * Il rumore resta, ma torna a fare quello che sa fare — la grana — invece di
 * essere l'unica fonte di struttura.
 *
 * **Tutto passa dal budget di pendenza.** Il vincolo di Lipschitz del campo
 * (`heightField.test.ts`) e' l'unica cosa che tiene il terreno a celle senza
 * dirupi, e un elemento locale se lo mangia in fretta: un coseno rialzato di
 * ampiezza `a` e raggio `R` ha pendenza massima `pi/2 * a / R`. Nessun elemento
 * sceglie quindi la propria altezza: sceglie il raggio, e l'altezza gliela detta
 * `capForRadius`. E' la stessa regola che `TERRAIN.maxReliefSlope` applica
 * all'isola intera, letta un elemento per volta.
 *
 * Puro come la rete stradale: entra `(seed, shape, relief)`, esce un piano. Gli
 * elementi non dipendono dalle `extensions` della maschera — un settore costiero
 * comprato dal giocatore non deve poter spostare una collina che sta dall'altra
 * parte dell'isola, o l'espansione contraddirebbe le colonne gia' generate.
 *
 * **La forma in pianta di un elemento sta in `outline.ts`**, e non e' piu'
 * un'ellisse: rilievi e conche sono ellissi orientate con il raggio deformato da
 * poche armoniche. Qui si dichiara *cosa* fa un elemento; li' *che sagoma* ha, e
 * quanto quella sagoma costa in pendenza.
 */

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/**
 * Angolo aureo: la spirale con cui si dispongono i candidati delle conche.
 *
 * Serve una sequenza che copra il disco in fretta e senza griglia — su una
 * griglia i primi candidati stanno tutti in un angolo, e la prima conca
 * accettata sarebbe sempre nello stesso quadrante.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Un lobo della maschera: ellisse con il proprio tetto di rilievo. */
export interface Lobe {
  readonly centreX: number;
  readonly centreY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  /** Frazione di rilievo che il lobo puo' portare da solo. L'isola base vale 1. */
  readonly cap: number;
}

/** Un rilievo locale: cupola che alza l'elevazione verso il tetto. */
export interface Mound extends Outline {
  /** Frazione del margine residuo che la cupola si prende al centro. */
  readonly amplitude: number;
}

/**
 * Una conca: livella il terreno verso una quota bersaglio invece di sottrargli
 * una cupola, e ci mette dentro uno specchio d'acqua alla propria quota.
 *
 * La differenza fra livellare e sottrarre si vede solo sul fondo. Sottraendo, il
 * fondo eredita le gobbe di cio' che c'era prima e l'acqua ne esce a chiazze di
 * profondita' diversa; livellando, il fondo e' piatto per costruzione e lo
 * specchio ha una profondita' sola — che e' anche cio' che lo tiene dentro
 * `shallowDepth` e quindi lo fa leggere come pozza e non come mare aperto.
 *
 * **`waterZ` e' il motivo per cui i laghi esistono.** A livello del mare non
 * possono: il fondo di uno specchio sta sotto il pelo dell'acqua, e su un'isola
 * a cupola la sola terra abbastanza bassa da ospitarne uno e' la striscia di
 * riva, larga una decina di colonne. Misurato su otto seed, una conca centrata
 * li' ha sempre almeno un quarto della corona sul mare: quello che si apre non e'
 * un lago ma una baia. Un lago **sopra** il livello del mare non ha quel
 * problema — la terra intorno gli e' piu' alta ovunque per costruzione — e in
 * cambio chiede l'unica cosa che il generatore non aveva: una quota d'acqua per
 * colonna invece della costante `TERRAIN.seaLevel`.
 *
 * Non e' un'opera di terra e non contraddice il "si riempie, non si scava" di
 * `grading/`: quella regola parla di cosa la citta' *costruisce* sopra il
 * terreno, questa di che forma il terreno ha quando nasce.
 */
export interface Basin extends Outline {
  /** Elevazione del fondo e del bordo, nelle stesse unita' di `elevationAt`. */
  readonly floor: number;
  readonly rim: number;
  /** Quota della superficie del lago, in voxel. Multiplo di `TERRAIN.cellSize`. */
  readonly waterZ: number;
}

/**
 * Dove starebbe una conca e che forma avrebbe, ma non quanto e' larga.
 *
 * E' la separazione che rende `fitRadius` un punto fisso su **un** numero: la
 * sagoma — orientamento, allungamento, armoniche — si estrae una volta per
 * candidato, il raggio si cerca. Senza, ogni passata dovrebbe riestrarre la
 * forma e il punto fisso non convergerebbe su niente.
 */
export interface BasinSite {
  readonly centreX: number;
  readonly centreY: number;
  /** Quanto il semiasse maggiore supera il minore. */
  readonly stretch: number;
  readonly angle: number;
  readonly warp: Warp;
}

/**
 * Coseno rialzato: 1 al centro, 0 da `ratio >= 1` in poi.
 *
 * E' la stessa curva della maschera radiale, e per la stessa ragione: C1 a
 * entrambi gli estremi, quindi non lascia ne' una punta al centro ne' uno
 * spigolo sul bordo.
 */
export function domeFalloff(ratio: number): number {
  if (ratio >= 1) return 0;
  if (ratio <= 0) return 1;
  return 0.5 * (1 + Math.cos(Math.PI * ratio));
}

/**
 * Espande la fascia alta dell'elevazione, lasciando ferma quella bassa.
 *
 * Il rilievo disponibile e' lo stesso per ogni seed, ma la quota che un'isola
 * raggiunge davvero dipende da quanto in alto arriva la somma di rumore,
 * maschera e rilievi: misurata su otto seed, fra 52 e 69 voxel su un tetto di
 * 80. Le isole si somigliavano percio' proprio dove dovrebbero distinguersi di
 * piu' — la vetta — e la ragione non era il seed ma il fatto che nessun numero
 * dicesse *quanto* alta e' questa isola.
 *
 * La trasformazione e' la piu' semplice che faccia solo questo: sopra il
 * ginocchio la distanza dal ginocchio si moltiplica per `1 + lift`, sotto non
 * cambia niente. Ne segue che il fattore di pendenza vale `1 + lift` **esatti**
 * e solo lassu' — la costa, la pianura e la fascia edificabile non lo pagano — e
 * che la mappa e' monotona per ogni `lift > -1`, senza il ginocchio a rovescio
 * che una curva richiudibile sul tetto porterebbe con se'.
 *
 * **Il `lift` puo' essere negativo, ed e' meta' del punto.** Espandendo soltanto,
 * la varieta' si otterrebbe alzando tutte le isole e alzandone alcune di piu':
 * il paesaggio medio cambierebbe insieme alla sua varianza. Comprimendo, un seed
 * puo' anche prendersi un'isola dolce — versanti lunghi, vetta arrotondata —
 * senza che nessun altro numero si muova, e la compressione non costa pendenza
 * perche' ne toglie.
 *
 * **Il tetto lo paga `TERRAIN.maxHeight`, non un clamp.** L'espansione porta
 * l'elevazione oltre 1, e appiattirla la' significherebbe una vetta rasata
 * proprio dove il terreno dovrebbe essere piu' mosso: il tetto assoluto e'
 * dichiarato invece abbastanza alto da contenerla, e `heightField.test.ts`
 * verifica che il conto torni per il rilievo e il `lift` massimi.
 */
export function liftSummit(elevation: number, lift: number): number {
  if (lift === 0 || elevation <= TERRAIN.summitKnee) return elevation;
  return TERRAIN.summitKnee + (1 + lift) * (elevation - TERRAIN.summitKnee);
}

/**
 * Il profilo di una conca: la quota che il terreno deve avere a `ratio`, fra il
 * fondo e il bordo.
 *
 * Fondo piatto fino a `basinPlateau`, sponda a coseno fino a `basinBank`, bordo
 * da li' in poi. E' l'unica parte della sagoma che dichiara **due** quote invece
 * di una, ed e' il motivo per cui un lago sta dove vuole: il bordo non e' quello
 * che il terreno aveva, e' quello che la conca gli impone, quindi la corona e'
 * chiusa per costruzione e non per fortuna del seed.
 */
export function basinProfile(ratio: number, floor: number, rim: number): number {
  if (ratio <= LANDFORM.basinPlateau) return floor;
  if (ratio >= LANDFORM.basinBank) return rim;
  const u = (ratio - LANDFORM.basinPlateau) / (LANDFORM.basinBank - LANDFORM.basinPlateau);
  return floor + (rim - floor) * (1 - domeFalloff(u));
}

/**
 * Quanto il profilo si impone sul terreno a `ratio`: tutto fino al bordo, poi
 * si spegne.
 *
 * E' la fascia di raccordo a decidere se una conca sta in piedi: fuori dal bordo
 * il terreno torna quello che era, e il salto fra i due va assorbito in
 * `1 - basinBank` di raggio. Un sito in pendenza ha un salto grande e chiede una
 * fascia lunga, cioe' una conca larga; oltre una certa pendenza nessuna
 * larghezza basta piu', ed e' li' che `fitRadius` rinuncia.
 */
export function basinWeight(ratio: number): number {
  if (ratio <= LANDFORM.basinBank) return 1;
  return domeFalloff((ratio - LANDFORM.basinBank) / (1 - LANDFORM.basinBank));
}

/**
 * Altezza ammessa a una cupola di raggio `radius` perche' la sua pendenza
 * massima resti sotto `slope`.
 *
 * Il coseno rialzato ha derivata massima `pi/2` per unita' di raggio
 * normalizzato, e l'altezza in voxel e' `frazione * relief`: da qui
 * `frazione <= slope * radius / (pi/2 * relief)`. E' l'unico posto in cui si
 * decide quanto puo' salire un elemento — nessuna costante di `LANDFORM` e'
 * un'altezza.
 */
export function capForRadius(radius: number, relief: number, slope: number): number {
  if (relief <= 0) return 1;
  return Math.min(1, (slope * radius) / (HALF_PI * relief));
}

/** Estrae un valore da un intervallo dichiarato come `[minimo, ampiezza]`. */
function pick(rnd: () => number, range: readonly [number, number]): number {
  return range[0] + rnd() * range[1];
}

/**
 * Il flusso da cui esce la **sagoma** dell'elemento `index`: orientamento,
 * allungamento e armoniche.
 *
 * E' separato da quello che sceglie dove gli elementi stanno, e la ragione e'
 * una proprieta' che si vuole poter affermare: cambiare un numero di
 * `shapeWarp` cambia la forma in pianta e nient'altro. Con un flusso solo, ogni
 * estrazione in piu' slittava tutte le successive — un'ampiezza ritoccata
 * spostava le colline, e con loro i siti che ospitano un lago.
 */
function shapeStream(seed: number, index: number): () => number {
  return mulberry32(hashCoords(seed, LANDFORM.shapeWarpSalt, index));
}

/** Estrae un intero da un intervallo dichiarato come `[minimo, alternative]`. */
function pickCount(rnd: () => number, range: readonly [number, number]): number {
  return range[0] + Math.floor(rnd() * (range[1] + 1));
}

/**
 * I lobi che allungano la costa, oltre all'isola base.
 *
 * Sono deliberatamente **bassi**: `capForRadius` da' a un lobo di raggio un
 * terzo dell'isola poco piu' di un quarto del rilievo, cioe' la fascia fra
 * spiaggia e pianura. Non e' un compromesso, e' la stessa fisica dell'isola
 * intera — una penisola larga un terzo e alta quanto la vetta avrebbe fianchi
 * tre volte piu' ripidi della costa che la genera.
 *
 * Che la terra ci sia o no lo decide poi il rumore: con il tetto appena sopra la
 * soglia di emersione, il lobo e' terra dove l'fbm e' alto e mare dove e' basso,
 * e quello che si vede non e' un disco ma una penisola frastagliata.
 */
export function planLobes(seed: number, shape: IslandShape, relief: number): Lobe[] {
  const rnd = mulberry32(hashCoords(seed, LANDFORM.lobeSalt, 0));
  const count = pickCount(rnd, LANDFORM.lobeCount);
  const rotation = rnd() * TAU;
  const lobes: Lobe[] = [];

  for (let i = 0; i < count; i++) {
    const jitter = LANDFORM.lobeJitter * (rnd() - 0.5);
    const angle = rotation + ((i + jitter) * TAU) / count;
    const distance = pick(rnd, LANDFORM.lobeDistance);
    // Il vincolo e' sulla terra emersa, non sul raggio nominale: e' quella che
    // non deve arrivare al bordo della region.
    const radius = Math.min(
      pick(rnd, LANDFORM.lobeRadius),
      (LANDFORM.lobeReach - distance) / LANDFORM.lobeEmerged,
    );
    if (radius <= 0) continue;

    const radiusX = radius * shape.radiusX;
    const radiusY = radius * shape.radiusY;
    lobes.push({
      centreX: shape.centreX + distance * shape.radiusX * Math.cos(angle),
      centreY: shape.centreY + distance * shape.radiusY * Math.sin(angle),
      radiusX,
      radiusY,
      cap: capForRadius(Math.min(radiusX, radiusY), relief, LANDFORM.lobeSlope),
    });
  }

  return lobes;
}

/**
 * I rilievi interni, che spostano le vette fuori dal centro.
 *
 * Alzano verso il tetto invece di sommarsi: `amplitude` e' la frazione del
 * margine che resta fino a 1, non voxel in piu'. Cosi' una cupola sul fianco
 * dell'isola fa una collina vera, una sulla vetta non sfonda `maxHeight`, e
 * `elevationAt` non ha bisogno di un clamp che falserebbe il gradiente proprio
 * dove il terreno e' piu' alto.
 *
 * **Cupola e' un modo di dire, non piu' una forma.** Con la sagoma deformata le
 * curve di livello della vetta smettono di essere cerchi concentrici, che era
 * l'ultimo posto in cui il bersaglio si vedeva ancora: la maschera ha la sua
 * deformazione da sempre, ma sopra la fascia della roccia comanda il rilievo.
 */
export function planMounds(seed: number, shape: IslandShape, relief: number): Mound[] {
  const rnd = mulberry32(hashCoords(seed, LANDFORM.moundSalt, 0));
  const count = pickCount(rnd, LANDFORM.moundCount);
  const rotation = rnd() * TAU;
  const mounds: Mound[] = [];

  for (let i = 0; i < count; i++) {
    const jitter = LANDFORM.moundJitter * (rnd() - 0.5);
    const angle = rotation + ((i + jitter) * TAU) / count;
    const distance = pick(rnd, LANDFORM.moundDistance);
    const radius = pick(rnd, LANDFORM.moundRadius);

    const radiusX = radius * shape.radiusX;
    const radiusY = radius * shape.radiusY;
    // La sagoma esce da un flusso suo: pescandola da `rnd` ogni fase
    // consumata sposterebbe il rilievo successivo, e ritoccare un'ampiezza
    // rifarebbe l'isola invece della sola forma in pianta.
    const shapeRnd = shapeStream(seed, i);
    const warp = planWarp(shapeRnd);
    mounds.push({
      ...outlineOf(
        shape.centreX + distance * shape.radiusX * Math.cos(angle),
        shape.centreY + distance * shape.radiusY * Math.sin(angle),
        radiusX,
        radiusY,
        shapeRnd() * TAU,
        warp,
      ),
      // La deformazione si paga qui, non sul fianco: dividendo la pendenza
      // dichiarata per il suo fattore, il fianco piu' ripido della cupola
      // deformata vale ancora `moundSlope` esatti. Il tetto in forma chiusa
      // basta — una cupola sale su tutto il raggio, quindi non c'e' una fascia
      // stretta su cui misurare, e il margine qui e' largo.
      amplitude: capForRadius(
        Math.min(radiusX, radiusY),
        relief,
        LANDFORM.moundSlope / SHAPE_WARP_LIPSCHITZ,
      ),
    });
  }

  return mounds;
}

/**
 * Le conche che aprono uno specchio d'acqua interno.
 *
 * Sono le uniche a non essere piazzate alla cieca, e non per gusto: una conca
 * scavata dove il terreno e' alto chiede una parete che il budget di pendenza
 * non concede, e una scavata dove e' gia' sotto il mare non si vede. Il sito si
 * cerca quindi **guardando il campo**, che a questo punto della costruzione
 * esiste gia' — lobi e rilievi compresi — ed e' funzione pura del seed: la
 * ricerca costa qualche centinaio di campioni una volta sola per `HeightField`,
 * e resta identica in ogni worker.
 *
 * Tre condizioni, in ordine di costo:
 *
 * 1. la quota al centro sta nella fascia bassa, appena sopra il mare;
 * 2. il raggio che il dislivello impone lascia la conca dentro l'isola;
 * 3. la corona resta all'asciutto, altrimenti quello che si apre e' una laguna
 *    sul mare aperto e non un lago.
 *
 * @param heightAt il campo di quota **senza** conche, in voxel
 */
export function planBasins(
  seed: number,
  shape: IslandShape,
  relief: number,
  heightAt: (x: number, y: number) => number,
): Basin[] {
  const rnd = mulberry32(hashCoords(seed, LANDFORM.basinSalt, 0));
  const wanted = pickCount(rnd, LANDFORM.basinCount);
  const rotation = rnd() * TAU;
  const basins: Basin[] = [];
  if (wanted <= 0 || relief <= 0) return basins;

  const siteMin = TERRAIN.seaLevel + LANDFORM.basinRimAbove[0];
  const siteMax = TERRAIN.seaLevel + LANDFORM.basinRimAbove[1];
  const spread = LANDFORM.basinReach[1];
  const maxRadius = LANDFORM.basinMaxRadius * Math.min(shape.radiusX, shape.radiusY);

  const candidates: { site: BasinSite; radius: number; rimZ: number }[] = [];
  for (let i = 0; i < LANDFORM.basinCandidates; i++) {
    // Raggio come radice del progresso: e' cio' che distribuisce i candidati per
    // area invece che per raggio, senza addensarli al centro.
    const ratio = LANDFORM.basinReach[0] + spread * Math.sqrt((i + 0.5) / LANDFORM.basinCandidates);
    const angle = rotation + i * GOLDEN_ANGLE;
    const x = shape.centreX + ratio * shape.radiusX * Math.cos(angle);
    const y = shape.centreY + ratio * shape.radiusY * Math.sin(angle);

    const here = heightAt(x, y);
    if (here < siteMin || here > siteMax) continue;

    // Filtro di pianura, prima di qualunque conto piu' caro. Il raccordo deve
    // assorbire la differenza fra il bordo che la conca impone e il terreno che
    // trova, e su un fianco quella differenza cresce con il raggio quanto la
    // fascia che dovrebbe assorbirla: oltre una certa pendenza non c'e' raggio
    // che chiuda il conto, e cercarlo e' lavoro buttato.
    if (localSlope(heightAt, x, y, here) > LANDFORM.basinFlatSlope) continue;

    const rimZ = toCell(here);
    if (rimZ - LANDFORM.basinDrop <= TERRAIN.seaLevel) continue;

    // La sagoma si estrae **prima** del raggio: `fitRadius` deve sondare il
    // terreno lungo la conca che ci sara' davvero, e una conca allungata non
    // trova lo stesso terreno di una tonda. Il flusso e' quello del candidato,
    // non `rnd`, cosi' la forma di un sito non dipende da quanti siti sono
    // stati scartati prima di lui.
    const shapeRnd = shapeStream(seed, i);
    const site: BasinSite = {
      centreX: x,
      centreY: y,
      stretch: pick(shapeRnd, LANDFORM.basinStretch),
      angle: shapeRnd() * TAU,
      warp: planWarp(shapeRnd),
    };

    // La pendenza che la sponda di **questa** conca puo' permettersi: le sue
    // armoniche moltiplicano il gradiente, quindi la sponda nominale scende
    // piu' dolce perche' quella vera resti dentro `basinSlope`. Il fattore e'
    // misurato sulla sua fase e sulla **sola sponda**, non sul tetto di tutte le
    // fasi a tutti i raggi: qui ogni punto percentuale e' raggio, e il raggio
    // decide se il sito la ospita.
    const slope =
      LANDFORM.basinSlope
      / warpLipschitz(site.warp, LANDFORM.basinPlateau, LANDFORM.basinBank);
    // Raggio che la sponda impone da sola, prima di qualunque raccordo: il
    // dislivello e' fisso, quindi lo e' anche questo.
    const bankRadius =
      (HALF_PI * LANDFORM.basinDrop) / ((LANDFORM.basinBank - LANDFORM.basinPlateau) * slope);

    const radius = fitRadius(heightAt, site, rimZ, bankRadius, maxRadius, slope);
    if (radius <= 0) continue;
    candidates.push({ site, radius, rimZ });
  }

  // Il piu' stretto per primo: a parita' di dislivello un raccordo corto vuol
  // dire un sito piu' piano, cioe' un lago che si posa invece di un cratere che
  // rimodella mezzo versante. L'ordinamento e' deterministico quanto la lista da
  // cui parte.
  candidates.sort((a, b) => a.radius - b.radius);

  for (const candidate of candidates) {
    if (basins.length >= wanted) break;
    const outline = basinOutline(candidate.site, candidate.radius);
    if (overlapsBasin(basins, outline)) continue;
    const floorZ = candidate.rimZ - LANDFORM.basinDrop;
    basins.push({
      ...outline,
      floor: (floorZ - TERRAIN.oceanFloor) / relief,
      rim: (candidate.rimZ - TERRAIN.oceanFloor) / relief,
      waterZ: floorZ + LANDFORM.basinWaterDepth,
    });
  }

  return basins;
}

/**
 * La sagoma che un sito prende con un dato semiasse minore.
 *
 * Il **minore** e' quello che il budget di pendenza vincola: la sponda scende
 * piu' ripida dove la conca e' piu' stretta, quindi allungare una conca non
 * costa pendenza — costa solo l'ingombro che `basinMaxRadius` limita.
 */
function basinOutline(site: BasinSite, radius: number): Outline {
  return outlineOf(
    site.centreX,
    site.centreY,
    radius * site.stretch,
    radius,
    site.angle,
    site.warp,
  );
}

/** Pendenza del terreno intorno al sito, misurata sulla scala di una conca. */
function localSlope(
  heightAt: (x: number, y: number) => number,
  x: number,
  y: number,
  here: number,
): number {
  const span = LANDFORM.basinFlatSpan;
  return Math.max(
    Math.abs(heightAt(x + span, y) - here),
    Math.abs(heightAt(x - span, y) - here),
    Math.abs(heightAt(x, y + span) - here),
    Math.abs(heightAt(x, y - span) - here),
  ) / span;
}

/** Quota portata al cubo di terreno che la contiene: un lago non sta a mezza cella. */
function toCell(z: number): number {
  return Math.floor(z / TERRAIN.cellSize) * TERRAIN.cellSize;
}

/**
 * Quota della superficie del lago in `(x, y)`, oppure 0 fuori da ogni conca.
 *
 * E' l'unica cosa che il generatore deve chiedere alla sagoma mentre scrive le
 * colonne, e per questo torna una quota assoluta e non una conca: chi scrive
 * l'acqua non ha bisogno di sapere che le conche esistono.
 */
export function lakeLevelAt(basins: readonly Basin[], x: number, y: number): number {
  let level = 0;
  for (const basin of basins) {
    if (basin.waterZ <= level) continue;
    const ratio = outlineRatio(basin, x, y);
    // Il pelo sta dentro la **conca**, non dentro l'ellisse d'influenza: oltre
    // `basinBank` comincia il raccordo, dove il terreno torna quello che era e
    // puo' benissimo ripassare sotto la quota del lago senza essere il lago. A
    // riempire anche quello si otteneva un anello d'acqua staccato dallo
    // specchio, con una fascia asciutta in mezzo.
    if (ratio <= LANDFORM.basinBank) level = basin.waterZ;
  }
  return level;
}

/**
 * Raggio della conca, oppure 0 se il sito non ne concede uno.
 *
 * Due vincoli, e vince il piu' largo:
 *
 * 1. la **sponda** deve scendere di `basinDrop` dentro la sua fascia senza
 *    superare `basinSlope` — un raggio minimo fisso, che non dipende dal sito;
 * 2. il **raccordo** deve riportare il bordo imposto al terreno che c'e', e
 *    quel salto e' tanto piu' grande quanto piu' il sito e' in pendenza.
 *
 * Il secondo e' un punto fisso: il salto si misura sulla corona, che dipende dal
 * raggio. Si itera partendo dal raggio della sponda e allargando; se dopo
 * l'ultima passata non basta ancora, il sito e' su un fianco — la' il salto
 * cresce col raggio quanto la fascia che dovrebbe assorbirlo, e nessuna
 * larghezza chiude il conto.
 */
export function fitRadius(
  heightAt: (x: number, y: number) => number,
  site: BasinSite,
  rimZ: number,
  bankRadius: number,
  maxRadius: number,
  slope: number,
): number {
  const blend = (1 - LANDFORM.basinBank) * slope;
  let radius = bankRadius;
  for (let pass = 0; pass < LANDFORM.basinFitPasses; pass++) {
    // Il tetto vale sull'ingombro, cioe' sul semiasse maggiore: e' quello che
    // deve restare dentro l'isola.
    if (radius * site.stretch > maxRadius) return 0;
    const needed =
      (HALF_PI * ringMismatch(heightAt, basinOutline(site, radius), rimZ)) / blend;
    if (needed <= radius) return radius;
    radius = needed;
  }
  return 0;
}

/**
 * Salto massimo fra il bordo imposto e il terreno, sulla fascia di raccordo.
 *
 * Le sonde stanno **sulla sagoma** e non su una circonferenza: da quando la
 * conca e' allungata e deformata, il raccordo passa dove la sagoma lo porta, e
 * un cerchio lo misurerebbe dove non c'e' — troppo dentro da un lato, gia'
 * fuori dall'altro.
 */
function ringMismatch(
  heightAt: (x: number, y: number) => number,
  outline: Outline,
  rimZ: number,
): number {
  let mismatch = 0;
  for (const ratio of LANDFORM.basinBlendRings) {
    for (let i = 0; i < LANDFORM.basinShoreProbes; i++) {
      const [x, y] = outlinePoint(outline, ratio, (i * TAU) / LANDFORM.basinShoreProbes);
      const here = Math.abs(heightAt(x, y) - rimZ);
      if (here > mismatch) mismatch = here;
    }
  }
  return mismatch;
}

/**
 * Due conche non si sovrappongono: due pozze accostate leggono come una sola.
 *
 * Il confronto e' sui semiassi maggiori, che e' il caso peggiore: due conche
 * allungate possono avvicinarsi molto piu' di cosi' senza toccarsi, ma
 * distinguere l'orientamento vorrebbe dire risolvere l'intersezione di due
 * ellissi ruotate per tenere una conca in piu' su un'isola che ne concede due.
 */
function overlapsBasin(basins: readonly Basin[], outline: Outline): boolean {
  const major = Math.max(outline.radiusX, outline.radiusY);
  for (const basin of basins) {
    const dx = outline.centreX - basin.centreX;
    const dy = outline.centreY - basin.centreY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const reach = major + Math.max(basin.radiusX, basin.radiusY);
    if (distance < reach * LANDFORM.basinSpacing) return true;
  }
  return false;
}

/**
 * Alza l'elevazione verso il tetto secondo i rilievi presenti.
 *
 * Restituisce la frazione di margine da consumare, in `[0, 1]`: e' il chiamante
 * a comporla con `base + rise * (1 - base)`, cosi' il tetto e' rispettato per
 * costruzione e non per clamp.
 */
export function moundRise(mounds: readonly Mound[], x: number, y: number): number {
  let rise = 0;
  for (const mound of mounds) {
    const ratio = outlineRatio(mound, x, y);
    if (ratio >= 1) continue;
    const value = mound.amplitude * domeFalloff(ratio);
    // Massimo e non somma: due cupole accostate devono fare una collina sola,
    // altrimenti la loro sovrapposizione supererebbe il budget di pendenza di
    // entrambe proprio dove i due fianchi gia' si sommano.
    if (value > rise) rise = value;
  }
  return rise;
}

/**
 * Impone il profilo delle conche all'elevazione.
 *
 * Non e' ne' solo scavo ne' solo riempimento: dentro il bordo la conca sostituisce
 * il terreno con il proprio profilo — fondo, sponda, bordo — e fuori lo lascia
 * stare, con una fascia di raccordo in mezzo. E' quella sostituzione a rendere il
 * lago chiuso comunque fosse il terreno di partenza.
 */
export function shapeBasins(elevation: number, basins: readonly Basin[], x: number, y: number): number {
  let out = elevation;
  for (const basin of basins) {
    const ratio = outlineRatio(basin, x, y);
    if (ratio >= 1) continue;
    const target = basinProfile(ratio, basin.floor, basin.rim);
    out += basinWeight(ratio) * (target - out);
  }
  return out;
}
