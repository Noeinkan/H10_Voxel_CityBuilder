/**
 * Viste di ispezione dell'harness, in TypeScript puro.
 *
 * Non importa Three e non tocca il DOM: gira nei test in ambiente node, come
 * `lighting.ts`. E' la fonte unica dei numeri di questo dominio e, soprattutto,
 * **il posto dove sta la decisione**: quale modo e' attivo, a che quota taglia,
 * su quale isolato si concentra. Nel materiale entrano solo i tre numeri che ne
 * escono, e il materiale non sa che i modi esistono.
 *
 * Il contratto verso il GLSL e' tre predicati geometrici e una sola azione:
 *
 *   nascosto = dot(plane.xyz, p) > plane.w
 *              &&  p sta dal lato giusto di rect
 *              &&  il raggio di vista da p incontra la lente piu' avanti
 *   azione   = retino ordinato con discard, di densita' `veil`
 *
 * I predicati si intersecano, e il rettangolo porta la propria polarita':
 * `inside` positivo nasconde **dentro** il riquadro, negativo **fuori**. Chi usa
 * un predicato solo lascia gli altri permissivi.
 *
 * La **lente** e' il terzo, e non e' una regione: e' il volume che si sta
 * guardando, e il predicato chiede se il frammento lo **copre**. Continuando il
 * raggio di vista da `p` in avanti, se incontra il volume allora `p` gli sta
 * davanti, e sta davanti *proprio a lui* — non a un semipiano che passa di li'.
 * Sono cose diverse, e la differenza si vedeva: un occlusore non sta sopra a
 * cio' che copre, sta davanti, e in isometrica la sua colonna di mondo e'
 * spostata di `-view.xy * distanza`. Un riquadro di mondo abbastanza largo da
 * contenerlo — trentadue colonne, quello che c'era prima — e' anche abbastanza
 * largo da dissolvere mezzo schermo, ed e' esattamente cio' che si vedeva
 * succedere. La finestra di questo predicato invece **e'** la sagoma del
 * soggetto, a ogni zoom e da ogni angolo, perche' non la approssima: la calcola.
 *
 * Con la lente viaggia un **pavimento**, sotto cui non si vela mai. Il terreno
 * davanti al soggetto lo copre come lo copre un muro, ma dietro un muro c'e' la
 * citta' e dietro il terreno non c'e' niente: bucarlo apriva una macchia di
 * cielo in mezzo all'isolato. Il suolo non e' un occlusore, e' il piano su cui
 * si legge tutto il resto.
 *
 * A `veil` uguale a 1 il retino scarta tutto, cioe' **taglia**: e' la stessa
 * manopola per le due famiglie — velare e tagliare — e non due percorsi separati.
 * Velare non toglie niente e non ha capping da risolvere; tagliare lo chiede, e
 * il tappo arriva dalle back-face della stessa geometria.
 *
 * Da qui esce anche **cosa disegnare per spiegare la vista** (`inspectGuide`).
 * Sono gli stessi numeri delle uniform, riletti: il contorno che si vede a
 * schermo e' per costruzione il rettangolo che il fragment sta usando, e non
 * puo' andare fuori sincrono con lui.
 */

/** I quattro modi, piu' lo spento. */
export const INSPECT_MODE = {
  off: 0,
  /** Vela cio' che sta fra la camera e la colonna sotto il cursore. */
  xray: 1,
  /** Taglia tutto sopra una quota: la citta' al piano n. */
  slice: 2,
  /** Taglia lungo un asse della griglia stradale, sul lato della camera. */
  section: 3,
  /** Vela tutto cio' che sta fuori dall'isolato sotto il cursore. */
  block: 4,
} as const;

export type InspectMode = (typeof INSPECT_MODE)[keyof typeof INSPECT_MODE];

/** Ordine di `V`: i modi si ciclano cosi', e l'overlay li elenca nello stesso. */
export const INSPECT_MODES: readonly InspectMode[] = [
  INSPECT_MODE.off,
  INSPECT_MODE.xray,
  INSPECT_MODE.slice,
  INSPECT_MODE.section,
  INSPECT_MODE.block,
];

