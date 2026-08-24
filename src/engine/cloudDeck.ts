/**
 * Lo strato di nuvole a quota, in TypeScript puro.
 *
 * Come `atmosphere.ts` e `lighting.ts` non importa Three e non tocca il DOM:
 * gira nei test in ambiente node ed e' la copia leggibile di cio' che il
 * fragment shader riscrive in GLSL. `cloudDeck.test.ts` e' cio' che tiene
 * allineate le due copie.
 *
 * **Non e' un secondo velo di quota: e' un piano nello spazio.** La differenza
 * si vede subito. Il velo di `fogAltitudeLift` e' una funzione della sola quota
 * del frammento, quindi tinge il basso in modo uniforme e resta una tinta
 * piatta: da' foschia, non un *fondo*. Qui invece c'e' uno strato a una quota
 * del mondo, e cio' che decide quanto un frammento sia velato e' se il raggio
 * che lo raggiunge **attraversa** lo strato:
 *
 * - un frammento sopra la sommita' dello strato non e' velato affatto;
 * - uno sotto la base lo e' per intero;
 * - dentro, in proporzione a quanto ne resta sopra di lui.
 *
 * E' questo che fa leggere alta una quota alta: un impalcato sopra le nuvole si
 * staglia pulito mentre la citta' sotto sparisce, e non c'e' bisogno di vedere
 * il suolo per sapere quanto e' lontano.
 *
 * **La copertura non e' continua, ed e' la seconda meta' del lavoro.** Un velo
 * pieno sotto lo strato cancellerebbe i livelli inferiori invece di lasciarli
 * intravedere: una soglia sul rumore apre i **varchi**, e la citta' bassa si
 * legge a tratti attraverso di essi. Un pavimento di nuvole senza buchi e' un
 * fondale, non un fondo.
 *
 * **Il rumore si campiona dove il raggio taglia lo strato**, non sull'XY del
 * frammento. E' la riga che fa la differenza fra nuvole che stanno ferme nel
 * mondo — con la loro parallasse, mentre la camera scorre — e nuvole dipinte
 * sui tetti degli edifici. Il punto di attraversamento e' in forma chiusa per
 * la stessa ragione per cui lo e' l'integrale di nebbia: la camera e'
 * ortografica, tutti i raggi di vista sono paralleli, e la quota lungo il raggio
 * e' lineare.
 */

/**
 * I sei numeri che descrivono lo strato.
 *
 * Sta qui e non in `themes/theme.ts` per la stessa ragione di `FogModel`: chi
 * li tara deve poter leggere le formule che li consumano senza cambiare file.
 */
export interface CloudDeckModel {
  /**
   * Quota del piano medio dello strato, in voxel di mondo.
   *
   * **Segue la scala della citta', non un gusto.** Va tenuta sopra i podi e
   * sotto le cime: piu' in basso lo strato copre la citta' al suolo e basta,
   * piu' in alto non ci passa piu' niente sotto e lo strato non separa niente.
   */
  readonly height: number;
  /** Spessore: dentro, il velo cresce con continuita' invece di scattare. */
  readonly thickness: number;
  /** Velo di picco dove la nuvola e' piena, 0..1. A 0 lo strato non esiste. */
  readonly amount: number;
  /**
   * Frazione del piano occupata dalla nuvola, 0..1.
   *
   * E' il parametro che apre i varchi, e va guardato **insieme** ad `amount`:
   * il primo dice quanto e' fitta una macchia, questo quanta parte del cielo ne
   * porta una. A 1 lo strato e' un coperchio e i livelli inferiori spariscono
   * per sempre, che e' esattamente cio' che questo modello esiste per evitare.
   */
  readonly coverage: number;
  /** Dimensione delle macchie in voxel: e' il periodo del rumore. */
  readonly scale: number;
  /** Deriva dello strato, in frazioni di macchia al secondo. */
  readonly speed: number;
}

/**
 * Morbidezza del bordo di una macchia, in unita' di rumore.
 *
 * Non e' estetica pura: con una soglia netta il bordo si accende su un pixel e
 * il rumore per-frammento si vede come un contorno seghettato. E' una costante e
 * non un parametro di tema perche' vive nella scala del rumore, che non cambia.
 */
