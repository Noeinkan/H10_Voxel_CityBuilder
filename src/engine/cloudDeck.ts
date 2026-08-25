/**
 * Lo strato di nuvole a quota, in TypeScript puro.
 *
 * Come `atmosphere.ts` e `lighting.ts` non importa Three e non tocca il DOM:
 * gira nei test in ambiente node ed e' la copia leggibile di cio' che il
 * fragment shader riscrive in GLSL. `cloudDeck.test.ts` e' cio' che tiene
 * allineate le due copie.
 *
 * **Quattro scelte, e nessuna delle quattro e' quella ovvia.**
 *
 * 1. **E' uno strato vero, e si vede anche dove non c'e' niente sotto.** La
 *    prima versione lo disegnava solo sui frammenti, quindi la nuvola esisteva
 *    solo dove qualcosa la riceveva: su una citta' giovane, da nessuna parte.
 *    Il piano invece e' li' comunque, e il fondo procedurale lo disegna con le
 *    stesse formule di questo file — l'unica differenza e' da dove arriva il
 *    punto di attraversamento, un frammento di qua e una matrice di la'.
 *
 * 2. **La nuvola e' fatta di celle, come tutto il resto.** Il rumore non si
 *    campiona con continuita' ma sulla **cella di mondo** in cui cade il punto:
 *    il bordo di un banco e' netto e allineato alla griglia dei voxel, non una
 *    sfumatura. In un gioco fatto di cubi una nuvola sfumata e' l'unico oggetto
 *    che non lo e'.
 *
 * 3. **Ha uno spessore che si vede, e per vederlo si attraversa.** Lo strato
 *    non e' un piano con una rampa di opacita' addosso — quello era il giro
 *    precedente, e a schermo dava un velo piatto — ma una **lastra**: il raggio
 *    la taglia su `CLOUD_SLICES` quote e il banco e' l'unione dei campioni. Con
 *    una camera obliqua le quote cadono su XY diversi, quindi un banco e' un
 *    prisma di cui si vede il **fianco**, e il fianco e' cio' che si legge come
 *    volume. Il fianco e' anche piu' scuro della sommita' (`cloudShade`): due
 *    facce con la stessa tinta tornerebbero a essere una macchia sola.
 *
 * 4. **Ci si vede attraverso con la rigatura dei raggi X**, non con una
 *    trasparenza. E' la stessa `hatchThreshold` di `inspect.glsl.ts`, con la
 *    stessa costante: a parita' di copertura una soglia ordinata sparpaglia e i
 *    pixel sparsi leggono come sporco, mentre in fila leggono come campitura.
 *    La densita' della nuvola decide **quante** righe, cosi' un banco fitto
 *    copre quasi tutto e uno rado lascia vedere la torre che ci sta dentro.
 *
 * **Ogni attraversamento e' in forma chiusa**, per la stessa ragione per cui lo
 * e' l'integrale di nebbia: la camera e' ortografica, tutti i raggi di vista
 * sono paralleli, e la quota lungo il raggio e' lineare. Campionare **la'** e
 * non sull'XY del frammento e' cio' che fa stare le nuvole ferme nel mondo, con
 * la loro parallasse, invece che dipinte sui tetti.
 */

import { INSPECT } from './inspect';

/**
 * I sette numeri che descrivono lo strato.
 *
 * Sta qui e non in `themes/theme.ts` per la stessa ragione di `FogModel`: chi
 * li tara deve poter leggere le formule che li consumano senza cambiare file.
 */
export interface CloudDeckModel {
  /**
   * Quota del cuore della lastra, in voxel di mondo.
   *
   * **Segue la scala della citta', non un gusto.** Va tenuta dove arrivano le
   * cime: piu' in basso la nuvola avvolge il tessuto ordinario e diventa smog,
   * piu' in alto non incontra piu' niente e non si vede affatto.
   */
  readonly height: number;
  /**
   * Spessore della lastra, in voxel: quanto e' **alta** una nuvola.
   *
   * Non e' una sfumatura ai bordi ma una misura vera, e in una vista obliqua si
   * legge come larghezza del fianco: un banco visto di taglio sporge di circa
   * `thickness` anche in orizzontale. Sopra la sommita' non c'e' piu' nuvola —
   * una cima che emerge esce pulita — e il taglio non e' una riga netta perche'
   * le fette che restano davanti diminuiscono a scalini salendo.
   */
  readonly thickness: number;
  /**
   * Quanta parte dei pixel un banco pieno arriva a coprire, 0..1.
   *
   * **Sotto 1 per contratto**, non per taratura: a 1 la rigatura si chiude e la
   * nuvola diventa un muro. Ci si deve poter vedere attraverso sempre.
   */
  readonly amount: number;
  /** Frazione di celle che porta nuvola, 0..1. E' cio' che apre i varchi. */
  readonly coverage: number;
  /**
   * Lato della cella di nuvola, in voxel.
   *
   * E' la grana: sotto una manciata di voxel il banco torna a essere una
   * sfumatura, sopra la ventina diventa un muro squadrato senza dettaglio.
   */
  readonly cellSize: number;
  /** Periodo del rumore in voxel: quanto e' grande un banco, non una cella. */
  readonly scale: number;
  /** Deriva del banco, in periodi al secondo. */
  readonly speed: number;
}