export const INSPECT_NAMES: Readonly<Record<InspectMode, string>> = {
  [INSPECT_MODE.off]: 'off',
  [INSPECT_MODE.xray]: 'xray',
  [INSPECT_MODE.slice]: 'slice',
  [INSPECT_MODE.section]: 'section',
  [INSPECT_MODE.block]: 'block',
};

/**
 * Unica fonte dei numeri delle viste.
 *
 * Vale la stessa regola di `terrain/config.ts` e `sim/balance.ts`: nessun altro
 * file porta una densita' di retino o un passo di quota.
 */
export const INSPECT = {
  /**
   * Densita' del retino quando si vela.
   *
   * Sotto 0,5 l'occlusore resta troppo pieno e il tessuto dietro non emerge;
   * sopra 0,8 sparisce anche la sagoma davanti, e si perde proprio il confronto
   * fra le due che rende leggibile la vista.
   */
  veil: 0.68,

  /**
   * Densita' dentro la lente dei raggi X, piu' alta del velo generico.
   *
   * Le due densita' rispondono a due geometrie diverse. Il velo di Block focus
   * copre tutto cio' che sta fuori dall'isolato, e li' la sagoma velata **e'** il
   * contesto: mangiarsela vorrebbe dire togliere la risposta. La lente invece
   * apre un buco largo quanto un edificio dentro un occlusore che resta intero
   * tutt'attorno, e il contesto lo porta gia' il bordo. A 0,68 il muro davanti e
   * il soggetto dietro finiscono a meta' strada l'uno nell'altro e non si legge
   * nessuno dei due; a 0,85 restano abbastanza pixel da dire «qui c'era
   * qualcosa» senza contendere il soggetto.
   */
  xrayVeil: 0.85,

  /** Densita' che vale taglio: il retino scarta ogni pixel. */
  cut: 1,

  /**
   * Sfumatura del bordo, in voxel. Vale per il rettangolo e per la lente.
   *
   * Senza, il predicato e' un gradino: il retino comincia e finisce su una riga
   * di voxel allineata agli assi, e a schermo quel bordo netto legge come un
   * artefatto di rendering invece che come una lente — e' il primo motivo per
   * cui i raggi X sembravano «un quadrato trasparente». La rampa non cambia il
   * colore di niente (invariante 4) e non tocca il mesher (invariante 6): e' la
   * stessa densita' di prima, moltiplicata per la distanza dal bordo.
   *
   * Inerte dove il rettangolo e' aperto — la fetta e la sezione — perche' li'
   * la distanza dal bordo e' l'infinito pratico di `OPEN_RECT`. Sulla lente si
   * accorcia da sola quando il soggetto e' piccolo: una rampa piu' larga della
   * meta' della finestra non lascerebbe nessun punto a piena densita', e su una
   * casa bassa la lente non aprirebbe piu' niente.
   */
  feather: 4,

  /**
   * Respiro attorno al soggetto dei raggi X, in voxel sul piano dello schermo.
   *
   * La lente e' la sagoma del soggetto piu' questo: senza, il retino finirebbe
   * esattamente sul suo bordo e la finestra leggerebbe come un ritaglio invece
   * che come una lente. Tre voxel bastano a staccarla e restano sotto la
   * `feather`, che e' quello che la rende morbida.
   */
  xrayMargin: 3,

  /**
   * Mezzo lato della lente quando sotto il cursore non c'e' un edificio.
   *
   * Puntare il suolo nudo e' una domanda legittima — «cosa mi nasconde quel
   * pezzo di terra» — ma un soggetto alto zero darebbe una lente schiacciata al
   * suolo, che non apre niente. Dieci voxel sono l'ordine di grandezza di una
   * casa bassa: quel tanto che basta a scoprire il posto, non l'isolato.
   */
  xrayBare: 10,

  /**
   * Respiro attorno all'isolato scelto, in colonne per lato.
   *
   * A zero il modellino tocca i bordi dello schermo e non si capisce dove
   * finisca; troppo largo e torna a essere un puntino in mezzo al vuoto. Otto
   * colonne sono circa la larghezza di una carreggiata di `STREETS.pitch`, cioe'
   * quel tanto che basta a far leggere l'isolato come staccato dal resto.
   */
  studyMargin: 8,

  /** Passo della quota con `[` e `]`. */
  sliceStep: 1,

  /** Passo con Shift: un piano intero invece di un voxel. */
  sliceCoarse: 8,

  /** Quota di partenza della fetta, appena sopra il livello del mare. */
  defaultSliceZ: 24,

  /** Estremi ammessi della fetta, in voxel. */
  minSliceZ: 0,
  maxSliceZ: 255,
} as const;

