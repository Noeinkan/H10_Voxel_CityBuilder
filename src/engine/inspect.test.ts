import { describe, expect, it } from 'vitest';
import {
  INSPECT,
  INSPECT_MODE,
  INSPECT_MODES,
  clampSliceZ,
  cycleInspectMode,
  inspectUniforms,
  isCut,
  modeCuts,
  parseInspectMode,
  sectionAxis,
  type InspectMode,
  type InspectState,
  type InspectUniforms,
} from './inspect';

/** Sguardo isometrico canonico: yaw 45 gradi, in discesa verso l'origine. */
const VIEW: readonly [number, number, number] = [-0.577, -0.577, -0.577];

function stateOf(patch: Partial<InspectState>): InspectState {
  return {
    mode: INSPECT_MODE.off,
    sliceZ: INSPECT.defaultSliceZ,
    focus: null,
    view: VIEW,
    block: null,
    section: null,
    ...patch,
  };
}

/** Il primo predicato del fragment: il frammento sta oltre il piano. */
function beyondPlane(u: InspectUniforms, x: number, y: number, z: number): boolean {
  return u.plane[0] * x + u.plane[1] * y + u.plane[2] * z > u.plane[3];
}

/** Il secondo: sta dentro il rettangolo. */
function insideRect(u: InspectUniforms, x: number, y: number): boolean {
  return x >= u.rect[0] && y >= u.rect[1] && x <= u.rect[2] && y <= u.rect[3];
}

/**
 * La stessa condizione che il fragment valuta, riscritta qui una volta sola.
 *
 * E' l'unica copia del predicato oltre a quella GLSL, e questi test sono cio'
 * che tiene allineate le due — come `lighting.test.ts` per il modello di luce.
 */
function hidden(u: InspectUniforms, x: number, y: number, z: number): boolean {
  if (u.veil <= 0) return false;
  const rectSide = u.inside > 0 ? insideRect(u, x, y) : !insideRect(u, x, y);
  return beyondPlane(u, x, y, z) && rectSide;
}

describe('inspectUniforms', () => {
  it('a vista spenta non si nasconde niente, in nessun punto del mondo', () => {
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.off }));

    expect(u.veil).toBe(0);
    for (const p of [[0, 0, 0], [1e6, -1e6, 200], [-40, 90, 0]] as const) {
      expect(hidden(u, p[0], p[1], p[2])).toBe(false);
    }
  });

  it('i raggi X nascondono cio’ che sta fra la camera e la colonna a fuoco', () => {
    const focus = { x: 100, y: 100, z: 20 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, focus }));

    // Un passo verso la camera (contro la direzione di vista) e' nascosto,
    // uno nella direzione di vista resta visibile.
    const near = { x: focus.x - VIEW[0] * 10, y: focus.y - VIEW[1] * 10, z: focus.z - VIEW[2] * 10 };
    const far = { x: focus.x + VIEW[0] * 10, y: focus.y + VIEW[1] * 10, z: focus.z + VIEW[2] * 10 };

    expect(hidden(u, near.x, near.y, near.z)).toBe(true);
    expect(hidden(u, far.x, far.y, far.z)).toBe(false);
    // La colonna a fuoco sta sul piano: non si vela cio' che si sta guardando.
    expect(hidden(u, focus.x, focus.y, focus.z)).toBe(false);

    // Vela, non taglia: la sagoma davanti resta leggibile.
    expect(u.veil).toBe(INSPECT.veil);
    expect(isCut(u)).toBe(false);
  });

  it('i raggi X aprono una finestra, non dissolvono mezza citta’', () => {
    const focus = { x: 100, y: 100, z: 20 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, focus }));

    // Stessa profondita' del punto nascosto qui sopra, ma lontano dal cursore:
    // il semipiano da solo lo velerebbe, e con lui l'intero primo piano.
    const far = INSPECT.xraySpan + 40;
    expect(hidden(u, focus.x - VIEW[0] * 10 + far, focus.y - VIEW[1] * 10, focus.z)).toBe(false);
    expect(hidden(u, focus.x - VIEW[0] * 10, focus.y - VIEW[1] * 10 - far, focus.z)).toBe(false);
  });

  it('senza colonna a fuoco i raggi X e l’isolato restano inerti', () => {
    expect(inspectUniforms(stateOf({ mode: INSPECT_MODE.xray })).veil).toBe(0);
    expect(inspectUniforms(stateOf({ mode: INSPECT_MODE.block })).veil).toBe(0);
    expect(inspectUniforms(stateOf({ mode: INSPECT_MODE.section })).veil).toBe(0);
  });

  it('la fetta taglia sopra la quota e lascia intatto cio’ che sta sotto', () => {
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.slice, sliceZ: 30 }));

    expect(hidden(u, 0, 0, 31)).toBe(true);
    expect(hidden(u, 0, 0, 30)).toBe(false);
    // Vale su tutta la mappa: la fetta non ha una finestra, e' orizzontale.
    expect(hidden(u, 999, -999, 29)).toBe(false);
    expect(hidden(u, 999, -999, 80)).toBe(true);
    // Il taglio e' la stessa manopola del velo portata al massimo.
    expect(isCut(u)).toBe(true);
    expect(u.veil).toBe(1);
  });

  it('la sezione sceglie l’asse piu’ parallelo alla vista', () => {
    expect(sectionAxis([-0.9, -0.1, -0.4])).toBe(0);
    expect(sectionAxis([-0.1, 0.9, -0.4])).toBe(1);
    // A parita' esatta si sceglie x: serve una risposta, non un caso.
    expect(sectionAxis([0.5, -0.5, 0])).toBe(0);
  });

  it('la sezione toglie il lato della camera, su entrambi i versi di sguardo', () => {
    const section = { axis: 0, at: 120 } as const;

    // Camera a est: guarda verso -x, quindi la meta' a est del piano se ne va.
    const west = inspectUniforms(stateOf({ mode: INSPECT_MODE.section, section, view: [-1, 0, 0] }));
    expect(hidden(west, 130, 0, 0)).toBe(true);
    expect(hidden(west, 110, 0, 0)).toBe(false);

    // Camera a ovest: si specchia tutto, e la faccia di sezione guarda ancora
    // la camera invece di finire di spalle.
    const east = inspectUniforms(stateOf({ mode: INSPECT_MODE.section, section, view: [1, 0, 0] }));
    expect(hidden(east, 110, 0, 0)).toBe(true);
    expect(hidden(east, 130, 0, 0)).toBe(false);

    expect(isCut(west)).toBe(true);
  });

  it('l’isolato vela il fuori e tiene dentro la sua ultima colonna', () => {
    const block = { x0: 24, y0: 48, x1: 40, y1: 66 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.block, block }));

    // Gli estremi sono colonne incluse, e la colonna 40 occupa [40, 41): senza
    // il +1 l'ultima fila di ogni lato si velerebbe come se fosse fuori.
    expect(hidden(u, 40.5, 66.5, 20)).toBe(false);
    expect(hidden(u, 24.0, 48.0, 20)).toBe(false);
    expect(hidden(u, 41.5, 60, 20)).toBe(true);
    expect(hidden(u, 30, 47, 20)).toBe(true);
    // A qualunque quota: l'isolato si isola per intero, non solo al suolo.
    expect(hidden(u, 30, 47, 120)).toBe(true);
    expect(hidden(u, 30, 55, 120)).toBe(false);

    // Vela e non taglia: l'isolato resta nel suo contesto.
    expect(isCut(u)).toBe(false);
    expect(u.veil).toBe(INSPECT.veil);
    expect(u.inside).toBeLessThan(0);
  });

  it('ogni densita’ sta in 0..1 e solo il taglio arriva a 1', () => {
    for (const mode of [INSPECT_MODE.xray, INSPECT_MODE.slice, INSPECT_MODE.section, INSPECT_MODE.block]) {
      const u = inspectUniforms(stateOf({
        mode,
        focus: { x: 10, y: 10, z: 10 },
        block: { x0: 0, y0: 0, x1: 8, y1: 8 },
        section: { axis: 1, at: 64 },
      }));
      expect(u.veil).toBeGreaterThan(0);
      expect(u.veil).toBeLessThanOrEqual(1);
    }
    expect(INSPECT.veil).toBeLessThan(INSPECT.cut);
  });
});