/** Densita' e faccia colpita: cio' che serve per dipingere il pixel. */
export interface CloudHit {
  /** Quanta parte dei pixel copre, in 0..`amount`. Zero vuol dire niente. */
  readonly density: number;
  /** 1 sulla sommita' della lastra, 0 sul fianco piu' profondo. */
  readonly face: number;
}

/**
 * Su quante quote si campiona la lastra.
 *
 * E' il numero che compra lo spessore, e si paga per pixel: quattro fette sono
 * quattro letture di rumore invece di una. Sotto tre il fianco diventa una
 * scala di due gradini e si legge come errore; sopra cinque non si distingue
 * piu' niente di nuovo, perche' la quantizzazione per cella ha gia' mangiato la
 * differenza. Con lo strato spento — che e' il valore di partenza del gioco —
 * non si paga niente: la densita' esce a zero prima del ciclo.
 */
export const CLOUD_SLICES = 4;

/**
 * Quanto e' piu' scuro il fianco della lastra rispetto alla sua sommita'.
 *
 * Senza, il prisma resta un'unica campitura piatta e lo spessore si vede solo
 * come sagoma piu' larga — che e' esattamente il difetto da cui questo giro e'
 * partito. Non e' un'illuminazione: e' il minimo che serve perche' due facce
 * dello stesso banco non siano lo stesso colore.
 */
export const CLOUD_SIDE_SHADE = 0.72;

/**
 * Densita' minima di una cella che porta nuvola.
 *
 * Una cella appena sopra soglia sarebbe indistinguibile dal vuoto e il bordo del
 * banco si sfrangerebbe in pixel isolati — cioe' proprio lo sporco che la
 * rigatura esiste per non produrre. Sotto questa soglia una cella e' vuota.
 */
export const CLOUD_MIN_DENSITY = 0.45;

/**
 * Sotto questa componente verticale il raggio e' troppo radente perche' la
 * risalita allo strato abbia senso: la distanza esploderebbe e il campione
 * cadrebbe a chilometri di distanza.
 *
 * La camera isometrica di questo progetto guarda in basso di 35 gradi, quindi
 * vale circa -0,57 e la guardia non entra mai. Esiste per le scene di misura,
 * che inquadrano da dove vogliono.
 */
export const CLOUD_GRAZING_EPSILON = 0.05;

const NO_CLOUD: CloudHit = { density: 0, face: 0 };

/** Quota della sommita' della lastra: sopra di qui non c'e' nuvola. */
export function cloudTop(deck: CloudDeckModel): number {
  return deck.height + thicknessOf(deck) / 2;
}

/** Quota della base: sotto di qui la lastra sta davanti tutta intera. */
export function cloudBase(deck: CloudDeckModel): number {
  return deck.height - thicknessOf(deck) / 2;
}

/**
 * Quota della fetta `index`, dalla sommita' verso il basso.
 *
 * Le fette stanno al **centro** del loro strato e non ai bordi: campionare sui
 * bordi metterebbe due fette a coincidere con la sommita' e la base, e la lastra
 * risulterebbe piu' spessa di quanto e'.
 */
export function cloudSliceHeight(index: number, deck: CloudDeckModel): number {
  return cloudTop(deck) - (index + 0.5) * (thicknessOf(deck) / CLOUD_SLICES);
}

/**
 * Dove il raggio che arriva a un punto attraversa un piano orizzontale.
 *
 * `viewDir` e' la direzione di sguardo — dalla camera verso la scena, quindi con
 * `z` negativa — ed e' un vettore per frame e non per pixel: la camera e'
 * ortografica. Risalendo il raggio di `s` la quota vale `z - viewDir.z * s`, e
 * imporla uguale a quella del piano da' `s` in una divisione sola.
 */