/** Colonna del mondo gia' risolta sul terreno. */
export interface InspectFocus {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Il volume che si sta guardando, in coordinate di **mondo**.
 *
 * Estremi aperti a destra, non colonne incluse come `InspectRect`: un edificio
 * di lato 4 che parte da `x` occupa `[x, x+4)`, e scriverlo cosi' toglie di
 * mezzo il `+1` che l'isolato deve ricordarsi. Ci arriva un record del registro
 * degli edifici, oppure — se sotto il cursore c'e' solo terra — la colonna a
 * fuoco allargata di `xrayBare`.
 */
export interface InspectBox {
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
}

/** Riquadro di colonne, **estremi inclusi**: la stessa forma di `BlockRect`. */
export interface InspectRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Asse e coordinata della carreggiata su cui cade la sezione. */
export interface InspectSection {
  /** 0 taglia a x costante, 1 a y costante. */
  readonly axis: 0 | 1;
  readonly at: number;
}

export interface InspectState {
  readonly mode: InspectMode;
  readonly sliceZ: number;
  /** Colonna sotto il cursore, o null se il cursore non e' sull'isola. */
  readonly focus: InspectFocus | null;
  /**
   * Direzione di vista.
   *
   * In ortografica tutti i raggi sono paralleli, quindi un solo vettore per
   * frame e' esatto e non un'approssimazione: e' cio' che permette a "davanti"
   * di essere una disuguaglianza nel fragment invece di un raycast.
   */
  readonly view: readonly [number, number, number];
  /** Riquadro dell'isolato sotto il cursore, in colonne. */
  readonly block: InspectRect | null;
  /**
   * L'edificio sotto il cursore, se ce n'e' uno.
   *
   * E' la differenza fra «vela cio' che sta davanti a questo punto» e «vela cio'
   * che copre questa cosa». Il primo e' quello che i raggi X facevano, e non
   * poteva funzionare: il punto era una colonna di terreno, e una colonna non ha
   * una sagoma da scoprire — la finestra doveva quindi indovinarne una, larga
   * abbastanza per la torre piu' grossa e percio' troppo larga per tutto il
   * resto. Con il volume in mano la lente si dimensiona da sola.
   */
  readonly subject: InspectBox | null;
  readonly section: InspectSection | null;
  /**
   * true se l'isolato e' stato **scelto** invece che solo puntato.
   *
   * E' l'unico bit che separa le due domande che si possono fare su un isolato.
   * Puntandolo si chiede come si connette al resto, e il velo lascia il contesto
   * addosso apposta. Scegliendolo si chiede com'e' fatto, e allora il contesto e'
   * proprio cio' che va tolto: stessa geometria, stesso rettangolo, densita'
   * portata da `veil` a `cut`. Non serve un modo in piu' nel ciclo di `V`.
   */
  readonly locked: boolean;
}

export interface InspectUniforms {
  /** xyz normale, w soglia: oltre il piano se `dot(xyz, p) > w`. */
  readonly plane: readonly [number, number, number, number];
  /** x0 y0 x1 y1 in coordinate di mondo. */
  readonly rect: readonly [number, number, number, number];
  /** Polarita' del rettangolo: `+1` nasconde dentro, `-1` fuori. */
  readonly inside: number;
  /**
   * Spigolo minimo della lente, gia' allargato del respiro; `w` e' il pavimento.
   *
   * Il pavimento e' la base **vera** del soggetto e non quella allargata: il
   * respiro serve a non far finire il retino sul bordo di cio' che si guarda,
   * mentre il suolo va tenuto per intero.
   */
  readonly lensMin: readonly [number, number, number, number];
  /** Spigolo massimo. A `lensMax[0] <= lensMin[0]` la lente e' spenta. */
  readonly lensMax: readonly [number, number, number];
  /** 0 spento, fra 0 e 1 retino, 1 taglio pieno. */
  readonly veil: number;
}

/**
 * Semipiano sempre vero: `dot((0,0,0), p)` vale zero, che e' sempre maggiore di
 * -1. I due predicati si intersecano, quindi «inerte» qui vuol dire vero, non
 * falso — e' l'unico posto in cui la differenza si nota.
 */
const OPEN_PLANE: readonly [number, number, number, number] = [0, 0, 0, -1];

/** Rettangolo che contiene tutto il mondo rappresentabile. */
const OPEN_RECT: readonly [number, number, number, number] = [-1e9, -1e9, 1e9, 1e9];

/** Lente spenta: un volume vuoto, e il predicato non si valuta nemmeno. */
const NO_LENS_MIN: readonly [number, number, number, number] = [0, 0, 0, 0];
const NO_LENS_MAX: readonly [number, number, number] = [0, 0, 0];

/**
 * Payload che non nasconde niente.
 *
 * A spegnere basta la densita' a zero: il materiale ci esce alla prima
 * condizione, senza valutare nessuno dei predicati.
 */
const NEUTRAL: InspectUniforms = {
  plane: OPEN_PLANE,
  rect: OPEN_RECT,
  inside: 1,
  lensMin: NO_LENS_MIN,
  lensMax: NO_LENS_MAX,
  veil: 0,
};

/**
 * Asse su cui conviene tagliare, dato lo sguardo.
 *
 * Si sceglie l'asse **piu' parallelo alla vista**, cosi' la faccia di sezione
 * guarda la camera invece di essere vista di taglio. Ruotando di 90 gradi la
 * scelta cambia da sola, ed e' voluto: la sezione segue chi la guarda.
 */
export function sectionAxis(view: readonly [number, number, number]): 0 | 1 {
  return Math.abs(view[0]) >= Math.abs(view[1]) ? 0 : 1;
}

/**
 * I tre numeri che il materiale riceve, dallo stato della vista.
 *
 * Puro e senza allocazioni oltre al risultato: gira una volta per frame nel
 * bootstrap, prima del render.
 */
export function inspectUniforms(state: InspectState): InspectUniforms {
  switch (state.mode) {
    case INSPECT_MODE.xray: {
      const subject = xraySubject(state);
      if (subject === null) return NEUTRAL;
      const margin = xrayMargin(state);
      return {
        // Qui i primi due predicati sono inerti: «davanti» e «dentro la
        // finestra» non sono piu' due domande, sono la stessa — il raggio
        // incontra il soggetto — e chiederla una volta sola e' cio' che rende la
        // finestra esatta invece che approssimata. Vedi l'intestazione.
        plane: OPEN_PLANE,
        rect: OPEN_RECT,
        inside: 1,
        lensMin: [subject.x0 - margin, subject.y0 - margin, subject.z0 - margin, subject.z0],
        lensMax: [subject.x1 + margin, subject.y1 + margin, subject.z1 + margin],
        veil: INSPECT.xrayVeil,
      };
    }

    case INSPECT_MODE.slice: {
      return {
        plane: [0, 0, 1, state.sliceZ],
        rect: OPEN_RECT,
        inside: 1,
        lensMin: NO_LENS_MIN,
        lensMax: NO_LENS_MAX,
        veil: INSPECT.cut,
      };
    }

    case INSPECT_MODE.section: {
      if (state.section === null) return NEUTRAL;
      // Stessa disuguaglianza della fetta, con la normale su un asse orizzontale
      // invece che in quota: il taglio resta un piano della griglia e non uno
      // perpendicolare a uno sguardo qualunque, cosi' cade su una carreggiata e
      // mostra il fronte degli isolati invece di affettare i volumi a caso.
      const axis = state.section.axis;
      const towards = -Math.sign(state.view[axis]) || 1;
      const plane: [number, number, number, number] = [0, 0, 0, towards * state.section.at];
      plane[axis] = towards;
      return {
        plane,
        rect: OPEN_RECT,
        inside: 1,
        lensMin: NO_LENS_MIN,
        lensMax: NO_LENS_MAX,
        veil: INSPECT.cut,
      };
    }

    case INSPECT_MODE.block: {
      if (state.block === null) return NEUTRAL;
      return {
        plane: OPEN_PLANE,
        // Gli estremi dell'isolato sono colonne incluse, e la colonna x occupa
        // [x, x+1) nel mondo: senza il +1 l'ultima fila di ogni lato resterebbe
        // velata come se fosse fuori.
        rect: [state.block.x0, state.block.y0, state.block.x1 + 1, state.block.y1 + 1],
        // L'unico modo che vela il **fuori**: l'isolato resta nel suo contesto,
        // che e' il punto — la domanda e' come si connette, non com'e' fatto.
        inside: -1,
        lensMin: NO_LENS_MIN,
        lensMax: NO_LENS_MAX,
        // ...finche' l'isolato e' solo puntato. Scegliendolo la domanda cambia, e
        // con lei la densita': a `cut` il retino scarta tutto e il contesto
        // sparisce del tutto, lasciando un modellino da girare in mano.
        veil: state.locked ? INSPECT.cut : INSPECT.veil,
      };
    }

    default:
      return NEUTRAL;
  }
}

/**
 * Il soggetto dei raggi X: l'edificio puntato, o la colonna se non ce n'e' uno.
 *
 * La colonna nuda diventa un volume di un voxel invece di un punto, cosi' il
 * resto del calcolo non deve sapere quale dei due casi ha in mano: e' la
 * `xrayMargin` a distinguerli, ed e' l'unica cosa che davvero cambia.
 */
function xraySubject(state: InspectState): InspectBox | null {
  if (state.subject !== null) return state.subject;
  if (state.focus === null) return null;
  const { x, y, z } = state.focus;
  return { x0: x - 0.5, y0: y - 0.5, z0: z, x1: x + 0.5, y1: y + 0.5, z1: z };
}

function xrayMargin(state: InspectState): number {
  return state.subject === null ? INSPECT.xrayBare : INSPECT.xrayMargin;
}

/**
 * Quanto il raggio di vista da `p` attraversa la lente, o zero se non la incontra.
 *
 * E' il test a lastre classico, e qui fa **due** lavori con un conto solo. Il
 * primo e' il predicato: `enter > 0` vuol dire che il volume sta piu' avanti, e
 * quindi che `p` gli sta davanti. Un frammento dentro il volume ha `enter < 0` e
 * non si vela mai — e' cosi' che il soggetto non puo' velare se stesso, senza
 * bisogno di un piano ancorato da qualche parte.
 *
 * Il secondo e' il bordo morbido. La corda `leave - enter` va a zero esattamente
 * sul contorno della sagoma — vale per qualunque volume convesso — e cresce
 * andando verso il centro: e' gia' la distanza dal bordo che serve alla rampa,
 * senza doverla misurare a parte.
 *
 * Esiste in due copie, questa e quella GLSL, come il modello di luce: i test di
 * questo file sono cio' che le tiene allineate.
 */
export function lensChord(
  uniforms: InspectUniforms,
  view: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): number {
  const { lensMin, lensMax } = uniforms;
  if (lensMax[0] <= lensMin[0]) return 0;
  // Sotto il pavimento non si vela mai, e la lente non ha nemmeno voce.
  if (z <= lensMin[3]) return 0;

  const from: readonly [number, number, number] = [x, y, z];
  let enter = -Infinity;
  let leave = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(view[axis]) < 1e-6) {
      // Raggio parallelo alla lastra: o la attraversa per tutta la sua lunghezza
      // o non la incontra mai, e nessun `t` puo' dirlo.
      if (from[axis] < lensMin[axis] || from[axis] > lensMax[axis]) return 0;
      continue;
    }
    const ta = (lensMin[axis] - from[axis]) / view[axis];
    const tb = (lensMax[axis] - from[axis]) / view[axis];
    enter = Math.max(enter, Math.min(ta, tb));
    leave = Math.min(leave, Math.max(ta, tb));
  }
  // `enter <= 0` copre due casi in uno: chi sta dietro non incontra niente,
  // e chi sta dentro ha gia' cominciato — e non deve velarsi da solo.
  if (enter <= 0 || leave < enter) return 0;
  return leave - enter;
}