describe('modi e quota', () => {
  it('il ciclo passa da tutti i modi e torna a spento', () => {
    let mode: InspectMode = INSPECT_MODE.off;
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) {
      seen.add(mode);
      mode = cycleInspectMode(mode);
    }
    expect(seen.size).toBe(5);
    expect(mode).toBe(INSPECT_MODE.off);
  });

  it('il parametro URL accetta i nomi e ignora il resto', () => {
    expect(parseInspectMode('xray')).toBe(INSPECT_MODE.xray);
    expect(parseInspectMode('slice')).toBe(INSPECT_MODE.slice);
    expect(parseInspectMode('section')).toBe(INSPECT_MODE.section);
    expect(parseInspectMode('block')).toBe(INSPECT_MODE.block);
    expect(parseInspectMode('nope')).toBe(INSPECT_MODE.off);
    expect(parseInspectMode(null)).toBe(INSPECT_MODE.off);
  });

  it('la quota resta dentro gli estremi e non diventa mai NaN', () => {
    expect(clampSliceZ(-40)).toBe(INSPECT.minSliceZ);
    expect(clampSliceZ(1e6)).toBe(INSPECT.maxSliceZ);
    expect(clampSliceZ(31.6)).toBe(32);
    expect(clampSliceZ(Number.NaN)).toBe(INSPECT.defaultSliceZ);
  });

  it('solo la fetta e la sezione tagliano', () => {
    expect(modeCuts(INSPECT_MODE.slice)).toBe(true);
    expect(modeCuts(INSPECT_MODE.section)).toBe(true);
    expect(modeCuts(INSPECT_MODE.off)).toBe(false);
    expect(modeCuts(INSPECT_MODE.xray)).toBe(false);
    expect(modeCuts(INSPECT_MODE.block)).toBe(false);
  });

  it('il predicato sul modo dice sempre la stessa cosa di quello sulle uniform', () => {
    // Due strade allo stesso fatto: `modeCuts` decide prima, con il modo in
    // mano, `isCut` dopo, sul payload composto. Divergerebbero in silenzio — la
    // barra dei livelli comparirebbe dove non c'e' quota da muovere — e questo
    // e' l'unico posto che se ne accorge.
    for (const mode of INSPECT_MODES) {
      const u = inspectUniforms(stateOf({
        mode,
        focus: { x: 10, y: 10, z: 10 },
        block: { x0: 0, y0: 0, x1: 8, y1: 8 },
        section: { axis: 1, at: 64 },
      }));
      expect(modeCuts(mode)).toBe(isCut(u));
    }
  });
});
