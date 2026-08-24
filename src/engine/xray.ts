import type { InspectUniforms } from './inspect';

/**
 * La lente dei raggi X: i suoi numeri, la sua geometria e il suo aspetto.
 *
 * Nasce staccandola da `inspect.ts`, che era gia' oltre il budget di righe e
 * teneva insieme due lavori diversi: **quale** modo e' attivo — che e' una
 * decisione, e resta li' — e **come si guarda dentro un occlusore**, che e' un
 * disegno e sta qui. Il primo cambia quando si aggiunge una vista, il secondo
 * quando non si legge abbastanza bene: sono due cadenze, e adesso sono due file.
 *
 * Come `lighting.ts`, esiste in due copie: questa e quella GLSL in
 * `shaders/inspect.glsl.ts`, generata da queste stesse costanti. I test di
 * `inspect.test.ts` sono cio' che le tiene allineate.
 *
 * ## Perche' il retino da solo non bastava
 *
 * La prima versione faceva una cosa sola: `discard` su un Bayer 4x4 a densita'
 * fissa per tutto cio' che copriva il soggetto. Non si vedeva attraverso niente,
 * e le ragioni erano tre, tutte e tre nel modo in cui il velo era fatto.
 *
 * 1. **Il retino era in coordinate di schermo e uguale a ogni profondita'.** Con
 *    una soglia ordinata i pixel superstiti sono sempre gli stessi — e' un
 *    insieme di soglie, non un tiro — quindi il muro davanti e il muro dietro
 *    sopravvivevano *sugli stessi pixel*, e il primo copriva il secondo per
 *    intero. Cinque pareti velate in fila si vedevano esattamente come una: e'
 *    l'artefatto noto della screen-door transparency, e la cura nota e' far
 *    variare la soglia con la profondita'. Qui la variazione ce l'ha `deep`.
 * 2. **Cio' che sopravviveva restava muro a piena luce.** Il dodici per cento di
 *    pixel rimasti portava ancora finestre, insegne ed emissivi: a schermo non
 *    leggeva come vetro ma come sporco sopra il soggetto.
 * 3. **Il Bayer sparpaglia.** A parita' di copertura, pixel sparsi leggono come
 *    rumore e pixel in fila leggono come una campitura. Il retino e' quindi
 *    diventato una **rigatura** (`INSPECT.hatch`), e la densita' non ne cambia
 *    piu' il passo ma lo spessore: puo' variare con continuita' senza che il
 *    disegno cambi trama sotto gli occhi.
 *
 * Da qui l'aspetto attuale, che e' una sola idea in tre pezzi: l'occlusore non
 * viene cancellato, viene **ridotto a vetro rigato**. La faccia si scioglie
 * nell'aria, il filo del voxel resta, e cio' che resta non e' piu' una facciata.
 */
export const XRAY = {
  /**
   * Densita' del velo a ridosso del soggetto.
   *
   * Con la rigatura la densita' e' il complemento della copertura: a 0,80 del
   * muro resta un quinto, in righe sottili invece che in pulviscolo. Piu' in
   * basso l'occlusore torna a contendere il soggetto; piu' in alto sparisce
   * anche la rigatura, e con lei l'unica cosa che diceva che li' c'era un muro.
   */
  veil: 0.8,

  /**
   * Densita' del velo a `depth` voxel piu' vicino alla camera.
   *
   * E' il numero che fa **funzionare** la stratificazione, non un ritocco
   * estetico. Le soglie di un retino ordinato sono annidate: chi ha densita'
   * minore sopravvive su un insieme piu' largo. Perche' una parete dietro si
   * veda attraverso quella davanti, quella davanti deve avere densita'
   * **maggiore** — e la sua distanza dal soggetto e' proprio maggiore, quindi
   * basta legare la densita' a quella. La conseguenza si legge anche da sola:
   * piu' un muro e' vicino a chi guarda, meno resta.
   */
  deep: 0.95,

  /** Distanza, in voxel, su cui il velo passa da `veil` a `deep`. Un chunk. */
  depth: 32,

  /**
   * Sfumatura del bordo della lente, in voxel.
   *
   * Senza, il predicato e' un gradino: la rigatura comincia su una riga di voxel
   * allineata agli assi, e a schermo quel bordo netto legge come un artefatto
   * invece che come una lente. E' il primo motivo per cui i raggi X sembravano
   * «un quadrato trasparente». Si accorcia da sola quando il soggetto e' piccolo:
   * una rampa piu' larga di meta' finestra non lascerebbe nessun punto a piena
   * densita', e su una casa bassa la lente non aprirebbe piu' niente.
   */
  feather: 4,

  /**
   * Quanto il filo del voxel abbassa la densita', in frazione.
   *
   * E' la meta' del disegno che il retino da solo non poteva dare. Sul filo
   * della cella la densita' scende a questa frazione, quindi li' sopravvive piu'
   * della meta' dei pixel mentre in mezzo alla faccia ne resta un ventesimo:
   * l'occlusore non si sbriciola, si riduce a una **gabbia**. La sagoma resta
   * leggibile — si continua a vedere *che c'e' una torre davanti* — e insieme si
   * vede attraverso, che e' esattamente cio' che si chiedeva.
   */
  lattice: 0.45,

  /**
   * Spessore del filo, in frazione di cella.
   *
   * Misurato a schermo e non scelto a tavolino: a 0,11 la gabbia c'era nei
   * numeri e non si vedeva — a una decina di pixel per voxel quel filo e' largo
   * un pixel scarso, cioe' sparisce dentro la rigatura invece di reggerla. A
   * 0,18 lo spigolo si legge come uno spigolo e la faccia resta comunque quasi
   * tutta aperta.
   */
  edge: 0.18,

  /**
   * Respiro attorno al soggetto, in voxel sul piano dello schermo.
   *
   * La lente e' la sagoma del soggetto piu' questo: senza, la rigatura finirebbe
   * esattamente sul suo bordo e la finestra leggerebbe come un ritaglio invece
   * che come una lente. Tre voxel bastano a staccarla e restano sotto `feather`,
   * che e' quello che la rende morbida.
   */
  margin: 3,

  /**
   * Mezzo lato della lente quando sotto il cursore non c'e' un edificio.
   *
   * Puntare il suolo nudo e' una domanda legittima — «cosa mi nasconde quel
   * pezzo di terra» — ma un soggetto alto zero darebbe una lente schiacciata al
   * suolo, che non apre niente. Dieci voxel sono l'ordine di grandezza di una
   * casa bassa: quel tanto che basta a scoprire il posto, non l'isolato.
   */
  bare: 10,
} as const;

