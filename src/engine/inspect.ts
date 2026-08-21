/**
 * Viste di ispezione dell'harness, in TypeScript puro.
 *
 * Non importa Three e non tocca il DOM: gira nei test in ambiente node, come
 * `lighting.ts`. E' la fonte unica dei numeri di questo dominio e, soprattutto,
 * **il posto dove sta la decisione**: quale modo e' attivo, a che quota taglia,
 * su quale isolato si concentra. Nel materiale entrano solo i tre numeri che ne
 * escono, e il materiale non sa che i modi esistono.
 *
 * Il contratto verso il GLSL e' due predicati geometrici e una sola azione:
 *
 *   nascosto = dot(plane.xyz, p) > plane.w   &&   p sta dal lato giusto di rect
 *   azione   = retino ordinato con discard, di densita' `veil`
 *
 * I due predicati si intersecano, e il rettangolo porta la propria polarita':
 * `inside` positivo nasconde **dentro** il riquadro, negativo **fuori**. Senza
 * quella distinzione i raggi X velerebbero l'intero semispazio davanti alla
 * colonna — mezzo schermo — invece di aprire una finestra attorno a quello che
 * si sta guardando. Chi usa un predicato solo lascia l'altro permissivo.
 *
 * A `veil` uguale a 1 il retino scarta tutto, cioe' **taglia**: e' la stessa
 * manopola per le due famiglie — velare e tagliare — e non due percorsi separati.
 * Velare non toglie niente e non ha capping da risolvere; tagliare lo chiede, e
 * il tappo arriva dalle back-face della stessa geometria.
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

  /** Densita' che vale taglio: il retino scarta ogni pixel. */
  cut: 1,

  /**
   * Mezzo lato della finestra dei raggi X, in colonne.
   *
   * Il semipiano da solo velerebbe tutto cio' che sta davanti alla colonna, cioe'
   * mezzo schermo, e a quel punto non si guarda piu' niente in particolare: la
   * citta' si dissolve invece di aprirsi. Trentadue colonne sono tre isolati di
   * `STREETS.pitch`, abbastanza da contenere gli occlusori veri di una torre e
   * abbastanza poco da restare una finestra.
   */
  xraySpan: 32,

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
  readonly section: InspectSection | null;
}

export interface InspectUniforms {
  /** xyz normale, w soglia: oltre il piano se `dot(xyz, p) > w`. */
  readonly plane: readonly [number, number, number, number];
  /** x0 y0 x1 y1 in coordinate di mondo. */
  readonly rect: readonly [number, number, number, number];
  /** Polarita' del rettangolo: `+1` nasconde dentro, `-1` fuori. */
  readonly inside: number;
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

/**
 * Payload che non nasconde niente.
 *
 * A spegnere basta la densita' a zero: il materiale ci esce alla prima
 * condizione, senza valutare nessuno dei due predicati.
 */
const NEUTRAL: InspectUniforms = {
  plane: OPEN_PLANE,
  rect: OPEN_RECT,
  inside: 1,
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
      if (state.focus === null) return NEUTRAL;
      const span = INSPECT.xraySpan;
      return {
        // Nascosto cio' che sta piu' vicino alla camera del punto a fuoco:
        // dot(view, p) < dot(view, f), riscritto come semipiano su -view.
        plane: halfSpaceTowardCamera(state.view, state.focus),
        // ...ma solo attorno a quello che si sta guardando: e' la differenza
        // fra aprire una finestra e dissolvere mezza citta'.
        rect: [
          state.focus.x - span,
          state.focus.y - span,
          state.focus.x + span,
          state.focus.y + span,
        ],
        inside: 1,
        veil: INSPECT.veil,
      };
    }

    case INSPECT_MODE.slice: {
      return {
        plane: [0, 0, 1, state.sliceZ],
        rect: OPEN_RECT,
        inside: 1,
        veil: INSPECT.cut,
      };
    }

    case INSPECT_MODE.section: {
      if (state.section === null) return NEUTRAL;
      // Stessa disuguaglianza dei raggi X, con la normale collassata su un asse:
      // il taglio resta un piano della griglia e non uno perpendicolare a uno
      // sguardo qualunque, cosi' cade su una carreggiata e mostra il fronte
      // degli isolati invece di affettare i volumi a caso.
      const axis = state.section.axis;
      const towards = -Math.sign(state.view[axis]) || 1;
      const plane: [number, number, number, number] = [0, 0, 0, towards * state.section.at];
      plane[axis] = towards;
      return { plane, rect: OPEN_RECT, inside: 1, veil: INSPECT.cut };
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
        veil: INSPECT.veil,
      };
    }

    default:
      return NEUTRAL;
  }
}

/** Semipiano che nasconde cio' che sta fra la camera e il punto dato. */
function halfSpaceTowardCamera(
  view: readonly [number, number, number],
  point: InspectFocus,
): [number, number, number, number] {
  const depth = view[0] * point.x + view[1] * point.y + view[2] * point.z;
  return [-view[0], -view[1], -view[2], -depth];
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

/** true se il modo taglia: e' la condizione di `DoubleSide` e del tappo. */
export function isCut(uniforms: InspectUniforms): boolean {
  return uniforms.veil >= INSPECT.cut;
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

/** true se una vista e' attiva: serve a decidere quando comporre la variante. */
export function isActive(uniforms: InspectUniforms): boolean {
  return uniforms.veil > 0;
}