/** Modo successivo nel ciclo di `V`. */
export function cycleInspectMode(mode: InspectMode): InspectMode {
  const index = INSPECT_MODES.indexOf(mode);
  return INSPECT_MODES[(index + 1) % INSPECT_MODES.length] ?? INSPECT_MODE.off;
}

/** `?inspect=<modo>`; un valore sconosciuto vale spento, mai un errore. */
export function parseInspectMode(value: string | null): InspectMode {
  if (value === null) return INSPECT_MODE.off;
  for (const mode of INSPECT_MODES) {
    if (INSPECT_NAMES[mode] === value) return mode;
  }
  return INSPECT_MODE.off;
}

/** Quota della fetta riportata dentro gli estremi ammessi. */
export function clampSliceZ(z: number): number {
  if (!Number.isFinite(z)) return INSPECT.defaultSliceZ;
  return Math.min(INSPECT.maxSliceZ, Math.max(INSPECT.minSliceZ, Math.round(z)));
}

/** true se si sta tagliando invece di velare. */
export function isCut(uniforms: InspectUniforms): boolean {
  return uniforms.veil >= INSPECT.cut;
}

/**
 * true se il semipiano e' `OPEN_PLANE`, cioe' «nessun primo predicato».
 *
 * La normale nulla e' la firma: nessun piano vero ne ha una, perche' un piano
 * senza direzione non separa niente. E' la stessa distinzione che
 * `isBoundedRect` fa sull'altro predicato, dall'altro lato dell'intersezione.
 */