export function cloudCrossing(
  x: number,
  y: number,
  z: number,
  viewDir: readonly [number, number, number],
  planeZ: number,
): [number, number] {
  const dz = grazingGuard(viewDir[2]);
  const s = (z - planeZ) / dz;
  return [x - viewDir[0] * s, y - viewDir[1] * s];
}

/**
 * Densita' della cella di nuvola in un punto del piano: 0 dove non ce n'e',
 * fra `CLOUD_MIN_DENSITY` e 1 dove ce n'e'.
 *
 * **Il rumore si legge sulla cella, non sul punto.** E' la riga che rende la
 * nuvola un oggetto di voxel: dentro una cella il valore e' uno solo, quindi il
 * bordo del banco cade sulla griglia del mondo e non dove capita.
 */
export function cloudCell(x: number, y: number, time: number, deck: CloudDeckModel): number {
  const cell = Math.max(1e-3, deck.cellSize);
  // Il centro della cella, non il suo spigolo: campionare sullo spigolo
  // aggancia il rumore alla griglia e fa comparire filari di celle uguali.
  const cx = (Math.floor(x / cell) + 0.5) * cell;
  const cy = (Math.floor(y / cell) + 0.5) * cell;
  const scale = Math.max(1e-3, deck.scale);

  const value = cloudNoise(cx / scale + time * deck.speed, cy / scale);
  if (value < 1 - deck.coverage) return 0;
  // Riscalato sopra la soglia: al bordo del banco le celle sono rade, nel cuore
  // sono piene. Senza, un banco sarebbe una macchia di densita' uniforme.
  const over = deck.coverage <= 0 ? 0 : (value - (1 - deck.coverage)) / deck.coverage;
  return CLOUD_MIN_DENSITY + (1 - CLOUD_MIN_DENSITY) * clamp01(over);
}

/**
 * La soglia della rigatura in un pixel di schermo: la stessa `hatchThreshold`
 * dei raggi X, con la stessa costante.
 *
 * Vale la ragione scritta li': a parita' di copertura un retino ordinato
 * sparpaglia e i pixel sparsi leggono come sporco davanti al soggetto, mentre in
 * fila leggono come una campitura. Riusarla vuol dire anche che nuvola e vista
 * di ispezione parlano la stessa lingua invece di due dialetti simili.
 */
export function cloudHatch(fragX: number, fragY: number): number {
  return fract((fragX + fragY) / INSPECT.hatch);
}

/**
 * Attraversa la lastra sul raggio che arriva a questo punto.
 *
 * **Le fette sotto il punto non contano**: stanno dietro al frammento, e una
 * nuvola dietro un tetto non lo copre. E' questo che fa uscire pulita una cima
 * che emerge, e che la fa entrare nel banco a scalini invece che di colpo.
 *
 * Della lastra si tiene la cella **piu' fitta** fra quelle attraversate — il
 * banco e' pieno, non un accumulo di veli — ma la faccia e' quella della
 * **prima** fetta colpita dall'alto: se la sommita' non c'e' e c'e' una fetta
 * sotto, quel pixel sta guardando il fianco del prisma.
 */
export function cloudTrace(
  x: number,
  y: number,
  z: number,
  viewDir: readonly [number, number, number],
  time: number,
  deck: CloudDeckModel,
): CloudHit {
  if (deck.amount <= 0) return NO_CLOUD;
  if (z >= cloudTop(deck)) return NO_CLOUD;

  let best = 0;
  let face = 0;
  for (let i = 0; i < CLOUD_SLICES; i++) {
    const sliceZ = cloudSliceHeight(i, deck);
    if (sliceZ < z) continue;
    const [cx, cy] = cloudCrossing(x, y, z, viewDir, sliceZ);
    const value = cloudCell(cx, cy, time, deck);
    if (best <= 0 && value > 0) face = 1 - i / (CLOUD_SLICES - 1);
    if (value > best) best = value;
  }
  return { density: deck.amount * best, face };
}

/**
 * Quanta parte dei pixel la nuvola copre su questo frammento, in 0..`amount`.
 *
 * E' una **densita' di rigatura**, non un'opacita': chi la consuma la confronta
 * con `cloudHatch` e decide pixel per pixel, cosi' cio' che sta dietro si vede
 * fra le righe invece di essere impastato con la nuvola.
 */
