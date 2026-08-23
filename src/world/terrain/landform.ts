import { hashCoords, mulberry32 } from '../rng';
import { LANDFORM, TERRAIN } from './config';
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
export interface Mound {
  readonly centreX: number;
  readonly centreY: number;
  readonly radiusX: number;
  readonly radiusY: number;
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
export interface Basin {
  readonly centreX: number;
  readonly centreY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  /** Elevazione del fondo e del bordo, nelle stesse unita' di `elevationAt`. */
  readonly floor: number;
  readonly rim: number;
  /** Quota della superficie del lago, in voxel. Multiplo di `TERRAIN.cellSize`. */
  readonly waterZ: number;
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

/** Raggio normalizzato di un punto rispetto a un'ellisse. */
export function ellipseRatio(
  x: number,
  y: number,
  centreX: number,
  centreY: number,
  radiusX: number,
  radiusY: number,
): number {
  const dx = (x - centreX) / radiusX;
  const dy = (y - centreY) / radiusY;
  return Math.sqrt(dx * dx + dy * dy);
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
    mounds.push({
      centreX: shape.centreX + distance * shape.radiusX * Math.cos(angle),
      centreY: shape.centreY + distance * shape.radiusY * Math.sin(angle),
      radiusX,
      radiusY,
      amplitude: capForRadius(Math.min(radiusX, radiusY), relief, LANDFORM.moundSlope),
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
  // Raggio che la sponda impone da sola, prima di qualunque raccordo: il
  // dislivello e' fisso, quindi lo e' anche questo.
  const bankRadius =
    (HALF_PI * LANDFORM.basinDrop)
    / ((LANDFORM.basinBank - LANDFORM.basinPlateau) * LANDFORM.basinSlope);

  const candidates: { x: number; y: number; radius: number; rimZ: number }[] = [];
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

    const radius = fitRadius(heightAt, x, y, rimZ, bankRadius, maxRadius);
    if (radius <= 0) continue;
    candidates.push({ x, y, radius, rimZ });
  }

  // Il piu' stretto per primo: a parita' di dislivello un raccordo corto vuol
  // dire un sito piu' piano, cioe' un lago che si posa invece di un cratere che
  // rimodella mezzo versante. L'ordinamento e' deterministico quanto la lista da
  // cui parte.
  candidates.sort((a, b) => a.radius - b.radius);

  for (const candidate of candidates) {
    if (basins.length >= wanted) break;
    if (overlapsBasin(basins, candidate.x, candidate.y, candidate.radius)) continue;
    const floorZ = candidate.rimZ - LANDFORM.basinDrop;
    basins.push({
      centreX: candidate.x,
      centreY: candidate.y,
      radiusX: candidate.radius,
      radiusY: candidate.radius,
      floor: (floorZ - TERRAIN.oceanFloor) / relief,
      rim: (candidate.rimZ - TERRAIN.oceanFloor) / relief,
      waterZ: floorZ + LANDFORM.basinWaterDepth,
    });
  }

  return basins;
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
    const ratio = ellipseRatio(x, y, basin.centreX, basin.centreY, basin.radiusX, basin.radiusY);
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
  centreX: number,
  centreY: number,
  rimZ: number,
  bankRadius: number,
  maxRadius: number,
): number {
  const blend = (1 - LANDFORM.basinBank) * LANDFORM.basinSlope;
  let radius = bankRadius;
  for (let pass = 0; pass < LANDFORM.basinFitPasses; pass++) {
    if (radius > maxRadius) return 0;
    const needed = (HALF_PI * ringMismatch(heightAt, centreX, centreY, radius, rimZ)) / blend;
    if (needed <= radius) return radius;
    radius = needed;
  }
  return 0;
}

/** Salto massimo fra il bordo imposto e il terreno, sulla fascia di raccordo. */
function ringMismatch(
  heightAt: (x: number, y: number) => number,
  centreX: number,
  centreY: number,
  radius: number,
  rimZ: number,
): number {
  let mismatch = 0;
  for (const ratio of LANDFORM.basinBlendRings) {
    for (let i = 0; i < LANDFORM.basinShoreProbes; i++) {
      const angle = (i * TAU) / LANDFORM.basinShoreProbes;
      const x = centreX + radius * ratio * Math.cos(angle);
      const y = centreY + radius * ratio * Math.sin(angle);
      const here = Math.abs(heightAt(x, y) - rimZ);
      if (here > mismatch) mismatch = here;
    }
  }
  return mismatch;
}

/** Due conche non si sovrappongono: due pozze accostate leggono come una sola. */
function overlapsBasin(basins: readonly Basin[], x: number, y: number, radius: number): boolean {
  for (const basin of basins) {
    const dx = x - basin.centreX;
    const dy = y - basin.centreY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < (radius + basin.radiusX) * LANDFORM.basinSpacing) return true;
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
    const ratio = ellipseRatio(x, y, mound.centreX, mound.centreY, mound.radiusX, mound.radiusY);
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
    const ratio = ellipseRatio(x, y, basin.centreX, basin.centreY, basin.radiusX, basin.radiusY);
    if (ratio >= 1) continue;
    const target = basinProfile(ratio, basin.floor, basin.rim);
    out += basinWeight(ratio) * (target - out);
  }
  return out;
}