export const CLOUD_EDGE_SOFTNESS = 0.12;

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

/**
 * Dove il raggio che arriva a questo frammento attraversa il piano dello strato.
 *
 * `viewDir` e' la direzione di sguardo — dalla camera verso la scena, quindi con
 * `z` negativa — ed e' un vettore per frame e non per pixel: la camera e'
 * ortografica. Risalendo il raggio di `s` la quota vale `z - viewDir.z * s`, e
 * imporla uguale a quella dello strato da' `s` in una divisione sola.
 */
export function cloudCrossing(
  x: number,
  y: number,
  z: number,
  viewDir: readonly [number, number, number],
  deck: CloudDeckModel,
): [number, number] {
  const dz = grazingGuard(viewDir[2]);
  const s = (z - deck.height) / dz;
  return [x - viewDir[0] * s, y - viewDir[1] * s];
}

/**
 * Quanta parte dello strato sta fra la camera e un frammento a questa quota,
 * in 0..1. Zero sopra la sommita', uno sotto la base.
 */
export function cloudDepth(height: number, deck: CloudDeckModel): number {
  const half = deck.thickness / 2;
  return 1 - smoothstep(deck.height - half, deck.height + half, height);
}

/**
 * Quanto e' piena la nuvola in un punto del piano, in 0..1.
 *
 * La soglia si muove con la copertura: piu' copertura, piu' basso il valore di
 * rumore che basta a fare nuvola. L'intervallo e' mappato in modo che gli
 * estremi siano **esatti** — a copertura 0 non passa niente, a 1 passa tutto —
 * invece di lasciare mezza soglia dentro il dominio del rumore.
 *
 * Fra gli estremi la corrispondenza con la frazione di piano coperta e'
 * approssimativa, e non poteva essere altrimenti: il rumore non e' uniforme ma
 * a campana attorno a mezzo, quindi a copertura 0,5 copre davvero meta' piano,
 * e agli estremi la curva e' piu' pigra di cosi'.
 */
export function cloudMass(noise: number, deck: CloudDeckModel): number {
  const lo = 1 - deck.coverage * (1 + 2 * CLOUD_EDGE_SOFTNESS);
  return smoothstep(lo, lo + 2 * CLOUD_EDGE_SOFTNESS, noise);
}

/**
 * Rumore dello strato in un punto del suo piano, in 0..1.
 *
 * Due ottave e non quattro: le macchie di uno strato di nuvole sono grandi, e la
 * terza ottava aggiungerebbe un dettaglio che a questa scala si vede come
 * sfarfallio. La normalizzazione per la somma delle ampiezze e' cio' che rende
 * esatto — e non approssimato — l'intervallo su cui poggia il tetto del velo.
 */
export function cloudNoise(x: number, y: number): number {
  return (0.5 * valueNoise(x, y) + 0.25 * valueNoise(x * 2.03 + 17, y * 2.03 + 17)) / 0.75;
}

/**
 * Il velo dello strato su un frammento, in 0..`amount`.
 *
 * E' la composizione delle quattro funzioni sopra, ed e' la sola che il fragment
 * chiama. Non supera mai `amount`: un varco resta sempre possibile, un muro
 * pieno no.
 */
export function cloudDeckVeil(
  x: number,
  y: number,
  z: number,
  viewDir: readonly [number, number, number],
  time: number,
  deck: CloudDeckModel,
): number {
  if (deck.amount <= 0) return 0;
  const depth = cloudDepth(z, deck);
  if (depth <= 0) return 0;

  const [cx, cy] = cloudCrossing(x, y, z, viewDir, deck);
  const drift = time * deck.speed;
  const noise = cloudNoise(cx / deck.scale + drift, cy / deck.scale);
  return deck.amount * depth * cloudMass(noise, deck);
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
 * moltiplicare due uniformi, la cui media e' un quarto — misurato, il rumore
 * si accalcava sul basso e le nuvole non arrivavano mai a essere piene.
 *
 * Fra CPU e GPU la precisione dei float cambia il **disegno** delle macchie,
 * perche' si prende la parte frazionaria di numeri nell'ordine delle migliaia.
 * Non cambia niente di cio' su cui il modello poggia — intervallo, determinismo,
 * continuita' — ed e' su quello che il test insiste.
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