export function cloudDensity(
  x: number,
  y: number,
  z: number,
  viewDir: readonly [number, number, number],
  time: number,
  deck: CloudDeckModel,
): number {
  return cloudTrace(x, y, z, viewDir, time, deck).density;
}

/**
 * La stessa lastra su un pixel di cielo, dove non c'e' nessun frammento.
 *
 * Dietro il fondo non c'e' niente, quindi lo strato gli sta davanti **tutto**:
 * basta scendere lungo il raggio fino alla base e da li' attraversare come da un
 * frammento qualunque. Passare per la stessa `cloudTrace` invece di riscriverla
 * e' cio' che fa combaciare le due meta' sul filo della sagoma dell'isola —
 * stesse fette, stesse celle, stessa faccia.
 */
export function cloudSkyTrace(
  x: number,
  y: number,
  z: number,
  viewDir: readonly [number, number, number],
  time: number,
  deck: CloudDeckModel,
): CloudHit {
  const base = cloudBase(deck);
  const [bx, by] = cloudCrossing(x, y, z, viewDir, base);
  return cloudTrace(bx, by, base, viewDir, time, deck);
}

/** Come sopra, quando al chiamante serve solo quante righe coprire. */
export function cloudSkyDensity(
  x: number,
  y: number,
  z: number,
  viewDir: readonly [number, number, number],
  time: number,
  deck: CloudDeckModel,
): number {
  return cloudSkyTrace(x, y, z, viewDir, time, deck).density;
}

/** Quanto scurire la tinta del banco su questa faccia: piena in cima, meno di lato. */
export function cloudShade(face: number): number {
  return CLOUD_SIDE_SHADE + (1 - CLOUD_SIDE_SHADE) * clamp01(face);
}

/** true se la nuvola copre **questo** pixel. E' la domanda che il fragment fa. */
export function cloudCovers(
  x: number,
  y: number,
  z: number,
  viewDir: readonly [number, number, number],
  time: number,
  fragX: number,
  fragY: number,
  deck: CloudDeckModel,
): boolean {
  return cloudHatch(fragX, fragY) < cloudDensity(x, y, z, viewDir, time, deck);
}

/**
 * Rumore dello strato, in 0..1.
 *
 * Due ottave e non quattro: i banchi sono grandi, e la terza ottava a questa
 * scala si perderebbe comunque dentro la quantizzazione per cella. La
 * normalizzazione per la somma delle ampiezze e' cio' che rende esatto — e non
 * approssimato — l'intervallo su cui poggia la soglia di copertura.
 */
export function cloudNoise(x: number, y: number): number {
  return (0.5 * valueNoise(x, y) + 0.25 * valueNoise(x * 2.03 + 17, y * 2.03 + 17)) / 0.75;
}

/** Uno spessore nullo farebbe collassare la lastra su un piano solo. */
function thicknessOf(deck: CloudDeckModel): number {
  return Math.max(deck.thickness, 1e-3);
}

/** Tiene la componente verticale lontana dallo zero, con il suo segno. */
function grazingGuard(dz: number): number {
  if (dz <= -CLOUD_GRAZING_EPSILON || dz >= CLOUD_GRAZING_EPSILON) return dz;
  return dz < 0 ? -CLOUD_GRAZING_EPSILON : CLOUD_GRAZING_EPSILON;
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smootherStep(x - ix);
  const fy = smootherStep(y - iy);

  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

/**
 * La stessa `hash21` del fondo procedurale: un hash di due float, non un PRNG.
 *
 * **Il secondo passo non ha un `fract` addosso**, e non e' una svista da
 * correggere: e' proprio uscire da 0..1 prima di moltiplicare che rende il
 * risultato quasi uniforme. Chiudendolo dentro l'intervallo si finisce a
 * moltiplicare due uniformi, la cui media e' un quarto — misurato, il rumore si
 * accalcava sul basso e i banchi non arrivavano mai a essere pieni.
 *
 * Fra CPU e GPU la precisione dei float cambia il **disegno** delle celle,
 * perche' si prende la parte frazionaria di numeri nell'ordine delle migliaia.
 * Non cambia niente di cio' su cui il modello poggia — intervallo, determinismo,
 * quantizzazione — ed e' su quello che il test insiste.
 */
function hash(x: number, y: number): number {
  let px = fract(x * 123.34);
  let py = fract(y * 456.21);
  const dot = px * px + py * py + px * 45.32 + py * 45.32;
  px += dot;
  py += dot;
  return fract(px * py);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function smootherStep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