export function isOpenPlane(uniforms: InspectUniforms): boolean {
  const [nx, ny, nz] = uniforms.plane;
  return nx === 0 && ny === 0 && nz === 0;
}

/**
 * true se il taglio lascia una **superficie di sezione** da tappare.
 *
 * Non e' `isCut`, e confonderle costa un difetto visibile. Un piano che attraversa
 * i volumi li apre: si vede l'interno delle pareti, e senza `DoubleSide` piu' il
 * tappo dalle back-face resta un guscio vuoto. Un taglio di **solo rettangolo** —
 * l'isolato scelto — non attraversa niente: toglie per intero cio' che sta fuori
 * e lascia la geometria dentro esattamente com'era. Li' il tappo non ha una
 * superficie su cui cadere, e `DoubleSide` sarebbe solo il doppio dei fragment.
 *
 * Le due domande coincidono sulla fetta e sulla sezione e divergono sull'isolato
 * scelto, ed e' l'unico posto in cui la differenza si nota.
 */
export function needsCap(uniforms: InspectUniforms): boolean {
  return isCut(uniforms) && !isOpenPlane(uniforms);
}

/**
 * true se il **modo** taglia invece di velare.
 *
 * Stessa domanda di `isCut`, posta un passo prima: quella guarda le uniform
 * gia' composte, questa il modo da solo. Serve a chi deve decidere senza avere
 * uno stato completo in mano — la barra dei livelli, che compare solo dove c'e'
 * una quota da muovere, e la regola che chiude un taglio quando il giocatore
 * prende in mano uno strumento. Le due strade portano allo stesso fatto, e un
 * test le tiene d'accordo.
 */