/**
 * Dove il raggio di vista da un punto incontra la lente.
 *
 * Due numeri e non uno perche' servono a due cose diverse, e prima ne usciva
 * solo il secondo. `enter` e' **quanto lontano davanti al soggetto** sta il
 * frammento, e da li' viene la densita' che cresce verso la camera. `chord` e'
 * la corda dentro il volume, che va a zero sul contorno della sagoma — vale per
 * qualunque volume convesso — ed e' gia' la distanza dal bordo che serve alla
 * rampa, senza doverla misurare a parte.
 */
export interface LensHit {
  /** Distanza dal frammento al volume lungo lo sguardo; 0 se non lo incontra. */
  readonly enter: number;
  /** Lunghezza dell'attraversamento; 0 se non lo incontra. */
  readonly chord: number;
}

const MISS: LensHit = { enter: 0, chord: 0 };

/**
 * Il test a lastre, che qui fa **due** lavori con un conto solo.
 *
 * Il primo e' il predicato: `enter > 0` vuol dire che il volume sta piu' avanti,
 * e quindi che il punto gli sta davanti. Un frammento dentro il volume ha
 * `enter < 0` e non si vela mai — e' cosi' che il soggetto non puo' velare se
 * stesso, senza bisogno di un piano ancorato da qualche parte.
 *
 * Il secondo e' il bordo morbido, che esce dalla corda: vedi `LensHit`.
 */
export function lensHit(
  uniforms: InspectUniforms,
  view: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): LensHit {
  const { lensMin, lensMax } = uniforms;
  if (lensMax[0] <= lensMin[0]) return MISS;
  // Sotto il pavimento non si vela mai, e la lente non ha nemmeno voce. Il
  // terreno davanti al soggetto lo copre come lo copre un muro, ma dietro un
  // muro c'e' la citta' e dietro il terreno non c'e' niente: bucarlo apriva una
  // macchia di cielo in mezzo all'isolato.
  if (z <= lensMin[3]) return MISS;

  const from: readonly [number, number, number] = [x, y, z];
  let enter = -Infinity;
  let leave = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(view[axis]) < 1e-6) {
      // Raggio parallelo alla lastra: o la attraversa per tutta la sua lunghezza
      // o non la incontra mai, e nessun `t` puo' dirlo.
      if (from[axis] < lensMin[axis] || from[axis] > lensMax[axis]) return MISS;
      continue;
    }
    const ta = (lensMin[axis] - from[axis]) / view[axis];
    const tb = (lensMax[axis] - from[axis]) / view[axis];
    enter = Math.max(enter, Math.min(ta, tb));
    leave = Math.min(leave, Math.max(ta, tb));
  }
  // `enter <= 0` copre due casi in uno: chi sta dietro non incontra niente,
  // e chi sta dentro ha gia' cominciato — e non deve velarsi da solo.
  if (enter <= 0 || leave < enter) return MISS;
  return { enter, chord: leave - enter };
}

/** Quanto il raggio di vista da un punto attraversa la lente, o zero. */
export function lensChord(
  uniforms: InspectUniforms,
  view: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): number {
  return lensHit(uniforms, view, x, y, z).chord;
}

/** `smoothstep` di GLSL: la copia TS deve avere la stessa curva, non una simile. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Densita' del velo su un frammento, **prima** del filo del voxel.
 *
 * E' la copia leggibile del blocco della lente in `inspect.glsl.ts`, e come
 * `lighting.ts` esiste per essere verificata in `node`: la gabbia resta fuori
 * perche' dipende dalla faccia e dalla posizione dentro la cella, cioe' da due
 * cose che solo il frammento ha in mano.
 *
 * Zero dove la lente non nasconde niente: dietro il soggetto, sotto il
 * pavimento, o fuori dalla sua sagoma.
 */
export function xrayDensity(
  uniforms: InspectUniforms,
  view: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): number {
  const hit = lensHit(uniforms, view, x, y, z);
  if (hit.chord <= 0) return 0;
  const base = uniforms.veil + (XRAY.deep - uniforms.veil) * smoothstep(0, XRAY.depth, hit.enter);
  return base * smoothstep(0, XRAY.feather, hit.chord);
}