export function modeCuts(mode: InspectMode): boolean {
  return mode === INSPECT_MODE.slice || mode === INSPECT_MODE.section;
}

/**
 * true se il modo ha davvero una **quota da muovere**.
 *
 * Non e' `modeCuts`, e confonderle era un difetto visibile: la sezione taglia
 * ma non guarda `sliceZ`, quindi la barra dei livelli compariva anche li' e si
 * trascinava a vuoto. Le due domande — «taglia?» per la regola degli strumenti,
 * «ha una quota?» per la barra e per i tasti — coincidono su `slice` e divergono
 * su `section`, ed e' l'unico posto in cui la differenza si nota.
 */
export function modeHasLevel(mode: InspectMode): boolean {
  return mode === INSPECT_MODE.slice;
}

/** true se una vista e' attiva: serve a decidere quando comporre la variante. */
export function isActive(uniforms: InspectUniforms): boolean {
  return uniforms.veil > 0;
}

/** Oltre questa distanza il rettangolo e' «aperto» e non un bordo vero. */
const RECT_LIMIT = 1e8;

/**
 * true se il rettangolo delimita davvero qualcosa.
 *
 * `OPEN_RECT` e' il modo di dire «nessun secondo predicato», e un contorno
 * disegnato a mille chilometri non e' una guida: la fetta, la sezione e i raggi
 * X non hanno un riquadro **di mondo** da mostrare, e questo e' il posto dove si
 * distingue. L'isolato resta l'unico che ce l'ha.
 */
export function isBoundedRect(uniforms: InspectUniforms): boolean {
  return uniforms.rect[0] > -RECT_LIMIT && uniforms.rect[2] < RECT_LIMIT;
}

/**
 * Cosa disegnare **sopra** la scena perche' la vista si spieghi da sola.
 *
 * Il difetto che questa funzione chiude: tre viste su quattro si agganciano alla
 * colonna sotto il cursore, e a schermo non c'era niente che lo dicesse. Il velo
 * compariva senza causa visibile, e chi guardava non aveva modo di sapere ne'
 * dove fosse puntata la lente ne' quanto fosse larga.
 *
 * Non decide una geometria: dice **quali fatti** vanno mostrati, e chi li disegna
 * — `InspectGuides`, che e' l'unico pezzo che conosce Three — li traduce in linee
 * sul terreno. Il rettangolo dell'isolato arriva dalle uniform gia' composte e
 * non ricalcolato dallo stato: cosi' il contorno e il retino non possono
 * divergere. Quello dei raggi X non puo' arrivare da li' — la lente e' allineata
 * allo schermo e in `lens` ci sta il suo centro, non la sua impronta — e allora
 * arriva dal soggetto, che e' comunque l'unica fonte di entrambi.
 */
export interface InspectGuide {
  /** Riquadro da contornare in coordinate di mondo, o null se non ce n'e' uno. */
  readonly rect: readonly [number, number, number, number] | null;
  /** Carreggiata su cui cade il taglio verticale. */
  readonly line: InspectSection | null;
  /** Colonna su cui la vista e' agganciata. */
  readonly focus: InspectFocus | null;
}

const NO_GUIDE: InspectGuide = { rect: null, line: null, focus: null };

/** L'impronta del soggetto, gia' in coordinate di mondo: niente `+1` da fare. */
function subjectRect(
  subject: InspectBox | null,
): readonly [number, number, number, number] | null {
  return subject === null ? null : [subject.x0, subject.y0, subject.x1, subject.y1];
}

export function inspectGuide(state: InspectState, uniforms: InspectUniforms): InspectGuide {
  if (!isActive(uniforms)) return NO_GUIDE;
  return {
    // Sul suolo nudo il soggetto e' una colonna sola, e contornarla sarebbe una
    // linea dentro il mirino che gia' c'e': meglio niente che un secondo segno
    // che dice la stessa cosa.
    rect: state.mode === INSPECT_MODE.xray
      ? subjectRect(state.subject)
      : isBoundedRect(uniforms) ? uniforms.rect : null,
    line: state.mode === INSPECT_MODE.section ? state.section : null,
    // La fetta non si aggancia a niente — taglia il mondo intero — e un
    // marcatore sotto il cursore direbbe una cosa falsa.
    focus: state.mode === INSPECT_MODE.slice ? null : state.focus,
  };
}
